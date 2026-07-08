---
phase: 12-backend-push-foundation
verified: 2026-07-01T00:00:00Z
status: human_needed
score: 4/6 must-haves fully verified (2 uncertain pending environmental blocker)
human_verification:
  - test: "Apply sql/migrations/16_client_device_tokens.sql via Supabase Dashboard > SQL Editor (project rzbqbaccjyxvtlnfitrr), then run: curl -X POST https://motokey11-production.up.railway.app/client/device-tokens -H 'Authorization: Bearer <real CLIENT JWT>' -H 'Content-Type: application/json' -d '{\"token\":\"ExponentPushToken[abc123]\",\"platform\":\"ios\"}'"
    expected: "HTTP 201 with a device_token object (id, client_id, token, platform, last_used_at, created_at) — proves SC1 end-to-end against the real table."
    why_human: "Requires Supabase Dashboard access (credentials not available to the verifier) to apply DDL, and a live CLIENT JWT to curl against. The 500 'relation does not exist' failure mode was already confirmed by the executor pre-migration; only the post-migration happy path remains unconfirmed."
  - test: "After the above, curl -X DELETE .../client/device-tokens with the same token in the body, same JWT."
    expected: "HTTP 200 {deleted:true} on first call, HTTP 404 on immediate repeat call — proves SC2 end-to-end."
    why_human: "Same blocker as above (migration must be applied first); depends on a real row existing from the POST step."
  - test: "Fix or bypass the broken sophie@email.com/client123 CLIENT login fixture, then run `node tests/test-client-device-tokens.js` against a locally running `node motokey-api.js` (pointed at Supabase with migration 16 applied) and confirm the '🎉 Tout fonctionne !' summary line with 0 failures."
    expected: "All 8 assertions pass (login, GET /client/me x7 fields, POST 201, POST 400 invalid, DELETE 200, DELETE 404, POST 401 no-auth)."
    why_human: "The login fixture bug is pre-existing/unrelated to Phase 12 but blocks the one fully-automated verification path that was built specifically for this phase; needs a human decision on whether to fix the seed data or the test script."
---

# Phase 12: Backend Push Foundation Verification Report

**Phase Goal:** Le backend expose une capacité d'enregistrement/désenregistrement de device token push par utilisateur client, vérifiable indépendamment de toute app mobile (curl/Postman).
**Verified:** 2026-07-01
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Migration file defines `client_device_tokens` with `UNIQUE(token)` + `client_id` FK to `clients` | ✓ VERIFIED | `sql/migrations/16_client_device_tokens.sql` read in full — exact match to plan spec: `client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE`, `token TEXT NOT NULL UNIQUE` (alone, no composite), `platform CHECK (platform IN ('ios','android'))`, index on `client_id`. `auth_user_id` count = 0 (correctly absent per D-01). |
| 2 | Runnable test script exists exercising POST/DELETE `/client/device-tokens` and `GET /client/me` | ✓ VERIFIED | `tests/test-client-device-tokens.js` read in full. `node --check` passes. Contains login, `GET /client/me` (7-key shape check), POST 201, POST 400 (bad token), DELETE 200, DELETE 404 (already gone), POST 401 (no auth) — all 4 ROADMAP success criteria represented as assertions. |
| 3 | `POST /client/device-tokens` creates a row for the authenticated CLIENT (SC1) | ? UNCERTAIN | Code at `motokey-api.js:1718-1741` is correct and pattern-consistent with the already-live `POST /client/motos` (same RBAC gate, same clients-lookup, real `.upsert(..., {onConflict:'token'})` — not a stub). However the happy-path 201 has never been exercised against a live table: migration 16 is confirmed NOT applied in prod Supabase per both SUMMARY and STATE.md. Manual out-of-band test only reached 400 (invalid token) and 500 "relation does not exist" (expected pre-migration failure). Genuine end-to-end proof is pending an environmental step outside this repo. |
| 4 | `DELETE /client/device-tokens` removes the matching row (SC2) | ? UNCERTAIN | Code at `motokey-api.js:1744-1770` is correct: reads body locally (matches `DELETE /client/garages/:id` precedent), scopes deletion by both `token` AND `client_id` (prevents cross-client deletion), returns 200/404 correctly. Same blocker as SC1 — never exercised against a live table with migration 16 applied. |
| 5 | `GET /client/me` returns the authenticated client's profile (SC3) | ✓ VERIFIED | Code at `motokey-api.js:1773-1796` uses real `clients` columns (`nom`,`tel`, no `prenom`/`telephone`), null-safe `garages` embed. SUMMARY documents this was manually curl-tested end-to-end against live Supabase (200, correct shape) — this table (`clients`) already exists in prod (pre-Phase-12), so this endpoint has no migration dependency, unlike SC1/SC2. |
| 6 | Both device-token endpoints reject requests without a valid CLIENT JWT with 401 (SC4) | ✓ VERIFIED | All 3 handlers open with the identical `ctx` extraction + `if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED')` gate (grep-confirmed, code read directly). SUMMARY documents this was live-confirmed (401 on POST with no Authorization header) — this path requires no DB table, so it is not blocked by the migration issue. |

**Score:** 4/6 truths fully verified; 2/6 uncertain pending an environmental blocker (migration 16 not yet applied to production Supabase) that cannot be resolved or verified from within this session (no Supabase Dashboard credentials available to the verifier).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sql/migrations/16_client_device_tokens.sql` | `client_device_tokens` table DDL | ✓ VERIFIED | Exists, exact content match to plan (verbatim), substantive (not a stub), no `auth_user_id`. |
| `tests/test-client-device-tokens.js` | Node smoke-test for 3 endpoints | ✓ VERIFIED | Exists, `node --check` passes, all required assertions present (login, 7-key `/client/me` shape, 201/400/200/404/401 paths). |
| `motokey-api.js` — `isExpoPushToken()` + 3 route handlers | POST/DELETE `/client/device-tokens`, GET `/client/me`, validator | ✓ VERIFIED | All present exactly once (`grep -c` confirms 1 each), `node --check motokey-api.js` passes, code read directly line-by-line — substantive real Supabase queries, not stubs. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `POST /client/device-tokens` handler | `client_device_tokens` table | `.upsert({...}, {onConflict:'token'})` | ✓ WIRED (code) / ? UNCERTAIN (live) | `onConflict: 'token'` present exactly as required by CONTEXT.md D-02; code-level wiring confirmed. Live data flow into the actual prod table unconfirmed — table doesn't exist yet in prod per SUMMARY/STATE.md. |
| `DELETE /client/device-tokens` handler | `client_device_tokens` table | `.delete().eq('token',token).eq('client_id',clientId)` | ✓ WIRED (code) / ? UNCERTAIN (live) | Double-scoped delete confirmed in code (prevents cross-client deletion). Same live-DB blocker as above. |
| `GET /client/me` handler | `clients` + `garages` tables | `.select('id, nom, email, tel, garage_id, created_at, garages(nom)')` | ✓ WIRED | Confirmed both in code and (per SUMMARY) live against prod Supabase — `clients`/`garages` tables predate this phase, no migration dependency. |
| Shared body-parsing dispatch (`['POST','PUT','PATCH'].includes(method)`) | — | unchanged | ✓ CONFIRMED UNCHANGED | `grep -c` returns exactly 1 occurrence in current `motokey-api.js` — the plan's explicit "do not widen this whitelist" constraint was honored; `DELETE /client/device-tokens` reads its body locally via `body(req).catch(() => ({}))`, matching the `DELETE /client/garages/:id` precedent. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `POST /client/device-tokens` | `token`, `platform` (request body `b`) | Real `SBLayer.supabase.from('client_device_tokens').upsert(...)` — no static/hardcoded return | Structurally yes (real query, not a stub) | ⚠️ STATIC-PENDING-MIGRATION — query is real but the target table does not exist in prod yet; cannot confirm actual row creation until migration 16 is applied |
| `DELETE /client/device-tokens` | `token` (request body), `clientId` (resolved from `clients` via `auth_user_id`) | Real `.delete().eq(...).eq(...).select()` | Structurally yes | ⚠️ STATIC-PENDING-MIGRATION — same as above |
| `GET /client/me` | `clientRow` from `clients` + embedded `garages(nom)` | Real `SBLayer.supabase.from('clients').select(...)` | Yes — confirmed live (200, correct shape) per SUMMARY manual verification | ✓ FLOWING |

### Behavioral Spot-Checks

Step 7b: **SKIPPED** — no server was started per the tool's "do not start servers/services" constraint, and prod credentials for a live curl proof are not available to this verifier. This aligns with the phase's own documented state: the one fully-automated spot-check (`tests/test-client-device-tokens.js`) is blocked by (a) migration 16 not yet applied, and (b) a pre-existing, unrelated broken login fixture (`sophie@email.com`/`client123` returns 401, also breaks `test-api.js`).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| MPUSH-02 | 12-01, 12-02 | "Le device token est enregistré/désenregistré auprès du backend au login/logout" | ✓ CORRECTLY LEFT PENDING | `.planning/REQUIREMENTS.md` line 27/79 shows MPUSH-02 as `- [ ]` (unchecked), mapped to "Phase 12 (backend) / Phase 16 (bout-en-bout), Pending". This is correct: Phase 12 only builds the backend capability; the requirement legitimately also needs Phase 16's mobile-side login/logout wiring to be fully satisfied. Neither plan prematurely marked it done in REQUIREMENTS.md. **Minor inconsistency noted:** `12-01-SUMMARY.md` frontmatter states `requirements-completed: [MPUSH-02]` (line 35), which is inaccurate on its own (plan 12-01 only created a migration file + test script, no endpoints) — but `12-02-SUMMARY.md` frontmatter correctly states `requirements-completed: []` with an explanatory comment, and REQUIREMENTS.md itself (the source of truth) was never touched to mark it complete. Net effect: no incorrect state exists in the requirements ledger, only a stray claim in one SUMMARY's frontmatter. |

No orphaned requirements found — REQUIREMENTS.md maps only MPUSH-02 to Phase 12, and both plans declare `requirements: [MPUSH-02]`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.planning/phases/12-backend-push-foundation/12-01-SUMMARY.md` | 35 | `requirements-completed: [MPUSH-02]` — overstates plan 12-01's scope (only migration + test script, no endpoints) | ℹ️ Info | Documentation-only inconsistency; does not affect REQUIREMENTS.md (source of truth), which remains correctly unchecked. No code impact. |

No TODO/FIXME/placeholder comments, no empty handlers, no hardcoded-empty stub patterns found in any of the 3 new route handlers or the `isExpoPushToken()` helper — all read directly and confirmed substantive.

### Human Verification Required

### 1. Live proof of SC1 (POST /client/device-tokens happy path)

**Test:** Apply `sql/migrations/16_client_device_tokens.sql` via Supabase Dashboard > SQL Editor (project `rzbqbaccjyxvtlnfitrr`), then `curl -X POST https://motokey11-production.up.railway.app/client/device-tokens` with a real CLIENT JWT and a valid Expo token body.
**Expected:** HTTP 201 with a `device_token` object containing the created/reassigned row.
**Why human:** Requires Supabase Dashboard credentials (not available to this verifier) and a live CLIENT JWT; the code is already confirmed correct by direct read, this only proves the live data path.

### 2. Live proof of SC2 (DELETE /client/device-tokens happy path)

**Test:** Immediately after test 1, `curl -X DELETE .../client/device-tokens` with the same token, then repeat the same call.
**Expected:** First call 200 `{deleted:true}`, second call 404.
**Why human:** Same migration-application blocker as test 1.

### 3. Fix or bypass the broken CLIENT login fixture and run the automated smoke test

**Test:** Resolve why `sophie@email.com`/`client123` returns `401 INVALID_CREDENTIALS` (pre-existing, unrelated to Phase 12 — also breaks `test-api.js`), then run `node tests/test-client-device-tokens.js` against a locally started `node motokey-api.js` pointed at a Supabase project with migration 16 applied.
**Expected:** Console prints `🎉 Tout fonctionne !` with 0 `❌` lines.
**Why human:** Requires a decision (fix seed data vs. fix test script) plus local server startup and live Supabase access — outside what this verifier can safely do (must not start servers or touch credentials).

## Gaps Summary

The Phase 12 goal is **code-complete and correctly wired**: all three endpoints (`POST`/`DELETE /client/device-tokens`, `GET /client/me`) exist in `motokey-api.js`, pass `node --check`, follow the established `/client/*` RBAC pattern exactly (`rbac.requireAnyRole(ctx, ['CLIENT'])`, never the hierarchical `requireRole`), and the supporting migration + test harness from plan 12-01 are both present and substantive. `git log` confirms all 5 documented commits (`7bb415c`, `3e07a41`, `da94350`, `d8e19e8`, `3c83470`) exist and are scoped exactly as described.

The one real, honestly-disclosed gap is **operational, not architectural**: migration `16_client_device_tokens.sql` has not yet been applied to the production Supabase project, so the two device-token endpoints' happy paths (SC1 create, SC2 delete) have only been code-reviewed and negative-path-tested (400/401), never proven end-to-end against a real row. `GET /client/me` and the 401-rejection path (SC3, SC4) don't depend on the new table and are confirmed live per the SUMMARY's manual out-of-band test.

This matches exactly what both SUMMARY.md files and STATE.md candidly document — there is no discrepancy between what was claimed and what actually exists in the codebase. REQUIREMENTS.md correctly leaves MPUSH-02 unchecked, deferring full closure to Phase 16. This phase is ready to be treated as "code done, one environmental step outstanding" rather than reopened with a new execution plan — the missing piece is a Supabase Dashboard action + a live curl/test run, not new code.

---

*Verified: 2026-07-01*
*Verifier: Claude (gsd-verifier)*
