---
phase: 17-maintenance-alert-cron-app-store-submission
verified: 2026-07-06T00:00:00Z
status: human_needed
score: 3/4 truths verified (1 explicitly parked per project convention, not a code gap)
human_verification:
  - test: "Reconcile mobile-app/app.json's ios.privacyManifests.NSPrivacyAccessedAPITypes reason codes (CA92.1/C617.1/35F9.1/E174.1) against a REAL generated PrivacyInfo.xcprivacy"
    expected: "The declared required-reason API codes match exactly what an actual `expo prebuild --platform ios` (or EAS iOS build artifact) produces — codes were flagged LOW confidence by 17-RESEARCH.md and were never mechanically verified because no macOS/Linux machine or paid Apple Developer account was available in this environment"
    why_human: "Requires either a Mac/Linux host to run `expo prebuild --platform ios` locally, or an EAS iOS build (which itself requires the not-yet-created paid Apple Developer account) — neither is available in this Windows-only, no-paid-account environment"
  - test: "MSTORE-02 — submit the app to TestFlight (iOS) and the Google Play internal test track (Android), then validate a real install from each track"
    expected: "App installs and runs correctly from an actual TestFlight build and a Play Console internal-track build, closing MSTORE-02 before any public store listing"
    why_human: "Explicitly parked (17-CONTEXT.md D-01/D-02) — blocked on Mehdi creating two paid developer accounts (Apple $99/yr, Google $25 one-time). `eas submit` was never invoked this session, matching the established Phase 8/BILL-06 'known gap' pattern in this project. Not a code or planning gap — requires Mehdi's account creation + a follow-up submission pass."
---

# Phase 17: Maintenance Alert Cron + App Store Submission Verification Report

**Phase Goal:** Les utilisateurs sont alertés par push quand leur moto dépasse le seuil de révision, et l'app est prête et validée pour une soumission publique sur les stores.
**Verified:** 2026-07-06
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Quand une moto dépasse le seuil d'entretien (UX-02), son propriétaire reçoit une notification push une seule fois par dépassement — pas de spam au réexécution (MPUSH-04) | ✓ VERIFIED | `services/maintenanceAlertService.js` computes worst tier via `SBLayer.Entretien.getPlan` (no duplicated math), sends a push only on strict `TIER_RANK` increase, persists `last_maintenance_tier_notified` up/down. Live curl against prod this session (per 17-04-SUMMARY.md, re-confirmed structurally here): first authorized run → `notified: 2` with real `pushResult.sent: 1` against a genuine `ExponentPushToken`; immediate re-run → `notified: 0`. This verification's own fresh `curl -X POST https://motokey11-production.up.railway.app/cron/maintenance-alerts` (no header) returned `401`, confirming the endpoint is still live and secret-gated in prod. |
| 2 | Taper sur la notification de rappel entretien ouvre directement la fiche de la moto concernée | ✓ VERIFIED | `mobile-app/hooks/useNotificationObserver.ts` — `mapNotificationDataToRoute` has a `moto_entretien` branch returning `{ pathname: '/(app)/(tabs)/motos/[id]', params: { id: String(data.motoId) } }` (typed-routes object shape, not an interpolated string). 7/7 unit tests pass (`npx jest -- __tests__/useNotificationObserver`), including the two new moto_entretien cases and numeric-motoId coercion. `redirect()`'s single `router.push(route as any)` call site is unchanged. On-device tap-to-navigate confirmed per 17-04-SUMMARY.md. |
| 3 | L'app inclut un Privacy Manifest (Apple) et un formulaire Data Safety (Google) complets pour la soumission (MSTORE-01) | ✓ VERIFIED (content/code complete) — ⚠ one reconciliation step deferred | `mobile-app/app.json` declares `ios.bundleIdentifier`/`android.package` = `com.motokey.app` and `ios.privacyManifests.NSPrivacyAccessedAPITypes` (4 entries). `store-content/privacy-manifest-content.md` and `store-content/data-safety-content.md` exist, map the app's real (verified) data inventory in each platform's own taxonomy, and explicitly declare no camera/location/payment/tracking. The one open item — reconciling the declared reason codes against a REAL generated `PrivacyInfo.xcprivacy` — could not be completed in this environment (no macOS/Linux, no paid Apple account for an EAS iOS build) and is routed to human verification below, not treated as a code gap. |
| 4 | L'app a été validée via TestFlight et une piste de test interne Android avant toute soumission publique (MSTORE-02) | ⏸ PARKED (known gap, by design) | REQUIREMENTS.md itself marks MSTORE-02 as `[ ]` unchecked / "Pending" (line 35, 84) — this is the intended, documented outcome per `17-CONTEXT.md` D-01/D-02, mirroring the existing Phase 8/BILL-06 "known gap" pattern (ROADMAP.md marks Phase 8 as "⏸️ Parked (known gap)", a distinct status from failure). Blocked on Mehdi creating a paid Apple Developer account ($99/yr) and a Google Play Console account ($25 one-time). `eas submit` was never invoked (confirmed via git history in 17-04-SUMMARY.md). This is not a phase failure — it is explicitly out of this phase's controllable scope. |

**Score:** 3/4 truths fully verified; 1 explicitly and correctly parked per established project convention (not a code/planning gap).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `services/maintenanceAlertService.js` | `runMaintenanceAlertCron()` tier-crossing detection + push fan-out | ✓ VERIFIED | 94 lines, exports the function, calls `Entretien.getPlan` + `pushService.sendPush`, filters `.not('client_id','is',null)`, zero `requireRole` occurrences, idempotency key `maintenance-alert:${id}:${worst}:${date}` present. `node --check` clean. |
| `sql/migrations/18_motos_maintenance_alert_state.sql` | Tier-state columns on `motos` | ✓ VERIFIED | `ALTER TABLE motos ADD COLUMN last_maintenance_tier_notified ... CHECK (...) , ADD COLUMN last_maintenance_tier_notified_at TIMESTAMPTZ` present, plus a COMMENT ON COLUMN. Applied to prod per 17-04-SUMMARY.md (Mehdi, Supabase Dashboard). |
| `.github/workflows/maintenance-alerts.yml` | Daily scheduled curl to the cron endpoint | ✓ VERIFIED | `on.schedule` (06:00 UTC) + `workflow_dispatch`, calls `https://motokey11-production.up.railway.app/cron/maintenance-alerts` (correct prod URL, zero `motokey-api-10` references) with `X-Cron-Secret: ${{ secrets.CRON_SECRET }}`. |
| `scripts/test-maintenance-cron.js` / `scripts/seed-test-maintenance-cron.js` | Harness + seed fixtures | ✓ VERIFIED | Harness requires `runMaintenanceAlertCron`, never hard-fails. Seed script creates WARNING (Yamaha MT-07) + URGENT (Honda CB500) client-owned motos on VINs `MAINT-CRON-WARN-0001`/`MAINT-CRON-URG-0001`, uses `onConflict: 'moto_id,code_operation'`; the missing `annee` bug found during real on-device testing was fixed (commit `763dd2b`) and confirmed present in the current file (`annee: 2022`/`annee: 2021`). |
| `motokey-api.js` — `POST /cron/maintenance-alerts` | Secret-authenticated cron endpoint | ✓ VERIFIED | Route registered inside the `M()` router (line 567), header check `req.headers['x-cron-secret']` vs `process.env.CRON_SECRET`, fail-closed 401 when unset/mismatched, calls `maintenanceAlertService.runMaintenanceAlertCron()`. Live curl from this verification session confirms 401 without header against prod. |
| `mobile-app/hooks/useNotificationObserver.ts` | `moto_entretien` → Fiche Moto routing | ✓ VERIFIED | Widened `NotificationRoute` union + new branch returning the typed-routes object shape; `redirect()` call site untouched. |
| `mobile-app/hooks/__tests__/useNotificationObserver.test.ts` | Unit tests for the new mapping | ✓ VERIFIED | 7/7 tests pass (re-run in this verification session), including Tests 5-7 for `moto_entretien`. |
| `mobile-app/app.json` | `com.motokey.app` identifiers + privacy manifests + EAS projectId + googleServicesFile | ✓ VERIFIED | Both identifiers present, `ios.privacyManifests.NSPrivacyAccessedAPITypes` (4 entries), `extra.eas.projectId: f81c1373-4d65-428c-b6ca-ae231da7b41b`, `android.googleServicesFile: "./google-services.json"`, `owner: "motokey"`. |
| `mobile-app/eas.json` | development/preview/production build profiles | ✓ VERIFIED | `development.developmentClient: true` + `distribution: "internal"` + `android.buildType: "apk"`; preview + production profiles also present. |
| `mobile-app/google-services.json` | Firebase FCM V1 config | ✓ VERIFIED | File exists on disk (671 bytes), referenced from `app.json`. |
| `store-content/privacy-manifest-content.md`, `store-content/data-safety-content.md` | Apple/Google compliance content | ✓ VERIFIED | Both exist, use each platform's structured vocabulary ("Used to Track You?", "Data safety"), explicitly declare no camera/location/payment/tracking data, cite Stripe for web-only billing. |
| `mobile-app/app/index.tsx`, `mobile-app/app/(auth)/_layout.tsx` | Real-device routing-bug fix (found during 17-04 checkpoint) | ✓ VERIFIED | `app/index.tsx` redirects to `/(auth)/login`; `(auth)/_layout.tsx` declares `unstable_settings.initialRouteName = 'login'`. Commits `09a6bcd`/`a042055` present in git log. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `services/maintenanceAlertService.js` | `supabase.js Entretien.getPlan` | direct function call | ✓ WIRED | `SBLayer.Entretien.getPlan(moto.id, moto.km \|\| 0)` called directly, no HTTP hop, no re-implementation of pct/tier math. |
| `services/maintenanceAlertService.js` | `services/pushService.js sendPush` | per-moto push fan-out with idempotency key | ✓ WIRED | `pushService.sendPush(moto.client_id, {...copy, data:{type:'moto_entretien', motoId: moto.id}}, idempotencyKey)` called only on strict rank increase. |
| `motokey-api.js` | `services/maintenanceAlertService.js` | `POST /cron/maintenance-alerts` secret-header route | ✓ WIRED | Route requires `require('./services/maintenanceAlertService')` (line 82) and calls `runMaintenanceAlertCron()` (line 573) inside the handler. |
| `mobile-app/hooks/useNotificationObserver.ts` | `mobile-app/app/(app)/(tabs)/motos/[id].tsx` | `router.push({ pathname: '/(app)/(tabs)/motos/[id]', params: { id } })` | ✓ WIRED | Literal pathname matches the existing working pattern in `motos/index.tsx`; confirmed on-device (per 17-04-SUMMARY.md) that tapping the push opened the correct moto's Fiche Moto. |
| `mobile-app/eas.json` | `mobile-app/package.json expo-dev-client` | `developmentClient: true` requires the package | ✓ WIRED | `expo-dev-client@~6.0.21` present in `package.json` dependencies. |
| GitHub Actions secret + Railway `CRON_SECRET` | `POST /cron/maintenance-alerts` | matching `X-Cron-Secret` header | ✓ WIRED | Confirmed live in prod per 17-04-SUMMARY.md (Mehdi set both dashboards) and by this verification's fresh 401-without-header curl proving the endpoint is deployed and gated. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `maintenanceAlertService.runMaintenanceAlertCron()` | `motos` query result | `SBLayer.supabase.from('motos').select(...).not('client_id','is',null)` — real Supabase query, not a static return | Yes — proven this session with real prod data (2 real motos, real tier crossings, real Expo push tokens, `pushResult.sent: 1`) | ✓ FLOWING |
| `mapNotificationDataToRoute` | `data.motoId` from push payload | Populated server-side by `maintenanceAlertService.js`'s `data: { type: 'moto_entretien', motoId: moto.id }` | Yes — real moto UUID from the DB query, not a placeholder | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Cron endpoint is live and secret-gated in prod | `curl -s -o /dev/null -w "%{http_code}" -X POST https://motokey11-production.up.railway.app/cron/maintenance-alerts` | `401` | ✓ PASS |
| Node syntax valid for modified backend files | `node --check motokey-api.js && node --check services/maintenanceAlertService.js` | exits 0 | ✓ PASS |
| Mobile unit tests for the new routing branch | `cd mobile-app && npx jest -- __tests__/useNotificationObserver` | 7/7 passing | ✓ PASS |
| MPUSH-04 full on-device loop (seed → 401 → 200 notified:2 → re-run notified:0 → push banner → tap → correct Fiche Moto) | (performed in-session per 17-04-SUMMARY.md; not re-run destructively in this verification pass to avoid mutating prod tier state) | Documented pass in 17-04-SUMMARY.md, corroborated by the still-live 401 check above | ✓ PASS (not re-executed — would require re-seeding + consuming real push sends) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MPUSH-04 | 17-01, 17-02, 17-04 | Push notification quand la moto dépasse le seuil de révision (réutilise UX-02), avec deep link | ✓ SATISFIED | Backend cron (17-01) + mobile deep-link (17-02) both code-verified above; end-to-end proof on a real device (17-04) per SUMMARY, corroborated by this session's live 401 recheck. REQUIREMENTS.md checkbox `[x]`. |
| MSTORE-01 | 17-03, 17-04 | Privacy Manifest (Apple) + Data Safety (Google) | ✓ SATISFIED (content/config complete) | `app.json` + two content docs verified above. REQUIREMENTS.md checkbox `[x]`. One follow-up item (real-manifest reconciliation) routed to human verification — does not block the requirement's own text ("l'app respecte les exigences ... pour la première soumission" — the declarations exist and are content-complete). |
| MSTORE-02 | 17-04 | Validation TestFlight / piste interne Android avant soumission publique | ⏸ PARKED (correctly, by design) | REQUIREMENTS.md checkbox `[ ]` / "Pending" — this is the expected state per D-01/D-02, not an omission. No orphaned requirement — it is explicitly claimed by 17-04's `requirements` frontmatter and explicitly resolved as "parked" in its SUMMARY, mirroring the project's own established Phase 8/BILL-06 precedent. |

No orphaned requirements found — MPUSH-04, MSTORE-01, MSTORE-02 all appear in at least one plan's `requirements:` frontmatter field and are all accounted for above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODO/FIXME/placeholder/stub patterns found in any of the 8 files modified across the 4 plans (`services/maintenanceAlertService.js`, `motokey-api.js` cron route, `mobile-app/hooks/useNotificationObserver.ts`, `mobile-app/app/index.tsx`, `mobile-app/app/(auth)/_layout.tsx`, `scripts/seed-test-maintenance-cron.js`, `scripts/test-maintenance-cron.js`) | ℹ️ Info | None — clean scan |
| `.planning/ROADMAP.md` | 179 | Progress table row still reads "Phase 17 \| v1.3 \| 3/4 \| In Progress \| -" while the same file's Phase 17 checklist (line 59) and all 4 plan checkboxes (lines 138-... equivalent) already show `[x]` complete | ℹ️ Info | Documentation staleness only — the progress summary table was not updated after 17-04 finished. Does not affect code or goal achievement; flagged for bookkeeping only. |
| `.planning/REQUIREMENTS.md` | 81 | Traceability row for MPUSH-04 still says "live smoke test deferred to 17-04 pending manual Supabase/Railway/GitHub setup" | ℹ️ Info | Stale — 17-04 has since completed and proven the live smoke test end-to-end. Documentation-only, not a code gap. |
| `.planning/STATE.md` | 6, 24 | `stopped_at: Phase 17 context gathered` / `Current focus: Phase 17` | ℹ️ Info | Stale bookkeeping predating the 4 plans' completion; does not affect verification of the actual code/goal. |

No blocker or warning-severity anti-patterns found in the code itself.

### Human Verification Required

### 1. Reconcile Apple privacy manifest against a real generated manifest

**Test:** Once a macOS/Linux machine or a paid Apple Developer account is available, run `npx expo prebuild --platform ios` (or inspect an EAS iOS build's artifacts) and compare the resulting `PrivacyInfo.xcprivacy`'s `NSPrivacyAccessedAPITypes` entries against `mobile-app/app.json`'s currently-declared codes (`CA92.1`, `C617.1`, `35F9.1`, `E174.1`).
**Expected:** The declared codes match the real generated manifest exactly (add/remove entries in `app.json` if the real output differs).
**Why human:** No macOS/Linux machine and no paid Apple Developer account exist in the current environment — this is an infrastructure/account gate, not a code defect. Explicitly documented as deferred (not skipped) in `17-04-SUMMARY.md`.

### 2. MSTORE-02 — actual store submission

**Test:** After Mehdi creates an Apple Developer Program membership ($99/yr) and a Google Play Console account ($25 one-time), run the account-gated flow: upload the store-content docs, run `eas submit` (or manual TestFlight/Play Console upload) for both platforms, and confirm a real install from each internal test track.
**Expected:** App installs and functions correctly from a real TestFlight build and a real Play Console internal-track build.
**Why human:** Requires purchasing/creating two paid external accounts — cannot be automated or completed by Claude. Explicitly parked per `17-CONTEXT.md` D-01/D-02, matching this project's established Phase 8/BILL-06 "known gap" precedent (see `.planning/ROADMAP.md` line 61: Phase 8 marked "⏸️ Parked (known gap)", not a failure).

### Gaps Summary

No code gaps were found. All artifacts for MPUSH-04 and MSTORE-01 exist, are substantive (no stubs/placeholders), are correctly wired end-to-end, and were proven live against real prod data and a real Android device this session (re-confirmed structurally and via one fresh live curl in this verification pass). The only two open items — reconciling the iOS privacy manifest against a real generated file, and the actual TestFlight/Play internal-track submission (MSTORE-02) — are both blocked on external account/environment gates outside the codebase (no Mac/Linux, no paid Apple/Google developer accounts), not on missing or broken code. This matches the project's own established precedent for handling account-gated phase segments (Phase 8/BILL-06), where the segment is explicitly parked rather than treated as a phase failure. Overall status is `human_needed` rather than `gaps_found` because closing these items requires Mehdi's account/environment actions, not further code changes or replanning.

---

*Verified: 2026-07-06*
*Verifier: Claude (gsd-verifier)*
