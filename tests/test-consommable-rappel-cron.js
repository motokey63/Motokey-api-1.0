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

  // ─── [GAUGE-03] cron push + idempotence + reset D-05 (26-03) ───────────
  console.log('\n── [GAUGE-03] cron push + idempotence + reset D-05 (26-03) ─────');

  // ─── [GAUGE-04] champ calculé rappel_photo_en_retard (26-03) ───────────
  console.log('\n── [GAUGE-04] champ calculé rappel_photo_en_retard (26-03) ─────');

  console.log(`\nRESULTAT: ${OK} OK / ${KO} KO`);
  process.exit(KO === 0 ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
