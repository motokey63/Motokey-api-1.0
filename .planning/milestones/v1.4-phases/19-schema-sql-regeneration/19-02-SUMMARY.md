---
phase: 19-schema-sql-regeneration
plan: 02
subsystem: database
tags: [postgres, supabase, schema-sql, ddl, rls]

# Dependency graph
requires:
  - phase: 19-schema-sql-regeneration (plan 01)
    provides: "Verbatim devis_statut_check allowed values (7-value superset) and confirmed RLS default-deny state (enabled, zero policies) for garage_users/client_device_tokens/push_send_log"
provides:
  - "schema.sql with CREATE TABLE for garage_users, client_device_tokens, push_send_log (migrations 12/16/17), copied verbatim from migration files including indexes, comments, and RLS enablement with no policies"
  - "schema.sql motos table with migration-18 maintenance-tier columns (last_maintenance_tier_notified, last_maintenance_tier_notified_at) and their COMMENT ON COLUMN"
  - "schema.sql clients table with migration-19 UNIQUE(email, garage_id) constraint (clients_email_garage_id_key)"
  - "schema.sql devis.statut converted from stale statut_devis ENUM to TEXT+CHECK matching the live 7-value constraint (brouillon/envoye/accepte/refuse/expire/converti/annule)"
  - "schema.sql header comment honestly documenting the known-partial bootstrap scope (migrations 1-19 only, ~19 untracked live tables/views listed by name)"
affects: [19-03-PLAN.md]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Faithful-reproduction schema.sql editing: copy migration-file DDL verbatim rather than re-deriving it, preserving box-drawing section-header conventions and DROP-block FK-safe ordering"

key-files:
  created: []
  modified: [schema.sql]

key-decisions:
  - "devis.statut CHECK values copied verbatim from plan 19-01's pg_get_constraintdef capture (7 values), replacing the stale 4-value statut_devis ENUM; DEFAULT stayed 'brouillon' since it is present in the confirmed set — no discrepancy to note"
  - "garage_users/client_device_tokens/push_send_log RLS reproduced as ALTER TABLE ... ENABLE ROW LEVEL SECURITY with zero CREATE POLICY statements, matching plan 19-01's confirmed prod default-deny state exactly (not inventing permissive policies)"
  - "The 3 new tables placed immediately after the clients table section (before motos), since garage_users and client_device_tokens both FK into tables already defined by that point (garages/auth.users and clients respectively)"

patterns-established: []

requirements-completed: []  # SCHEMA-01 spans plans 02+03; deferred to plan 03 completion per plan 01's precedent

# Metrics
duration: ~15min
completed: 2026-07-09
---

# Phase 19 Plan 02: Schema.sql Regeneration Summary

**schema.sql now includes the 3 previously-absent tables (garage_users, client_device_tokens, push_send_log), migration-18/19 columns/constraints, a TEXT+CHECK devis.statut matching the live 7-value constraint, and an honest known-partial-bootstrap header — closing the narrow-scope drift identified in Phase 19.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-09 (session start)
- **Completed:** 2026-07-09T08:52:51Z
- **Tasks:** 2 (both auto)
- **Files modified:** 1 (`schema.sql`)

## Accomplishments

- Added `CREATE TABLE garage_users`, `CREATE TABLE client_device_tokens`, `CREATE TABLE push_send_log` to schema.sql, copied verbatim from migrations 12/16/17 (columns, indexes, `COMMENT ON`, including push_send_log's explanatory NOTE about the intentionally-missing FK), placed after the `clients` table section.
- Updated the NETTOYAGE `DROP TABLE` block with the 3 new tables at the top (FK-safe leaf-table order).
- Enabled RLS on all 3 new tables with **no** `CREATE POLICY` statements, matching plan 19-01's confirmed prod state (RLS enabled, zero explicit policies, default-deny for anon/authenticated).
- Added motos migration-18 columns (`last_maintenance_tier_notified`, `last_maintenance_tier_notified_at`) plus their `COMMENT ON COLUMN`.
- Added the `clients_email_garage_id_key` UNIQUE(email, garage_id) constraint from migration 19.
- Converted `devis.statut` from the stale `statut_devis` ENUM (`brouillon`/`envoye`/`valide`/`annule`) to `TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'envoye', 'accepte', 'refuse', 'expire', 'converti', 'annule'))` — the verbatim 7-value set captured in plan 19-01. Removed the `CREATE TYPE statut_devis` and its `DROP TYPE` line entirely (0 residual references confirmed).
- Added the `BOOTSTRAP PARTIEL` header comment immediately after the title box, listing all ~19 untracked table/view groups by name (ordres_reparation family, facturation/billing, PDP e-invoicing, catalogue_pieces, plans_constructeur, moto_proprietaires, users_client family, the 2 views).

## Task Commits

1. **Task 1: Add the 3 new tables (garage_users, client_device_tokens, push_send_log)** - `79231e8` (feat)
2. **Task 2: Apply motos/clients migrations, convert devis.statut ENUM→CHECK, add partial-bootstrap header** - `95abfb9` (feat)

**Plan metadata:** (this commit) `docs(19-02): complete schema.sql regeneration plan`

## Files Created/Modified

- `schema.sql` - Added 3 CREATE TABLE sections (garage_users, client_device_tokens, push_send_log) with indexes/comments/RLS; added motos migration-18 columns; added clients migration-19 UNIQUE constraint; converted devis.statut from ENUM to TEXT+CHECK; added known-partial-bootstrap header comment

## Decisions Made

- devis.statut DEFAULT 'brouillon' required no discrepancy handling — 'brouillon' is present in plan 19-01's confirmed 7-value CHECK set, so the plan's contingency branch (using a different app-inserted value) was not needed.
- Table placement: both garage_users and client_device_tokens were placed together after `clients` (rather than splitting garage_users near `garages` and client_device_tokens near `clients`) since the plan explicitly said "AFTER the clients table section" for both, and push_send_log (no FK) was placed alongside them to keep the 3 new-table additions as one contiguous, easy-to-audit block.

## Deviations from Plan

None - plan executed exactly as written. All 4 acceptance-criteria grep checks (Task 1: table/index/comment presence; Task 2: motos columns, clients constraint, ENUM removal, CHECK clause, bootstrap header) passed on first attempt.

## Issues Encountered

One transient tool-level issue: the first `Edit` attempt for the clients UNIQUE constraint (Task 2) failed because Task 1's edits had already shifted the surrounding text (the `-- TABLE : motos` header that used to immediately follow `clients` now follows the 3 new table sections). Re-read the current file state and retried with the correct surrounding context (`-- TABLE : garage_users` as the next section) — succeeded immediately. Not a plan deviation, just sequencing within Task 2 execution.

## User Setup Required

None - no external service configuration required. This plan only edited a static SQL bootstrap file; no migration was applied to prod (schema.sql is not executed against prod, it's a fresh-project bootstrap reference, consistent with CLAUDE.md's note that "personne ne l'exécute contre la prod").

## Next Phase Readiness

- Plan 03 (fresh-bootstrap verification) is unblocked: schema.sql now contains all narrow-scope objects (`garage_users`, `client_device_tokens`, `push_send_log`, `motos.last_maintenance_tier_notified[_at]`, `clients_email_garage_id_key`, `devis_statut_check`-equivalent TEXT+CHECK) that `scripts/introspect-schema.js --compare` (built in plan 19-01) will assert against a fresh bootstrap project.
- No blockers carried forward.

---
*Phase: 19-schema-sql-regeneration*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: schema.sql
- FOUND: .planning/phases/19-schema-sql-regeneration/19-02-SUMMARY.md
- FOUND: 79231e8 (git log)
- FOUND: 95abfb9 (git log)
