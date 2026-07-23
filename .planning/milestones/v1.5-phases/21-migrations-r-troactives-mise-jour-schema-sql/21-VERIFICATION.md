---
phase: 21-migrations-r-troactives-mise-jour-schema-sql
verified: 2026-07-10T20:15:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 21: Migrations Rétroactives & Mise à Jour schema.sql Verification Report

**Phase Goal:** `schema.sql` reflète l'état complet de prod pour Gap A (dérive non documentée) et Gap B (tables/vue des migrations 13/15 jamais reportées), chaque ajout de Gap A étant tracé par un fichier de migration rétroactif numéroté.
**Verified:** 2026-07-10T20:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un ou plusieurs fichiers de migration numérotés 20+ existent dans `sql/migrations/`, chaque colonne portant un commentaire d'origine | VERIFIED | `sql/migrations/20_garages_undocumented_columns.sql` (5 cols), `21_interventions_undocumented_columns.sql` (4 cols), `22_devis_undocumented_columns.sql` (25 cols) — all read directly; every `ALTER TABLE ... ADD COLUMN` line carries an inline origin comment sourced verbatim from `20-FINDINGS.md` (Mehdi-confirmed for `ville`/`cp`, terminal "origine indéterminée" for the 7 ghost columns, "code-catch-up b29d4f5/f2d7d9a" for the 25 devis columns) |
| 2 | `schema.sql` inclut chaque colonne de Gap A sur `garages`/`clients`/`interventions`/`devis`, avec les mêmes contraintes et nullabilité qu'en prod | VERIFIED | Read `schema.sql` directly: `garages` L124-128 (5 cols, `type` NOT NULL DEFAULT 'pro', `actif` BOOLEAN NOT NULL DEFAULT true — matches 20-FINDINGS.md exactly); `clients` L168-182 (5 RBAC cols + `client_type_enum` + `clients_pro_requirements` CHECK + `idx_clients_siret` L673, verified byte-for-byte against `migrations/04-rbac-migration.sql`); `interventions` L311-315 (4 cols, `niveau_preuve` CHECK present, `facture_id` UUID with no REFERENCES); `devis` L357-387 (25 Gap A columns present via grep count = 25, 10 stale columns — `technicien_id`/`total_mo_ht`/`total_pieces_ht`/`remise_lignes`/`sous_total_ht`/`remise_globale`/`base_ht`/`tva_montant`/`valide_at`/`expire_at` — confirmed absent from the devis block) |
| 3 | `schema.sql` inclut `billing_events` (migration 15) et `motos_proprietaires_historique`/`liaisons_client_garage`/`reclamations_moto` + `v_motos_avec_proprietaire` (migration 13), reprises depuis le DDL de `sql/migrations/13_*.sql`/`15_*.sql` | VERIFIED | `schema.sql` L490-574: all 4 tables + view present, compared field-by-field against `sql/migrations/13_liaison_client_moto.sql` and `sql/migrations/15_billing_foundation.sql` — column/index/constraint definitions identical, backfill INSERT statements correctly excluded; `mode_acquisition_enum` L93 declares full 8 values (6 from migration 13 + `don`/`heritage` from migration 14); NETTOYAGE block L51-55 drops all 5 new objects for idempotent re-bootstrap; RLS enabled L702-705 |
| 4 | Une comparaison automatique de `schema.sql` contre l'introspection prod ne montre plus aucune colonne/objet non documenté pour Gap A/B | VERIFIED | `grep -c "REFERENCES factures_scannees\|REFERENCES entites_facturation" schema.sql` → 0 (independently re-run, matches). `node scripts/introspect-schema.js` independently re-run against live prod → exit 0, `RESULT: PASS`. Full systematic auto-diff tool doesn't exist for the complete 39-column Gap A set (no local psql per plan's stated environment constraint) — verification is grep-based presence-diff (21-04 plan's documented, in-scope approach) cross-checked here independently against `20-FINDINGS.md`'s authoritative column lists, all counts match (5+5+4+25=39, matches Phase 20's inventory exactly) |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sql/migrations/20_garages_undocumented_columns.sql` | 5 Gap A garages columns, idempotent, origin comments | VERIFIED | Read directly — 5 `ADD COLUMN IF NOT EXISTS` lines, each with origin comment |
| `sql/migrations/21_interventions_undocumented_columns.sql` | 4 Gap A interventions columns | VERIFIED | Read directly — 4 columns, `niveau_preuve` CHECK preserved, `facture_id` FK documented as comment-only |
| `sql/migrations/22_devis_undocumented_columns.sql` | 25 Gap A devis columns | VERIFIED | Read directly — 25 columns, `entite_facturation_id` FK documented as comment-only |
| `schema.sql` (garages/clients/interventions/devis blocks) | Full prod-faithful DDL for Gap A | VERIFIED | Read directly, cross-checked against `20-FINDINGS.md` and `migrations/04-rbac-migration.sql` |
| `schema.sql` (Gap B section) | 4 tables + 1 view + enum, verbatim from migrations 13/15 | VERIFIED | Read directly, cross-checked field-by-field against source migration files |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `sql/migrations/20-22` | `20-FINDINGS.md` | origin comments copied verbatim per column | WIRED | Confirmed — every column's comment traces to a specific verdict in `20-FINDINGS.md` (Mehdi-confirmed / terminal ghost-column / code-catch-up with commit hash) |
| `schema.sql` clients block | `migrations/04-rbac-migration.sql` | verbatim DDL port | WIRED | Column names, types, CHECK, and unique index text-identical between the two files |
| `schema.sql` devis/interventions blocks | out-of-scope tables (`entites_facturation`, `factures_scannees`) | columns added WITHOUT REFERENCES | WIRED | `grep -c "REFERENCES factures_scannees\|REFERENCES entites_facturation"` = 0; both FK facts documented as inline comments instead |
| `schema.sql` Gap B tables | `sql/migrations/13_*.sql` + `15_*.sql` | verbatim DDL copy (no backfill INSERTs) | WIRED | Confirmed via direct diff-by-eye of both source files against `schema.sql` L490-574 — identical DDL, backfill INSERT/UPDATE statements correctly omitted |
| `schema.sql` NETTOYAGE | Gap B objects | DROP TABLE/VIEW/TYPE CASCADE | WIRED | L51-55 and L79 drop all 5 new Gap B objects ahead of their parent tables, confirmed idempotent ordering |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces SQL DDL artifacts (schema.sql, retroactive migration files), not application code with runtime data flow. Verification instead relies on textual/structural comparison against the authoritative source documents (20-FINDINGS.md, migrations 13/15/04-rbac), which was performed independently above.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Live prod reachable, Gap B tables exist in prod | `node scripts/introspect-schema.js` | Exit code 0, `RESULT: PASS — all narrow-scope objects confirmed present in prod.` | PASS |
| No out-of-scope FK leaked into schema.sql | `grep -c "REFERENCES factures_scannees\|REFERENCES entites_facturation" schema.sql` | `0` | PASS |
| Stale devis columns fully removed | `awk` extract of devis CREATE TABLE block, grepped for the 10 stale names | 0 matches | PASS |
| Gap A devis column count matches expected 25 | `awk` extract + grep count of the 25 expected column names | `25` | PASS |

Full SQL syntax validation via a fresh Supabase bootstrap was not run — this is explicitly deferred to Phase 22 (SCHEMA-07), as documented in both the phase's PLAN files and REQUIREMENTS.md's traceability table (SCHEMA-07 status: Pending).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SCHEMA-04 | 21-01 | Fichiers de migration rétroactifs numérotés (20+) documentant chaque colonne découverte avec commentaire d'origine | SATISFIED | 3 files created, each column carries an origin comment; independently confirmed against 20-FINDINGS.md |
| SCHEMA-05 | 21-02, 21-04 | `schema.sql` mis à jour pour inclure les colonnes Gap A avec mêmes contraintes qu'en prod | SATISFIED | All 39 Gap A columns present in schema.sql with matching type/nullable/default/CHECK, 10 stale devis columns removed |
| SCHEMA-06 | 21-03, 21-04 | `billing_events` + tables/vue migration 13 ajoutées à `schema.sql` | SATISFIED | All 4 tables + 1 view + enum present, verbatim from source migrations |

No orphaned requirements — REQUIREMENTS.md's traceability table maps SCHEMA-04/05/06 to Phase 21 exclusively, all three appear in plan frontmatter (`21-01: [SCHEMA-04]`, `21-02: [SCHEMA-05]`, `21-03: [SCHEMA-06]`, `21-04: [SCHEMA-05, SCHEMA-06]`), and REQUIREMENTS.md itself marks all three `[x]` Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `schema.sql` | L6-40 (header comment) | Header still lists Gap A/Gap B objects (`billing_events`, migration-13 tables, the 39 undocumented columns) as "non couvert"/unresolved, even though they are now fully present below | ℹ️ Info | Cosmetic/documentation-only inconsistency inside the file itself — a reader of the header alone would be misled. Does NOT affect bootstrap functionality or any of the 4 success criteria. Explicitly in scope for Phase 22 / SCHEMA-07 per REQUIREMENTS.md ("le header 'known-partial-bootstrap' de schema.sql est mis à jour pour ne plus lister les Gaps A et B comme non résolus"), not this phase — correctly deferred, not a Phase 21 gap. |

No blocker or warning-level anti-patterns found in the phase's created/modified files (migrations 20/21/22, schema.sql). No TODO/FIXME/placeholder text, no stub implementations, no empty returns.

### Human Verification Required

None. This phase's deliverables are static SQL DDL files verified via direct file reads and textual comparison against authoritative source documents — no UI, no runtime behavior requiring human judgment, no external service integration beyond the read-only prod introspection probe already run.

### Gaps Summary

No gaps found. All 4 success criteria verified independently against the actual file contents (not just SUMMARY claims):
- The 3 retroactive migration files (20/21/22) exist and are complete with per-column origin comments.
- `schema.sql`'s four Gap A tables carry all 39 documented columns with prod-matching constraints; the `clients` RBAC cluster is a verified verbatim port from `migrations/04-rbac-migration.sql`; the two out-of-scope FKs are correctly omitted as bare columns with explanatory comments; the 10 stale `devis` columns are confirmed removed.
- `schema.sql`'s Gap B section (4 tables + 1 view + `mode_acquisition_enum`) is a verified verbatim, backfill-excluded port from migrations 13/15, wired into NETTOYAGE for idempotent re-bootstrap, with RLS enabled per the live-probed decision.
- No out-of-scope FK (`factures_scannees`, `entites_facturation`) leaked into `schema.sql`; live introspection independently re-run confirms prod reachability and the narrow-scope object set.

The only noteworthy item — `schema.sql`'s stale header comment (still describing Gap A/B as unresolved) — is explicitly Phase 22's job (SCHEMA-07) per REQUIREMENTS.md, not a Phase 21 gap.

---

*Verified: 2026-07-10T20:15:00Z*
*Verifier: Claude (gsd-verifier)*
