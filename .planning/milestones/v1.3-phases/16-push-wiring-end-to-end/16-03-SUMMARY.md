---
phase: 16-push-wiring-end-to-end
plan: 03
subsystem: mobile-push
tags: [expo-notifications, expo-router, react-native, async-storage, push-tokens]

# Dependency graph
requires:
  - phase: 16-push-wiring-end-to-end (16-02)
    provides: "lib/softAsk.ts, lib/push.ts, hooks/useNotificationObserver.ts pure/testable modules"
  - phase: 14-rn-app-scaffolding-native-auth
    provides: "AuthContext.tsx session pattern, app/_layout.tsx RootNav gating, useAuth() hook"
  - phase: 15-feature-parity-screens
    provides: "3-tab shell ((app)/(tabs)), Compte tab placeholder, Button/Logo/Toast components"
provides:
  - "mobile-app/app/(app)/soft-ask.tsx: full-screen branded soft-ask screen (Accept -> registerForPushAsync, Decline -> markSoftAskSeen only)"
  - "AuthContext.logout() unregisters the device's push token (D-09) before clearing the session"
  - "app/_layout.tsx RootNav routes newly-authenticated users through soft-ask exactly once (D-04), gated on hasSeenSoftAsk()"
  - "mobile-app/hooks/usePushRegistrationRetry.ts: AppState-foreground-triggered silent retry (D-08), never re-prompts the OS"
  - "app/(app)/_layout.tsx mounts useNotificationObserver() (MPUSH-05) + usePushRegistrationRetry() at the authenticated route-group boundary"
  - "Compte tab: 'Activer les notifications' re-entry point (D-06) + __DEV__-only local test-notification trigger for manual MPUSH-05 verification"
affects: [16-04-backend-envoyer-endpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Soft-ask screen never blocks navigation on registration outcome — accept always proceeds to tabs, registration failure is silent + deferred to usePushRegistrationRetry's next-foreground retry (D-08)"
    - "Push-token unregister-on-logout is fail-open (.catch(() => {})) so a dead/offline backend never blocks the logout flow itself"

key-files:
  created:
    - mobile-app/app/(app)/soft-ask.tsx
    - mobile-app/hooks/usePushRegistrationRetry.ts
  modified:
    - mobile-app/context/AuthContext.tsx
    - mobile-app/app/_layout.tsx
    - mobile-app/app/(app)/_layout.tsx
    - mobile-app/app/(app)/(tabs)/compte.tsx

key-decisions:
  - "mobile-app/node_modules had never been installed in this worktree (package.json/package-lock.json arrived via the master fast-forward merge, but npm install was never run) -- ran `npm install --legacy-peer-deps` before any tsc/jest verification could execute"
  - "Left a 3-line package-lock.json metadata diff (devOptional -> dev flag, cosmetic npm-version artifact from the local install) unstaged/uncommitted -- not part of this plan's actual dependency changes"

patterns-established:
  - "Soft-ask / retry / unregister three-entry-point wiring pattern: screen-level accept (may prompt OS) vs AppState-foreground retry (never prompts OS) vs logout unregister (fail-open) — mirrors the Plan 16-02 lib/push.ts module shape one layer up into real screens/hooks"

requirements-completed: [MPUSH-01, MPUSH-02, MPUSH-05]

# Metrics
duration: ~12min
completed: 2026-07-05
---

# Phase 16 Plan 03: Push Wiring — Screens & Lifecycle Hooks Summary

**Full-screen branded soft-ask (Accept/Decline), logout push-unregister, cold-start/login soft-ask redirect gating, AppState-foreground silent retry, notification-tap observer mounted at the authenticated route boundary, and a Compte-tab re-entry point + dev-only local test-notification trigger — the complete user-facing wiring on top of Plan 16-02's pure logic modules.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-05T03:38:00Z (approx, from first task commit)
- **Completed:** 2026-07-05T03:41:00Z
- **Tasks:** 3 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `mobile-app/app/(app)/soft-ask.tsx`: full-screen, MotoKey-branded soft-ask (mirrors `login.tsx`'s layout convention) — both Accept and Decline mark the seen flag before navigating away, so the prompt never reappears regardless of the user's choice
- `AuthContext.logout()` now calls `unregisterPushAsync(s.accessToken)` before `apiPost('/auth/client/logout', ...)` and `clearSession()`, fail-open via `.catch(() => {})` so a failed unregister never blocks logout (D-09)
- `app/_layout.tsx`'s `RootNav` effect now awaits `hasSeenSoftAsk()` on the authenticated-and-in-auth-group transition and routes to `/(app)/soft-ask` (unseen) or `/(app)/(tabs)/motos` (seen) — covers both a fresh login and a cold-start session restore, since both resolve through the same branch (D-04)
- `mobile-app/hooks/usePushRegistrationRetry.ts`: new hook, attempts `retryRegistrationIfGranted` once on mount plus on every `AppState` transition to `'active'` — never calls `registerForPushAsync`, so it can never trigger a second OS permission prompt (D-08)
- `app/(app)/_layout.tsx` now mounts both `useNotificationObserver()` (MPUSH-05 tap-to-navigate) and `usePushRegistrationRetry()` at the `(app)` route-group boundary — the correct mount point per Plan 16-02's own hook-header warning (root layout is too early; Devis tab route doesn't exist yet and there's no guaranteed session)
- Compte tab gained a "Activer les notifications" ghost button (`router.push('/(app)/soft-ask')`, D-06 re-entry) and a `__DEV__`-gated "Tester notification (dev)" button that schedules a local notification with `data: { type: 'devis_recu' }` two seconds out — makes MPUSH-05's tap-to-navigate verifiable today in Expo Go, without a development build
- Full verification suite green: `npx tsc --noEmit` exits 0, `npm test` — 11 suites / 121 tests passed, no regressions to Phase 14/15 tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Soft-ask screen (MPUSH-01, D-04/D-05)** - `c8f31b0` (feat)
2. **Task 2: AuthContext logout unregister (D-09) + root layout soft-ask redirect gating (D-04)** - `1f03df8` (feat)
3. **Task 3: Mount notification observer + foreground retry hook + Compte tab entry point (D-06, D-08, MPUSH-05)** - `6ac8c63` (feat)

_Note: implementation code matched the plan's fully-specified `<action>` blocks verbatim for all three tasks — no design deviation, single feat commit per task per this repo's established convention._

## Files Created/Modified
- `mobile-app/app/(app)/soft-ask.tsx` - Full-screen soft-ask, Accept (register + toast) / Decline (mark seen only)
- `mobile-app/hooks/usePushRegistrationRetry.ts` - AppState-foreground silent retry hook (D-08)
- `mobile-app/context/AuthContext.tsx` - `logout()` now unregisters the push token before clearing the session (D-09)
- `mobile-app/app/_layout.tsx` - `RootNav` gates the authenticated redirect on `hasSeenSoftAsk()` (D-04)
- `mobile-app/app/(app)/_layout.tsx` - Mounts `useNotificationObserver()` + `usePushRegistrationRetry()`
- `mobile-app/app/(app)/(tabs)/compte.tsx` - Adds "Activer les notifications" entry point + `__DEV__` test-notification trigger

## Decisions Made
- Followed the plan's provided code verbatim for all three tasks — no design changes needed, the `<action>` blocks were already fully-specified implementations
- `npm install --legacy-peer-deps` run once at the start of the plan (see Deviations) rather than per-task, since it's a one-time environment fix, not part of any single task's deliverable

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] mobile-app node_modules was never installed in this worktree**
- **Found during:** Pre-task setup, first `npx tsc --noEmit` attempt for Task 1's verification step
- **Issue:** `npx tsc --noEmit` failed with npx's "this is not the tsc command you are looking for" — `mobile-app/node_modules` did not exist at all in this freshly-fast-forward-merged worktree (package.json/package-lock.json arrived via the master merge, but `npm install` had never been run against them here)
- **Fix:** Ran `npm install --legacy-peer-deps` in `mobile-app/` (matches the `--legacy-peer-deps` convention already established in Phase 14-01's SUMMARY for this same peer-dependency-conflict-prone dependency tree)
- **Files modified:** `mobile-app/package-lock.json` (3-line cosmetic `devOptional`→`dev` flag diff from the local npm-version install; left unstaged/uncommitted as it reflects no actual dependency change)
- **Verification:** `npx tsc --noEmit` and `npm test` (11 suites, 121 tests) both ran clean immediately after
- **Committed in:** N/A (no source change; the lockfile cosmetic diff is intentionally left uncommitted, not part of this plan's tracked changes)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking environment setup, no scope creep — no application code changed beyond what the plan specified)
**Impact on plan:** Pure environment prerequisite fix. All three tasks then executed exactly as the plan's `<action>` blocks specified, with both automated verification commands (`tsc --noEmit`, `npm test`) passing after every task.

## Issues Encountered
None beyond the one deviation documented above.

## User Setup Required
None - no external service configuration required. Manual on-device verification of the full soft-ask → accept → notification-tap → Devis-tab flow is explicitly deferred to Plan 16-04's human-verify checkpoint, per this plan's own `<verification>` section.

## Next Phase Readiness
- All MPUSH-01/02/05 user-facing wiring is code-complete and unit/type-verified; nothing further needed from 16-03 for Plan 16-04 to build its backend `envoyer` endpoint wiring against
- Plan 16-04's checkpoint is the first point real on-device verification of this plan's flows (soft-ask screen appearance, Accept granting OS permission + registering, logout deregistering, Compte tab retry, and the dev-only local test-notification tap navigating to Devis) needs to happen
- No blockers introduced by this plan

---
*Phase: 16-push-wiring-end-to-end*
*Completed: 2026-07-05*

## Self-Check: PASSED

All 6 created/modified files verified present on disk. All 3 task commit hashes (c8f31b0, 1f03df8, 6ac8c63) verified present in git log.
