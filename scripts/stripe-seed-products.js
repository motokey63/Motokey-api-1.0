'use strict';

// Crée les 3 produits MotoKey + leurs 2 prix chacun dans Stripe (mode test).
// Usage : node scripts/stripe-seed-products.js
// Pré-requis : STRIPE_SECRET_KEY dans .env

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

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
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌  STRIPE_SECRET_KEY absent du .env');
    process.exit(1);
  }

  const results = {};

  for (const plan of PLANS) {
    console.log(`\n▶  Création produit : ${plan.name}`);

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { plan_key: plan.key },
    });
    console.log(`   product_id : ${product.id}`);

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
      annual: priceAnnual.id,
    };

    console.log(`   price monthly : ${priceMonthly.id}`);
    console.log(`   price annual  : ${priceAnnual.id}`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅  Produits et prix créés. Variables Railway à poser :');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`STRIPE_PRICE_SOLO_MONTHLY=${results.solo.monthly}`);
  console.log(`STRIPE_PRICE_SOLO_ANNUAL=${results.solo.annual}`);
  console.log(`STRIPE_PRICE_ATELIER_MONTHLY=${results.atelier.monthly}`);
  console.log(`STRIPE_PRICE_ATELIER_ANNUAL=${results.atelier.annual}`);
  console.log(`STRIPE_PRICE_CONCESSION_MONTHLY=${results.concession.monthly}`);
  console.log(`STRIPE_PRICE_CONCESSION_ANNUAL=${results.concession.annual}`);
  console.log('═══════════════════════════════════════════════════════');

  return results;
}

seed().catch(err => {
  console.error('❌  Erreur Stripe :', err.message);
  process.exit(1);
});
