---
phase: 20
slug: introspection-corr-lation-d-origine
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None formal (no Jest/pytest config) — custom Node scripts run directly, same convention as Phase 19 |
| **Config file** | none — `package.json`'s `"test"` script is `node test-api.js` |
| **Quick run command** | N/A — this phase is investigation-only, produces no application code changes |
| **Full suite command** | `node test-api.js` (existing smoke suite) — only relevant as a regression check if this phase's work touches runtime code, which it should not |
| **Estimated runtime** | N/A |

---

## Sampling Rate

- **After every task commit:** N/A — no code diff to verify; each task's output is a captured findings artifact
- **After every plan wave:** Re-run `node scripts/introspect-schema.js` once at the start of execution to catch any further live drift since the 2026-07-09 research before finalizing the SCHEMA-02 deliverable
- **Before `/gsd:verify-work`:** All 38 target columns (5 `garages` + 5 `clients` + 4 `interventions` + 24 `devis`) accounted for in the final artifact — either fully resolved (type+constraints+origin) or explicitly flagged "origin undetermined, ghost column"
- **Max feedback latency:** N/A (no automated test loop for this phase)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | SCHEMA-02 | manual (query-and-record) | none — record `information_schema.columns`/`pg_constraint` query output verbatim into the plan's findings artifact | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | SCHEMA-03 | manual (git-log-S sweep + review) | none — `git log -S<column>` per remaining unsampled column, results recorded in findings artifact | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No automated script yet runs the `information_schema.columns`/`pg_constraint` queries — the plan should either paste-and-record via Supabase Dashboard SQL Editor (cheap, matches Phase 19 plan 01 precedent) or add a `--detail <table>` mode to `scripts/introspect-schema.js` using a direct `pg` connection if repeatability is wanted.
- [ ] No automated script yet finishes the git-log-S sweep for the ~9 `devis` columns not individually isolated in the Phase 20 research (`notes`, `cree_par`, `client_id`, and others) — the plan should either sample them manually (fast, sub-second per query) or write a small throwaway Node/bash loop.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Exact type/nullability/constraint capture for all 38 columns | SCHEMA-02 | No pass/fail assertion exists for "did we capture the right metadata" — it's a recording task, not a test | Run the `information_schema.columns`/`pg_constraint` queries from 20-RESEARCH.md's Code Examples against prod (Dashboard SQL Editor or direct `pg` connection); record verbatim output per column in the plan's deliverable |
| Origin correlation per column | SCHEMA-03 | Disambiguation (e.g. shared column names across unrelated tables/commits) inherently requires human/Claude judgment reading each diff, not just string matching | For each of the 9 remaining un-sampled `devis` columns, run `git log -S<column> --oneline -- .`, inspect candidate commits with `git show`, record commit hash + date + message or "undetermined" if no hit |
| Confirm `garages`/`interventions` ghost-column semantic inference | SCHEMA-03 | Research flagged 9 columns as LOW confidence semantic guesses (never read/written by any code path) — needs Mehdi's confirmation, not a code-verifiable check | Present the 9 ghost columns (garages: ville/cp/type/marque_officielle/actif; interventions: niveau_preuve/facture_id/operation_code/photo_url) and the research's inferred intent to Mehdi for confirm-or-correct before Phase 21 cites them as fact in migration comments |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — this phase's tasks are explicitly manual-only per the table above, no automated verify claimed
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — N/A, phase has no automated verification track (investigation-only, documented above)
- [x] Wave 0 covers all MISSING references — both gaps (metadata query script, git-log-S sweep completion) listed above
- [x] No watch-mode flags — N/A, no test runner used
- [x] Feedback latency < N/A — no automated feedback loop for this phase
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
