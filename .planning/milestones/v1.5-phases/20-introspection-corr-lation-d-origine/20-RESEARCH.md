# Phase 20: Introspection & Corrélation d'Origine - Research

**Researched:** 2026-07-09
**Domain:** PostgreSQL/Supabase schema introspection (exact column metadata) + git history archaeology (column-origin correlation)
**Confidence:** HIGH (introspection tooling and method — reuses Phase 19's verified approach) / HIGH (the two headline findings below — both independently verified live) / MEDIUM (exact numeric precision/scale and constraint text — not yet pulled via pg_catalog, requires a live query this research did not execute) / LOW (origin of the ~9 columns confirmed to have zero code trail — inference only, needs Mehdi)

## Summary

This research re-examined the exact same drift Phase 19 catalogued (`garages`/`clients`/`interventions`/`devis` columns with "no corresponding migration file") and found two things that materially change the phase's shape.

**Finding 1 — `clients`' 5 "undocumented" columns are NOT actually undocumented.** A legacy `migrations/` directory (distinct from `sql/migrations/`, which is the only directory Phase 19's research checked) contains `migrations/04-rbac-migration.sql` — a fully authored, committed SQL file (commit `c66ad69`, 2026-04-14, `feat(L4): migration RBAC — client_type + colonnes pro/particulier`) that adds exactly `client_type` (ENUM `client_type_enum`), `raison_sociale`, `siret`, `tva_intracom`, `adresse_facturation` to `clients`, complete with types, a business CHECK constraint (`clients_pro_requirements`), a unique index on `siret`, and `COMMENT ON COLUMN` documentation for each. Live introspection (run during this research) confirms prod matches this file's DDL exactly. This means SCHEMA-02 (exact type/constraints) and SCHEMA-03 (git correlation) are **already fully answered for `clients`** — the work is "read and cross-reference an existing file," not "introspect from scratch."

**Finding 2 — 9 of the remaining ~33 columns (all 5 on `garages`, all 4 on `interventions`) are genuine ghost columns: they exist in prod but are never read or written by any code path, in the entire git history.** This was verified three ways: (a) `git log -S<column>` across the full repo history (302 commits, back to `10096b6`) returns zero hits for `marque_officielle`, `niveau_preuve`, `operation_code`, `facture_id` (as an interventions column) in any application file; (b) `Garages.update()`'s explicit field allowlist in `supabase.js` (line 186) does not include `ville`, `cp`, `type`, `marque_officielle`, or `actif`; (c) `Interventions.create()`'s explicit insert payload (line 397) does not include `niveau_preuve`, `facture_id`, `photo_url`, or `operation_code`. Their origin **cannot** be established via git correlation — SCHEMA-03 will need to fall back to semantic inference (documented below) with explicit LOW confidence, or a direct question to Mehdi.

The remaining ~24 `devis` columns DO have a code trail, but with an important trap: the code was largely retrofitted to match an already-drifted database, not the other way around. Commit `f2d7d9a` (2026-05-11, "fix(devis): aligner noms colonnes backend sur schema base") and `b29d4f5` (2026-07-04, "fix(16-01): rewrite Devis data-access layer against real live devis schema") both explicitly describe fixing code to match a schema that already existed in prod. The earliest git evidence for these columns is therefore a **lower bound on code awareness**, not the true DB-origin date — the actual `ALTER TABLE` likely happened earlier via an undocumented Dashboard session. This is the same pitfall Phase 19 already flagged for `devis.statut`'s CHECK values (Pitfall 1 in 19-RESEARCH.md) — it now applies to the *whole* `devis` snapshot restructure, not just one column.

**Primary recommendation:** Do not re-run Phase 19's PostgREST-OpenAPI-only introspection as the sole tool — it is confirmed insufficient for "exact type/constraints" (SCHEMA-02 literally requires this): it cannot report exact `NUMERIC(p,s)` precision, exact `TEXT`/`VARCHAR` length, or CHECK constraint text, and none of the 4 target tables' undocumented columns currently carry an explicit CHECK (only `clients.client_type`'s ENUM shows up, already fully known from migration 04). Extend the existing `scripts/introspect-schema.js` (or add a sibling script) to run `information_schema.columns` + `pg_constraint` queries against the 4 target tables specifically, via the same direct-`pg`-connection pattern Phase 19 plan 03 already used and validated (Supabase Dashboard SQL Editor paste is unreliable — confirmed 3 separate truncation failures in that session). For the git-correlation half (SCHEMA-03), use `git log -S<column> --oneline -- .` per column as the primary tool, but treat every result critically per the two verified patterns above (ghost column → no result at all; devis column → result is a "code catch-up" commit, not true origin — note this explicitly rather than reporting the catch-up commit as the origin).

## Project Constraints (from CLAUDE.md)

- `schema.sql` and `sql/migrations/` are **not** in CLAUDE.md's protected-file list (`motokey-api.js`, `app.html`, `supabase.js`, `MotoKey_Client.html`) — scripted/generated edits are permitted, but the phase brief asks for "careful, direct, versioned edits," matching the pattern Phase 19 already established (hand-authored `schema.sql` sections, no sed/awk).
- Secrets: never print `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_KEY`/the Postgres direct-connection password in plaintext in commands or committed files (already the convention in `scripts/introspect-schema.js`).
- No PowerShell/Python one-liners on critical files — not directly applicable here (this phase touches no critical files at all; it is investigation-only, producing research notes), but any throwaway introspection script should follow the same `scripts/`-versioned, `.bak`-before-write spirit used elsewhere in the repo.
- `git commit -m "title" -m "body"` — never a bash heredoc (per user memory `feedback_powershell_commit`), relevant if this phase's plan later commits findings.
- Communicate in French with Mehdi for any human-facing summary/decision points (per user memory `feedback_langue_francais`) — the RESEARCH.md itself can stay in the project's working language (English, matching Phase 19's RESEARCH.md), but any resume-signal/question posed directly to Mehdi during planning/execution should be in French.
- Report results and await explicit "GO" before any `git push` (per user memory `feedback_report_before_push`) — not directly triggered by a research-only phase, but relevant once Phase 21/22 start writing/pushing migration files.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-02 | Chaque colonne non documentée est identifiée avec son type exact, ses contraintes et sa nullabilité via introspection Postgres | `clients`' 5 columns: fully answered already by `migrations/04-rbac-migration.sql` (verified matching prod). `garages`/`interventions`/`devis`' remaining columns: PostgREST OpenAPI (existing `scripts/introspect-schema.js`) gives type/format/nullable/default/FK-note for all of them (captured in this research's Preliminary Findings tables below) but NOT exact numeric precision/length or CHECK text — none of these specific columns show a CHECK via OpenAPI, but exact `NUMERIC(p,s)`/`TEXT` length still requires an `information_schema.columns` query, which this research provides as ready-to-run SQL (see Code Examples) but did not execute (would require the direct-pg-connection credential, which is not in `.env` and must come fresh from Mehdi per Phase 19's precedent). |
| SCHEMA-03 | Chaque colonne découverte est corrélée à la livraison/fonctionnalité qui l'a introduite, via l'historique git | `clients`: trivially answered — `c66ad69`/`migrations/04-rbac-migration.sql` IS the origin commit, with its own descriptive message. `garages` (5 cols) + `interventions.niveau_preuve/facture_id/operation_code` (3 of 4 cols): **no git trail exists** — confirmed via exhaustive `git log -S` across full history and explicit allowlist inspection; origin must be inferred semantically (documented below) and flagged LOW confidence. `interventions.photo_url`: ambiguous — the term appears in git history but for other tables' `photo_url` columns (motos, garage logo), not interventions' — needs the same disambiguation care for `devis`. `devis` (24 cols): git method **works but is biased late** — documented method + the specific pitfall (code-catch-up commits masquerade as origin) + representative verified examples for the planner to extend column-by-column. |
</phase_requirements>

## Standard Stack

This is not a "pick a library" phase — it reuses tooling already built and validated in Phase 19.

### Core
| Tool | Version | Purpose | Why Standard (for this repo) |
|------|---------|---------|-------------------------------|
| `scripts/introspect-schema.js` (existing, Phase 19) | committed, default mode | PostgREST OpenAPI introspection — table/column/type/nullable/default/FK for all 38 live tables in one HTTP call | Already built, already uses `.env`'s existing `SUPABASE_SECRET_KEY`, zero new credentials. Confirmed still working (re-ran during this research, 38 tables returned). |
| `pg` (node-postgres) | already present in `node_modules` (installed `--no-save` during Phase 19 plan 03) | Direct Postgres connection for `information_schema`/`pg_catalog` queries the OpenAPI endpoint cannot expose (exact precision/length, CHECK text, indexes, constraints) | Validated working in Phase 19 plan 03 after the Supabase Dashboard SQL Editor unpredictably truncated large pastes 3 times in one session. Reusing this pattern avoids re-discovering the same failure mode. |
| `git log -S<term> --oneline -- .` (pickaxe search) | git (already installed) | Finds the earliest and latest commits where a literal string's occurrence count changed — used to trace when a column name first appears in application code | Standard git archaeology tool; no new dependency. Verified working throughout this research session against the full 302-commit history. |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `git show --stat <sha>` / `git show -s --format="%h %ad %s" --date=short <sha>` | git | Get commit date + file list + message for a candidate origin commit, to build the "livraison" attribution | After `git log -S` narrows candidates, to confirm dates and read the full commit message for delivery-name context (e.g. `L3a-ter`, `L4-v2-hardening`) |
| `Grep` (ripgrep, via Claude Code tool) | — | Confirm a column name has zero references in current-state code (not just history) | Complements `git log -S` — a column can appear in history (added then later removed from code) or never appear at all; both matter for the "ghost column" determination |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct `pg` connection for exact type/constraint capture | Supabase Dashboard SQL Editor paste-and-run (same as Phase 19 plan 01 used for the `devis.statut` CHECK) | Still viable for **small, single-query** pastes (Phase 19 plan 01 used it successfully for a short query). Only failed in plan 03 when pasting the *entire* `schema.sql` (500+ lines) — the queries needed for Phase 20 (see Code Examples) are short (~15-20 lines each), well within what worked reliably in plan 01. Recommend Dashboard paste as primary, `pg` connection as fallback if truncation recurs. |
| `git log -S` per column | `git log -p --all -- . \| grep -B5 <column>` (full-history grep) | Much slower, harder to isolate the *first* introducing commit (pickaxe search is purpose-built for "when did this string's occurrence count change" — a plain grep-through-history requires manual scanning of every commit). No benefit over pickaxe for this use case. |
| Reading both `migrations/` and `sql/migrations/` directories | Trusting Phase 19's directory listing (`sql/migrations/` only) | **This is not optional** — Finding 1 above proves the `migrations/` directory (7 files, commits `c66ad69` through `1dfe935`, spanning 2026-04-14 to 2026-05-04) contains real, relevant, previously-unchecked DDL. Any Phase 20 work must start by reading all 7 files in `migrations/`, not just `sql/migrations/10-19`. |

**No installation needed.** `pg` is already in `node_modules` (verify with `node -e "require.resolve('pg')"` before relying on it — Phase 19 installed it with `--no-save` so it is NOT in `package.json` and could theoretically be pruned by a future `npm install`/`npm ci`; if missing, `npm install pg --no-save` again, exactly as Phase 19 plan 03 did).

**Version verification:** `scripts/introspect-schema.js` re-run live 2026-07-09 during this research, confirmed 38 tables returned, PostgREST OpenAPI endpoint unchanged since Phase 19 (2026-07-08). No version drift to report — this is a Supabase-hosted endpoint, not an npm package.

## Architecture Patterns

### Recommended two-pass workflow (mirrors Phase 19's, applied to just the 4 target tables)

```
PASS 0 — Read BOTH migration directories before touching Postgres:
  1. Read all 7 files in migrations/ (04-rbac-migration.sql, 04-rls-harden.sql,
     05-cleanup-client-doublons.sql, 07b-auth-client-migration.sql.archived-pre-pivot,
     07b-pivot-migration.sql, 08-livraison-3a-ordres-reparation.sql,
     09-l3c-catalogue-pieces.sql) — NOT just sql/migrations/10-19.
  2. Cross off any of the ~38 target columns already fully explained by one of
     these files (this research found migrations/04-rbac-migration.sql explains
     ALL 5 of clients' undocumented columns — verify this is still the full set
     before assuming the other 3 tables have zero coverage there too).

PASS 1 — Exact type/nullability/constraints (SCHEMA-02) for whatever remains
  (garages: 5 cols, interventions: 4 cols, devis: ~24 cols — 33 total after
  clients is excluded by Pass 0):
  1. PostgREST OpenAPI (scripts/introspect-schema.js default mode) — gives
     type/format, NOT NULL (via required[]), default, FK note for all of them
     in one call. This research already captured this for all 4 tables (see
     Preliminary Findings below) — re-run only if schema has drifted further
     since 2026-07-09.
  2. information_schema.columns query (see Code Examples) for exact
     NUMERIC(precision,scale) / TEXT vs VARCHAR(n) — OpenAPI's "format" field
     collapses all numeric types to "numeric" with no precision/scale, and
     collapses TEXT/VARCHAR to "text"/"character varying" with no length.
  3. pg_constraint query scoped to the 4 tables (see Code Examples) — confirms
     whether any of the 33 remaining columns carry an explicit CHECK/UNIQUE
     beyond what OpenAPI's enum field already reveals (this research found
     none currently do, but this must be verified with the actual query, not
     assumed from OpenAPI's silence — same Pitfall 1 lesson as Phase 19).

PASS 2 — Origin correlation (SCHEMA-03) for the same 33 columns:
  1. For each column, run: git log -S"<column_name>" --oneline -- . | tail -1
     (oldest commit touching that literal string, across ALL files, not just
     JS — SQL migration files count too).
  2. CRITICAL disambiguation step: many column names are reused across
     multiple tables (photo_url, actif, type, ville, cp, total_ht, notes,
     created_at). A raw pickaxe hit does NOT tell you which table's column it
     is. Before trusting a hit, open the diff (`git show <sha> -- <file>`) and
     confirm the surrounding code actually references the target table
     (e.g. `.from('interventions')`, `INSERT INTO garages`) near the column
     name — not just that the string appears somewhere in that commit.
  3. If zero hits: this is a ghost column (see Common Pitfalls below) — do
     not force an attribution. Record "no code trail found" and move to
     semantic inference only, flagged LOW confidence.
  4. If hits exist but read like "fix column name to match real schema" /
     "rewrite against real live schema" (the devis pattern found in this
     research): the origin is NOT that commit. Note the commit as "earliest
     code AWARENESS" and separately flag "true DB origin likely earlier,
     unrecoverable from git — was a manual Dashboard ALTER TABLE."
```

### Pattern: Ghost-column detection via explicit allowlist inspection
**What:** Several of this codebase's data-access modules (`Garages.update`, `Interventions.create`, `Motos.update`, `OrTaches.update`, etc. in `supabase.js`) use an explicit `allowed = [...]` array to whitelist which fields a given operation may write, rather than passing `req.body`/payload straight through.
**When to use:** Before concluding "this column has no git trail" is surprising or wrong, check whether the relevant module's write path even has a route to set it. If the column isn't in ANY allowlist for ANY write operation, and isn't in the initial `insert(...)` call's literal object either, the column is confirmed unreachable from current application code — the ghost-column finding is not just "grep found nothing," it's "the code architecturally cannot write this field."
**Verified working in this exact repo, 2026-07-09:**
```javascript
// supabase.js line 186 — Garages.update()'s allowlist. Confirms ville/cp/type/
// marque_officielle/actif have no write path at all:
const allowed = ['nom','tel','adresse','siret','taux_std','taux_spec','tva','sms_active','mecano_session_timeout_minutes'];

// supabase.js line 397-408 — Interventions.create()'s literal insert payload.
// Confirms niveau_preuve/facture_id/photo_url/operation_code are never set:
const inter = await insert('interventions', {
  moto_id, garage_id,
  type: payload.type, titre: payload.titre, description: payload.description || '',
  km: payload.km, technicien_id: payload.technicien_id || null,
  montant_ht: payload.montant_ht || 0, montant_ttc: payload.montant_ttc || 0,
  date_intervention: payload.date || new Date().toISOString().split('T')[0]
});
```

### Anti-Patterns to Avoid
- **Treating "no git-log-S hit" as "column doesn't matter" / skippable:** SCHEMA-02/03's success criteria explicitly require ALL undocumented columns to be covered, including ghost columns. A ghost column still needs its exact type/nullability/constraint captured (SCHEMA-02) — the origin (SCHEMA-03) is what's allowed to be "unknown, inferred only."
- **Trusting a `git log -S` hit without opening the diff:** column names like `actif`, `type`, `ville`, `cp`, `photo_url` are reused across `garages`, `clients`, `catalogue_pieces`, `techniciens`, `garage_users`, `motos`, and `devis` in this schema. A hit on `actif` might be about `garage_users.actif` (has a real, recent, well-documented origin — migration 12) while `garages.actif` remains a ghost column. Conflating them would produce a false SCHEMA-03 answer.
- **Assuming `sql/migrations/` is the only migration directory:** this research's Finding 1 disproves that assumption for `clients`. Do not repeat Phase 19's directory-scope miss for the other 3 tables — Pass 0 above is mandatory, not optional, even though this research already did it and found nothing further for `garages`/`interventions`/`devis`.
- **Reporting a "code catch-up" commit as the origin commit:** `f2d7d9a` and `b29d4f5` explicitly describe fixing code to match an already-existing database state. If SCHEMA-03's deliverable lists these as the origin of `devis.date_refus`/`date_acceptation`/etc., it will be factually wrong (the column existed before either commit) — report them as "earliest code awareness" with the caveat, per the workflow above.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Introspecting live column types/nullability/FKs | A new from-scratch introspection script | Existing `scripts/introspect-schema.js` (default mode, unmodified) | Already does exactly this for all 38 tables in one call, verified still working 2026-07-09 |
| Exact numeric precision/scale, exact text length, CHECK constraint text | Guessing from column names or from application code's validation logic | `information_schema.columns` + `pg_constraint` queries (see Code Examples), run via the same Dashboard-SQL-Editor-first / direct-pg-fallback pattern Phase 19 already validated | These are the actual Postgres catalogs — zero ambiguity. Phase 19 already proved OpenAPI-only introspection under-reports this class of information (Pitfall 1 in 19-RESEARCH.md) |
| Finding when a column name first appeared in code | Manually skimming `git log -p` commit-by-commit | `git log -S<term> --oneline -- .` (pickaxe) | Purpose-built for exactly this; verified fast and accurate throughout this research (302-commit history, sub-second results per query) |
| Determining whether prod's `clients` schema still matches `migrations/04-rbac-migration.sql` | Assuming the file is current without checking | Re-run `scripts/introspect-schema.js` and diff its `clients` output against the migration file's `ADD COLUMN` list (this research already did this — 2026-07-09 — and confirmed an exact match; a fresh re-check immediately before Phase 21 planning is cheap insurance against further silent drift) | Column-level ground truth always beats trusting a committed file to still be accurate, given this project's confirmed history of manual Dashboard edits with no corresponding file (that is the entire premise of this milestone) |

**Key insight:** The single biggest time-saver for this phase is Pass 0 (read `migrations/` in full) — it was skipped by Phase 19 and, when done, immediately resolved 5 of the ~38 columns (13%) with zero Postgres queries and zero git archaeology needed, because the file already contains the exact DDL, constraints, comments, and its own commit IS the origin.

## Preliminary Findings — Column-by-Column (captured 2026-07-09, from live introspection + git correlation)

### `clients` (5 columns) — FULLY RESOLVED, no further research needed
| Column | Type (live) | Nullable | Default | Origin |
|--------|------|----------|---------|--------|
| `client_type` | `client_type_enum` (`particulier`\|`pro`) | NOT NULL | `'particulier'` | `migrations/04-rbac-migration.sql`, commit `c66ad69` (2026-04-14, "feat(L4): migration RBAC — client_type + colonnes pro/particulier") |
| `raison_sociale` | `text` | nullable | none | same file/commit |
| `siret` | `text` | nullable | none (has a `UNIQUE ... WHERE siret IS NOT NULL` index, `idx_clients_siret`) | same file/commit |
| `tva_intracom` | `text` | nullable | none | same file/commit |
| `adresse_facturation` | `text` | nullable | none | same file/commit |

Also carries a business rule not previously documented anywhere in `schema.sql`: `CONSTRAINT clients_pro_requirements CHECK (client_type = 'particulier' OR (client_type = 'pro' AND raison_sociale IS NOT NULL AND siret IS NOT NULL))`.

### `garages` (5 columns) — no migration file, no code trail (ghost columns)
| Column | Type (live) | Nullable | Default | Git trail | Semantic inference (LOW confidence) |
|--------|------|----------|---------|-----------|--------------------------------------|
| `ville` | `text` | nullable | none | none found | Address split candidate (paired with `cp`) — `garages.adresse` is a single free-text field today; `ville`/`cp` look like a prepared-but-unused structured-address migration |
| `cp` | `text` | nullable | none | none found | Same as above |
| `type` | `text` | NOT NULL | `'pro'` | ambiguous only (generic term, not traceable) | CLAUDE.md's RBAC hierarchy comment literally says "CONCESSION (marque officielle...)" — `type` may be a prepared `'pro'` vs `'concession'` distinction for the VERT-tier gating described in CLAUDE.md's color system, never wired into RLS/RBAC logic (current RBAC uses `app_metadata.role`, not this column) |
| `marque_officielle` | `text` | nullable | none | none found (zero hits, full history) | Paired with `type` — likely intended to store which brand a CONCESSION-type garage officially represents, per the "concession officielle" wording in CLAUDE.md's VERT-tier description |
| `actif` | `boolean` | NOT NULL | `true` | none found for `garages.actif` specifically (hits exist for `actif` but all trace to `garage_users.actif`/`catalogue_pieces.actif`, different tables — confirmed by reading each diff) | Likely a prepared soft-delete/deactivation flag for garages, never wired into any query's `WHERE` clause |

**Verified:** `Garages.update()`'s field allowlist (`supabase.js` line 186) does not include any of these 5 — confirmed architecturally unreachable from current write paths, not just absent from history.

### `interventions` (4 columns) — no migration file; 3 of 4 have zero code trail
| Column | Type (live) | Nullable | Default | Git trail | Semantic inference (LOW confidence) |
|--------|------|----------|---------|-----------|--------------------------------------|
| `niveau_preuve` | `text` | nullable | `'declare'` | none found (zero hits, full history) | Default value `'declare'` directly matches the anti-fraude proof-tier vocabulary in CLAUDE.md (`facture`=1.0, `visuel`=0.6, `declare`=0.3) — strongly suggests this column was scaffolded FOR the anti-fraude weighting system but the actual scoring implementation (`recalc_score_moto()` trigger, per Phase 19's finding) uses a different, simpler fixed-points-per-type formula that doesn't read this column at all |
| `facture_id` | `uuid`, FK → `factures_scannees.id` | nullable | none | none found as a JS/HTML literal, but `factures_scannees` (the FK target table) is named as a TODO placeholder in `migrations/04-rls-harden.sql` line ~173 ("TODO RBAC phase 2 : durcir aussi ces tables si elles existent — devis, factures, ..., factures_scannees") — commit `b3785eb` (2026-04-14, L4 RLS hardening) | Scaffolded for a facture-OCR-scan-to-intervention link (matches CLAUDE.md's "IA : Anthropic API pour OCR factures"), never wired — `Interventions.attachFacture()` exists but writes `facture_url`/`facture_ocr` (already-documented columns), NOT `facture_id` |
| `photo_url` | `text` | nullable | none | ambiguous only — `photo_url` hits in git history all trace to `motos.photo_url`/other tables' photo fields when diffs are opened, none to `interventions.photo_url` specifically | Likely intended for photo evidence per-intervention (distinct from the moto's general photo), never wired — `Interventions.create()`'s literal payload confirms no write path |
| `operation_code` | `text` | nullable | none | none found (zero hits, full history) | Possibly meant to link an intervention back to `plan_entretien.code_operation`, never wired |

**Verified:** `Interventions.create()`'s literal insert payload (`supabase.js` line 397-408) does not include any of these 4 — confirmed architecturally unreachable from the primary write path (an `Interventions.update()` passthrough exists that could theoretically write them via a raw payload, but no caller in `motokey-api.js` or `app.html` was found sending these field names).

### `devis` (~24 columns) — no migration file; code trail exists but is a LATE retrofit, not the origin
Representative verified examples (not exhaustive — full 24-column sweep is planner/execution work):

| Column | Type (live) | Nullable | Default | Earliest git hit | Caveat |
|--------|------|----------|---------|-------------------|--------|
| `entite_facturation_id` | `uuid`, FK → `entites_facturation.id` | NOT NULL | none | `b29d4f5` (2026-07-04, "rewrite Devis data-access layer against real live devis schema") | `entites_facturation` itself is one of Phase 19's ~19 untracked tables (L9 billing) — likely true origin is somewhere in the L9 Stripe billing buildout (v1.1, shipped 2026-06-16) or later, NOT the 2026-07-04 commit, which only documents/reconciles it |
| `date_acceptation`, `date_refus` | `timestamptz` | nullable | none | `f2d7d9a` (2026-05-11, "fix(devis): aligner noms colonnes backend sur schema base (refuse_at->date_refus, valide_at->date_acceptation)") | Commit message explicitly says this is a rename-to-match-reality fix — the columns already existed in prod before 2026-05-11 under this research's reading; true origin is earlier and unrecoverable from git |
| `client_nom`, `client_adresse`, `client_cp`, `client_ville`, `client_email`, `client_tel`, `client_siret`, `client_tva` | `text` (all nullable except `client_nom` NOT NULL) | mixed | none | same `b29d4f5`/`f2d7d9a` cluster | Same caveat — these are a client-snapshot pattern (legal/audit requirement: devis must preserve client details as they were at issue time, not live-join), consistent with commit `b29d4f5`'s own code comment at `supabase.js` L471 referencing a prior "introspection OpenAPI PostgREST le 04/07/2026" reconciliation |
| `moto_label`, `moto_vin`, `moto_km` | `text`/`text`/`integer` | nullable | none | `af3b15f` (2026-07-04, devis seed fixture "real schema") | Same moto-snapshot pattern, same caveat |
| `lignes` | `jsonb` | NOT NULL | none | same cluster | Replaces the dropped `devis_lignes` table (confirmed by Phase 19) |
| `total_ht`, `total_tva` | `numeric` | NOT NULL | `0` | same cluster | `total_ttc` is a DIFFERENT column already present in `schema.sql`'s original v1.0 baseline — do not conflate; only `total_ht`/`total_tva` are new/undocumented |
| `remise_montant` | `numeric` | nullable | `0` | same cluster | `remise_pct`/`remise_type`/`remise_note` are already in `schema.sql` v1.0 — only `remise_montant` is new |
| `date_creation`, `date_validite`, `date_envoi` | `timestamptz`/`date`/`timestamptz` | mixed | `date_creation` defaults `now()` | same cluster | — |
| `or_id` | `uuid`, nullable | nullable | none | same cluster | Links a devis to an `ordres_reparation` row — `ordres_reparation` is itself in the ~19-table untracked-subsystem list (out of this milestone's scope per REQUIREMENTS.md), so full FK-target documentation is inherently bounded by that out-of-scope decision |
| `notes`, `cree_par` | `text` | nullable | none | `2df75a7` (2026-05-20, L8-Commit1) touches `cree_par`-adjacent code; needs per-column confirmation | Lower confidence than the cluster above — flagged for planner to verify individually |
| `client_id` | `uuid`, nullable | nullable | none | not individually isolated in this pass | Flagged for planner to verify individually — likely same cluster as the client-snapshot columns (added to support linking a devis to a registered `clients` row in addition to the snapshot fields, for the L8 polymorphic-ownership/L2-client-portal work) |

**Total column count sanity check:** `garages` (5) + `clients` (5, resolved) + `interventions` (4) + `devis` (24) = 38, matching the count implied by the additional_context's "~40 columns" and PROJECT.md's Known Gaps enumeration.

## Common Pitfalls

### Pitfall 1: Assuming Phase 19's `sql/migrations/` directory listing is the complete set of migration files
**What goes wrong:** Concluding a column has "no corresponding migration file" (satisfying SCHEMA-02/03's framing as genuinely-undocumented drift) by checking only `sql/migrations/10_*.sql` through `19_*.sql`.
**Why it happens:** This project has TWO migration directories from two different eras: `migrations/` (7 files, 2026-04-14 to 2026-05-04, pre-dates the numbered `sql/migrations/` convention that started at migration 10) and `sql/migrations/` (10 files, migrations 10-19). Phase 19's research explicitly only read the second one.
**How to avoid:** Always check both directories (`ls migrations/ sql/migrations/`) before concluding a column is undocumented. This research already did this exhaustively for the 4 target tables and found `migrations/04-rbac-migration.sql` fully covers `clients`, while confirming nothing further exists for `garages`/`interventions`/`devis` in either directory.
**Warning signs:** A "SCHEMA-04 retroactive migration" being drafted in Phase 21 for a column that already has a perfectly good, committed, versioned migration file sitting in `migrations/` — would be pure duplicated effort.

### Pitfall 2: Reporting a git-log hit as "the origin" without checking whether it's a code-catch-up commit
**What goes wrong:** SCHEMA-03 deliverable claims `devis.date_acceptation` "originated in commit f2d7d9a, 2026-05-11" — factually wrong, since that commit's own message says it's a rename FIX to match an already-existing schema.
**Why it happens:** `git log -S<term>` finds when a string entered the FILE history, which for hand-maintained-via-Dashboard columns is often much later than when the column entered the DATABASE. The gap between "DB origin" and "code awareness" can be weeks to months (confirmed: `f2d7d9a` is 2026-05-11; the column's true origin is unknown but necessarily earlier).
**How to avoid:** Read the full commit message and diff, not just the `git log -S` one-line summary. Any message containing "align(er)", "fix(e/er) column name(s)", "real/live schema", "rewrite ... against real" is a strong signal the commit is documentation-catch-up, not origin. Report both dates separately: "earliest code awareness: [date/commit]" and "true DB origin: unknown, presumed earlier, via undocumented manual Dashboard edit."
**Warning signs:** A commit message that talks about "correcting," "aligning," or "rewriting against real schema" being cited as a feature's origin.

### Pitfall 3: Treating a shared/generic column name's git hit as table-specific without checking the diff
**What goes wrong:** `git log -S"actif"` returns hits for `garage_users.actif` (migration 12, well-documented) and `catalogue_pieces.actif` (migration 08) — neither is `garages.actif`. Citing either as `garages.actif`'s origin would be wrong.
**Why it happens:** Pickaxe search matches the literal string anywhere in the diff, with no table awareness. This schema reuses short, common column names (`actif`, `type`, `ville`, `cp`, `photo_url`, `notes`, `total_ht`) across many tables.
**How to avoid:** Always open the actual diff (`git show <sha> -- <file>`) and confirm the surrounding code references the TARGET table specifically (e.g., a `.from('garages')` call, an `ALTER TABLE garages` statement, or an object literal being passed to `insert('garages', ...)`) before attributing a hit to a specific table's column.
**Warning signs:** A "origin" table in the deliverable that cites a commit whose diff, when opened, never mentions the target table by name.

### Pitfall 4: Assuming PostgREST OpenAPI's silence on CHECK constraints means "no constraint exists"
**What goes wrong:** Concluding `garages.type` or any of the 33 remaining columns have zero constraints because `scripts/introspect-schema.js`'s output shows no `enum:[...]` and no explicit constraint note for them.
**Why it happens:** This is the exact same trap Phase 19 already documented (its Pitfall 1) — OpenAPI only surfaces true Postgres ENUM types via the `enum` key; TEXT+CHECK constraints are completely invisible to this endpoint. This research's introspection pass found no `enum` markers on any of the 33 remaining columns, which is suggestive but NOT proof of "no CHECK constraint" — it has not been confirmed against `pg_constraint` directly for these 4 tables (only `devis.statut`'s CHECK was confirmed this way, in Phase 19).
**How to avoid:** Run the `pg_constraint` query in Code Examples below, scoped to `garages`/`clients`/`interventions`/`devis`, before finalizing SCHEMA-02's "contraintes" claim for any column as "none."
**Warning signs:** A migration file (Phase 21) that adds a column with no CHECK, followed by a prod insert/update failing with a `23514` (check_violation) error — meaning a real prod-side constraint was missed.

## Code Examples

### Verified: reusing existing introspect-schema.js for the 4 target tables (already run, 2026-07-09)
```bash
node scripts/introspect-schema.js
# Prints all 38 tables. Grep/awk out just the 4 needed for this phase, e.g.:
#   awk '/Table: garages$/,/^$/' <output>
#   awk '/Table: clients$/,/^$/' <output>
#   awk '/Table: interventions$/,/^$/' <output>
#   awk '/Table: devis$/,/^$/' <output>
```

### Ready-to-run (NOT yet executed this session): exact type/precision/length + constraints for the 4 target tables
```sql
-- Exact type, length/precision/scale, nullability, default — beyond what OpenAPI exposes
SELECT table_name, column_name, data_type,
       character_maximum_length, numeric_precision, numeric_scale,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('garages', 'clients', 'interventions', 'devis')
ORDER BY table_name, ordinal_position;

-- Any CHECK/UNIQUE/FK constraint on these 4 tables (confirms Pitfall 4 either way)
SELECT conrelid::regclass AS table_name, conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text IN ('garages', 'clients', 'interventions', 'devis')
ORDER BY 1, 2;
```
Run via Supabase Dashboard SQL Editor first (worked reliably for short queries in Phase 19 plan 01); fall back to a direct `pg` connection (Phase 19 plan 03's pattern, `pg` already present in `node_modules`) only if paste-truncation recurs.

### Verified: git-log-S column-origin recipe (used throughout this research)
```bash
# Earliest commit touching the literal column name, across the WHOLE repo
# (not just JS — catches SQL migration files too):
git log --oneline -S"<column_name>" -- . | tail -1

# Get date + full message for that candidate commit:
git show -s --format="%h %ad %s" --date=short <sha>

# ALWAYS open the diff before attributing, to rule out shared-name false positives:
git show <sha> -- <suspected_file>
```

## State of the Art

| Old Approach (Phase 19) | Needed Approach (Phase 20) | When Changed | Impact |
|--------------------------|------------------------------|---------------|--------|
| PostgREST OpenAPI introspection sufficient (type/nullable/default/FK only needed) | PostgREST OpenAPI + `information_schema.columns`/`pg_constraint` (exact precision/length/constraints needed) | This phase — SCHEMA-02's "type exact, contraintes" wording is stricter than Phase 19's SCHEMA-01 needed | OpenAPI alone under-reports numeric precision/scale and text length; must supplement with a direct catalog query for a defensible "exact type" claim |
| `sql/migrations/` treated as the complete migration-file inventory | Both `migrations/` AND `sql/migrations/` must be checked | This research, 2026-07-09 — the gap was always there, just not discovered until this session | Materially reduces Phase 20/21's actual workload for `clients` (5 of ~38 columns, 13%, already fully documented) |
| Git correlation assumed to reliably find origin (used successfully for `devis.statut`'s CHECK values in Phase 19, which WAS a fresh discovery) | Git correlation confirmed reliable for `clients` (trivial — the migration file's own commit) but confirmed UNRELIABLE for ghost columns (zero result) and confirmed MISLEADING for `devis` (late-retrofit commits look like origins but aren't) | This research, 2026-07-09 | SCHEMA-03's success criterion ("chaque colonne... corrélée") must be satisfiable with an explicit "no code trail found, origin unknown, inferred only" answer for ~9 columns — the phase's success criteria should be read as allowing this, not requiring a git commit for every single column |

**Deprecated/outdated:** None — no library/framework deprecation involved, this is pure investigation methodology.

## Open Questions

1. **Do the 9 confirmed ghost columns (`garages` x5, `interventions.niveau_preuve`/`facture_id`/`photo_url`/`operation_code`) represent an abandoned feature, a future feature already scaffolded, or accidental dead columns?**
   - What we know: They exist in prod with sensible defaults (`niveau_preuve` defaults to `'declare'`, matching the anti-fraude vocabulary; `facture_id` FKs to `factures_scannees`, matching the OCR-invoice feature CLAUDE.md describes as implemented). No application code path reads or writes any of them, ever, in 302 commits of history.
   - What's unclear: Whether Mehdi added these directly via Supabase Dashboard in anticipation of a feature that was later built differently (e.g., the anti-fraude score actually uses `type` + a different trigger formula, not `niveau_preuve`), or whether these are simply forgotten/orphaned columns from an abandoned direction.
   - Recommendation: Ask Mehdi directly during Phase 20/21 planning — this is the single fastest way to resolve SCHEMA-03 for these 9 columns with real confidence instead of LOW-confidence semantic inference. If Mehdi doesn't recall, document "origin unknown, columns appear unused by current code — Phase 21 should still capture them faithfully (SCHEMA-02) but SCHEMA-03's correlation is honestly 'undetermined'."

2. **Is `garages.type`'s `'pro'` default value ever set to anything else in prod (e.g., `'concession'`), and does any RLS policy or scoring logic key off it?**
   - What we know: `garages.type` is `text NOT NULL DEFAULT 'pro'`. CLAUDE.md's RBAC hierarchy diagram uses the word "CONCESSION" and "marque officielle" in the same breath (`ADMIN └── CONCESSION (marque officielle, peut créer interventions VERTES...)`), which strongly suggests semantic overlap with `garages.type`/`garages.marque_officielle`, but the actual RBAC role hierarchy is confirmed (via CLAUDE.md's own "État technique" section) to be implemented entirely through `app_metadata.role` on `auth.users`, NOT through this column.
   - What's unclear: Whether any live garage in prod actually has `type != 'pro'` (this research did not query for distinct values — a single `SELECT DISTINCT type FROM garages` would resolve this, cheap to run in the same Dashboard session as the Code Examples queries above).
   - Recommendation: Add `SELECT DISTINCT type, marque_officielle, actif FROM garages;` and `SELECT DISTINCT ville, cp FROM garages WHERE ville IS NOT NULL OR cp IS NOT NULL;` to the Pass 1 Postgres query batch — if any live garage has non-default values, that is strong direct evidence for origin/intent (e.g., "Mehdi manually flagged one specific garage as a concession in the Dashboard on some date," which could then be cross-referenced against Mehdi's own memory/calendar rather than git).

3. **Does the `devis.client_id` / `devis.or_id` cluster correlate more precisely to a specific commit than the broad `b29d4f5`/`af3b15f` cluster this research found?**
   - What we know: These 2 columns weren't individually isolated with their own `git log -S` pass in this research session (time-boxed to representative sampling, not the full 24-column sweep).
   - What's unclear: Exact earliest commit for each.
   - Recommendation: Planner/execution should run the Code Examples git-log-S recipe for each of the ~24 `devis` columns individually before finalizing SCHEMA-03's deliverable — this research's table above is a strong starting point (covers ~20 of 24 with verified clusters) but is not a substitute for the full per-column sweep the phase success criteria require.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (.env) | PostgREST OpenAPI introspection | ✓ | — | — |
| `scripts/introspect-schema.js` | Baseline column/type/nullable/FK capture | ✓ (committed, re-verified working 2026-07-09) | — | — |
| Direct Postgres connection string (Project Settings → Database) | `information_schema`/`pg_constraint` exact-precision queries, if Dashboard paste fails | ✗ — not in `.env`, must be obtained fresh from Mehdi each time (per Phase 19 plan 03's precedent — never persisted) | — | Supabase Dashboard SQL Editor paste-and-run (works reliably for short single queries, per Phase 19 plan 01) |
| `pg` (node-postgres) npm package | Fallback direct-connection script, if Dashboard paste truncates | ✓ — present in `node_modules` from Phase 19's `--no-save` install | not in `package.json` (intentionally, per Phase 19's pattern) | `npm install pg --no-save` (re-install if pruned by a future `npm ci`) |
| `git` (302-commit local history) | Column-origin correlation (`git log -S`) | ✓ | — | — |
| `migrations/` directory (7 legacy files) | Pass 0 — pre-existing DDL that may already resolve columns without any Postgres/git work | ✓ | — | — |
| Supabase Dashboard access | Running the Pass 1 read-only SQL queries | Assumed ✓ (Mehdi has used it for every migration to date, per Phase 19) | — | — |

**Missing dependencies with no fallback:** None — every needed tool is either already committed/present or has a validated fallback.

**Missing dependencies with fallback:** Direct Postgres connection string (falls back to Dashboard SQL Editor paste, which works for the short queries this phase needs, per Phase 19 plan 01's precedent — only failed on the full 500-line `schema.sql` paste in plan 03).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None formal (no Jest/pytest config) — custom Node scripts run directly, same as Phase 19 |
| Config file | none — `package.json`'s `"test"` script is `node test-api.js` |
| Quick run command | N/A for this phase — it is investigation-only, produces no application code changes |
| Full suite command | `node test-api.js` (existing smoke suite) — only relevant as a regression check if Phase 20's work somehow touches runtime code, which it should not |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-02 | Every undocumented column on the 4 tables has an exact type/nullability/constraint captured | manual (query-and-record) | No automated pass/fail command possible — the "test" is running the Code Examples SQL and recording verbatim output into the plan's deliverable artifact (research notes / a captured findings doc consumed by Phase 21) | ❌ Wave 0 — no script currently diffs "captured metadata" against "live prod" automatically; recommend the plan simply records query output directly, mirroring Phase 19 plan 01's pattern for the `devis.statut` CHECK capture |
| SCHEMA-03 | Every undocumented column has a documented origin (commit/livraison) or an explicit "undetermined, ghost column" finding | manual (git-log-S sweep + review) | No automated command — could be scripted (a Node script that loops `git log -S<col>` per column and dumps results) but the disambiguation step (Pitfall 3) inherently requires a human/Claude reading each diff, not just automatable string matching | ❌ Wave 0 — no such script exists; this research's git-log-S findings for ~29 of the 38 columns (all of `garages`+`clients`+`interventions`, most of `devis`) can seed it directly rather than starting from zero |

### Sampling Rate
- **Per task commit:** N/A — no code is being written by this phase; each research/introspection task's "commit" is a captured findings artifact, not a code diff
- **Per wave merge:** Re-run `scripts/introspect-schema.js` once at the start of execution to catch any further live drift since this research (2026-07-09) before finalizing the SCHEMA-02 deliverable
- **Phase gate:** All 38 columns (5 garages + 5 clients + 4 interventions + 24 devis) accounted for in the final artifact — either fully resolved (type+constraints+origin) or explicitly flagged "origin undetermined, ghost column" — before Phase 21 begins writing retroactive migrations

### Wave 0 Gaps
- [ ] No script yet runs the `information_schema.columns`/`pg_constraint` queries (Code Examples) — recommend either a Dashboard paste-and-record task (cheap, matches Phase 19 plan 01's precedent) or a small addition to `scripts/introspect-schema.js` (a `--detail <table>` mode using a direct `pg` connection) if the plan wants it repeatable/scriptable.
- [ ] No script yet automates the git-log-S sweep across all 38 columns — this research manually sampled ~29; a plan could either finish the remaining ~9 `devis` columns manually (fast — each query is sub-second) or write a tiny throwaway Node/bash loop.

## Sources

### Primary (HIGH confidence — verified live/directly during this research session, 2026-07-09)
- `node scripts/introspect-schema.js` — re-run live against prod (`rzbqbaccjyxvtlnfitrr.supabase.co`), confirmed 38 tables, full column output for `garages`/`clients`/`interventions`/`devis` captured and cross-checked against `schema.sql`'s existing content column-by-column.
- Direct reads: `migrations/04-rbac-migration.sql` (full content), `migrations/04-rls-harden.sql`, `migrations/05-cleanup-client-doublons.sql`, `migrations/08-livraison-3a-ordres-reparation.sql`, `migrations/07b-pivot-migration.sql`, `migrations/09-l3c-catalogue-pieces.sql` (all full content) — confirmed which of the 38 target columns each does/doesn't cover.
- `supabase.js` (relevant sections: `Auth.registerGarage` L101-128, `Garages.update` L186-189, `Interventions.create`/`update`/`attachFacture` L384-430) — direct read, confirmed explicit allowlists exclude all 9 ghost columns.
- `git log -S<term> --oneline -- .` — run for ~15 distinct column-name terms across the full 302-commit history; results recorded in Preliminary Findings tables above.
- `git show`/`git show -s --format=...` — run against ~10 candidate commits to confirm dates, messages, and (for shared-name terms) diff content, ruling out false-positive table attributions.
- `schema.sql` (current `garages`/`clients`/`interventions`/`devis` `CREATE TABLE` blocks, header comment lines 1-40) — direct read, confirmed which columns are/aren't already represented.
- `.planning/milestones/v1.4-phases/19-schema-sql-regeneration/19-RESEARCH.md`, `19-01-PLAN.md`, `19-02-SUMMARY.md`, `19-03-SUMMARY.md` — direct read, established the PostgREST-OpenAPI-insufficient / direct-pg-connection-fallback pattern this research builds on.

### Secondary (MEDIUM confidence)
- CLAUDE.md's RBAC hierarchy description and "concession officielle" wording (Architecture métier section) — used as semantic-inference input for `garages.type`/`marque_officielle`'s likely intent, not independently confirmed against any commit or Mehdi's own account.

### Tertiary (LOW confidence — explicitly flagged, needs validation)
- All "Semantic inference" cells in the `garages`/`interventions` Preliminary Findings tables — these are informed guesses based on column naming, default values, and CLAUDE.md's business-domain description, NOT verified against any authoritative source. Recommend Mehdi confirm or correct before Phase 21 writes retroactive migration comments citing these as fact.
- The `devis` cluster's exact per-column origin for `notes`, `cree_par`, `client_id` — sampled but not individually isolated with a dedicated `git log -S` pass in this session.

## Metadata

**Confidence breakdown:**
- `clients` findings (Finding 1): HIGH — directly read the migration file, directly verified prod match via fresh introspection
- `garages`/`interventions` ghost-column findings (Finding 2): HIGH that they ARE ghost columns (verified 3 independent ways: pickaxe search, allowlist inspection, live introspection) — LOW for their semantic origin/intent (inference only)
- `devis` column type/nullability data: HIGH (directly from live introspection, cross-checked against schema.sql)
- `devis` column origin correlation: MEDIUM for the representative cluster verified this session (dates/commits confirmed real, but flagged as "code awareness" not "true origin") — LOW/not-yet-done for ~4 of 24 columns not individually isolated
- Exact numeric precision/scale/length for all 33 remaining columns: NOT YET CAPTURED — PostgREST OpenAPI doesn't expose it; the `information_schema.columns` query is provided (Code Examples) but was not executed this session (would require either a Dashboard paste the researcher cannot perform interactively, or a direct-pg connection string not present in `.env`)

**Research date:** 2026-07-09
**Valid until:** 7 days (same short shelf-life reasoning as Phase 19 — this project has an active pattern of undocumented manual Dashboard schema edits; re-run `scripts/introspect-schema.js` immediately before execution if more than a few days elapse since this research).
