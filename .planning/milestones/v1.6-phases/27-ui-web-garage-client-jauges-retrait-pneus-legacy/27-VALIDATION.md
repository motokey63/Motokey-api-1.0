---
phase: 27
slug: ui-web-garage-client-jauges-retrait-pneus-legacy
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-15
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no jest/mocha/vitest) — hand-rolled Node scripts with `assert(caseName, label, condition, detail)` PASS/FAIL counters, `--case=` CLI flag convention |
| **Config file** | none — Wave 0 creates the new script |
| **Quick run command** | `node scripts/test-consommables-jauges.js --case=structure` (or per-case flag, static analysis, no DB) |
| **Full suite command** | `node scripts/test-consommables-jauges.js` (runs all cases) |
| **Estimated runtime** | ~10-20 seconds |

Precedent scripts to model the new test script on: `scripts/test-consommables-crud.js` (structure + live pg-direct cases), `tests/test-consommable-rappel-cron.js`, `tests/test-km-photos-cloudinary.js`. This phase is almost entirely frontend, so **most verification is structural (grep-based: dead code actually removed, new endpoint present, tab wired)** plus one live endpoint check for `GET /motos/:id/consommables`.

---

## Sampling Rate

- **After every task commit:** Run the relevant `--case=` subset (structure/static checks are free, fast)
- **After every plan wave:** Run full `node scripts/test-consommables-jauges.js` + a manual smoke check of both `app.html` and `MotoKey_Client.html` in a browser against a running local server (no headless browser test infra in this repo — manual visual check is the existing convention for frontend)
- **Before `/gsd:verify-work`:** Full suite must be green, plus `CLAUDE.md` correction diffed against actual code state
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01 Task 1 (harness itself) | 27-01 | 1 | GAUGE-01, GAUGE-02, CONSO-04 | infra (creates all 5 cases, RED baseline) | `node --check scripts/test-consommables-jauges.js` | ❌ W0 (this task creates it) | ⬜ pending |
| 27-02 Task 1 (migration 25 + allow-list trim) | 27-02 | 2 | CONSO-04 | live pg-direct against FRESH_DB_URL (skips cleanly if unset) | `node --check supabase.js && node scripts/test-consommables-jauges.js --case=migration` | ✅ (27-01) | ⬜ pending |
| 27-02 Task 2 (jaugeConsommables.js) | 27-02 | 2 | GAUGE-02 | unit-style (pure function, no DB) | `node scripts/test-consommables-jauges.js --case=jauge-generale-logic` | ✅ (27-01) | ⬜ pending |
| 27-02 Task 3 (GET /motos/:id/consommables) | 27-02 | 2 | GAUGE-01 | hybrid (structural always; live if JAUGES_TEST_* env set) | `node --check motokey-api.js && node scripts/test-consommables-jauges.js --case=endpoint-shape` | ✅ (27-01) | ⬜ pending |
| 27-03 Task 1 (garage Consommables tab) | 27-03 | 3 | GAUGE-01, GAUGE-02 | structural (grep) | `node scripts/test-consommables-jauges.js --case=frontend-structure` | ✅ (27-01) | ⬜ pending |
| 27-03 Task 2 (remove legacy Pneus dead code + dashboard chip) | 27-03 | 3 | CONSO-04, GAUGE-01 | structural (grep for `renderPneus`, `'pneus'`, dead nav entries) | `node scripts/test-consommables-jauges.js --case=dead-code-removed` | ✅ (27-01) | ⬜ pending |
| 27-03 Task 3 (correct CLAUDE.md) | 27-03 | 3 | CONSO-04 | structural (grep, CLAUDE.md substring check) | `node scripts/test-consommables-jauges.js --case=dead-code-removed` | ✅ (27-01) | ⬜ pending |
| 27-04 Task 1 (client gauges section) | 27-04 | 3 | GAUGE-01, GAUGE-02, CONSO-04 | structural (grep) | `node scripts/test-consommables-jauges.js --case=frontend-structure` | ✅ (27-01) | ⬜ pending |
| 27-04 Task 2 (client photo upload wiring) | 27-04 | 3 | CONSO-04 (D-10) | structural (grep) | `node scripts/test-consommables-jauges.js --case=frontend-structure` | ✅ (27-01) | ⬜ pending |

---

## Wave 0 Requirements

- [x] `scripts/test-consommables-jauges.js` — covered by 27-01 Task 1 (Wave 1), new script with 5 cases per the table above, modeled on `scripts/test-consommables-crud.js`'s `--case=` convention. Not yet executed — this checkbox tracks that the plan exists, not that the harness has run.
- [x] No shared fixtures needed beyond what `scripts/test-consommables-crud.js` and `scripts/test-releves-km-trigger.js` already establish (moto with `proprietaire_type='garage'`, required by RLS/CHECK constraints per STATE.md Phase 23 learnings)
- [x] Framework install: none — no new dependency

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Garage sees 9 gauges + weakest-link gauge rendered correctly in fiche moto tab | GAUGE-01, GAUGE-02 | No headless browser test infra in repo (no Playwright/Puppeteer dependency) | Open `app.html` locally against a running server, navigate to a moto fiche, open the new Consommables tab, visually confirm bars/colors/badges match `pct_usure`/`etat` |
| Client sees same gauges + "Ajouter une photo" button works per consommable | GAUGE-01, GAUGE-02 | Same — no headless browser infra | Open `MotoKey_Client.html` locally, view a moto card, confirm gauge section renders and photo upload button triggers multipart upload |
| Dashboard consommables chip renders correctly | GAUGE-01 | Same — no headless browser infra | Open garage dashboard, confirm chip pattern matches `alerteEntretienChip()` styling |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 27-01 Task 1 creates the harness (Wave 0); every task in 27-02/27-03/27-04 has an `<automated>` verify command per the map above
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — every task across all 4 plans has one
- [x] Wave 0 covers all MISSING references — `scripts/test-consommables-jauges.js` (27-01 Task 1) is the only new test infra needed
- [x] No watch-mode flags — all commands are one-shot (`node --check`, `node scripts/... --case=...`)
- [x] Feedback latency < 20s — structural/pure cases are grep/in-process, no network
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-15
