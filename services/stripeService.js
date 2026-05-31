/* ══════════════════════════════════════════════════════════
   MOTOKEY — L9 Stripe Billing — Service skeleton (Phase 3)
   Initialisation Stripe + maps PRICE_IDS et PLANS.
   Importé par Phase 4 (webhook), Phase 5 (checkout), Phase 7 (portal).

   Variables Railway :
   - STRIPE_SECRET_KEY              → init du client stripe
   - STRIPE_PRICE_SOLO_MONTHLY      → PRICE_IDS.solo.monthly
   - STRIPE_PRICE_SOLO_ANNUAL       → PRICE_IDS.solo.annual
   - STRIPE_PRICE_ATELIER_MONTHLY   → PRICE_IDS.atelier.monthly
   - STRIPE_PRICE_ATELIER_ANNUAL    → PRICE_IDS.atelier.annual
   - STRIPE_PRICE_CONCESSION_MONTHLY→ PRICE_IDS.concession.monthly
   - STRIPE_PRICE_CONCESSION_ANNUAL → PRICE_IDS.concession.annual
   NOTE : STRIPE_WEBHOOK_SECRET n'est PAS référencé ici — obtenu en Phase 4.
   ══════════════════════════════════════════════════════════ */

'use strict';

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

module.exports = { stripe, PRICE_IDS, PLANS };
