---
phase: 28-ui-mobile-client-jauges-lecture-seule
plan: 01
subsystem: ui
tags: [react-native, expo, typescript, jest, mobile]

# Dependency graph
requires:
  - phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy
    provides: "CONSO_LABELS/ETAT_WORDING wording + GET /motos/:id/consommables response shape, verbatim source of truth for parity"
provides:
  - "etatColor()/CONSO_LABELS/ETAT_WORDING in mobile-app/lib/motoDisplay.ts"
  - "ConsommableJauge type + parseConsommables() envelope parser in mobile-app/lib/motoParse.ts"
  - "Read-only GaugeBar component (mobile-app/components/GaugeBar.tsx)"
affects: ["28-02 (screen wiring, consumes GaugeBar + parseConsommables)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "etatColor() defaults to neutral colors.bl (not red) for unknown/absent wear state — differs deliberately from couleurColor's red default"
    - "parseConsommables mirrors parseInterventions/parseAlertes two-level envelope unwrap (data?.data?.<key> first, flat fallback second, never throws)"
    - "GaugeBar is the first read-only progress-bar component in the mobile repo, reusing StatutBadge's pill visual inline rather than importing StatutBadge directly"

key-files:
  created:
    - mobile-app/components/GaugeBar.tsx
  modified:
    - mobile-app/lib/motoDisplay.ts
    - mobile-app/lib/motoParse.ts
    - mobile-app/lib/__tests__/motoDisplay.test.ts
    - mobile-app/lib/__tests__/ficheMoto.test.ts

key-decisions:
  - "etatColor(undefined/unknown) defaults to colors.bl (neutral), not colors.rd — an unmeasured consommable must never read as 'critique' to the client"
  - "GaugeBar has no upload affordance (D-04): mobile is read-only this milestone, unlike MotoKey_Client.html's jaugeRowClient which has an 'Ajouter une photo' button"
  - "Fill width is clamped 0-100 via Math.max(0, Math.min(100, pctUsure ?? 0)) so a malformed backend pct_usure can never overflow the track"

patterns-established:
  - "Pure logic (maps/parsers) built and unit-tested before the RN screen that consumes them — interface-first handoff to 28-02"

requirements-completed: [GAUGE-05, GAUGE-06]

# Metrics
duration: 15min
completed: 2026-07-16
---

# Phase 28 Plan 01: Mobile Gauges Foundation Summary

**etatColor/CONSO_LABELS/ETAT_WORDING maps + parseConsommables envelope parser + read-only GaugeBar component, all pure/unit-tested, ready for screen wiring in 28-02.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-16T10:08:00Z (approx)
- **Completed:** 2026-07-16T10:23:58Z
- **Tasks:** 2
- **Files modified:** 5 (4 modified, 1 created)

## Accomplishments
- `etatColor()` + `CONSO_LABELS`/`ETAT_WORDING` maps added to `mobile-app/lib/motoDisplay.ts`, verbatim parity with `MotoKey_Client.html` lines 612-647, with a deliberate neutral-blue (not red) default for unknown/absent wear states
- `ConsommableJauge` type + `parseConsommables()` added to `mobile-app/lib/motoParse.ts`, following the established two-level envelope unwrap pattern (`parseInterventions`/`parseAlertes`), null-safe on non-ok/empty responses
- `GaugeBar` component created (`mobile-app/components/GaugeBar.tsx`) — read-only row (label | clamped 90px bar | wording pill), `hasData:false` renders a "Non renseigné" pill with no bar
- 44/44 jest tests passing (16 new cases across the two describe blocks + parseConsommables), full-repo `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Add etatColor + conso maps to motoDisplay.ts and parseConsommables to motoParse.ts (with tests)** - `98eeecf` (feat)
2. **Task 2: Create the read-only GaugeBar component** - `b029cf2` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `mobile-app/lib/motoDisplay.ts` - Added `CONSO_LABELS`, `ETAT_WORDING`, `etatColor()` (neutral-blue default)
- `mobile-app/lib/motoParse.ts` - Added `ConsommableJauge` interface + `parseConsommables()` two-level envelope parser
- `mobile-app/lib/__tests__/motoDisplay.test.ts` - Added `etatColor`/`CONSO_LABELS`/`ETAT_WORDING` describe blocks
- `mobile-app/lib/__tests__/ficheMoto.test.ts` - Added `parseConsommables` describe block (two-level, flat, non-ok, null cases)
- `mobile-app/components/GaugeBar.tsx` - New read-only wear-gauge row component

## Decisions Made
- `etatColor()`'s neutral-blue default (vs. `couleurColor`'s red default) is intentional: an unknown/absent wear state is not "critique" and must not visually alarm the client.
- `GaugeBar` intentionally omits any upload affordance (D-04, mobile read-only this milestone) — will differ visually from the web client's `jaugeRowClient` by design, not oversight.
- Fill-width clamping (`Math.max(0, Math.min(100, ...))`) guards against a malformed `pct_usure` ever overflowing the 90px track.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The execution worktree's git branch was 3 commits behind `master` (missing the phase 28 plan/context files themselves, created after the worktree was branched) — resolved with a clean fast-forward merge (`git merge --ff-only master`) before any edits, no conflicts.
- `mobile-app/node_modules` was absent in the worktree (gitignored, not carried by `git worktree add`) — resolved by creating an NTFS junction (`mklink /J`) to the main checkout's `node_modules` rather than a full reinstall, avoiding duplication and network cost.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 28-02 can now import `etatColor`, `ETAT_WORDING`, `CONSO_LABELS` from `motoDisplay.ts`, `parseConsommables`/`ConsommableJauge` from `motoParse.ts`, and render `<GaugeBar />` directly with typed props — no further contract exploration needed.
- No blockers. This plan is pure/logic-only (no screen wiring), so nothing here touches live data or requires manual verification.

---
*Phase: 28-ui-mobile-client-jauges-lecture-seule*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: mobile-app/lib/motoDisplay.ts
- FOUND: mobile-app/lib/motoParse.ts
- FOUND: mobile-app/components/GaugeBar.tsx
- FOUND: mobile-app/lib/__tests__/motoDisplay.test.ts
- FOUND: mobile-app/lib/__tests__/ficheMoto.test.ts
- FOUND: commit 98eeecf (Task 1)
- FOUND: commit b029cf2 (Task 2)
