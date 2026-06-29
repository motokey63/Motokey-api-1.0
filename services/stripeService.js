/* ══════════════════════════════════════════════════════════
   MOTOKEY — L9 Stripe Billing — Service skeleton (Phase 3)
   Initialisation Stripe + maps PRICE_IDS et PLANS.
   Importé par Phase 4 (webhook), Phase 5 (checkout), Phase 7 (portal).

   Variables Railway (mode test — price IDs générés le 16/06/2026) :
   - STRIPE_SECRET_KEY              → init du client stripe
   - STRIPE_PRICE_SOLO_MONTHLY      = price_1TixVX3hjPOvfBjHlQlZozBh
   - STRIPE_PRICE_SOLO_ANNUAL       = price_1TixVX3hjPOvfBjHScATWWR7
   - STRIPE_PRICE_ATELIER_MONTHLY   = price_1TixVY3hjPOvfBjH6bXiJdNv
   - STRIPE_PRICE_ATELIER_ANNUAL    = price_1TixVY3hjPOvfBjH0eVIHktw
   - STRIPE_PRICE_CONCESSION_MONTHLY= price_1TixVY3hjPOvfBjHwMzp22pq
   - STRIPE_PRICE_CONCESSION_ANNUAL = price_1TixVY3hjPOvfBjHN87YPMrJ
   NOTE : STRIPE_WEBHOOK_SECRET n'est PAS référencé ici — obtenu en Phase 4.
   ══════════════════════════════════════════════════════════ */

'use strict';

const emailService = require('./emailService');

const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;

let stripe = null;
if (STRIPE_ENABLED) {
  try {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    console.log('✅ [L9] Stripe initialisé');
  } catch (e) {
    console.warn('⚠️  [L9] Module stripe non disponible:', e.message);
  }
} else {
  console.log('💳 [L9] Stripe non configuré (STRIPE_SECRET_KEY absent) — mode simulation');
}

// Map plan_code → Price IDs (chargés depuis env vars Railway).
// Utilisé par Phase 5 (checkout) et Phase 7 (portal).
const PRICE_IDS = {
  solo:       { monthly: process.env.STRIPE_PRICE_SOLO_MONTHLY,       annual: process.env.STRIPE_PRICE_SOLO_ANNUAL },
  atelier:    { monthly: process.env.STRIPE_PRICE_ATELIER_MONTHLY,    annual: process.env.STRIPE_PRICE_ATELIER_ANNUAL },
  concession: { monthly: process.env.STRIPE_PRICE_CONCESSION_MONTHLY, annual: process.env.STRIPE_PRICE_CONCESSION_ANNUAL },
};

// Plans metadata (limites business — source de vérité pour Phase 6).
// motos_limit/users_limit = null → illimité (Concession).
const PLANS = {
  solo:       { label: 'MotoKey Solo',       monthly_eur: 79,  annual_eur: 790,  motos_limit: 50,   users_limit: 2 },
  atelier:    { label: 'MotoKey Atelier',    monthly_eur: 149, annual_eur: 1490, motos_limit: 200,  users_limit: 5 },
  concession: { label: 'MotoKey Concession', monthly_eur: 299, annual_eur: 2990, motos_limit: null, users_limit: null },
};

// ── NOTE POUR PHASE 4 (webhook) ───────────────────────────────────────
// motokey-api.js utilise http.createServer() NATIF — PAS Express.
// Le body parsing est une Promise custom (function body(req), ~ligne 377)
// et l'appel `await body(req)` est ~ligne 490.
// Pour POST /stripe/webhook :
//   - Intercepter la route AVANT l'appel `await body(req)`
//   - Collecter les bytes bruts via req.on('data') / req.on('end')
//   - Appeler stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)
//   - NE PAS utiliser express.raw() / express.json() — ils n'existent pas ici
// ──────────────────────────────────────────────────────────────────────

// ── PHASE 4 : Webhook handler ─────────────────────────────────────────
// Appelé depuis motokey-api.js (POST /stripe/webhook) avec les bytes bruts
// et l'event déjà vérifié (stripe.webhooks.constructEvent).
// SBLayer = require('./supabase') passé en paramètre pour éviter un import
// circulaire et permettre les tests unitaires avec un mock.
// ─────────────────────────────────────────────────────────────────────

// Résout le plan_code depuis un price_id (utilisé dans subscription.updated)
function planFromPriceId(priceId) {
  for (const [key, ids] of Object.entries(PRICE_IDS)) {
    if (ids.monthly === priceId || ids.annual === priceId) return key;
  }
  return null;
}

async function handleCheckoutCompleted(session, SBLayer) {
  const customerId    = session.customer;
  const subscriptionId = session.subscription;
  const planKey       = session.metadata?.plan_key;
  const garageId      = session.metadata?.garage_id;

  if (!garageId) {
    console.error('[webhook] checkout.session.completed: metadata.garage_id absent');
    return;
  }
  const sub      = await stripe.subscriptions.retrieve(subscriptionId);
  const planData = PLANS[planKey] || {};

  await SBLayer.Garages.updateBilling(garageId, {
    stripe_customer_id:              customerId,
    stripe_subscription_id:          subscriptionId,
    plan_code:                       planKey || null,
    subscription_status:             'active',
    subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    grace_period_ends_at:            null,
    motos_limit:                     planData.motos_limit ?? null,
    users_limit:                     planData.users_limit ?? null,
  });
  console.log(`[webhook] ✅ checkout.completed → garage ${garageId} plan ${planKey}`);

  // Pioneer Program : tracer les activations avec coupon dans les logs Railway
  if (session.total_details?.amount_discount > 0) {
    console.log(`[pioneer] coupon appliqué → garage ${garageId} (remise ${session.total_details.amount_discount})`);
  }

  // Email de confirmation — non bloquant
  const toEmail = session.customer_details?.email || session.customer_email;
  if (toEmail) {
    const trialEnd = sub.trial_end
      ? new Date(sub.trial_end * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;
    emailService.send('billing-confirm', toEmail, {
      nom:                  session.customer_details?.name || 'Garage',
      plan:                 planData.label || planKey,
      trial_end_formatted:  trialEnd,
      app_url:              process.env.FRONTEND_URL || 'https://motokey11-production.up.railway.app',
    }).catch(e => console.error('[webhook] Email billing-confirm échoué :', e.message));
  }
}

async function handleInvoicePaid(invoice, SBLayer) {
  const customerId = invoice.customer;
  const garage = await SBLayer.Garages.getByStripeCustomerId(customerId);
  if (!garage) return;

  await SBLayer.Garages.updateBilling(garage.id, {
    subscription_status:             'active',
    subscription_current_period_end: invoice.lines?.data?.[0]?.period?.end
      ? new Date(invoice.lines.data[0].period.end * 1000).toISOString()
      : undefined,
    grace_period_ends_at: null,
  });
  console.log(`[webhook] ✅ invoice.paid → garage ${garage.id} statut active`);
}

async function handleInvoicePaymentFailed(invoice, SBLayer) {
  const customerId = invoice.customer;
  const garage = await SBLayer.Garages.getByStripeCustomerId(customerId);
  if (!garage) return;

  const graceEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await SBLayer.Garages.updateBilling(garage.id, {
    subscription_status:  'grace',
    grace_period_ends_at: graceEnd,
  });
  console.log(`[webhook] ⚠️  invoice.payment_failed → garage ${garage.id} grace jusqu'au ${graceEnd}`);

  // Email notification — non bloquant
  const toEmail = invoice.customer_email;
  if (toEmail) {
    const baseUrl = process.env.FRONTEND_URL || 'https://motokey11-production.up.railway.app';
    const portalUrl = `${baseUrl}/app?section=params`;
    const graceEndFmt = new Date(graceEnd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    emailService.send('payment-failed', toEmail, {
      nom:               garage.nom || 'Garage',
      portal_url:        portalUrl,
      grace_end_formatted: graceEndFmt,
    }).catch(e => console.error('[webhook] Email payment-failed échoué :', e.message));
  }
}

async function handleSubscriptionBlocked(sub, SBLayer) {
  const customerId = sub.customer;
  const garage = await SBLayer.Garages.getByStripeCustomerId(customerId);
  if (!garage) return;

  await SBLayer.Garages.updateBilling(garage.id, { subscription_status: 'blocked' });
  console.log(`[webhook] 🔴 subscription blocked → garage ${garage.id}`);
}

async function handleSubscriptionUpdated(sub, SBLayer) {
  const customerId = sub.customer;
  const garage = await SBLayer.Garages.getByStripeCustomerId(customerId);
  if (!garage) return;

  const priceId = sub.items?.data?.[0]?.price?.id;
  const planKey = planFromPriceId(priceId);
  if (!planKey) return;

  const planData = PLANS[planKey];
  await SBLayer.Garages.updateBilling(garage.id, {
    plan_code:                       planKey,
    subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    motos_limit:                     planData.motos_limit ?? null,
    users_limit:                     planData.users_limit ?? null,
  });
  console.log(`[webhook] 🔄 subscription.updated → garage ${garage.id} plan ${planKey}`);
}

async function handleTrialWillEnd(sub, SBLayer) {
  const customerId = sub.customer;
  const garage = await SBLayer.Garages.getByStripeCustomerId(customerId);
  if (!garage) return;

  const trialEndFmt = sub.trial_end
    ? new Date(sub.trial_end * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  const customer = await stripe.customers.retrieve(customerId);
  const toEmail  = customer.email;
  if (!toEmail) return;

  const baseUrl   = process.env.FRONTEND_URL || 'https://motokey11-production.up.railway.app';
  const portalUrl = `${baseUrl}/app?section=params`;
  const planData  = PLANS[garage.plan_code] || {};

  emailService.send('trial-ending', toEmail, {
    nom:                 garage.nom || 'Garage',
    plan:                planData.label || garage.plan_code || 'MotoKey',
    trial_end_formatted: trialEndFmt,
    portal_url:          portalUrl,
  }).catch(e => console.error('[webhook] Email trial-ending échoué :', e.message));

  console.log(`[webhook] ⏰ trial_will_end → email envoyé à ${toEmail}`);
}

async function handleWebhookEvent(event, SBLayer) {
  // Idempotency guard — unique sur stripe_event_id
  try {
    await SBLayer.BillingEvents.insert(event.id, event.type, event.data.object);
  } catch (e) {
    if (e.message.includes('duplicate') || e.message.includes('unique') || e.message.includes('23505')) {
      console.log(`[webhook] Event ${event.id} déjà traité — ignoré`);
      return { skipped: true };
    }
    throw e;
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object, SBLayer);
      break;
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object, SBLayer);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object, SBLayer);
      break;
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
      await handleSubscriptionBlocked(event.data.object, SBLayer);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object, SBLayer);
      break;
    case 'customer.subscription.trial_will_end':
      await handleTrialWillEnd(event.data.object, SBLayer);
      break;
    default:
      console.log(`[webhook] Event ignoré : ${event.type}`);
  }

  return { processed: true };
}

// ── PHASE 5 : Checkout + Auto-trial ──────────────────────────────────

async function createCheckoutSession(garageId, planKey, period, stripeCustomerId, baseUrl) {
  if (!stripe) throw new Error('Stripe non configuré');

  const priceId = PRICE_IDS[planKey]?.[period];
  if (!priceId) throw new Error(`Prix inconnu : ${planKey}/${period}`);

  const params = {
    mode: 'subscription',
    payment_method_collection: 'if_required',
    allow_promotion_codes: true,   // Pioneer Program (Phase 9) — champ Code promo natif Stripe Checkout
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      trial_settings: { end_behavior: { missing_payment_method: 'pause' } },
      metadata: { garage_id: garageId, plan_key: planKey },
    },
    metadata: { garage_id: garageId, plan_key: planKey },
    success_url: `${baseUrl}/app?billing=success`,
    cancel_url:  `${baseUrl}/app?billing=cancel`,
  };

  if (stripeCustomerId) params.customer = stripeCustomerId;

  return stripe.checkout.sessions.create(params);
}

// Crée un trial Stripe directement (sans Checkout) pour les garages existants
// quand BILLING_ENFORCE passe à true. Plan solo mensuel par défaut.
async function createAutoTrial(garageId, garageEmail, garageName, SBLayer) {
  if (!stripe) throw new Error('Stripe non configuré');

  const customer = await stripe.customers.create({
    email:    garageEmail,
    name:     garageName || 'Garage MotoKey',
    metadata: { garage_id: garageId },
  });

  const sub = await stripe.subscriptions.create({
    customer:    customer.id,
    items:       [{ price: PRICE_IDS.solo.monthly }],
    trial_period_days: 14,
    trial_settings: { end_behavior: { missing_payment_method: 'pause' } },
    metadata: { garage_id: garageId, plan_key: 'solo', auto_trial: 'true' },
  });

  const trialEndIso = new Date((sub.trial_end || sub.current_period_end) * 1000).toISOString();

  await SBLayer.Garages.updateBilling(garageId, {
    stripe_customer_id:              customer.id,
    stripe_subscription_id:          sub.id,
    plan_code:                       'solo',
    subscription_status:             'active',
    subscription_current_period_end: trialEndIso,
    grace_period_ends_at:            null,
    motos_limit:                     PLANS.solo.motos_limit,
    users_limit:                     PLANS.solo.users_limit,
  });

  console.log(`[billing] auto-trial créé → garage ${garageId} trial jusqu'au ${trialEndIso}`);
  return { customer_id: customer.id, subscription_id: sub.id };
}

// ── PHASE 7 : Customer Portal ─────────────────────────────────────────

async function createPortalSession(stripeCustomerId, returnUrl) {
  if (!stripe) throw new Error('Stripe non configuré');
  return stripe.billingPortal.sessions.create({
    customer:   stripeCustomerId,
    return_url: returnUrl,
  });
}

module.exports = { stripe, PRICE_IDS, PLANS, handleWebhookEvent, createCheckoutSession, createAutoTrial, createPortalSession };
