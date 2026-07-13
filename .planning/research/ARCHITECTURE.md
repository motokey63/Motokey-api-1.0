# Architecture Research

**Domain:** Consumable-wear tracking + odometer anti-fraud + stubbed Vision-analysis, added to an existing Node/Express + Supabase + React Native monolith (MotoKey)
**Researched:** 2026-07-13
**Confidence:** HIGH (all findings verified against the actual codebase — `motokey-api.js`, `supabase.js`, `schema.sql`, `services/*.js`, `mobile-app/`, not training-data guesses)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENTS (browser origin-shared)                                     │
│  ┌────────────┐  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │ app.html   │  │ MotoKey_Client    │  │ mobile-app (Expo Router) │ │
│  │ (garage)   │  │ .html (client web)│  │ TypeScript, HTTP-only    │ │
│  └─────┬──────┘  └────────┬──────────┘  └────────────┬──────────────┘ │
│        │  Cloudinary unsigned-preset upload happens HERE (browser →  │
│        │  Cloudinary directly), THEN the resulting secure_url is     │
│        │  POSTed to the Express API as a plain string field.         │
├────────┴────────────────────┴──────────────────────────┴─────────────┤
│                    EXPRESS API (motokey-api.js, single file router)  │
│  req.ctx = rbac.extractRoleFromRequest()  →  rbac.requireRole(ctx,X) │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌─────────────┐ │
│  │ emailService │ │ pushService  │ │ maintenance-   │ │ (NEW)       │ │
│  │ .js          │ │ .js          │ │ AlertService.js│ │ visionAnaly-│ │
│  │ EMAIL_ENABLED│ │ PUSH_ENABLED │ │ (cron scanner) │ │ sisService.js│ │
│  └──────┬───────┘ └──────┬───────┘ └───────┬────────┘ └──────┬──────┘ │
├─────────┴────────────────┴─────────────────┴─────────────────┴───────┤
│                    supabase.js (per-entity helper objects,           │
│                    service_role key — RLS bypassed by design)        │
│  Motos, Interventions, Entretien, Devis, PushSendLog, ... (NEW)      │
│  Consommables, PhotosConsommables, RelevesKm                         │
├────────────────────────────────────────────────────────────────────┤
│                    SUPABASE POSTGRES (RLS enabled everywhere,        │
│                    but only enforced for direct client SDK access —  │
│                    the app never uses direct client SDK for data,    │
│                    so RLS here is a default-deny defense-in-depth    │
│                    layer, NOT the primary authorization mechanism)   │
│  motos ← consommables ← photos_consommables                         │
│        ← releves_km                                                 │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation (this codebase) |
|-----------|-----------------|------------------------------------------|
| `motokey-api.js` | Route matching (`M(method, path)`), RBAC gate, request/response shaping, RAM-fallback mirror of every DB write path | One giant `if ((p = M('POST', '/x')) !== null) { ... }` block per endpoint — **new endpoints must follow this exact pattern**, not Express `app.post()` routers |
| `auth/rbac.js` | Role extraction from Supabase JWT `app_metadata.role`, hierarchy check (`requireRole`), garage resolution (`getGarageIdForUser`) | Pure functions, no DB writes; imported everywhere role checks happen |
| `supabase.js` | One object-of-functions per DB entity (`Motos`, `Devis`, `PushSendLog`, ...), always using the **service_role** client (`supabase`, not `supabasePublic`) | New entities get a new `const X = { async method() {...} }` block + export |
| `services/*.js` | Feature-flagged external-integration wrappers (email, push) and cron-triggered scanners (maintenance alerts) | `ENABLED` flag from `process.env`, real-client init only if flag true, `console.log` fallback otherwise, **never throws** |
| Cron endpoints | `POST /cron/xxx` gated by `X-Cron-Secret` header compared to `process.env.CRON_SECRET`, calls a `services/xxxService.js` function | No `node-cron` in-process scheduler exists — an external scheduler (Railway cron / uptime pinger) hits these endpoints |
| `app.html` / `MotoKey_Client.html` | Vanilla JS, no framework, no build step, single-origin with the API (no CORS) | New UI screens are new `render*()` functions + `<script>` blocks appended to the existing files |
| `mobile-app/` | Expo Router (TypeScript), talks to the Express API over HTTP only — **never** calls the Supabase SDK directly for table data (confirmed: no `createClient`/`SUPABASE_URL` reference anywhere in `mobile-app/` except README) | New screens are new files under `app/(app)/(tabs)/...`; push routing is a pure function (`mapNotificationDataToRoute`) unit-tested separately from the navigation side-effect |

## Recommended Project Structure (additions only)

```
motokey-api.js                        # add new endpoint blocks (upload photo, upload km, gauges) — same M() pattern
supabase.js                           # add 3 new entity objects: Consommables, PhotosConsommables, RelevesKm
services/
├── emailService.js                   # unchanged — reference pattern
├── pushService.js                    # unchanged — DO NOT duplicate idempotency logic, call it
├── maintenanceAlertService.js        # unchanged — reference pattern for the NEW consumable-reminder cron
├── consommableAlertService.js        # NEW — mirrors maintenanceAlertService.js, calls pushService.sendPush()
└── visionAnalysisService.js          # NEW — VISION_ENABLED flag + console.log/stub fallback, single exported analyze() fn
sql/migrations/
├── 23_consommables.sql               # NEW — table consommables (moto_id FK)
├── 24_photos_consommables.sql        # NEW — table photos_consommables (moto_id + consommable_id FK)
├── 25_releves_km.sql                 # NEW — table releves_km (moto_id FK) + monotonic-check support columns
└── 26_consommables_rls.sql           # NEW — RLS enable + policies for the 3 tables (or fold into 23-25)
schema.sql                            # regenerate/hand-append same commit as the migrations above (SCHEMA-07 discipline)
scripts/
└── bootstrap-fresh-schema.js         # rerun after schema.sql edits — existing tool, no new tool needed
app.html                              # add renderConsommablesGauge(motoId), photo-upload UI reusing CLOUDINARY_CLOUD pattern
MotoKey_Client.html                   # add client-facing gauge screen + photo capture (same Cloudinary client-side upload pattern as claim.tsx/submitClaim)
mobile-app/
├── app/(app)/(tabs)/motos/[id]/consommables.tsx   # NEW screen — gauges
├── lib/consommables.ts                             # NEW — API client functions (mirrors lib/garageLiaison.ts style)
└── hooks/useNotificationObserver.ts                # MODIFY — add one new `data.type === 'consommable_reminder'` case to mapNotificationDataToRoute()
```

### Structure Rationale

- **No new backend framework/router:** `motokey-api.js` is a single 107KB file using a hand-rolled `M(method, path)` matcher, not Express Router mounting per-resource files. Introducing a `routes/consommables.js` Express Router would be an architectural inconsistency the codebase has consistently avoided (see CLAUDE.md: `app.html`/`motokey-api.js` discipline). New endpoints go in the same file, same pattern, same RAM-fallback mirror (`if (USE_SUPABASE && SBLayer) {...} else {/* RAM fallback */}`).
- **`services/` is reserved for two kinds of things**, and the new work fits both: (1) feature-flagged external integrations (email/push/Vision — same `ENABLED` env-flag convention), and (2) cron-triggered scan-and-notify jobs (maintenance alerts — the exact shape needed for the km/6-month photo reminder).
- **`supabase.js` entity objects are the only DB access boundary.** Nothing in `motokey-api.js` should call `supabase.from(...)` directly for the new tables — it should call `SBLayer.Consommables.xxx()`, matching every existing entity (`Motos`, `Devis`, `Entretien`, `PushSendLog`).

## Architectural Patterns

### Pattern 1: `ENABLED`-flag service module (stub-now/real-later)

**What:** A service module reads a boolean env flag at module load. If true AND the real SDK/client initializes successfully, it uses the real integration. In every other case (flag false, missing key, SDK import failure) it falls back to a `console.log`/deterministic-stub path — and **never throws**, so a misconfigured flag degrades gracefully instead of breaking the request.

**When to use:** Exactly the situation described for Vision analysis — real Anthropic key not wired yet, but the endpoint contract must be stable now so frontend/mobile work can proceed in parallel.

**Trade-offs:** Requires discipline to keep the stub's *output shape* byte-for-byte identical to what the real call will return, or every caller needs a second code path later. Get the JSON contract right on day one.

**Example (mirrors `pushService.js` structure exactly):**
```javascript
'use strict';
const VISION_ENABLED = process.env.VISION_ENABLED === 'true';
let anthropicClient = null;
if (VISION_ENABLED) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('⚠️  VISION_ENABLED=true mais ANTHROPIC_API_KEY manquant — fallback stub');
    } else {
      anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  } catch (e) {
    console.warn('⚠️  SDK @anthropic-ai/sdk non disponible — fallback stub:', e.message);
  }
}

/**
 * @param {string} photoUrl   Cloudinary secure_url (already uploaded client-side)
 * @param {string} consommableType  e.g. 'pneu_avant' | 'plaquettes_av' | ...
 * @returns {Promise<{usure_pct:number, etat:string, confiance:number, source:'stub'|'anthropic'}>}
 */
async function analyzePhoto(photoUrl, consommableType) {
  if (VISION_ENABLED && anthropicClient) {
    try {
      // real call — implemented later, SAME return shape as the stub below
      // const msg = await anthropicClient.messages.create({...});
      // return { usure_pct, etat, confiance, source: 'anthropic' };
    } catch (e) {
      console.error('❌ Vision analyse échouée, fallback stub:', e.message);
    }
  }
  // Stub — deterministic-ish fake analysis, same shape as the real call
  return { usure_pct: 42, etat: 'moyen', confiance: 0.5, source: 'stub' };
}
module.exports = { analyzePhoto };
```

**Key interface-boundary decision:** the swap point is the *return shape* of `analyzePhoto()`, not the calling endpoint. The endpoint (`POST /motos/:id/consommables/:cid/photos`) should call `visionAnalysisService.analyzePhoto(url, type)` once and persist whatever it returns into `photos_consommables.analyse` (JSONB) — identical to how `interventions.facture_ocr` is already a JSONB dump of an OCR-shaped payload. When the real Anthropic Vision call is implemented, only `visionAnalysisService.js` changes; the endpoint and the DB column are untouched.

### Pattern 2: Cron-scan-and-notify service (reuse `pushService`'s idempotency, don't duplicate it)

**What:** A dedicated `services/xxxAlertService.js` module owns the *business logic* of "what changed, does it cross a threshold, what copy to send" — but delegates the actual send + idempotency entirely to `pushService.sendPush(clientId, payload, idempotencyKey)`. State that prevents re-notification lives on the DB row itself (a `last_..._notified` style column), not in a separate log table.

**When to use:** Exactly the km-since-last-photo + 6-month-fallback reminder. This is structurally identical to `maintenanceAlertService.js`'s tier-crossing detection — same shape, different threshold rule.

**Trade-offs:** Requires a `POST /cron/consommables-reminders` endpoint gated by the same `X-Cron-Secret` pattern, and requires whatever external scheduler currently pings `/cron/maintenance-alerts` to also ping this new endpoint (operational step, not code).

**Example (mirrors `maintenanceAlertService.js` exactly, adapted for two independent trigger conditions):**
```javascript
'use strict';
const SBLayer = require('../supabase');
const pushService = require('./pushService');

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

async function runConsommableReminderCron() {
  const { data: rows, error } = await SBLayer.supabase
    .from('consommables')
    .select('id, moto_id, type, km_derniere_photo, date_derniere_photo, motos!inner(client_id, km, marque, modele)')
    .not('motos.client_id', 'is', null);
  if (error) return { error: error.message };

  let notified = 0;
  const details = [];
  for (const c of rows || []) {
    const kmSince = (c.motos.km || 0) - (c.km_derniere_photo || 0);
    const monthsSince = c.date_derniere_photo
      ? (Date.now() - new Date(c.date_derniere_photo).getTime()) > SIX_MONTHS_MS
      : true; // never photographed = due immediately (same "null = worse than any tier" logic as maintenanceAlertService)
    const due = kmSince >= 3000 || monthsSince; // threshold illustrative — confirm with Mehdi

    if (due) {
      const idempotencyKey = `consommable-reminder:${c.id}:${new Date().toISOString().slice(0, 7)}`; // monthly dedup, not daily — avoid spamming for a slow-moving metric
      const res = await pushService.sendPush(
        c.motos.client_id,
        { title: 'Photo consommable à jour', body: `Pensez à photographier ${c.type} de votre ${c.motos.marque}.`,
          data: { type: 'consommable_reminder', motoId: c.moto_id, consommableId: c.id } },
        idempotencyKey
      );
      notified++;
      details.push({ consommable_id: c.id, res });
    }
  }
  return { scanned: (rows || []).length, notified, details };
}
module.exports = { runConsommableReminderCron };
```

**Why this avoids duplicating idempotency logic:** `pushService.sendPush()` already owns the `push_send_log` insert-first UNIQUE-constraint dance (see `services/pushService.js` lines ~42-53). The new service only needs to construct a *correctly-scoped* `idempotencyKey` (monthly granularity here, vs daily in `maintenanceAlertService`, because km/6-month drift is slow) — it must never write to `push_send_log` itself.

### Pattern 3: Client-side Cloudinary upload + flag-gated UI (not a backend upload proxy)

**What:** Photo upload does **not** go through the Express API as a file stream. The browser/mobile app uploads directly to Cloudinary's unsigned-preset endpoint, gets back a `secure_url`, and POSTs that URL (a plain string) to the backend. The backend never touches binary photo data for this feature — it only stores/validates URLs (this differs from `Storage.uploadFacture`/`uploadPhoto` in `supabase.js`, which use *Supabase* Storage server-side for a different, older feature — do not conflate the two upload mechanisms).

**When to use:** Any new photo-capture flow in this codebase. This is the established precedent (`MotoKey_Client.html` L1100-1223, `submitClaim()`/`uploadToCloudinary()`).

**Trade-offs:** `CLOUDINARY_CLOUD` is currently the **empty string** in `MotoKey_Client.html` (line 1100) — Cloudinary is *not yet wired* even though a preset name (`motokey_unsigned`) exists. The existing precedent handles this by rendering a disabled placeholder in the UI and sending a sentinel string (`'pending_manual_verification'`) to the backend instead of a real URL when the cloud name is unset. The new consommable-photo UI must follow the identical gate — check `CLOUDINARY_CLOUD` truthiness before rendering the file input, and never assume the URL field is populated.

**Example (same gate as `submitClaim()`):**
```javascript
if (CLOUDINARY_CLOUD) {
  const url = await uploadToCloudinary(file);
  await apiPost('/motos/'+motoId+'/consommables/'+cid+'/photos', { photo_url: url, km_actuel: km }, at);
} else {
  toast('Upload photo désactivé temporairement — CLOUDINARY_CLOUD non configuré', 'info');
}
```

### Pattern 4: RBAC split via `requireRole()` + `requireAnyRole()`, RLS as default-deny only

**What:** All real authorization for write paths happens in `motokey-api.js` via `rbac.requireRole(ctx, minRole)` (hierarchical: CLIENT < MECANO < PRO < CONCESSION < ADMIN) or `rbac.requireAnyRole(ctx, [...])` (exact-match, e.g. "CLIENT or MECANO+"). The Supabase client used by `supabase.js` (`const supabase = createClient(..., SUPABASE_SERVICE_KEY)`) is the **service_role** key, which bypasses RLS entirely. Every table added in this milestone gets `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with **no policies** (default-deny) — exactly the pattern already used for `garage_users`, `client_device_tokens`, `push_send_log`, and the 4 Gap-B tables. This is intentional defense-in-depth (protects against a leaked anon/publishable key), not the live authorization mechanism.

**When to use:** Every new table in this milestone.

**Trade-offs:** Because RLS carries no policies, a bug in a `motokey-api.js` handler (wrong `requireRole()` threshold, or missing `garage_id`/`client_id` scoping filter) is **not** caught by the database — it's caught only by application code and tests. This is consistent with the rest of the codebase (`motos_garage_all`/`motos_client_read` are the only tables with real policies, and those predate the service-role-everywhere convention), but it means the RBAC split described in the question (CLIENT+GARAGE write / PRO+-only counter-replacement) must be enforced **entirely inside the endpoint handlers**, not assumed to be backstopped by Postgres.

**Concrete RBAC split for this milestone:**

| Action | Endpoint | Minimum role | Notes |
|--------|----------|---------------|-------|
| Upload consumable photo / km reading | `POST /motos/:id/consommables/:cid/photos`, `POST /motos/:id/km` | `requireAnyRole(ctx, ['CLIENT','MECANO','PRO','CONCESSION','ADMIN'])` i.e. CLIENT minimum — anyone who can see the moto can log a reading | Must additionally verify ownership: CLIENT ctx → moto.client_id must resolve to that client; garage roles → moto.garage_id must equal `getGarageIdForUser()` |
| Odometer regression rejection | (inline in the km-read handler) | N/A — automatic | New reading `< current km` → HTTP 400, log to a rejection trail, no counter update |
| Counter-replacement (totaliseur remplacé) | `POST /motos/:id/km/remplacement-compteur` | `rbac.requireRole(ctx, 'PRO')` | PRO/CONCESSION/ADMIN only — archive the old reading row (never delete), require a `garage_signature`/note field, matching the `signature_hash` precedent on `interventions` |
| Gauges read (client + garage) | `GET /motos/:id/consommables` | CLIENT minimum (same ownership check as photo upload) | Read-only, weakest-consumable calc mirrors `maintenanceAlertService.js`'s `TIER_RANK` worst-of pattern |

## Data Flow

### Request Flow — photo upload + stub analysis

```
[Client/Garage UI]
    ↓ 1. upload file directly to Cloudinary (unsigned preset) — CLOUDINARY_CLOUD gate
    ↓ 2. POST /motos/:id/consommables/:cid/photos { photo_url, km_actuel }
[motokey-api.js handler]
    ↓ rbac.extractRoleFromRequest → requireAnyRole(CLIENT+) → ownership check (client_id/garage_id)
    ↓ visionAnalysisService.analyzePhoto(photo_url, consommable.type)   ← STUB or REAL, same shape
    ↓ SBLayer.PhotosConsommables.insert({ consommable_id, moto_id, photo_url, km_lecture, analyse })
    ↓ SBLayer.Consommables.update(cid, { usure_pct: analyse.usure_pct, etat: analyse.etat, km_derniere_photo, date_derniere_photo })
[Response] ← { photo, consommable, analyse }
```

### Request Flow — km reading with anti-fraude

```
[Client/Garage UI] → POST /motos/:id/km { km_lecture }
[motokey-api.js handler]
    ↓ fetch current motos.km
    ↓ if km_lecture < current km → 400 INVALID_KM (monotonic violation), insert into releves_km with rejected=true for audit, DO NOT update motos.km
    ↓ else → insert releves_km row (source=CLIENT|GARAGE), update motos.km
[Response] ← { releve, accepted:true }

[PRO+ only] POST /motos/:id/km/remplacement-compteur { km_lecture, note }
    ↓ requireRole(ctx,'PRO')
    ↓ archive current releves_km trail (mark previous "chain" closed, e.g. a `compteur_generation` counter or `event_type='remplacement'` row)
    ↓ insert new releves_km row starting a fresh monotonic chain, signature/garage_id captured
```

### Key Data Flows

1. **Photo → stub analysis → gauge update:** every photo upload synchronously calls the vision service and writes both a history row (`photos_consommables`) and a denormalized "current state" onto `consommables` (usure_pct/etat) so gauge reads don't need to aggregate history at read time — same denormalization precedent as `motos.last_maintenance_tier_notified`.
2. **Km reading → anti-fraude check → conditional push:** a rejected (regressive) reading never updates `motos.km`, so all downstream consumers (score calc, maintenance plan, this new gauge system) stay consistent; only accepted readings flow forward.
3. **Cron scan → threshold cross → push:** `consommableAlertService.js` runs independently of the upload flow (it's a periodic scan, not triggered synchronously by an upload), exactly mirroring `maintenanceAlertService.js` — this keeps push-sending logic out of the request/response hot path.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|---------------------------|
| Current (single garage pilot, low hundreds of motos) | Everything above is sufficient — no queueing, no background workers needed |
| Multi-garage growth (thousands of motos) | The cron scan in `consommableAlertService.js` does a full-table scan every run (same as `maintenanceAlertService.js` today) — acceptable at this scale, revisit only if the cron endpoint starts timing out on Railway |
| Real Anthropic Vision wired at volume | Vision API calls are synchronous inside the upload request today (stub is instant; real call could take seconds) — if latency becomes a UX problem, move `analyzePhoto()` to fire-and-forget with a `statut: 'en_attente'` on the photo row and a webhook/poll to fill in `analyse` later. Not needed for the stub phase; flag as a phase-2 concern, don't build it now (matches YAGNI precedent of the rest of this codebase). |

### Scaling Priorities

1. **First bottleneck if it ever appears:** synchronous Vision API latency inside the photo-upload request once `VISION_ENABLED=true` for real — mitigate later with async pattern above, not now.
2. **Second bottleneck if it ever appears:** cron full-table scans as moto count grows — mitigate by filtering to `WHERE km_derniere_photo IS NULL OR moto.km - km_derniere_photo > threshold` at the query level instead of in JS (the current `maintenanceAlertService.js` already does the equivalent filtering client-side in JS after fetching all rows — fine at today's scale, revisit together).

## Anti-Patterns

### Anti-Pattern 1: Re-embedding upload logic into `motokey-api.js` instead of `supabase.js`/`services/`

**What people do:** Write `supabase.from('photos_consommables').insert(...)` directly inside the route handler in `motokey-api.js`, because it's "just one query."
**Why it's wrong:** Breaks the established boundary where `motokey-api.js` never talks to `supabase` directly — every other entity (`Motos`, `Devis`, `Entretien`) goes through `supabase.js`. Inconsistency here makes the next schema-drift audit harder (a future SCHEMA-0X phase would need to grep two different places for DB access).
**Do this instead:** Add `Consommables`, `PhotosConsommables`, `RelevesKm` objects to `supabase.js`, following the exact shape of `Entretien`/`PushSendLog`.

### Anti-Pattern 2: Migration without same-commit `schema.sql` update

**What people do:** Ship `sql/migrations/23_consommables.sql`, apply it via Supabase Dashboard, and move on — planning to "update `schema.sql` later."
**Why it's wrong:** This is *exactly* the root cause of the v1.5 milestone (39 undocumented Gap-A columns + 5 Gap-B objects existed in prod with no trace in `schema.sql`, some with no migration file at all, one column origin never determined). v1.5 just spent multiple phases (SCHEMA-01 through SCHEMA-07) cleaning this up and proved a working discipline: migration file + `schema.sql` update + `scripts/bootstrap-fresh-schema.js` verification, same commit.
**Do this instead:** For every new migration in this milestone:
  1. Write `sql/migrations/NN_description.sql` (next number after 22 → start at 23).
  2. In the **same commit**, hand-append the equivalent `CREATE TABLE`/`ALTER TABLE`/RLS block to `schema.sql` (including the `DROP TABLE IF EXISTS ... CASCADE` cleanup line at the top of the file, in dependency order — `photos_consommables` before `consommables` before `motos` for the DROP block, reverse order for CREATE).
  3. Run `node scripts/bootstrap-fresh-schema.js` against a throwaway Supabase project before considering the migration "done" (requires `FRESH_DB_URL` in `.env` — see script header for the checkpoint process used in Phase 22).
  4. Apply the migration to prod via Supabase Dashboard SQL Editor (same as all prior migrations — no automated migration runner exists in this codebase).

### Anti-Pattern 3: FK'ing new tables to `client_id` instead of `moto_id`

**What people do:** Add `client_id` as a column/FK on `consommables`/`photos_consommables`/`releves_km` "for easy filtering by owner."
**Why it's wrong:** Directly contradicts the L8 polymorphic-ownership model (`motos.proprietaire_type` ∈ `client`/`garage`/`inconnu`, `motos.client_id` is nullable and only meaningful when `proprietaire_type='client'`). A moto can be garage-owned or unknown-owned with no client at all — hardcoding `client_id` on child tables would break for those cases and would have to be kept in sync with `motos.client_id` forever (another drift vector). It also duplicates data already reachable via `moto_id → motos.client_id` for the client-owned case, and via `moto_id → motos.proprietaire_garage_id` for the garage-owned case.
**Do this instead:** FK everything to `moto_id` only (exactly as the milestone context specifies). Resolve ownership at query time by joining through `motos`, same as `inter_client_read`/`plan_client_read` RLS policies already do (`EXISTS (SELECT 1 FROM motos m JOIN clients c ON c.id = m.client_id WHERE m.id = X.moto_id AND c.auth_user_id = auth.uid())`), even though those policies aren't the live authorization path — the pattern is still the correct query shape to reuse in `supabase.js` helper functions.

### Anti-Pattern 4: A second idempotency table for consumable-reminder pushes

**What people do:** Create a new `consommable_send_log` table "to be safe," mirroring `push_send_log`.
**Why it's wrong:** `push_send_log` already provides idempotency for *every* push, keyed by an arbitrary string (`idempotency_key`). A second table would fragment the idempotency guarantee and require a second UNIQUE-constraint dance identical to the one already debugged in `pushService.js` (see the `23505`/`duplicate` handling comment).
**Do this instead:** Reuse `pushService.sendPush()`/`sendToToken()` unchanged. Only the *idempotency key string* needs to be distinct per reminder type — e.g. `` `consommable-reminder:${consommableId}:${yyyy-mm}` `` (monthly granularity, since km/6-month drift is slow-moving, unlike the daily-granularity key already used for maintenance tier alerts).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|----------------------|-------|
| Anthropic Claude Vision | NEW integration — no existing code precedent despite CLAUDE.md/PROJECT.md text implying OCR/plan-entretien already call Anthropic; **verified**: `package.json` has no `@anthropic-ai/sdk` dependency, and `motokey-api.js`/`supabase.js` contain zero `anthropic`/`Anthropic` references. The "OCR" fraud-check score (`motokey-api.js` L335) is a static heuristic (`dataOk` boolean), not an AI call. Build the `VISION_ENABLED` flag pattern from scratch, using `emailService.js`/`pushService.js` as the *convention* reference only, not as a working Anthropic-call reference. |
| Cloudinary | Client-side unsigned-preset upload (`MotoKey_Client.html` L1100-1223), URL passed to backend as a string field | `CLOUDINARY_CLOUD` is currently the **empty string** — not yet configured in prod. New photo UI must gate on this exactly like `submitClaim()` does, including the `'pending_manual_verification'`-style sentinel fallback. |
| Expo Push (via `expo-server-sdk`) | Already fully wired — `services/pushService.js`, gated by `PUSH_ENABLED` | Reuse `sendPush(clientId, payload, idempotencyKey)` unchanged; only add a new `data.type` value and a new cron caller. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|-----------------|-------|
| `motokey-api.js` ↔ `supabase.js` | Direct function call (`SBLayer.Consommables.xxx()`) | Never call `supabase.from(...)` from inside `motokey-api.js` for the new tables |
| `motokey-api.js` ↔ `services/visionAnalysisService.js` | Direct async function call inside the photo-upload handler | Stub and real call share one return shape — the swap-in boundary |
| `services/consommableAlertService.js` ↔ `services/pushService.js` | Direct function call (`pushService.sendPush(...)`) | Never write to `push_send_log` from the new service |
| `mobile-app` ↔ Express API | HTTP only, Bearer JWT from Supabase Auth | No direct Supabase table access from mobile — confirmed no `createClient`/table SDK usage exists in `mobile-app/` today |
| `mobile-app/hooks/useNotificationObserver.ts` ↔ new reminder push | One new literal case added to `mapNotificationDataToRoute()` | Do not pass `data.type`/`data.url` straight to `router.push` (existing Pitfall 3 comment in that file, re: Expo Router's `typedRoutes` requiring static literals) |

## Suggested Build Order

Given the dependency chain, the order that minimizes rework:

1. **Schema first** (`sql/migrations/23-26` + `schema.sql` same-commit + `bootstrap-fresh-schema.js` verification). Nothing else can be tested without the tables existing, and this is where the v1.5 discipline must be proven to hold on day one of the very next milestone.
2. **`supabase.js` entity helpers** (`Consommables`, `PhotosConsommables`, `RelevesKm`) — thin CRUD wrappers, no business logic yet.
3. **`services/visionAnalysisService.js` stub** — build and lock the return shape before wiring any endpoint to it, since the shape is the contract every downstream consumer (endpoint, DB column, gauge calc) depends on.
4. **Backend endpoints in `motokey-api.js`**: km reading + anti-fraude check → photo upload + stub analysis → counter-replacement (PRO+) → gauges read. Build the anti-fraude/monotonic logic before the gauge read, since gauges depend on a clean `motos.km`/`releves_km` history existing.
5. **`services/consommableAlertService.js` + `/cron/consommables-reminders` endpoint** — depends on step 4's data existing (needs real `km_derniere_photo`/`date_derniere_photo` columns populated).
6. **Garage UI (`app.html`)** — gauge screens + photo capture (Cloudinary gate pattern), can be built in parallel with mobile once step 4 endpoints are stable.
7. **Client UI (`MotoKey_Client.html`)** — same gauge screens, client-scoped.
8. **Mobile (`mobile-app/`)** — gauge screens + `useNotificationObserver.ts` one-line extension — last, since it depends on the same stable endpoint contracts as steps 6-7 and has the longest feedback loop (EAS builds).

## Sources

- Direct codebase inspection (HIGH confidence, no training-data guesses): `motokey-api.js`, `supabase.js`, `auth/rbac.js`, `services/emailService.js`, `services/pushService.js`, `services/maintenanceAlertService.js`, `schema.sql`, `sql/migrations/*.sql`, `MotoKey_Client.html`, `mobile-app/hooks/useNotificationObserver.ts`, `package.json`, `scripts/bootstrap-fresh-schema.js`
- `.planning/PROJECT.md` — milestone goal, v1.5 history, Known Gaps, Key Decisions log

---
*Architecture research for: MotoKey v1.6 — Suivi usure consommables + anti-fraude km*
*Researched: 2026-07-13*
