'use strict';
// Test dédié — Tâche 1 (L11 notif calendaire) : correctif D-05 généralisé.
// Preuve que Consommables.upsert() réarme dernier_rappel_envoye_at/dernier_rappel_km
// quand km_montage/date_montage changent via PATCH — pour un type SANS méthode photo
// (liquide_frein), qui ne peut jamais bénéficier du reset existant
// (PhotosConsommables.insert(), Phase 26) puisqu'aucune photo n'est jamais uploadée
// pour ce type (voir MotoKey_Client.html TYPES_METHODE_PHOTO).
//
// Usage : node tests/test-consommables-reset-antispam.js
// Prérequis : `node motokey-api.js` déjà lancé dans un autre terminal (serveur local :3000),
// CRON_SECRET défini dans l'environnement du test (sinon SKIP propre — discipline Phase 26).

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const CREDS = {
  client: { email: 'sophie@email.com', password: 'client123' },
  garage: { email: 'garage@motokey.fr', password: 'motokey2026' }
};
const CRON_SECRET = process.env.CRON_SECRET || null;

// Types SBLayer.TYPES_CONSOMMABLES autres que liquide_frein — neutralisés en début de
// test pour que le champ moto-level "notified" ne reflète QUE l'état de liquide_frein.
const AUTRES_TYPES = ['pneu_av', 'pneu_ar', 'chaine', 'plaquettes_av', 'plaquettes_ar', 'disque_av', 'disque_ar', 'huile_moteur'];

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}
function skip(label, reason) {
  console.log(`  ⏭️  skip: ${label} — ${reason}`);
}

function request(method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const { token, json, headers: extraHeaders } = options;
    const url = new URL(BASE_URL + urlPath);
    const headers = Object.assign({}, extraHeaders || {});
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let bodyBuffer = null;
    if (json !== undefined) {
      bodyBuffer = Buffer.from(JSON.stringify(json));
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = bodyBuffer.length;
    }
    const reqOptions = { hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search, method, headers };
    const req = http.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body;
        try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = raw; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

async function login(email, password, role = 'garage') {
  const { status, body } = await request('POST', '/auth/login', { json: { email, password, role } });
  if (status !== 200 || !body || !body.data || !body.data.token) {
    throw new Error(`login échoué (${email}) — status ${status} — ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function loginClient(email, password) {
  const { status, body } = await request('POST', '/auth/client/login', { json: { email, password } });
  const token = body && body.data && body.data.session && body.data.session.access_token;
  if (status !== 200 || !token) {
    throw new Error(`login client échoué (${email}) — status ${status} — ${JSON.stringify(body)}`);
  }
  let moto_id = null;
  try {
    const { status: ms, body: mb } = await request('GET', '/motos', { token });
    if (ms === 200 && mb && mb.data && mb.data.motos && mb.data.motos.length) moto_id = mb.data.motos[0].id;
  } catch (e) { /* non-fatal — assertions dépendantes de moto_id feront SKIP */ }
  return { token, moto_id };
}

function cron(secretHeader) {
  return request('POST', '/cron/rappels-photo-consommables', {
    headers: secretHeader != null ? { 'x-cron-secret': secretHeader } : {}
  });
}

function patchConso(motoId, type, garageToken, dateMontage) {
  return request('PATCH', `/motos/${motoId}/consommables/${type}`, {
    token: garageToken,
    json: { date_montage: dateMontage }
  });
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test réarmement anti-spam sans photo (L11 Tâche 1)   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  let serverUp = false;
  try {
    const { status } = await request('GET', '/');
    serverUp = status === 200;
    console.log(serverUp ? `  ✅ Serveur joignable sur ${BASE_URL}` : `  ⚠️  Statut inattendu: ${status}`);
  } catch (e) {
    console.warn(`  ⚠️  Serveur non joignable sur :3000 (${e.message}) — test entier SKIP`);
  }

  if (!serverUp) {
    skip('section entière', 'serveur local non joignable sur :3000');
    console.log(`\nRESULTAT: ${OK} OK / ${KO} KO`);
    process.exit(KO === 0 ? 0 : 1);
  }

  if (!CRON_SECRET) {
    skip('section entière', "CRON_SECRET non défini dans l'environnement du test");
    console.log(`\nRESULTAT: ${OK} OK / ${KO} KO`);
    process.exit(KO === 0 ? 0 : 1);
  }

  let garageAuth = null, clientAuth = null;
  try { garageAuth = await login(CREDS.garage.email, CREDS.garage.password, 'garage'); }
  catch (e) { console.warn(`  ⚠️  Login garage échoué : ${e.message}`); }
  try { clientAuth = await loginClient(CREDS.client.email, CREDS.client.password); }
  catch (e) { console.warn(`  ⚠️  Login client échoué : ${e.message}`); }

  if (!garageAuth || !clientAuth || !clientAuth.moto_id) {
    skip('section entière', 'login garage/client ou moto client indisponible');
    console.log(`\nRESULTAT: ${OK} OK / ${KO} KO`);
    process.exit(KO === 0 ? 0 : 1);
  }

  const motoId = clientAuth.moto_id;
  const RECENT = '2026-07-20';   // "aujourd'hui" — jamais en retard, quel que soit le type
  const VIEUX  = '2025-06-20';   // 13 mois avant RECENT — dépasse le seuil liquide_frein (12 mois)

  // ── Étape 0 : neutraliser tous les AUTRES types (date récente) pour que le champ
  // moto-level "notified" du cron ne reflète que l'état de liquide_frein pendant ce test.
  console.log('\n── Setup : neutralisation des autres consommables ──────────────');
  for (const type of AUTRES_TYPES) {
    const { status } = await patchConso(motoId, type, garageAuth.token, RECENT);
    check(`  neutralisation ${type} (date récente)`, status === 200, `status=${status}`);
  }

  // ── Étape 1 : baseline propre — liquide_frein récent, jamais en retard ──────────
  console.log('\n── Étape 1 : baseline propre (liquide_frein récent) ─────────────');
  const { status: s1 } = await patchConso(motoId, 'liquide_frein', garageAuth.token, RECENT);
  check('1. PATCH liquide_frein date récente → 200', s1 === 200, `status=${s1}`);

  // ── Étape 2 : forcer le retard (axe mois, seuil liquide_frein = 12 mois) ────────
  console.log('\n── Étape 2 : premier passage en retard → première notification ──');
  const { status: s2 } = await patchConso(motoId, 'liquide_frein', garageAuth.token, VIEUX);
  check('2. PATCH liquide_frein date vieille (13 mois) → 200', s2 === 200, `status=${s2}`);

  const { status: sA, body: bA } = await cron(CRON_SECRET);
  const detailA = Array.isArray(bA?.data?.details) ? bA.data.details.find(d => d.moto_id === motoId) : null;
  check('2a. cron A → liquide_frein listé en retard', sA === 200 && !!detailA && detailA.late.includes('liquide_frein'), JSON.stringify(detailA));
  check('2b. cron A → notified:true (première fois en retard depuis la baseline)', !!detailA && detailA.notified === true, JSON.stringify(detailA));

  // ── Étape 3 : anti-spam — un cron immédiat ne renotifie pas ─────────────────────
  console.log('\n── Étape 3 : idempotence — cron immédiat ne renotifie pas ───────');
  const { status: sB, body: bB } = await cron(CRON_SECRET);
  const detailB = Array.isArray(bB?.data?.details) ? bB.data.details.find(d => d.moto_id === motoId) : null;
  check('3. cron B → notified:false (anti-spam D-03, inchangé par ce correctif)', sB === 200 && !!detailB && detailB.notified === false, JSON.stringify(detailB));

  // ── Étape 4 : purge SANS photo (le scénario du bug) — doit réarmer le rappel ────
  console.log('\n── Étape 4 : purge sans photo (PATCH date récente) — doit réarmer ──');
  const { status: s4 } = await patchConso(motoId, 'liquide_frein', garageAuth.token, RECENT);
  check('4. PATCH liquide_frein date récente (purge) → 200', s4 === 200, `status=${s4}`);

  // ── Étape 5 : le consommable redevient en retard un cycle plus tard ─────────────
  console.log('\n── Étape 5 : second passage en retard — doit renotifier ─────────');
  const { status: s5 } = await patchConso(motoId, 'liquide_frein', garageAuth.token, VIEUX);
  check('5. PATCH liquide_frein date vieille (13 mois, 2e fois) → 200', s5 === 200, `status=${s5}`);

  const { status: sC, body: bC } = await cron(CRON_SECRET);
  const detailC = Array.isArray(bC?.data?.details) ? bC.data.details.find(d => d.moto_id === motoId) : null;
  check(
    '5a. cron C → notified:true — SANS le correctif Tâche 1, ce serait false à vie (bug réel identifié en reco 20/07/2026)',
    sC === 200 && !!detailC && detailC.notified === true,
    JSON.stringify(detailC)
  );

  console.log(`\nRESULTAT: ${OK} OK / ${KO} KO`);
  process.exit(KO === 0 ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
