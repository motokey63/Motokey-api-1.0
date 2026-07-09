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
| `ville` | text | nullable | none | — | TBD | TBD |
| `cp` | text | nullable | none | — | TBD | TBD |
| `type` | text | NOT NULL | `'pro'` | — | TBD | TBD |
| `marque_officielle` | text | nullable | none | — | TBD | TBD |
| `actif` | boolean | NOT NULL | `true` | — | TBD | TBD |

---

## `interventions` — undocumented (baseline)

| column | type (OpenAPI) | nullable | default | FK | EXACT (pg catalog — plan 02) | origin (plan 01 Task 2) |
|---|---|---|---|---|---|---|
| `niveau_preuve` | text | nullable | `'declare'` | — | TBD | TBD |
| `facture_id` | uuid | nullable | none | → `factures_scannees.id` | TBD | TBD |
| `operation_code` | text | nullable | none | — | TBD | TBD |
| `photo_url` | text | nullable | none | — | TBD | TBD |

---

## `devis` — undocumented (baseline)

| column | type (OpenAPI) | nullable | default | FK | EXACT (pg catalog — plan 02) | origin (plan 01 Task 2) |
|---|---|---|---|---|---|---|
| `client_adresse` | text | nullable | none | — | TBD | TBD |
| `client_cp` | text | nullable | none | — | TBD | TBD |
| `client_email` | text | nullable | none | — | TBD | TBD |
| `client_id` | uuid | nullable | none | — | TBD | TBD |
| `client_nom` | text | NOT NULL | none | — | TBD | TBD |
| `client_siret` | text | nullable | none | — | TBD | TBD |
| `client_tel` | text | nullable | none | — | TBD | TBD |
| `client_tva` | text | nullable | none | — | TBD | TBD |
| `client_ville` | text | nullable | none | — | TBD | TBD |
| `cree_par` | text | nullable | none | — | TBD | TBD |
| `date_acceptation` | timestamptz | nullable | none | — | TBD | TBD |
| `date_creation` | timestamptz | NOT NULL | `now()` | — | TBD | TBD |
| `date_envoi` | timestamptz | nullable | none | — | TBD | TBD |
| `date_refus` | timestamptz | nullable | none | — | TBD | TBD |
| `date_validite` | date | nullable | none | — | TBD | TBD |
| `entite_facturation_id` | uuid | NOT NULL | none | → `entites_facturation.id` | TBD | TBD |
| `lignes` | jsonb | NOT NULL | none | — | TBD | TBD |
| `moto_km` | integer | nullable | none | — | TBD | TBD |
| `moto_label` | text | nullable | none | — | TBD | TBD |
| `moto_vin` | text | nullable | none | — | TBD | TBD |
| `notes` | text | nullable | none | — | TBD | TBD |
| `or_id` | uuid | nullable | none | — | TBD | TBD |
| `remise_montant` | numeric | nullable | `0` | — | TBD | TBD |
| `total_ht` | numeric | NOT NULL | `0` | — | TBD | TBD |
| `total_tva` | numeric | NOT NULL | `0` | — | TBD | TBD |

⚠️ Rappel (per plan `<interfaces>`) : `total_ttc`, `remise_pct`, `remise_type`, `remise_note` sont déjà documentées dans `schema.sql` (baseline v1.0) — elles ne figurent PAS dans ce tableau et ne doivent pas être re-signalées comme non documentées. Seules `total_ht`, `total_tva`, `remise_montant` sont nouvelles.

---

*Origine (colonne "origin") à remplir par Task 2 de ce plan — voir section suivante une fois complétée.*
