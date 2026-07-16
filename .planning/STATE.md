---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Suivi usure consommables + anti-fraude km
status: planning
stopped_at: v1.6 milestone shipped, archived to milestones/v1.6-*
last_updated: "2026-07-16T11:13:29.483Z"
last_activity: 2026-07-16
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 21
  completed_plans: 21
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Planning next milestone (v1.6 shipped 2026-07-16)

## Current Position

Milestone: v1.6 shipped — awaiting /gsd:new-milestone
Plan: Not started
Status: Between milestones
Last activity: 2026-07-16

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 ████████████ SHIPPED 2026-07-09 (undocumented schema drift known gap — carried forward)
v1.5 ████████████ SHIPPED 2026-07-11 (Gap A/B schema.sql drift fully resolved, SCHEMA-02→07)
v1.6 ████████████ SHIPPED 2026-07-16 (schéma+anti-fraude km, helpers+stub vision, endpoints backend+Cloudinary, cron rappel, UI web garage+client, UI mobile lecture seule) — 6/6 phases, 21/21 plans, 17/17 requirements
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 7 (v1.0 + v1.1 + v1.2 + v1.3 + v1.4 + v1.5 + v1.6) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3), Cloudinary credentials (since Phase 25) — blocked on Mehdi's external account/dashboard actions |
| Next action | v1.6 shipped 2026-07-16 — run `/gsd:new-milestone` to start the next milestone. |

Per-plan timing history for v1.6 archived in `.planning/milestones/v1.6-phases/*/*-SUMMARY.md`.

## Accumulated Context

### Decisions

Décisions complètes et à jour dans `.planning/PROJECT.md` (Key Decisions table) — historique détaillé de v1.6 archivé dans `.planning/milestones/v1.6-ROADMAP.md`, `.planning/milestones/v1.6-phases/`, et `.planning/RETROSPECTIVE.md`.

### Blockers/Concerns

- Phase 8/BILL-06 (Stripe live mode) et MSTORE-02 (store submission) restent des known gaps externes, bloqués sur des actions humaines Mehdi (Stripe Dashboard, comptes développeur payants).
- **Credentials Cloudinary toujours absents** (`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, ni `.env` local ni Railway `motokey1.1`) — endpoints renvoient 503 `CLOUDINARY_NOT_CONFIGURED` (comportement voulu, jamais de placeholder). Une fois provisionné : re-jouer `node tests/test-km-photos-cloudinary.js`.
- Migration `sql/migrations/25_migrate_pneus_to_consommables.sql` reste à appliquer manuellement en prod par Mehdi (Supabase Dashboard → SQL Editor) — jusque-là, `has_data:false` pour pneu_av/pneu_ar sur les motos dont les seules données pneus vivent encore dans les colonnes legacy `motos.pneu_av`/`motos.pneu_ar`.
- Ce repo a `.planning/` gitignored avec force-add individuel des fichiers — si `gsd-tools.cjs commit` signale `skipped_commit_docs_false`, force-add et committer directement avec git plutôt que de bloquer.

## Session Continuity

Last session: 2026-07-16T13:09:22.000Z
Stopped at: v1.6 milestone shipped, archived, tag pending
