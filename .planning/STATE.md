---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Suivi usure consommables + anti-fraude km
status: executing
stopped_at: Completed 25-04 (Wave 3) — CONSO-01 consommables endpoints, live-verified 15/15 against prod
last_updated: "2026-07-14T22:59:31.000Z"
last_activity: 2026-07-14 -- Phase 25 plan 04 complete
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 11
  completed_plans: 10
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Phase 25 — endpoints-backend-km-photos-remplacement-compteur-cloudinary

## Current Position

Phase: 25 (endpoints-backend-km-photos-remplacement-compteur-cloudinary) — EXECUTING
Plan: 01/02/03/04 complete, 05 not started
Status: Executing Phase 25 — 25-04 (CONSO-01 : PATCH unitaire + POST bulk consommables, MECANO+) complete, 2/2 tasks, live-verified 15/15 against prod (no deviations)
Last activity: 2026-07-14 -- Phase 25 plan 04 complete

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 ████████████ SHIPPED 2026-07-09 (undocumented schema drift known gap — carried forward)
v1.5 ████████████ SHIPPED 2026-07-11 (Gap A/B schema.sql drift fully resolved, SCHEMA-02→07)
v1.6 [██░░░░░░░░] IN PROGRESS — Phase 23 COMPLETE (4/4 plans, live-verified bootstrap gate), Phase 24 next
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 6 (v1.0 + v1.1 + v1.2 + v1.3 + v1.4 + v1.5) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3) — both blocked on Mehdi's external account/dashboard actions |
| Next action | Phase 25 plan 04 (CONSO-01 consommables endpoints) complete — plan 05 (CONSO-03/CLOUD-01) remains. |
| Phase 23 P04 | 25min | 2 tasks | 3 files |
| Phase 25 P01 | 20min | 3 tasks | 4 files |
| Phase 25 P02 | 17min | 2 tasks | 2 files |
| Phase 25 P03 | 25min | 3 tasks | 3 files |
| Phase 25 P04 | 8min | 2 tasks | 2 files |

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
- [Phase 23, plan 23-04]: `photos_consommables.analyse` renommée `analyse_ia` — "analyse" est un mot réservé PostgreSQL (ANALYSE/ANALYZE), causait un SCHEMA_BOOTSTRAP_FAILED réel ; découvert seulement en exécutant le bootstrap live (pas visible par simple lecture SQL) — confirme la discipline "gate = exécution réelle" de v1.5
- [Phase 23, plan 23-04]: fixtures `test-releves-km-trigger.js` corrigées pour poser `proprietaire_type='garage'` + `proprietaire_garage_id` — la contrainte CHECK `moto_proprietaire_coherence` (L8) exige `client_id NOT NULL` si `proprietaire_type='client'` (valeur par défaut), incompatible avec un script qui n'a que des fixtures garage
- [Phase 25]: D-02: cloudinaryService.uploadPhoto() throws 503 CLOUDINARY_NOT_CONFIGURED without credentials, never a placeholder URL (anti-fraud proof integrity)
- [Phase 25]: multer forced to ^2.2.0 (never 1.x) to avoid unpatched CVE-2025-47944/CVE-2026-3520
- [Phase 25]: TYPES_CONSOMMABLES centralized as single JS source of truth mirroring migration 23 CHECK constraint
- [Phase 25]: 25-02: garage login (rbac_role=CONCESSION) reused as PRO+/MECANO+ proxy token in test harness pending a dedicated seed account
- [Phase 25, plan 25-03]: Multipart routes (`/motos/:id/km`, `/motos/:id/km/remplacement-compteur`) intercepted before the router's unconditional `body()` call (mirrors `/stripe/webhook`), posing `req.ctx` themselves via `rbac.extractRoleFromRequest` — first multipart pattern in `motokey-api.js`, established for CONSO-03 (25-05) to reuse
- [Phase 25, plan 25-03]: `RelevesKm.enregistrer()` now falls back to `motos.km` when `releves_km_rejets` has no matching row, so the 409 `km_actuel` field is never null — found live against prod, where the audit-trail insert inside `verifier_km_monotone()` isn't persisting despite the rejection itself working correctly (see deferred-items.md, Phase 25 dir)
- [Phase 25, plan 25-04]: CONSO-01 (PATCH unitaire + POST bulk consommables) exécuté sans déviation — les deux endpoints réutilisent exactement le pattern MECANO+/`resolveMotoForCtx()` déjà établi en 25-03, aucun nouveau helper

### Pending Todos

- **MSTORE-02** — soumission TestFlight/Play Store réelle, bloquée sur création de comptes développeur payants par Mehdi. Voir `.planning/PROJECT.md` Known Gaps.
- **Phase 8 / BILL-06** — Stripe live mode, bloqué sur action humaine Stripe Dashboard.
- **Tech debt from v1.5** (non-blocking, see `.planning/milestones/v1.5-MILESTONE-AUDIT.md`): niveau_preuve CHECK not applied in migration 21's own DDL, billing_events.created_at not backported to migration 15, no README/.env.example for the new bootstrap-verification chain.

### Blockers/Concerns

- ~~**FRESH_DB_URL manquant**~~ → **RÉSOLU 2026-07-14** — Mehdi a créé un projet Supabase jetable (`xjgyoehennuydoocbprj`, distinct de la prod `rzbqbaccjyxvtlnfitrr`) et fourni la connection string Postgres directe (Dashboard → Settings → Database → Connection string, mode session, port 5432). Écrite dans `.env` sous `FRESH_DB_URL` (gitignored, jamais committée). Connexion pg live vérifiée (`SELECT current_database()`) avant tout usage. Plans 23-02 (checkpoint) et 23-04 (gate bootstrap) débloqués.
- Phase 8 et MSTORE-02 restent des known gaps externes.
- v1.6 discipline critique : toute nouvelle migration (Phase 23) doit inclure ses policies RLS dans le MÊME fichier que `CREATE TABLE`, et `schema.sql` doit être mis à jour dans la même phase, vérifié via `scripts/bootstrap-fresh-schema.js` — répéter la dérive résolue en v1.5 serait un échec de discipline évitable. **Vérifié tenu en Phase 23 (23-04).**
- Ce repo a `.planning/` gitignored avec force-add individuel des fichiers — si `gsd-tools.cjs commit` signale `skipped_commit_docs_false`, force-add et committer directement avec git plutôt que de bloquer.
- ~~Prod migration `sql/migrations/23_consommables_km.sql` reste à appliquer~~ → **APPLIQUÉE EN PROD 2026-07-14** (Mehdi, Supabase Dashboard SQL Editor, `rzbqbaccjyxvtlnfitrr`, exécution propre confirmée sans erreur). Vérifié côté Claude via sonde REST live (service-role key) : les 4 tables (`consommables`, `photos_consommables`, `releves_km`, `releves_km_rejets`) répondent `200 []`, et la clé publishable/anon reçoit aussi `200 []` (RLS default-deny actif, cohérent avec le pattern Phase 19/21). **Corrige un bug prod actif introduit par le déploiement du code 23-03 avant cette migration** : `OrdresReparation.cloturer()` appelait déjà `RelevesKm.enregistrer()` → `INSERT INTO releves_km` sur une table qui n'existait pas encore en prod (le code avait été poussé sur `origin/master` et auto-déployé par Railway avant l'application manuelle de la migration) — toute clôture d'OR en prod aurait échoué avec une exception non catchée après avoir déjà marqué l'OR `statut='termine'` en DB. Résolu, plus aucun blocage restant avant Phase 25.
- **NOUVEAU 2026-07-14 (plan 25-03) — `releves_km_rejets` non alimentée en prod par le trigger déployé** : en vérifiant KM-03 en conditions réelles contre prod (serveur local branché sur `rzbqbaccjyxvtlnfitrr`), le rejet anti-fraude fonctionne (le trigger `verifier_km_monotone` bloque bien tout km régressif — cœur de KM-01 intact), mais la ligne d'audit qu'il est censé insérer dans `releves_km_rejets` n'apparaît jamais, alors qu'un insert direct dans cette même table via le même client service-role fonctionne et est immédiatement visible (RLS écarté comme cause). Root cause non déterminée — probablement une divergence entre le corps de fonction réellement appliqué en prod via le Dashboard SQL Editor et `sql/migrations/23_consommables_km.sql` (la validation prod du 2026-07-14 n'a testé que l'existence des tables via sonde REST `200 []`, pas le chemin de rejet réel). Mitigation applicative posée dans ce plan (`RelevesKm.enregistrer()` retombe sur `motos.km`) — mais l'audit trail lui-même reste à vérifier/re-déployer par Mehdi via Dashboard. Détail complet : `.planning/phases/25-endpoints-backend-km-photos-remplacement-compteur-cloudinary/deferred-items.md`. Non bloquant pour la suite de Phase 25.

## Session Continuity

Last session: 2026-07-14T22:59:31.000Z
Stopped at: Completed 25-04 (Wave 3) — CONSO-01 consommables endpoints, live-verified 15/15 against prod
