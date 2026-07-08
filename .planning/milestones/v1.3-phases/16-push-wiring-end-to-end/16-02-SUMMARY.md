---
phase: 16-push-wiring-end-to-end
plan: 02
subsystem: mobile-push
tags: [expo-notifications, react-native, jest, async-storage, expo-router, push-tokens]

# Dependency graph
requires:
  - phase: 12-backend-push-foundation
    provides: "POST/DELETE /client/device-tokens endpoints (live in prod)"
  - phase: 13-push-dispatch-service
    provides: "services/pushService.js sendPush/sendToToken"
  - phase: 14-rn-app-scaffolding-native-auth
    provides: "mobile-app/lib/api.ts apiFetch/apiPost, AuthContext session pattern"
  - phase: 15-feature-parity-screens
    provides: "mobile-app/lib/cache.ts AsyncStorage convention, Devis tab route at app/(app)/(tabs)/devis"
provides:
  - "lib/softAsk.ts: shown-once soft-ask gate (pure shouldShowSoftAsk + AsyncStorage-backed hasSeenSoftAsk/markSoftAskSeen)"
  - "lib/push.ts: registerForPushAsync / retryRegistrationIfGranted / unregisterPushAsync / getStoredPushToken device-token lifecycle"
  - "hooks/useNotificationObserver.ts: mapNotificationDataToRoute (pure) + useNotificationObserver() cold-start/runtime tap-to-navigate hook"
  - "expo-notifications ~0.32.17 dependency, wired into app.json plugins"
affects: [16-03-screens-and-wiring, 16-04-backend-envoyer-endpoint]

# Tech tracking
tech-stack:
  added: ["expo-notifications ~0.32.17"]
  patterns:
    - "Device-token lifecycle split into register (may prompt OS) vs retry (never re-prompts OS, D-08) vs unregister (logout hook, D-09) entry points, all funneling through a private completeRegistration() helper"
    - "Notification data -> route mapping kept as a pure exported function returning only statically-known literal route strings (required by app.json's typedRoutes experiment, not a raw data.type/url pass-through)"

key-files:
  created:
    - mobile-app/lib/softAsk.ts
    - mobile-app/lib/__tests__/softAsk.test.ts
    - mobile-app/lib/push.ts
    - mobile-app/lib/__tests__/push.test.ts
    - mobile-app/hooks/useNotificationObserver.ts
    - mobile-app/hooks/__tests__/useNotificationObserver.test.ts
  modified:
    - mobile-app/package.json
    - mobile-app/package-lock.json
    - mobile-app/app.json

key-decisions:
  - "Worktree branch was 37 commits behind master (missing all of Phase 15 mobile-app work, incl. lib/cache.ts referenced as a pattern to mirror) -- fast-forward merged master into the worktree branch before starting (0 divergent local commits on the worktree branch, so the merge was a safe fast-forward with no rebase/conflict risk)"
  - "STATE.md/ROADMAP.md/REQUIREMENTS.md updates applied against the shared main-checkout .planning/ (not the worktree's gitignored, non-synced copy), per the precedent set in Phase 13-02"

patterns-established:
  - "registerForPushAsync/retryRegistrationIfGranted/unregisterPushAsync as the canonical 3-entry-point shape for any future device-capability-gated register/retry/unregister logic"

requirements-completed: [MPUSH-01, MPUSH-02, MPUSH-05]

# Metrics
duration: 20min
completed: 2026-07-04
---

# Phase 16 Plan 02: Push Logic Modules (softAsk, push, notification routing) Summary

**Three unit-tested pure/testable modules (soft-ask gate, device-token register/retry/unregister, notification-tap route mapping) plus `expo-notifications` dependency, built interface-first ahead of any screen/wiring work in Plan 16-03.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 completed
- **Files modified:** 6 (3 created pairs: implementation + test, plus package.json/package-lock.json/app.json)

## Accomplishments
- `expo-notifications` installed at the SDK-54-correct version (`~0.32.17`, via `npx expo install`, not plain `npm install`) and wired into `app.json`'s plugins array
- `lib/softAsk.ts`: MPUSH-01's "shown once" soft-ask gate, AsyncStorage-backed with a pure decision function, 4 tests passing
- `lib/push.ts`: MPUSH-02's full device-token lifecycle (register/retry/unregister) against the already-live Phase 12 endpoints, with the D-08 "never re-prompt on foreground retry" guarantee both implemented and verifiably tested (grep confirms exactly one `requestPermissionsAsync` call site, inside `registerForPushAsync` only), 9 tests passing
- `hooks/useNotificationObserver.ts`: MPUSH-05's notification-tap → route mapping, kept as a pure function returning only the one known-safe literal route (`/(app)/(tabs)/devis`) to respect `app.json`'s `typedRoutes` experiment, plus the cold-start/runtime-tap hook itself (not unit-tested directly, by design — no `@testing-library/react-hooks` in this repo), 4 tests passing
- Full mobile jest suite green (11 suites, 121 tests) and `tsc --noEmit` clean after all three additions

## Task Commits

Each task was committed atomically:

1. **Task 1: expo-notifications dependency + lib/softAsk.ts (MPUSH-01)** - `07357bf` (feat)
2. **Task 2: lib/push.ts — register/retry/unregister device token logic (MPUSH-02)** - `86a997c` (feat)
3. **Task 3: hooks/useNotificationObserver.ts — tap-to-navigate redirect mapping (MPUSH-05)** - `3dcb11d` (feat)

_Note: implementation + its test file were committed together per task (matches this repo's established Phase 14/15 commit convention — single feat commit per task, not split RED/GREEN commits)._

## Files Created/Modified
- `mobile-app/lib/softAsk.ts` - `hasSeenSoftAsk`/`markSoftAskSeen` (AsyncStorage) + `shouldShowSoftAsk` (pure)
- `mobile-app/lib/__tests__/softAsk.test.ts` - 4 tests
- `mobile-app/lib/push.ts` - `registerForPushAsync`/`retryRegistrationIfGranted`/`unregisterPushAsync`/`getStoredPushToken`
- `mobile-app/lib/__tests__/push.test.ts` - 9 tests, mocks `expo-notifications`/`expo-device`/`expo-constants`/`../api`
- `mobile-app/hooks/useNotificationObserver.ts` - `mapNotificationDataToRoute` (pure) + `useNotificationObserver()` hook
- `mobile-app/hooks/__tests__/useNotificationObserver.test.ts` - 4 tests on the pure mapping function
- `mobile-app/package.json` / `mobile-app/package-lock.json` - `expo-notifications ~0.32.17` added
- `mobile-app/app.json` - `expo-notifications` appended to `plugins`

## Decisions Made
- Followed the plan's provided code verbatim for all three modules (no design changes needed) — the plan's `<action>` blocks were already fully-specified implementations, not just guidance
- Committed implementation + test file together per task, matching this repo's established single-commit-per-task convention observed in Phase 14/15 git history, rather than splitting into separate RED/GREEN commits

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branch was 37 commits behind master, missing Phase 15's mobile-app work**
- **Found during:** Pre-task setup, before Task 1
- **Issue:** The assigned worktree (`agent-ae136981618ce0984`) was still at the pre-Phase-15 fork point. `mobile-app/lib/cache.ts` — explicitly required reading as a pattern reference in Task 1's `<read_first>` — did not exist in the worktree, nor did the Devis tab route (`app/(app)/(tabs)/devis/index.tsx`) needed to confirm Task 3's route string. Continuing would have meant guessing at conventions the plan assumed were directly readable.
- **Fix:** Confirmed the worktree branch had zero commits of its own beyond the master merge-base (`git log --oneline HEAD ^master` empty), then ran `git merge master --ff-only` — a safe, lossless fast-forward (no rebase, no conflict risk, no local work discarded).
- **Files modified:** None directly (merge brought in 38 files of pre-existing Phase 15 work, no new edits)
- **Verification:** Post-merge, `mobile-app/lib/cache.ts` and `app/(app)/(tabs)/devis/index.tsx` both present; `npx jest` full suite green before starting new work
- **Committed in:** N/A (merge commit `bcbb979`, already on master, fast-forwarded — no new commit created by the merge itself)

**2. [Rule 3 - Blocking] mobile-app node_modules was never installed in the fresh worktree**
- **Found during:** Task 1, `npx expo install expo-notifications`
- **Issue:** `npx expo install` failed with `ConfigError: Cannot determine the project's Expo SDK version because the module 'expo' is not installed` — the worktree's `mobile-app/node_modules` had never been populated
- **Fix:** Ran `npm install` in `mobile-app/` first, then re-ran `npx expo install expo-notifications` successfully
- **Files modified:** `mobile-app/package-lock.json` (dependency tree materialized), no source changes
- **Verification:** `grep -n "expo-notifications" package.json` confirms `~0.32.17` installed
- **Committed in:** `07357bf` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking setup issues, no scope creep — no application code was changed beyond what the plan specified)
**Impact on plan:** Both fixes were prerequisite environment/branch state repairs, not functional changes. All three tasks then executed exactly as the plan's `<action>` blocks specified.

## Issues Encountered
None beyond the two deviations documented above.

## User Setup Required
None - no external service configuration required. `expo-notifications` requires no additional native config beyond the `app.json` plugin entry already added; EAS project setup (needed for `Constants.expoConfig.extra.eas.projectId` to be non-null) remains a known pre-existing gap (Pitfall 2, `completeRegistration` fails silently without it) — not part of this plan's scope, tracked implicitly by whichever plan first needs a real EAS build.

## Next Phase Readiness
- `lib/softAsk.ts`, `lib/push.ts`, `hooks/useNotificationObserver.ts` are all ready for Plan 16-03 to consume directly (screens + `AuthContext` wiring + mounting `useNotificationObserver()` in `app/(app)/_layout.tsx`) with zero further exploration needed
- No blockers for 16-03 or 16-04 introduced by this plan
- Reminder for 16-03: `useNotificationObserver()` must be mounted only inside `app/(app)/_layout.tsx`, not the root `_layout.tsx` (documented in the hook's own comment, per RESEARCH.md's cold-start anti-pattern)

---
*Phase: 16-push-wiring-end-to-end*
*Completed: 2026-07-04*

## Self-Check: PASSED

All 6 created files verified present on disk. All 3 task commit hashes (07357bf, 86a997c, 3dcb11d) verified present in git log.
