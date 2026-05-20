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

// Nouveau système Supabase (Publishable/Secret) avec fallback legacy
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ||      // nouveau
  process.env.SUPABASE_SERVICE_KEY;       // legacy

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
  process.env.SUPABASE_PUBLISHABLE_KEY || // nouveau
  process.env.SUPABASE_ANON_KEY ||        // legacy
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

  async getStats(garage_id) {
    const [motos, interventions, devis] = await Promise.all([
      supabase.from('motos').select('couleur_dossier, score').eq('garage_id', garage_id),
      supabase.from('interventions').select('type, montant_ht').eq('garage_id', garage_id),
      supabase.from('devis').select('statut, total_ttc').eq('garage_id', garage_id)
    ]);

    const motoData = motos.data || [];
    const intData  = interventions.data || [];
    const dvData   = devis.data || [];

    const parCouleur = { vert: 0, bleu: 0, jaune: 0, rouge: 0 };
    motoData.forEach(m => parCouleur[m.couleur_dossier]++);

    const parType = { vert: 0, bleu: 0, jaune: 0, rouge: 0 };
    intData.forEach(i => parType[i.type]++);

    const dvValides = dvData.filter(d => d.statut === 'valide');
    const caTTC     = dvValides.reduce((s, d) => s + (d.total_ttc || 0), 0);

    return {
      motos:         { total: motoData.length, par_couleur: parCouleur },
      interventions: { total: intData.length, par_type: parType },
      devis:         { total: dvData.length, valides: dvValides.length, ca_ttc: +caTTC.toFixed(2), ca_ht: +(caTTC/1.2).toFixed(2) }
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
    return data;
  },

  async getById(id, garage_id) {
    const { data, error } = await supabase.from('motos')
      .select('*, clients(nom, email, tel)')
      .eq('id', id)
      .eq('garage_id', garage_id)
      .single();
    if (error) throw new Error(error.message);
    return data;
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

    // Construire le payload moto selon le type de propriétaire
    const motoPayload = {
      garage_id,
      marque:  payload.marque,
      modele:  payload.modele,
      annee:   payload.annee,
      plaque:  payload.plaque,
      vin:     payload.vin,
      km:      payload.km || 0,
      proprietaire_type
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
      date_debut:              new Date().toISOString().slice(0, 10),
      mode_acquisition:        payload.mode_acquisition || 'inconnu'
    };
    const { error: histoErr } = await supabase.from('motos_proprietaires_historique').insert(histoPayload);
    if (histoErr) throw new Error(`[Motos.create] insert historique: ${histoErr.message}`);

    return moto;
  },

  async update(id, garage_id, payload) {
    const allowed = ['km','pneu_av','pneu_ar','pneu_km_montage','couleur','photo_url'];
    const clean   = Object.fromEntries(Object.entries(payload).filter(([k]) => allowed.includes(k)));
    const { data, error } = await supabase.from('motos').update(clean).eq('id', id).eq('garage_id', garage_id).select().single();
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
// DEVIS
// ══════════════════════════════════════════════════════════
const Devis = {

  async list(garage_id) {
    const { data, error } = await supabase.from('devis')
      .select('*, motos(marque, modele, plaque)')
      .eq('garage_id', garage_id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async getById(id, garage_id) {
    const { data, error } = await supabase.from('devis')
      .select('*, motos(marque, modele, plaque, clients(nom, email)), devis_lignes(*)')
      .eq('id', id).eq('garage_id', garage_id).single();
    if (error) throw new Error(error.message);
    return data;
  },

  async create(garage_id, payload) {
    const num = `2026-${String(Date.now()).slice(-4)}`;
    const dv  = await insert('devis', {
      garage_id, moto_id: payload.moto_id,
      numero: num, statut: 'brouillon',
      remise_type: payload.remise_type || 'aucun',
      remise_pct:  payload.remise_pct  || 0,
      remise_note: payload.remise_note || '',
      tva: 20
    });
    // Insérer les lignes
    if (payload.lignes?.length > 0) {
      await supabase.from('devis_lignes').insert(
        payload.lignes.map((l, i) => ({ ...l, devis_id: dv.id, position: i }))
      );
    }
    return Devis.getById(dv.id, garage_id);
  },

  async update(id, garage_id, payload) {
    // Mise à jour entête
    if (payload.entete) await update('devis', id, payload.entete);
    // Remplacement des lignes
    if (payload.lignes) {
      await supabase.from('devis_lignes').delete().eq('devis_id', id);
      if (payload.lignes.length > 0) {
        await supabase.from('devis_lignes').insert(
          payload.lignes.map((l, i) => ({ ...l, devis_id: id, position: i }))
        );
      }
    }
    return Devis.getById(id, garage_id);
  },

  async valider(id, garage_id) {
    const dv = await Devis.getById(id, garage_id);
    if (!dv) throw new Error('Devis non trouvé');
    if (dv.statut === 'valide') throw new Error('Déjà validé');
    // Calculer les totaux
    const totaux = Devis._calcTotaux(dv);
    // Valider
    await update('devis', id, { statut: 'valide', date_acceptation: new Date().toISOString(), ...totaux });
    // Créer l'intervention correspondante
    const result = await Interventions.create(garage_id, dv.moto_id, {
      type:        'bleu',
      titre:       `Facture ${dv.numero}`,
      description: (dv.devis_lignes || []).map(l => l.description).join(', '),
      km:          dv.motos?.km || 0,
      montant_ht:  totaux.base_ht,
      montant_ttc: totaux.total_ttc
    });
    return { devis: await Devis.getById(id, garage_id), totaux, ...result };
  },

  _calcTotaux(dv) {
    let moHT = 0, pieHT = 0, remL = 0;
    (dv.devis_lignes || []).forEach(l => {
      const brut = l.prix_unitaire * l.quantite;
      const rem  = brut * ((l.remise_pct || 0) / 100);
      remL += rem;
      if (l.type_ligne === 'mo') moHT += brut - rem;
      else pieHT += brut - rem;
    });
    const sous = moHT + pieHT;
    const remG = sous * ((dv.remise_pct || 0) / 100);
    const base = sous - remG;
    const tva  = base * ((dv.tva || 20) / 100);
    return {
      total_mo_ht: +moHT.toFixed(2), total_pieces_ht: +pieHT.toFixed(2),
      remise_lignes: +remL.toFixed(2), sous_total_ht: +sous.toFixed(2),
      remise_globale: +remG.toFixed(2), base_ht: +base.toFixed(2),
      tva_montant: +tva.toFixed(2), total_ttc: +(base+tva).toFixed(2)
    };
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
const _OR_TRANS = {
  brouillon:     ['valide_client', 'annule'],
  valide_client: ['brouillon', 'en_cours', 'annule'],
  en_cours:      ['attente', 'annule'],          // termine via /cloturer
  attente:       ['en_cours', 'annule'],
  termine:       ['en_cours', 'annule'],          // facture via /facturer ; en_cours = correction
  facture:       ['annule'],                      // terminal sauf annulation ADMIN/CONCESSION
  annule:        []                               // terminal absolu
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

  async create(garage_id, payload) {
    const { moto_id, devis_id, technicien_id, km_entree, notes_atelier, notes_client } = payload;
    const { data: moto, error: me } = await supabase.from('motos')
      .select('client_id, km').eq('id', moto_id).eq('garage_id', garage_id).single();
    if (me) throw new Error('Moto non trouvée');
    const { count } = await supabase.from('ordres_reparation')
      .select('id', { count: 'exact', head: true }).eq('garage_id', garage_id);
    const numero_or = `OR-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;
    const or = await insert('ordres_reparation', {
      garage_id,
      numero_or,
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

  async cloturer(id, garage_id, { km_sortie }) {
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

    const { data: moto } = await supabase.from('motos').select('km').eq('id', or.moto_id).single();
    if (moto && km_sortie > moto.km) {
      await supabase.from('motos').update({ km: km_sortie }).eq('id', or.moto_id);
    }

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
    return { ordre_reparation: orFinal, intervention, totaux, nouveau_score, nouvelle_couleur };
  },

  async recalculerTotaux(or_id) {
    const { data: taches } = await supabase.from('or_taches').select('montant_ht').eq('or_id', or_id);
    const { data: pieces } = await supabase.from('or_pieces').select('montant_ht, tva_pct').eq('or_id', or_id);
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

  async changerStatut(id, garage_id, ctx, { nouveau_statut, attente_motif, km_sortie, signature_base64 }) {
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

    const patch = { statut: nouveau_statut };
    if (attente_motif)    patch.attente_motif    = attente_motif;
    if (km_sortie)        patch.km_sortie        = parseInt(km_sortie);
    if (signature_base64) patch.signature_client = signature_base64;

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

  async create(garage_id, or_id, payload) {
    const { data: or, error: oe } = await supabase.from('ordres_reparation')
      .select('id').eq('id', or_id).eq('garage_id', garage_id).single();
    if (oe) throw new Error('Ordre non trouvé');
    const dh = parseFloat(payload.duree_h)     || 0;
    const th = parseFloat(payload.taux_horaire) || 0;
    const tache = await insert('or_taches', {
      garage_id, or_id,
      ordre:         parseInt(payload.ordre) || 0,
      libelle:       payload.libelle,
      description:   payload.description   || '',
      duree_h:       dh,
      taux_horaire:  th,
      montant_ht:    +(dh * th).toFixed(2),
      technicien_id: payload.technicien_id || null,
      statut:        'a_faire'
    });
    const orMaj = await OrdresReparation.recalculerTotaux(or_id);
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
    if (patch.statut === 'fait' && existing.statut !== 'fait') {
      patch.fait_le = new Date().toISOString();
    }
    const { data: tache, error } = await supabase.from('or_taches')
      .update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    const orMaj = await OrdresReparation.recalculerTotaux(existing.or_id);
    return { tache, ordre_reparation: orMaj };
  },

  async remove(id, garage_id) {
    const { data: tache, error: fe } = await supabase.from('or_taches')
      .select('or_id').eq('id', id).eq('garage_id', garage_id).single();
    if (fe) throw new Error('Tâche non trouvée');
    const { error } = await supabase.from('or_taches').delete().eq('id', id);
    if (error) throw new Error(error.message);
    const orMaj = await OrdresReparation.recalculerTotaux(tache.or_id);
    return { deleted_id: id, ordre_reparation: orMaj };
  }
};

// ══════════════════════════════════════════════════════════
// OR — PIÈCES
// ══════════════════════════════════════════════════════════
const OrPieces = {

  async create(garage_id, or_id, payload) {
    const { data: or, error: oe } = await supabase.from('ordres_reparation')
      .select('id').eq('id', or_id).eq('garage_id', garage_id).single();
    if (oe) throw new Error('Ordre non trouvé');
    const q  = parseFloat(payload.qte)   || 1;
    const pu = parseFloat(payload.pu_ht) || 0;
    const piece = await insert('or_pieces', {
      garage_id, or_id,
      piece_id:  payload.piece_id  || null,
      reference: payload.reference || '',
      libelle:   payload.libelle,
      qte:       q,
      pu_ht:     pu,
      tva_pct:   parseFloat(payload.tva_pct) || 20,
      montant_ht: +(q * pu).toFixed(2)
    });
    const orMaj = await OrdresReparation.recalculerTotaux(or_id);
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

  async delete(id, garage_id) {
    const { data: piece, error: fe } = await supabase.from('or_pieces')
      .select('or_id').eq('id', id).eq('garage_id', garage_id).single();
    if (fe) throw new Error('Pièce non trouvée');
    const { error } = await supabase.from('or_pieces').delete().eq('id', id);
    if (error) throw new Error(error.message);
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
// EXPORT
// ══════════════════════════════════════════════════════════
module.exports = {
  supabase,
  supabasePublic,
  Auth,
  Garages,
  Motos,
  Interventions,
  Entretien,
  Devis,
  Transferts,
  Storage,
  Realtime,
  Fraude,
  OrdresReparation,
  OrTaches,
  OrPieces,
  CataloguePieces,
  GarageUsers,
  resolveProprietaire,
  checkLimiteMotosClient,
  cessionMoto
};
