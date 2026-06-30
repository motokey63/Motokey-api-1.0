# Requirements: MotoKey v1.2

**Defined:** 2026-06-24
**Core Value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.

## v1.2 Requirements

Requirements pour le milestone Pioneer Program & Production Go-Live. Chaque requirement mappe à une phase du roadmap.

### Pioneer Program

- [x] **PIONR-01**: L'administrateur garage peut appliquer le code PIONEER2026 au checkout pour bénéficier de 3 mois gratuits (coupon Stripe repeating)
- [x] **PIONR-02**: Les garages Pioneer ont leur tarif courant verrouillé pendant 24 mois (non-migration price ID dédié)
- [x] **PIONR-03**: Le programme Pioneer se ferme automatiquement après 30 garages participants (coupon désactivé / compteur auto)

### Billing Go-Live

- [x] **BILL-05**: Les garages en dépassement de quotas sont effectivement bloqués en production (BILLING_ENFORCE=true, HTTP 402 actif)
- [x] **BILL-06**: MotoKey accepte les paiements réels — Stripe live mode opérationnel (clés API live + 6 Price IDs live + webhook live sur Railway)

### Notifications Email

- [x] **NOTIF-03**: Le garage reçoit un email Resend quand son abonnement est annulé définitivement (`customer.subscription.deleted`)
- [x] **NOTIF-04**: Le garage reçoit un email Resend de bienvenue lors de l'activation du trial (`checkout.session.completed`)

### UX Dashboard

- [x] **UX-01**: L'interface garage affiche un badge rouge sur les fiches moto dont le score d'intégrité est < 40 (statut ROUGE)
- [x] **UX-02**: L'interface garage affiche une alerte entretien sur les fiches moto dont le kilométrage de révision est dépassé (seuil dynamique, sans nouveau champ DB)

## Requirements Futurs (v1.3+)

Reconnus mais hors scope v1.2.

### Monitoring & Analytics
- Tableau de bord admin : garages actifs / en trial / churned
- Alertes email internes sur les événements billing critiques

### UX Avancé
- Seuil de révision configurable par moto (avec champ DB)
- Historique des alertes entretien

## Hors Scope

Exclusions explicites pour éviter le scope creep.

| Feature | Raison |
|---------|--------|
| Stripe Tax / TVA automatique | Différé post-v1.2, complexité comptable |
| Mode offline | Hors scope actuel, complexité trop élevée |
| App mobile native | Web-first, portage mobile ultérieur |
| Stripe Elements in-app | Hors PCI scope, Checkout hosted suffit |
| SCA/3DS gestion cartes EU | Faible fréquence B2B France, différé |

## Traceabilité

Mapping requirements → phases.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BILL-06 | Phase 8 | Complete |
| PIONR-01 | Phase 9 | Complete |
| PIONR-02 | Phase 9 | Complete |
| PIONR-03 | Phase 9 | Complete |
| BILL-05 | Phase 10 | Complete |
| NOTIF-03 | Phase 10 | Complete |
| NOTIF-04 | Phase 10 | Complete |
| UX-01 | Phase 11 | Complete |
| UX-02 | Phase 11 | Complete |

**Coverage:**
- v1.2 requirements: 9 total
- Mappés à des phases: 9/9 ✓
- Non mappés: 0 ✓

---
*Requirements définis: 2026-06-24*
*Milestone: v1.2 Pioneer Program & Production Go-Live*
*Traceabilité remplie: 2026-06-24*
