---
status: partial
phase: 12-backend-push-foundation
source: [12-VERIFICATION.md]
started: 2026-07-01T00:00:00.000Z
updated: 2026-07-01T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live proof of SC1 (POST /client/device-tokens happy path)
expected: Apply `sql/migrations/16_client_device_tokens.sql` via Supabase Dashboard > SQL Editor (project rzbqbaccjyxvtlnfitrr), then `curl -X POST https://motokey11-production.up.railway.app/client/device-tokens` with a real CLIENT JWT and a valid Expo token body returns HTTP 201 with a `device_token` object containing the created/reassigned row.
result: [pending]

### 2. Live proof of SC2 (DELETE /client/device-tokens happy path)
expected: Immediately after test 1, `curl -X DELETE .../client/device-tokens` with the same token returns 200 `{deleted:true}`; repeating the same call returns 404.
result: [pending]

### 3. Fix or bypass the broken CLIENT login fixture and run the automated smoke test
expected: Resolve why `sophie@email.com`/`client123` returns `401 INVALID_CREDENTIALS` (pre-existing, unrelated to Phase 12 — also breaks `test-api.js`), then run `node tests/test-client-device-tokens.js` against a locally started `node motokey-api.js` pointed at a Supabase project with migration 16 applied. Console should print `🎉 Tout fonctionne !` with 0 `❌` lines.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
