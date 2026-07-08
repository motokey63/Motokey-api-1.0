---
phase: 13
slug: push-dispatch-service
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-02
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no jest/mocha/vitest in this repo) — plain Node scripts using direct `require()`, matching `scripts/stripe-create-pioneer-coupon.js` and `tests/test-client-device-tokens.js` conventions |
| **Config file** | none — Wave 0 creates `scripts/test-push.js` |
| **Quick run command** | `PUSH_ENABLED=false node scripts/test-push.js <any-token>` (no external calls, verifies fallback + idempotency-guard DB writes) |
| **Full suite command** | `node scripts/test-push.js <real-expo-token>` (requires `PUSH_ENABLED=true` and a real device token from Mehdi) |
| **Estimated runtime** | ~5 seconds (fallback path) / manual, human-timed (real device delivery check) |

---

## Sampling Rate

- **After every task commit:** Run `PUSH_ENABLED=false node scripts/test-push.js <any-token>` — fast, no external dependency, verifies fallback path + idempotency DB writes
- **After every plan wave:** Run full manual test with `PUSH_ENABLED=true` and a real Expo token (once supplied by Mehdi) to verify end-to-end delivery
- **Before `/gsd:verify-work`:** All 4 phase success criteria manually verified and reported — per CLAUDE.md/user convention, await explicit GO before `git push`
- **Max feedback latency:** ~5s for fallback-path checks; real-device delivery checks are human-timed (not automatable)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 0 | SC-1..4 (infra) | file exists | `test -f sql/migrations/17_push_send_log.sql` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 0 | SC-1..4 (infra) | file exists | `test -f scripts/test-push.js` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 1 | SC-2 | smoke | `PUSH_ENABLED=false node scripts/test-push.js dummy` (expect console.log, exit 0) | ✅ (after W0) | ⬜ pending |
| 13-02-02 | 02 | 1 | SC-3 | integration | `node scripts/test-push.js <token> --idempotency-key=test-1` run twice, assert second run logs "already sent" and does not call Expo API | ✅ (after W0) | ⬜ pending |
| 13-02-03 | 02 | 1 | SC-4 | unit | `PUSH_ENABLED=false node scripts/test-push.js not-a-real-token` (expect logged validation error, exit 0, no crash) | ✅ (after W0) | ⬜ pending |
| 13-02-04 | 02 | 1 | SC-1 | manual | `PUSH_ENABLED=true node scripts/test-push.js <real-expo-token-from-Mehdi>` — human confirms visible notification on device | ✅ (after W0) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `sql/migrations/17_push_send_log.sql` — new idempotency dedup table (`idempotency_key` UNIQUE, `client_id` nullable, `token` nullable, `sent_at`), must exist before any send-path code can be tested against real Supabase
- [ ] `scripts/test-push.js` — standalone manual-invocation harness (direct `require('../services/pushService')`, CLI arg for token, `.env` loaded via `dotenv`), no existing precedent for a *service-module* smoke test (Phase 12's precedent was HTTP-endpoint-based, not applicable as-is)
- [ ] `PushSendLog` helper in `supabase.js` (mirrors `BillingEvents` shape) — does not exist yet

*Wave 0 must complete before Wave 1 task verification can run against real DB state.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real notification visible on physical device | SC-1 | No jest/mocha in repo; requires a real Expo push token from a physical device running Expo Go (no mobile app exists yet — Phase 14+) and human visual confirmation of the notification banner | Mehdi runs Expo Go on a personal device, supplies the resulting `ExponentPushToken[...]` string, executor runs `PUSH_ENABLED=true node scripts/test-push.js <token>` and Mehdi confirms the notification appeared |
| Android delivery may fail for EAS/Firebase config reasons unrelated to this phase's code (Pitfall 3 in RESEARCH.md) | SC-1 (edge case) | FCM HTTP v1 / Firebase service account is an EAS-project-level concern, not testable or fixable from this backend service | If Android test fails, cross-check against iOS/Expo Go token before treating as a code defect; document distinction in test notes |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (13-02-04 is the only manual-only task, bracketed by automated checks)
- [x] Wave 0 covers all MISSING references (migration file, test script, supabase.js helper)
- [x] No watch-mode flags
- [x] Feedback latency < 5s for automated checks (real-device check is inherently manual/human-timed, documented above)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
