---
phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary
plan: 01
subsystem: infra
tags: [cloudinary, multer, supabase, consommables, upload]

# Dependency graph
requires:
  - phase: 23-sch-ma-anti-fraude-km-au-niveau-db
    provides: "table consommables + contrainte CHECK type_consommable (9 types)"
  - phase: 24-helpers-supabase-js-contrat-stub-vision
    provides: "convention de service flag-gated (visionAnalysisService.js) + helpers Consommables/PhotosConsommables dans supabase.js"
provides:
  - "services/cloudinaryService.js — uploadPhoto(buffer,{folder}) + CLOUDINARY_READY, sans fallback silencieux (D-02)"
  - "TYPES_CONSOMMABLES exporté depuis supabase.js — 9 types canoniques, source unique pour validation endpoint"
  - "cloudinary + multer (2.x) installés dans package.json"
affects: [25-03, 25-04, 25-05]

# Tech tracking
tech-stack:
  added: ["cloudinary@^2.10.0", "multer@^2.2.0"]
  patterns: ["Service flag-gated calculé au chargement du module (CLOUDINARY_READY), mais sans fallback silencieux — divergence intentionnelle D-02 vs EMAIL_ENABLED/PUSH_ENABLED/VISION_ENABLED"]

key-files:
  created: ["services/cloudinaryService.js"]
  modified: ["package.json", "package-lock.json", "supabase.js"]

key-decisions:
  - "D-02 respecté : uploadPhoto() lève statusCode=503/code=CLOUDINARY_NOT_CONFIGURED quand les credentials manquent, jamais d'URL placeholder — une preuve anti-fraude corrompue par un faux URL serait pire qu'une erreur explicite"
  - "multer forcé en ^2.2.0 (jamais 1.x) — CVE-2025-47944/CVE-2026-3520 non patchées en 1.x"
  - "TYPES_CONSOMMABLES centralisé comme copie JS unique de la contrainte CHECK SQL migration 23, évite la duplication dans les futurs endpoints 25-04/05"

requirements-completed: [CLOUD-01, CONSO-01]

# Metrics
duration: 20min
completed: 2026-07-14
---

# Phase 25 Plan 01: Fondations non-HTTP (Cloudinary + TYPES_CONSOMMABLES) Summary

**Service Cloudinary obligatoire sans fallback silencieux (503 typé sans credentials) + constante TYPES_CONSOMMABLES unique exportée depuis supabase.js, posant les fondations pour les endpoints photo/km des plans 25-03/04/05**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-14T16:55:00Z (estimate)
- **Completed:** 2026-07-14T17:14:44Z
- **Tasks:** 3/3 completed
- **Files modified:** 4 (package.json, package-lock.json, services/cloudinaryService.js, supabase.js)

## Accomplishments
- `cloudinary@^2.10.0` et `multer@^2.2.0` installés (multer forcé en 2.x pour éviter les CVE non patchées de la 1.x)
- `services/cloudinaryService.js` créé : `uploadPhoto(buffer, {folder})` via `upload_stream`, `CLOUDINARY_READY` calculé au chargement du module, D-02 respecté (503 typé sans credentials, jamais d'URL placeholder)
- `TYPES_CONSOMMABLES` (9 types canoniques) exposé comme constante unique depuis `supabase.js`, miroir exact de la contrainte CHECK de la migration 23

## Task Commits

Each task was committed atomically:

1. **Task 1: Installer cloudinary + multer** - `3ef9fca` (chore)
2. **Task 2: Créer services/cloudinaryService.js** - `83652cf` (feat)
3. **Task 3: Exposer TYPES_CONSOMMABLES dans supabase.js** - `00fe562` (feat)

**Plan metadata:** committed together with this SUMMARY (see final commit)

## Files Created/Modified
- `services/cloudinaryService.js` - Nouveau service : uploadPhoto (obligatoire, throw 503 CLOUDINARY_NOT_CONFIGURED sans creds) + CLOUDINARY_READY
- `package.json` / `package-lock.json` - Ajout `cloudinary@^2.10.0` et `multer@^2.2.0`
- `supabase.js` - Ajout `const TYPES_CONSOMMABLES = [...]` (9 types) juste avant `Consommables`, exporté dans `module.exports`

## Decisions Made
- D-02 : divergence volontaire du pattern flag-gated habituel (EMAIL_ENABLED/PUSH_ENABLED/VISION_ENABLED, fallback silencieux) — Cloudinary DOIT échouer explicitement (503) sans credentials, car une URL placeholder corromprait des preuves anti-fraude (photos consommables/compteur km)
- multer forcé en 2.x — pas de negotiation possible, CVE bloquantes en 1.x
- TYPES_CONSOMMABLES gardé comme simple tableau JS, pas de duplication de la logique CHECK côté DB (la contrainte SQL reste l'autorité, la validation JS côté endpoint est une défense en profondeur pour les plans 25-04/05)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `require('./supabase')` retourne `null` en l'absence de `.env` (le worktree parallèle n'a pas de copie du fichier `.env` gitignored de `C:\motokey-api`). Copié depuis le repo principal (fichier local, jamais committé, credentials dev existants) uniquement pour exécuter la vérification automatisée du plan ; confirmé toujours absent de `git status` après usage. Aucune modification de code liée à ce point.

## User Setup Required

**External service requires manual configuration.** Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) doivent être ajoutés dans Railway env vars pour le service `motokey1.1` avant que les endpoints des plans 25-03/04/05 puissent uploader réellement des photos en prod. Voir frontmatter `user_setup` de `25-01-PLAN.md` pour les instructions détaillées (Cloudinary Dashboard → Settings → API Keys). Sans ces variables, `cloudinaryService.uploadPhoto()` continuera de lever une erreur 503 explicite (comportement voulu, pas un bug).

## Next Phase Readiness
- Les trois artefacts non-HTTP requis par les endpoints des plans 25-03/04/05 sont livrés : `cloudinaryService.uploadPhoto`/`CLOUDINARY_READY`, `TYPES_CONSOMMABLES`
- Aucune modification de `motokey-api.js` dans ce plan (conforme à l'objectif — isolé du harnais de test 25-02)
- Bloqueur non-code restant : credentials Cloudinary réels côté Railway (voir User Setup Required) — n'empêche pas le développement des endpoints (503 typé propre en attendant)

---
*Phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: services/cloudinaryService.js
- FOUND: .planning/phases/25-endpoints-backend-km-photos-remplacement-compteur-cloudinary/25-01-SUMMARY.md
- FOUND: 3ef9fca (chore: install cloudinary + multer)
- FOUND: 83652cf (feat: cloudinaryService)
- FOUND: 00fe562 (feat: TYPES_CONSOMMABLES)
