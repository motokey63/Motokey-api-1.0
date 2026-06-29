# MotoKey API — Roadmap

## Milestones

- ✅ **v1.0 Core Platform** — L1→L8 (shipped 2026-05-29)
- ✅ **v1.1 L9 Stripe Billing** — Phases 3→7 (shipped 2026-06-16)
- 📋 **v1.2 Pioneer Program & Production Go-Live** — Phases 8→11 (en cours)

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

### 📋 v1.2 Pioneer Program & Production Go-Live

- [ ] **Phase 8: Stripe Live Mode** — Stripe opérationnel en production réelle (clés live + Price IDs + webhook)
- [ ] **Phase 9: Pioneer Program** — Programme d'accès fondateur avec coupon 3 mois + prix bloqué 24 mois + compteur 30 places
- [x] **Phase 10: Live Operations** — Enforcement des quotas activé en prod + emails annulation et bienvenue (completed 2026-06-29)
- [ ] **Phase 11: Dashboard UX Alerts** — Badge ROUGE sur fiches moto + alerte kilométrage révision dépassé

## Phase Details

### Phase 8: Stripe Live Mode
**Goal:** MotoKey accepte les paiements réels — Stripe live mode entièrement opérationnel avec clés API live, 6 Price IDs live recréés via script, et webhook live enregistré sur Railway.
**Depends on:** Phase 7 (v1.1 — infrastructure test mode existante)
**Requirements:** BILL-06
**Success Criteria** (what must be TRUE):
  1. Un garage peut initier un checkout Stripe et être débité en euros réels (pas de mode test)
  2. Les 6 Price IDs live (Solo/Atelier/Concession × mensuel/annuel) sont actifs et lisibles via Stripe Dashboard
  3. Le webhook Stripe live reçoit et traite les événements sans erreur de signature (400 absents dans Railway logs)
  4. Les clés API live (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) sont posées sur Railway sans jamais apparaître dans le code
**Plans:** 1/2 plans executed
- [x] 08-01-PLAN.md — Créer scripts/stripe-seed-products-live.js (6 Price IDs live + output Railway CLI, idempotent)
- [ ] 08-02-PLAN.md — Checklist opérationnelle de bascule live (clés + webhook + Railway vars + portal + validation D-05)

### Phase 9: Pioneer Program
**Goal:** Les 30 premiers garages peuvent s'inscrire avec un avantage fondateur — 3 mois gratuits via coupon et tarif verrouillé 24 mois — et le programme se ferme automatiquement une fois le quota atteint.
**Depends on:** Phase 8 (Stripe live mode — le coupon et les Price IDs dédiés existent en live)
**Requirements:** PIONR-01, PIONR-02, PIONR-03
**Success Criteria** (what must be TRUE):
  1. Un garage saisit PIONEER2026 au checkout Stripe et obtient 3 mois sans frais avant le premier débit
  2. Après activation Pioneer, la fiche Stripe du garage montre un price ID non-migration (tarif figé, insensible aux futures hausses)
  3. Au 30ème garage enrollé, le coupon PIONEER2026 est automatiquement désactivé — le 31ème tentant le code reçoit une erreur Stripe
  4. Le compteur Pioneer (garages enrollés / 30) est visible et précis à tout moment (via Stripe Dashboard ou log applicatif)
**Plans:** 0/1 plans executed
- [ ] 09-01-PLAN.md — Coupon PIONEER2026 + PromotionCode (max 30) idempotent, allow_promotion_codes au checkout, note non-migration PIONR-02
**UI hint**: yes

### Phase 10: Live Operations
**Goal:** MotoKey fonctionne en conditions de production réelles — les garages hors quota sont bloqués effectivement et les deux emails manquants (bienvenue trial + annulation définitive) sont envoyés automatiquement.
**Depends on:** Phase 8 (Stripe live mode opérationnel), Phase 9 (Pioneer Program actif)
**Requirements:** BILL-05, NOTIF-03, NOTIF-04
**Success Criteria** (what must be TRUE):
  1. Un garage Solo ayant atteint sa limite de 10 motos reçoit HTTP 402 en tentant d'en créer une 11ème (BILLING_ENFORCE=true actif)
  2. Un garage dont l'abonnement est annulé définitivement (`customer.subscription.deleted`) reçoit un email Resend dans les 5 minutes
  3. Un garage qui active son trial via Checkout reçoit un email Resend de bienvenue confirmant les 14 jours d'essai
  4. Les deux templates email (bienvenue + annulation) s'affichent correctement avec le nom du garage et les informations d'abonnement
**Plans:** 2/2 plans complete
- [x] 10-01-PLAN.md — Template subscription-cancelled + handleSubscriptionBlocked({ isDeleted }) + différenciation deleted/paused (NOTIF-03)
- [x] 10-02-PLAN.md — Checklist enforcement BILLING_ENFORCE (query D-07 + flip Railway + test 402) + vérification NOTIF-04 couvert par billing-confirm (BILL-05, NOTIF-04)

### Phase 11: Dashboard UX Alerts
**Goal:** Les fiches moto dans le tableau de bord garage affichent des alertes visuelles immédiates pour les deux signaux critiques : score d'intégrité insuffisant (ROUGE) et kilométrage de révision dépassé.
**Depends on:** Phase 8 (déploiement live opérationnel)
**Requirements:** UX-01, UX-02
**Success Criteria** (what must be TRUE):
  1. Une fiche moto avec score < 40 affiche un badge rouge visible sans cliquer sur la fiche (tableau de bord liste principale)
  2. Une fiche moto dont le kilométrage actuel dépasse le seuil de révision affiche une alerte entretien directement sur la carte
  3. La logique de seuil kilométrique est calculée à l'affichage (sans nouveau champ DB, sans migration SQL)
  4. Les badges et alertes disparaissent immédiatement si le score remonte ou si une intervention remet le compteur à zéro
**Plans**: TBD
**UI hint**: yes

## Progress Table

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| L1–L8 | v1.0 | — | ✅ Complete | 2026-05-29 |
| Phase 3 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 4 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 5 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 6 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 7 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 8 | v1.2 | 1/2 | En cours | - |
| Phase 9 | v1.2 | 0/1 | Planned | - |
| Phase 10 | v1.2 | 0/2 | Planned | - |
| Phase 11 | v1.2 | 0/? | Not started | - |

---
*Roadmap updated: 2026-06-29 — Phase 10 planifiée (2 plans, BILL-05/NOTIF-03/NOTIF-04)*
