---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Suivi usure consommables + anti-fraude km
status: idle
stopped_at: Milestone v1.6 started — defining requirements
last_updated: "2026-07-13T00:00:00.000Z"
last_activity: 2026-07-13
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Milestone v1.6 (Suivi usure consommables + anti-fraude km) — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-07-13 — Milestone v1.6 started

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 ████████████ SHIPPED 2026-07-09 (undocumented schema drift known gap — carried forward)
v1.5 ████████████ SHIPPED 2026-07-11 (Gap A/B schema.sql drift fully resolved, SCHEMA-02→07)
v1.6 [░░░░░░░░░░] IN PROGRESS — defining requirements
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 6 (v1.0 + v1.1 + v1.2 + v1.3 + v1.4 + v1.5) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3) — both blocked on Mehdi's external account/dashboard actions |
| Next action | `/gsd:plan-phase 1` (or `/gsd:discuss-phase 1` first) once v1.6 roadmap is created |

## Accumulated Context

### Decisions

Décisions complètes et à jour dans `.planning/PROJECT.md` (Key Decisions table) — historique détaillé de v1.5 archivé dans `.planning/milestones/v1.5-ROADMAP.md`, `.planning/milestones/v1.5-MILESTONE-AUDIT.md`, et `.planning/RETROSPECTIVE.md`.

v1.6 scope decisions (2026-07-13, gathered via `/gsd:new-milestone`):
- Schéma consommables/photos_consommables/releves_km conçu extensible mais liste v1 = 9 types donnés (pneu_av/ar, chaîne, plaquettes_av/ar, disque_av/ar, huile_moteur, liquide_frein)
- Changement de compteur (nouveau totaliseur) réservé PRO+ (PRO/CONCESSION/ADMIN) — jamais MECANO, jamais CLIENT
- Relevés km normaux et photos consommables ouverts à CLIENT + GARAGE
- Stub IA minimal réaliste (% usure + état + confiance) — pas de vrai appel Anthropic ce milestone
- Rappel de photo : push mobile (infra MPUSH existante) + badge visuel garage
- Cloudinary et clé Anthropic : câblage différé à la toute fin, points de branchement propres à prévoir

### Pending Todos

- **MSTORE-02** — soumission TestFlight/Play Store réelle, bloquée sur création de comptes développeur payants par Mehdi. Voir `.planning/PROJECT.md` Known Gaps.
- **Phase 8 / BILL-06** — Stripe live mode, bloqué sur action humaine Stripe Dashboard.
- **Tech debt from v1.5** (non-blocking, see `.planning/milestones/v1.5-MILESTONE-AUDIT.md`): niveau_preuve CHECK not applied in migration 21's own DDL, billing_events.created_at not backported to migration 15, no README/.env.example for the new bootstrap-verification chain.

### Blockers/Concerns

- Aucun blocage actif. Phase 8 et MSTORE-02 restent des known gaps externes. v1.6 n'a pas de blocage identifié — Cloudinary/Anthropic sont volontairement stubbés, pas un blocage de scope.

## Session Continuity

Last session: 2026-07-13T00:00:00.000Z
Stopped at: Milestone v1.6 started — PROJECT.md updated, requirements gathering next
