---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Maintenance — CLIENT Fixture & Schema Drift
status: verifying
stopped_at: Completed 18-01-PLAN.md — CLIENT login fixture fixed and verified, migration 19 applied prod
last_updated: "2026-07-08T20:21:09.169Z"
last_activity: 2026-07-08
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-08)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Phase 18 — CLIENT Login Fixture Fix

## Current Position

Phase: 18 (CLIENT Login Fixture Fix) — COMPLETE
Plan: 1 of 1
Status: Phase complete — ready for verification
Last activity: 2026-07-08

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 [░░░░░░░░░░] IN PROGRESS — Phase 18 (CFIX-01) + Phase 19 (SCHEMA-01) ready to plan
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 4 (v1.0 + v1.1 + v1.2 + v1.3) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3) — both blocked on Mehdi's external account/dashboard actions, not code |
| Next action | `/gsd:plan-phase 19` |
| Phase 18 P01 | 35min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Décisions complètes et à jour dans `.planning/PROJECT.md` (Key Decisions table) — cette section ne duplique plus l'historique détaillé par phase, archivé dans `.planning/milestones/v1.3-phases/` et `.planning/RETROSPECTIVE.md`.

- v1.4 roadmap: Phase 18 and Phase 19 kept as two independent single-requirement phases (no shared files, no dependency) rather than merged into one phase — cleaner success-criteria isolation for a pure maintenance milestone.
- [Phase 18]: Resolved missing Auth-user id on re-seeded environments via listUsers() paging fallback (findAuthUserIdByEmail), since createUser returns null data on already-registered
- [Phase 18]: Added migration 19 (UNIQUE(email, garage_id) on clients) rather than reworking the upsert, matching the semantics the existing onConflict code already assumed

### Pending Todos

- **MSTORE-02** — soumission TestFlight/Play Store réelle, bloquée sur création de comptes développeur payants par Mehdi. Voir `.planning/PROJECT.md` Known Gaps.
- **Phase 8 / BILL-06** — Stripe live mode, bloqué sur action humaine Stripe Dashboard. Indépendant de v1.3/v1.4.

### Blockers/Concerns

- Aucun blocage actif sur le code. Les deux known gaps historiques (Phase 8, MSTORE-02) attendent tous les deux une action externe de Mehdi (Stripe Dashboard live mode, création de comptes développeur payants), pas du travail d'ingénierie.
- Phases 18 et 19 de v1.4 n'ont aucun blocage connu — travail d'ingénierie pur, fichiers isolés (`setup-supabase.js` / `schema.sql`).
- ~~Phase 18: migration SQL requise (sql/migrations/19_clients_email_garage_unique.sql)~~ → **RÉSOLU 2026-07-08** : migration appliquée par Mehdi via Supabase Dashboard SQL Editor, confirmée programmatiquement (re-run setup-supabase.js sans ⚠️, `/auth/client/login` → 200 avec session, `/auth/login` role:client → 200, test-api.js 9/9 dont `✅ Login client`). Phase 18 complète, CFIX-01 validé.

## Session Continuity

Last session: 2026-07-08T20:21:09.166Z
Stopped at: Completed 18-01-PLAN.md — CLIENT login fixture fixed and verified, migration 19 applied prod
