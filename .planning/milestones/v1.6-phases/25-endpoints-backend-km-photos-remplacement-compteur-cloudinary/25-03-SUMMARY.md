---
phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary
plan: 03
subsystem: api
tags: [express, multer, cloudinary, rbac, anti-fraude, km]

requires:
  - phase: 23-sch-ma-anti-fraude-km-au-niveau-db
    provides: releves_km table + verifier_km_monotone trigger + RelevesKm.enregistrer()
  - phase: 24-helpers-supabase-js-contrat-stub-vision
    provides: TYPES_CONSOMMABLES + helpers supabase.js
  - phase: 25 (waves 1, plans 01-02)
    provides: cloudinaryService.js + multer/cloudinary deps + test harness skeleton
provides:
  - POST /motos/:id/km (KM-03, dual CLIENT/GARAGE, JSON or multipart+photo)
  - POST /motos/:id/km/remplacement-compteur (KM-02, PRO+ strict, note obligatoire)
  - Reusable multipart upload infra (multer instance, runMulter, resolveMotoForCtx)
  - Defensive km_actuel fallback in RelevesKm.enregistrer (never null in 409 response)
affects: [25-04, 25-05, 27-ui-web, 28-mobile-ui]

tech-stack:
  added: []
  patterns:
    - "Multipart routes intercepted before body() (mirrors /stripe/webhook), req.ctx posed by the handler itself"
    - "resolveMotoForCtx() shared dual CLIENT/GARAGE moto ownership resolver, 404-safe (no existence leak)"
    - "handleKmReading() single handler shared by both JSON and multipart entry points via bodyFields param"

key-files:
  created: []
  modified:
    - motokey-api.js
    - supabase.js
    - tests/test-km-photos-cloudinary.js

key-decisions:
  - "handleKmReading() shared by KM-02/KM-03 rather than two separate functions — avoids duplicating ownership/upload/enregistrer wiring"
  - "RelevesKm.enregistrer() falls back to motos.km when releves_km_rejets has no matching row, so km_actuel is never null in the 409 response (Rule 1 bug fix, found live against prod)"

patterns-established:
  - "First multipart/file-upload pattern in motokey-api.js — future upload endpoints (CONSO-03) should reuse multer instance + runMulter + resolveMotoForCtx"

requirements-completed: [KM-02, KM-03]

duration: 25min
completed: 2026-07-14
---

# Phase 25 Plan 03: Endpoints kilométrage (KM-02/KM-03) + infra multipart Summary

**POST /motos/:id/km (relevé normal, CLIENT+garage) et POST /motos/:id/km/remplacement-compteur (PRO+ strict) livrés, avec upload photo optionnel médié backend vers Cloudinary — première introduction du pattern multipart dans motokey-api.js.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-14T20:35:06Z
- **Completed:** 2026-07-14T20:46:05Z
- **Tasks:** 3/3 completed
- **Files modified:** 3 (motokey-api.js, supabase.js, tests/test-km-photos-cloudinary.js)

## Accomplishments
- Multipart upload infra introduced in `motokey-api.js` for the first time: shared `multer` instance (memoryStorage, 5MB limit, JPEG/PNG/WebP only, D-03), `runMulter()` promise wrapper, and two content-type-sniffing intercepts placed before the unconditional `body()` call (mirrors the existing `/stripe/webhook` raw-body pattern) so multipart requests never get corrupted by the lossy Buffer→string→JSON.parse path.
- `resolveMotoForCtx()` — shared dual CLIENT/GARAGE moto-ownership resolver reused by both new endpoints, returning the correct `acteur_type`/`acteur_id` pair for `RelevesKm.enregistrer()` without leaking moto existence to unauthorized callers (404 either way).
- `handleKmReading()` — single handler backing both KM-03 (`remplacement:false`) and KM-02 (`remplacement:true`): 401/403/400/404/409 branches, optional Cloudinary photo upload happening strictly before the DB write (so `photo_url` is known at insert time), and a 409 response that surfaces `km_tente`/`km_actuel` on trigger rejection.
- KM-02 gated `requireRole(ctx, 'PRO')` (excludes MECANO and CLIENT → 403 `FORBIDDEN_ROLE`) with a mandatory non-empty `note` (→ 400 `VALIDATION_ERROR` if missing/blank).
- Live-verified end-to-end against prod seed accounts (`garage@motokey.fr`, `sophie@email.com`) with a real running server: **8/8 assertions pass** across both KM-03 and KM-02 sections of `tests/test-km-photos-cloudinary.js`, including the 409 regression path and the CLIENT→403 negative case on remplacement-compteur.

## Task Commits

Each task was committed atomically:

1. **Task 1: Infra multipart (multer + runMulter) + resolveMotoForCtx** - `cae18bd` (feat)
2. **Task 2: Endpoint relevé km normal (KM-03) — handleKmReading + route JSON** - `5178e26` (feat)
3. **Task 3: Endpoint remplacement de compteur (KM-02) — PRO+ strict, note obligatoire** - `483c41e` (feat)

_Note: Task 2's commit also includes a defensive fix in `supabase.js` (Rule 1 — see Deviations)._

## Files Created/Modified
- `motokey-api.js` — multer/cloudinaryService requires, shared `_upload`/`runMulter`, `resolveMotoForCtx()`, `handleKmReading()`, multipart intercepts before `body()`, JSON routes `POST /motos/:id/km` and `POST /motos/:id/km/remplacement-compteur`
- `supabase.js` — `RelevesKm.enregistrer()` now falls back to `motos.km` for `km_actuel` when the `releves_km_rejets` audit row is missing (see Deviations)
- `tests/test-km-photos-cloudinary.js` — filled in the KM-03 and KM-02 sections (JSON + multipart requests, positive/negative assertions), replacing the Wave 0 stubs

## Decisions Made
- `handleKmReading()` shared by both endpoints rather than duplicated — the only branch points are the PRO+ gate, the mandatory-note check, and `type_evenement`; everything else (ownership resolution, photo upload, `enregistrer()` call, 409 shaping) is identical.
- Multipart field extraction unified via a `bodyFields` parameter: the JSON route passes the already-parsed `b` object, the multipart intercept leaves it `undefined` and `handleKmReading` calls `runMulter()` itself, then reads `req.body` (populated by multer for text fields alongside the file).
- Chose to keep the `remplacement:true`/`remplacement:false` branches as two explicit `RelevesKm.enregistrer()` calls (rather than one call with a ternary `type_evenement`) so the literal `type_evenement:'remplacement_compteur'` string exists verbatim in the source — matches the plan's exact verification grep and keeps intent obvious at the call site.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `RelevesKm.enregistrer()` returned `km_actuel: null` on rejection because prod's `releves_km_rejets` audit table isn't being populated by the deployed trigger**
- **Found during:** Task 2 live verification (running the real server against prod Supabase and exercising the actual 409 rejection path)
- **Issue:** This plan's must_have truth #2 requires "Un relevé km inférieur au max historique renvoie 409 avec km_tente/km_actuel". Live testing showed `km_tente` correct but `km_actuel: null`. Root-caused by directly reproducing the trigger's rejection path twice and comparing against a manual direct insert into `releves_km_rejets` (which worked and was immediately visible) — the trigger-triggered insert into `releves_km_rejets` (defined in `sql/migrations/23_consommables_km.sql`) does not persist in prod, even though the rejection itself (the actual anti-fraud gate) works correctly. Root cause not fully determined — most likely the function body actually deployed to prod via Dashboard SQL Editor differs from the migration file (prod was verified only by a `200 []` REST existence probe, not by exercising the rejection path — see `.planning/phases/.../deferred-items.md`).
- **Fix:** Added a defensive fallback in `RelevesKm.enregistrer()` (`supabase.js`): when no `releves_km_rejets` row is found for the moto, fall back to reading `motos.km` (the KM-04 synced source of truth) so `km_actuel` is always a usable value in the API response, regardless of whether the audit log is working.
- **Files modified:** `supabase.js`
- **Verification:** Re-ran the live 409 scenario after the fix — `km_actuel` now correctly reflects the moto's real current km (18750, matching `motos.km`). Full 8/8 pass on the test harness.
- **Committed in:** `5178e26` (part of Task 2 commit)
- **Not fixed (out of scope, needs Mehdi + Supabase Dashboard):** The underlying prod trigger discrepancy itself — see `.planning/phases/25-endpoints-backend-km-photos-remplacement-compteur-cloudinary/deferred-items.md` for full diagnosis and next steps. The anti-fraud rejection (the security-critical half of KM-01) is unaffected and verified working; only the audit-trail logging half is impacted.

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix was necessary to satisfy this plan's own must_have (409 response contract). No scope creep — the trigger/migration itself was not touched, only the application-layer consumer was made defensive. Root-cause investigation of the prod trigger drift is deferred and documented for follow-up, since it requires Supabase Dashboard access this agent doesn't have and belongs to Phase 23's territory, not this endpoints plan.

## Issues Encountered
- Worktree branch was behind `master` at session start (missing Wave 1 plans 25-01/25-02). Resolved with a clean fast-forward merge (`git merge master --no-edit --no-verify`) before reading any plan files, per the orchestrator's instructions — no conflicts, 31 files updated (Cloudinary service, TYPES_CONSOMMABLES, test harness skeleton, deps).
- `node_modules` was not yet populated in this worktree for the newly added `multer`/`cloudinary` deps (present in `package.json` from 25-01 but never `npm install`ed here) — ran `npm install` before any code changes.
- Discovered live (see Deviations #1) that `tests/test-km-photos-cloudinary.js`, `motokey-api.js`, and `supabase.js` in this repo's convention run their integration tests directly against the prod Supabase project using seeded test accounts (no separate staging DB for the REST/HTTP layer) — confirmed intentional per STATE.md's 25-02 decision log entry, not a mistake on my part, but worth flagging: this session's test run permanently advanced the km of prod moto `2270b55e-8457-439d-a7d8-49b29b70c2ac` from 18650 to 18850 via real HTTP calls (consistent with how `tests/test-or-e2e.js` already creates real OR records in prod).

## User Setup Required

None - no new external service configuration required by this plan (Cloudinary env vars were already flagged as pending in 25-01/25-02; this plan's multipart round-trip correctly returns `503 CLOUDINARY_NOT_CONFIGURED` when absent, verified live).

**Recommended follow-up for Mehdi (not blocking, see deferred-items.md):** verify/re-apply the `verifier_km_monotone()` trigger function against prod via Supabase Dashboard SQL Editor — the rejection logic works, but the `releves_km_rejets` audit-trail insert inside it does not appear to be persisting in prod.

## Next Phase Readiness
- Multipart upload infra (`multer`, `runMulter`, `resolveMotoForCtx`) is now established in `motokey-api.js` and ready to be reused by CONSO-03 (photo consommable upload, plan 25-05) without re-deriving the pattern.
- KM-02/KM-03 fully live-verified against prod; no blockers for 25-04 (CONSO-01) or 25-05 (CONSO-03/CLOUD-01), which depend on the same RBAC/ownership/Cloudinary building blocks introduced here.
- One non-blocking concern carried forward: prod `releves_km_rejets` audit-trail gap (see deferred-items.md) — flagged for Mehdi's attention, does not block further Phase 25 plans.

---
*Phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary*
*Completed: 2026-07-14*

## Self-Check: PASSED

All claimed files and commits verified present:
- motokey-api.js, supabase.js, tests/test-km-photos-cloudinary.js — FOUND
- 25-03-SUMMARY.md, deferred-items.md — FOUND
- Commits cae18bd, 5178e26, 483c41e — FOUND in git log
