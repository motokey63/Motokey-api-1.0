---
phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy
plan: 02
subsystem: api
tags: [node, express, supabase, consommables, jauges, migration, rest-endpoint]

# Dependency graph
requires:
  - phase: 26-cron-de-rappel-push-badge
    provides: consommables/photos_consommables schema (migration 23), Consommables/PhotosConsommables helpers, TYPES_CONSOMMABLES (supabase.js)
provides:
  - "GET /motos/:id/consommables — single HTTP source of per-consommable gauge data (9 typed items + weakest-link jauge_generale) for both app.html and MotoKey_Client.html"
  - "services/jaugeConsommables.js — pure computeJaugeGenerale(items) + async buildConsommablesJauges(moto_id) join helper"
  - "sql/migrations/25_migrate_pneus_to_consommables.sql — idempotent forward-copy of legacy motos.pneu_av/pneu_ar/pneu_km_montage into consommables rows (CONSO-04), pending manual apply by Mehdi"
  - "supabase.js Motos.update allow-list trimmed to ['couleur','photo_url'] — app layer no longer writes pneu_* fields"
affects: [27-03, 27-04, 28]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Weakest-link gauge algorithm: max(pct_usure) among has_data items, never an average — etat is monotone non-decreasing in pct_usure so max pct_usure always carries the most-severe etat, no separate tie-break"
    - "has_data gated on an analysed photo (analyse_ia.pct_usure present), not on consommable row existence — a row with no photo yet stays 'Non renseigné', never a fabricated 0%/100%"

key-files:
  created:
    - sql/migrations/25_migrate_pneus_to_consommables.sql
    - services/jaugeConsommables.js
  modified:
    - supabase.js
    - motokey-api.js

key-decisions:
  - "computeJaugeGenerale never averages pct_usure across consommables — it returns the single item with the max pct_usure (D-03), matching the 'weakest link' product framing rather than a blended score"
  - "GET /motos/:id/consommables does not enrich the 4 existing GET /motos[/:id] paths (research explicitly rejected touching those) — one new dedicated endpoint instead"
  - "Migration 25 does not DROP COLUMN — legacy pneu_av/pneu_ar/pneu_km_montage columns stay on motos this phase, cleanup deferred to a future plan once the copy is validated in prod by Mehdi"

requirements-completed: [GAUGE-01, GAUGE-02, CONSO-04]

# Metrics
duration: 20min
completed: 2026-07-15
---

# Phase 27 Plan 02: Backend Endpoint + Migration (Jauges Consommables) Summary

**New `GET /motos/:id/consommables` endpoint exposes 9 typed consommable gauges plus a weakest-link `jauge_generale` via a pure, unit-tested algorithm; migration 25 forward-copies legacy pneus data into `consommables` rows without touching legacy columns; the app layer no longer writes `pneu_*` fields.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-15T21:30:00Z (approx.)
- **Completed:** 2026-07-15T21:53:09Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `services/jaugeConsommables.js` created with a pure `computeJaugeGenerale(items)` (weakest-link, never an average, null when no data) and an async `buildConsommablesJauges(moto_id)` join helper across the 9 canonical `TYPES_CONSOMMABLES`
- `GET /motos/:id/consommables` route added in `motokey-api.js`, mirroring the CONSO-01 boilerplate exactly, scoped CLIENT + MECANO+ via `resolveMotoForCtx` with the same generic 404 semantics
- `sql/migrations/25_migrate_pneus_to_consommables.sql` created — idempotent `ON CONFLICT (moto_id, type_consommable) DO UPDATE`, no `DROP COLUMN`
- `supabase.js` `Motos.update` allow-list trimmed from `['pneu_av','pneu_ar','pneu_km_montage','couleur','photo_url']` to `['couleur','photo_url']` — closes the last app-layer write path to legacy pneus fields
- Wave 0 harness (`scripts/test-consommables-jauges.js`, delivered in 27-01) turned GREEN for this plan's scope: `jauge-generale-logic` 4/4 PASS, `endpoint-shape` structural 2/2 PASS (live sub-check SKIPs cleanly without `JAUGES_TEST_*` env vars), `migration` SKIPs cleanly without `FRESH_DB_URL`

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 25 (pneus → consommables) + trim pneu_* from Motos.update allow-list** - `0327d4c` (feat)
2. **Task 2: services/jaugeConsommables.js — pure computeJaugeGenerale + async buildConsommablesJauges** - `bc68ffa` (feat)
3. **Task 3: GET /motos/:id/consommables endpoint in motokey-api.js** - `c086b89` (feat)

**Plan metadata:** (pending — final docs commit below)

_Note: Task 2 is marked `tdd="true"` in the plan, but its RED test assertions already existed from the Wave 0 harness (27-01, commit `1d2574c`) — no separate RED commit was needed this plan; implementation directly turned the pre-existing assertions GREEN._

## Files Created/Modified
- `sql/migrations/25_migrate_pneus_to_consommables.sql` - idempotent forward-copy of legacy `motos.pneu_av/pneu_ar/pneu_km_montage` into `consommables` rows via `ON CONFLICT DO UPDATE`; manual-apply only, no `DROP COLUMN`
- `services/jaugeConsommables.js` - `computeJaugeGenerale(items)` (pure, weakest-link) + `buildConsommablesJauges(moto_id)` (async join of `Consommables.listByMoto` + `PhotosConsommables.listByConsommable`, lazy `require('../supabase')`)
- `supabase.js` - `Motos.update` allow-list trimmed to `['couleur','photo_url']`; inline comment updated to document the CONSO-04/Phase 27 retirement
- `motokey-api.js` - new `require('./services/jaugeConsommables')` + `GET /motos/:id/consommables` route handler placed immediately after the CONSO-01 `POST /motos/:id/consommables` block

## Decisions Made
- No new decisions beyond what the plan already specified (D-03/D-04 weakest-link semantics were locked in the plan text itself, implemented verbatim)

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched the plan's `<action>` code blocks and `<read_first>` interface contracts without modification.

## Issues Encountered

None.

## User Setup Required

- **Migration 25 still requires manual application by Mehdi via Supabase Dashboard > SQL Editor** (per project convention — no migration in this repo is auto-run against prod). Until applied, `GET /motos/:id/consommables` will simply show `has_data:false` for `pneu_av`/`pneu_ar` on motos whose only tire data lives in the legacy `motos.pneu_av`/`pneu_ar` columns (no crash, no fabricated value — same D-04 null-safety as any other consommable type without a photo yet).
- **Cloudinary credentials remain unprovisioned** (pre-existing blocker since Phase 25, `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` absent from Railway `motokey1.1`) — CONSO-03 photo upload still 503s `CLOUDINARY_NOT_CONFIGURED` (D-02, by design). This means no real gauge data (`has_data:true`) can be produced in prod until Mehdi provisions these vars — not a Phase 27 defect, carried forward as a known gap.

## Next Phase Readiness
- `GET /motos/:id/consommables` is ready for 27-03 (`app.html` UI) and 27-04 (`MotoKey_Client.html` UI + legacy pneus dead-code removal) to consume
- `scripts/test-consommables-jauges.js --case=frontend-structure` and `--case=dead-code-removed` remain RED as expected — out of scope for this plan, targeted by 27-03/27-04
- No blockers for 27-03.

---
*Phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: sql/migrations/25_migrate_pneus_to_consommables.sql
- FOUND: services/jaugeConsommables.js
- FOUND: 0327d4c
- FOUND: bc68ffa
- FOUND: c086b89
