---
phase: 20-introspection-corr-lation-d-origine
plan: 01
subsystem: database
tags: [postgres, supabase, schema-drift, git-archaeology, postgrest]

# Dependency graph
requires:
  - phase: 19-schema-sql-regeneration
    provides: schema.sql regenerated for migrations 1-19, "partial-bootstrap" header flagging the undocumented drift this phase investigates
provides:
  - "20-FINDINGS.md: durable per-column findings artifact for all 39 undocumented columns across garages/clients/interventions/devis"
  - "clients cluster (5 cols) fully resolved via migrations/04-rbac-migration.sql @ c66ad69 — zero further work needed"
  - "9 confirmed ghost columns (garages x5, interventions x4) with architectural proof (allowlist/payload absence) — ready list for Mehdi confirmation"
  - "25 devis columns classified as code-catch-up (not true origin) with two anchor commits (f2d7d9a, b29d4f5) and per-column disambiguation notes"
affects: [21-retroactive-migrations, 22-bootstrap-verification-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns: ["git log -S pickaxe + diff-opening disambiguation for column-origin correlation", "allowlist/payload architectural cross-check to upgrade a ghost-column verdict from grep-absence to code-unreachability"]

key-files:
  created:
    - .planning/phases/20-introspection-corr-lation-d-origine/20-FINDINGS.md
  modified: []

key-decisions:
  - "Used LIVE introspection (re-run this session) as authoritative over 20-RESEARCH.md's estimates — confirmed zero drift since research, only a counting correction (devis: 25 actual vs '~24' estimated)"
  - "Classified garages.type as a 9th ghost column (not left ambiguous) per architectural confirmation (absent from Garages.update() allowlist) despite 'type' being too generic a token to pickaxe-search directly"
  - "Recorded devis columns' origin as 'code awareness' (b29d4f5/f2d7d9a) rather than a false 'origin' claim, per Pitfall 2 — true DB origin explicitly flagged unknown/earlier, deferred to Mehdi in plan 02"

patterns-established:
  - "Findings artifact separates 'baseline' (type/nullable/default/FK, HIGH confidence from live introspection) from 'origin verdict' (commit/ghost/code-catch-up, verified via diff-opening not raw pickaxe hits) from 'EXACT' (pg catalog precision/CHECK text, explicitly deferred to plan 02) — three independent confidence tiers, never conflated"

requirements-completed: [SCHEMA-02, SCHEMA-03]

# Metrics
duration: ~20min
completed: 2026-07-09
---

# Phase 20 Plan 01: Introspection & Origin Correlation Summary

**Produced 20-FINDINGS.md classifying all 39 undocumented columns on `garages`/`clients`/`interventions`/`devis`: 5 resolved by an existing legacy migration file, 9 confirmed ghost columns (zero code trail, architecturally unreachable), and 25 `devis` columns traced to two "code-catch-up" commits with true DB origin flagged unknown.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-09T16:13:20Z (approx., per STATE.md session marker)
- **Completed:** 2026-07-09T16:23:41Z
- **Tasks:** 2/2 completed
- **Files modified:** 1 (`.planning/phases/20-introspection-corr-lation-d-origine/20-FINDINGS.md`, created)

## Accomplishments
- Re-ran `scripts/introspect-schema.js` live against prod and confirmed the undocumented column sets for all 4 tables match 20-RESEARCH.md exactly (only a counting correction: `devis` is 25 columns, not "~24")
- Verified `clients`' 5 undocumented columns are fully explained by `migrations/04-rbac-migration.sql` (commit `c66ad69`, 2026-04-14) — read the file in full, cross-checked its DDL against live introspection column-by-column, confirmed exact match including the `clients_pro_requirements` CHECK constraint and the `idx_clients_siret` unique index
- Ran a Pass 0 sweep of both legacy migration directories (`migrations/` 7 files, `sql/migrations/` 10 files) and confirmed none of them cover any `garages`/`interventions`/`devis` undocumented column
- Ran the full `git log -S` pickaxe recipe for every one of the 34 remaining columns (garages x5, interventions x4, devis x25), opened every candidate diff, and rejected 6 false-positive hits caused by shared column names across other tables (`client_ville`, `garage_users.actif`, `catalogue_pieces.actif`, `motos.photo_url`, `liaisons_client_garage.cree_par`, `or_taches.or_id`)
- Confirmed all 9 ghost columns architecturally unreachable by citing the exact allowlist (`Garages.update()`, `supabase.js` L186) and literal insert payload (`Interventions.create()`, `supabase.js` L397-408) that would need to include them for any write path to exist
- Classified all 25 `devis` columns as "code-catch-up" per Pitfall 2 — the two anchor commits (`f2d7d9a` 2026-05-11 for date_acceptation/date_refus, `b29d4f5`/`af3b15f` 2026-07-04 for the remaining 23) explicitly describe reconciling code to an already-drifted database, not introducing the columns

## Task Commits

Each task was committed atomically:

1. **Task 1: Fresh baseline + legacy-migration cross-reference — create 20-FINDINGS.md** - `62da601` (docs)
2. **Task 2: Full git-log-S origin sweep (SCHEMA-03) with disambiguation** - `621d2df` (docs)

**Plan metadata:** pending (this SUMMARY.md + STATE.md/ROADMAP.md commit, next step)

## Files Created/Modified
- `.planning/phases/20-introspection-corr-lation-d-origine/20-FINDINGS.md` - The durable per-column findings artifact: completeness checklist (39 columns across 4 tables), full `clients` resolution section, baseline+origin tables for `garages`/`interventions`/`devis`, per-column disambiguation notes, "Ghost columns — pending Mehdi confirmation" list for plan 02's checkpoint

## Decisions Made
- Treated the live PostgREST-OpenAPI re-run as authoritative over the research's estimates (per plan Step A instruction) — this surfaced one honest counting correction (devis: 25 not "~24") which is now recorded explicitly rather than silently carried forward
- For `garages.type`, chose not to run a raw `git log -S"type"` (too generic a token, would return unusable noise across virtually every commit) and instead relied entirely on the architectural allowlist-absence check to reach the ghost-column verdict — documented this reasoning explicitly in the artifact rather than silently skipping the column
- Flagged a genuinely out-of-scope observation (10 columns documented in `schema.sql`'s current `devis` block that do NOT exist live — `technicien_id`, `total_mo_ht`, etc.) without acting on it, since fixing `schema.sql` is Phase 21/22's job, not this investigation-only plan's

## Deviations from Plan

None - plan executed exactly as written. Both tasks' automated verification greps passed on first attempt; no auto-fixes, no blocking issues, no architectural questions arose.

## Issues Encountered
- **Worktree isolation gap:** this agent's git worktree (`.claude/worktrees/agent-a3a062d646584dc39`) had a stale/incomplete `.planning/` directory (missing the entire `phases/20-introspection-corr-lation-d-origine/` subtree, and several top-level docs several sessions behind the shared checkout) — `.planning/` is gitignored so worktree creation doesn't sync it via git. Resolved by copying the phase directory and the 3 actively-changing top-level docs (`PROJECT.md`, `ROADMAP.md`, `STATE.md`) from the shared checkout (`C:\motokey-api\.planning`) into the worktree before starting Task 1, then restoring an over-broad initial bulk-copy of historical `v1.3`/`v1.4` phase docs back to their committed HEAD state (line-ending/stale-content noise, not part of this plan's scope) so the per-task commits stayed scoped to `20-FINDINGS.md` only.
- **`.planning/` requires `git add -f`:** the directory is listed in `.gitignore` (likely to prevent auto-staging of ephemeral `debug/`/`quick/` subdirs), but individual tracked docs are still meant to be committed per this project's established convention (confirmed via `git log` — Phase 19's commits touched `.planning/*.md` directly). Used `git add -f` for `20-FINDINGS.md`, matching the existing pattern.

## User Setup Required

None - no external service configuration required. This is an investigation-only plan; no code, schema, or infrastructure changed.

## Next Phase Readiness

- `20-FINDINGS.md` is ready to be consumed directly by Phase 20 plan 02 (the `EXACT` pg-catalog capture + Mehdi's ghost-column confirmation checkpoint) without any re-discovery.
- Plan 02's checkpoint has an exact, pre-built list of 9 ghost columns to present to Mehdi, plus the `information_schema.columns`/`pg_constraint` queries from 20-RESEARCH.md ready to run for the `EXACT` column.
- Phase 21 (retroactive migrations, SCHEMA-04) can draft `clients`' migration comment directly from this artifact's `clients` section (already has exact DDL + constraint text) without touching Postgres again; for `garages`/`interventions`/`devis` it still needs plan 02's `EXACT` output before writing final column types.
- No blockers. The one open item worth flagging to Mehdi ahead of Phase 21: `schema.sql`'s current `devis` block documents 10 columns (`technicien_id`, `total_mo_ht`, `total_pieces_ht`, `remise_lignes`, `sous_total_ht`, `remise_globale`, `base_ht`, `tva_montant`, `valide_at`, `expire_at`) that do not exist in live prod — likely a stale pre-`b29d4f5` remnant that Phase 21/22's `schema.sql` regeneration should remove, not add to.

---
*Phase: 20-introspection-corr-lation-d-origine*
*Completed: 2026-07-09*

## Self-Check: PASSED

- FOUND: `.planning/phases/20-introspection-corr-lation-d-origine/20-FINDINGS.md`
- FOUND: `.planning/phases/20-introspection-corr-lation-d-origine/20-01-SUMMARY.md`
- FOUND: commit `62da601` (Task 1)
- FOUND: commit `621d2df` (Task 2)
