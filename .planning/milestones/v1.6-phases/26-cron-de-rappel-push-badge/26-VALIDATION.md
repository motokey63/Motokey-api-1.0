---
phase: 26
slug: cron-de-rappel-push-badge
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-15
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no jest/mocha/pytest) — ad-hoc raw-`http` Node scripts, repo-wide convention (`tests/test-or-e2e.js`, `tests/test-km-photos-cloudinary.js`, `tests/test-client-device-tokens.js`) |
| **Config file** | none — Wave 0 creates the new test file |
| **Quick run command** | `node motokey-api.js` (server, one terminal) then `node tests/test-consommable-rappel-cron.js` (new file, another terminal) |
| **Full suite command** | `node test-api.js` (root regression suite, 9/9 baseline) + `node tests/test-consommable-rappel-cron.js` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node tests/test-consommable-rappel-cron.js` (server running locally, `PUSH_ENABLED` unset/false so pushes hit the dev console-log fallback, not real Expo)
- **After every plan wave:** Run `node test-api.js` (root regression) + the new cron test file
- **Before `/gsd:verify-work`:** Full suite must be green, plus `node --check motokey-api.js` (repo convention, CLAUDE.md)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 0 | GAUGE-03 | stub | `node tests/test-consommable-rappel-cron.js` (skeleton, exits 0) | ❌ W0 | ⬜ pending |
| 26-0X-0X | TBD | 1+ | GAUGE-03 | integration | `node tests/test-consommable-rappel-cron.js` — push fires when km/date threshold crossed, grouped per moto | ❌ W0 | ⬜ pending |
| 26-0X-0X | TBD | 1+ | GAUGE-03 | integration | same file — cron does not re-send for the same threshold crossing (idempotence) | ❌ W0 | ⬜ pending |
| 26-0X-0X | TBD | 1+ | GAUGE-03 | integration | same file — reset on new photo (D-05) re-arms the reminder | ❌ W0 | ⬜ pending |
| 26-0X-0X | TBD | 1+ | GAUGE-04 | integration | same file (or addition to `tests/test-km-photos-cloudinary.js`) — garage/`inconnu` motos surface a computed lateness field without a push being sent | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Exact task IDs to be filled in by the planner once plan/wave numbering is assigned.*

---

## Wave 0 Requirements

- [ ] `tests/test-consommable-rappel-cron.js` — new file, stub covering GAUGE-03/GAUGE-04 assertions (skeleton-then-fill pattern per `tests/test-km-photos-cloudinary.js`; must exit 0 even before later waves fill in assertions)
- [ ] No new shared fixtures needed — reuse `sophie@email.com`/`client123` (client login) and existing garage seed account; a garage-owned moto fixture (`proprietaire_type='garage'`) already exists per prior test scripts and can be reused/adapted for GAUGE-04 assertions
- [ ] No new framework install needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Actual Expo push arrives on a physical device | GAUGE-03 | Out of scope for automated tests (mirrors Phase 17's own validation) — automated test asserts on `pushService.sendPush()`'s return shape (`{ sent: N }` or dev-mode `{ dev: true }`), not real delivery | Trigger the cron manually against a real client device token in a controlled test, confirm push notification appears on device |
| Railway external scheduler wiring for the new cron route | GAUGE-03/GAUGE-04 | Operational/Railway-dashboard action, not a code task | Confirm with Mehdi whether Railway cron (or equivalent) needs a second scheduled call added for `/cron/rappels-photo-consommables`, alongside the existing `/cron/maintenance-alerts` entry |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
