/**
 * scripts/seed-test-devis-16-uat.js
 *
 * Seeds one brouillon devis (linked to a client-owned moto) for manual UAT
 * of Phase 16 (POST /devis/:id/envoyer -> push notification flow).
 * Idempotent on moto VIN and devis numero — safe to re-run.
 *
 * Usage:
 *   node scripts/seed-test-devis-16-uat.js
 *
 * Prerequis:
 *   - SUPABASE_URL et SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) dans .env (racine repo)
 *   - garage@motokey.fr (garage) et test@motokey.fr (client) doivent déjà exister
 *
 * NOTE (Phase 16-01, reconciliation schema réel, 04/07/2026) : la table `devis` en prod live
 * n'est PAS celle documentée à l'origine dans le plan — confirmé par introspection OpenAPI
 * PostgREST. `devis_lignes` (table séparée) N'EXISTE PLUS ; les lignes vivent dans la colonne
 * jsonb `devis.lignes`. `entite_facturation_id` et `client_nom` sont NOT NULL. Ce script cible
 * le schéma réel (cf. supabase.js `Devis` pour le détail complet).
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERREUR : SUPABASE_URL et SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) requis');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const GARAGE_EMAIL = 'garage@motokey.fr';
const CLIENT_EMAIL = 'test@motokey.fr';

const MOTO = {
  marque: 'Yamaha',
  modele: 'MT-07',
  annee: 2023,
  plaque: 'PUSH-016',
  vin: 'JYARN23E0PA000016',
  km: 3200
};

const DEVIS_NUMERO = '2026-PUSH16';
const DEVIS_LIGNE = {
  position: 0,
  type_ligne: 'piece', // enum type_ligne_devis (schema.sql) — SINGULIER, 'pieces' est invalide
  description: 'Plaquettes de frein',
  quantite: 2,
  prix_unitaire: 45
};

async function main() {
  console.log('\n=== Seed test devis (Phase 16 UAT — envoyer/push flow) ===\n');

  const { data: garages, error: gErr } = await supabase
    .from('garages')
    .select('id, nom, email')
    .eq('email', GARAGE_EMAIL)
    .limit(1);
  if (gErr) throw new Error('garages lookup failed: ' + gErr.message);
  if (!garages || garages.length === 0) {
    console.error(`ERREUR : aucun garage trouvé avec email=${GARAGE_EMAIL}`);
    process.exit(1);
  }
  const garage = garages[0];
  console.log(`  Garage cible: ${garage.nom} (${garage.id})`);

  const { data: clients, error: cErr } = await supabase
    .from('clients')
    .select('id, nom, email')
    .eq('email', CLIENT_EMAIL)
    .limit(1);
  if (cErr) throw new Error('clients lookup failed: ' + cErr.message);
  if (!clients || clients.length === 0) {
    console.error(`ERREUR : aucun client trouvé avec email=${CLIENT_EMAIL}`);
    process.exit(1);
  }
  const client = clients[0];
  console.log(`  Client cible: ${client.nom} (${client.id})`);

  // ── Moto (idempotent sur VIN) ──
  const { data: existingMotos, error: eMErr } = await supabase
    .from('motos')
    .select('id, plaque, vin, client_id')
    .eq('vin', MOTO.vin)
    .limit(1);
  if (eMErr) throw new Error('motos lookup failed: ' + eMErr.message);

  let moto;
  if (existingMotos && existingMotos.length > 0) {
    moto = existingMotos[0];
    console.log(`  [SKIP] Moto VIN=${MOTO.vin} existe déjà (id=${moto.id})`);
  } else {
    const { data: createdMoto, error: iMErr } = await supabase
      .from('motos')
      .insert({
        garage_id: garage.id,
        client_id: client.id,
        proprietaire_type: 'client',
        proprietaire_garage_id: null,
        marque: MOTO.marque,
        modele: MOTO.modele,
        annee: MOTO.annee,
        plaque: MOTO.plaque,
        vin: MOTO.vin,
        km: MOTO.km
      })
      .select()
      .single();
    if (iMErr) throw new Error('moto insert failed: ' + iMErr.message);
    moto = createdMoto;
    console.log(`  [CREATE] Moto ${MOTO.marque} ${MOTO.modele} (id=${moto.id}) — client ${client.nom}, VIN=${MOTO.vin}, plaque=${MOTO.plaque}`);
  }

  // ── Devis (idempotent sur numero) ──
  const { data: existingDevis, error: eDErr } = await supabase
    .from('devis')
    .select('id, numero, statut')
    .eq('numero', DEVIS_NUMERO)
    .limit(1);
  if (eDErr) throw new Error('devis lookup failed: ' + eDErr.message);

  let devis;
  if (existingDevis && existingDevis.length > 0) {
    devis = existingDevis[0];
    console.log(`  [SKIP] Devis numero=${DEVIS_NUMERO} existe déjà (id=${devis.id}, statut=${devis.statut})`);
  } else {
    // entite_facturation_id est NOT NULL en base (schéma réel live, confirmé par introspection
    // OpenAPI) — requis pour tout insert dans `devis`, cf. supabase.js Devis._getEntiteActive().
    const { data: entites, error: eEErr } = await supabase
      .from('entites_facturation')
      .select('id')
      .eq('garage_id', garage.id)
      .eq('actif', true)
      .order('created_at', { ascending: true })
      .limit(1);
    if (eEErr) throw new Error('entites_facturation lookup failed: ' + eEErr.message);
    if (!entites || entites.length === 0) {
      console.error(`ERREUR : aucune entité de facturation active trouvée pour garage_id=${garage.id}`);
      process.exit(1);
    }
    const entite = entites[0];

    // Totaux calculés à l'écriture (schéma réel : total_ht/total_tva/total_ttc sont des
    // colonnes NOT NULL persistées — pas de calcul "on read" côté devis_lignes qui n'existe plus).
    const brut = DEVIS_LIGNE.prix_unitaire * DEVIS_LIGNE.quantite; // 2 * 45 = 90
    const totalHt = brut;
    const totalTva = +(totalHt * 0.20).toFixed(2);
    const totalTtc = +(totalHt + totalTva).toFixed(2);

    const { data: createdDevis, error: iDErr } = await supabase
      .from('devis')
      .insert({
        garage_id: garage.id,
        moto_id: moto.id,
        entite_facturation_id: entite.id,
        client_id: client.id,
        client_nom: client.nom, // NOT NULL en base
        moto_label: [MOTO.marque, MOTO.modele, MOTO.plaque].filter(Boolean).join(' '),
        moto_vin: MOTO.vin,
        moto_km: MOTO.km,
        numero: DEVIS_NUMERO,
        statut: 'brouillon',
        lignes: [DEVIS_LIGNE], // colonne jsonb — remplace l'ancienne table devis_lignes
        remise_type: 'aucun',
        remise_pct: 0,
        remise_note: '',
        tva: 20,
        total_ht: totalHt,
        total_tva: totalTva,
        total_ttc: totalTtc
      })
      .select()
      .single();
    if (iDErr) throw new Error('devis insert failed: ' + iDErr.message);
    devis = createdDevis;

    console.log(`  [CREATE] Devis ${DEVIS_NUMERO} (id=${devis.id}) — brouillon, 1 ligne (piece, qte=2, PU=45), total_ttc=${totalTtc}`);
  }

  console.log('\nDevis id à utiliser pour le curl smoke test : ' + devis.id + '\n');
  console.log('Termine.\n');
}

main().catch(err => {
  console.error('Erreur fatale :', err.message);
  process.exit(1);
});
