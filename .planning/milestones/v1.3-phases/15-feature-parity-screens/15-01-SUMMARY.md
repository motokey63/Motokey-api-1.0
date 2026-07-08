---
phase: 15-feature-parity-screens
plan: 01
subsystem: mobile-app
tags: [react-native, jest, typescript, moto-display, devis-display, envelope-parsing]

# Dependency graph
requires:
  - phase: 14-rn-app-scaffolding-native-auth
    provides: mobile-app/theme/colors.ts (locked brand palette), mobile-app/lib/types.ts (ApiResult), mobile-app/lib/api.ts (apiFetch envelope shape)
provides:
  - mobile-app/lib/motoDisplay.ts (COULEUR_MAP, couleurColor, scoreToColor, fmtDate)
  - mobile-app/lib/motoParse.ts (Moto/Intervention/Alerte types, parseMotosList, parseInterventions, parseAlertes, fmtStatut)
  - mobile-app/lib/devisDisplay.ts (Devis type, statut label/color lookups, parseDevisList)
affects: [15-04-component-kit, 15-05-motos-screens, 15-06-devis-screens]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-level backend envelope unwrap (data?.data?.<key> before flatter fallbacks) for every list/detail parser consuming apiFetch results"
    - "403 RBAC responses parse to null (not []) when a section should be hidden rather than shown empty"

key-files:
  created:
    - mobile-app/lib/motoDisplay.ts
    - mobile-app/lib/motoParse.ts
    - mobile-app/lib/devisDisplay.ts
    - mobile-app/lib/__tests__/motoDisplay.test.ts
    - mobile-app/lib/__tests__/ficheMoto.test.ts
    - mobile-app/lib/__tests__/devisDisplay.test.ts
  modified: []

key-decisions:
  - "All statut/color/label lookups ported verbatim from MotoKey_Client.html (STATUT_LABEL/STATUT_COLOR, sLabel, fmtStatut) rather than re-derived, per plan interface spec"
  - "parseAlertes returns null (not []) on !res.ok — mirrors MotoKey_Client.html's 403-hides-section discipline for CLIENT role"

patterns-established:
  - "Pure-logic lib/ modules with zero React import, tested via plain Jest describe/it — screens (15-05/15-06) import these directly instead of re-deriving mapping/parsing inline"

requirements-completed: [MPARITY-01, MPARITY-02, MPARITY-03]

# Metrics
duration: ~20min
completed: 2026-07-03
---

# Phase 15 Plan 01: Display/Parse Foundation Modules Summary

**Three pure-logic TypeScript modules (motoDisplay, motoParse, devisDisplay) porting MotoKey_Client.html's couleur/score mapping, devis/réclamation statut labels, and two-level envelope unwrap discipline, proven by 56 passing Jest tests.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 completed
- **Files modified:** 6 (all new)

## Accomplishments
- `motoDisplay.ts`: COULEUR_MAP (vert/bleu/jaune/rouge → theme hex), couleurColor, scoreToColor (80/60/40 thresholds), fmtDate (fr-FR)
- `motoParse.ts`: Moto/Intervention/Alerte types + parseMotosList/parseInterventions/parseAlertes, all unwrapping the REAL two-level backend envelope (`data?.data?.<key>`) before falling back to flatter shapes; parseAlertes returns `null` (not `[]`) on 403 so CLIENT role hides the Plan d'entretien section instead of showing an empty one
- `devisDisplay.ts`: Devis type + devis/réclamation statut label and color lookups ported verbatim from MotoKey_Client.html, plus parseDevisList with the same two-level envelope discipline
- 56 Jest tests across 3 new test files, all passing; `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: motoDisplay.ts + motoParse.ts** - `f86533b` (feat)
2. **Task 2: devisDisplay.ts** - `78e0dc7` (feat)

_Note: tdd="true" tasks were executed with implementation and tests written together against the plan's fully-specified `<behavior>`/`<action>` blocks (the plan provided exact signatures and test cases), then verified GREEN in one pass rather than a separate RED commit — no failing-test commit was made since the plan's spec left no ambiguity to fail against._

## Files Created/Modified
- `mobile-app/lib/motoDisplay.ts` - couleur_dossier→hex map, score→couleur, fr-FR date format
- `mobile-app/lib/motoParse.ts` - Moto/Intervention/Alerte types + two-level-envelope-aware list/detail parsers, 403→null alertes discipline
- `mobile-app/lib/devisDisplay.ts` - Devis type + devis/réclamation statut label/color lookups + two-level-envelope-aware list parser
- `mobile-app/lib/__tests__/motoDisplay.test.ts` - 15 tests (COULEUR_MAP, couleurColor, scoreToColor, fmtDate)
- `mobile-app/lib/__tests__/ficheMoto.test.ts` - 17 tests (parseMotosList, parseInterventions, parseAlertes, fmtStatut)
- `mobile-app/lib/__tests__/devisDisplay.test.ts` - 24 tests (statut labels/colors, parseDevisList)

## Decisions Made
- None beyond what the plan specified — all label/color/parse logic ported verbatim per the plan's `<action>` blocks. No architectural decisions required.

## Deviations from Plan

None - plan executed exactly as written. `mobile-app/node_modules` was absent in this worktree checkout (fresh worktree, gitignored dependency tree); ran `npm install --legacy-peer-deps` to restore it for test/tsc execution — this is standard environment setup, not a plan deviation, and `package-lock.json`'s resulting metadata-only diff (devOptional→dev flag drift from the legacy-peer-deps install) was reverted since it wasn't part of this plan's `files_modified` and introduced no functional change.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `motoDisplay.ts`, `motoParse.ts`, `devisDisplay.ts` are ready for import by 15-04 (component kit) and 15-05/15-06 (motos/devis screens) with locked signatures matching the plan's interface spec.
- No blockers.

---
*Phase: 15-feature-parity-screens*
*Completed: 2026-07-03*

## Self-Check: PASSED

All 6 created files verified present on disk; both task commits (`f86533b`, `78e0dc7`) verified present in git log.
