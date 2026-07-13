# Stack Research

**Domain:** Consumable-wear photo tracking + odometer anti-fraud + stubbed Claude Vision analysis endpoint, added to the existing Node/Express + Supabase (Postgres) + Cloudinary(-stub) + Expo-push MotoKey monolith
**Researched:** 2026-07-14
**Confidence:** HIGH — every claim about "existing patterns" below was verified by reading the actual files (`motokey-api.js`, `supabase.js`, `schema.sql`, `services/emailService.js`, `services/pushService.js`, `storage.js`, `.env`, `MotoKey_Client.html`, `package.json`), not assumed from CLAUDE.md or the milestone brief. Two corrections to the milestone brief's assumptions are flagged explicitly below (see "Important Correction to Milestone Assumptions").

> Note: this file previously contained React Native/Expo mobile-client stack research (v1.3). That milestone shipped and its findings are captured in `.planning/PROJECT.md` Key Decisions / Context. This file has been fully replaced with v1.6 (consumable wear + km anti-fraud) research per this milestone's scope.

## Important Correction to Milestone Assumptions

The milestone brief states Cloudinary and the Anthropic API are "already used for other photo features / already used for OCR of invoices" with "precedent code for calling the Anthropic API in this codebase." **This is not accurate as of the current repo state**, which changes the recommendation for (a) and (c):

- **Anthropic API: zero working integration exists.** `package.json` has no `@anthropic-ai/sdk` (or any Anthropic package) dependency. `.env` has `ANTHROPIC_API_KEY=sk-ant-VOTRE_CLE_ICI` — a French placeholder ("YOUR KEY HERE"), never filled in, never read by any file (grepped the whole repo, zero matches on `ANTHROPIC_API_KEY` or `anthropic` outside of `.env`/`CLAUDE.md`). `storage.js` (which implements the invoice-OCR pipeline) calls **Google Document AI** (`@google-cloud/documentai`), not Anthropic — and that package isn't in `package.json` either, so `storage.js` runs in permanent `_simuler()` (simulation) fallback. Worse: `storage.js` is **never `require()`'d by `motokey-api.js`** — it's dead code, not wired into the running server at all. The real invoice/maintenance-plan feature that ships in prod (`plans_entretien.js`) is a static hand-authored DB of manufacturer service intervals, not an AI call.
- **Cloudinary: scaffolded but disabled, not "already used."** The only Cloudinary code in the repo is in `MotoKey_Client.html` (moto-claim photo upload), where `const CLOUDINARY_CLOUD = '';` — an **empty string**, which the code explicitly treats as "upload disabled" (`if (CLOUDINARY_CLOUD) { ... } else { <div>Upload désactivé temporairement</div> }`). `app.html` (garage app) has **zero** Cloudinary references. `mobile-app` explicitly comments "no Cloudinary integration ... upload disabled." No `CLOUDINARY_*` env var exists anywhere in `.env`.

**Implication for this milestone:** this is the first feature that will actually turn these two integrations on, not a reuse of a proven pattern. Design the stub conservatively and don't assume any existing Anthropic-calling code exists to copy from — none does. The one genuinely reusable, *proven-in-prod* precedent is the **flag-gated service pattern** (`EMAIL_ENABLED`/`PUSH_ENABLED` in `services/emailService.js`/`services/pushService.js`), which real traffic flows through today. That pattern — not the Cloudinary/Anthropic scaffolding — is what should be copied.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| PL/pgSQL `BEFORE INSERT` trigger (native Postgres, no extension) | Supabase-managed Postgres (current prod version, no change needed) | Reject non-monotonic km readings on `releves_km` | `CHECK` constraints cannot reference other rows, so they physically cannot compare a new reading to the moto's previous reading — only a trigger (or an app-side `SELECT MAX(km)` pre-check) can. The codebase already has two precedents for this exact pattern: `trg_recalc_score` (AFTER INSERT/UPDATE/DELETE on `interventions`) and `trg_update_km` (`UPDATE motos SET km = GREATEST(km, NEW.km)` on `interventions`, `schema.sql` lines 629-643). Reuse the same PL/pgSQL trigger idiom — no new tooling, no new extension, matches `schema.sql`'s existing style exactly. |
| Anthropic Messages API — `image` content block, `source.type: "url"` (deferred to the milestone that wires the real call — do **not** call it yet) | API version header `anthropic-version: 2023-06-01` (current, HIGH confidence per official docs fetched 2026-07-14) | Real Claude Vision analysis of a consumable photo (future, not this milestone) | Official docs confirm three ways to hand Claude an image: `base64`, `url`, or a pre-uploaded `file_id` (Files API). Because consumable photos will already live at a public Cloudinary URL, the future real call should use `source: {type: "url", url: cloudinarySecureUrl}` — **no download-and-base64-re-encode step needed server-side**. This is the "clean branching point" the milestone brief asks for: the stub's response shape should already match what a real call would return, and its future implementation is a ~10-line change (swap the fake JSON for one `anthropic.messages.create()` call), not a redesign. |
| Cloudinary unsigned-preset browser upload (existing `MotoKey_Client.html` pattern, currently disabled) — plain `fetch()` + `FormData`, no SDK | N/A (REST endpoint, no library) | Consumable photo storage | The existing (disabled) pattern uploads directly from the browser/mobile client to `https://api.cloudinary.com/v1_1/<cloud>/image/upload` with `upload_preset=motokey_unsigned`, then POSTs only the resulting `secure_url` string to the Express API. The backend never touches image bytes. Reusing this for consumable photos means the backend needs **zero new upload-handling code** (no `multer`, no streaming, no temp files) — it just stores a URL string in `photos_consommables.url`, exactly like `motos.photo_url` / `motos.carte_grise_photo_url` already do for a single photo. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@anthropic-ai/sdk` | `^0.111.0` (current on npm as of 2026-07-14 — **re-check before installing**, this SDK ships frequent minor releases) | Official Node client for the Messages API | **Do not install this milestone.** The endpoint is fully stubbed (hardcoded fake JSON), so nothing in the code path imports it. Installing it now would repeat the exact mistake already sitting in `storage.js` (a `DÉPENDANCES` comment listing `@google-cloud/documentai`, which was never actually added to `package.json` and never worked). Install it only in the future milestone that wires the real call, alongside setting `ANTHROPIC_API_KEY` to a real value and adding a `VISION_ENABLED` flag. |
| `cloudinary` (official Node SDK) | `^2.10.0` (current on npm) | Server-side signed uploads / asset deletion / moderation | **Not needed for this milestone either.** The unsigned-preset client-direct-upload flow (see Core Technologies above) needs no server-side SDK. Only reach for this package later if/when the unsigned-preset security model (anyone who knows the preset name can upload to your account) becomes a real concern and you move to server-signed uploads, or if you need server-side deletion/moderation of consumable photos. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `node --check motokey-api.js` | Syntax verification before push (existing project convention, `CLAUDE.md`) | Also run against `supabase.js` and any new `services/*.js` file before commit — no new tooling needed. |
| Manual hand-rolled JS validation (existing convention, e.g. `storage.js` `validerFichier`, inline checks throughout `motokey-api.js`) | Request payload validation for new `releves_km` / `photos_consommables` endpoints | The codebase has **no** schema-validation library anywhere (checked `package.json`: no `zod`, `joi`, `express-validator`, `ajv`). Stay consistent — don't introduce one for two new endpoints. |

## Installation

```bash
# Nothing new to install for this milestone.
# The odometer anti-fraud trigger is pure SQL (added via a new file in sql/migrations/,
# following the numbering convention already at 22_devis_undocumented_columns.sql -> next is 23_).
# The Vision stub endpoint returns a hardcoded JSON object -- no package import required.
# Photo upload continues to happen client-side directly against the Cloudinary REST API (fetch/FormData) --
# no backend package required.

# -- Deferred to a FUTURE milestone (when wiring the real Claude Vision call) --
# npm install @anthropic-ai/sdk@^0.111.0   # verify latest version at install time

# -- Deferred to a FUTURE milestone (only if moving off unsigned-preset uploads) --
# npm install cloudinary@^2.10.0
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| PL/pgSQL `BEFORE INSERT` trigger rejecting (`RAISE EXCEPTION`) non-monotonic `km` on `releves_km` | Application-layer-only check (`supabase.js` does a `SELECT MAX(km) ... WHERE moto_id=...` before insert, no DB trigger) | Never as the *only* line of defense here: `supabase.js` connects with the Supabase **service_role key**, which bypasses RLS entirely (this is the documented trust model elsewhere in this research set — RLS in this codebase is a default-deny defense-in-depth layer, not the primary authorization mechanism). An app-layer-only check can be silently skipped by a future code path (a new script, a bugfix that forgets the check, a direct SQL migration). A DB trigger is the only enforcement point that survives every code path. Still add the app-layer pre-check too (better error message before hitting the DB), but the trigger is the actual gate. |
| PL/pgSQL trigger with `RAISE EXCEPTION` (hard reject) | The existing `GREATEST(km, NEW.km)` pattern already in `trg_update_km` (silently clamps instead of rejecting) | Only for the *existing* `motos.km` sync-from-intervention use case, which is intentionally lenient (it's a derived cache field, not an audit trail). The new `releves_km` anti-fraud requirement explicitly asks for **strict rejection + garage log on regression**, which is a different (harder) semantic — don't reuse `GREATEST()` clamping for it, that would silently hide fraud instead of flagging it. |
| Cloudinary unsigned-preset client-direct upload (reuse existing disabled pattern) | Cloudinary Node SDK, server-side signed upload | When photo-tampering/quota-abuse risk on the unsigned preset becomes a real problem (anyone who inspects the JS can find `motokey_unsigned` and upload arbitrary files to the account). Not a blocker for this milestone — it's the same risk profile the codebase already accepted for the (currently disabled) carte-grise-photo flow — but worth flagging as a phase-level risk for whoever does the real Cloudinary activation. |
| `@anthropic-ai/sdk` (official SDK) — for the *future* real call only | Raw `fetch()` to `https://api.anthropic.com/v1/messages` with `x-api-key`/`anthropic-version` headers, zero dependency | Node 20+/24 (the project's actual runtime — confirmed `node -v` -> v24.14.1, `package.json` `engines.node >=20`) has global `fetch`, so a single non-streaming structured-extraction call genuinely doesn't need the SDK. Consider this if the team wants to keep this one integration dependency-free; the SDK is still the recommended default for consistency with how every other external service in this codebase (Resend, Stripe, Supabase, Expo) is integrated via its official SDK rather than raw HTTP. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `multer` / `busboy` / any multipart-upload middleware on the Express backend | The existing (and to-be-reused) pattern uploads binary image data straight from the browser/mobile client to Cloudinary; the Express API only ever receives a JSON string URL, never raw image bytes. Adding multipart-handling middleware would be solving a problem this codebase's architecture doesn't have. | Client-side `fetch()`/`FormData` directly to Cloudinary's unsigned upload endpoint (as `MotoKey_Client.html` lines 1193-1199 already do), then `POST` the resulting `secure_url` to the API as a normal JSON field. |
| `cloudinary` npm SDK, right now | No server-side Cloudinary operation (signed upload, transform, delete) is in scope for this milestone — only client-direct unsigned upload + storing the resulting URL string. | Plain URL string field on `photos_consommables`, validated server-side with a simple `startsWith('https://res.cloudinary.com/')`-style sanity check (no library needed) if basic tamper-resistance is wanted. |
| `@anthropic-ai/sdk`, right now | The endpoint is a stub that returns a hardcoded fake analysis — importing an unused SDK now repeats the exact dead-dependency mistake already present in `storage.js` (`@google-cloud/documentai`, documented in a comment, never installed, never really wired since `storage.js` itself isn't required anywhere). | A plain hardcoded JSON object matching the eventual real response shape (`{ pourcentage_usure, etat, confiance, ... }`), returned synchronously from the stub endpoint. Install the SDK only in the milestone that wires the real call. |
| `zod` / `joi` / `express-validator` / `ajv` for validating the new `releves_km` / `photos_consommables` payloads | Not used anywhere in this codebase (`package.json` confirms zero validation-library dependency); every existing endpoint validates by hand with plain `if`/`&&` checks (e.g. `storage.js`'s `validerFichier`, the inline checks throughout `motokey-api.js`). Introducing a schema library for two endpoints would be an inconsistent, isolated pattern. | Hand-rolled validation functions, same style as the rest of the file (e.g. `km > 0 && Number.isInteger(km)`, `requireRole('MECANO')` for the upload endpoint). |
| `node-cron` / `agenda` / `bull` / any in-process scheduler, for the photo-reminder notification | The one cron-like job that already exists in prod, `maintenance-alerts` (`services/maintenanceAlertService.js`, `runMaintenanceAlertCron()`), is **not** an in-process scheduler — it's a plain HTTP endpoint (`POST /cron/maintenance-alerts`) gated by a shared-secret header (`X-Cron-Secret` vs `process.env.CRON_SECRET`), triggered by an external scheduler (Railway cron / GitHub Actions, outside this repo). Adding an in-process library would introduce a second, inconsistent scheduling mechanism. | A new `POST /cron/photo-reminders` endpoint following the exact same `X-Cron-Secret` pattern, reusing `services/pushService.js`'s `sendPush()` for delivery — same trigger mechanism as `maintenance-alerts`, just a new comparison (km-since-last-photo OR 6-month fallback) inside a new/extended service file. |
| `@google-cloud/documentai` (the package `storage.js` references in its header comment) | It was never actually installed (absent from `package.json`) and `storage.js` is dead code (never `require()`'d by `motokey-api.js`). Reviving it or treating it as "the existing OCR integration" would be building on a foundation that has never actually run in this app. | Nothing — leave `storage.js` alone; it's out of scope for this milestone and unrelated to the new stub Vision endpoint (which is a *separate*, new service file). |

## Stack Patterns by Variant

**If the odometer regression needs to be both rejected AND logged for the garage to review (per the milestone brief: "rejet + log garage si régression"):**
- Use a trigger that does two things across the request lifecycle: `RAISE EXCEPTION` to abort the bad insert (so `releves_km` never contains a fraudulent row), **and** a separate, always-succeeding log write issued from the *application layer* (in `supabase.js`, in the `catch` block around the failed insert) rather than from inside the trigger itself.
- Because a `RAISE EXCEPTION` trigger rolls back its own transaction, a log-table `INSERT` issued *inside* the same trigger would also be rolled back — the log write must happen in a separate statement/transaction, most simply from the Node layer after catching the Postgres error (a custom `RAISE EXCEPTION` surfaces as Postgres error code `P0001`), matching the existing error-handling style (`services/pushService.js` line 47 already catches and branches on a Postgres error code, `23505`, for unique-constraint violations).

**If the "counter replacement" (`remplacement_compteur`) event needs to bypass the monotonic check for PRO+ roles:**
- Do **not** let the trigger itself inspect the JWT/role — Postgres triggers have no access to the RBAC role sitting in the Express request context, and re-deriving trust inside SQL would duplicate (and risk diverging from) the existing `requireRole()` middleware.
- Instead: gate the *endpoint* with `requireRole('PRO')` (existing middleware, `motokey-api.js`) before the insert is even attempted, and have the trigger recognize an explicit `type_releve = 'remplacement_compteur'` column value as "skip the monotonic check, archive the old value instead" — the app is the one place trusted to set that column, and only after the role check has already passed.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-------------------|-------|
| `@anthropic-ai/sdk@^0.111.0` (future) | Node `>=20` (project's `package.json` `engines`), actual runtime Node 24.14.1 | SDK has no stated hard floor incompatible with this project; verify current minimum at install time since this SDK ships frequent minors. |
| `cloudinary@^2.10.0` (future, optional) | Node `>=9` per its own `engines` field | Far below this project's Node 20+ floor — no compatibility risk if adopted later. |
| PL/pgSQL trigger syntax used (`BEFORE INSERT ... FOR EACH ROW EXECUTE FUNCTION ...`, `RAISE EXCEPTION`) | Any Postgres version Supabase currently runs (same syntax already live in prod via `trg_recalc_score`/`trg_update_km`) | No version risk — this is the exact same trigger style already running against the live `schema.sql`. |

## Sources

- `C:\motokey-api\package.json` — confirmed no `@anthropic-ai/sdk`, no `cloudinary`, no validation library, no cron library currently installed. (HIGH — direct file read)
- `C:\motokey-api\.env` — confirmed `ANTHROPIC_API_KEY=sk-ant-VOTRE_CLE_ICI` placeholder, no `CLOUDINARY_*` var present. (HIGH — direct file read)
- `C:\motokey-api\storage.js` — confirmed Google Document AI (not Anthropic) OCR implementation, unused/never `require()`'d, permanently in simulation fallback. (HIGH — direct file read + grep confirming zero requires elsewhere)
- `C:\motokey-api\MotoKey_Client.html` lines 1090-1220 — confirmed `CLOUDINARY_CLOUD = ''` (disabled), unsigned-preset upload flow via plain `fetch()`. (HIGH — direct file read)
- `C:\motokey-api\schema.sql` lines 236-271, 585-644 — confirmed existing `trg_update_km` (`GREATEST` clamp trigger) and `trg_recalc_score` trigger patterns to reuse for the new strict-rejection trigger. (HIGH — direct file read)
- `C:\motokey-api\services\emailService.js`, `services\pushService.js` — confirmed the `EMAIL_ENABLED`/`PUSH_ENABLED` flag-gated, lazy-`require()`, fail-open service pattern to copy for the future real Vision integration. (HIGH — direct file read)
- `C:\motokey-api\motokey-api.js` lines 566-578 — confirmed the `/cron/maintenance-alerts` external-trigger + `X-Cron-Secret` header pattern (no in-process scheduler library). (HIGH — direct file read)
- Official Anthropic docs, "Vision" — https://platform.claude.com/docs/en/docs/build-with-claude/vision — fetched 2026-07-14, confirmed `image` content block accepts `base64`/`url`/`file_id` source types, supported formats (JPEG/PNG/GIF/WebP), and current model names. (HIGH — official docs, current)
- npm registry (`npm view`) — `@anthropic-ai/sdk@0.111.0`, `cloudinary@2.10.0`, `multer@2.2.0` current versions as of 2026-07-14. (HIGH — live registry query)

---
*Stack research for: Consumable-wear photo tracking + odometer anti-fraud + stubbed Claude Vision endpoint (MotoKey v1.6)*
*Researched: 2026-07-14*
