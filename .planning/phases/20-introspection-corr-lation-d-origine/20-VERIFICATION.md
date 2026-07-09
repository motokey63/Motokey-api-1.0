---
phase: 20-introspection-corr-lation-d-origine
verified: 2026-07-09T00:00:00Z
status: passed
score: 7/7 must-haves verified
---

# Phase 20: Introspection & Corrélation d'Origine Verification Report

**Phase Goal:** Chaque colonne non documentée sur `garages`/`clients`/`interventions`/`devis` (dérive découverte en Phase 19, Gap A) est identifiée avec son type exact, ses contraintes, sa nullabilité, et corrélée à la livraison/fonctionnalité qui l'a introduite via l'historique git.
**Verified:** 2026-07-09
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `20-FINDINGS.md` exists and lists every undocumented column on `garages`/`clients`/`interventions`/`devis`, none of the 4 tables omitted | ✓ VERIFIED | File exists (208 lines). Completeness checklist confirms 5+5+4+25=39 columns. Grepped exact column-name rows: garages=5, clients=5, interventions=4, devis=25 — matches claimed counts exactly. |
| 2 | `clients`' 5 undocumented columns recorded as resolved by `migrations/04-rbac-migration.sql` (commit `c66ad69`) — no re-investigation | ✓ VERIFIED | `migrations/04-rbac-migration.sql` read in full — DDL (client_type ENUM NOT NULL DEFAULT 'particulier', raison_sociale, siret UNIQUE idx, tva_intracom, adresse_facturation, CHECK clients_pro_requirements) matches the FINDINGS.md table verbatim. `git show c66ad69` confirms hash/date/message cited (2026-04-14, "feat(L4): migration RBAC…"). |
| 3 | Each `garages`/`interventions`/`devis` undocumented column has a baseline row (type/nullable/default/FK) AND an origin verdict | ✓ VERIFIED | All 34 rows present with non-empty OpenAPI baseline + origin cells (ghost column / code-catch-up). `grep -c TBD` = 0. |
| 4 | Every undocumented column has EXACT type from `information_schema.columns` (precision/scale/length), not just OpenAPI-collapsed type | ✓ VERIFIED | EXACT column cells populated for all 39 rows, e.g. `NUMERIC(12,2)` for `devis.total_ht`/`total_tva`/`remise_montant`, `TIMESTAMP WITH TIME ZONE` for date columns — not bare "numeric"/"timestamp". |
| 5 | Every explicit CHECK/UNIQUE/FK constraint on the 4 tables captured verbatim from `pg_constraint` (or confirmed "none") | ✓ VERIFIED | Per-table "Constraints (pg_constraint)" subsections present for garages/interventions/devis with verbatim `pg_get_constraintdef`-style text (e.g. `interventions_niveau_preuve_check`, `devis_entite_facturation_id_fkey`) and explicit "aucune contrainte explicite" for columns with none. |
| 6 | The 9 ghost columns carry Mehdi's confirm-or-correct answer | ✓ VERIFIED | "SCHEMA-03 — origine confirmée par Mehdi" section: 2 CONFIRMÉ (`ville`, `cp`) + 7 INCONNU/OUBLIÉ (`type`, `marque_officielle`, `actif`, `niveau_preuve`, `facture_id`, `photo_url`, `operation_code`) = exactly 9, each with an explicit verdict line and terminal-state rationale. |
| 7 | Final artifact accounts for all undocumented columns on all 4 tables — Phase 21 can write retroactive migrations without re-querying prod or re-running git | ✓ VERIFIED | Completeness-gate paragraph at end of file asserts this explicitly. `grep -c TBD` = 0. Every row has baseline + EXACT + origin populated (spot-checked above). |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/phases/20-introspection-corr-lation-d-origine/20-FINDINGS.md` | Durable per-column findings artifact (baseline + EXACT metadata + git/Mehdi origin), min 80 lines, contains `migrations/04-rbac-migration.sql`, contains `information_schema` | ✓ VERIFIED | 208 lines (>> 80 min). Contains both required substrings. Zero `TBD` cells remain. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| 20-FINDINGS.md per-column rows | Phase 21 retroactive migrations (SCHEMA-04) | each row carries table+column+type+nullable+constraint+origin verdict | ✓ WIRED | Pattern `ghost column\|code-catch-up\|c66ad69` matched 21 times across the artifact — every table's rows use the pattern consistently. |
| Dashboard SQL query output | 20-FINDINGS.md EXACT cells | verbatim paste of `information_schema.columns` + `pg_constraint` rows | ✓ WIRED | Pattern `numeric_precision\|pg_get_constraintdef\|character_maximum_length` matched 4 times; EXACT cells show real precision (e.g. `NUMERIC(12,2)`) rather than generic OpenAPI types. |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces no runnable/rendering code. The artifact is a static Markdown findings document consumed by a future phase (Phase 21), not by application code at runtime.

### Behavioral Spot-Checks

Step 7b SKIPPED — investigation-only phase, no runnable entry points produced or modified. Instead, factual/citation accuracy was spot-checked directly against the codebase (see below), which is the appropriate equivalent for a documentation-deliverable phase.

**Citation accuracy checks performed (all passed):**

| Claim in 20-FINDINGS.md | Verification | Result |
|---|---|---|
| `git show c66ad69` → 2026-04-14, "feat(L4): migration RBAC…" | `git show -s --format="%h %ad %s" c66ad69` | ✓ Matches exactly |
| `git show b29d4f5` → 2026-07-04, "fix(16-01): rewrite Devis data-access layer against real live devis schema" | same | ✓ Matches exactly |
| `git show f2d7d9a` → 2026-05-11, "fix(devis): aligner noms colonnes backend..." | same | ✓ Matches exactly |
| `git show af3b15f`, `0a616bf`, `13d4e2d`, `2df75a7`, `7344b0a`, `b3785eb` | same | ✓ All match exactly (hash/date/message) |
| `Garages.update()` allowlist at `supabase.js` L186 | `grep -n "const allowed = \['nom'" supabase.js` | ✓ Line 186, contents match verbatim |
| `Interventions.create()` payload at `supabase.js` L397-408 | `sed -n '397,408p' supabase.js` | ✓ Matches verbatim, none of the 4 ghost columns appear |
| `schema.sql` DOCUMENTED column lists (garages L89-116, interventions ~L266-288, devis ~L315-339, clients L142-158) | Read schema.sql directly | ✓ Matches the plan's `<interfaces>` block and FINDINGS.md exactly |
| `migrations/04-rbac-migration.sql` DDL matches FINDINGS.md clients table verbatim | Read full file | ✓ Matches exactly, including CHECK constraint and UNIQUE index |
| Pass 0 claim: no other legacy migration file adds garages/interventions/devis columns | `grep -lE "ALTER TABLE (garages\|interventions\|devis)\|ADD COLUMN" migrations/*.sql sql/migrations/*.sql` | ✓ Only 04-rbac (clients), 09-l3c (catalogue_pieces), 10/15 (garages, already-documented columns) hit — consistent with FINDINGS.md's claim |
| Column-count consistency (5/5/4/25 = 39) | Grepped exact column-name table rows | ✓ garages=5, clients=5, interventions=4, devis=25 |
| Ghost-column count (9) and verdict split (2 CONFIRMÉ / 7 INCONNU) | Grepped verdict lines | ✓ Exactly 9, split 2/7 as claimed |
| `grep -c TBD` returns 0 | Direct grep | ✓ 0 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| SCHEMA-02 | 20-01, 20-02 | Chaque colonne non documentée identifiée avec type exact, contraintes, nullabilité via introspection Postgres | ✓ SATISFIED | 20-FINDINGS.md carries OpenAPI baseline (plan 01) + `information_schema.columns`/`pg_constraint` EXACT metadata (plan 02) for all 39 columns. REQUIREMENTS.md checkbox marked `[x]`. |
| SCHEMA-03 | 20-01, 20-02 | Chaque colonne corrélée à la livraison/fonctionnalité qui l'a introduite via l'historique git | ✓ SATISFIED | Full `git log -S` sweep with disambiguation (plan 01) + Mehdi's terminal ghost-column verdicts (plan 02) for all columns without a code trail. "Undetermined" is an explicitly accepted terminal outcome per the phase's own success criteria (does not block SATISFIED). REQUIREMENTS.md checkbox marked `[x]`. |

No orphaned requirements: `.planning/REQUIREMENTS.md` Traceability table maps only SCHEMA-02 and SCHEMA-03 to Phase 20, and both plans' frontmatter declare exactly `[SCHEMA-02, SCHEMA-03]`. No unmapped IDs found.

**Minor documentation staleness (informational, not a gap):** `.planning/REQUIREMENTS.md` line 45's Traceability table still reads "SCHEMA-02 | Phase 20 | In Progress (baseline done, exact pg-catalog metadata deferred to plan 20-02)" even though plan 20-02 has since closed SCHEMA-02 to exact fidelity and the requirement checkbox above it is already checked `[x]`. This is a stale status-table cell, not a gap in the phase's deliverable — recommend updating to "Complete" during the routine STATE.md/ROADMAP.md sync that follows this verification. Similarly, `ROADMAP.md`'s Progress table (line 150: "Phase 20 | v1.5 | 0/2 | Not started") and `STATE.md` line 27 ("Plan: 2 of 2 complete — 20-02 next", self-contradictory) are pre-verification snapshots expected to be updated by the orchestrator after this report.

### Anti-Patterns Found

None. This is a documentation-only investigation phase (no application code, schema.sql, or migration file modified — confirmed both SUMMARY.md files and the phase's own `<verification>` block state this, and no `files_modified` other than `20-FINDINGS.md` appears in either PLAN's frontmatter). No TODO/FIXME/placeholder patterns found in the artifact itself (the one "TODO" grep hit is a legitimate quoted citation of a pre-existing TODO comment inside `migrations/04-rls-harden.sql`, not a placeholder in the deliverable).

### Human Verification Required

None. All checkpoints requiring Mehdi (Dashboard SQL Editor pastes for `information_schema`/`pg_constraint`, and the 9 ghost-column confirm-or-correct) were already executed during phase execution (recorded verbatim in 20-FINDINGS.md and both SUMMARY.md files) — nothing is deferred to this verification pass.

### Gaps Summary

No gaps found. All 4 ROADMAP success criteria are met:
1. Exhaustive introspection lists every undocumented column with exact type/nullability/constraints — verified (39/39 columns, EXACT cells populated, pg_constraint sections present).
2. Every undocumented column has a documented origin (commit correlation, legacy migration, code-catch-up, or terminal Mehdi-confirmed/undetermined verdict) — verified, including the explicitly-accepted "INCONNU/OUBLIÉ" terminal state for 7 columns.
3. All 4 tables covered, none omitted — verified by exact row counts matching the completeness checklist.
4. Results captured in a durable artifact Phase 21 can consume without re-discovery — verified; artifact is self-contained, cites exact file/line/commit evidence, and includes an explicit completeness-gate closing statement.

Only a cosmetic staleness item was found in `.planning/REQUIREMENTS.md`'s Traceability table text (not the checkbox, which is correctly `[x]`), noted above for routine cleanup — this does not block phase completion.

---

*Verified: 2026-07-09*
*Verifier: Claude (gsd-verifier)*
