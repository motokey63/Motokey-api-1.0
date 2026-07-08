---
phase: 13-push-dispatch-service
verified: 2026-07-02T17:00:00Z
status: human_needed
score: 3/4 must-haves verified (SC-1 explicitly deferred, not a gap)
human_verification:
  - test: "Real-device push delivery (SC-1)"
    expected: "Running `PUSH_ENABLED=true node scripts/test-push.js <real-ExponentPushToken>` (token from a device running Expo Go) shows a visible 'MotoKey — test push' notification banner on the device."
    why_human: "Requires a physical/emulated device running Expo Go to generate a real ExponentPushToken. No mobile app exists yet (Phase 14+ builds it) — this is the plan's own documented allowed deferral, not a missing implementation. The code path (sendToToken → Expo.isExpoPushToken → chunkPushNotifications → sendPushNotificationsAsync) is present and structurally correct; only live delivery confirmation is outstanding."
---

# Phase 13: Push Dispatch Service Verification Report

**Phase Goal:** Un service d'envoi de notifications push existe côté backend, testable manuellement avant même que l'app mobile ou un compte provider push soient prêts.
**Verified:** 2026-07-02T17:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Phase 13's own SC-1..SC-4, from ROADMAP.md)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | `services/pushService.js` exposes a send function that, invoked manually with a real Expo token, delivers a visible notification on a test device | ? DEFERRED (not FAILED) | No Expo Go / mobile device token exists yet (mobile app is Phase 14+). Code path exists and is structurally sound (`Expo.isExpoPushToken` → `chunkPushNotifications` → `sendPushNotificationsAsync`, ticket-level error handling present). Explicitly deferred per 13-02-PLAN.md's own `<done>` clause ("...OR explicitly deferred if no device token available yet") and confirmed approved by Mehdi at the Task 3 checkpoint. Routed to human_verification below rather than counted as a gap. |
| SC-2 | With `PUSH_ENABLED=false`, sends fall through to `console.log` and never throw | ✓ VERIFIED | Independently re-ran `PUSH_ENABLED=false node scripts/test-push.js "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"` — logged the DEV block (`🔔 [13][DEV] ─── Push "MotoKey — test push" ───`) and returned `{ dev: true }` before `process.exit(0)`. Note: shell reported `exit=127` — this is the pre-existing, documented Windows-only libuv teardown crash (`UV_HANDLE_CLOSING` assertion, see Anti-Patterns/Known Issues below), occurring AFTER the script's own logic completed correctly and `process.exit(0)` was called. Confirmed reproducible with pre-existing Phase 9 code too; will not occur on Railway (Linux). Logical behavior of SC-2 is correct. |
| SC-3 | Re-invoking with the same idempotency key does not trigger a second notification | ✓ VERIFIED | Code inspection confirms insert-first guard (`SBLayer.PushSendLog.insert` before send, catch on `23505`/`duplicate`/`unique` → `{ skipped: 'duplicate' }`, never re-enters send path). Live confirmation reported in 13-02-SUMMARY.md: first invocation with a fresh `--idempotency-key` proceeded and inserted a `push_send_log` row against the real Supabase project (`rzbqbaccjyxvtlnfitrr`); second invocation with the identical key hit the UNIQUE constraint and returned `{ skipped: 'duplicate' }` without re-entering the send path. Not independently re-run in this verification pass (would require a fresh idempotency key + live network call to avoid polluting production `push_send_log` with test rows), but code logic + prior live confirmation are consistent and sufficient. |
| SC-4 | An invalid/expired token is logged and the process does not crash | ✓ VERIFIED | Independently re-ran `PUSH_ENABLED=false node scripts/test-push.js not-a-real-token` → logged `⚠️  [13] Token push invalide, ignoré: not-a-real-token`, returned `{ skipped: 'invalid-token' }`, **exit=0** (clean — no DB write occurs on this path since validation happens before `PushSendLog.insert`, so the Windows libuv crash does not trigger here). Confirms SC-4 end-to-end. |

**Score:** 3/4 truths automatically verified; 1/4 (SC-1) explicitly and legitimately deferred pending a real device, per the plan's own documented allowed resolution.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | `expo-server-sdk` dependency + `engines.node >=20` | ✓ VERIFIED | `"expo-server-sdk": "^6.1.0"` in `dependencies` (line 18); `"engines": { "node": ">=20" }` (lines 11-13); confirmed installed at `node_modules/expo-server-sdk` (resolved 6.1.0 per package-lock.json); pre-existing `"test": "node test-api.js"` script untouched. |
| `sql/migrations/17_push_send_log.sql` | `push_send_log` table with UNIQUE `idempotency_key` | ✓ VERIFIED | `CREATE TABLE push_send_log` present, `idempotency_key TEXT NOT NULL UNIQUE`. Documented drift: `client_id` FK to `clients(id)` was dropped (plain nullable UUID) after it broke the live `ALTER TABLE` apply — reconciled with an explanatory SQL comment directly in the file, matches what's live per 13-02-SUMMARY.md. Applied to live Supabase project `rzbqbaccjyxvtlnfitrr` (per SUMMARY; not independently re-queried against Supabase in this pass, but consistent with SC-3's live test outcome which required the table to exist). |
| `supabase.js` `PushSendLog` helper | `insert(idempotency_key, client_id, token)` mirroring `BillingEvents` | ✓ VERIFIED | Defined at line 1441, immediately after `BillingEvents` (line ~1436), exact mirrored shape (`.from('push_send_log').insert(...).select().single()`, throws on error). Exported in `module.exports` (line 1477). `node --check supabase.js` — implicit pass (module loads without error via requires above). |
| `scripts/test-push.js` | Standalone manual harness calling `sendToToken`/`sendPush` | ✓ VERIFIED | Exists, `node --check` passes, loads `.env` via `dotenv` + `path.resolve(__dirname, '../.env')`, parses `<token>` positional + `--idempotency-key`/`--client-id` flags, requires `../services/pushService`, never exits non-zero on handled errors (`process.exit(0)` in both success and catch paths). No `require('../motokey-api')` (0 matches). |
| `services/pushService.js` | `sendToToken` + `sendPush`, idempotency guard, Expo/console fallback | ✓ VERIFIED | 119 lines (>60 min_lines). `node --check` passes. Both functions exported (`module.exports = { sendToToken, sendPush }`, confirmed via `require()` + `typeof` check). Token validated via `Expo.isExpoPushToken` before any DB write. Idempotency guard present (`PushSendLog.insert`, catches `23505`/`duplicate`/`unique`). Sends via `expoClient.sendPushNotificationsAsync` when enabled, else DEV console.log block. No receipt polling (`getPushNotificationReceiptsAsync`: 0 matches). No circular require of `motokey-api.js` (0 matches). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `supabase.js` `PushSendLog` | `push_send_log` table | `.from('push_send_log').insert(...)` | ✓ WIRED | 1 match (`from('push_send_log')`) in supabase.js, inside `PushSendLog.insert`. |
| `scripts/test-push.js` | `services/pushService.js` | `require('../services/pushService')` + call | ✓ WIRED | Direct require + conditional call to `sendPush`/`sendToToken` based on `--client-id` flag presence; result logged. |
| `services/pushService.js` | `supabase.js PushSendLog.insert` | insert-first idempotency guard | ✓ WIRED | `await SBLayer.PushSendLog.insert(idempotencyKey, payload.clientId \|\| null, token)` inside `sendToToken`, wrapped in try/catch distinguishing duplicate (23505) from other errors. |
| `services/pushService.js` | expo-server-sdk `Expo` client | `sendPushNotificationsAsync` | ✓ WIRED | `expoClient.chunkPushNotifications` + `expoClient.sendPushNotificationsAsync` called in a loop over chunks, with ticket-level error logging (no receipt polling, per RESEARCH scope). |
| `services/pushService.js sendPush` | `client_device_tokens` | `select('token').eq('client_id', clientId)` | ✓ WIRED | Present exactly as specified; error path returns `{ error }` (never throws), empty-result path returns `{ sent: 0 }`, fan-out loop calls `sendToToken` per row with `${idempotencyKey}::${row.token}` suffix. |
| `services/pushService.js` | Expo token validation | `Expo.isExpoPushToken` | ✓ WIRED | Called as the very first check inside `sendToToken`, before any DB write — confirmed by live SC-4 re-run in this verification pass. |

### Data-Flow Trace (Level 4)

Not fully applicable in the UI-rendering sense (this is a backend service, no rendered dynamic data), but the equivalent trace — does the idempotency guard write to and read from a real table rather than a stub — was checked:

| Artifact | Data Source | Produces Real Effect | Status |
|----------|-------------|----------------------|--------|
| `push_send_log` INSERT | Real Supabase table (migration 17, live) | Live SC-3 test in 13-02-SUMMARY.md shows first insert succeeds, second hits real UNIQUE constraint (23505) — confirms the table is live and enforcing the constraint, not a stub/mocked path | ✓ FLOWING |
| `client_device_tokens` SELECT (sendPush) | Real table (migration 16, Phase 12) | Not independently re-verified this pass (migration 16 apply status is a Phase 12 concern, tracked separately in STATE.md known gaps) — query code is correct (`select('token').eq('client_id', clientId)`), and Phase 13's scope (`sendToToken`/SC-1..4) does not depend on it | ✓ FLOWING (code-level); dependent on Phase 12 migration 16 being applied, out of Phase 13 scope |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| SC-4 invalid token | `PUSH_ENABLED=false node scripts/test-push.js not-a-real-token` | `{ skipped: 'invalid-token' }`, exit=0 | ✓ PASS |
| SC-2 fallback | `PUSH_ENABLED=false node scripts/test-push.js "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"` | DEV block logged correctly, `{ dev: true }` returned before exit; shell then reports exit=127 due to documented pre-existing Windows-only libuv teardown crash (occurs AFTER correct output, triggered because this path also calls `PushSendLog.insert` against live Supabase) | ✓ PASS (logic); ℹ️ known unrelated OS-level teardown noise |
| SC-3 idempotency | Not re-run live in this pass (would insert extra test rows into production `push_send_log`) | N/A | ? SKIP — relying on code inspection + prior live confirmation documented in 13-02-SUMMARY.md |
| Syntax validity | `node --check services/pushService.js && node --check scripts/test-push.js` | Both pass | ✓ PASS |

### Requirements Coverage

Phase 13 has no dedicated REQUIREMENTS.md IDs (by design — it is enabling infrastructure for MPUSH-03/04, per ROADMAP.md's own phase description). Cross-referenced `.planning/REQUIREMENTS.md`:

| Requirement | Phase Mapping in REQUIREMENTS.md | Status | Notes |
|-------------|-----------------------------------|--------|-------|
| MPUSH-01 | Phase 16 | Pending (unchanged) | Not touched by Phase 13 — correct, soft-ask UI is Phase 16 scope. |
| MPUSH-02 | Phase 12 (backend) / Phase 16 (end-to-end) | Pending (unchanged) | Backend half was Phase 12's scope (already delivered); Phase 13 does not claim it. |
| MPUSH-03 | Phase 16 | Pending (unchanged) | Correctly NOT marked complete by Phase 13 — Phase 13 only builds the send capability, not the devis-trigger wiring. |
| MPUSH-04 | Phase 17 | Pending (unchanged) | Correctly NOT marked complete — cron/trigger wiring is Phase 17 scope. |
| MPUSH-05 | Phase 16 | Pending (unchanged) | Deep-link navigation is Phase 16 scope, untouched. |

**No premature completion detected.** `.planning/REQUIREMENTS.md` still lists all five MPUSH-* items as `[ ]` (unchecked) and their phase-mapping table still points to Phases 12/16/16/17/16 respectively — none reassigned to or marked satisfied by Phase 13. This matches the phase's own frontmatter (`requirements: [SC-1, SC-2, SC-3, SC-4]` — these are Phase 13's own success-criteria labels, not REQUIREMENTS.md IDs) and the ROADMAP.md phase description ("aucun requirement dédié — infrastructure habilitante"). No orphaned requirements found for Phase 13.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| N/A | — | No TODO/FIXME/PLACEHOLDER/stub patterns found in `services/pushService.js` or `scripts/test-push.js` | — | — |
| (documented, not a code anti-pattern) | — | Windows-only Node 24 + `@supabase/supabase-js` libuv teardown crash (`UV_HANDLE_CLOSING` assertion) after any script that calls Supabase then `process.exit()` | ℹ️ Info | Confirmed pre-existing (reproduces with Phase 9 `BillingEvents.insert` code), Windows-dev-only, will not occur on Railway (Linux). Independently reproduced during this verification (SC-2 spot-check above). Correctly logged in `.planning/phases/13-push-dispatch-service/deferred-items.md` and STATE.md. Not a Phase 13 regression, no action required. |

### Human Verification Required

### 1. Real-device push delivery (SC-1)

**Test:** Obtain a real `ExponentPushToken[...]` from a device running Expo Go, then run `PUSH_ENABLED=true node scripts/test-push.js <real-token> --idempotency-key=<fresh-unique-value>`.
**Expected:** A visible "MotoKey — test push" notification banner appears on the device within a few seconds.
**Why human:** Requires a physical or emulated device with Expo Go installed to generate a real push token — no mobile app exists yet (Phase 14 builds it). This is not a code gap: the send path (`Expo.isExpoPushToken` validation → `chunkPushNotifications` → `sendPushNotificationsAsync` → ticket-level error logging) is implemented, structurally correct, and mirrors the RESEARCH-documented pattern. The plan's own `<done>` clause explicitly allows deferring SC-1 confirmation until a device token exists, and Mehdi approved this deferral at the Task 3 checkpoint (per 13-02-SUMMARY.md). Should be exercised opportunistically during Phase 14 (RN app scaffolding) or as a standalone manual check beforehand.

### Gaps Summary

No gaps requiring code changes were found. All four scaffolds from 13-01 (expo-server-sdk dependency, migration 17, `PushSendLog` helper, `scripts/test-push.js` harness) exist, are substantive, and are wired correctly. `services/pushService.js` from 13-02 exports both `sendToToken` and `sendPush`, implements the locked interface exactly as specified, and independently re-verified SC-2 and SC-4 behave correctly at the code level (SC-2's shell exit code is polluted by a pre-existing, documented, Windows-only, non-regressive teardown crash — not a logic defect). SC-3 was live-confirmed in the prior session per 13-02-SUMMARY.md and is consistent with the code's insert-first-then-catch-23505 guard; not re-run live in this pass to avoid writing extra test rows to the production `push_send_log` table. SC-1 is the only item not yet confirmed, and it is explicitly and legitimately deferred (no device token exists yet — expected until Phase 14's mobile app exists), per the plan's own documented allowed resolution and Mehdi's approval at the checkpoint. REQUIREMENTS.md cross-reference confirms MPUSH-01..05 remain correctly unclaimed by this phase — no premature completion. Phase 13's stated goal ("a push dispatch service exists backend-side, manually testable before the mobile app or a push provider account are ready") is achieved: the service is real, wired, idempotent, fails safe, and testable via `scripts/test-push.js` without any mobile app or provider account configured.

---

*Verified: 2026-07-02T17:00:00Z*
*Verifier: Claude (gsd-verifier)*
