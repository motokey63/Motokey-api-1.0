---
phase: 21
slug: migrations-r-troactives-mise-jour-schema-sql
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no pytest/jest) — pure SQL/DDL phase in a project with no SQL test harness |
| **Config file** | none |
| **Quick run command** | `node scripts/introspect-schema.js` (live prod introspection, ~2s, requires `.env`) |
| **Full suite command** | Manual fresh-project bootstrap — explicitly Phase 22's (SCHEMA-07) responsibility, not this phase's |
| **Estimated runtime** | ~2s for the quick introspection check |

---

## Sampling Rate

- **After every task commit:** Manual column-by-column diff against `20-FINDINGS.md` (Gap A) or source migration files (Gap B) — no automated SQL-correctness test exists in this repo
- **After every plan wave:** Re-run `node scripts/introspect-schema.js` to confirm prod hasn't drifted further since Phase 20's snapshot (sanity check, not a schema.sql validator)
- **Before `/gsd:verify-work`:** Textual/manual verification only (grep-based column presence checks, diff-against-source-file checks) — full live-bootstrap SQL syntax validation is deferred to Phase 22, matching Phase 19's own precedent (its verification report scored "no local psql available" as non-blocking)
- **Max feedback latency:** ~2s (introspection script)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-XX | 01 | 1 | SCHEMA-04 | manual review | `ls sql/migrations/2*.sql` + read each file for origin comments | ✅ (files created this phase) | ⬜ pending |
| 21-0X-XX | TBD | TBD | SCHEMA-05 | manual diff | `grep -A3 "CREATE TABLE garages\|CREATE TABLE clients\|CREATE TABLE interventions\|CREATE TABLE devis" schema.sql` + column-by-column check vs 20-FINDINGS.md | ✅ | ⬜ pending |
| 21-0X-XX | TBD | TBD | SCHEMA-06 | manual diff (verbatim copy) | manual diff vs `sql/migrations/13_liaison_client_moto.sql` / `15_billing_foundation.sql` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No local Postgres/psql/pglast available in this environment to syntax-check `schema.sql` or new migration files before commit — the plan must rely on: (1) visual review, (2) `node scripts/introspect-schema.js` for live prod column confirmation (Gap A only), (3) explicit textual diff against source files (Gap B), (4) defer full live-bootstrap SQL syntax validation to Phase 22 (SCHEMA-07)

*No test framework install needed — this phase produces no application code, only SQL DDL files and documentation edits.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Retroactive migration files have correct DDL + origin comments | SCHEMA-04 | No SQL syntax checker available in this environment; origin attribution requires reading 20-FINDINGS.md's verdicts, a judgment task | Read each new `sql/migrations/2N_*.sql` file, confirm every column from Gap A appears with type/nullable/default matching `20-FINDINGS.md`'s EXACT cells, and a comment citing the origin verdict (commit hash, "code-catch-up", "ghost — confirmed", or "ghost — unknown") |
| schema.sql column additions match prod exactly | SCHEMA-05 | No live Postgres available to instantiate and diff; correctness depends on transcribing `20-FINDINGS.md` values correctly | For each of `garages`/`clients`/`interventions`/`devis`, grep the CREATE TABLE block in `schema.sql` and manually compare every added column's type/nullable/default/constraint against the corresponding row in `20-FINDINGS.md` |
| Gap B DDL is a faithful copy | SCHEMA-06 | Requires reading two files side-by-side; a `diff`-style manual comparison, since the source DDL must be preserved verbatim (not re-derived) | Compare `schema.sql`'s new `billing_events`/`motos_proprietaires_historique`/`liaisons_client_garage`/`reclamations_moto` table blocks and `v_motos_avec_proprietaire` view against `sql/migrations/13_liaison_client_moto.sql` and `15_billing_foundation.sql` verbatim |
| FK-to-out-of-scope-table landmine avoided | SCHEMA-05 (correctness) | Requires judgment — the column must be added without its FK constraint, since the referenced tables (`entites_facturation`, `factures_scannees`) are explicitly out of scope for this milestone | Confirm `devis.entite_facturation_id` and `interventions.facture_id` appear in schema.sql with correct type/nullable but WITHOUT a `REFERENCES` clause, and carry a comment explaining the FK is omitted because the target table is out of scope |
| NETTOYAGE block updated for new objects | SCHEMA-06 (idempotent re-bootstrap) | Requires manual tracing of what a second bootstrap run would do | Confirm `schema.sql`'s DROP TABLE/VIEW/TYPE section includes entries for all new Gap B objects and any new ENUM types (`client_type_enum`, `mode_acquisition_enum`) so re-running schema.sql twice doesn't error |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — Wave 0 gap (no local Postgres) is explicitly documented above and deferred to Phase 22 per Phase 19 precedent
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — N/A, this phase relies on documented manual/textual verification throughout, consistent with its Wave 0 gap
- [x] Wave 0 covers all MISSING references — the single Wave 0 gap (no SQL syntax checker) is listed above with its accepted mitigation
- [x] No watch-mode flags — N/A, no test runner used
- [x] Feedback latency < 2s — introspection script is the only automated check, ~2s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
