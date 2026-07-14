---
phase: 24-helpers-supabase-js-contrat-stub-vision
plan: 01
subsystem: api
tags: [vision-stub, contract, flag-gate, deterministic, node-harness]

# Dependency graph
requires:
  - phase: 23-sch-ma-anti-fraude-km-au-niveau-db
    provides: "photos_consommables.analyse_ia JSONB + analyse_status TEXT colonnes (migration 23, en prod)"
provides:
  - "services/visionAnalysisService.js — analyzePhoto()/deriveEtat()/deriveAnalyseStatus() contrat verrouillé"
  - "scripts/test-vision-stub.js — harnais autonome 6 cas, zéro DB, zéro HTTP"
affects: [25-endpoints-cloudinary, 27-ui-web-jauges, 28-ui-mobile-jauges]

# Tech tracking
tech-stack:
  added: []
  patterns: ["ENABLED-flag + fallback silencieux/warning (EMAIL_ENABLED/PUSH_ENABLED/VISION_ENABLED)", "seed déterministe SHA-256 + PRNG mulberry32 pour stub pseudo-aléatoire reproductible"]

key-files:
  created: [services/visionAnalysisService.js, scripts/test-vision-stub.js]
  modified: []

key-decisions:
  - "Contrat verrouillé : { pct_usure:int 0-100, etat:'bon'|'moyen'|'usé'|'critique', confiance:int 0-100, analyse_status:'ok'|'incertain', engine:'stub' } — clés snake_case ASCII exactes, ordre fixe"
  - "Déterminisme via seed = readUInt32BE(sha256(photoUrl||consommableId)) consommé par mulberry32 — même input → même sortie strictement"
  - "confiance tirée dans [35,99] pour garantir que la branche 'incertain' (<50) est réellement atteignable en dev, pas juste théorique"
  - "analyse_status='echec' jamais produit par le stub (D-05), réservé au futur moteur réel"
  - "VISION_ENABLED=true sans ANTHROPIC_API_KEY = warning + fallback silencieux vers stub (D-06), jamais de crash — même convention exacte que EMAIL_ENABLED/PUSH_ENABLED"

patterns-established:
  - "Service pur sans accès DB pour tout futur moteur de calcul stub/réel (grep-vérifiable : zéro require('./supabase'))"
  - "Test harness Node autonome mirroring scripts/test-releves-km-trigger.js (assert()/--case=/exit 1 si KO) pour modules sans framework de test"

requirements-completed: [VISION-01, VISION-02]

# Metrics
duration: 8min
completed: 2026-07-14
---

# Phase 24 Plan 01: Contrat Stub Vision Summary

**Service `analyzePhoto()` flag-gated par `VISION_ENABLED` renvoyant un contrat verrouillé (pct_usure/etat/confiance/analyse_status/engine) via un stub déterministe SHA-256+mulberry32, avec harnais de test autonome 30/30 vert.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-14T15:35:44Z
- **Completed:** 2026-07-14T15:39:15Z
- **Tasks:** 2 completed
- **Files modified:** 2 (both new)

## Accomplishments
- `services/visionAnalysisService.js` créé : contrat verrouillé pour `analyzePhoto()`, dérivations pures `deriveEtat()`/`deriveAnalyseStatus()`, aucun couplage DB (service pur)
- `scripts/test-vision-stub.js` créé : harnais autonome couvrant les 6 cas du plan de validation (contract-shape, deterministic-seed, derivation-thresholds, never-echec, inconsistent-config-fallback, isolated-call) — 30/30 assertions vertes
- Convention `VISION_ENABLED` répliquée à l'identique du pattern `EMAIL_ENABLED`/`PUSH_ENABLED` existant, avec fallback silencieux + warning vérifié via sous-processus isolé

## Task Commits

Each task was committed atomically:

1. **Task 1: Créer le harnais de test autonome scripts/test-vision-stub.js** - `1ce77c7` (test)
2. **Task 2: Créer services/visionAnalysisService.js (flag-gate + stub déterministe + dérivations)** - `b160f07` (feat)

_Note: Task 1 (RED-equivalent, tests written before the service exists) and Task 2 (GREEN, service implementation making all 6 cases pass) form the TDD cycle specified by the plan for Task 2._

## Files Created/Modified
- `scripts/test-vision-stub.js` - Harnais Node autonome (assert/--case=/exit 1 si KO), 6 cas couvrant le contrat vision, zéro DB
- `services/visionAnalysisService.js` - Service flag-gated `analyzePhoto()` + dérivations pures `deriveEtat()`/`deriveAnalyseStatus()`, stub déterministe

## Decisions Made
- Suivi exact des seuils et de la structure spécifiés dans le plan (D-01 à D-06) — aucune divergence de conception nécessaire.
- Reformulation légère de deux commentaires dans `services/visionAnalysisService.js` pour respecter littéralement les critères d'acceptance grep (`grep -c "require('./supabase" == 0` et `grep -c "echec" == 0`) : le texte des commentaires ne contenait aucun accès DB réel ni branche 'echec' réelle, seulement une mention textuelle de ces mots dans la documentation — reformulé sans perte de sens pour que les grep de vérification passent littéralement.

## Deviations from Plan

None - plan exécuté exactement comme écrit. Un seul ajustement mineur post-première-passe : deux phrases de commentaire dans `visionAnalysisService.js` mentionnaient littéralement les chaînes `require('./supabase` et `echec` dans leur documentation (sans y correspondre fonctionnellement), ce qui aurait fait échouer les checks grep exacts de l'acceptance criteria de Task 2. Reformulé avant le commit final — pas un déviation de comportement, seulement de wording de commentaire, donc non tracké comme Rule 1-4 (aucun bug ni fonctionnalité manquante, juste un ajustement de texte de documentation avant de committer).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. `VISION_ENABLED` reste `false` par défaut ; aucune variable Railway à ajouter pour cette phase (le moteur réel Anthropic Vision n'est pas branché ce milestone).

## Next Phase Readiness

Le contrat `analyzePhoto()` est verrouillé et vérifiable en isolation (`node scripts/test-vision-stub.js`, 30/30 vert). Phase 25 (endpoints + Cloudinary) peut consommer `services/visionAnalysisService.js` directement pour persister le résultat via les helpers `PhotosConsommables` de `supabase.js`. Aucun blocage identifié.

Note : ce plan (24-01) couvre uniquement le contrat vision (VISION-01/VISION-02). Les helpers CRUD `supabase.js` pour `Consommables`/`PhotosConsommables` mentionnés dans le contexte de la phase (24-CONTEXT.md, "Claude's Discretion") relèvent du plan 24-02 (files_modified de 24-01 se limitait à `services/visionAnalysisService.js` + `scripts/test-vision-stub.js`).

---
*Phase: 24-helpers-supabase-js-contrat-stub-vision*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: services/visionAnalysisService.js
- FOUND: scripts/test-vision-stub.js
- FOUND commit: 1ce77c7
- FOUND commit: b160f07
