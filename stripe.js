/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║     MOTOKEY — STRIPE ABONNEMENTS (stripe.js)            ║
 * ║                                                          ║
 * ║   Plans :                                               ║
 * ║   • Starter  49€/mois  — 50 dossiers                   ║
 * ║   • Pro      99€/mois  — 200 dossiers + anti-fraude IA ║
 * ║   • Expert  199€/mois  — Illimité + concessionnaires    ║
 * ║   • Transfert 9,99€    — Certificat par cession         ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * CONFIG .env :
 *   STRIPE_SECRET_KEY=sk_live_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 *   STRIPE_PRICE_STARTER=price_...
 *   STRIPE_PRICE_PRO=price_...
 *   STRIPE_PRICE_EXPERT=price_...
 *   STRIPE_PRICE_TRANSFERT=price_...
 *
 * DÉPENDANCES : npm install stripe
 */

'use strict';

const https = require('https');
const crypto = require('crypto');

/* ── Config ── */
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const PLANS = {
  starter:  { nom: 'Starter',  prix: 49,  motos: 50,   fraude_ia: false, price_id: process.env.STRIPE_PRICE_STARTER   },
  pro:      { nom: 'Pro',      prix: 99,  motos: 200,  fraude_ia: true,  price_id: process.env.STRIPE_PRICE_PRO        },
  expert:   { nom: 'Expert',   prix: 199, motos: 99999, fraude_ia: true, price_id: process.env.STRIPE_PRICE_EXPERT     },
  transfert:{ nom: 'Transfert',prix: 9.99,motos: 0,    fraude_ia: false, price_id: process.env.STRIPE_PRICE_TRANSFERT  },
};

/* ── HTTP helper Stripe ── */
function stripeRequest(method, path, params = null) {
  return new Promise((resolve, reject) => {
    if (!STRIPE_KEY) {
      // Mode simulation
      const simData = simulerStripe(method, path, params);
      resolve({ status: 200, body: simData });
      return;
    }
    const body = params ? new URLSearchParams(flattenParams(params)).toString() : null;
    const req = https.request({
      hostname: 'api.stripe.com',
      path:     `/v1${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Aplatir les objets imbriqués pour URLSearchParams (style Stripe)
function flattenParams(obj, prefix = '') {
  const flat = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(flat, flattenParams(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === 'object') {
          Object.assign(flat, flattenParams(item, `${key}[${i}]`));
        } else {
          flat[`${key}[${i}]`] = item;
        }
      });
    } else if (v !== undefined && v !== null) {
      flat[key] = String(v);
    }
  }
  return flat;
}

/* ── Simulation Stripe (sans clé) ── */
function simulerStripe(method, path, params) {
  const id = 'sim_' + crypto.randomBytes(6).toString('hex');
  if (path.includes('/customers')) return { id: 'cus_' + id, object: 'customer', email: params?.email, metadata: params?.metadata || {} };
  if (path.includes('/subscriptions')) return { id: 'sub_' + id, object: 'subscription', status: 'active', current_period_end: Math.floor(Date.now()/1000) + 2592000, items: { data: [{ price: { id: params?.items?.[0]?.price, unit_amount: 9900 } }] }, metadata: params?.metadata || {} };
  if (path.includes('/checkout')) return { id: 'cs_' + id, object: 'checkout.session', url: `https://checkout.stripe.com/pay/${id}`, payment_status: 'unpaid' };
  if (path.includes('/portal')) return { id: 'bps_' + id, url: `https://billing.stripe.com/session/${id}` };
  if (path.includes('/payment_intents')) return { id: 'pi_' + id, object: 'payment_intent', status: 'succeeded', amount: params?.amount };
  return { id, simulated: true };
}

/* ══════════════════════════════════════════════════════════
   CUSTOMERS
══════════════════════════════════════════════════════════ */
const Customers = {

  async creer({ garage_id, nom, email, siret, tel }) {
    const r = await stripeRequest('POST', '/customers', {
      name:  nom,
      email,
      phone: tel,
      metadata: { garage_id, siret: siret || '' },
    });
    if (r.status >= 400) throw new Error(`Stripe Customer: ${r.body?.error?.message}`);
    console.log(`[STRIPE] Customer créé: ${r.body.id}`);
    return r.body;
  },

  async getById(customer_id) {
    const r = await stripeRequest('GET', `/customers/${customer_id}`);
    if (r.status >= 400) throw new Error(`Stripe Customer: ${r.body?.error?.message}`);
    return r.body;
  },

  async update(customer_id, params) {
    const r = await stripeRequest('POST', `/customers/${customer_id}`, params);
    if (r.status >= 400) throw new Error(`Stripe Update: ${r.body?.error?.message}`);
    return r.body;
  }
};

/* ══════════════════════════════════════════════════════════
   ABONNEMENTS
══════════════════════════════════════════════════════════ */
const Abonnements = {

  /**
   * Créer une session Checkout pour s'abonner
   * Redirige le garage vers la page de paiement Stripe
   */
  async creerCheckout({ garage_id, plan, customer_id, success_url, cancel_url }) {
    const planData = PLANS[plan];
    if (!planData) throw new Error(`Plan inconnu: ${plan}`);
    if (!planData.price_id && STRIPE_KEY) throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} manquant dans .env`);

    const r = await stripeRequest('POST', '/checkout/sessions', {
      mode:        'subscription',
      customer:    customer_id,
      line_items:  [{ price: planData.price_id || `price_${plan}_sim`, quantity: 1 }],
      success_url: success_url || `${process.env.FRONTEND_URL}/abonnement/succes?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  cancel_url  || `${process.env.FRONTEND_URL}/abonnement/annule`,
      metadata:    { garage_id, plan },
      subscription_data: {
        metadata:  { garage_id, plan },
        trial_period_days: plan === 'starter' ? 14 : 0, // 14j d'essai sur Starter
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      locale: 'fr',
    });

    if (r.status >= 400) throw new Error(`Stripe Checkout: ${r.body?.error?.message}`);
    console.log(`[STRIPE] Checkout créé pour ${plan}: ${r.body.url}`);
    return { checkout_url: r.body.url, session_id: r.body.id };
  },

  /**
   * Portail client Stripe (gérer abonnement, factures, CB)
   */
  async portalClient(customer_id, return_url) {
    const r = await stripeRequest('POST', '/billing_portal/sessions', {
      customer:   customer_id,
      return_url: return_url || `${process.env.FRONTEND_URL}/params`,
    });
    if (r.status >= 400) throw new Error(`Stripe Portal: ${r.body?.error?.message}`);
    return { portal_url: r.body.url };
  },

  /**
   * Récupérer l'abonnement actif d'un customer
   */
  async getAbonnement(customer_id) {
    const r = await stripeRequest('GET', `/subscriptions?customer=${customer_id}&status=active&limit=1`);
    if (r.status >= 400) return null;
    const sub = r.body?.data?.[0];
    if (!sub) return null;
    const plan = sub.metadata?.plan || 'starter';
    return {
      id:          sub.id,
      plan,
      plan_data:   PLANS[plan] || PLANS.starter,
      statut:      sub.status,
      actif:       sub.status === 'active' || sub.status === 'trialing',
      essai:       sub.status === 'trialing',
      expire_at:   new Date(sub.current_period_end * 1000).toISOString(),
      prix_mensuel: (sub.items?.data?.[0]?.price?.unit_amount || 0) / 100,
    };
  },

  /**
   * Résilier un abonnement
   */
  async resilier(subscription_id, immediatement = false) {
    const params = immediatement ? {} : { cancel_at_period_end: true };
    const r = await stripeRequest('DELETE', `/subscriptions/${subscription_id}`, immediatement ? {} : { cancel_at_period_end: 'true' });
    if (r.status >= 400 && !immediatement) {
      // Fallback : update avec cancel_at_period_end
      const r2 = await stripeRequest('POST', `/subscriptions/${subscription_id}`, { cancel_at_period_end: 'true' });
      return r2.body;
    }
    console.log(`[STRIPE] Abonnement résilié: ${subscription_id}`);
    return r.body;
  },

  /**
   * Changer de plan (upgrade/downgrade)
   */
  async changerPlan(subscription_id, nouveau_plan) {
    const planData = PLANS[nouveau_plan];
    if (!planData) throw new Error(`Plan inconnu: ${nouveau_plan}`);
    // Récupérer l'item de l'abonnement
    const subR = await stripeRequest('GET', `/subscriptions/${subscription_id}`);
    if (subR.status >= 400) throw new Error('Abonnement non trouvé');
    const itemId = subR.body?.items?.data?.[0]?.id;
    const r = await stripeRequest('POST', `/subscriptions/${subscription_id}`, {
      items:               [{ id: itemId, price: planData.price_id }],
      proration_behavior:  'create_prorations',
      metadata:            { plan: nouveau_plan },
    });
    if (r.status >= 400) throw new Error(`Stripe Upgrade: ${r.body?.error?.message}`);
    console.log(`[STRIPE] Plan changé → ${nouveau_plan}`);
    return { subscription: r.body, nouveau_plan, plan_data: planData };
  }
};

/* ══════════════════════════════════════════════════════════
   PAIEMENT À L'ACTE — Certificat de transfert
══════════════════════════════════════════════════════════ */
const Acte = {

  /**
   * Paiement unique 9,99€ pour un certificat de transfert
   */
  async certificatTransfert({ customer_id, garage_id, transfert_id, moto_nom }) {
    const r = await stripeRequest('POST', '/checkout/sessions', {
      mode:       'payment',
      customer:   customer_id,
      line_items: [{
        price_data: {
          currency:     'eur',
          unit_amount:  999, // 9,99€ en centimes
          product_data: {
            name:        'Certificat de cession MotoKey',
            description: `Transfert de propriété — ${moto_nom}`,
          },
        },
        quantity: 1,
      }],
      success_url: `${process.env.FRONTEND_URL}/transfert/${transfert_id}?paye=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.FRONTEND_URL}/transfert/${transfert_id}`,
      metadata:    { garage_id, transfert_id, type: 'certificat_transfert' },
      locale:      'fr',
    });
    if (r.status >= 400) throw new Error(`Stripe Acte: ${r.body?.error?.message}`);
    return { checkout_url: r.body.url, session_id: r.body.id };
  }
};

/* ══════════════════════════════════════════════════════════
   WEBHOOK — Événements Stripe → Mise à jour Supabase
══════════════════════════════════════════════════════════ */
const Webhook = {

  /**
   * Vérifier la signature du webhook Stripe
   */
  verifierSignature(payload, signature) {
    if (!WEBHOOK_SECRET) {
      console.warn('[WEBHOOK] Secret non configuré — signature non vérifiée');
      return true;
    }
    try {
      const parts    = signature.split(',');
      const ts       = parts.find(p => p.startsWith('t=')).slice(2);
      const v1       = parts.find(p => p.startsWith('v1=')).slice(3);
      const expected = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(`${ts}.${payload}`)
        .digest('hex');
      return crypto.timingSafeEqual(Buffer.from(v1,'hex'), Buffer.from(expected,'hex'));
    } catch {
      return false;
    }
  },

  /**
   * Traiter les événements Stripe
   * À appeler depuis le endpoint POST /webhook/stripe
   */
  async traiter(event, supabaseClient) {
    const { type, data } = event;
    console.log(`[WEBHOOK] ${type}`);

    switch (type) {

      // ── Abonnement activé (après paiement réussi) ──────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub    = data.object;
        const plan   = sub.metadata?.plan || 'starter';
        const active = ['active','trialing'].includes(sub.status);
        await supabaseClient.from('garages')
          .update({
            plan:           active ? plan : 'starter',
            plan_expire_at: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at:     new Date().toISOString(),
          })
          .eq('stripe_customer_id', sub.customer);
        console.log(`[WEBHOOK] Garage plan → ${plan} (${sub.status})`);
        break;
      }

      // ── Abonnement résilié ─────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = data.object;
        await supabaseClient.from('garages')
          .update({ plan: 'starter', plan_expire_at: null })
          .eq('stripe_customer_id', sub.customer);
        console.log(`[WEBHOOK] Abonnement résilié → retour Starter`);
        break;
      }

      // ── Paiement réussi (acte) ─────────────────────────
      case 'checkout.session.completed': {
        const session = data.object;
        if (session.metadata?.type === 'certificat_transfert') {
          const { transfert_id } = session.metadata;
          await supabaseClient.from('transferts')
            .update({ certificat_paye: true, updated_at: new Date().toISOString() })
            .eq('id', transfert_id);
          console.log(`[WEBHOOK] Certificat payé → transfert ${transfert_id}`);
        }
        break;
      }

      // ── Paiement échoué ───────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = data.object;
        console.warn(`[WEBHOOK] Paiement échoué pour ${invoice.customer} — montant: ${invoice.amount_due/100}€`);
        // Ici envoyer un email de relance (géré par Stripe automatiquement)
        break;
      }

      default:
        console.log(`[WEBHOOK] Événement non géré: ${type}`);
    }

    return { received: true, type };
  }
};

/* ══════════════════════════════════════════════════════════
   LIMITES — Vérifier si le garage peut encore ajouter des motos
══════════════════════════════════════════════════════════ */
const Limites = {

  async verifier(garage_id, supabaseClient) {
    // Récupérer le plan du garage
    const { data: garage } = await supabaseClient
      .from('garages')
      .select('plan, plan_expire_at')
      .eq('id', garage_id)
      .single();

    const plan       = garage?.plan || 'starter';
    const planData   = PLANS[plan] || PLANS.starter;
    const expire_at  = garage?.plan_expire_at;

    // Vérifier expiration
    const expireDate = expire_at ? new Date(expire_at) : null;
    const actif      = !expireDate || expireDate > new Date();

    // Compter les motos actuelles
    const { count } = await supabaseClient
      .from('motos')
      .select('*', { count: 'exact', head: true })
      .eq('garage_id', garage_id);

    const nb_motos   = count || 0;
    const limite     = planData.motos;
    const peut_ajouter = actif && nb_motos < limite;

    return {
      plan, actif, nb_motos, limite,
      peut_ajouter,
      fraude_ia:    actif && planData.fraude_ia,
      expire_at:    expire_at,
      message: !actif
        ? 'Abonnement expiré — renouveler sur motokey.fr'
        : !peut_ajouter
          ? `Limite de ${limite} dossiers atteinte — passer au plan supérieur`
          : null,
    };
  }
};

/* ══════════════════════════════════════════════════════════
   EXPORT
══════════════════════════════════════════════════════════ */
module.exports = { Customers, Abonnements, Acte, Webhook, Limites, PLANS };
