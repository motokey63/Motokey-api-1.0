# Phase 12: Backend Push Foundation - Research

**Researched:** 2026-07-01
**Domain:** Hand-rolled Node.js HTTP router + Supabase (service-role) backend — new CRUD table + 2 new CLIENT-scoped endpoints + one profile-read endpoint
**Confidence:** HIGH (all findings verified by direct source reading of `motokey-api.js`, `supabase.js`, `auth/rbac.js`, `schema.sql`, and existing migrations in this repo — no external library research needed for this phase)

## Summary

Phase 12 adds three endpoints to the existing hand-rolled `M(method, pattern)` router in `motokey-api.js`: `POST /client/device-tokens`, `DELETE /client/device-tokens`, and `GET /client/me`. All three follow an established, well-attested pattern already used by `GET /client/limite-motos` and `POST /client/motos` (lines ~1531-1592): extract RBAC context, gate with `rbac.requireAnyRole(ctx, ['CLIENT'])`, resolve the `clients` row via `auth_user_id = ctx.user_id`, then act. No new library dependency is needed — Expo push token *format* validation (not delivery, which is Phase 13) can be replicated with a two-line check identical to the official `expo-server-sdk`'s `Expo.isExpoPushToken()`, without adding that package to `package.json` this phase.

Two locked decisions in CONTEXT.md interact with real constraints found in the codebase and need reconciliation, documented in detail below: (1) the `clients` table has no `prenom` or `telephone` columns — only `nom` (full name) and `tel` — so `GET /client/me`'s response must be built from actual columns, not the illustrative field names in CONTEXT.md D-04; (2) accepting the token to delete via the DELETE request body (CONTEXT.md D-03) requires a small, low-risk change to the global body-parsing dispatch, because the current code only parses request bodies for `POST/PUT/PATCH`, never `DELETE`. This is worth doing (it correctly sidesteps a URL-encoding problem with Expo tokens' `[`/`]` characters) but must be called out explicitly as a task, since it touches shared dispatch logic used by every route in the file.

**Primary recommendation:** Follow the `/client/limite-motos` / `POST /client/motos` pattern exactly for all three new routes; add a new migration `sql/migrations/16_client_device_tokens.sql` creating `client_device_tokens` keyed by `client_id` (per CONTEXT.md D-01, not `auth_user_id` as an earlier milestone-level research pass suggested); validate Expo token format with a local regex check (no new npm dependency); and add `'DELETE'` to the body-parsing method whitelist as an explicit, isolated task.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Device token storage**
- D-01: Multi-device support — a client can have multiple simultaneous active tokens (e.g. phone + tablet), not a single overwritten token. Requires a 1-to-N table (`client_device_tokens` or similar) with a unique constraint on the token value itself, foreign key to `clients`.
- D-02: Token reassignment — if an Expo token already registered under Client A is re-submitted authenticated as Client B, upsert on the token column reassigns the row to Client B (physical reality: one device is used by one active user at a time; avoids accumulating dead tokens pointing at a stale owner).

**DELETE semantics**
- D-03: `DELETE /client/device-tokens` removes only the specific token supplied in the request body — not all tokens for the authenticated user. Consistent with multi-device support: logging out on one device must not silence push on other devices for the same client.

**GET /client/me payload**
- D-04: Response includes: `id`, `nom`, `prenom`, `email`, `telephone`, `garage_id` + linked garage name (if present), account creation date. This fills the `/auth/me` gap identified in research, sized for a mobile profile screen + "linked to [Garage X]" display without an extra round trip. Explicitly excludes derived counters (nb_motos, nb_devis_en_attente) — deferred, see below.

### Claude's Discretion
- Exact table/column naming (`client_device_tokens` vs `device_tokens`, column names like `platform`, `last_used_at`) — no strong user preference expressed, follow existing migration/table naming conventions in `sql/migrations/`.
- Whether to store platform (ios/android) and app version on the token row — useful for Phase 13/17 but not required by Phase 12 success criteria; Claude may include if low-cost.

### Deferred Ideas (OUT OF SCOPE)
- `nb_motos` / `nb_devis_en_attente` counters on `GET /client/me` — considered during discussion, deferred to keep the endpoint cheap (single query, no extra joins). Can be added later or fetched via existing `/client/limite-motos` and `/devis` endpoints if the mobile app needs them.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MPUSH-02 | Le device token est enregistré/désenregistré auprès du backend au login/logout (backend half — end-to-end wiring in Phase 16) | Confirmed exact endpoint pattern (`/client/limite-motos` style), confirmed table design keyed on `client_id`, confirmed body-parsing gap for DELETE, confirmed Expo token format validation approach — all documented below |

## Project Constraints (from CLAUDE.md)

- **No PowerShell/sed/awk/Python one-liner edits** to `motokey-api.js`, `app.html`, `supabase.js`, `MotoKey_Client.html` — direct `str_replace`-style edits only. This phase touches `motokey-api.js` and `supabase.js`; both are on the protected list.
- **`requireRole()`/RBAC mandatory** on new sensitive endpoints. This phase's actual helper is `rbac.requireAnyRole(ctx, ['CLIENT'])` (see reconciliation below — CLAUDE.md/ROADMAP phrase this as "`requireRole('CLIENT')`" but the real call signature differs).
- **Never touch the anti-fraude weighting (1.0/0.6/0.3) or the 70/30 score formula** — not touched by this phase, noted for completeness.
- **Always `git push` at the end of a session** — operational reminder, not a planning constraint per se.
- **Verify `git status` / `git log --oneline -5` before major changes** — apply before starting implementation.
- No project skills directory exists (`.claude/skills/` / `.agents/skills/` not found) — no additional skill-specific conventions to layer on.

## Standard Stack

No new external libraries are needed for Phase 12. This is a backend-only phase using the existing stack (`@supabase/supabase-js` ^2.45.0, already installed; plain Node `http` module — no Express despite it sitting in `package.json`).

### Core
| Library | Version | Purpose | Why Standard (for this repo) |
|---------|---------|---------|-------------------------------|
| `@supabase/supabase-js` | ^2.45.0 (installed) | DB access via `SBLayer.supabase` (service-role client) | Already the sole DB layer; new table follows the exact same access pattern as every other `/client/*` route |

### Supporting
None required this phase.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local regex/prefix check for Expo token format | `expo-server-sdk`'s `Expo.isExpoPushToken()` (adds the npm package) | Installing `expo-server-sdk` now would be premature — it's needed in Phase 13 for actually *sending* pushes, not for format validation in Phase 12. Its `isExpoPushToken` check (verified from source, see Code Examples) is trivial to replicate inline with zero new dependency, avoiding a "half-used" dependency this phase. Install it when Phase 13 needs `sendPushNotificationsAsync`/receipt-checking. |

**Installation:** None required this phase.

**Version verification:** `expo-server-sdk` current published version is `6.1.0` (verified via `npm view expo-server-sdk version`, published 2026-06-01) — for reference only, to be installed in Phase 13, not this phase.

## Architecture Patterns

### Recommended Project Structure

No new files/folders needed — this phase extends the two existing files in place:
```
motokey-api.js          # add 3 new route blocks near existing /client/* handlers (~line 1531-1650 area)
supabase.js             # optional: add helper functions (e.g. DeviceTokens.upsert/delete) if following the existing SBLayer-object convention, OR inline Supabase calls directly in motokey-api.js (both patterns coexist in the current codebase — see below)
sql/migrations/16_client_device_tokens.sql   # new migration file, next number after 15
```

**Note on `supabase.js` vs inline calls:** the existing `/client/*` handlers (`POST /client/motos`, `POST /client/reclamations`) call `SBLayer.supabase.from(...)` **directly inline** in `motokey-api.js`, not through a wrapped helper function in `supabase.js` — despite `supabase.js` exposing wrapped helpers like `checkLimiteMotosClient()` for other things. Both styles exist in this codebase. For 2 small endpoints (register/unregister), inline calls in `motokey-api.js` matching the `/client/motos` style is the lower-friction, more consistent choice; a `supabase.js` helper is optional discretion, not required.

### Pattern 1: RBAC-gated `/client/*` endpoint (established, reuse exactly)
**What:** Every existing CLIENT-scoped endpoint added since the RBAC migration follows this exact 4-step shape.
**When to use:** All 3 new endpoints in this phase.
**Example (from `motokey-api.js` lines 1548-1591, `POST /client/motos` — directly reusable template):**
```javascript
// Source: motokey-api.js, existing POST /client/motos handler
if((p=M('POST','/client/motos'))!==null){
  const ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(req, SBLayer) : null);
  if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
  if (!rbac.requireAnyRole(ctx, ['CLIENT'])) return fail(res, 'Réservé aux clients', 403, 'FORBIDDEN');
  if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
  try {
    const { data: clientRow, error: cliErr } = await SBLayer.supabase
      .from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
    if (cliErr || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
    const clientId = clientRow.id;

    // manual field validation, no schema library:
    const { marque, modele, annee, plaque, vin, km } = b;
    if (!marque || !modele || !plaque || !vin) return fail(res, 'marque, modele, plaque et vin requis', 400, 'VALIDATION_ERROR');

    // ... insert, return ok(res, {...}, null, 201)
  } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
}
```
Note: `req.ctx` is *already* populated once per request near the top of the server handler (`req.ctx = await rbac.extractRoleFromRequest(req, SBLayer);`, line 550) — the `ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(...) : null)` fallback in each handler is defensive/redundant but matches existing style; new routes should keep it for consistency even though `req.ctx` will already be set.

### Pattern 2: Supabase upsert with explicit `onConflict` (established, reuse for D-02)
**What:** The only existing upsert in the codebase, in `supabase.js`.
**When to use:** `POST /client/device-tokens` — upsert-on-reassign per CONTEXT.md D-02.
**Example:**
```javascript
// Source: supabase.js line 451-457, upsertOperation()
async upsertOperation(moto_id, op) {
  const { data, error } = await supabase.from('plan_entretien')
    .upsert({ moto_id, ...op }, { onConflict: 'moto_id,code_operation' })
    .select().single();
  if (error) throw new Error(error.message);
  return data;
},
```
Applied to this phase: `.from('client_device_tokens').upsert({ client_id: clientId, token, platform, last_used_at: nowISO() }, { onConflict: 'token' }).select().single()` — `onConflict: 'token'` (not a composite key) is what makes D-02's "reassign to new client on re-submit" work: the unique constraint lives on `token` alone, so re-submitting the same token under a different `client_id` overwrites the row's `client_id`, exactly matching the locked decision.

### Pattern 3: Related-table embed via PostgREST relationship select (for GET /client/me garage name)
**What:** Supabase-js lets you embed a related table's columns via FK-based auto-detection, already used once in this codebase.
**When to use:** `GET /client/me`'s "linked garage name" requirement (D-04).
**Example:**
```javascript
// Source: motokey-api.js ~line 1648, GET /client/reclamations
const { data: reclamations, error } = await SBLayer.supabase
  .from('reclamations_moto')
  .select('*, motos(id, plaque, marque, modele)')
  .eq('client_id', clientId);
```
Applied to this phase: `.from('clients').select('id, nom, email, tel, garage_id, created_at, garages(nom)').eq('auth_user_id', ctx.user_id).single()` — relies on the existing FK `clients.garage_id -> garages(id)`. Since `garage_id` is nullable (migration `07b-pivot-migration.sql` dropped the NOT NULL constraint), the embedded `garages` object will be `null` when a client has no linked garage — response building must handle that (`garages: null` vs an object with `nom`).

### Anti-Patterns to Avoid
- **Do not model new code on `GET /client/moto`, `GET /client/alertes`, `GET /client/documents`, or the legacy `GET /auth/me`** (lines ~1499-1529, ~647-659) — these use the pre-Supabase in-memory `DB` object and the old `auth(req,res)` HS256-JWT helper. They predate the RBAC/Supabase migration and are dead weight for CLIENT accounts created via Supabase Auth. This is also explicitly called out in CONTEXT.md's code_context section.
- **Do not add a `PUT /auth/client/me`-style shared/multi-role route for this** — `GET /client/me` should be a new, CLIENT-only route (matching the naming CONTEXT.md/ROADMAP already lock in), not an attempt to fix the older `/auth/me` (which garage accounts also depend on and is out of this phase's scope).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Expo push token format validation | A custom multi-condition regex from scratch guessed at | Replicate the exact 2-branch check from `expo-server-sdk`'s `Expo.isExpoPushToken()` (verified source, see Code Examples) — copy the logic inline, no need to import the package this phase | Matches the exact validation the real SDK will apply later in Phase 13 when actually sending; avoids silently accepting tokens that the SDK will reject at send-time, or rejecting a legacy raw-UUID-style token format the SDK actually accepts |
| Upsert-then-reassign-owner logic | Manual `SELECT` existence check + conditional `UPDATE`/`INSERT` | Supabase `.upsert({...}, { onConflict: 'token' })` | Already the established single-call pattern in this codebase (`supabase.js` `upsertOperation`); atomic at the DB level, avoids a race between the SELECT and the INSERT |
| Reading a DELETE request body | A hand-rolled second body-reading code path duplicated inside the new route | Widen the single existing dispatch line (`if(['POST','PUT','PATCH'].includes(method)) b = await body(req);`) to also include `'DELETE'` | `body(req)` already exists and works method-agnostically (it just drains `req`'s data events) — the gate is purely the method-list array; touching that one array is simpler and more consistent than a bespoke reader inside the new handler |

**Key insight:** Every "new" primitive this phase needs (upsert-with-reassignment, RBAC gate, related-table embed, manual field validation) already has exactly one established precedent elsewhere in this same file/module. Copy the precedent; do not invent a new idiom for a 3-endpoint phase.

## Common Pitfalls

### Pitfall 1: `clients` table has no `prenom` or `telephone` columns
**What goes wrong:** Building `GET /client/me` against CONTEXT.md D-04's literal field list (`nom`, `prenom`, `email`, `telephone`) will throw a Postgres "column does not exist" error, because the actual schema (`schema.sql` lines 88-101, confirmed unchanged by any later migration) only has `nom` (single full-name field, no separate `prenom`) and `tel` (not `telephone`).
**Why it happens:** CONTEXT.md's decision was written descriptively (what a mobile profile screen needs conceptually), not against the literal current schema.
**How to avoid:** `GET /client/me` should `select('id, nom, email, tel, garage_id, created_at, garages(nom)')`. The JSON response can still expose the field as-is (`tel`) — this also matches what the existing web client already expects: `MotoKey_Client.html` line 1040 reads `u.tel` (with a `u.phone` fallback) for its account screen, confirming `tel` is the field name mobile-facing code should also expect. Do not add a `prenom` column or attempt to split `nom` — no other endpoint in the codebase treats `nom` as anything but a single full-name string.
**Warning signs:** A Supabase query error mentioning `column "prenom" does not exist` or `column "telephone" does not exist` at implementation/test time.

### Pitfall 2: DELETE requests never get their body parsed by the current dispatcher
**What goes wrong:** CONTEXT.md D-03 locks in "DELETE removes only the token supplied in the request body." But the shared request-handling code in `motokey-api.js` (line 544-545) only calls `body(req)` — which drains and JSON-parses the raw request stream — when `method` is `'POST'`, `'PUT'`, or `'PATCH'`. For `DELETE`, `b` stays `{}` regardless of what the client actually sent, so `b.token` will always be `undefined` inside the new handler.
**Why it happens:** Every existing `DELETE` route in this codebase (`/motos/:id`, `/motos/:id/interventions/:iid`, `/client/garages/:id`, `/garage/users/:id`, `/or-pieces/:id`, `/or-taches/:id` — confirmed via full-file grep) takes its identifier from a URL path parameter, never a body — so nobody has needed DELETE-with-body before this phase.
**How to avoid:** Widen the method whitelist to `['POST','PUT','PATCH','DELETE'].includes(method)`. This is a single-line, low-risk, backward-compatible change (existing DELETE routes ignore `b` entirely today, so giving them a populated-but-unused `b` object changes nothing for them). This must be called out as its own explicit task in the plan, since it's a shared-dispatcher change, not something scoped inside the new route block.
**Warning signs:** `DELETE /client/device-tokens` returning "token requis" validation errors even when the request body clearly includes `{"token": "..."}` — this is the tell that `b` is still `{}`.

### Pitfall 3: Confusing `rbac.requireRole()` (hierarchical) with `rbac.requireAnyRole()` (exact-role list) — naming mismatch vs CLAUDE.md/ROADMAP wording
**What goes wrong:** CLAUDE.md and the phase's own "Success Criteria" wording say "protected by `requireRole('CLIENT')`" — but `rbac.js`'s actual `requireRole(ctx, minRole)` is **hierarchical** (`ctx.level >= ROLE_HIERARCHY[minRole]`), so `requireRole(ctx, 'CLIENT')` would return `true` for **every** role (CLIENT=1 is the lowest tier; MECANO/PRO/CONCESSION/ADMIN all have `level >= 1`). Using `requireRole(ctx, 'CLIENT')` verbatim would let garage-side accounts (MECANO/PRO/CONCESSION/ADMIN) also pass the gate on `/client/device-tokens` and `/client/me` — likely not the intent, and inconsistent with every other `/client/*` route.
**Why it happens:** The hierarchy (`CLIENT < MECANO < PRO < CONCESSION < ADMIN`) means "CLIENT" is a floor, not an exact-match filter, when passed to `requireRole`.
**How to avoid:** Use `rbac.requireAnyRole(ctx, ['CLIENT'])` — the exact-list-membership check — exactly as every other existing `/client/*` endpoint already does (`/client/limite-motos`, `/client/motos`, `/client/reclamations`, `/client/garages`). This is the correct function for "CLIENT-only", confirmed by reading `auth/rbac.js` source directly (lines 80-83) and cross-checking every current call site in `motokey-api.js` (all of them use `requireAnyRole(ctx, ['CLIENT'])` for CLIENT-only routes; `requireRole(ctx, 'MECANO')`/`'PRO'`/`'CONCESSION'` is only ever used for garage-side hierarchical floors).
**Warning signs:** A test logging in as a CONCESSION/PRO/MECANO account and successfully hitting `/client/device-tokens` or `/client/me` when it should get a 403.

### Pitfall 4: Expo token brackets (`[`, `]`) break naive URL-path-parameter designs
**What goes wrong:** An Expo push token has the literal shape `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`. If a DELETE route were designed as `DELETE /client/device-tokens/:token` (the shape an earlier milestone-level research pass suggested, before CONTEXT.md's D-03 locked in body-based deletion), the token would need URL-encoding on the client and decoding on the server — `url.parse()` (used at the top of the request handler, `motokey-api.js` line 477) does not automatically percent-decode `pathname`, so `params.token` from `match()` would arrive still percent-encoded and require an explicit `decodeURIComponent()` call that no other route in this codebase currently needs.
**Why it happens:** Nothing else in this codebase has an identifier containing URL-reserved characters like `[`/`]`.
**How to avoid:** This is already resolved by following CONTEXT.md's D-03 (body-based DELETE) rather than a URL-param design — call this out as the *reason* the body-based approach is correct, not just a stylistic locked choice. No `decodeURIComponent` handling needed.
**Warning signs:** N/A if D-03 is followed as locked; only relevant if someone reconsiders switching to a URL-param design later.

### Pitfall 5: `garage_id` is nullable on `clients` — `GET /client/me`'s garage embed can legitimately be null
**What goes wrong:** Assuming every client has a linked garage and asserting on a non-null `garages` object in tests/response shape.
**Why it happens:** `migrations/07b-pivot-migration.sql` deliberately dropped the `NOT NULL` constraint on `clients.garage_id` to support self-service client registration without an initial garage link (Livraison 7b pivot). A client can legitimately have `garage_id = NULL`.
**How to avoid:** `GET /client/me` response building must branch on `clientRow.garages` being `null` (client has no linked garage — response should omit or null out the garage name field, not throw) vs. an object (client has a linked garage — include `garages.nom`).
**Warning signs:** A test client created via self-registration (no garage link) causing a 500 on `GET /client/me` instead of returning gracefully.

## Code Examples

### Expo push token format validation (no new dependency)
```javascript
// Source: replicated from expo-server-sdk-node's Expo.isExpoPushToken()
// https://github.com/expo/expo-server-sdk-node/blob/main/src/ExpoClient.ts (verified 2026-07-01)
function isExpoPushToken(token) {
  return (
    typeof token === 'string' &&
    (((token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) &&
      token.endsWith(']')) ||
      /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(token))
  );
}
```
Use this for manual body-field validation in `POST /client/device-tokens`, matching the existing manual-if style (`if (!marque || !modele...) return fail(...)`):
```javascript
const { token, platform } = b;
if (!token || !isExpoPushToken(token)) return fail(res, 'token Expo valide requis', 400, 'VALIDATION_ERROR');
if (!platform || !['ios', 'android'].includes(platform)) return fail(res, "platform 'ios' ou 'android' requis", 400, 'VALIDATION_ERROR');
```

### Migration draft (research finding, not a task itself — planner decides final task breakdown)
```sql
-- Migration 16 : Table client_device_tokens — jetons push mobile (Expo)
-- À appliquer manuellement via Supabase Dashboard > SQL Editor

CREATE TABLE client_device_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token        TEXT        NOT NULL UNIQUE,
  platform     TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_device_tokens_client ON client_device_tokens(client_id);

COMMENT ON TABLE client_device_tokens IS 'Jetons push Expo (mobile) liés à un client. Un client peut avoir plusieurs devices actifs (multi-appareil, D-01). UNIQUE(token) permet la réassignation upsert (D-02) si un device change de propriétaire.';
```
Design notes reconciling CONTEXT.md decisions with the schema:
- `client_id` FK (not `auth_user_id`) — per CONTEXT.md D-01 explicitly ("foreign key to clients"). Note: an earlier milestone-level research pass (`.planning/research/ARCHITECTURE.md` §2.1) proposed keying on `auth_user_id` instead — that predates CONTEXT.md's discussion and is superseded by the locked D-01 decision for this phase. Follow CONTEXT.md.
- `UNIQUE` on `token` alone (not a composite key) — required for D-02's upsert-reassignment to work via `onConflict: 'token'`.
- No RLS policy needed on this new table beyond Postgres's default-deny — `SBLayer.supabase` (service-role client) bypasses RLS entirely regardless (see RLS section below), and the client never queries this table directly (no anon/authenticated-role access path exists for it).
- `platform` included (Claude's discretion per CONTEXT.md, low-cost, useful for Phase 13 diagnostics/receipt handling) — CHECK constraint mirrors the existing `garage_users.role` CHECK-constraint style (`sql/migrations/12_garage_users.sql` line 9).

### GET /client/me query shape
```javascript
// Reconciles CONTEXT.md D-04 with actual schema columns (see Pitfall 1)
const { data: clientRow, error } = await SBLayer.supabase
  .from('clients')
  .select('id, nom, email, tel, garage_id, created_at, garages(nom)')
  .eq('auth_user_id', ctx.user_id)
  .single();
if (error || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
return ok(res, {
  id: clientRow.id,
  nom: clientRow.nom,
  email: clientRow.email,
  tel: clientRow.tel,
  garage_id: clientRow.garage_id,
  garage_nom: clientRow.garages ? clientRow.garages.nom : null,
  client_depuis: clientRow.created_at
});
```

## State of the Art

Not applicable in the traditional sense (no external library version drift to track) — the relevant "state of the art" finding is entirely about this repo's own internal conventions:

| Old/Assumed Approach | Actual Current Approach in This Repo | Impact |
|-----------------------|----------------------------------------|--------|
| CLAUDE.md/ROADMAP wording "`requireRole('CLIENT')`" | Actual call is `rbac.requireAnyRole(ctx, ['CLIENT'])` | Planner must specify the exact function name in tasks — using the hierarchical `requireRole` with 'CLIENT' as the floor would be a security bug (see Pitfall 3) |
| Prior milestone research (`ARCHITECTURE.md`) proposing `device_tokens` keyed on `auth_user_id`, DELETE via URL param | CONTEXT.md's locked D-01/D-03 (this phase's authoritative source): `client_device_tokens` keyed on `client_id`, DELETE via body | Follow CONTEXT.md — it's the more recent, explicitly-discussed decision; the milestone-level research predates the phase-level discussion |
| Assuming `POST/PUT/PATCH/DELETE` all get body parsing | Only `POST/PUT/PATCH` currently trigger `body(req)` | Must add `'DELETE'` to the whitelist as an explicit task (Pitfall 2) |

## Open Questions

1. **Should `platform` be a required field on `POST /client/device-tokens`, or optional?**
   - What we know: CONTEXT.md marks platform storage as Claude's discretion, "useful for Phase 13/17 but not required by Phase 12 success criteria."
   - What's unclear: Whether the mobile app (built in a later phase) will always reliably know its platform at registration time. Very likely yes (`Platform.OS` in React Native is always available), but this phase is curl-testable with no RN app yet, so there's no client to confirm against.
   - Recommendation: Make `platform` required in the table (`NOT NULL CHECK IN ('ios','android')`, per the code example above) since it costs nothing to require it via curl/Postman testing this phase, and Phase 13/17 will want it. If the planner prefers zero-required-fields-beyond-token for a smaller Phase 12 surface, `platform` can be made nullable instead — low-risk either way, does not block success criteria.

2. **Should the DELETE route also support "delete all my tokens" (no token in body) for a simpler logout path?**
   - What we know: CONTEXT.md D-03 explicitly locks "removes only the specific token supplied in the request body — not all tokens."
   - What's unclear: Nothing — this is fully locked, not actually open. Listed here only to flag that the planner should NOT add a "delete all" fallback mode, even though it might seem like a convenient logout shortcut; the locked rationale (don't silence push on other devices) explicitly rules it out.
   - Recommendation: Implement exactly as locked — single-token-only deletion, 400/404 if `token` is missing from the body or not found for this client.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (no Jest/Mocha/pytest). Existing convention: hand-rolled Node scripts using the raw `http` module (`test-api.js`, `tests/test-or-e2e.js`), run manually against a live local server on `localhost:3000`, with a custom `test()`/`check()` pass/fail counter. |
| Config file | none — see Wave 0 |
| Quick run command | `node motokey-api.js` (start server in one terminal) then `node test-client-device-tokens.js` (new script, or manual curl) in another |
| Full suite command | `npm test` (currently runs only `test-api.js`; `tests/test-or-e2e.js` is run separately/manually, not wired into `npm test` — confirm during planning whether to add this phase's new test script to `npm test` or keep it curl/manual per the phase's explicit "curl/Postman verifiable" framing) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MPUSH-02 (SC1) | `POST /client/device-tokens` with valid Expo token + valid CLIENT JWT creates a row, verifiable via curl | manual/smoke (curl) | `curl -X POST http://localhost:3000/client/device-tokens -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"token":"ExponentPushToken[xxxx]","platform":"ios"}'` | Wave 0 — no test script exists yet |
| MPUSH-02 (SC2) | `DELETE /client/device-tokens` removes the matching entry | manual/smoke (curl) | `curl -X DELETE http://localhost:3000/client/device-tokens -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"token":"ExponentPushToken[xxxx]"}'` | Wave 0 |
| MPUSH-02 (SC3) | `GET /client/me` returns the authenticated client's profile | manual/smoke (curl) | `curl http://localhost:3000/client/me -H "Authorization: Bearer $TOKEN"` | Wave 0 |
| MPUSH-02 (SC4) | Both device-token endpoints reject requests without a valid JWT (401) | manual/smoke (curl) | `curl -X POST http://localhost:3000/client/device-tokens -d '{}'` (no Authorization header) → expect 401 | Wave 0 |

### Sampling Rate
- **Per task commit:** manual curl check against the locally running `node motokey-api.js` process for the specific endpoint just added.
- **Per wave merge:** re-run all 4 curl checks above in sequence (register → verify → delete → verify gone → auth-rejection).
- **Phase gate:** All 4 success criteria demonstrated via curl output before considering the phase done (this phase's own stated success criteria ARE the curl-testability bar — no separate automated suite is mandated by the phase description).

### Wave 0 Gaps
- [ ] A small `tests/test-client-device-tokens.js` script (optional, following the exact `test-api.js`/`tests/test-or-e2e.js` pattern) — recommended but not strictly required, since the phase's own success criteria are explicitly framed as curl/Postman-verifiable, not "must have an automated test file." Planner's call whether to invest in a script vs. rely on documented curl commands in the plan's verification steps.
- [ ] No framework install needed — this repo does not use Jest/Mocha/pytest and there's no indication this phase should introduce one.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Running `motokey-api.js` locally for curl verification | Yes | v24.14.1 | — |
| curl | Success-criteria-mandated verification method | Yes | 8.18.0 | — |
| Supabase project (existing, already configured) | `SBLayer.supabase` service-role client | Assumed yes (existing project dependency, not new for this phase) | — | — |

No missing dependencies for this phase — it introduces zero new external tools or npm packages.

## Sources

### Primary (HIGH confidence — direct source reading, this session)
- `C:\motokey-api\motokey-api.js` — RBAC dispatch (line 550), body-parsing method whitelist (line 544-545), route matcher `match()`/`M()` (lines 404-415), existing `/client/*` handlers (lines 1531-1650+), legacy dead-code routes (lines 1499-1529, 647-659), all `DELETE` route signatures (grep, confirmed URL-param-only), CORS/OPTIONS handling (lines 346-357)
- `C:\motokey-api\supabase.js` — service-role vs anon client setup (lines 29-58), existing `.upsert()` usage (lines 451-457), all `.from('clients')` call sites (grep)
- `C:\motokey-api\auth\rbac.js` — full file read; `requireRole` (hierarchical) vs `requireAnyRole` (exact-list) semantics confirmed from source (lines 66-83)
- `C:\motokey-api\schema.sql` — `clients` table definition (lines 88-101), `garages` table definition (lines 50-68), `ALTER TABLE clients ENABLE ROW LEVEL SECURITY` (line 405)
- `C:\motokey-api\migrations\04-rbac-migration.sql`, `04-rls-harden.sql`, `07b-pivot-migration.sql` — confirmed `clients` column additions (client_type/siret/etc., none add prenom/telephone), confirmed `garage_id` NOT NULL was dropped, confirmed RLS policy shape (`clients_select`/`clients_modify` via `current_user_role()`)
- `C:\motokey-api\sql\migrations\12_garage_users.sql`, `13_liaison_client_moto.sql` — migration file style/convention (numbering, comment header, CHECK constraints, index naming)
- `C:\motokey-api\MotoKey_Client.html` (line 1040) — confirms existing frontend expects a `tel` field (with `phone` fallback), not `telephone`
- `C:\motokey-api\test-api.js`, `C:\motokey-api\tests\test-or-e2e.js` — confirmed test convention (hand-rolled Node scripts, no framework)
- `C:\motokey-api\package.json` — confirmed no `expo-server-sdk` dependency yet, confirmed `npm test` script scope
- `C:\motokey-api\.planning\research\ARCHITECTURE.md`, `STACK.md` (prior milestone-level research, same repo) — cross-referenced for the `/auth/me` gap history and an earlier (superseded-by-CONTEXT.md) `device_tokens` table proposal
- [expo-server-sdk-node source, `ExpoClient.ts`](https://github.com/expo/expo-server-sdk-node/blob/main/src/ExpoClient.ts) — fetched via WebFetch this session, confirmed exact `isExpoPushToken` regex/branch logic
- `npm view expo-server-sdk version` — confirmed `6.1.0`, published 2026-06-01

### Secondary (MEDIUM confidence)
- WebSearch cross-check on `Expo.isExpoPushToken` general usage pattern (matches the WebFetch-verified source, so effectively promoted to HIGH via cross-verification)

### Tertiary (LOW confidence)
None — this phase required no speculative/unverified findings.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependency, existing stack fully read from source
- Architecture: HIGH — all 3 route patterns copied from existing, working code in the same file
- Pitfalls: HIGH — all 5 pitfalls verified against actual source code (schema.sql columns, dispatch whitelist, rbac.js function bodies), not inferred

**Research date:** 2026-07-01
**Valid until:** Stable — this research is scoped entirely to this repo's own, slow-changing conventions (not a fast-moving external library), so it should remain valid through the full v1.3 milestone (Phases 12-17) unless the underlying files are refactored.
