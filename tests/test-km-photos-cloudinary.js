'use strict';
// Test d'intégration HTTP — Phase 25 (endpoints km / photos consommables / remplacement compteur / Cloudinary)
// Usage : node tests/test-km-photos-cloudinary.js
// Prérequis : `node motokey-api.js` déjà lancé dans un autre terminal (serveur local :3000)
//
// Style ad-hoc du repo (voir tests/test-or-e2e.js) : requêtes http brutes, aucun jest/mocha.
// Ce fichier est un SQUELETTE (Wave 0, plan 25-02) : les 5 sections ci-dessous sont des stubs
// que les plans 25-03 (KM-02/KM-03), 25-04 (CONSO-01) et 25-05 (CONSO-03/CLOUD-01) rempliront.
// Il doit tourner (exit 0) même avec toutes les sections en stub, tant que le serveur répond.

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const FIXTURE_JPEG = path.join(__dirname, 'fixtures', 'sample.jpg');

// Credentials seed connus (voir motokey-api.js root endpoint / server.listen banner).
// Pas de compte MECANO/PRO distinct en seed pour l'instant : le login garage renvoie
// rbac_role=CONCESSION, qui satisfait PRO+ pour les besoins de ce harnais. Un token de
// rôle plus fin (ex: MECANO pur) pourra être ajouté ici quand un compte seed existera.
const CREDS = {
  garage: { email: 'garage@motokey.fr', password: 'motokey2026', role: 'garage' },
  client: { email: 'sophie@email.com', password: 'client123', role: 'client' }
};

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

// ── Helper : requête http brute ────────────────────────────────────────────
// options: { token, json, multipart: { fieldName, filePath, fields } }
function request(method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const { token, json, multipart } = options;
    const url = new URL(BASE_URL + urlPath);

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let bodyBuffer = null;

    if (multipart) {
      const boundary = '----motokeyTestBoundary' + Date.now();
      const fileBuffer = fs.readFileSync(multipart.filePath);
      const fileName = path.basename(multipart.filePath);
      const parts = [];

      // Champs texte additionnels du formulaire
      if (multipart.fields) {
        for (const [key, val] of Object.entries(multipart.fields)) {
          parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
          ));
        }
      }

      // Champ fichier
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${multipart.fieldName || 'photo'}"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n`
      ));
      parts.push(fileBuffer);
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

      bodyBuffer = Buffer.concat(parts);
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      headers['Content-Length'] = bodyBuffer.length;
    } else if (json !== undefined) {
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

// ── Helper : login → token de session ──────────────────────────────────────
async function login(email, password, role = 'garage') {
  const { status, body } = await request('POST', '/auth/login', {
    json: { email, password, role }
  });
  if (status !== 200 || !body || !body.data || !body.data.token) {
    throw new Error(`login échoué (${email}) — status ${status} — ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test intégration km / photos / compteur / Cloudinary ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // ── Ping serveur ────────────────────────────────────────────────────────
  console.log('── Setup : ping serveur ────────────────────────────────────────');
  try {
    const { status } = await request('GET', '/');
    if (status !== 200) throw new Error(`status inattendu: ${status}`);
    console.log(`  ✅ Serveur joignable sur ${BASE_URL} (status ${status})`);
  } catch (e) {
    console.error(`❌ Serveur non joignable sur :3000 — lance \`node motokey-api.js\` (${e.message})`);
    process.exit(1);
  }

  // Fixture multipart disponible ?
  if (!fs.existsSync(FIXTURE_JPEG)) {
    console.error(`❌ Fixture manquante : ${FIXTURE_JPEG} — voir tests/fixtures/sample.jpg`);
    process.exit(1);
  }

  // Tokens (garage sert de proxy PRO+/MECANO+, voir commentaire CREDS ci-dessus)
  let garageAuth, clientAuth;
  try {
    garageAuth = await login(CREDS.garage.email, CREDS.garage.password, 'garage');
    console.log(`  ✅ Login garage OK (rbac_role=${garageAuth.rbac_role})`);
  } catch (e) {
    console.error(`❌ Login garage échoué : ${e.message}`);
  }
  try {
    clientAuth = await login(CREDS.client.email, CREDS.client.password, 'client');
    console.log(`  ✅ Login client OK`);
  } catch (e) {
    console.error(`❌ Login client échoué : ${e.message}`);
  }

  // ─── KM-03 (relevé km normal) ────────────────────────────────────────────
  console.log('\n── KM-03 : relevé km normal (CLIENT ou MECANO+) ────────────────');
  console.log('  ⏭️  [KM-03] à implémenter en 25-03');

  // ─── KM-02 (remplacement compteur) ──────────────────────────────────────
  console.log('\n── KM-02 : remplacement compteur (PRO+ strict) ─────────────────');
  console.log('  ⏭️  [KM-02] à implémenter en 25-03');

  // ─── CONSO-01 (saisie consommables) ─────────────────────────────────────
  console.log('\n── CONSO-01 : saisie consommables (MECANO+) ────────────────────');
  console.log('  ⏭️  [CONSO-01] à implémenter en 25-04');

  // ─── CONSO-03 (photo consommable) ───────────────────────────────────────
  console.log('\n── CONSO-03 : upload photo consommable (CLIENT ou MECANO+) ─────');
  console.log('  ⏭️  [CONSO-03] à implémenter en 25-05');

  // ─── CLOUD-01 (round-trip Cloudinary réel) ──────────────────────────────
  console.log('\n── CLOUD-01 : round-trip Cloudinary réel ────────────────────────');
  const cloudReady = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
  if (!cloudReady) {
    console.warn('  ⚠️  [CLOUD-01] SKIP round-trip réel — CLOUDINARY_* absent en local (à provisionner par Mehdi). NON silencieux.');
  } else {
    console.log('  ⏭️  [CLOUD-01] credentials détectés — round-trip à implémenter en 25-05');
  }

  // ── Récap ─────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`${OK} OK / ${KO} KO`);
  process.exit(KO > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('\n❌ Erreur fatale non interceptée :', e.message);
  process.exit(1);
});
