---
phase: 23-sch-ma-anti-fraude-km-au-niveau-db
plan: 02
subsystem: database
tags: [postgres, pg, trigger-testing, anti-fraude, hand-rolled-test-harness]

# Dependency graph
requires:
  - phase: 23-01
    provides: "Schéma DB (releves_km, releves_km_rejets, consommables, photos_consommables + triggers verifier_km_monotone/trg_sync_moto_km) que ce script exercera une fois bootstrappé"
provides:
  - "scripts/test-releves-km-trigger.js — harness pg hand-rolled couvrant les 5 cas de la trigger km (accept, reject-regression, null-safe-baseline, counter-replacement-bypass, conso-check-violation)"
affects: ["23-04 (gate bootstrap — ce script doit devenir vert)"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Test harness Node/pg autonome par cas (--case=<nom>), chaque cas possède sa propre fixture moto et construit son propre état préalable — exécutable isolément ou en suite complète"]

key-files:
  created: [scripts/test-releves-km-trigger.js]
  modified: []

key-decisions:
  - "Chaque cas de test possède sa propre moto fixture et construit lui-même tout état préalable nécessaire (au lieu de chaîner les cas comme suggéré littéralement par le plan) — rend le script robuste au filtre --case=<nom> exécuté isolément, sans rien perdre de la couverture demandée."
  - "Checkpoint Task 2 (FRESH_DB_URL) résolu 2026-07-14 : Mehdi a créé un projet Supabase jetable (xjgyoehennuydoocbprj) et fourni la connection string directe. Connexion pg live vérifiée (SELECT current_database()) avant tout usage — host confirmé ≠ rzbqbaccjyxvtlnfitrr (prod)."

patterns-established:
  - "Pattern trigger-test pg : chaque cas = 1 moto fixture dédiée + setup interne + assertions PASS/FAIL avec compteurs OK/KO, style test-api.js"

requirements-completed: []  # KM-01/CONSO-02 pas encore marqués complets — FRESH_DB_URL est en place et vérifié connectable, mais le script n'a pas encore été exécuté contre le schéma bootstrappé (c'est le gate du plan 23-04, qui prouvera la couverture).

duration: ~15min (Task 1) + résolution checkpoint Task 2 (session suivante)
completed: 2026-07-14
---

# Phase 23 Plan 02: Test Harness Anti-Fraude km Summary

**Script pg hand-rolled `scripts/test-releves-km-trigger.js` créé (5 cas trigger + CHECK 9-types), écrit RED. Task 2 (FRESH_DB_URL) résolue — connexion vérifiée vers projet jetable xjgyoehennuydoocbprj. PLAN COMPLET.**

## Performance

- **Duration:** ~15 min (Task 1) + résolution checkpoint (Task 2, session suivante)
- **Completed:** 2026-07-14
- **Tasks:** 2/2 complétées
- **Files modified:** 2 (`scripts/test-releves-km-trigger.js`, `.env`)

## Status: COMPLETE

Task 1 (script de test) est complète et committée. Task 2 (`checkpoint:human-action`) est résolue : Mehdi a créé un projet Supabase jetable (`xjgyoehennuydoocbprj`) et fourni la connection string Postgres directe via Dashboard → Settings → Database → Connection string (mode session, port 5432). `FRESH_DB_URL` est écrit dans `.env` (non committé — fichier gitignored) et une connexion live a été vérifiée (`SELECT current_database()`) avant tout usage ultérieur, confirmant le host ≠ `rzbqbaccjyxvtlnfitrr` (prod).

## Accomplishments

- `scripts/test-releves-km-trigger.js` créé : script Node autonome (`pg` + `dotenv`, même style de connexion que `scripts/bootstrap-fresh-schema.js`), avec garde-fou anti-prod (`rzbqbaccjyxvtlnfitrr` refusé) et non-logging de la connection string brute (seul le host parsé est imprimé).
- Couvre les 5 cas requis, chacun avec sa propre fixture moto et son propre setup interne (robuste à `--case=<nom>` exécuté isolément) :
  - `accept` — relevé croissant accepté, `motos.km` synchronisé.
  - `reject-regression` — relevé décroissant annulé (0 ligne `RETURNING`) + ligne de rejet créée (`km_tente`/`km_actuel` corrects) + `motos.km` inchangé.
  - `null-safe-baseline` — moto avec `motos.km` pré-peuplé ET zéro `releves_km` préalable (précondition explicitement assertée) : premier relevé bas rejeté malgré l'absence d'historique `releves_km` (Pitfall A du research, GREATEST(motos.km, ...)).
  - `counter-replacement-bypass` — `remplacement_compteur` accepté en régression forte, `motos.km` mis à jour, chaîne monotone fraîche prouvée (accepté puis rejeté selon la nouvelle base).
  - `conso-check-violation` — type invalide rejeté avec code Postgres `23514` (check_violation) ; les 9 types v1 acceptés individuellement.
- Fixtures nettoyées en fin d'exécution (`DELETE` ciblés via UUID explicites, dans un `finally`).
- Vérifications automatisées du plan passées : `node --check` vert, grep des 7 identifiants requis (`accept`, `reject-regression`, `null-safe-baseline`, `counter-replacement-bypass`, `23514`, `rzbqbaccjyxvtlnfitrr`, `FRESH_DB_URL`) tous présents.

## Task Commits

1. **Task 1: Créer scripts/test-releves-km-trigger.js (RED)** - `3e6a96a` (feat)
2. **Task 2: Checkpoint FRESH_DB_URL résolu** - documenté dans ce SUMMARY + `.env` (non committé, gitignored)

## Files Created/Modified

- `scripts/test-releves-km-trigger.js` - Harness pg de test du trigger anti-fraude km (5 cas) + CHECK 9-types consommables ; RED tant que le schéma 23-01 n'est pas bootstrappé sur une DB cible.

## Decisions Made

- **Cas de test auto-suffisants plutôt que chaînés :** le plan décrivait `reject-regression` comme s'exécutant "après le cas 1", mais chaque cas a été implémenté avec sa propre fixture moto qui construit son propre état préalable (ex. `reject-regression` insère lui-même le relevé à 12000 avant de tenter la régression). Rationale : rend le script utilisable avec `--case=<nom>` en isolation (référencé dans `23-VALIDATION.md`'s Per-Task Verification Map) sans dépendre de l'ordre d'exécution des autres cas, sans rien perdre de la couverture logique demandée (le trigger `GREATEST(motos.km, MAX(releves_km))` est exercé de façon équivalente).
- **Aucune valeur FRESH_DB_URL fabriquée.** Conformément à l'objectif explicite de cette session, le script est écrit et vérifié syntaxiquement, mais N'A PAS été exécuté contre une DB réelle — cela nécessite le checkpoint humain de Task 2.

## Deviations from Plan

None - Task 1 exécutée exactement comme spécifiée par le plan (voir "Decisions Made" pour une clarification d'implémentation mineure, pas une déviation de comportement).

## Issues Encountered

None pour Task 1. Task 2 n'est pas un "issue" mais un checkpoint humain planifié dès la conception du plan (`autonomous: false`).

## User Setup Required

**Résolu 2026-07-14.** Mehdi a créé un projet Supabase jetable (`xjgyoehennuydoocbprj`) et fourni la connection string Postgres directe (Dashboard → Settings → Database → Connection string, mode session, port 5432). Écrite dans `.env` sous `FRESH_DB_URL` (fichier gitignored, jamais committé). Connexion live vérifiée avant tout usage.

## Next Phase Readiness

- **Débloqué :** le plan 23-04 (gate bootstrap final) peut maintenant s'exécuter — `FRESH_DB_URL` est en place et vérifié connectable.
- Le script `scripts/test-releves-km-trigger.js` est prêt et syntaxiquement validé — reste l'exécution réelle contre le schéma bootstrappé (23-04), qui doit passer de RED à GREEN.

---
*Phase: 23-sch-ma-anti-fraude-km-au-niveau-db*
*Plan 02 status: COMPLETE*

## Self-Check: PASSED

- FOUND: scripts/test-releves-km-trigger.js
- FOUND: 3e6a96a (commit hash verified in git log)
