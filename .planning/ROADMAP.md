# MotoKey API — Roadmap

## Milestones

- ✅ **v1.0 Core Platform** — L1→L8 (shipped 2026-05-29)
- ✅ **v1.1 L9 Stripe Billing** — Phases 3→7 (shipped 2026-06-16)
- ✅ **v1.2 Pioneer Program & Production Go-Live** — Phases 8→11 (shipped 2026-07-01, Phase 8 parked as known gap — see MILESTONES.md)
- ✅ **v1.3 App Client Mobile** — Phases 12→17 (shipped 2026-07-08, MSTORE-02 parked as known gap — see MILESTONES.md)
- ✅ **v1.4 Maintenance — CLIENT Fixture & Schema Drift** — Phases 18→19 (shipped 2026-07-09)
- ✅ **v1.5 Résolution dérive schema.sql** — Phases 20→22 (shipped 2026-07-11)

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

## Progress

**Execution Order:**
Phases execute in numeric order: 18 → 19 → 20 → 21 → 22 (20→21→22 are sequential — each depends on the prior phase's output)

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

---
*Roadmap updated: 2026-07-11 — v1.5 milestone archived (shipped). Next: /gsd:new-milestone.*
