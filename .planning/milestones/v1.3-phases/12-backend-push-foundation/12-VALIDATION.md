---
phase: 12
slug: backend-push-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no Jest/Mocha/pytest). Existing convention: hand-rolled Node scripts using the raw `http` module (`test-api.js`, `tests/test-or-e2e.js`), run manually against a live local server on `localhost:3000`, with a custom `test()`/`check()` pass/fail counter. |
| **Config file** | none — Wave 0 decides whether a new script is added |
| **Quick run command** | `node motokey-api.js` (start server) then `node test-client-device-tokens.js` (new script, or manual curl) |
| **Full suite command** | `npm test` (currently runs only `test-api.js`; `tests/test-or-e2e.js` is run separately/manually — planner decides whether to wire this phase's script into `npm test` or keep it curl/manual, matching the phase's explicit "curl/Postman verifiable" framing) |
| **Estimated runtime** | ~5 seconds (4 curl calls / smoke checks) |

---

## Sampling Rate

- **After every task commit:** Run the relevant curl check against the locally running `node motokey-api.js` process for the endpoint just added.
- **After every plan wave:** Re-run all 4 curl checks in sequence (register → verify → delete → verify gone → auth-rejection).
- **Before `/gsd:verify-work`:** All 4 success criteria must be demonstrated via curl output.
- **Max feedback latency:** ~5 seconds (local curl round trip).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-TBD | TBD | TBD | MPUSH-02 (SC1) | manual/smoke (curl) | `curl -X POST http://localhost:3000/client/device-tokens -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"token":"ExponentPushToken[xxxx]","platform":"ios"}'` | ❌ W0 | ⬜ pending |
| 12-01-TBD | TBD | TBD | MPUSH-02 (SC2) | manual/smoke (curl) | `curl -X DELETE http://localhost:3000/client/device-tokens -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"token":"ExponentPushToken[xxxx]"}'` | ❌ W0 | ⬜ pending |
| 12-01-TBD | TBD | TBD | MPUSH-02 (SC3) | manual/smoke (curl) | `curl http://localhost:3000/client/me -H "Authorization: Bearer $TOKEN"` | ❌ W0 | ⬜ pending |
| 12-01-TBD | TBD | TBD | MPUSH-02 (SC4) | manual/smoke (curl) | `curl -X POST http://localhost:3000/client/device-tokens -d '{}'` (no Authorization header) → expect 401 | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are TBD — the planner will assign concrete plan/wave/task IDs; this table's requirement→command mapping must carry over unchanged into the plan's verification steps.*

---

## Wave 0 Requirements

- [ ] Decide and optionally create `test-client-device-tokens.js` (or similar), following the exact `test-api.js` / `tests/test-or-e2e.js` hand-rolled convention — recommended but not strictly required since success criteria are explicitly curl/Postman-verifiable, not "must have an automated test file."
- [ ] No test framework install needed — this repo does not use Jest/Mocha/pytest and this phase introduces no new external dependency.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All 4 phase success criteria | MPUSH-02 | Phase is explicitly scoped as "curl/Postman-verifiable" with no mobile app dependency — the phase's own definition of done is manual/smoke curl output, not a CI-run automated suite | Start `node motokey-api.js` locally, run the 4 curl commands above in sequence, confirm expected status codes/bodies |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
