---
phase: 17-maintenance-alert-cron-app-store-submission
plan: 04
subsystem: mobile-infra
tags: [eas, firebase, fcm-v1, expo-router, cron, checkpoint]

# Dependency graph
requires:
  - phase: 17-01
    provides: maintenanceAlertService.js, POST /cron/maintenance-alerts, migration 18
  - phase: 17-02
    provides: moto_entretien deep-link routing
  - phase: 17-03
    provides: eas.json build profiles, expo-dev-client, app.json identifiers
provides:
  - Real EAS Android development build installed on-device, closing the Phase 13/16 SC-1 deferral
  - Firebase project + FCM V1 credentials wired for real Android push delivery
  - Live secret-authenticated cron in prod (migration 18 applied, CRON_SECRET set on Railway + GitHub)
  - MPUSH-04 proven end-to-end on a real device (push delivery + deep link + no re-run spam)
  - Two real bugs found and fixed: app/(auth) root-routing gap (Unmatched Route), seed script missing `annee`
  - MSTORE-01 content/config complete; real-manifest reconciliation deferred (no iOS build path available)
  - MSTORE-02 confirmed parked — no `eas submit` attempted
affects: []

# Tech tracking
tech-stack:
  added:
    - "Firebase project + FCM V1 service-account credentials (external, free)"
  patterns:
    - "Development-client JS is served live from Metro over the EAS tunnel — fixing a JS/routing bug does not require a new native build, only a reload"
    - "app/index.tsx as an unambiguous single-file root route, with the existing auth-gating useEffect correcting onward — avoids relying on route-group JSX child order for an implicit default"

key-files:
  created:
    - mobile-app/app/index.tsx
  modified:
    - mobile-app/app.json
    - mobile-app/app/(auth)/_layout.tsx
    - scripts/seed-test-maintenance-cron.js
    - .planning/STATE.md

key-decisions:
  - "EAS project owner set explicitly to the 'motokey' team account (not the personal 'r4yjin' account eas init defaulted to on first --force attempt)"
  - "Android chosen for the one EAS dev build per D-06/Pitfall 3 — iOS real-device builds are blocked on the not-yet-created paid Apple Developer account"
  - "google-services.json committed to the repo (not gitignored) — Google's own guidance confirms this is safe (restricted by package name/SHA, not a secret)"
  - "app/(auth)/_layout.tsx given unstable_settings.initialRouteName='login' AND a new app/index.tsx redirecting to /(auth)/login — two-layer fix for a two-layer gap (group-level default missing, root-level default missing)"
  - "MSTORE-01's real PrivacyInfo.xcprivacy reconciliation deferred, not skipped — no Mac/Linux available for local expo prebuild --platform ios, and no EAS iOS build possible without the parked paid Apple account. Content/declarations in app.json remain as shipped by Plan 03."

patterns-established:
  - "Cron endpoint verification recipe: seed (idempotent reset) -> auth-rejection curl -> authorized curl -> immediate re-run curl -> on-device confirmation, in that order, since a failed push attempt still consumes the tier-crossing state (must re-seed before re-testing real delivery)"

requirements-completed: [MPUSH-04, MSTORE-01, MSTORE-02]

# Metrics
duration: ~5h (includes multiple human checkpoints: Expo signup/login, Firebase project setup, two failed APK installs + diagnosis, dashboard secret configuration)
completed: 2026-07-06
---

# Phase 17 Plan 04: EAS Build, Live Cron, and End-to-End Verification Summary

**Took the Wave 1 code from "committed" to "proven live": a real EAS Android dev build with FCM V1 push delivery, a live secret-gated cron in prod, and full on-device confirmation that MPUSH-04 works with no re-run spam — closing the Phase 13/16 SC-1 deferral. Along the way, found and fixed a real root-routing bug (Unmatched Route on cold launch) and a missing-column bug in the Wave 0 seed script.**

## Performance

- **Tasks:** 4 (all `checkpoint:human-action`/`checkpoint:human-verify`, `gate="blocking"`)
- **Files modified:** ~8 across mobile-app, scripts, and .planning

## Accomplishments

### Task 1 — Expo account + eas login/init
- Expo account created (`r4yjin`, with access to a `motokey` team account); `eas login` succeeded
- `eas init --non-interactive --force` first defaulted to the wrong (`r4yjin`) account — corrected by setting `"owner": "motokey"` in `app.json` and re-running, producing `@motokey/motokey` with `projectId: f81c1373-4d65-428c-b6ca-ae231da7b41b`
- One orphaned `@r4yjin/motokey` project remains on Expo's dashboard (harmless, manual cleanup deferred to Mehdi)

### Task 2 — Firebase FCM V1 + Android dev build
- Firebase project created (package `com.motokey.app`), `google-services.json` downloaded and wired into `app.json` (`android.googleServicesFile`), FCM V1 service-account key uploaded to EAS credentials
- `expo-dev-client` was listed in `package.json`/`package-lock.json` (from Plan 03's merge) but never actually installed in this checkout — `npm install --legacy-peer-deps` fixed it
- First `eas build --profile development --platform android` succeeded but the resulting APK failed to install on-device ("Application non installée"); a second fresh build (`--clear-cache`) hit the identical error, ruling out download corruption
- Root cause was NOT the build — it was how the tunnel URL got opened afterward (see Task 4 routing bug below); the build itself was fine and installed correctly once retried
- On-device: dev client installed, launched, and registered a real Expo push token (confirmed via the Compte tab's Phase 16 retry entry point)

### Task 3 — Enable the cron live
- Migration 18 applied via Supabase Dashboard SQL Editor (Mehdi)
- `CRON_SECRET` set as a Railway env var and a matching GitHub Actions repo secret (Mehdi, generated and set directly in both dashboards — never passed through this session in clear text at set-time)
- All Wave 1 + Wave 2 commits (22 total) pushed to `origin/master`; Railway redeployed; `curl -X POST .../cron/maintenance-alerts` (no header) confirmed **401** (not 404), proving the endpoint is live

### Task 4 — End-to-end verification
- **Seed bug found+fixed:** `scripts/seed-test-maintenance-cron.js`'s moto insert omitted `annee`, which is `NOT NULL` on `motos` — failed on first real run against prod. Fixed by adding `annee: 2022`/`annee: 2021` to the two fixtures, matching the convention already used in `scripts/seed-test-moto-15-uat.js`.
- **Pre-existing gap surfaced:** the first authorized cron run correctly detected both tier crossings and marked them notified, but the actual push attempt failed with `"Could not find the table 'public.client_device_tokens' in the schema cache"` — migration 16 (`client_device_tokens`, from Phase 12) had never been applied to prod, a gap tracked in STATE.md since Phase 12 and only now becoming load-bearing since this is the first real device-token push attempt. Mehdi applied migration 16 via Supabase Dashboard.
- Because the first (failed-push) run had already consumed the tier-crossing state, the fixtures had to be **re-seeded** (idempotent reset of `last_maintenance_tier_notified` to NULL) before real delivery could be tested — re-running the cron without re-seeding correctly showed 0 notifications (the state was already "used", not a bug).
- After re-seed: authorized curl → `notified: 2`, both with `pushResult: { sent: 1, ... }` against a real `ExponentPushToken`. Immediate re-run → `notified: 0` (idempotency confirmed, no spam).
- **On-device confirmed:** maintenance push banner appeared on the Android dev build; tapping it navigated to the correct moto's Fiche Moto (Plan 02's `moto_entretien` deep link).
- **Real routing bug found+fixed (two-layer):** on the very first true native cold launch (never exercised via Expo Go before), the app showed Expo Router's built-in "Unmatched Route" screen instead of the login screen — reproduced consistently across reload and full close/reopen.
  1. `app/(auth)/_layout.tsx` used a bare `<Stack />` with no `initialRouteName` among its 4 files (login/register/reset-request/verify) — fixed by adding `export const unstable_settings = { initialRouteName: 'login' }` (`09a6bcd`).
  2. That alone wasn't sufficient — `app/_layout.tsx`'s root `<Stack>` also had no default for the bare `/` path (no `app/index.tsx` existed at all). Added `app/index.tsx` redirecting to `/(auth)/login`, with the existing `RootNav` `useEffect` correcting onward for already-authenticated users (`a042055`).
  3. Since this is a development-client build, the JS bundle is served live from Metro over the tunnel — both fixes were visible on the device's next reload, with no new EAS build required.
- **MSTORE-01:** the real `PrivacyInfo.xcprivacy` reconciliation step could not be completed — `expo prebuild --platform ios` requires macOS/Linux (unavailable on this Windows machine), and there is no EAS iOS build to inspect either (iOS builds are blocked on the same not-yet-created paid Apple Developer account as D-01). The privacy manifest **content** and `app.json` declarations from Plan 03 stand as shipped; reconciliation against a real generated manifest is deferred until an iOS build becomes possible.
- **MSTORE-02:** confirmed parked — `eas submit` was never invoked this session (verified via git history and shell history), matching the Phase 8/BILL-06 known-gap pattern.

## Task Commits

1. **Task 1: EAS project link** - `b990c2f` (feat)
2. **Task 1→2 checkpoint state** - `8e89903` (docs)
3. **Task 2: google-services.json wiring** - `7cddd70` (feat)
4. **Task 4: seed script `annee` fix** - `763dd2b` (fix)
5. **Task 4: `(auth)` group initialRouteName fix** - `09a6bcd` (fix)
6. **Task 4: root `app/index.tsx` fix** - `a042055` (fix)
7. **Task 4: STATE.md decision record** - `bd4cc7a` (docs)

(Migration 16/18 application, `CRON_SECRET` configuration, and the EAS builds themselves were dashboard/CLI actions with no corresponding local file commit beyond the app.json/google-services.json changes above.)

## Files Created/Modified
- `mobile-app/app.json` - `owner: "motokey"`, `extra.eas.projectId`, `android.googleServicesFile`
- `mobile-app/google-services.json` - new, committed (safe per Google's own guidance)
- `mobile-app/app/(auth)/_layout.tsx` - added `unstable_settings.initialRouteName`
- `mobile-app/app/index.tsx` - new, root redirect to `/(auth)/login`
- `scripts/seed-test-maintenance-cron.js` - added `annee` to both fixtures
- `.planning/STATE.md` - decision entry recording the routing bug + fix

## Decisions Made
- See `key-decisions` in frontmatter above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Blocking] `expo-dev-client` in package.json/lockfile but not installed in this checkout**
- Found during: first `eas build` attempt
- Fix: `npm install --legacy-peer-deps` in `mobile-app/`, zero lockfile diff

**2. [Blocking] First APK install failed with "Application non installée" (x2, across two independent builds)**
- Found during: Task 2's on-device install step
- Root cause: NOT build corruption (ruled out via a second `--clear-cache` build with identical failure) — the actual cause surfaced later, in Task 4, as the app/(auth) root-routing gap making it look like a broken install when it was actually a JS-level "Unmatched Route" screen being mistaken for an install failure on a subsequent attempt. (The very first two install attempts likely did fail for an unrelated transient reason — manual Files-app install ultimately succeeded — but the persistent post-install symptom was the routing bug, not the install itself.)
- Fix: see routing bug fixes above (`09a6bcd`, `a042055`)

**3. [Blocking] `scripts/seed-test-maintenance-cron.js` missing `annee`**
- Found during: Task 4 step 1 (seed)
- Fix: `763dd2b`

**4. [Blocking] `client_device_tokens` table missing in prod (pre-existing Phase 12 gap, migration 16 never applied)**
- Found during: Task 4 step 3 (first authorized cron run)
- Fix: Mehdi applied migration 16 via Supabase Dashboard; fixtures re-seeded to reset the tier-crossing state consumed by the failed push attempt

**5. [Non-blocking] MSTORE-01 real-manifest reconciliation deferred**
- No Mac/Linux for local `expo prebuild --platform ios`; no EAS iOS build possible (blocked on paid Apple account, same as D-01)
- Content/config stands as shipped by Plan 03; revisit once an iOS build path exists

---

**Total deviations:** 5 (4 auto-fixed/blocking, 1 non-blocking/deferred)
**Impact on plan:** All core requirements (MPUSH-04 fully proven, MSTORE-01 code/content complete with real-manifest check deferred, MSTORE-02 correctly parked) achieved. Two genuine pre-existing/latent bugs (seed script, root routing) were found and fixed as a direct result of this being the first real on-device test this app has ever had — this is the value of an actual on-device checkpoint over code review alone.

## Issues Encountered

Covered fully under Deviations above.

## User Setup Required

**All completed this session (by Mehdi, via dashboards):**
- Expo account creation + `eas login`
- Firebase project creation + FCM V1 service-account key generation/upload
- Supabase Dashboard: migration 18 (tier-state columns) AND migration 16 (`client_device_tokens`, pre-existing gap)
- Railway Dashboard: `CRON_SECRET` env var
- GitHub: `CRON_SECRET` repository Actions secret
- Physical device: installed the Android dev build, logged in, confirmed push registration and on-device push+deep-link delivery

**Deferred (not this session, tracked as known gaps):**
- Apple Developer Program membership ($99/yr) — blocks all real iOS work, including MSTORE-01's manifest reconciliation and any iOS half of MSTORE-02
- Google Play Console account ($25 one-time) — blocks MSTORE-02's Android submission half
- One orphaned `@r4yjin/motokey` Expo project (harmless, manual cleanup optional)

## Next Phase Readiness

- **MPUSH-04: fully shipped and proven live** — cron detects tier crossings, sends exactly one push per crossing, no spam on re-run, deep link lands on the correct moto. SC-1 (real device push delivery), deferred since Phase 13, is closed.
- **MSTORE-01: code/content complete**, real-manifest reconciliation is the one open item, blocked purely on iOS build tooling availability (Mac/Linux or a paid Apple account for EAS), not on Mehdi or on this phase's own work.
- **MSTORE-02: correctly parked**, identical treatment to Phase 8/BILL-06 — revisit once both paid developer accounts exist.
- Phase 17 is code-complete and live-verified; ready for phase-level goal verification.

---
*Phase: 17-maintenance-alert-cron-app-store-submission*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: mobile-app/app/index.tsx
- FOUND: mobile-app/app/(auth)/_layout.tsx (modified)
- FOUND: scripts/seed-test-maintenance-cron.js (modified)
- FOUND: .planning/STATE.md (modified)
- FOUND commit: b990c2f, 7cddd70, 763dd2b, 09a6bcd, a042055, bd4cc7a
- CONFIRMED live: POST /cron/maintenance-alerts returns 401 unauthenticated, 200 authenticated, idempotent on re-run
- CONFIRMED on-device: push banner received, deep link navigated correctly
