# MotoKey API — Roadmap

## Milestones

- ✅ **v1.0 Core Platform** — L1→L8 (shipped 2026-05-29)
- ✅ **v1.1 L9 Stripe Billing** — Phases 3→7 (shipped 2026-06-16)
- ✅ **v1.2 Pioneer Program & Production Go-Live** — Phases 8→11 (shipped 2026-07-01, Phase 8 parked as known gap — see MILESTONES.md)
- ✅ **v1.3 App Client Mobile** — Phases 12→17 (shipped 2026-07-08, MSTORE-02 parked as known gap — see MILESTONES.md)

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

## Progress

| Milestone | Phases | Status | Shipped |
|-----------|--------|--------|---------|
| v1.0 | L1–L8 | ✅ Complete | 2026-05-29 |
| v1.1 | 3–7 | ✅ Complete | 2026-06-16 |
| v1.2 | 8–11 | ✅ Complete (Phase 8 parked) | 2026-07-01 |
| v1.3 | 12–17 | ✅ Complete (MSTORE-02 parked) | 2026-07-08 |

---
*Roadmap updated: 2026-07-08 — v1.3 App Client Mobile shipped, archived to milestones/v1.3-ROADMAP.md.*
