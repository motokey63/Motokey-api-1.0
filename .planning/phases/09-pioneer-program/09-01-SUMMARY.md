---
phase: 09-pioneer-program
plan: "01"
subsystem: billing/stripe
tags: [stripe, coupon, promotion-code, pioneer-program, checkout]
dependency_graph:
  requires: []
  provides: [PIONEER2026 coupon + PromotionCode Stripe TEST, allow_promotion_codes checkout]
  affects: [services/stripeService.js, scripts/]
tech_stack:
  added: []
  patterns: [idempotent Stripe resource script, try/retrieve/catch-404 coupon, list-before-create PromotionCode]
key_files:
  created:
    - scripts/stripe-create-pioneer-coupon.js
    - scripts/PIONEER-NON-MIGRATION.md
  modified:
    - services/stripeService.js
decisions:
  - "max_redemptions: 30 sur PromotionCode (pas le Coupon) — plafond par code customer-facing"
  - "allow_promotion_codes: true dans createCheckoutSession() — champ Code promo natif Stripe"
  - "Pas de Price ID Pioneer dédié — verrouillage tarifaire 24 mois garanti nativement par Stripe"
  - "Garde-fou operationnel documente dans scripts/PIONEER-NON-MIGRATION.md (PIONR-02)"
metrics:
  duration: "15 min"
  completed_date: "2026-06-29"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
---

# Phase 09 Plan 01: Pioneer Program (Coupon + PromotionCode Stripe) Summary

**One-liner:** Coupon PIONEER2026 (100% off, 3 mois repeating) + PromotionCode (max_redemptions 30) crees via script idempotent TEST, `allow_promotion_codes: true` active dans createCheckoutSession(), garde-fou non-migration documente.

---

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Creer scripts/stripe-create-pioneer-coupon.js (Coupon + PromotionCode idempotent) | 3c288dc | scripts/stripe-create-pioneer-coupon.js |
| 2 | Activer allow_promotion_codes dans createCheckoutSession() + log Pioneer webhook | 967a0a1 | services/stripeService.js |
| 3 | Documenter le garde-fou non-migration PIONR-02 (tarif verrouille 24 mois) | f317132 | scripts/PIONEER-NON-MIGRATION.md |

---

## Requirements Coverage

| Req ID | Description | Status | How |
|--------|-------------|--------|-----|
| PIONR-01 | Code PIONEER2026 saisissable au checkout => 3 mois gratuits | DONE | PromotionCode PIONEER2026 cree + `allow_promotion_codes: true` dans createCheckoutSession() |
| PIONR-02 | Tarif verrouille 24 mois pour garages Pioneer | DONE | Comportement natif Stripe + garde-fou operationnel PIONEER-NON-MIGRATION.md |
| PIONR-03 | Programme se ferme automatiquement apres 30 garages | DONE | `max_redemptions: 30` sur le PromotionCode => Stripe desactive a la 30eme redemption |

---

## Decisions Made

1. **`max_redemptions: 30` sur le PromotionCode, pas le Coupon.** Un Coupon peut etre applique via API directement ; le PromotionCode controle la limite du code customer-facing tape au checkout. Conforme aux docs Stripe@22.2.0.

2. **Script idempotent avec try/retrieve/catch-404 pour le Coupon et list-before-create pour le PromotionCode.** `stripe.promotionCodes.retrieve()` prend un Stripe ID (`promo_xxx`), pas le code string — `list({ code: 'PIONEER2026', limit: 1 })` est la seule facon de detecter l'existence par code (Pitfall 6).

3. **Pas de Price ID Pioneer dedie (PIONR-02).** Le verrouillage tarifaire est garanti nativement par Stripe : les Price IDs sont immuables, les souscriptions ne migrent jamais automatiquement. Seule obligation : ne jamais appeler `stripe.subscriptions.update` avec un nouveau priceId sur les souscriptions Pioneer. Documente dans `scripts/PIONEER-NON-MIGRATION.md`.

4. **Log `[pioneer]` dans `handleCheckoutCompleted()`.** Visibilite Railway des activations Pioneer sans appel Stripe API supplementaire. Detection via `session.total_details.amount_discount > 0`.

---

## Important Notes (required by plan output spec)

### Timing trial + coupon (Pitfall 3)

Le coupon `duration_in_months: 3` commence APRES le trial 14 jours — Stripe ne genere aucune facture pendant le trial, donc le coupon ne se consomme pas pendant cette periode. Avantage fondateur effectif : **~3,5 mois sans frais** (14j trial + 3 mois coupon 100% off). Les 3 mois du coupon courent a partir de la premiere facture post-trial.

### Comptage des redemptions (Pitfall 5)

`max_redemptions` est comptabilise au moment ou `checkout.session.completed` est declenche — **pas** quand la premiere facture est payee. Un garage qui complete le checkout en trial (sans CB) compte immediatement comme 1 redemption Pioneer. Si 30 garages s'inscrivent en trial sans jamais entrer de CB, le programme sera ferme alors qu'aucun revenu reel n'a ete genere. Comportement attendu et acceptable.

### Edge case payment_method_collection + trial (Pitfall 4)

Avec `payment_method_collection: 'if_required'` et un trial 14j, Stripe ne collecte pas de CB au checkout. A la fin du trial, `trial_settings.end_behavior.missing_payment_method: 'pause'` suspend la souscription si aucune CB n'est presente — meme si les 3 mois suivants seraient a 0EUR via coupon Pioneer. Ce comportement existait deja avant Phase 9 (design existant) et n'est pas un bug : la CB est requise pour sortir du mode pause, meme si la prochaine facture est a 0EUR.

### Sequencage TEST => LIVE (Phase 8)

Ces ressources Stripe (coupon PIONEER2026 + PromotionCode) sont creees en **mode TEST**. Lors de Phase 8 (bascule Stripe live mode), le script devra etre reexecute avec une cle `sk_live_` (le garde-fou `sk_test_` sera a changer en `sk_live_`). Le coupon PIONEER2026 devra etre recree en mode live avant d'activer le Pioneer Program en production reelle.

### Garde-fou non-migration (PIONR-02)

La promesse de tarif verrouille 24 mois est documentee dans `scripts/PIONEER-NON-MIGRATION.md`. Ce fichier est la reference operationnelle a consulter lors de toute future hausse de prix. Voir aussi : sections "Regle operationnelle" et "Verification" de ce document.

---

## Deviations from Plan

None — plan executed exactly as written. All three tasks were implemented per specifications. The task commits were made in a prior session; this SUMMARY.md finalizes plan 09-01.

---

## Known Stubs

None. The script creates real Stripe objects (or skips if already existing). The `allow_promotion_codes` flag is live in `createCheckoutSession()`. No UI or DB stubs.

---

## Self-Check: PASSED

- `scripts/stripe-create-pioneer-coupon.js` — FOUND
- `scripts/PIONEER-NON-MIGRATION.md` — FOUND
- `services/stripeService.js` with `allow_promotion_codes: true` — CONFIRMED
- Commit 3c288dc — FOUND (feat(09-01): create stripe-create-pioneer-coupon.js)
- Commit 967a0a1 — FOUND (feat(09-01): activer allow_promotion_codes dans createCheckoutSession + log Pioneer webhook)
- Commit f317132 — FOUND (docs(09-01): ajouter garde-fou non-migration Pioneer (PIONR-02))
- `node --check scripts/stripe-create-pioneer-coupon.js` — PASSED
- `node --check services/stripeService.js` — PASSED
