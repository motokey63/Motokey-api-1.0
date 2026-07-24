'use strict';
// Test UNITAIRE (mocks, AUCUNE écriture en base réelle) — anti-spam / réarmement / fail-open
// de la notification client sur ligne OR en attente (Task 3, amendement review 24/07/2026).
// Usage : node tests/test-notif-attente-or-unit.js
//
// Technique de mock : `supabase.js` déclare `const supabase = createClient(...)` en portée
// module et toutes les méthodes de OrdresReparation ferment sur CETTE variable — reassigner
// `module.exports.supabase` (sb.supabase = ...) ne changerait donc rien en interne. On patche
// à la place la méthode `.from` DIRECTEMENT sur l'objet client partagé (même référence exportée
// et fermée en interne), puis on la restaure après chaque scénario.

const sb = require('../supabase');
if (!sb) {
  console.error('❌ supabase.js a retourné null — vérifie SUPABASE_URL et SUPABASE_SERVICE_KEY dans .env');
  process.exit(1);
}
const { OrdresReparation } = sb;
const emailService = require('../services/emailService');

const realFrom = sb.supabase.from;
const realSend = emailService.send;

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

// queues : { tableName: [response1, response2, ...] } — un élément consommé par appel
// successif à .from(tableName). trace : liste plate de tous les appels (table + méthode).
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
    ['select', 'eq', 'order', 'limit', 'update', 'insert', 'delete', 'maybeSingle', 'single'].forEach(m => {
      b[m] = (...args) => { trace.push({ table, method: m, args }); return b; };
    });
    b.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject);
    return b;
  };
  return trace;
}
function restoreFrom() { sb.supabase.from = realFrom; }
function restoreSend() { emailService.send = realSend; }

function updateArgsFor(trace, table) {
  const call = trace.find(c => c.table === table && c.method === 'update');
  return call ? call.args[0] : null;
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test unitaire notif client anti-spam OR en attente     ║');
  console.log('║  (mocks — aucune écriture en base réelle)                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ── Scénario A : anti-spam — déjà notifié → early return, AUCUN autre appel ──
  console.log('\n── Scénario A : anti-spam (déjà notifié → early return) ────────────');
  try {
    const trace = mockFrom({
      ordres_reparation: [
        { data: { numero: 'INT-2026-0001', moto_id: 'moto-1', derniere_notif_attente_envoyee_at: '2026-07-24T10:00:00.000Z' }, error: null },
      ],
    });
    await OrdresReparation._notifierClientAttenteOR('or-1');
    const fromCalls = trace.filter(t => t.method === 'from');
    check('un seul appel .from() (le read) — early return avant toute autre requête',
      fromCalls.length === 1, `réel: ${fromCalls.length} — ${JSON.stringify(fromCalls.map(t => t.table))}`);
  } catch (e) {
    check('scénario A sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── Scénario B : moto sans client (propriété polymorphe L8) ─────────────────
  console.log('\n── Scénario B : moto sans client ────────────────────────────────────');
  try {
    const trace = mockFrom({
      ordres_reparation: [
        { data: { numero: 'INT-2026-0002', moto_id: 'moto-2', derniere_notif_attente_envoyee_at: null }, error: null },
        { data: {}, error: null }, // update de _marquerNonNotifiable
      ],
      motos: [
        { data: { marque: 'Yamaha', modele: 'MT-07', plaque: 'AA-000-AA', client_id: null }, error: null },
      ],
    });
    await OrdresReparation._notifierClientAttenteOR('or-2');
    const payload = updateArgsFor(trace, 'ordres_reparation');
    check("notif_attente_echec_motif = 'moto_sans_client'",
      !!payload && payload.notif_attente_echec_motif === 'moto_sans_client', `réel: ${JSON.stringify(payload)}`);
    check("pas d'appel à 'clients' (arrêté avant)", !trace.some(t => t.table === 'clients'));
  } catch (e) {
    check('scénario B sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── Scénario C : client sans email ───────────────────────────────────────────
  console.log('\n── Scénario C : client sans email ───────────────────────────────────');
  try {
    const trace = mockFrom({
      ordres_reparation: [
        { data: { numero: 'INT-2026-0003', moto_id: 'moto-3', derniere_notif_attente_envoyee_at: null }, error: null },
        { data: {}, error: null }, // update de _marquerNonNotifiable
      ],
      motos: [
        { data: { marque: 'Honda', modele: 'CB500F', plaque: 'BB-111-BB', client_id: 'client-3' }, error: null },
      ],
      clients: [
        { data: { nom: 'Marc Petit', email: null }, error: null },
      ],
    });
    await OrdresReparation._notifierClientAttenteOR('or-3');
    const payload = updateArgsFor(trace, 'ordres_reparation');
    check("notif_attente_echec_motif = 'client_sans_email'",
      !!payload && payload.notif_attente_echec_motif === 'client_sans_email', `réel: ${JSON.stringify(payload)}`);
  } catch (e) {
    check('scénario C sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── Scénario D : succès — email liste TOUTES les lignes en attente ──────────
  console.log('\n── Scénario D : succès (email envoyé, toutes les lignes listées) ────');
  try {
    const trace = mockFrom({
      ordres_reparation: [
        { data: { numero: 'INT-2026-0004', moto_id: 'moto-4', derniere_notif_attente_envoyee_at: null }, error: null },
        { data: {}, error: null }, // update final succès
      ],
      motos: [
        { data: { marque: 'Kawasaki', modele: 'Z900', plaque: 'CC-222-CC', client_id: 'client-4' }, error: null },
      ],
      clients: [
        { data: { nom: 'Julie Renard', email: 'julie@example.com' }, error: null },
      ],
      or_taches: [{ data: [{ libelle: 'Disque avant' }], error: null }],
      or_pieces: [{ data: [{ libelle: 'Plaquettes avant' }], error: null }],
    });

    let capturedEmailData = null;
    emailService.send = async (template, to, data) => { capturedEmailData = { template, to, data }; return realSend(template, to, data); };

    await OrdresReparation._notifierClientAttenteOR('or-4');

    check("email envoyé au template 'or-ligne-attente'", capturedEmailData && capturedEmailData.template === 'or-ligne-attente');
    check('email envoyé à julie@example.com', capturedEmailData && capturedEmailData.to === 'julie@example.com');
    check("email liste 'Disque avant'", capturedEmailData && capturedEmailData.data.lignes.includes('Disque avant'));
    check("email liste 'Plaquettes avant'", capturedEmailData && capturedEmailData.data.lignes.includes('Plaquettes avant'));
    check('email liste exactement 2 lignes (pas de doublon/pollution)', capturedEmailData && capturedEmailData.data.lignes.length === 2);

    const payload = updateArgsFor(trace, 'ordres_reparation');
    check('derniere_notif_attente_envoyee_at posé (succès)', !!payload && !!payload.derniere_notif_attente_envoyee_at, `réel: ${JSON.stringify(payload)}`);
    check('notif_attente_echec_motif remis à NULL (succès)', payload && payload.notif_attente_echec_motif === null);
  } catch (e) {
    check('scénario D sans exception', false, e.message);
  } finally {
    restoreFrom();
    restoreSend();
  }

  // ── Scénario E : fail-open — échec d'envoi ne bloque JAMAIS, tracé en base ──
  console.log('\n── Scénario E : fail-open (échec envoi Resend simulé) ───────────────');
  try {
    const trace = mockFrom({
      ordres_reparation: [
        { data: { numero: 'INT-2026-0005', moto_id: 'moto-5', derniere_notif_attente_envoyee_at: null }, error: null },
        { data: {}, error: null }, // update de _marquerNonNotifiable('echec_envoi')
      ],
      motos: [
        { data: { marque: 'Ducati', modele: 'Monster', plaque: 'DD-333-DD', client_id: 'client-5' }, error: null },
      ],
      clients: [
        { data: { nom: 'Karim Haddad', email: 'karim@example.com' }, error: null },
      ],
      or_taches: [{ data: [{ libelle: 'Chaîne' }], error: null }],
      or_pieces: [{ data: [], error: null }],
    });

    emailService.send = async () => ({ error: 'Resend indisponible (simulation test)' });

    let threw = false;
    try {
      await OrdresReparation._notifierClientAttenteOR('or-5');
    } catch (e) { threw = true; }
    check('AUCUN throw remonté malgré l\'échec d\'envoi (fail-open, décision 10)', !threw);

    const payload = updateArgsFor(trace, 'ordres_reparation');
    check("notif_attente_echec_motif = 'echec_envoi'",
      !!payload && payload.notif_attente_echec_motif === 'echec_envoi', `réel: ${JSON.stringify(payload)}`);
    check("derniere_notif_attente_envoyee_at ABSENT du payload d'échec (pas marqué comme envoyé)",
      !payload || payload.derniere_notif_attente_envoyee_at === undefined);
  } catch (e) {
    check('scénario E sans exception', false, e.message);
  } finally {
    restoreFrom();
    restoreSend();
  }

  // ── Scénario F : réarmement (_reinitialiserNotifAttente) ────────────────────
  console.log('\n── Scénario F : réarmement après acceptation de ligne ────────────────');
  try {
    const trace = mockFrom({ ordres_reparation: [{ data: {}, error: null }] });
    await OrdresReparation._reinitialiserNotifAttente('or-6');
    const payload = updateArgsFor(trace, 'ordres_reparation');
    check('derniere_notif_attente_envoyee_at remis à NULL', payload && payload.derniere_notif_attente_envoyee_at === null, `réel: ${JSON.stringify(payload)}`);
    check('notif_attente_echec_motif remis à NULL', payload && payload.notif_attente_echec_motif === null);
  } catch (e) {
    check('scénario F (succès) sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── Scénario F bis : _reinitialiserNotifAttente — fail-open, erreur DB loggée pas propagée ──
  // Fix review 24/07/2026 : appelée APRÈS que l'acceptation de la ligne est déjà persistée —
  // un throw ici ferait échouer toute la réponse HTTP alors que l'accord client (preuve
  // juridique) a déjà été enregistré avec succès. Même doctrine que _marquerNonNotifiable.
  console.log('\n── Scénario F bis : réarmement — erreur DB loggée, pas propagée ────');
  try {
    mockFrom({ ordres_reparation: [{ data: null, error: { message: 'boom DB' } }] });
    let threw = false;
    try {
      await OrdresReparation._reinitialiserNotifAttente('or-7');
    } catch (e) { threw = true; }
    check('_reinitialiserNotifAttente NE relance PAS en cas d\'erreur DB (fail-open)', !threw);
  } catch (e) {
    check('scénario F bis sans exception inattendue', false, e.message);
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
  restoreSend();
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
