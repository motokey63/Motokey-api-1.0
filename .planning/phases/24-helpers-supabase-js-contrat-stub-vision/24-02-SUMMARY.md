---
phase: 24-helpers-supabase-js-contrat-stub-vision
plan: 02
subsystem: database
tags: [supabase, crud-helpers, upsert, vision-contract, jsonb]

# Dependency graph
requires:
  - phase: 23-schema-anti-fraude-km
    provides: "consommables, photos_consommables, releves_km, releves_km_rejets tables (migration 23, applied to prod), RelevesKm.enregistrer() helper"
provides:
  - "Consommables.upsert()/listByMoto() CRUD helpers in supabase.js"
  - "PhotosConsommables.insert()/listByConsommable() CRUD helpers persisting the vision-contract output fields (analyse_ia JSONB, analyse_status)"
  - "scripts/test-consommables-crud.js — structural + pg-direct verification harness"
affects: [25-endpoints-cloudinary, 27-ui-web-garage-client, 28-ui-mobile-client]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Upsert with onConflict for tables modeling current-state-per-key (UNIQUE constraint), not insert (avoids 23505 on re-entry)"
    - "Denormalized column (type_consommable on photos_consommables) always written explicitly alongside the FK — never left to a join"
    - "Static-analysis + pg-direct dual verification for supabase.js helpers, avoiding a second Supabase REST credential (pattern established Phase 23 KM-04)"

key-files:
  created:
    - scripts/test-consommables-crud.js
  modified:
    - supabase.js

key-decisions:
  - "Consommables write path is upsert(onConflict: moto_id,type_consommable), not insert — the table models current state per consumable type, matching the UNIQUE constraint from migration 23"
  - "PhotosConsommables.insert() requires callers to pass both consommable_id (FK) and type_consommable (denormalized, no CHECK) explicitly — no derivation/lookup, per research pitfall #5"
  - "No RelevesKm read helper added — enregistrer() from Phase 23 is confirmed sufficient (YAGNI, research open question #1 deferred)"
  - "Verification split into --case=structure (static regex on supabase.js source, no DB) and --case=upsert-behavior (pg-direct against FRESH_DB_URL, disposable project) — same decision rationale as Phase 23 KM-04, avoids a second Supabase REST credential"

patterns-established:
  - "Thin CRUD helper style (CataloguePieces) extended to two new domain tables — objet littéral, async methods, manual required-field validation, [Context] message errors"

requirements-completed: [VISION-02]

# Metrics
duration: 3min
completed: 2026-07-14
---

# Phase 24 Plan 02: Consommables + PhotosConsommables Helpers Summary

**Thin CRUD helpers (upsert-based Consommables, insert/list PhotosConsommables) added to supabase.js, persisting the vision-analysis contract's analyse_ia JSONB + analyse_status fields — the sole DB access frontier for both new tables, live-verified 22/22 against a disposable Supabase project.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-14T15:36:31Z
- **Completed:** 2026-07-14T15:39:00Z
- **Tasks:** 2 completed
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- `Consommables.upsert()`/`listByMoto()` added to supabase.js, using `onConflict: 'moto_id,type_consommable'` to match the migration-23 UNIQUE constraint — re-saisie of the same consumable type updates instead of raising 23505.
- `PhotosConsommables.insert()`/`listByConsommable()` added, persisting both the `consommable_id` FK and the denormalized `type_consommable` column, plus the vision-contract output fields `analyse_ia` (JSONB) and `analyse_status` — the persistence link that Phase 27/28 gauges will consume identically.
- Both helpers exported from `module.exports`; `RelevesKm` left untouched — confirmed sufficient as-is (no speculative read helper added).
- New `scripts/test-consommables-crud.js`: `--case=structure` (static regex verification of supabase.js, no DB) and `--case=upsert-behavior` (pg-direct against `FRESH_DB_URL`, disposable Supabase project `xjgyoehennuydoocbprj`) — both live-executed and green (22/22 assertions).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Consommables + PhotosConsommables to supabase.js and export them** - `a887063` (feat)
2. **Task 2: Create scripts/test-consommables-crud.js (structural + pg-direct)** - `7c22a9e` (test)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `supabase.js` - Added `Consommables` (upsert/listByMoto) and `PhotosConsommables` (insert/listByConsommable) objects after `CataloguePieces`; extended `module.exports`.
- `scripts/test-consommables-crud.js` (new) - Structural (`--case=structure`) and pg-direct (`--case=upsert-behavior`) verification harness, mirroring `scripts/test-releves-km-trigger.js` style (PASS/FAIL, `--case=`, anti-prod guard, exit 1 on failure).

## Decisions Made
- Upsert (not insert) for `Consommables.upsert()` — matches the UNIQUE(moto_id, type_consommable) constraint; a naive insert would raise 23505 on any re-saisie (mécano correcting km_montage later, Phase 25).
- `PhotosConsommables.insert()` requires the denormalized `type_consommable` to be passed explicitly by the caller (no CHECK constraint on that column) — avoids a future join divergence (research pitfall #5).
- No `RelevesKm` read helper added — `enregistrer()` (Phase 23) is confirmed sufficient; open research question #1 formally deferred.
- Verification executed live against the disposable Supabase project (`.env`'s `FRESH_DB_URL`, copied temporarily into this isolated worktree from the main checkout, then removed before commit — never staged, matches the anti-prod / no-new-credential discipline established in Phase 23 KM-04).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both `node --check` runs, all Task 1 acceptance-criteria greps, and both test-script cases (`structure` 15/15, `upsert-behavior` 7/7) passed on first attempt.

## User Setup Required

None - no external service configuration required. (`FRESH_DB_URL` already existed in `.env` from Phase 23; no new credential introduced.)

## Next Phase Readiness

- Phase 25 (endpoints + Cloudinary) can now call `Consommables.upsert()`/`listByMoto()` and `PhotosConsommables.insert()`/`listByConsommable()` directly — no further DB-access-layer work needed for these two tables.
- The `analyse_ia`/`analyse_status` persistence path is proven end-to-end (pg-direct) ahead of Phase 24 Plan 01's vision stub and Phase 25's real endpoint wiring.
- No blockers.

---
*Phase: 24-helpers-supabase-js-contrat-stub-vision*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: supabase.js
- FOUND: scripts/test-consommables-crud.js
- FOUND: a887063 (Task 1 commit)
- FOUND: 7c22a9e (Task 2 commit)
