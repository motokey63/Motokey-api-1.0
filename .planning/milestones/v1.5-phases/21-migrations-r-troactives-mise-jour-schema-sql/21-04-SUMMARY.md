---
phase: 21-migrations-r-troactives-mise-jour-schema-sql
plan: 04
subsystem: database
tags: [postgres, supabase, schema.sql, verification, gap-closure]

# Dependency graph
requires:
  - phase: 21-01
    provides: retroactive migration files (sql/migrations/20, 21, 22) documenting Gap A columns
  - phase: 21-02
    provides: Gap A columns (garages/clients/interventions/devis) landed in schema.sql
  - phase: 21-03
    provides: Gap B objects (billing_events, motos_proprietaires_historique, liaisons_client_garage, reclamations_moto, v_motos_avec_proprietaire, mode_acquisition_enum, RLS) landed in schema.sql
provides:
  - Phase-gate verification report proving SCHEMA-05 + SCHEMA-06 completeness with grep-based evidence
  - Confirmation no remaining undocumented Gap A/Gap B object exists in schema.sql
  - Confirmation no out-of-scope FK (factures_scannees, entites_facturation) leaked into schema.sql
  - Live prod introspection sanity check confirming prod unchanged since Phase 20's snapshot
affects: [22-bootstrap-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only phase-gate verification plan: no code/schema edits, only grep-based presence diffs + a live introspection sanity check, output is exclusively a SUMMARY.md report"

key-files:
  created:
    - .planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/21-04-SUMMARY.md
  modified: []

key-decisions:
  - "Verification is textual/grep-based plus a live prod introspection sanity check — full live-bootstrap SQL syntax validation against a fresh Supabase project is explicitly out of scope here and deferred to Phase 22 (SCHEMA-07), consistent with Phase 19's precedent."

patterns-established: []

requirements-completed: [SCHEMA-05, SCHEMA-06]

# Metrics
duration: ~25min (excluding worktree stale-merge preflight)
completed: 2026-07-10
---

# Phase 21 Plan 04: Gap A/Gap B Completeness Verification Summary

**Grep-based presence diff confirms all 39 Gap A columns (5 garages + 5 clients + 4 interventions + 25 devis) and all 5 Gap B objects (4 tables + 1 view) are present in schema.sql with correct constraints, no stale devis columns remain, no out-of-scope FK leaked, and a live prod introspection sanity check confirms prod is unchanged since Phase 20 — all PASS.**

## Performance

- **Duration:** ~25 min of verification work (plus a stale-worktree preflight merge, documented below)
- **Started:** 2026-07-10T13:18:06Z
- **Completed:** 2026-07-10T16:58:48Z
- **Tasks:** 2/2 completed
- **Files modified:** 0 (read-only verification plan; only artifact produced is this SUMMARY.md)

## Preflight: worktree was stale

This worktree was forked before Phase 20/21 existed (HEAD was `0ad8981`, "chore: complete v1.4 milestone" — missing all of Phase 20 and Phase 21-01/21-02/21-03). Per the orchestrator's explicit instructions, ran `git merge --ff-only master` before doing any verification work, which fast-forwarded cleanly to `5dcd84e` (21-03's final commit, no local divergent commits on this branch, no conflicts). Confirmed post-merge that `schema.sql` contained both the Gap A columns (21-02) and the Gap B objects (21-03) before starting Task 1.

Also copied two gitignored files not delivered by the merge (per the same pattern used by 21-02/21-03):
- `.planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/21-04-PLAN.md` (plan artifact, gitignored by design)
- `.env` (gitignored secrets, needed for Task 2's live introspection sanity check)

## Accomplishments

- Confirmed all 39 Gap A columns (garages 5, clients 5, interventions 4, devis 25) are present in `schema.sql` with correct types/nullability/defaults/constraints
- Confirmed the 10 stale legacy `devis` columns are fully removed from the `devis` CREATE TABLE block
- Confirmed zero out-of-scope FK references (`factures_scannees`, `entites_facturation`) leaked into `schema.sql`
- Confirmed all 4 Gap B tables + 1 view are verbatim ports of migrations 13/15 (no backfill INSERT/UPDATE statements copied), with correct NETTOYAGE idempotency ordering and RLS enablement
- Ran `node scripts/introspect-schema.js` against live prod — exit code 0, all 4 Gap B tables confirmed present in prod's live schema, narrow-scope assertions PASS

## Task Commits

This is a read-only verification plan (`files_modified: []` per plan frontmatter) — no schema.sql or application code was edited, so there are no per-task feature/fix commits. Both tasks consisted entirely of read/grep/verify actions culminating in this SUMMARY.md.

1. **Task 1: Verify Gap A completeness in schema.sql vs 20-FINDINGS.md** - no code commit (read-only verification)
2. **Task 2: Verify Gap B faithful-copy + NETTOYAGE + live prod sanity check** - no code commit (read-only verification)

**Plan metadata:** committed together with STATE.md/ROADMAP.md/REQUIREMENTS.md in the final commit per the execute-plan workflow.

## Files Created/Modified

- `.planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/21-04-SUMMARY.md` - this verification report

## Decisions Made

- Followed the plan's explicit scope boundary: verification is grep/textual-diff based plus a live introspection sanity check, not a full live-bootstrap SQL syntax validation (that remains deferred to Phase 22 / SCHEMA-07, per the plan's own objective statement and Phase 19's precedent).

## Verification Results

### Task 1 — Gap A completeness (garages / clients / interventions / devis)

| Check | Result | Evidence |
|---|---|---|
| `garages` 5 columns (`ville`, `cp`, `type`, `marque_officielle`, `actif`) present with correct constraints | **PASS** | `schema.sql` L124-128: `ville TEXT`, `cp TEXT`, `type TEXT NOT NULL DEFAULT 'pro'`, `marque_officielle TEXT`, `actif BOOLEAN NOT NULL DEFAULT true` — matches 20-FINDINGS.md baseline exactly |
| `clients` 5 columns + `client_type_enum` + constraint + index + comments | **PASS** | L169-173 (5 columns), L78/92 (`client_type_enum` CREATE + DROP), L179-182 (`clients_pro_requirements` CHECK), L673 (`idx_clients_siret` UNIQUE INDEX), L675-679 (5 `COMMENT ON COLUMN clients.*` lines) |
| `interventions` 4 columns (`niveau_preuve` with CHECK, `facture_id` no REFERENCES, `operation_code`, `photo_url`) | **PASS** | L312-315: `niveau_preuve TEXT DEFAULT 'declare' CHECK (... IN ('facture','visuel','declare'))`, `facture_id UUID` (no REFERENCES clause, documented as intentional omission), `operation_code TEXT`, `photo_url TEXT` |
| `devis` 25 Gap A columns present | **PASS** | L359-387: `client_nom`, `client_adresse`, `client_cp`, `client_ville`, `client_email`, `client_tel`, `client_siret`, `client_tva`, `client_id`, `moto_label`, `moto_vin`, `moto_km`, `lignes`, `total_ht`, `total_tva`, `remise_montant`, `date_creation`, `date_validite`, `date_envoi`, `date_acceptation`, `date_refus`, `or_id`, `notes`, `cree_par`, `entite_facturation_id` — all 25 confirmed present, count matches 20-FINDINGS.md exactly |
| 10 stale `devis` columns removed (`technicien_id`, `total_mo_ht`, `total_pieces_ht`, `remise_lignes`, `sous_total_ht`, `remise_globale`, `base_ht`, `tva_montant`, `valide_at`, `expire_at`) | **PASS** | Visual inspection of the full `devis` CREATE TABLE block (L345-390): none of the 10 stale names appear. (Incidental substring matches for `technicien_id` and `expire_at` exist elsewhere in schema.sql — `interventions.technicien_id` L295 and `transferts.expire_at` L460 — both legitimate pre-existing columns on unrelated tables, confirmed by reading those blocks directly, not the stale devis columns.) |
| FK landmine: no `REFERENCES factures_scannees` / `REFERENCES entites_facturation` | **PASS** | `grep -c "REFERENCES factures_scannees\|REFERENCES entites_facturation" schema.sql` → **0** |

**Task 1 automated verify command output:**
```
$ grep -c "REFERENCES factures_scannees\|REFERENCES entites_facturation" schema.sql
0

$ grep -n "client_type\|clients_pro_requirements\|idx_clients_siret\|entite_facturation_id\|niveau_preuve" schema.sql
78:DROP TYPE  IF EXISTS client_type_enum       CASCADE;
92:CREATE TYPE client_type_enum      AS ENUM ('particulier','pro');
169:  client_type          client_type_enum NOT NULL DEFAULT 'particulier',
179:  CONSTRAINT clients_pro_requirements CHECK (
180:    client_type = 'particulier'
181:    OR (client_type = 'pro' AND raison_sociale IS NOT NULL AND siret IS NOT NULL)
312:  niveau_preuve   TEXT DEFAULT 'declare' CHECK (niveau_preuve IN ('facture','visuel','declare')),
387:  entite_facturation_id UUID NOT NULL,
673:CREATE UNIQUE INDEX idx_clients_siret ON clients(siret) WHERE siret IS NOT NULL;
675:COMMENT ON COLUMN clients.client_type IS ...
676:COMMENT ON COLUMN clients.siret IS ...
678:COMMENT ON COLUMN clients.raison_sociale IS ...
```

### Task 2 — Gap B faithful-copy + NETTOYAGE + live prod sanity check

| Check | Result | Evidence |
|---|---|---|
| `billing_events` verbatim copy of migration 15 (minus backfill) | **PASS** | `schema.sql` L490-500 field-by-field identical to `sql/migrations/15_billing_foundation.sql` L27-39 (same columns, types, NOT NULL, UNIQUE, index, comments) |
| `motos_proprietaires_historique` verbatim copy of migration 13 (minus backfill INSERT) | **PASS** | `schema.sql` L503-525 identical to migration 13 L32-58 including `historique_coherence` CHECK and all 4 indexes; the backfill `INSERT INTO motos_proprietaires_historique ...` (migration 13 L61-66) correctly excluded |
| `liaisons_client_garage` verbatim copy of migration 13 (minus backfill INSERT) | **PASS** | `schema.sql` L528-540 identical to migration 13 L69-82; backfill `INSERT ... ON CONFLICT DO NOTHING` (migration 13 L84-88) correctly excluded |
| `reclamations_moto` verbatim copy of migration 13 | **PASS** | `schema.sql` L543-558 identical to migration 13 L91-107 (no backfill exists for this table in the source migration) |
| `v_motos_avec_proprietaire` view verbatim copy of migration 13 | **PASS** | `schema.sql` L561-574 identical `SELECT`/`CASE`/`LEFT JOIN` logic to migration 13 L115-128 |
| `mode_acquisition_enum` — 8 values declared, dropped in NETTOYAGE | **PASS** | `schema.sql` L93: `CREATE TYPE mode_acquisition_enum AS ENUM ('achat_neuf','achat_occasion','reprise_garage','cession_perso','mise_en_stock','inconnu','don','heritage')` — 8 values, matching migration 13's base 6 (`achat_neuf`...`inconnu`) plus migration 14's 2 additions (`don`, `heritage`, confirmed by reading `sql/migrations/14_extend_mode_acquisition_enum.sql`). L79: `DROP TYPE IF EXISTS mode_acquisition_enum CASCADE` present |
| NETTOYAGE idempotency — all 4 Gap B tables + view DROP'd before parent tables | **PASS** | `schema.sql` L51-55: `v_motos_avec_proprietaire` view, `reclamations_moto`, `liaisons_client_garage`, `motos_proprietaires_historique`, `billing_events` all dropped near the top of NETTOYAGE, ahead of `clients`/`garages`/`motos` (L66-69) |
| No backfill INSERT/UPDATE statements leaked into schema.sql | **PASS** | `grep -n "INSERT INTO\|Backfill" schema.sql` → 0 matches |
| 4 new `ENABLE ROW LEVEL SECURITY` lines for Gap B tables | **PASS** | `schema.sql` L702-705: `billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto` all present |
| Live prod sanity check via `node scripts/introspect-schema.js` | **PASS** | Exit code 0. Output lists all 4 Gap B tables among prod's 38 tables (`billing_events` at output L20, `liaisons_client_garage` at L358, `motos_proprietaires_historique` at L415, `reclamations_moto` at L591). Narrow-scope assertions (Phase 19/SCHEMA-01, unrelated to Gap B but confirms prod reachability) all PASS: `RESULT: PASS — all narrow-scope objects confirmed present in prod.` |
| Scope note recorded | **PASS** | This section explicitly states: full live-bootstrap SQL syntax validation (instantiating schema.sql against a fresh Supabase project) is **not** claimed to have been performed by this plan and is deferred to Phase 22 / SCHEMA-07. The `node scripts/introspect-schema.js` run confirms prod reachability and that prod's live tables match the expected Gap B names — it does **not** validate schema.sql's own SQL syntax. |

**Task 2 automated verify command output:**
```
$ grep -c "DROP TABLE IF EXISTS billing_events\|DROP TABLE IF EXISTS reclamations_moto\|DROP TABLE IF EXISTS liaisons_client_garage\|DROP TABLE IF EXISTS motos_proprietaires_historique\|DROP VIEW  IF EXISTS v_motos_avec_proprietaire" schema.sql
5

$ grep -n "CREATE TYPE mode_acquisition_enum" schema.sql
93:CREATE TYPE mode_acquisition_enum AS ENUM ('achat_neuf','achat_occasion','reprise_garage','cession_perso','mise_en_stock','inconnu','don','heritage');

$ grep -n "DROP TYPE  IF EXISTS mode_acquisition_enum" schema.sql
79:DROP TYPE  IF EXISTS mode_acquisition_enum     CASCADE;

$ grep -n "INSERT INTO\|Backfill" schema.sql
(0 matches)

$ node scripts/introspect-schema.js
(exit code 0)
RESULT: PASS — all narrow-scope objects confirmed present in prod.
```

## Observation (informational, not a gap, not fixed — out of scope for this read-only plan)

`schema.sql`'s header comment block (L1-40) still describes the **pre-21-02/21-03 state** — it says "Ce fichier reflète le schéma prod pour les objets des migrations 1–19 UNIQUEMENT" and lists the Gap A/Gap B objects as *not yet covered*, when in fact (per this verification) they are now fully covered as of 21-02/21-03. This is stale documentation, not a functional gap — every column/object the header claims is missing is actually present and verified PASS above. Recommend a lightweight header cleanup in a follow-up plan (or as part of Phase 22) so the header accurately reflects post-Phase-21 state; not fixed here because this plan's `files_modified` is explicitly empty (read-only verification).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree was stale (predates Phase 20/21 entirely) — merged master before verifying**
- **Found during:** Preflight (before Task 1)
- **Issue:** Worktree HEAD (`0ad8981`) predated all of Phase 20 and Phase 21-01/21-02/21-03; `schema.sql` in this worktree lacked both Gap A and Gap B objects this plan needed to verify.
- **Fix:** Ran `git merge --ff-only master`, fast-forwarding cleanly to `5dcd84e` (no local divergent commits existed, no conflicts). Verified Gap A columns and Gap B objects present in `schema.sql` post-merge before starting Task 1.
- **Files modified:** none directly (git history operation); enabled all subsequent verification reads.
- **Verification:** `git log --oneline -5` post-merge showed `5dcd84e` as HEAD, matching `origin/master`.
- **Committed in:** N/A (fast-forward merge, no new commit created).

**2. [Rule 3 - Blocking] Two gitignored files missing from worktree**
- **Found during:** Preflight and Task 2 preflight
- **Issue:** `21-04-PLAN.md` (the plan itself) and `.env` (needed for Task 2's live introspection sanity check) are both gitignored and were not present in this worktree, only in the main repo checkout.
- **Fix:** Copied both files from `C:/motokey-api/` into the worktree.
- **Files modified:** `.planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/21-04-PLAN.md`, `.env` (both gitignored, neither committed).
- **Verification:** Files present and readable after copy; `node scripts/introspect-schema.js` ran successfully using the copied `.env`.
- **Committed in:** N/A (gitignored, never staged).

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking/environment issues, zero schema.sql content changes since this is a read-only verification plan)
**Impact on plan:** Both were prerequisites for executing the plan as written (needed a non-stale schema.sql and a working `.env` to run the live sanity check), not scope changes.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required. This plan performed a read-only verification against the existing `schema.sql` and a read-only introspection query against prod; nothing was deployed or modified.

## Next Phase Readiness

- SCHEMA-05 and SCHEMA-06 are both confirmed complete by this verification: every Gap A column and every Gap B object claimed by 21-02/21-03 is actually present in `schema.sql` with correct constraints, and no residual gap was found.
- No follow-up gap-closure plan is needed — all checklists PASS with zero exceptions.
- Phase 22 (SCHEMA-07, live-bootstrap syntax validation against a fresh Supabase project) can proceed without re-investigating Gap A/Gap B completeness; it should still perform the actual bootstrap-and-diff since that is explicitly out of this plan's scope.
- Minor informational item for a future plan: `schema.sql`'s header comment block is stale (describes pre-Phase-21 gaps that are now closed) — recommend cleanup, not blocking.

---
*Phase: 21-migrations-r-troactives-mise-jour-schema-sql*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: schema.sql (verified via Read tool, Gap A + Gap B sections confirmed present)
- FOUND: .planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/21-04-SUMMARY.md
- FOUND: .planning/phases/20-introspection-corr-lation-d-origine/20-FINDINGS.md (source of truth for Gap A checklist)
- FOUND: sql/migrations/13_liaison_client_moto.sql, sql/migrations/15_billing_foundation.sql (source of truth for Gap B checklist)
- CONFIRMED: `node scripts/introspect-schema.js` exit code 0, live prod reachable, all 4 Gap B tables present
