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
  - "Checkpoint Task 2 (FRESH_DB_URL) non résolu cette session — confirmé absent de .env, aucune valeur fabriquée, requête explicite à Mehdi via checkpoint human-action."

patterns-established:
  - "Pattern trigger-test pg : chaque cas = 1 moto fixture dédiée + setup interne + assertions PASS/FAIL avec compteurs OK/KO, style test-api.js"

requirements-completed: []  # KM-01/CONSO-02 NON marqués complets — le script existe mais n'a jamais été exécuté contre une DB réelle (bloqué sur FRESH_DB_URL, Task 2). La couverture sera prouvée en 23-04.

duration: ~15min (Task 1 seul — Task 2 est un checkpoint humain bloquant)
completed: 2026-07-14
---

# Phase 23 Plan 02: Test Harness Anti-Fraude km Summary

**Script pg hand-rolled `scripts/test-releves-km-trigger.js` créé (5 cas trigger + CHECK 9-types), écrit RED — Task 2 (FRESH_DB_URL) bloqué sur checkpoint humain, PLAN INCOMPLET.**

## Performance

- **Duration:** ~15 min (Task 1 uniquement)
- **Completed (Task 1):** 2026-07-14T09:10:26Z
- **Tasks:** 1/2 complétées (Task 2 = checkpoint bloquant, non résolu)
- **Files modified:** 1

## Status: PARTIAL — CHECKPOINT REACHED

Ce plan n'est **pas terminé**. Task 1 (script de test) est complète et committée. Task 2 est un `checkpoint:human-action` bloquant : `FRESH_DB_URL` (connexion Postgres directe vers un projet Supabase **jetable**) est confirmé **absent** de `.env` dans ce worktree, et sa création nécessite une action humaine (créer un projet Supabase jetable, Dashboard → Settings → Database → Connection string) qu'aucune automatisation ne peut effectuer. Conformément aux règles d'exécution, aucune valeur n'a été devinée ou fabriquée.

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

**Task 2 (checkpoint:human-action) : NON exécutée — bloquée, voir "Blocage" ci-dessous.**

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

**Action requise de Mehdi avant que ce plan puisse être terminé et avant que le plan 23-04 (gate bootstrap) puisse s'exécuter :**

1. Sur https://supabase.com/dashboard, créer un NOUVEAU projet **jetable** (ex. nom `motokey-throwaway-p23`), région/plan free.
2. Projet → Settings → Database → Connection string → "Direct connection" (mode session, port 5432). Copier la chaîne complète (avec le mot de passe DB choisi à la création).
3. Ajouter dans `.env` (racine du repo, PAS committé) : `FRESH_DB_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres`
4. Vérifier que le `<ref>` du projet n'est **PAS** `rzbqbaccjyxvtlnfitrr` (c'est la prod — le script refusera explicitement).

Une fois `FRESH_DB_URL` en place, ce plan peut être considéré terminé (Task 2 satisfaite) et l'exécution peut reprendre vers le plan 23-04 (bootstrap + exécution réelle de ce script, devenant vert).

## Next Phase Readiness

- **Bloqué :** le plan 23-04 (gate bootstrap final) dépend directement de `FRESH_DB_URL` — ne peut pas démarrer tant que ce checkpoint n'est pas résolu.
- Le script lui-même est prêt et syntaxiquement validé — aucun travail de code restant sur cette tâche une fois la credential fournie, seule l'exécution réelle (23-04) reste à faire.
- Les plans 23-01 et 23-03 ne dépendent pas de `FRESH_DB_URL` et peuvent progresser indépendamment (exécution parallèle en cours dans d'autres worktrees, selon la note `<parallel_execution>` de ce plan).

---
*Phase: 23-sch-ma-anti-fraude-km-au-niveau-db*
*Plan 02 status: PARTIAL — checkpoint reached, awaiting FRESH_DB_URL*

## Self-Check: PASSED

- FOUND: scripts/test-releves-km-trigger.js
- FOUND: 3e6a96a (commit hash verified in git log)
