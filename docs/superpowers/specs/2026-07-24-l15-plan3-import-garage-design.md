# L15 — Plan 3 : Import GARAGE (upload + contre-signature + résolution divergence + prestation facturable) — Design

## Contexte

Le socle L15 (mergé master `8b5bd45`) et le Plan 2 (import CLIENT, mergé master `3c6dfe2`,
poussé prod le 24/07/2026) livrent la reprise d'historique côté client. Le backend
(`resolveMotoForCtx`, `POST /motos/:id/historique`, `POST /historique/:id/valider`,
`POST /historique/:id/contresigner`) est déjà **dual CLIENT/GARAGE** — aucun de ces 4 endpoints
n'a besoin d'être créé pour ce plan. Plan 3 construit le pendant GARAGE côté
`MotoKey_Atelier.html`, et corrige deux dettes backend documentées dans
`docs/superpowers/specs/2026-07-24-L15-reprise-historique-cadrage.md` qui bloquaient une UI de
résolution de divergence honnête.

Voir le cadrage original pour les décisions déjà actées (1 à 6, notamment décision 1 :
"la version garage fait foi" et la prestation garage facturable comme ligne d'OR, pas un objet
à part).

## Décisions prises pour ce plan (session du 24/07/2026)

1. **Périmètre** : les 4 chantiers annoncés par le self-review du Plan 2 sont traités dans un
   seul plan — import GARAGE, contre-signature, résolution de divergence, prestation
   facturable — en réglant d'abord les 2 dettes backend ci-dessous comme pré-requis.

2. **Import GARAGE → confiance directe `bleu`**. Aujourd'hui, `HistoriqueImport.valider()`
   crée systématiquement une intervention `type: 'jaune'`, quel que soit l'acteur — seul un
   import CLIENT peut ensuite être contre-signé pour monter à `bleu`. Un import fait
   directement par le GARAGE "fait foi" par construction (décision 1 du cadrage) : il doit
   promouvoir directement en `bleu`, sans étape de contre-signature (qui n'a de sens que pour
   un import CLIENT).

3. **Neutralisation de la divergence via un nouveau type ENUM `'archive'`**, pas via `'rouge'`.
   Vérification faite dans `schema.sql:684-704` (`recalc_score_moto()`) : `'rouge'` vaut **-5**
   (malus anti-fraude), pas 0 — l'utiliser pour une intervention simplement corrigée par le
   garage (pas frauduleuse) fausserait le score. `couleur_dossier_type` (ENUM Postgres, 4
   valeurs) reçoit une 5ᵉ valeur `'archive'` par migration ; le `CASE ... ELSE 0` déjà présent
   dans `recalc_score_moto()` traite automatiquement tout type non listé comme 0 point — **le
   trigger SQL n'est pas modifié**, seule la définition de l'ENUM l'est.

4. **Emplacement UI** : nouvelle section "Historique" dans `renderBriefing()` (dashboard moto
   de l'atelier), pas un nouvel écran séparé — la moto est déjà ouverte, upload + revue +
   validation + contre-signature vivent au même endroit.

5. **Import sans OR actif = autorisé et gratuit.** La ligne facturable ~30 € nécessite un OR
   actif pour cette moto (`POST /ordres-reparation/:id/taches` l'exige). Si aucun OR n'est
   actif, l'import fonctionne quand même (identique à un import client) ; le bouton "Facturer
   cette reprise" n'apparaît simplement pas.

   **Correction (rédaction du plan)** : `_currentOrId` (`MotoKey_Atelier.html:732`) est un état
   global posé uniquement par l'écran "OR actif" — une navigation indépendante de `renderBriefing`,
   pas garanti de correspondre à la moto affichée. La détection "OR actif pour CETTE moto" utilise
   donc `GET /ordres-reparation?moto_id=X` (filtre déjà supporté, `motokey-api.js:2860`), interrogé
   au chargement du briefing (ajout à l'`Promise.allSettled` existant d'`openBriefing`), en
   retenant un OR dont le statut n'est pas terminal (`termine`/`facture`/`annule`/`refuse`). L'appel
   `POST /ordres-reparation/:id/taches` cible cet OR précis, jamais `_currentOrId`.

6. **Contre-signature = clic direct, pas de modale de confirmation** — cohérent avec le reste
   de l'atelier (`toggleTache` et consorts agissent sans confirmation).

7. **Intervention archivée = visible, marquée "Remplacée"**, dans les deux apps (garage ET
   client) — pas masquée. Le client doit pouvoir voir que sa déclaration initiale a été
   corrigée par le garage.

8. **Ligne facturable = appel direct, pas le formulaire manuel existant.** Vérification faite :
   le formulaire "Ajouter une tâche" (`MotoKey_Atelier.html:1197-1198`) ne demande que le
   libellé et la durée — jamais de taux horaire. Côté Supabase réel (`supabase.js:1366`),
   `taux_horaire` non fourni vaut 0, donc `montant_ht` vaudrait 0 si on réutilisait ce
   formulaire tel quel. Le bouton "Facturer cette reprise" appelle donc directement
   `POST /ordres-reparation/:id/taches` avec `libelle: "Reprise d'historique"`, `duree_h: 1`,
   `taux_horaire: 30` — montant garanti à 30 €, sans toucher au formulaire manuel existant
   (hors périmètre de ce plan).

## Architecture

### Backend (2 migrations + logique dans `HistoriqueImport.valider()`)

- **Migration** : `ALTER TYPE couleur_dossier_type ADD VALUE 'archive';` (Postgres — irréversible
  sans recréer le type, à documenter dans le fichier de migration). Aucune modification de
  `recalc_score_moto()`.
- **`HistoriqueImport.valider(id, garage_id, ctx, {...})`** (`supabase.js:601`) :
  - Si `staging.acteur_type === 'garage'` → `Interventions.create(...)` avec `type: 'bleu'` au
    lieu de `'jaune'` (le reste de la fonction — cohérence km, traçage, `niveau_preuve` —
    inchangé).
  - Le calcul de `divergence_de` existe déjà (lignes 628-632, cherche une ligne validée avec
    même `plaque_declaree` + `date_document`, acteur différent). Quand `divergentes[0]`
    existe : après avoir créé la nouvelle intervention, **UPDATE**
    `interventions.type = 'archive'` sur l'intervention pointée par
    `divergentes[0].intervention_id` (nécessite de sélectionner aussi `intervention_id` dans la
    requête `divergentes`, actuellement elle ne sélectionne que `id, acteur_type`).
- **`GET /motos/:id/historique`** et **`GET /motos/:id/interventions`** : aucun changement —
  `select('*')` renvoie déjà `type` incluant la nouvelle valeur `'archive'`.

### Frontend — `MotoKey_Atelier.html`

Nouvelle `briefing-section` "Historique" dans `renderBriefing()`, insérée après "Dernières
interventions" (après la ligne 642) :

- **Bouton d'entrée + liste en lecture seule** : mirror direct de la Task 1 du Plan 2, adapté
  au style atelier (`briefing-section-title`, pas `.card`/`.form-group` du client). Consomme
  `GET /motos/:id/historique` (déjà générique dual CLIENT/GARAGE).
- **Upload séquentiel** : mirror direct de la Task 2 du Plan 2 (jamais `Promise.all`), consomme
  `POST /motos/:id/historique`.
- **Formulaire éditable pré-rempli OCR** : mirror direct de la Task 3 du Plan 2 — même 6 champs,
  même garde-fou `km_declare` numérique (`/^\d+$/`) déjà validé en Plan 2, réutilisé à
  l'identique.
- **Validation groupée** : mirror direct de la Task 4 du Plan 2 (isolation stricte par
  document, `KM_INCOHERENT` sur un item ne bloque pas les autres).
- **Nouveau — Contre-signature** : sur une carte de document déjà validé avec
  `acteur_type === 'client'` et `contresigne_par_garage_id` null, bouton "Contresigner" → clic
  direct → `POST /historique/:id/contresigner` → toast avec nouveau score/couleur.
- **Nouveau — Prestation facturable** : si `_currentOrId` est défini et correspond à la moto
  actuellement affichée, bouton optionnel "Facturer cette reprise (~30 €)" à côté du bouton de
  validation d'un document — appel direct `POST /ordres-reparation/:id/taches` avec
  `{libelle: "Reprise d'historique", duree_h: 1, taux_horaire: 30}` (voir décision 8). Absent
  sinon.

### Frontend — badge "Remplacée" (les deux apps)

- **`MotoKey_Atelier.html`** : `INT_TYPE_META` (utilisé ligne 597) reçoit une entrée
  `archive: { cls: 'archive', label: '↩ Remplacée' }` — le rendu existant affiche déjà
  `meta.label` dans le badge, donc pur ajout de table, pas de nouvelle branche de code.
- **`MotoKey_Client.html`** : le badge d'intervention (`interv-badge`, ligne 786) est
  aujourd'hui une pastille de couleur sans texte. Ajout d'un label conditionnel quand
  `i.type === 'archive'` (ex. "Remplacée par le garage" à côté de la pastille) + une classe CSS
  `.archive` (gris neutre), qui n'existe pas encore dans ce fichier.

## Hors périmètre

- Notification au client quand le garage corrige son import (le client verra le badge
  "Remplacée" au prochain chargement de son historique, mais aucun email/push n'est envoyé).
- Modification du formulaire manuel "Ajouter une tâche" pour lui ajouter un champ taux horaire
  (décision 8) — la ligne facturable de ce plan contourne ce formulaire par un appel direct.
- Réécriture du moteur de score (formule 70/30, pondération `niveau_preuve` 1.0/0.6/0.3) —
  dette déjà documentée dans le cadrage L15, toujours hors périmètre.
- Connexion boîte mail / OAuth pour récupérer des factures automatiquement (hors périmètre du
  cadrage L15 initial, non revisité ici).

## Vérification

Pas de framework de test frontend dans ce repo (constat déjà posé en Plan 2) — vérification
manuelle/statique par tâche, puis test navigateur réel en fin de plan avec un compte garage de
test à identifier (le compte client `sophie@email.com` utilisé pour vérifier le Plan 2 peut
servir de contrepartie CLIENT pour le scénario de divergence). Le scénario de divergence
nécessite un test en 2 temps : import + validation côté CLIENT d'abord (même plaque + date),
puis correction côté GARAGE sur les mêmes plaque + date — reproductible mais créera à nouveau
des données permanentes (une intervention `archive` + une `bleu`), à documenter comme pour le
test du Plan 2 (pas de DELETE disponible sur `interventions`/`factures_scannees`).

## Self-review

- **Placeholders** : aucun "TBD"/"TODO" — chaque décision a une valeur exacte (30 €, `'archive'`,
  `bleu`, etc.).
- **Cohérence interne** : la décision 8 (appel direct, pas le formulaire) est cohérente avec la
  décision 5 (pas d'OR actif = pas de ligne) — les deux mécanismes vérifient `_currentOrId`
  avant d'agir.
- **Scope** : un seul plan, 4 chantiers mais tous confinés à `MotoKey_Atelier.html` +
  `MotoKey_Client.html` (badge) + `supabase.js` (`valider()`) + 1 migration SQL — pas de
  décomposition supplémentaire nécessaire.
- **Ambiguïté** : la requête `divergentes` (supabase.js:628-632) doit être étendue pour
  sélectionner aussi `intervention_id` (actuellement `id, acteur_type` seulement) — précisé
  explicitement dans la section Architecture pour éviter toute ambiguïté au moment du plan
  d'implémentation.
