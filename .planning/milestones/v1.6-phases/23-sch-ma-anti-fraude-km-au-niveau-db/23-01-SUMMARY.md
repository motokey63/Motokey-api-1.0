---
phase: 23-sch-ma-anti-fraude-km-au-niveau-db
plan: 01
subsystem: database
tags: [postgres, supabase, plpgsql, triggers, rls, schema-sql, anti-fraude]

# Dependency graph
requires:
  - phase: 22-audit-bootstrap-schema-sql (v1.5)
    provides: schema.sql bootstrap propre vérifié (SCHEMA-07), discipline hand-append same-commit
provides:
  - "4 tables : consommables, photos_consommables, releves_km, releves_km_rejets (moto_id only, jamais client_id)"
  - "Trigger BEFORE INSERT verifier_km_monotone (rejet + log, NULL-safe, chaîne fraîche post-remplacement)"
  - "Trigger AFTER INSERT trg_sync_moto_km (motos.km = source unique dérivée de releves_km)"
  - "Suppression du clamp legacy trg_update_km/update_moto_km() (plus de second writer motos.km)"
  - "RLS default-deny documenté sur les 4 nouvelles tables"
affects: [23-03-fermeture-chemins-ecriture-km, 23-04-bootstrap-gate, 24-helpers-stub-contract, 25-endpoints-cloudinary]

tech-stack:
  added: []
  patterns:
    - "type_consommable TEXT+CHECK extensible (même pattern que interventions.niveau_preuve)"
    - "Trigger de validation BEFORE INSERT qui rejette via RETURN NULL + log dans table miroir, jamais RAISE EXCEPTION"
    - "Trigger de sync AFTER INSERT en assignation directe (pas de GREATEST) — la sûreté vient du BEFORE trigger, pas d'un clamp défensif redondant"

key-files:
  created:
    - sql/migrations/23_consommables_km.sql
  modified:
    - schema.sql

key-decisions:
  - "DROP trg_update_km/update_moto_km() dans la MÊME migration que la création de releves_km (résout la question ouverte n°2 du research, conséquence de D-05) — évite une fenêtre où deux writers non coordonnés existent"
  - "verifier_km_monotone utilise GREATEST(COALESCE(v_moto_km,0), COALESCE(v_max_releve,0)) comme baseline — sans ce NULL-safe guard, le tout premier relevé de chaque moto prod existante (releves_km vide mais motos.km déjà peuplé) passerait sans contrôle"
  - "Rejet du relevé via RETURN NULL (jamais RAISE EXCEPTION) pour que l'INSERT dans releves_km_rejets survive à la même transaction"

patterns-established:
  - "Toute nouvelle table Phase 23 : RLS ENABLE sans policy, commentaire mot-pour-mot du pattern garage_users/Gap B (default-deny anon/authenticated, service_role only)"

requirements-completed: [KM-01, KM-04, CONSO-02]

duration: ~20min
completed: 2026-07-14
---

# Phase 23 Plan 01: Schéma anti-fraude km + consommables Summary

**4 tables DB (releves_km source de vérité, releves_km_rejets, consommables, photos_consommables) + trigger monotone BEFORE INSERT (rejet+log NULL-safe) + trigger de sync AFTER INSERT vers motos.km, avec suppression du clamp legacy trg_update_km — DDL identique dans la migration et schema.sql, même commit.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-14
- **Tasks:** 2/2
- **Files modified:** 2 (sql/migrations/23_consommables_km.sql created, schema.sql modified)

## Accomplishments
- 4 nouvelles tables créées identiquement dans `sql/migrations/23_consommables_km.sql` et `schema.sql` : `consommables` (9 types v1, extensible TEXT+CHECK), `photos_consommables`, `releves_km` (source de vérité km), `releves_km_rejets` (log anti-fraude D-04, acteur jamais anonyme)
- Trigger `verifier_km_monotone` (BEFORE INSERT sur `releves_km`) : rejette tout relevé inférieur au max historique via `RETURN NULL` + log dans `releves_km_rejets`, NULL-safe (`GREATEST(COALESCE(...))`), bypass total + chaîne fraîche pour `type_evenement='remplacement_compteur'`
- Trigger `trg_sync_moto_km` (AFTER INSERT sur `releves_km`) : `motos.km = NEW.km` en assignation directe (pas de clamp)
- Suppression de `trg_update_km`/`update_moto_km()` (clamp legacy `GREATEST` sur `interventions`) — `motos.km` n'a plus qu'un seul writer coordonné
- RLS activé sans policy explicite sur les 4 nouvelles tables, avec le commentaire "INTENTIONNEL" reproduit mot pour mot du pattern Phase 19/21

## Task Commits

Chaque tâche a été committée atomiquement :

1. **Task 1: Créer les 4 tables (migration + schema.sql même commit)** - `4939644` (feat)
2. **Task 2: Triggers km (monotone + sync) + suppression trg_update_km + RLS documenté** - `bc7068a` (feat)

_Note : les deux tâches ont été réalisées en une seule passe d'édition, puis reconstruites en deux commits atomiques distincts via extraction de patchs diff pour respecter la granularité du plan — le contenu final de `schema.sql` et de la migration a été vérifié byte-identique à l'état cible avant chaque commit._

## Files Created/Modified
- `sql/migrations/23_consommables_km.sql` - Nouvelle migration : 4 CREATE TABLE, 2 trigger functions/triggers, DROP du clamp legacy, RLS-no-policy documenté
- `schema.sql` - DROP block (4 nouvelles entrées, ordre inverse de dépendance), 4 CREATE TABLE hand-appended après `reclamations_moto`, remplacement du bloc `update_moto_km`/`trg_update_km` par les 2 nouveaux triggers, ajout du bloc RLS pour les 4 tables

## Decisions Made
- Suppression de `trg_update_km` dans la même migration que la création de `releves_km` (pas différée) — conséquence directe de D-05 : le km d'intervention est un historique découplé qui ne doit jamais bumper `motos.km`, et laisser le clamp legacy vivant même temporairement recréerait un second writer non coordonné
- Baseline NULL-safe (`GREATEST(COALESCE(v_moto_km,0), COALESCE(v_max_releve,0))`) dans le trigger monotone pour couvrir le cas "moto prod existante, `releves_km` encore vide" sans laisser passer n'importe quelle valeur
- Aucune FK vers `client_id` sur les 4 tables (modèle de propriété polymorphe L8 — la propriété se résout via `moto_id → motos`), et pas de table de référence `types_consommables` séparée (rejeté, D-02)

## Deviations from Plan

None - plan executed exactly as written. Un ajustement mineur non-fonctionnel : le commentaire d'en-tête de la migration mentionnait initialement littéralement la chaîne "RAISE EXCEPTION" (à des fins de documentation, pour dire que le trigger n'en lève jamais) — cette formulation a été reformulée ("jamais d'exception levée") car elle déclenchait un faux positif dans le script de vérification `<automated>` du plan (qui cherche la position de "RAISE EXCEPTION" par rapport à `verifier_km_monotone`/`trg_verifier_km_monotone` pour détecter une vraie levée d'exception dans le corps de la fonction). Aucun impact sur le DDL ou le comportement du trigger — uniquement un mot de commentaire changé.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. Cette migration n'a pas encore été appliquée en prod (Phase 23 livre le schéma seul ; l'application réelle contre un projet Supabase jetable est vérifiée en 23-02/23-04, qui dépendent de `FRESH_DB_URL`, action Mehdi en attente).

## Next Phase Readiness

- `releves_km` existe comme fondation de source de vérité km, prête pour la fermeture des 3 chemins d'écriture non gardés (`Motos.update()`, `Interventions.create()`, `OrdresReparation.cloturer()`) dans le plan 23-03 (wave 2, dépend de ce plan)
- Le bootstrap réel contre un projet Supabase neuf (preuve d'exécution live, pas juste grep/diff) reste à faire en 23-04 (wave 3, gate) — bloqué sur `FRESH_DB_URL` (action Mehdi)
- Aucun endpoint HTTP n'existe encore vers ces 4 tables — RLS default-deny documenté comme état transitoire intentionnel jusqu'à Phase 25

---
*Phase: 23-sch-ma-anti-fraude-km-au-niveau-db*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: sql/migrations/23_consommables_km.sql
- FOUND: schema.sql (modified)
- FOUND commit: 4939644
- FOUND commit: bc7068a
