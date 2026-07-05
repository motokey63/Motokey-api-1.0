---
phase: 17-maintenance-alert-cron-app-store-submission
plan: 02
subsystem: mobile-notifications
tags: [expo-router, expo-notifications, typed-routes, jest, tdd]

# Dependency graph
requires:
  - phase: 16-push-wiring-end-to-end
    provides: useNotificationObserver hook + mapNotificationDataToRoute pure mapper + devis_recu routing already mounted at app/(app)/_layout.tsx
provides:
  - moto_entretien notification data.type routes to the correct Fiche Moto via a typed-routes {pathname, params} object
  - Widened NotificationRoute union type (string literal | moto route object)
  - Unit test coverage locking the object-shape contract (motoId string coercion, missing-motoId guard)
affects: [17-04-eas-build-on-device-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure mapper function returns typed-routes object shape ({pathname, params}) rather than an interpolated string, so expo-router's typed-routes resolves the [id] dynamic segment"

key-files:
  created: []
  modified:
    - mobile-app/hooks/useNotificationObserver.ts
    - mobile-app/hooks/__tests__/useNotificationObserver.test.ts

key-decisions:
  - "Copied the exact {pathname, params} literal already used by motos/index.tsx's router.push call rather than inventing a new route shape"

patterns-established: []

requirements-completed: []  # MPUSH-04 partially addressed — this plan ships only the mobile deep-link routing half; the backend cron detection/send half (17-01) is required before MPUSH-04 can be marked fully complete in REQUIREMENTS.md

# Metrics
duration: 15min
completed: 2026-07-05
---

# Phase 17 Plan 02: Maintenance Alert Notification Routing Summary

**Extended the Phase 16 notification-tap router with a `moto_entretien` branch that deep-links to a moto's Fiche Moto via a typed-routes object, not a string interpolation.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `mapNotificationDataToRoute` now recognizes `{ type: 'moto_entretien', motoId }` push payloads and returns `{ pathname: '/(app)/(tabs)/motos/[id]', params: { id: String(motoId) } }`
- Guards on missing `motoId` (returns `null`, same as unknown types) and coerces numeric `motoId` to a string for `params.id`
- Existing `devis_recu` behavior and the `redirect()` call site (`router.push(route as any)`) are untouched — exactly one push call site remains
- 3 new unit tests added (7 total in the suite), all green; `tsc --noEmit` clean

## Task Commits

1. **Task 1 (RED): failing tests for moto_entretien mapping** - `939267f` (test)
2. **Task 1 (GREEN): implement moto_entretien routing branch** - `75502d6` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `mobile-app/hooks/useNotificationObserver.ts` - Widened `NotificationRoute` type to a union including the moto object shape; added the `moto_entretien` branch to `mapNotificationDataToRoute`
- `mobile-app/hooks/__tests__/useNotificationObserver.test.ts` - Added Tests 5-7 covering the object-shape mapping, missing-motoId guard, and numeric-to-string coercion

## Decisions Made
- Reused the literal `{ pathname: '/(app)/(tabs)/motos/[id]', params: { id } }` shape verbatim from `mobile-app/app/(app)/(tabs)/motos/index.tsx`'s existing `router.push` call, per the plan's Pitfall 5 guidance (interpolated strings don't resolve typed-routes dynamic segments).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing mobile-app node_modules**
- **Found during:** Task 1 (running `npx jest`/`npx tsc` before RED)
- **Issue:** This worktree's `mobile-app/node_modules` was never installed (package.json/lockfile arrived via a prior merge, `npm install` never run in this worktree) — `jest-expo` preset not found, blocking any test/tsc verification.
- **Fix:** Ran `npm install --legacy-peer-deps` in `mobile-app/` (same remediation pattern as Phase 16-03).
- **Files modified:** None tracked by git (node_modules is gitignored; `package-lock.json` had zero diff after install — `git status --short` clean).
- **Verification:** `npx tsc --noEmit` and `npx jest` both run cleanly afterward.
- **Committed in:** N/A (no file changes to commit — install only, lockfile unchanged)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to run any verification in this worktree; no scope creep, no files changed by the install itself.

## Issues Encountered
- Windows path separators broke jest's CLI pattern matching (`npx jest hooks/useNotificationObserver` reported "0 matches" due to backslash-vs-forward-slash testPathIgnorePatterns behavior on Windows). Worked around by invoking `npx jest -- __tests__/useNotificationObserver`, which matched correctly. No code or config change required — purely an invocation syntax issue for this Windows environment.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MPUSH-04's mobile routing half is complete and unit-verified. On-device tap-to-navigate verification (tapping a real `moto_entretien` push and confirming Fiche Moto opens) is deferred to Plan 04, which needs a real EAS development build and a real maintenance push from Plan 01's cron.
- Full mobile jest suite: 124/124 passing (was 121 before this plan). `tsc --noEmit` clean.

---
*Phase: 17-maintenance-alert-cron-app-store-submission*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: mobile-app/hooks/useNotificationObserver.ts
- FOUND: mobile-app/hooks/__tests__/useNotificationObserver.test.ts
- FOUND: .planning/phases/17-maintenance-alert-cron-app-store-submission/17-02-SUMMARY.md
- FOUND commit: 939267f (test)
- FOUND commit: 75502d6 (feat)
