'use strict';

// Crée (ou réutilise) les 3 produits MotoKey + crée 6 Price IDs en LIVE mode.
// Émet à la fin les 6 commandes Railway CLI (STRIPE_PRICE_*) copiables directement.
//
// Usage    : node scripts/stripe-seed-products-live.js
// Pré-requis : STRIPE_SECRET_KEY=sk_live_… dans .env (à la racine du repo)
//
// ⚠️  Ce script opère en PRODUCTION Stripe. Ne l'exécuter qu'avec une live key.
//     Pour le mode test, utiliser scripts/stripe-seed-products.js.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// ── GARDE-FOU LIVE MODE ─────────────────────────────────────────────────────
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('❌  STRIPE_SECRET_KEY absent du .env');
  process.exit(1);
}
if (!key.startsWith('sk_live_')) {
  console.error('❌  STRIPE_SECRET_KEY n\'est PAS une clé LIVE (attendu : sk_live_…). Reçu : ' + key.slice(0, 8) + '…');
  console.error('    Ce script crée des produits en PRODUCTION. Pour le test, utilisez scripts/stripe-seed-products.js.');
  process.exit(1);
}
// ────────────────────────────────────────────────────────────────────────────

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLANS = [
  {
    key: 'solo',
    name: 'MotoKey Solo',
    description: '50 motos · 2 utilisateurs',
    monthly_cents: 7900,
    annual_cents:  79000,
  },
  {
    key: 'atelier',
    name: 'MotoKey Atelier',
    description: '200 motos · 5 utilisateurs',
    monthly_cents: 14900,
    annual_cents:  149000,
  },
  {
    key: 'concession',
    name: 'MotoKey Concession',
    description: 'Motos illimitées · Utilisateurs illimités',
    monthly_cents: 29900,
    annual_cents:  299000,
  },
];

async function seed() {
  const results = {};

  for (const plan of PLANS) {
    console.log(`\n▶  Traitement produit : ${plan.name}`);

    // Guard anti-doublon : rechercher par metadata plan_key avant de créer.
    // Stripe products.search est disponible dans stripe@22.x.
    const existing = await stripe.products.search({
      query: `metadata['plan_key']:'${plan.key}'`,
      limit: 1,
    });

    let product;
    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log(`   ⚠️  Produit déjà existant : ${product.id} — réutilisation`);
    } else {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { plan_key: plan.key },
      });
      console.log(`   product_id : ${product.id}`);
    }

    // Les prix Stripe sont immuables — on crée toujours de nouveaux prix.
    const priceMonthly = await stripe.prices.create({
      product: product.id,
      currency: 'eur',
      unit_amount: plan.monthly_cents,
      recurring: { interval: 'month' },
      nickname: `${plan.name} — Mensuel`,
      metadata: { plan_key: plan.key, billing: 'monthly' },
    });

    const priceAnnual = await stripe.prices.create({
      product: product.id,
      currency: 'eur',
      unit_amount: plan.annual_cents,
      recurring: { interval: 'year' },
      nickname: `${plan.name} — Annuel`,
      metadata: { plan_key: plan.key, billing: 'annual' },
    });

    results[plan.key] = {
      product_id: product.id,
      monthly: priceMonthly.id,
      annual:  priceAnnual.id,
    };

    console.log(`   price monthly : ${priceMonthly.id}`);
    console.log(`   price annual  : ${priceAnnual.id}`);
  }

  // ── OUTPUT RAILWAY CLI ──────────────────────────────────────────────────
  console.log('\n=== COMMANDES RAILWAY CLI — COPIER-COLLER (à la racine du repo) ===');
  console.log(`railway variables set STRIPE_PRICE_SOLO_MONTHLY=${results.solo.monthly}`);
  console.log(`railway variables set STRIPE_PRICE_SOLO_ANNUAL=${results.solo.annual}`);
  console.log(`railway variables set STRIPE_PRICE_ATELIER_MONTHLY=${results.atelier.monthly}`);
  console.log(`railway variables set STRIPE_PRICE_ATELIER_ANNUAL=${results.atelier.annual}`);
  console.log(`railway variables set STRIPE_PRICE_CONCESSION_MONTHLY=${results.concession.monthly}`);
  console.log(`railway variables set STRIPE_PRICE_CONCESSION_ANNUAL=${results.concession.annual}`);
  console.log('\n⚠️  À poser séparément (secrets récupérés depuis Stripe Dashboard) :');
  console.log('railway variables set STRIPE_SECRET_KEY=sk_live_...');
  console.log('railway variables set STRIPE_WEBHOOK_SECRET=whsec_...');
  console.log('\n⚠️  Mettre AUSSI à jour les 6 STRIPE_PRICE_* du .env LOCAL avec ces IDs live AVANT de lancer stripe-configure-portal.js');
  console.log('=== fin RAILWAY CLI ===\n');
  // ────────────────────────────────────────────────────────────────────────

  return results;
}

seed().catch(err => {
  console.error('❌  Erreur Stripe :', err.message);
  process.exit(1);
});
