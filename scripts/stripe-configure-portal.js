'use strict';

// Configure le Stripe Customer Portal programmatiquement.
// Usage : node scripts/stripe-configure-portal.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function configurePortal() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('❌  STRIPE_SECRET_KEY absent'); process.exit(1);
  }

  // Récupérer la config existante si elle existe
  const { data: existing } = await stripe.billingPortal.configurations.list({ limit: 1 });

  const params = {
    business_profile: {
      headline: 'MotoKey — Gérez votre abonnement garage',
    },
    features: {
      customer_update: {
        enabled:          true,
        allowed_updates:  ['email', 'address', 'name', 'phone'],
      },
      payment_method_update: {
        enabled: true,
      },
      subscription_update: {
        enabled:              true,
        default_allowed_updates: ['price'],
        proration_behavior:   'create_prorations',
        products: [
          // Solo
          {
            product: (await stripe.prices.retrieve(process.env.STRIPE_PRICE_SOLO_MONTHLY)).product,
            prices:  [process.env.STRIPE_PRICE_SOLO_MONTHLY, process.env.STRIPE_PRICE_SOLO_ANNUAL],
          },
          // Atelier
          {
            product: (await stripe.prices.retrieve(process.env.STRIPE_PRICE_ATELIER_MONTHLY)).product,
            prices:  [process.env.STRIPE_PRICE_ATELIER_MONTHLY, process.env.STRIPE_PRICE_ATELIER_ANNUAL],
          },
          // Concession
          {
            product: (await stripe.prices.retrieve(process.env.STRIPE_PRICE_CONCESSION_MONTHLY)).product,
            prices:  [process.env.STRIPE_PRICE_CONCESSION_MONTHLY, process.env.STRIPE_PRICE_CONCESSION_ANNUAL],
          },
        ],
      },
      subscription_cancel: {
        enabled:             true,
        mode:                'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
        },
      },
      invoice_history: { enabled: true },
    },
    default_return_url: 'https://motokey11-production.up.railway.app/app?section=params',
  };

  let config;
  if (existing.length > 0) {
    config = await stripe.billingPortal.configurations.update(existing[0].id, params);
    console.log(`✅ Configuration mise à jour : ${config.id}`);
  } else {
    config = await stripe.billingPortal.configurations.create(params);
    console.log(`✅ Configuration créée : ${config.id}`);
  }

  console.log(`   Actif        : ${config.active}`);
  console.log(`   Abonnement update  : ${config.features.subscription_update.enabled}`);
  console.log(`   Paiement update    : ${config.features.payment_method_update.enabled}`);
  console.log(`   Annulation         : ${config.features.subscription_cancel.enabled}`);
  console.log(`   Historique factures: ${config.features.invoice_history.enabled}`);
  console.log(`   Return URL         : ${config.default_return_url}`);
}

configurePortal().catch(err => {
  console.error('❌  Erreur :', err.message);
  process.exit(1);
});
