# Phase 19: Schema.sql Regeneration - Research

**Researched:** 2026-07-08
**Domain:** PostgreSQL/Supabase schema introspection and DDL reconstruction
**Confidence:** HIGH (core recommendation, verified live against prod) / MEDIUM (exact CHECK constraint text, RLS/index/trigger definitions not directly queried)

## Summary

`schema.sql` has not been touched since the initial v1.0 commit (`10096b6`, confirmed via `git log --follow -- schema.sql`). Since then, the live Supabase project has accumulated **38 tables**, of which only **11** are represented in `schema.sql` and **4 more** are documented in `sql/migrations/10-19` (`garage_users`, `client_device_tokens`, `push_send_log`, `billing_events`, plus columns on `motos`/`clients`/`garages`). That leaves **~19 tables that exist in prod with zero corresponding file anywhere in the repo** — `ordres_reparation`, `or_taches`, `or_pieces`, `or_historique`, `catalogue_pieces`, `entites_facturation`, `factures`, `factures_scannees`, `compteurs_documents`, `pdp_queue`, `pdp_transmissions`, `plans_constructeur`, `moto_proprietaires`, `users_client`, `users_client_sessions`, `email_verifications`, `password_resets`, `auth_logs`, plus two views (`v_factures_pdp`, `v_users_client_stats`). This is on top of already-known drift within existing tables (`devis` was restructured — `devis_lignes` no longer exists, replaced by a `lignes` JSONB column; `clients` gained `client_type`/`raison_sociale`/`siret`/`tva_intracom`; `garages` gained `type`/`actif` and 8+ billing columns; `motos.couleur_dossier`/`proprietaire_type` remain true Postgres ENUMs but `devis.statut`/`factures.statut` are TEXT+CHECK, not ENUMs).

**This was verified live during this research session**, not inferred: I queried the Supabase project's built-in PostgREST OpenAPI endpoint (`GET {SUPABASE_URL}/rest/v1/?apikey=...`) using the existing `SUPABASE_SECRET_KEY` from `.env` — the same credential already used by `setup-supabase.js` and the seed scripts. This required no new tools, no new credentials, and no CLI installation. It returned a full JSON schema (table names, columns, types, NOT NULL/required lists, defaults, FK relationships) for all 38 live tables in one HTTP call.

**Primary recommendation:** Regenerate `schema.sql` using a hybrid of (1) automated PostgREST OpenAPI introspection for ground-truth column/type/nullability/FK data across all 38 tables, (2) the existing `sql/migrations/10-19` files as authored reference for the 4 tables/columns they cover (comments, rationale, RLS/index intent), and (3) a small number of read-only `pg_catalog` queries — run once via Supabase Dashboard SQL Editor (the project's established manual-migration workflow, zero new credentials) — to recover CHECK constraint text, indexes, RLS policies, triggers, and view definitions that the OpenAPI endpoint does not expose. Do **not** pursue `supabase db dump` or direct `pg_dump` as the primary path: neither the Supabase CLI nor `psql`/`pg_dump`/Docker are installed in this environment, and both would require hunting down a new credential (the Postgres direct-connection password) that no existing script in this repo uses.

**Scope-correction flag for the planner:** ROADMAP/REQUIREMENTS success criteria for SCHEMA-01 name only `client_device_tokens`, `push_send_log`, `garage_users`, the `motos` maintenance-tier columns, and the `statut_devis` constraint fix. But the Phase 19 **goal** statement is unambiguous: *"a developer can bootstrap a fresh Supabase project from schema.sql and get a schema matching prod, with no manual patching required."* Given the ~19-table gap discovered above, satisfying the literal success criteria as written would **not** satisfy the phase goal — a bootstrapped project would still be missing the entire repair-order subsystem (L3a), billing/invoicing subsystem (L9 + French e-invoicing "PDP" tables), parts catalogue (L3c-a), and the separate `users_client` client-auth subsystem. See **Open Questions** below — this needs an explicit scope decision before planning proceeds.

## Project Constraints (from CLAUDE.md)

- `motokey-api.js`, `app.html`, `supabase.js`, `MotoKey_Client.html` are protected — no PowerShell/sed/awk/Python edits, no asking Mehdi to hand-copy files. **`schema.sql` is explicitly NOT in this protected list** (confirmed by phase framing) — scripted/generated regeneration of `schema.sql` is permitted.
- Any complex scripted operation should live in `scripts/` and follow the project's `.bak`-before-write convention if it touches protected files (not applicable here since only `schema.sql` is written).
- Verify with `node --check` where applicable (schema.sql is SQL, not JS — no direct equivalent; verification must instead be "run it against a real/fresh Postgres" per Open Questions below).
- Never reference the obsolete `motokey-api-10-production` URL; not relevant to this phase.
- Don't touch the anti-fraude weighting (1.0/0.6/0.3) or 70/30 score formula without Mehdi's explicit validation — not touched by this phase, but be aware `motos.score`/`couleur_dossier` triggers in `schema.sql` implement a **different, older** scoring formula (fixed points per intervention type: vert=12, bleu=8, jaune=5, rouge=-5) than the 70/30 + anti-fraude-weighted formula described in CLAUDE.md's "Architecture métier" section. This existing discrepancy is out of scope for Phase 19 (SCHEMA-01 doesn't ask to fix scoring logic) but the planner should not "helpfully" rewrite `recalc_score_moto()` while regenerating the file — only reproduce what's live.
- Secrets: never print `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_KEY` in plaintext in commands or committed files. All introspection commands in this research were run with the key read from `.env` via `dotenv`, never echoed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-01 | Developer can run `schema.sql` against a fresh Supabase project and get a schema matching prod | PostgREST OpenAPI introspection (verified working, see Code Examples) gives ground truth for columns/types/nullability/FK across all 38 live tables. `pg_catalog` queries (provided below) recover CHECK constraints, indexes, RLS, triggers, views. Combined with `sql/migrations/10-19` as the authored/commented source for the 4 already-tracked additions. Drift inventory below enumerates exactly what's missing from `schema.sql` today. |
</phase_requirements>

## Standard Stack

This phase is not a "pick a library" problem — it is a schema-introspection/reconstruction problem using tools already present in the repo.

### Core
| Tool | Version | Purpose | Why Standard (for this repo) |
|------|---------|---------|-------------------------------|
| `@supabase/supabase-js` | 2.100.1 (installed, confirmed via `npm ls`) | Not used for introspection itself, but confirms the service-role key works and is the existing pattern (`setup-supabase.js`, seed scripts) | Already the project's only DB access layer from Node |
| Node.js built-in `fetch` | Node 24.14.1 (confirmed via `node --version`) | Direct HTTP call to PostgREST's OpenAPI root endpoint | No extra dependency needed — global `fetch` available since Node 18+ |
| Supabase Dashboard SQL Editor | N/A (web UI) | Run read-only `pg_catalog`/`information_schema` queries to recover CHECK constraints, RLS policies, indexes, triggers, views | This is the **exact same mechanism** already used to apply every migration in `sql/migrations/10-19` — zero new tooling, zero new credentials, matches established human-in-the-loop convention |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PostgREST OpenAPI introspection + Dashboard SQL queries | `supabase db dump --linked` (Supabase CLI) | CLI not installed anywhere in this environment (`where supabase` only matched the unrelated local `supabase.js` file). Requires installing a new CLI, running `supabase link`, and authenticating — plus the CLI's dump-via-Postgres path may still need the DB password for some dump modes. No evidence this project has ever used the CLI. Higher setup cost, no clear benefit over what's already verified working. |
| PostgREST OpenAPI introspection + Dashboard SQL queries | Direct `pg_dump` against Supabase's Postgres connection string | Requires obtaining the direct DB connection password from Dashboard > Project Settings > Database — a credential this project has never needed before (only `SUPABASE_URL` + REST API keys are used anywhere in `.env`/scripts). `pg_dump`/`psql` are also not installed locally (confirmed: `where psql`, `where pg_dump` found nothing). Viable as a **fallback** if the hybrid approach proves insufficient, but introduces new credential-hunting mid-phase, which the phase framing explicitly wants to avoid. |
| PostgREST OpenAPI introspection + Dashboard SQL queries | Pure manual reconstruction from `sql/migrations/1-19` only | **Insufficient on its own** — verified during this research that ~19 tables (roughly half of prod) have zero migration file. Manual-only reconstruction would silently reproduce the exact gap this phase exists to close. Migration files remain valuable as the *authored* source for the 4 tables/columns they do cover (better comments/rationale than introspection alone gives), but cannot be the sole source. |

**No installation needed** — `@supabase/supabase-js` and `dotenv` are already in `package.json`; introspection uses Node's built-in `fetch`.

**Version verification:** `@supabase/supabase-js@2.100.1` confirmed installed via `npm ls @supabase/supabase-js` (2026-07-08). No version bump needed for this phase.

## Architecture Patterns

### Recommended reconstruction workflow
```
1. Automated: run a one-off Node script (fetch PostgREST OpenAPI JSON)
   → ground truth for: table names, column names, column types/format,
     NOT NULL columns, column defaults, FK relationships, true ENUM
     type names + allowed values (see "ENUM vs CHECK" pitfall below)

2. Manual (once, via Supabase Dashboard SQL Editor — read-only, zero risk):
   run the pg_catalog queries in "Code Examples" below to recover:
   - exact CHECK constraint definitions (not exposed by OpenAPI)
   - indexes (pg_indexes)
   - RLS policies (pg_policies)
   - triggers (pg_trigger + pg_get_triggerdef)
   - view definitions (pg_get_viewdef) for v_motos_avec_proprietaire,
     v_factures_pdp, v_users_client_stats
   - function bodies (pg_get_functiondef) for anything beyond the
     3 functions already in schema.sql (update_updated_at,
     recalc_score_moto, update_moto_km) — there are likely more,
     given ordres_reparation has its own numbering trigger, entites_facturation
     has dernier_num_devis/dernier_num_facture counters, etc.

3. Reference: read sql/migrations/10-19 for the 4 tracked additions —
   use their comments/rationale verbatim where useful (e.g. migration 17's
   note on why push_send_log.client_id has no FK; migration 15's note on
   why billing columns are all DEFAULT NULL).

4. Author schema.sql following its EXISTING conventions (box-drawing
   section headers, DROP TABLE IF EXISTS ... CASCADE cleanup block in
   FK-safe order, CREATE TYPE block, one CREATE TABLE per section,
   triggers/functions section, INDEX section, RLS section, REALTIME
   section, final verification SELECT). Do not introduce a new style.

5. Verify: schema.sql must actually execute cleanly against a genuinely
   empty Postgres. No local Postgres/Docker/psql is available in this
   environment (confirmed: `docker`, `psql`, `pg_dump` all absent) — this
   step requires a human action: creating a new empty Supabase project
   (free tier) and pasting schema.sql into its SQL Editor. Flag this in
   the plan as an explicit task requiring Mehdi, since it cannot be
   automated from this environment (see Environment Availability).
```

### Pattern: PostgREST OpenAPI introspection as "poor man's schema dump"
**What:** Supabase (via PostgREST) auto-generates an OpenAPI/Swagger spec at `GET {SUPABASE_URL}/rest/v1/` whenever called with a valid `apikey`. The `definitions` object contains one entry per table/view exposed to the REST API, each with `properties` (columns: type, format, default, FK description) and `required` (NOT NULL columns without a default).
**When to use:** Any time you need ground-truth column-level schema for a live Supabase project and don't have `psql`/CLI access, but do have any valid API key (anon or service-role both work — service-role isn't even required for this specific endpoint, though it's what's on hand here).
**Verified working in this exact environment on 2026-07-08:**
```javascript
// Source: verified live during this research session against the project's
// own Supabase instance, using the existing SUPABASE_URL / SUPABASE_SECRET_KEY
// from .env (same credential setup-supabase.js already uses).
require('dotenv').config();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

const res = await fetch(url + '/rest/v1/?apikey=' + key, {
  headers: { Authorization: 'Bearer ' + key }
});
const spec = await res.json(); // { swagger, info, definitions: { <table>: {...} }, ... }
const tables = Object.keys(spec.definitions); // 38 tables/views as of 2026-07-08
```
**Confirmed limitations (do not rely on this endpoint for these):**
- No CHECK constraint text (only true Postgres ENUM types show an `enum: [...]` array — e.g. `motos.couleur_dossier` shows `enum: ["vert","bleu","jaune","rouge"]`, but `devis.statut` and `factures.statut` show only `format: "text"` with no enum list, because they are TEXT columns with a `CHECK` constraint, not ENUM types — the CHECK values are invisible to this endpoint).
- No RLS policy definitions.
- No index definitions (beyond what's implied by PK).
- No trigger/function bodies.
- No UNIQUE constraint info beyond what happens to also be a PK.

### Anti-Patterns to Avoid
- **Trusting OpenAPI's `enum` field as exhaustive for all "state machine" columns:** Only `devis`/`factures`.`statut`, `entites_facturation` fields etc. that are genuine Postgres ENUM types will show allowed values this way. `ordres_reparation.statut` IS a true ENUM (`public.or_statut`, values: `brouillon, valide_client, en_cours, attente, termine, facture, annule` — matches `supabase.js`'s `STATUT_TRANSITIONS` map exactly) — but `devis.statut`/`factures.statut` are TEXT+CHECK. Don't assume they're the same kind of column.
- **Regenerating schema.sql from training-data memory of "what a garage/motorcycle DMS schema probably looks like":** every table in this schema has project-specific denormalization decisions (e.g., `devis` stores a full client/moto *snapshot* at creation time — `client_nom`, `moto_label`, `moto_vin`, `moto_km` — rather than joining live; this is intentional, confirmed by comments in `supabase.js` L470-484). Hand-authoring from assumptions will silently diverge from prod.
- **Silently "fixing" the scoring trigger or other business logic while regenerating schema.sql:** this phase is a faithful-reproduction task, not a refactor. `recalc_score_moto()`'s fixed-point formula in schema.sql is stale relative to CLAUDE.md's documented 70/30 formula, but that discrepancy is not what SCHEMA-01 asks to fix.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Discovering live table/column/type/nullable/FK structure | A custom recursive `information_schema` walker script requiring new DB credentials | PostgREST's built-in OpenAPI endpoint (`GET /rest/v1/?apikey=...`) | Already returns everything needed in one call, using a credential already in `.env`, verified working right now |
| Recovering CHECK constraint / RLS / index / trigger / view definitions | Guessing from code usage patterns alone | `pg_get_constraintdef`, `pg_policies`, `pg_indexes`, `pg_get_triggerdef`, `pg_get_viewdef` — one-time paste into Supabase Dashboard SQL Editor | These are the actual Postgres system catalogs/functions that store this information verbatim — zero ambiguity, and it's the same manual-Dashboard workflow already used for every migration in this repo |
| Testing that schema.sql actually bootstraps cleanly | A local Postgres-in-Docker rig hand-built for this one phase | A fresh, empty Supabase project (free tier) + Dashboard SQL Editor paste-and-run | Matches how the real target audience ("developer bootstraps a fresh Supabase project") will actually use this file — testing against anything else risks false confidence (e.g., a local vanilla Postgres might lack Supabase-specific things like `auth.users`, `extensions.uuid_generate_v4()`, `supabase_realtime` publication) |

**Key insight:** Supabase's live schema is *always* one HTTP GET away via PostgREST's OpenAPI spec, using credentials this project already has. The temptation to reach for `pg_dump`/CLI/new-credential-hunting solutions is unnecessary for 80% of what's needed (columns/types/nullability/FKs) and only the remaining 20% (constraints/RLS/indexes/triggers/views) needs a single manual read-only SQL pass — which the project already does routinely for migrations.

## Live Schema vs schema.sql — Drift Inventory

**Verified 2026-07-08 via PostgREST OpenAPI introspection (`GET {SUPABASE_URL}/rest/v1/?apikey=...`).**

### Tables in schema.sql (11) — baseline, mostly still accurate but with drift
`garages`, `techniciens`, `clients`, `motos`, `interventions`, `plan_entretien`, `devis`, `devis_lignes` (⚠️ **no longer exists in prod** — see below), `fraude_verifications`, `transferts`, `transfert_steps`.

Known drift within these:
- `devis_lignes` **table has been dropped from prod entirely** — replaced by a `devis.lignes JSONB NOT NULL` column. Any regenerated schema.sql must NOT recreate `devis_lignes`.
- `devis` gained (undocumented by any migration): `entite_facturation_id UUID NOT NULL` (FK → `entites_facturation`), `client_id`, `client_nom TEXT NOT NULL` + snapshot fields (`client_adresse/cp/ville/email/tel/siret/tva`), `moto_label/moto_vin/moto_km` snapshot, `lignes JSONB NOT NULL`, `total_ht/total_tva/total_ttc` (replacing schema.sql's `sous_total_ht/tva_montant/base_ht/...`), `remise_montant`, `date_creation/date_validite/date_envoi/date_acceptation/date_refus`, `or_id`, `cree_par`. `statut` is TEXT+CHECK (not the ENUM in schema.sql).
- `clients` gained: `client_type` (true ENUM `public.client_type_enum`: `particulier`, `pro`), `raison_sociale`, `siret`, `tva_intracom`, `adresse_facturation`, plus `is_pro`/`limite_motos_gratuites` (from migration 13, already tracked).
- `garages` gained: `type` (required, not in schema.sql), `actif` (required, not in schema.sql), plus the 8 billing columns from migration 15 (tracked) — 31 total live columns vs. ~20 in schema.sql.
- `motos` gained the L8 polymorphic-ownership columns (migration 13, tracked) and the migration 18 maintenance-tier columns (tracked) — this table matches its migrations closely.

### Tables added by tracked migrations (4) — already have authored source
`garage_users` (migration 12), `client_device_tokens` (migration 16), `push_send_log` (migration 17), `billing_events` (migration 15). **Verified via introspection that these match their migration files exactly** — no additional drift found on these four.

### Tables/views live in prod with ZERO file anywhere in the repo (~19)
| Table/View | Likely origin (inferred from CLAUDE.md delivery history) | Notes |
|---|---|---|
| `ordres_reparation`, `or_taches`, `or_pieces`, `or_historique` | L3a (Repair Orders) — CLAUDE.md marks this "delivered" | `ordres_reparation.statut` is a true ENUM `public.or_statut` matching `supabase.js`'s `STATUT_TRANSITIONS` exactly |
| `catalogue_pieces` | L3c-a (parts catalogue) — CLAUDE.md marks this "delivered" | |
| `entites_facturation` | L9 billing — required NOT NULL FK target for every `devis`/`facture` | `dernier_num_devis`/`dernier_num_facture`/`annee_sequence` suggest a numbering-sequence trigger not in schema.sql |
| `factures`, `factures_scannees`, `compteurs_documents` | L9 billing / OCR facture scanning (mentioned elsewhere in CLAUDE.md as "IA OCR factures") | |
| `pdp_queue`, `pdp_transmissions` | Likely French e-invoicing reform ("PDP" = Plateforme de Dématérialisation Partenaire) — not mentioned in CLAUDE.md at all | Flag for Mehdi — may be WIP/future feature already schema'd but not yet code-wired |
| `plans_constructeur` | Reference data cache (manufacturer maintenance plans, parallel to `plan_entretien`) | |
| `moto_proprietaires` | Distinct from `motos_proprietaires_historique` (migration 13) — a *current* ownership pointer table? | Needs clarification — not explained by any migration |
| `users_client`, `users_client_sessions`, `email_verifications`, `password_resets`, `auth_logs` | A **separate, custom client-auth system** (bcrypt password_hash, refresh_token_hash + famille_id for rotation) distinct from Supabase `auth.users` | Consistent with L8 notes about disabling Supabase's own email confirmation for client register |
| `v_factures_pdp`, `v_motos_avec_proprietaire`, `v_users_client_stats` | Views | `v_motos_avec_proprietaire` IS defined in migration 13 (tracked); the other two are not |

**This list is the single most important research finding for the planner.**

## Common Pitfalls

### Pitfall 1: OpenAPI introspection under-reports "state machine" columns as plain TEXT
**What goes wrong:** Assuming every status/statut column is a Postgres ENUM (like `motos.couleur_dossier`) and copying an `enum: [...]` list that doesn't exist for TEXT+CHECK columns (`devis.statut`, `factures.statut`).
**Why it happens:** OpenAPI's `enum` key is only populated for genuine Postgres ENUM types; CHECK constraints on TEXT columns are invisible to this endpoint.
**How to avoid:** For every status-like column, explicitly run `pg_get_constraintdef` (see Code Examples) before writing the CHECK clause in schema.sql. Don't infer values purely from grepping application code — grepping `supabase.js`/`motokey-api.js` found `brouillon`/`envoye`/`accepte`/`refuse` in active use for `devis.statut`, but the phase description states the live constraint documents `accepte`/`refuse`/`expire`/`converti` — these two sources don't fully overlap, which means neither alone is trustworthy; only the actual constraint definition resolves it.
**Warning signs:** A CHECK clause you write that doesn't match what the running application successfully writes (it would 400/23514 in prod if too narrow).

### Pitfall 2: Manual migration folding alone reproduces exactly the gap this phase exists to close
**What goes wrong:** Reading `sql/migrations/10-19` + `schema.sql` and concluding the fold is complete, because those are the only *files* that exist.
**Why it happens:** ~19 tables were created directly via Supabase Dashboard SQL Editor without ever being saved as a migration file (this project's convention of saving `.sql` files under `sql/migrations/` only began at migration 10, and even after that, at least one significant restructure — `devis`'s snapshot/JSONB rework — happened without a corresponding file).
**How to avoid:** Always cross-check the migration-folding approach against live introspection (this research already did this and found the gap). Treat `sql/migrations/*.sql` as necessary-but-not-sufficient.
**Warning signs:** Any live table name mentioned in application code (`supabase.js`, `motokey-api.js`) that doesn't appear in `schema.sql` or any `sql/migrations/*.sql` file — grep for `.from('` calls as a cross-check.

### Pitfall 3: `DROP TABLE ... CASCADE` cleanup block ordering will break with new FK dependencies
**What goes wrong:** schema.sql's existing "NETTOYAGE" block drops tables in a specific FK-safe order. Adding ~19 more tables with their own FK chains (e.g., `factures` → `entites_facturation` → `garages`; `or_pieces`/`or_taches`/`or_historique` → `ordres_reparation` → `motos`/`garages`) without extending this ordering (or just relying on `CASCADE`, which schema.sql already uses) can either fail or silently leave orphaned types/tables on re-run.
**How to avoid:** Since schema.sql already uses `CASCADE` on every `DROP TABLE`, this is largely self-healing — but the DROP TYPE list (`couleur_dossier_type`, `type_intervention`, etc.) will also need new entries for `or_statut`, `client_type_enum`, `proprietaire_type_enum` (already needed for migration 13, currently missing from schema.sql's cleanup block even though the type is used), and `mode_acquisition_enum`.
**Warning signs:** Re-running schema.sql twice against the same (test) project throws `type already exists` or `relation already exists` errors.

### Pitfall 4: Testing "does schema.sql bootstrap cleanly" has no automatable path in this environment
**What goes wrong:** Assuming a script can verify success criterion 4 ("Executing schema.sql against a fresh Supabase project produces tables/columns matching prod... with no errors") end-to-end without human involvement.
**Why it happens:** No local Postgres, Docker, psql, pg_dump, or Supabase CLI is installed (all confirmed absent in this environment). Supabase also has no anonymous/API-driven way to spin up a brand-new project from this codebase's existing credentials (project creation requires the Supabase Dashboard/Management API with an org-level access token, which isn't in `.env` and isn't used anywhere in this repo).
**How to avoid:** Plan for this as an explicit manual verification step requiring Mehdi: create a free-tier Supabase project, paste schema.sql into its SQL Editor, report any errors back.
**Warning signs:** A plan that marks SCHEMA-01's 4th success criterion "done" without ever having been run against a real empty Postgres.

## Code Examples

### Verified: PostgREST OpenAPI introspection (ground truth for columns/types/FKs)
```javascript
// Source: run live during this research session, 2026-07-08, against this
// project's own Supabase instance. Confirmed status 200, 38 tables returned.
require('dotenv').config();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

const res = await fetch(url + '/rest/v1/?apikey=' + key, {
  headers: { Authorization: 'Bearer ' + key }
});
const spec = await res.json();
// spec.definitions.devis.required -> NOT NULL columns without a default
// spec.definitions.devis.properties -> per-column type/format/default/FK note
```

### Recommended: one-time read-only pg_catalog pass (run via Supabase Dashboard SQL Editor)
```sql
-- CHECK constraints (recovers exact statut_devis / statut_factures allowed values)
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY 1, 2;

-- Indexes (beyond PK)
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- RLS policies
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Triggers
SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation,
       action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY table_name, trigger_name;

-- View definitions
SELECT viewname, pg_get_viewdef(viewname::regclass, true) AS definition
FROM pg_views
WHERE schemaname = 'public';

-- Function bodies (for anything beyond the 3 already in schema.sql)
SELECT proname, pg_get_functiondef(oid) AS definition
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace;
```
This is a single read-only paste-and-run in the Supabase Dashboard SQL Editor (the exact mechanism already used for every migration 10-19) — no new credentials, no risk of mutating data.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `schema.sql` as single source of truth, applied once at v1.0 | Manual, ad-hoc SQL applied directly via Supabase Dashboard SQL Editor for most schema changes since v1.0; only migrations 10-19 (starting ~May 2026) were saved as files | Ongoing since ~March 2026 (per CLAUDE.md's note on the "Option C" HTML migration timeframe) through 2026-07-08 | `schema.sql` is 4+ months stale and missing roughly half of the live table count |
| `statut_devis` as a Postgres ENUM type (`brouillon,envoye,valide,annule`) | `devis.statut` is now a plain TEXT column with a CHECK constraint (exact values unconfirmed — see Open Questions) | Sometime during L2/L9 devis rework (client-facing devis, billing) | ENUM → TEXT+CHECK is a stricter-to-loosen migration pattern (adding a new state doesn't require `ALTER TYPE`); schema.sql regeneration must reflect the CHECK, not recreate the ENUM |
| `devis_lignes` as a normalized child table | `devis.lignes` JSONB column, `devis_lignes` table dropped entirely | Same rework | Any regenerated schema.sql must NOT recreate `devis_lignes` |

**Deprecated/outdated:** `devis_lignes` table (schema.sql still has it; prod does not). `statut_devis` ENUM type (schema.sql still defines/uses it on `devis`; prod uses TEXT+CHECK instead).

## Open Questions

1. **Is Phase 19's true scope "fold known migrations 1-19" (narrow, ~5 tables/columns) or "full live parity" (all 38 tables)?**
   - What we know: ROADMAP/REQUIREMENTS success criteria list only `client_device_tokens`/`push_send_log`/`garage_users`/motos maintenance columns/`statut_devis`. The phase **goal** statement ("schema matching prod, no manual patching required") is unambiguous and broader.
   - What's unclear: Whether the roadmap author was aware of the ~19-table gap when writing success criteria, or whether "migrations 1-18/19" was assumed to be the *complete* list of prod drift.
   - Recommendation: Surface this explicitly to Mehdi before planning task breakdown. If full parity is wanted, this phase's effort is substantially larger than "small maintenance phase" (per REQUIREMENTS.md's framing of v1.4 as "pure debt cleanup") — it involves fully reconstructing ~19 tables' DDL, RLS, indexes, and at least one ENUM type (`or_statut`) and one custom auth subsystem (`users_client*`). If narrow scope is intentionally preferred (e.g., defer the other 19 tables to a future phase and only fix what's named), the phase should say so explicitly and `schema.sql`'s header comment should document that it is a *partial* bootstrap (concession that contradicts the stated goal, but may be an acceptable tradeoff given this is a "no new user-facing feature" maintenance milestone).

2. **Exact CHECK constraint values for `devis.statut` and `factures.statut`.**
   - What we know: Live code writes/reads `brouillon`, `envoye`, `accepte`, `refuse` for `devis.statut` (confirmed via grep of `supabase.js`/`motokey-api.js`). The phase description states the live constraint documents `accepte`/`refuse`/`expire`/`converti` replacing `valide`/`annule`.
   - What's unclear: These two sources don't fully reconcile — `brouillon`/`envoye` don't appear in the phase description's list, and `expire`/`converti` don't appear anywhere in current application code. Either the phase description is describing a subset/rename, or the actual CHECK constraint is broader than either source alone suggests.
   - Recommendation: Run the `pg_get_constraintdef` query in Code Examples (one-time, read-only, via Dashboard SQL Editor) before finalizing the CHECK clause. Do not guess.

3. **What are `moto_proprietaires`, `pdp_queue`/`pdp_transmissions`, and `plans_constructeur` for?**
   - What we know: They exist live, with the column shapes shown in the Drift Inventory above.
   - What's unclear: No CLAUDE.md/commit-message trail explains them (`pdp_queue`/`pdp_transmissions` in particular look like unstarted/WIP French e-invoicing integration, not mentioned anywhere in current project docs).
   - Recommendation: Ask Mehdi directly, or treat them as "reproduce the DDL faithfully without explaining intent" if full-parity scope is chosen — the goal is bootstrap parity, not necessarily annotated understanding.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (`supabase db dump`) | Candidate approach 1 | ✗ | — | Not needed — PostgREST OpenAPI introspection covers the same ground with existing credentials |
| `psql` / `pg_dump` | Candidate approach 2 | ✗ | — | Not needed for the same reason; would also require a new DB password credential |
| Docker | Local Postgres test rig | ✗ | — | Use a free-tier Supabase project + Dashboard SQL Editor for verification (manual, human-in-loop) |
| Node.js | Introspection script | ✓ | v24.14.1 | — |
| `@supabase/supabase-js` | Existing pattern reference | ✓ | 2.100.1 | — |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (.env) | PostgREST OpenAPI introspection | ✓ | — | — |
| Supabase Dashboard access | Running one-time `pg_catalog` read-only queries; creating a fresh test project for final verification | Assumed ✓ (Mehdi has used it for every migration to date) | — | — |

**Missing dependencies with no fallback:**
- None — every candidate approach that's actually needed (PostgREST OpenAPI + Dashboard SQL Editor) is already available.

**Missing dependencies with fallback:**
- Supabase CLI, `psql`/`pg_dump`, Docker — all have viable fallbacks (PostgREST OpenAPI + manual Dashboard SQL) that this research confirmed working live.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None formal (no Jest/pytest/Mocha config found) — custom Node scripts run directly (`node test-api.js`, `node tests/test-*.js`) |
| Config file | none — `package.json`'s `"test"` script is `node test-api.js` |
| Quick run command | `node test-api.js` (existing smoke suite, 9/9 passing as of Phase 18) |
| Full suite command | `node test-api.js && node tests/test-client-device-tokens.js && node tests/test-or-e2e.js` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-01 | `schema.sql` executes without error against a genuinely empty Postgres and produces tables/columns matching prod | manual (bootstrap-and-diff) | No automated command possible from this environment (no local Postgres/Docker/CLI) — requires a human to create a fresh Supabase project and paste-run schema.sql, then either eyeball or re-run the introspection script from Code Examples against the *new* project and diff its output against the saved prod introspection JSON | ❌ Wave 0 — no existing test covers this; recommend authoring a small Node diff script (introspect prod once, introspect fresh project once, diff table/column sets) as part of this phase's own verification, even though the actual bootstrap step is manual |

### Sampling Rate
- **Per task commit:** N/A (schema.sql is a single artifact; no incremental unit tests apply)
- **Per wave merge:** Re-run the PostgREST OpenAPI introspection script against prod and diff against the version captured at research time, to catch any further live drift introduced mid-phase
- **Phase gate:** Full manual bootstrap against a fresh Supabase project (human action) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] No script exists yet to diff "tables/columns from a fresh-bootstrapped project" against "tables/columns from prod" — recommend authoring one (reusing the Code Examples introspection snippet, parameterized by URL/key) as an artifact of this phase, since it directly operationalizes success criterion 4.
- [ ] No fresh/spare Supabase project currently exists for bootstrap testing — this is a human/Mehdi action, not a code gap, but must be sequenced into the plan (e.g., as a manual verification task at the end).

## Sources

### Primary (HIGH confidence — verified live during this research session, 2026-07-08)
- `GET {SUPABASE_URL}/rest/v1/?apikey=...` (PostgREST auto-generated OpenAPI spec) — queried directly against this project's live Supabase instance; returned 38 table/view definitions with columns, types, required lists, defaults, FK descriptions. Full JSON captured to scratchpad for this research session.
- `git log --oneline --follow -- schema.sql` — confirms schema.sql has exactly one commit (`10096b6`, "MotoKey-API v1.0") in its entire history.
- Direct reads of `sql/migrations/10_mecano_session_timeout.sql` through `19_clients_email_garage_unique.sql` (all 10 files, full content).
- Direct read of `schema.sql` (full content, 537 lines).
- `npm ls @supabase/supabase-js`, `node --version` — confirmed tool versions installed in this environment.
- `command -v`/`where` checks for `psql`, `pg_dump`, `supabase`, `docker` — all confirmed absent.

### Secondary (MEDIUM confidence — code comments describing live schema, not independently re-verified column-by-column beyond what OpenAPI confirmed)
- `supabase.js` lines 470-620 (`Devis` module) — extensive comments describing the live `devis` schema reconciliation done during a prior phase ("confirmé par introspection OpenAPI PostgREST le 04/07/2026") — cross-checked against this session's own introspection and found consistent.
- `scripts/seed-test-devis-16-uat.js` — corroborating comments about `devis` schema reality.
- `CLAUDE.md` — delivery history (L3a, L3c-a, L9, L8) used to infer likely origins of undocumented tables.

### Tertiary (LOW confidence — inferred, not verified; flagged explicitly in Open Questions)
- Purpose/origin of `pdp_queue`/`pdp_transmissions`/`plans_constructeur`/`moto_proprietaires` — inferred from column names and French e-invoicing domain knowledge, not confirmed against any project documentation or commit message.
- Exact CHECK constraint text for `devis.statut`/`factures.statut` — not independently queried this session (avoided running additional live queries against prod without a clear read-only/write-safe boundary already established for this specific check); recommend the planner execute the provided `pg_get_constraintdef` query before finalizing.

## Metadata

**Confidence breakdown:**
- Standard stack / tooling recommendation: HIGH — verified working live, not just documented
- Drift inventory (which tables/columns exist in prod): HIGH — directly queried, not inferred
- Exact CHECK constraint values, RLS policies, indexes, triggers, view bodies: LOW/MEDIUM — known to exist and known how to retrieve them, but not yet retrieved (would require executing additional queries; provided as ready-to-run SQL for the plan to execute)
- Scope interpretation (narrow vs. full-parity): N/A — this is a decision for the user/planner, not a research finding with a confidence level

**Research date:** 2026-07-08
**Valid until:** Short shelf life — 7 days. This research is a live snapshot of a schema known to be actively drifting via undocumented manual Dashboard edits; any further schema changes before planning/execution will invalidate parts of the Drift Inventory. Re-run the introspection script in Code Examples immediately before starting task execution if more than a few days elapse.
