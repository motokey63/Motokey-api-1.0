---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Résolution dérive schema.sql
status: executing
stopped_at: Completed 22-03-PLAN.md — schema.sql header rewritten (Gap A/B RÉSOLU), PROJECT.md Known Gaps closed, SCHEMA-07 fully satisfied, Phase 22 complete
last_updated: "2026-07-11T20:54:32.226Z"
last_activity: 2026-07-11
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 9
  completed_plans: 9
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-09)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Phase 22 — v-rification-bootstrap-nettoyage-header

## Current Position

Phase: 22
Plan: 3 of 3 in current phase
Status: Ready to execute
Last activity: 2026-07-11

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
| Next action | `/gsd:execute-phase 22` (Wave 2: plan 22-02, human-action checkpoint) |
| Phase 20 P01 | 20min | 2 tasks | 2 files |
| Phase 20 P02 | 15min | 2 tasks | 1 files |
| Phase 22 P01 | 15min | 2 tasks | 2 files |
| Phase 22 P02 | 20min | 2 tasks | 1 files |
| Phase 22 P03 | 5min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Décisions complètes et à jour dans `.planning/PROJECT.md` (Key Decisions table) — historique détaillé de v1.4 archivé dans `.planning/milestones/v1.4-phases/` et `.planning/RETROSPECTIVE.md`.

v1.5 phase split rationale: Phase 20 (SCHEMA-02/03, investigation — must precede any migration writing), Phase 21 (SCHEMA-04/05/06, retroactive migrations for Gap A + trivial Gap B addition from existing migration 13/15 DDL), Phase 22 (SCHEMA-07, bootstrap verification + header cleanup, mirrors Phase 19's closing verification step).

- [Phase 20-01]: clients cluster fully resolved via migrations/04-rbac-migration.sql @ c66ad69, no further Postgres/git work needed
- [Phase 20-01]: 9 garages/interventions columns confirmed ghost columns (zero code trail + architecturally unreachable via allowlist/payload) — awaiting Mehdi confirmation in plan 02
- [Phase 20-01]: 25 devis columns classified as code-catch-up (b29d4f5/f2d7d9a) not true origin — true DB origin flagged earlier/unknown, undocumented Dashboard ALTER
- [Phase 20]: ville/cp CONFIRMED as unwired address-split feature (real prod data + Mehdi confirmation); 7 remaining ghost columns terminal INCONNU/OUBLIÉ verdict — origin exhausted via git (20-01) and Mehdi (20-02), not to be re-questioned
- [Phase 22-01]: introspect-schema.js EXPECTED_TABLES extended to 18 entries (5 Gap B objects added) and a committed scripts/bootstrap-fresh-schema.js authored — both prerequisites for 22-02's human-gated fresh-project bootstrap verification (SCHEMA-07)
- [Phase 22]: [Phase 22-02]: introspect-schema.js --compare could not reach the fresh Supabase project (new sb_publishable_/sb_secret_ key format blocks PostgREST root OpenAPI discovery for non-secret keys) — worked around with a throwaway direct-pg/information_schema comparison, fresh bootstrap confirmed to match prod on all 18 expected tables/objects
- [Phase 22]: [Phase 22-02]: Fixed real schema drift found during bootstrap verification — prod's billing_events had a created_at column absent from schema.sql/migration 15 with no git trace; added to schema.sql documented as origine indéterminée, matching Phase 20/21 convention
- [Phase 22]: [Phase 22-03]: schema.sql header rewritten (Gap A/B marked RÉSOLU with pointers to Phase 21 migrations, ~19-table out-of-scope boundary preserved verbatim) and PROJECT.md Known Gaps closed the matching bullet — SCHEMA-07 fully satisfied (all 4 criteria), Phase 22 and v1.5's core schema-drift-cleanup scope complete

### Pending Todos

- **MSTORE-02** — soumission TestFlight/Play Store réelle, bloquée sur création de comptes développeur payants par Mehdi. Voir `.planning/PROJECT.md` Known Gaps.
- **Phase 8 / BILL-06** — Stripe live mode, bloqué sur action humaine Stripe Dashboard.

### Blockers/Concerns

- Aucun blocage actif sur le code v1.5. Phase 8 et MSTORE-02 restent des known gaps externes non touchés par ce milestone (pure dette d'ingénierie schema.sql).

## Session Continuity

Last session: 2026-07-11T20:54:32.223Z
Stopped at: Completed 22-03-PLAN.md — schema.sql header rewritten (Gap A/B RÉSOLU), PROJECT.md Known Gaps closed, SCHEMA-07 fully satisfied, Phase 22 complete
