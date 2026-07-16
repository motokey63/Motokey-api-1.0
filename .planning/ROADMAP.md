# MotoKey API — Roadmap

## Milestones

- ✅ **v1.0 Core Platform** — L1→L8 (shipped 2026-05-29)
- ✅ **v1.1 L9 Stripe Billing** — Phases 3→7 (shipped 2026-06-16)
- ✅ **v1.2 Pioneer Program & Production Go-Live** — Phases 8→11 (shipped 2026-07-01, Phase 8 parked as known gap — see MILESTONES.md)
- ✅ **v1.3 App Client Mobile** — Phases 12→17 (shipped 2026-07-08, MSTORE-02 parked as known gap — see MILESTONES.md)
- ✅ **v1.4 Maintenance — CLIENT Fixture & Schema Drift** — Phases 18→19 (shipped 2026-07-09)
- ✅ **v1.5 Résolution dérive schema.sql** — Phases 20→22 (shipped 2026-07-11)
- 🚧 **v1.6 Suivi usure consommables + anti-fraude km** — Phases 23→28 (in progress)

## Phases

<details>
<summary>✅ v1.0 Core Platform (L1–L8) — SHIPPED 2026-05-29</summary>

- [x] L1: Auth garage (login/logout/JWT)
- [x] L2: Devis client + validation/refus
- [x] L3a: OR backend + frontend
- [x] L3c: Catalogue pièces + scanner EAN-13
- [x] L4 + L4v2: RBAC 4 niveaux + hardening
- [x] L7b: Auth client + email Resend
- [x] L8: Liaison polymorphe moto

</details>

<details>
<summary>✅ v1.1 L9 Stripe Billing (Phases 3–7) — SHIPPED 2026-06-16</summary>

- [x] Phase 3: DB Foundation + Stripe Dashboard Setup — Migration 15 + 6 Price IDs
- [x] Phase 4: Webhook Infrastructure — 7 events, state machine, idempotency
- [x] Phase 5: Checkout + Trial Flow — trial 14j sans CB, auto-trial, email confirm
- [x] Phase 6: Plan Limit Enforcement — HTTP 402, BILLING_ENFORCE flag
- [x] Phase 7: Self-Service Portal + Billing UI — Customer Portal, emails, section Abonnement

See [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v1.2 Pioneer Program & Production Go-Live (Phases 8–11) — SHIPPED 2026-07-01</summary>

- [ ] Phase 8: Stripe Live Mode — ⏸️ PARKED (known gap — 08-01 script done, 08-02 operational cutover not executed, blocked on human Stripe Dashboard action)
- [x] Phase 9: Pioneer Program — coupon PIONEER2026, 3 mois gratuits + prix bloqué 24 mois + compteur 30 places (completed 2026-06-30)
- [x] Phase 10: Live Operations — enforcement quotas + emails annulation/bienvenue (completed 2026-06-29)
- [x] Phase 11: Dashboard UX Alerts — badge rouge score + alerte kilométrage (completed 2026-06-30)

See [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md) for full details, [milestones/v1.2-MILESTONE-AUDIT.md](milestones/v1.2-MILESTONE-AUDIT.md) for the audit report.

</details>

<details>
<summary>✅ v1.3 App Client Mobile (Phases 12–17) — SHIPPED 2026-07-08</summary>

**Milestone Goal:** Les clients moto disposent d'une app mobile native (React Native/Expo) pour gérer leur moto, leurs devis et recevoir des notifications push — en complément de `MotoKey_Client.html`, sans changement au backend/web existant hors nouvelle surface push.

- [x] Phase 12: Backend Push Foundation — Device tokens + profil client exposés via API, curl-testable sans app mobile (completed 2026-07-01)
- [x] Phase 13: Push Dispatch Service — Service d'envoi de push modelé sur emailService.js, testable indépendamment (completed 2026-07-02)
- [x] Phase 14: RN App Scaffolding + Native Auth — Scaffold Expo Router + authentification native sécurisée (completed 2026-07-03, MAUTH-03 live device proof closed 2026-07-08)
- [x] Phase 15: Feature-Parity Screens — Motos, devis, historique, liaison garage — parité MotoKey_Client.html (completed 2026-07-04)
- [x] Phase 16: Push Wiring End-to-End — Soft-ask, enregistrement token, push devis reçu, deep link (completed 2026-07-05, live device delivery closed 2026-07-08)
- [x] Phase 17: Maintenance Alert Cron + App Store Submission — Push rappel entretien + soumission stores (completed 2026-07-06, MSTORE-02 parked as known gap)

See [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md) for full details, [milestones/v1.3-MILESTONE-AUDIT.md](milestones/v1.3-MILESTONE-AUDIT.md) for the audit report.

</details>

<details>
<summary>✅ v1.4 Maintenance — CLIENT Fixture & Schema Drift (Phases 18–19) — SHIPPED 2026-07-09</summary>

**Milestone Goal:** Close the two carried-forward known gaps that are pure engineering debt with no external blocker, distinct from Phase 8/BILL-06 and MSTORE-02 which remain blocked on Mehdi's external account actions.

- [x] Phase 18: CLIENT Login Fixture Fix — `setup-supabase.js` creates/links a Supabase Auth user for `sophie@email.com`, CLIENT login returns 200 (completed 2026-07-08)
- [x] Phase 19: Schema.sql Regeneration — `schema.sql` regenerated for migrations 1–19, bootstrap verified clean against a fresh Supabase project (completed 2026-07-09)

See [milestones/v1.4-ROADMAP.md](milestones/v1.4-ROADMAP.md) for full phase details.

</details>

<details>
<summary>✅ v1.5 Résolution dérive schema.sql (Phases 20–22) — SHIPPED 2026-07-11</summary>

**Milestone Goal:** Combler la dérive non documentée découverte en Phase 19 (colonnes/contraintes en prod sur `garages`/`clients`/`interventions`/`devis` sans fichier de migration correspondant), en identifiant l'origine de chaque ajout, avant tout nouveau feature. Dette d'ingénierie pure — aucune fonctionnalité utilisateur dans ce milestone.

- [x] Phase 20: Introspection & Corrélation d'Origine — Chaque colonne non documentée est identifiée (type/contraintes exacts) et corrélée à sa livraison d'origine via git (completed 2026-07-09)
- [x] Phase 21: Migrations Rétroactives & Mise à Jour schema.sql — Migrations numérotées 20+ documentent Gap A ; Gap B (tables migration 13/15) ajouté à schema.sql (completed 2026-07-10)
- [x] Phase 22: Vérification Bootstrap & Nettoyage Header — Bootstrap propre contre un projet Supabase neuf, header known-partial-bootstrap mis à jour (completed 2026-07-11)

See [milestones/v1.5-ROADMAP.md](milestones/v1.5-ROADMAP.md) for full phase details, [milestones/v1.5-MILESTONE-AUDIT.md](milestones/v1.5-MILESTONE-AUDIT.md) for the audit report (status: tech_debt, no blockers).

</details>

### 🚧 v1.6 Suivi usure consommables + anti-fraude km (Phases 23–28, In Progress)

**Milestone Goal:** Donner à MotoKey le suivi d'usure des consommables moto (pneus, chaîne, plaquettes, disques, huile, liquide de frein) par photo + analyse IA (stub), avec anti-fraude stricte sur le kilométrage — cœur produit différenciateur, attaché au passeport moto transmissible à la revente.

- [x] **Phase 23: Schéma + Anti-Fraude km au niveau DB** - `releves_km` devient la source de vérité du km, croissance monotone stricte imposée par trigger DB, les 3 chemins d'écriture existants sont fermés (completed 2026-07-14)
- [x] **Phase 24: Helpers supabase.js + Contrat Stub Vision** - Helpers CRUD des 3 nouvelles tables + `visionAnalysisService.js` flag-gated dont le contrat de réponse est verrouillé avant tout consommateur (completed 2026-07-14)
- [x] **Phase 25: Endpoints Backend (km, photos, remplacement compteur, Cloudinary)** - Relevé km, changement de compteur PRO+, saisie consommables, upload photo avec stockage Cloudinary réel (completed 2026-07-14)
- [x] **Phase 26: Cron de Rappel + Push/Badge** - Rappel photo 3000km OU 6 mois, idempotent, avec équivalent badge garage pour motos non réclamées (completed 2026-07-15)
- [x] **Phase 27: UI Web Garage + Client (jauges, retrait Pneus legacy)** - Jauges % par consommable + jauge générale maillon faible, migration et retrait de la section Pneus historique (completed 2026-07-15)
- [ ] **Phase 28: UI Mobile Client (jauges, lecture seule)** - Écran jauges consommables sur l'app mobile native + deep link depuis la notification de rappel photo

## Phase Details

### Phase 23: Schéma + Anti-Fraude km au niveau DB
**Goal**: Le kilométrage moto ne peut plus être modifié que via une source de vérité unique (`releves_km`), protégée contre toute régression par un trigger DB, avec les 3 chemins d'écriture existants fermés ; le schéma consommables est posé de façon extensible.
**Depends on**: Nothing (first phase of v1.6 milestone; builds on v1.5's schema.sql discipline)
**Requirements**: KM-01, KM-04, CONSO-02
**Success Criteria** (what must be TRUE):
  1. Toute tentative d'insertion d'un relevé km inférieur au maximum historique de la moto est rejetée par un trigger `BEFORE INSERT` en base de données et journalisée de façon visible pour le garage (table de rejet consultable)
  2. `motos.km` est recalculé/dérivé automatiquement depuis `releves_km` à chaque relevé validé — `releves_km` est la seule source de vérité du kilométrage
  3. Les 3 chemins d'écriture existants (`Motos.update()`, `Interventions.create()`, `OrdresReparation.cloturer()`) passent tous par la même fonction de validation partagée — aucun bypass restant, vérifiable en lisant chaque fonction
  4. Le schéma `consommables` permet d'ajouter un nouveau type de consommable plus tard sans migration lourde (conception vérifiée en revue de schéma, pas seulement les 9 types v1 codés en dur)
  5. `scripts/bootstrap-fresh-schema.js` confirme un bootstrap propre incluant les nouvelles tables (`consommables`, `photos_consommables`, `releves_km`) et leurs policies RLS écrites dans la même migration que leur `CREATE TABLE`
**Plans**: 4 plans (2 waves autonomes + gate)
  - [x] 23-01-PLAN.md — Schéma: 4 tables + triggers km (monotone/sync) + suppression trg_update_km + RLS documenté (migration + schema.sql même commit)
  - [x] 23-02-PLAN.md — Infra test Wave 0 (script pg trigger) + checkpoint FRESH_DB_URL
  - [x] 23-03-PLAN.md — supabase.js: RelevesKm.enregistrer() + fermeture des 3 chemins d écriture km (KM-04)
  - [x] 23-04-PLAN.md — Gate: bootstrap propre + test trigger vert + revue RLS/parité schema.sql

### Phase 24: Helpers supabase.js + Contrat Stub Vision
**Goal**: Le contrat de réponse d'analyse IA (stub aujourd'hui, réel plus tard) est verrouillé et consommé identiquement par tous les futurs endpoints/jauges ; les helpers CRUD des 3 nouvelles tables existent comme unique point d'accès DB.
**Depends on**: Phase 23
**Requirements**: VISION-01, VISION-02
**Success Criteria** (what must be TRUE):
  1. `services/visionAnalysisService.js` expose `analyzePhoto()`, flag-gated par `VISION_ENABLED` (même convention que `EMAIL_ENABLED`/`PUSH_ENABLED`), qui renvoie une fausse analyse structurée tant que la clé Anthropic n'est pas configurée
  2. La réponse suit un contrat fixe et stable : `% usure`, `état`, `confiance`, `analyse_status` (ok/incertain/echec), `engine` (stub/anthropic-vision-v1) — identique que ce soit le stub ou une future analyse réelle
  3. Un appel direct à `analyzePhoto()` avec une URL factice renvoie une réponse conforme au contrat, vérifiable indépendamment de tout endpoint HTTP (test isolé, sans upload réel)
  4. `Consommables`, `PhotosConsommables`, `RelevesKm` existent comme helpers CRUD minces dans `supabase.js`, seul point d'accès DB pour les 3 nouvelles tables
**Plans**: 2 plans (1 wave — 2 plans autonomes parallèles)
  - [x] 24-01-PLAN.md — Service vision stub flag-gated (`visionAnalysisService.js`) + harnais de test contrat autonome (VISION-01/02)
  - [x] 24-02-PLAN.md — Helpers CRUD `Consommables`/`PhotosConsommables` dans `supabase.js` + vérif structurelle/pg (RelevesKm confirmé suffisant)

### Phase 25: Endpoints Backend (km, photos, remplacement compteur, Cloudinary)
**Goal**: Les garages et clients peuvent soumettre des relevés km et des photos de consommables via l'API ; le mécano peut saisir les données de montage ; l'upload stocke réellement l'image sur Cloudinary.
**Depends on**: Phase 24
**Requirements**: KM-02, KM-03, CONSO-01, CONSO-03, CLOUD-01
**Success Criteria** (what must be TRUE):
  1. Un client ou un membre du garage peut soumettre un relevé km normal (photo optionnelle) via l'API, sans déclencher de changement de compteur
  2. Un compte PRO/CONCESSION/ADMIN peut déclarer un changement de compteur via un endpoint dédié (archive l'ancien relevé, démarre un nouveau compteur signé) ; un compte MECANO ou CLIENT reçoit un refus (403)
  3. Le mécano peut saisir/mettre à jour km_montage, date_montage et référence pour chacun des 9 types de consommables d'une moto via l'API
  4. Un client ou un membre du garage peut uploader une photo de consommable ; l'upload déclenche l'analyse (stub) et l'historise avec sa date et son résultat d'analyse
  5. L'upload de photo (compteur ou consommable) stocke réellement l'image sur Cloudinary et renvoie une URL exploitable — plus aucun placeholder
**Plans**: 5 plans (4 vagues — parallélisme limité par le fichier partagé motokey-api.js)
  - [x] 25-01-PLAN.md — Fondations : deps cloudinary/multer + cloudinaryService.js (no-fallback D-02) + TYPES_CONSOMMABLES
  - [x] 25-02-PLAN.md — Harnais de test d intégration + fixture image (Wave 0 VALIDATION.md)
  - [x] 25-03-PLAN.md — Infra multipart + relevé km normal (KM-03) + remplacement compteur PRO+ (KM-02)
  - [x] 25-04-PLAN.md — Saisie consommables : PATCH unitaire + POST bulk (CONSO-01)
  - [x] 25-05-PLAN.md — Upload photo consommable + Cloudinary réel + analyse stub (CONSO-03, CLOUD-01)

### Phase 26: Cron de Rappel + Push/Badge
**Goal**: Les clients et les garages sont alertés automatiquement quand une photo de consommable devient nécessaire, sans spam et sans angle mort pour les motos garage non réclamées.
**Depends on**: Phase 25
**Requirements**: GAUGE-03, GAUGE-04
**Success Criteria** (what must be TRUE):
  1. Un client reçoit une notification push quand le km parcouru depuis la dernière photo d'un consommable atteint 3000 km OU que 6 mois se sont écoulés, le premier des deux déclenchant l'alerte
  2. Le cron ne renvoie pas de notification en double pour le même franchissement de seuil (idempotence, même pattern de persistance que `services/maintenanceAlertService.js`)
  3. Le garage voit un badge/indicateur équivalent au rappel sur les motos garage/non réclamées (sans compte client à notifier)
**Plans**: 4 plans (4 vagues séquentielles — fichiers partagés motokey-api.js/supabase.js)
  - [x] 26-01-PLAN.md — Migration 24 (colonnes rappel + km_a_la_photo) + parité schema.sql + squelette test Wave 0
  - [x] 26-02-PLAN.md — Service consommableRappelService (seuils D-01, fonction pure) + supabase.js (reset D-05, km_a_la_photo, champ badge GAUGE-04)
  - [x] 26-03-PLAN.md — Endpoint POST /cron/rappels-photo-consommables (X-Cron-Secret) + capture km_a_la_photo + assertions intégration GAUGE-03/04
  - [x] 26-04-PLAN.md — Gate : application migration 24 prod + suite intégration GAUGE-03/04 réellement verte

### Phase 27: UI Web Garage + Client (jauges, retrait Pneus legacy)
**Goal**: Le garage et le client voient l'état d'usure de chaque consommable et l'état général de la moto (maillon le plus faible), et la section Pneus historique n'existe plus en doublon contradictoire.
**Depends on**: Phase 25, Phase 26
**Requirements**: GAUGE-01, GAUGE-02, CONSO-04
**Success Criteria** (what must be TRUE):
  1. Le garage voit, sur la fiche moto dans `app.html`, une jauge % par consommable (9 types) reflétant les dernières données/analyses disponibles
  2. Le client voit, dans `MotoKey_Client.html`, la même jauge % par consommable pour ses motos
  3. Le garage et le client voient une jauge générale égale au consommable en plus mauvais état (maillon le plus faible), jamais une moyenne
  4. Les données `pneu_av`/`pneu_ar`/`pneu_km_montage` existantes ont été migrées vers les nouvelles lignes `consommables`, et la section Pneus legacy n'apparaît plus dans la navigation garage
  5. `CLAUDE.md` est corrigé pour refléter l'état réel (retrait Pneus effectif) — plus de contradiction entre la doc et le code
**Plans**: 4 plans (3 waves)
  - [x] 27-01-PLAN.md — Wave 0 harness scripts/test-consommables-jauges.js (5 cases, GAUGE-01/02, CONSO-04)
  - [x] 27-02-PLAN.md — Backend: GET /motos/:id/consommables + services/jaugeConsommables.js (maillon faible) + migration 25 pneus→consommables
  - [x] 27-03-PLAN.md — Garage app.html: onglet Consommables + jauge générale + chip dashboard + retrait Pneus legacy + CLAUDE.md
  - [x] 27-04-PLAN.md — Client MotoKey_Client.html: section jauges (wording grand public) + upload photo multipart (D-10)
**UI hint**: yes

### Phase 28: UI Mobile Client (jauges, lecture seule)
**Goal**: Le client voit, sur l'app mobile native, les mêmes jauges d'usure consommables que sur le web, et un tap sur la notification de rappel photo l'amène directement sur cet écran.
**Depends on**: Phase 25 (endpoints gauges), Phase 26 (payload de notification de rappel)
**Requirements**: GAUGE-05, GAUGE-06
**Success Criteria** (what must be TRUE):
  1. Le client voit, dans l'app mobile, une jauge % par consommable pour chacune de ses motos (même source de données que Phase 27, lecture seule — pas de capture photo depuis mobile ce milestone)
  2. Le client voit une jauge générale égale au consommable en plus mauvais état (maillon le plus faible), cohérente avec ce qu'affiche le web
  3. Un tap sur la notification push de rappel photo (Phase 26) navigue directement vers l'écran jauges de la moto concernée, via `mapNotificationDataToRoute()`
**Plans**: 2 plans (2 waves)
  - [x] 28-01-PLAN.md — Fondation lecture seule : etatColor + maps parité web + parseConsommables + composant GaugeBar (jest/tsc)
  - [ ] 28-02-PLAN.md — Wiring fiche moto [id].tsx : fetch consommables + jauge générale + section 9 jauges + retrait Pneumatiques + checkpoint device/deep link
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 18 → 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26 → 27 → 28 (23→28 are sequential — each depends on the prior phase's output; Phase 27 depends on both 25 and 26; Phase 28 depends on 25 and 26, can run in parallel with 27)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| L1–L8 | v1.0 | — | ✅ Complete | 2026-05-29 |
| Phase 3 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 4 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 5 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 6 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 7 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 8 | v1.2 | 1/2 | ⏸️ Parked (known gap) | - |
| Phase 9 | v1.2 | 1/1 | ✅ Complete | 2026-06-30 |
| Phase 10 | v1.2 | 2/2 | ✅ Complete | 2026-06-29 |
| Phase 11 | v1.2 | 2/2 | ✅ Complete | 2026-06-30 |
| Phase 12 | v1.3 | 2/2 | ✅ Complete | 2026-07-01 |
| Phase 13 | v1.3 | 2/2 | ✅ Complete | 2026-07-02 |
| Phase 14 | v1.3 | 4/4 | ✅ Complete | 2026-07-03 |
| Phase 15 | v1.3 | 9/9 | ✅ Complete | 2026-07-04 |
| Phase 16 | v1.3 | 4/4 | ✅ Complete | 2026-07-05 |
| Phase 17 | v1.3 | 4/4 | ✅ Complete (MSTORE-02 parked, known gap) | 2026-07-06 |
| Phase 18 | v1.4 | 1/1 | ✅ Complete | 2026-07-08 |
| Phase 19 | v1.4 | 3/3 | ✅ Complete | 2026-07-09 |
| Phase 20 | v1.5 | 2/2 | ✅ Complete | 2026-07-09 |
| Phase 21 | v1.5 | 4/4 | ✅ Complete | 2026-07-10 |
| Phase 22 | v1.5 | 3/3 | ✅ Complete | 2026-07-11 |
| Phase 23 | v1.6 | 0/4 | Not started | - |
| Phase 24 | v1.6 | 0/2 | Not started | - |
| Phase 25 | v1.6 | 0/5 | Not started | - |
| Phase 26 | v1.6 | 0/4 | Not started | - |
| Phase 27 | v1.6 | 0/4 | Not started | - |
| Phase 28 | v1.6 | 0/2 | Not started | - |

---
*Roadmap updated: 2026-07-16 — Phase 28 planifiée (2 plans, 2 vagues ; GAUGE-05/GAUGE-06 couverts). Next: /gsd:execute-phase 28.*
