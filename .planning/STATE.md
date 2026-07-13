---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Suivi usure consommables + anti-fraude km
status: planning
stopped_at: Phase 23 context gathered
last_updated: "2026-07-13T23:12:57.520Z"
last_activity: 2026-07-14 — ROADMAP.md created, 17/17 requirements mapped across Phases 23-28 (Phase 28 mobile gauges added after correcting an initial scoping gap)
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Milestone v1.6 (Suivi usure consommables + anti-fraude km) — Phase 23 (Schéma + Anti-Fraude km au niveau DB) ready to plan

## Current Position

Phase: 23 of 28 (Schéma + Anti-Fraude km au niveau DB)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-07-14 — ROADMAP.md created, 17/17 requirements mapped across Phases 23-28 (Phase 28 mobile gauges added after correcting an initial scoping gap)

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 ████████████ SHIPPED 2026-07-09 (undocumented schema drift known gap — carried forward)
v1.5 ████████████ SHIPPED 2026-07-11 (Gap A/B schema.sql drift fully resolved, SCHEMA-02→07)
v1.6 [░░░░░░░░░░] IN PROGRESS — Phase 23 ready to plan
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 6 (v1.0 + v1.1 + v1.2 + v1.3 + v1.4 + v1.5) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3) — both blocked on Mehdi's external account/dashboard actions |
| Next action | `/gsd:plan-phase 23` (or `/gsd:discuss-phase 23` first) |

## Accumulated Context

### Decisions

Décisions complètes et à jour dans `.planning/PROJECT.md` (Key Decisions table) — historique détaillé de v1.5 archivé dans `.planning/milestones/v1.5-ROADMAP.md`, `.planning/milestones/v1.5-MILESTONE-AUDIT.md`, et `.planning/RETROSPECTIVE.md`.

v1.6 scope decisions (2026-07-13/14, gathered via `/gsd:new-milestone` + research + roadmap):

- Schéma consommables/photos_consommables/releves_km conçu extensible mais liste v1 = 9 types donnés (pneu_av/ar, chaîne, plaquettes_av/ar, disque_av/ar, huile_moteur, liquide_frein)
- `releves_km` devient LA source de vérité du km — `motos.km` devient une colonne dérivée/cache, recalculée automatiquement
- Changement de compteur (nouveau totaliseur) réservé PRO+ (PRO/CONCESSION/ADMIN) — jamais MECANO, jamais CLIENT
- Relevés km normaux et photos consommables ouverts à CLIENT + GARAGE
- Stub IA minimal réaliste (% usure + état + confiance + analyse_status + engine) — contrat verrouillé dès Phase 24 comme le futur contrat réel, pas de vrai appel Anthropic ce milestone
- Rappel de photo : seuil fixe 3000km OU 6 mois (non configurable par garage ce milestone) — push mobile (infra MPUSH existante) + badge visuel garage pour motos non réclamées
- Cloudinary activé réellement ce milestone (CLOUD-01) — plus de placeholder ; clé Anthropic reste différée
- Données `pneu_av`/`pneu_ar`/`pneu_km_montage` legacy : migrées PUIS retirées (pas juste masquées) — section Pneus nav garage retirée, CLAUDE.md corrigé
- Phase order (research-driven, confirmé) : schéma+anti-fraude DB (23) → helpers+stub contract (24) → endpoints+Cloudinary (25) → cron rappel (26) → UI web garage+client (27) → UI mobile client lecture seule (28)
- Correction post-roadmap (2026-07-14) : le roadmapper avait initialement omis toute phase mobile car GAUGE-01/02 avaient été rédigés de façon ambiguë ("garage et client") alors que la demande initiale précisait explicitement "écrans mobile client + garage". Ajout de GAUGE-05/06 + Phase 28 pour corriger. Décision confirmée avec Mehdi : mobile = lecture seule (jauges + deep link notification), pas de capture photo native ce milestone.
- Les 3 chemins d'écriture km existants non gardés (`Motos.update()`, `Interventions.create()`, `OrdresReparation.cloturer()`) doivent être fermés dans la MÊME phase (23) que la création du trigger — sinon l'anti-fraude est contournable dès le jour 1

### Pending Todos

- **MSTORE-02** — soumission TestFlight/Play Store réelle, bloquée sur création de comptes développeur payants par Mehdi. Voir `.planning/PROJECT.md` Known Gaps.
- **Phase 8 / BILL-06** — Stripe live mode, bloqué sur action humaine Stripe Dashboard.
- **Tech debt from v1.5** (non-blocking, see `.planning/milestones/v1.5-MILESTONE-AUDIT.md`): niveau_preuve CHECK not applied in migration 21's own DDL, billing_events.created_at not backported to migration 15, no README/.env.example for the new bootstrap-verification chain.

### Blockers/Concerns

- Aucun blocage actif. Phase 8 et MSTORE-02 restent des known gaps externes.
- v1.6 discipline critique : toute nouvelle migration (Phase 23) doit inclure ses policies RLS dans le MÊME fichier que `CREATE TABLE`, et `schema.sql` doit être mis à jour dans la même phase, vérifié via `scripts/bootstrap-fresh-schema.js` — répéter la dérive résolue en v1.5 serait un échec de discipline évitable.
- Ce repo a `.planning/` gitignored avec force-add individuel des fichiers — si `gsd-tools.cjs commit` signale `skipped_commit_docs_false`, force-add et committer directement avec git plutôt que de bloquer.

## Session Continuity

Last session: 2026-07-13T23:12:57.518Z
Stopped at: Phase 23 context gathered
