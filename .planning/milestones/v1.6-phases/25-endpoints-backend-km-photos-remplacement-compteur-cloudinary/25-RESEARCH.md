# Phase 25: Endpoints Backend (km, photos, remplacement compteur, Cloudinary) - Research

**Researched:** 2026-07-14
**Domain:** Node.js HTTP file upload (multer) + Cloudinary Node SDK, layered on a custom (non-Express) raw `http.createServer` router with RBAC
**Confidence:** HIGH (grounded directly in repo code + official docs + npm registry); MEDIUM on a couple of SDK error-mode specifics not explicitly documented upstream

## Summary

Phase 25 adds six-ish new HTTP endpoints on top of `motokey-api.js`'s existing custom router (NOT Express — a hand-rolled `http.createServer` with a `match()`-based route matcher). Two new npm packages are needed: `multer` (multipart parsing) and `cloudinary` (official Node SDK). All the DB-layer helpers (`RelevesKm.enregistrer`, `Consommables.upsert`/`listByMoto`, `PhotosConsommables.insert`/`listByConsommable`) and the RBAC helpers (`requireRole`, `requireAnyRole`, `getGarageIdForUser`) already exist and must be reused as-is — this phase is pure "HTTP + role-gating + Cloudinary upload," no new SQL.

The single most important architectural finding: **the current router unconditionally calls a hand-rolled `body(req)` JSON-body reader for every POST/PUT/PATCH request BEFORE any route matching happens** (`motokey-api.js` line ~554-555). This reader does `s += chunk` string concatenation on the raw bytes and then `JSON.parse`s the result. For a `multipart/form-data` request this would corrupt the binary payload (lossy Buffer→string coercion) before multer ever sees it. The codebase already has a precedent for exactly this problem: the `/stripe/webhook` route is special-cased **above** the generic `body()` call (to preserve raw bytes for Stripe signature verification, motokey-api.js lines 517-552). The new photo-upload routes (compteur photo + consommable photo) MUST follow the same pattern: intercept by `pathname`/`method` before the generic `body()` call, detect `Content-Type: multipart/form-data`, and hand the request to multer directly — never let it fall through to the JSON `body()` reader.

Cloudinary upload from an in-memory buffer (multer `memoryStorage`) is straightforward via `cloudinary.uploader.upload_stream(callback).end(buffer)` — no `streamifier` dependency needed (that library is only necessary if you want a true piped Readable stream; `.end(buffer)` accepts a Buffer directly). Multer must be pinned to `^2.1.1` or later — multer 1.x has two CVEs (CVE-2025-47944, CVE-2026-3520) with no fix; 2.x is the only safe line, current published version is 2.2.0.

**Primary recommendation:** Add `cloudinary@^2.10.0` and `multer@^2.2.0` to `package.json`. Special-case the two photo-upload routes before the generic `body()` parser (same pattern as `/stripe/webhook`). Build a small `services/cloudinaryService.js` module (mirroring the existing `emailService.js`/`pushService.js`/`visionAnalysisService.js` shape) that exposes an `uploadPhoto(buffer, {folder})` async function and a `CLOUDINARY_READY` boolean computed at module load — but unlike those other services, when `!CLOUDINARY_READY` the function must `throw`/return an explicit error (503), never a placeholder URL (D-02).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Upload is **backend-mediated**, not frontend-direct. Client sends multipart to backend via `multer`; backend uploads to Cloudinary via the Node SDK (API secret stays server-side, never exposed to client); backend stores the returned `secure_url`. Chosen over the existing pattern (`MotoKey_Client.html`, direct unsigned-preset upload) because Phase 25 has no UI — success criterion #5 must be verifiable this phase via an isolated test (curl multipart or Node script), not deferred to Phase 27.
- **D-02:** Cloudinary is **mandatory, no silent fallback** — unlike `EMAIL_ENABLED`/`PUSH_ENABLED`/`VISION_ENABLED`. If credentials are missing/misconfigured, the endpoint must return an explicit 500/503, never a placeholder URL. Rationale: CLOUD-01 explicitly says "real activation this milestone — no more placeholder"; a silent fake Cloudinary URL would corrupt anti-fraude proof data (compteur/consommable photos).
- **D-03:** File limits: **5 MB max, JPEG/PNG/WebP only**, validated backend-side BEFORE the Cloudinary call (avoids burning Cloudinary free-tier bandwidth/quota on an invalid file).
- **D-04:** Two endpoints coexist for consommables (CONSO-01), both calling `Consommables.upsert()` underneath (no business-logic duplication): a **unit** endpoint (PATCH per type) for day-to-day mechanic edits, and a **bulk** endpoint (array of 9 types) for initial moto setup, looping over `Consommables.upsert()` server-side.
- **D-05:** If `consommable_id` doesn't exist yet for the uploaded `type_consommable`, the photo-upload endpoint **auto-creates** the consommable row via `Consommables.upsert(moto_id, {type_consommable, km_montage: null, ...})` before linking `consommable_id` to the photo — rather than leaving the photo orphaned (`consommable_id` NULL is schema-permitted but not the chosen behavior). Guarantees Phase 27/28 gauges always have a row to render (partial gauge with NULL `km_montage` rather than absent).

### Claude's Discretion

- Exact HTTP route names (e.g. `/motos/:id/km`, `/motos/:id/km/remplacement-compteur`, `/motos/:id/consommables/:type`, `/motos/:id/consommables`, `/motos/:id/photos-consommables`) — follow existing `motokey-api.js` route-naming conventions.
- Exact Cloudinary env var shape (`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` separate vs single `CLOUDINARY_URL`) — both natively supported by the official Node SDK.
- Exact remplacement-compteur (KM-02) endpoint details — not discussed this session, but Phase 23 DB constraints already apply: app-level `note` required for `type_evenement='remplacement_compteur'`, `requireRole(ctx, 'PRO')` minimum (excludes MECANO and CLIENT), photo optional (treated like a normal km reading at schema level — `photo_url` nullable on `releves_km`).
- Exact relevé km normal (KM-03) endpoint — CLIENT + garage members (MECANO+) both allowed via `requireAnyRole(ctx, ['CLIENT'])` OR `requireRole(ctx, 'MECANO')`; `acteur_type`/`acteur_id` derived from `ctx` (never anonymous, per Phase 23 D-04).
- Exact multipart handling detail (multer `memoryStorage` vs `diskStorage`) and exact Cloudinary SDK call (`upload_stream` vs base64-buffer) — see Code Examples below; `memoryStorage` + `upload_stream(...).end(buffer)` is the research-backed recommendation.
- How `analyzePhoto()`'s result is returned to the client on photo upload (synchronous in the HTTP response, since the stub is pure computation with no real network latency) — no product preference expressed; natural behavior of the stub.

### Deferred Ideas (OUT OF SCOPE)

- **Remplacement compteur (KM-02) — exact motif/note mechanics** — not discussed this session (user chose to skip). Known constraints (note required, PRO+ strict, optional photo) are documented above; planner may decide remaining details (free text vs enum of motifs) without re-consultation unless a product preference turns out to be necessary mid-planning.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KM-02 | Un compte PRO/CONCESSION/ADMIN peut déclarer un changement de compteur (remplacement totaliseur) ; interdit à MECANO/CLIENT | `requireRole(ctx, 'PRO')` pattern documented (rbac.js); `RelevesKm.enregistrer(garage_id, moto_id, {km, type_evenement:'remplacement_compteur', acteur_type, acteur_id, note, photo_url})` already handles the DB side — trigger `verifier_km_monotone()` bypasses monotone-check entirely for this `type_evenement` (see migration 23). Endpoint only needs to: gate role, validate `note` present (not yet enforced in code per CONTEXT.md), optionally upload photo first, then call the helper. |
| KM-03 | Client ou membre garage peut soumettre un relevé km normal (photo optionnelle), sans déclencher changement de compteur | Dual CLIENT/GARAGE ownership-check pattern documented from `motokey-api.js` (GET /motos/:id, GET /devis); `RelevesKm.enregistrer()` with default `type_evenement='lecture'`; photo upload (if present) must complete BEFORE calling the helper since `photo_url` is a direct field, not a separate table. |
| CONSO-01 | Fiche consommables (9 types) avec km_montage/date_montage/reference saisis par le mécano | `Consommables.upsert()` already does the on-conflict upsert; D-04 requires two endpoints (unit PATCH + bulk POST) both delegating to this helper; the 9-type CHECK constraint list is authoritative in `sql/migrations/23_consommables_km.sql` (see Code Examples) — validate `type_consommable` against this exact list server-side before calling upsert, since RLS is default-deny and the DB CHECK is the only other guard. |
| CONSO-03 | Client ou membre garage peut uploader une photo de consommable, historisée avec date + analyse | multer `memoryStorage` + Cloudinary `upload_stream` + `analyzePhoto()` (Phase 24, contract locked) + `PhotosConsommables.insert()`; D-05 auto-create-consommable-row logic documented in Code Examples. |
| CLOUD-01 | Upload de photo (compteur ou consommable) stocke réellement l'image sur Cloudinary, URL exploitable, pas de placeholder | Cloudinary Node SDK `upload_stream`/`.end(buffer)` pattern, env var configuration, and D-02's "no silent fallback" requirement — contrasted explicitly against the `VISION_ENABLED`/`EMAIL_ENABLED` convention in Common Pitfalls below. |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `cloudinary` | ^2.10.0 (verified via `npm view cloudinary version` 2026-07-14) | Official Node SDK for Cloudinary upload/transform | Official vendor SDK, handles auth signing, multipart HTTP to Cloudinary API, returns `secure_url`/`public_id`/etc. |
| `multer` | ^2.2.0 (verified via `npm view multer version` 2026-07-14; minimum safe = 2.1.1) | Multipart/form-data parsing (file upload) for Node | De facto standard for handling `multipart/form-data` in Node; used with or without Express (see Architecture Patterns) |

### Supporting

None needed. `streamifier` is NOT required — `cloudinary.uploader.upload_stream(cb).end(buffer)` accepts a Buffer directly without needing to convert it into a piped Readable stream first (confirmed via Cloudinary's own buffer-upload documentation and multiple independent community write-ups).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `multer` memoryStorage | `multer` diskStorage | diskStorage writes to local disk first, then you'd read the file back to upload to Cloudinary — unnecessary I/O and cleanup burden since files here are never meant to persist locally (per additional_context). memoryStorage keeps the buffer in RAM only for the duration of the request; acceptable given the 5 MB/file cap (D-03) bounds worst-case memory use. |
| `cloudinary.uploader.upload_stream` | base64 data-URI + `cloudinary.uploader.upload()` | Base64 inflates payload size ~33% in memory/transit and is a slightly less idiomatic Node pattern for buffer uploads; `upload_stream` is the SDK's documented buffer-upload path and avoids the encoding overhead. Both work; `upload_stream` is what's shown in the SDK's own Node buffer-upload docs. |
| `CLOUDINARY_URL` single env var | Separate `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` | `CLOUDINARY_URL` is auto-detected by the SDK with zero code (`cloudinary://key:secret@cloud_name`); separate vars need an explicit `cloudinary.config({...})` call but are arguably clearer to eyeball in a Railway env var list and match the project's existing convention of separate named vars (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, etc., not a single combined URL). Both are natively supported — this is Claude's Discretion per CONTEXT.md. Given the project convention of individually-named Railway env vars everywhere else, **recommend the separate-vars form** for consistency, but either is technically sound. |

**Installation:**
```bash
npm install cloudinary@^2.10.0 multer@^2.2.0
```

**Version verification (2026-07-14):**
- `npm view cloudinary version` → `2.10.0`
- `npm view multer version` → `2.2.0`
- Training-data knowledge of multer defaulted to the 1.x API shape (`multer({ dest: ... })`, callback-style `fileFilter`) — this is now confirmed current via npm registry + GitHub release notes; multer 2.x is what must be installed (1.x has two open, unpatched CVEs as of this research date — see Common Pitfalls).

## Architecture Patterns

### Recommended Project Structure

No new folders needed — this phase adds routes inline in `motokey-api.js` (following the existing single-file router convention) plus one new service file:

```
motokey-api.js                    # add new routes here, following existing inline pattern
services/
├── cloudinaryService.js          # NEW — mirrors emailService.js/pushService.js shape:
│                                  #   CLOUDINARY_READY flag computed at module load,
│                                  #   uploadPhoto(buffer, opts) → { secure_url, public_id }
│                                  #   throws/rejects explicitly if !CLOUDINARY_READY (D-02)
├── visionAnalysisService.js       # EXISTING — analyzePhoto() contract locked, Phase 24
└── ...
auth/rbac.js                      # EXISTING — requireRole/requireAnyRole/getGarageIdForUser
supabase.js                       # EXISTING — RelevesKm/Consommables/PhotosConsommables helpers
```

### Pattern 1: Raw http.createServer router — multipart routes MUST be special-cased before body()

**What:** `motokey-api.js` is NOT Express (`express` is an unused dependency in `package.json`, likely added for a different phase — grep confirms zero `require('express')` in the codebase). The server is `http.createServer(async function(req, res) {...})` with a hand-rolled `match(method, reqMethod, pattern, pathname)` route matcher (`M('GET','/motos/:id')` style) and a hand-rolled JSON body reader:

```javascript
// motokey-api.js line ~404 — EXISTING, unconditionally consumes+JSON.parses ALL POST/PUT/PATCH bodies
function body(req) {
  return new Promise(function(resolve){
    let s='';
    req.on('data',function(c){s+=c;});          // ⚠️ Buffer→string coercion — LOSSY for binary
    req.on('end',function(){try{resolve(JSON.parse(s||'{}'));}catch(e){resolve({});}});
    req.on('error',function(){resolve({});});
  });
}
// ...
let b = {};
if(['POST','PUT','PATCH'].includes(method)) b = await body(req);   // line ~555 — runs BEFORE any route match
```

**When to use:** The two new photo-upload routes (compteur photo attached to a km reading, and consommable photo) MUST intercept the request before this line runs, exactly like the existing `/stripe/webhook` special case that's already in the codebase for the same reason (preserving raw bytes):

```javascript
// EXISTING precedent, motokey-api.js line ~517 — model to copy
if (pathname === '/stripe/webhook' && method === 'POST') {
  // ... reads raw body itself via req.on('data'/'end'), never calls body()
  return;
}
```

**Example (recommended shape for the new photo routes):**
```javascript
// Insert BEFORE `let b = await body(req);` (~line 554), mirroring the stripe webhook special-case
const contentType = req.headers['content-type'] || '';
if (pathname.match(/^\/motos\/[^/]+\/photos-consommables$/) && method === 'POST' && contentType.startsWith('multipart/form-data')) {
  return handlePhotoConsommableUpload(req, res, pathname);   // does its own multer parsing, own req.ctx extraction, own response
}
if (pathname.match(/^\/motos\/[^/]+\/km$/) && method === 'POST' && contentType.startsWith('multipart/form-data')) {
  return handleKmWithPhoto(req, res, pathname);
}
```

Multer's middleware works outside Express — you can call it directly as a plain function against Node's raw `req`/`res`:
```javascript
// Source: https://github.com/expressjs/multer (README) — confirmed multer works without full Express
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },              // D-03: 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));         // D-03: JPEG/PNG/WebP only
  }
});

function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('photo')(req, res, (err) => {          // 'photo' = multipart field name (route-level choice)
      if (err) return reject(err);
      resolve(req.file);   // { buffer, mimetype, size, originalname, ... }
    });
  });
}
```

Note the important consequence: since `req.ctx` (RBAC context, extracted via `rbac.extractRoleFromRequest(req, SBLayer)` at line ~560) is normally set AFTER the generic `body()` call and BEFORE route matching, but the new multipart routes intercept even earlier (before `body()`), each multipart handler must call `req.ctx = await rbac.extractRoleFromRequest(req, SBLayer);` itself before doing role checks — it cannot rely on the line further down having already run.

### Pattern 2: Dual CLIENT/GARAGE ownership check (established, reuse verbatim)

**What:** Every existing endpoint that's reachable by both CLIENT and MECANO+ roles (`GET /motos/:id`, `GET /devis`, `GET /motos/:id/interventions`) repeats the same two-branch shape. No shared helper function exists in the codebase for this (confirmed by grep) — it's inlined per-endpoint. Phase 25 should follow the same inline convention rather than introducing a new abstraction mid-phase (smaller diff, consistent with existing style), unless the planner judges the ~6 new endpoints justify extracting a shared `resolveMotoForCtx(ctx, motoId, SBLayer)` helper — this is a legitimate discretionary call, not a locked decision.

**Example (from motokey-api.js, GET /motos/:id, lines ~770-816):**
```javascript
const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION', level:4, user_id:null, email:null, client_type:null});

if (rbac.requireAnyRole(ctx, ['CLIENT'])) {
  const { data: rows } = await SBLayer.supabase.from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1);
  if (!rows || rows.length === 0) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
  const { data: moto } = await SBLayer.supabase.from('motos').select('*').eq('id', p.id).eq('client_id', rows[0].id).single();
  if (!moto) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
  // ... proceed
}

if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
// verify moto belongs to this garage (e.g. .eq('garage_id', garageId)) before proceeding
```

For KM-02 (remplacement compteur), only the PRO+ branch is needed (`rbac.requireRole(ctx, 'PRO')`) — CLIENT and MECANO must both be rejected with 403.

### Pattern 3: Cloudinary buffer upload with promise wrapper

**Example:**
```javascript
// services/cloudinaryService.js — NEW
'use strict';
const cloudinary = require('cloudinary').v2;

const CLOUD_NAME  = process.env.CLOUDINARY_CLOUD_NAME || null;
const API_KEY     = process.env.CLOUDINARY_API_KEY || null;
const API_SECRET  = process.env.CLOUDINARY_API_SECRET || null;

let CLOUDINARY_READY = false;
if (CLOUD_NAME && API_KEY && API_SECRET) {
  cloudinary.config({ cloud_name: CLOUD_NAME, api_key: API_KEY, api_secret: API_SECRET, secure: true });
  CLOUDINARY_READY = true;
  console.log('✅ [25] Config Cloudinary détectée');
} else {
  // D-02: PAS de fallback silencieux — juste un warning au boot, l'erreur réelle
  // se produit à l'appel d'uploadPhoto() (503 explicite), jamais une URL placeholder.
  console.warn('⚠️  [25] Cloudinary non configuré (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET manquants)');
}

async function uploadPhoto(buffer, { folder = 'motokey' } = {}) {
  if (!CLOUDINARY_READY) {
    const err = new Error('Cloudinary non configuré');
    err.statusCode = 503; err.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw err;
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: 'image' }, (error, result) => {
      if (error) {
        const err = new Error(error.message || 'Échec upload Cloudinary');
        err.statusCode = 502; err.code = 'CLOUDINARY_UPLOAD_FAILED';
        return reject(err);
      }
      resolve(result); // { secure_url, public_id, ... }
    });
    stream.end(buffer);
  });
}

module.exports = { uploadPhoto, CLOUDINARY_READY };
```

Route usage:
```javascript
try {
  const file = await runMulter(req, res);     // throws MulterError on size/type violation
  if (!file) return fail(res, 'Photo requise', 400, 'VALIDATION_ERROR');
  const result = await cloudinaryService.uploadPhoto(file.buffer, { folder: `motokey/consommables/${motoId}` });
  // ... proceed with result.secure_url
} catch (e) {
  if (e instanceof multer.MulterError && e.code === 'LIMIT_FILE_SIZE') return fail(res, 'Photo trop volumineuse (max 5 Mo)', 400, 'FILE_TOO_LARGE');
  if (e.statusCode) return fail(res, e.message, e.statusCode, e.code);   // Cloudinary-thrown errors, D-02
  return fail(res, e.message, 500, 'UPLOAD_ERROR');
}
```

### Anti-Patterns to Avoid

- **Reading the multipart body via the existing `body(req)` JSON reader:** corrupts binary data (Buffer→string coercion) and will never successfully `JSON.parse` a multipart payload anyway. Always special-case multipart routes before that call.
- **Replicating the `VISION_ENABLED`/`EMAIL_ENABLED` fallback convention for Cloudinary:** those services intentionally degrade to a stub/console.log when unconfigured. D-02 explicitly forbids this for Cloudinary — misconfiguration must produce a 500/503, not a placeholder URL, because a fake URL would corrupt anti-fraude proof data.
- **Uploading to Cloudinary before validating file size/MIME type:** D-03 requires backend validation (multer `limits.fileSize` + `fileFilter`) before ever calling the Cloudinary SDK, to avoid burning free-tier quota on invalid files.
- **Leaving a photo's `consommable_id` NULL when no consommable row exists yet:** schema-permitted but D-05 explicitly chooses auto-creation of the consommable row instead (see Code Examples).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart/form-data parsing | Custom boundary-parsing logic on top of `req.on('data')` | `multer` (memoryStorage) | Multipart parsing (boundaries, headers-per-part, encoding edge cases) is exactly the kind of "looks simple, is a minefield" problem multer already solves correctly and is battle-tested for. |
| Cloudinary upload signing/auth | Manual HMAC signature generation for signed uploads | `cloudinary` official Node SDK | The SDK handles API auth, retries, and response shape (`secure_url`, `public_id`, `bytes`, etc.) — reimplementing this is pure risk for zero benefit. |
| Buffer→Cloudinary stream bridging | Custom Readable-stream wrapper around the buffer | `cloudinary.uploader.upload_stream(cb).end(buffer)` | The SDK's `upload_stream` returns a writable stream whose `.end(buffer)` accepts a Buffer directly — no need for `streamifier` or a manual `Readable.from()` wrapper. |
| km monotone/anti-fraude validation | Re-checking km regression in the endpoint handler | `RelevesKm.enregistrer()` (delegates to DB trigger `verifier_km_monotone`) | Already built, tested, and is the sole source of truth per KM-04. Duplicating the check in JS would create a second, driftable copy of anti-fraude logic — exactly the kind of bypass Phase 23 closed. |

**Key insight:** This phase's entire value is in NOT re-deriving business logic that Phase 23/24 already built — the only genuinely new code is the HTTP transport layer (routing, role gating, multipart parsing, Cloudinary upload) sitting on top of existing, locked-contract helpers.

## Common Pitfalls

### Pitfall 1: Generic `body()` JSON reader silently corrupts multipart uploads

**What goes wrong:** If a new photo-upload route is added the same way as every other existing route (i.e., without intercepting before `body(req)`), the raw multipart bytes get string-concatenated (`s += c`) and `JSON.parse`d, which both corrupts binary data and fails to parse, silently resolving to `{}`. `req.file`/`req.body` would never exist, and multer, invoked afterward, would receive an already-fully-consumed stream (multer would hang or immediately error since there's nothing left to read).
**Why it happens:** The router runs `body()` unconditionally for POST/PUT/PATCH before any route matching (`motokey-api.js` line ~554), a design that predates any multipart need in this codebase.
**How to avoid:** Special-case the new upload routes by `pathname` + `Content-Type` check BEFORE the `body()` call, exactly mirroring the existing `/stripe/webhook` precedent (which does the same thing for a different reason — preserving raw bytes for signature verification).
**Warning signs:** `req.file` is `undefined` in the handler; multer throws `Unexpected end of form` or the request hangs; uploaded images come back 0 bytes or corrupted on Cloudinary.

### Pitfall 2: `req.ctx` not populated for early-intercepted multipart routes

**What goes wrong:** RBAC context (`req.ctx`) is normally set at line ~560, AFTER `body()` and BEFORE route matching. If a multipart route bypasses `body()` by intercepting earlier in the function, `req.ctx` will be `undefined` when the handler runs its role check, causing every request to be treated as unauthenticated.
**Why it happens:** The multipart special-case necessarily runs before the line that sets `req.ctx`.
**How to avoid:** Each new multipart handler must call `req.ctx = await rbac.extractRoleFromRequest(req, SBLayer);` itself, before any `rbac.requireRole`/`requireAnyRole` check.
**Warning signs:** All authenticated multipart requests return 401/403 even with a valid Bearer token.

### Pitfall 3: multer 1.x security vulnerabilities

**What goes wrong:** Installing `multer` without pinning to `^2.1.1`+ could pull in a 1.x version (if any transitive constraint forces it) with known unpatched CVEs (CVE-2025-47944, CVE-2026-3520).
**Why it happens:** Training-data familiarity with multer defaults to the 1.x API shape; a careless `npm install multer` without version awareness could still resolve to an old cached/lockfile version in some scenarios, or a copy-pasted example from an older tutorial might pin `multer@1.4.x` explicitly.
**How to avoid:** Explicitly install `multer@^2.2.0` (verified current on npm registry, 2026-07-14) and confirm `package.json` reflects `^2.x`, not `^1.x`.
**Warning signs:** `npm audit` flagging multer; `package.json` showing a `1.` major version for multer.

### Pitfall 4: Cloudinary config validated too late / inconsistent error surface

**What goes wrong:** If the Cloudinary SDK is only configured lazily inside the route handler (re-reading env vars per-request) rather than once at module load, a misconfiguration might not surface consistently, or might throw an uncaught synchronous exception that crashes the request handler instead of producing a clean 503.
**Why it happens:** Cloudinary's own docs don't explicitly document whether missing config throws synchronously vs. surfaces as an async upload error — community reports (`Must supply api_key`, GitHub issues #204/#527/#664 on `cloudinary_npm`) show this error can appear in different code paths depending on how/when `.config()` was called.
**How to avoid:** Compute a `CLOUDINARY_READY` boolean once at module load (mirroring `VISION_ENABLED`'s ready-flag pattern in `visionAnalysisService.js`), check it explicitly at the top of `uploadPhoto()` and throw a typed error with `statusCode = 503` BEFORE ever calling into the SDK — never rely on catching whatever the SDK happens to throw for missing config, since that behavior isn't officially documented and could change between SDK versions. Wrap the actual `upload_stream` call in its own try/catch too (for network/API errors, `statusCode = 502`), keeping the two failure modes (not-configured vs. upload-failed) distinguishable in logs and API responses.
**Warning signs:** Unhandled promise rejection crashing the process on a misconfigured Cloudinary attempt; inconsistent error codes/messages between "Cloudinary not configured" and "Cloudinary API rejected the upload."

### Pitfall 5: `type_consommable` validation duplicated/drifted from the DB CHECK constraint

**What goes wrong:** The 9 valid types are enforced by a Postgres `CHECK` constraint (migration 23) but there's no JS-side constant exported from `supabase.js` for this list today. If the new endpoints hardcode their own copy of the 9-type list (e.g., in a route validation block), a future migration adding a 10th type (CONSO-02 explicitly anticipates this) would require updating two places instead of one, and if they drift, the endpoint might reject a type the DB would accept (or vice versa — accept a type the DB CHECK then silently rejects with an opaque Postgres error).
**Why it happens:** `Consommables.upsert()` in `supabase.js` doesn't validate `type_consommable` against the list itself (it just passes through to the DB, which enforces the CHECK) — so any app-level validation for a nicer 400 error message needs its own list.
**How to avoid:** Define the 9-type list as a single exported constant (e.g., in `supabase.js` near `Consommables`, or in a small shared constants file) and import it wherever the route needs to validate before calling `upsert()` — one source of truth, easy to extend when CONSO-04/Phase 27 adds a new type later.
**Warning signs:** A CONSO-01 request with an invalid `type_consommable` returns a raw Postgres constraint-violation error message instead of a clean 400 `VALIDATION_ERROR`.

## Code Examples

### The 9 canonical consommable types (authoritative, from migration 23)
```sql
-- Source: sql/migrations/23_consommables_km.sql, CHECK constraint on consommables.type_consommable
'pneu_av','pneu_ar','chaine','plaquettes_av','plaquettes_ar',
'disque_av','disque_ar','huile_moteur','liquide_frein'
```

### RelevesKm.enregistrer() return contract (existing, supabase.js ~L385-417)
```javascript
// { accepted: true, releve: {...} }                                  — normal success
// { accepted: false, km_tente: <int>, km_actuel: <int> }              — rejected by monotone trigger
// throws Error(...) for missing required fields (moto_id, km, acteur_type+acteur_id)
```
The endpoint must branch on `accepted` and, for KM-03 (normal reading), return e.g. HTTP 409 with `km_tente`/`km_actuel` when `accepted === false` — this is NOT an exception path, it's a documented normal rejection flow the endpoint must translate into an HTTP response (there is no existing HTTP-layer consumer of this helper yet — Phase 25 is the first).

### analyzePhoto() contract (locked, Phase 24 — services/visionAnalysisService.js header)
```javascript
// analyzePhoto({ photoUrl, consommableId, typeConsommable, kmActuel, kmMontage }) → Promise<{
//   pct_usure: int 0-100, etat: 'bon'|'moyen'|'usé'|'critique',
//   confiance: int 0-100, analyse_status: 'ok'|'incertain', engine: 'stub'
// }>
```
Call this AFTER the Cloudinary upload succeeds (needs `photoUrl` = the Cloudinary `secure_url`) and BEFORE `PhotosConsommables.insert()` (needs `analyse_ia`/`analyse_status` as insert fields).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| multer 1.x (`multer({dest})`, older fileFilter shape) | multer 2.x (`multer({storage: multer.memoryStorage()})`) | 2.x released per GitHub release notes (multiple CVEs against all 1.x versions, "only safe version is multer@2.1.1"+) | Must install `^2.1.1`+ explicitly; do not follow older tutorials pinning `multer@1.4.x`. |

**Deprecated/outdated:** multer 1.x — actively vulnerable (CVE-2025-47944, CVE-2026-3520), no patch will be issued for the 1.x line per the security advisory; must use 2.x.

## Open Questions

1. **Does the Cloudinary Node SDK throw synchronously or reject asynchronously on missing/invalid credentials?**
   - What we know: Community reports (`Must supply api_key`) confirm this error occurs, but official docs don't specify the exact throw timing/mode across SDK versions.
   - What's unclear: Whether it's a synchronous throw inside `cloudinary.config()`/`uploader.upload_stream()` or an async rejection via the callback.
   - Recommendation: Don't rely on catching whatever the SDK does — gate with an explicit `CLOUDINARY_READY` check computed from env vars at module load (see Code Examples), so the 503 response is deterministic regardless of the SDK's internal error-throwing behavior. Wrap the actual upload call in try/catch as defense-in-depth for other failure modes (network, invalid image, quota).

2. **Should a shared `resolveMotoForCtx(ctx, motoId, SBLayer)` ownership helper be extracted, given ~6 new endpoints will repeat the dual CLIENT/GARAGE ownership pattern?**
   - What we know: No such helper exists today; every existing endpoint inlines the check.
   - What's unclear: Whether extracting one now is worth the departure from the established (if repetitive) convention, mid-milestone.
   - Recommendation: Planner's call — either is defensible; if extracted, keep the return shape and error semantics (`404 NOT_FOUND` for both "moto doesn't exist" and "moto exists but isn't yours," matching current behavior which avoids leaking existence) identical to the inlined pattern to avoid behavior drift.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `cloudinary` (npm package) | CLOUD-01, KM-03/KM-02 photo, CONSO-03 | ✗ (not yet installed) | 2.10.0 (registry, to be added) | None — CLOUD-01 requires real activation this milestone; D-02 forbids a fallback. Must be installed and configured before this phase can be considered done. |
| `multer` (npm package) | KM-03/KM-02 photo, CONSO-03 | ✗ (not yet installed) | 2.2.0 (registry, to be added; ^2.1.1 minimum for security) | None — required for any multipart endpoint. |
| Cloudinary account credentials (`CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET` or `CLOUDINARY_URL`) | CLOUD-01 | ✗ (not configured locally per CONTEXT.md code_context; unknown on Railway) | — | None per D-02 — must be provisioned (dev + Railway prod env vars) before the upload endpoints can pass their own verification test. This is a known pre-requisite the plan should flag as a setup/config task, likely requiring Mehdi to create/verify a Cloudinary account and supply credentials. |
| Node.js | multer 2.x runtime requirement | ✓ | engines: `>=20` in package.json | — |

**Missing dependencies with no fallback:**
- Cloudinary account credentials — must be provisioned by Mehdi (account creation / dashboard credentials) before Phase 25's own success-criteria test can pass end-to-end. This is external-account-dependent, similar in kind (though not blocking severity) to the Stripe live-mode and app-store known gaps already tracked in PROJECT.md.

**Missing dependencies with fallback:**
- None — both new npm packages are simple `npm install` additions with no viable substitute given the locked architecture decisions (D-01/D-02).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (no jest/mocha/vitest in `package.json`) — project convention is ad-hoc Node scripts (`test-api.js`, `tests/test-or-e2e.js`, `tests/test-client-device-tokens.js`) that spin up raw `http` requests against a running local server instance and print ✅/❌ per assertion. |
| Config file | none — see Wave 0 |
| Quick run command | `node motokey-api.js` (in one terminal) then `node tests/test-km-photos-cloudinary.js` (new script, in another) |
| Full suite command | `node test-api.js && node tests/test-or-e2e.js && node tests/test-client-device-tokens.js && node tests/test-km-photos-cloudinary.js` (run all existing ad-hoc suites plus the new one against a running local server) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KM-02 | PRO+ can declare compteur replacement; MECANO/CLIENT get 403 | integration (http request against running server) | `node tests/test-km-photos-cloudinary.js` (new) | ❌ Wave 0 |
| KM-03 | CLIENT or garage member submits normal km reading, optional photo | integration | `node tests/test-km-photos-cloudinary.js` (new) | ❌ Wave 0 |
| CONSO-01 | Mechanic can PATCH one consommable or POST bulk 9-type array | integration | `node tests/test-km-photos-cloudinary.js` (new) | ❌ Wave 0 |
| CONSO-03 | Photo upload for a consommable, auto-creates row if missing, triggers stub analysis | integration (multipart request — needs a real image fixture, e.g. a small JPEG committed under `tests/fixtures/`) | `node tests/test-km-photos-cloudinary.js` (new) | ❌ Wave 0 |
| CLOUD-01 | Upload actually round-trips through Cloudinary and returns a working `secure_url` | integration, requires live Cloudinary credentials in `.env` | `node tests/test-km-photos-cloudinary.js` (new) — this specific assertion should be skippable/flagged if `CLOUDINARY_*` env vars are absent locally, rather than failing the whole suite, since credentials may not be provisioned in every dev environment | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** run the relevant slice manually against a locally running `node motokey-api.js` (no fast unit-test layer exists in this codebase to sample more cheaply — the whole test style here is integration-level HTTP calls).
- **Per wave merge:** run the new `tests/test-km-photos-cloudinary.js` full script plus a quick smoke of `node --check motokey-api.js` (existing project convention per CLAUDE.md "Commandes utiles").
- **Phase gate:** full script green (including a real Cloudinary round-trip if credentials are available; otherwise document the gap explicitly rather than silently skip) before `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `tests/test-km-photos-cloudinary.js` — new ad-hoc integration script covering KM-02/KM-03/CONSO-01/CONSO-03/CLOUD-01, following the existing `tests/test-or-e2e.js` style (raw `http` requests, ✅/❌ console output)
- [ ] `tests/fixtures/` — needs at least one small real JPEG/PNG (<5MB) checked in as a multipart upload fixture, since none of the existing test scripts do file uploads
- [ ] Cloudinary dev credentials in local `.env` — without them, CLOUD-01's real-round-trip assertion cannot run locally; document this as an explicit setup dependency in the plan, not a silent skip
- [ ] Framework install: `npm install cloudinary@^2.10.0 multer@^2.2.0`

## Sources

### Primary (HIGH confidence)
- Direct repo inspection: `motokey-api.js` (router architecture, body() reader, stripe webhook precedent, dual CLIENT/GARAGE pattern, ok/fail/sendJSON helpers) — read lines 1-120, 355-470, 486-560, 670-1230
- Direct repo inspection: `supabase.js` (`RelevesKm.enregistrer` ~L385-417, `Consommables` ~L1314-1345, `PhotosConsommables` ~L1350-1381, `createClient(..., SUPABASE_SERVICE_KEY)` confirming service-role bypass of RLS)
- Direct repo inspection: `auth/rbac.js` (full file — `requireRole`, `requireAnyRole`, `getGarageIdForUser`, `ROLE_HIERARCHY`)
- Direct repo inspection: `services/visionAnalysisService.js` header comment (locked `analyzePhoto()` contract, `VISION_ENABLED` fallback convention explicitly NOT to be copied for Cloudinary)
- Direct repo inspection: `sql/migrations/23_consommables_km.sql` (authoritative 9-type CHECK constraint, RLS default-deny rationale, trigger `verifier_km_monotone` bypass for `remplacement_compteur`)
- `npm view cloudinary version` → 2.10.0 (2026-07-14)
- `npm view multer version` → 2.2.0 (2026-07-14)
- [expressjs/multer README](https://github.com/expressjs/multer/blob/master/README.md) — memoryStorage vs diskStorage, limits, fileFilter, MulterError, non-Express compatibility (`upload.single(field)(req,res,cb)`)
- [Cloudinary Node image/video upload docs](https://cloudinary.com/documentation/node_image_and_video_upload) — `upload_stream` buffer pattern with `.end(buffer)`

### Secondary (MEDIUM confidence)
- [PackageFix multer 2.0 migration guide](https://packagefix.dev/fix/npm/multer/migrate) + WebSearch cross-reference — multer 1.x→2.x breaking changes (error handling, fileFilter callback signature, storage-engine peer compat) and CVE-2025-47944/CVE-2026-3520 affecting all 1.x versions, "only safe version is multer@2.1.1"
- WebSearch cross-referencing multiple 2024-2026 dev.to/Medium write-ups — confirms `upload_stream(cb).end(buffer)` pattern as the common, working approach without needing `streamifier`
- [Cloudinary Node integration/configuration docs](https://cloudinary.com/documentation/node_integration) — `CLOUDINARY_URL` auto-detection vs explicit `cloudinary.config()` call

### Tertiary (LOW confidence)
- GitHub issues (cloudinary/cloudinary_npm #204, #527, #664) re: "Must supply api_key" — anecdotal evidence of error surface, not an authoritative statement of throw-timing/mode; flagged as Open Question above rather than stated as fact.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified live against npm registry same day as research; SDK usage patterns cross-verified against official docs + multiple independent community sources.
- Architecture (router special-casing, ownership pattern): HIGH — grounded directly in reading the actual `motokey-api.js` source, not inferred; the `/stripe/webhook` precedent is a real, existing pattern in this exact codebase.
- Pitfalls: HIGH for the router/body()/multer-version pitfalls (directly observed in code / verified via registry + security advisories); MEDIUM for the Cloudinary error-surface pitfall (official docs silent on exact throw semantics, mitigated via a defensive design rather than relying on documented behavior).

**Research date:** 2026-07-14
**Valid until:** ~30 days for architecture/pattern findings (stable, tied to this specific codebase); ~7-14 days for the exact npm package versions cited (fast-moving; re-verify with `npm view` before actually running `npm install` if planning is delayed).
