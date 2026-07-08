---
phase: 12-backend-push-foundation
plan: 01
subsystem: database
tags: [supabase, postgresql, migration, node-http, smoke-test, expo-push]

# Dependency graph
requires: []
provides:
  - "sql/migrations/16_client_device_tokens.sql — client_device_tokens table DDL (client_id FK CASCADE, UNIQUE(token), platform CHECK, index)"
  - "tests/test-client-device-tokens.js — Node smoke-test script exercising GET /client/me and POST/DELETE /client/device-tokens (verification target for plan 12-02)"
affects: [12-02-endpoints]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration file convention: numbered header comment, Supabase Dashboard manual-apply note, CHECK constraint mirrors garage_users.role style, single-column index on the FK"
    - "Smoke-test convention: plain http.request req(method,path,body,token) helper, test(nom,ok,detail) pass/fail counter, setTimeout(run,300) bootstrap — matches test-api.js exactly"

key-files:
  created:
    - sql/migrations/16_client_device_tokens.sql
    - tests/test-client-device-tokens.js
  modified: []

key-decisions:
  - "client_id FK (not auth_user_id) per CONTEXT.md D-01 — multi-device support, one row per active device"
  - "UNIQUE(token) alone (not composite) — required for D-02 upsert-reassign via onConflict:'token' in plan 12-02"
  - "No RLS policy added — SBLayer.supabase (service-role) bypasses RLS, no anon/authenticated path queries this table"

patterns-established:
  - "Migration 16 numbering continues the sql/migrations/ sequence (last was 15_billing_foundation.sql)"

requirements-completed: [MPUSH-02]

# Metrics
duration: 8min
completed: 2026-07-01
---

# Phase 12 Plan 01: Backend Push Foundation — Data + Test Harness Summary

**Migration 16 (client_device_tokens table, client_id FK + UNIQUE(token) upsert-reassign design) plus a hand-rolled Node smoke-test script targeting the not-yet-built /client/device-tokens and /client/me endpoints.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-01T13:46:09Z
- **Completed:** 2026-07-01T13:53:58Z
- **Tasks:** 2 completed
- **Files modified:** 2 (both new files)

## Accomplishments
- Created `sql/migrations/16_client_device_tokens.sql` defining `client_device_tokens` with `client_id` FK to `clients(id) ON DELETE CASCADE`, `UNIQUE(token)` alone (enables D-02 upsert-reassign), `platform` CHECK constraint (`ios`/`android`), and an index on `client_id`.
- Created `tests/test-client-device-tokens.js`, a Node smoke-test script modeled exactly on `test-api.js`'s `http.request` helper/`test()` counter/`setTimeout(run,300)` bootstrap, covering all 4 phase success criteria (register 201, validation-reject 400, unregister 200, gone 404, auth-reject 401) plus a `GET /client/me` shape check.
- No edit was made to `motokey-api.js` or `supabase.js` in this plan — endpoint implementation is reserved for plan 12-02 (wave 2).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create migration 16 for client_device_tokens table** - `7bb415c` (feat)
2. **Task 2: Create the client-device-tokens smoke-test script** - `3e07a41` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `sql/migrations/16_client_device_tokens.sql` - New table DDL for Expo push device tokens, keyed on `client_id`, unique on `token`, CASCADE delete, platform CHECK, client index
- `tests/test-client-device-tokens.js` - Smoke-test script: logs in as `sophie@email.com` (CLIENT), asserts `GET /client/me` payload shape, then register/validate/unregister/gone/no-auth flows against `/client/device-tokens`

## Decisions Made
- Followed CONTEXT.md D-01/D-02 exactly (client_id FK, UNIQUE(token) alone) per plan instructions — no deviation from the verbatim migration draft in 12-RESEARCH.md.
- `platform` made a required column (`NOT NULL CHECK`) rather than optional, per RESEARCH.md's Open Question recommendation (cheap to require, useful for Phase 13/17 diagnostics).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Both tasks matched their acceptance criteria on first pass; no auto-fixes were needed.

## User Setup Required

**External service (Supabase) requires manual configuration before plan 12-02 can be curl-tested end-to-end:**
- Apply `sql/migrations/16_client_device_tokens.sql` via Supabase Dashboard -> SQL Editor (project `rzbqbaccjyxvtlnfitrr`). This repo has no automated migration runner; DDL is applied manually, same convention as migrations 10-15.
- This step is not required to complete plan 12-01 itself (the migration file and test script exist and are verified independently of a live DB), but it IS a prerequisite for plan 12-02's endpoint work and for `tests/test-client-device-tokens.js` to pass against a live server.

## Next Phase Readiness
- Plan 12-02 can now implement `POST /client/device-tokens`, `DELETE /client/device-tokens`, and `GET /client/me` in `motokey-api.js` against the `client_device_tokens` schema defined here, following the exact `onConflict:'token'` upsert pattern documented in 12-RESEARCH.md.
- `tests/test-client-device-tokens.js` is ready as 12-02's automated verification target — it is EXPECTED to fail (endpoints don't exist yet, migration not yet applied to any live DB) until 12-02 lands and migration 16 is applied via the Supabase Dashboard.
- No blockers for 12-02: the shared-dispatcher DELETE-body-parsing change flagged in 12-RESEARCH.md (Pitfall 2) is explicitly out of scope for this plan and remains 12-02's responsibility.

---
*Phase: 12-backend-push-foundation*
*Completed: 2026-07-01*

## Self-Check: PASSED

- FOUND: sql/migrations/16_client_device_tokens.sql
- FOUND: tests/test-client-device-tokens.js
- FOUND: commit 7bb415c
- FOUND: commit 3e07a41
