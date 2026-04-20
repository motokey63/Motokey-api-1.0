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
    const garage = await query('garages', { auth_user_id: data.user.id }, { single: true });
    return { session: data.session, garage };
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
    const allowed = ['nom','tel','adresse','siret','taux_std','taux_spec','tva','sms_active'];
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
    // Chercher ou créer le client
    let client_id = null;
    if (payload.client_email || payload.client_nom) {
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
    return insert('motos', {
      garage_id, client_id,
      marque:  payload.marque,
      modele:  payload.modele,
      annee:   payload.annee,
      plaque:  payload.plaque,
      vin:     payload.vin,
      km:      payload.km || 0
    });
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
    await update('devis', id, { statut: 'valide', valide_at: new Date().toISOString(), ...totaux });
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
  Fraude
};
