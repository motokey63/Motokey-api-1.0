---
phase: 21-migrations-r-troactives-mise-jour-schema-sql
plan: 01
subsystem: database
tags: [postgres, supabase, schema-drift, migrations, audit-trail]

# Dependency graph
requires:
  - phase: 20-introspection-corr-lation-d-origine
    provides: 20-FINDINGS.md — per-column type/nullable/default/origin data for garages/interventions/devis Gap A columns, plus terminal ghost-column verdicts
provides:
  - Three numbered idempotent SQL migration files (20, 21, 22) documenting all 34 Gap A columns discovered in Phase 20
  - Per-column origin comments sourced verbatim from 20-FINDINGS.md (Mehdi-confirmed, ghost-column terminal verdict, or code-catch-up with commit hash)
  - Documentation-only record of the two out-of-scope FKs (factures_scannees, entites_facturation) without reproducing them as live constraints
affects: [21-02, 22-schema-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Retroactive migration files as audit trail (never meant to run in normal flow — schema.sql already carries the columns via plan 21-02)"]

key-files:
  created:
    - sql/migrations/20_garages_undocumented_columns.sql
    - sql/migrations/21_interventions_undocumented_columns.sql
    - sql/migrations/22_devis_undocumented_columns.sql
  modified: []

key-decisions:
  - "clients cluster intentionally excluded from these migrations — origin already documented in migrations/04-rbac-migration.sql@c66ad69, ported directly into schema.sql by plan 21-02 instead of being re-documented as a new discovery"
  - "Two prod FKs (interventions.facture_id -> factures_scannees, devis.entite_facturation_id -> entites_facturation) recorded as SQL comments only, never as live REFERENCES clauses, since both target tables are out of schema.sql's bootstrap scope"

patterns-established:
  - "Numbered retroactive migration = idempotent ADD COLUMN IF NOT EXISTS + a mandatory per-column origin comment, no bare ADD COLUMN lines"

requirements-completed: [SCHEMA-04]

# Metrics
duration: 20min
completed: 2026-07-10
---

# Phase 21 Plan 01: Retroactive Gap A Migrations Summary

**Three numbered SQL migration files (20/21/22) documenting all 34 undocumented prod columns on garages/interventions/devis, each with a verbatim origin comment traced back to Phase 20's findings.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-10T08:43:41Z
- **Tasks:** 2 completed
- **Files modified:** 3 created

## Accomplishments
- Migration 20 documents garages' 5 Gap A columns (ville/cp — Mehdi-confirmed unwired address split; type/marque_officielle/actif — terminal ghost columns)
- Migration 21 documents interventions' 4 Gap A columns (niveau_preuve, facture_id, operation_code, photo_url — all terminal ghost columns), with the `facture_id -> factures_scannees` FK recorded as a comment only
- Migration 22 documents devis' 25 Gap A columns (client/moto snapshot fields, totaux, lifecycle dates, misc.), all traced to code-catch-up awareness commits `b29d4f5` and `f2d7d9a`, with `entite_facturation_id -> entites_facturation` FK recorded as a comment only
- Combined column count across the three files: 5 + 4 + 25 = 34, matching Phase 20's full Gap A inventory exactly

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration 20 (garages) and migration 21 (interventions)** - `1c9abc7` (feat)
2. **Task 2: Create migration 22 (devis, 25 columns)** - `ab0c7ee` (feat)

_Note: no separate plan-metadata commit was made before this SUMMARY — the final metadata commit follows below per protocol._

## Files Created/Modified
- `sql/migrations/20_garages_undocumented_columns.sql` - Retroactive record of garages' 5 undocumented Gap A columns
- `sql/migrations/21_interventions_undocumented_columns.sql` - Retroactive record of interventions' 4 undocumented Gap A columns
- `sql/migrations/22_devis_undocumented_columns.sql` - Retroactive record of devis' 25 undocumented Gap A columns

## Decisions Made
None beyond what the plan specified — content was copied verbatim from the plan's exact SQL blocks, which were themselves pre-reconciled against 20-FINDINGS.md.

## Deviations from Plan

None functionally — all SQL content matches the plan's verbatim blocks exactly, and every acceptance criterion in the plan passes when checked precisely. One informational note, not a fix:

**Note (not a deviation requiring action): naive `grep -c "ADD COLUMN IF NOT EXISTS"` over-counts by 1 on files 20 and 22**
- **Found during:** Task 1 and Task 2 verification
- **Detail:** Both files' header comment blocks contain the literal prose phrase "Idempotent : ADD COLUMN IF NOT EXISTS." (this text was specified verbatim by the plan itself). A naive `grep -c` therefore returns 6 for migration 20 (expected 5) and 26 for migration 22 (expected 25).
- **Resolution:** Verified actual column counts precisely with `grep -c "^ALTER TABLE <table> ADD COLUMN IF NOT EXISTS"`, which correctly returns 5, 4, and 25 respectively — matching the plan's `must_haves` and Phase 20's Gap A inventory exactly. No file content was altered; the header prose is part of the plan's specified verbatim text and was preserved as-is (it documents the file's own idempotency for a human reader).
- **Files affected:** sql/migrations/20_garages_undocumented_columns.sql, sql/migrations/22_devis_undocumented_columns.sql (informational only, no code change)

## Issues Encountered

**Stale parallel worktree base.** This executor's worktree (`worktree-agent-a03c78e0ecf318959`) was branched before Phase 21 was planned and was 10 commits behind `master` (still at the v1.4-milestone-complete commit), so `.planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/21-01-PLAN.md` did not exist in it yet. Root cause: the plan files themselves live only as git-ignored working-directory files in the main repo (`.planning/` is in `.gitignore`; only specific files are force-added per commit), so they never transfer via git merge/fast-forward between worktrees — only tracked `.planning/*.md` files (ROADMAP, STATE, PROJECT, REQUIREMENTS, SUMMARY/FINDINGS/VERIFICATION files) do.
- **Fix:** Verified the worktree branch had zero unique commits relative to `master` (`git log worktree..master` / `master..worktree`), fast-forwarded the worktree branch to `master` (`git merge --ff-only master`), then copied the untracked `.planning/phases/21-.../` directory and `.planning/config.json` from the main repo (`C:/motokey-api`) into the worktree via `cp`.
- **No commit needed for this step** — it only synchronized pre-existing planning artifacts already present (uncommitted) in the main repo; nothing new was created by this fix.

## User Setup Required

None - no external service configuration required. These are audit-trail-only migration files; per the plan they will normally never be executed (schema.sql already includes the columns via plan 21-02).

## Next Phase Readiness
- Plan 21-02 can proceed to port the same 34 Gap A columns (plus the already-documented `clients` cluster) directly into `schema.sql`, using these three files as the citable origin-comment source.
- Plan 21-01 has no outstanding blockers; all acceptance criteria pass under precise verification.

---
*Phase: 21-migrations-r-troactives-mise-jour-schema-sql*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: sql/migrations/20_garages_undocumented_columns.sql
- FOUND: sql/migrations/21_interventions_undocumented_columns.sql
- FOUND: sql/migrations/22_devis_undocumented_columns.sql
- FOUND: commit 1c9abc7 (Task 1)
- FOUND: commit ab0c7ee (Task 2)
