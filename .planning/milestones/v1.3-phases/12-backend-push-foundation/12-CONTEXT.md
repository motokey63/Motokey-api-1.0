# Phase 12: Backend Push Foundation - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend exposes device-token register/unregister for authenticated CLIENT users, plus a `GET /client/me` profile endpoint — all curl-testable, zero mobile app dependency. Zero React Native code in this phase. Requirement covered: MPUSH-02 (backend half; end-to-end wiring happens in Phase 16).

</domain>

<decisions>
## Implementation Decisions

### Device token storage
- **D-01:** Multi-device support — a client can have multiple simultaneous active tokens (e.g. phone + tablet), not a single overwritten token. Requires a 1-to-N table (`client_device_tokens` or similar) with a unique constraint on the token value itself, foreign key to `clients`.
- **D-02:** Token reassignment — if an Expo token already registered under Client A is re-submitted authenticated as Client B, upsert on the token column reassigns the row to Client B (physical reality: one device is used by one active user at a time; avoids accumulating dead tokens pointing at a stale owner).

### DELETE semantics
- **D-03:** `DELETE /client/device-tokens` removes only the specific token supplied in the request body — not all tokens for the authenticated user. Consistent with multi-device support: logging out on one device must not silence push on other devices for the same client.

### GET /client/me payload
- **D-04:** Response includes: `id`, `nom`, `prenom`, `email`, `telephone`, `garage_id` + linked garage name (if present), account creation date. This fills the `/auth/me` gap identified in research, sized for a mobile profile screen + "linked to [Garage X]" display without an extra round trip. Explicitly excludes derived counters (nb_motos, nb_devis_en_attente) — deferred, see below.

### Claude's Discretion
- Exact table/column naming (`client_device_tokens` vs `device_tokens`, column names like `platform`, `last_used_at`) — no strong user preference expressed, follow existing migration/table naming conventions in `sql/migrations/`.
- Whether to store platform (ios/android) and app version on the token row — useful for Phase 13/17 but not required by Phase 12 success criteria; Claude may include if low-cost.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` — Phase 12 section ("Backend Push Foundation") — exact 4 success criteria, locked scope boundary
- `.planning/REQUIREMENTS.md` — MPUSH-02 — requirement text and traceability (backend half of Phase 12, end-to-end validation in Phase 16)
- `.planning/PROJECT.md` — Constraints section — `requireRole()`/RBAC mandatory on new sensitive endpoints; direct-edit-only rule for `motokey-api.js`

### Existing patterns to follow
- `motokey-api.js` (around line 1531 onward, e.g. `GET /client/limite-motos`, `POST /client/motos`) — established `/client/*` endpoint pattern: `rbac.extractRoleFromRequest(req, SBLayer)` → `rbac.requireAnyRole(ctx, ['CLIENT'])` → look up `clients` row by `auth_user_id` → act. Reuse this pattern for the two new device-token endpoints and `/client/me`.
- `sql/migrations/` (10 through 15) — migration file naming/numbering convention; next migration should be `16_*.sql`.

No other external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `rbac.extractRoleFromRequest` / `rbac.requireAnyRole` (used throughout `motokey-api.js`) — JWT role extraction and CLIENT-role gate, directly reusable for the two new endpoints.
- `clients` table (already has `auth_user_id`, `garage_id` columns, confirmed via existing `/client/*` endpoints) — join point for both new endpoints.

### Established Patterns
- All `/client/*` endpoints look up the `clients` row via `ctx.user_id` → `auth_user_id` before touching any domain data — do the same for device-token ownership checks.
- Error handling convention: `fail(res, message, statusCode, errorCode)` / `ok(res, data)` helpers already used consistently.

### Integration Points
- New migration file needed for the device-token table (next number: `16_*.sql`), following the pattern of `13_liaison_client_moto.sql`.
- **Caution:** `motokey-api.js` also contains legacy dead code using an in-memory `DB` object and a different `auth(req,res)` helper (e.g. old `GET /client/moto` around line 1500). This is NOT the pattern to follow — it predates the Supabase/RBAC migration. Downstream agents should ignore it and follow the Supabase-based `/client/*` endpoints instead.

</code_context>

<specifics>
## Specific Ideas

No specific UI/wording requirements — this is a backend-only, curl-testable phase (no mobile app in scope).

</specifics>

<deferred>
## Deferred Ideas

- `nb_motos` / `nb_devis_en_attente` counters on `GET /client/me` — considered during discussion, deferred to keep the endpoint cheap (single query, no extra joins). Can be added later or fetched via existing `/client/limite-motos` and `/devis` endpoints if the mobile app needs them.

</deferred>

---

*Phase: 12-backend-push-foundation*
*Context gathered: 2026-07-01*
