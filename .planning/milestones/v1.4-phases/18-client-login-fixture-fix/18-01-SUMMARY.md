---
phase: 18-client-login-fixture-fix
plan: 01
subsystem: auth
tags: [supabase-auth, fixtures, client-login, idempotency, postgres-constraint]

# Dependency graph
requires: []
provides:
  - "Idempotent Supabase Auth user creation for both garage@motokey.fr and sophie@email.com in setup-supabase.js"
  - "clients.auth_user_id populated and linked for the sophie@email.com fixture"
  - "Working POST /auth/client/login and POST /auth/login (role:client) for the CLIENT test fixture"
  - "UNIQUE constraint on clients(email, garage_id) required by the existing onConflict upsert"
affects: [test-api.js, any future phase or QA flow exercising CLIENT-side login/testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "findAuthUserIdByEmail(email) helper: pages through sb.auth.admin.listUsers to resolve an existing Auth user id when createUser returns null on 'already registered'"
    - "isAlreadyRegisteredError(err) regex helper (/already.*registered/i) instead of a literal .includes() check, matching Supabase's real error text 'already been registered'"

key-files:
  created:
    - "sql/migrations/19_clients_email_garage_unique.sql"
  modified:
    - "setup-supabase.js"

key-decisions:
  - "Resolved missing Auth-user id on re-seeded environments by paging listUsers() rather than trusting createUser's return value, since Supabase returns null user data (not the existing user) when the email is already registered"
  - "Added migration 19 for a pre-existing schema gap (clients had no UNIQUE(email, garage_id) despite the seed script's upsert assuming one) rather than rewriting the upsert to avoid onConflict, since the constraint is the correct long-term fix and other code may rely on the same conflict target"

patterns-established:
  - "Any onConflict-based Supabase upsert must have its target columns backed by an actual UNIQUE/EXCLUSION constraint — Postgres returns 42P10 silently otherwise, and the upsert's .single() call fails without an obvious auth error to explain why"

requirements-completed: [CFIX-01]

# Metrics
duration: ~35min (Task 1 in a prior session + this continuation for Task 2, migration wait, and functional verification)
completed: 2026-07-08
---

# Phase 18 Plan 01: CLIENT Login Fixture Fix Summary

**Fixed `setup-supabase.js` to create and link a Supabase Auth user for the `sophie@email.com` CLIENT fixture, and applied a missing `UNIQUE(email, garage_id)` constraint on `clients` that was silently blocking the seed upsert — CLIENT login now returns 200 end-to-end.**

## Performance

- **Duration:** ~35 min total across two sessions (Task 1 committed previously; this continuation completed Task 2 after a human-action checkpoint for the SQL migration)
- **Started:** 2026-07-08 (Task 1); resumed 2026-07-08T20:xx for Task 2
- **Completed:** 2026-07-08T20:19:34Z
- **Tasks:** 2/2
- **Files modified:** 1 (`setup-supabase.js`); 1 file created (`sql/migrations/19_clients_email_garage_unique.sql`)

## Accomplishments
- `setup-supabase.js` now creates (or resolves) a Supabase Auth user for `sophie@email.com` and writes `auth_user_id` into the `clients` upsert, mirroring the garage account pattern
- Fixed a latent idempotency bug: `createUser` returns `null` on "already registered," so both the garage and client blocks now fall back to `findAuthUserIdByEmail()` to resolve the existing user id on re-runs
- Discovered and fixed a pre-existing schema gap: `clients` had no `UNIQUE(email, garage_id)` constraint, so the existing `onConflict: 'email,garage_id'` upsert always failed with Postgres `42P10` — added migration `19_clients_email_garage_unique.sql`, applied by Mehdi via Supabase Dashboard SQL Editor, and confirmed programmatically (not just trusted) by re-running the seed and observing the upsert succeed
- Verified end-to-end: `POST /auth/client/login` returns 200 with a valid session + `access_token`; `POST /auth/login` with `role:'client'` returns 200 with `role:"client"` and a non-empty JWT `token`; `test-api.js` passes all 9/9 tests including `✅ Login client`
- Confirmed idempotency: ran `node setup-supabase.js` twice in a row, both times reaching the success line with no thrown error

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Sophie's Supabase Auth user and link auth_user_id in setup-supabase.js** - `454fe6c` (feat)
   - Follow-up idempotency fix (regex-based already-registered check) - `b98c17c` (fix)
2. **Task 2: Seed the fixture and prove CLIENT login returns 200** - verification-only task, no new code changes; blocked mid-task on a missing DB constraint, documented and resolved via:
   - `fccbbf3` (fix: add migration for missing clients unique constraint)
   - `a661fab` (docs: record blocker — DB migration required before functional proof)
   - This continuation: migration applied by Mehdi via Supabase Dashboard, verified programmatically by re-running `setup-supabase.js` and observing success (no new commit required — Task 2 produces no file changes beyond the already-committed migration SQL)

**Plan metadata:** (this commit, following SUMMARY/STATE/ROADMAP updates)

## Files Created/Modified
- `setup-supabase.js` - Adds `findAuthUserIdByEmail()` helper, `isAlreadyRegisteredError()` regex helper, Sophie's Auth user creation, `auth_user_id: clientUserId` in the clients upsert payload, and an updated success log line
- `sql/migrations/19_clients_email_garage_unique.sql` - `ALTER TABLE clients ADD CONSTRAINT clients_email_garage_id_key UNIQUE (email, garage_id);` — applied in prod Supabase via Dashboard SQL Editor by Mehdi, confirmed working by re-running the seed

## Decisions Made
- Used `listUsers()` paging instead of any other Auth Admin API to resolve existing user ids, since it's the only way to recover an id when `createUser` reports "already registered" without returning user data
- Fixed the "already registered" string-match bug in the same task rather than deferring it, since it directly blocked the plan's idempotency requirement (Rule 1 — bug in code the task touches)
- Added the missing UNIQUE constraint (migration 19) rather than reworking the upsert logic to avoid `onConflict`, preserving the intended semantics of "one client row per email per garage" and matching what the original code already assumed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed incorrect "already registered" string match**
- **Found during:** Task 1
- **Issue:** Plan's reference snippet used `authErr.message.includes('already registered')`, but Supabase's actual error text is "already **been** registered" — the literal check never matched, so idempotent re-runs would throw instead of falling back to `findAuthUserIdByEmail`
- **Fix:** Replaced with `isAlreadyRegisteredError(err)` using regex `/already.*registered/i` for both the garage and client Auth-user creation blocks
- **Files modified:** `setup-supabase.js`
- **Verification:** Ran `setup-supabase.js` twice consecutively; second run reached the success line without throwing
- **Committed in:** `b98c17c`

**2. [Rule 3 - Blocking] Added missing UNIQUE(email, garage_id) constraint on clients**
- **Found during:** Task 2 (functional verification)
- **Issue:** `clients` table had no unique/exclusion constraint matching `onConflict: 'email,garage_id'` in the existing upsert code. Postgres returned `42P10: no unique or exclusion constraint matching the ON CONFLICT specification`, which was silently swallowed by the script's try/catch (logged only as a generic `⚠️` line), meaning Sophie's `clients` row (and thus `auth_user_id` linkage) was never actually created despite the Auth user existing
- **Fix:** Authored `sql/migrations/19_clients_email_garage_unique.sql` adding `UNIQUE (email, garage_id)`. This required a human-action checkpoint (Dashboard SQL Editor execution) since the plan's execution environment cannot run DDL directly — Mehdi applied the migration and confirmed via chat ("I ran the SQL, continue")
- **Verification:** Did NOT trust the user's word alone — re-ran `node setup-supabase.js` and observed the success line `✅ Garage + Client Sophie (auth liée) + Moto MT-07 créés` with no `⚠️`, confirming the constraint is live in prod Supabase (project `rzbqbaccjyxvtlnfitrr`). Further confirmed by the full functional chain succeeding (`/auth/client/login` → 200, `/auth/login` role:client → 200, `test-api.js` → 9/9 including `✅ Login client`)
- **Files modified:** `sql/migrations/19_clients_email_garage_unique.sql` (new file)
- **Committed in:** `fccbbf3` (migration file), applied to prod by Mehdi (no code commit for the Dashboard action itself)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 blocking schema gap requiring a human-action checkpoint)
**Impact on plan:** Both fixes were necessary for the plan's stated success criteria (idempotent seed script, working CLIENT login) to actually hold. No scope creep — the constraint fix was strictly the missing piece preventing the plan's own diagnosed root cause from taking effect.

## Issues Encountered
- Task 2 was blocked mid-execution when the seed script's upsert failed with Postgres `42P10` despite Task 1's code fix being correct — root cause was a completely separate, pre-existing schema gap (no UNIQUE constraint), not a mistake in this plan's own code. Resolved via a human-action checkpoint: authored the migration, requested Mehdi apply it via Supabase Dashboard SQL Editor (this environment has no direct DDL execution path), then verified programmatically rather than trusting the report.

## User Setup Required

None further - the one required manual step (applying `sql/migrations/19_clients_email_garage_unique.sql` via Supabase Dashboard SQL Editor) was already completed by Mehdi and confirmed working during this session.

## Next Phase Readiness
- CFIX-01 fully satisfied: all 4 ROADMAP Phase 18 success criteria verified true (Auth user created, `auth_user_id` linked, `/auth/client/login` returns 200 with session, `test-api.js` passes CLIENT login)
- Phase 19 (SCHEMA-01, schema.sql regeneration) is independent and unblocked — no shared files or dependencies with this phase
- No outstanding blockers for v1.4 milestone completion beyond Phase 19 itself

---
*Phase: 18-client-login-fixture-fix*
*Completed: 2026-07-08*

## Self-Check: PASSED

- FOUND: setup-supabase.js
- FOUND: sql/migrations/19_clients_email_garage_unique.sql
- FOUND: .planning/phases/18-client-login-fixture-fix/18-01-SUMMARY.md
- FOUND commit: 454fe6c
- FOUND commit: b98c17c
- FOUND commit: fccbbf3
- FOUND commit: a661fab
