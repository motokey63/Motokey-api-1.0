---
phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary
plan: 04
subsystem: api
tags: [express, rbac, consommables, anti-fraude]

requires:
  - phase: 23-sch-ma-anti-fraude-km-au-niveau-db
    provides: table consommables + Consommables.upsert() (D-04 shared validator)
  - phase: 24-helpers-supabase-js-contrat-stub-vision
    provides: TYPES_CONSOMMABLES (9 types canoniques)
  - phase: 25 (waves 1-2, plans 25-01/25-02/25-03)
    provides: resolveMotoForCtx(), pattern ctx/auth des routes /motos, test harness
provides:
  - "PATCH /motos/:id/consommables/:type (unitaire, MECANO+)"
  - "POST /motos/:id/consommables (bulk tableau, MECANO+)"
affects: [25-05, 27-ui-web, 28-mobile-ui]

tech-stack:
  added: []
  patterns:
    - "Deux endpoints (unitaire + bulk) partagent exactement le même gating/validation, aucune logique métier dupliquée — délégation totale à Consommables.upsert() (D-04)"
    - "Validation de type_consommable via TYPES_CONSOMMABLES AVANT tout appel DB, jamais laissé remonter comme erreur Postgres brute"
    - "Bulk : validation de TOUS les types avant la première écriture — pas d'upsert partiel en cas d'un seul type invalide dans le tableau"

key-files:
  created: []
  modified:
    - motokey-api.js
    - tests/test-km-photos-cloudinary.js

key-decisions: []

patterns-established:
  - "CONSO-03 (25-05, upload photo consommable) peut réutiliser resolveMotoForCtx() + le même gating MECANO+ déjà en place ici et en 25-03"

requirements-completed: [CONSO-01]

duration: 8min
completed: 2026-07-14
---

# Phase 25 Plan 04: Endpoints saisie consommables (CONSO-01) Summary

**PATCH unitaire + POST bulk pour saisir km_montage/date_montage/référence des 9 consommables canoniques, MECANO+ only, délégant intégralement à `Consommables.upsert()` sans logique métier dupliquée.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-14T22:56:00Z
- **Completed:** 2026-07-14T22:59:31Z
- **Tasks:** 2/2 completed
- **Files modified:** 2 (motokey-api.js, tests/test-km-photos-cloudinary.js)

## Accomplishments
- `PATCH /motos/:id/consommables/:type` — saisie unitaire (usage courant du mécano) : valide le type via `TYPES_CONSOMMABLES.includes()` avant tout appel DB (400 `VALIDATION_ERROR` propre, jamais une erreur Postgres brute sur la contrainte CHECK), gate `requireRole(ctx,'MECANO')`, délègue à `SBLayer.Consommables.upsert()`.
- `POST /motos/:id/consommables` — saisie bulk (setup initial d'une moto, jusqu'aux 9 types en une requête) : valide TOUS les types du tableau avant la première écriture (pas d'upsert partiel si un seul type est invalide), même gate MECANO+, boucle sur le même `Consommables.upsert()`.
- Les deux endpoints réutilisent exactement le pattern ctx/auth/`resolveMotoForCtx()` introduit en 25-03 — aucun nouveau helper, aucune divergence de style.
- Live-vérifié avec un serveur réel contre prod (`garage@motokey.fr`, `sophie@email.com`) : **15/15 assertions** sur la suite complète `tests/test-km-photos-cloudinary.js` (10 assertions KM-02/KM-03 déjà vertes + 5 nouvelles CONSO-01), incluant les 3 cas négatifs (type invalide unitaire, type invalide dans le tableau bulk, CLIENT → 403).

## Task Commits

Each task was committed atomically:

1. **Task 1: PATCH /motos/:id/consommables/:type (unitaire, MECANO+)** - `d7a2fac` (feat)
2. **Task 2: POST /motos/:id/consommables (bulk, MECANO+)** - `87cb762` (feat)

## Files Created/Modified
- `motokey-api.js` — routes `PATCH /motos/:id/consommables/:type` et `POST /motos/:id/consommables`, insérées entre la section KM-02/KM-03 et la section INTERVENTIONS
- `tests/test-km-photos-cloudinary.js` — section CONSO-01 remplie (unitaire : 200 type valide, 400 type invalide, 403 CLIENT ; bulk : 200/201 tableau de 2, 400 type invalide dans le tableau)

## Decisions Made
None - followed plan as specified. Le plan fournissait le code exact des deux routes (calqué sur le pattern MECANO+ déjà établi) ; aucune divergence nécessaire.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Le worktree n'avait ni `.env` ni `node_modules` au démarrage de cette session (indépendant du merge master déjà fait par 25-03) — copié `.env` depuis `C:\motokey-api\.env` et lancé `npm install` avant toute vérification live, sans quoi le serveur ne pouvait pas démarrer contre Supabase.
- Un serveur `node motokey-api.js` tournait déjà sur le port 3000 depuis une session antérieure avec l'ancien code (avant Task 2). Identifié le PID exact via `netstat -ano | grep :3000` et ciblé `taskkill /F /PID <pid>` (jamais un kill générique de tous les `node.exe`, conformément à la préférence connue de Mehdi) avant de relancer le serveur avec le code à jour pour la vérification de Task 2.
- Task 1 et Task 2 ont d'abord été écrites ensemble dans une seule édition de `motokey-api.js` par souci d'efficacité (les deux routes sont adjacentes et se ressemblent) ; ré-scindées en deux éditions séparées avant tout commit pour respecter l'atomicité par tâche exigée par le plan — aucun impact sur le résultat final, juste une correction du séquencement d'édition.

## User Setup Required

None - no new external service configuration required by this plan (Cloudinary reste hors scope de ce plan, déjà couvert par 25-03/pending 25-05).

## Next Phase Readiness
- CONSO-01 complet et live-vérifié, aucun blocage pour 25-05 (CONSO-03 upload photo consommable + CLOUD-01 round-trip Cloudinary réel), qui peut réutiliser le même `resolveMotoForCtx()` et le même gating MECANO+.
- Suite de test complète (`tests/test-km-photos-cloudinary.js`) à 15/15 sur les 3 slices déjà implémentées (KM-02, KM-03, CONSO-01) ; seules CONSO-03 et CLOUD-01 restent en stub pour 25-05.
- Aucun nouveau blocker introduit.

---
*Phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary*
*Completed: 2026-07-14*

## Self-Check: PASSED

All claimed files and commits verified present:
- motokey-api.js, tests/test-km-photos-cloudinary.js — FOUND
- Commits d7a2fac, 87cb762 — FOUND in git log
