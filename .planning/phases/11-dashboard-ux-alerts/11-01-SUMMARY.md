---
phase: 11-dashboard-ux-alerts
plan: 01
subsystem: ui
tags: [supabase, dashboard, entretien, alerte, km]

# Dependency graph
requires: []
provides:
  - "Motos.list() enriched with alerte_entretien (boolean) and pct_max_usage (number) via batch plan_entretien JOIN"
  - "alerteEntretienChip() helper rendering yellow/red chip on dashboard cards"
  - "renderDashboard() integrates chip under score badge for revision alerts"
affects: [future-maintenance-alerts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backend enrichment pattern: Motos.list() batch-fetches related table data (plan_entretien) in single query, computes derived fields, returns enriched rows — no new DB columns"
    - "Frontend chip pattern: helper function returns '' for falsy case, non-empty HTML for alert case — zero CSS overhead via class reuse"

key-files:
  created: []
  modified:
    - supabase.js
    - app.html

key-decisions:
  - "D-01: Single batch .in('moto_id', ids) query for all motos — no N+1 queries"
  - "D-02: pct_max_usage = max(pct) over all operations, uncapped — seuil >=100 detectable frontend"
  - "D-03: alerte_entretien = false if no plan_entretien operations — no default alert"
  - "D-04: Reuse existing CSS classes score-badge/score-jaune/score-rouge — no new CSS"
  - "D-05: UX-01 already covered by existing .score-badge.score-rouge — no code change needed"

patterns-established:
  - "Enrichissement calculé à l'affichage: no DB field, batch JOIN in JS backend, virtual fields returned in response"

requirements-completed: [UX-02]

# Metrics
duration: 4min
completed: 2026-06-30
---

# Phase 11 Plan 01: Dashboard UX Alerts Summary

**Motos.list() enriched with batch plan_entretien JOIN computing pct_max_usage per moto, chips "Révision dépassée" (rouge) and "Révision à planifier" (jaune) rendered directly on dashboard cards via alerteEntretienChip() helper**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-30T20:01:15Z
- **Completed:** 2026-06-30T20:04:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `Motos.list()` fetches all `plan_entretien` rows for the current garage's motos in a single batch query, computes `pct_max_usage` (worst-case across operations) and `alerte_entretien` flag — no SQL migration, no new DB column
- `alerteEntretienChip(mo)` returns a chip HTML fragment (jaune at pct>=80, rouge at pct>=100, empty string otherwise) reusing `.score-badge`, `.score-jaune`, `.score-rouge` CSS
- `renderDashboard()` now displays the chip under the score badge on every moto card where `alerte_entretien=true`

## Task Commits

Each task was committed atomically:

1. **Task 1: Enrichir Motos.list() avec alerte_entretien + pct_max_usage** - `c416bd7` (feat)
2. **Task 2: Ajouter alerteEntretienChip() et l'intégrer dans renderDashboard()** - `96d909c` (feat)

## Files Created/Modified
- `supabase.js` — `Motos.list()` extended with batch plan_entretien JOIN + pct_max_usage/alerte_entretien computation
- `app.html` — `alerteEntretienChip()` helper added after `scoreLabel()`, called in `renderDashboard()` card template

## Decisions Made
- Used single batch `.in('moto_id', ids)` query instead of per-moto queries (D-01) — avoids N+1 at dashboard load
- `pct_max_usage` intentionally not capped at 100 so frontend can distinguish >=100 from 80-99 (D-02)
- Zero new CSS: reused `.score-badge`, `.score-jaune`, `.score-rouge` for chip styling (D-04)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. The only minor friction was that `Motos.list()` had a non-unique string match (another function nearby shared the same `return data;` pattern), resolved by including more surrounding context in the str_replace.

## User Setup Required

None — no external service configuration required. Changes are purely computational (no DB migration).

## Next Phase Readiness
- UX-02 alerte entretien fully delivered: chip visible on dashboard cards, computed from existing `plan_entretien` data
- UX-01 (badge rouge score < 40) already covered by existing `.score-badge.score-rouge` class applied when `couleur_dossier === 'rouge'` — no new code needed, per D-05
- Phase 11 complete if Plan 02 not needed; otherwise ready to proceed

---
*Phase: 11-dashboard-ux-alerts*
*Completed: 2026-06-30*
