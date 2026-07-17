# Phase 30: Audit Schéma `or_statut` - Research

**Researched:** 2026-07-17
**Domain:** PostgreSQL ENUM introspection (Supabase-hosted), schema drift audit, migration planning
**Confidence:** HIGH

## Summary

This phase is a pure audit/documentation phase — no DDL, no code changes. The goal is to answer two questions with certainty before Phase 31 writes any migration: (1) what are the *actual* live values of the `or_statut` Postgres enum in prod, and (2) what is the reconciliation path from those values to the 7 target statuses (`brouillon, envoye, accepte, en_cours, termine, facture, refuse`).

The tracked migration (`migrations/08-livraison-3a-ordres-reparation.sql:26-28`) declares `or_statut AS ENUM ('brouillon','en_cours','termine','annule')` — 4 values. But `supabase.js:913-921` (`_OR_TRANS`, the authoritative transition matrix used by the real Supabase-backed code path) and its RAM-fallback mirror `motokey-api.js:2982-2990` (`_OR_TRANS_RAM`) both operate on **7 statuses**: `brouillon, valide_client, en_cours, attente, termine, facture, annule`. Since the app has been writing `valide_client`, `attente`, and `facture` into the `statut` column successfully (confirmed by the existing 5-step UI stepper and prod OR data), the live Postgres enum **must** already contain at least these 3 undocumented values — added via an unrecorded `ALTER TYPE ... ADD VALUE`, almost certainly through the Supabase Dashboard, mirroring the exact same "code-catch-up" pattern already resolved for `devis`/`garages`/`interventions` in migrations 20-22 (Phase 21, Gap A).

Critically, **`ordres_reparation` and its 3 sibling tables (`or_taches`, `or_pieces`, `or_historique`, `catalogue_pieces`) are entirely absent from `schema.sql`** — the header (`schema.sql:6-18`) explicitly lists "Ordres de réparation" as one of ~19 out-of-scope subsystems never bootstrapped by that file. This is a distinct, wider gap than Gap A (undocumented columns on tracked tables) — the whole `or_statut` type and its owning table were never brought under schema.sql's umbrella at all. This phase only needs to close the narrow slice required by MIGR-02 (the enum values), not the full table — but the planner for Phase 31 should be aware the whole subsystem is undocumented, not just the enum.

The actual current live-value list is currently **unknown and must be queried, not inferred** — the code usage proves the enum contains at least `brouillon, valide_client, en_cours, attente, termine, facture, annule`, but only a live `pg_enum` (or PostgREST-OpenAPI-equivalent) query can confirm the exact list and ordering, since a stray manual Dashboard edit could have added values never referenced by code (ghost enum values, same failure mode already seen with ghost *columns* in Gap A migrations 20/21).

The target 7-status list (`brouillon, envoye, accepte, en_cours, termine, facture, refuse`) does **not** map 1:1 onto the current or_statut values: `valide_client`/`attente`/`annule` have no obvious single target equivalent, and `envoye`/`accepte`/`refuse` currently exist only on `devis.statut` (which is `TEXT NOT NULL CHECK (...)`, not an enum — `schema.sql:344`). This ambiguity is exactly what STATE.md flags as needing clarification during the audit, and this research treats it as the central open question the reconciliation plan must resolve.

**Primary recommendation:** Query the real `or_statut` values live via a small extension of the existing `scripts/introspect-schema.js` PostgREST-OpenAPI pattern (zero new credentials, reuses `SUPABASE_URL`/`SUPABASE_SECRET_KEY` already in `.env`) rather than requesting a new direct-Postgres connection string to prod. Document the full 7-value reconciliation table explicitly (old → new, migration action per value) as the phase's real deliverable, and recommend Phase 31 replace the `or_statut` ENUM with a `TEXT + CHECK` column — mirroring the pattern `devis.statut` already uses successfully — since Phase 31 is merging the two tables anyway and `ALTER TYPE ... ADD VALUE` carries real transactional footguns that a `CHECK` constraint does not.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIGR-02 | L'enum Postgres `or_statut` réel en prod est audité (`pg_enum`) et réconcilié avec les 7 statuts nécessaires avant toute écriture de migration DDL | See "Live Introspection Method" (Architecture Patterns), "Reconciliation Table Template" (Code Examples), and "Postgres ENUM Constraints" (Common Pitfalls) below. Directly answers the 4 phase success criteria (list real values live, document the gap, produce the ordered reconciliation plan, gate Phase 31 on it). |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **No PowerShell/Python/sed/awk bricolage** on critical files (`motokey-api.js`, `app.html`, `supabase.js`, `MotoKey_Client.html`). This phase produces no code changes to those files — it only reads them and writes a new `.sql` file (if any) and `.md` docs, but if a one-off introspection script is created it belongs in `scripts/`, versioned, not an ad-hoc shell one-liner.
- **Never touch the anti-fraude weighting (1.0/0.6/0.3) or the 70/30 score formula** — not in scope for this phase, noted for completeness.
- **Secrets discipline (user memory `feedback_secrets_security`):** never print secrets in commands; use `$ENV_VAR`; if a Supabase Dashboard SQL Editor query is needed (e.g., true raw `pg_enum` SQL against prod, since no direct Postgres connection string to prod exists in `.env` — only `SUPABASE_URL`/`SUPABASE_SECRET_KEY`/`SUPABASE_ANON_KEY`/`SUPABASE_PUBLISHABLE_KEY`, plus `FRESH_DB_URL` which explicitly points at a *disposable* project, not prod), provide the SQL for Mehdi to run and paste the output back, rather than asking for a raw prod connection string.
- **Report before push (user memory `feedback_report_before_push`):** show verification results and wait for explicit GO before any `git push`. This phase has no push per se (docs only) but the same discipline applies — show the introspection output and reconciliation table before considering the phase done.
- **Communicate in French** with Mehdi (user memory `feedback_langue_francais`) — this RESEARCH.md is in English per GSD convention, but any direct message to Mehdi (e.g., asking him to run a Dashboard query) should be in French.
- **git status / git log before major changes** — standard discipline, applies if any file is created under `scripts/` or `sql/migrations/`.
- **Established precedent to follow, not re-derive:** this project has already solved "undocumented schema drift" three times (Gap A: migrations 20/21/22 in Phase 21; Gap B: Phase 21 schema.sql additions; Phase 19/22: `introspect-schema.js` + `bootstrap-fresh-schema.js` for live verification against a throwaway project). Phase 30 should reuse these patterns exactly, not invent a new methodology.

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard (for this project) |
|------|---------|---------|----------------------------------|
| PostgREST OpenAPI introspection (`fetch` against `{SUPABASE_URL}/rest/v1/?apikey=...`) | N/A (HTTP call) | Live-query enum values for `or_statut` without a new Postgres connection | Already the exact pattern used and proven in `scripts/introspect-schema.js` (Phase 19); confirmed to expose live enum values in the `"enum"` array of each enum-typed column's OpenAPI/Swagger property definition (verified via PostgREST official docs, see Sources) |
| `node-postgres` (`pg`) | not currently installed (was `npm install pg --no-save`, verify still present) | Only needed if a literal `SELECT ... FROM pg_enum` against prod is required (e.g., if PostgREST's schema cache is suspected stale) | Already the project's fallback pattern (`scripts/bootstrap-fresh-schema.js`), but that script only has a connection string for a **disposable** test project (`FRESH_DB_URL`), not prod — a prod-equivalent (`DATABASE_URL`/direct connection string via Supabase Dashboard → Settings → Database) does not currently exist in `.env` and would need to be added as a one-time human action if this route is chosen |
| Supabase SQL Editor (manual, human-run) | N/A | Fallback / most literal way to satisfy "requête `pg_enum` live" if a scripted route is blocked | Established precedent in this project for anything requiring prod DB access beyond what `SUPABASE_SECRET_KEY` + PostgREST can do (used for all migrations 1-25 application) |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `dotenv` | already a dependency (used by `introspect-schema.js`) | Load `.env` for `SUPABASE_URL`/`SUPABASE_SECRET_KEY` | Any new introspection script |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PostgREST OpenAPI enum introspection | Direct `pg` connection to prod via a new `DATABASE_URL` | More "literal" match to "requête pg_enum" wording, but requires provisioning a new prod credential (Supabase Dashboard → Settings → Database → Connection string) — a human action with real security surface (read-write superuser-equivalent connection to prod vs. the already-scoped `SUPABASE_SECRET_KEY`). Not needed since PostgREST's OpenAPI spec is generated live from `pg_catalog` (including `pg_enum`) — functionally equivalent live-query, zero new credentials, reuses proven project pattern. |
| PostgREST OpenAPI enum introspection | Manual Supabase Dashboard SQL Editor query, human runs `SELECT enumlabel, enumsortorder FROM pg_enum WHERE enumtypid = 'or_statut'::regtype ORDER BY enumsortorder;` and pastes result | Zero scripting risk, most literal, but requires a manual round-trip with Mehdi instead of an automatable/re-runnable script. Good as a **cross-check** of the scripted result, not as the primary method (this project's precedent — Phase 19/22 — favors scripted, re-runnable verification over one-off manual checks where possible). |

**Installation:** No new package installs required for the primary (PostgREST OpenAPI) method — reuses existing `.env` vars and Node's built-in `fetch`. If the `pg`-based fallback is needed: `npm install pg --no-save` (verified this exact command already documented in `scripts/bootstrap-fresh-schema.js:20`).

**Version verification:** Not applicable — no new package versions to pin for the primary method.

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Follow existing conventions:
```
scripts/
├── introspect-schema.js         # existing — could be extended, or...
├── introspect-or-statut.js      # NEW (recommended) — narrow, single-purpose, phase-scoped
.planning/phases/30-audit-sch-ma-or-statut/
├── 30-RESEARCH.md               # this file
├── 30-01-PLAN.md                # planner output
└── 30-FINDINGS.md (optional)    # if the planner wants a dedicated audit-results doc, mirroring
                                  # the 20-FINDINGS.md precedent from Phase 20 (Gap A origin audit)
```

### Pattern 1: Live PostgREST-OpenAPI Enum Introspection (primary method)
**What:** Reuse `scripts/introspect-schema.js`'s `introspect(url, key)` helper (fetches `{SUPABASE_URL}/rest/v1/?apikey=...`, parses `spec.definitions`) but target it at the `ordres_reparation` and `or_taches` table definitions specifically, and read the `.properties.statut.enum` array (and `.format` string, which will read something like `"public.or_statut"`).
**When to use:** Primary/first method — no new credentials, reuses proven pattern, satisfies "live query" requirement since PostgREST regenerates this spec from `pg_catalog`/`pg_enum` on schema-cache refresh (which happens automatically on DDL via Supabase's `pgrst` LISTEN/NOTIFY, and can be forced via `NOTIFY pgrst, 'reload schema';` if ever in doubt).
**Example:**
```javascript
// Source: scripts/introspect-schema.js (existing, Phase 19) — reused pattern
// New script: scripts/introspect-or-statut.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;
  const res = await fetch(url + '/rest/v1/?apikey=' + key, { headers: { Authorization: 'Bearer ' + key } });
  const spec = await res.json();
  const or = spec.definitions.ordres_reparation;
  const orTaches = spec.definitions.or_taches;
  console.log('or_statut live values:', or.properties.statut.enum, '| format:', or.properties.statut.format);
  console.log('or_tache_statut live values:', orTaches.properties.statut.enum, '| format:', orTaches.properties.statut.format);
}
main();
```
**Cross-check (recommended, cheap insurance):** Ask Mehdi (in French) to run this in Supabase Dashboard → SQL Editor and paste the result, to confirm the PostgREST-derived list matches the literal catalog:
```sql
-- Source: PostgreSQL official docs (pg_enum) — see Sources
SELECT enumlabel, enumsortorder
FROM pg_enum
WHERE enumtypid = 'or_statut'::regtype
ORDER BY enumsortorder;
```

### Pattern 2: Reconciliation Table as the Phase's Actual Deliverable
**What:** The phase's success criteria require more than a values list — they require an explicit gap table (missing/to-rename) and an *ordered* migration plan. Model this on the existing Gap A retroactive-migration docs (`sql/migrations/20/21/22_*.sql`), which pair each undocumented item with an origin note and an explicit action.
**When to use:** After the live values are confirmed, before writing anything for Phase 31.
**Example:** See "Reconciliation Table Template" under Code Examples.

### Anti-Patterns to Avoid
- **Inferring the enum from `migrations/08-livraison-3a-ordres-reparation.sql` alone:** this is the exact mistake the phase exists to prevent — that file is proven stale (declares 4 values, code uses 7).
- **Inferring the enum from `_OR_TRANS`/`_OR_TRANS_RAM` code alone:** these prove a *lower bound* (values the app writes), not the actual catalog contents — a manual Dashboard edit could have added extra unused values (ghost enum labels), exactly mirroring the ghost-*column* pattern already found and documented in migrations 20/21 (`type`, `marque_officielle`, `actif` on `garages`; 4 columns on `interventions` — all "verdict terminal: origine indéterminée, colonne non utilisée par le code actuel"). Live query is mandatory, not optional, precisely because this project has already been burned by trusting code-inference once (Gap A).
- **Requesting a new direct Postgres connection string to prod as the default/only method:** unnecessary credential-surface increase when the PostgREST route already satisfies "live query" — reserve the direct-`pg`/Dashboard-SQL route for a cross-check or for cases where the OpenAPI spec is suspected stale.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Listing live Postgres enum values via Supabase | A brand-new introspection approach from scratch | Extend `scripts/introspect-schema.js`'s existing `introspect()` helper (already handles auth, host-masking, OpenAPI parsing, enum extraction via `prop.enum`) | It already does 90% of what's needed (`printTables()` even already prints `enumNote` for any enum column) — this project already paid the R&D cost for this exact capability in Phase 19 |
| Documenting schema drift with origin/action per item | A free-form prose report | The `sql/migrations/2X_*_undocumented_columns.sql` comment-per-item table format already established (item, origin if known, verdict/action) | Consistent with how Phase 21 documented Gap A — the planner and any future auditor already knows how to read this format |

**Key insight:** This project has solved "undocumented Postgres schema state" as a recurring problem type three times already (Gap A columns, Gap B tables, this Gap on an enum type). The tooling and documentation format are already validated — Phase 30's job is to apply the existing playbook to a new object type (`ENUM`), not invent a new one.

## Runtime State Inventory

> This phase is audit-only (read-only introspection, produces documentation) — no rename, no code change, no data migration happens in Phase 30 itself. However, since this *precedes* a schema migration phase (31), the categories below are answered for completeness, scoped to what Phase 30 itself touches.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `ordres_reparation.statut` column currently holds live values across the 6 existing prod OR rows (per 2026-07-17 count in STATE.md) using at least `brouillon, valide_client, en_cours, attente, termine, facture, annule` | None in Phase 30 (read-only) — Phase 31 will need a data migration/backfill strategy per value, informed by this phase's reconciliation table |
| Live service config | None — `or_statut` is a database-native Postgres type, not an external service config (unlike n8n workflows/Datadog tags mentioned in the general playbook) | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no secret or env var references `or_statut` by name | None |
| Build artifacts | `schema.sql` does **not** declare `or_statut` at all (table `ordres_reparation` and the type are both entirely out of scope of that file per its own header, `schema.sql:6-18`) — this is pre-existing, not caused by this phase | Phase 31 will need to decide whether to bring `ordres_reparation`/`or_statut` (or its `TEXT+CHECK` replacement) into `schema.sql`'s scope, or continue treating it as an intentionally-excluded subsystem. Flagged here as a decision for the Phase 31 planner, out of scope for Phase 30's own deliverable. |

## Common Pitfalls

### Pitfall 1: Trusting the PostgREST schema cache without confirming freshness
**What goes wrong:** PostgREST caches its schema introspection and only regenerates the OpenAPI spec after a schema-cache reload (usually automatic via Supabase's LISTEN/NOTIFY on DDL, but can lag in edge cases — e.g., a raw `ALTER TYPE` run outside Supabase's own migration tooling).
**Why it happens:** PostgREST doesn't poll `pg_catalog` on every request by default; it relies on a NOTIFY-triggered cache reload.
**How to avoid:** Cross-check the scripted PostgREST result against a manual `SELECT ... FROM pg_enum` run by Mehdi in the Supabase Dashboard SQL Editor (see Pattern 1's cross-check). If they disagree, trust `pg_enum` and note the discrepancy in the audit doc — do not silently pick one.
**Warning signs:** The two sources disagree, or the PostgREST-derived list is exactly the 4 values from the stale tracked migration (would indicate a cache that never picked up the manual Dashboard `ALTER TYPE` calls the app's own successful writes prove must exist).

### Pitfall 2: `ALTER TYPE ... ADD VALUE` transaction semantics
**What goes wrong:** Since PostgreSQL 12, `ALTER TYPE ... ADD VALUE` **can** run inside a transaction block (`BEGIN...COMMIT`), but the newly added value **cannot be used** (e.g., in an `UPDATE ... SET statut = 'new_value'` or a `CHECK`/comparison) within that same transaction — doing so raises `unsafe use of new value "X" of enum type Y` (PostgreSQL error 55P04). This matters directly because this project's migration file convention (see `migrations/08-livraison-3a-ordres-reparation.sql:20,227`) wraps every migration in a single `BEGIN; ... COMMIT;` block.
**Why it happens:** PostgreSQL enum values aren't fully "committed" into visible catalog state usable by other statements until the adding transaction completes, to preserve consistent snapshot semantics for concurrent readers.
**How to avoid:** If Phase 31 keeps the ENUM approach (not recommended — see Pattern below), any `ALTER TYPE or_statut ADD VALUE 'envoye';` must be in its own transaction/migration file, separate and prior to any migration that writes rows using `'envoye'`. This is exactly why the reconciliation plan (this phase's deliverable) must specify *ordering*, not just a values list.
**Warning signs:** A migration that both adds a value and uses it in the same `BEGIN...COMMIT` block will fail outright at `COMMIT`-adjacent execution — easy to catch in a dry run against `FRESH_DB_URL` before touching prod (established project precedent, `scripts/bootstrap-fresh-schema.js`).

### Pitfall 3: ENUM values cannot be removed or easily renamed without care
**What goes wrong:** PostgreSQL has no `ALTER TYPE ... DROP VALUE`. Removing an enum value requires either (a) ensuring zero rows reference it then recreating the type (`CREATE TYPE ... AS ENUM (...)`, swap column type, `DROP TYPE` old), or (b) leaving orphaned/unused values in place forever. `ALTER TYPE ... RENAME VALUE 'old' TO 'new'` (available since PG10) is safe and simpler if a straight rename (not a semantic split/merge) is all that's needed.
**Why it happens:** Enum values are referenced by internal OID in stored rows' binary representation; PostgreSQL doesn't provide safe removal tooling by default.
**How to avoid:** This is the strongest argument for the recommendation below — since the target 7-status set doesn't cleanly map from the current 7 values (e.g., `annule` has no target equivalent, `attente` doesn't either, `refuse`/`envoye`/`accepte` don't exist yet on `or_statut`), a straight rename-in-place will leave orphaned values (`annule`, `attente`) that can never be cleanly removed later if the ENUM type is kept.
**Warning signs:** Any reconciliation plan that tries to `RENAME VALUE` its way to the target 7 while also needing to *drop* `annule`/`attente` semantics is a sign the ENUM approach has hit its ceiling for this migration.

### Pitfall 4: `TEXT + CHECK` is not automatically superior — document the tradeoff, don't just assert it
**What goes wrong:** Recommending "switch to TEXT+CHECK" without acknowledging what's lost: enum types give you a small storage/index efficiency win (enums store as 4-byte OID vs. variable-length TEXT) and a schema-level guarantee that doesn't depend on every write path going through the constraint (`CHECK` constraints are equally enforced by Postgres regardless of write path — this concern is actually a non-issue, both are DB-enforced. The real tradeoff is storage/perf, negligible at this project's data volume — 6 OR rows, 8 devis rows per STATE.md 2026-07-17 count).
**Why it happens:** Easy to state a recommendation as fact without listing what's actually being traded away.
**How to avoid:** State plainly in the reconciliation doc: at MotoKey's current/projected data volume, the storage/perf difference between ENUM and TEXT+CHECK is immaterial; the deciding factor is operational flexibility (CHECK constraints are trivially altered via `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...` in a single ordinary transaction, no `ADD VALUE`/rename/recreate-type dance) and consistency with the sibling table (`devis.statut`) this migration is merging with.

## Code Examples

### Reconciliation Table Template
This is the actual shape the phase's core deliverable should take (fill in real values after running the live introspection — do not guess these numbers, this table below uses code-inferred values as a *placeholder skeleton only*, clearly marked as unverified):

```markdown
| Current or_statut value (⚠️ UNVERIFIED — confirm via live query) | Used by code? | Target status | Action |
|---|---|---|---|
| brouillon | yes (_OR_TRANS, _OR_TRANS_RAM) | brouillon | keep (same name) |
| valide_client | yes | envoye OR accepte (AMBIGUOUS — see Open Questions) | rename/split — needs product decision |
| en_cours | yes | en_cours | keep (same name) |
| attente | yes | (no direct target — outside the 7-status cycle) | decide: fold into en_cours with a separate boolean flag, or drop entirely |
| termine | yes | termine | keep (same name) |
| facture | yes | facture | keep (same name) |
| annule | yes | (no direct target — target list has "refuse" not "annule") | decide: map annule→refuse (semantically different — refuse = client declined; annule = garage cancelled), or keep as an 8th status outside the "7 nécessaires" |
| envoye | UNKNOWN — confirm live | envoye | new value if missing |
| accepte | UNKNOWN — confirm live | accepte | new value if missing |
| refuse | UNKNOWN — confirm live | refuse | new value if missing |
```
**This table's `envoye`/`accepte`/`refuse`/`attente`/`annule`/`valide_client` mapping ambiguities are exactly the Open Questions this research could not resolve from code alone — flagged explicitly below, not silently assumed.**

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Inferring live schema state from tracked `.sql` migration files | Live introspection via PostgREST OpenAPI (`scripts/introspect-schema.js`) or direct `pg_enum`/`information_schema` queries | Established in this project since Phase 19 (2026-07-08/09), reinforced by Gap A/B resolution in Phase 21 (2026-07-10) | This project now treats "migration files reflect prod" as a hypothesis to verify, not a fact — Phase 30 is the third application of this lesson (after Gap A columns, Gap B tables) |

**Deprecated/outdated:**
- Trusting `migrations/08-livraison-3a-ordres-reparation.sql`'s `or_statut` declaration as authoritative — proven stale by this phase's own trigger event (STATE.md 2026-07-17 entry).

## Open Questions

1. **What is the actual live `or_statut` value list, including sort order?**
   - What we know: code proves at least `brouillon, valide_client, en_cours, attente, termine, facture, annule` are writable (7 values), the tracked migration only declares 4.
   - What's unclear: whether there are additional *unused* (ghost) values beyond these 7, and the exact `enumsortorder`.
   - Recommendation: run the live introspection (Pattern 1) as the very first task of this phase's plan — this is not optional research, it's the phase's core success criterion #1.

2. **Does `valide_client` map to `envoye` or `accepte` in the target cycle?**
   - What we know: `_OR_TRANS` (`supabase.js:913-921`) shows `brouillon → valide_client → en_cours`, i.e., `valide_client` is the single gate between "not yet started" and "in progress" — it conflates what the target cycle splits into two separate steps (`envoye` = sent to client, `accepte` = client said yes, both before `en_cours`).
   - What's unclear: was `valide_client` ever meant to represent "envoyé" (sent) as opposed to "accepté" (client confirmed)? The name suggests validation/acceptance, not sending. STATE.md itself flags this exact ambiguity as unresolved ("il faudra clarifier le mapping... pendant l'audit").
   - Recommendation: this is a **product decision, not a technical one** — surface it explicitly to Mehdi as part of this phase's output rather than silently picking an interpretation. Likely resolution: `valide_client` collapses into `accepte` (its current behavior — a single explicit client confirmation step) and the new `envoye` status is genuinely new behavior (no current equivalent — OR/devis today go straight from creation to needing client validation, there's no "sent, awaiting response" limbo state currently modeled on `or_statut`). This mirrors `devis.statut`, which *does* already have both `envoye` and `accepte` as separate values (`schema.sql:344`) — suggesting the target cycle's `envoye`/`accepte` split is inherited from `devis`, not from `ordres_reparation`.

3. **What happens to `attente` (on-hold) and `annule` (cancelled) — neither exists in the target 7-status list?**
   - What we know: both are actively used in `_OR_TRANS` today (`attente` as a detour from `en_cours` requiring `attente_motif`; `annule` as a near-universal terminal escape hatch from every non-terminal state).
   - What's unclear: whether these become flags/sub-states layered on top of the 7-status cycle (e.g., `en_cours` + `en_attente=true` + `attente_motif`) rather than being removed, or whether they're genuinely descoped. `annule` in particular seems too operationally important (garage-side cancellation, distinct from client-side `refuse`) to simply drop.
   - Recommendation: flag as a decision for Phase 31's planner/Mehdi — the phase 30 reconciliation doc should present both options (fold into cycle as flags, vs. keep as 2 additional statuses beyond the "7 nécessaires") rather than presuppose one.

4. **Are there ghost `or_statut` values beyond the 7 proven by code?**
   - What we know: nothing yet — this is precisely what the live query in Pattern 1 will answer.
   - What's unclear: everything, until the query runs.
   - Recommendation: N/A — first task of the phase's plan, not something research can resolve without live access.

5. **Should `or_tache_statut` (`a_faire, en_cours, fait`) also be audited?**
   - What we know: it's a separate, smaller enum on `or_taches.statut`, declared in the same migration file (`migrations/08...sql:32-35`) and not mentioned in MIGR-02's scope (which is specifically `or_statut`).
   - What's unclear: whether it has the same undocumented-drift risk.
   - Recommendation: out of scope for MIGR-02 as literally worded, but cheap to check in the same introspection script pass (it's the same PostgREST call) — recommend including it as a bonus/side-finding in the audit doc, not as a blocking requirement.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_KEY`) in `.env` | Primary introspection method (Pattern 1) | ✓ | present in `.env` (values not printed, per secrets discipline) | — |
| `pg` npm package | Only if the direct-Postgres fallback route is used | ✗ (not currently in `node_modules`, was installed `--no-save` for a past one-off script per `scripts/bootstrap-fresh-schema.js:18-20`) | — | `npm install pg --no-save` — trivial to reinstall, already documented project pattern |
| Direct Postgres connection string to **prod** (`DATABASE_URL`-equivalent) | Only if literal `pg_enum` SQL must be run programmatically against prod (not via Dashboard) | ✗ (`.env` only has `FRESH_DB_URL`, explicitly a disposable non-prod project) | — | Not needed for the recommended primary method (PostgREST OpenAPI). If truly required, must be a new human-provisioned credential via Supabase Dashboard → Settings → Database — treat as last resort per Alternatives Considered above |
| Supabase Dashboard access (Mehdi) | Cross-check query (Pattern 1) | ✓ (implied — established precedent, all past migrations applied this way) | — | — |

**Missing dependencies with no fallback:** None — the primary method needs nothing beyond what's already in `.env`.

**Missing dependencies with fallback:** `pg` package (fallback: reinstall on demand, only if cross-check route is chosen over/in addition to the Dashboard SQL cross-check).

## Validation Architecture

> `workflow.nyquist_validation` is absent from `.planning/config.json` — treated as enabled per default.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (no jest/pytest/mocha) — this project uses standalone Node scripts run against live/disposable Supabase projects (`scripts/test-*.js`, `scripts/introspect-schema.js` pattern) |
| Config file | none — see Wave 0 |
| Quick run command | `node scripts/introspect-or-statut.js` (new script, per Pattern 1) |
| Full suite command | Same — this phase has no broader regression suite to run since it makes zero code changes |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIGR-02 (criterion 1: live enum values listed) | `or_statut` real values printed from a live PostgREST-OpenAPI query | smoke/manual-verify | `node scripts/introspect-or-statut.js` | ❌ Wave 0 — script to be created as this phase's first task |
| MIGR-02 (criterion 2: gap explicit) | Reconciliation table (Code Examples template) filled with real values, committed to the phase's docs | manual-only (documentation artifact, not code) | N/A — reviewed by Mehdi/planner, not machine-testable | N/A |
| MIGR-02 (criterion 3: ordered plan documented) | Migration ordering + transaction-boundary notes (Pitfall 2) written into the phase's plan/output doc | manual-only | N/A | N/A |
| MIGR-02 (criterion 4: gates Phase 31) | No DDL file exists yet touching `or_statut` before this phase's doc is committed | manual/process check | `git log --oneline -- 'sql/migrations/*or_statut*' 'migrations/*or_statut*'` should return nothing new until Phase 31 | N/A |

### Sampling Rate
- **Per task commit:** run `node scripts/introspect-or-statut.js` after writing it, confirm output is non-empty and lists ≥7 values.
- **Per wave merge:** N/A — single-wave phase expected (pure audit/doc).
- **Phase gate:** the reconciliation doc (this RESEARCH.md's findings, extended by the plan's actual live-query output) must exist and be committed before `/gsd:verify-work` on Phase 30, and definitely before Phase 31 writes any `ALTER TYPE`/`CREATE TYPE` statement.

### Wave 0 Gaps
- [ ] `scripts/introspect-or-statut.js` — does not exist yet, needed to cover MIGR-02 criterion 1. Can be a narrow extension/copy of `scripts/introspect-schema.js`'s `introspect()` function rather than a from-scratch build.
- [ ] No fixtures/conftest needed — this project has no shared test-fixture convention beyond `.env` + live/disposable Supabase projects.

*(No jest/pytest framework install needed — out of pattern for this project.)*

## Sources

### Primary (HIGH confidence)
- `C:\motokey-api\migrations\08-livraison-3a-ordres-reparation.sql` (lines 20-30) — tracked `or_statut` declaration (4 values), read directly.
- `C:\motokey-api\motokey-api.js` (lines 2938-3024) — RAM-fallback transition matrix (`_OR_TRANS_RAM`), 7 values, read directly.
- `C:\motokey-api\supabase.js` (lines 908-1160) — authoritative Supabase-backed `OrdresReparation` module including `_OR_TRANS`, `changerStatut`, `facturer`, `cloturer` — read directly.
- `C:\motokey-api\schema.sql` (lines 1-60, 336-384) — confirms `ordres_reparation`/`or_statut` entirely out of schema.sql's scope; confirms `devis.statut` is `TEXT + CHECK`, not an enum — read directly.
- `C:\motokey-api\scripts\introspect-schema.js` and `scripts\bootstrap-fresh-schema.js` — existing, proven introspection tooling from Phase 19/22 — read directly.
- `C:\motokey-api\sql\migrations\20_garages_undocumented_columns.sql`, `21_interventions_undocumented_columns.sql`, `22_devis_undocumented_columns.sql` — established precedent for documenting retroactive schema drift — read directly.
- `C:\motokey-api\.planning\STATE.md` — records the exact discovery event (2026-07-17) and prod count (8 devis, 6 OR) — read directly.
- [PostgreSQL 18 docs — ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html) — confirms `ADD VALUE` transaction-block constraint (new value unusable in same transaction) and no direct `DROP VALUE` support.
- [PostgREST 12.2 docs — OpenAPI](https://docs.postgrest.org/en/v12/references/api/openapi.html) — confirms enum columns are represented with a live `"enum"` array in generated Swagger/OpenAPI definitions, generated on-demand from the schema cache.

### Secondary (MEDIUM confidence)
- [PostgREST/postgrest GitHub Discussion #2106 — "Get enum type from database"](https://github.com/PostgREST/postgrest/discussions/2106) — community confirmation of the `enum` array behavior in OpenAPI output, consistent with official docs.

### Tertiary (LOW confidence)
- None used as load-bearing for any recommendation — all technical claims cross-verified against official docs or direct code reads.

## Metadata

**Confidence breakdown:**
- Standard stack (introspection method): HIGH — reuses an already-built, already-proven project script; PostgREST enum-in-OpenAPI behavior independently confirmed via official docs.
- Architecture (ENUM vs TEXT+CHECK recommendation): HIGH for the technical tradeoffs (Postgres docs), MEDIUM for the specific recommendation to switch (a judgment call, clearly flagged as such, consistent with existing `devis.statut` pattern already in this codebase).
- Pitfalls (ALTER TYPE transaction semantics): HIGH — official PostgreSQL documentation, unambiguous.
- Reconciliation mapping (`valide_client`/`attente`/`annule` → target 7): LOW/open — explicitly flagged as unresolved product-decision questions, not asserted as fact anywhere in this document.

**Research date:** 2026-07-17
**Valid until:** No hard expiry — this is a point-in-time audit of prod state; if any manual Dashboard change to `or_statut` occurs between now and Phase 31's execution, the live values must be re-queried, not assumed from this document.
