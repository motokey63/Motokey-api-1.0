---
phase: 19
slug: schema-sql-regeneration
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-08
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None formal (no Jest/pytest/Mocha config) — custom Node scripts run directly |
| **Config file** | none — `package.json`'s `"test"` script is `node test-api.js` |
| **Quick run command** | `node scripts/introspect-schema.js` (live PostgREST OpenAPI introspection against prod) |
| **Full suite command** | `node scripts/introspect-schema.js && node scripts/introspect-schema.js --compare <FRESH_URL> <FRESH_KEY>` |
| **Estimated runtime** | ~5-10 seconds per introspection call (network-bound, single HTTP GET) |

---

## Sampling Rate

- **After every task commit:** Run `node scripts/introspect-schema.js` where applicable (19-01 Task 1, 19-03 Task 2); grep-based `<automated>` verify for schema.sql edits (19-02 Task 1/2, 19-03 Task 3)
- **After every plan wave:** Re-run introspection to catch further live drift (per 19-RESEARCH.md's 7-day shelf-life warning)
- **Before `/gsd:verify-work`:** Full bootstrap (19-03 Task 1) + compare-mode diff (19-03 Task 2) must both be clean
- **Max feedback latency:** ~10 seconds for automated tasks; human-action tasks (19-01 Task 2, 19-03 Task 1) are inherently latency-unbounded but are the only correct source for their respective facts (no automatable alternative exists per Pitfall 4)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | SCHEMA-01 | integration (live introspection) | `node scripts/introspect-schema.js` | ✅ | ⬜ pending |
| 19-01-02 | 01 | 1 | SCHEMA-01 | manual (read-only Dashboard SQL query) | N/A — checkpoint:human-action, no automatable alternative (PostgREST OpenAPI doesn't expose CHECK/RLS text) | ✅ documented in plan | ⬜ pending |
| 19-02-01 | 02 | 2 | SCHEMA-01 | static (grep) | `grep -c "CREATE TABLE garage_users" schema.sql && grep -c "CREATE TABLE client_device_tokens" schema.sql && grep -c "CREATE TABLE push_send_log" schema.sql` | ✅ | ⬜ pending |
| 19-02-02 | 02 | 2 | SCHEMA-01 | static (grep) | `grep -c "last_maintenance_tier_notified" schema.sql && grep -c "clients_email_garage_id_key" schema.sql && grep -c "CREATE TYPE statut_devis" schema.sql && grep -c "BOOTSTRAP PARTIEL" schema.sql` | ✅ | ⬜ pending |
| 19-03-01 | 03 | 3 | SCHEMA-01 | manual (fresh Supabase project bootstrap) | N/A — checkpoint:human-action, no local Postgres/Docker/psql/CLI available in this environment (confirmed absent in 19-RESEARCH.md) | ✅ documented in plan | ⬜ pending |
| 19-03-02 | 03 | 3 | SCHEMA-01 | integration (live diff) | `node scripts/introspect-schema.js --compare <FRESH_URL> <FRESH_KEY>` | ✅ | ⬜ pending |
| 19-03-03 | 03 | 3 | SCHEMA-01 | conditional static (grep) | `node --check scripts/introspect-schema.js; grep -c "CREATE TABLE garages" schema.sql` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `scripts/introspect-schema.js` — authored as part of 19-01 Task 1 itself (not a separate pre-wave), serving double duty as both the phase's own verification tooling and the artifact ROADMAP/RESEARCH flagged as the Wave 0 gap ("no script exists yet to diff fresh-bootstrapped project against prod"). No separate framework install needed — uses Node's built-in `fetch` and the already-installed `dotenv`.

*No additional Wave 0 infrastructure needed — this phase's only "test framework" is the introspection script it builds as its first task.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Verbatim `devis.statut` CHECK constraint + RLS state of 3 new tables | SCHEMA-01 | PostgREST's OpenAPI introspection endpoint does not expose CHECK constraint text, RLS policies, indexes, triggers, or view definitions — only `pg_catalog`/`information_schema` via direct SQL access has this, and no local `psql`/CLI/Postgres connection exists in this environment | Run the 3 read-only `pg_catalog` queries in 19-01 Task 2 via Supabase Dashboard SQL Editor (same mechanism already used for migrations 10-19); paste verbatim output into the plan SUMMARY |
| `schema.sql` bootstraps a genuinely empty Postgres with no errors | SCHEMA-01 | No local Postgres, Docker, `psql`, `pg_dump`, or Supabase CLI is installed in this environment (confirmed absent); Supabase project creation itself requires Dashboard/Management API access not available to automation here | Create a fresh free-tier Supabase project, paste-run `schema.sql` in its SQL Editor, report clean success or exact SQL error text (19-03 Task 1) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a documented, justified human-action checkpoint (no silent gaps)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (both human-action tasks are immediately followed by an automated task: 19-01-02 → 19-02-01 auto; 19-03-01 → 19-03-02 auto)
- [x] Wave 0 covers all MISSING references (introspection script authored in-phase, first task)
- [x] No watch-mode flags (all commands are single-shot: grep, node --check, one-off fetch calls)
- [x] Feedback latency < 10s for all automated checks
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-08
