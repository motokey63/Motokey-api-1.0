---
phase: 22-v-rification-bootstrap-nettoyage-header
plan: 01
subsystem: database
tags: [postgres, supabase, pg, schema-verification, node-postgres]

# Dependency graph
requires:
  - phase: 21-migrations-r-troactives-mise-jour-schema-sql
    provides: schema.sql with all Gap A columns (39) and Gap B objects (billing_events, motos_proprietaires_historique, liaisons_client_garage, reclamations_moto, v_motos_avec_proprietaire) already present
provides:
  - "introspect-schema.js --compare mode now aware of all 5 Gap B objects (EXPECTED_TABLES extended from 13 to 18 entries)"
  - "A committed, re-runnable scripts/bootstrap-fresh-schema.js that executes schema.sql against a fresh Postgres via direct pg connection"
affects: [22-02-PLAN.md, 22-03-PLAN.md]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct node-postgres (pg) connection with simple query protocol to execute multi-statement schema.sql in one call — reused from Phase 19, now committed instead of scratchpad"
    - "Never log raw connection strings/keys — only the parsed host via new URL(...).host"

key-files:
  created: [scripts/bootstrap-fresh-schema.js]
  modified: [scripts/introspect-schema.js]

key-decisions:
  - "Merged master into stale worktree before editing (worktree HEAD predated Phase 20/21 commits — Pitfall 1 from 22-RESEARCH.md)"
  - "Copied .env from main repo into worktree to satisfy the plan's required verification step (default-mode prod introspection must exit 0) — .env remains gitignored, never committed"

patterns-established:
  - "Verification scripts under scripts/ that touch prod/fresh-DB credentials must guard against accidentally targeting prod (explicit string match on the prod project ref) and must never print the raw connection string"

requirements-completed: [SCHEMA-07]

# Metrics
duration: ~15min
completed: 2026-07-11
---

# Phase 22 Plan 01: Verification Tooling Prep Summary

**Extended introspect-schema.js's EXPECTED_TABLES to cover the 5 Gap B objects and authored a committed, prod-safe bootstrap-fresh-schema.js runner (direct pg connection) — both ready for plan 22-02's human-gated fresh-project run.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-11T09:45:00Z (approx)
- **Completed:** 2026-07-11T09:59:58Z
- **Tasks:** 2 completed
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- `scripts/introspect-schema.js`'s `EXPECTED_TABLES` array extended from 13 to 18 entries — the 5 Gap B objects (`billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto`, `v_motos_avec_proprietaire`) are now included, so `--compare` mode will actually validate them instead of silently ignoring them (previously Pitfall 3 in 22-RESEARCH.md).
- New committed `scripts/bootstrap-fresh-schema.js` — a re-runnable direct-`pg`-connection bootstrap runner (Phase 19's proven method, previously only an ad-hoc scratchpad script). Reads `FRESH_DB_URL` from `.env`, refuses to run without it, refuses to run if it detects the prod project ref (`rzbqbaccjyxvtlnfitrr`), never prints the raw connection string, and prints `SCHEMA_BOOTSTRAP_OK` on success.
- Confirmed default-mode `node scripts/introspect-schema.js` (no args, against prod) still exits 0 after the array edit — no regression to the existing narrow-scope prod sanity check.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the 5 Gap B objects to EXPECTED_TABLES** - `209f275` (feat)
2. **Task 2: Author committed bootstrap runner scripts/bootstrap-fresh-schema.js** - `8e86297` (feat)

_Note: no plan-metadata commit issued yet — SUMMARY.md/STATE.md/ROADMAP.md updates follow after this summary, in the final-commit step._

## Files Created/Modified
- `scripts/introspect-schema.js` - `EXPECTED_TABLES` array extended with 5 Gap B object names; explanatory comment updated to reference Phase 21's Gap B work
- `scripts/bootstrap-fresh-schema.js` (new) - Direct `pg` connection bootstrap runner reading `FRESH_DB_URL`, guards against missing creds and prod targeting, never logs the connection string

## Decisions Made
- **Worktree staleness fix (pre-task):** This worktree's HEAD (`0ad8981`) predated Phase 20/21's commits (research explicitly flags this as Pitfall 1 — a known recurring issue across Phases 20/21). Ran `git merge --ff-only master` before any edits, which fast-forwarded to `8a519f7` and pulled in the real, already-updated `schema.sql` (with all Gap A/B objects present) plus Phase 20/21 planning docs. Without this, Task 1/2's `<read_first>` steps would have seen a stale, pre-Gap-B `schema.sql`.
- **Missing `.planning` phase directory and `.env` in this worktree:** Neither `.planning/phases/22-...` nor `.env` (both gitignored) existed in this parallel-executor worktree at start. Copied both from the main repo (`C:\motokey-api`) so the plan file could be read and so the plan's required verification step (`node scripts/introspect-schema.js` against prod must exit 0) could actually run. `.env` remains gitignored in the worktree — not committed, no secrets printed.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their `<action>` blocks precisely (exact `EXPECTED_TABLES` array content, exact bootstrap script requirements).

## Issues Encountered
- Worktree was stale relative to master (missing Phase 20/21 commits) and was missing the `.planning/phases/22-...` directory, `.planning/config.json`, and `.env` entirely (all gitignored, not copied when the worktree was created). Resolved by fast-forward merging master and copying the missing gitignored files from the main repo before starting task work — documented above under Decisions Made, not a plan deviation since it's environment setup, not scope change.

## User Setup Required

None - no external service configuration required by this plan. Plan 22-02 will require Mehdi to create a fresh throwaway Supabase project and provide its connection string (human-action checkpoint), but that is out of scope for this plan.

## Next Phase Readiness
- Both verification tools plan 22-02 needs are now committed, syntax-clean, and exercised (short of a live fresh-project run, which requires human-provided credentials not available to this plan).
- Plan 22-02 can proceed as a pure "provide credentials + run" step: `node scripts/bootstrap-fresh-schema.js` (once `FRESH_DB_URL` is set) then `node scripts/introspect-schema.js --compare <FRESH_URL> <FRESH_KEY>`.
- No blockers identified for 22-02/22-03.

---
*Phase: 22-v-rification-bootstrap-nettoyage-header*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: scripts/introspect-schema.js
- FOUND: scripts/bootstrap-fresh-schema.js
- FOUND: .planning/phases/22-v-rification-bootstrap-nettoyage-header/22-01-SUMMARY.md
- FOUND: commit 209f275
- FOUND: commit 8e86297
