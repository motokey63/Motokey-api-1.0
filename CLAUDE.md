# MotoKey — Garage DMS

Système de gestion de garage moto pour Garage Motolab. Concept : "3ème clé digitale" — passeport numérique de moto avec statut couleur, score d'entretien /100, protections anti-fraude, transfert de propriété.

> **Note Claude Code** : ce CLAUDE.md a été audité et reconstruit le 27/04/2026 contre l'état réel du repo. Les sections marquées 🔍 sont des points où ma mémoire pourrait dériver — vérifie l'état du code avant d'agir dessus.

---

## ⚠️ Architecture HTML — règles strictes

### Source de vérité
- **`app.html`** est la source de vérité de l'app garage. C'est ce que Railway sert en prod via la fonction `getAppHTML()` dans `motokey-api.js`.
- **`_MAINTENANCE_HTML`** (constante dans `motokey-api.js`, ~50 lignes) est un **fallback de maintenance** : page branded "MotoKey en maintenance" servie uniquement si `app.html` est absent ou corrompu (taille < 1000 chars).
- **NE PAS** confondre `_MAINTENANCE_HTML` avec une copie de l'app — c'est volontairement minimaliste, son rôle est de signaler une panne, pas de remplacer l'app.

### Workflow d'édition
- Pour modifier l'UI garage : éditer `app.html` → commit → push → Railway auto-deploy.
- Pour modifier la maintenance page : éditer `_MAINTENANCE_HTML` dans `motokey-api.js` (rare, occasion de mise à jour de wording).
- **NE PAS** essayer de re-embarquer `app.html` dans la constante "pour avoir un fichier unique" — cette approche a été testée puis abandonnée (commits de mars 2026, migration Option C du 27/04/2026).

### Discipline d'édition
- Toujours écrire directement dans `C:\motokey-api\` via `str_replace` natif. Ne **jamais** demander à Mehdi de télécharger un fichier et le recopier manuellement.
- **Refuser** tout bricolage PowerShell / Python / sed / awk pour modifier les fichiers critiques :
  - `motokey-api.js`
  - `app.html`
  - `supabase.js`
  - `MotoKey_Client.html`
- Pour des opérations complexes (renommage massif, migration HTML), créer un script versionné dans `scripts/` qui fait un `.bak` avant écriture, puis le nettoyer une fois validé.
- Vérifier avec `git status` et `git log --oneline -5` avant tout changement majeur.

---

## Stack technique

- **Backend** : Node.js / Express sur Railway
- **URL prod** : `https://motokey11-production.up.railway.app` ⚠️ **PAS** `motokey-api-10` (obsolète, nettoyé du code mais garde-fou : refuser toute mention)
- **DB** : Supabase (`rzbqbaccjyxvtlnfitrr.supabase.co`), 11 tables avec RLS
- **Photos** : Cloudinary (free tier, preset unsigned `motokey_unsigned`)
- **IA** : Anthropic API pour OCR factures + génération de plan d'entretien
- **VIN decoder** : NHTSA API en ligne + table WMI locale (30+ constructeurs) en fallback offline
- **Email** : Resend — service implémenté dans `services/emailService.js` avec fallback `console.log`. **Envoi réel désactivé** tant que `RESEND_API_KEY` n'est pas configuré côté Railway env vars (flag `EMAIL_ENABLED=false` par défaut).

---

## Repo

- Local : `C:\motokey-api`
- GitHub : `motokey63/Motokey-api-1.0`, branche `master`
- Railway auto-deploy sur `git push origin master`
- Project ID Railway : `741e21a3`, service : `motokey1.1`

---

## Fichiers clés

| Fichier | Taille | Rôle |
|---|---|---|
| `motokey-api.js` | ~107 KB | Backend Express + `_MAINTENANCE_HTML` (fallback maintenance) + `getAppHTML()` qui sert `app.html` en priorité |
| `app.html` | ~42 KB | App garage servie en prod (source de vérité UI) |
| `MotoKey_Client.html` | ~44 KB | App client séparée (fix fallback URL Railway L376, commit 9d88cf5) |
| `supabase.js` | ~41 KB | Module DB (queries Supabase + helpers) |
| `services/emailService.js` | — | Resend wrapper avec fallback console.log |

---

## Architecture métier

### Système couleur / score
- 🟢 **VERT** (Excellent, 80+) — interventions concession officielle uniquement
- 🔵 **BLEU** (Bon, 60–79) — Pro validé
- 🟡 **JAUNE** (Moyen, 40–59) — Propriétaire / déclaré
- 🔴 **ROUGE** (Insuffisant, <40)

### Formule de score
- **70 % conformité + 30 % accumulation**, avec bonus pour motos faible kilométrage.

### Pondération anti-fraude (3 tiers)
- `facture` = **1.0** (preuve forte)
- `visuel` = **0.6** (photo/vidéo)
- `declare` = **0.3** (déclaration sans preuve)
- **Cœur du système d'intégrité** — ne pas modifier sans validation explicite de Mehdi.

### Pneus
- Vivent **dans la fiche moto uniquement**. La nav principale n'a pas de section Pneus. La fonction `renderPneus()` historique a été supprimée.

---

## RBAC (Livraisons L4 / L4 v2) — LIVRÉE EN PROD

Hiérarchie :

```
ADMIN
  └── CONCESSION (marque officielle, peut créer interventions VERTES + tout ce qu'un Pro fait)
        └── PRO (max BLEU)
              └── CLIENT (max JAUNE)
                    └── (sous-rôle) MÉCANO (atelier iPad, accès financier autorisé depuis L4 v2)
```

État technique (L4 v2 — commits e2baba5 / ef04588 / ce87bb4, 06/05/2026) :
- `extractRoleFromRequest()` extrait le rôle depuis le JWT Supabase (`app_metadata.role`)
- `requireRole()` middleware sur les endpoints sensibles
- RLS durci sur `clients`, `motos`, `interventions`, `garages`
- 21 endpoints élargis de PRO→MECANO (motos, interventions, devis, OR, vérif)
- `stripFinancialFields` **retiré** — MECANO accède désormais aux champs financiers
- `/transfert` et `/entites-facturation` restent PRO+ (zones admin)
- `rbac_role` exposé dans la réponse `POST /auth/login` (lu depuis `app_metadata.role`, fallback `CONCESSION`)
- `CURRENT_ROLE` stocké en frontend au login — utilisé par `isMecano()` / `isPro()`
- Timer inactivité MECANO : `startInactivityTimer()` + `_resetInactivity()` (GET session-policy au boot)
- Section Paramètres dans nav (`renderParams()`) : entité / users / abonnement / politique session — masquée pour MECANO

**Endpoints session-policy (L4 v2) :**
- `GET /garage/session-policy` — MECANO+ — lit `mecano_session_timeout_minutes`
- `PATCH /garage/session-policy` — PRO+ — modifie timeout (15 / 60 / 480 min)

**Migration SQL requise en prod :**
- `sql/migrations/10_mecano_session_timeout.sql` — `ALTER TABLE garages ADD COLUMN mecano_session_timeout_minutes` — à appliquer via Supabase Dashboard SQL Editor

**✅ Dette L4 v2 — RÉSOLUE (hardening 07/05/2026) :**
- ~~Backfill `app_metadata.role` sur tous les comptes garage existants~~ → migration 11 appliquée prod
- ~~Processus création compte MECANO~~ → table `garage_users` + endpoint `POST /garage/users` + UI
- ~~Test négatif bypass~~ → qualifié prod (test 5 v2 passé 07/05/2026)

**Hardening L4 v2 (07/05/2026) — commits : `f6c2440` `ecc30e5` `fe7abd4` `bd64d38` `075d558` :**
- `supabase.js registerGarage` pose `app_metadata.role='CONCESSION'` à la création
- Migration `11_backfill_garage_app_metadata.sql` appliquée prod
- Table `garage_users` (migration 12) : liaison `auth_user_id ↔ garage_id` avec rôle PRO|MECANO
- 4 endpoints `/garage/users` (GET/POST/PATCH/DELETE) — RBAC PRO+
- `getGarageIdForUser` et `loginGarage` : fallback `garage_users` pour MECANO/PRO employés
- UI "Gérer les utilisateurs" dans Paramètres : CRUD complet en modales, masquée pour MECANO
- Bugs corrigés : `Garages.update` allowed list, `loginGarage` PGRST116 sur login MECANO

**Pour tout nouveau code :**
- Inclure les champs `role` et `garage_id` dans les payloads / tables / responses pertinents
- Appliquer `requireRole('MECANO')` (minimum) sur les endpoints garage — `requireRole('PRO')` pour modifications admin
- Référence : `GET /garage/session-policy` (MECANO+) et `PATCH /garage/session-policy` (PRO+)

---

## État des livraisons

### ✅ Livrées et validées en prod

| Livraison | Périmètre | Notes |
|---|---|---|
| **L1** | Auth + base | — |
| **L3a backend** | Tables `ordres_reparation`, `or_taches`, `or_pieces`, `catalogue_pieces` + trigger auto-incrément annuel + endpoints CRUD/clôture/recalc | Endpoints : POST/GET/PUT `/ordres-reparation/:id`, POST `/cloturer`, helpers totaux |
| **L3a frontend partiel** | Bouton nav OR, liste OR avec filtres, vues comptoir/atelier, formulaire création OR | Voir `loadOR()`, `renderORPage()`, `renderORTable()`, `renderNewOR()` dans `app.html` |
| **L4 RBAC** | Middleware `requireRole`, `extractRoleFromRequest`, RLS durci | Validée en prod (commit `db28556`) |
| **L7b endpoints** | `register`, `login`, `logout`, `password-reset`, `password-reset/confirm` (lien + OTP) | 7/7 validés en prod (commit `4cf896e`). Envoi email réel pending `RESEND_API_KEY` côté Railway env. |
| **L3c-a** | Catalogue pièces (table `catalogue_pieces`) + autocomplete dans formulaire OR édition | Commit `1dfe935`, fix UUID `6998ca8`. Backend + frontend livrés. |
| **L3c-b** | Scanner code-barres EAN-13/8/UPC-A via `zxing@0.21.3` dans picker pièces OR | Commit `310add6` (04/05/2026). Multi-scan avec dédup par `piece_id` (qte += 1 sur rescan). Debounce 1.5s. Fallback saisie manuelle si caméra inaccessible. Libération caméra sur tous chemins de sortie (X, Annuler, Terminer, Échap, backdrop). Validé prod : OR-2026-0003 reçu 2 pièces dont 1 catalogue (07BB37SA Plaquettes Brembo). Test C11 cleanup caméra : à valider en conditions réelles atelier (tablette). |
| **L4 v2 RBAC** | 21 endpoints PRO→MECANO, stripFinancialFields supprimé, rbac_role exposé au login, timer inactivité MECANO, section Paramètres avec politique session | Commits `e2baba5` / `ef04588` / `ce87bb4` (06/05/2026). Migration `10_mecano_session_timeout.sql` appliquée prod. |
| **L4 v2 hardening** | table `garage_users`, création MECANO, UI Gérer utilisateurs, fix loginGarage, backfill app_metadata | Commits `f6c2440` `ecc30e5` `fe7abd4` `bd64d38` `075d558` (07/05/2026). Migrations 11+12 appliquées prod. Dette L4 v2 résolue. Test 5 qualifiant passé. |
| **L2 devis client** | Section "Mes devis" dans `MotoKey_Client.html` + ouverture RBAC endpoints devis au CLIENT | Commit `5af4712` (11/05/2026). GET /devis filtre brouillons pour CLIENT. GET /devis/:id et POST /devis/:id/valider acceptent CLIENT avec check propriété. Nouveau POST /devis/:id/refuser (CLIENT + MECANO+). Frontend : bouton topbar, screen-devis, loadClientDevis(), acceptDevis(), refuseDevis(). |
| **L8 liaison polymorphe** | Propriété polymorphe moto (garage/client/inconnu), cession, réclamation, révocation liaison client-garage | Commits branche `feat/L8-liaison-polymorphe` mergée master `d54c3b6` + fix `8010d0b` (29/05/2026). Migrations 13+14 appliquées prod. Runbook E2E flux A/B/C validés. Bug `garage_id→garageId` corrigé en cours de run. `express` ajouté dans `package.json`. Supabase email confirmation désactivée (register client opérationnel). |

### 🔍 Statut à vérifier

- **L3b** (Atelier iPad UX, gros tap targets) — aucun commit explicite trouvé. Le code est peut-être dans `app.html` (vues atelier existent) sans avoir été nommé "L3b" dans les messages de commit. À auditer si besoin.

### ⏳ À faire

- ~~**`renderFicheOR()`**~~ — **✅ LIVRÉ (29/05/2026)** : stepper statut inline, transitions directes (valide_client/démarrer/reprendre), modales pour attente/annule/clôture/facturation, édition tâches+pièces+notes+km_entree, km_sortie pré-rempli. Backend était déjà prêt.
- **Mot de passe oublié comptes garage** (distinct du reset client L7b) — pas commencé
- **Resend** — configurer `RESEND_API_KEY` côté Railway env vars + activer `EMAIL_ENABLED=true` pour débloquer l'envoi réel des emails de reset password client

---

## Patterns de travail

- **Livraisons numérotées** : features groupées en livraisons nommées (1, 3a, 3b, 3c, 4, 7b…) avec migration SQL + snippet backend JS + composants frontend livrés ensemble.
- **iPad-first** pour les vues atelier — gros boutons tactiles, capture photo native.
- **Mode offline déferré** — pas dans le scope actuel.
- **Pas de localStorage / sessionStorage** dans `app.html` si on doit un jour le porter en artifact Anthropic. Sinon en prod web standard, c'est OK.

---

## Convictions issues de l'historique

- **`app.html` séparé fonctionne bien** — Railway le sert depuis la même origine que l'API, pas de problème CORS, pas de cache edge problématique. La crainte initiale qui motivait `_EMBEDDED_HTML` ne s'est pas matérialisée.
- **La base Supabase et le backend sont sains.** Les bugs récents (avril 2026 : "Non authentifié" client, owner "—" garage) étaient des mismatches frontend/backend, pas de la corruption de données.
- **Discipline de version** : la moindre divergence entre `app.html` local et déployé → confusion. Toujours vérifier `git status` avant édition. **Toujours `git push` à la fin d'une session de travail** sinon des modifs locales peuvent être perdues silencieusement (déjà arrivé avec `app.html`).

---

## Commandes utiles

```bash
# État du repo
cd C:\motokey-api
git status
git log --oneline -10

# Déploiement (Railway auto-deploy)
git add -A
git commit -m "..."
git push origin master

# Vérifier prod
curl -s -o /dev/null -w "%{http_code}" https://motokey11-production.up.railway.app/
curl -s https://motokey11-production.up.railway.app/ | grep -i "title"

# Vérifier syntaxe Node avant push
node --check motokey-api.js
```

---

## Ce que Claude Code NE DOIT PAS faire

- ❌ Tenter de re-embarquer `app.html` dans une constante de `motokey-api.js`
- ❌ Supprimer `_MAINTENANCE_HTML` sous prétexte que "ça ne sert pas"
- ❌ Suggérer de modifier `motokey-api.js`, `app.html`, `supabase.js` ou `MotoKey_Client.html` via PowerShell, sed, awk, Python one-liner
- ❌ Demander à Mehdi de télécharger / recopier des fichiers manuellement
- ❌ Référencer l'URL `motokey-api-10-production.up.railway.app` (obsolète)
- ❌ Coder un nouvel endpoint sensible sans `requireRole()` adapté
- ❌ Toucher à la pondération anti-fraude (1.0 / 0.6 / 0.3) ou à la formule 70/30 sans validation explicite de Mehdi
- ❌ Lire des fichiers hors du repo `C:\motokey-api\` (notamment pas `C:\Users\Mehdi\wiki-brain\`) en cours de session — sauf demande explicite de Mehdi
