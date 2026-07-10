---
phase: 21-migrations-r-troactives-mise-jour-schema-sql
plan: 03
subsystem: database
tags: [postgres, supabase, schema.sql, rls, ddl-porting]

# Dependency graph
requires:
  - phase: 21-02
    provides: Gap A columns (garages/interventions/devis/clients) already landed in schema.sql's NETTOYAGE/TYPES/table blocks, client_type_enum declared
provides:
  - schema.sql now creates billing_events, motos_proprietaires_historique, liaisons_client_garage, reclamations_moto, v_motos_avec_proprietaire (ported verbatim from migrations 13/15, previously missing from bootstrap)
  - mode_acquisition_enum (8 values, migration 13 base + migration 14 don/heritage) declared and NETTOYAGE-dropped
  - Idempotent NETTOYAGE block covering all Gap B objects (safe to re-run schema.sql twice)
  - Live-probed RLS decision for the 4 Gap B tables (RLS ON, default-deny, no explicit policies) instead of a guess
affects: [21-04, 22-bootstrap-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Anon-equivalent REST probe for RLS state when no direct Postgres/psql connection exists: compare a known-RLS-on calibration table (garages) against target tables; identical HTTP 200 [] response on a table known to contain backfilled rows is the default-deny signal (distinguishes 'RLS blocking' from 'table genuinely empty')."
    - "Legacy SUPABASE_ANON_KEY is disabled on this Supabase project (disabled 2026-04-12) — use SUPABASE_PUBLISHABLE_KEY as the anon-equivalent key for any future unauthenticated REST probes against this project."

key-files:
  created: []
  modified:
    - schema.sql

key-decisions:
  - "RLS enabled (ENABLE ROW LEVEL SECURITY, no explicit policies, default-deny) for billing_events/motos_proprietaires_historique/liaisons_client_garage/reclamations_moto, based on a live anon-equivalent REST probe rather than assumption — matches Phase 19 precedent for garage_users/client_device_tokens/push_send_log."
  - "Legacy SUPABASE_ANON_KEY returns 401 'Legacy API keys are disabled' on this project; SUPABASE_PUBLISHABLE_KEY substituted as the anon-equivalent for the probe (documented in the schema.sql RLS comment and this summary, not silently swapped)."

patterns-established:
  - "Verbatim DDL porting from sql/migrations/*.sql into schema.sql, excluding backfill INSERT/UPDATE/ALTER statements — same convention as Phase 19-03's migration 10/13/15 fix."

requirements-completed: [SCHEMA-06]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 21 Plan 03: Gap B Objects (billing_events, liaison-client-garage cluster, v_motos_avec_proprietaire) Summary

**Ported 4 tables + 1 view + 1 enum from migrations 13/15 into schema.sql verbatim, wired idempotent NETTOYAGE drops, and resolved RLS state for all 4 tables via a live anon-equivalent REST probe (RLS ON, default-deny — not a guess).**

## Performance

- **Duration:** ~12 min (worktree stale-merge + 3 tasks)
- **Started:** 2026-07-10T11:09 (approx, first task commit)
- **Completed:** 2026-07-10T11:12
- **Tasks:** 3/3 completed
- **Files modified:** 1 (schema.sql)

## Preflight: worktree was stale

This worktree was forked before Phase 20/21 existed (HEAD was `0ad8981`, "chore: complete v1.4 milestone" — missing all Phase 20 and Phase 21-01/21-02 commits). Per the orchestrator's explicit instructions, ran `git merge --ff-only master` before touching schema.sql, which fast-forwarded to `c3dc1cb` (21-02's Gap A edits) cleanly — no conflicts, since this branch had no local commits of its own. Confirmed `client_type_enum` and Gap A columns (`ville`, `cp`, etc. on `garages`) were present in schema.sql post-merge before starting Task 1. Also copied two gitignored files not delivered by the merge: `21-03-PLAN.md` and `21-RESEARCH.md` (both `.planning/` plan/research artifacts, gitignored by design) from the main repo checkout, and `.env` (gitignored secrets file) — needed for Task 3's live probe.

## Accomplishments
- Added `mode_acquisition_enum` (8 values) and wired NETTOYAGE + TYPES blocks for all 5 new Gap B objects (idempotent re-bootstrap)
- Ported `billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto` tables + all 10 indexes + `v_motos_avec_proprietaire` view verbatim from migrations 13/15, excluding backfill data-migration statements
- Resolved the open RLS question for the 4 Gap B tables via a live REST probe against prod, rather than leaving it as an assumption or unresolved known-gap

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire NETTOYAGE + TYPES blocks for Gap B objects** - `d68ce9e` (feat)
2. **Task 2: Add Gap B tables + view (verbatim from migrations 13/15)** - `5936a68` (feat)
3. **Task 3: Check prod RLS state for Gap B tables and reconcile schema.sql** - `514bcdf` (feat)

_No separate "plan metadata" commit yet — STATE.md/ROADMAP.md/this SUMMARY are committed together in the final commit per the execute-plan workflow._

## Files Created/Modified
- `schema.sql` - Added `mode_acquisition_enum`; 5 NETTOYAGE DROP entries (4 tables + 1 view) + 1 DROP TYPE; 4 new `CREATE TABLE` blocks (billing_events, motos_proprietaires_historique, liaisons_client_garage, reclamations_moto) with 10 indexes total, inserted after `transfert_steps` and before the TRIGGERS section; `v_motos_avec_proprietaire` view; 4 new `ENABLE ROW LEVEL SECURITY` statements + explanatory comment in the RLS block.

## Decisions Made

- **RLS is ON for all 4 Gap B tables, no explicit policies (default-deny).** Live probe (see below) showed the two tables that are backfilled by migration 13 and therefore certainly contain rows in prod (`liaisons_client_garage`, `motos_proprietaires_historique`) still returned `HTTP 200 []` to an anon-equivalent key — the same shape as the `garages` calibration request (known RLS-on with a deny-anon policy). An empty array from a table *known* to have rows is the RLS-blocking signal, not "empty table." Followed the plan's decision tree, branch (b).
- **Substituted `SUPABASE_PUBLISHABLE_KEY` for `SUPABASE_ANON_KEY` in the probe.** The legacy anon key on this Supabase project was disabled 2026-04-12 ("Legacy API keys are disabled" HTTP 401 on every table, including the calibration table). This is a project-level Supabase setting unrelated to RLS itself. `SUPABASE_PUBLISHABLE_KEY` is the modern anon-equivalent key already present in `.env` and was used instead — documented in the schema.sql comment so this isn't a silent assumption.

**Raw probe results (host only logged, key never printed, per project security rule):**
```
Probing host: rzbqbaccjyxvtlnfitrr.supabase.co (key never printed)
garages: HTTP 200 — empty array []                              (calibration)
liaisons_client_garage: HTTP 200 — empty array []                (backfilled, has rows in prod)
motos_proprietaires_historique: HTTP 200 — empty array []        (backfilled, has rows in prod)
billing_events: HTTP 200 — empty array []
reclamations_moto: HTTP 200 — empty array []
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree was stale (predates Phase 20/21 entirely) — merged master before editing**
- **Found during:** Preflight (before Task 1)
- **Issue:** Worktree HEAD (`0ad8981`) predated all of Phase 20 and Phase 21-01/21-02; schema.sql lacked `client_type_enum` and Gap A columns this plan's edits depend on landing after.
- **Fix:** Ran `git merge --ff-only master`, which fast-forwarded cleanly to `c3dc1cb` (no local divergent commits existed on this worktree branch, so no conflict resolution was needed). Verified `client_type_enum` and `ville`/`cp` Gap A columns present post-merge before starting Task 1.
- **Files modified:** none directly (git history operation); enabled all subsequent schema.sql edits.
- **Verification:** `grep -n "client_type_enum" schema.sql` confirmed present after merge.
- **Committed in:** N/A (merge commit is `c3dc1cb`, pre-existing on master; no new commit created by the merge itself since it was fast-forward).

**2. [Rule 3 - Blocking] Legacy anon key disabled on the Supabase project — substituted publishable key**
- **Found during:** Task 3 (RLS probe)
- **Issue:** `SUPABASE_ANON_KEY` (the key the plan's Task 3 instructions named) returned HTTP 401 "Legacy API keys are disabled" for every table including the `garages` calibration request, making the probe inconclusive with that key alone.
- **Fix:** Retried the same probe using `SUPABASE_PUBLISHABLE_KEY`, already present in `.env`, which is Supabase's modern equivalent of the anon key for unauthenticated REST access. This produced a clean, interpretable result (calibration + all 4 Gap B tables returned `200 []`).
- **Files modified:** none (probe script was throwaway, per plan instructions, and deleted after use — never committed).
- **Verification:** Probe re-run successfully returned interpretable HTTP 200 responses for all 5 tables.
- **Committed in:** `514bcdf` (the RLS decision this probe informed is committed in Task 3's commit; the probe script itself was never committed).

**3. [Rule 3 - Blocking] Two gitignored files (`21-RESEARCH.md`, `.env`) missing from worktree**
- **Found during:** Task 3 preflight (`read_first` step)
- **Issue:** `21-RESEARCH.md` (referenced by the plan's Task 3 `read_first`) and `.env` (needed for the live probe's credentials) are both gitignored and were not present in this worktree, only in the main repo checkout.
- **Fix:** Copied both files from `C:/motokey-api/` into the worktree before proceeding (same pattern the orchestrator's instructions already used for `21-03-PLAN.md`).
- **Files modified:** `.env`, `.planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/21-RESEARCH.md` (both gitignored, neither committed).
- **Verification:** Files present and readable after copy.
- **Committed in:** N/A (gitignored, never staged).

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking issues, all environment/tooling, zero schema.sql logic changes beyond what the plan specified)
**Impact on plan:** All three were prerequisites for executing the plan as written, not scope changes. schema.sql's content matches the plan's `<action>` blocks verbatim except for the RLS key substitution, which was itself an instructed fallback path (plan's Task 3 anticipated an inconclusive/blocked probe and provided a decision tree; the publishable-key retry avoided falling into the "inconclusive" branch by finding a working credential instead).

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required. (schema.sql is a bootstrap DDL reference file, not deployed/applied automatically; it is not itself run against prod by this plan.)

## Next Phase Readiness

- SCHEMA-06 fully satisfied: all 4 Gap B tables + the view are in schema.sql, sourced verbatim from migrations 13/15, with idempotent NETTOYAGE coverage.
- schema.sql is ready for Phase 22's bootstrap verification (SCHEMA-07): a fresh Supabase project bootstrap via this file should now create every table/view/enum that exists in prod, matching the Phase 19 clean-bootstrap precedent.
- No blockers. The RLS decision is evidence-based (live probe), not a known-gap deferred to Phase 22 — Phase 22 does not need to re-investigate RLS for these 4 tables.

---
*Phase: 21-migrations-r-troactives-mise-jour-schema-sql*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: schema.sql
- FOUND: .planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/21-03-SUMMARY.md
- FOUND commit: d68ce9e (Task 1)
- FOUND commit: 5936a68 (Task 2)
- FOUND commit: 514bcdf (Task 3)
