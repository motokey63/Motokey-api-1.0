# Phase 13: Push Dispatch Service - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

A backend push-sending service (`services/pushService.js`) exists, modeled on `services/emailService.js`'s `PUSH_ENABLED`/fallback convention. It can be invoked manually (no mobile app, no wired business triggers) to deliver a real Expo push notification to a test device. Idempotency dedup prevents double-sends on retry. Invalid/expired tokens are logged, never crash the process. Wiring this service into actual triggers (devis created → MPUSH-03, maintenance threshold → MPUSH-04) happens in Phases 16 and 17 — this phase only builds and proves the sending capability itself.

</domain>

<decisions>
## Implementation Decisions

### Idempotency strategy
- **D-01:** Dedup state is DB-backed (a new small table, e.g. `push_send_log` storing `idempotency_key` + `sent_at`), not in-memory. Reason: Railway restarts/redeploys happen often, and an in-memory Map would silently stop protecting against double-sends after every deploy.
- **D-02:** The caller supplies the idempotency key explicitly (e.g. `sendPush(clientId, payload, 'devis-123-created')`), not an auto-derived hash of the payload. Explicit keys are easier to reason about and avoid false-collision risk between two genuinely different notifications with similar text.

### Invalid/stale token handling
- **D-03:** Log-only for this phase. When Expo reports a token is dead (e.g. `DeviceNotRegistered`), pushService logs it and does not touch `client_device_tokens`. Matches the phase's success criteria literally ("journalisé sans faire planter"). Proactive deactivation/deletion of dead tokens is deferred to Phase 16, where real send volume and Expo's receipt-checking flow will actually be exercised.

### Send function signature
- **D-04:** Primary entry point is `sendPush(clientId, {title, body, data}, idempotencyKey)` — looks up ALL active tokens for that client in `client_device_tokens` and sends to each (fan-out). This matches Phase 12's multi-device support (D-01 in `12-CONTEXT.md`: a client can have multiple simultaneous active tokens) and means Phase 16/17 callers just pass a `clientId` without re-implementing token lookup/looping.
- **D-05:** A lower-level `sendToToken(token, {title, body, data}, idempotencyKey)` is also exposed, used internally by `sendPush`'s fan-out loop and directly callable for manual single-token testing (the phase's success criterion: "invoquée manuellement avec un token Expo réel"). This avoids needing a seeded `client_id`/DB row just to smoke-test delivery.

### Claude's Discretion
- Whether to use the `expo-server-sdk` npm package or raw HTTP calls to the Expo Push API (`https://exp.host/--/api/v2/push/send`) — a research question (STATE.md already flags "expo-server-sdk API exacte (envoi + receipts) à vérifier avant Phase 13"), not a user preference. Whichever approach the research recommends is fine.
- Exact naming of the dedup table and its columns beyond `idempotency_key`/`sent_at` (e.g. whether to also store `client_id`, `token`, `created_at` for debugging) — follow existing migration conventions in `sql/migrations/`.
- Whether/how to batch multiple recipients in a single Expo API call (Expo supports batched push arrays) vs one call per token in the fan-out loop — implementation detail, no user preference expressed.
- Manual test tooling (dedicated `scripts/test-push.js` vs inline `node -e` invocation) — not discussed; user deferred this question. Follow the Phase 12 smoke-test precedent (`scripts/` + `.bak` discipline per CLAUDE.md) if a script is the natural way to exercise `sendToToken`/`sendPush` manually.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` — Phase 13 section ("Push Dispatch Service") — exact 4 success criteria, locked scope boundary, explicit note to model on `services/emailService.js`
- `.planning/REQUIREMENTS.md` — MPUSH-03, MPUSH-04 — this phase is infrastructure enabling both, but neither is fully satisfied until Phase 16/17 wire real triggers
- `.planning/PROJECT.md` — Constraints section — `requireRole()`/RBAC mandatory on new sensitive endpoints (if any are added); direct-edit-only rule does not apply to `services/pushService.js` (new file, not in the critical-files list)
- `.planning/phases/12-backend-push-foundation/12-CONTEXT.md` — D-01 (multi-device support), D-02 (token reassignment via upsert) — this phase's fan-out design (D-04 above) depends directly on D-01

### Existing patterns to follow
- `services/emailService.js` (full file) — the exact convention to mirror: `PUSH_ENABLED` env flag → real client init only if enabled AND lib available → fallback `console.log` block if disabled, never throwing from the send path
- `motokey-api.js` line ~188 (`isExpoPushToken`) — existing token-shape validator, reusable as-is for validating tokens before sending
- `motokey-api.js` lines ~1730-1760 (`POST`/`DELETE /client/device-tokens`) — existing `client_device_tokens` query patterns (Supabase `.from('client_device_tokens')` usage) to follow when pushService looks up tokens by `client_id`
- `sql/migrations/16_client_device_tokens.sql` — schema for `client_device_tokens` (`client_id`, `token`, `platform`, `last_used_at`); next migration for the new dedup table should be `17_*.sql` (check actual next-free number in `sql/migrations/` at planning time, since numbering may have advanced)

No other external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isExpoPushToken(token)` (`motokey-api.js` ~line 188) — validates Expo push token shape, reusable in pushService before attempting a send
- `client_device_tokens` table (migration 16, not yet applied in prod per STATE.md known gaps) — columns: `id`, `client_id`, `token`, `platform`, `last_used_at`, `created_at`
- `services/emailService.js` — direct structural template for the enabled/fallback pattern

### Established Patterns
- Enabled/fallback flag convention: `{FEATURE}_ENABLED=false` by default in prod until explicitly flipped, mirroring `EMAIL_ENABLED`/`BILLING_ENFORCE` — apply the same for `PUSH_ENABLED`
- Errors from external send providers are caught and logged, never thrown up to break the caller's flow (see `emailService.send`'s try/catch)

### Integration Points
- New migration needed for the idempotency dedup table — check `sql/migrations/` for the actual next-free number (17 was the last known number referenced for `client_device_tokens`; confirm at plan time since migration 16 exists but hasn't been applied to prod, which doesn't block adding a new migration file)
- No new HTTP endpoints are required by this phase's success criteria — it's a service module invoked manually/programmatically, not exposed via `motokey-api.js` routes (unlike Phase 12)

</code_context>

<specifics>
## Specific Ideas

No specific UI/wording requirements — this is a backend-only, manually-testable phase (no mobile app in scope). The one concrete reference point given was explicit: reuse `emailService.js`'s enabled/fallback convention exactly, don't invent a new pattern.

</specifics>

<deferred>
## Deferred Ideas

- Proactive deactivation of dead/invalid tokens in `client_device_tokens` on `DeviceNotRegistered` — deferred to Phase 16 (real send volume + Expo receipt-checking flow will exist there)
- Manual test tooling scope (dedicated `scripts/test-push.js` vs ad-hoc invocation) — not discussed, left to planner/executor discretion within Phase 12's `scripts/` precedent

</deferred>

---

*Phase: 13-push-dispatch-service*
*Context gathered: 2026-07-01*
