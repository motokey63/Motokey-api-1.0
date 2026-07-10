---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Résolution dérive schema.sql
status: executing
stopped_at: Session resumed, proceeding to execute Phase 21 (4 plans, waves 1-3)
last_updated: "2026-07-10T13:15:16.127Z"
last_activity: 2026-07-10
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 6
  completed_plans: 5
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-09)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Phase 21 — migrations-r-troactives-mise-jour-schema-sql

## Current Position

Phase: 21 (migrations-r-troactives-mise-jour-schema-sql) — EXECUTING
Plan: 4 of 4
Status: Ready to execute
Last activity: 2026-07-10

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 ████████████ SHIPPED 2026-07-09 (undocumented schema drift known gap — carried forward)
v1.5 [░░░░░░░░░░] 0% (Phases 20-22 not started)
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 5 (v1.0 + v1.1 + v1.2 + v1.3 + v1.4) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3) — both blocked on Mehdi's external account/dashboard actions, not addressed by v1.5 |
| Next action | `/gsd:execute-phase 20` (Wave 2: plan 20-02) |
| Phase 20 P01 | 20min | 2 tasks | 2 files |
| Phase 20 P02 | 15min | 2 tasks | 1 files |

## Accumulated Context

### Decisions

Décisions complètes et à jour dans `.planning/PROJECT.md` (Key Decisions table) — historique détaillé de v1.4 archivé dans `.planning/milestones/v1.4-phases/` et `.planning/RETROSPECTIVE.md`.

v1.5 phase split rationale: Phase 20 (SCHEMA-02/03, investigation — must precede any migration writing), Phase 21 (SCHEMA-04/05/06, retroactive migrations for Gap A + trivial Gap B addition from existing migration 13/15 DDL), Phase 22 (SCHEMA-07, bootstrap verification + header cleanup, mirrors Phase 19's closing verification step).

- [Phase 20-01]: clients cluster fully resolved via migrations/04-rbac-migration.sql @ c66ad69, no further Postgres/git work needed
- [Phase 20-01]: 9 garages/interventions columns confirmed ghost columns (zero code trail + architecturally unreachable via allowlist/payload) — awaiting Mehdi confirmation in plan 02
- [Phase 20-01]: 25 devis columns classified as code-catch-up (b29d4f5/f2d7d9a) not true origin — true DB origin flagged earlier/unknown, undocumented Dashboard ALTER
- [Phase 20]: ville/cp CONFIRMED as unwired address-split feature (real prod data + Mehdi confirmation); 7 remaining ghost columns terminal INCONNU/OUBLIÉ verdict — origin exhausted via git (20-01) and Mehdi (20-02), not to be re-questioned

### Pending Todos

- **MSTORE-02** — soumission TestFlight/Play Store réelle, bloquée sur création de comptes développeur payants par Mehdi. Voir `.planning/PROJECT.md` Known Gaps.
- **Phase 8 / BILL-06** — Stripe live mode, bloqué sur action humaine Stripe Dashboard.

### Blockers/Concerns

- Aucun blocage actif sur le code v1.5. Phase 8 et MSTORE-02 restent des known gaps externes non touchés par ce milestone (pure dette d'ingénierie schema.sql).

## Session Continuity

Last session: 2026-07-10
Stopped at: Session resumed, proceeding to execute Phase 21 (4 plans, waves 1-3)
