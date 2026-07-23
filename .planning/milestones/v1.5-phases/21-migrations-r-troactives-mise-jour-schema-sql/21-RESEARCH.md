# Phase 21: Migrations Rétroactives & Mise à Jour schema.sql - Research

**Researched:** 2026-07-09
**Domain:** PostgreSQL/Supabase DDL — retroactive migration documentation + full-rebuild schema.sql maintenance
**Confidence:** HIGH (all findings verified directly against repo files, prod introspection artifacts from Phase 20, and git history — no external library research needed, this is a pure SQL/repo-convention phase)

## Summary

This phase has no new technology to research — it is 100% about following exact, already-established repo conventions (Phase 19's `schema.sql` regeneration pattern) and correctly transcribing data that Phase 20 already fully captured in `20-FINDINGS.md`. The real risk in this phase is not "what library/pattern to use" but **precision transcription** (types/nullability/defaults/constraints must match prod exactly) and **one structural landmine**: two of the Gap A columns (`devis.entite_facturation_id`, `interventions.facture_id`) have prod foreign keys pointing at tables (`entites_facturation`, `factures_scannees`) that are explicitly out-of-scope and **do not exist in `schema.sql`**. Adding those FK constraints verbatim will break a fresh bootstrap — this must be handled deliberately (see Common Pitfalls).

A second important discovery from this research (not mentioned in the phase description, but required by the phase goal "schema.sql reflète l'état complet de prod for Gap A"): `clients` was already fully resolved in Phase 20 via a **legacy migration file** (`migrations/04-rbac-migration.sql`), but `schema.sql`'s current `clients` table is missing the `client_type_enum` type, all 5 `client_type`/`raison_sociale`/`siret`/`tva_intracom`/`adresse_facturation` columns, the `clients_pro_requirements` CHECK constraint, and the `idx_clients_siret` unique index. This is not a "new discovery requiring a retroactive migration" (SCHEMA-04 is about *undocumented* drift) — it is a **porting oversight** identical in kind to what Phase 19-03 fixed for migrations 10/13/15. It still must be fixed for the phase goal ("Gap A... `garages`/`clients`/`interventions`/`devis`") to be true, but the correct mechanism is copying the existing legacy migration's DDL into `schema.sql`, not writing a new numbered migration file (there's nothing to "discover" — origin is already 100% known).

**Primary recommendation:** Follow Phase 19's exact playbook — direct `Edit` tool edits to `schema.sql` (no PowerShell/sed, no wrapper script; `schema.sql` is not in CLAUDE.md's critical-files list and Phase 19 never used a script), write retroactive migration file(s) numbered 20+ in `sql/migrations/` using the idempotent `ADD COLUMN IF NOT EXISTS` convention (migration 15/19 style) with per-column origin comments sourced verbatim from `20-FINDINGS.md`, copy Gap B DDL from migrations 13/15 into `schema.sql` verbatim (matching table/index/comment structure, RLS state to be verified separately — see Open Questions), and fix the `clients` porting gap using the same "copy from existing file" pattern used in 19-03 rather than a new retroactive migration.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-04 | Un ou plusieurs fichiers de migration rétroactifs numérotés (20+) documentent chaque colonne découverte, avec un commentaire d'origine expliquant sa provenance | 20-FINDINGS.md has verbatim origin text for all 39 columns, ready to copy into per-column SQL comments; Architecture Patterns section gives idempotent file-per-table-cluster convention (migration 15/19 style) and file-split recommendation; explicitly excludes clients (already documented elsewhere, see SCHEMA-05 support) |
| SCHEMA-05 | schema.sql est mis à jour pour inclure ces colonnes sur garages/clients/interventions/devis, avec les mêmes contraintes qu'en prod | Architecture Patterns gives exact schema.sql insertion line numbers for all 4 tables; Common Pitfalls #1 (FK-to-out-of-scope-table), #2 (stale devis columns), #3 (clients porting gap — migrations/04-rbac-migration.sql is the source, not a new discovery) directly address correctness of this update |
| SCHEMA-06 | billing_events (migration 15) + motos_proprietaires_historique/liaisons_client_garage/reclamations_moto + v_motos_avec_proprietaire (migration 13) added to schema.sql from existing migration DDL | Code Examples section shows verbatim-copy pattern from migration 15; Architecture Patterns gives DROP TABLE/VIEW/TYPE NETTOYAGE-block additions required (mode_acquisition_enum, 4 new tables, 1 view) for idempotent re-bootstrap; Common Pitfall #4 flags the unresolved RLS-state open question for these tables |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- `schema.sql`, `sql/migrations/`, and `migrations/` are **not** in CLAUDE.md's explicit critical-files list (`motokey-api.js`, `app.html`, `supabase.js`, `MotoKey_Client.html`) — direct `Edit`/`Write` tool edits are allowed and are in fact the established convention (Phase 19 used them exclusively, confirmed via `git show --stat` on all three Phase 19 schema.sql commits — no wrapper script, no `.bak` file).
- CLAUDE.md's "create a versioned script in `scripts/` that makes a `.bak`" guidance is scoped to "opérations complexes (renommage massif, migration HTML)" — this phase is neither; it's targeted `ALTER TABLE`/`CREATE TABLE` additions, same class of change as Phase 19's commits `79231e8`/`95abfb9`/`0a616bf`, all done via direct edits.
- **Secrets**: never print `SUPABASE_URL`/`SUPABASE_SECRET_KEY` values in commands or output — confirmed present in `.env` (verified via boolean presence check only, per project security rule).
- **No Python on Windows** — any verification tooling must be Node.js (matches existing `scripts/introspect-schema.js`).
- **Report before push** — per user's global memory feedback, show verification results and wait for explicit GO before `git push`.
- **French communication** — per user's global memory feedback (2026-07-09), respond to Mehdi in French during execution.
- Always `git status` / `git log --oneline -5` before major changes; always `node --check` is N/A here (no JS files change) but SQL syntax should be sanity-checked (see Validation Architecture).

## Standard Stack

No new libraries. This phase only touches:
- `schema.sql` (674 lines, full-rebuild DDL script — DROP/CREATE, not additive)
- `sql/migrations/*.sql` (numbered 10–19, new files 20+ to be added)
- Optionally `scripts/introspect-schema.js` (existing Node/PostgREST introspection tool — may need its `EXPECTED_TABLES` constant extended, see Open Questions)

**Installation:** None required — `@supabase/supabase-js` and `dotenv` already in `package.json`, `node` v24.14.1 confirmed installed.

## Architecture Patterns

### schema.sql is a full-rebuild script, not additive migrations — confirmed

Lines 48–73 of `schema.sql` show a `NETTOYAGE` (cleanup) block: `DROP TABLE IF EXISTS ... CASCADE` for every managed table, in FK-safe order (leaf tables first), followed by `DROP TYPE IF EXISTS ... CASCADE` for every managed enum, before any `CREATE TABLE`. This means:
1. New Gap B tables (`billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto`) and the new view (`v_motos_avec_proprietaire`) **must get their own `DROP TABLE`/`DROP VIEW IF EXISTS ... CASCADE` entries** added to the NETTOYAGE block, or a second bootstrap run will fail with "already exists" errors.
2. The new enum `mode_acquisition_enum` (used by `motos_proprietaires_historique.mode_acquisition`, defined in migration 13 but never ported to `schema.sql` — confirmed via grep, zero hits) needs a `DROP TYPE IF EXISTS mode_acquisition_enum CASCADE` entry too. Note `proprietaire_type_enum` **was already added** by Phase 19-03 (`schema.sql:72,84`) — only `mode_acquisition_enum` is missing.
3. The new `client_type_enum` (from the `clients` porting fix, see Summary) also needs a `DROP TYPE` entry — currently entirely absent from `schema.sql`.

**Precedent for exact wording** — commit `79231e8`'s message: *"Add DROP TABLE IF EXISTS entries to NETTOYAGE block (FK-safe, leaf tables first)"*. Follow the same ordering logic: child tables (those with FKs pointing outward) before the parent tables they reference. Recommended order to insert (all as leaves before `motos`/`clients`/`garages` are dropped): `reclamations_moto`, `liaisons_client_garage`, `motos_proprietaires_historique`, `billing_events` — plus `DROP VIEW IF EXISTS v_motos_avec_proprietaire CASCADE` (must precede `DROP TABLE motos` since the view selects from `motos`; in practice `CASCADE` on `motos` would also drop the view automatically, but explicit entries are the established, more defensive convention here).

### Retroactive migration file convention (sql/migrations/, numbers 10–19 reviewed)

Two conventions coexist in `sql/migrations/`:
- **Idempotent style** (migrations 15, 19 header comments; 15's body): `ALTER TABLE x ADD COLUMN IF NOT EXISTS y TYPE;`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`. Explicit header note: *"À appliquer manuellement via Supabase Dashboard > SQL Editor. Idempotent : ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS."*
- **Non-idempotent style** (migration 13, and the legacy `migrations/04-rbac-migration.sql` which wraps in `BEGIN/COMMIT` with a `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$` guard just for the `CREATE TYPE`).

**Recommendation for the new 20+ retroactive files:** use the idempotent style (`ADD COLUMN IF NOT EXISTS`), matching the more recent/most-referenced convention (15, 19) and because these migrations describe columns that **already exist in prod** — they are retroactive documentation, and idempotency makes them safe to run against prod a second time (no-op) or against any environment that's behind. In practice these files will likely never be executed (schema.sql itself will already include the columns after this phase), but they serve as the git-trackable historical record SCHEMA-04 requires, and idempotency is free insurance.

**Per-column origin comment requirement (SCHEMA-04):** every column needs an explanatory comment. Source verbatim from `20-FINDINGS.md`'s three origin categories:
- `garages.ville`/`garages.cp` → `-- découpage d'adresse structuré, préparé mais jamais câblé (confirmé Mehdi 2026-07-09)`
- `garages.type`/`marque_officielle`/`actif` and all 4 `interventions` ghost columns → `-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal, Phase 20 — ni git ni Mehdi n'ont pu déterminer l'origine)`
- All 25 `devis` columns → `-- code-catch-up : code aligné en <hash>/<date> sur un schema déjà dérivé ; origine DB réelle antérieure/inconnue (ALTER Dashboard non documenté)` (cite the specific commit per column, e.g. `b29d4f5`/`f2d7d9a`, from the Findings table)

**File split recommendation:** one file per table cluster (e.g. `20_garages_undocumented_columns.sql`, `21_interventions_undocumented_columns.sql`, `22_devis_undocumented_columns.sql`) rather than a single monolithic file. Rationale: the three clusters have genuinely distinct origin stories (2 confirmed-intentional + 3 unknown for garages; 4 unknown for interventions; 25 code-catch-up for devis) and distinct blocking concerns (devis needs the FK-omission fix below); splitting keeps each file's header comment focused and matches the existing convention where each numbered migration = one coherent unit of change (13 = one feature/L8, 15 = one feature/billing, even though multi-table). A single combined file is also defensible (SCHEMA-04 explicitly allows "un ou plusieurs fichiers") — this is genuinely Claude's discretion; either is consistent with repo precedent. If splitting, reserve migration 23 or fold the `clients` CHECK/index port into whichever numbered file is most natural, OR (recommended) do the `clients` port as a **direct `schema.sql` edit with no new migration file**, since `migrations/04-rbac-migration.sql` already exists and is the documented origin — creating a *new* `sql/migrations/2X_clients_*.sql` would misleadingly imply a second undocumented discovery when there isn't one.

### schema.sql insertion points (line numbers as of this research, 674-line file)

| What | Where in schema.sql |
|---|---|
| `DROP TABLE`/`DROP VIEW`/`DROP TYPE` additions | NETTOYAGE block, lines 51–72 |
| `mode_acquisition_enum`, `client_type_enum` CREATE TYPE | TYPES ENUM block, lines 76–84 (after `proprietaire_type_enum`) |
| `garages` Gap A columns (`ville`,`cp`,`type`,`marque_officielle`,`actif`) | `CREATE TABLE garages`, lines 89–116 |
| `clients` Gap A columns + CHECK + unique index (porting fix) | `CREATE TABLE clients`, lines 142–158 |
| `interventions` Gap A columns (`niveau_preuve`,`facture_id`,`operation_code`,`photo_url`) + CHECK + FK | `CREATE TABLE interventions`, lines 266–288 |
| `devis` Gap A columns (25 cols) | `CREATE TABLE devis`, lines 315–339 — **see Pitfall re: 10 stale columns already there** |
| New Gap B tables (`billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto`) | New blocks, logical placement after `motos`/`clients` tables they reference (i.e. after line ~262, before `interventions`, OR grouped together near the end before TRIGGERS — either is fine since schema.sql tables aren't strictly declared in dependency order already, e.g. `plan_entretien` at line 293 comes after `devis` references) |
| `v_motos_avec_proprietaire` view | New block, must come after `motos`/`clients`/`garages` CREATE TABLE statements (view selects from all three) |
| RLS enable statements for Gap B tables (if applicable — see Open Questions) | RLS block, lines 535–551, alongside the other "RLS enabled, no policies" entries |

### Anti-Patterns to Avoid

- **Do not invent plausible-sounding origins for the 7 terminal-INCONNU columns.** `20-FINDINGS.md` explicitly instructs: *"Phase 21 décidera comment documenter ces colonnes d'origine ambiguë... recommandation : commentaire honnête `-- origine indéterminée, colonne non utilisée par le code actuel` dans le DDL, plutôt qu'une intention inventée."* This is a direct, load-bearing instruction from the upstream research phase.
- **Do not treat `clients`' 5 columns as needing a new retroactive migration.** They already have a fully-documented origin (`migrations/04-rbac-migration.sql` @ `c66ad69`) — writing a new "discovered" migration for them would misrepresent already-known history.
- **Do not copy the `devis.entite_facturation_id` / `interventions.facture_id` FK constraints into schema.sql verbatim without addressing the missing target tables** (see Common Pitfalls — this would break bootstrap).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verifying exact prod column type/nullable/default/constraint | Manual `information_schema` queries | `20-FINDINGS.md` (already has EXACT pg-catalog-verified data for all 39 columns) | Phase 20 explicitly states this document is "la seule source de vérité à relire, pas de re-découverte nécessaire" |
| Gap B table DDL | Rewriting `CREATE TABLE billing_events`/etc. from memory | Copy verbatim from `sql/migrations/13_liaison_client_moto.sql` and `sql/migrations/15_billing_foundation.sql` | SCHEMA-06 explicitly mandates sourcing from these exact files; verbatim copy avoids transcription drift |
| Detecting missing/extra columns after edits | Manual re-reading of schema.sql vs FINDINGS.md | `node scripts/introspect-schema.js` (default mode re-confirms prod state) + targeted `grep` diffs of column names between the new schema.sql blocks and the FINDINGS.md tables | Existing tool already does live PostgREST introspection safely (no new credentials, key never printed) |

**Key insight:** This phase is a "transcription with judgment calls" phase, not a "build new capability" phase. The dominant failure mode is silent transcription drift (wrong type, wrong default, wrong nullable) — mitigate by keeping `20-FINDINGS.md` open side-by-side and diffing column-by-column rather than working from memory of the phase description.

## Common Pitfalls

### Pitfall 1: FK constraints pointing to out-of-scope tables will break bootstrap

**What goes wrong:** `devis.entite_facturation_id` (NOT NULL, uuid) has a live FK `devis_entite_facturation_id_fkey → entites_facturation(id)`, and `interventions.facture_id` (nullable, uuid) has a live FK `interventions_facture_id_fkey → factures_scannees(id) ON DELETE SET NULL`. **Neither `entites_facturation` nor `factures_scannees` exists anywhere in `schema.sql`** (confirmed via grep — the only occurrence of `entites_facturation` in the whole file is inside the header comment listing it as an out-of-scope table). If these FK constraints are added verbatim, a fresh Supabase bootstrap of `schema.sql` will fail at `CREATE TABLE devis`/`ALTER TABLE ... ADD CONSTRAINT` with a "relation does not exist" error.

**Why it happens:** Gap A's `devis`/`interventions` columns were discovered via prod introspection (Phase 20) independently of which subsystems are in/out of scope for this schema.sql narrow-scope rebuild. Some Gap A columns happen to reference genuinely out-of-scope tables (the ~19-table facturation/billing subsystem explicitly deferred per REQUIREMENTS.md Out of Scope).

**How to avoid:** Add the columns with correct type/nullable/default (matching prod, satisfying success criterion 2's "mêmes contraintes et nullabilité"), but **omit the FK constraint itself**, with an explicit comment explaining why (e.g. `-- FK prod: entites_facturation(id) — table hors périmètre schema.sql narrow-scope (voir header), FK omise ici pour bootstrap propre`). This is consistent with the established narrow-scope precedent already documented in `schema.sql`'s own header (lines 6–19) and does not violate "mêmes contraintes... qu'en prod" in spirit, since the alternative (breaking every fresh bootstrap) is strictly worse and the missing-FK gap is already disclosed. Retroactive migration files (SCHEMA-04) can still document the *real* prod FK in a comment even if `schema.sql` omits the live constraint — the migration file is historical record, not a bootstrap target.

**Warning signs:** Any `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY (...) REFERENCES entites_facturation|factures_scannees` line added to `schema.sql` — this should never appear given current scope. Confirm via `grep -n "entites_facturation\|factures_scannees" schema.sql` returning zero non-comment hits after the phase.

### Pitfall 2: schema.sql's `devis` table already has 10 columns that don't exist in prod

**What goes wrong:** `schema.sql:315-339`'s `devis` CREATE TABLE currently documents `technicien_id`, `total_mo_ht`, `total_pieces_ht`, `remise_lignes`, `sous_total_ht`, `remise_globale`, `base_ht`, `tva_montant`, `valide_at`, `expire_at` — **none of these 10 columns exist in the live prod `devis` table** (confirmed by `20-FINDINGS.md`'s completeness checklist, which explicitly flags this as "l'inverse du problème... signalé ici pour que Phase 21/22 en tienne compte"). This is stale/pre-rewrite schema (likely a remnant from before commit `b29d4f5`'s "rewrite Devis data-access layer against real live devis schema").

**Why it happens:** `schema.sql`'s `devis` block was apparently never fully reconciled when the `devis` data-access layer was rewritten in commit `b29d4f5` (2026-07-04) to match a real, already-drifted live schema.

**How to avoid:** This is explicitly flagged by Phase 20 as **out of strict SCHEMA-04/05/06 scope** (those requirements are about adding *missing* columns, not removing *stale* ones), but the phase goal ("schema.sql reflète l'état complet de prod") arguably implies fixing it too, and it's the same table block being edited anyway. Recommend the planner make an explicit decision (flag to Mehdi if uncertain) rather than silently leaving stale phantom columns in a table being actively edited — leaving them doesn't break bootstrap (they're all nullable/defaulted) but does leave `schema.sql` factually wrong about prod's actual `devis` shape, undermining the phase's own goal statement. Not a hard blocker either way.

### Pitfall 3: `clients` Gap A fix is easy to miss because it's not framed as a "discovery" task

**What goes wrong:** Since `20-FINDINGS.md` marks `clients` as "**RÉSOLU**" and "**Aucun travail Postgres/git supplémentaire requis**," a plan focused narrowly on SCHEMA-04 (new migration files) could skip `clients` entirely — but SCHEMA-05 ("schema.sql est mis à jour pour inclure ces colonnes sur garages/clients/interventions/devis") explicitly includes `clients`, and `schema.sql` currently has **zero** of the 5 `clients` columns, the enum, the CHECK constraint, or the unique index.

**How to avoid:** Explicitly scope a task to port `migrations/04-rbac-migration.sql`'s DDL (type + 5 columns + `clients_pro_requirements` CHECK + `idx_clients_siret` unique index + 5 column comments) into `schema.sql`'s `clients` block and NETTOYAGE/TYPES sections, using the exact same "verbatim copy from a known source file" pattern as Phase 19-03's migration 10/13/15 fix (commit `0a616bf`) — not a new retroactive migration.

### Pitfall 4: RLS state of Gap B tables is unknown and unverified

**What goes wrong:** None of migrations 12, 13, 15, 16, 17 declare `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (confirmed via `grep -n "ROW LEVEL SECURITY" sql/migrations/*.sql` — zero hits across all 10 files). Yet Phase 19 discovered (via live introspection, not migration files) that `garage_users`/`client_device_tokens`/`push_send_log` **do** have RLS enabled with zero policies in prod, and replicated that state in `schema.sql` (commit `79231e8`: *"Enable RLS with no policies on all 3, matching confirmed prod default-deny state (plan 19-01)"*). The same question is open and **unverified** for `billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto` — Phase 20's scope was limited to columns on `garages`/`clients`/`interventions`/`devis` and never touched these Gap B tables' RLS status.

**How to avoid:** Add a verification task: query prod's `pg_class.relrowsecurity` (or reuse `introspect-schema.js`'s pattern, or a small ad-hoc Node script using the existing `.env` credentials) for these 4 tables before deciding whether to add `ENABLE ROW LEVEL SECURITY` lines in `schema.sql`. If RLS is off in prod for these tables, `schema.sql` should also leave it off (to stay faithful) — if RLS is on, follow Phase 19's precedent and enable it with no policies. Note: SCHEMA-06's literal text ("à partir du DDL déjà présent dans sql/migrations/13_*.sql et 15_*.sql") could be read as "copy exactly what's in those files, nothing more" — in which case RLS is out of scope entirely and this becomes a documented known-gap rather than a blocker. Either interpretation is defensible; flag as a discretion point for the planner (see Open Questions).

### Pitfall 5: `scripts/introspect-schema.js`'s `EXPECTED_TABLES`/`NARROW_SCOPE_TABLES` will not know about Gap B tables

**What goes wrong:** The script's compare mode only diffs the hardcoded `EXPECTED_TABLES` array (13 tables, last updated in Phase 19) — it does not include `billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto`, or the view. Success criterion 4 ("comparaison automatique... ne montre plus aucune colonne ou objet non documenté pour Gap A et Gap B") cannot be satisfied by running this script as-is against Gap B — it would silently ignore the new tables.

**How to avoid:** Either (a) extend `EXPECTED_TABLES` in this phase as part of making the "automatic comparison" claim true, or (b) explicitly scope automatic comparison to Gap A only in this phase (columns on the 4 existing tables, which the script's column-diff logic already covers once those tables are in `EXPECTED_TABLES`... they already are) and treat Gap B's "automatic comparison" as a manual/visual check (DDL was copied verbatim from a known-correct source, so there's less need for live diffing) or defer full compare-mode coverage to Phase 22 (SCHEMA-07 owns the official bootstrap verification pass). This is a genuine scope decision for the planner — see Open Questions.

## Code Examples

### Idempotent retroactive migration pattern (recommended for 20+, mirrors migration 15's style)

```sql
-- Source: sql/migrations/15_billing_foundation.sql (existing repo convention)
-- ═══════════════════════════════════════════════════════════
-- Migration 20 — Rétroactif : colonnes non documentées garages (Gap A)
-- ═══════════════════════════════════════════════════════════
-- Documente 5 colonnes découvertes en prod sans fichier de migration
-- correspondant (Phase 20, SCHEMA-02/03). Idempotent : ADD COLUMN IF NOT
-- EXISTS. Ce fichier est un enregistrement historique — schema.sql
-- inclut déjà ces colonnes directement (SCHEMA-05), ce fichier ne sera
-- normalement jamais exécuté sauf pour rattraper un environnement
-- bootstrappé depuis une version antérieure de schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE garages ADD COLUMN IF NOT EXISTS ville TEXT;
-- découpage d'adresse structuré, préparé mais jamais câblé (confirmé Mehdi 2026-07-09)

ALTER TABLE garages ADD COLUMN IF NOT EXISTS cp TEXT;
-- découpage d'adresse structuré, préparé mais jamais câblé (confirmé Mehdi 2026-07-09)

ALTER TABLE garages ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'pro';
-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal, Phase 20)

ALTER TABLE garages ADD COLUMN IF NOT EXISTS marque_officielle TEXT;
-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal, Phase 20)

ALTER TABLE garages ADD COLUMN IF NOT EXISTS actif BOOLEAN NOT NULL DEFAULT true;
-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal, Phase 20)
```

### FK-omission pattern for out-of-scope referenced tables (devis.entite_facturation_id)

```sql
-- schema.sql — devis table, Gap A column with FK to an out-of-scope table.
-- Type/nullable match prod exactly (per 20-FINDINGS.md); FK is intentionally
-- NOT reproduced here because entites_facturation is not created by this
-- narrow-scope schema.sql (see header). Prod FK: entites_facturation(id).
entite_facturation_id UUID NOT NULL,
```

### Gap B table copy pattern (verbatim from migration 15)

```sql
-- Source: sql/migrations/15_billing_foundation.sql lines 27-39 — copy as-is
CREATE TABLE billing_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  TEXT        NOT NULL UNIQUE,
  event_type       TEXT        NOT NULL,
  garage_id        UUID        REFERENCES garages(id) ON DELETE SET NULL,
  payload          JSONB,
  processed_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_billing_events_garage ON billing_events(garage_id);

COMMENT ON TABLE  billing_events IS 'Audit trail des evenements Stripe recus. stripe_event_id UNIQUE = guard idempotency (rejeu webhook securise).';
COMMENT ON COLUMN billing_events.payload IS 'Corps complet de l''evenement Stripe — permet de rejouer ou auditer sans appeler l''API Stripe.';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Ad-hoc Dashboard `ALTER TABLE` with no file | Numbered `sql/migrations/*.sql` file per change, applied manually via Dashboard SQL Editor, then ported into `schema.sql` | Since migration 10 (this repo's convention) | This phase is explicitly closing the gap where that convention was violated (Gap A) |
| `schema.sql` as a living/additive file | `schema.sql` as a full DROP+CREATE rebuild script, regenerated periodically (Phase 19, now Phase 21) to catch up on drift | Phase 19 (2026-07-09) established this as the recovery pattern | Phase 21 is the second iteration of this same recovery pattern |
| Dashboard SQL Editor paste for verification | Direct `node-postgres` connection string execution (paste truncation proved unreliable per 19-03-SUMMARY.md) | Phase 19-03 (2026-07-09) | Any Phase 22 bootstrap verification (not this phase's job, but informs how Phase 21's SQL will eventually be tested) should plan for direct pg connection, not Dashboard paste |

**Deprecated/outdated:** None — no library versions involved in this phase.

## Open Questions

1. **Should retroactive migration files be split per-table (3 files) or combined (1 file)?**
   - What we know: SCHEMA-04 explicitly allows "un ou plusieurs fichiers." Both are consistent with repo precedent (migration 15 is multi-table/single-feature/single-file; migrations 10/16/17/18/19 are single-purpose/single-file).
   - What's unclear: No strong signal either way from CONTEXT.md (does not exist for this phase) or REQUIREMENTS.md.
   - Recommendation: Split per table cluster (garages/interventions/devis) for header-comment clarity — each has a distinct origin story. Do NOT create a new file for `clients` (already documented, see Pitfall 3).

2. **Should `schema.sql` add `ENABLE ROW LEVEL SECURITY` for the 4 new Gap B tables?**
   - What we know: Migration files 12/13/15/16/17 never declare RLS. Phase 19 discovered (via live introspection) that 3 of those tables DO have RLS enabled in prod despite the migration files being silent, and replicated that state.
   - What's unclear: RLS status of `billing_events`/`motos_proprietaires_historique`/`liaisons_client_garage`/`reclamations_moto` in prod — never checked (out of Phase 20's scope).
   - Recommendation: Add a verification task (small Node script reusing `.env` credentials, or extend `introspect-schema.js`) to check `pg_class.relrowsecurity` for these 4 tables before writing the schema.sql section. If checking prod is infeasible in this phase, document as an explicit known-gap in schema.sql's header rather than guessing.

3. **Should the stale 10-column `devis` mismatch (schema.sql has columns prod doesn't) be fixed in this phase?**
   - What we know: Explicitly out of SCHEMA-04/05/06's literal text, but same table block, and the phase's own goal statement implies full prod fidelity.
   - What's unclear: Whether Mehdi wants this bundled in or handled separately.
   - Recommendation: Flag explicitly in the plan; default to fixing it since it's low-risk (removing unused nullable/defaulted columns) and the table is being edited anyway, but confirm with Mehdi if there's any doubt about a currently-passing code path relying on one of the 10 stale column names (grep confirms `technicien_id` IS used elsewhere on `interventions`, but on `devis` specifically these 10 names should be double-checked against `supabase.js`'s `Devis` module before removal).

4. **Does `EXPECTED_TABLES` in `introspect-schema.js` need extending in this phase, or is that Phase 22's job?**
   - What we know: Phase 22 (SCHEMA-07) owns "bootstrap vérifié propre... comparaison automatique," which is the natural place for this. Phase 21's success criterion 4 also mentions "comparaison automatique" but scoped to "Gap A et Gap B."
   - What's unclear: Whether criterion 4 requires actually running an updated compare script in Phase 21, or whether a manual/textual cross-check against `20-FINDINGS.md` (for Gap A) plus visual DDL diff (for Gap B, copied verbatim so low-risk) satisfies it.
   - Recommendation: For Gap A, running `node scripts/introspect-schema.js` (default mode, no changes needed — it already introspects all prod columns) alongside a `grep`/manual diff against the new schema.sql column lists is sufficient and requires no script changes. For Gap B, since DDL is copied verbatim from files SCHEMA-06 names explicitly, a diff against those source files (not live prod) is the natural verification and doesn't need `EXPECTED_TABLES` changes in this phase — leave the live-introspection compare-mode extension to Phase 22 where full bootstrap re-verification happens anyway.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `scripts/introspect-schema.js` execution | ✓ | v24.14.1 | — |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` in `.env` | Live prod introspection (verification) | ✓ (presence confirmed, values not read) | — | — |
| `@supabase/supabase-js` | Not directly needed (introspect-schema.js uses raw `fetch`) | ✓ (already installed) | ^2.45.0 | — |
| Supabase Dashboard SQL Editor access | Manual application of retroactive migrations (if ever run against prod) | Assumed available (used throughout project history) | — | — |
| A fresh/throwaway Supabase project for full bootstrap re-verification | Only needed for Phase 22 (SCHEMA-07), not this phase | N/A for Phase 21 | — | Phase 22's job |

**Missing dependencies with no fallback:** None identified.

**Missing dependencies with fallback:** None — all required tooling already exists and is confirmed working (per Phase 19's verification report, `introspect-schema.js` ran live and clean on 2026-07-09).

## Validation Architecture

*(No `workflow.nyquist_validation` key found in `.planning/config.json` — treated as enabled per default.)*

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (no pytest/jest) — this is a pure SQL/DDL phase in a project with no SQL test harness |
| Config file | none |
| Quick run command | `node scripts/introspect-schema.js` (live prod introspection, ~2s, requires `.env`) |
| Full suite command | Manual fresh-project bootstrap (Phase 22's job) — not expected to run in Phase 21 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-04 | Retroactive migration files exist, numbered 20+, with origin comments | manual review | `ls sql/migrations/2*.sql` + read each file for origin comments | ✅ (files to be created this phase) |
| SCHEMA-05 | schema.sql includes each Gap A column with matching type/nullable/constraint | smoke (SQL syntax) + manual diff against `20-FINDINGS.md` | `grep -A3 "CREATE TABLE garages\|CREATE TABLE clients\|CREATE TABLE interventions\|CREATE TABLE devis" schema.sql` then manual column-by-column check | ✅ (schema.sql exists, will be edited) |
| SCHEMA-06 | schema.sql includes billing_events + 3 L8 tables + view, from migration 13/15 DDL | manual diff (verbatim copy) | `diff` mentally against `sql/migrations/13_liaison_client_moto.sql` / `15_billing_foundation.sql` | ✅ |
| (informal) | schema.sql is syntactically valid SQL | smoke | No local Postgres available in this environment — closest available check is visual review + eventual Phase 22 live bootstrap. Consider a lightweight `node -e` sanity pass counting balanced parens/semicolons only if a real syntax checker is unavailable. | ❌ — no local Postgres/psql confirmed in this environment |

### Sampling Rate
- **Per task commit:** manual column-by-column diff against `20-FINDINGS.md` (Gap A) or source migration files (Gap B) — no automated test exists for SQL correctness in this repo.
- **Per wave merge:** `node scripts/introspect-schema.js` (confirms prod state hasn't drifted further since Phase 20's snapshot — cheap sanity check, not a schema.sql validator).
- **Phase gate:** Full bootstrap-against-fresh-project verification is explicitly Phase 22's (SCHEMA-07) responsibility, not this phase's — `/gsd:verify-work` for Phase 21 should rely on manual/textual verification (grep-based column presence checks, diff-against-source-file checks), consistent with how Phase 19's own verification report scored a "no local psql available" gap as non-blocking and deferred full bootstrap testing to a dedicated human/live step.

### Wave 0 Gaps
- No local Postgres/psql/pglast available in this environment to syntax-check `schema.sql` or the new migration files before commit. Recommend the plan's verification step rely on: (1) visual review, (2) `node scripts/introspect-schema.js` for live prod column confirmation (Gap A only), (3) explicit textual diff against source files (Gap B), and (4) defer full live-bootstrap SQL syntax validation to Phase 22 (SCHEMA-07), same pattern as Phase 19's own verification report.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/20-introspection-corr-lation-d-origine/20-FINDINGS.md` — full 39-column type/nullable/default/constraint/origin catalog, read in full
- `schema.sql` (repo, read in full, 674 lines) — current structure, header, NETTOYAGE block, all 4 target tables
- `sql/migrations/13_liaison_client_moto.sql`, `15_billing_foundation.sql`, `19_clients_email_garage_unique.sql`, `12_garage_users.sql`, `16_client_device_tokens.sql` (repo, read in full)
- `migrations/04-rbac-migration.sql` (repo, read in full) — the `clients` porting-gap source
- `scripts/introspect-schema.js` (repo, read in full) — verification tooling capabilities and limits
- `git show --stat` on commits `79231e8`, `95abfb9`, `0a616bf` (Phase 19's schema.sql edits) — confirmed direct-edit convention, no wrapper script
- `.planning/milestones/v1.4-phases/19-schema-sql-regeneration/19-VERIFICATION.md` (repo, read in full) — verification pattern precedent for this class of phase
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md` (repo, read in full) — requirement text, decisions, phase-split rationale

### Secondary (MEDIUM confidence)
- None used — no WebSearch/Context7 needed for this phase (pure repo-internal convention research)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: N/A — no new libraries
- Architecture (schema.sql structure, DROP ordering, insertion points): HIGH — directly read from file
- Pitfalls (FK-to-out-of-scope-table, clients porting gap, stale devis columns, RLS unknowns, introspect-schema.js coverage gap): HIGH — each independently verified via grep/read against actual repo state, not inferred

**Research date:** 2026-07-09
**Valid until:** Effectively indefinite for the structural findings (schema.sql/migrations don't change on their own) — but invalidated immediately if Phase 20's findings are revised, or if `schema.sql`/`sql/migrations/` are touched by any other concurrent work before Phase 21 executes.
