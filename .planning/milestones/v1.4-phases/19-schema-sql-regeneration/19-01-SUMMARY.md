---
phase: 19-schema-sql-regeneration
plan: 01
subsystem: database
tags: [postgrest, supabase, schema-introspection, rls, pg_catalog]

# Dependency graph
requires: []
provides:
  - "scripts/introspect-schema.js — reusable PostgREST OpenAPI introspection script with default mode (print + assert narrow-scope objects) and --compare mode (diff a fresh bootstrap project against prod, scoped to expected tables)"
  - "Verbatim devis_statut_check CHECK constraint definition (pg_get_constraintdef), resolving the prior discrepancy between application code and the phase description"
  - "Confirmed RLS state for garage_users, client_device_tokens, push_send_log: RLS enabled on all three, zero explicit policies defined (default-deny for anon/authenticated, service_role only)"
affects: [19-02-PLAN.md, 19-03-PLAN.md]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PostgREST OpenAPI introspection (GET {SUPABASE_URL}/rest/v1/?apikey=...) as a credential-free schema dump, reusing existing SUPABASE_SECRET_KEY"
    - "Read-only pg_catalog queries (pg_get_constraintdef, pg_policies, pg_class.relrowsecurity) pasted into Supabase Dashboard SQL Editor for facts PostgREST cannot expose — same manual mechanism already used for migrations 10-19"

key-files:
  created: [scripts/introspect-schema.js]
  modified: []

key-decisions:
  - "Live devis_statut_check allows 7 values (brouillon, envoye, accepte, refuse, expire, converti, annule) — a superset reconciling both the application code's 4 values and the phase description's 4 values; neither prior source alone was correct"
  - "garage_users, client_device_tokens, push_send_log all have RLS ENABLED with NO explicit policies in prod — schema.sql (plan 02) must reproduce this exactly via ALTER TABLE ... ENABLE ROW LEVEL SECURITY with no CREATE POLICY statements, not invent permissive policies"

patterns-established:
  - "For any status/statut TEXT+CHECK column, resolve allowed values via pg_get_constraintdef only — never trust OpenAPI's enum field (only true Postgres ENUM types populate it) or application code greps alone"

requirements-completed: []  # SCHEMA-01 not yet complete — spans plans 02 (regenerate schema.sql) and 03 (bootstrap verification); marking deferred to plan 03 completion

# Metrics
duration: 25min
completed: 2026-07-09
---

# Phase 19 Plan 01: Schema Ground-Truth Capture Summary

**PostgREST OpenAPI introspection script plus verbatim `pg_get_constraintdef`/`pg_policies` capture resolving the devis.statut CHECK constraint and RLS state of 3 untracked tables, unblocking schema.sql regeneration in plan 02.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-09T08:26:58.928Z
- **Completed:** 2026-07-09T09:15:00.000Z
- **Tasks:** 2 (1 auto, 1 checkpoint:human-action)
- **Files modified:** 1 (`scripts/introspect-schema.js`)

## Accomplishments

- Built `scripts/introspect-schema.js`: default mode introspects prod via PostgREST OpenAPI and asserts presence of the 5 narrow-scope objects (`garage_users`, `client_device_tokens`, `push_send_log`, `motos.last_maintenance_tier_notified`, `motos.last_maintenance_tier_notified_at`); `--compare` mode diffs a fresh bootstrap project against prod, scoped to the narrow expected-table set (reused by plan 03's bootstrap verification).
- Captured the verbatim, previously-unreconciled `devis_statut_check` CHECK constraint definition via `pg_get_constraintdef` — resolves the discrepancy flagged in 19-RESEARCH.md Open Question #2.
- Captured the RLS enablement + policy state of the 3 new tables via `pg_policies` and `pg_class.relrowsecurity` — resolves 19-RESEARCH.md's unknown on RLS reproduction fidelity.

## Task Commits

1. **Task 1: Create introspect-schema.js (PostgREST OpenAPI introspection + compare mode)** - `ab4523d` (feat)
2. **Task 2: Capture exact devis.statut CHECK constraint + RLS for 3 new tables** - no code changes (read-only Supabase Dashboard SQL Editor query); captured facts recorded below and in this SUMMARY's frontmatter for plan 02 to consume

**Plan metadata:** (this commit) `docs(19-01): complete schema ground-truth capture plan`

## Files Created/Modified

- `scripts/introspect-schema.js` - PostgREST OpenAPI introspection (default mode) + fresh-vs-prod compare mode, reused by plan 03

## Captured Ground Truth (for Plan 02)

### (a) `devis.statut` CHECK constraint — verbatim

```
devis_statut_check CHECK ((statut = ANY (ARRAY['brouillon'::text, 'envoye'::text, 'accepte'::text, 'refuse'::text, 'expire'::text, 'converti'::text, 'annule'::text])))
```

Constraint name: `devis_statut_check`. Allowed values (7): `brouillon`, `envoye`, `accepte`, `refuse`, `expire`, `converti`, `annule`. This is a superset of both prior sources (application code's `brouillon`/`envoye`/`accepte`/`refuse` and the phase description's `accepte`/`refuse`/`expire`/`converti`) — confirms neither source alone was wrong, just incomplete. Plan 02 must copy this list verbatim into schema.sql's `CHECK (statut IN (...))` clause, replacing the stale `statut_devis` ENUM (`brouillon`,`envoye`,`valide`,`annule`).

### (b) RLS policies on `garage_users`, `client_device_tokens`, `push_send_log`

Query result: "Success. No rows returned" (confirmed explicitly by Mehdi across two follow-up clarifications). Zero `CREATE POLICY` statements exist for any of the 3 tables in prod.

### (c) RLS enabled flag on the 3 tables

`relrowsecurity = true` for all three (`garage_users`, `client_device_tokens`, `push_send_log`) — confirmed by Mehdi ("true pour les trois").

**Conclusion:** All 3 tables have RLS **enabled** with **zero explicit policies** — the faithful default-deny state (anon/authenticated blocked entirely; only `service_role` — which bypasses RLS — can read/write, matching how `supabase.js` already accesses these tables via the service-role key). Plan 02 must reproduce this in schema.sql as `ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;` for each of the 3 tables with **no accompanying `CREATE POLICY`** — inventing permissive policies would NOT match prod.

## Decisions Made

- Recorded the devis CHECK superset resolution and the RLS default-deny state as the authoritative inputs for plan 02, per the plan's own `<output>` requirement — no architectural decisions required, this was pure fact-gathering.
- Did not mark requirement `SCHEMA-01` complete — it spans plans 02 (schema.sql regeneration) and 03 (fresh-bootstrap verification); this plan only supplies inputs, so marking it complete here would misrepresent phase state.

## Deviations from Plan

None - plan executed exactly as written. Task 2 was a `checkpoint:human-action` that blocked mid-execution in the prior agent session (see commit `a661fab`); the human ran the specified read-only SQL in the Supabase Dashboard SQL Editor and the results were relayed verbatim (confirmed twice per Mehdi's explicit clarification) to this continuation agent, which recorded them here without further code changes.

## Issues Encountered

None beyond the expected human-action pause (this is the plan's designed checkpoint, not an error).

## User Setup Required

None - no external service configuration required. The human action already performed (running the 3 read-only SQL queries) was the plan's designed checkpoint, not a setup step.

## Next Phase Readiness

- Plan 02 (`schema.sql` regeneration) is fully unblocked: it has the verbatim `devis_statut_check` value list and the RLS default-deny state for the 3 new tables, both required by its `must_haves`.
- Plan 03 (fresh-bootstrap verification) can reuse `scripts/introspect-schema.js --compare` as-is; no further tooling work needed.
- No blockers carried forward.

---
*Phase: 19-schema-sql-regeneration*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: scripts/introspect-schema.js
- FOUND: ab4523d (git log)
- FOUND: .planning/phases/19-schema-sql-regeneration/19-01-SUMMARY.md
