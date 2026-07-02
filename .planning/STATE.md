---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: App Client Mobile
status: executing
stopped_at: Completed 13-02-PLAN.md
last_updated: "2026-07-02T16:35:19.000Z"
last_activity: 2026-07-02
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 0
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Phase 13 — push-dispatch-service — COMPLETE. Next: Phase 14 (RN App Scaffolding + Native Auth)

## Current Position

Phase: 13 (push-dispatch-service) — COMPLETE (both plans)
Plan: 2 of 2 — done
Status: Ready to plan Phase 14
Last activity: 2026-07-02

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

### Pending Todos

- **[Phase 13] SC-1 real device push delivery — DEFERRED, not yet exercised.** `sendToToken`/`sendPush` in `services/pushService.js` have never been confirmed to deliver a visible notification to a real device. No Expo Go / mobile app device token existed at Phase 13 completion (expected — mobile app is Phase 14+). To close: once a real device token is available (naturally during Phase 14 RN app work, or as a standalone manual check beforehand), run `PUSH_ENABLED=true node scripts/test-push.js <real-ExponentPushToken>` and confirm the notification banner appears. SC-2/SC-3/SC-4 are already confirmed — only SC-1 is open.

### Blockers/Concerns

- Phase 8 / BILL-06 (Stripe live mode) reste un known gap séparé, bloqué sur action humaine Mehdi (Stripe Dashboard) — sans impact sur l'exécution de v1.3
- Recherche flag : `expo-server-sdk` API exacte (envoi + receipts) à vérifier avant Phase 13 ; endpoint garage-side réclamation à localiser avant Phase 16 ; primitive cron Railway à confirmer avant Phase 17
- Phase 12-02 Task 4: migration 16 (client_device_tokens) non appliquee en prod Supabase Dashboard -- POST/DELETE /client/device-tokens verifies code-correct via curl direct avec un vrai access_token Supabase mais renvoient 'relation does not exist' tant que la migration n'est pas executee. GET /client/me fonctionne deja end-to-end en prod.
- Phase 13-02: SC-1 (real device push delivery) deferred — see Pending Todos above. Migration 17 (push_send_log) IS applied to prod Supabase (with FK-drift reconciled in the migration file, no functional impact).
- Windows-only Node libuv teardown crash (`UV_HANDLE_CLOSING` assertion) after any local script that calls Supabase then `process.exit()` — pre-existing (reproduces with Phase 9 code too), confirmed not a Phase 13 regression, won't occur on Railway (Linux). Details: `.planning/phases/13-push-dispatch-service/deferred-items.md`. No action needed.

## Session Continuity

Last session: 2026-07-02T16:35:19.000Z
Stopped at: Completed 13-02-PLAN.md — Phase 13 (push-dispatch-service) fully executed, both plans complete
Resume file: None
