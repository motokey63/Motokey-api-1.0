---
phase: 16-push-wiring-end-to-end
verified: 2026-07-08T00:00:00Z
status: human_needed
score: 4/4 truths verified (retroactive pass; one item already resolved by a later 2026-07-08 fix + live evidence, folded in per this verification's explicit instructions)
human_verification:
  - test: "Re-run 16-04's 8-step on-device human checkpoint against the CURRENT code (post c8eca00 Android-channel fix) on both a fresh install and a re-login, to confirm the soft-ask/retry/Compte-tab flow still behaves identically now that ensureAndroidNotificationChannelAsync() runs at root-layout mount"
    expected: "Soft-ask still appears exactly once, Compte tab retrigger still works, logout still deregisters silently, and — new since Phase 16 shipped — a real remote devis_recu push now arrives as a heads-up Android banner (already informally confirmed live on 2026-07-08 per the debugging session cited in this report, but not captured as a fresh formal 8-step checkpoint end-to-end after the channel fix landed)"
    why_human: "Visual/OS-level sequencing and real push banner appearance are not unit-testable; the 2026-07-08 live-device confirmation was an ad hoc debugging session (fixing Railway PUSH_ENABLED + a real /devis/:id/envoyer trigger + FCM V1 credentials), not a re-run of the formal 16-04 checkpoint script — worth one clean pass for the record, though this is a nice-to-have, not a blocker, since the underlying evidence already exists"
---

# Phase 16: Push Wiring End-to-End Verification Report

**Phase Goal:** Les utilisateurs reçoivent des notifications push en temps réel quand un devis leur est adressé, avec un parcours de permission respectueux et une navigation directe vers l'écran concerné.
**Verified:** 2026-07-08
**Status:** human_needed
**Re-verification:** No — initial verification (retroactive, generated after phase completion; no prior VERIFICATION.md existed for Phase 16)

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Avant le prompt système iOS/Android, l'utilisateur voit un écran de pré-demande ("soft-ask") expliquant l'intérêt des notifications (MPUSH-01) | ✓ VERIFIED | `mobile-app/app/(app)/soft-ask.tsx` exists, full-screen branded (Logo, title "Restez informé", body copy covering both devis + entretien push types), `onAccept`/`onDecline` both call `markSoftAskSeen()` before navigating — confirmed by direct read of the current file. `mobile-app/app/_layout.tsx`'s `RootNav` effect awaits `hasSeenSoftAsk()` and routes to `/(app)/soft-ask` (unseen) or `/(app)/(tabs)/motos` (seen) on the authenticated transition — confirmed by direct read of the current file, matches 16-03-PLAN.md's Task 2 exactly. On-device checkpoint (16-04-SUMMARY.md, step 2) confirmed the screen appears before anything else, 2026-07-05. |
| 2 | Au login, le device token de l'utilisateur est enregistré côté backend ; au logout, il est désenregistré (MPUSH-02 bout-en-bout) | ✓ VERIFIED | `mobile-app/lib/push.ts` (current, read directly) exports `registerForPushAsync`/`retryRegistrationIfGranted`/`unregisterPushAsync`/`getStoredPushToken`/`ensureAndroidNotificationChannelAsync`. `soft-ask.tsx`'s `onAccept` calls `registerForPushAsync(token)`. `AuthContext.tsx`'s `logout()` (current, read directly) calls `await unregisterPushAsync(s.accessToken).catch(() => {})` BEFORE `clearSession()`. Backend `POST/DELETE /client/device-tokens` pre-existed (Phase 12) and is called via `apiPost`/`apiFetch` inside `push.ts`. The "bout-en-bout" (end-to-end) qualifier in REQUIREMENTS.md is now satisfied beyond code: migration `16_client_device_tokens.sql` — flagged as NOT applied to prod in this phase's own `deferred-items.md` — was applied to live Supabase during Phase 17-04 (`17-04-SUMMARY.md` line 89: "Mehdi applied migration 16 via Supabase Dashboard"), and a real `ExponentPushToken` was registered and a real push delivered on a real device (`17-VERIFICATION.md` truth #1, 2026-07-06). Further corroborated by a 2026-07-08 live debugging session (Railway `PUSH_ENABLED` + a real `/devis/:id/envoyer` trigger + FCM V1 service-account credentials) confirming a real push arrived as a heads-up Android banner — cited as evidence here per this verification's explicit instructions, not re-executed destructively in this pass. |
| 3 | Quand un nouveau devis est créé pour l'utilisateur, une notification push arrive sur son appareil en quelques secondes (MPUSH-03) | ✓ VERIFIED | `motokey-api.js`'s `POST /devis/:id/envoyer` (confirmed present at line ~1273 via grep of the current file) transitions `brouillon`→`envoye` via `SBLayer.Devis.envoyer()` and fires `pushService.sendPush(pushClientId, {title:'Nouveau devis reçu', body:..., data:{type:'devis_recu', devisId:...}}, ...)` fire-and-forget. Curl-verified against live prod in 16-04-SUMMARY.md (HTTP 200, `statut:"envoye"`). At the time Phase 16 shipped, actual delivery was blocked by the missing `client_device_tokens` table (logged candidly in this phase's own `deferred-items.md`) — that gap was closed in Phase 17-04, and the 2026-07-08 debugging session (cited above) confirms a real devis-triggered push now delivers as a real Android heads-up banner end-to-end. |
| 4 | Taper sur la notification "devis reçu" ouvre directement l'écran du devis concerné (MPUSH-05, deep link) | ✓ VERIFIED | `mobile-app/hooks/useNotificationObserver.ts` (current, read directly) — `mapNotificationDataToRoute({type:'devis_recu', devisId})` returns `{pathname:'/(app)/(tabs)/devis', params:{highlightId: String(data.devisId)}}` (upgraded since Phase 16 shipped — 16-02's original shape returned only the bare `'/(app)/(tabs)/devis'` string when no `devisId` was present; the object+highlightId form is still present and backward-compatible, matches the file's own union type). `useNotificationObserver()`'s `redirect()` calls `router.push(route as any)` on both cold-start (`getLastNotificationResponseAsync`) and runtime tap (`addNotificationResponseReceivedListener`). Unit-tested (`hooks/__tests__/useNotificationObserver.test.ts`, re-run in this verification: passing). On-device confirmed via the `__DEV__` local test-notification trigger in `compte.tsx` (16-04-SUMMARY.md step 7, after a mid-checkpoint bug fix to the notification-trigger shape). |

**Score:** 4/4 truths verified. All four ROADMAP success criteria hold against the current codebase, with MPUSH-02/03's real-device delivery half — explicitly and honestly deferred at Phase 16's own close (16-04-SUMMARY.md's "Carry-Forward" section, matching the project's SC-1 deferral precedent) — since closed by Phase 17-04's EAS/FCM setup and corroborated again by a 2026-07-08 live debugging session. Routed to `human_needed` (not a plain `passed`) only because a fresh, formal 8-step on-device checkpoint re-run has not been captured since the 2026-07-08 `ensureAndroidNotificationChannelAsync()` addition landed — see Human Verification below; this is a confirmation nicety, not a code gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `mobile-app/lib/softAsk.ts` | `hasSeenSoftAsk`/`markSoftAskSeen`/`shouldShowSoftAsk`/`SOFT_ASK_SEEN_KEY` | ✓ VERIFIED | All four exported, exact shape confirmed by direct read. 4/4 unit tests pass. |
| `mobile-app/lib/push.ts` | `registerForPushAsync`/`retryRegistrationIfGranted`/`unregisterPushAsync`/`getStoredPushToken` | ✓ VERIFIED | All present, plus `ensureAndroidNotificationChannelAsync` (added 2026-07-08, commit `c8eca00` — see Data-Flow Trace / MPUSH-02 extension below). `grep -c requestPermissionsAsync` confirms exactly 1 call site (inside `registerForPushAsync` only), preserving the D-08 no-reprompt guarantee. 11/11 unit tests pass (9 original + 2 new for the channel function). |
| `mobile-app/hooks/useNotificationObserver.ts` | `mapNotificationDataToRoute` (pure) + `useNotificationObserver()` | ✓ VERIFIED | Present, widened since Phase 17 to also cover `moto_entretien` (out of this phase's scope, additive only — does not regress the `devis_recu` branch this phase owns). 4+ tests covering `devis_recu` mapping pass. |
| `mobile-app/app/(app)/soft-ask.tsx` | Full-screen branded soft-ask (D-05) with Accept/Decline | ✓ VERIFIED | Present, unchanged since 16-03, both branches call `markSoftAskSeen()` before navigating. |
| `mobile-app/hooks/usePushRegistrationRetry.ts` | AppState-foreground-triggered silent retry (D-08) | ✓ VERIFIED | Present, calls `retryRegistrationIfGranted` only (never `registerForPushAsync`), mounted once + on every `AppState` `'active'` transition. |
| `mobile-app/context/AuthContext.tsx` | `logout()` calls `unregisterPushAsync` before `clearSession()` (D-09) | ✓ VERIFIED | Confirmed by direct read: `unregisterPushAsync(s.accessToken).catch(() => {})` runs first in the current `logout` callback, fail-open. |
| `mobile-app/app/_layout.tsx` | Root-layout soft-ask redirect gating (D-04) + Android channel creation | ✓ VERIFIED | `RootNav` effect gates on `hasSeenSoftAsk()`. Additionally now calls `ensureAndroidNotificationChannelAsync()` in a `useEffect` at mount (added 2026-07-08) — before any token registration can occur, matching the function's own doc comment ("Idempotent; no-op on iOS"). |
| `mobile-app/app/(app)/_layout.tsx` | Mounts `useNotificationObserver()` + `usePushRegistrationRetry()` | ✓ VERIFIED | Both hooks called at the top of `AppLayout()`, confirmed by direct read. |
| `mobile-app/app/(app)/(tabs)/compte.tsx` | "Activer les notifications" retry entry point (D-06) + `__DEV__` test-notification trigger | ✓ VERIFIED | Both present; the test-notification trigger uses the corrected `{type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2}` shape (fixed mid-checkpoint in 16-04, still correct in current code). |
| `motokey-api.js` — `POST /devis/:id/envoyer` | `brouillon`→`envoye` transition (MECANO+) firing `sendPush()` | ✓ VERIFIED | Route present (grep confirms `SBLayer.Devis.envoyer` call + two `pushService.sendPush(...)` call sites — Supabase and RAM-fallback branches). `node --check motokey-api.js` exits 0. |
| `motokey-api.js` — `PUT /devis/:id` statut-lock guard | Rejects edits on non-`brouillon` devis (400 `INVALID_STATUS`) | ✓ VERIFIED | Guard present at both the Supabase branch (line ~1250) and RAM-fallback branch (line ~1258), confirmed via grep, matches 16-01-PLAN.md's Task 1 acceptance criteria. |
| `supabase.js` — `Devis.envoyer` | Dedicated method (not a repurposed `Devis.update`) | ✓ VERIFIED | `async envoyer(id, garage_id)` present at line ~576, distinct from `Devis.update`. |
| `scripts/seed-test-devis-16-uat.js` | Idempotent seed fixture for curl UAT | ✓ VERIFIED | File exists (referenced and used successfully in 16-04-SUMMARY.md's curl smoke test, devis id `111a16f8-...`). |
| `app.html` devis list | Correct field refs (`numero`/`created_at`/`statut`/`total_ttc`) + per-row "Envoyer au client" button | ✓ VERIFIED | `envoyerDevis` function and `d.numero`/button-on-`brouillon` markup both confirmed present via grep of the current file. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `mobile-app/app/_layout.tsx` `RootNav` | `mobile-app/app/(app)/soft-ask.tsx` | `router.replace` gated by `hasSeenSoftAsk()` | ✓ WIRED | Confirmed by direct read of current `_layout.tsx`. |
| `mobile-app/app/(app)/soft-ask.tsx` `onAccept` | `mobile-app/lib/push.ts registerForPushAsync` | direct call with `getValidAccessToken()`'s result | ✓ WIRED | Confirmed by direct read; failure path is silent per D-08, deferred to `usePushRegistrationRetry`. |
| `mobile-app/context/AuthContext.tsx logout()` | `mobile-app/lib/push.ts unregisterPushAsync` | awaited, fail-open call before `apiPost('/auth/client/logout', ...)`/`clearSession()` | ✓ WIRED | Confirmed by direct read of current `AuthContext.tsx`. |
| `mobile-app/app/(app)/_layout.tsx` | `mobile-app/hooks/useNotificationObserver.ts` | `useNotificationObserver()` mounted at the `(app)` group boundary | ✓ WIRED | Confirmed by direct read; both hooks called unconditionally in `AppLayout()`. |
| `mobile-app/app/_layout.tsx` (root, mount effect) | `mobile-app/lib/push.ts ensureAndroidNotificationChannelAsync` | `useEffect(() => { ensureAndroidNotificationChannelAsync(); }, [])` at root-layout mount, before any screen/token flow | ✓ WIRED | Confirmed by direct read of the current root `_layout.tsx` (added 2026-07-08, commit `c8eca00`) — runs unconditionally at app boot, ahead of both the soft-ask accept path and the foreground-retry path, so the Android channel exists before any token registration attempt. |
| `motokey-api.js POST /devis/:id/envoyer` | `services/pushService.js sendPush()` | `require('./services/pushService')` top-level + fire-and-forget call after the statut update succeeds | ✓ WIRED | Confirmed via grep: top-level require at line 81, two call sites (Supabase branch line ~1278, RAM-fallback branch line ~1294). |
| `app.html` devis list per-row button | `POST /devis/:id/envoyer` | `onclick="envoyerDevis(d.id)"` → `api('/devis/'+id+'/envoyer','POST')` | ✓ WIRED | Confirmed via grep of the current `app.html`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `POST /devis/:id/envoyer` | `dv`/`pushClientId` | `SBLayer.Devis.envoyer(p.id, garageId)` → real Supabase update + read (not a static return); `dv.client_id` (or `motos.client_id` fallback) is a real client UUID | Yes — curl-verified against live prod in 16-04-SUMMARY.md (`total_ttc:108`, real devis id, real garage/client) | ✓ FLOWING |
| `mapNotificationDataToRoute` | `data.devisId` from the push payload | Populated server-side by `pushService.sendPush(...,{data:{type:'devis_recu', devisId: dv.id}},...)` | Yes — real devis UUID, not a placeholder | ✓ FLOWING |
| `registerForPushAsync`/`completeRegistration` | `expoPushToken` | `Notifications.getExpoPushTokenAsync({projectId})` — requires a real EAS `projectId`, which did NOT exist when Phase 16 shipped (fails silently by design, per D-08) but DOES exist now (Phase 17-03's `eas.json`/`app.json` `extra.eas.projectId`) | Yes, as of Phase 17 — a real `ExponentPushToken` was registered and delivered on-device (17-VERIFICATION.md truth #1, and the 2026-07-08 debugging session cited in this report) | ✓ FLOWING (as of Phase 17, corroborated 2026-07-08) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend syntax valid | `node --check motokey-api.js` | exits 0 | ✓ PASS |
| Mobile unit tests for push/softAsk/notification-routing modules | `cd mobile-app && npx jest lib/__tests__/push.test.ts lib/__tests__/softAsk.test.ts hooks/__tests__/useNotificationObserver.test.ts` | 3 suites, 24 tests passing | ✓ PASS |
| Full mobile jest suite (regression check) | `cd mobile-app && npx jest` | 11 suites, 128 tests passing, 0 failures | ✓ PASS |
| Mobile TypeScript check | `cd mobile-app && npx tsc --noEmit` | exits 0, no output | ✓ PASS |
| `POST /devis/:id/envoyer` + `PUT` lock + re-send rejection (not re-run destructively this pass — cited from 16-04-SUMMARY.md's recorded curl evidence) | (curl against live prod, performed in 16-04) | HTTP 200 `statut:"envoye"` → HTTP 400 `INVALID_STATUS` (edit) → HTTP 400 `INVALID_STATUS` (re-send) | ✓ PASS (not re-executed — would mutate prod devis state; evidence already recorded verbatim in 16-04-SUMMARY.md) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MPUSH-01 | 16-02, 16-03 | Écran de pré-demande ("soft-ask") avant le prompt système | ✓ SATISFIED | `soft-ask.tsx` + `hasSeenSoftAsk()` gating verified above; on-device confirmed 2026-07-05. REQUIREMENTS.md checkbox `[x]`, status "Complete". |
| MPUSH-02 | 16-02, 16-03 (bout-en-bout) | Device token enregistré/désenregistré au login/logout | ✓ SATISFIED | Code verified above (register on accept, unregister on logout, silent foreground retry). "Bout-en-bout" qualifier satisfied by Phase 17-04's real on-device registration + the missing-table gap (logged candidly in this phase's `deferred-items.md`) being closed via migration 16 applied to prod. REQUIREMENTS.md checkbox `[x]`, status "Complete", explicitly attributed to "Phase 12 (backend) / Phase 16 (bout-en-bout)". |
| MPUSH-03 | 16-01, 16-04 | Notification push immédiate à la création d'un devis | ✓ SATISFIED | Backend trigger (`POST /devis/:id/envoyer` → `sendPush`) code-verified and curl-proven above. Real delivery corroborated by Phase 17-04's live device confirmation and the 2026-07-08 debugging session (Railway `PUSH_ENABLED` + real trigger + FCM V1 credentials) cited in this report. REQUIREMENTS.md checkbox `[x]`, status "Complete". |
| MPUSH-05 | 16-02, 16-03, 16-04 | Tap sur notification navigue vers l'écran concerné (deep link devis) | ✓ SATISFIED | `mapNotificationDataToRoute`'s `devis_recu` branch verified above, unit-tested, and on-device confirmed via the `__DEV__` local test-notification trigger (16-04-SUMMARY.md step 7, after a mid-checkpoint bug fix). REQUIREMENTS.md checkbox `[x]`, status "Complete". |

No orphaned requirements found — MPUSH-01, MPUSH-02, MPUSH-03, MPUSH-05 all appear in at least one of this phase's plans' `requirements:` frontmatter and are all accounted for above. (MPUSH-04 is explicitly out of this phase's scope per `16-CONTEXT.md`'s Phase Boundary section — it ships in Phase 17, already verified there.)

### MPUSH-02 Extension: Android Notification Channel (2026-07-08, commit `c8eca00`)

Not part of Phase 16's original scope, but a direct, natural extension of MPUSH-02's device-token lifecycle work — folded into this verification per the task's explicit instruction, rather than treated as a separate untracked change:

- **What:** `ensureAndroidNotificationChannelAsync()` added to `mobile-app/lib/push.ts`, called from a `useEffect` in `mobile-app/app/_layout.tsx` at root-layout mount, before any screen renders.
- **Why:** Android (API 26+) requires every notification to be posted to an explicit channel with the right importance to display as a heads-up banner. The backend (`services/pushService.js`) never sets a `channelId` in the push payload, so Expo defaults to a channel named `'default'` — which must be created client-side with `AndroidImportance.MAX` before it exists at all. Without this, pushes could arrive but be silently suppressed or shown without a heads-up banner on Android.
- **Verification:** Function is idempotent (safe on every launch), no-ops on iOS (`Platform.OS !== 'android'` guard). Two new unit tests (`lib/__tests__/push.test.ts` Tests 10-11) cover both the Android-creates-channel and iOS-no-ops paths — both pass in this verification's re-run. Wired at the correct point (root layout mount, ahead of both the soft-ask "Accept" path and the foreground retry path).
- **Live corroboration:** the 2026-07-08 debugging session (cited throughout this report) confirmed a real push arrived and displayed as a heads-up banner on a real Android device after this fix, alongside the Railway `PUSH_ENABLED`/trigger/FCM-credentials fixes — none of which were code gaps in this phase's files.
- **Verdict:** ✓ VERIFIED, code-complete, unit-tested, correctly wired, and live-corroborated. Correctly scoped as an MPUSH-02 lifecycle extension rather than a new requirement.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODO/FIXME/XXX/HACK/placeholder patterns found in any of the Phase 16 files re-read in this verification pass (`mobile-app/lib/push.ts`, `mobile-app/lib/softAsk.ts`, `mobile-app/hooks/useNotificationObserver.ts`, `mobile-app/hooks/usePushRegistrationRetry.ts`, `mobile-app/app/(app)/soft-ask.tsx`, `mobile-app/app/_layout.tsx`, `mobile-app/app/(app)/_layout.tsx`, `mobile-app/app/(app)/(tabs)/compte.tsx`, `mobile-app/context/AuthContext.tsx`) | ℹ️ Info | None — clean scan |
| `.planning/phases/16-push-wiring-end-to-end/deferred-items.md` | 7-35 | `app.html`'s devis creation form (`saveDevis`/`devisLines`) still uses field names (`designation`/`qte`/`prix_ht`) that don't match the backend's expected line shape — explicitly logged as pre-existing and out of this phase's declared scope | ⚠️ Warning (pre-existing, not this phase's regression) | Garage users creating a NEW devis via `app.html`'s form (not the seed script, not `MotoKey_Client.html`) will get `total_ht/tva/ttc = 0` for every line. Does not affect the "Envoyer au client" button or push trigger itself (both operate on whatever devis already exists). Logged, not fixed, by design — carried forward, not a Phase 16 goal-blocking gap since MPUSH-03's trigger event (the transition itself) works correctly regardless of how the underlying devis's totals were computed. |
| `.planning/phases/16-push-wiring-end-to-end/deferred-items.md` | 37-63 | `client_device_tokens` table missing in live prod at the time Phase 16 shipped, meaning `sendPush()` failed open silently and no push could ever be delivered | ℹπ️ Info (resolved) | This was Phase 16's most significant honestly-logged gap. Confirmed RESOLVED: migration 16 was applied to prod during Phase 17-04 (`17-04-SUMMARY.md` line 89), and real push delivery has since been confirmed multiple times (Phase 17-04's on-device proof, and the 2026-07-08 debugging session cited in this report). No longer an open gap as of this verification. |
| `.planning/ROADMAP.md` | — | Phase 16 marked `[x]` complete and Progress table shows `4/4 Complete 2026-07-05` | ℹ️ Info | Consistent with all 4 plans' own `[x]` checkboxes and SUMMARYs — no staleness found, unlike some other phases' bookkeeping. |

No blocker-severity anti-patterns found in the code itself.

### Human Verification Required

### 1. Fresh formal 8-step on-device checkpoint re-run, post-Android-channel-fix

**Test:** Re-run 16-04's original 8-step checkpoint (soft-ask appears once → Accept → Compte tab retrigger → Decline → local test-notification tap → Devis tab navigation → logout) on a real Android device running the current code (post `c8eca00`), and additionally confirm a real garage-sent devis push arrives as a heads-up banner and tapping it opens the Devis tab.
**Expected:** All 8 original steps still pass identically, plus the new real-push-arrival step succeeds (this has already been informally observed working per the 2026-07-08 debugging session cited throughout this report, but that session was an ad hoc bug-fixing pass, not a clean re-run of the formal checkpoint script).
**Why human:** Visual/OS-level UI sequencing, real permission-dialog timing, and real push-banner appearance cannot be verified programmatically. This is a confirmation/regression nicety given the strength of the evidence already gathered (Phase 17-04's proof + the 2026-07-08 live session), not a blocker to this phase's own goal achievement — hence `human_needed` rather than `gaps_found`.

### Gaps Summary

No code gaps were found. All four ROADMAP.md success criteria for Phase 16 hold against the current codebase: the soft-ask screen exists and is correctly gated (MPUSH-01), device-token register/retry/unregister logic is fully wired through login/logout/foreground lifecycle events (MPUSH-02), the devis-envoyer backend trigger correctly fires `sendPush()` (MPUSH-03), and notification-tap navigation to the Devis tab is implemented, unit-tested, and on-device confirmed (MPUSH-05). Phase 16's own honest, well-documented deferral — real remote push delivery blocked on a missing `client_device_tokens` table and a non-existent EAS project at the time this phase shipped — has since been fully resolved: migration 16 was applied to prod during Phase 17-04, a real Expo push token was registered and a real notification delivered on a real device (17-VERIFICATION.md), and a 2026-07-08 debugging session further corroborated end-to-end delivery (Railway `PUSH_ENABLED`, a real `/devis/:id/envoyer` trigger, and FCM V1 credentials — none of which were gaps in this phase's own files). The one item routed to human verification (a fresh formal 8-step checkpoint re-run after the 2026-07-08 `ensureAndroidNotificationChannelAsync()` addition) is a confirmation nicety, not a code gap — the underlying evidence for every truth already exists across this phase's own SUMMARYs, Phase 17's VERIFICATION.md, and the cited live debugging session. Overall status is `human_needed` rather than `passed` purely out of rigor around that one un-recaptured on-device pass, not because of any missing or broken code.

---

*Verified: 2026-07-08*
*Verifier: Claude (gsd-verifier)*
