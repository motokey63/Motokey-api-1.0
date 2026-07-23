---
phase: 22
slug: v-rification-bootstrap-nettoyage-header
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-10
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None formal (no Jest/pytest config) — custom Node scripts run directly |
| **Config file** | none — `package.json`'s `"test"` script is `node test-api.js` |
| **Quick run command** | `node scripts/introspect-schema.js` (default mode, no args — sanity check against prod) |
| **Full suite command** | `node scripts/introspect-schema.js --compare <FRESH_URL> <FRESH_KEY>` (after `EXPECTED_TABLES` edit) |
| **Estimated runtime** | ~5-10 seconds per run |

---

## Sampling Rate

- **After every task commit:** Each task's own `<verify>` step (bootstrap success / compare exit 0 / grep count) is the check — this phase is verification + a documentation edit, not incremental feature code.
- **After every plan wave:** Re-confirm `node scripts/introspect-schema.js` (default mode, no args) still passes against prod, to catch any further live drift introduced mid-phase.
- **Before `/gsd:verify-work`:** Full manual bootstrap-and-compare against the fresh project (human + scripted) must be green.
- **Max feedback latency:** ~10 seconds (script runtime).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | SCHEMA-07 | scripted (Wave 0) | `node scripts/introspect-schema.js` (EXPECTED_TABLES edit) | ⚠️ Partially exists — needs 5 Gap B names added | ⬜ pending |
| 22-0X-0X | TBD | TBD | SCHEMA-07 | manual (human-action-gated) + scripted | one-off bootstrap script against Mehdi-provided fresh-project connection string | ❌ Wave 0 — no reusable script exists yet | ⬜ pending |
| 22-0X-0X | TBD | TBD | SCHEMA-07 | scripted | `node scripts/introspect-schema.js --compare <FRESH_URL> <FRESH_KEY>` | ⚠️ Depends on EXPECTED_TABLES edit above | ⬜ pending |
| 22-0X-0X | TBD | TBD | SCHEMA-07 | textual | `grep -n "Non couvert ici\|non corrigés car hors du périmètre" schema.sql` returns 0 | N/A — textual check | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/introspect-schema.js` — `EXPECTED_TABLES` array needs the 5 Gap B object names added (`billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto`, `v_motos_avec_proprietaire`) — required before the compare mode can validate SCHEMA-07's success criterion 2.
- [ ] A committed or scratchpad one-off script performing the direct-`pg`-connection bootstrap against a fresh Supabase project — Phase 19's equivalent was ad-hoc and not committed; author a small script for this phase (planner's choice on location — `scripts/` for future re-runnability, or scratchpad if one-shot).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Creation of a genuinely fresh Supabase project + obtaining its Postgres connection string | SCHEMA-07 | Requires a human action (Mehdi creating a project in the Supabase Dashboard and supplying credentials) — cannot be automated from this environment | Mehdi creates a new free-tier Supabase project, provides the direct Postgres connection string (or the pooler URL) to the executor via `.env` or a one-off input; executor runs schema.sql against it using the `pg` package (already in `node_modules`, reused from Phase 19) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
