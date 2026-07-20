'use strict';
// Tests — L11 notif calendaire consommables (service + endpoint + overrides PATCH)
// Usage : node tests/test-consommable-echeance-cron.js
// [UNIT] ne nécessite aucun serveur — fonctions pures uniquement.
// [CRON]/[PATCH-OVERRIDE] (ajoutées Tâches 4/6) nécessitent `node motokey-api.js`
// démarré localement + CRON_SECRET dans l'environnement (SKIP propre sinon).

const http = require('http');

const {
  calculerPalier, isPalier90Atteint, axeCalendaire
} = require('../services/consommableEcheanceService');

const BASE_URL = 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET || null;

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

function cronEcheance(secretHeader) {
  return request('POST', '/cron/echeances-calendaires-consommables', {
    headers: secretHeader != null ? { 'x-cron-secret': secretHeader } : {}
  });
}

const CREDS = {
  garage: { email: 'garage@motokey.fr', password: 'motokey2026' }
};
// Fixture MECANO EPHEMERE dédiée à ce test — créée juste avant usage, nettoyée juste après
// (scripts/cleanup-test-fixtures.js, Step 6 de la Tâche 6). Domaine .local non résolvable,
// même convention que scripts/seed-rbac-test-users.js — jamais de fixture qui traîne
// (discipline post-incident, cf. L8 statiicrazer@gmail.com).
const MECANO_FIXTURE = { email: 'mecano-l11-test@motokey-test.local', password: 'TestMecanoL11!' };

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
  } catch (e) { /* non-fatal */ }
  return { token, moto_id };
}

async function ensureMecanoFixture(garageToken) {
  await request('POST', '/garage/users', {
    token: garageToken,
    json: { email: MECANO_FIXTURE.email, password: MECANO_FIXTURE.password, role: 'MECANO' }
  }); // 201 (créé) ou 409/400 (déjà existant) — les deux sont acceptables, on tente le login ensuite
  return login(MECANO_FIXTURE.email, MECANO_FIXTURE.password, 'garage');
}

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}
function skip(label, reason) {
  console.log(`  ⏭️  skip: ${label} — ${reason}`);
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Tests notif calendaire consommables (L11)            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // ─── [UNIT] calcul palier 90% (section 2.3) ─────────────────────────────
  console.log('\n── [UNIT] calcul palier 90% (section 2.3) ───────────────────────');

  const AUJOURDHUI = new Date('2026-07-20');

  // 1. liquide_frein — temps seul : le km, même très dépassé, est ignoré.
  {
    const conso = { type_consommable: 'liquide_frein', km_montage: 0, date_montage: '2026-06-20' };
    const pct = calculerPalier(conso, 999999, AUJOURDHUI); // km énorme si l'axe km comptait
    check('liquide_frein : axe km ignoré (pct proche de 8.33%, pas ~100%)', pct != null && Math.abs(pct - 100 / 12) < 0.01, `pct=${pct}`);
    check('liquide_frein : isPalier90Atteint === false', isPalier90Atteint(conso, 999999, AUJOURDHUI) === false);
    check("axeCalendaire('liquide_frein') === 'mois'", axeCalendaire('liquide_frein') === 'mois');
  }

  // 2. huile_moteur — km arrive avant le temps (seuil km=5000, mois=6)
  {
    const conso = { type_consommable: 'huile_moteur', km_montage: 0, date_montage: '2026-06-20' }; // 1 mois, pct_mois≈16.7%
    const motoKm = 4750; // pct_km = 95%
    const pct = calculerPalier(conso, motoKm, AUJOURDHUI);
    check('huile_moteur km-avant-temps : pct ≈ 95 (piloté par km)', pct != null && Math.abs(pct - 95) < 0.01, `pct=${pct}`);
    check('huile_moteur km-avant-temps : isPalier90Atteint === true', isPalier90Atteint(conso, motoKm, AUJOURDHUI) === true);
  }

  // 3. huile_moteur — le temps arrive avant le km (seuil km=5000, mois=6)
  {
    const conso = { type_consommable: 'huile_moteur', km_montage: 0, date_montage: '2026-01-20' }; // 6 mois pile, pct_mois=100%
    const motoKm = 500; // pct_km = 10%
    const pct = calculerPalier(conso, motoKm, AUJOURDHUI);
    check('huile_moteur temps-avant-km : pct ≈ 100 (piloté par mois)', pct != null && Math.abs(pct - 100) < 0.01, `pct=${pct}`);
    check('huile_moteur temps-avant-km : isPalier90Atteint === true', isPalier90Atteint(conso, motoKm, AUJOURDHUI) === true);
  }

  // 4. override change le seuil (COALESCE(override, défaut))
  {
    const sansOverride = { type_consommable: 'huile_moteur', km_montage: 0, date_montage: '2026-07-01' };
    const avecOverride  = { ...sansOverride, seuil_km_override: 1000 };
    const motoKm = 950; // pct défaut (5000) = 19% ; pct override (1000) = 95%
    const pctDefaut = calculerPalier(sansOverride, motoKm, AUJOURDHUI);
    const pctOverride = calculerPalier(avecOverride, motoKm, AUJOURDHUI);
    check('sans override : pct ≈ 19 (< 90)', pctDefaut != null && Math.abs(pctDefaut - 19) < 0.01, `pct=${pctDefaut}`);
    check('avec seuil_km_override=1000 : pct ≈ 95 (>= 90)', pctOverride != null && Math.abs(pctOverride - 95) < 0.01, `pct=${pctOverride}`);
    check('isPalier90Atteint bascule true uniquement avec override', isPalier90Atteint(sansOverride, motoKm, AUJOURDHUI) === false && isPalier90Atteint(avecOverride, motoKm, AUJOURDHUI) === true);
  }

  // 5. défensif — type inconnu / aucune référence (D-08, jamais d'exception)
  {
    check('type inconnu → null', calculerPalier({ type_consommable: 'inconnu', km_montage: 0 }, 99999, AUJOURDHUI) === null);
    check('aucune référence exploitable → null', calculerPalier({ type_consommable: 'chaine', km_montage: null, date_montage: null }, 99999, AUJOURDHUI) === null);
  }

  // 6. hors allowlist (décision produit) — un type non couvert par ce cron (ex. plaquettes_av)
  // ne doit JAMAIS déclencher de palier, même avec une référence extrêmement ancienne.
  {
    const conso = { type_consommable: 'plaquettes_av', km_montage: 0, date_montage: '2020-01-01' };
    check("axeCalendaire('plaquettes_av') === null (hors allowlist)", axeCalendaire('plaquettes_av') === null);
    check('plaquettes_av hors allowlist : calculerPalier === null malgré référence très ancienne', calculerPalier(conso, 999999, AUJOURDHUI) === null, `pct=${calculerPalier(conso, 999999, AUJOURDHUI)}`);
    check('plaquettes_av hors allowlist : isPalier90Atteint === false', isPalier90Atteint(conso, 999999, AUJOURDHUI) === false);
  }

  // ─── [CRON] endpoint /cron/echeances-calendaires-consommables ──────────
  console.log('\n── [CRON] endpoint /cron/echeances-calendaires-consommables ─────');

  let serverUp = false;
  try {
    const { status } = await request('GET', '/');
    serverUp = status === 200;
  } catch (e) { /* serverUp reste false */ }

  if (!serverUp) {
    skip('[CRON] section entière', 'serveur local non joignable sur :3000');
  } else {
    const { status: sAuth, body: bAuth } = await cronEcheance('mauvais-secret');
    check('cron mauvais secret → 401 UNAUTHORIZED', sAuth === 401 && bAuth?.error?.code === 'UNAUTHORIZED', `status=${sAuth} body=${JSON.stringify(bAuth)}`);

    if (!CRON_SECRET) {
      skip('[CRON] reste de la section', "CRON_SECRET non défini dans l'environnement du test");
    } else {
      const { status: s200, body: b200 } = await cronEcheance(CRON_SECRET);
      check('cron bon secret → 200', s200 === 200, `status=${s200} body=${JSON.stringify(b200)}`);
      check('  data.scanned est un number', typeof b200?.data?.scanned === 'number', JSON.stringify(b200));
      check('  data.notified est un number', typeof b200?.data?.notified === 'number', JSON.stringify(b200));
      check('  data.details est un array', Array.isArray(b200?.data?.details), JSON.stringify(b200));
    }
  }

  // ─── [PATCH-OVERRIDE] seuil_km_override/seuil_mois_override réservés PRO+ ──
  console.log('\n── [PATCH-OVERRIDE] overrides de seuil réservés PRO+ ────────────');

  if (!serverUp) {
    skip('[PATCH-OVERRIDE] section entière', 'serveur local non joignable sur :3000');
  } else {
    let garageAuth = null, clientAuth = null, mecanoAuth = null;
    try { garageAuth = await login('garage@motokey.fr', 'motokey2026', 'garage'); }
    catch (e) { console.warn(`  ⚠️  Login garage échoué : ${e.message}`); }
    try { clientAuth = await loginClient('sophie@email.com', 'client123'); }
    catch (e) { console.warn(`  ⚠️  Login client échoué : ${e.message}`); }

    if (!garageAuth || !clientAuth || !clientAuth.moto_id) {
      skip('[PATCH-OVERRIDE] section entière', 'login garage/client ou moto client indisponible');
    } else {
      const motoId = clientAuth.moto_id;

      // 1. CONCESSION (le compte garage owner — niveau 4, >= PRO) peut poser un override.
      const { status: sPro, body: bPro } = await request('PATCH', `/motos/${motoId}/consommables/huile_moteur`, {
        token: garageAuth.token,
        json: { seuil_km_override: 4000 }
      });
      check('CONCESSION (>= PRO) → PATCH avec seuil_km_override → 200', sPro === 200, `status=${sPro} body=${JSON.stringify(bPro)}`);
      check('  réponse contient seuil_km_override=4000', bPro?.data?.consommable?.seuil_km_override === 4000, JSON.stringify(bPro));

      // 2. MECANO (fixture éphémère, créée si besoin) → 403 sur les champs override.
      try {
        mecanoAuth = await ensureMecanoFixture(garageAuth.token);
      } catch (e) {
        console.warn(`  ⚠️  Setup/login MECANO fixture échoué : ${e.message}`);
      }
      if (!mecanoAuth) {
        skip('MECANO → override refusé (403)', 'fixture MECANO indisponible (setup POST /garage/users ou login échoué)');
      } else {
        const { status: sMec, body: bMec } = await request('PATCH', `/motos/${motoId}/consommables/huile_moteur`, {
          token: mecanoAuth.token,
          json: { seuil_km_override: 1234 }
        });
        check('MECANO → PATCH avec seuil_km_override → 403 FORBIDDEN_ROLE', sMec === 403 && bMec?.error?.code === 'FORBIDDEN_ROLE', `status=${sMec} body=${JSON.stringify(bMec)}`);

        // 3. Non-régression — MECANO peut toujours modifier km_montage/date_montage SANS override.
        const { status: sMecOk } = await request('PATCH', `/motos/${motoId}/consommables/huile_moteur`, {
          token: mecanoAuth.token,
          json: { km_montage: 12345 }
        });
        check('MECANO → PATCH sans champ override (km_montage seul) → 200 (non-régression base endpoint)', sMecOk === 200, `status=${sMecOk}`);
      }
    }
  }

  console.log(`\nRESULTAT: ${OK} OK / ${KO} KO`);
  process.exit(KO === 0 ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
