# Phase 22: Vérification Bootstrap & Nettoyage Header - Research

**Researched:** 2026-07-10
**Domain:** PostgreSQL/Supabase DDL bootstrap verification, schema.sql documentation hygiene
**Confidence:** HIGH (bootstrap method — direct repeat of a technique already proven working in this exact repo; DDL ordering re-verified this session) / MEDIUM (whether Supabase's PostgREST OpenAPI endpoint exposes the new view `v_motos_avec_proprietaire` the same way it exposes tables — not yet spot-checked against a live project)

## Summary

This is a closing/verification phase, not a build phase. `schema.sql` (834 lines as of the last Phase 21 commit `725407f`) already contains all Gap A columns (39, across `garages`/`clients`/`interventions`/`devis`) and all Gap B objects (`billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto`, `v_motos_avec_proprietaire`) — confirmed by Phase 21's grep/diff-based verification (`21-VERIFICATION.md`, 4/4 truths PASS). What has explicitly **not** been done yet, by every prior phase's own admission, is actually **executing** `schema.sql` against a genuinely empty Postgres. That is this phase's entire job (SCHEMA-07), plus a cosmetic header rewrite.

Phase 19 already solved the "how do we bootstrap-test in this environment" problem once, on 2026-07-09, in this same repo: no `psql`/`pg_dump`/Docker/Supabase CLI exist locally, and the Supabase Dashboard SQL Editor's browser paste truncated a large SQL file mid-word on 3 separate attempts. The working fallback was `npm install pg --no-save` + a direct `node-postgres` connection to a throwaway free-tier Supabase project (connection string from Project Settings → Database), executed via the simple query protocol (handles multi-statement SQL natively, unlike the Dashboard editor). That `pg` package (v8.22.0) is **still present in this repo's `node_modules`** right now (confirmed this session) — not saved in `package.json` (by design, `--no-save`), so it must be reinstalled with the same `--no-save` flag if `node_modules` has been wiped since. This exact method is the correct one to reuse for Phase 22 — no new investigation needed, no new tooling to evaluate.

The one genuinely new piece of work this phase requires in `scripts/introspect-schema.js`: its `--compare` mode's `EXPECTED_TABLES` array (used to decide which tables get diffed between the fresh project and prod) does **not** yet include the 5 Gap B objects. Gap A columns need **no script change** — they live on tables (`garages`, `clients`, `interventions`, `devis`) already in `EXPECTED_TABLES`, and the diff logic already compares the *full* column set per table, so a fresh bootstrap missing any Gap A column would already be caught. Only the 5 new Gap B names need adding to the array before `--compare` can validate them.

**Primary recommendation:** Re-run Phase 19's exact verification pattern (human creates one new throwaway Supabase project → paste-fails expected in Dashboard editor → fallback to direct `pg` connection → run `schema.sql` → confirm `SCHEMA_BOOTSTRAP_OK`), then add the 5 Gap B names to `introspect-schema.js`'s `EXPECTED_TABLES` and run `--compare` against that same fresh project, then rewrite `schema.sql`'s header (lines 6–40) to drop the Gap A/Gap B "non résolu" language while preserving the still-true, separate claim that ~19 other subsystems (OR, billing/factures, catalogue pièces, PDP, client-auth) remain out of scope — that broader partial-bootstrap status is NOT what SCHEMA-07 asks to close, only the Gap A/Gap B sections specifically.

## Project Constraints (from CLAUDE.md)

- `schema.sql` is explicitly NOT in the protected-files list (`motokey-api.js`, `app.html`, `supabase.js`, `MotoKey_Client.html` are protected) — direct editing via `str_replace`/Write is fine, no `.bak` convention required for this file specifically.
- Secrets: never print `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_KEY`/the throwaway fresh-project's password in plaintext in commands or committed files or chat. `introspect-schema.js` already follows this (only logs the parsed host, never the key) — any new direct-`pg`-connection script for Task 1 must do the same (never echo the connection string).
- Never reference the obsolete `motokey-api-10-production` URL — not relevant to this phase.
- Don't touch the anti-fraude weighting (1.0/0.6/0.3) or 70/30 score formula — not touched by this phase; irrelevant to schema.sql bootstrap verification.
- `git status` / `git log --oneline -5` before any major change — standard practice, especially relevant here since this repo has had worktree-staleness issues in Phases 20/21 (see Pitfall below).
- Communicate in French with Mehdi (per `feedback_langue_francais` memory) — any human-action checkpoint task text shown to Mehdi should be in French, consistent with Phase 19/21's plans.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHEMA-07 | Bootstrap vérifié propre (aucune erreur SQL) contre un projet Supabase neuf, comme en Phase 19 ; le header "known-partial-bootstrap" de `schema.sql` est mis à jour pour ne plus lister les Gaps A et B comme non résolus | Bootstrap method section below gives the exact, already-proven procedure (direct `pg` connection, same as Phase 19). `introspect-schema.js` gap analysis below identifies the one code change needed (`EXPECTED_TABLES` array) before `--compare` can validate Gap B. Header Rewrite Guidance section gives exact line ranges and content to remove/keep/add in `schema.sql`. PROJECT.md Known Gaps update identified (remove line-43 bullet only). |
</phase_requirements>

## Standard Stack

Not a "pick a library" phase. Reuse what Phase 19 already proved works in this exact environment.

### Core
| Tool | Version | Purpose | Why Standard (for this repo) |
|------|---------|---------|-------------------------------|
| `pg` (node-postgres) | 8.22.0 (confirmed present in `node_modules` this session, installed `--no-save` during Phase 19) | Direct Postgres connection to execute `schema.sql`'s full multi-statement SQL against a fresh project, bypassing the unreliable Dashboard SQL Editor paste | Already used and proven working for exactly this purpose in Phase 19 (19-03-SUMMARY.md); avoids re-litigating the Dashboard-paste-truncation problem |
| `scripts/introspect-schema.js` | existing, this repo | `--compare` mode diffs a fresh project's tables/columns against prod, scoped to `EXPECTED_TABLES` | Already built and functional (used successfully in Phase 19); needs one array update (see Don't Hand-Roll) before it covers Gap B |
| Supabase Dashboard (new project creation only) | N/A (web UI) | Only used to spin up the throwaway fresh project and retrieve its connection string / API keys — NOT used to paste-run the SQL itself (that path is unreliable per Phase 19) | Matches Mehdi's existing workflow for creating projects; the paste-run step is what gets bypassed, not project creation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct `pg` connection (simple query protocol) | Supabase Dashboard SQL Editor paste | Already tried and failed 3 times in Phase 19 with 3 distinct random truncation points on this same-sized file. Not worth re-attempting as the primary path; keep as an optional first try but plan for the fallback from the start rather than discovering it mid-session again. |
| Direct `pg` connection | Supabase CLI (`supabase db push`/`db reset`) | Still not installed anywhere in this environment (re-confirmed this session: `command -v supabase` returns nothing). Would need install + `supabase link` + an access token not currently in `.env`. No new evidence this changed since Phase 19's research. |
| A new throwaway Supabase project per Phase 19 pattern | Reusing/keeping a previously-created fresh project | The Phase 19 fresh project was intentionally discarded (disposable-by-design). No spare project exists to reuse — a brand-new one must be created again for Phase 22. |

**Installation check before Task 1:**
```bash
node -e "require('pg')" 2>&1 || npm install pg --no-save
```
If this prints nothing (module resolves), `pg` is already present — no install needed. If it errors, run the install line.

**Version verification:** `pg@8.22.0` already installed in `node_modules` (confirmed via `node -e "console.log(require('pg/package.json').version)"` this session, 2026-07-10). Current pg major (8.x) is still the actively maintained node-postgres line as of this research; no version bump needed — this is a one-off verification tool, not a runtime dependency, so pinning precision is low-stakes.

## Architecture Patterns

### Recommended verification workflow (mirrors Phase 19's proven sequence exactly)
```
1. Human action (Mehdi): create ONE new throwaway free-tier Supabase project.
   Do NOT use prod (rzbqbaccjyxvtlnfitrr). Wait for provisioning to finish.

2. First attempt (optional, may fail per Phase 19 precedent): paste schema.sql
   into the new project's SQL Editor and run it. If it truncates mid-paste
   (same failure mode as Phase 19 — random truncation point each time),
   abandon this path immediately rather than retrying — go to step 3.

3. Fallback (expected primary path, per Phase 19): retrieve the fresh
   project's direct Postgres connection string (Project Settings -> Database
   -> Connection string, "URI" tab). Provide it to a throwaway script that
   does:
     const { Client } = require('pg');
     const client = new Client({ connectionString: FRESH_CONNECTION_STRING });
     await client.connect();
     await client.query(fs.readFileSync('schema.sql', 'utf8'));
     // report success or the exact error
     await client.end();
   Never print the connection string itself in logs/commits — only host,
   or a generic "connected" confirmation.

4. On success: run node scripts/introspect-schema.js --compare <FRESH_URL>
   <FRESH_KEY> (needs EXPECTED_TABLES updated first — see Don't Hand-Roll)
   using the fresh project's REST URL + anon/service key (Project Settings
   -> API), not the Postgres connection string from step 3.

5. On failure at step 3: diagnose from the exact Postgres error text
   (Node's pg driver surfaces the real Postgres error message/position),
   patch schema.sql minimally, re-run from step 3 (schema.sql's DROP...
   CASCADE cleanup block makes step 3 safely re-runnable against the same
   fresh project without needing to recreate it).

6. Once bootstrap + compare both pass: rewrite schema.sql's header
   (see Header Rewrite Guidance) and update PROJECT.md Known Gaps
   (remove the now-resolved header-staleness bullet).
```

### Pattern: DDL dependency ordering already verified sound (this session)
**What:** Read `schema.sql`'s full `CREATE TABLE`/`CREATE VIEW`/`CREATE TYPE` sequence this session (grep at lines 84–561). Every Gap B object is created strictly after its dependencies: `garages`(98) → `clients`(157) → `motos`(246) → ... → `billing_events`(490, FK→garages) → `motos_proprietaires_historique`(503, FK→motos+clients) → `liaisons_client_garage`(528, FK→clients+garages) → `reclamations_moto`(543, FK→motos+clients) → view `v_motos_avec_proprietaire`(561, reads motos/clients/garages). All 10 `CREATE TYPE` enum statements (lines 84–93, including `client_type_enum`, `mode_acquisition_enum`) precede every table that uses them. The `NETTOYAGE` (cleanup) block at the top drops these same objects in reverse dependency order with `CASCADE` on every statement.
**When to use:** This is exactly the class of bug (`relation "x" does not exist` / `type "x" does not exist`) that would surface as a genuine bootstrap error in Task 1 if ordering were wrong. Since it's already correct by direct inspection, Task 1 is expected to be a clean confirmation run, not a debugging session — but budget time for it anyway since this has never actually been executed.
**Confidence:** HIGH — verified by direct line-number reads this session, not inferred.

### Anti-Patterns to Avoid
- **Re-attempting the Dashboard SQL Editor paste multiple times hoping for a different result:** Phase 19 tried 3 times with 3 different random truncation points on a similarly-sized file (schema.sql is now 834 lines vs. ~537 at that time — larger, if anything more likely to truncate). Budget for exactly one optional attempt, then pivot immediately to the `pg` connection method — do not burn session time repeating a browser-paste that has a documented history of failing on this exact class of file.
- **Skipping the actual bootstrap execution and calling SCHEMA-07 "done" based on Phase 21's grep/diff verification alone:** Phase 21's own verification report explicitly flags this ("Full SQL syntax validation via a fresh Supabase bootstrap was not run — this is explicitly deferred to Phase 22") — grep-based structural correctness is not proof the SQL actually parses/executes. This phase's entire reason for existing is to close that specific gap; a plan that reuses Phase 21's evidence instead of running schema.sql for real would not satisfy SCHEMA-07's literal wording ("s'exécute... sans aucune erreur SQL").
- **Rewriting the header to claim FULL bootstrap parity:** The ~19 out-of-scope tables (OR system, billing/factures, catalogue pièces, PDP e-invoicing, separate client-auth) are still genuinely absent from schema.sql and still out of scope per REQUIREMENTS.md's "Out of Scope" table. The header rewrite must remove the Gap A/Gap B "non résolu" claims specifically — not imply schema.sql now achieves 38-table full parity, which remains false and remains intentionally out of scope for v1.5.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diffing a fresh bootstrap's tables/columns against prod | A new comparison script from scratch | `scripts/introspect-schema.js --compare <url> <key>` (existing, functional) — but first add the 5 Gap B names to its `EXPECTED_TABLES` array (line ~29–43) | The script already does PostgREST-OpenAPI-based table/column diffing correctly (proven in Phase 19); it just doesn't know about Gap B objects yet because they didn't exist in schema.sql when it was written. A one-line array edit is far cheaper and lower-risk than a new script. |
| Executing multi-statement SQL against a fresh Postgres from Node | A custom SQL statement splitter/executor | `pg.Client.query(fullFileContents)` — node-postgres's simple query protocol natively handles multiple `;`-separated statements in one call | This is literally what Phase 19 already used successfully; `pg`'s simple query protocol is designed for exactly this (unlike the extended/prepared-statement protocol used by most ORMs, which does NOT support multi-statement strings) |

**Key insight:** Everything needed for SCHEMA-07 already exists in this repo from Phase 19 — a proven bootstrap-verification procedure and a proven diff script. The only genuinely new code this phase needs is a ~5-line array addition to `introspect-schema.js` and a header rewrite in `schema.sql`. Resist the temptation to build new tooling.

## Header Rewrite Guidance

Current `schema.sql` header (lines 1–41, read directly this session) has 3 distinct blocks that need different treatment:

1. **Lines 6–19** ("BOOTSTRAP PARTIEL CONNU", listing ~19 out-of-scope tables like `ordres_reparation`, `entites_facturation`, `pdp_queue`, `users_client*`, etc.) — **KEEP, mostly unchanged.** This describes the still-genuinely-true, separately-tracked scope boundary (REQUIREMENTS.md "Out of Scope" table). Only update the phase/date reference in the opening line (currently "Phase 19 v1.4 — 2026-07-08, patché 2026-07-09") to also note Phase 21/22 closure of Gap A/B, so a future reader isn't confused about what's now covered vs. still not.

2. **Lines 20–26** ("GAP CONNU SUPPLÉMENTAIRE" — Gap B: `billing_events` + migration-13 tables/view not yet created) — **REMOVE entirely.** These 5 objects are now present in `schema.sql` (verified `schema.sql:490-574`, confirmed by 21-VERIFICATION.md). Replace with a short confirmation line, e.g. "Gap B (migrations 13/15 objects — billing_events, motos_proprietaires_historique, liaisons_client_garage, reclamations_moto, v_motos_avec_proprietaire) : résolu en Phase 21 (SCHEMA-06), vérifié bootstrap Phase 22 (SCHEMA-07)."

3. **Lines 28–40** ("DÉRIVE NON DOCUMENTÉE DÉCOUVERTE" — Gap A: the 39 undocumented columns, framed as "Non couvert ici — nécessiterait une recherche dédiée") — **REMOVE the "non couvert" framing entirely**, since all 39 columns are now present with per-column origin comments inline in each `CREATE TABLE` block (verified this session at `schema.sql:124-128` for garages, and cross-confirmed by 21-VERIFICATION.md for clients/interventions/devis). Replace with a short pointer, e.g. "Gap A (39 colonnes sans fichier de migration) : résolu en Phase 21 (SCHEMA-04/05) — voir commentaires inline sur chaque colonne + `sql/migrations/20_garages_undocumented_columns.sql`, `21_interventions_undocumented_columns.sql`, `22_devis_undocumented_columns.sql` pour le détail origine/verdict (`20-FINDINGS.md`)."

**Success criterion 3's literal test:** after the rewrite, `schema.sql`'s header must no longer describe Gap A or Gap B objects as unresolved/absent — a grep for the Gap-A/Gap-B column and table names in the header block should show them referenced only in a "resolved, see X" context, never in a "not covered, TODO" context. The ~19 out-of-scope tables list (block 1) is explicitly NOT part of this criterion and should remain.

## Common Pitfalls

### Pitfall 1: Worktree staleness silently reproduces already-fixed gaps
**What goes wrong:** Both Phase 20-02 (implied) and explicitly Phase 21-04 hit a stale git worktree whose HEAD predated the very Gap A/B work being verified, making `schema.sql` look like it still had the header's claimed gaps.
**Why it happens:** This project uses git worktrees for phase execution; a worktree forked before a dependency phase merged will not have that phase's commits until an explicit `git merge --ff-only master`.
**How to avoid:** Before Task 1 (bootstrap) or any read of `schema.sql`, run `git log --oneline -3` and confirm HEAD includes Phase 21's commits (`725407f` "enable RLS on Gap B tables" or later) — if not, `git merge --ff-only master` first, exactly as 21-04 did.
**Warning signs:** `schema.sql` missing `billing_events`/`motos_proprietaires_historique`/etc. when it should already be there per this research.

### Pitfall 2: `pg` in node_modules but not in package.json — silently missing after a clean install
**What goes wrong:** `pg` was installed with `--no-save` in a prior session (Phase 19) specifically to avoid adding a permanent runtime dependency for a one-off verification tool. If `node_modules` is ever wiped and reinstalled (`npm ci`, fresh clone, etc.) between then and Phase 22's execution, `pg` will be gone silently — the first symptom is a `Cannot find module 'pg'` error when the bootstrap script runs.
**Why it happens:** Intentional design choice (verification tooling shouldn't become a shipped dependency) but easy to forget when resuming work in a new session/worktree.
**How to avoid:** Explicit pre-check before Task 1 (see Standard Stack "Installation check").
**Warning signs:** `Cannot find module 'pg'` when running the bootstrap script.

### Pitfall 3: `introspect-schema.js --compare` will silently under-report Gap B without the EXPECTED_TABLES update
**What goes wrong:** Running `--compare` today, unmodified, against a genuinely correct fresh bootstrap would still report success ("PASS") even if `billing_events`/`motos_proprietaires_historique`/`liaisons_client_garage`/`reclamations_moto` were somehow missing from the fresh project — because those 4 table names simply aren't in `EXPECTED_TABLES` (confirmed this session: array only has 13 entries, none of the 5 Gap B objects).
**Why it happens:** The script was written and last touched during Phase 19, before Gap B objects existed in `schema.sql`.
**How to avoid:** Add `'billing_events'`, `'motos_proprietaires_historique'`, `'liaisons_client_garage'`, `'reclamations_moto'` to `EXPECTED_TABLES` (array literal at `scripts/introspect-schema.js` lines 29-43) before running `--compare` for this phase's verification. This is a required code change for this phase, not optional polish — without it, success criterion 2 ("comparaison automatique... confirme... pour tous les objets Gap A/Gap B") is not actually satisfied even if the compare exits 0.
**Warning signs:** `--compare` reports PASS but the printed table list (from the default-mode dump, or a quick manual REST call) doesn't actually show the 4 new tables in the fresh project.

### Pitfall 4: Views may not appear in PostgREST's OpenAPI `definitions` the same way tables do
**What goes wrong:** `v_motos_avec_proprietaire` is a `CREATE OR REPLACE VIEW`, not a table. PostgREST does expose views through the same OpenAPI `definitions` object *if* the view is granted `SELECT` to the role used for introspection (`anon` or `service_role`) — Phase 19's research and Phase 21's live sanity check did not specifically confirm this for a *view* (only confirmed 4 Gap B *tables* appear in prod's introspection output, per 21-04-SUMMARY.md's table list — the view wasn't in that enumerated list).
**Why it happens:** Views need an explicit grant or default privilege the same as tables; if `schema.sql` doesn't explicitly `GRANT SELECT ... TO anon, authenticated` on the view (grep found no such GRANT statement for it), PostgREST may not expose it in the same way, or the fresh project's default role grants may differ from prod's already-established grants.
**How to avoid:** During Task 2 (compare mode), if `v_motos_avec_proprietaire` doesn't appear in the fresh project's introspection output even after a clean bootstrap, don't assume schema.sql is broken — check via a targeted `information_schema.views` query (or via the Dashboard's own Table Editor "Views" section) whether it exists structurally even if PostgREST doesn't list it, since PostgREST exposure and actual DDL existence are two different questions. Existence is what SCHEMA-07 cares about (view was created without error); PostgREST visibility is a secondary/informational check only.
**Confidence:** MEDIUM — this is a real, not-yet-directly-tested gap in prior research; flagging explicitly rather than asserting either way.

### Pitfall 5: `EMPTY` fresh project must genuinely be schema-less, not just "different from prod"
**What goes wrong:** Supabase auto-provisions every new project with its own baked-in `auth`, `storage`, `realtime` schemas (this is expected and fine — `schema.sql` depends on `auth.users` and the `supabase_realtime` publication already existing). The risk is instead accidentally reusing a project that already had *some* prior SQL run against it (e.g., reusing Phase 19's now-defunct project reference, or a project Mehdi had used for something else), which could mask a real ordering bug behind a false "already exists, skip" outcome.
**How to avoid:** Confirm with Mehdi in the human-action task instructions that the project is brand-new and has never had any SQL run against its `public` schema before pasting/executing `schema.sql`.
**Warning signs:** Task 1 succeeds suspiciously fast with zero `DROP ... IF EXISTS` no-ops logged, or a table appears with unexpected pre-existing data.

## Code Examples

### Verified pattern (proven in this repo, Phase 19): direct pg connection bootstrap
```javascript
// Source: pattern confirmed working in 19-03-SUMMARY.md (this repo, 2026-07-09).
// Re-run for Phase 22 against a NEW throwaway fresh project.
const { Client } = require('pg');
const fs = require('fs');

async function bootstrap(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const sql = fs.readFileSync('schema.sql', 'utf8');
    await client.query(sql); // simple query protocol — handles multi-statement SQL
    console.log('SCHEMA_BOOTSTRAP_OK');
  } catch (err) {
    console.error('SCHEMA_BOOTSTRAP_FAILED:', err.message); // includes Postgres error position/detail
    throw err;
  } finally {
    await client.end();
  }
}
// Never log `connectionString` itself.
```

### Required one-line-ish edit to scripts/introspect-schema.js before Task 2
```javascript
// Current (scripts/introspect-schema.js lines 29-43):
const EXPECTED_TABLES = [
  'garages', 'techniciens', 'clients', 'motos', 'interventions',
  'plan_entretien', 'devis', 'fraude_verifications', 'transferts',
  'transfert_steps', 'garage_users', 'client_device_tokens', 'push_send_log'
];

// Needed for Phase 22 (add the 5 Gap B objects):
const EXPECTED_TABLES = [
  'garages', 'techniciens', 'clients', 'motos', 'interventions',
  'plan_entretien', 'devis', 'fraude_verifications', 'transferts',
  'transfert_steps', 'garage_users', 'client_device_tokens', 'push_send_log',
  'billing_events', 'motos_proprietaires_historique', 'liaisons_client_garage',
  'reclamations_moto', 'v_motos_avec_proprietaire'
];
```
Note: no other change to the script's diff logic is needed — it already compares full column sets per table generically, which covers Gap A columns on `garages`/`clients`/`interventions`/`devis` for free since those tables are already in the array.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Bootstrap verification assumed possible via Dashboard SQL Editor paste | Direct `pg` connection to a fresh Supabase project's Postgres endpoint | Phase 19, 2026-07-09 (browser paste failed 3x) | Phase 22 should plan for the `pg` path as primary from the start, not rediscover the failure mid-execution |
| `schema.sql` header claiming Gap A/B as open/unresolved | Gap A/B fully resolved in Phase 21 (SCHEMA-04/05/06); only the header text is stale | Phase 21, 2026-07-10 (per 21-VERIFICATION.md's flagged anti-pattern) | Phase 22's header rewrite is pure documentation catch-up, not a functional change — low risk, high clarity value |

**Deprecated/outdated:** The "Non couvert ici" framing for Gap A (schema.sql lines 39-40) and the "objets... non corrigés car hors du périmètre" framing for Gap B (lines 20-22) — both now factually false since Phase 21 landed the work.

## Open Questions

1. **Does PostgREST expose `v_motos_avec_proprietaire` via the OpenAPI introspection endpoint the same way it exposes tables?**
   - What we know: Phase 21-04's live prod sanity check confirmed the 4 Gap B *tables* appear in prod's introspection output; it did not explicitly confirm the view.
   - What's unclear: Whether `--compare` mode (once `EXPECTED_TABLES` is updated to include the view name) will correctly diff it, or whether views need a different/additional check.
   - Recommendation: During Task 2 execution, if the view doesn't show up in the fresh project's introspection output, cross-check via a direct `information_schema.views` query (available through the same `pg` connection used for Task 1) rather than concluding schema.sql failed to create it.

2. **Will the Dashboard SQL Editor paste-attempt (optional Task 1 step 2) fail again on this larger (834-line vs. 537-line) file?**
   - What we know: It failed 3 times at different random truncation points on the smaller file in Phase 19.
   - What's unclear: Whether the truncation is proportional to file size, a fixed clipboard/editor buffer limit, or purely non-deterministic — no root cause was identified in Phase 19, only a workaround.
   - Recommendation: Don't invest debugging time here regardless of outcome — go straight to the `pg` connection fallback if the first paste attempt shows any sign of truncation (compare pasted character count / visually check the last lines match schema.sql's actual ending).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `pg` (node-postgres) | Direct Postgres connection bootstrap (Task 1 fallback) | ✓ (present in `node_modules`, `--no-save`, not in package.json) | 8.22.0 | Reinstall via `npm install pg --no-save` if missing |
| `psql` / `pg_dump` | Not used by this phase's chosen method | ✗ | — | Not needed — `pg` (Node driver) fully covers the connect-and-execute need |
| Supabase CLI | Not used by this phase's chosen method | ✗ | — | Not needed |
| Docker | Local Postgres test rig (not used) | ✗ | — | Fresh Supabase project (cloud) used instead, same as Phase 19 |
| Node.js | Bootstrap script + `introspect-schema.js` | ✓ | (Phase 19 confirmed v24.14.1; not re-checked this session, no reason to expect a downgrade) | — |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (.env, prod) | `introspect-schema.js` baseline (prod side of the diff) | ✓ (keys present in `.env`, values not read this session per security convention) | — | — |
| A brand-new throwaway Supabase project + its connection string/API keys | Task 1 (bootstrap) + Task 2 (compare) | ✗ (must be created fresh by Mehdi this phase — the Phase 19 project was disposable/discarded) | — | None — this is a required human action, not optional |
| Supabase Dashboard access (Mehdi) | Creating the fresh project; retrieving its connection string/API keys | Assumed ✓ (used routinely for every migration to date) | — | — |

**Missing dependencies with no fallback:**
- A brand-new throwaway Supabase project must be created this phase — there is no way to automate project creation from this environment's existing credentials (confirmed already in Phase 19's research: project creation needs a Dashboard/Management-API org-level token not present in `.env`). This is an unavoidable human-action checkpoint, structurally identical to Phase 19's Task 1.

**Missing dependencies with fallback:**
- `psql`/`pg_dump`/Supabase CLI/Docker — all have the already-proven `pg` (Node driver) + cloud-Supabase-project fallback; no further investigation needed.

## Validation Architecture

`.planning/config.json` has no `workflow.nyquist_validation` key set — treated as enabled per instructions.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None formal (no Jest/pytest config) — custom Node scripts run directly |
| Config file | none — `package.json`'s `"test"` script is `node test-api.js` |
| Quick run command | `node test-api.js` (existing smoke suite) |
| Full suite command | `node test-api.js` (no other suites reference schema.sql directly) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHEMA-07 | `schema.sql` executes with 0 SQL errors against a genuinely fresh Postgres | manual (human-action-gated bootstrap) + scripted execution once credentials are provided | `node <one-off-script>.js` using the pattern in Code Examples, run against Mehdi-provided fresh-project connection string | ❌ Wave 0 — no reusable script exists yet; write a small throwaway one (not committed, or committed to `scripts/` if kept for future re-verification) |
| SCHEMA-07 | Automated compare confirms fresh bootstrap matches prod for Gap A/Gap B objects | scripted | `node scripts/introspect-schema.js --compare <FRESH_URL> <FRESH_KEY>` (after `EXPECTED_TABLES` edit) | ⚠️ Partially exists — script exists and works, needs the `EXPECTED_TABLES` array edit documented above before it covers Gap B |
| SCHEMA-07 | Header no longer claims Gap A/B unresolved | manual/textual verification | `grep -n "Non couvert ici\|non corrigés car hors du périmètre" schema.sql` should return 0 matches after the rewrite | N/A — textual check, no test file needed |

### Sampling Rate
- **Per task commit:** N/A — this phase is verification + a documentation edit, not incremental feature code; each task's own `<verify>` step (bootstrap success / compare exit 0 / grep count) is the check.
- **Per wave merge:** Re-confirm `node scripts/introspect-schema.js` (default mode, no args) still passes against prod, to catch any further live drift introduced mid-phase.
- **Phase gate:** Full manual bootstrap-and-compare against the fresh project (human + scripted) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `scripts/introspect-schema.js` `EXPECTED_TABLES` array needs the 5 Gap B names added (see Pitfall 3 / Code Examples) — required before Task 2 can validate SCHEMA-07's criterion 2.
- [ ] No committed script currently performs the Task-1 direct-`pg`-connection bootstrap (Phase 19's was ad-hoc/scratchpad, not committed) — author a small one-off script for this phase (can live in `scripts/` or scratchpad, planner's choice; a committed version would let this exact verification be re-run cheaply in the future, at low cost).

## Sources

### Primary (HIGH confidence — direct file reads this session, 2026-07-10)
- `schema.sql` (full header lines 1-60, full `CREATE TABLE`/`TYPE`/`VIEW` ordering grep, RLS/index/REALTIME/verification-SELECT sections) — read directly this session.
- `scripts/introspect-schema.js` (full file, 249 lines) — read directly this session; `EXPECTED_TABLES` array content confirmed via direct read, not inference.
- `.planning/milestones/v1.4-phases/19-schema-sql-regeneration/19-VERIFICATION.md`, `19-03-SUMMARY.md`, `19-03-PLAN.md`, `19-RESEARCH.md` — full reads, source of the proven bootstrap method and its documented pitfalls.
- `.planning/phases/21-migrations-r-troactives-mise-jour-schema-sql/21-VERIFICATION.md`, `21-04-SUMMARY.md` — full reads, confirms Gap A/B are structurally present and explicitly flags the header staleness + deferred-to-Phase-22 bootstrap gap.
- `.planning/phases/20-introspection-corr-lation-d-origine/20-FINDINGS.md` (excerpts) — origin/verdict wording for the 7 terminal-INCONNU ghost columns, useful if the header rewrite wants precise wording.
- `.planning/PROJECT.md` (Known Gaps section, lines 38-44) — confirms exactly one bullet (line 43) needs removal once this phase completes; the ~19-table full-parity scope boundary is tracked separately and unaffected.
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — current requirement/traceability state, confirms SCHEMA-07 is the sole remaining pending requirement.
- Direct environment probes this session: `node -e "require('pg/package.json').version"` → `8.22.0`; `command -v psql/docker/supabase` → all empty (absent); `.env` key names enumerated (values not read, per security convention) — confirms `SUPABASE_URL`/`SUPABASE_SECRET_KEY` etc. are present.

### Secondary (MEDIUM confidence)
- Inference that PostgREST's view-exposure behavior for `v_motos_avec_proprietaire` mirrors table exposure — based on general PostgREST behavior (views with granted SELECT appear in the OpenAPI spec same as tables) rather than a live re-test against this specific view in this specific project; flagged as Open Question 1 / Pitfall 4.

### Tertiary (LOW confidence)
- None flagged for this phase — the domain is narrow and well-covered by direct prior-phase artifacts already produced in this repo.

## Metadata

**Confidence breakdown:**
- Bootstrap method (what to do, how it worked before): HIGH — directly re-reading Phase 19's own verified, falsifiable session narrative, not re-deriving from scratch.
- `introspect-schema.js` gap (EXPECTED_TABLES needs Gap B names): HIGH — confirmed by direct read of the current array content.
- DDL ordering correctness (no forward-reference bugs expected): HIGH — verified by direct line-number reads this session, not assumed.
- View exposure via PostgREST for `v_motos_avec_proprietaire`: MEDIUM — plausible per general PostgREST behavior, not live-tested for this specific view yet.
- Header rewrite exact wording: HIGH for what must be removed (confirmed stale/false claims), MEDIUM for the exact replacement phrasing (a stylistic/wording choice for the planner, not a correctness question).

**Research date:** 2026-07-10
**Valid until:** 14 days — this is a low-drift domain (no further prod schema changes are planned before this phase executes, per STATE.md's "no active blockers"), but the fresh-project-creation and bootstrap-execution steps are inherently time-sensitive human actions that should happen close to when this research is consumed.
