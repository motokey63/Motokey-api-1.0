# MotoKey — Livraisons OR (Ordres de Réparation)

> Spécification définitive du chantier OR — du brouillon à la facture signée avec scanner pièces.
> Version : 1.0 — 27/04/2026
> Statut : périmètre tranché, prêt pour implémentation séquentielle.

---

## Vision

Permettre au garage Motolab de gérer un OR de bout en bout :
- Créer un brouillon → faire valider par le client → exécuter le travail → mettre en attente si pièce manquante → terminer techniquement → facturer avec PDF signé.
- Ajout des pièces via scanner code-barres iPad atelier OU saisie manuelle OU recherche dans catalogue.

---

## Modèle de données

### Migration `04-or-extension.sql` (à créer)

```sql
-- Colonnes ajoutées à ordres_reparation
ALTER TABLE ordres_reparation ADD COLUMN numero_facture TEXT UNIQUE;
ALTER TABLE ordres_reparation ADD COLUMN signature_client TEXT;  -- base64 PNG
ALTER TABLE ordres_reparation ADD COLUMN signature_date TIMESTAMPTZ;
ALTER TABLE ordres_reparation ADD COLUMN pdf_url TEXT;           -- URL Cloudinary
ALTER TABLE ordres_reparation ADD COLUMN valide_client_at TIMESTAMPTZ;
ALTER TABLE ordres_reparation ADD COLUMN attente_motif TEXT;

-- Séquence factures (sans trou, obligation légale FR)
CREATE TABLE factures_seq (
  annee INT PRIMARY KEY,
  dernier_numero INT NOT NULL DEFAULT 0
);

-- Fonction d'attribution du numéro de facture (atomique)
CREATE OR REPLACE FUNCTION attribuer_numero_facture() RETURNS TEXT AS $$
DECLARE
  annee_courante INT := EXTRACT(YEAR FROM NOW())::INT;
  nouveau_num INT;
BEGIN
  INSERT INTO factures_seq (annee, dernier_numero)
    VALUES (annee_courante, 1)
    ON CONFLICT (annee) DO UPDATE
    SET dernier_numero = factures_seq.dernier_numero + 1
    RETURNING dernier_numero INTO nouveau_num;
  RETURN 'FAC-' || annee_courante || '-' || LPAD(nouveau_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Historique des actions sur OR (traçabilité)
CREATE TABLE or_historique (
  id BIGSERIAL PRIMARY KEY,
  or_id BIGINT NOT NULL REFERENCES ordres_reparation(id) ON DELETE CASCADE,
  user_id UUID,
  garage_id BIGINT,
  action TEXT NOT NULL,           -- 'creation', 'statut_change', 'tache_ajout', etc.
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_or_historique_or_id ON or_historique(or_id, created_at DESC);

-- catalogue_pieces : flags d'audit pour ajouts Pro
ALTER TABLE catalogue_pieces ADD COLUMN created_by UUID;
ALTER TABLE catalogue_pieces ADD COLUMN created_at_garage_id BIGINT;
ALTER TABLE catalogue_pieces ADD COLUMN ean TEXT;  -- pour scanner
CREATE INDEX idx_catalogue_pieces_ean ON catalogue_pieces(ean) WHERE ean IS NOT NULL;
```

### Statuts OR (6 états + matrice de transitions)

```
brouillon ───────────────► validé_client
    ▲                            │
    │ (annulation par Pro)       ▼
    └──────────────────────── en_cours ◄──────► attente
                                  │                 │
                                  │ (motif requis)  │
                                  ▼                 │
                              terminé ◄─────────────┘
                                  │ (km_sortie requis)
                                  ▼
                              facturé   ← état terminal, irréversible
```

**Transitions autorisées** (à valider en backend) :

| De → | brouillon | validé_client | en_cours | attente | terminé | facturé |
|---|---|---|---|---|---|---|
| brouillon | — | ✅ | ❌ | ❌ | ❌ | ❌ |
| validé_client | ✅ | — | ✅ | ❌ | ❌ | ❌ |
| en_cours | ❌ | ❌ | — | ✅ | ✅ | ❌ |
| attente | ❌ | ❌ | ✅ | — | ❌ | ❌ |
| terminé | ❌ | ❌ | ✅ (correction) | ❌ | — | ✅ |
| facturé | ❌ | ❌ | ❌ | ❌ | ❌ | — (terminal) |

**Champs requis selon transition :**
- `→ attente` : `attente_motif` non vide
- `→ terminé` : `km_sortie` non null
- `→ facturé` : génère automatiquement `numero_facture`, génère PDF, upload Cloudinary, remplit `pdf_url`. Signature optionnelle (PDF affiche "non signé" si `signature_client` null).

---

## Découpage en livraisons

Chaque livraison = 1 ou 2 commits, livrable indépendamment. Si on s'arrête entre deux, l'app reste utilisable.

### L3a-bis — Migration DB

- Exécution de `04-or-extension.sql` dans Supabase
- Test de la fonction `attribuer_numero_facture()` via SQL direct
- ✅ Critère validation : `SELECT attribuer_numero_facture();` retourne `FAC-2026-0001`, le 2e appel retourne `FAC-2026-0002`

### L3a-ter — Backend statuts étendus

- Endpoint `PATCH /ordres-reparation/:id/statut` avec validation transitions
- Body : `{ nouveau_statut, attente_motif?, km_sortie?, signature_base64? }`
- Helper `validerTransitionStatut(ancien, nouveau)` côté serveur
- Endpoint `POST /ordres-reparation/:id/facturer` qui appelle `attribuer_numero_facture()`, génère le PDF, upload Cloudinary
- RBAC : `requireRole('PRO')` pour toutes ces opérations
- Logging dans `or_historique` à chaque transition
- ✅ Critère : tester via curl le cycle complet brouillon→facturé, plus tentative de transition interdite (doit retourner 422)

### L3a-quater — `renderFicheOR()` lecture seule

- Page dédiée dans `app.html` (URL hash `#or/:id`)
- Header : numéro OR, statut (badge couleur), nom client, moto, totaux HT/TTC
- Section tâches (tableau lecture)
- Section pièces (tableau lecture)
- Section historique (timeline depuis `or_historique`)
- Bouton "← Retour" qui retourne à la liste OR
- ✅ Critère : ouvrir une fiche OR existante, tout est affiché correctement

### L3a-quinquies — Mode édition + recalc

- Bouton "✏️ Éditer" → toute la fiche devient éditable
- Snapshot pris au clic Éditer pour permettre Annuler
- Ajout/suppression/modification de tâches (libellé, durée, taux horaire)
- Ajout/suppression/modification de pièces avec **saisie manuelle libre** (référence, désignation, qté, prix unitaire) — le scanner arrive en L3c-b
- Recalcul des totaux **côté frontend** en temps réel (UX fluide) + validation `_recalcTotauxOR` côté backend au save
- Boutons "💾 Enregistrer" et "✕ Annuler"
- `beforeunload` warning si modifs non sauvées
- Édition uniquement possible si statut ∈ {brouillon, validé_client, en_cours, attente}
- ✅ Critère : modifier un OR brouillon, ajouter 2 tâches, 3 pièces, sauver, recharger la page, tout est conservé

### L3a-sexies — Transitions de statut UI

- Boutons contextuels selon statut courant :
  - brouillon → "📩 Envoyer au client" (passe en validé_client) + "🚫 Annuler"
  - validé_client → "▶️ Démarrer travaux" (passe en en_cours) + "⬅️ Re-modifier"
  - en_cours → "⏸️ Mettre en attente" (modale motif obligatoire) + "✅ Terminer travaux" (modale km_sortie obligatoire)
  - attente → "▶️ Reprendre travaux"
  - terminé → "💰 Facturer" + "↩️ Retour en cours" (correction)
  - facturé → aucun bouton (lecture seule définitive)
- ✅ Critère : cycle complet brouillon→facturé via UI sans toucher au backend manuellement

### L3a-septies — Signature canvas + PDF

- Canvas HTML5 de signature (lib `signature_pad` ou implémentation maison sur ~80 lignes)
- Affiché dans la fiche OR à partir du statut "terminé", optionnel
- Bouton "✍️ Faire signer" → modale plein écran (orientation paysage suggérée pour iPad)
- Boutons "Effacer" et "Valider"
- À la facturation : génération PDF côté serveur avec `pdf-lib`
  - En-tête garage (logo, adresse, SIRET)
  - Numéros OR + facture
  - Tableau tâches (libellé, durée, taux, total)
  - Tableau pièces (réf, désignation, qté, PU, total)
  - Totaux HT, TVA, TTC
  - Signature client si présente, sinon mention "Document non signé"
  - Mentions légales standards (TVA, médiation conso, escompte, retard)
- Upload Cloudinary preset `motokey_unsigned`, stockage URL dans `pdf_url`
- Lien "📄 Télécharger PDF" visible dès que `pdf_url` non null
- ✅ Critère : facturer un OR, ouvrir le PDF, vérifier que toutes les infos sont correctes, signature visible si fournie

### L3c-a — Catalogue pièces backend + UI

- Endpoint `GET /catalogue-pieces?q=texte` (recherche LIKE sur référence, désignation)
- Endpoint `GET /catalogue-pieces?ean=XXXXX` (lookup direct par code-barres)
- Endpoint `POST /catalogue-pieces` pour ajout par Pro (avec `created_by`, `created_at_garage_id`)
- Modale "Choisir pièce" depuis le mode édition fiche OR :
  - Champ recherche texte (autocomplete au-delà de 3 caractères)
  - Bouton 📷 Scanner (placeholder, fonctionnel en L3c-b)
  - Liste résultats avec photo, réf, désignation, prix
  - Bouton "Ajouter cette pièce" → l'insère dans l'OR avec qté 1
  - Si aucun résultat : bouton "Saisir manuellement" qui revient au formulaire libre actuel
- ✅ Critère : taper "filtre", voir la liste filtrée en moins de 500ms, en sélectionner une, elle apparaît dans l'OR

### L3c-b — Scanner code-barres

- Lib `@zxing/browser` (~200 KB, EAN-13 + Code128 + QR)
- Bouton 📷 Scanner dans modale "Choisir pièce" → ouvre vue caméra plein écran
- Au scan détecté :
  - Si EAN trouvé dans catalogue → autocomplete instantané, ajout à l'OR
  - Si EAN inconnu → modale "Pièce inconnue, voulez-vous la créer ?" avec champs pré-remplis (EAN scanné), enregistrement → ajout immédiat à l'OR
- Permission caméra via `getUserMedia({video: {facingMode: 'environment'}})` (caméra arrière iPad)
- Fallback saisie EAN manuelle si caméra refusée
- HTTPS requis (✅ Railway le fournit)
- ✅ Critère : scanner un code-barres EAN-13 d'une pièce de test, autocomplete immédiat dans l'OR

---

## Conventions de code à respecter

- **Tous les nouveaux endpoints** : `requireRole('PRO')` minimum
- **Tous les nouveaux fichiers SQL** : commencent par `BEGIN;` / finissent par `COMMIT;`, et chaque ALTER TABLE est précédé d'un test de pré-existence (`IF NOT EXISTS` ou bloc DO)
- **Rien dans `motokey-api.js`** au-delà de l'API — toute UI dans `app.html`
- **Logging `or_historique`** : à chaque écriture sensible (statut, ajout pièce/tâche, signature, facturation)
- **Pondération anti-fraude** (1.0/0.6/0.3) : ne pas y toucher
- **Tests E2E** : ajouter à `tests/test-or-e2e.js` à chaque livraison

---

## Estimations (à titre indicatif)

| Livraison | Sessions Claude Code | Risque |
|---|---|---|
| L3a-bis | 0.5 | Faible |
| L3a-ter | 1 | Moyen (transitions à bien valider) |
| L3a-quater | 0.5 | Faible |
| L3a-quinquies | 1.5 | Moyen (recalc + UX) |
| L3a-sexies | 1 | Faible |
| L3a-septies | 1.5 | Élevé (PDF + signature + Cloudinary) |
| L3c-a | 1 | Moyen |
| L3c-b | 1.5 | Élevé (caméra iPad + zxing) |
| **Total** | **8.5 sessions** | — |

---

## Comment Claude Code utilise ce document

Ce fichier est **la référence unique** pour le chantier OR. À chaque session, Claude Code :
1. Lit `CLAUDE.md` (contexte projet général)
2. Lit ce fichier `LIVRAISONS-OR.md` (contexte chantier OR)
3. Identifie quelle livraison est en cours (ou la suivante à attaquer)
4. Travaille **sans dévier** du périmètre de la livraison en cours
5. Au commit : utilise un message qui référence la livraison (ex: `feat(L3a-quater): renderFicheOR() lecture seule`)
