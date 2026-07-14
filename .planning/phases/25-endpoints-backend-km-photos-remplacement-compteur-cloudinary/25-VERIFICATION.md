---
phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary
verified: 2026-07-14T21:45:27Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Provisionner CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET en local (.env) et sur Railway (service motokey1.1), puis re-jouer tests/test-km-photos-cloudinary.js"
    expected: "CONSO-03 et CLOUD-01 basculent du mode '503 CLOUDINARY_NOT_CONFIGURED' à un round-trip réel : photo_url commence par https://res.cloudinary.com/, visible sur le Dashboard Cloudinary dans motokey/consommables/<moto_id>/ et motokey/km/<moto_id>/"
    why_human: "Nécessite un compte Cloudinary + accès Railway env vars — hors du périmètre d'un agent autonome ; documenté comme dépendance connue depuis 25-01/25-05-PLAN.md (user_setup)"
  - test: "Décider si/quand corriger rbac.inferLegacyRole() pour résoudre role='CLIENT' sur JWT legacy client (affecte 60+ endpoints dual CLIENT/GARAGE déjà en prod, pas seulement Phase 25)"
    expected: "Un CLIENT authentifié via /auth/login (JWT legacy HS256) devrait obtenir ctx.role='CLIENT' sur tous les endpoints dual, au lieu du 403/404 actuel"
    why_human: "Correction architecturale transverse (Rule 4), hors scope d'un plan mono-endpoint ; nécessite arbitrage de Mehdi sur priorité/timing d'une phase de hardening RBAC dédiée"
---

# Phase 25: Endpoints backend km/photos/remplacement compteur/Cloudinary Verification Report

**Phase Goal:** Les garages et clients peuvent soumettre des relevés km et des photos de consommables via l'API ; le mécano peut saisir les données de montage ; l'upload stocke réellement l'image sur Cloudinary.
**Verified:** 2026-07-14T21:45:27Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un client ou un membre du garage peut soumettre un relevé km normal (photo optionnelle) via l'API, sans déclencher de changement de compteur | ✓ VERIFIED | Live re-run: `POST /motos/:id/km` garage → 200/201 (releve enregistré, acteur_type=garage) ; régression → 409 KM_REGRESSION avec km_tente/km_actuel. `handleKmReading(..., {remplacement:false})` uses `type_evenement:'lecture'` (motokey-api.js L509-513). |
| 2 | Un compte PRO/CONCESSION/ADMIN peut déclarer un changement de compteur via un endpoint dédié ; un compte MECANO ou CLIENT reçoit un refus (403) | ✓ VERIFIED | Live re-run: `POST /motos/:id/km/remplacement-compteur` (garage PRO+, avec note) → 200/201 ; sans note → 400 VALIDATION_ERROR ; CLIENT → 403 FORBIDDEN_ROLE. Gate `rbac.requireRole(ctx,'PRO')` at motokey-api.js L459 (excludes MECANO+CLIENT by hierarchy CLIENT<MECANO<PRO). |
| 3 | Le mécano peut saisir/mettre à jour km_montage, date_montage et référence pour chacun des 9 types de consommables d'une moto via l'API | ✓ VERIFIED | Live re-run: `PATCH /motos/:id/consommables/chaine` (garage) → 200, upserted ; type invalide → 400 VALIDATION_ERROR (validated pre-DB via `TYPES_CONSOMMABLES.includes`) ; CLIENT → 403. `POST /motos/:id/consommables` bulk (2 types) → 200/201, 2 consommables enregistrés ; type invalide dans tableau → 400 avant toute écriture. |
| 4 | Un client ou un membre du garage peut uploader une photo de consommable ; l'upload déclenche l'analyse (stub) et l'historise avec sa date et son résultat d'analyse | ⚠️ PARTIAL (garage path verified; CLIENT path blocked by pre-existing gap) | Live re-run: garage path exercises full pipeline (multer→Cloudinary→D-05 auto-création consommable→analyzePhoto stub→PhotosConsommables.insert), confirmed by code trace at motokey-api.js L535-577 (uploadPhoto before analyzePhoto before PhotosConsommables.insert). CLIENT positive-path returns 404 due to `rbac.inferLegacyRole()` never resolving role='CLIENT' — reproduced independently against this same endpoint AND two pre-existing prod endpoints (`GET /motos/:id`, `GET /devis`) unrelated to Phase 25 code. Endpoint code itself is correct (byte-identical RBAC pattern to already-shipped dual endpoints). |
| 5 | L'upload de photo (compteur ou consommable) stocke réellement l'image sur Cloudinary et renvoie une URL exploitable — plus aucun placeholder | ? UNCERTAIN (code correct, credentials not provisioned) | `cloudinaryService.uploadPhoto()` verified: throws statusCode=503/code=CLOUDINARY_NOT_CONFIGURED when creds absent (confirmed live), calls `cloudinary.uploader.upload_stream` returning real `secure_url` when configured (code inspection, D-02 compliant — no placeholder fallback exists in the code path). Full round-trip cannot be exercised: CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET are absent from local .env and (per SUMMARY) Railway. This is a known, pre-planned external dependency (25-01-PLAN.md user_setup block), not a code gap. |

**Score:** 5/5 truths have correct, verified code; 2 truths (4, 5) have components requiring human action (credential provisioning, RBAC architectural fix) that are outside this phase's autonomous scope but affect real functionality.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `services/cloudinaryService.js` | uploadPhoto + CLOUDINARY_READY, D-02 no silent fallback | ✓ VERIFIED | Exports `{uploadPhoto, CLOUDINARY_READY}`; throws 503/CLOUDINARY_NOT_CONFIGURED before any SDK call when unconfigured (verified live); uses `upload_stream` returning real Cloudinary result when configured. |
| `supabase.js` — `TYPES_CONSOMMABLES` | 9 canonical types exported | ✓ VERIFIED | `const TYPES_CONSOMMABLES = ['pneu_av','pneu_ar','chaine','plaquettes_av','plaquettes_ar','disque_av','disque_ar','huile_moteur','liquide_frein']` at L1327; exported at L1672 (module.exports). Matches migration 23 CHECK constraint list exactly (9/9). |
| `package.json` | cloudinary + multer (2.x) deps | ✓ VERIFIED | `"cloudinary": "^2.10.0"`, `"multer": "^2.2.0"` — correct major version (avoids CVE-2025-47944/CVE-2026-3520 in multer 1.x). |
| `motokey-api.js` — multipart infra | multer setup + runMulter + resolveMotoForCtx | ✓ VERIFIED | `_upload` (memoryStorage, 5MB limit, JPEG/PNG/WebP filter) L418-422; `runMulter` L423-427; `resolveMotoForCtx` (dual CLIENT/GARAGE) L431-446. All wired and exercised live. |
| `motokey-api.js` — `POST /motos/:id/km` + `/km/remplacement-compteur` | KM-03 + KM-02 endpoints | ✓ VERIFIED | JSON routes at L1074-1079 delegate to `handleKmReading`; 3 multipart intercepts before `body()` at L724-735 (km, remplacement-compteur, photos-consommables) correctly placed before the lossy `body()` call. |
| `motokey-api.js` — `PATCH/POST /motos/:id/consommables[/:type]` | CONSO-01 endpoints | ✓ VERIFIED | L1082-1112; validates type via `TYPES_CONSOMMABLES.includes` pre-DB, gates `requireRole(ctx,'MECANO')`, delegates to `Consommables.upsert` (D-04, no duplicated business logic). |
| `motokey-api.js` — `POST /motos/:id/photos-consommables` | CONSO-03 endpoint | ✓ VERIFIED | `handlePhotoConsommable` L535-577; pipeline order confirmed by static read: multer → type validation → ownership → `cloudinaryService.uploadPhoto` (L556) → D-05 auto-création via `Consommables.upsert` (L564) → `analyzePhoto` (L568) → `PhotosConsommables.insert` (L571) — strict order matches plan requirement. |
| `tests/test-km-photos-cloudinary.js` | Integration harness, 5 requirements | ✓ VERIFIED | Live-executed: 18 OK / 0 KO. All 5 requirement sections present and non-stub. |
| `tests/fixtures/sample.jpg` | Valid JPEG <5MB fixture | ✓ VERIFIED (implicit) | Test harness successfully used it for multipart uploads (503 responses confirm requests reached the multer/Cloudinary layer, not rejected at file-parsing level). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| handler multipart km | `cloudinaryService.uploadPhoto` | upload buffer → secure_url before `RelevesKm.enregistrer` | ✓ WIRED | L493-500: upload happens before L506-513 `RelevesKm.enregistrer` call; error path returns typed 503/502 without proceeding to DB write. |
| `POST /motos/:id/km` | `RelevesKm.enregistrer` | `SBLayer.RelevesKm.enregistrer(garage_id, moto_id, {...})` | ✓ WIRED | Confirmed live: 200/201 on valid km, 409 KM_REGRESSION with km_tente/km_actuel on regression. |
| intercept multipart | `body()` | special-case pathname+content-type BEFORE `let b = await body(req)` | ✓ WIRED | L724-735 intercepts precede the unconditional `body()` call later in the router (confirmed via line-order read); each intercept sets `req.ctx` itself via `rbac.extractRoleFromRequest`. |
| `PATCH /motos/:id/consommables/:type` | `Consommables.upsert` | `SBLayer.Consommables.upsert(motoId, {type_consommable, km_montage, date_montage, reference})` | ✓ WIRED | L1091, confirmed live (200, upserted row returned). |
| validation type | `TYPES_CONSOMMABLES` | `SBLayer.TYPES_CONSOMMABLES.includes(type)` | ✓ WIRED | L1087, L1103, L547 — all three type-accepting endpoints validate against the shared constant before any DB write. |
| `POST /motos/:id/photos-consommables` | `cloudinaryService.uploadPhoto → analyzePhoto → PhotosConsommables.insert` | pipeline upload → analyse → persistance | ✓ WIRED | Static order verified L556 (upload) < L568 (analyzePhoto) < L571 (insert); live-confirmed 503 short-circuit before reaching analyse/insert when Cloudinary unconfigured (proves no bypass). |
| handler photo (D-05) | `Consommables.upsert` | auto-création ligne consommable si absente avant le lien consommable_id | ✓ WIRED | L563-564: `listByMoto` lookup, `upsert` fallback if absent, `conso.id` used as `consommable_id` at L571 — never null. |

### Data-Flow Trace (Level 4)

Not applicable in the classic UI-rendering sense (this is a backend-only phase, no frontend consuming these endpoints yet). Data-flow was instead traced end-to-end at the API level:

| Endpoint | Upstream Input | Downstream Persistence | Produces Real Data | Status |
|----------|----------------|------------------------|---------------------|--------|
| `POST /motos/:id/km` | multipart/JSON body (km, note, photo) | `releves_km` via `RelevesKm.enregistrer` | Yes — live insert confirmed (moto km changed 0→18850 across test runs per deferred-items.md) | ✓ FLOWING |
| `PATCH/POST /motos/:id/consommables` | JSON body (type, km_montage, date_montage, reference) | `consommables` via `Consommables.upsert` | Yes — live upsert confirmed, row returned in response | ✓ FLOWING |
| `POST /motos/:id/photos-consommables` | multipart (photo, type_consommable) | `photos_consommables` via `PhotosConsommables.insert`, chained through `analyzePhoto` stub | Blocked upstream by Cloudinary 503 without credentials (correct D-02 behavior, not a code defect); code path to real persistence is proven correct via order-of-operations static check | ⚠️ STATIC (credentials-gated, not a data-flow defect) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server boots and responds | `node motokey-api.js` + `curl localhost:3000/` | 200 | ✓ PASS |
| Full Phase 25 test harness | `node tests/test-km-photos-cloudinary.js` | 18 OK / 0 KO | ✓ PASS |
| Legacy regression suite | `node test-api.js` | 9/9 passed | ✓ PASS |
| CLIENT RBAC gap reproduction (independent) | `curl GET /motos/:id` and `GET /devis` with sophie@email.com token | Both 403 FORBIDDEN_ROLE (not 200) | ✓ PASS (confirms deferred-items.md claim is accurate, not overstated) |
| `node --check` on all modified files | `node --check motokey-api.js && node --check supabase.js && node --check tests/test-km-photos-cloudinary.js` | exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| KM-02 | 25-03 | Remplacement de compteur PRO+ strict, archive + note obligatoire | ✓ SATISFIED | Live-verified: PRO+ 200/201, MECANO/CLIENT via role hierarchy → 403 FORBIDDEN_ROLE tested for CLIENT (MECANO not tested live — no MECANO seed account, documented in 25-03-PLAN as acceptable), note absente → 400. |
| KM-03 | 25-02, 25-03 | Relevé km normal, photo optionnelle, pas de changement de compteur | ✓ SATISFIED | Live-verified: 200/201 on valid km, 409 KM_REGRESSION on regression with km_tente/km_actuel exposed, `type_evenement:'lecture'`. |
| CONSO-01 | 25-01, 25-04 | 9 types consommables, km_montage/date_montage/reference saisis par mécano | ✓ SATISFIED | Live-verified: unit PATCH + bulk POST both work, MECANO+ gated, type validated against canonical 9-type list before DB write. |
| CONSO-03 | 25-02, 25-05 | Upload photo consommable, historisée avec date + analyse | ⚠️ SATISFIED (garage path) / BLOCKED (CLIENT path) | Garage path fully live-verified including D-05 auto-création and analyse stub attachment. CLIENT path blocked by pre-existing cross-cutting RBAC gap (`rbac.inferLegacyRole`), not a defect in this endpoint's code — see human_verification. |
| CLOUD-01 | 25-01, 25-05 | Stockage réel Cloudinary, URL exploitable, jamais placeholder | ✓ SATISFIED (code) / ? PENDING (live round-trip) | Code correctly implements D-02 (503 typed error, no placeholder ever returned) — this is itself the intended proof point per phase brief. Real `secure_url` round-trip requires credentials not yet provisioned (known external dependency, documented since 25-01-PLAN.md). |

No orphaned requirements — REQUIREMENTS.md phase-mapping table lists exactly these 5 IDs for Phase 25, and all 5 appear in plan frontmatter (25-01 through 25-05).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODO/FIXME/placeholder/stub patterns found in the 3 handler functions or cloudinaryService.js | — | None — codebase scan for `placeholder`, `not implemented`, `coming soon`, empty handlers (`=> {}`, `return null` used as stub) returned no matches tied to Phase 25 code. |
| `auth/rbac.js` | ~L126 (`inferLegacyRole`) | Pre-existing architectural gap: never resolves `role='CLIENT'` for legacy client JWTs | ℹ️ Info (pre-existing, out of scope) | Confirmed independently to affect 2+ already-shipped prod endpoints beyond Phase 25's new CONSO-03 route. Correctly documented in `deferred-items.md` rather than silently worked around. Does not block Phase 25 goal achievement for the garage-facing path, but does block the CLIENT-facing half of CONSO-03's stated truth. |

No blocker anti-patterns found in Phase 25's own delivered code.

### Human Verification Required

### 1. Provision Cloudinary credentials and confirm real round-trip

**Test:** Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `.env` locally and in Railway env vars for service `motokey1.1`, then re-run `node tests/test-km-photos-cloudinary.js`.
**Expected:** CONSO-03 and CLOUD-01 sections switch from "503 SKIP" to a real round-trip: response `photo_url`/`secure_url` begins with `https://res.cloudinary.com/`, and the image is visible in the Cloudinary Dashboard under `motokey/consommables/<moto_id>/` and `motokey/km/<moto_id>/`.
**Why human:** Requires a Cloudinary account and Railway dashboard access — outside agent capability. This was a known, planned dependency from 25-01-PLAN.md (`user_setup` block), not a gap introduced by this verification.

### 2. Decide on RBAC hardening priority for `rbac.inferLegacyRole()`

**Test:** Review `deferred-items.md` entries under `[25-05]` and decide whether/when to schedule a dedicated RBAC-hardening phase to add a `clients` table lookup branch to `inferLegacyRole()`.
**Expected:** A conscious decision (fix now, fix in a future phase, or accept as known limitation) rather than the gap persisting silently.
**Why human:** This is a cross-cutting architectural fix affecting 60+ call sites already in production (interventions, devis, transfert, client device tokens, and now CONSO-03) — correctly out of scope for a single-endpoint plan per the project's Rule 4, but it does affect real CLIENT-facing functionality today and needs Mehdi's prioritization call, especially before Phase 27/28 (UI consuming these same endpoints).

### Gaps Summary

No code gaps were found in Phase 25's own deliverables — all 5 must-haves' artifacts, wiring, and live-tested behaviors match the plan specifications exactly, and 18/18 assertions in the phase's dedicated test harness pass on independent re-run. `test-api.js` regression suite (9/9) also passes unaffected.

Two items are flagged for human attention rather than treated as phase failures, per the explicit guidance given for this verification:

1. **Cloudinary credentials not yet provisioned** — a known, pre-planned external dependency (documented since 25-01-PLAN.md `user_setup`). The code correctly proves its "no placeholder, ever" discipline (D-02) by returning a typed 503 in this state instead of faking success. This is the expected and designed behavior without credentials, not a code defect.
2. **Pre-existing RBAC gap (`rbac.inferLegacyRole` never resolves CLIENT role)** — independently reproduced against Phase 25's own CONSO-03 endpoint and against two unrelated, already-shipped prod endpoints (`GET /motos/:id`, `GET /devis`). The CONSO-03 endpoint code itself is correct and consistent with the established dual CLIENT/GARAGE pattern; the gap lives entirely in the shared `rbac.inferLegacyRole()` helper, is correctly out of scope for a single-endpoint plan, and is fully documented in `deferred-items.md`. It does, however, mean the CLIENT-facing half of Truth #4 ("un client... peut uploader une photo de consommable") cannot currently succeed end-to-end for CLIENT accounts — this is real, user-facing impact worth flagging even though it predates and extends beyond Phase 25.

Given these are (a) a documented, designed dependency awaiting external provisioning and (b) a pre-existing, correctly-scoped-out architectural gap rather than incomplete Phase 25 work, status is set to `human_needed` rather than `gaps_found`.

---

*Verified: 2026-07-14T21:45:27Z*
*Verifier: Claude (gsd-verifier)*
