---
phase: 17-maintenance-alert-cron-app-store-submission
plan: 03
subsystem: mobile-build-tooling
tags: [expo, eas, expo-dev-client, app-store, privacy-manifest, data-safety, mobile-app]

# Dependency graph
requires:
  - phase: 16-push-wiring-end-to-end
    provides: Client-side push registration (lib/push.ts) that reads extra.eas.projectId at runtime, and the SC-1 real-device-push deferral this phase's EAS work is meant to unblock
provides:
  - mobile-app/app.json with com.motokey.app bundle/package identifiers (D-03) and Apple ios.privacyManifests declarations
  - mobile-app/eas.json with development (developmentClient+internal), preview, and production build profiles
  - expo-dev-client dependency (SDK-54 pinned) required by developmentClient:true build profiles
  - Two ready-to-paste store compliance content docs (Apple App Privacy, Google Data Safety) written from the app's real, verified data inventory
affects: [17-04-eas-account-setup-and-dev-build, MSTORE-01, MSTORE-02]

# Tech tracking
tech-stack:
  added: [expo-dev-client@~6.0.21]
  patterns:
    - "Store submission content is written as reference docs (paste-in-ready) before any paid developer account exists, mirroring the Phase 8/BILL-06 known-gap pattern -- code/content groundwork is completed and only the account-gated action itself is parked"

key-files:
  created:
    - mobile-app/eas.json
    - .planning/phases/17-maintenance-alert-cron-app-store-submission/store-content/privacy-manifest-content.md
    - .planning/phases/17-maintenance-alert-cron-app-store-submission/store-content/data-safety-content.md
  modified:
    - mobile-app/app.json
    - mobile-app/package.json
    - mobile-app/package-lock.json

key-decisions:
  - "com.motokey.app used for both ios.bundleIdentifier and android.package (D-03, locked in CONTEXT.md)"
  - "extra.eas.projectId deliberately left unset -- populated by eas init in Plan 04, not this plan"
  - "android.googleServicesFile deliberately not added -- requires a Firebase project (Plan 04 human checkpoint), not code-only"
  - "Apple privacy manifest reason codes (CA92.1/C617.1/35F9.1/E174.1) are the standard RN/Expo required-reason API set per research -- flagged LOW confidence, must be reconciled against the real generated PrivacyInfo.xcprivacy from Plan 04's EAS build/prebuild before final App Store submission"

patterns-established:
  - "Store compliance content docs live under .planning/phases/17-.../store-content/, written in each platform's own fixed category taxonomy (Apple App Privacy vocabulary vs Google Data Safety vocabulary), not free-form prose"

requirements-completed: [MSTORE-01]

# Metrics
duration: ~15min
completed: 2026-07-05
---

# Phase 17 Plan 03: Store Submission Groundwork (app.json, eas.json, compliance content) Summary

**Mobile app configured for an EAS development build (com.motokey.app identifiers, Apple privacy manifest declarations, eas.json build profiles, expo-dev-client dependency) plus Apple App Privacy and Google Data Safety content written from the app's real data inventory — all account-free groundwork for MSTORE-01 completed ahead of Plan 04's account-gated checkpoints.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `mobile-app/app.json` now declares `com.motokey.app` for both `ios.bundleIdentifier` and `android.package`, plus `ios.privacyManifests.NSPrivacyAccessedAPITypes` with the standard RN/Expo required-reason API set — all existing keys (icon paths, plugins, `typedRoutes`, `reactCompiler`) preserved untouched.
- `mobile-app/eas.json` created with `development` (developmentClient:true, distribution:internal, Android APK), `preview` (internal Android APK), and `production` (autoIncrement) build profiles — matches the plan's exact schema, `cli.version` set to `>= 12.0.0` (installed `eas-cli` is 20.5.1, satisfies this).
- `expo-dev-client@~6.0.21` installed via `npx expo install expo-dev-client -- --legacy-peer-deps` (SDK-54-pinned, matching this repo's established install pattern) — required by the `developmentClient:true` profile.
- Two compliance content docs written under `.planning/phases/17-.../store-content/`: `privacy-manifest-content.md` (Apple App Store Connect App Privacy nutrition-label answers) and `data-safety-content.md` (Google Play Console Data Safety form answers), both mapping only the real data inventory (auth email, moto VIN/plaque/km/année/marque/modèle, client nom/email/tél, Expo push token) and explicitly declaring NO camera, location, payment, or analytics/tracking data collected.

## Task Commits

Each task was committed atomically (in the worktree branch `worktree-agent-a437be7bf4bff31e9`):

1. **Task 1: app.json — identifiers + Apple privacy manifests** - `39b159a` (feat)
2. **Task 2: eas.json build profiles + expo-dev-client dependency** - `c62e492` (feat)
3. **Task 3: Apple App Privacy + Google Data Safety content docs** - `5afe5e0` (docs)

## Files Created/Modified

- `mobile-app/app.json` - Added `ios.bundleIdentifier`/`android.package` = `com.motokey.app` and `ios.privacyManifests.NSPrivacyAccessedAPITypes` (4 standard required-reason API entries)
- `mobile-app/eas.json` - New file: development/preview/production EAS build profiles
- `mobile-app/package.json` / `mobile-app/package-lock.json` - Added `expo-dev-client` dependency
- `.planning/phases/17-maintenance-alert-cron-app-store-submission/store-content/privacy-manifest-content.md` - Apple App Privacy nutrition-label content (new)
- `.planning/phases/17-maintenance-alert-cron-app-store-submission/store-content/data-safety-content.md` - Google Play Data Safety form content (new)

## Decisions Made

- Followed the plan's locked D-03 identifier (`com.motokey.app` for both platforms) and D-02 scope split (content/code now, account-gated submission parked) exactly as specified — no deviation.
- `mobile-app/node_modules` was not present in this worktree (fresh worktree checkout never had `npm install` run) — ran `npm install --legacy-peer-deps` first (established repo pattern per Phase 16-03 precedent) before `npx expo install expo-dev-client`, so `tsc --noEmit` could actually execute for verification. This is routine environment setup, not a plan deviation.

## Deviations from Plan

None - plan executed exactly as written. The one procedural addition (running `npm install --legacy-peer-deps` before adding `expo-dev-client`) was required environment setup, not a change to plan scope, content, or acceptance criteria — all verification commands specified in the plan were run and passed unmodified.

## Issues Encountered

- This agent runs in an isolated git worktree; `.planning/` is gitignored and was not present under `.planning/phases/17-.../` in the worktree at start (only phases 14-16 were present, carried over from prior tracked SUMMARY.md commits). Per the established convention from Phase 13/16 (`.planning/ snapshots can go stale, gitignored, not synced across worktree branches`), the store-content docs and this SUMMARY.md were created directly in the worktree's own `.planning/` copy and force-added (`git add -f`) since the path is gitignored repo-wide — consistent with how `mobile-app/eas.json` and `app.json` changes were committed on this worktree's branch. STATE.md/ROADMAP.md updates for this plan are applied to this same worktree-local `.planning/` copy; reconciliation against the shared main checkout happens at merge time (same pattern noted in STATE.md's Blockers/Concerns for Phase 15's parallel worktrees).

## User Setup Required

None - no external service configuration required for this plan. (Plan 04 will require human checkpoints for `eas login`/Expo account creation, `eas init`, and Firebase project setup for FCM V1 — none of that is needed here.)

## Next Phase Readiness

- `mobile-app/app.json` and `mobile-app/eas.json` are ready for Plan 04's `eas login` → `eas init` → `eas build --profile development --platform android` flow — `extra.eas.projectId` is deliberately absent, to be populated by `eas init`.
- Both compliance content docs are ready to paste into App Store Connect / Play Console once Mehdi creates the respective paid developer accounts (D-01, still not created — tracked as a known gap, same treatment as Phase 8/BILL-06).
- Apple privacy manifest reason codes should be reconciled against the real generated `PrivacyInfo.xcprivacy` from Plan 04's build/prebuild output before final App Store submission (flagged LOW confidence by research, not blocking for this plan's own acceptance criteria).
- No blockers for Plan 04.

---
*Phase: 17-maintenance-alert-cron-app-store-submission*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created files verified present (mobile-app/app.json, mobile-app/eas.json, mobile-app/package.json, store-content/privacy-manifest-content.md, store-content/data-safety-content.md, 17-03-SUMMARY.md). All 3 task commits (39b159a, c62e492, 5afe5e0) verified present in git log.
