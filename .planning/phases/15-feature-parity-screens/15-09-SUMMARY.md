---
phase: 15-feature-parity-screens
plan: 09
subsystem: ui
tags: [react-native, expo-router, useFocusEffect, offline-cache, gap-closure]

# Dependency graph
requires:
  - phase: 15-feature-parity-screens (15-05, 15-06)
    provides: Motos tab list screen and Devis tab list screen (mount-only fetch pattern)
provides:
  - Guarded refetch-on-focus (useFocusEffect + isFirstFocus ref) on the Motos tab
  - Guarded refetch-on-focus (useFocusEffect + isFirstFocus ref) on the Devis tab
  - Closure of UAT Test 4 gap (accepted réclamation invisible until manual pull-to-refresh)
affects: [16-push-wiring-end-to-end]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guarded useFocusEffect: an isFirstFocus ref skips the focus event that coincides with initial mount (already handled by the mount useEffect), then calls load() silently on every subsequent focus — no spinner, no double-fetch."

key-files:
  created: []
  modified:
    - "mobile-app/app/(app)/(tabs)/motos/index.tsx"
    - "mobile-app/app/(app)/(tabs)/devis/index.tsx"

key-decisions:
  - "Used a ref guard instead of replacing the mount useEffect with useFocusEffect, because Devis's loading-spinner toggle lives in the mount wrapper (not in load()) — replacing it risked a spinner regression on first load."

patterns-established:
  - "Silent background refresh on tab-return: useFocusEffect(useCallback(() => { if (isFirstFocus.current) { isFirstFocus.current = false; return; } load(); }, [load]))) — reusable for any other mount-preserving tab screen that needs to reflect out-of-band server changes."

requirements-completed: [MPARITY-01, MPARITY-02, MPARITY-04]

# Metrics
duration: ~15min
completed: 2026-07-04
---

# Phase 15 Plan 09: Refetch-on-focus gap closure (UAT Test 4) Summary

**Guarded `useFocusEffect` added to the Motos and Devis tabs so garage-side ownership/status changes (e.g. an accepted réclamation) appear the moment the client returns to the tab, with no manual pull-to-refresh and no regression to the existing single initial load.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-04
- **Tasks:** 2 (1 automated, 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- Closed the major-severity UAT Test 4 gap: a client's claimed moto, transferred server-side when the garage accepts the réclamation, now surfaces automatically on the Motos tab on focus-return.
- Applied the identical fix to the Devis tab (same mount-only-fetch root cause), so out-of-band devis statut changes also refresh on tab-return.
- Confirmed no regression to first-mount load (single fetch, spinner shows correctly) or to existing pull-to-refresh behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add guarded refetch-on-focus to Motos and Devis tab screens** - `8992398` (feat)
2. **Task 2: Verify claimed-moto appears on tab-return (UAT Test 4 reproduction)** - human-verify checkpoint, no code commit (see below)

**Plan metadata:** (this commit) `docs(15-09): complete gap closure plan`

## Files Created/Modified
- `mobile-app/app/(app)/(tabs)/motos/index.tsx` - Added `useRef`/`useFocusEffect` imports, `isFirstFocus` ref guard, and a post-mount `useFocusEffect` that calls `load()` silently on every subsequent focus.
- `mobile-app/app/(app)/(tabs)/devis/index.tsx` - Same guarded `useFocusEffect` pattern added, plus a new `expo-router` import (screen previously had no expo-router dependency).

## Decisions Made
- Kept the existing mount `useEffect` untouched and layered a guarded `useFocusEffect` on top, rather than replacing the mount effect — this preserves Devis's spinner-toggle-in-the-wrapper behavior exactly as-is and confines the change to the minimal fix for the reported staleness bug.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Human Verification (Task 2)

Task 2 was a blocking `checkpoint:human-verify`. The user reproduced the exact UAT Test 4 scenario on-device:
1. Logged in as client `test@motokey.fr`, submitted a réclamation for the garage-stock Honda CB500F (plaque TEST-001, VIN JH2PC4008NK000099) — confirmed visible in "Mes réclamations" with statut "en attente".
2. Accepted the réclamation from a separate garage-app session (`app.html`).
3. Returned to the mobile app, navigated away from the Motos tab and back (no pull-to-refresh).

**Result: approved.** The claimed moto now appears in the Motos list automatically on tab-return, with no regression to initial load (no double spinner flash) and pull-to-refresh still working.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 15 (Feature-Parity Screens) is now fully complete — all 9 plans delivered, UAT Test 4 gap closed and confirmed on-device.
- Ready to proceed to Phase 16 (Push Wiring End-to-End).

---
*Phase: 15-feature-parity-screens*
*Completed: 2026-07-04*
