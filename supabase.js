/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║     MOTOKEY — COUCHE SUPABASE (supabase.js)             ║
 * ║     Remplace la DB in-memory de l'API mock              ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * CONFIGURATION :
 * Créer un fichier .env à la racine du projet avec :
 *
 *   SUPABASE_URL=https://xxxxx.supabase.co
 *   SUPABASE_SECRET_KEY=sbsec_...          ← nouveau système Publishable/Secret
 *   SUPABASE_PUBLISHABLE_KEY=sbpub_...     ← nouveau système (remplace anon key)
 *
 * Fallback legacy (rétrocompat si nouvelles clés absentes) :
 *   SUPABASE_SERVICE_KEY=eyJ...            ← ancienne service_role key
 *   SUPABASE_ANON_KEY=eyJ...              ← ancienne anon key
 *
 * Ces clés se trouvent dans :
 * Supabase Dashboard > Settings > API > Secret keys
 *
 * INSTALLATION :
 *   npm install @supabase/supabase-js dotenv
 */

'use strict';

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// ── Validation config ──────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;

// NOTE migration Supabase (22/05/2026) : priorité aux clés nouveau format sb_secret_*/sb_publishable_*.
// Legacy JWT désactivé sur ce projet. Les clés sb_* du .env ont été régénérées
// depuis le dashboard — les anciennes valeurs (périmées) causaient "Unregistered API key".
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ||      // nouveau format (sb_secret_*)
  process.env.SUPABASE_SERVICE_KEY;       // JWT legacy (fallback)

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  // En mode RAM, on exporte null — motokey-api.js vérifie USE_SUPABASE && SBLayer avant d'appeler
  console.warn('⚠️  supabase.js : SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant — module désactivé');
  module.exports = null;
  return;  // CommonJS : stoppe l'exécution du module sans tuer le process
}

// ── Client Supabase (service role = bypass RLS pour l'API) ─
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

// ── Client Supabase public (pour signInWithPassword, avec RLS) ────
const SUPABASE_PUBLIC_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || // nouveau format (sb_publishable_*)
  process.env.SUPABASE_ANON_KEY ||        // JWT legacy (fallback)
  SUPABASE_SERVICE_KEY;                   // dernier recours
const supabasePublic = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLIC_KEY,
  { auth: { persistSession: false } }
);

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════
async function query(table, filters = {}, options = {}) {
  let q = supabase.from(table).select(options.select || '*');
  Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
  if (options.order)  q = q.order(options.order, { ascending: options.asc ?? false });
  if (options.limit)  q = q.limit(options.limit);
  if (options.single) q = q.single();
  const { data, error } = await q;
  if (error) throw new Error(`[${table}] ${error.message}`);
  return data;
}

async function insert(table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw new Error(`[INSERT ${table}] ${error.message}`);
  return data;
}

async function update(table, id, payload) {
  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
  if (error) throw new Error(`[UPDATE ${table}] ${error.message}`);
  return data;
}

async function remove(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw new Error(`[DELETE ${table}] ${error.message}`);
  return true;
}

// ══════════════════════════════════════════════════════════
// AUTH — Garages
// ══════════════════════════════════════════════════════════
const Auth = {

  async registerGarage({ nom, email, password, siret, tel, adresse }) {
    // 1. Créer le compte Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (authError) throw new Error(`Auth: ${authError.message}`);

    // 1b. Poser le rôle CONCESSION dans app_metadata (non falsifiable côté client)
    const { error: roleErr } = await supabase.auth.admin.updateUserById(
      authData.user.id,
      { app_metadata: { role: 'CONCESSION' } }
    );
    if (roleErr) console.warn('[register] role assignment failed for', authData.user.id, '—', roleErr.message);

    // 2. Créer le profil garage
    const garage = await insert('garages', {
      auth_user_id: authData.user.id,
      nom, email, siret: siret || null, tel: tel || null, adresse: adresse || null
    });

    // 3. Ajouter le technicien chef par défaut
    await insert('techniciens', {
      garage_id: garage.id,
      nom, role: 'chef', certifie: false
    });

    return garage;
  },

  async loginGarage({ email, password }) {
    const { data, error } = await supabasePublic.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Identifiants incorrects');

    // 1. Owner check — CONCESSION/PRO propriétaires d'un garage
    const { data: g1 } = await supabase
      .from('garages').select('*')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();
    if (g1) return { session: data.session, garage: g1 };

    // 2. Fallback — MECANO/PRO employés via garage_users
    const { data: gu } = await supabase
      .from('garage_users').select('garage_id')
      .eq('auth_user_id', data.user.id).eq('actif', true)
      .maybeSingle();
    if (!gu) throw new Error('Identifiants incorrects');

    const { data: g2 } = await supabase
      .from('garages').select('*')
      .eq('id', gu.garage_id)
      .maybeSingle();
    if (!g2) throw new Error('Garage introuvable');
    return { session: data.session, garage: g2 };
  },

  async loginClient({ email, password }) {
    const { data, error } = await supabasePublic.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Identifiants incorrects');
    const client = await query('clients', { auth_user_id: data.user.id }, { single: true });
    const moto   = client
      ? await query('motos', { client_id: client.id }, { limit: 1 })
      : null;
    return { session: data.session, client, moto_id: moto?.[0]?.id || null };
  },

  async createClientAccount({ client_id, email, password }) {
    const { data: authData, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (error) throw new Error(`Auth client: ${error.message}`);
    await update('clients', client_id, { auth_user_id: authData.user.id });
    return authData.user;
  }
};

// ══════════════════════════════════════════════════════════
// GARAGES
// ══════════════════════════════════════════════════════════
const Garages = {

  async getById(id) {
    return query('garages', { id }, { single: true });
  },

  async update(id, payload) {
    const allowed = ['nom','tel','adresse','siret','taux_std','taux_spec','tva','sms_active','mecano_session_timeout_minutes'];
    const clean   = Object.fromEntries(Object.entries(payload).filter(([k]) => allowed.includes(k)));
    return update('garages', id, clean);
  },

  async updateBilling(id, payload) {
    const allowed = ['stripe_customer_id','stripe_subscription_id','plan_code','subscription_status',
                     'subscription_current_period_end','grace_period_ends_at','motos_limit','users_limit'];
    const clean = Object.fromEntries(Object.entries(payload).filter(([k]) => allowed.includes(k)));
    return update('garages', id, clean);
  },

  async getByStripeCustomerId(stripe_customer_id) {
    const { data, error } = await supabase.from('garages').select('*').eq('stripe_customer_id', stripe_customer_id).maybeSingle();
    if (error) throw new Error(`[garages] ${error.message}`);
    return data;
  },

  async getStats(garage_id) {
    const [motos, interventions, ordres] = await Promise.all([
      supabase.from('motos').select('couleur_dossier, score').eq('garage_id', garage_id),
      supabase.from('interventions').select('type, montant_ht').eq('garage_id', garage_id),
      supabase.from('ordres_reparation').select('statut, total_ttc').eq('garage_id', garage_id)
    ]);

    const motoData = motos.data || [];
    const intData  = interventions.data || [];
    const orData   = ordres.data || [];

    const parCouleur = { vert: 0, bleu: 0, jaune: 0, rouge: 0 };
    motoData.forEach(m => parCouleur[m.couleur_dossier]++);

    const parType = { vert: 0, bleu: 0, jaune: 0, rouge: 0 };
    intData.forEach(i => parType[i.type]++);

    // CA = OR facturés (facture réellement émise) — remplace l'ancien calcul basé sur
    // devis.statut='accepte' (L10 : la table devis est vidée/dépréciée, la facturation
    // vit désormais sur ordres_reparation.statut='facture', une mesure de CA plus fidèle
    // qu'un devis signé mais pas nécessairement facturé).
    const orFactures = orData.filter(o => o.statut === 'facture');
    const caTTC       = orFactures.reduce((s, o) => s + (o.total_ttc || 0), 0);

    return {
      motos:             { total: motoData.length, par_couleur: parCouleur },
      interventions:     { total: intData.length, par_type: parType },
      ordres_reparation: { total: orData.length, factures: orFactures.length, ca_ttc: +caTTC.toFixed(2), ca_ht: +(caTTC/1.2).toFixed(2) }
    };
  }
};

// ══════════════════════════════════════════════════════════
// MOTOS
// ══════════════════════════════════════════════════════════
const Motos = {

  async list(garage_id, filters = {}) {
    let q = supabase.from('motos')
      .select('*, clients(nom, email, tel)')
      .eq('garage_id', garage_id)
      .order('created_at', { ascending: false });
    if (filters.couleur) q = q.eq('couleur_dossier', filters.couleur);
    if (filters.client_id) q = q.eq('client_id', filters.client_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    // UX-02 : enrichissement alerte entretien (calculé à l'affichage, aucun champ DB)
    const rows = data || [];
    const ids = rows.map(m => m.id);
    let plans = [];
    if (ids.length) {
      const { data: pe, error: peErr } = await supabase.from('plan_entretien')
        .select('moto_id, km_interval, km_derniere')
        .in('moto_id', ids);
      if (peErr) throw new Error(peErr.message);
      plans = pe || [];
    }
    const byMoto = {};
    for (const op of plans) (byMoto[op.moto_id] = byMoto[op.moto_id] || []).push(op);

    // GAUGE-04 : rappel_photo_en_retard (calculé au read-time, aucun champ DB) —
    // réutilise la MÊME fonction pure que le cron via lazy require (évite le cycle
    // supabase<->service : un require en tête de fichier créerait une dépendance circulaire).
    const { isConsommableEnRetard } = require('./services/consommableRappelService');
    let consosByMoto = {};
    let latestPhotoByConso = {};
    if (ids.length) {
      const { data: consos, error: consosErr } = await supabase.from('consommables')
        .select('*').in('moto_id', ids);
      if (consosErr) throw new Error(consosErr.message);
      for (const c of consos || []) (consosByMoto[c.moto_id] = consosByMoto[c.moto_id] || []).push(c);

      const { data: photos, error: photosErr } = await supabase.from('photos_consommables')
        .select('consommable_id, km_a_la_photo, created_at')
        .in('moto_id', ids)
        .order('created_at', { ascending: false });
      if (photosErr) throw new Error(photosErr.message);
      for (const p of photos || []) {
        if (p.consommable_id && !(p.consommable_id in latestPhotoByConso)) latestPhotoByConso[p.consommable_id] = p;
      }
    }

    return rows.map(m => {
      const ops = byMoto[m.id] || [];
      let pctMax = 0;
      for (const op of ops) {
        const since = (m.km || 0) - (op.km_derniere || 0);
        const pct = op.km_interval > 0 ? Math.round((since / op.km_interval) * 100) : 0;
        if (pct > pctMax) pctMax = pct;
      }
      const consos = consosByMoto[m.id] || [];
      const enRetard = consos.filter(c => isConsommableEnRetard(c, m.km, latestPhotoByConso[c.id] || null));
      return {
        ...m,
        pct_max_usage: pctMax,
        alerte_entretien: ops.length > 0 && pctMax >= 80,
        rappel_photo_en_retard: enRetard.length > 0,
        consommables_en_retard: enRetard.map(c => c.type_consommable)
      };
    });
  },

  async getById(id, garage_id) {
    const { data, error } = await supabase.from('motos')
      .select('*, clients(nom, email, tel)')
      .eq('id', id)
      .eq('garage_id', garage_id)
      .single();
    if (error) throw new Error(error.message);
    if (!data) return data;

    // GAUGE-04 : même fonction pure que Motos.list/le cron, via lazy require.
    const { isConsommableEnRetard } = require('./services/consommableRappelService');
    const consos = await Consommables.listByMoto(id);
    const enRetard = [];
    for (const conso of consos) {
      const photos = await PhotosConsommables.listByConsommable(conso.id);
      const latestPhoto = (photos && photos.length) ? photos[0] : null;
      if (isConsommableEnRetard(conso, data.km, latestPhoto)) enRetard.push(conso);
    }

    return {
      ...data,
      rappel_photo_en_retard: enRetard.length > 0,
      consommables_en_retard: enRetard.map(c => c.type_consommable)
    };
  },

  async create(garage_id, payload) {
    const proprietaire_type = payload.proprietaire_type || 'client';

    // Chercher ou créer le client (uniquement pour type 'client')
    let client_id = null;
    if (proprietaire_type === 'client' && (payload.client_email || payload.client_nom)) {
      let client = null;
      if (payload.client_email) {
        const { data } = await supabase.from('clients').select('id, garage_id').eq('email', payload.client_email).maybeSingle();
        client = data;
        if (client && !client.garage_id) {
          await supabase.from('clients').update({ garage_id }).eq('id', client.id);
        }
      }
      if (!client) {
        client = await insert('clients', {
          garage_id,
          nom:   payload.client_nom   || payload.client_email,
          email: payload.client_email || null,
          tel:   payload.client_tel   || null
        });
      }
      client_id = client.id;
    }

    // Profil de transmission — auto-détecté, jamais bloquant (fallback chaine/auto).
    const { detecterProfilTransmission } = require('./services/profilTransmission');
    const detection = await detecterProfilTransmission(payload.marque, payload.modele);

    // Construire le payload moto selon le type de propriétaire
    const motoPayload = {
      garage_id,
      marque:  payload.marque,
      modele:  payload.modele,
      annee:   payload.annee,
      plaque:  payload.plaque,
      vin:     payload.vin,
      km:      payload.km || 0,
      proprietaire_type,
      profil_transmission:        detection.profil,
      profil_transmission_source: detection.source
    };

    if (proprietaire_type === 'client') {
      motoPayload.client_id = client_id;
      motoPayload.proprietaire_garage_id = null;
      motoPayload.proprio_libre = null;
    } else if (proprietaire_type === 'garage') {
      motoPayload.client_id = null;
      motoPayload.proprietaire_garage_id = garage_id;
      motoPayload.proprio_libre = null;
    } else if (proprietaire_type === 'inconnu') {
      motoPayload.client_id = null;
      motoPayload.proprietaire_garage_id = null;
      motoPayload.proprio_libre = payload.proprio_libre || null;
    }

    const moto = await insert('motos', motoPayload);

    // Insérer l'entrée initiale dans l'historique des propriétaires
    const histoPayload = {
      moto_id:                 moto.id,
      proprietaire_type:       proprietaire_type,
      proprietaire_client_id:  proprietaire_type === 'client'  ? client_id  : null,
      proprietaire_garage_id:  proprietaire_type === 'garage'  ? garage_id  : null,
      proprio_libre:           proprietaire_type === 'inconnu' ? (payload.proprio_libre || null) : null,
      date_debut:              new Date().toISOString().slice(0, 10),
      mode_acquisition:        payload.mode_acquisition || 'inconnu'
    };
    const { error: histoErr } = await supabase.from('motos_proprietaires_historique').insert(histoPayload);
    if (histoErr) throw new Error(`[Motos.create] insert historique: ${histoErr.message}`);

    return moto;
  },

  async update(id, garage_id, payload) {
    // km retiré (KM-04) via RelevesKm ; pneu_* retirés (CONSO-04, Phase 27) — plus aucune écriture pneus côté app, données migrées vers consommables (migration 25).
    const allowed = ['couleur','photo_url'];
    const clean   = Object.fromEntries(Object.entries(payload).filter(([k]) => allowed.includes(k)));
    const { data, error } = await supabase.from('motos').update(clean).eq('id', id).eq('garage_id', garage_id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async updateProfilTransmission(id, garage_id, profil_transmission) {
    const { data, error } = await supabase.from('motos')
      .update({ profil_transmission, profil_transmission_source: 'manuel' })
      .eq('id', id).eq('garage_id', garage_id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async delete(id, garage_id) {
    const { error } = await supabase.from('motos').delete().eq('id', id).eq('garage_id', garage_id);
    if (error) throw new Error(error.message);
    return true;
  },

  async getScore(id, garage_id) {
    const { data: moto, error } = await supabase.from('motos')
      .select('score, couleur_dossier')
      .eq('id', id).eq('garage_id', garage_id).single();
    if (error) throw new Error(error.message);
    const { data: ints } = await supabase.from('interventions')
      .select('type').eq('moto_id', id);
    const pt = { vert: 0, bleu: 0, jaune: 0, rouge: 0 };
    (ints || []).forEach(i => pt[i.type]++);
    return {
      score: moto.score, couleur: moto.couleur_dossier,
      nb_interventions: (ints || []).length, par_type: pt,
      detail: { concession: pt.vert*12, pro_valide: pt.bleu*8, proprietaire: pt.jaune*5, malus: pt.rouge*5 }
    };
  },

  // L13 étape 5 : maintenance constructeur due, côté garage/MECANO (jusqu'ici
  // exposée uniquement côté CLIENT via l'ancien GET /client/moto RAM-only).
  // Réutilise enrichirPlan(), la même fonction pure que insererPlanSupabase().
  async getPlanEntretien(id, garage_id) {
    const { data: moto, error: merr } = await supabase.from('motos')
      .select('id, km').eq('id', id).eq('garage_id', garage_id).single();
    if (merr || !moto) throw new Error('Moto non trouvée');
    const { data: ops, error } = await supabase.from('plan_entretien')
      .select('*').eq('moto_id', id);
    if (error) throw new Error(error.message);
    const { enrichirPlan } = require('./plans_entretien');
    return enrichirPlan(ops || [], moto.km);
  }
};

// ══════════════════════════════════════════════════════════
// RELEVES KM — source de vérité km (KM-04)
// ══════════════════════════════════════════════════════════
const RelevesKm = {
  // Unique point d'écriture km. Le trigger DB BEFORE INSERT est le vrai gate :
  // si le km régresse, le trigger annule la ligne (0 row => PGRST116) et journalise
  // dans releves_km_rejets. On normalise succès/rejet en un retour stable.
  async enregistrer(garage_id, moto_id, { km, type_evenement = 'lecture', acteur_type, acteur_id, note = null, photo_url = null }) {
    if (!moto_id) throw new Error('[RelevesKm.enregistrer] moto_id requis');
    if (km === undefined || km === null || isNaN(parseInt(km))) throw new Error('[RelevesKm.enregistrer] km numérique requis');
    if (!acteur_type || !acteur_id) throw new Error('[RelevesKm.enregistrer] acteur_type + acteur_id requis (jamais anonyme)');

    const payload = {
      moto_id, garage_id: garage_id || null,
      km: parseInt(km), type_evenement,
      acteur_type, acteur_id, note, photo_url
    };

    const { data, error } = await supabase.from('releves_km').insert(payload).select().single();

    if (error) {
      // PGRST116 = 0 ligne renvoyée = ligne annulée par le trigger monotone (rejet).
      if (error.code === 'PGRST116') {
        // Récupérer le rejet fraîchement journalisé pour renvoyer km_actuel/km_tente.
        const { data: rejet } = await supabase.from('releves_km_rejets')
          .select('km_tente, km_actuel')
          .eq('moto_id', moto_id)
          .order('created_at', { ascending: false })
          .limit(1).maybeSingle();
        let km_actuel = rejet?.km_actuel ?? null;
        // Filet de sécurité (25-03) : si la ligne d'audit releves_km_rejets n'a pas été
        // journalisée par le trigger (constaté en exécution live prod, cause distincte non
        // encore élucidée — voir deferred-items.md), retomber sur motos.km qui reste, par
        // KM-04, la source de vérité synchronisée. Ne JAMAIS renvoyer km_actuel:null au
        // client — la réponse 409 doit toujours porter une valeur exploitable.
        if (km_actuel === null) {
          const { data: motoRow } = await supabase.from('motos').select('km').eq('id', moto_id).maybeSingle();
          km_actuel = motoRow?.km ?? null;
        }
        return { accepted: false, km_tente: rejet?.km_tente ?? parseInt(km), km_actuel };
      }
      throw new Error(`[RelevesKm.enregistrer] ${error.message}`);
    }
    return { accepted: true, releve: data };
  }
};

// ══════════════════════════════════════════════════════════
// INTERVENTIONS
// ══════════════════════════════════════════════════════════
const Interventions = {

  async list(moto_id, garage_id, filters = {}) {
    let q = supabase.from('interventions')
      .select('*, techniciens(nom)')
      .eq('moto_id', moto_id).eq('garage_id', garage_id)
      .order('date_intervention', { ascending: false });
    if (filters.type) q = q.eq('type', filters.type);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  },

  async create(garage_id, moto_id, payload) {
    const inter = await insert('interventions', {
      moto_id, garage_id,
      type:            payload.type,
      titre:           payload.titre,
      description:     payload.description || '',
      // D-05 : le km d'intervention est un HISTORIQUE découplé — métadonnée volontairement
      // NON routée vers RelevesKm/le ratchet monotone (permet la saisie d'entretien passé,
      // km < km actuel de la moto). Ne touche JAMAIS motos.km (trg_update_km supprimé en 23-01).
      km:              payload.km,
      technicien_id:   payload.technicien_id || null,
      montant_ht:      payload.montant_ht    || 0,
      montant_ttc:     payload.montant_ttc   || 0,
      date_intervention: payload.date        || new Date().toISOString().split('T')[0]
    });
    // Le trigger SQL recalcule le score automatiquement
    const { data: moto } = await supabase.from('motos').select('score, couleur_dossier').eq('id', moto_id).single();
    return { intervention: inter, nouveau_score: moto?.score, nouvelle_couleur: moto?.couleur_dossier };
  },

  async update(id, moto_id, payload) {
    const { data, error } = await supabase.from('interventions')
      .update(payload).eq('id', id).eq('moto_id', moto_id).select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async delete(id, moto_id) {
    const { error } = await supabase.from('interventions').delete().eq('id', id).eq('moto_id', moto_id);
    if (error) throw new Error(error.message);
    return true;
  },

  async attachFacture(id, facture_url, ocr_data) {
    return update('interventions', id, { facture_url, facture_ocr: ocr_data });
  }
};

// ══════════════════════════════════════════════════════════
// PLAN D'ENTRETIEN
// ══════════════════════════════════════════════════════════
const Entretien = {

  async getPlan(moto_id, km_actuel) {
    const { data, error } = await supabase.from('plan_entretien')
      .select('*').eq('moto_id', moto_id);
    if (error) throw new Error(error.message);

    return (data || []).map(op => {
      const since  = km_actuel - op.km_derniere;
      const pct    = op.km_interval > 0 ? Math.min(100, Math.round((since / op.km_interval) * 100)) : 0;
      const left   = Math.max(0, op.km_interval - since);
      const statut = pct >= 100 ? 'urgent' : pct >= 80 ? 'warning' : pct >= 40 ? 'due' : op.km_derniere > 0 ? 'ok' : 'future';
      return { ...op, km_actuel, pct_usage: pct, km_restant: left, statut, prochain_km: op.km_derniere + op.km_interval };
    });
  },

  async upsertOperation(moto_id, op) {
    const { data, error } = await supabase.from('plan_entretien')
      .upsert({ moto_id, ...op }, { onConflict: 'moto_id,code_operation' })
      .select().single();
    if (error) throw new Error(error.message);
    return data;
  },

  async marquerFaite(moto_id, code_operation, km_actuel) {
    return supabase.from('plan_entretien')
      .update({ km_derniere: km_actuel, date_derniere: new Date().toISOString().split('T')[0] })
      .eq('moto_id', moto_id).eq('code_operation', code_operation);
  }
};

// ══════════════════════════════════════════════════════════
// TRANSFERTS
// ══════════════════════════════════════════════════════════
const Transferts = {

  async initier(garage_id, { moto_id, acheteur_nom, acheteur_email, prix, km_cession, notes }) {
    // Vérifier que la moto n'est pas déjà en cours de transfert
    const { data: moto } = await supabase.from('motos').select('locked, client_id').eq('id', moto_id).single();
    if (moto?.locked) throw new Error('Cette moto est déjà en cours de transfert');
    // Générer le code
    const code = 'MK-TR-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const expire_at = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    // Créer le transfert
    const tr = await insert('transferts', {
      garage_id, moto_id,
      vendeur_client_id: moto.client_id,
      acheteur_nom, acheteur_email: acheteur_email || null,
      prix, km_cession, notes: notes || '',
      code, expire_at, statut: 'initie'
    });
    // Ajouter le step
    await insert('transfert_steps', { transfert_id: tr.id, etape: 'initie', par: 'garage' });
    // Verrouiller la moto
    await update('motos', moto_id, { locked: true, locked_reason: `Transfert ${code}` });
    return { transfert: tr, code, expire_dans: '48 heures' };
  },

  async confirmerVendeur(code) {
    const { data: tr, error } = await supabase.from('transferts').select('*').eq('code', code).single();
    if (error || !tr) throw new Error('Code invalide');
    if (tr.statut !== 'initie') throw new Error('Non confirmable dans cet état');
    const updated = await update('transferts', tr.id, { statut: 'vendeur_confirme' });
    await insert('transfert_steps', { transfert_id: tr.id, etape: 'vendeur_confirme', par: 'vendeur' });
    return updated;
  },

  async consulter(code) {
    const { data: tr, error } = await supabase.from('transferts').select('*').eq('code', code).single();
    if (error || !tr) throw new Error('Code invalide');
    const moto  = await Motos.getById(tr.moto_id, tr.garage_id).catch(() => null);
    const { data: ints } = await supabase.from('interventions').select('*').eq('moto_id', tr.moto_id).order('date_intervention', { ascending: false });
    if (['vendeur_confirme','initie'].includes(tr.statut)) {
      await update('transferts', tr.id, { statut: 'acheteur_consulte' });
      await insert('transfert_steps', { transfert_id: tr.id, etape: 'acheteur_consulte', par: 'acheteur' });
    }
    return { dossier: { moto, interventions: ints || [] }, transfert: { code, acheteur_nom: tr.acheteur_nom, prix: tr.prix } };
  },

  async finaliser(code, signature_acheteur) {
    const { data: tr, error } = await supabase.from('transferts').select('*').eq('code', code).single();
    if (error || !tr) throw new Error('Code invalide');
    if (!['acheteur_consulte','vendeur_confirme'].includes(tr.statut)) throw new Error('Non finalisable');
    // Créer le client acheteur
    let nc = null;
    if (tr.acheteur_email) {
      const { data } = await supabase.from('clients').select('id').eq('email', tr.acheteur_email).eq('garage_id', tr.garage_id).single();
      nc = data;
    }
    if (!nc) {
      nc = await insert('clients', {
        garage_id: tr.garage_id, nom: tr.acheteur_nom,
        email: tr.acheteur_email || null
      });
    }
    // Transférer la moto
    await update('motos', tr.moto_id, { client_id: nc.id, locked: false, locked_reason: null });
    // Générer le certificat
    const crypto = require('crypto');
    const certId = 'CERT-2026-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const hash   = crypto.createHash('sha256').update(certId + code).digest('hex');
    // Finaliser
    const updated = await update('transferts', tr.id, {
      statut: 'finalise', nouveau_client_id: nc.id,
      signature_acheteur, certificat_id: certId,
      certificat_hash: hash, finalise_at: new Date().toISOString()
    });
    await insert('transfert_steps', { transfert_id: tr.id, etape: 'finalise', par: 'acheteur' });
    return { certificat: { id: certId, hash }, transfert: updated, nouveau_proprietaire: nc };
  }
};

// ══════════════════════════════════════════════════════════
// STORAGE — Fichiers (factures, photos)
// ══════════════════════════════════════════════════════════
const Storage = {

  BUCKET_FACTURES: 'factures',
  BUCKET_PHOTOS:   'photos-motos',
  BUCKET_CERTS:    'certificats',

  async uploadFacture(garage_id, intervention_id, fileBuffer, mimeType) {
    const ext  = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
    const path = `${garage_id}/${intervention_id}.${ext}`;
    const { data, error } = await supabase.storage
      .from(Storage.BUCKET_FACTURES)
      .upload(path, fileBuffer, { contentType: mimeType, upsert: true });
    if (error) throw new Error(`Storage: ${error.message}`);
    const { data: url } = supabase.storage.from(Storage.BUCKET_FACTURES).getPublicUrl(path);
    return url.publicUrl;
  },

  async uploadPhoto(garage_id, moto_id, fileBuffer) {
    const path = `${garage_id}/${moto_id}.jpg`;
    await supabase.storage.from(Storage.BUCKET_PHOTOS).upload(path, fileBuffer, { contentType: 'image/jpeg', upsert: true });
    const { data: url } = supabase.storage.from(Storage.BUCKET_PHOTOS).getPublicUrl(path);
    return url.publicUrl;
  },

  async getFactureSignedUrl(garage_id, intervention_id, ext = 'pdf') {
    const path = `${garage_id}/${intervention_id}.${ext}`;
    const { data, error } = await supabase.storage
      .from(Storage.BUCKET_FACTURES)
      .createSignedUrl(path, 3600); // 1h
    if (error) throw new Error(`SignedUrl: ${error.message}`);
    return data.signedUrl;
  }
};

// ══════════════════════════════════════════════════════════
// REALTIME — Souscription sync live
// ══════════════════════════════════════════════════════════
const Realtime = {

  // Souscription côté client (app mobile)
  subscribeToMoto(moto_id, callback) {
    return supabase.channel(`moto-${moto_id}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'interventions',
        filter: `moto_id=eq.${moto_id}`
      }, payload => callback('intervention', payload))
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'motos',
        filter: `id=eq.${moto_id}`
      }, payload => callback('moto', payload))
      .subscribe();
  },

  // Souscription côté garage (tableau de bord live)
  subscribeToGarage(garage_id, callback) {
    return supabase.channel(`garage-${garage_id}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'interventions',
        filter: `garage_id=eq.${garage_id}`
      }, payload => callback('new_intervention', payload))
      .subscribe();
  },

  unsubscribe(channel) {
    supabase.removeChannel(channel);
  }
};

// ══════════════════════════════════════════════════════════
// FRAUDE
// ══════════════════════════════════════════════════════════
const Fraude = {

  async sauvegarder(garage_id, { moto_id, garage_nom, montant, km, score, verdict, checks, qr_valide, signature_valide }) {
    return insert('fraude_verifications', {
      garage_id, moto_id: moto_id || null,
      garage_nom, montant, km, score, verdict,
      check_document:  checks.document,
      check_ocr:       checks.ocr,
      check_coherence: checks.coherence,
      check_qr:        checks.qr_code,
      check_signature: checks.signature,
      recommandation:  score >= 85 ? 'Valider' : score >= 60 ? 'Vérification manuelle' : 'Rejeter'
    });
  },

  async historique(garage_id) {
    return query('fraude_verifications', { garage_id }, { order: 'created_at', asc: false });
  }
};

// ══════════════════════════════════════════════════════════
// ORDRES DE RÉPARATION
// ══════════════════════════════════════════════════════════

// Matrice de transitions autorisées pour PATCH /statut (L3a-ter)
// Migration 26 (L10) : 'valide_client' renommé 'accepte', 'refuse' ajouté.
// §3 spec L10 (décision 16/07, confirmé par Mehdi) : 'refuse' reste
// MODIFIABLE (retour brouillon possible) — c'est un refus de prix/devis,
// réversible par nature, PAS un état terminal. 'annule' reste terminal :
// le garage a physiquement arrêté le dossier, décision définitive.
const _OR_TRANS = {
  brouillon: ['accepte', 'refuse', 'annule'],
  accepte:   ['brouillon', 'en_cours', 'annule'],
  en_cours:  ['attente', 'annule'],          // termine via /cloturer
  attente:   ['en_cours', 'annule'],
  termine:   ['en_cours', 'annule'],          // facture via /facturer ; en_cours = correction
  facture:   ['annule'],                      // terminal sauf annulation ADMIN/CONCESSION
  annule:    [],                              // terminal absolu (garage a arrêté le dossier)
  refuse:    ['brouillon']                    // PAS terminal — refus réversible, retour brouillon
};

const OrdresReparation = {

  async list(garage_id, filters = {}) {
    let q = supabase.from('ordres_reparation')
      // or_taches chargé pour le mode mécano (compteur à_faire) — V1 OK faible volume,
      // dénormaliser nb_taches_a_faire sur ordres_reparation si liste lente en production
      .select('*, motos(marque, modele, plaque, clients(nom)), or_taches(id, statut)')
      .eq('garage_id', garage_id)
      .order('date_ouverture', { ascending: false });
    if (filters.statut)  q = q.eq('statut', filters.statut);
    if (filters.moto_id) q = q.eq('moto_id', filters.moto_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  },

  async getById(id, garage_id) {
    const { data, error } = await supabase.from('ordres_reparation')
      .select('*, motos(marque, modele, plaque, clients(nom, email)), or_taches(*), or_pieces(*)')
      .eq('id', id).eq('garage_id', garage_id).single();
    if (error) throw new Error(error.message);
    const { or_taches, or_pieces, motos, ...or } = data;
    const taches = (or_taches || []).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    const totaux = {
      total_mo_ht:     or.total_mo_ht,
      total_pieces_ht: or.total_pieces_ht,
      total_ht:        or.total_ht,
      total_tva:       or.total_tva,
      total_ttc:       or.total_ttc
    };
    return { ordre_reparation: or, moto: motos || null, taches, pieces: or_pieces || [], totaux };
  },

  // L10 commit 2 (Bloc A) : attribution atomique via attribuer_numero_or()
  // (migration 27 — INSERT ... ON CONFLICT DO UPDATE ... RETURNING, verrou
  // de ligne implicite sur (garage_id, annee), pas de doublon possible même
  // sous création concurrente). Ne remplace PAS numero_or (ancien champ,
  // intact) — alimente uniquement la nouvelle colonne `numero`.
  async attribuerNumeroOr(garage_id) {
    const { data, error } = await supabase.rpc('attribuer_numero_or', { p_garage_id: garage_id });
    if (error) throw new Error('Séquence numéro OR : ' + error.message);
    return data;
  },

  async create(garage_id, payload) {
    const { moto_id, devis_id, technicien_id, km_entree, notes_atelier, notes_client } = payload;
    // Fix review, finding #8 : la recherche moto, le COUNT (numero_or) et le
    // RPC attribuer_numero_or (numero) ne dépendent que de garage_id/moto_id
    // — aucun des trois ne dépend du résultat des autres, exécutés en parallèle.
    const [{ data: moto, error: me }, { count }, numero] = await Promise.all([
      supabase.from('motos').select('client_id, km').eq('id', moto_id).eq('garage_id', garage_id).single(),
      supabase.from('ordres_reparation').select('id', { count: 'exact', head: true }).eq('garage_id', garage_id),
      OrdresReparation.attribuerNumeroOr(garage_id)
    ]);
    if (me) throw new Error('Moto non trouvée');
    const numero_or = `OR-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;
    const or = await insert('ordres_reparation', {
      garage_id,
      numero_or,
      numero,
      moto_id,
      client_id:     moto.client_id || null,
      devis_id:      devis_id      || null,
      technicien_id: technicien_id || null,
      statut:        'brouillon',
      km_entree:     parseInt(km_entree) || moto.km || 0,
      notes_atelier: notes_atelier || '',
      notes_client:  notes_client  || ''
    });
    const totaux = { total_mo_ht: 0, total_pieces_ht: 0, total_ht: 0, total_tva: 0, total_ttc: 0 };
    return { ordre_reparation: or, totaux };
  },

  async update(id, garage_id, payload) {
    const allowed = ['statut', 'technicien_id', 'km_entree', 'notes_atelier', 'notes_client'];
    const patch = {};
    allowed.forEach(k => { if (payload[k] !== undefined) patch[k] = payload[k]; });
    if (Object.keys(patch).length > 0) await update('ordres_reparation', id, patch);
    const { data, error } = await supabase.from('ordres_reparation')
      .select('*').eq('id', id).eq('garage_id', garage_id).single();
    if (error) throw new Error(error.message);
    return data;
  },

  async cloturer(id, garage_id, { km_sortie, acteur_id }) {
    const or = await OrdresReparation._getOrRaw(id, garage_id);
    if (or.statut !== 'en_cours')
      throw new Error(`Transition interdite : seul un OR 'en_cours' peut être clôturé (statut actuel: '${or.statut}')`);
    if (km_sortie < (or.km_entree || 0))
      throw new Error(`km_sortie (${km_sortie}) doit être >= km_entree (${or.km_entree || 0})`);

    const tachesNonFaites = await supabase.from('or_taches')
      .select('id, statut').eq('or_id', id).neq('statut', 'fait');
    if (tachesNonFaites.data?.length > 0) {
      console.warn(`[OR ${id}] Clôturé avec ${tachesNonFaites.data.length} tâche(s) non terminée(s) :`,
        tachesNonFaites.data.map(t => `#${t.id}(${t.statut})`).join(', '));
    }

    const orMaj = await OrdresReparation.recalculerTotaux(id);
    const totaux = {
      total_mo_ht:     orMaj.total_mo_ht,
      total_pieces_ht: orMaj.total_pieces_ht,
      total_ht:        orMaj.total_ht,
      total_tva:       orMaj.total_tva,
      total_ttc:       orMaj.total_ttc
    };

    await supabase.from('ordres_reparation').update({
      statut: 'termine', km_sortie, date_cloture: new Date().toISOString()
    }).eq('id', id);

    // KM-04 : le km de sortie représente un relevé compteur "live" — il passe par la
    // validation partagée (releves_km + trigger). Un rejet est surfacé, plus de skip silencieux.
    // D-04 : acteur = le membre garage qui clôture (acteur_id threadé depuis l'endpoint),
    // fallback garage_id si absent — jamais anonyme.
    const releveKm = await RelevesKm.enregistrer(garage_id, or.moto_id, {
      km: km_sortie, type_evenement: 'lecture', acteur_type: 'garage', acteur_id: acteur_id || garage_id
    });
    // releveKm.accepted === false => km_sortie régresse vs historique ; on l'expose dans la réponse.

    let intervention, nouveau_score = null, nouvelle_couleur = null;
    if (or.devis_id) {
      const { data: intExist } = await supabase.from('interventions')
        .select('id').eq('devis_id', or.devis_id).maybeSingle();
      if (intExist) {
        const { data: intMaj } = await supabase.from('interventions').update({
          km:          km_sortie,
          montant_ht:  totaux.total_ht,
          montant_ttc: totaux.total_ttc,
          description: `OR ${or.numero_or} — clôturé`
        }).eq('id', intExist.id).select().single();
        intervention = intMaj;
        const { data: motoScore } = await supabase.from('motos')
          .select('score, couleur_dossier').eq('id', or.moto_id).single();
        nouveau_score    = motoScore?.score;
        nouvelle_couleur = motoScore?.couleur_dossier;
      }
    }
    if (!intervention) {
      const sync = await Interventions.create(garage_id, or.moto_id, {
        type:        'bleu',
        titre:       `OR ${or.numero_or}`,
        description: or.notes_atelier || `Clôture OR ${or.numero_or}`,
        km:          km_sortie,
        montant_ht:  totaux.total_ht,
        montant_ttc: totaux.total_ttc,
        devis_id:    or.devis_id || null
      });
      intervention    = sync.intervention;
      nouveau_score   = sync.nouveau_score;
      nouvelle_couleur = sync.nouvelle_couleur;
    }

    const { data: orFinal } = await supabase.from('ordres_reparation').select('*').eq('id', id).single();
    return { ordre_reparation: orFinal, intervention, totaux, nouveau_score, nouvelle_couleur, km_releve: releveKm };
  },

  async recalculerTotaux(or_id) {
    // Fix review, finding #8 : les 2 SELECT sont indépendants, exécutés en parallèle.
    const [{ data: taches }, { data: pieces }] = await Promise.all([
      supabase.from('or_taches').select('montant_ht').eq('or_id', or_id),
      supabase.from('or_pieces').select('montant_ht, tva_pct').eq('or_id', or_id)
    ]);
    const total_mo_ht     = (taches || []).reduce((s, t) => s + (t.montant_ht || 0), 0);
    const total_pieces_ht = (pieces || []).reduce((s, p) => s + (p.montant_ht || 0), 0);
    const total_ht        = total_mo_ht + total_pieces_ht;
    const tva_mo          = (taches || []).reduce((s, t) => s + (t.montant_ht || 0) * 0.20, 0);
    const tva_pieces      = (pieces || []).reduce((s, p) => s + (p.montant_ht || 0) * ((p.tva_pct || 20) / 100), 0);
    const { data: orMaj, error } = await supabase.from('ordres_reparation').update({
      total_mo_ht:     +total_mo_ht.toFixed(2),
      total_pieces_ht: +total_pieces_ht.toFixed(2),
      total_ht:        +total_ht.toFixed(2),
      total_tva:       +(tva_mo + tva_pieces).toFixed(2),
      total_ttc:       +(total_ht + tva_mo + tva_pieces).toFixed(2)
    }).eq('id', or_id).select().single();
    if (error) throw new Error(error.message);
    return orMaj;
  },

  async logHistorique(or_id, ancien_statut, nouveau_statut, action, payload, ctx) {
    try {
      await supabase.from('or_historique').insert({
        or_id,
        ancien_statut:  ancien_statut  || null,
        nouveau_statut: nouveau_statut || null,
        action,
        acteur_id:   ctx ? (ctx.user_id || null) : null,
        acteur_role: ctx ? (ctx.role    || null) : null,
        payload:     payload           || null
      });
    } catch (e) {
      console.warn('[L3a-ter] logHistorique failed:', e.message);
    }
  },

  // L10 commit 2 (Bloc B, point 1) : une ligne (tâche/pièce) ajoutée sur un
  // OR déjà 'en_cours' bascule l'OR en 'attente' avec attente_auto=TRUE —
  // ce marqueur (migration 27) distingue cette attente "système" d'une
  // attente posée manuellement (PATCH /statut, motif humain type "pièce
  // manquante"), qui reste attente_auto=FALSE. Sert de garde pour
  // _revenirEnCoursSiPlusDeLigneEnAttente ci-dessous : on ne reprend
  // jamais automatiquement une attente que le garage a posée lui-même.
  async _basculerEnAttentePourLigne(or_id, ctx) {
    const motif = "Travaux complémentaires en attente d'acceptation client";
    // Fix review, finding #5 : garde .eq('statut','en_cours') pour rendre
    // l'écriture conditionnelle à l'état lu par l'appelant — sans ça, un
    // TOCTOU entre la lecture du statut (dans create()) et cette écriture
    // pouvait écraser silencieusement un statut changé entre-temps (ex:
    // clôture concurrente). .select('id') permet de détecter si la garde a
    // bloqué l'update (aucune ligne retournée = statut déjà changé).
    const { data, error } = await supabase.from('ordres_reparation')
      .update({ statut: 'attente', attente_motif: motif, attente_auto: true })
      .eq('id', or_id).eq('statut', 'en_cours').select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return;
    await OrdresReparation.logHistorique(or_id, 'en_cours', 'attente', 'ligne_ajoutee_attente', { motif }, ctx);
  },

  // L10 commit 2 (Bloc B, point 2) : appelé après qu'une ligne complémentaire
  // vient d'être acceptée par le client. Repasse l'OR en 'en_cours'
  // UNIQUEMENT si (a) plus aucune ligne (tâche ou pièce) n'est en attente
  // d'acceptation ET (b) l'attente actuelle a été posée automatiquement
  // (attente_auto=TRUE) — une attente manuelle (pièce manquante, etc.)
  // n'est jamais levée par cette fonction, même si toutes les lignes sont
  // acceptées entre-temps.
  async _revenirEnCoursSiPlusDeLigneEnAttente(or_id, ctx) {
    // Fix review, finding #8 : les 2 COUNT sont indépendants, exécutés en
    // parallèle plutôt qu'en séquence.
    const [{ count: ct }, { count: cp }] = await Promise.all([
      supabase.from('or_taches').select('id', { count: 'exact', head: true }).eq('or_id', or_id).eq('en_attente_acceptation_client', true),
      supabase.from('or_pieces').select('id', { count: 'exact', head: true }).eq('or_id', or_id).eq('en_attente_acceptation_client', true)
    ]);
    if ((ct || 0) + (cp || 0) > 0) return;

    const { data: or, error: oe } = await supabase.from('ordres_reparation')
      .select('statut, attente_auto').eq('id', or_id).single();
    if (oe || !or || or.statut !== 'attente' || !or.attente_auto) return;

    // Fix review, finding #6 : attente_motif n'était jamais réinitialisé —
    // un texte de pause périmé restait affiché sur un OR redevenu actif.
    const { error } = await supabase.from('ordres_reparation')
      .update({ statut: 'en_cours', attente_auto: false, attente_motif: null })
      .eq('id', or_id);
    if (error) throw new Error(error.message);
    await OrdresReparation.logHistorique(or_id, 'attente', 'en_cours', 'ligne_acceptee_reprise', null, ctx);
  },

  async changerStatut(id, garage_id, ctx, { nouveau_statut, attente_motif, km_sortie, signature_base64, annulation_motif, refus_motif }) {
    const or = await OrdresReparation._getOrRaw(id, garage_id);
    const ancien = or.statut;

    // Transitions réservées aux endpoints dédiés
    if (ancien === 'en_cours' && nouveau_statut === 'termine')
      throw new Error('WRONG_ENDPOINT: utiliser POST /ordres-reparation/:id/cloturer');
    if (ancien === 'termine' && nouveau_statut === 'facture')
      throw new Error('WRONG_ENDPOINT: utiliser POST /ordres-reparation/:id/facturer');

    const autorise = _OR_TRANS[ancien] || [];
    if (!autorise.includes(nouveau_statut))
      throw new Error('INVALID_TRANSITION: ' + ancien + ' → ' + nouveau_statut);

    if (nouveau_statut === 'attente' && !attente_motif)
      throw new Error('attente_motif requis pour passer en attente');

    // L10 commit 2 (fix review, finding #1) : sortir manuellement de
    // 'attente' vers 'en_cours' pendant que des lignes complémentaires
    // attendent encore une acceptation client court-circuiterait le
    // contrôle que la fonctionnalité doit garantir — bloqué explicitement.
    if (ancien === 'attente' && nouveau_statut === 'en_cours') {
      const { count: ct } = await supabase.from('or_taches')
        .select('id', { count: 'exact', head: true }).eq('or_id', id).eq('en_attente_acceptation_client', true);
      const { count: cp } = await supabase.from('or_pieces')
        .select('id', { count: 'exact', head: true }).eq('or_id', id).eq('en_attente_acceptation_client', true);
      if ((ct || 0) + (cp || 0) > 0)
        throw new Error('INVALID_TRANSITION: des lignes complémentaires attendent encore une acceptation client — impossible de reprendre manuellement');
    }

    // L10 commit 2 (fix review, finding #1) : changerStatut est le chemin
    // MANUEL (PATCH /statut) — attente_auto est réservé au chemin
    // automatique (_basculerEnAttentePourLigne). Toute transition manuelle
    // remet donc attente_auto à false, y compris vers 'attente' (motif
    // humain) : sans ça, un ancien attente_auto=true resterait périmé et
    // pourrait plus tard faire annuler à tort une pause manuelle réelle
    // par _revenirEnCoursSiPlusDeLigneEnAttente.
    const patch = { statut: nouveau_statut, attente_auto: false };
    if (attente_motif)    patch.attente_motif    = attente_motif;
    if (km_sortie)        patch.km_sortie        = parseInt(km_sortie);
    if (signature_base64) patch.signature_client = signature_base64;
    if (annulation_motif) patch.annulation_motif = annulation_motif;
    if (refus_motif)      patch.refus_motif      = refus_motif;

    const { data: orMaj, error } = await supabase.from('ordres_reparation')
      .update(patch).eq('id', id).eq('garage_id', garage_id).select('*').single();
    if (error) throw new Error(error.message);

    await OrdresReparation.logHistorique(id, ancien, nouveau_statut, 'statut_change',
      attente_motif ? { attente_motif } : null, ctx);
    return orMaj;
  },

  async attribuerNumeroFacture() {
    const { data, error } = await supabase.rpc('attribuer_numero_facture');
    if (error) throw new Error('Séquence facture : ' + error.message);
    return data;
  },

  async facturer(id, garage_id, ctx, { signature_base64 } = {}) {
    const or = await OrdresReparation._getOrRaw(id, garage_id);
    if (or.statut !== 'termine')
      throw new Error("Seul un OR 'termine' peut être facturé (statut actuel : '" + or.statut + "')");
    if (or.numero_facture)
      throw new Error('Numéro de facture déjà attribué : ' + or.numero_facture);

    const numero_facture = await OrdresReparation.attribuerNumeroFacture();
    const patch = { statut: 'facture', numero_facture, facture_emise_at: new Date().toISOString() };
    if (signature_base64) patch.signature_client = signature_base64;
    // TODO L3a-septies : générer PDF + upload Cloudinary → patch.pdf_url

    const { data: orMaj, error } = await supabase.from('ordres_reparation')
      .update(patch).eq('id', id).eq('garage_id', garage_id).select('*').single();
    if (error) throw new Error(error.message);

    await OrdresReparation.logHistorique(id, 'termine', 'facture', 'facturation',
      { numero_facture, avec_signature: !!signature_base64 }, ctx);
    return orMaj;
  },

  async getHistorique(id, garage_id) {
    await OrdresReparation._getOrRaw(id, garage_id); // vérifie l'accès
    const { data, error } = await supabase.from('or_historique')
      .select('*').eq('or_id', id).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getDetailsCompletsPourFacture(id, garage_id) {
    const { data, error } = await supabase.from('ordres_reparation')
      .select('*, motos(*, clients(*)), or_taches(*), or_pieces(*), garages(*)')
      .eq('id', id).eq('garage_id', garage_id).single();
    if (error) throw new Error(error.message);
    const { or_taches, or_pieces, motos, garages, ...or } = data;
    return {
      or,
      moto:   motos   || null,
      client: motos   ? (motos.clients || null) : null,
      taches: or_taches || [],
      pieces: or_pieces || [],
      garage: garages || null
    };
  },

  async _getOrRaw(id, garage_id) {
    const { data, error } = await supabase.from('ordres_reparation')
      .select('*').eq('id', id).eq('garage_id', garage_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data)  throw new Error('NOT_FOUND: Ordre non trouvé');
    return data;
  }
};

// ══════════════════════════════════════════════════════════
// OR — TÂCHES
// ══════════════════════════════════════════════════════════
const OrTaches = {

  // ctx optionnel (défaut null) : ne casse pas tests/test-or-e2e.js qui
  // appelle create() sans ctx. Uniquement utilisé pour logHistorique côté
  // bascule attente auto (L10 commit 2, Bloc B point 1).
  async create(garage_id, or_id, payload, ctx = null) {
    const { data: or, error: oe } = await supabase.from('ordres_reparation')
      .select('id, statut').eq('id', or_id).eq('garage_id', garage_id).single();
    if (oe) throw new Error('Ordre non trouvé');
    const dh = parseFloat(payload.duree_h)     || 0;
    const th = parseFloat(payload.taux_horaire) || 0;
    // en_cours -> première ligne complémentaire, déclenche la bascule.
    // attente (auto OU manuelle, ex: "pièce manquante") -> une ligne ajoutée
    // pendant une pause quelconque doit aussi requérir l'acceptation client
    // (fix review, finding #2 : l'ancienne condition ne couvrait que
    // l'attente auto, laissant passer sans acceptation toute ligne ajoutée
    // pendant une attente manuelle). Pas de re-bascule ni de nouveau log
    // historique si l'OR est déjà en 'attente' (quelle qu'en soit l'origine)
    // — seule la ligne elle-même est marquée.
    const enCoursDejaLance = or.statut === 'en_cours';
    const requiertAcceptation = enCoursDejaLance || or.statut === 'attente';
    const tache = await insert('or_taches', {
      garage_id, or_id,
      ordre:         parseInt(payload.ordre) || 0,
      libelle:       payload.libelle,
      description:   payload.description   || '',
      duree_h:       dh,
      taux_horaire:  th,
      montant_ht:    +(dh * th).toFixed(2),
      technicien_id: payload.technicien_id || null,
      statut:        'a_faire',
      ajoutee_en_cours:             requiertAcceptation,
      en_attente_acceptation_client: requiertAcceptation
    });
    if (enCoursDejaLance) await OrdresReparation._basculerEnAttentePourLigne(or_id, ctx);
    const orMaj = await OrdresReparation.recalculerTotaux(or_id);
    return { tache, ordre_reparation: orMaj };
  },

  // L10 commit 2 (Bloc B point 2) : le client accepte une ligne complémentaire
  // ajoutée en cours d'intervention. Ownership déjà vérifiée par l'appelant
  // (route handler, même pattern que GET /client/ordres-reparation/:id) —
  // pas de garage_id ici, le client n'a pas de contexte garage.
  async accepterLigne(id, client_id) {
    const { data: existing, error: fe } = await supabase.from('or_taches')
      .select('*').eq('id', id).single();
    if (fe || !existing) throw new Error('Tâche non trouvée');
    if (!existing.en_attente_acceptation_client)
      throw new Error("Cette ligne n'est pas en attente d'acceptation client");
    const { data: tache, error } = await supabase.from('or_taches')
      .update({
        en_attente_acceptation_client: false,
        date_acceptation_ligne:        new Date().toISOString(),
        accepte_par_client_id:         client_id
      }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await OrdresReparation._revenirEnCoursSiPlusDeLigneEnAttente(existing.or_id, { user_id: client_id, role: 'CLIENT' });
    const orMaj = await OrdresReparation.recalculerTotaux(existing.or_id);
    return { tache, ordre_reparation: orMaj };
  },

  async update(id, garage_id, payload) {
    const { data: existing, error: fe } = await supabase.from('or_taches')
      .select('*').eq('id', id).eq('garage_id', garage_id).single();
    if (fe) throw new Error('Tâche non trouvée');
    const allowed = ['libelle', 'description', 'duree_h', 'taux_horaire', 'technicien_id', 'statut', 'ordre'];
    const patch = {};
    allowed.forEach(k => { if (payload[k] !== undefined) patch[k] = payload[k]; });
    const newDh = patch.duree_h      !== undefined ? parseFloat(patch.duree_h)      : existing.duree_h;
    const newTh = patch.taux_horaire !== undefined ? parseFloat(patch.taux_horaire) : existing.taux_horaire;
    if (patch.duree_h !== undefined || patch.taux_horaire !== undefined) {
      patch.montant_ht = +(newDh * newTh).toFixed(2);
    }
    // Fix review, finding #4 : impossible de marquer une ligne 'fait' tant
    // qu'elle attend une acceptation client — sinon le travail est
    // enregistré comme terminé/facturable avant que le client n'ait
    // approuvé le complément.
    if (patch.statut === 'fait' && existing.en_attente_acceptation_client)
      throw new Error("Cette ligne attend encore une acceptation client — impossible de la marquer terminée avant validation");
    if (patch.statut === 'fait' && existing.statut !== 'fait') {
      patch.fait_le = new Date().toISOString();
    }
    const { data: tache, error } = await supabase.from('or_taches')
      .update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    const orMaj = await OrdresReparation.recalculerTotaux(existing.or_id);
    return { tache, ordre_reparation: orMaj };
  },

  // ctx optionnel (défaut null) — voir OrTaches.create pour le rationale.
  async remove(id, garage_id, ctx = null) {
    const { data: tache, error: fe } = await supabase.from('or_taches')
      .select('or_id, en_attente_acceptation_client').eq('id', id).eq('garage_id', garage_id).single();
    if (fe) throw new Error('Tâche non trouvée');
    const { error } = await supabase.from('or_taches').delete().eq('id', id);
    if (error) throw new Error(error.message);
    // Fix review, finding #3 : supprimer la dernière ligne encore en attente
    // d'acceptation ne doit pas laisser l'OR bloqué en 'attente' pour
    // toujours — même contrôle que l'acceptation elle-même.
    if (tache.en_attente_acceptation_client)
      await OrdresReparation._revenirEnCoursSiPlusDeLigneEnAttente(tache.or_id, ctx);
    const orMaj = await OrdresReparation.recalculerTotaux(tache.or_id);
    return { deleted_id: id, ordre_reparation: orMaj };
  }
};

// ══════════════════════════════════════════════════════════
// OR — PIÈCES
// ══════════════════════════════════════════════════════════
const OrPieces = {

  // ctx optionnel (défaut null) — voir OrTaches.create pour le rationale.
  async create(garage_id, or_id, payload, ctx = null) {
    const { data: or, error: oe } = await supabase.from('ordres_reparation')
      .select('id, statut').eq('id', or_id).eq('garage_id', garage_id).single();
    if (oe) throw new Error('Ordre non trouvé');
    const q  = parseFloat(payload.qte)   || 1;
    const pu = parseFloat(payload.pu_ht) || 0;
    // Voir OrTaches.create pour le rationale (attente auto OU manuelle ->
    // ligne aussi marquée en attente, pas de re-bascule).
    const enCoursDejaLance = or.statut === 'en_cours';
    const requiertAcceptation = enCoursDejaLance || or.statut === 'attente';
    const piece = await insert('or_pieces', {
      garage_id, or_id,
      piece_id:  payload.piece_id  || null,
      reference: payload.reference || '',
      libelle:   payload.libelle,
      qte:       q,
      pu_ht:     pu,
      tva_pct:   parseFloat(payload.tva_pct) || 20,
      montant_ht: +(q * pu).toFixed(2),
      ajoutee_en_cours:              requiertAcceptation,
      en_attente_acceptation_client: requiertAcceptation
    });
    if (enCoursDejaLance) await OrdresReparation._basculerEnAttentePourLigne(or_id, ctx);
    const orMaj = await OrdresReparation.recalculerTotaux(or_id);
    return { piece, ordre_reparation: orMaj };
  },

  // L10 commit 2 (Bloc B point 2) — voir OrTaches.accepterLigne pour le rationale.
  async accepterLigne(id, client_id) {
    const { data: existing, error: fe } = await supabase.from('or_pieces')
      .select('*').eq('id', id).single();
    if (fe || !existing) throw new Error('Pièce non trouvée');
    if (!existing.en_attente_acceptation_client)
      throw new Error("Cette ligne n'est pas en attente d'acceptation client");
    const { data: piece, error } = await supabase.from('or_pieces')
      .update({
        en_attente_acceptation_client: false,
        date_acceptation_ligne:        new Date().toISOString(),
        accepte_par_client_id:         client_id
      }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    await OrdresReparation._revenirEnCoursSiPlusDeLigneEnAttente(existing.or_id, { user_id: client_id, role: 'CLIENT' });
    const orMaj = await OrdresReparation.recalculerTotaux(existing.or_id);
    return { piece, ordre_reparation: orMaj };
  },

  async update(id, garage_id, payload) {
    const { data: existing, error: fe } = await supabase.from('or_pieces')
      .select('*').eq('id', id).eq('garage_id', garage_id).single();
    if (fe) throw new Error('Pièce non trouvée');
    const allowed = ['libelle', 'reference', 'qte', 'pu_ht', 'tva_pct'];
    const patch = {};
    allowed.forEach(k => { if (payload[k] !== undefined) patch[k] = payload[k]; });
    const newQ  = patch.qte   !== undefined ? parseFloat(patch.qte)   : existing.qte;
    const newPu = patch.pu_ht !== undefined ? parseFloat(patch.pu_ht) : existing.pu_ht;
    if (patch.qte !== undefined || patch.pu_ht !== undefined) {
      patch.montant_ht = +(newQ * newPu).toFixed(2);
    }
    const { data: piece, error } = await supabase.from('or_pieces')
      .update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    const orMaj = await OrdresReparation.recalculerTotaux(existing.or_id);
    return { piece, ordre_reparation: orMaj };
  },

  // ctx optionnel (défaut null) — voir OrTaches.remove pour le rationale.
  async delete(id, garage_id, ctx = null) {
    const { data: piece, error: fe } = await supabase.from('or_pieces')
      .select('or_id, en_attente_acceptation_client').eq('id', id).eq('garage_id', garage_id).single();
    if (fe) throw new Error('Pièce non trouvée');
    const { error } = await supabase.from('or_pieces').delete().eq('id', id);
    if (error) throw new Error(error.message);
    // Fix review, finding #3 — voir OrTaches.remove pour le rationale.
    if (piece.en_attente_acceptation_client)
      await OrdresReparation._revenirEnCoursSiPlusDeLigneEnAttente(piece.or_id, ctx);
    const orMaj = await OrdresReparation.recalculerTotaux(piece.or_id);
    return { deleted_id: id, ordre_reparation: orMaj };
  }
};

// ══════════════════════════════════════════════════════════
// CATALOGUE PIÈCES (L3c-a)
// ══════════════════════════════════════════════════════════
const CataloguePieces = {

  async search(garage_id, query, { limit = 20 } = {}) {
    const q = (query || '').trim().toLowerCase();
    if (q.length < 3) return [];
    const { data, error } = await supabase
      .from('catalogue_pieces')
      .select('id, reference, ean, libelle, marque, categorie, prix_vente_ht, tva_pct, stock_qte')
      .eq('garage_id', garage_id)
      .eq('actif', true)
      .or(`libelle.ilike.%${q}%,reference.ilike.%${q}%,marque.ilike.%${q}%`)
      .order('libelle')
      .limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Fondation L3c-b — disponible maintenant, utilisé par le scanner
  async getByEan(garage_id, ean) {
    if (!ean) return null;
    const { data, error } = await supabase
      .from('catalogue_pieces')
      .select('*')
      .eq('garage_id', garage_id)
      .eq('ean', ean.trim())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async create(garage_id, user_id, payload) {
    if (!payload.libelle || !payload.libelle.trim()) throw new Error('Champ requis: libelle');
    if (payload.prix_vente_ht === undefined || payload.prix_vente_ht === null || payload.prix_vente_ht === '') {
      throw new Error('Champ requis: prix_vente_ht');
    }
    const insert = {
      garage_id,
      reference:             payload.reference    || null,
      ean:                   payload.ean          || null,
      libelle:               payload.libelle.trim(),
      marque:                payload.marque       || null,
      categorie:             payload.categorie    || null,
      prix_achat_ht:         parseFloat(payload.prix_achat_ht)  || 0,
      prix_vente_ht:         parseFloat(payload.prix_vente_ht),
      tva_pct:               parseFloat(payload.tva_pct)        || 20,
      stock_qte:             parseInt(payload.stock_qte)        || 0,
      stock_min:             parseInt(payload.stock_min)        || 0,
      actif:                 true,
      created_by:            user_id || null,
      created_at_garage_id:  garage_id
    };
    const { data, error } = await supabase
      .from('catalogue_pieces')
      .insert(insert)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
};

// ══════════════════════════════════════════════════════════
// CONSOMMABLES (v1.6 — Phase 24) — état courant d'un consommable par moto
// ══════════════════════════════════════════════════════════

// Les 9 types canoniques v1.6 — source d'autorité = contrainte CHECK migration 23.
// Une seule copie JS pour valider côté endpoint (Pitfall 5 RESEARCH.md) ; extensible sans dupliquer.
const TYPES_CONSOMMABLES = ['pneu_av','pneu_ar','chaine','plaquettes_av','plaquettes_ar','disque_av','disque_ar','huile_moteur','liquide_frein'];

const Consommables = {
  // upsert (pas insert) : UNIQUE(moto_id, type_consommable) — la table modélise
  // l'état courant (une ligne par type), pas un historique append-only.
  async upsert(moto_id, { type_consommable, km_montage, date_montage, reference, seuil_km_override, seuil_mois_override }) {
    if (!moto_id) throw new Error('[Consommables.upsert] moto_id requis');
    if (!type_consommable) throw new Error('[Consommables.upsert] type_consommable requis');

    // D-05 generalise (fix anti-spam, reco 20/07/2026) : toute mise a jour manuelle de
    // km_montage/date_montage (ex. purge liquide_frein sans photo, via PATCH) doit
    // rearmer le rappel — exactement comme une nouvelle photo (PhotosConsommables.insert).
    // Sans ce lookup, un consommable sans methode photo (liquide_frein, huile_moteur,
    // plaquettes, disques) reste mute a vie apres sa 1ere notification : le calcul de
    // retard est recalcule a chaque cron independamment de ce flag, mais le flag
    // dernier_rappel_envoye_at, lui, ne se reinitialisait QUE via une photo avant ce correctif.
    const { data: existing } = await supabase
      .from('consommables').select('km_montage, date_montage')
      .eq('moto_id', moto_id).eq('type_consommable', type_consommable)
      .maybeSingle();

    const nextKm = (km_montage !== undefined && km_montage !== null && km_montage !== '') ? parseInt(km_montage) : null;
    const nextDate = date_montage || null;
    const referenceChanged = !!existing && (existing.km_montage !== nextKm || existing.date_montage !== nextDate);

    const payload = {
      moto_id,
      type_consommable,
      km_montage: nextKm,
      date_montage: nextDate,
      reference: reference || null,
      updated_at: new Date().toISOString()
    };
    if (referenceChanged) {
      payload.dernier_rappel_envoye_at = null;
      payload.dernier_rappel_km = null;
      // Migration 31 : le palier calendaire (service distinct, Phase L11) se rearme
      // selon la meme regle — une reference renouvelee reinitialise les deux
      // mecanismes anti-spam independamment (voir commentaire migration 31).
      payload.dernier_palier_calendaire_envoye_at = null;
      payload.dernier_palier_calendaire_km = null;
    }
    if (seuil_km_override !== undefined) {
      payload.seuil_km_override = (seuil_km_override !== null && seuil_km_override !== '') ? parseInt(seuil_km_override) : null;
    }
    if (seuil_mois_override !== undefined) {
      payload.seuil_mois_override = (seuil_mois_override !== null && seuil_mois_override !== '') ? parseInt(seuil_mois_override) : null;
    }

    const { data, error } = await supabase
      .from('consommables')
      .upsert(payload, { onConflict: 'moto_id,type_consommable' })
      .select().single();
    if (error) throw new Error(`[Consommables.upsert] ${error.message}`);
    return data;
  },

  async listByMoto(moto_id) {
    if (!moto_id) throw new Error('[Consommables.listByMoto] moto_id requis');
    const { data, error } = await supabase
      .from('consommables').select('*')
      .eq('moto_id', moto_id)
      .order('type_consommable');
    if (error) throw new Error(`[Consommables.listByMoto] ${error.message}`);
    return data || [];
  }
};

// ══════════════════════════════════════════════════════════
// PHOTOS CONSOMMABLES (v1.6 — Phase 24) — historique photo + résultat analyse vision
// ══════════════════════════════════════════════════════════
const PhotosConsommables = {
  // analyse_ia = objet contrat complet renvoyé par visionAnalysisService.analyzePhoto()
  // (pct_usure/etat/confiance/analyse_status/engine) ; analyse_status dupliqué en colonne
  // dédiée pour requêtes rapides. type_consommable dénormalisé DOIT être fourni (pas de CHECK
  // sur cette colonne — pitfall dénormalisation).
  async insert({ moto_id, consommable_id, type_consommable, photo_url, analyse_ia, analyse_status, km_a_la_photo, zone }) {
    if (!moto_id) throw new Error('[PhotosConsommables.insert] moto_id requis');
    if (!photo_url) throw new Error('[PhotosConsommables.insert] photo_url requis');
    const payload = {
      moto_id,
      consommable_id: consommable_id || null,
      type_consommable: type_consommable || null,
      photo_url,
      analyse_ia: analyse_ia || null,
      analyse_status: analyse_status || null,
      km_a_la_photo: (km_a_la_photo !== undefined && km_a_la_photo !== null && km_a_la_photo !== '') ? parseInt(km_a_la_photo) : null,
      zone: zone || null,  // Migration 30 : 'brin'|'couronne' pour chaîne, NULL sinon (contrainte CHECK côté DB)
    };
    const { data, error } = await supabase
      .from('photos_consommables').insert(payload).select().single();
    if (error) throw new Error(`[PhotosConsommables.insert] ${error.message}`);

    // D-05 : toute nouvelle photo rearme le rappel du consommable lie (reset a NULL)
    if (consommable_id) {
      const { error: rErr } = await supabase.from('consommables')
        .update({ dernier_rappel_envoye_at: null, dernier_rappel_km: null })
        .eq('id', consommable_id);
      if (rErr) console.warn('[PhotosConsommables.insert] reset D-05 echoue:', rErr.message); // non bloquant
    }

    return data;
  },

  async listByConsommable(consommable_id) {
    if (!consommable_id) throw new Error('[PhotosConsommables.listByConsommable] consommable_id requis');
    const { data, error } = await supabase
      .from('photos_consommables').select('*')
      .eq('consommable_id', consommable_id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`[PhotosConsommables.listByConsommable] ${error.message}`);
    return data || [];
  }
};

// ══════════════════════════════════════════════════════════
// GARAGE USERS (L4 v2 hardening)
// ══════════════════════════════════════════════════════════
const GarageUsers = {

  async list(garageId) {
    const { data: rows, error } = await supabase
      .from('garage_users')
      .select('id, auth_user_id, role, actif, created_at')
      .eq('garage_id', garageId)
      .eq('actif', true)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`[garage_users] ${error.message}`);
    // Enrich avec email depuis Auth (N+1 acceptable — comptes par garage < 20)
    const enriched = await Promise.all((rows || []).map(async row => {
      const { data: u } = await supabase.auth.admin.getUserById(row.auth_user_id);
      return { ...row, email: u?.user?.email || null };
    }));
    return enriched;
  },

  async create({ garageId, email, password, role, createdBy }) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true
    });
    if (authError) throw new Error(`Auth: ${authError.message}`);

    const { error: roleErr } = await supabase.auth.admin.updateUserById(
      authData.user.id,
      { app_metadata: { role } }
    );
    if (roleErr) console.warn('[GarageUsers.create] role assignment failed —', roleErr.message);

    const row = await insert('garage_users', {
      auth_user_id: authData.user.id,
      garage_id:    garageId,
      role,
      created_by:   createdBy || null
    });
    return { id: row.id, auth_user_id: authData.user.id, email, role, garage_id: garageId, actif: true };
  },

  async update(id, garageId, patches) {
    // Vérifier ownership avant modification (pas de RLS v1)
    const { data: current, error: fetchErr } = await supabase
      .from('garage_users')
      .select('auth_user_id')
      .eq('id', id)
      .eq('garage_id', garageId)
      .single();
    if (fetchErr || !current) throw new Error('garage_user introuvable dans ce garage');

    if (patches.role !== undefined) {
      await supabase.auth.admin.updateUserById(
        current.auth_user_id,
        { app_metadata: { role: patches.role } }
      );
    }
    const ALLOWED = ['role', 'actif'];
    const clean = Object.fromEntries(
      Object.entries(patches).filter(([k, v]) => ALLOWED.includes(k) && v !== undefined)
    );
    return update('garage_users', id, clean);
  },

  async softDelete(id, garageId) {
    const { data: current, error: fetchErr } = await supabase
      .from('garage_users')
      .select('id')
      .eq('id', id)
      .eq('garage_id', garageId)
      .single();
    if (fetchErr || !current) throw new Error('garage_user introuvable dans ce garage');
    return update('garage_users', id, { actif: false });
  }
};

// ══════════════════════════════════════════════════════════
// L8 — PROPRIÉTAIRE POLYMORPHE
// ══════════════════════════════════════════════════════════

/**
 * resolveProprietaire(moto)
 * Prend un objet moto déjà chargé et retourne { type, nom, email }.
 */
async function resolveProprietaire(moto) {
  try {
    if (moto.proprietaire_type === 'client' && moto.client_id) {
      const { data, error } = await supabase
        .from('clients')
        .select('nom, email')
        .eq('id', moto.client_id)
        .single();
      if (error) throw error;
      return { type: 'client', nom: data.nom || null, email: data.email || null };
    }
    if (moto.proprietaire_type === 'garage' && moto.proprietaire_garage_id) {
      const { data, error } = await supabase
        .from('garages')
        .select('nom')
        .eq('id', moto.proprietaire_garage_id)
        .single();
      if (error) throw error;
      return { type: 'garage', nom: data.nom || null, email: null };
    }
    // inconnu ou champs manquants
    return {
      type:  'inconnu',
      nom:   moto.proprio_libre || 'Propriétaire inconnu',
      email: null
    };
  } catch (e) {
    console.error('[resolveProprietaire] DB error —', e.message);
    return { type: 'inconnu', nom: 'Propriétaire inconnu', email: null };
  }
}

/**
 * checkLimiteMotosClient(client_id)
 * Retourne { count, limite, is_pro, can_add }.
 */
async function checkLimiteMotosClient(client_id) {
  const [{ count: countResult, error: countErr }, { data: client, error: clientErr }] =
    await Promise.all([
      supabase
        .from('motos')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', client_id)
        .eq('proprietaire_type', 'client'),
      supabase
        .from('clients')
        .select('is_pro, limite_motos_gratuites')
        .eq('id', client_id)
        .single()
    ]);

  if (countErr) throw new Error(`[checkLimiteMotosClient] count: ${countErr.message}`);
  if (clientErr) throw new Error(`[checkLimiteMotosClient] client: ${clientErr.message}`);

  const count  = countResult || 0;
  const is_pro = client.is_pro || false;
  const limite = client.limite_motos_gratuites || 3;
  return {
    count,
    limite,
    is_pro,
    can_add: is_pro || count < limite
  };
}

/**
 * cessionMoto(moto_id, nouveau_proprietaire, mode, created_by)
 * nouveau_proprietaire : { type: 'client', id } | { type: 'garage', id } | { type: 'inconnu', libre }
 * mode : valeur de mode_acquisition_enum
 */
async function cessionMoto(moto_id, nouveau_proprietaire, mode, created_by = null) {
  // Étape 1 : fermer la ligne historique ouverte
  const { error: closeErr } = await supabase
    .from('motos_proprietaires_historique')
    .update({ date_fin: new Date().toISOString().slice(0, 10) })
    .eq('moto_id', moto_id)
    .is('date_fin', null);
  if (closeErr) throw new Error(`[cessionMoto] fermeture historique: ${closeErr.message}`);

  try {
    // Étape 2 : construire le patch moto selon le type
    const motoPatch = { proprietaire_type: nouveau_proprietaire.type };
    if (nouveau_proprietaire.type === 'client') {
      motoPatch.client_id = nouveau_proprietaire.id;
      motoPatch.proprietaire_garage_id = null;
      motoPatch.proprio_libre = null;
    } else if (nouveau_proprietaire.type === 'garage') {
      motoPatch.proprietaire_garage_id = nouveau_proprietaire.id;
      motoPatch.client_id = null;
      motoPatch.proprio_libre = null;
    } else {
      motoPatch.client_id = null;
      motoPatch.proprietaire_garage_id = null;
      motoPatch.proprio_libre = nouveau_proprietaire.libre || null;
    }

    // Étape 3 : mettre à jour la moto
    const { data: moto, error: motoErr } = await supabase
      .from('motos')
      .update(motoPatch)
      .eq('id', moto_id)
      .select()
      .single();
    if (motoErr) throw new Error(`[cessionMoto] update moto: ${motoErr.message}`);

    // Étape 4 : insérer la nouvelle entrée historique
    const histoPayload = {
      moto_id,
      proprietaire_type: nouveau_proprietaire.type,
      proprietaire_client_id: nouveau_proprietaire.type === 'client' ? nouveau_proprietaire.id : null,
      proprietaire_garage_id: nouveau_proprietaire.type === 'garage' ? nouveau_proprietaire.id : null,
      proprio_libre: nouveau_proprietaire.type === 'inconnu' ? (nouveau_proprietaire.libre || null) : null,
      date_debut: new Date().toISOString().slice(0, 10),
      mode_acquisition: mode,
      created_by: created_by || null
    };
    const { error: histoErr } = await supabase
      .from('motos_proprietaires_historique')
      .insert(histoPayload);
    if (histoErr) throw new Error(`[cessionMoto] insert historique: ${histoErr.message}`);

    return moto;
  } catch (err) {
    // Compensation : tenter de ré-ouvrir la ligne fermée à l'étape 1
    await supabase
      .from('motos_proprietaires_historique')
      .update({ date_fin: null })
      .eq('moto_id', moto_id)
      .not('date_fin', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    console.error('[cessionMoto] CRITICAL: échec cession, compensation partielle tentée —', err.message);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// BILLING EVENTS — idempotency guard + audit log
// ══════════════════════════════════════════════════════════
const BillingEvents = {
  async insert(stripe_event_id, event_type, payload) {
    const { data, error } = await supabase
      .from('billing_events')
      .insert({ stripe_event_id, event_type, payload })
      .select()
      .single();
    if (error) throw new Error(`[billing_events] ${error.message}`);
    return data;
  }
};

// ══════════════════════════════════════════════════════════
// PUSH SEND LOG — idempotency guard pour l'envoi de push (Phase 13)
// ══════════════════════════════════════════════════════════
const PushSendLog = {
  async insert(idempotency_key, client_id, token) {
    const { data, error } = await supabase
      .from('push_send_log')
      .insert({ idempotency_key, client_id: client_id || null, token: token || null })
      .select()
      .single();
    if (error) throw new Error(`[push_send_log] ${error.message}`);
    return data;
  }
};

// EXPORT
// ══════════════════════════════════════════════════════════
module.exports = {
  supabase,
  supabasePublic,
  Auth,
  Garages,
  Motos,
  RelevesKm,
  Interventions,
  Entretien,
  Transferts,
  Storage,
  Realtime,
  Fraude,
  OrdresReparation,
  OrTaches,
  OrPieces,
  CataloguePieces,
  Consommables,
  PhotosConsommables,
  TYPES_CONSOMMABLES,
  GarageUsers,
  resolveProprietaire,
  checkLimiteMotosClient,
  cessionMoto,
  BillingEvents,
  PushSendLog
};
