---
phase: 12-backend-push-foundation
plan: 02
subsystem: api
tags: [expo-push, rbac, supabase, client-auth, node-http]

# Dependency graph
requires:
  - phase: 12-backend-push-foundation (plan 01)
    provides: "sql/migrations/16_client_device_tokens.sql schema, tests/test-client-device-tokens.js smoke-test harness"
provides:
  - "isExpoPushToken() helper in motokey-api.js — validates ExponentPushToken[...]/ExpoPushToken[...] and raw UUID formats"
  - "POST /client/device-tokens — upsert (onConflict:'token') device token registration for authenticated CLIENT"
  - "DELETE /client/device-tokens — targeted single-token deletion scoped by token + client_id"
  - "GET /client/me — authenticated CLIENT profile (id/nom/email/tel/garage_id/garage_nom/client_depuis), fills the /auth/me gap"
affects: [13-push-dispatch-service, 16-push-wiring-end-to-end]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Expo push token format validation via isExpoPushToken() — accepts bracketed Expo formats and raw UUID"
    - "Upsert-reassign via onConflict:'token' — resubmitting an existing token under a new client_id reassigns ownership (CONTEXT.md D-02)"
    - "Local body(req) read inside DELETE handler (matches DELETE /client/garages/:id precedent) instead of widening the shared ['POST','PUT','PATCH'] dispatch whitelist"

key-files:
  created: []
  modified:
    - motokey-api.js

key-decisions:
  - "Task 4 (live automated smoke test) was explicitly SKIPPED per user decision at the checkpoint — see 'Task 4 Status' section below for full honesty on what was and wasn't verified."
  - "Migration 16 (sql/migrations/16_client_device_tokens.sql) is confirmed NOT YET applied in the live Supabase project (rzbqbaccjyxvtlnfitrr) as of this plan's completion — this is an outstanding manual blocker for Mehdi, not a code issue."

patterns-established: []

requirements-completed: []  # MPUSH-02 intentionally NOT marked complete here — also requires Phase 16 end-to-end mobile wiring, consistent with how plan 12-01 handled it.

# Metrics
duration: ~25min (across two executor runs, including the checkpoint pause)
completed: 2026-07-01
---

# Phase 12 Plan 02: Backend Push Foundation — Endpoints Summary

**Three new `/client/*` endpoints (POST/DELETE device-tokens, GET me) added to `motokey-api.js` following the existing RBAC pattern; code manually verified against live Supabase but the automated smoke test was explicitly skipped by user decision, and migration 16 remains unapplied in production.**

## Performance

- **Duration:** ~25 min total across two executor runs (first run reached a human-action checkpoint at Task 4; this run closed it out per explicit user instruction)
- **Tasks:** 4 (3 code tasks fully done and verified; Task 4 code-complete but automated verification explicitly skipped by user)
- **Files modified:** 1 (`motokey-api.js`)

## Accomplishments
- Added `isExpoPushToken()` helper validating both bracketed Expo push token formats and raw UUID tokens.
- Added `POST /client/device-tokens` — RBAC-gated to CLIENT, validates token format + platform, upserts on `onConflict:'token'` (enables reassignment per CONTEXT.md D-02), returns 201.
- Added `DELETE /client/device-tokens` — reads token from body via a locally-called `body(req)` (matching the `DELETE /client/garages/:id` precedent, no change to the shared dispatch whitelist), scopes deletion by both `token` and `client_id`, returns 200/404.
- Added `GET /client/me` — returns id/nom/email/tel/garage_id/garage_nom/client_depuis from real `clients` table columns (no `prenom`/`telephone`, which don't exist), null-safe on the `garages` embed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add isExpoPushToken() helper + POST /client/device-tokens** - `da94350` (feat)
2. **Task 2: Add DELETE /client/device-tokens** - `d8e19e8` (feat)
3. **Task 3: Add GET /client/me** - `3c83470` (feat)
4. **Task 4: Live verification** - no code commit (verification-only task; see status below)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `motokey-api.js` - Added `isExpoPushToken()` helper + 3 new RBAC-gated `/client/*` route handlers (POST/DELETE device-tokens, GET me)

## Decisions Made
- Followed the plan's exact code blocks verbatim for all 3 route handlers — no deviation in Tasks 1-3.
- `onConflict: 'token'` kept exactly as specified (not widened to a composite key) — required for the upsert-reassign semantic (CONTEXT.md D-02).
- Task 4's automated live smoke test was **skipped by explicit user decision** at the checkpoint, rather than re-attempted. See "Task 4 Status" below.

## Task 4 Status — Honest Accounting (READ THIS BEFORE ASSUMING SC1-4 ARE FULLY PROVEN)

**What was asked:** Start a local server, run `tests/test-client-device-tokens.js` end-to-end, and confirm `🎉 Tout fonctionne !` with 0 failures — the automated proof of all 4 ROADMAP Phase 12 success criteria.

**What actually happened (previous executor run, before this continuation):**
Two blockers prevented that automated run from completing:
1. **Migration 16 not confirmed applied** in the live Supabase project (`rzbqbaccjyxvtlnfitrr`) at the time — the `client_device_tokens` table did not exist yet against that project.
2. **`tests/test-client-device-tokens.js`'s login fixture is broken** — it logs in as `sophie@email.com` / `client123`, which returns `401 INVALID_CREDENTIALS`. This is confirmed **pre-existing and unrelated to this plan's code**: it also breaks `test-api.js` and other pre-existing test scripts that use the same fixture. Not caused by Tasks 1-3.

**What the previous executor did instead (manual, out-of-band verification):**
Registered a disposable test client via `POST /auth/client/register` directly against live Supabase, obtained a real access token, and hit the new endpoints directly:
- `GET /client/me` -> **200**, correct shape (id, nom, email, tel, garage_id, garage_nom, client_depuis) — confirmed working end-to-end against live Supabase.
- `POST /client/device-tokens` with an invalid token -> **400 VALIDATION_ERROR** — confirmed.
- `POST /client/device-tokens` with a valid token -> **500 DB_ERROR** `"Could not find the table 'public.client_device_tokens'"` — this is the *expected* failure mode confirming migration 16 was not yet applied; it is not a code bug in Tasks 1-3.
- `POST /client/device-tokens` with no `Authorization` header -> **401 UNAUTHORIZED** — confirmed.
- The disposable test client was cleaned up afterward.

**This continuation run:** Per the user's explicit instruction ("Sauter la vérification live, marquer la plan complète"), no further server start or test run was attempted. Task 4 is being closed out based on the manual verification above, accepted by the user as sufficient evidence that the Task 1-3 code is correct.

**What is NOT verified as of this SUMMARY:**
- The full automated `tests/test-client-device-tokens.js` run has never completed successfully end-to-end.
- The device-token endpoints (`POST`/`DELETE /client/device-tokens`) have never been exercised against a Supabase project where migration 16 is actually applied — only the 400/401 paths and the expected "table not found" 500 have been confirmed. The happy-path 201/200 behavior for these two endpoints is **code-reviewed and pattern-consistent with `POST /client/motos`**, but not live-tested.
- `GET /client/me` IS confirmed working end-to-end against live Supabase (200 with correct shape) — this one is fully proven.

**Bottom line on ROADMAP Phase 12 success criteria:**
- SC3 (`GET /client/me`) — **verified live, fully proven.**
- SC1 (`POST /client/device-tokens` creates a row), SC2 (`DELETE /client/device-tokens` removes it) — **code-reviewed and pattern-matched, 400/401 paths live-confirmed, but the actual DB write/delete path is unverified pending migration 16 application.**
- SC4 (401 on unauthenticated device-token calls) — **verified live, fully proven.**

## Deviations from Plan

None in Tasks 1-3 — both prior executor runs implemented the plan's code blocks exactly as written, verified via `node --check` and all grep-based acceptance criteria.

Task 4 deviates from the plan's literal instruction (run the automated smoke test to completion) by user's explicit direction to skip it and accept the manual verification instead. This is not a Rule 1-4 deviation (no code change) — it is a scope/verification-depth decision made by the user at a checkpoint, documented here rather than silently marked as a full pass.

## Issues Encountered
- **Pre-existing, out of scope:** `sophie@email.com` / `client123` login fixture used by `tests/test-client-device-tokens.js` (and `test-api.js`) returns `401 INVALID_CREDENTIALS`. This is unrelated to Phase 12 — flagging for Mehdi to investigate separately, not fixed here per explicit instruction not to touch it in this plan's scope.
- **Outstanding blocker:** `sql/migrations/16_client_device_tokens.sql` has not been confirmed applied in the live Supabase project (`rzbqbaccjyxvtlnfitrr`). Until it is applied via Supabase Dashboard -> SQL Editor, `POST`/`DELETE /client/device-tokens` will return `500 DB_ERROR "relation does not exist"` in production even though the code is correct.

## User Setup Required

**Outstanding manual step (blocker, not yet resolved):**
- Apply `sql/migrations/16_client_device_tokens.sql` in Supabase Dashboard -> SQL Editor, project `rzbqbaccjyxvtlnfitrr`. Until this is done, the two device-token endpoints will fail with `500 DB_ERROR` in production despite correct code.
- Separately (not blocking, lower priority): investigate why `sophie@email.com` / `client123` returns `401 INVALID_CREDENTIALS` — this breaks multiple pre-existing test scripts unrelated to this plan.

## Next Phase Readiness
- Code for all 3 Phase 12 endpoints is complete and pattern-consistent with the rest of `motokey-api.js`'s `/client/*` routes.
- Phase 13 (Push Dispatch Service) can proceed independently — it does not require migration 16 to be applied to build/test `services/pushService.js` in isolation, though it will eventually need real device tokens (from this plan's endpoints) to send to.
- **Before Phase 12 can be considered fully production-ready**, Mehdi must apply migration 16 in the Supabase Dashboard and ideally re-run `tests/test-client-device-tokens.js` (after also fixing or bypassing the broken `sophie@email.com` login fixture) to get a true end-to-end automated pass.
- MPUSH-02 is intentionally left **not fully complete** in REQUIREMENTS.md — it also requires Phase 16 (end-to-end mobile wiring: login/logout token registration from the actual RN app), consistent with how plan 12-01's executor handled the same requirement.

---
*Phase: 12-backend-push-foundation*
*Completed: 2026-07-01*

## Self-Check: PASSED

- FOUND: commit da94350
- FOUND: commit d8e19e8
- FOUND: commit 3c83470
- FOUND: motokey-api.js (contains isExpoPushToken, POST/DELETE /client/device-tokens, GET /client/me)
