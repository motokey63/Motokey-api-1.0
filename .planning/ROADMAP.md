# MotoKey API — Roadmap

## Milestones

- ✅ **v1.0 Core Platform** — L1→L8 (shipped 2026-05-29)
- ✅ **v1.1 L9 Stripe Billing** — Phases 3→7 (shipped 2026-06-16)
- ✅ **v1.2 Pioneer Program & Production Go-Live** — Phases 8→11 (shipped 2026-07-01, Phase 8 parked as known gap — see MILESTONES.md)
- ✅ **v1.3 App Client Mobile** — Phases 12→17 (shipped 2026-07-08, MSTORE-02 parked as known gap — see MILESTONES.md)
- ✅ **v1.4 Maintenance — CLIENT Fixture & Schema Drift** — Phases 18→19 (shipped 2026-07-09)
- ✅ **v1.5 Résolution dérive schema.sql** — Phases 20→22 (shipped 2026-07-11)
- ✅ **v1.6 Suivi usure consommables + anti-fraude km** — Phases 23→28 (shipped 2026-07-16)
- ⏸️ **v1.7 Édition devis brouillon** — Phase 29 (ON HOLD — scope superseded by v1.8, never shipped)
- 🚧 **v1.8 Unification Devis / OR / Facture** — Phases 30→34 (in progress)

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

<details>
<summary>✅ v1.6 Suivi usure consommables + anti-fraude km (Phases 23–28) — SHIPPED 2026-07-16</summary>

**Milestone Goal:** Donner à MotoKey le suivi d'usure des consommables moto (pneus, chaîne, plaquettes, disques, huile, liquide de frein) par photo + analyse IA (stub), avec anti-fraude stricte sur le kilométrage — cœur produit différenciateur, attaché au passeport moto transmissible à la revente.

- [x] **Phase 23: Schéma + Anti-Fraude km au niveau DB** - `releves_km` devient la source de vérité du km, croissance monotone stricte imposée par trigger DB, les 3 chemins d'écriture existants sont fermés (completed 2026-07-14)
- [x] **Phase 24: Helpers supabase.js + Contrat Stub Vision** - Helpers CRUD des 3 nouvelles tables + `visionAnalysisService.js` flag-gated dont le contrat de réponse est verrouillé avant tout consommateur (completed 2026-07-14)
- [x] **Phase 25: Endpoints Backend (km, photos, remplacement compteur, Cloudinary)** - Relevé km, changement de compteur PRO+, saisie consommables, upload photo avec stockage Cloudinary réel (completed 2026-07-14)
- [x] **Phase 26: Cron de Rappel + Push/Badge** - Rappel photo 3000km OU 6 mois, idempotent, avec équivalent badge garage pour motos non réclamées (completed 2026-07-15)
- [x] **Phase 27: UI Web Garage + Client (jauges, retrait Pneus legacy)** - Jauges % par consommable + jauge générale maillon faible, migration et retrait de la section Pneus historique (completed 2026-07-15)
- [x] **Phase 28: UI Mobile Client (jauges, lecture seule)** - Écran jauges consommables sur l'app mobile native + deep link depuis la notification de rappel photo (completed 2026-07-16)

See [milestones/v1.6-ROADMAP.md](milestones/v1.6-ROADMAP.md) for full phase details.

</details>

<details>
<summary>⏸️ v1.7 Édition devis brouillon (Phase 29) — ON HOLD, never shipped</summary>

**Milestone Goal:** Permettre au garage de modifier un devis en statut brouillon (lignes + remise) avant son envoi au client, en réutilisant le formulaire de création existant en mode édition. Aucun travail backend requis — `PUT /devis/:id` et `SBLayer.Devis.update()` supportent déjà l'édition de `lignes` + `entete.remise_pct` tant que `statut === 'brouillon'`.

**Mis ON HOLD 2026-07-17** : scope devenu obsolète suite à la décision produit d'unification Devis/OR/Facture du 16/07/2026 — remplacé par v1.8. Code Phase 29 implémenté et vérifié GREEN (15/15, `scripts/test-devis-edit.js`) dans `app.html` mais **non committé** — reste en modifications locales non stagées, à ne pas reprendre tel quel (voir STATE.md).

- [ ] **Phase 29: Édition Devis Brouillon (frontend)** - Le garage peut modifier un devis brouillon existant depuis la liste des devis, sans le recréer et sans changer son statut — ⏸️ ON HOLD, code non committé

</details>

<details open>
<summary>🚧 v1.8 Unification Devis / OR / Facture (Phases 30–34) — IN PROGRESS</summary>

**Milestone Goal:** Fusionner devis et OR en un objet unique (`ordres_reparation`, cycle de vie continu brouillon→facturé) pour éliminer la ressaisie manuelle et la confusion entre les deux objets actuels. Séquencement dérivé du §9 de la spec L10 (schéma → backend → frontend), avec un audit de dérive de schéma explicite en amont de toute écriture DDL, conformément au précédent de ce projet (v1.5 : dette d'ingénierie avant feature).

- [ ] **Phase 30: Audit Schéma `or_statut`** - L'état réel de l'enum Postgres `or_statut` en prod est connu (requête `pg_enum` live) et un plan de réconciliation avec les 7 statuts nécessaires est documenté, avant toute écriture DDL
- [ ] **Phase 31: Migration Schéma — Fusion devis → ordres_reparation** - Les données devis/OR existantes sont fusionnées sans perte dans le modèle unifié, `devis` passe en lecture seule, vérifié en exécution réelle contre un projet Supabase jetable
- [ ] **Phase 32: Backend — Cycle de vie unifié & numérotation** - Le backend applique le cycle brouillon→envoyé→accepté→en_cours→terminé→facturé (+refusé éditable) avec numérotation continue `INT-2026-XXXX` pour les nouvelles interventions
- [ ] **Phase 33: Backend — Lignes complémentaires en cours** - Une ligne ajoutée pendant l'exécution est bloquée jusqu'à acceptation client explicite et horodatée, avec notification push
- [ ] **Phase 34: Frontend — Interface Interventions unifiée** - Un seul onglet "Interventions" avec bandeau de statut contextuel et badge dédié pour les lignes en attente d'acceptation

</details>

## Progress

**Execution Order:**
Phases execute in numeric order: 18 → 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26 → 27 → 28 → 29 (on hold) → 30 → 31 → 32 → 33 → 34 (23→28 are sequential — each depends on the prior phase's output; Phase 27 depends on both 25 and 26; Phase 28 depends on 25 and 26, can run in parallel with 27; Phase 29 is standalone and currently on hold; 30→31→32→33 are strictly sequential — each depends on the prior phase's schema/backend output; Phase 34 depends on both 32 and 33)

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
| Phase 23 | v1.6 | 4/4 | ✅ Complete | 2026-07-14 |
| Phase 24 | v1.6 | 2/2 | ✅ Complete | 2026-07-14 |
| Phase 25 | v1.6 | 5/5 | ✅ Complete | 2026-07-14 |
| Phase 26 | v1.6 | 4/4 | ✅ Complete | 2026-07-15 |
| Phase 27 | v1.6 | 4/4 | ✅ Complete | 2026-07-15 |
| Phase 28 | v1.6 | 2/2 | ✅ Complete | 2026-07-16 |
| Phase 29 | v1.7 | 0/1 | ⏸️ On hold (superseded by v1.8) | - |
| Phase 30 | v1.8 | 0/TBD | Not started | - |
| Phase 31 | v1.8 | 0/TBD | Not started | - |
| Phase 32 | v1.8 | 0/TBD | Not started | - |
| Phase 33 | v1.8 | 0/TBD | Not started | - |
| Phase 34 | v1.8 | 0/TBD | Not started | - |

## Phase Details

### Phase 29: Édition Devis Brouillon (frontend)
**Goal**: Le garage peut modifier un devis en statut brouillon (lignes + remise) avant son envoi au client, en réutilisant le formulaire de création existant en mode édition — sans aucun changement backend.
**Depends on**: Nothing new — s'appuie sur l'infrastructure devis existante (v1.0 L2, `PUT /devis/:id` et `SBLayer.Devis.update()` déjà fonctionnels pour `statut === 'brouillon'`)
**Requirements**: DEVIS-01, DEVIS-02, DEVIS-03, DEVIS-04
**Success Criteria** (what must be TRUE):
  1. User (MECANO+) voit un bouton "Modifier" sur chaque devis en statut brouillon dans la liste des devis (`loadDevis()`), et ce bouton n'apparaît pas sur les devis envoyés/acceptés/refusés
  2. Cliquer sur "Modifier" ouvre le formulaire "Créer un devis" existant en mode édition, pré-rempli avec les lignes (désignation/qté/prix HT) et la remise (%) actuelles du devis sélectionné
  3. User peut ajouter, retirer ou modifier des lignes et changer la remise (%) dans ce formulaire, puis enregistrer les modifications
  4. Après enregistrement, l'appel réseau est `PUT /devis/:id` (pas `POST /devis`), le devis reste en statut `brouillon`, et la liste des devis reflète immédiatement les nouvelles valeurs
**Plans**: 1 plan (single wave) — ⏸️ ON HOLD, code implemented GREEN but never committed (see STATE.md)
Plans:
- [ ] 29-01-PLAN.md — Mode édition devis brouillon dans app.html (harness Nyquist + implémentation + vérification humaine)
**UI hint**: yes

### Phase 30: Audit Schéma `or_statut`
**Goal**: L'état réel de l'enum Postgres `or_statut` en prod est connu et un plan de réconciliation avec les 7 statuts nécessaires est documenté, avant que toute migration DDL ne soit écrite — referme la dérive non documentée découverte le 2026-07-17 (`migrations/08-livraison-3a-ordres-reparation.sql` ne déclare que 4 valeurs, le code backend et l'UI en utilisent déjà 7).
**Depends on**: Nothing (first phase of v1.8)
**Requirements**: MIGR-02
**Success Criteria** (what must be TRUE):
  1. Les valeurs réelles de l'enum `or_statut` en prod sont listées via une requête `pg_enum` live et documentées (pas une inférence depuis le code ou les migrations trackées)
  2. L'écart entre les valeurs réelles et les 7 statuts nécessaires (`brouillon, envoye, accepte, en_cours, termine, facture, refuse`) est explicite — chaque valeur manquante ou à renommer est listée
  3. Un plan de réconciliation est documenté (ordre des `ALTER TYPE ... ADD VALUE`, contraintes de transaction Postgres sur les enums, ou stratégie de recréation d'enum si nécessaire)
  4. Ce plan est la base de départ de la Phase 31 — aucune écriture DDL sur `or_statut` n'a lieu avant que ce plan existe
**Plans**: TBD

### Phase 31: Migration Schéma — Fusion devis → ordres_reparation
**Goal**: Les données `devis` et `ordres_reparation` existantes sont fusionnées dans le modèle unifié sans perte, et `devis` passe en lecture seule côté application.
**Depends on**: Phase 30 (le plan de réconciliation de l'enum pilote l'écriture de cette migration)
**Requirements**: MIGR-01, MIGR-03
**Success Criteria** (what must be TRUE):
  1. L'enum `or_statut` contient les 7 statuts nécessaires en prod, vérifié par requête live après application de la migration (pas seulement la lecture du fichier de migration)
  2. Les 8 devis et 6 OR de prod (comptage confirmé 2026-07-17) existent tous dans le modèle unifié après migration, sans perte — comptage avant/après vérifié
  3. Plus aucune route applicative n'écrit dans la table `devis` (POST/PUT/PATCH bloqués ou retournent une erreur explicite) — lecture seule effective, `DROP TABLE` explicitement non fait
  4. La migration a été exécutée et vérifiée en conditions réelles contre un projet Supabase jetable avant toute application en prod, conformément au gate établi par ce projet (v1.5 Phase 22, v1.6 Phase 23 : exécution live, jamais revue statique seule)
**Plans**: TBD

### Phase 32: Backend — Cycle de vie unifié & numérotation
**Goal**: Le backend applique le cycle de vie unifié brouillon→envoyé→accepté→en_cours→terminé→facturé (+refusé, reste éditable) avec numérotation continue pour les nouvelles interventions.
**Depends on**: Phase 31 (le modèle unifié et l'enum réconcilié doivent exister avant que la logique de transition ne soit écrite)
**Requirements**: UNIF-01, UNIF-02, UNIF-03, UNIF-04
**Success Criteria** (what must be TRUE):
  1. Toute création d'intervention par un user MECANO+ aboutit toujours à un statut `brouillon` — aucune route ne permet de créer directement en `en_cours`
  2. Une intervention peut être avancée à travers chaque statut du cycle `brouillon → envoyé → accepté → en_cours → terminé → facturé` dans l'ordre attendu, les transitions invalides étant rejetées par le backend
  3. Une intervention `refusée` reste visible dans la liste des interventions et peut être rouverte/modifiée sans recréation
  4. Les nouvelles interventions créées après la migration reçoivent un numéro `INT-2026-XXXX` en série continue ; les OR/devis migrés conservent leur numéro d'origine (`OR-2026-XXXX`) comme référence historique, sans renumérotation rétroactive
**Plans**: TBD

### Phase 33: Backend — Lignes complémentaires en cours
**Goal**: Une ligne ajoutée pendant l'exécution d'une intervention est bloquée tant que le client ne l'a pas explicitement acceptée, avec preuve horodatée et notification immédiate.
**Depends on**: Phase 32 (nécessite le statut `en_cours` et la garde de transition vers `terminé` déjà en place)
**Requirements**: LIGNE-01, LIGNE-02, LIGNE-03, LIGNE-04
**Success Criteria** (what must be TRUE):
  1. Une ligne ajoutée par un user MECANO+ sur une intervention en statut `en_cours` est automatiquement marquée `ajoutee_en_cours=true` et `en_attente_acceptation_client=true`
  2. Un user CLIENT peut accepter explicitement une ligne complémentaire précise ; l'acceptation horodate `date_acceptation_ligne` et trace `accepte_par_client_id`
  3. Le passage d'une intervention au statut `terminé` est refusé par le backend tant qu'il reste au moins une ligne `en_attente_acceptation_client=true` non résolue (acceptée ou retirée)
  4. Le CLIENT propriétaire reçoit une notification push immédiate (infra Expo/FCM existante, pattern MPUSH-03) dès qu'une ligne complémentaire attend son acceptation
**Plans**: TBD

### Phase 34: Frontend — Interface Interventions unifiée
**Goal**: L'utilisateur garage travaille depuis un seul onglet "Interventions" qui expose le cycle de vie complet et distingue visuellement les lignes en attente d'acceptation client.
**Depends on**: Phase 32 et Phase 33 (nécessite les endpoints de transition de statut et de gestion des lignes complémentaires)
**Requirements**: INTERV-01, INTERV-02, INTERV-03
**Success Criteria** (what must be TRUE):
  1. User voit un seul onglet "Interventions" (les anciens onglets Devis et OR séparés ont disparu) avec un filtre par statut
  2. La fiche détail d'une intervention affiche un bandeau de statut avec les actions contextuelles disponibles pour l'état courant (Envoyer / Accepter / Démarrer / Facturer), cohérentes avec les transitions autorisées par le backend (Phase 32)
  3. Une ligne en attente d'acceptation client (`en_attente_acceptation_client=true`) est visuellement distincte (badge dédié) d'une ligne déjà validée, dans la fiche détail de l'intervention
**Plans**: TBD
**UI hint**: yes

---
*Roadmap updated: 2026-07-17 — v1.7 milestone (Édition devis brouillon) marked ON HOLD, superseded by v1.8. v1.8 milestone (Unification Devis / OR / Facture) started: Phases 30→34 created, continuing numbering from v1.7's Phase 29. Sequencing follows this project's established schema-first-with-live-verification convention (v1.5, v1.6 Phase 23): schema audit (30) → schema migration (31) → backend lifecycle (32) → backend lines (33) → frontend (34). Next: /gsd:plan-phase 30.*
