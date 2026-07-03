---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: App Client Mobile
status: verifying
stopped_at: Completed 14-04-PLAN.md
last_updated: "2026-07-03T11:28:03.954Z"
last_activity: 2026-07-03
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 0
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Phase 14 — rn-app-scaffolding-native-auth

## Current Position

Phase: 14 (rn-app-scaffolding-native-auth) — EXECUTING
Plan: 4 of 4
Status: Phase complete — ready for verification
Last activity: 2026-07-03

Progress: [░░░░░░░░░░] 0%

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward, séparé de v1.3)
v1.3 [░░░░░░░░░░] ROADMAP READY — App Client Mobile (React Native), Phases 12-17
     Phase 8 (Stripe live mode) ⏸️ PARKED — séparé/indépendant, hors scope v1.3
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 3 (v1.0 + v1.1 + v1.2) |
| v1.3 phases | 6 (Phases 12→17), 0 complétées |
| v1.3 requirements | 15 total, 15/15 mappés au roadmap, 0 shippés |
| Next action | `/gsd:plan-phase 12` (Backend Push Foundation) |
| Phase 08-stripe-live-mode | ⏸️ PARKED — 08-01 ✅, 08-02 bloqué op humaine — known gap, indépendant de v1.3 |
| Phase 12 P01 | 8min | 2 tasks | 2 files |
| Phase 12 P02 | 25min | 4 tasks | 1 files |
| Phase 13 P01 | 10min | 3 tasks | 5 files |
| Phase 13 P02 | ~70min | 3 tasks | 2 files |
| Phase 14 P01 | 20min | 3 tasks | 11 files |
| Phase 14 P02 | 15min | 2 tasks | 4 files |
| Phase 14 P03 | 20min | 3 tasks | 15 files |
| Phase 14 P04 | ~45min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Décisions complètes dans PROJECT.md Key Decisions. Récentes affectant v1.3 :

- App native React Native (Expo managed workflow, pas PWA) dans `/mobile-app`, même repo — pas de changement backend/web hors nouvelle surface push
- Auth Supabase existante réutilisée telle quelle (headers `x-client-type` déjà différenciés web/non-web) — aucun nouveau backend auth
- Backend push (Phases 12-13) découplé de l'app RN — curl-testable avant tout code mobile, dérisque l'infra indépendamment
- Phase 8 (Stripe live mode) explicitement gardée hors scope v1.3, reprise dans une milestone future
- [Phase 12]: client_id FK (not auth_user_id) on client_device_tokens per CONTEXT.md D-01; UNIQUE(token) alone enables upsert-reassign per D-02
- [Phase 12]: Phase 12-02: isExpoPushToken() + POST/DELETE /client/device-tokens + GET /client/me added to motokey-api.js; onConflict:'token' upsert-reassign per D-02; DELETE reads body locally (no shared dispatch whitelist change)
- [Phase 12]: Task 4 (automated live smoke test) explicitly skipped by user decision at checkpoint; manual verification (200/400/401 confirmed against live Supabase) accepted as sufficient for Tasks 1-3 code correctness
- [Phase 13]: Phase 13-01: push_send_log idempotency table + PushSendLog helper mirror billing_events pattern; scripts/test-push.js locks sendToToken/sendPush call contract for Plan 02
- [Phase 13]: Phase 13-01: worktree .planning/ snapshots can go stale (gitignored, not synced across worktree branches) — STATE.md/ROADMAP.md/SUMMARY.md updates applied against the shared main-checkout .planning/ instead
- [Phase 13]: Phase 13-02: services/pushService.js ships sendToToken + sendPush (client fan-out) against expo-server-sdk, mirroring emailService.js (PUSH_ENABLED fallback) and stripeService.js (insert-first idempotency guard) conventions; per-token idempotency key suffix (`${key}::${token}`) prevents multi-device fan-out collapsing to one send
- [Phase 13]: Phase 13-02: migration 17 (push_send_log) applied to live Supabase with a schema drift — client_id FK to clients(id) dropped (broke the live ALTER TABLE apply, root cause not identified) — migration file reconciled to a plain nullable UUID, no functional impact (client_id is debugging-only, never joined/enforced by code)
- [Phase 13]: Phase 13-02: SC-1 (real device push delivery) explicitly DEFERRED by Mehdi's decision — no Expo Go / mobile device token exists yet (mobile app starts Phase 14). SC-2/SC-3/SC-4 confirmed (fallback, idempotency, invalid-token safety). This is the plan's own allowed resolution, not a gap requiring a dedicated closure phase — see Pending Todos below.
- [Phase 14]: [Phase 14-01]: Flattened Expo SDK 57's new src/app default template layout to root-level app/ so it matches every path plans 14-02/14-03/14-04 already commit to
- [Phase 14]: [Phase 14-01]: Pinned jest@^29.7.0 + @types/jest@^29 + @react-native/jest-preset@^0.86.0 (--legacy-peer-deps) to resolve jest-expo@57.0.0's internal ^29.2.1 jest-runtime deps conflicting with jest's latest 30.x tag and RN 0.86.0
- [Phase 14]: [Phase 14-02]: session.ts single-flight refresher uses a closure-scoped inFlight promise guard; AuthContext ports all six MotoKey_Client.html auth handlers verbatim with Alert.alert as interim hard-expiry notice pending 14-03's toast system
- [Phase 14]: [Phase 14-03]: theme/colors.ts locks MotoKey brand palette from MotoKey_Client.html :root; shared OtpCodeInput+verify.tsx mode=register|reset serves both OTP flows (D-01/D-04); AuthContext.onHardExpiry now uses showToast() instead of Alert.alert
- [Phase 14]: [Phase 14-04]: SDK 57->54 downgrade required to unblock device testing (Rule 3 - Blocking) — Tester's installed Expo Go only supports SDK 54; mobile-app was on SDK 57 and refused to load. Downgraded expo/react/react-native and all expo-managed deps to SDK54-compatible versions (verified against expo-template-default@54.0.62 + bundledNativeModules.json), dropped @react-native/jest-preset (unneeded by jest-expo@54). Verified clean via expo-doctor 18/18, tsc --noEmit, jest 20/20. Commit 1e31d6f.
- [Phase 14]: [Phase 14-04]: MAUTH-01/02 confirmed end-to-end on device; MAUTH-03 and real-email delivery remain open — Human verification confirmed register->OTP->Home, login, and password-reset->OTP->login (MAUTH-01) plus encrypted session persistence across app restart (MAUTH-02), against the live API. OTP codes retrieved via the documented console.log fallback (RESEND_API_KEY not yet configured on Railway) rather than a real email inbox -- pre-existing known gap, not new. MAUTH-03 (proactive foreground refresh after long background) was not exercised this session -- open item, needs a dedicated backgrounded-device pass before Phase 14's auth layer is considered fully hardened.
- [Phase 14]: [Phase 14-04]: Phase 13 SC-1 (real device push delivery) now explicitly targeted for Phase 15 — Previously an open-ended deferral ("once a device token exists"). Mehdi's decision during the 14-04 checkpoint: close it out specifically in Phase 15 rather than leave the timing open.

### Pending Todos

- **[Phase 13→15] SC-1 real device push delivery — DEFERRED to Phase 15 (explicit target, confirmed 2026-07-03).** `sendToToken`/`sendPush` in `services/pushService.js` have never been confirmed to deliver a visible notification to a real device. A real Expo Go device token now exists (mobile app is on Phase 14), but Mehdi explicitly chose to close this out in Phase 15 rather than as a side-verification during Phase 14. To close: run `PUSH_ENABLED=true node scripts/test-push.js <real-ExponentPushToken>` and confirm the notification banner appears. SC-2/SC-3/SC-4 are already confirmed — only SC-1 is open.
- **[Phase 14] MAUTH-03 proactive foreground refresh — not yet exercised on a real device.** The 14-04 human-verify checkpoint confirmed MAUTH-01 (register/login/reset) and MAUTH-02 (encrypted persistence) but not MAUTH-03. Needs a dedicated pass: background the app long enough for the access token to near/pass expiry (~5min, ideally ~1h), foreground it, confirm no visible "Session expirée" and the app keeps working.
- **[Phase 14] Real email delivery (Resend) still untested end-to-end.** OTP codes for register/reset were confirmed via the console.log fallback, not a real inbox — pre-existing gap, tracked in PROJECT.md "À faire" (`RESEND_API_KEY` + `EMAIL_ENABLED=true` on Railway).

### Blockers/Concerns

- Phase 8 / BILL-06 (Stripe live mode) reste un known gap séparé, bloqué sur action humaine Mehdi (Stripe Dashboard) — sans impact sur l'exécution de v1.3
- Recherche flag : `expo-server-sdk` API exacte (envoi + receipts) à vérifier avant Phase 13 ; endpoint garage-side réclamation à localiser avant Phase 16 ; primitive cron Railway à confirmer avant Phase 17
- Phase 12-02 Task 4: migration 16 (client_device_tokens) non appliquee en prod Supabase Dashboard -- POST/DELETE /client/device-tokens verifies code-correct via curl direct avec un vrai access_token Supabase mais renvoient 'relation does not exist' tant que la migration n'est pas executee. GET /client/me fonctionne deja end-to-end en prod.
- Phase 13-02: SC-1 (real device push delivery) deferred — see Pending Todos above. Migration 17 (push_send_log) IS applied to prod Supabase (with FK-drift reconciled in the migration file, no functional impact).
- Windows-only Node libuv teardown crash (`UV_HANDLE_CLOSING` assertion) after any local script that calls Supabase then `process.exit()` — pre-existing (reproduces with Phase 9 code too), confirmed not a Phase 13 regression, won't occur on Railway (Linux). Details: `.planning/phases/13-push-dispatch-service/deferred-items.md`. No action needed.
- Phase 14-01: 14-01-SUMMARY.md is missing from .planning/phases/14-rn-app-scaffolding-native-auth/ on the main checkout -- written in the 14-01 worktree but .planning/phases/ is gitignored, so it never merged in. Progress counters (STATE.md completed_plans, ROADMAP.md Phase 14 summary_count) undercount by 1 plan as a result. No functional impact on 14-01 shipped code (already merged via b9af9fd) -- cosmetic/tracking gap only.
- Phase 14-04: MAUTH-03 (proactive foreground refresh after long background) not yet exercised on a real device -- checkpoint confirmed checks 1-4 (register/login/reset/persistence) only. Needs a dedicated pass (background ~1h, foreground, confirm no visible session error) before Phase 14's auth layer is considered fully hardened. Not a bug -- untested.

## Session Continuity

Last session: 2026-07-03T11:28:03.950Z
Stopped at: Completed 14-04-PLAN.md
Resume file: None
