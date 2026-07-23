---
phase: 22-v-rification-bootstrap-nettoyage-header
plan: 02
subsystem: database
tags: [postgres, supabase, pg, schema-verification, information_schema, postgrest]

# Dependency graph
requires:
  - phase: 22-v-rification-bootstrap-nettoyage-header (plan 01)
    provides: "scripts/bootstrap-fresh-schema.js and introspect-schema.js --compare mode (EXPECTED_TABLES extended to 18 entries)"
provides:
  - "Real execution evidence that schema.sql bootstraps cleanly against a genuinely empty Postgres (SCHEMA_BOOTSTRAP_OK)"
  - "Confirmed match between fresh bootstrap and prod for all Gap A columns and all 5 Gap B objects (18/18 expected tables/objects)"
  - "billing_events.created_at column added to schema.sql — a real drift PostgREST-based --compare could not have caught given the fresh project's new API key format"
affects: [22-03-PLAN.md]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "New-style Supabase projects (sb_publishable_/sb_secret_ API keys) restrict the PostgREST root/OpenAPI discovery endpoint (GET /rest/v1/) to secret keys only — a publishable/anon-equivalent key gets 401 'Secret API key required'. introspect-schema.js's --compare mode (built for legacy JWT-key projects) cannot introspect such a project via REST at all."
    - "Fallback: introspect the fresh project directly via its already-available direct pg connection (information_schema.columns / information_schema.views) instead of PostgREST, diffed against prod's PostgREST-based column set. Used as a throwaway (uncommitted) script for this run."

key-files:
  created: []
  modified:
    - schema.sql

key-decisions:
  - "introspect-schema.js --compare mode was not usable as-is against this fresh project (new API key format blocks the OpenAPI discovery endpoint for non-secret keys) — worked around with a throwaway direct-pg/information_schema comparison script instead of asking Mehdi for a secret key or modifying the committed compare tool's key-handling, keeping the plan's original anon-key-only intent intact for prod-side comparisons"
  - "Fixed the one real drift found (billing_events.created_at, present in prod, absent from schema.sql/migration 15, no git trace) directly in schema.sql, documented inline with the same 'origine indéterminée' convention Phase 20/21 established for other ghost columns, rather than opening a new investigation phase — in scope because SCHEMA-07 literally requires fresh-bootstrap-matches-prod"

patterns-established:
  - "When PostgREST introspection is blocked (auth format mismatch, missing grants, etc.) for a project already reachable via a working pg connection, information_schema is a reliable REST-independent fallback for both table/column comparison and view existence checks"

requirements-completed: [SCHEMA-07]

# Metrics
duration: ~20min
completed: 2026-07-11
---

# Phase 22 Plan 02: Bootstrap & Compare Verification Summary

**Real fresh-Postgres bootstrap of schema.sql confirmed clean (SCHEMA_BOOTSTRAP_OK), and a genuine drift found+fixed along the way: prod's billing_events had a created_at column missing from schema.sql that no prior phase had caught.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-11T20:33:30Z
- **Completed:** 2026-07-11T20:47:12Z
- **Tasks:** 2 completed (Task 1's human-action checkpoint was resolved before this run started)
- **Files modified:** 1 (schema.sql)

## Accomplishments
- `node scripts/bootstrap-fresh-schema.js` executed `schema.sql` against a genuinely empty, brand-new throwaway Supabase Postgres project via a direct `pg` connection — printed `SCHEMA_BOOTSTRAP_OK` with zero SQL errors. This closes SCHEMA-07 criterion 1 with real execution evidence (not grep/diff inference).
- Discovered that `introspect-schema.js --compare` cannot run against this fresh project as-is: the project uses Supabase's newer `sb_publishable_.../sb_secret_...` API key format, and its PostgREST root/OpenAPI discovery endpoint rejects the publishable (anon-equivalent) key with `401 "Secret API key required"`. Prod still uses the legacy JWT key format, so prod-side introspection is unaffected.
- Worked around this with a throwaway (uncommitted) comparison script: prod introspected via the existing PostgREST OpenAPI path (unchanged), fresh project introspected directly via its already-open `pg` connection using `information_schema.columns`/`information_schema.views`. This is the same class of fallback the plan already prescribed specifically for the view-existence check — extended here to the whole comparison since REST access was blocked entirely, not just for the view.
- The fallback comparison found one real, previously-undetected drift: prod's `billing_events` table has a `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` column that is absent from `sql/migrations/15_billing_foundation.sql` and therefore from `schema.sql`. `git log -S` found no trace of an `ALTER TABLE billing_events ADD COLUMN created_at` anywhere in history — origin genuinely indeterminate, same class as the Gap A "ghost columns" Phase 20 catalogued for `garages`/`interventions`.
- Fixed by adding the column to `schema.sql`'s `billing_events` table definition with an inline comment documenting the discovery context and undetermined origin (matching the established Gap A comment convention). Re-ran the bootstrap (schema.sql's `DROP...CASCADE` cleanup block makes this safe against the same fresh project) — still `SCHEMA_BOOTSTRAP_OK`. Re-ran the fallback comparison — all 18 expected tables/objects now match prod exactly, including the fixed column.
- `v_motos_avec_proprietaire` confirmed to exist structurally in the fresh project via `information_schema.views` (returned exactly 1 row) — resolves Pitfall 4 / Open Question 1 from 22-RESEARCH.md. (PostgREST-based confirmation was not attempted for the view specifically since the whole REST path was already blocked for this project by the key-format issue above; the `information_schema` path is the definitive DDL-existence check the plan called for regardless.)
- Re-ran `node scripts/introspect-schema.js` (default mode, no args, against prod) after the `schema.sql` edit — still exits 0, confirming no mid-phase drift on the narrow-scope prod objects.

## Task Commits

Each task was committed atomically:

1. **Task 1 (checkpoint, resolved before this agent run):** Mehdi created a fresh throwaway Supabase project and populated `.env` with `FRESH_DB_URL`/`FRESH_REST_URL`/`FRESH_ANON_KEY` — no commit (human action, no files modified).
2. **Task 2: Bootstrap schema.sql against the fresh project** - no commit (verification-only, `SCHEMA_BOOTSTRAP_OK`, no files modified by this step alone).
3. **Task 3: Compare fresh vs prod + fix discovered drift** - `dd7f6db` (fix) — added `billing_events.created_at` to `schema.sql` after the fallback comparison surfaced the missing column; re-verified bootstrap + compare pass after the fix.

_Note: Tasks 2 and 3 as originally scoped are "no files modified — verification" per the plan; the one commit above reflects the Rule 1 auto-fix that came out of Task 3's comparison work, not a change to the planned task structure._

## Files Created/Modified
- `schema.sql` - Added `billing_events.created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, documented inline as origin-indeterminate (discovered via this plan's bootstrap comparison, no migration file or git trace)

## Decisions Made
- Used a throwaway, uncommitted Node script (deleted after use, `scripts/_tmp-compare-fresh-via-pg.js`) to compare the fresh project against prod via direct `pg`/`information_schema` instead of PostgREST, because the fresh project's new-format API key cannot use the `--compare` mode's REST discovery endpoint at all. Chose this over asking Mehdi for a secret key (would contradict the plan's explicit "anon key only, minimize secret exposure" intent) and over modifying the committed `introspect-schema.js` (the PostgREST-based compare mode remains correct and reusable for future legacy-key-format fresh projects; this is a one-off key-format incompatibility, not a defect in the committed tool).
- Fixed the discovered `billing_events.created_at` gap directly in `schema.sql` rather than deferring it — SCHEMA-07's own acceptance criteria require the fresh bootstrap to match prod for Gap B objects, so this is squarely in scope, not a new investigation. Origin left as "indéterminée" (consistent with Phase 20/21's precedent for similar ghost columns) rather than fabricating a plausible-sounding explanation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] introspect-schema.js --compare could not reach the fresh project (new API key format)**
- **Found during:** Task 3 (compare automatique)
- **Issue:** `node scripts/introspect-schema.js --compare "$FRESH_REST_URL" "$FRESH_ANON_KEY"` failed with `HTTP 401 Unauthorized` / `"Secret API key required"`. The fresh Supabase project (created after this research was written) uses the newer `sb_publishable_`/`sb_secret_` key format; that format's PostgREST root/OpenAPI discovery endpoint requires a secret key, not the publishable/anon-equivalent key the plan specified for security reasons.
- **Fix:** Wrote a throwaway (uncommitted, deleted after use) comparison script that introspects prod via the existing PostgREST OpenAPI path (unaffected — prod uses the legacy key format) and introspects the fresh project directly via the already-open `pg` connection (`FRESH_DB_URL`) using `information_schema.columns`/`information_schema.views`, then diffs the two the same way `--compare` does.
- **Files modified:** none committed (throwaway script only)
- **Verification:** Fallback comparison ran to completion, correctly surfaced the real `billing_events.created_at` gap (see next item) and, after the fix, reported PASS for all 18 expected tables/objects.
- **Committed in:** N/A (no committed files from this fix itself; it enabled discovery of the next item)

**2. [Rule 1 - Bug] Fixed missing billing_events.created_at column in schema.sql**
- **Found during:** Task 3 (compare automatique, via the fallback script above)
- **Issue:** Prod's `billing_events` table has a `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` column not present in `sql/migrations/15_billing_foundation.sql` or `schema.sql`. `git log --all -S"ALTER TABLE billing_events"` and `-S"created_at"` found no trace of how/when it was added — origin genuinely undetermined.
- **Fix:** Added the column to `schema.sql`'s `billing_events` `CREATE TABLE` block with an inline comment documenting the discovery context (Phase 22 bootstrap verification) and undetermined origin, matching the established "origine indéterminée" convention from Phase 20/21's Gap A ghost columns.
- **Files modified:** `schema.sql`
- **Verification:** Re-ran `node scripts/bootstrap-fresh-schema.js` after the fix — still `SCHEMA_BOOTSTRAP_OK`. Re-ran the fallback comparison — `billing_events` now reports `[OK]`, all 18 expected tables/objects PASS.
- **Committed in:** `dd7f6db` (fix)

---

**Total deviations:** 2 auto-fixed (1 blocking — tooling workaround, 1 bug — real schema drift fix)
**Impact on plan:** Both were necessary to actually satisfy SCHEMA-07's criterion 2 (fresh bootstrap genuinely matches prod). Without the Rule 3 workaround, Task 3 could not have run at all against this project. Without the Rule 1 fix, the plan would have had to either report a false PASS (masking a real gap) or a FAIL that blocked completion for a fixable reason. No scope creep — no other columns/tables were touched.

## Issues Encountered
None beyond the two deviations documented above (both resolved within this plan's scope).

## User Setup Required

None further — Task 1's human-action checkpoint (fresh Supabase project + 3 `.env` variables) was already resolved before this agent run began, per the checkpoint_resolution context.

## Next Phase Readiness
- SCHEMA-07 criteria 1 and 2 are both satisfied with real execution evidence: `SCHEMA_BOOTSTRAP_OK` (criterion 1) and a full 18/18 object match between fresh bootstrap and prod, including structural view confirmation (criterion 2).
- `schema.sql` now matches prod exactly for every object in scope (13 baseline + 5 Gap B), including the newly-fixed `billing_events.created_at` column.
- Plan 22-03 (header cleanup) can proceed — no outstanding schema.sql patches pending; the one patch needed during this plan's execution (`billing_events.created_at`) is already committed and verified, so 22-03's header rewrite can truthfully describe Gap A/Gap B as fully resolved and bootstrap-verified.
- No blockers identified for 22-03.

---
*Phase: 22-v-rification-bootstrap-nettoyage-header*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: schema.sql
- FOUND: .planning/phases/22-v-rification-bootstrap-nettoyage-header/22-02-SUMMARY.md
- FOUND: commit dd7f6db
- OK: throwaway compare script removed (not left uncommitted/untracked)
- FOUND: created_at column present in schema.sql's billing_events table
