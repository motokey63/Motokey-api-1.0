'use strict';

// Crée (ou réutilise) le Coupon PIONEER2026 + le PromotionCode associé en mode TEST.
// Le Coupon applique 100% de remise pendant 3 mois (repeating), le PromotionCode
// limite les rédemptions à 30 places (max_redemptions sur le PromotionCode).
//
// Usage     : node scripts/stripe-create-pioneer-coupon.js
// Pré-requis : STRIPE_SECRET_KEY=sk_test_… dans .env (à la racine du repo)
//
// ⚠️  Phase 9 — mode TEST uniquement.
//     Pour le mode LIVE (Phase 8), réexécuter avec une sk_live_ key.
//
// Idempotent : peut être réexécuté sans créer de doublon.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// ── GARDE-FOU MODE TEST (Phase 9) ───────────────────────────────────────────
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('❌  STRIPE_SECRET_KEY absent du .env');
  process.exit(1);
}
if (!key.startsWith('sk_test_')) {
  console.error('❌  Phase 9 s\'exécute en mode TEST (attendu : sk_test_…). Reçu : ' + key.slice(0, 8) + '…');
  console.error('    Pour le mode LIVE (Phase 8), utiliser scripts/stripe-create-pioneer-coupon-live.js.');
  process.exit(1);
}
// ────────────────────────────────────────────────────────────────────────────

const stripe = require('stripe')(key);

async function createPioneerCoupon() {
  console.log('\n▶  Pioneer Program — création Coupon + PromotionCode PIONEER2026 (mode TEST)\n');

  // ── ÉTAPE 1 : Coupon idempotent (try/retrieve/catch-404) ──────────────────
  // Le Coupon définit la remise : 100% off pendant 3 mois (repeating).
  // max_redemptions n'est PAS sur le coupon — il va sur le PromotionCode (voir étape 2).
  let coupon;
  try {
    coupon = await stripe.coupons.retrieve('PIONEER2026');
    console.log('   ⚠️  Coupon PIONEER2026 déjà existant — réutilisation');
    console.log('       percent_off: ' + coupon.percent_off + '% · duration: ' + coupon.duration + ' (' + coupon.duration_in_months + ' mois)');
  } catch (e) {
    if (e.statusCode === 404 || e.code === 'resource_missing') {
      coupon = await stripe.coupons.create({
        id: 'PIONEER2026',
        name: 'Pioneer Program — 3 mois offerts',
        percent_off: 100,
        duration: 'repeating',
        duration_in_months: 3,
        // PAS de max_redemptions ici — le plafond va sur le PromotionCode
      });
      console.log('   ✅  Coupon créé : ' + coupon.id);
      console.log('       percent_off: ' + coupon.percent_off + '% · duration: ' + coupon.duration + ' (' + coupon.duration_in_months + ' mois)');
    } else {
      throw e;
    }
  }

  // ── ÉTAPE 2 : PromotionCode idempotent (list par code — retrieve par string impossible) ──
  // Le PromotionCode expose le code client-facing tapé au checkout (PIONEER2026).
  // max_redemptions: 30 → fermeture auto à la 30ème rédemption (Stripe natif).
  const existingPromos = await stripe.promotionCodes.list({ code: 'PIONEER2026', limit: 1 });
  if (existingPromos.data.length > 0) {
    const pc = existingPromos.data[0];
    console.log('   ⚠️  PromotionCode PIONEER2026 déjà existant : ' + pc.id);
    console.log('       ' + pc.times_redeemed + '/' + pc.max_redemptions + ' rédemptions utilisées · actif : ' + pc.active);
  } else {
    const promoCode = await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code: 'PIONEER2026',
      max_redemptions: 30,
    });
    console.log('   ✅  PromotionCode créé : ' + promoCode.id + ' (code: ' + promoCode.code + ')');
    console.log('       max_redemptions: ' + promoCode.max_redemptions + ' · actif : ' + promoCode.active);
  }

  console.log('\n✅  Pioneer Program configuré en mode TEST.');
  console.log('    → Tester en Stripe Checkout test : saisir PIONEER2026 au champ "Code promo"');
  console.log('    → Remise attendue : 100% pendant 3 mois (après le trial 14j)');
  console.log('    → Stripe Dashboard TEST → Promotions → PIONEER2026 → max_redemptions : 30\n');
}

createPioneerCoupon().catch(err => {
  console.error('❌  Erreur Stripe :', err.message);
  process.exit(1);
});
