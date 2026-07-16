---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Édition devis brouillon
status: planning
stopped_at: v1.7 roadmap created — Phase 29 ready to plan
last_updated: "2026-07-16T00:00:00.000Z"
last_activity: 2026-07-16
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** v1.7 Édition devis brouillon — Phase 29 (frontend only)

## Current Position

Phase: 29 of 29 (Édition Devis Brouillon)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-07-16 — ROADMAP.md created for v1.7, coverage 4/4 requirements mapped to Phase 29

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 ████████████ SHIPPED 2026-07-09 (undocumented schema drift known gap — carried forward)
v1.5 ████████████ SHIPPED 2026-07-11 (Gap A/B schema.sql drift fully resolved, SCHEMA-02→07)
v1.6 ████████████ SHIPPED 2026-07-16 (schéma+anti-fraude km, helpers+stub vision, endpoints backend+Cloudinary, cron rappel, UI web garage+client, UI mobile lecture seule) — 6/6 phases, 21/21 plans, 17/17 requirements
v1.7 [░░░░░░░░░░] 0% — Phase 29 (Édition Devis Brouillon) not started
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 7 (v1.0 + v1.1 + v1.2 + v1.3 + v1.4 + v1.5 + v1.6) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3), Cloudinary credentials (since Phase 25) — blocked on Mehdi's external account/dashboard actions |
| Next action | Run `/gsd:plan-phase 29` — single-phase milestone, frontend-only scope in `app.html` |

Per-plan timing history for v1.6 archived in `.planning/milestones/v1.6-phases/*/*-SUMMARY.md`.

## Accumulated Context

### Decisions

Décisions complètes et à jour dans `.planning/PROJECT.md` (Key Decisions table) — historique détaillé de v1.6 archivé dans `.planning/milestones/v1.6-ROADMAP.md`, `.planning/milestones/v1.6-phases/`, et `.planning/RETROSPECTIVE.md`.

v1.7 scope decision (2026-07-16): Phase 29 reuses the existing "Créer un devis" form (`saveDevis()`, `renderDevisLines()`, `addDevisLine()`, global `devisLines` array) toggled into an edit mode, rather than building a separate edit screen — explicit user decision, no backend work needed (`PUT /devis/:id` and `SBLayer.Devis.update()` already support editing `lignes` + `entete.remise_pct` while `statut === 'brouillon'`).

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 8/BILL-06 (Stripe live mode) et MSTORE-02 (store submission) restent des known gaps externes, bloqués sur des actions humaines Mehdi (Stripe Dashboard, comptes développeur payants).
- **Credentials Cloudinary toujours absents** (`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, ni `.env` local ni Railway `motokey1.1`) — endpoints renvoient 503 `CLOUDINARY_NOT_CONFIGURED` (comportement voulu, jamais de placeholder). Une fois provisionné : re-jouer `node tests/test-km-photos-cloudinary.js`.
- Migration `sql/migrations/25_migrate_pneus_to_consommables.sql` reste à appliquer manuellement en prod par Mehdi (Supabase Dashboard → SQL Editor) — jusque-là, `has_data:false` pour pneu_av/pneu_ar sur les motos dont les seules données pneus vivent encore dans les colonnes legacy `motos.pneu_av`/`motos.pneu_ar`.
- Ce repo a `.planning/` gitignored avec force-add individuel des fichiers — si `gsd-tools.cjs commit` signale `skipped_commit_docs_false`, force-add et committer directement avec git plutôt que de bloquer.
- DEVIS-05 (suppression complète d'un devis brouillon) explicitement différé v2 — hors scope de Phase 29.

## Session Continuity

Last session: 2026-07-16T00:00:00.000Z
Stopped at: ROADMAP.md and STATE.md written for v1.7, REQUIREMENTS.md traceability updated — awaiting user approval / `/gsd:plan-phase 29`
