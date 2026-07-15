---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Suivi usure consommables + anti-fraude km
status: verifying
stopped_at: Completed 27-03-PLAN.md and 27-04-PLAN.md — Phase 27 complete (4/4 plans)
last_updated: "2026-07-15T22:19:51.883Z"
last_activity: 2026-07-15
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 19
  completed_plans: 19
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-13)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Phase 27 — ui-web-garage-client-jauges-retrait-pneus-legacy — Wave 3/3 complete (4/4 plans), pending phase verification

## Current Position

Phase: 28 of 28 (ui mobile client (jauges, lecture seule))
Plan: Not started
Status: Ready for phase verification
Last activity: 2026-07-15

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 ████████████ SHIPPED 2026-07-09 (undocumented schema drift known gap — carried forward)
v1.5 ████████████ SHIPPED 2026-07-11 (Gap A/B schema.sql drift fully resolved, SCHEMA-02→07)
v1.6 [█████░░░░░] IN PROGRESS — Phase 23/24/25/26 COMPLETE (schéma+anti-fraude km, helpers+stub vision, endpoints backend+Cloudinary, cron rappel), Phase 27 (UI web) next
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 6 (v1.0 + v1.1 + v1.2 + v1.3 + v1.4 + v1.5) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3) — both blocked on Mehdi's external account/dashboard actions |
| Next action | Phase 26 complete (4/4 plans) — start Phase 27 (UI web garage + client, jauges). |
| Phase 23 P04 | 25min | 2 tasks | 3 files |
| Phase 25 P01 | 20min | 3 tasks | 4 files |
| Phase 25 P02 | 17min | 2 tasks | 2 files |
| Phase 25 P03 | 25min | 3 tasks | 3 files |
| Phase 25 P04 | 8min | 2 tasks | 2 files |
| Phase 25 P05 | 35min | 2 tasks | 2 files |
| Phase 26 P01 | 5min | 2 tasks | 3 files |
| Phase 26 P02 | 12min | 2 tasks | 3 files |
| Phase 26 P03 | 11min | 2 tasks | 2 files |
| Phase 26 P04 | 15min | 2 tasks | 0 files |
| Phase 27 P01 | 12min | 1 tasks | 1 files |
| Phase 27 P02 | 20min | 3 tasks | 4 files |
| Phase 27 P03 | 20min | 3 tasks | 2 files |
| Phase 27 P04 | 15min | 2 tasks | 1 files |

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
- [Phase 25, plan 25-05]: CONSO-03 (`POST /motos/:id/photos-consommables`) livré — 3e intercept multipart (après KM-02/KM-03), pipeline multer→Cloudinary→D-05 auto-création consommable→analyzePhoto stub→PhotosConsommables.insert, live-vérifié 18/18 (garage path) sans credentials Cloudinary (503 D-02 prouvé). **Phase 25 complète (5/5 plans).**
- [Phase 25, plan 25-05]: ~~Gap RBAC pré-existant et transverse découvert...~~ → **RÉSOLU 2026-07-15, diagnostic corrigé** : n'était pas un gap `rbac.inferLegacyRole()` affectant 60+ endpoints prod. Vraie cause : fixture `sophie@email.com` (Phase 18) sans `app_metadata.role`, + scripts de test utilisant l'ancien `/auth/login` au lieu du vrai `/auth/client/login`. Vrais clients (inscrits via `/auth/client/register`) tous corrects (6/6 sondés live). Corrigé : `setup-supabase.js` pose le rôle (appliqué live), tests basculés sur `/auth/client/login`. `tests/test-km-photos-cloudinary.js` 19/19, `tests/test-client-device-tokens.js` 15/15 (était 3/15). Détail dans `deferred-items.md` Phase 25.
- [Phase 26]: 26-01: aucun trigger DB ajoute pour D-05 (reset dernier_rappel_envoye_at) -- reste une decision applicative JS cablee en 26-02, pas un trigger Postgres
- [Phase 26]: GAUGE-04 (badge garage) calcule au read-time dans Motos.list/getById, jamais par le cron -- le cron ne scanne que proprietaire_type=client
- [Phase 26]: Lazy require du service dans supabase.js (pas en tete de fichier) pour eviter le cycle supabase.js<->consommableRappelService.js
- [Phase 26]: GAUGE-04 skip proprement en mode RAM fallback (Supabase non configure localement) plutot que d'echouer -- champ calcule uniquement via SBLayer.Motos.list/getById
- [Phase 26, plan 26-04]: Migration 24 appliquée en prod par Mehdi, GAUGE-03/GAUGE-04 vérifiés réellement verts (15/15 assertions actives, 0 KO), régression racine intacte (9/9). **Phase 26 complète (4/4 plans).** Note opérationnelle non bloquante : à confirmer avec Mehdi si le scheduler externe a besoin d'une entrée pour `POST /cron/rappels-photo-consommables`.
- [Phase 27]: [Phase 27, plan 27-01]: endpoint-shape structural case matches the exact M('GET','/motos/:id/consommables') router literal (not a bare path substring) to avoid a false PASS against the pre-existing POST route on the same path (CONSO-01, Phase 25)
- [Phase 27]: [Phase 27, plan 27-02]: computeJaugeGenerale never averages pct_usure across consommables — returns the single item with max pct_usure (D-03), matching weakest-link framing; migration 25 does not DROP COLUMN, legacy pneu_* columns stay on motos until Mehdi validates the copy in prod
- [Phase 27]: Garage Consommables tab reuses the exact Pneus tab slot (tabDefs 2nd entry) and score-badge CSS classes; general weakest-link gauge exposed at top of tab per D-07; consoChip reads pre-computed GAUGE-04 fields with zero N+1 fetch
- [Phase 27]: [Phase 27, plan 27-04]: Client gauge section title capitalized 'Usure des Consommables' to satisfy the frontend-structure test's case-sensitive 'Consommables' marker assertion -- cosmetic only
- [Phase 27]: [Phase 27, plan 27-04]: MotoKey_Client.html multipart upload (uploadConsoPhoto) built on raw fetch+FormData rather than the existing apiFetch JSON helper -- first multipart pattern in this file, deliberately not reusing the carte-grise CLOUDINARY_PRESET unsigned flow which would skip vision-stub analysis
- [Phase 27]: **Phase 27 complète (4/4 plans, Wave 3 exécutée en parallèle 27-03/27-04).**

### Blockers/Concerns

- ~~**FRESH_DB_URL manquant**~~ → **RÉSOLU 2026-07-14** — Mehdi a créé un projet Supabase jetable (`xjgyoehennuydoocbprj`, distinct de la prod `rzbqbaccjyxvtlnfitrr`) et fourni la connection string Postgres directe (Dashboard → Settings → Database → Connection string, mode session, port 5432). Écrite dans `.env` sous `FRESH_DB_URL` (gitignored, jamais committée). Connexion pg live vérifiée (`SELECT current_database()`) avant tout usage. Plans 23-02 (checkpoint) et 23-04 (gate bootstrap) débloqués.
- Phase 8 et MSTORE-02 restent des known gaps externes.
- v1.6 discipline critique : toute nouvelle migration (Phase 23) doit inclure ses policies RLS dans le MÊME fichier que `CREATE TABLE`, et `schema.sql` doit être mis à jour dans la même phase, vérifié via `scripts/bootstrap-fresh-schema.js` — répéter la dérive résolue en v1.5 serait un échec de discipline évitable. **Vérifié tenu en Phase 23 (23-04).**
- Ce repo a `.planning/` gitignored avec force-add individuel des fichiers — si `gsd-tools.cjs commit` signale `skipped_commit_docs_false`, force-add et committer directement avec git plutôt que de bloquer.
- ~~Prod migration `sql/migrations/23_consommables_km.sql` reste à appliquer~~ → **APPLIQUÉE EN PROD 2026-07-14** (Mehdi, Supabase Dashboard SQL Editor, `rzbqbaccjyxvtlnfitrr`, exécution propre confirmée sans erreur). Vérifié côté Claude via sonde REST live (service-role key) : les 4 tables (`consommables`, `photos_consommables`, `releves_km`, `releves_km_rejets`) répondent `200 []`, et la clé publishable/anon reçoit aussi `200 []` (RLS default-deny actif, cohérent avec le pattern Phase 19/21). **Corrige un bug prod actif introduit par le déploiement du code 23-03 avant cette migration** : `OrdresReparation.cloturer()` appelait déjà `RelevesKm.enregistrer()` → `INSERT INTO releves_km` sur une table qui n'existait pas encore en prod (le code avait été poussé sur `origin/master` et auto-déployé par Railway avant l'application manuelle de la migration) — toute clôture d'OR en prod aurait échoué avec une exception non catchée après avoir déjà marqué l'OR `statut='termine'` en DB. Résolu, plus aucun blocage restant avant Phase 25.
- **NOUVEAU 2026-07-14 (plan 25-03) — `releves_km_rejets` non alimentée en prod par le trigger déployé** : en vérifiant KM-03 en conditions réelles contre prod (serveur local branché sur `rzbqbaccjyxvtlnfitrr`), le rejet anti-fraude fonctionne (le trigger `verifier_km_monotone` bloque bien tout km régressif — cœur de KM-01 intact), mais la ligne d'audit qu'il est censé insérer dans `releves_km_rejets` n'apparaît jamais, alors qu'un insert direct dans cette même table via le même client service-role fonctionne et est immédiatement visible (RLS écarté comme cause). Root cause non déterminée — probablement une divergence entre le corps de fonction réellement appliqué en prod via le Dashboard SQL Editor et `sql/migrations/23_consommables_km.sql` (la validation prod du 2026-07-14 n'a testé que l'existence des tables via sonde REST `200 []`, pas le chemin de rejet réel). Mitigation applicative posée dans ce plan (`RelevesKm.enregistrer()` retombe sur `motos.km`) — mais l'audit trail lui-même reste à vérifier/re-déployer par Mehdi via Dashboard. Détail complet : `.planning/phases/25-endpoints-backend-km-photos-remplacement-compteur-cloudinary/deferred-items.md`. Non bloquant pour la suite de Phase 25.
- **BLOQUANT EXTERNE avant usage prod réel de CONSO-03/CLOUD-01 — credentials Cloudinary absents** : `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` toujours non provisionnés (ni `.env` local, ni Railway `motokey1.1`) à la clôture de Phase 25. Le endpoint renvoie 503 `CLOUDINARY_NOT_CONFIGURED` sur toute tentative d'upload réel (comportement voulu, D-02 — jamais de placeholder), mais bloque de fait tout usage produit de CONSO-03/photos compteur tant que Mehdi n'a pas provisionné les 3 vars (Cloudinary Dashboard → Settings → Account/API Keys, puis Railway service `motokey1.1`). Ne bloque pas la complétion de Phase 25 (assertions D-02/CLOUD-01 skippables, plan autonomous) mais bloque potentiellement les jauges Phase 27/28 si aucune vraie photo n'a été uploadée en prod avant cette phase.
- ~~**NOUVEAU 2026-07-14 (plan 25-05) — gap RBAC transverse pré-existant, comptes CLIENT non reconnus via JWT legacy**~~ → **RÉSOLU 2026-07-15** — diagnostic corrigé, n'était pas un gap RBAC prod (voir entrée Decisions ci-dessus + `deferred-items.md` Phase 25). Aucun impact sur Phase 28 : l'app mobile utilise déjà `/auth/client/login` (le vrai flux), jamais le login legacy.
- Migration 25 (sql/migrations/25_migrate_pneus_to_consommables.sql) reste a appliquer manuellement en prod par Mehdi via Supabase Dashboard > SQL Editor -- jusque-la, has_data:false pour pneu_av/pneu_ar sur les motos dont les seules donnees pneus vivent dans les colonnes legacy motos.pneu_av/pneu_ar

## Session Continuity

Last session: 2026-07-15T22:11:02.256Z
Stopped at: Completed 27-03-PLAN.md and 27-04-PLAN.md — Phase 27 complete (4/4 plans)
