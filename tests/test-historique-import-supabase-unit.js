'use strict';
// Test UNITAIRE (mocks, AUCUNE écriture en base réelle) — namespace
// HistoriqueImport (L15 socle). Même technique de mock que
// tests/test-notif-attente-or-unit.js : on patche sb.supabase.from
// directement (les méthodes de HistoriqueImport ferment sur cette
// référence), jamais module.exports.supabase (ça ne changerait rien).
// Usage : node tests/test-historique-import-supabase-unit.js

const sb = require('../supabase');
if (!sb) {
  console.error('❌ supabase.js a retourné null — vérifie SUPABASE_URL et SUPABASE_SERVICE_KEY dans .env');
  process.exit(1);
}
const { HistoriqueImport } = sb;

const realFrom = sb.supabase.from;

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

function mockFrom(queues) {
  const counters = {};
  const trace = [];
  sb.supabase.from = (table) => {
    trace.push({ table, method: 'from', args: [] });
    const idx = counters[table] || 0;
    counters[table] = idx + 1;
    const q = queues[table] || [];
    const response = q[idx] !== undefined
      ? q[idx]
      : { data: null, error: { message: `mock non configuré pour ${table} appel #${idx}` } };
    const b = {};
    ['select', 'eq', 'order', 'limit', 'update', 'insert', 'delete', 'maybeSingle', 'single', 'not', 'neq'].forEach(m => {
      b[m] = (...args) => { trace.push({ table, method: m, args }); return b; };
    });
    b.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject);
    return b;
  };
  return trace;
}
function restoreFrom() { sb.supabase.from = realFrom; }

function insertArgsFor(trace, table) {
  const call = trace.find(c => c.table === table && c.method === 'insert');
  return call ? call.args[0] : null;
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test unitaire HistoriqueImport (L15 socle)              ║');
  console.log('║  (mocks — aucune écriture en base réelle)                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ── creerStaging : insert direct, payload propagé tel quel ──────────────
  console.log('\n── creerStaging ──────────────────────────────────────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-1', moto_id: 'moto-1', acteur_type: 'client', ocr_raw: { plaque: 'AB-123-CD' } }, error: null },
      ],
    });
    const row = await HistoriqueImport.creerStaging({
      moto_id: 'moto-1', garage_id: 'garage-1', acteur_type: 'client', acteur_id: 'client-1',
      photo_url: 'https://cloudinary/x.jpg', ocr_raw: { plaque: 'AB-123-CD' }
    });
    check('retourne la ligne insérée', row && row.id === 'fs-1', JSON.stringify(row));
    const payload = insertArgsFor(trace, 'factures_scannees');
    check('insert reçoit moto_id', payload && payload.moto_id === 'moto-1', JSON.stringify(payload));
    check('insert reçoit acteur_type=client', payload && payload.acteur_type === 'client', JSON.stringify(payload));
    check('insert reçoit ocr_raw tel quel', payload && payload.ocr_raw && payload.ocr_raw.plaque === 'AB-123-CD', JSON.stringify(payload));
  } catch (e) {
    check('creerStaging sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── list : filtre par moto_id, tri created_at desc ───────────────────────
  console.log('\n── list ──────────────────────────────────────────────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: [{ id: 'fs-2', moto_id: 'moto-1' }, { id: 'fs-1', moto_id: 'moto-1' }], error: null },
      ],
    });
    const rows = await HistoriqueImport.list('moto-1');
    check('retourne les lignes', Array.isArray(rows) && rows.length === 2, JSON.stringify(rows));
    const eqCall = trace.find(c => c.table === 'factures_scannees' && c.method === 'eq' && c.args[0] === 'moto_id');
    check('appelle .eq(moto_id, moto-1)', eqCall && eqCall.args[1] === 'moto-1', JSON.stringify(eqCall?.args));
    const orderCall = trace.find(c => c.table === 'factures_scannees' && c.method === 'order' && c.args[0] === 'created_at');
    check('appelle .order(created_at, { ascending: false })', orderCall && orderCall.args[1] && orderCall.args[1].ascending === false, JSON.stringify(orderCall?.args));
  } catch (e) {
    check('list sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── list : tableau vide sur data null (jamais une exception) ────────────
  console.log('\n── list (aucun résultat) ────────────────────────────────────────');
  try {
    mockFrom({ factures_scannees: [{ data: null, error: null }] });
    const rows = await HistoriqueImport.list('moto-sans-historique');
    check('data:null → tableau vide, pas une exception', Array.isArray(rows) && rows.length === 0, JSON.stringify(rows));
  } catch (e) {
    check('list (vide) sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── valider : cas nominal, cohérent, sans divergence ─────────────────────
  console.log('\n── valider (nominal, cohérent) ──────────────────────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-10', moto_id: 'moto-1', acteur_type: 'client', validated_at: null }, error: null }, // select staging
        { data: [], error: null }, // select divergentes (aucune)
        { data: { id: 'fs-10', moto_id: 'moto-1', validated_at: '2026-07-24T00:00:00.000Z', intervention_id: 'int-10' }, error: null }, // update final
      ],
      interventions: [
        { data: [{ date_intervention: '2015-01-10', km: 6000 }], error: null }, // select existantes pour cohérence
        { data: { id: 'int-10' }, error: null }, // insert() de Interventions.create
        { data: { id: 'int-10' }, error: null }, // update niveau_preuve/facture_id/photo_url
      ],
      motos: [
        { data: { score: 42, couleur_dossier: 'jaune' }, error: null }, // select score/couleur dans Interventions.create — table SÉPARÉE, compteur indépendant de 'interventions'
      ],
    });
    const result = await HistoriqueImport.valider('fs-10', 'garage-1', { email: 'client@example.com' }, {
      plaque_declaree: 'AB-123-CD', date_document: '2018-03-01', km_declare: 6800,
      siret_declare: null, nom_garage_declare: 'Garage du Centre', description_travaux: 'Vidange'
    });
    check('retourne facture_scannee', !!result.facture_scannee, JSON.stringify(result));
    check('retourne intervention', !!result.intervention, JSON.stringify(result));
    const interInsert = trace.find(c => c.table === 'interventions' && c.method === 'insert');
    check('intervention créée avec type=jaune', interInsert && interInsert.args[0].type === 'jaune', JSON.stringify(interInsert));
    check('intervention créée avec km déclaré', interInsert && interInsert.args[0].km === 6800, JSON.stringify(interInsert));
  } catch (e) {
    check('valider (nominal) sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── valider (déjà validé — rejet double promotion) ────────────────────
  console.log('\n── valider (déjà validé — rejet double promotion) ────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-99', moto_id: 'moto-1', acteur_type: 'client', validated_at: '2026-07-20T00:00:00.000Z' }, error: null }, // select staging — déjà validé
      ],
    });
    let threw = null;
    try {
      await HistoriqueImport.valider('fs-99', 'garage-1', { email: 'test@example.com' }, {
        plaque_declaree: 'AB-123-CD', date_document: '2018-03-01', km_declare: 5000,
        siret_declare: null, nom_garage_declare: null, description_travaux: null
      });
    } catch (e) { threw = e; }
    check('lève une erreur (déjà validé)', !!threw, 'aucune erreur levée');
    check('message mentionne déjà validé', threw && /valid/i.test(threw.message), threw && threw.message);
    const fromCalls = trace.filter(t => t.method === 'from');
    check('un seul appel .from() (early return avant toute autre requête)', fromCalls.length === 1, `${fromCalls.length} appels trouvés`);
  } catch (e) {
    check('valider (double promotion) sans exception inattendue', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── valider : km incohérent → rejeté, AUCUNE intervention créée ─────────
  console.log('\n── valider (km incohérent) ──────────────────────────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-11', moto_id: 'moto-1', acteur_type: 'client', validated_at: null }, error: null },
        { data: { id: 'fs-11', km_coherence_statut: 'rejete' }, error: null }, // update de traçage du rejet
      ],
      interventions: [
        { data: [{ date_intervention: '2020-06-15', km: 7500 }], error: null },
      ],
    });
    let threw = null;
    try {
      await HistoriqueImport.valider('fs-11', 'garage-1', { email: 'client@example.com' }, {
        plaque_declaree: 'AB-123-CD', date_document: '2018-03-01', km_declare: 20000,
        siret_declare: null, nom_garage_declare: null, description_travaux: null
      });
    } catch (e) { threw = e; }
    check('lève une erreur', !!threw, 'aucune erreur levée');
    check("code KM_INCOHERENT", threw && threw.code === 'KM_INCOHERENT', threw && threw.message);
    check("aucun insert 'interventions' (pas de promotion)", !trace.some(t => t.table === 'interventions' && t.method === 'insert'));
    const stagingUpdate = trace.find(c => c.table === 'factures_scannees' && c.method === 'update');
    check("km_coherence_statut='rejete' tracé sur la ligne staging",
      stagingUpdate && stagingUpdate.args[0].km_coherence_statut === 'rejete', JSON.stringify(stagingUpdate && stagingUpdate.args[0]));
  } catch (e) {
    check('valider (rejet km) sans exception inattendue', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── valider : divergence garage corrige un import client existant ───────
  console.log('\n── valider (divergence, garage corrige client) ──────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-13', moto_id: 'moto-1', acteur_type: 'garage', validated_at: null }, error: null }, // select staging
        { data: [{ id: 'fs-12', acteur_type: 'client' }], error: null }, // select divergentes → trouve fs-12
        { data: { id: 'fs-13', divergence_de: 'fs-12', intervention_id: 'int-13' }, error: null }, // update final
      ],
      interventions: [
        { data: [], error: null },
        { data: { id: 'int-13' }, error: null },
        { data: { id: 'int-13' }, error: null },
      ],
      motos: [
        { data: { score: 50, couleur_dossier: 'bleu' }, error: null }, // table SÉPARÉE, compteur indépendant de 'interventions'
      ],
    });
    const result = await HistoriqueImport.valider('fs-13', 'garage-1', { email: 'mecano@example.com' }, {
      plaque_declaree: 'AB-123-CD', date_document: '2018-03-01', km_declare: 6800,
      siret_declare: '12345678900012', nom_garage_declare: 'Garage du Centre', description_travaux: 'Vidange confirmée'
    });
    const stagingUpdate = trace.find(c => c.table === 'factures_scannees' && c.method === 'update');
    check('divergence_de pointe vers la ligne client existante (fs-12)',
      stagingUpdate && stagingUpdate.args[0].divergence_de === 'fs-12', JSON.stringify(stagingUpdate && stagingUpdate.args[0]));
    check("l'ancienne ligne client (fs-12) n'est PAS supprimée ni écrasée — pas de delete émis",
      !trace.some(t => t.table === 'factures_scannees' && t.method === 'delete'));
  } catch (e) {
    check('valider (divergence) sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`📊 ${OK}/${OK + KO} checks passés`);
  if (KO > 0) process.exitCode = 1;
  console.log('═'.repeat(60) + '\n');
}

run().catch(err => {
  restoreFrom();
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
