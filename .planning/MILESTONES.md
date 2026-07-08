# MotoKey — Milestones

## v1.3 App Client Mobile (Shipped: 2026-07-08)

**Phases completed:** 6 phases (12→17), 25 plans, 54 tasks
**Git range:** `7bb415c` → `ca2f0b7` (112 commits, 137 files changed, +21759/-252 lines)
**Timeline:** 8 days (2026-07-01 → 2026-07-08)

**Key accomplishments:**

- Backend push foundation: `POST`/`DELETE /client/device-tokens` + `GET /client/me`, backed by migration 16 (`client_device_tokens`), curl-testable independently of any mobile app (Phase 12).
- `services/pushService.js` — `sendToToken`/`sendPush` against `expo-server-sdk`, with DB-backed idempotency (`push_send_log`, migration 17) and a `PUSH_ENABLED` console.log fallback mirroring `emailService.js`'s convention (Phase 13).
- Native mobile app scaffolded from scratch: Expo Router + TypeScript, AES-encrypted `LargeSecureStore` token storage, proactive single-flight session refresh (60s poll + `AppState` foreground listener), full auth flow (login/register/OTP verify/reset) — all confirmed end-to-end on a real Android device, including the foreground token-refresh mechanism (MAUTH-03), closed 2026-07-08 (Phase 14).
- Full feature parity with `MotoKey_Client.html`: motos list (couleur/score), devis (consult/accept/refuse), historique d'entretien, liaison garage (revendiquer/révoquer), offline read-only cache with "dernière mise à jour" timestamp (Phase 15).
- End-to-end push notifications: soft-ask permission screen, device-token lifecycle (register on accept, unregister on logout, silent foreground retry), devis-received push with deep link to the concerned devis, real device delivery proven live multiple times (Phase 17-04, and again 2026-07-08 after resolving a Railway config + FCM credentials incident) (Phase 16).
- Maintenance-reminder push via a secret-gated cron (idempotent per tier-crossing, no re-run spam) + deep link to the concerned moto; real EAS Android dev build with Firebase FCM V1; Apple Privacy Manifest / Google Data Safety content prepared for store submission (Phase 17).
- Along the way: 4 real production bugs found and fixed via live on-device testing that static code review alone would not have caught — a devis-acceptance status literal mismatch (`'valide'` vs. the live DB's actual `'accepte'`) that broke devis acceptance in prod, a missing moto join on the client-side devis list, a notification-routing bug dropping the target devis ID, and a missing Android notification channel silently suppressing heads-up banners.

### Known Gaps

- **MSTORE-02 — App Store Submission Validation.** Not satisfied. The app is code/content-ready for submission (Privacy Manifest, Data Safety, EAS build profiles all in place — MSTORE-01), but has never actually been submitted to TestFlight or a Google Play internal test track. Blocked on Mehdi creating two paid developer accounts (Apple Developer Program, $99/yr; Google Play Console, $25 one-time) — no code or planning work remains, purely an external account gate. Matches the exact precedent of v1.2's Phase 8/BILL-06 (also shipped as a known, accepted gap). See `.planning/milestones/v1.3-MILESTONE-AUDIT.md` for the full audit report (status: gaps_found, 14/15 requirements satisfied).

---

## v1.2 Pioneer Program & Production Go-Live (Shipped: 2026-07-01)

**Phases completed:** 3/4 phases complete (Phase 8 parked — see Known Gaps), 7 plans, 26 commits
**Git range:** v1.1 → 4d71ebd

**Key accomplishments:**

- Coupon PIONEER2026 (100% off, 3 mois repeating) + PromotionCode (max_redemptions 30) créés via script idempotent, `allow_promotion_codes: true` activé dans `createCheckoutSession()`, garde-fou non-migration documenté (PIONR-01/02/03)
- Template email annulation définitive `subscription-cancelled` branché sur `customer.subscription.deleted` (NOTIF-03), envoi Resend non bloquant
- Checklist opérationnelle BILLING_ENFORCE=true (query D-07, flip Railway D-09, rollback) livrée ; NOTIF-04 vérifié couvert par le template `billing-confirm` existant sans nouveau code (BILL-05)
- `Motos.list()` enrichi (JOIN `plan_entretien`, calcul `pct_max_usage`) + chips "Révision dépassée"/"Révision à planifier" sur le tableau de bord (UX-02) ; badge rouge score < 40 confirmé (UX-01)
- Idempotent Stripe live-mode product seed script (`stripe-seed-products-live.js`) avec garde-fou `sk_live_`, prêt pour l'exécution opérateur de Phase 8

### Known Gaps

- **BILL-06 / Phase 8 (Stripe Live Mode)** — NON satisfait. Seul le script de seed (08-01) a été livré ; la bascule opérationnelle réelle (08-02 : clés live, webhook live, Price IDs live, flip Railway) n'a jamais été exécutée — bloquée sur une action humaine Stripe Dashboard que Mehdi n'a pas encore faite. `STRIPE_SECRET_KEY` reste `sk_test_…` et `BILLING_ENFORCE=false` en prod à la clôture de ce milestone.
  - Conséquence directe : le Pioneer Program (Phase 9) et l'enforcement de quotas (BILL-05, Phase 10) sont **code-complets et vérifiés câblés de bout en bout**, mais tournent uniquement contre Stripe TEST tant que Phase 8 n'est pas exécutée.
  - Reste à faire avant activation réelle : créer `scripts/stripe-create-pioneer-coupon-live.js` (référencé mais absent), puis exécuter la checklist `08-02-PLAN.md`.
  - Voir `.planning/milestones/v1.2-MILESTONE-AUDIT.md` pour le rapport d'audit complet (status: gaps_found).

---

## v1.1: L9 Stripe Billing ✅ SHIPPED 2026-06-16

**Phases:** 3→7 (5 phases) | **Commits:** 6 | **Files:** 12 | **Lines:** +1120
**Git range:** 68e0ea3 → 9f28fe0

**Delivered:**

1. Migration 15 — 8 colonnes billing sur `garages` + table `billing_events` (idempotency UNIQUE)
2. 6 Price IDs Stripe (Solo 79€ / Atelier 149€ / Concession 299€ × mensuel + annuel -17%)
3. Webhook state machine — 7 événements, grace period 7j, idempotency guard
4. Stripe Checkout trial 14j sans CB + auto-trial garages existants + email confirm
5. Enforcement quotas motos/users HTTP 402 avec flag BILLING_ENFORCE
6. Customer Portal configuré + emails trial-ending + payment-failed + section Abonnement app.html

**Archive:** [.planning/milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

---

## v1.0: Core Platform ✅ SHIPPED 2026-05-29

**Phases:** L1→L8 (cumul)

**Delivered:**

- L1 Auth garage (login/logout/JWT)
- L2 Devis client + validation/refus
- L3a OR (ordres de réparation) backend + frontend
- L3c Catalogue pièces + scanner EAN-13
- L4 RBAC 4 niveaux (ADMIN/CONCESSION/PRO/MECANO)
- L4v2 Hardening RBAC — table garage_users, création MECANO, timer inactivité
- L7b Auth client (register/OTP/reset/welcome email Resend)
- L8 Liaison polymorphe moto (propriété garage/client/inconnu, cession, réclamation, révocation)

---
