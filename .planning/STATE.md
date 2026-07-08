---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: App Client Mobile
status: verifying
stopped_at: Phase 17 context gathered
last_updated: "2026-07-05T22:16:20.881Z"
last_activity: 2026-07-05
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 25
  completed_plans: 21
  percent: 81
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Phase 17 — maintenance-alert-cron-app-store-submission

## Current Position

Phase: 17
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-07-05

Progress: [████████░░] 81%

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
| Next action | `/gsd:plan-phase 17` (Maintenance Alert Cron + App Store Submission) |
| Phase 08-stripe-live-mode | ⏸️ PARKED — 08-01 ✅, 08-02 bloqué op humaine — known gap, indépendant de v1.3 |
| Phase 12 P01 | 8min | 2 tasks | 2 files |
| Phase 12 P02 | 25min | 4 tasks | 1 files |
| Phase 13 P01 | 10min | 3 tasks | 5 files |
| Phase 13 P02 | ~70min | 3 tasks | 2 files |
| Phase 14 P01 | 20min | 3 tasks | 11 files |
| Phase 14 P02 | 15min | 2 tasks | 4 files |
| Phase 14 P03 | 20min | 3 tasks | 15 files |
| Phase 14 P04 | ~45min | 2 tasks | 3 files |
| Phase 15 P01 | 20min | 2 tasks | 6 files |
| Phase 15 P02 | ~15min | 2 tasks | 4 files |
| Phase 15 P03 | 20min | 2 tasks | 6 files |
| Phase 15 P04 | 25min | 3 tasks | 6 files |
| Phase 15 P05 | ~25min | 2 tasks | 2 files |
| Phase 15 P06 | ~20min | 1 task | 1 files |
| Phase 15 P07 | ~20min | 2 tasks | 2 files |
| Phase 15 P08 | ~20min | 2 tasks | 2 files |
| Phase 15 P09 | ~15min | 2 tasks | 2 files |
| Phase 16 P02 | 20min | 3 tasks | 6 files |
| Phase 16 P01 | 55min | 3 tasks | 4 files |
| Phase 16 P03 | 12min | 3 tasks | 6 files |

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
- [Phase 15]: [Phase 15-01]: All motoDisplay/motoParse/devisDisplay label/color/parse logic ported verbatim from MotoKey_Client.html; every list parser unwraps the REAL two-level backend envelope (data?.data?.<key>) before flatter fallbacks; parseAlertes returns null (not []) on 403 so CLIENT role hides the Plan d'entretien section
- [Phase 15]: [Phase 15-02]: cache.ts shouldServeCache gates offline fallback to status===0 only (never 401/403/500); garageLiaison.ts parseLimite/parseReclamations/parseGarages unwrap the REAL two-level backend envelope (data?.data?.<key>) with flat-shape fallback, guarded by dedicated REAL-envelope test fixtures
- [Phase 15]: [Phase 15-03]: Navigation shell restructured — 3-tab bottom bar (Motos/Devis/Compte), nested Stack inside Motos tab for list→detail drill-down, root redirect now targets `/(app)/(tabs)/motos` instead of the deleted Phase 14 placeholder Home; Wave 3 screens (15-05..08) render inside this shell
- [Phase 15]: [Phase 15-04]: Six shared presentational components (ScoreBadge/StatutBadge/EmptyState/OfflineBanner/MotoListCard/RevokeGarageModal) built under mobile-app/components/, wired to Wave 1 (motoDisplay/motoParse/cache) — RevokeGarageModal's destructive confirm is a standalone Pressable (Button has no destructive variant), StatutBadge stays generic (label+color props, callers own statut->color mapping)
- [Phase 15]: [Phase 15-05]: Motos tab list (FlatList+RefreshControl, per-moto enrichment via interventions+alertes, AsyncStorage cache fallback gated on shouldServeCache(status===0)) + Fiche Moto detail (historique interventions, plan d'entretien rendered only when alertes && alertes.length > 0 — 403-hides-section discipline, pneumatiques); confirmed this plan resolves the transient typed-routes tsc gap by creating motos/index.tsx + motos/[id].tsx
- [Phase 15]: [Phase 15-06]: Devis tab (FlatList) ports loadClientDevis/acceptDevis/refuseDevis — statut pill, inline line-item breakdown, total TTC, Accepter/Refuser behind Alert.alert confirms, read-only AsyncStorage cache fallback + OfflineBanner
- [Phase 15]: [Phase 15-07]: Ajouter une moto (plan-limit gate via parseLimite + Passer Pro CTA on 402) and Réclamer une moto (VIN+plaque via validateClaim/buildClaimPayload, photo input disabled per D-02, no Cloudinary) forms built under mobile-app/app/(app)/(tabs)/motos/{add,claim}.tsx
- [Phase 15]: [Phase 15-08]: Réclamations + Garages list screens ported verbatim from MotoKey_Client.html's loadClientReclamationsTab/loadClientGaragesTab/openRevokeModal/submitRevoke; reused garageLiaison.ts parsers + devisDisplay.ts label/color lookups + RevokeGarageModal (15-04) with no adaptation needed
- [Phase 15]: [Phase 15-09]: Guarded useFocusEffect (isFirstFocus ref) added to Motos + Devis tabs closes UAT Test 4 gap — accepted réclamations / out-of-band devis changes now surface on tab-return without a manual pull-to-refresh; confirmed via on-device reproduction 2026-07-04
- [Phase 16]: [Phase 16-02]: Worktree branch was 37 commits behind master (missing all of Phase 15's mobile-app work incl. cache.ts) -- fast-forward merged master into the worktree branch (0 divergent local commits, safe) before starting, then copied 16-*.md plan/context docs from the main checkout into the worktree's .planning/ for reference
- [Phase 16]: [Phase 16-02]: lib/push.ts + lib/softAsk.ts + hooks/useNotificationObserver.ts built exactly per plan; registerForPushAsync/retryRegistrationIfGranted/unregisterPushAsync fully unit-tested against mocked expo-notifications/expo-device/expo-constants/api, D-08 no-reprompt guarantee verified by grep (exactly 1 requestPermissionsAsync call site)
- [Phase 16]: [Phase 16-01]: Reconciled devis schema drift — live prod devis table is a denormalized snapshot schema (embedded lignes jsonb, NOT NULL client_nom/entite_facturation_id, persisted total_ht/tva/ttc), not the devis+devis_lignes two-table schema the plan assumed. Re-ran PostgREST OpenAPI introspection to get authoritative schema, rewrote supabase.js Devis object entirely (list/getById/create/update/valider/_calcTotaux), verified brouillon->envoye transition + PUT lock guard end-to-end via curl against live prod.
- [Phase 16]: [Phase 16-03]: Soft-ask screen (Accept/Decline both mark seen flag before nav), AuthContext.logout() unregisters push token before clearSession (D-09, fail-open), RootNav gates authenticated redirect on hasSeenSoftAsk() (D-04), usePushRegistrationRetry hook (AppState foreground, never re-prompts OS, D-08) + useNotificationObserver mounted at (app)/_layout.tsx boundary, Compte tab retry entry point + __DEV__ local test-notification trigger for MPUSH-05 manual verification
- [Phase 16]: [Phase 16-03]: worktree mobile-app/node_modules was never installed after the master fast-forward merge (package.json/lock arrived via merge, npm install never run) -- ran npm install --legacy-peer-deps before tsc/jest verification could execute; left a cosmetic 3-line package-lock.json devOptional->dev flag diff unstaged
- [Phase 16]: [Phase 16-04]: Discovered 51 local commits (all of 16-01/16-02/16-03) had never been pushed to origin/master -- Railway prod was serving pre-Phase-16 code, causing an initial 404 on POST /devis/:id/envoyer. Pushed origin master (commit 7f6dc86), waited for Railway redeploy, then confirmed full curl smoke test (envoyer transition, PUT lock, no-double-send) against live prod. Full mobile jest suite (121/121) and tsc --noEmit both clean.
- [Phase 16]: [Phase 16-04]: Task 2 human-verify checkpoint passed on-device (all 8 steps) 2026-07-05, run over Expo Go via `npx expo start --tunnel`. Step 7 initially crashed with `TypeError: The trigger object you provided is invalid` — `compte.tsx`'s __DEV__ test-notification button used an untyped `trigger: { seconds: 2 } as any`, which masked a real SDK-54 breaking change: `NotificationTriggerInput` is now a discriminated union requiring an explicit `type` tag. Fixed to `{ type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 }` (shape confirmed from the installed package's own `Notifications.types.d.ts`, per mobile-app/AGENTS.md's "Expo HAS CHANGED" rule, not from memory). Re-verified tsc clean + jest 121/121 + step 7 passing after the fix. Phase 16 is now genuinely complete — MPUSH-01/05 fully proven on-device, MPUSH-02/03 real-device token/delivery explicitly deferred to Phase 17 EAS setup per the 2026-07-04 planning decision.
- [Phase 17]: Fixed a genuine Unmatched Route bug on first real EAS dev-client cold launch: app/(auth)/_layout.tsx had no initialRouteName among its 4 files, and app/_layout.tsx's root Stack had no default for the bare / path either (no app/index.tsx existed). Added unstable_settings.initialRouteName='login' to (auth)/_layout.tsx (09a6bcd) plus a new app/index.tsx redirecting to /(auth)/login (a042055). Never caught before since all prior testing went through Expo Go, which never hit a truly blank cold-launch state.

### Pending Todos

- **[Phase 17-04] Task 2 (Firebase project + FCM V1 credentials + Android dev build) paused at human-action checkpoint.** Task 1 (Expo account + `eas login`/`eas init`) is complete — `mobile-app/app.json` has `owner: "motokey"` + `extra.eas.projectId: "f81c1373-4d65-428c-b6ca-ae231da7b41b"` (commit `b990c2f`). `eas-cli` is installed (`npx eas-cli` works, v20.5.1) and still logged in as `r4yjin` (with access to the `motokey` team account). `eas.json` already has an installable `development` Android profile (from Plan 03). Blocked on: (1) create a free Firebase project at console.firebase.google.com, add an Android app with package `com.motokey.app`, download `google-services.json` into `mobile-app/`; (2) generate an FCM V1 service-account key and upload it to EAS credentials; (3) then `eas build --profile development --platform android` and install on a real device. None of these are automatable — no `google-services.json` exists on disk yet and `app.json` has no `googleServicesFile` reference.
- **[Phase 13→17] SC-1 real device push delivery — DEFERRED again, now to Phase 17 (EAS development build setup).** `sendToToken`/`sendPush` in `services/pushService.js` have never been confirmed to deliver a visible remote notification to a real device — Expo Go dropped remote push support in SDK 53, so this requires an EAS dev build (no `eas.json`/`projectId`/Expo account login exist yet in this repo). Originally targeted for Phase 15, then Phase 16 — both closed without it per explicit Mehdi decisions, since local notifications (MPUSH-05, confirmed 2026-07-05) cover everything achievable without EAS. To close: set up EAS project in Phase 17, then run `PUSH_ENABLED=true node scripts/test-push.js <real-ExponentPushToken>` against a real device token and confirm the notification banner appears. SC-2/SC-3/SC-4 already confirmed — only SC-1 (real delivery) is open.
- **[Phase 14] Real email delivery (Resend) still untested end-to-end.** OTP codes for register/reset were confirmed via the console.log fallback, not a real inbox — pre-existing gap, tracked in PROJECT.md "À faire" (`RESEND_API_KEY` + `EMAIL_ENABLED=true` on Railway).

### Blockers/Concerns

- Phase 8 / BILL-06 (Stripe live mode) reste un known gap séparé, bloqué sur action humaine Mehdi (Stripe Dashboard) — sans impact sur l'exécution de v1.3
- Recherche flag : `expo-server-sdk` API exacte (envoi + receipts) à vérifier avant Phase 13 ; endpoint garage-side réclamation à localiser avant Phase 16 ; primitive cron Railway à confirmer avant Phase 17
- Phase 12-02 Task 4: migration 16 (client_device_tokens) non appliquee en prod Supabase Dashboard -- POST/DELETE /client/device-tokens verifies code-correct via curl direct avec un vrai access_token Supabase mais renvoient 'relation does not exist' tant que la migration n'est pas executee. GET /client/me fonctionne deja end-to-end en prod.
- Phase 13-02: SC-1 (real device push delivery) deferred — see Pending Todos above. Migration 17 (push_send_log) IS applied to prod Supabase (with FK-drift reconciled in the migration file, no functional impact).
- Windows-only Node libuv teardown crash (`UV_HANDLE_CLOSING` assertion) after any local script that calls Supabase then `process.exit()` — pre-existing (reproduces with Phase 9 code too), confirmed not a Phase 13 regression, won't occur on Railway (Linux). Details: `.planning/phases/13-push-dispatch-service/deferred-items.md`. No action needed.
- Phase 14-01: 14-01-SUMMARY.md is missing from .planning/phases/14-rn-app-scaffolding-native-auth/ on the main checkout -- written in the 14-01 worktree but .planning/phases/ is gitignored, so it never merged in. Progress counters (STATE.md completed_plans, ROADMAP.md Phase 14 summary_count) undercount by 1 plan as a result. No functional impact on 14-01 shipped code (already merged via b9af9fd) -- cosmetic/tracking gap only.
- Phase 14-04: MAUTH-03 (proactive foreground refresh after long background) -- RESOLVED 2026-07-08: real device background/foreground pass confirmed `POST /auth/client/refresh 200` fired at the foreground moment (Railway HTTP logs), followed by successful `/motos`/`/devis` calls, no visible "Session expirée" toast. See `.planning/phases/14-rn-app-scaffolding-native-auth/14-VERIFICATION.md` truth #3.
- Phase 15-03 (post-Wave-1-merge): `npx tsc --noEmit` briefly failed on `app/_layout.tsx`'s `router.replace('/(app)/(tabs)/motos')` because Expo Router's typed-routes doesn't consider a directory a navigable `Href` until it has an `index.tsx` — RESOLVED by 15-05 (creates `motos/index.tsx` + `motos/[id].tsx`); confirmed `tsc --noEmit` fully clean afterward. No action needed.
- Phase 15 parallel worktrees repeatedly branch from a stale `.planning/` snapshot (gitignored, not synced across worktree branches) and each independently mutate the shared STATE.md/ROADMAP.md/REQUIREMENTS.md docs — every wave merge back to master needed manual reconciliation of progress counters and requirement checkboxes (regressions occurred at Wave 1→2 boundary: an off-by-one completed_plans count, and MPARITY-03 flipping back to Pending). Fully reconciled as of Phase 15 completion (all 8 plans, all 5 MPARITY reqs, progress counters correct). Worth automating for future phases (e.g. computing progress/requirements from actual plan SUMMARY files at merge time instead of trusting each worktree's local edit).
- ~~Phase 16-04 frontmatter counter discrepancy~~ → **RESOLVED 2026-07-05**: Task 2's checkpoint passed, `16-04-SUMMARY.md` finalized to `status: complete`, so the frontmatter counters (completed_phases=5, completed_plans=17) are now accurate, not just coincidentally matching. Noting for future reference: `gsd-tools` computes these counters purely from SUMMARY.md file *count* vs PLAN.md count on disk, with no awareness of a SUMMARY's own in-progress status marker — worth remembering if a future phase ends on a blocking checkpoint again.

## Session Continuity

Last session: 2026-07-05T10:44:00.202Z
Stopped at: Phase 17 context gathered
Resume file: .planning/phases/17-maintenance-alert-cron-app-store-submission/17-CONTEXT.md
