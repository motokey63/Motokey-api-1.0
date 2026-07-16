# MotoKey API — Roadmap

## Milestones

- ✅ **v1.0 Core Platform** — L1→L8 (shipped 2026-05-29)
- ✅ **v1.1 L9 Stripe Billing** — Phases 3→7 (shipped 2026-06-16)
- ✅ **v1.2 Pioneer Program & Production Go-Live** — Phases 8→11 (shipped 2026-07-01, Phase 8 parked as known gap — see MILESTONES.md)
- ✅ **v1.3 App Client Mobile** — Phases 12→17 (shipped 2026-07-08, MSTORE-02 parked as known gap — see MILESTONES.md)
- ✅ **v1.4 Maintenance — CLIENT Fixture & Schema Drift** — Phases 18→19 (shipped 2026-07-09)
- ✅ **v1.5 Résolution dérive schema.sql** — Phases 20→22 (shipped 2026-07-11)
- ✅ **v1.6 Suivi usure consommables + anti-fraude km** — Phases 23→28 (shipped 2026-07-16)
- 🚧 **v1.7 Édition devis brouillon** — Phase 29 (in progress)

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

<details open>
<summary>🚧 v1.7 Édition devis brouillon (Phase 29) — IN PROGRESS</summary>

**Milestone Goal:** Permettre au garage de modifier un devis en statut brouillon (lignes + remise) avant son envoi au client, en réutilisant le formulaire de création existant en mode édition. Aucun travail backend requis — `PUT /devis/:id` et `SBLayer.Devis.update()` supportent déjà l'édition de `lignes` + `entete.remise_pct` tant que `statut === 'brouillon'`.

- [ ] **Phase 29: Édition Devis Brouillon (frontend)** - Le garage peut modifier un devis brouillon existant depuis la liste des devis, sans le recréer et sans changer son statut

</details>

## Progress

**Execution Order:**
Phases execute in numeric order: 18 → 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26 → 27 → 28 → 29 (23→28 are sequential — each depends on the prior phase's output; Phase 27 depends on both 25 and 26; Phase 28 depends on 25 and 26, can run in parallel with 27; Phase 29 is standalone, depends only on pre-existing v1.0 devis infrastructure)

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
| Phase 29 | v1.7 | 0/1 | Planned | - |

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
**Plans**: 1 plan (single wave)
Plans:
- [ ] 29-01-PLAN.md — Mode édition devis brouillon dans app.html (harness Nyquist + implémentation + vérification humaine)
**UI hint**: yes

---
*Roadmap updated: 2026-07-16 — v1.7 milestone (Édition devis brouillon) started. Phase 29 created, continuing numbering from v1.6's last phase (28). Single-phase milestone: small, well-understood, single-surface frontend scope (backend already fully supports the edit path). Next: /gsd:plan-phase 29.*
