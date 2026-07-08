# Phase 13: Push Dispatch Service - Research

**Researched:** 2026-07-02
**Domain:** Server-side Expo push notification sending (Node.js), idempotency guard pattern, service-module conventions
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Idempotency strategy**
- **D-01:** Dedup state is DB-backed (a new small table, e.g. `push_send_log` storing `idempotency_key` + `sent_at`), not in-memory. Reason: Railway restarts/redeploys happen often, and an in-memory Map would silently stop protecting against double-sends after every deploy.
- **D-02:** The caller supplies the idempotency key explicitly (e.g. `sendPush(clientId, payload, 'devis-123-created')`), not an auto-derived hash of the payload. Explicit keys are easier to reason about and avoid false-collision risk between two genuinely different notifications with similar text.

**Invalid/stale token handling**
- **D-03:** Log-only for this phase. When Expo reports a token is dead (e.g. `DeviceNotRegistered`), pushService logs it and does not touch `client_device_tokens`. Matches the phase's success criteria literally ("journalisé sans faire planter"). Proactive deactivation/deletion of dead tokens is deferred to Phase 16, where real send volume and Expo's receipt-checking flow will actually be exercised.

**Send function signature**
- **D-04:** Primary entry point is `sendPush(clientId, {title, body, data}, idempotencyKey)` — looks up ALL active tokens for that client in `client_device_tokens` and sends to each (fan-out). This matches Phase 12's multi-device support (D-01 in `12-CONTEXT.md`: a client can have multiple simultaneous active tokens) and means Phase 16/17 callers just pass a `clientId` without re-implementing token lookup/looping.
- **D-05:** A lower-level `sendToToken(token, {title, body, data}, idempotencyKey)` is also exposed, used internally by `sendPush`'s fan-out loop and directly callable for manual single-token testing (the phase's success criterion: "invoquée manuellement avec un token Expo réel"). This avoids needing a seeded `client_id`/DB row just to smoke-test delivery.

### Claude's Discretion
- Whether to use the `expo-server-sdk` npm package or raw HTTP calls to the Expo Push API (`https://exp.host/--/api/v2/push/send`) — a research question, not a user preference. **Resolved below: use `expo-server-sdk`.**
- Exact naming of the dedup table and its columns beyond `idempotency_key`/`sent_at` — follow existing migration conventions in `sql/migrations/`. **Resolved below: mirror `billing_events`.**
- Whether/how to batch multiple recipients in a single Expo API call vs one call per token in the fan-out loop — implementation detail, no user preference expressed.
- Manual test tooling (dedicated `scripts/test-push.js` vs inline `node -e` invocation) — not discussed; user deferred this question. **Resolved below: `scripts/` is the correct precedent, not `tests/`.**

### Deferred Ideas (OUT OF SCOPE)
- Proactive deactivation of dead/invalid tokens in `client_device_tokens` on `DeviceNotRegistered` — deferred to Phase 16 (real send volume + Expo receipt-checking flow will exist there)
- Manual test tooling scope — left to planner/executor discretion within precedent found below
</user_constraints>

<phase_requirements>
## Phase Requirements

No dedicated requirement IDs are mapped to Phase 13 in `.planning/REQUIREMENTS.md` (traceability table maps MPUSH-03 → Phase 16, MPUSH-04 → Phase 17). Phase 13 is pure enabling infrastructure. The phase's own 4 success criteria (from ROADMAP.md, reproduced in the phase description) are the actual acceptance bar:

| # | Success Criterion | Research Support |
|---|--------------------|-------------------|
| 1 | `services/pushService.js` exposes a send function that, invoked manually with a real Expo token, delivers a visible notification on a test device | `expo-server-sdk` API confirmed (Standard Stack, Code Examples); manual test script pattern confirmed (Don't Hand-Roll / Architecture) |
| 2 | `PUSH_ENABLED=false` → fallback `console.log`, no error | `services/emailService.js` convention fully documented below (Architecture Patterns) |
| 3 | Same idempotency key as a previous send → no second notification | `billing_events`/`stripeService.handleWebhookEvent` guard-first pattern is a direct, already-proven precedent (Code Examples) |
| 4 | Invalid/expired token → logged, process does not crash | Expo ticket-level vs receipt-level error distinction documented (Common Pitfalls, Open Questions) |
</phase_requirements>

## Summary

Phase 13 builds a single new file, `services/pushService.js`, following the exact structural convention already established by `services/emailService.js` (env-flag-gated client init, fallback console.log, catch-and-log on send errors) and the exact idempotency-guard convention already established by `services/stripeService.js`'s `handleWebhookEvent` (insert-first-then-process against a UNIQUE column, catch duplicate-key error code 23505 to detect "already processed"). Both precedents already exist in this codebase and should be copied structurally, not reinvented.

For the actual push delivery mechanism, the official `expo-server-sdk` npm package (current version 6.1.0, requires Node >=20, not yet a project dependency) is the correct choice over hand-rolled HTTP calls: it exposes `Expo.isExpoPushToken()` for token validation, `chunkPushNotifications()` for batching (Expo caps at 100 recipients/request), `sendPushNotificationsAsync()` for sending (returns per-recipient tickets with immediate `status: 'ok'|'error'` info), and `getPushNotificationReceiptsAsync()` for later delivery-outcome checks (Expo recommends checking receipts ~15 minutes after sending, since APNs/FCM delivery confirmation is async). Given D-03 explicitly defers receipt-based dead-token handling to Phase 16, Phase 13 only needs to handle **ticket-level** errors (synchronous, returned immediately from the send call) — this satisfies success criterion 4 without needing a delayed job/cron.

**Primary recommendation:** Install `expo-server-sdk@^6.1.0`, mirror `emailService.js`'s `PUSH_ENABLED` pattern exactly, mirror `stripeService.js`'s guard-insert-first idempotency pattern against a new `push_send_log` table (migration `17_push_send_log.sql`), and add a standalone `scripts/test-push.js` (not `tests/`) that directly requires `pushService.js` and calls `sendToToken` with a CLI-supplied real Expo token — no running HTTP server needed, unlike the Phase 12 device-tokens smoke test.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|---------------|
| `expo-server-sdk` | `^6.1.0` (verified via `npm view expo-server-sdk version` on 2026-07-02; published 2026-06-01) | Send Expo push notifications from Node.js, validate token shape, batch/chunk, fetch delivery receipts | Official Expo-maintained package; handles chunking, retry/backoff, and up to 6 concurrent connections internally — avoids hand-rolling HTTP + retry logic |

### Supporting (transitive, installed automatically)
| Library | Version | Purpose |
|---------|---------|---------|
| `undici` | `^7.2.0` | HTTP client used internally by the SDK |
| `promise-limit` | `^2.7.0` | Concurrency limiting for chunk sends |
| `promise-retry` | `^2.0.1` | Retry logic for transient failures |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `expo-server-sdk` | Raw HTTP POST to `https://exp.host/--/api/v2/push/send` | Removes one dependency, but hand-rolls chunking (100/request cap), retry/backoff, and ticket/receipt parsing that the SDK already provides — violates "Don't Hand-Roll" for no real benefit given Phase 13's low volume |

**Installation:**
```bash
npm install expo-server-sdk
```

**Version verification:** Confirmed via `npm view expo-server-sdk version` → `6.1.0`, `npm view expo-server-sdk time.modified` → `2026-06-01T20:25:40.142Z` (recent, actively maintained). `npm view expo-server-sdk engines` → `{ node: '>=20' }`. Local dev Node is v24.14.1 (meets requirement). **Not yet present in `C:\motokey-api\package.json` dependencies** — confirmed by direct read (only `@supabase/supabase-js`, `bcryptjs`, `dotenv`, `express`, `jsonwebtoken`, `resend`, `stripe` currently listed).

## Architecture Patterns

### Recommended Project Structure
```
services/
├── emailService.js      # existing — structural template to mirror
├── stripeService.js      # existing — idempotency-guard template to mirror
└── pushService.js         # NEW — this phase

sql/migrations/
└── 17_push_send_log.sql  # NEW — idempotency dedup table (next free number after 16)

scripts/
└── test-push.js           # NEW (recommended) — standalone manual-send tool, no server required
```

### Pattern 1: Enabled/Fallback Env Flag (mirror `emailService.js` exactly)
**What:** A module-level boolean derived from `process.env.PUSH_ENABLED === 'true'`, gating whether a real client is constructed. If disabled, or if the client fails to construct, all sends fall through to a `console.log` block and never throw.
**When to use:** Always, for every provider-facing service in this codebase (`EMAIL_ENABLED`, and now `PUSH_ENABLED`, matching the established naming convention).
**Example (verbatim structure of `services/emailService.js`, lines 14-32):**
```javascript
// Source: C:\motokey-api\services\emailService.js (read in full 2026-07-02)
const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
const RESEND_FROM   = process.env.RESEND_FROM || 'MotoKey <noreply@motokey.fr>';

let resendClient = null;
if (EMAIL_ENABLED) {
  try {
    const { Resend } = require('resend');
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️  [7b] EMAIL_ENABLED=true mais RESEND_API_KEY manquant — fallback console');
    } else {
      resendClient = new Resend(process.env.RESEND_API_KEY);
      console.log('✅ [7b] Resend initialisé');
    }
  } catch (e) {
    console.warn('⚠️  [7b] Module resend non disponible — fallback console:', e.message);
  }
} else {
  console.log('📧 [7b] Email en mode dev (EMAIL_ENABLED=false) — console.log uniquement');
}
```
**Direct mapping for `pushService.js`:**
```javascript
const PUSH_ENABLED = process.env.PUSH_ENABLED === 'true';

let expoClient = null;
if (PUSH_ENABLED) {
  try {
    const { Expo } = require('expo-server-sdk');
    expoClient = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN }); // accessToken optional, see Open Questions
    console.log('✅ [13] Expo push client initialisé');
  } catch (e) {
    console.warn('⚠️  [13] Module expo-server-sdk non disponible — fallback console:', e.message);
  }
} else {
  console.log('🔔 [13] Push en mode dev (PUSH_ENABLED=false) — console.log uniquement');
}
```
The send function's try/catch must mirror `emailService.send`'s pattern: catch and `console.error`, never rethrow to the caller (see success criterion 2 and 4).

### Pattern 2: Idempotency guard — insert-first, catch-duplicate (mirror `stripeService.js` exactly)
**What:** Before doing the actual external-provider call, `INSERT` the idempotency key into a UNIQUE-constrained column. If the insert throws a duplicate-key error, skip the send and return early — this is already the proven pattern for Stripe webhook replay protection in this codebase.
**When to use:** Any idempotent operation guarded by an explicit caller-supplied key (matches D-01/D-02 exactly).
**Example (verbatim, `services/stripeService.js` lines 250-260):**
```javascript
// Source: C:\motokey-api\services\stripeService.js (read in full 2026-07-02)
async function handleWebhookEvent(event, SBLayer) {
  // Idempotency guard — unique sur stripe_event_id
  try {
    await SBLayer.BillingEvents.insert(event.id, event.type, event.data.object);
  } catch (e) {
    if (e.message.includes('duplicate') || e.message.includes('unique') || e.message.includes('23505')) {
      console.log(`[webhook] Event ${event.id} déjà traité — ignoré`);
      return { skipped: true };
    }
    throw e;
  }
  // ... process event
}
```
The corresponding `BillingEvents.insert` in `supabase.js` (lines 1426-1436):
```javascript
const BillingEvents = {
  async insert(stripe_event_id, event_type, payload) {
    const { data, error } = await supabase
      .from('billing_events')
      .insert({ stripe_event_id, event_type, payload })
      .select()
      .single();
    if (error) throw new Error(`[billing_events] ${error.message}`);
    return data;
  }
};
```
**Direct mapping:** add a `PushSendLog.insert(idempotency_key, client_id, token)` helper to `supabase.js` (mirrors `BillingEvents`, exported alongside it), and reuse the exact same duplicate-detection string check (`e.message.includes('duplicate') || ... .includes('23505')`) inside `pushService.js`'s `sendToToken`/`sendPush`.

### Pattern 3: Service modules require `supabase.js` directly — no circular dependency risk
**What:** `supabase.js` is a leaf module (only requires `dotenv` and `@supabase/supabase-js` — confirmed by direct read, no requires of `motokey-api.js` or any `services/*` file). `motokey-api.js` requires it once as `SBLayer` (line 86-88: `let SBLayer = null; ... SBLayer = require('./supabase');`) and passes `SBLayer` into `stripeService.handleWebhookEvent(event, SBLayer)` as a function parameter.
**Why this matters for Phase 13:** D-04/D-05's locked signatures are `sendPush(clientId, payload, idempotencyKey)` and `sendToToken(token, payload, idempotencyKey)` — **no `SBLayer` parameter**. This means `pushService.js` cannot rely on dependency injection like `stripeService.js` does; it must `require('../supabase')` directly at the top of the file, exactly as `motokey-api.js` itself does. This is safe (no cycle) because `supabase.js` never requires anything that would loop back.
```javascript
// pushService.js
const SBLayer = require('../supabase'); // safe: supabase.js is a leaf module
```

### Anti-Pattern to Avoid: Requiring `motokey-api.js` from `pushService.js` to reuse `isExpoPushToken`
`isExpoPushToken()` (motokey-api.js line 188) is a private function inside the main server file — it is **not exported**. `motokey-api.js` already requires `services/emailService.js` and `services/stripeService.js` at module load time (lines 80, 82). If `pushService.js` tried to `require('../motokey-api')` to reuse that validator, it would create a circular require (`motokey-api.js` → `pushService.js` → `motokey-api.js`), which in CommonJS silently returns a partially-initialized (likely empty) exports object and is a well-known source of hard-to-debug bugs.
**Correct alternative:** `expo-server-sdk` ships its own equivalent static validator, `Expo.isExpoPushToken(token)`, functionally equivalent to the hand-rolled one in `motokey-api.js`. Use the SDK's own validator inside `pushService.js`; leave `motokey-api.js`'s existing `isExpoPushToken()` untouched (it's still used correctly by the Phase 12 `/client/device-tokens` endpoints and should not be touched per CLAUDE.md's "no unnecessary rewrite" discipline).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Sending push notifications to Expo, batching, retries | Raw `fetch`/`https` calls to `exp.host` with manual chunking/backoff | `expo-server-sdk`'s `sendPushNotificationsAsync` + `chunkPushNotifications` | SDK already handles the 100-per-request cap, concurrency limiting (max 6 connections), and retry/backoff — reinventing this is pure risk for zero benefit at Phase 13's manual-test volume |
| Expo push token shape validation | A second hand-rolled regex duplicating `motokey-api.js`'s `isExpoPushToken` | `Expo.isExpoPushToken(token)` from the SDK | Avoids maintaining two divergent copies of the same validation logic; also sidesteps the circular-require trap described above |
| Idempotency/dedup guard | A custom "check-then-insert" two-step (race-condition prone) or an in-memory `Set`/`Map` | DB `UNIQUE` constraint + insert-first-catch-duplicate, exactly like `billing_events`/`stripeService.handleWebhookEvent` | Already proven correct and race-safe in this codebase for the exact same problem shape (idempotent processing keyed by an explicit external string) |

**Key insight:** Every piece of this phase already has a working, in-repo precedent (`emailService.js` for the enabled/fallback shape, `stripeService.js`+`billing_events` for the idempotency shape). The only genuinely new piece of engineering is wiring the Expo SDK itself — everything else is direct structural reuse.

## Common Pitfalls

### Pitfall 1: Confusing ticket-level errors with receipt-level errors
**What goes wrong:** Assuming `DeviceNotRegistered` (or other delivery errors) will always appear immediately in the response from `sendPushNotificationsAsync`.
**Why it happens:** Expo's push flow has two distinct error surfaces: (1) **tickets**, returned synchronously from the send call, which report request-level problems (malformed token, message too big, immediate rejections); and (2) **receipts**, fetched later via `getPushNotificationReceiptsAsync` (Expo recommends waiting ~15 minutes), which report actual delivery outcomes from APNs/FCM — this is where `DeviceNotRegistered` for a token that *was* valid but has since been uninstalled typically surfaces.
**How to avoid:** For Phase 13, only handle **ticket-level** errors (`ticket.status === 'error'` in the immediate response) to satisfy success criterion 4 ("token invalide/expiré... journalisé"). Do not build a receipt-polling mechanism in this phase — D-03 already defers all receipt-based dead-token handling to Phase 16, where real volume justifies the added complexity of a delayed check.
**Warning signs:** If the plan includes a cron/setTimeout to call `getPushNotificationReceiptsAsync` 15 minutes after sending, that is over-scoping into Phase 16's territory.

### Pitfall 2: Node version mismatch on Railway
**What goes wrong:** `expo-server-sdk@6.1.0` requires Node `>=20` (confirmed via `npm view expo-server-sdk engines`). `package.json` has no `engines` field pinning a Node version, so Railway's Nixpacks builder auto-detects a Node version by its own defaults/heuristics — this has not been directly verified for this Railway project.
**Why it happens:** Without an explicit `engines` field, different Railway deploys or Nixpacks version bumps could theoretically select an older Node than what the local dev machine runs (confirmed locally: v24.14.1).
**How to avoid:** Add `"engines": { "node": ">=20" }` to `package.json` as part of this phase's changes, and/or verify the actual Node version Railway uses at build time via the deploy logs before considering the phase done.
**Confidence:** MEDIUM — the requirement itself (Node >=20) is HIGH confidence (from npm registry metadata), but Railway's actual runtime Node version for this specific project was not directly inspected (no `railway.json`/`railway.toml`/`.nvmrc` found in the repo to pin it).

### Pitfall 3: FCM HTTP v1 migration affects Android delivery, not this phase's code
**What goes wrong:** A manual test push targeting a real Android device could fail to actually arrive even if `pushService.js` code is fully correct, because Google deprecated the legacy FCM protocol in favor of FCM HTTP v1 (OAuth + Firebase service account), and Expo's own infrastructure now requires a Firebase service account key configured at the **Expo/EAS project level** (not something this backend service controls) for Android push delivery to work.
**Why it happens:** This is an app-level/EAS-project configuration concern (mobile app phases 14+), completely orthogonal to `services/pushService.js`'s correctness.
**How to avoid:** For Phase 13's manual smoke test, prefer testing against an iOS device/Expo Go token if possible, or be aware that an Android delivery failure during manual testing may indicate missing EAS/Firebase configuration rather than a bug in `pushService.js`. Document this distinction in the phase's manual test notes so it isn't mistaken for a code defect.
**Confidence:** MEDIUM — sourced from WebSearch (Expo docs + third-party 2026 guide), not independently cross-verified against Expo's own migration changelog page directly, but the underlying FCM v1 mandate itself is a well-documented, widely reported Google/Firebase platform change.

### Pitfall 4: Insert-first idempotency guard means a failed send still "consumes" the key
**What goes wrong:** Following the `billing_events` pattern exactly means the idempotency row is inserted **before** the actual Expo API call. If the Expo call then fails (network error, Expo outage), the idempotency key is already marked "sent" — a genuine retry with the same key would be silently skipped.
**Why it happens:** This is the same tradeoff already accepted by `stripeService.handleWebhookEvent` for Stripe webhooks — it favors "never double-send" over "guarantee eventual delivery."
**How to avoid:** This is a deliberate, already-accepted tradeoff in this codebase (not a new risk introduced by Phase 13) — no action needed beyond being aware of it. If a caller needs to retry after a genuine failure, they must supply a new idempotency key, not reuse the old one. Worth a one-line code comment in `pushService.js` referencing this behavior explicitly, since it's not obvious from D-01/D-02 alone.

## Code Examples

### Sending in chunks + collecting tickets (official SDK pattern)
```javascript
// Source: https://github.com/expo/expo-server-sdk-node (README, fetched 2026-07-02)
const chunks = expo.chunkPushNotifications(messages);
let tickets = [];
for (const chunk of chunks) {
  try {
    const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
    console.log('result of sending push messages to Expo:', ticketChunk);
    tickets.push(...ticketChunk);
  } catch (error) {
    console.error(error);
  }
}
```

### Checking receipts later (deferred to Phase 16 — documented here for forward reference only)
```javascript
// Source: https://github.com/expo/expo-server-sdk-node (README, fetched 2026-07-02)
const receiptIds = tickets.filter((ticket) => ticket.status === 'ok').map((ticket) => ticket.id);
const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);

for (let chunk of receiptIdChunks) {
  try {
    const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
    const failedReceipts = Object.values(receipts).filter((receipt) => receipt.status !== 'ok');
    failedReceipts.forEach(({ message, details }) => {
      console.error(`There was an error sending a notification: ${message}`);
    });
  } catch (error) {
    console.error(error);
  }
}
```

### Raw HTTP API shape (for reference only — SDK is the recommended path)
```
POST https://exp.host/--/api/v2/push/send
Content-Type: application/json

{
  "to": "ExponentPushToken[...]",
  "title": "string",
  "body": "string",
  "data": {},
  "sound": "default"
}
```
Batched form: `"to"` can be an array of up to 100 tokens per request, or the array of message objects itself can contain up to 100 entries.

Receipts endpoint:
```
POST https://exp.host/--/api/v2/push/getReceipts
{ "ids": ["ticket-id-1", "ticket-id-2"] }
```

### Existing device-tokens lookup pattern to reuse for `sendPush`'s fan-out (Phase 12)
```javascript
// Source: C:\motokey-api\motokey-api.js lines 1733-1736 (POST /client/device-tokens, read 2026-07-02)
const { data: deviceToken, error: dtErr } = await SBLayer.supabase
  .from('client_device_tokens')
  .upsert({ client_id: clientId, token, platform, last_used_at: nowISO() }, { onConflict: 'token' })
  .select().single();
```
`sendPush(clientId, ...)` should query analogously: `SBLayer.supabase.from('client_device_tokens').select('token').eq('client_id', clientId)` to get the fan-out list (table/columns confirmed via migration `16_client_device_tokens.sql`: `id`, `client_id`, `token`, `platform`, `last_used_at`, `created_at`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|----------------|--------|
| Legacy FCM protocol (server key) for Android push | FCM HTTP v1 API (OAuth + Firebase service account) | Google deprecated legacy protocol; Expo migrated accordingly (reported as of March 2026 docs) | Affects Android delivery configuration at the EAS/app project level, not this backend service's code — see Pitfall 3 |

**Deprecated/outdated:** None specific to `expo-server-sdk`'s Node API surface itself — the `Expo` class, `sendPushNotificationsAsync`, `chunkPushNotifications`, `getPushNotificationReceiptsAsync` are all current, stable APIs per the actively-maintained (last published 2026-06-01) package.

## Open Questions

1. **Does `EXPO_ACCESS_TOKEN` need to be configured for Phase 13's manual test to work?**
   - What we know: `accessToken` is an optional constructor parameter (`new Expo({ accessToken: ... })`). It is only *required* if "Enhanced Push Security" has been explicitly enabled on the Expo/EAS project dashboard for this app — in which case requests without a valid token fail with `UNAUTHORIZED`.
   - What's unclear: Whether Enhanced Push Security is (or will be, once the EAS project for the mobile app exists in Phase 14+) enabled for this specific project. As of Phase 13, no mobile app/EAS project exists yet per phase dependencies.
   - Recommendation: Support `EXPO_ACCESS_TOKEN` as an optional env var passed to the `Expo` constructor (matches the pattern already used for `RESEND_API_KEY`/`STRIPE_SECRET_KEY` — read from env, works if absent for now). Leave it unset until Phase 14+ if/when an EAS project with Enhanced Push Security is created.

2. **Should `push_send_log` store `token` as well as `client_id`, or just the idempotency key?**
   - What we know: D-02 locks the idempotency key as the caller-supplied string. CONTEXT.md's `## Claude's Discretion` explicitly leaves extra columns (`client_id`, `token`) up to the planner, "for debugging."
   - What's unclear: No strong signal either way from existing precedent — `billing_events` stores `garage_id` + full `payload` JSONB for audit purposes, suggesting the same debugging philosophy applies here.
   - Recommendation: Mirror `billing_events`'s spirit — store `idempotency_key` (UNIQUE, NOT NULL), `client_id` (nullable UUID, `REFERENCES clients(id) ON DELETE SET NULL` — nullable because `sendToToken` manual tests won't have a `client_id`), `token` (nullable TEXT, useful for debugging which device received it), `sent_at` (TIMESTAMPTZ DEFAULT now()).

3. **Should the phase implement any receipt-checking at all, even minimally?**
   - What we know: D-03 explicitly defers "proactive deactivation of dead tokens... to Phase 16, where real send volume and Expo's receipt-checking flow will actually be exercised."
   - What's unclear: Whether "Expo's receipt-checking flow" wording implies Phase 13 should still call `getPushNotificationReceiptsAsync` and merely log (not deactivate), vs. not touching receipts at all.
   - Recommendation: Skip receipt-checking entirely in Phase 13. Success criterion 4 ("token invalide/expiré... journalisé") is fully satisfiable via ticket-level errors alone (many invalid/malformed tokens are rejected immediately at the ticket level, before ever reaching APNs/FCM). Implementing receipt polling would require either a blocking 15-minute wait in the manual test script (bad UX for a smoke test) or a deferred job (out of scope, explicitly Phase 16's job per D-03's own wording).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|-----------|
| `expo-server-sdk` (npm package) | Sending real pushes | Not yet installed | 6.1.0 latest on registry | `npm install expo-server-sdk` before implementation |
| Node.js runtime | `expo-server-sdk` requires `>=20` | Yes (local) | v24.14.1 (local dev) | Railway's actual deploy-time Node version unverified — see Pitfall 2 |
| Real Expo push token (physical device) | Manual smoke test (success criterion 1) | Not available in this research session (no mobile app/device yet — Phase 14+ builds the app) | — | Human (Mehdi) must supply a real Expo push token from a personal device running Expo Go or a dev build, at execution time |
| `EXPO_ACCESS_TOKEN` (optional) | Enhanced Push Security, if enabled on EAS project | Not applicable yet — no EAS project exists | — | Omit; unauthenticated sends work unless Enhanced Push Security is turned on later |

**Missing dependencies with no fallback:**
- A real Expo push token from a physical/emulated device is required to satisfy success criterion 1 ("délivre une notification visible sur un appareil de test") — this cannot be produced by Claude Code alone; it requires Mehdi to run Expo Go (or a dev build) on a device and supply the resulting token string to the manual test script at execution time.

**Missing dependencies with fallback:**
- `expo-server-sdk` itself — trivially installable via `npm install`, no blocker.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (no jest/mocha/vitest in this repo) — plain Node scripts using `http.request` (for HTTP endpoint tests) or direct `require()` (for one-off service scripts) |
| Config file | none |
| Quick run command | `node scripts/test-push.js <expo-token>` (proposed — see Architecture Patterns) |
| Full suite command | No aggregate test runner exists; `package.json`'s `"test"` script points to `test-api.js` (root), unrelated to push. No change recommended for this phase. |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|---------------|
| SC-1 | `sendToToken` delivers a real notification to a physical device | manual (requires human + physical device) | `node scripts/test-push.js <real-expo-token>` | ❌ Wave 0 |
| SC-2 | `PUSH_ENABLED=false` → console.log fallback, no throw | unit/smoke (no external dependency) | `PUSH_ENABLED=false node scripts/test-push.js <any-token>` or a small standalone assertion script | ❌ Wave 0 |
| SC-3 | Same idempotency key twice → only one send attempt | integration (needs `push_send_log` table + Supabase reachable) | `node scripts/test-push-idempotency.js` (proposed) or inline assertions in `test-push.js` calling `sendToToken` twice with the same key and asserting only one `expo.sendPushNotificationsAsync` call occurred | ❌ Wave 0 |
| SC-4 | Invalid token logged, process survives | unit (no external dependency — can use an obviously malformed string) | `node scripts/test-push.js not-a-real-token` (expect log, exit 0) | ❌ Wave 0 |

Note: Given no existing automated test framework in this repo, and given the phase's own success criteria are phrased as "invoked manually," it is reasonable and consistent with project convention (see `tests/test-client-device-tokens.js`, also a manually-run plain-Node script) for these to remain manually-invoked scripts rather than a CI-integrated suite. This matches the project's established testing style — do not introduce jest/mocha as new infrastructure for this one phase.

### Sampling Rate
- **Per task commit:** Manually run `node scripts/test-push.js` (or equivalent) against `PUSH_ENABLED=false` first (no external calls, fast, verifies the fallback path and idempotency-guard DB writes)
- **Per wave merge:** Manual run with `PUSH_ENABLED=true` and a real token, once available, to verify criterion 1 end-to-end
- **Phase gate:** All 4 success criteria manually verified and reported before `/gsd:verify-work` per CLAUDE.md's "rapport obligatoire avant push" convention (user memory: report results and await explicit GO before `git push`)

### Wave 0 Gaps
- [ ] `sql/migrations/17_push_send_log.sql` — new idempotency table, must exist before any send-path code can be tested against real Supabase
- [ ] `scripts/test-push.js` (or equivalent) — no existing manual-invocation harness for a service module (as opposed to an HTTP endpoint) exists yet; closest precedent is `scripts/stripe-create-pioneer-coupon.js` (direct `require`, `.env` loaded via `require('dotenv').config({ path: ... })`, `process.exit(1)` on missing config)
- [ ] `PushSendLog` helper in `supabase.js` (mirrors `BillingEvents`) — does not exist yet

## Sources

### Primary (HIGH confidence)
- Direct file reads, 2026-07-02: `C:\motokey-api\services\emailService.js` (full file), `C:\motokey-api\services\stripeService.js` (lines 1-40, 245-280, 365), `C:\motokey-api\supabase.js` (lines 1-50, 1420-1463), `C:\motokey-api\motokey-api.js` (lines 175-200, 1700-1780), `C:\motokey-api\sql\migrations\15_billing_foundation.sql`, `C:\motokey-api\sql\migrations\16_client_device_tokens.sql`, `C:\motokey-api\package.json`, `C:\motokey-api\tests\test-client-device-tokens.js`, `C:\motokey-api\scripts\stripe-create-pioneer-coupon.js`
- `npm view expo-server-sdk version` / `engines` / `dependencies` / `time.modified` — direct npm registry query, 2026-07-02
- `git log` / `git show` on commits `3e07a41`, `7bb415c`, `da94350`, `d8e19e8`, `3c83470` — Phase 12 implementation history

### Secondary (MEDIUM confidence)
- [expo-server-sdk-node GitHub README](https://github.com/expo/expo-server-sdk-node) — via WebFetch, code examples for `chunkPushNotifications`/`sendPushNotificationsAsync`/`getPushNotificationReceiptsAsync`/ticket-vs-receipt error shape
- [Expo: Send notifications with the Expo Push Service](https://docs.expo.dev/push-notifications/sending-notifications/) — via WebFetch, raw HTTP API shape, error codes (`DeviceNotRegistered`, `MessageTooBig`, `MessageRateExceeded`, etc.), rate limits (600/sec/project, 100/request cap), receipt-check timing recommendation (~15 min)

### Tertiary (LOW confidence — flagged for validation)
- FCM HTTP v1 migration mandate for Android (via WebSearch summary of "The Ultimate Guide to Expo Push Notifications and Firebase Cloud Messaging (FCM) on Android 2026" and Expo's own push-notifications-setup docs) — not independently cross-checked against Expo's official changelog page directly; treat as directionally correct but re-verify if Android delivery testing is attempted in this phase
- `EXPO_ACCESS_TOKEN`/"Enhanced Push Security" behavior — sourced from WebSearch summary of Expo docs + third-party integration guide (docs.engage.so), not the primary Expo docs page itself

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — package version/engines/dependencies verified directly against npm registry; API shape corroborated by two independent fetches of official/README sources
- Architecture: HIGH — every pattern recommended is a direct, verbatim precedent already present and working in this exact codebase (`emailService.js`, `stripeService.js`, `supabase.js`, `motokey-api.js`)
- Pitfalls: MEDIUM — the Node-version-on-Railway pitfall and the FCM v1/Android pitfall are plausible and evidence-based but not fully verified against this project's actual Railway runtime or EAS project (which doesn't exist yet)

**Research date:** 2026-07-02
**Valid until:** 30 days for the architecture/pattern findings (stable, based on this repo's own code); 14 days for the `expo-server-sdk` version pin specifically (fast-moving package, re-check `npm view expo-server-sdk version` at plan/execution time if more than 2 weeks have passed)
