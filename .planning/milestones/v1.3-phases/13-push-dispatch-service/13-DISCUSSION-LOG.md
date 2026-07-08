# Phase 13: Push Dispatch Service - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 13-push-dispatch-service
**Areas discussed:** Idempotency strategy, Invalid/stale token handling, Send function signature

---

## Idempotency strategy

### Q1: Where should idempotency dedup state live?

| Option | Description | Selected |
|--------|-------------|----------|
| DB-backed table | New small table (e.g. push_send_log) storing idempotency_key + sent_at. Survives Railway restarts/redeploys. | ✓ |
| In-memory Map | Simplest, zero migration, but resets on every restart/redeploy. | |
| You decide | Claude picks based on research findings (e.g. expo-server-sdk receipts/dedup). | |

**User's choice:** DB-backed table

### Q2: Who supplies the idempotency key?

| Option | Description | Selected |
|--------|-------------|----------|
| Caller supplies it | sendPush(clientId, {title, body, data}, idempotencyKey) — caller constructs a meaningful key. | ✓ |
| Auto-derived from payload hash | pushService hashes title+body+data+token internally. Risk of false collisions on similar text. | |

**User's choice:** Caller supplies it

**Notes:** User confirmed no further clarification needed for this area (retention/TTL and table naming left to Claude's discretion).

---

## Invalid/stale token handling

### Q1: When Expo reports a token is dead (DeviceNotRegistered), what should pushService do?

| Option | Description | Selected |
|--------|-------------|----------|
| Log-only | Match success criteria literally: log, don't crash, don't touch DB. Self-healing deferred to Phase 16. | ✓ |
| Auto-deactivate now | pushService also deletes/deactivates the row in client_device_tokens when confirmed dead. | |
| You decide | Claude picks based on receipt-checking API complexity. | |

**User's choice:** Log-only

**Notes:** Deferred auto-deactivation explicitly to Phase 16, where real send volume and Expo receipts will actually be exercised.

---

## Send function signature

### Q1: Should sendPush() fan out to all of a client's registered devices, or target a single token?

| Option | Description | Selected |
|--------|-------------|----------|
| client_id fan-out | sendPush(clientId, {title, body, data}, idempotencyKey) — looks up all active tokens for that client. Matches Phase 12 multi-device support (D-01). | ✓ |
| Single token | sendPush(token, ...) — simpler, but callers must do their own client→tokens lookup/loop. | |

**User's choice:** client_id fan-out

### Q2: For manual testing in this phase, how should that work given the fan-out design?

| Option | Description | Selected |
|--------|-------------|----------|
| Expose both entry points | sendPush(clientId, ...) for real callers, plus a lower-level sendToToken(token, ...) for manual single-token testing. | ✓ |
| Client_id only | Manual testing exclusively through sendPush(clientId, ...) — requires a real seeded client_device_tokens row. | |

**User's choice:** Expose both entry points

---

## Claude's Discretion

- expo-server-sdk npm package vs raw HTTP calls to Expo Push API — research question, not a user preference
- Exact dedup table naming/columns beyond idempotency_key/sent_at
- Batching strategy for multi-recipient sends (batched Expo API call vs one call per token)
- Manual test tooling shape (dedicated scripts/test-push.js vs inline node -e) — user deferred this question entirely (skipped as a discussion area)

## Deferred Ideas

- Proactive deactivation of dead/invalid tokens on DeviceNotRegistered — Phase 16
- Manual test tooling scope — left to planner/executor discretion
