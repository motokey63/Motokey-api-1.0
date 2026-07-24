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
