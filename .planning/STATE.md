---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Suivi usure consommables + anti-fraude km
status: executing
stopped_at: "Phase 23 planned (4 plans, 3 waves) and validated — resumed session found STATE.md stale (still said "ready to plan") and 2 uncommitted plan refinements (D-04 acteur_id threading in 23-03, validation sign-off in 23-VALIDATION.md); reconciled and committed. Next: execute Phase 23 (blocked on FRESH_DB_URL for 23-02/23-04)."
last_updated: "2026-07-14T09:27:20.984Z"
last_activity: 2026-07-14 — Phase 23 execution: plan 23-01 complete (4 tables + 2 triggers + RLS default-deny, schema.sql same-commit); 23-02 partial (test harness written, checkpoint blocked on FRESH_DB_URL)
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 4
  completed_plans: 1
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Phase 23 — sch-ma-anti-fraude-km-au-niveau-db

## Current Position

Phase: 23 of 28 (Schéma + Anti-Fraude km au niveau DB) — EXECUTING
Plan: 4 plans / 3 waves — 23-01 (wave 1, autonomous, DONE), 23-02 (wave 1, non-autonomous, PARTIAL — test harness written, blocked on FRESH_DB_URL), 23-03 (wave 2, autonomous, depends on 23-01), 23-04 (wave 3, gate, non-autonomous, depends on 23-01/02/03)
Status: 23-01 complete (4 tables + 2 triggers + RLS, schema.sql hand-appended same commit) — 23-02 partial, checkpoint blocked on human action (FRESH_DB_URL, see Blockers); 23-03 can proceed (depends only on 23-01)
Last activity: 2026-07-14 — Plan 23-01 executed: releves_km source de vérité km, anti-fraude monotone trigger, clamp legacy retiré (commits 4939644, bc7068a); Plan 23-02 partial: scripts/test-releves-km-trigger.js écrit (RED), checkpoint FRESH_DB_URL en attente

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 ████████████ SHIPPED 2026-07-09 (undocumented schema drift known gap — carried forward)
v1.5 ████████████ SHIPPED 2026-07-11 (Gap A/B schema.sql drift fully resolved, SCHEMA-02→07)
v1.6 [██░░░░░░░░] IN PROGRESS — Phase 23: 1/4 plans done (23-01), wave 1 checkpoint (23-02) blocked on FRESH_DB_URL
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 6 (v1.0 + v1.1 + v1.2 + v1.3 + v1.4 + v1.5) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3) — both blocked on Mehdi's external account/dashboard actions |
| Next action | `FRESH_DB_URL` from Mehdi (throwaway Supabase project, Dashboard → Settings → Database → Connection string) to unblock 23-02 checkpoint and 23-04 gate; meanwhile 23-03 (wave 2) can execute since it only depends on 23-01 |

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
- D-04 (raffinement plan 23-03, 2026-07-14) : le relevé km de clôture d'OR doit porter l'identité du membre garage qui clôture (`ctx.user_id` threadé depuis l'endpoint jusqu'à `RelevesKm.enregistrer()`), fallback `garage_id` si absent (comptes garage legacy sans `garage_users`) — jamais anonyme. Sans ça, `acteur_id` aurait été le `garage_id` générique, perdant l'auditabilité par personne dans un garage multi-utilisateurs.
- KM-04 vérifié par analyse statique (grep + `node --check`) en 23-03/23-04, pas par un test d'intégration live `supabase.js`→REST — décision documentée dans `23-VALIDATION.md` (évite de demander un 2e type de credential Supabase pour cette seule phase)
- [Phase 23]: DROP trg_update_km/update_moto_km() dans la même migration que la création de releves_km (D-05) — évite un second writer non coordonné vers motos.km
- [Phase 23]: Trigger monotone NULL-safe via GREATEST(COALESCE(v_moto_km,0), COALESCE(v_max_releve,0)) pour couvrir le premier relevé d'une moto prod existante

### Pending Todos

- **MSTORE-02** — soumission TestFlight/Play Store réelle, bloquée sur création de comptes développeur payants par Mehdi. Voir `.planning/PROJECT.md` Known Gaps.
- **Phase 8 / BILL-06** — Stripe live mode, bloqué sur action humaine Stripe Dashboard.
- **Tech debt from v1.5** (non-blocking, see `.planning/milestones/v1.5-MILESTONE-AUDIT.md`): niveau_preuve CHECK not applied in migration 21's own DDL, billing_events.created_at not backported to migration 15, no README/.env.example for the new bootstrap-verification chain.

### Blockers/Concerns

- **FRESH_DB_URL manquant** — plans 23-02 (script de test trigger) et 23-04 (gate bootstrap final) nécessitent une connexion Postgres directe vers un projet Supabase **jetable** (jamais prod). Action Mehdi : créer un nouveau projet Supabase, copier la connection string (mode session) depuis Dashboard → Settings → Database, l'ajouter dans `.env` sous `FRESH_DB_URL`. 23-01 (wave 1) et 23-03 (wave 2) ne dépendent pas de cette variable et peuvent s'exécuter sans elle.
- **23-02 PARTIEL (2026-07-14)** — Task 1 (`scripts/test-releves-km-trigger.js`, 5 cas trigger + CHECK 9-types, RED tant que 23-01 n'est pas bootstrappé) livrée et committée (`3e6a96a`). Task 2 (checkpoint humain FRESH_DB_URL) non résolue cette session — re-confirmé absent de `.env`, aucune valeur fabriquée. Voir `23-02-SUMMARY.md` pour le détail. Plan 23-02 reste bloqué jusqu'à ce que Mehdi fournisse `FRESH_DB_URL` ; le plan 23-04 (gate bootstrap) en dépend directement.
- Phase 8 et MSTORE-02 restent des known gaps externes.
- v1.6 discipline critique : toute nouvelle migration (Phase 23) doit inclure ses policies RLS dans le MÊME fichier que `CREATE TABLE`, et `schema.sql` doit être mis à jour dans la même phase, vérifié via `scripts/bootstrap-fresh-schema.js` — répéter la dérive résolue en v1.5 serait un échec de discipline évitable.
- Ce repo a `.planning/` gitignored avec force-add individuel des fichiers — si `gsd-tools.cjs commit` signale `skipped_commit_docs_false`, force-add et committer directement avec git plutôt que de bloquer.

## Session Continuity

Last session: 2026-07-14T00:00:00.000Z
Stopped at: Phase 23 planned (4 plans, 3 waves) and validated — resumed session found STATE.md stale (still said "ready to plan") and 2 uncommitted plan refinements (D-04 acteur_id threading in 23-03, validation sign-off in 23-VALIDATION.md); reconciled and committed. Next: execute Phase 23 (blocked on FRESH_DB_URL for 23-02/23-04).
