---
phase: 18-client-login-fixture-fix
verified: 2026-07-08T20:30:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 18: Client Login Fixture Fix Verification Report

**Phase Goal:** Developer/QA can log in as the CLIENT test fixture (sophie@email.com) and receive a valid session, mirroring the existing garage account creation pattern.
**Verified:** 2026-07-08T20:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Running setup-supabase.js creates (or confirms) a Supabase Auth user for sophie@email.com, mirroring the garage pattern | ✓ VERIFIED | `setup-supabase.js` lines 85-92: `sb.auth.admin.createUser({ email: 'sophie@email.com', password: 'client123', email_confirm: true })` mirrors the garage block (lines 64-72), with `isAlreadyRegisteredError()` guard + `findAuthUserIdByEmail()` fallback. Ran `node setup-supabase.js` live — printed `✅ Garage + Client Sophie (auth liée) + Moto MT-07 créés` with no `⚠️` warning. |
| 2 | The clients table row for sophie@email.com has auth_user_id populated and correctly linked to that Supabase Auth user | ✓ VERIFIED | Live `POST /auth/login {role:'client'}` response returned `client.auth_user_id: "804797fe-e683-4891-8b12-99bd56db42ce"`, which matches the Auth user id (`user.id`) returned by `/auth/client/login` in the same test run. Confirms real DB linkage, not just code presence. |
| 3 | POST /auth/client/login with sophie@email.com / client123 returns 200 with a valid session token (no longer 401) | ✓ VERIFIED | Live curl against local server: HTTP 200, body contains `data.session.access_token` (non-empty JWT), `token_type: bearer`, `refresh_token` present. |
| 4 | test-api.js no longer fails on the CLIENT login step | ✓ VERIFIED | Ran `node test-api.js` live: output `✅ Login client`, summary `9/9 tests passés`, `🎉 Tout fonctionne !` |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `setup-supabase.js` | Idempotent creation of Sophie's Auth user + linkage of `auth_user_id` into the clients upsert | ✓ VERIFIED | Contains `sb.auth.admin.createUser` (x2: garage + client), `findAuthUserIdByEmail` helper, `auth_user_id: clientUserId` in the clients upsert payload (line 95), `onConflict: 'email,garage_id'` and `onConflict: 'vin'` unchanged. `node --check setup-supabase.js` passes. |
| `sql/migrations/19_clients_email_garage_unique.sql` (undocumented in PLAN frontmatter but required for the fix to function) | `UNIQUE(email, garage_id)` constraint on `clients` | ✓ VERIFIED | File exists, contains `ALTER TABLE clients ADD CONSTRAINT clients_email_garage_id_key UNIQUE (email, garage_id);`. Applied in prod Supabase — confirmed live: the seed's `clients` upsert (which depends on this constraint via `onConflict: 'email,garage_id'`) succeeded during this verification's `node setup-supabase.js` run (no `42P10` error, no `⚠️` line). |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `setup-supabase.js` (`sb.auth.admin.createUser` for sophie@email.com) | `clients.auth_user_id` | clients upsert payload | ✓ WIRED | `auth_user_id: clientUserId,` is the first field of the `sb.from('clients').upsert(...)` call (line 95), and `clientUserId` is resolved from the same createUser/findAuthUserIdByEmail chain above it. |
| `clients.auth_user_id` | `POST /auth/client/login` (`SBLayer.Auth.loginClient`) | `query('clients', { auth_user_id: data.user.id })` | ✓ WIRED | Live test: `/auth/login role:client` returned `client.auth_user_id` exactly matching the Supabase Auth user id returned by `/auth/client/login`'s `signInWithPassword` call — proves the lookup query in `supabase.js:156-164` successfully resolves Sophie's row by the linked `auth_user_id`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | -------------- | ------ | ------------------- | ------ |
| `setup-supabase.js` clients upsert | `clientUserId` | `sb.auth.admin.createUser` (or `findAuthUserIdByEmail` fallback) resolving a real Supabase Auth user | Yes — live-verified: returned UUID matched the Auth session's `user.id` on actual login | ✓ FLOWING |
| `/auth/client/login` response | `session.access_token` | `supabasePublic.auth.signInWithPassword` against real Supabase project (`rzbqbaccjyxvtlnfitrr`) | Yes — real signed JWT with correct `iss`, `sub`, `email` claims returned live | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Seed script runs idempotently (2x) | `node setup-supabase.js` (run twice, once before this report and once again during verification) | Both runs printed `✅ Garage + Client Sophie (auth liée) + Moto MT-07 créés`, no `⚠️`, exit 0 | ✓ PASS |
| CLIENT login via dedicated endpoint | `curl -X POST localhost:3000/auth/client/login -d '{"email":"sophie@email.com","password":"client123"}'` | HTTP 200, `data.session.access_token` present | ✓ PASS |
| CLIENT login via unified endpoint | `curl -X POST localhost:3000/auth/login -d '{"email":"sophie@email.com","password":"client123","role":"client"}'` | HTTP 200, `data.role: "client"`, `data.token` non-empty, `data.client.auth_user_id` populated | ✓ PASS |
| Full regression suite | `node test-api.js` | `9/9 tests passés`, includes `✅ Login client` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ------------ | ------ | -------- |
| CFIX-01 | 18-01-PLAN.md | Developer/QA can log in as the CLIENT test fixture (`sophie@email.com` / `client123`) and receive a valid session | ✓ SATISFIED | Live end-to-end login verified (see Observable Truths #2-4); REQUIREMENTS.md already marks it `[x] Complete` and cross-references Phase 18, consistent with codebase state. |

No orphaned requirements found — REQUIREMENTS.md line 36 maps CFIX-01 to Phase 18 only, matching the single plan's `requirements: [CFIX-01]` declaration.

### Anti-Patterns Found

None. Scanned `setup-supabase.js` and `sql/migrations/19_clients_email_garage_unique.sql` for TODO/FIXME/PLACEHOLDER/not-implemented markers — no matches. No hardcoded empty returns or stub handlers introduced.

### Human Verification Required

None. All observable truths were verified with live, non-mocked HTTP calls against the running local server backed by the real Supabase project, and the automated `test-api.js` regression suite.

### Gaps Summary

No gaps. All 4 must-have truths, both artifacts (including the migration file discovered as a necessary dependency not listed in the original PLAN frontmatter), and both key links are verified against a live, functioning system — not just static code inspection. The seed script, the Auth user linkage, the login endpoints, and the regression suite were all exercised directly during this verification pass (not merely re-trusting the SUMMARY's claims), and produced matching, consistent results (same Auth user UUID surfacing through both login paths).

One process note for future phases: the PLAN's `must_haves.artifacts` list only tracked `setup-supabase.js`, but the actual fix required a second artifact (`sql/migrations/19_clients_email_garage_unique.sql`) plus a manual prod DB action. This was correctly surfaced and resolved by the executing session (per SUMMARY.md's deviation log) and is included here as a verified artifact even though it wasn't in the original frontmatter — the goal could not have been achieved without it, so it was in scope for verification regardless of frontmatter completeness.

---

_Verified: 2026-07-08T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
