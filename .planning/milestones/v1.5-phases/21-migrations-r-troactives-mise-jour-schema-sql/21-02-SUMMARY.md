---
phase: 21-migrations-r-troactives-mise-jour-schema-sql
plan: 02
subsystem: database
tags: [postgres, schema, ddl, rbac, supabase]

# Dependency graph
requires:
  - phase: 20-introspection-corr-lation-d-origine
    provides: exact type/nullable/default/constraint metadata + origin verdicts for all 39 Gap A columns (20-FINDINGS.md)
provides:
  - schema.sql garages/clients/interventions/devis CREATE TABLE blocks updated to include every Gap A column
  - clients RBAC columns (client_type_enum, raison_sociale, siret, tva_intracom, adresse_facturation) ported verbatim from migrations/04-rbac-migration.sql
  - devis table cleaned of 10 stale columns absent from prod, 25 real Gap A columns added
  - two out-of-scope FKs (interventions.facture_id -> factures_scannees, devis.entite_facturation_id -> entites_facturation) intentionally added as columns without REFERENCES clauses
affects: [21-04-verification, 22-bootstrap-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Gap A column comment convention: '-- Gap A (Phase 21, SCHEMA-05) — colonnes prod sans fichier de migration (voir sql/migrations/NN)'", "FK-to-out-of-scope-table omission pattern: column kept, REFERENCES dropped, inline comment explains the omission"]

key-files:
  created: []
  modified:
    - schema.sql

key-decisions:
  - "clients port is a direct/verbatim DDL port from migrations/04-rbac-migration.sql @ c66ad69, not a new retroactive migration — origin already fully documented"
  - "facture_id and entite_facturation_id columns added WITHOUT their prod FK because factures_scannees/entites_facturation are out of scope tables not created by schema.sql — including the FK would break a fresh bootstrap"
  - "10 stale devis columns (technicien_id + 9 totals/date columns) removed per Mehdi's explicit 2026-07-09 decision ('Oui, nettoyer aussi') after confirming none are ever written to the devis table in supabase.js"

patterns-established:
  - "Origin-honest DDL comments: 'origine indéterminée, non utilisée par le code actuel' for the 7 terminal-INCONNU ghost columns, versus real-intent comments for ville/cp (confirmed by Mehdi)"

requirements-completed: [SCHEMA-05]

# Metrics
duration: 20min
completed: 2026-07-10
---

# Phase 21 Plan 02: schema.sql Gap A columns Summary

**schema.sql's garages/clients/interventions/devis CREATE TABLE blocks now include every prod Gap A column (39 total) with matching type/nullable/default, two out-of-scope FKs intentionally omitted, and 10 stale devis columns removed.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-10T08:39:00Z
- **Completed:** 2026-07-10T08:48:52Z
- **Tasks:** 3
- **Files modified:** 1 (schema.sql)

## Accomplishments
- `garages` gained 5 Gap A columns (`ville`, `cp`, `type`, `marque_officielle`, `actif`) and `interventions` gained 4 (`niveau_preuve` with CHECK, `facture_id`, `operation_code`, `photo_url`) — all with origin-honest comments distinguishing the 2 confirmed-intent columns (`ville`/`cp`) from the 7 terminal-INCONNU ghost columns
- `clients` gained the full RBAC cluster verbatim from `migrations/04-rbac-migration.sql` @ `c66ad69`: `client_type_enum` type, 5 columns, `clients_pro_requirements` CHECK, `idx_clients_siret` unique index, 5 column comments
- `devis` cleaned of 10 stale columns that don't exist in prod (`technicien_id` + 9 obsolete totals/date columns) and gained its real 25 Gap A columns (client/moto snapshot, `lignes` jsonb, totals, lifecycle dates, misc)
- Both out-of-scope FK targets (`factures_scannees`, `entites_facturation`) confirmed absent from schema.sql — zero `REFERENCES` to either table exists anywhere in the file

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Gap A columns to garages and interventions blocks** - `3ff3b8c` (feat)
2. **Task 2: Port clients RBAC columns from legacy migration into schema.sql** - `6b82e00` (feat)
3. **Task 3: Add 25 Gap A columns to devis and remove 10 stale columns** - `1aa379b` (feat)

_Note: Task 1's commit also swept up a pending `.planning` sync (STATE.md/ROADMAP.md/PROJECT.md/REQUIREMENTS.md/Phase 20 summaries) that had been staged in the index from bringing this worktree's stale `.planning` copy up to date with master before editing — see Deviations below._

## Files Created/Modified
- `schema.sql` - garages: +5 Gap A columns; interventions: +4 Gap A columns (niveau_preuve CHECK, facture_id FK-omitted); clients: +client_type_enum type, +5 columns, +CHECK, +unique index, +5 comments; devis: -10 stale columns, +25 Gap A columns (entite_facturation_id FK-omitted)

## Decisions Made
- clients columns treated as a direct port (not a new migration) since `migrations/04-rbac-migration.sql` already fully documents origin (per Phase 20 findings) — no new commentary needed beyond crediting the source file/commit
- Verified via `grep` against `supabase.js` before removing the 10 stale devis columns: `total_mo_ht`/`total_pieces_ht`/`remise_lignes`/`sous_total_ht`/`remise_globale`/`base_ht`/`tva_montant` are intermediate return values of `Devis._calcTotaux()`, never persisted to the `devis` row; `expire_at` belongs to `transferts`, not `devis`; `technicien_id` is used for `interventions`/`ordres_reparation`, never inserted into `devis`. Confirms 20-FINDINGS.md's "documented-but-absent" observation and makes removal safe.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree isolation required bringing a stale `.planning` copy forward before editing**
- **Found during:** Task 1 setup (before any schema.sql edit)
- **Issue:** This agent's git worktree (`agent-aa24d3188dd56b4c4`) was forked from commit `0ad8981` ("chore: complete v1.4 milestone"), predating all of Phase 20 and the Phase 21 planning session on `master`. `.planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/` didn't exist in the worktree at all (that directory is gitignored — `.planning/` is line 2 of `.gitignore` — so untracked planning artifacts never propagate to worktrees; only explicitly force-added files like STATE.md/ROADMAP.md/PROJECT.md/REQUIREMENTS.md/phase SUMMARY files are shared via git history). Running `gsd-tools init execute-phase` in the worktree returned `phase_found: false`, confirming the gap. `schema.sql` itself was verified byte-identical between the worktree and the main checkout (Phase 20 didn't touch it), so no risk to the actual plan content.
- **Fix:** Ran `git checkout master -- .planning` in the worktree to bring the tracked planning docs (STATE.md, ROADMAP.md, PROJECT.md, REQUIREMENTS.md, Phase 20 SUMMARY/FINDINGS files) forward to match master's committed state, then overwrote STATE.md/ROADMAP.md with the exact uncommitted working-copy content already present on the main checkout (which reflected the orchestrator's live "Phase 21 execution started" bookkeeping). Manually recreated `.planning/phases/21-.../21-02-PLAN.md` in the worktree for local reference (this file itself stays untracked/gitignored, consistent with the main checkout).
- **Files modified:** `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/phases/20-introspection-corr-lation-d-origine/*` (all brought forward, no new content authored)
- **Verification:** `diff` confirmed schema.sql identical pre-edit; `git status` clean before task edits began
- **Committed in:** `3ff3b8c` (bundled into Task 1's commit because these files were already staged in the index from the `git checkout master --` operation before Task 1's `git add schema.sql` was run — the commit picked up everything in the index, not just schema.sql)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking, environment/worktree setup only — no schema.sql content was affected)
**Impact on plan:** Zero impact on the plan's actual deliverable (schema.sql). The deviation is purely about this parallel-executor's git worktree being forked before Phase 21 planning existed; STATE.md/ROADMAP.md content brought forward is byte-identical to what the orchestrator already has on the main checkout, not new authorship.

## Issues Encountered
None beyond the worktree sync documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- schema.sql now satisfies SCHEMA-05 for all four Gap A tables (garages/clients/interventions/devis) — every documented column present with prod-matching type/nullable/default, both out-of-scope FKs safely omitted
- Ready for 21-03 (Gap B tables/view) and 21-04 (final Gap A/Gap B completeness verification) to build on this
- Note for orchestrator: this worktree's branch (`worktree-agent-aa24d3188dd56b4c4`) now carries a `.planning` sync commit bundled with Task 1 — when merging back into `master`, expect the `.planning` portion of that commit to be a no-op/fast-forward-equivalent against `master`'s current state (content was copied from `master`, not newly authored), so only the `schema.sql` changes across all 3 commits should produce real diffs.

---
*Phase: 21-migrations-r-troactives-mise-jour-schema-sql*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: schema.sql
- FOUND: .planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/21-02-SUMMARY.md
- FOUND: 3ff3b8c (Task 1 commit)
- FOUND: 6b82e00 (Task 2 commit)
- FOUND: 1aa379b (Task 3 commit)
</content>
