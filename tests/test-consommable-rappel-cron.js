'use strict';
// SQUELETTE (Wave 0, plan 26-01) — les assertions GAUGE-03/GAUGE-04 sont remplies par
// 26-02 (unitaires purs) et 26-03 (intégration HTTP). Doit sortir exit 0 même vide.
// Usage : node tests/test-consommable-rappel-cron.js
//
// Style ad-hoc du repo (voir tests/test-km-photos-cloudinary.js) : requêtes http brutes,
// aucun jest/mocha.

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// Credentials seed connus (voir tests/test-km-photos-cloudinary.js).
const CREDS = {
  client: { email: 'sophie@email.com', password: 'client123' },
  garage: { email: 'garage@motokey.fr', password: 'motokey2026' }
};

// Secret cron (les tests d'intégration cron de 26-03 seront skippables si absent).
const CRON_SECRET = process.env.CRON_SECRET || null;

// Fonction pure de retard (26-02) — aucun serveur/DB requis pour ces assertions.
const { isConsommableEnRetard, moisEcoules } = require('../services/consommableRappelService');

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

// ── Helper : requête http brute ────────────────────────────────────────────
// options: { token, json }
function request(method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const { token, json } = options;
    const url = new URL(BASE_URL + urlPath);

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let bodyBuffer = null;
    if (json !== undefined) {
      bodyBuffer = Buffer.from(JSON.stringify(json));
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = bodyBuffer.length;
    }

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers
    };

    const req = http.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body;
        try { body = raw ? JSON.parse(raw) : null; }
        catch (e) { body = raw; }
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('error', reject);
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test cron rappel photo consommables (squelette 26-01) ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // ─── [UNIT] fonction pure de retard (26-02) ─────────────────────────────
  console.log('\n── [UNIT] fonction pure de retard (26-02) ──────────────────────');

  check(
    'pneu_ar retard km',
    isConsommableEnRetard({ type_consommable: 'pneu_ar', km_montage: 10000, date_montage: null }, 12600, null) === true
  );
  check(
    'pneu_ar pas retard',
    isConsommableEnRetard({ type_consommable: 'pneu_ar', km_montage: 10000, date_montage: null }, 12000, null) === false
  );
  check(
    'D-08 aucune ref exclu',
    isConsommableEnRetard({ type_consommable: 'chaine', km_montage: null, date_montage: null }, 99999, null) === false
  );
  check(
    'type inconnu false',
    isConsommableEnRetard({ type_consommable: 'inconnu', km_montage: 0 }, 99999, null) === false
  );
  check(
    'moisEcoules calendaire',
    moisEcoules(new Date('2026-01-15'), new Date('2026-07-15')) === 6
  );
  check(
    'photo plus recente prime km_montage',
    isConsommableEnRetard({ type_consommable: 'huile_moteur', km_montage: 0 }, 4000, { km_a_la_photo: 1000, created_at: '2026-07-01' }) === false
  );

  // ─── [GAUGE-03] cron push + idempotence + reset D-05 (26-03) ───────────
  console.log('\n── [GAUGE-03] cron push + idempotence + reset D-05 (26-03) ─────');

  // ─── [GAUGE-04] champ calculé rappel_photo_en_retard (26-03) ───────────
  console.log('\n── [GAUGE-04] champ calculé rappel_photo_en_retard (26-03) ─────');

  console.log(`\nRESULTAT: ${OK} OK / ${KO} KO`);
  process.exit(KO === 0 ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
