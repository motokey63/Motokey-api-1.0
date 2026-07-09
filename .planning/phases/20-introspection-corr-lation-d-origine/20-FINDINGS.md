# Phase 20 — Findings: colonnes non documentées `garages`/`clients`/`interventions`/`devis`

**Phase:** 20-introspection-corr-lation-d-origine
**Date:** 2026-07-09
**Source baseline:** `node scripts/introspect-schema.js` (PostgREST OpenAPI, prod `rzbqbaccjyxvtlnfitrr.supabase.co`), ré-exécuté en direct pendant ce plan — 38 tables retournées, aucune dérive supplémentaire depuis 20-RESEARCH.md (2026-07-09).
**Consommateur prévu :** Phase 21 (migrations rétroactives, SCHEMA-04) — ce document est la seule source de vérité à relire, pas de re-découverte nécessaire.

---

## Completeness checklist

| Table | Colonnes non documentées (live − schema.sql) | Statut |
|---|---|---|
| `garages` | 5 (`ville`, `cp`, `type`, `marque_officielle`, `actif`) | Baseline + origine capturées (voir ci-dessous) |
| `clients` | 5 (`client_type`, `raison_sociale`, `siret`, `tva_intracom`, `adresse_facturation`) | **RÉSOLU** — `migrations/04-rbac-migration.sql` @ `c66ad69` |
| `interventions` | 4 (`niveau_preuve`, `facture_id`, `operation_code`, `photo_url`) | Baseline + origine capturées (voir ci-dessous) |
| `devis` | 25 (voir tableau détaillé) | Baseline + origine capturées (voir ci-dessous) |
| **Total** | **39** | — |

**Note sur le delta vs 20-RESEARCH.md** : la recherche estimait "~24" colonnes `devis` non documentées ; le diff exact (live moins la liste DOCUMENTED de l'`<interfaces>` du plan) en donne 25 — même liste que celle déjà énumérée par la recherche, juste comptée à 25 au lieu de "~24" (l'approximation venait du "~" dans le research, pas d'une colonne manquée). Aucune autre dérive : les ensembles non documentés live de `garages`/`clients`/`interventions` correspondent exactement aux attentes de 20-RESEARCH.md et du bloc `<interfaces>` du plan.

**Observation hors-scope (non corrigée dans ce plan)** : `schema.sql` L315-339 documente aussi `technicien_id`, `total_mo_ht`, `total_pieces_ht`, `remise_lignes`, `sous_total_ht`, `remise_globale`, `base_ht`, `tva_montant`, `valide_at`, `expire_at` pour `devis` — aucune de ces 10 colonnes n'existe dans le live introspecté ci-dessus. C'est l'inverse du problème de ce plan (documenté-mais-absent, pas non-documenté-mais-présent) et sort du périmètre SCHEMA-02/03. Signalé ici pour que Phase 21/22 en tienne compte lors de la régénération de `schema.sql` (probablement un reliquat de l'ancien schéma `devis` pré-réécriture `b29d4f5`, cf. section devis ci-dessous).

---

## `clients` — RESOLVED (legacy migration)

Toutes les 5 colonnes non documentées de `clients` sont entièrement expliquées par un fichier de migration existant, committé, versionné : `migrations/04-rbac-migration.sql`, commit **`c66ad69`** (2026-04-14, *"feat(L4): migration RBAC — client_type + colonnes pro/particulier, seed test users script"*), vérifié via :
```
git log --oneline -S"client_type" -- migrations/04-rbac-migration.sql | tail -1
→ c66ad69 feat(L4): migration RBAC — client_type + colonnes pro/particulier, seed test users script
```
Live introspection (ci-dessus) confirme que prod correspond exactement au DDL de ce fichier. **Aucun travail Postgres/git supplémentaire requis pour `clients`.**

| Colonne | Type exact | Nullable | Default | Contrainte | Origine |
|---|---|---|---|---|---|
| `client_type` | `client_type_enum` (ENUM `particulier`\|`pro`) | NOT NULL | `'particulier'` | — | `migrations/04-rbac-migration.sql` @ `c66ad69` |
| `raison_sociale` | `text` | nullable | none | — | `migrations/04-rbac-migration.sql` @ `c66ad69` |
| `siret` | `text` | nullable | none | `UNIQUE INDEX idx_clients_siret ON clients(siret) WHERE siret IS NOT NULL` | `migrations/04-rbac-migration.sql` @ `c66ad69` |
| `tva_intracom` | `text` | nullable | none | — | `migrations/04-rbac-migration.sql` @ `c66ad69` |
| `adresse_facturation` | `text` | nullable | none | — | `migrations/04-rbac-migration.sql` @ `c66ad69` |

Contrainte métier associée (non présente dans `schema.sql` actuel, à reporter en Phase 21) :
```sql
CONSTRAINT clients_pro_requirements
CHECK (
  client_type = 'particulier'
  OR (client_type = 'pro' AND raison_sociale IS NOT NULL AND siret IS NOT NULL)
)
```

**Pass 0 — vérification exhaustive des 2 répertoires de migrations legacy** : `migrations/04-rls-harden.sql`, `migrations/05-cleanup-client-doublons.sql`, `migrations/07b-pivot-migration.sql`, `migrations/08-livraison-3a-ordres-reparation.sql`, `migrations/09-l3c-catalogue-pieces.sql` — aucun de ces 5 autres fichiers ne contient d'`ALTER TABLE garages`/`ALTER TABLE interventions`/`ALTER TABLE devis` (confirmé par grep `ALTER TABLE (garages|interventions|devis)|ADD COLUMN` — zéro résultat pertinent, seul `catalogue_pieces` apparaît dans `09-l3c-catalogue-pieces.sql`, table hors périmètre). `sql/migrations/*.sql` (10-19, déjà couverts par Phase 19) : seuls `10_mecano_session_timeout.sql` (`mecano_session_timeout_minutes`, déjà documenté) et `15_billing_foundation.sql` (`stripe_customer_id`, `stripe_subscription_id`, `plan_code`, `subscription_status`, `subscription_current_period_end`, `grace_period_ends_at`, `motos_limit`, `users_limit`, tous déjà documentés) touchent `garages` — aucune des 5 colonnes fantômes de `garages` n'y figure. **Confirmé : aucun fichier de migration, dans aucun des deux répertoires, ne couvre les colonnes non documentées de `garages`/`interventions`/`devis`.**

---

## `garages` — undocumented (baseline)

| column | type (OpenAPI) | nullable | default | FK | EXACT (pg catalog — plan 02) | origin (plan 01 Task 2) |
|---|---|---|---|---|---|---|
| `ville` | text | nullable | none | — | `TEXT`, nullable, default none (confirmé `information_schema.columns`) | **ghost column** — no code trail (verified via git log -S + allowlist inspection) |
| `cp` | text | nullable | none | — | `TEXT`, nullable, default none (confirmé `information_schema.columns`) | **ghost column** — no code trail (verified via git log -S + allowlist inspection) |
| `type` | text | NOT NULL | `'pro'` | — | `TEXT`, NOT NULL, default `'pro'::text` (confirmé `information_schema.columns`) | **ghost column** — no code trail (verified via git log -S + allowlist inspection) |
| `marque_officielle` | text | nullable | none | — | `TEXT`, nullable, default none (confirmé `information_schema.columns`) | **ghost column** — no code trail (verified via git log -S + allowlist inspection) |
| `actif` | boolean | NOT NULL | `true` | — | `BOOLEAN`, NOT NULL, default `true` (confirmé `information_schema.columns`) | **ghost column** — no code trail (verified via git log -S + allowlist inspection) |

**Contraintes (pg_constraint, Requête 2) — `garages`, 5 colonnes cibles :** aucune contrainte explicite (confirmé `pg_constraint`) sur `ville`/`cp`/`type`/`marque_officielle`/`actif` — les seules contraintes existantes sur `garages` (`garages_auth_user_id_fkey`, `garages_auth_user_id_key`, `garages_email_key`, `garages_mecano_session_timeout_minutes_check`, `garages_pkey`) ne touchent aucune de ces 5 colonnes.

**Requête 3 — valeurs distinctes en prod (indice d'origine/intention) :**
- `SELECT DISTINCT type, marque_officielle, actif FROM garages;` → une seule ligne sur l'ensemble des garages prod : `type='pro'`, `marque_officielle=null`, `actif=true`. Aucune ligne ne dévie du défaut de colonne — zéro signal d'usage réel pour ces 3 colonnes.
- `SELECT DISTINCT ville, cp FROM garages WHERE ville IS NOT NULL OR cp IS NOT NULL;` → une seule ligne : `ville='Clermont-Ferrand'`, `cp='63000'`. **Important** : contrairement à `type`/`marque_officielle`/`actif`, ces deux colonnes ne sont PAS vides en prod — un garage (très probablement le garage Motolab réel, en production) a ces champs renseignés avec des données réelles et cohérentes, presque certainement saisies manuellement via le Dashboard Supabase (aucun chemin de code ne lit ni n'écrit `ville`/`cp` — confirmé plan 20-01, `Garages.update()` allowlist `supabase.js` L186). Cela ne change pas le verdict "ghost column" (qui porte sur l'accès code, inchangé) mais distingue `ville`/`cp` (données réelles intentionnelles, saisie manuelle hors code) de `type`/`marque_officielle`/`actif` (jamais divergées du défaut, aucun signal d'usage réel) — nuance à présenter à Mehdi en Task 2.

**Disambiguation detail per column** (recipe: `git log --oneline -S"<col>" -- . | tail -1`, then `git show <sha>` to open the diff and confirm/reject the target table):
- `ville` — pickaxe hit `b29d4f5` ("rewrite Devis data-access layer against real live devis schema"). Diff opened: the hit is inside a code comment listing `devis`'s real columns (`client_adresse/cp/ville/email/tel/siret/tva`) — i.e. `client_ville`, NOT `garages.ville`. Rejected as false positive. Zero real hits for `garages.ville` in any file, any commit.
- `cp` — pickaxe hit `10096b6` (initial commit, "MotoKey-API v1.0"). This 2-letter string matches unrelated substrings across the initial 730-line dump (not `motokey-api.js`'s actual content per targeted re-check `git log -S"cp" -- motokey-api.js supabase.js app.html schema.sql`). No hit references `garages`. Rejected as noise.
- `type` — deliberately not pickaxe-searched (too generic a token — matches JS `typeof`, SQL `type_document`, `type_intervention`, etc. across virtually every commit; would produce unusable noise). Verdict rests on the architectural check below (not in `Garages.update()`'s allowlist) plus zero explicit `garages.type` write path found anywhere in `motokey-api.js`/`app.html`.
- `marque_officielle` — pickaxe hit `0a616bf` ("fix(19-03): add missing migration 10/13/15 columns to schema.sql"). Diff opened: this is Phase 19's own `schema.sql` header comment that *documents the drift* ("DÉRIVE NON DOCUMENTÉE DÉCOUVERTE … garages : ville, cp, type, marque_officielle, actif") — not a real introducing commit. Rejected; zero real code hits in any application file across full history.
- `actif` — pickaxe hit `10096b6`, same false-positive pattern as `cp` (generic substring noise in the initial dump, unrelated to `garages`). Scoped re-check (`git log -S"actif" -- motokey-api.js supabase.js app.html`) surfaces only `garage_users.actif` (migration 12) and `catalogue_pieces.actif` (migration 09) hits when diffs are opened — never `garages.actif`.

**Architectural confirmation (per 20-RESEARCH.md's ghost-column pattern):** `Garages.update()`'s explicit field allowlist — `supabase.js` L186 — is:
```javascript
const allowed = ['nom','tel','adresse','siret','taux_std','taux_spec','tva','sms_active','mecano_session_timeout_minutes'];
```
None of `ville`/`cp`/`type`/`marque_officielle`/`actif` appear in this list — the code architecturally cannot write any of these 5 columns via the only update path that exists. Combined with zero git-log-S hits (after disambiguation), this is a HIGH-confidence ghost-column verdict for all 5. Their semantic *intent* (LOW confidence, inference only) is documented in 20-RESEARCH.md's Preliminary Findings table and unchanged by this plan — recommend Mehdi confirm during Phase 21 planning.

---

## `interventions` — undocumented (baseline)

| column | type (OpenAPI) | nullable | default | FK | EXACT (pg catalog — plan 02) | origin (plan 01 Task 2) |
|---|---|---|---|---|---|---|
| `niveau_preuve` | text | nullable | `'declare'` | — | `TEXT`, nullable, default `'declare'::text` (confirmé `information_schema.columns`) | **ghost column** — no code trail (verified via git log -S + allowlist inspection) |
| `facture_id` | uuid | nullable | none | → `factures_scannees.id` | `UUID`, nullable, default none (confirmé `information_schema.columns`) | **ghost column** — no code trail (verified via git log -S + allowlist inspection) |
| `operation_code` | text | nullable | none | — | `TEXT`, nullable, default none (confirmé `information_schema.columns`) | **ghost column** — no code trail (verified via git log -S + allowlist inspection) |
| `photo_url` | text | nullable | none | — | `TEXT`, nullable, default none (confirmé `information_schema.columns`) | **ghost column** — no code trail (verified via git log -S + allowlist inspection) |

**Contraintes (pg_constraint, Requête 2) — `interventions`, 4 colonnes cibles :**
- `niveau_preuve` → `CHECK interventions_niveau_preuve_check`: `CHECK ((niveau_preuve = ANY (ARRAY['facture'::text, 'visuel'::text, 'declare'::text])))` — verbatim `pg_get_constraintdef`.
- `facture_id` → `FOREIGN KEY interventions_facture_id_fkey`: `FOREIGN KEY (facture_id) REFERENCES factures_scannees(id) ON DELETE SET NULL` — verbatim `pg_get_constraintdef`.
- `operation_code`, `photo_url` → aucune contrainte explicite (confirmé `pg_constraint`) — les autres contraintes de `interventions` (`interventions_garage_id_fkey`, `interventions_moto_id_fkey`, `interventions_pkey`, `interventions_score_confiance_check`, `interventions_technicien_id_fkey`) ne touchent ni l'une ni l'autre.

**Disambiguation detail per column:**
- `niveau_preuve` — `git log -S"niveau_preuve"` returns zero hits across the full 302-commit history, in any file. Its default `'declare'` matches the anti-fraude vocabulary (`facture`=1.0/`visuel`=0.6/`declare`=0.3, per CLAUDE.md) but no code path — including the scoring trigger — ever reads or writes it.
- `facture_id` — zero hits as a JS/HTML literal. Its FK target `factures_scannees` is named only as a TODO placeholder in `migrations/04-rls-harden.sql` (~L173: "TODO RBAC phase 2 : durcir aussi ces tables si elles existent — devis, factures, ..., factures_scannees", commit `b3785eb`, 2026-04-14) — that commit is about RLS hardening scope, not about introducing this column, and never mentions `facture_id` itself.
- `operation_code` — zero hits across full history, any file.
- `photo_url` — pickaxe hits exist for the literal string but every diff opened traces to `motos.photo_url` or other tables' photo fields, never `interventions.photo_url` specifically. Rejected as false positives.

**Architectural confirmation:** `Interventions.create()`'s literal insert payload — `supabase.js` L397-408 — is:
```javascript
async create(garage_id, moto_id, payload) {
  const inter = await insert('interventions', {
    moto_id, garage_id,
    type:            payload.type,
    titre:           payload.titre,
    description:     payload.description || '',
    km:              payload.km,
    technicien_id:   payload.technicien_id || null,
    montant_ht:      payload.montant_ht    || 0,
    montant_ttc:     payload.montant_ttc   || 0,
    date_intervention: payload.date        || new Date().toISOString().split('T')[0]
  });
```
None of `niveau_preuve`/`facture_id`/`operation_code`/`photo_url` appear in this literal object. No caller in `motokey-api.js` or `app.html` sends these field names to `Interventions.update()` either (grep confirms zero occurrences repo-wide). HIGH-confidence ghost-column verdict for all 4.

---

## `devis` — undocumented (baseline)

All 25 columns fall into the **code-catch-up** pattern (Pitfall 2, 20-RESEARCH.md): the commits below explicitly describe *reconciling code to match an already-drifted live database*, not introducing new columns. Each cell below therefore records "**earliest code awareness: `<hash>` (`<date>`); true DB origin earlier/unknown (undocumented Dashboard ALTER)**" rather than treating the catch-up commit as the origin.

| column | type (OpenAPI) | nullable | default | FK | EXACT (pg catalog — plan 02) | origin (plan 01 Task 2) |
|---|---|---|---|---|---|---|
| `client_adresse` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `client_cp` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `client_email` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `client_id` | uuid | nullable | none | — | `UUID`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) — earlier pickaxe hit `10096b6` rejected as generic-token noise (`client_id` used across many unrelated tables since v1.0) |
| `client_nom` | text | NOT NULL | none | — | `TEXT`, NOT NULL, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `client_siret` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `client_tel` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `client_tva` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `client_ville` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `cree_par` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) — earlier pickaxe hit `2df75a7` (L8, "migration SQL 13") opened and rejected: that diff's `cree_par` is `liaisons_client_garage.cree_par`, a different table |
| `date_acceptation` | timestamptz | nullable | none | — | `TIMESTAMP WITH TIME ZONE`, nullable, default none | code awareness: `f2d7d9a` (2026-05-11, "fix(devis): aligner noms colonnes backend sur schema base (refuse_at->date_refus, valide_at->date_acceptation)"); true DB origin earlier/unknown (undocumented Dashboard ALTER) — commit message itself confirms this is a rename-to-match-reality fix, not an origin |
| `date_creation` | timestamptz | NOT NULL | `now()` | — | `TIMESTAMP WITH TIME ZONE`, NOT NULL, default `now()` | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `date_envoi` | timestamptz | nullable | none | — | `TIMESTAMP WITH TIME ZONE`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `date_refus` | timestamptz | nullable | none | — | `TIMESTAMP WITH TIME ZONE`, nullable, default none | code awareness: `f2d7d9a` (2026-05-11, same rename-fix commit as `date_acceptation`); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `date_validite` | date | nullable | none | — | `DATE`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `entite_facturation_id` | uuid | NOT NULL | none | → `entites_facturation.id` | `UUID`, NOT NULL, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) — note: the FK *target table* `entites_facturation` itself dates back to `13d4e2d` (2026-04-12, Phase 3), but the `devis.entite_facturation_id` FK *column* is not referenced in code before `b29d4f5` |
| `lignes` | jsonb | NOT NULL | none | — | `JSONB`, NOT NULL, default `'[]'::jsonb` | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) — replaces the dropped `devis_lignes` table per that commit's own message |
| `moto_km` | integer | nullable | none | — | `INTEGER` (numeric_precision 32, scale 0), nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) — earlier pickaxe hit `10096b6` rejected as generic-token noise |
| `moto_label` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `moto_vin` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `notes` | text | nullable | none | — | `TEXT`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) — earlier pickaxe hit `10096b6` rejected as generic-token noise (`notes` used across many unrelated tables since v1.0) |
| `or_id` | uuid | nullable | none | — | `UUID`, nullable, default none | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) — earlier pickaxe hit `7344b0a` (L3a, "add ordres_reparation migration") opened and rejected: that diff's `or_id` is `or_taches.or_id`/`or_pieces.or_id`, different tables |
| `remise_montant` | numeric | nullable | `0` | — | `NUMERIC(12,2)`, nullable, default `0` | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `total_ht` | numeric | NOT NULL | `0` | — | `NUMERIC(12,2)`, NOT NULL, default `0` | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |
| `total_tva` | numeric | NOT NULL | `0` | — | `NUMERIC(12,2)`, NOT NULL, default `0` | code awareness: `b29d4f5` (2026-07-04); true DB origin earlier/unknown (undocumented Dashboard ALTER) |

**Contraintes (pg_constraint, Requête 2) — `devis`, 25 colonnes cibles :**
- `entite_facturation_id` → `FOREIGN KEY devis_entite_facturation_id_fkey`: `FOREIGN KEY (entite_facturation_id) REFERENCES entites_facturation(id)` — verbatim `pg_get_constraintdef`. Pas de clause `ON DELETE` explicite (défaut `NO ACTION`/`RESTRICT`).
- Les 24 autres colonnes cibles (`client_adresse`, `client_cp`, `client_email`, `client_id`, `client_nom`, `client_siret`, `client_tel`, `client_tva`, `client_ville`, `cree_par`, `date_acceptation`, `date_creation`, `date_envoi`, `date_refus`, `date_validite`, `lignes`, `moto_km`, `moto_label`, `moto_vin`, `notes`, `or_id`, `remise_montant`, `total_ht`, `total_tva`) → aucune contrainte explicite (confirmé `pg_constraint`) au-delà de la NOT NULL/default déjà capturée ci-dessus. Les autres contraintes de `devis` (`devis_garage_id_fkey`, `devis_moto_id_fkey`, `devis_numero_key`, `devis_pkey`, `devis_statut_check`) portent sur des colonnes hors périmètre (déjà documentées).

**Récapitulatif Requête 2 — hors devis/garages/interventions ci-dessus :** aucune autre contrainte CHECK/UNIQUE/FK ne porte sur une colonne cible des 34 colonnes non documentées de `garages`/`interventions`/`devis` (confirmé exhaustivement contre la liste complète `pg_constraint` des 4 tables retournée par Requête 2 — absence de ligne = absence de contrainte, pas une donnée manquante).

⚠️ Rappel (per plan `<interfaces>`) : `total_ttc`, `remise_pct`, `remise_type`, `remise_note` sont déjà documentées dans `schema.sql` (baseline v1.0) — elles ne figurent PAS dans ce tableau et ne doivent pas être re-signalées comme non documentées. Seules `total_ht`, `total_tva`, `remise_montant` sont nouvelles.

**Commits cited for the devis cluster:**
- `f2d7d9a` (2026-05-11) — *"fix(devis): aligner noms colonnes backend sur schema base (refuse_at->date_refus, valide_at->date_acceptation)"* — earliest code awareness for `date_refus`/`date_acceptation` specifically.
- `b29d4f5` (2026-07-04) — *"fix(16-01): rewrite Devis data-access layer against real live devis schema"* — the primary reconciliation commit; its own commit message states: *"Live schema introspection (PostgREST OpenAPI) confirmed [the assumed schema] does not exist in prod: `devis` is a denormalized/snapshot table with an embedded `lignes` jsonb column, NOT NULL `client_nom`/`entite_facturation_id`, and persisted total_ht/total_tva/total_ttc columns."* — earliest code awareness for the remaining 23 columns.
- `af3b15f` (2026-07-04) — *"feat(16-01): add idempotent devis seed fixture for curl UAT (real schema)"* — same-day companion commit, corroborates `moto_label`/`moto_vin`/`moto_km` snapshot pattern.

---

## Ghost columns — pending Mehdi confirmation (plan 02)

Exactly 9 columns have **zero code trail** across the full git history (302 commits) and are architecturally unreachable from every current write path (confirmed via explicit allowlist/payload inspection, not just absence from `git log -S`):

**`garages` (5):** `ville`, `cp`, `type`, `marque_officielle`, `actif` — none appear in `Garages.update()`'s allowlist (`supabase.js` L186).

**`interventions` (4):** `niveau_preuve`, `facture_id`, `operation_code`, `photo_url` — none appear in `Interventions.create()`'s literal insert payload (`supabase.js` L397-408), and no caller anywhere sends these field names to `Interventions.update()` either.

These 9 columns have no recoverable origin via git correlation (SCHEMA-03 is honestly "undetermined" for them, per 20-RESEARCH.md's Open Questions). Plan 02's checkpoint should present this exact list to Mehdi and ask whether each is (a) an abandoned/never-finished feature, (b) a feature scaffolded ahead of code that was later built differently, or (c) truly accidental/forgotten — the LOW-confidence semantic inferences already captured in 20-RESEARCH.md's Preliminary Findings tables can be offered as a starting point for his answer, not asserted as fact.
