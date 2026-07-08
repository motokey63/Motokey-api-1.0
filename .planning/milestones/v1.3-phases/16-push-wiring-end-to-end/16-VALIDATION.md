---
phase: 16
slug: push-wiring-end-to-end
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (mobile)** | Jest via `jest-expo@~54.0.17`, existing config in `mobile-app/package.json` (`"jest": {"preset": "jest-expo", ...}`) |
| **Framework (backend)** | None formal — established project convention is manual curl / harness scripts (`scripts/test-push.js`, `test-api.js`), per Phase 12/13 precedent |
| **Config file** | `mobile-app/package.json` `"jest"` key (mobile); none — Wave 0 adds seed fixture (backend) |
| **Quick run command** | `cd mobile-app && npx jest <touched test files>` + `node --check motokey-api.js` |
| **Full suite command** | `cd mobile-app && npm test` + manual curl smoke of `POST /devis/:id/envoyer` |
| **Estimated runtime** | ~30s (mobile jest) + a few seconds (node --check + curl) |

---

## Sampling Rate

- **After every task commit:** Run `cd mobile-app && npx jest <touched test files>` + `node --check motokey-api.js`
- **After every plan wave:** Run `cd mobile-app && npm test` (full mobile suite) + manual curl smoke of the new `envoyer` endpoint
- **Before `/gsd:verify-work`:** Full mobile jest suite green + manual curl confirms statut transition + push call fires (dev-mode console.log fallback acceptable if `PUSH_ENABLED=false`)
- **Max feedback latency:** ~30 seconds

**Explicit scope note:** Real on-device push delivery (MPUSH-02/03) and real device-token registration are **known-blocked** per research Open Question 1 (Expo Go dropped remote-push support in SDK 53+; no EAS project/Expo account exists yet). Per user decision (2026-07-04), EAS setup is deferred to Phase 17. This is not a gate blocker for Phase 16 — same deferral pattern as SC-1 in Phase 13.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-02 Task 1 | 16-02 | 1 | MPUSH-01 | unit (tdd) | `cd mobile-app && npx jest lib/__tests__/softAsk.test.ts` | ❌ W0 (created by this task) | ⬜ pending |
| 16-02 Task 2 | 16-02 | 1 | MPUSH-02 | unit (tdd) | `cd mobile-app && npx jest lib/__tests__/push.test.ts` | ❌ W0 (created by this task) | ⬜ pending |
| 16-02 Task 3 | 16-02 | 1 | MPUSH-05 | unit (tdd) | `cd mobile-app && npx jest hooks/__tests__/useNotificationObserver.test.ts` | ❌ W0 (created by this task) | ⬜ pending |
| 16-01 Task 1 | 16-01 | 1 | MPUSH-03 | syntax | `node --check motokey-api.js` | ✅ motokey-api.js | ⬜ pending |
| 16-01 Task 2 | 16-01 | 1 | MPUSH-03 | integration fixture | `node scripts/seed-test-devis-16-uat.js` (idempotent seed) | ❌ W0 (created by this task) | ⬜ pending |
| 16-01 Task 3 | 16-01 | 1 | MPUSH-03 | grep smoke | `node -e "…includes('envoyerDevis')…"` | ✅ app.html | ⬜ pending |
| 16-03 Task 1-3 | 16-03 | 2 | MPUSH-01/02/05 | wiring | `cd mobile-app && npx jest && npx tsc --noEmit` | ✅ mobile-app | ⬜ pending |
| 16-04 Task 1 | 16-04 | 3 | MPUSH-01/02/03/05 | integration (curl + full suite) | `node --check motokey-api.js && cd mobile-app && npx jest && npx tsc --noEmit` + curl `POST /devis/:id/envoyer` against seeded `brouillon` devis | ✅ (consumes 16-01 fixture) | ⬜ pending |

*Task IDs reflect the finished plans (16-01…16-04). Wave 0 test files (`softAsk.test.ts`, `push.test.ts`, `useNotificationObserver.test.ts`, `scripts/seed-test-devis-16-uat.js`) are created by their owning tasks before/as their production code lands — every task carries an `<automated>` verify.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `mobile-app/lib/__tests__/push.test.ts` — covers MPUSH-02 (registration/unregistration payload logic, mocked `apiPost`/`apiFetch`) — **owned by 16-02 Task 2**
- [ ] `mobile-app/hooks/__tests__/useNotificationObserver.test.ts` — covers MPUSH-05 (redirect mapping logic, extracted as a pure function) — **owned by 16-02 Task 3**
- [ ] `mobile-app/lib/__tests__/softAsk.test.ts` — covers MPUSH-01's "shown once" gating logic — **owned by 16-02 Task 1**
- [ ] Backend seed fixture for a `brouillon` devis usable in manual curl verification of the new `envoyer` endpoint — follow the pattern in `scripts/seed-test-moto-15-uat.js` — **owned by 16-01 Task 2**

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full-screen soft-ask visual + OS prompt sequencing | MPUSH-01 | Visual/OS-prompt timing, not unit-testable | Launch app fresh (cleared AsyncStorage), log in, confirm soft-ask screen appears before OS permission dialog |
| Real token registered/deregistered on real login/logout | MPUSH-02 | **Blocked** — requires development build, not achievable via Expo Go (SDK 53+ dropped remote push) | Deferred to Phase 17 once EAS project exists |
| Real push arrives on real device within seconds | MPUSH-03 | **Blocked** — requires development build | Deferred to Phase 17 once EAS project exists |
| On-device tap → Devis tab navigation | MPUSH-05 | Achievable today via a **locally scheduled** test notification (unaffected by Expo Go's remote-push removal) | `Notifications.scheduleNotificationAsync` with `data: {type:'devis_recu'}`, tap it, confirm navigation to Devis tab |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
