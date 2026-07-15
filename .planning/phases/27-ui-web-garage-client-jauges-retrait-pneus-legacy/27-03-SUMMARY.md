---
phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy
plan: 03
subsystem: ui
tags: [html, vanilla-js, garage-frontend, consommables, jauges, dead-code-removal]

# Dependency graph
requires:
  - phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy (plan 02)
    provides: "GET /motos/:id/consommables endpoint (services/jaugeConsommables.js), migration 25, mo.consommables_en_retard/rappel_photo_en_retard on Motos.list()/getById() (Phase 26 GAUGE-04)"
provides:
  - "Garage Consommables tab on fiche moto (app.html): loadConsommables/renderConsommables/jaugeBarConso consuming GET /motos/:id/consommables — 9 per-type gauges + weakest-link general gauge"
  - "Non renseigné / Pas encore suivi empty-state handling matching D-01/D-02/D-04"
  - "Dashboard consommables chip (consoChip) reusing alerteEntretienChip pattern, wired to existing GAUGE-04 fields, no N+1 fetch"
  - "Full removal of legacy Pneus surface: nav() route, highlightNav label, renderPneus/loadPneus/changerMotoPneus, and the false-precision km>=8000 heuristic"
  - "CLAUDE.md corrected — Pneus section now documents the Phase 27 removal + Consommables tab instead of falsely claiming renderPneus() was already gone"
affects: [27-04, 28]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tab-slot replacement: new feature reuses the exact tabDefs array position/id of the removed feature (D-05) rather than appending, preserving nav muscle memory"
    - "Dashboard badge chips read pre-computed backend fields (consommables_en_retard/rappel_photo_en_retard) at render time — never trigger a per-card fetch"

key-files:
  created: []
  modified:
    - app.html
    - CLAUDE.md

key-decisions:
  - "General gauge card renders even with jauge_generale===null (Pas encore suivi state) rather than being hidden, per D-04 — the empty state is itself informative"
  - "Legacy Pneus block removed as a single contiguous deletion (nav route + label + all 3 functions) in one task rather than function-by-function, since none of it had callers left after the tab-slot swap in Task 1"

requirements-completed: [GAUGE-01, GAUGE-02, CONSO-04]

# Metrics
duration: 20min
completed: 2026-07-15
---

# Phase 27 Plan 03: Garage UI Jauges + Retrait Pneus Legacy Summary

**Garage fiche moto gets a "Consommables" tab (same slot as the old "Pneus" tab) rendering 9 per-type wear gauges plus a weakest-link general gauge from `GET /motos/:id/consommables`, the dashboard gets a matching chip, and every trace of the legacy km-heuristic Pneus code is deleted from `app.html` and corrected in `CLAUDE.md`.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-15T21:53:00Z (approx., immediately after 27-02)
- **Completed:** 2026-07-15T22:07:44Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- `tabDefs` entry `{id:'pneus', label:'Pneus'}` replaced in-place by `{id:'consommables', label:'Consommables'}` — same tab position (2nd), no layout shift
- `renderFicheTabContent()` branches to new `loadConsommables(mo.id)` instead of `loadPneus(mo.id)`
- New `loadConsommables`/`renderConsommables`/`jaugeBarConso` functions added: fetch `/motos/:id/consommables`, render a top "État général" card (weakest-link badge or "Pas encore suivi" neutral state) plus a detail card with one horizontal bar+badge per consommable type, using `LABELS_CONSO` (French garage-technical labels) and `ETAT_CLASS` (bon/moyen/usé/critique → score-vert/bleu/jaune/rouge, matching the Phase 24 D-01 contract) — items with `has_data:false` render a dimmed "Non renseigné" badge instead of a fabricated percentage
- Legacy Pneus surface fully deleted: `nav()` `pneus` route, `highlightNav()` `pneus:'Pneus'` label entry, and the `renderPneus()`/`changerMotoPneus()`/`loadPneus()` block (including the `kmParcourus >= 8000` false-precision estimate) — no dangling references (`motoSelect()` helper confirmed still used by 2 other call sites, not orphaned)
- New `consoChip(mo)` helper added next to `alerteEntretienChip`, reusing the identical `score-badge score-jaune` pattern; wired into `renderDashboard()` card template alongside `alerteEntretienChip(mo)`; reads the already-exposed `consommables_en_retard`/`rappel_photo_en_retard` fields (GAUGE-04, live since Phase 26) — zero additional network calls
- `CLAUDE.md` "### Pneus" section corrected: previously claimed `renderPneus()` "a été supprimée" while it still existed (false); now documents the actual Phase 27 removal, the replacement Consommables tab, its 9 types + weakest-link gauge, and the dashboard chip

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace Pneus tab with Consommables tab + gauges (GAUGE-01/02)** - `eb0d255` (feat)
2. **Task 2: Remove legacy Pneus dead code + add dashboard consommables chip (CONSO-04, GAUGE-01)** - `927a594` (feat)
3. **Task 3: Correct CLAUDE.md Pneus documentation (CONSO-04)** - `4826d87` (docs)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP update, committed separately below)

## Files Created/Modified
- `app.html` - tabDefs slot swap, renderFicheTabContent branch swap, new Consommables render/load functions, nav()/highlightNav()/legacy function block removal, new consoChip + dashboard wiring
- `CLAUDE.md` - "### Pneus" section rewritten to reflect the actual post-Phase-27 state instead of a stale false claim

## Decisions Made
No new decisions beyond what 27-CONTEXT.md already locked (D-01 through D-08 implemented verbatim: neutral empty states, weakest-link exclusion already handled server-side in 27-02, tab-slot reuse, badge/bar styling reuse, dashboard chip pattern reuse).

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched the plan's `<action>` code blocks verbatim, including the exact function bodies specified for `jaugeBarConso`/`renderConsommables`/`loadConsommables`/`consoChip`.

## Issues Encountered

**Worktree behind master:** This executor's worktree branch (`worktree-agent-a4394a1612c16e4b6`) had not yet merged the 27-01/27-02 commits that landed on `master` (test harness `scripts/test-consommables-jauges.js`, `services/jaugeConsommables.js`, the `GET /motos/:id/consommables` endpoint, and migration 25) — this plan's `depends_on: ["27-02"]` prerequisite was physically missing from the branch. Resolved with a clean fast-forward `git merge master` (no conflicts, 18 files) before starting Task 1. Not a plan deviation — a parallel-worktree environment sync issue, resolved before any task work began.

## User Setup Required

None - no external service configuration required. (Migration 25 and Cloudinary credentials remain pending from 27-02/Phase 25, unrelated to this plan's frontend-only scope.)

## Next Phase Readiness
- `app.html` Consommables tab + dashboard chip are ready for manual smoke test (per `27-VALIDATION.md`) against a running local server
- 27-04 (`MotoKey_Client.html` client-side jauges + upload button) can proceed independently — the `frontend-structure` test's `MotoKey_Client.html` assertions (uploadConsoPhoto, Consommables section marker, pneusHtml removal) remain intentionally RED, targeted by 27-04
- Known product gap (RESEARCH Pitfall 2 / Open Question 2, expected under locked scope): with no garage-side CONSO-01 data-entry form in the UI (only the API exists), non-pneu consommables on garage-only motos will show "Non renseigné" indefinitely until a future plan adds a garage entry form — not a defect of this plan.

---
*Phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: app.html (function loadConsommables, renderConsommables, jaugeBarConso, consoChip)
- FOUND: CLAUDE.md (Consommables section)
- FOUND: eb0d255
- FOUND: 927a594
- FOUND: 4826d87
