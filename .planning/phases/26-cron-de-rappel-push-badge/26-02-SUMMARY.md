---
phase: 26-cron-de-rappel-push-badge
plan: 02
subsystem: api
tags: [cron, push, supabase, anti-fraude, badge]

# Dependency graph
requires:
  - phase: 26-01-fondations-db-squelette-test
    provides: migration 24 (dernier_rappel_envoye_at/dernier_rappel_km/km_a_la_photo) + squelette tests/test-consommable-rappel-cron.js
provides:
  - services/consommableRappelService.js (SEUILS D-01, isConsommableEnRetard pure, moisEcoules, runConsommableRappelCron)
  - supabase.js PhotosConsommables.insert() étendu (km_a_la_photo + reset D-05)
  - supabase.js Motos.list()/getById() champ calculé rappel_photo_en_retard + consommables_en_retard (GAUGE-04)
affects: [26-03-cron-endpoint-integration, 26-04-badge-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fonction pure de détection (isConsommableEnRetard) unique, réutilisée par le cron ET l'exposition badge via lazy require (évite le cycle supabase.js<->services/consommableRappelService.js)"
    - "Runner cron binaire (adapté de maintenanceAlertService.js Phase 17) : per-moto try/catch+continue, push groupé unique par moto, idempotencyKey variant avec le contenu"

key-files:
  created:
    - services/consommableRappelService.js
  modified:
    - supabase.js
    - tests/test-consommable-rappel-cron.js

key-decisions:
  - "Le badge garage (GAUGE-04) est calculé au read-time dans Motos.list()/getById(), jamais par le cron — le cron (GAUGE-03) ne scanne que les motos proprietaire_type='client'"
  - "moisEcoules() utilise une arithmétique calendaire (différence d'années*12 + différence de mois), jamais une division par 30 jours"

patterns-established:
  - "Lazy require('./services/consommableRappelService') à l'intérieur des méthodes Motos.list/getById (pas en tête de fichier supabase.js) pour éviter un cycle require"

requirements-completed: [GAUGE-03, GAUGE-04]

# Metrics
duration: 12min
completed: 2026-07-15
---

# Phase 26 Plan 02: Service de retard consommables + exposition badge Summary

**`services/consommableRappelService.js` créé avec la grille de seuils D-01 (9 types, km OU mois) et une fonction pure `isConsommableEnRetard` réutilisée à la fois par le futur cron (GAUGE-03) et par `supabase.js Motos.list()/getById()` pour le badge garage `rappel_photo_en_retard` (GAUGE-04), sans jamais dupliquer la logique de seuils.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-15T08:53:47Z
- **Completed:** 2026-07-15T09:06:48Z
- **Tasks:** 2
- **Files modified:** 3 (1 créé, 2 modifiés)

## Accomplishments
- `services/consommableRappelService.js` créé : grille `SEUILS` D-01 exacte (9 types), `LABELS` français, `moisEcoules()` calendaire, `isConsommableEnRetard()` pure (jamais d'exception, D-08 exclusion sans référence), `runConsommableRappelCron()` (lookup motos client uniquement, push groupé D-02, idempotencyKey variant avec le contenu, persistance par-consommable D-04, try/catch par moto)
- `supabase.js PhotosConsommables.insert()` étendu : capture `km_a_la_photo`, et applique le reset D-05 (`dernier_rappel_envoye_at`/`dernier_rappel_km` remis à NULL sur le consommable lié) juste après l'insert réussi, en JS non bloquant
- `supabase.js Motos.list()` et `Motos.getById()` exposent désormais `rappel_photo_en_retard` (bool) + `consommables_en_retard` (array), calculés au read-time sans nouvelle colonne DB, en réutilisant `isConsommableEnRetard` via un require paresseux
- 6 assertions unitaires pures ajoutées à `tests/test-consommable-rappel-cron.js` (section `[UNIT]`), aucun serveur ni DB requis, toutes vertes

## Task Commits

Each task was committed atomically:

1. **Task 1: services/consommableRappelService.js (seuils D-01, fonction pure, runner cron)** - `54a4f2e` (feat)
2. **Task 2: supabase.js — D-05 reset + km_a_la_photo + champ rappel_photo_en_retard** - `798e8f3` (feat)

**Plan metadata:** (à suivre — commit final docs)

## Files Created/Modified
- `services/consommableRappelService.js` - Grille de seuils D-01, fonction pure `isConsommableEnRetard`, `moisEcoules`, runner `runConsommableRappelCron` (GAUGE-03)
- `supabase.js` - `PhotosConsommables.insert()` capture `km_a_la_photo` + reset D-05 ; `Motos.list()`/`Motos.getById()` exposent `rappel_photo_en_retard`/`consommables_en_retard` (GAUGE-04)
- `tests/test-consommable-rappel-cron.js` - Section `[UNIT]` remplie avec 6 assertions pures sur `isConsommableEnRetard`/`moisEcoules`

## Decisions Made
None - plan executed exactly as written. Le plan documentait déjà explicitement le lazy require (évite le cycle `supabase.js` <-> `services/consommableRappelService.js`) et l'absence de trigger DB pour D-05.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Worktree stale à l'ouverture de la session.** Le worktree d'exécution (`C:\motokey-api\.claude\worktrees\agent-ae6593efa63aa6420`) était figé au commit de fin de Phase 23 (`ab0e1fa`) — les phases 24, 25 et le plan 26-01 (dont dépend ce plan : `Consommables`/`PhotosConsommables` dans `supabase.js`, la migration 24, le squelette de test) étaient absents. `.planning/` étant gitignored, ce répertoire n'est pas partagé entre worktrees et n'avait pas été resynchronisé. Vérifié que le HEAD du worktree était un ancêtre strict de `master` sans commit local unique (`git merge-base --is-ancestor HEAD master` + `git log master..HEAD` vide), puis fast-forward via `git merge --ff-only master` — opération non destructive, aucune perte de travail. Après synchronisation, `supabase.js` contenait bien `Consommables`/`PhotosConsommables` et le squelette de test Wave 0, permettant l'exécution normale du plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `services/consommableRappelService.js` exporte `SEUILS`, `LABELS`, `isConsommableEnRetard`, `moisEcoules`, `runConsommableRappelCron` — prêt à être branché sur un endpoint HTTP cron par 26-03
- `supabase.js` expose déjà `rappel_photo_en_retard`/`consommables_en_retard` sur `Motos.list()`/`getById()` — prêt pour l'UI badge garage (26-04) sans travail backend supplémentaire
- Aucun blocage — migration 24 déjà appliquée en local (schéma), reste à appliquer en prod par Mehdi (pattern habituel des migrations du repo, non fait dans ce plan)

---
*Phase: 26-cron-de-rappel-push-badge*
*Completed: 2026-07-15*

## Self-Check: PASSED

- FOUND: services/consommableRappelService.js
- FOUND: commit 54a4f2e (Task 1)
- FOUND: commit 798e8f3 (Task 2)
- FOUND: supabase.js contains rappel_photo_en_retard (3 occurrences) and dernier_rappel_envoye_at: null
- FOUND: node tests/test-consommable-rappel-cron.js exits 0 (6/6 unit assertions green)
