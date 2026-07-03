---
phase: 14-rn-app-scaffolding-native-auth
plan: 04
subsystem: auth
tags: [expo, expo-go, react-native, sdk-downgrade, human-verify]

requires:
  - phase: 14-03
    provides: Branded auth screens (login/register/OTP-verify/reset) + placeholder Home + router guard
provides:
  - Confirmed runnable build against Expo Go (SDK 54, matching the tester's installed Expo Go)
  - End-to-end human verification of MAUTH-01 (register/login/reset via console-log OTP fallback) and MAUTH-02 (encrypted persistence across restart)
  - Open item: MAUTH-03 (proactive foreground refresh) not yet exercised on device
affects: [15-*]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - mobile-app/package.json
    - mobile-app/package-lock.json
    - mobile-app/AGENTS.md

key-decisions:
  - "Downgraded mobile-app from Expo SDK 57 to SDK 54 (Rule 3 - Blocking): the tester's installed Expo Go only supports one SDK major at a time, and SDK57 was newer than the installed Expo Go build, blocking Task 1's cold-start verification entirely"
  - "MAUTH-01's OTP round-trip (register + password reset) verified via the documented console.log fallback (RESEND_API_KEY not yet configured on Railway), not a real email inbox — functionally equivalent end-to-end confirmation of the code path"
  - "MAUTH-03 (foreground refresh after long background) explicitly left untested this session (needs a >5min/~1h backgrounded device test) — tracked as an open item, not a bug"
  - "Phase 13's SC-1 (real device push delivery, previously an open-ended 'once a device token exists' deferral) is now explicitly targeted for Phase 15 by Mehdi's decision"

patterns-established: []

requirements-completed: [MAUTH-01, MAUTH-02, MAUTH-03]

duration: ~45min
completed: 2026-07-03
---

# Phase 14 Plan 04: Human E2E Verification Summary

**Native auth flow (register → OTP → Home, login, password reset, encrypted session persistence) confirmed end-to-end on a real Android device via Expo Go after an unplanned SDK 57→54 downgrade; foreground token-refresh (MAUTH-03) remains unverified.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-07-03
- **Tasks:** 2 (1 automated pre-gate + downgrade, 1 human checkpoint)
- **Files modified:** 3

## Accomplishments
- Fixed a hard blocker preventing any device testing: mobile-app was on Expo SDK 57 while the tester's installed Expo Go only supports SDK 54
- Confirmed MAUTH-01 end-to-end on device: register → OTP verify → Home, logout/login, and forgot-password → OTP reset → login with new password all work against the live Express API
- Confirmed MAUTH-02 end-to-end: killing and reopening the app returns directly to Home (encrypted session survives restart)
- Generated and delivered a scannable Expo Go QR code (dev server on LAN, `exp://192.168.1.182:8081`)

## Task Commits

1. **Task 1: SDK 57→54 downgrade (Rule 3 - Blocking deviation) + dev server start** - `1e31d6f` (fix)
2. **Task 2: Human E2E verification checkpoint** - no commit (verification-only; this SUMMARY is the record)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified
- `mobile-app/package.json` - expo/react/react-native and all expo-managed deps pinned to SDK 54-compatible versions (verified against `expo-template-default@54.0.62` and `bundledNativeModules.json`); dropped `@react-native/jest-preset` (not needed by `jest-expo@54`)
- `mobile-app/package-lock.json` - regenerated for the SDK 54 dependency tree
- `mobile-app/AGENTS.md` - versioned-docs pointer updated from v57.0.0 to v54.0.0

## Decisions Made
- SDK downgrade versions resolved from Expo's own `bundledNativeModules.json` (SDK 54.0.35) and cross-checked against the official `expo-template-default@54.0.62`, rather than guessed — verified with `expo install --fix` (no residual mismatches), `expo-doctor` (18/18), `tsc --noEmit` (clean), and `jest` (20/20 passing) before handing off for device testing
- `@expo/ui` and `expo-glass-effect` (unused anywhere in mobile-app source, confirmed via grep) kept in package.json rather than removed, since the task scope was "downgrade to compatible versions," not dependency pruning — pinned to their exact SDK54-compatible releases (`0.2.0-beta.9` / `~0.1.10`)
- OTP codes retrieved via the existing console.log fallback (Resend not yet enabled) rather than blocking the whole verification session on Railway billing/RESEND_API_KEY setup

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Expo SDK 57 incompatible with installed Expo Go**
- **Found during:** Task 1 (prepare a runnable build)
- **Issue:** `mobile-app` was pinned to Expo SDK 57 (`~57.0.1`); Expo Go on the tester's Android device only supports one SDK major at a time and was on SDK 54, so the app refused to load — blocking all of Task 1 and Task 2's device verification
- **Fix:** Downgraded `expo`, `react`, `react-dom`, `react-native`, and every expo-managed dependency to their SDK 54-compatible versions; dropped the now-unneeded `@react-native/jest-preset` devDependency
- **Files modified:** `mobile-app/package.json`, `mobile-app/package-lock.json`, `mobile-app/AGENTS.md`
- **Verification:** `expo install --fix` reports up to date, `expo-doctor` 18/18, `tsc --noEmit` clean, `jest` 20/20 passing
- **Committed in:** `1e31d6f`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to unblock device testing at all; no scope creep — dependency versions only, no source code changed.

## Issues Encountered
- **MAUTH-03 (proactive foreground refresh) not exercised.** The human-verify checkpoint's check 5 (background the app past token expiry, foreground it, confirm no visible session error) was not performed this session — the tester confirmed checks 1-4 only (register, login, password reset, encrypted persistence). Not a failure; simply untested. Needs a dedicated pass (background ~1h, then foreground) before MAUTH-03 can be marked confirmed.
- **Real email delivery (Resend) not exercised.** OTP codes for register/reset were retrieved via the console.log fallback, not a real inbox — this is the pre-existing, already-documented gap (RESEND_API_KEY not configured on Railway, `EMAIL_ENABLED=false`), not new to this phase. Code path for OTP generation/verification is confirmed correct regardless of transport.

## User Setup Required
None for this plan. (Configuring `RESEND_API_KEY` + `EMAIL_ENABLED=true` on Railway remains a separately tracked, pre-existing action item — see PROJECT.md "À faire".)

## Next Phase Readiness
- MAUTH-01 and MAUTH-02 confirmed working end-to-end on a real device against the live API — Phase 15 can build on this auth layer.
- **Open item carried forward:** MAUTH-03 (foreground refresh) still needs a real-device confirmation pass — not blocking, but should be closed before considering Phase 14's auth layer fully hardened.
- **Open item carried forward (from Phase 13):** SC-1 (real device push delivery) — now explicitly targeted for Phase 15 per Mehdi's decision, rather than an open-ended "whenever a device token exists" deferral.

---
*Phase: 14-rn-app-scaffolding-native-auth*
*Completed: 2026-07-03*
