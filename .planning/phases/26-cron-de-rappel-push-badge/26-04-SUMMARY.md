---
phase: 26-cron-de-rappel-push-badge
plan: 04
subsystem: database, testing
tags: [supabase, postgres, cron, integration-test]

requires:
  - phase: 26-cron-de-rappel-push-badge (26-01/26-02/26-03)
    provides: migration 24 SQL file, consommableRappelService.js, cron endpoint, integration assertions
provides:
  - Migration 24 applied on prod DB (rzbqbaccjyxvtlnfitrr) — 3 columns live and REST-verified
  - GAUGE-03/GAUGE-04 integration assertions running for real (not skipped) and green
  - Root regression baseline confirmed intact (9/9)
affects: [phase-27, phase-28]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Gate validated via REST probe using SUPABASE_SECRET_KEY (new-format key) — the legacy JWT service_role/anon keys in .env are disabled project-wide since 2026-04-12 (Supabase legacy key deprecation), unrelated to this migration; supabase.js already prefers the new-format key with legacy as fallback, so app code is unaffected"

patterns-established: []

requirements-completed: [GAUGE-03, GAUGE-04]

duration: 15min
completed: 2026-07-15
---

# Phase 26: Cron de Rappel + Push/Badge — Gate Summary

**Migration 24 appliquée en prod par Mehdi ; suite d'intégration GAUGE-03/GAUGE-04 tourne réellement au vert (15 OK / 0 KO) contre la base réelle ; régression racine intacte (9/9).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-15T09:23:00Z
- **Completed:** 2026-07-15T09:38:00Z
- **Tasks:** 2/2 (1 checkpoint humain + 1 tâche auto)
- **Files modified:** 0 (aucun changement de code requis — 26-03 avait déjà les assertions correctes)

## Accomplishments
- Migration `sql/migrations/24_consommables_rappel_state.sql` appliquée en prod par Mehdi (Supabase Dashboard SQL Editor, `rzbqbaccjyxvtlnfitrr`), exécution propre confirmée
- Colonnes vérifiées via sonde REST (200 sur `consommables.dernier_rappel_envoye_at`/`dernier_rappel_km` et `photos_consommables.km_a_la_photo`)
- Suite d'intégration relancée serveur local + `CRON_SECRET` défini : GAUGE-03 (401 mauvais secret, 200 bon secret, scanned/notified numbers, notified:true premier passage, idempotence deuxième passage) et GAUGE-04 (`rappel_photo_en_retard` + `consommables_en_retard` présents, `GET /motos/:id` garage) — toutes actives, plus aucun skip pour colonne absente ou CRON_SECRET manquant
- Régression racine `test-api.js` : 9/9, baseline intact

## Task Commits

Aucun commit de code — ce plan est un gate de validation pure (migration prod + confirmation de suite verte), pas de changement de fichier suivi par git à part ce SUMMARY et les mises à jour STATE/ROADMAP.

**Plan metadata:** (à committer avec ce SUMMARY, STATE.md, ROADMAP.md)

## Files Created/Modified
- Aucun fichier de code — `tests/test-consommable-rappel-cron.js` listé dans `files_modified` du plan n'a nécessité aucun changement, les assertions du plan 26-03 étaient déjà correctes une fois la migration en place.

## Decisions Made
- Sonde REST post-migration effectuée avec `SUPABASE_SECRET_KEY` (nouveau format `sb_secret_*`) plutôt que `SUPABASE_SERVICE_KEY` (JWT legacy) — ce dernier retourne 401 "Legacy API keys are disabled" (désactivation Supabase du 2026-04-12, non liée à cette migration). `supabase.js` utilise déjà `SUPABASE_SECRET_KEY` en priorité (voir L38-39), donc aucun impact sur le code applicatif — seule ma sonde manuelle ad-hoc devait utiliser la bonne variable.

## Deviations from Plan

None - plan exécuté exactement comme écrit. Aucune assertion n'a échoué réellement (0 KO), donc aucune correction de code n'a été nécessaire dans 26-02/26-03.

## Issues Encountered
- Sonde REST initiale a échoué en 401 avec la clé JWT legacy (`SUPABASE_SERVICE_KEY`) — diagnostiqué comme désactivation de clé legacy côté Supabase (non un problème de migration). Résolu en utilisant `SUPABASE_SECRET_KEY`, qui a confirmé les 3 colonnes en 200.

## Note opérationnelle — scheduler externe (non bloquant)

À confirmer avec Mehdi : le scheduler externe (Railway cron ou équivalent) qui appelle déjà `POST /cron/maintenance-alerts` a-t-il besoin d'une seconde entrée planifiée pour `POST /cron/rappels-photo-consommables` ? Ce n'est pas une tâche de code — l'endpoint existe et fonctionne (validé ci-dessus), mais rien ne l'appelle automatiquement en prod tant qu'aucune entrée de scheduler n'est configurée pour lui.

## User Setup Required

None - migration déjà appliquée par Mehdi dans le cadre de ce plan. Reste en attente (hors scope code) : configuration du scheduler externe pour appeler `POST /cron/rappels-photo-consommables` périodiquement (voir note ci-dessus).

## Next Phase Readiness

Phase 26 complète (4/4 plans). GAUGE-03 et GAUGE-04 vérifiés de bout en bout contre la base prod réelle. Phase 27 (UI web garage + client, jauges) et Phase 28 (UI mobile client) peuvent démarrer — toutes deux dépendent de Phase 25 (déjà complète) et Phase 26 (complète maintenant). Seul point en suspens hors scope : configuration du scheduler externe pour le nouveau cron (non bloquant pour le code).

---
*Phase: 26-cron-de-rappel-push-badge*
*Completed: 2026-07-15*
