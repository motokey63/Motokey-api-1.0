---
phase: 17
slug: maintenance-alert-cron-app-store-submission
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-05
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Backend: none formal (ad-hoc `scripts/test-*.js` harnesses + live curl smoke tests, per Phase 13/16 convention). Mobile: `jest` via `jest-expo` preset. |
| **Config file** | Backend: none. Mobile: inline `jest` key in `mobile-app/package.json` |
| **Quick run command** | Backend: `node --check motokey-api.js`. Mobile: `cd mobile-app && npx tsc --noEmit && npx jest` |
| **Full suite command** | Same as quick run — no separate "full" tier exists in this codebase's established convention. Add live curl smoke test against Railway prod for cron endpoint. |
| **Estimated runtime** | ~30-60 seconds (mobile jest suite, currently 121/121 tests) |

---

## Sampling Rate

- **After every task commit:** Run `node --check motokey-api.js` (backend tasks) or `cd mobile-app && npx tsc --noEmit` (mobile tasks)
- **After every plan wave:** Full mobile `jest` suite + live curl smoke test against Railway prod for the cron endpoint (mirrors 16-04's own verification plan)
- **Before `/gsd:verify-work`:** Curl smoke test for cron (auth rejection + successful run + idempotent re-run) + mobile jest green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 0 | MPUSH-04 | unit (Wave 0 harness) | `node scripts/test-maintenance-cron.js` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | MPUSH-04 | manual curl | `curl -i -X POST .../cron/maintenance-alerts` (no header → expect 401) | ✅ (pattern exists — mirrors `/stripe/webhook`) | ⬜ pending |
| 17-01-03 | 01 | 1 | MPUSH-04 | unit + manual curl | `node scripts/test-maintenance-cron.js` + `curl -X POST .../cron/maintenance-alerts -H "X-Cron-Secret: ..."` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | MPUSH-04 (mobile half) | unit (extend existing test file) | `cd mobile-app && npx jest hooks/useNotificationObserver` | ❌ W0 (extend existing) | ⬜ pending |
| 17-03-01 | 03 | 2 | MSTORE-01 | manual (inspect generated manifest) | `eas build --profile development --platform android` then inspect artifacts, or `npx expo prebuild` locally | N/A — verification step | ⬜ pending |
| 17-03-02 | 03 | 2 | MSTORE-02 | manual-only, PARKED | N/A — blocked on paid Apple/Google accounts (D-01/D-02) | N/A | ⬜ pending (parked) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/test-maintenance-cron.js` — new harness, mirrors `scripts/test-push.js`'s structure (dotenv load, direct function call, printed result); covers MPUSH-04's tier-crossing logic against seeded fixture motos
- [ ] `scripts/seed-test-maintenance-cron.js` — fixture seeding script, following the existing `scripts/seed-test-*-uat.js` naming convention
- [ ] Locate and extend `mobile-app/hooks/__tests__/` test file for `useNotificationObserver.ts` to cover the new `moto_entretien` → `{pathname, params}` mapping (exact filename must be confirmed before planning tasks reference it)
- [ ] No test framework install needed — both `jest-expo` (mobile) and ad-hoc node scripts (backend) are already established conventions

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tap notification with `type:'moto_entretien'` navigates to correct Fiche Moto | MPUSH-04 | Requires a real EAS dev build + real device/notification delivery, not simulable in jest | Trigger cron manually (curl), receive push on real Android EAS dev build, tap it, confirm navigation lands on the correct moto's fiche |
| `PrivacyInfo.xcprivacy` content matches actual API usage | MSTORE-01 | Requires inspecting the actual generated manifest post-build, not just declared config | Run `eas build --profile development --platform android` or `npx expo prebuild` locally, inspect build artifacts/`ios/` output for the generated privacy manifest |
| TestFlight / Play internal track validation | MSTORE-02 | Blocked entirely on paid Apple Developer Program + Google Play Console accounts not yet created (D-01) | PARKED — not executable this phase; revisit once accounts exist, per D-02 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
