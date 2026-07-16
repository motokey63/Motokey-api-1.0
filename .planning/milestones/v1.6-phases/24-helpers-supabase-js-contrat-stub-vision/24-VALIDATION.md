---
phase: 24
slug: helpers-supabase-js-contrat-stub-vision
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-14
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — confirmed project-wide convention (`package.json` `"test": "node test-api.js"`, hand-rolled). Phase 23 established the precedent (`23-VALIDATION.md`) of a standalone Node script, no Jest/Mocha introduced. |
| **Config file** | none — see Wave 0 |
| **Quick run command** | `node --check services/visionAnalysisService.js && node --check supabase.js` |
| **Full suite command** | `node scripts/test-vision-stub.js` (new, Wave 0) |
| **Estimated runtime** | ~5-10s (most cases need zero DB connection; only CRUD-helper cases touch `FRESH_DB_URL`, already provisioned from Phase 23) |

---

## Sampling Rate

- **After every task commit:** `node --check <changed file>` + the specific `--case=` slice relevant to what was just written.
- **After every plan wave:** Full `node scripts/test-vision-stub.js` (all cases).
- **Before `/gsd:verify-work`:** Full suite must be green.
- **Max feedback latency:** ~10 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-0N-0N | TBD | 1 | VISION-01 | unit (direct require, no HTTP) | `node scripts/test-vision-stub.js --case=flag-gated-stub` | ❌ W0 | ⬜ pending |
| 24-0N-0N | TBD | 1 | VISION-01 | unit (D-06 fallback + warning) | `node scripts/test-vision-stub.js --case=inconsistent-config-fallback` | ❌ W0 | ⬜ pending |
| 24-0N-0N | TBD | 1 | VISION-02 | unit (contract shape) | `node scripts/test-vision-stub.js --case=contract-shape` | ❌ W0 | ⬜ pending |
| 24-0N-0N | TBD | 1 | VISION-02 | unit (D-04 determinism) | `node scripts/test-vision-stub.js --case=deterministic-seed` | ❌ W0 | ⬜ pending |
| 24-0N-0N | TBD | 1 | VISION-02 | unit (D-02/D-03 derivation, table-driven) | `node scripts/test-vision-stub.js --case=derivation-thresholds` | ❌ W0 | ⬜ pending |
| 24-0N-0N | TBD | 1 | VISION-01/02 | unit (isolated call, success criterion #3) | `node scripts/test-vision-stub.js --case=isolated-call` | ❌ W0 | ⬜ pending |
| 24-0N-0N | TBD | 1-2 | (success criterion #4) | integration (`FRESH_DB_URL` throwaway project) | `node scripts/test-vision-stub.js --case=crud-helpers` (or a dedicated `scripts/test-consommables-crud.js`, planner's naming choice) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/test-vision-stub.js` — new, mirrors `scripts/test-releves-km-trigger.js`'s PASS/FAIL/`assert()`/`--case=` harness style. Most cases are pure-function (no DB); only CRUD-helper cases need `FRESH_DB_URL` (already in `.env` since Phase 23 — no new human checkpoint required). Should sanity-check the throwaway project's schema is still live (e.g. `SELECT to_regclass('public.consommables')`) before running CRUD assertions.
- [ ] No framework install needed — hand-rolled Node script convention already established (Phase 23 precedent).

---

## Manual-Only Verifications

*All phase behaviors have automated verification — no live UI, no HTTP endpoint in this phase (endpoints are Phase 25 scope).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`scripts/test-vision-stub.js`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
