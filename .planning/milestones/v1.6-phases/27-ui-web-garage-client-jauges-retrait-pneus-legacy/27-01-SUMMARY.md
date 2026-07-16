---
phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy
plan: 01
subsystem: testing
tags: [node, test-harness, grep-verification, pg-direct, jauges, consommables]

# Dependency graph
requires:
  - phase: 26-cron-rappel-photo-consommables-badge-garage
    provides: consommables/photos_consommables schema (migration 23), GAUGE-03/GAUGE-04 read-time helpers
provides:
  - scripts/test-consommables-jauges.js — Wave 0 Nyquist harness with 5 named --case= cases used as the automated <verify> command by plans 27-02/27-03/27-04
affects: [27-02, 27-03, 27-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 test harness written before implementation exists — all 5 cases intentionally RED (FAIL) until later plans deliver services/jaugeConsommables.js, sql/migrations/25_migrate_pneus_to_consommables.sql, the GET /motos/:id/consommables endpoint, and the frontend UI"
    - "Structural grep checks scoped to a handler window (routeIdx..routeIdx+1500) instead of file-wide indexOf, to avoid false positives from an unrelated existing route sharing the same path literal (POST /motos/:id/consommables from Phase 25)"

key-files:
  created: [scripts/test-consommables-jauges.js]
  modified: []

key-decisions:
  - "endpoint-shape structural case matches the router's exact M('GET','/motos/:id/consommables') registration literal, not a bare path substring — the codebase already has a POST route on the identical path (CONSO-01, Phase 25), so a naive substring match would have produced a false PASS"
  - "migration case fixture reuses the proprietaire_type='garage' + proprietaire_garage_id pattern established in Phase 23/25 test scripts (moto_proprietaire_coherence CHECK constraint, L8)"

patterns-established:
  - "Pattern: hybrid case functions split into a sync *Structural (grep, always runs) and an async *Live (network/DB, skips cleanly when env vars/FRESH_DB_URL absent) pair — reused verbatim from scripts/test-consommables-crud.js's --case= convention"

requirements-completed: [GAUGE-01, GAUGE-02, CONSO-04]

# Metrics
duration: 12min
completed: 2026-07-15
---

# Phase 27 Plan 01: Wave 0 Test Harness Summary

**`scripts/test-consommables-jauges.js` created with 5 named `--case=` cases (jauge-generale-logic, endpoint-shape, frontend-structure, migration, dead-code-removed) — RED baseline confirmed (15/15 assertions FAIL, exit code 1) since none of the Phase 27 implementation exists yet.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-15T20:28:17Z
- **Completed:** 2026-07-15T20:40:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- New hand-rolled Node harness at `scripts/test-consommables-jauges.js`, modeled verbatim on `scripts/test-consommables-crud.js`'s `assert()`/`--case=`/PASS-FAIL-counter/`process.exit(KO>0?1:0)` conventions
- All 5 cases mandated by `27-VALIDATION.md`'s Per-Task Verification Map are present and independently runnable via `--case=<name>`
- Live cases (`endpoint-shape` live sub-check, `migration`) skip cleanly with a `SKIP` line and no KO increment when `JAUGES_TEST_BASE_URL`/`JAUGES_TEST_TOKEN`/`JAUGES_TEST_MOTO_ID` or `FRESH_DB_URL` are unset — verified by running each case locally
- RED baseline demonstrated for all 5 cases: `node scripts/test-consommables-jauges.js` → 0/15 assertions passed, exit code 1 (expected — Phase 27 implementation lands in later plans)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/test-consommables-jauges.js with 5 cases (RED baseline)** - `1d2574c` (test)

**Plan metadata:** (pending — final docs commit below)

## Files Created/Modified
- `scripts/test-consommables-jauges.js` - Wave 0 harness, 403 lines, 5 `--case=` cases (jauge-generale-logic pure-function check, endpoint-shape hybrid grep+live, frontend-structure grep, migration pg-direct idempotency check, dead-code-removed grep) plus the standard summary/exit-code footer

## Decisions Made
- Narrowed the `endpoint-shape` structural regex from a bare `'/motos/:id/consommables'` substring to the exact router literal `M('GET','/motos/:id/consommables')`, discovered during local verification that an existing `POST` route on the identical path (Phase 25 CONSO-01) would otherwise produce a false PASS before 27-02 adds the real GET handler. Also switched the "resolveMotoForCtx nearby" check from a file-wide `indexOf` distance comparison to a windowed substring search (`routeIdx` .. `routeIdx+1500`), since `resolveMotoForCtx` is already referenced by several unrelated handlers elsewhere in the ~107KB file and the nearest-pair heuristic in the plan text wasn't reliable against a large multi-handler file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed false-positive risk in endpoint-shape structural check**
- **Found during:** Task 1, local verification run of `--case=endpoint-shape`
- **Issue:** The plan's literal instruction ("assert it contains the literal route registration `'/motos/:id/consommables'`... or simply assert both present") would have matched the pre-existing `POST '/motos/:id/consommables'` route from Phase 25 (CONSO-01), producing a false PASS for the not-yet-implemented GET endpoint — defeating the purpose of a RED baseline for 27-02 Task 3.
- **Fix:** Scoped the route match to the exact `M('GET','/motos/:id/consommables')` router literal and searched for `resolveMotoForCtx` only within a 1500-char window starting at that match, instead of a file-wide `indexOf` distance comparison.
- **Files modified:** scripts/test-consommables-jauges.js
- **Verification:** Re-ran `node scripts/test-consommables-jauges.js --case=endpoint-shape` — now correctly FAILs pre-implementation (route GET introuvable) instead of a misleading partial PASS.
- **Committed in:** 1d2574c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix in the harness itself, before commit)
**Impact on plan:** Improves the accuracy of the Wave 0 harness's RED/GREEN signal for 27-02 Task 3 (GAUGE-01 GET endpoint). No scope creep — same file, same task.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required. (Live cases in this harness use existing `FRESH_DB_URL`/`JAUGES_TEST_*` env var conventions already established in Phase 23/25 — no new credential needed for this plan.)

## Next Phase Readiness
- `scripts/test-consommables-jauges.js --case=jauge-generale-logic` is ready for 27-02 Task 2 (services/jaugeConsommables.js) to turn green
- `scripts/test-consommables-jauges.js --case=migration` is ready for 27-02 Task 1 (migration 25) to turn green
- `scripts/test-consommables-jauges.js --case=endpoint-shape` is ready for 27-02 Task 3 (GET /motos/:id/consommables) to turn green
- `scripts/test-consommables-jauges.js --case=frontend-structure` is ready for 27-03 Task 1 and 27-04 Tasks 1-2 to turn green
- `scripts/test-consommables-jauges.js --case=dead-code-removed` is ready for 27-03 Tasks 2-3 to turn green
- No blockers for 27-02.

---
*Phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: scripts/test-consommables-jauges.js
- FOUND: 1d2574c
