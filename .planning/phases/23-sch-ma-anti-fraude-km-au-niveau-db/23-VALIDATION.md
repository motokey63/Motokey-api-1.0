---
phase: 23
slug: sch-ma-anti-fraude-km-au-niveau-db
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-14
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — this codebase has no automated test framework (confirmed via `package.json`: only `"test": "node test-api.js"`, a hand-rolled HTTP smoke-test script). Consistent with project convention: hand-rolled Node scripts against `pg`/`http`, no Jest/Mocha to introduce for this phase alone. |
| **Config file** | none — see Wave 0 |
| **Quick run command** | Direct `pg`-based script exercising the trigger against a throwaway/test DB (no HTTP layer exists this phase — no endpoints created yet) |
| **Full suite command** | `node scripts/bootstrap-fresh-schema.js` (clean bootstrap against a throwaway Supabase project) + `node scripts/test-releves-km-trigger.js` (new, Wave 0) |
| **Estimated runtime** | ~15-30 seconds (bootstrap script + trigger test script, both single-connection `pg` scripts) |

---

## Sampling Rate

- **After every task commit:** Run the relevant slice of `scripts/test-releves-km-trigger.js` (or a direct `psql`/`pg` ad hoc check) for the specific trigger/function behavior just written.
- **After every plan wave:** Run `node scripts/bootstrap-fresh-schema.js` against the throwaway project (requires `FRESH_DB_URL` in `.env` — human checkpoint, same as Phase 22's precedent).
- **Before `/gsd:verify-work`:** Full suite green — bootstrap clean, trigger-verification script green, `pg_policies` reviewed for the 3 new tables showing zero policies (intentional, per D-01).
- **Max feedback latency:** ~30 seconds (single-connection Node/pg scripts, no build step).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-0N | 01 | 0 | (infra) | script creation | `node --check scripts/test-releves-km-trigger.js` | ❌ W0 | ⬜ pending |
| 23-0N-0N | TBD | 1 | KM-01 | DB-level (trigger) | `node scripts/test-releves-km-trigger.js --case=reject-regression` | ❌ W0 | ⬜ pending |
| 23-0N-0N | TBD | 1 | KM-01 | DB-level (trigger, NULL-safe baseline) | `node scripts/test-releves-km-trigger.js --case=null-safe-baseline` | ❌ W0 | ⬜ pending |
| 23-0N-0N | TBD | 1 | KM-01 | DB-level (remplacement_compteur bypass) | `node scripts/test-releves-km-trigger.js --case=counter-replacement-bypass` | ❌ W0 | ⬜ pending |
| 23-0N-0N | TBD | 1-2 | KM-04 | Integration (direct `supabase.js` calls, no HTTP yet) | Node script calling `Motos.update()`, `Interventions.create()`, `OrdresReparation.cloturer()` directly against throwaway DB, asserting `km` never lands on `motos` except via the shared validated path | ❌ W0 | ⬜ pending |
| 23-0N-0N | TBD | 1 | CONSO-02 | DB-level (CHECK constraint) | Attempt `INSERT ... type_consommable='invalide'`, assert Postgres `23514` check_violation; attempt each of the 9 valid types, assert success | ❌ W0 | ⬜ pending |
| 23-0N-0N | TBD | final | (all) | Full bootstrap | `node scripts/bootstrap-fresh-schema.js` against throwaway project — prints `SCHEMA_BOOTSTRAP_OK` | ✅ (existing, Phase 22) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Exact task IDs/plan numbers filled in by gsd-planner — this map is a template the planner's task breakdown must satisfy, not a final assignment.*

---

## Wave 0 Requirements

- [ ] `scripts/test-releves-km-trigger.js` — new, mirrors `scripts/bootstrap-fresh-schema.js`'s direct `pg` connection style. Must cover: (a) normal accepted reading updates `motos.km`, (b) rejected regression is cancelled + a rejection-log row is inserted (per D-04's full content: moto_id/garage_id/acteur/km tenté/km actuel/timestamp), (c) NULL-safe first-reading-for-existing-moto case (a moto with a pre-existing `motos.km` and zero prior `releves_km` rows must still reject a lower first reading — this is the default state for every current prod moto, not an edge case), (d) `type_evenement = 'remplacement_compteur'` bypass accepts a lower value and starts a fresh monotonic chain.
- [ ] `FRESH_DB_URL` in `.env` — human checkpoint (Mehdi creates a disposable Supabase project), same precedent as Phase 22. Confirmed absent from `.env` as of this research pass — must be requested before the bootstrap-verification gate can run.
- [ ] No framework install needed — hand-rolled `pg` scripts are the established, sufficient convention for this codebase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `pg_policies` review for 3 new tables (0 rows expected, per D-01) | (schema hygiene, supports KM-01/KM-04/CONSO-02 correctness) | Reviewing "intentional absence of policies" is a human judgment call reading `pg_policies` output, not a pass/fail script assertion | Query `SELECT * FROM pg_policies WHERE tablename IN ('consommables','photos_consommables','releves_km')` against the throwaway project after bootstrap; confirm 0 rows and that the migration file's explanatory comment (mirroring `schema.sql` L689-702) is present |
| `schema.sql` same-commit parity with the new migration file(s) | (Anti-Pattern 2 discipline, this project's core v1.5 lesson) | Requires a human/diff-review judgment that the migration and `schema.sql` are byte-equivalent in the relevant sections, not a scriptable assertion | Diff the new `CREATE TABLE`/trigger blocks in `sql/migrations/23_*.sql` against the corresponding hand-appended section in `schema.sql` before considering the phase done |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`scripts/test-releves-km-trigger.js`, `FRESH_DB_URL`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
