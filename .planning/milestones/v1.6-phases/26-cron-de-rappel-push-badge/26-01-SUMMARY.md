---
phase: 26-cron-de-rappel-push-badge
plan: 01
subsystem: database
tags: [postgresql, supabase, schema-migration, testing]

# Dependency graph
requires:
  - phase: 23-schema-anti-fraude-km
    provides: tables consommables/photos_consommables (migration 23)
provides:
  - Migration 24 (3 colonnes d'état de rappel : dernier_rappel_envoye_at, dernier_rappel_km, km_a_la_photo)
  - Parité schema.sql pour ces 3 colonnes (discipline v1.6)
  - Squelette de test Wave 0 tests/test-consommable-rappel-cron.js
affects: [26-02-fonction-retard-pure, 26-03-cron-endpoint-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration légère ADD COLUMN (pattern migration 18) réutilisé pour état de notification"
    - "Squelette de test Wave 0 (skeleton-then-fill) répliquant tests/test-km-photos-cloudinary.js"

key-files:
  created:
    - sql/migrations/24_consommables_rappel_state.sql
    - tests/test-consommable-rappel-cron.js
  modified:
    - schema.sql

key-decisions:
  - "Aucun trigger DB ajouté — D-05 (reset dernier_rappel_envoye_at à NULL à l'upload d'une nouvelle photo) reste une décision applicative JS, câblée en 26-02, pas un trigger Postgres"

patterns-established:
  - "Squelette de test Wave 0 (sections stub + exit 0 garanti) — pattern à répliquer si d'autres phases futures ont un plan 01 fondations-only"

requirements-completed: [GAUGE-03, GAUGE-04]

# Metrics
duration: 5min
completed: 2026-07-15
---

# Phase 26 Plan 01: Fondations DB + squelette test (rappel photo consommables) Summary

**Migration 24 ajoute 3 colonnes d'état de rappel (dernier_rappel_envoye_at, dernier_rappel_km, km_a_la_photo) avec parité schema.sql immédiate, et pose le squelette de test Wave 0 que 26-02/26-03 rempliront.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-15T08:48:05Z
- **Completed:** 2026-07-15T08:50:31Z
- **Tasks:** 2
- **Files modified:** 3 (1 migration créée, 1 test créé, schema.sql modifié)

## Accomplishments
- `sql/migrations/24_consommables_rappel_state.sql` créé : ajoute `consommables.dernier_rappel_envoye_at` (TIMESTAMPTZ), `consommables.dernier_rappel_km` (INTEGER), `photos_consommables.km_a_la_photo` (INTEGER), avec commentaires de colonne documentant D-04/D-05/D-07
- `schema.sql` mis à jour dans le même commit (discipline v1.6) — parité vérifiée par grep
- `tests/test-consommable-rappel-cron.js` créé, squelette Wave 0 avec 3 sections stub (`[UNIT]`, `[GAUGE-03]`, `[GAUGE-04]`), tourne et sort exit 0 sans serveur ni DB

## Task Commits

1. **Task 1: Migration 24 (colonnes rappel + km_a_la_photo) + parité schema.sql** - `522d9b4` (feat)
2. **Task 2: Squelette de test Wave 0 (tests/test-consommable-rappel-cron.js)** - `c704e3e` (test)

**Plan metadata:** (à suivre — commit final docs)

## Files Created/Modified
- `sql/migrations/24_consommables_rappel_state.sql` - Nouvelle migration : 3 colonnes d'état de rappel (D-04/D-07)
- `schema.sql` - Parité inline dans `CREATE TABLE consommables` et `CREATE TABLE photos_consommables`
- `tests/test-consommable-rappel-cron.js` - Squelette de test Wave 0 (harnais http brut, credentials seed, CRON_SECRET, 3 sections stub)

## Decisions Made
None - plan executed exactly as written. Le plan documentait déjà explicitement la décision de ne PAS ajouter de trigger DB (D-05 reste JS, câblé en 26-02).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. La migration 24 reste, comme toutes les migrations du repo, à appliquer manuellement en prod via Supabase Dashboard SQL Editor par Mehdi (pas fait dans ce plan — cohérent avec le pattern existant des migrations 20-23).

## Next Phase Readiness
- Colonnes DB prêtes pour 26-02 (fonction pure de calcul de retard, qui lira `dernier_rappel_envoye_at`/`dernier_rappel_km` et `km_a_la_photo`)
- Squelette de test prêt à être rempli section par section par 26-02 (unitaires) et 26-03 (intégration HTTP cron + endpoint GAUGE-04)
- Aucun blocage — migration légère, pas de dépendance externe

---
*Phase: 26-cron-de-rappel-push-badge*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: sql/migrations/24_consommables_rappel_state.sql
- FOUND: tests/test-consommable-rappel-cron.js
- FOUND: schema.sql contains km_a_la_photo
- FOUND: commit 522d9b4 (Task 1)
- FOUND: commit c704e3e (Task 2)
