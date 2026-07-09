---
phase: 19-schema-sql-regeneration
verified: 2026-07-09T14:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 19: Schema.sql Regeneration Verification Report

**Phase Goal:** A developer can bootstrap a fresh Supabase project from schema.sql and get a schema matching prod for the known-tracked drift (migrations 1–19), with no manual patching required. Full 38-table parity is explicitly out of scope for v1.4.
**Verified:** 2026-07-09T14:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | schema.sql includes CREATE TABLE for client_device_tokens, push_send_log, garage_users | ✓ VERIFIED | `schema.sql:163` `CREATE TABLE garage_users`, `:183` `CREATE TABLE client_device_tokens`, `:205` `CREATE TABLE push_send_log` — DDL, indexes, comments, RLS all present |
| 2 | schema.sql includes motos maintenance-tier columns (mig 18) and clients UNIQUE(email,garage_id) (mig 19) | ✓ VERIFIED | `schema.sql:242-243` `last_maintenance_tier_notified[_at]`; `:157` `CONSTRAINT clients_email_garage_id_key UNIQUE (email, garage_id)` |
| 3 | schema.sql's devis status constraint documents the live CHECK constraint values (via pg_get_constraintdef, not guessed) | ✓ VERIFIED | `schema.sql:321` `CHECK (statut IN ('brouillon','envoye','accepte','refuse','expire','converti','annule'))` — matches 19-01-SUMMARY.md's verbatim `pg_get_constraintdef` capture exactly (7-value superset resolving the app-code vs. phase-description discrepancy); `statut_devis` ENUM fully removed (0 residual references) |
| 4 | schema.sql's header comment documents known-partial bootstrap scope | ✓ VERIFIED | `schema.sql:6-40` — lists all ~19 untracked live tables/views by name, PLUS two additional gap categories discovered during 19-03 execution (missing migration 13/15 objects, undocumented no-migration-file drift on garages/clients/interventions/devis) |
| 5 | schema.sql was actually executed against a genuinely empty fresh Supabase project this session (not simulated), confirmed via direct node-postgres connection | ✓ VERIFIED | 19-03-SUMMARY.md documents 3 failed Dashboard SQL Editor paste attempts with specific, distinct truncation points (`CASCADE`→`CAS`, a table reference→`pl`, a dropped ENUM literal) followed by a pivot to `npm install pg --no-save` + direct Postgres connection string execution, printing `SCHEMA_BOOTSTRAP_OK` and a 14-table list with RLS confirmed. The compare-mode re-run against this same live connection surfaced real migration 10/13/15 gaps, which were then patched (commit `0a616bf`) and re-verified clean — this level of specific, falsifiable detail (exact truncation points, exact missing-column names later confirmed present in the codebase) is inconsistent with a fabricated/simulated run. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/introspect-schema.js` | PostgREST introspection + `--compare` mode | ✓ VERIFIED | Exists, `node --check` passes, live-ran against prod during this verification: `RESULT: PASS — all narrow-scope objects confirmed present in prod` (garage_users, client_device_tokens, push_send_log, both motos columns) |
| `schema.sql` — `CREATE TABLE garage_users` | Table + FK + CHECK role IN ('PRO','MECANO') + indexes + comment | ✓ VERIFIED | `schema.sql:163-181` |
| `schema.sql` — `CREATE TABLE client_device_tokens` | Table + FK to clients CASCADE + UNIQUE token + platform CHECK | ✓ VERIFIED | `schema.sql:183-203` |
| `schema.sql` — `CREATE TABLE push_send_log` | Table, intentionally no FK on client_id, NOTE comment preserved | ✓ VERIFIED | `schema.sql:205-`, NOTE (2026-07-02) comment present |
| `schema.sql` — motos mig-18 columns | `last_maintenance_tier_notified[_at]` + COMMENT | ✓ VERIFIED | `schema.sql:242-243, 258` |
| `schema.sql` — clients mig-19 UNIQUE | `clients_email_garage_id_key UNIQUE(email, garage_id)` | ✓ VERIFIED | `schema.sql:157` |
| `schema.sql` — devis.statut TEXT+CHECK | 7-value CHECK replacing stale ENUM | ✓ VERIFIED | `schema.sql:321`; `statut_devis` 0 residual references |
| `schema.sql` — BOOTSTRAP PARTIEL header | Documents known-partial scope | ✓ VERIFIED | `schema.sql:6-40` |
| `schema.sql` — mig 10/13/15 columns (19-03 patch) | garages Stripe + session-timeout cols, motos/clients L8 ownership cols | ✓ VERIFIED | `schema.sql:105` (`mecano_session_timeout_minutes`), `:106-107` (`stripe_customer_id`/`stripe_subscription_id`), `:153-154` (`is_pro`, `limite_motos_gratuites`), `:244-254` (`proprietaire_type` + enum + coherence CHECK) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `schema.sql` devis.statut CHECK clause | plan 01's `pg_get_constraintdef` output | verbatim copy of allowed values | ✓ WIRED | Value lists are character-for-character identical between 19-01-SUMMARY.md's captured constraint definition and `schema.sql:321` |
| fresh Supabase project | prod schema (migrations 1-19 objects) | `node scripts/introspect-schema.js --compare` | ✓ WIRED (per 19-03-SUMMARY narrative) | Compare mode script exists and is functional (verified live against prod in this session); its use against the now-discarded fresh project is documented, not independently re-runnable post-hoc since the throwaway project no longer exists |

### Data-Flow Trace (Level 4)

Not applicable — schema.sql is a static DDL bootstrap file, not a component/API rendering dynamic runtime data. `scripts/introspect-schema.js` was spot-checked live against prod (see Behavioral Spot-Checks) and returned real, non-empty table/column data (not a static/empty stub).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Introspection script queries live prod and confirms narrow-scope objects | `node scripts/introspect-schema.js` | `RESULT: PASS — all narrow-scope objects confirmed present in prod.` (garage_users, client_device_tokens, push_send_log, motos.last_maintenance_tier_notified, motos.last_maintenance_tier_notified_at all PASS) | ✓ PASS |
| introspect-schema.js has valid syntax | `node --check scripts/introspect-schema.js` | No output (clean) | ✓ PASS |
| No residual `statut_devis` ENUM references | `grep -n "statut_devis" schema.sql` | 0 matches | ✓ PASS |
| Fresh-project bootstrap re-execution | N/A | Not re-runnable — throwaway Supabase project from the session was discarded per plan design (Task 1 explicitly creates a throwaway project) | ? SKIP (see Human Verification) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SCHEMA-01 | 19-01, 19-02, 19-03 (all three declare it in frontmatter) | Developer can run schema.sql against a fresh Supabase project and get a schema matching prod for the known-tracked drift (migrations 1-19) | ✓ SATISFIED | All 5 ROADMAP success criteria verified above; header documents scope honestly; live spot-check confirms objects exist in prod and the script that verified fresh-vs-prod parity is functional |

No orphaned requirements — SCHEMA-01 is the only requirement mapped to Phase 19 in REQUIREMENTS.md (line 38), and it is declared in all three plans' frontmatter.

**Documentation staleness note (non-blocking):** `.planning/REQUIREMENTS.md` line 16 still shows `- [ ] **SCHEMA-01**` (unchecked) and its Traceability table (line 38) still says "Pending", while `.planning/ROADMAP.md` line 72 already marks Phase 19 `[x]` complete but its Progress table (line 127) still shows "2/3 In Progress". These are tracking-document inconsistencies for the orchestrator to reconcile after this verification passes — they do not reflect a gap in the actual schema.sql deliverable.

### Anti-Patterns Found

None. Scanned `schema.sql` and `scripts/introspect-schema.js` for TODO/FIXME/PLACEHOLDER/"not yet implemented"/empty-stub patterns — zero matches. `introspect-schema.js` performs real fetch calls, real JSON parsing, real diffing logic (not stubbed).

### Human Verification Required

### 1. Fresh-project bootstrap re-confirmation (optional, low priority)

**Test:** Create a new throwaway Supabase project, paste-run `schema.sql`, then run `node scripts/introspect-schema.js --compare <FRESH_URL> <FRESH_KEY>`.
**Expected:** Clean bootstrap (0 SQL errors); compare exits non-zero only for the explicitly-documented, deferred undocumented-drift category (garages/clients/interventions/devis columns with no migration file) — all migration-1–19 tracked objects should show `[OK]`.
**Why human:** The throwaway Supabase project used during 19-03 execution no longer exists (by design — it was a disposable test project), so this run cannot be independently re-executed by the verifier in this session. The 19-03-SUMMARY.md narrative provides strong, specific, falsifiable evidence (exact truncation error text across 3 distinct paste attempts, exact missing-column names that were subsequently found and patched, commit `0a616bf` containing exactly those columns) consistent with a genuine execution rather than a simulated one, so this is scored VERIFIED above — this human check is a confidence-building re-confirmation, not a blocking gap.

### Gaps Summary

No gaps found. All 5 must-haves for Phase 19 / SCHEMA-01 are verified against the actual codebase:
- The 3 previously-absent tables (`garage_users`, `client_device_tokens`, `push_send_log`) exist in `schema.sql` with faithful DDL, indexes, comments, and RLS reproduction (enabled, zero policies, matching prod's confirmed default-deny state).
- Migration 18 (motos maintenance-tier columns) and migration 19 (clients UNIQUE) are present.
- The devis.statut CHECK constraint is the verbatim 7-value set captured via `pg_get_constraintdef`, replacing the stale 4-value ENUM.
- The header honestly documents the known-partial bootstrap scope, including two additional gap categories discovered mid-execution (missing migration 13/15 objects — since patched — and a newly-found undocumented, no-migration-file drift category that was explicitly deferred to a future phase per a real-time human scope decision).
- A live re-run of `scripts/introspect-schema.js` during this verification confirms all narrow-scope objects genuinely exist in prod, corroborating that the ground-truth capture in plan 01 was not fabricated.

The one item not independently re-verifiable is the fresh-project bootstrap execution itself, since the throwaway test project was disposable by design — this is scored as verified based on the specificity and internal consistency of the 19-03-SUMMARY.md narrative (distinct truncation failure modes, precise missing-column diagnosis matching the subsequent patch commit), not blindly trusted, and is flagged above as an optional human re-confirmation rather than a gap.

---

*Verified: 2026-07-09T14:00:00Z*
*Verifier: Claude (gsd-verifier)*
