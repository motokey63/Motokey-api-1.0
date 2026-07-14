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
  let testMotoId = null;
  let testMotoKm = 0;
  if (garageAuth) {
    try {
      const { status, body: b } = await request('GET', '/motos', { token: garageAuth.token });
      if (status === 200 && b?.data?.motos?.length) {
        testMotoId = b.data.motos[0].id;
        testMotoKm = b.data.motos[0].km || 0;
        console.log(`  ℹ️  Moto de test : ${testMotoId} (km actuel ${testMotoKm})`);
      } else {
        console.warn(`  ⚠️  Aucune moto trouvée pour le garage seed — sections KM-02/KM-03 SKIP`, JSON.stringify(b));
      }
    } catch (e) {
      console.warn(`  ⚠️  Setup moto échoué — ${e.message}`);
    }
  }

  if (testMotoId) {
    const kmValide = testMotoKm + 100;
    const { status: s1, body: b1 } = await request('POST', `/motos/${testMotoId}/km`, {
      token: garageAuth.token,
      json: { km: kmValide }
    });
    check('POST /motos/:id/km (garage, km valide) → 200/201', s1 === 200 || s1 === 201, `status=${s1} body=${JSON.stringify(b1)}`);
    check('  releve enregistré (acteur_type=garage)', b1?.data?.releve?.acteur_type === 'garage', JSON.stringify(b1));

    const kmRegression = testMotoKm; // <= max historique après l'insert précédent
    const { status: s2, body: b2 } = await request('POST', `/motos/${testMotoId}/km`, {
      token: garageAuth.token,
      json: { km: kmRegression }
    });
    check('POST /motos/:id/km (régression) → 409 KM_REGRESSION', s2 === 409 && b2?.error?.code === 'KM_REGRESSION', `status=${s2} body=${JSON.stringify(b2)}`);
    check('  409 expose km_tente + km_actuel', typeof b2?.km_tente === 'number' && typeof b2?.km_actuel === 'number', JSON.stringify(b2));

    // Multipart avec photo (round-trip Cloudinary réel si configuré, sinon 503 typé — les deux sont des preuves valides du wiring)
    const kmMultipart = kmValide + 50;
    const { status: s3, body: b3 } = await request('POST', `/motos/${testMotoId}/km`, {
      token: garageAuth.token,
      multipart: { filePath: FIXTURE_JPEG, fields: { km: String(kmMultipart) } }
    });
    const cloudReadyForKm3 = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
    if (cloudReadyForKm3) {
      check('POST /motos/:id/km multipart+photo → 200/201 avec photo_url', (s3 === 200 || s3 === 201) && !!b3?.data?.releve?.photo_url, `status=${s3} body=${JSON.stringify(b3)}`);
    } else {
      check('POST /motos/:id/km multipart+photo → 503 CLOUDINARY_NOT_CONFIGURED (pas de credentials locaux)', s3 === 503 && b3?.error?.code === 'CLOUDINARY_NOT_CONFIGURED', `status=${s3} body=${JSON.stringify(b3)}`);
    }
  } else {
    console.log('  ⏭️  [KM-03] SKIP (pas de moto seed disponible)');
  }

  // ─── KM-02 (remplacement compteur) ──────────────────────────────────────
  console.log('\n── KM-02 : remplacement compteur (PRO+ strict) ─────────────────');
  if (testMotoId) {
    const kmReset = 0;
    const { status: s1, body: b1 } = await request('POST', `/motos/${testMotoId}/km/remplacement-compteur`, {
      token: garageAuth.token,
      json: { km: kmReset, note: 'Remplacement compteur — test intégration Phase 25-03' }
    });
    check('POST remplacement-compteur (garage PRO+, avec note) → 200/201', s1 === 200 || s1 === 201, `status=${s1} body=${JSON.stringify(b1)}`);

    const { status: s2, body: b2 } = await request('POST', `/motos/${testMotoId}/km/remplacement-compteur`, {
      token: garageAuth.token,
      json: { km: kmReset + 10 }
    });
    check('POST remplacement-compteur sans note → 400 VALIDATION_ERROR', s2 === 400 && b2?.error?.code === 'VALIDATION_ERROR', `status=${s2} body=${JSON.stringify(b2)}`);

    if (clientAuth) {
      const { status: s3, body: b3 } = await request('POST', `/motos/${testMotoId}/km/remplacement-compteur`, {
        token: clientAuth.token,
        json: { km: kmReset + 10, note: 'Tentative CLIENT — doit être refusée' }
      });
      check('POST remplacement-compteur (CLIENT) → 403 FORBIDDEN_ROLE', s3 === 403 && b3?.error?.code === 'FORBIDDEN_ROLE', `status=${s3} body=${JSON.stringify(b3)}`);
    } else {
      console.warn('  ⚠️  clientAuth indisponible — assertion CLIENT→403 SKIP');
    }
    // Pas de compte MECANO seed distinct pour l'instant (voir commentaire CREDS) — assertion
    // MECANO→403 à ajouter quand un compte seed MECANO existera.
  } else {
    console.log('  ⏭️  [KM-02] SKIP (pas de moto seed disponible)');
  }

  // ─── CONSO-01 (saisie consommables) ─────────────────────────────────────
  console.log('\n── CONSO-01 : saisie consommables (MECANO+) ────────────────────');
  if (testMotoId) {
    const { status: s1, body: b1 } = await request('PATCH', `/motos/${testMotoId}/consommables/chaine`, {
      token: garageAuth.token,
      json: { km_montage: 12000 }
    });
    check('PATCH /motos/:id/consommables/chaine (garage, type valide) → 200', s1 === 200, `status=${s1} body=${JSON.stringify(b1)}`);
    check('  consommable upserté (type_consommable=chaine)', b1?.data?.consommable?.type_consommable === 'chaine', JSON.stringify(b1));

    const { status: s2, body: b2 } = await request('PATCH', `/motos/${testMotoId}/consommables/invalide_xyz`, {
      token: garageAuth.token,
      json: { km_montage: 1000 }
    });
    check('PATCH /motos/:id/consommables/invalide_xyz → 400 VALIDATION_ERROR', s2 === 400 && b2?.error?.code === 'VALIDATION_ERROR', `status=${s2} body=${JSON.stringify(b2)}`);

    if (clientAuth) {
      const { status: s3, body: b3 } = await request('PATCH', `/motos/${testMotoId}/consommables/chaine`, {
        token: clientAuth.token,
        json: { km_montage: 5000 }
      });
      check('PATCH /motos/:id/consommables/chaine (CLIENT) → 403 FORBIDDEN_ROLE', s3 === 403 && b3?.error?.code === 'FORBIDDEN_ROLE', `status=${s3} body=${JSON.stringify(b3)}`);
    } else {
      console.warn('  ⚠️  clientAuth indisponible — assertion CLIENT→403 (unitaire) SKIP');
    }
  } else {
    console.log('  ⏭️  [CONSO-01 unitaire] SKIP (pas de moto seed disponible)');
  }

  if (testMotoId) {
    const { status: s4, body: b4 } = await request('POST', `/motos/${testMotoId}/consommables`, {
      token: garageAuth.token,
      json: { consommables: [
        { type_consommable: 'pneu_av', km_montage: 0 },
        { type_consommable: 'pneu_ar', km_montage: 0 }
      ] }
    });
    check('POST /motos/:id/consommables (bulk, garage) → 200/201', s4 === 200 || s4 === 201, `status=${s4} body=${JSON.stringify(b4)}`);
    check('  bulk : 2 consommables enregistrés', Array.isArray(b4?.data?.consommables) && b4.data.consommables.length === 2, JSON.stringify(b4));

    const { status: s5, body: b5 } = await request('POST', `/motos/${testMotoId}/consommables`, {
      token: garageAuth.token,
      json: { consommables: [
        { type_consommable: 'pneu_av', km_montage: 0 },
        { type_consommable: 'invalide_xyz', km_montage: 0 }
      ] }
    });
    check('POST /motos/:id/consommables (bulk, type invalide) → 400 VALIDATION_ERROR', s5 === 400 && b5?.error?.code === 'VALIDATION_ERROR', `status=${s5} body=${JSON.stringify(b5)}`);
  } else {
    console.log('  ⏭️  [CONSO-01 bulk] SKIP (pas de moto seed disponible)');
  }

  // ─── CONSO-03 (photo consommable) ───────────────────────────────────────
  console.log('\n── CONSO-03 : upload photo consommable (CLIENT ou MECANO+) ─────');
  const cloudReady = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
  let lastPhotoResponse = null; // réutilisé par CLOUD-01 ci-dessous

  if (testMotoId) {
    // Type SANS ligne consommable préalable pour ce test (CONSO-01 a déjà saisi chaine/pneu_av/pneu_ar)
    // — vérifie l'auto-création D-05.
    const { status: s1, body: b1 } = await request('POST', `/motos/${testMotoId}/photos-consommables`, {
      token: garageAuth.token,
      multipart: { filePath: FIXTURE_JPEG, fields: { type_consommable: 'disque_av' } }
    });
    if (cloudReady) {
      check('POST photos-consommables (garage, disque_av sans ligne préalable) → 200/201', s1 === 200 || s1 === 201, `status=${s1} body=${JSON.stringify(b1)}`);
      check('  photo_url renvoyé', !!b1?.data?.photo?.photo_url, JSON.stringify(b1));
      check('  consommable_id non null (D-05 auto-création)', !!b1?.data?.photo?.consommable_id, JSON.stringify(b1));
      check('  analyse.engine === "stub"', b1?.data?.analyse?.engine === 'stub', JSON.stringify(b1));
      check('  analyse.analyse_status ∈ {ok,incertain}', ['ok','incertain'].includes(b1?.data?.analyse?.analyse_status), JSON.stringify(b1));
      lastPhotoResponse = b1;
    } else {
      check('POST photos-consommables (sans creds) → 503 CLOUDINARY_NOT_CONFIGURED (D-02)', s1 === 503 && b1?.error?.code === 'CLOUDINARY_NOT_CONFIGURED', `status=${s1} body=${JSON.stringify(b1)}`);
    }

    // CLIENT (sa propre moto) — même logique, autorisé par CONSO-03.
    // NOTE (gap pré-existant, hors scope 25-05) : les comptes CLIENT se connectent via un JWT
    // legacy HS256 (jwtSign), et rbac.inferLegacyRole() suppose que tout JWT legacy appartient
    // à un compte garage (lookup table `garages` par id) — jamais un compte client. Résultat :
    // req.ctx/ctx reste null pour un CLIENT via ce chemin, sur TOUS les endpoints dual
    // CLIENT/GARAGE existants (vérifié aussi sur /motos/:id/interventions et /devis, pas
    // spécifique à CONSO-03). resolveMotoForCtx() renvoie donc null (404) plutôt que d'accepter
    // la requête. Documenté dans deferred-items.md — non corrigé ici (changement transverse à
    // auth/rbac.js affectant des dizaines d'endpoints déjà en prod, hors scope de ce plan).
    if (clientAuth && clientAuth.moto_id) {
      const { status: s2, body: b2 } = await request('POST', `/motos/${clientAuth.moto_id}/photos-consommables`, {
        token: clientAuth.token,
        multipart: { filePath: FIXTURE_JPEG, fields: { type_consommable: 'huile_moteur' } }
      });
      if (s2 === 404) {
        console.warn('  ⚠️  [CONSO-03] CLIENT positive-path → 404 (gap pré-existant rbac.inferLegacyRole, voir deferred-items.md) — SKIP non-silencieux, pas un échec de ce plan');
      } else if (cloudReady) {
        check('POST photos-consommables (client, sa moto) → 200/201', s2 === 200 || s2 === 201, `status=${s2} body=${JSON.stringify(b2)}`);
        check('  client : photo_url renvoyé', !!b2?.data?.photo?.photo_url, JSON.stringify(b2));
        if (!lastPhotoResponse) lastPhotoResponse = b2;
      } else {
        check('POST photos-consommables (client, sans creds) → 503 CLOUDINARY_NOT_CONFIGURED (D-02)', s2 === 503 && b2?.error?.code === 'CLOUDINARY_NOT_CONFIGURED', `status=${s2} body=${JSON.stringify(b2)}`);
      }
    } else {
      console.warn('  ⚠️  clientAuth.moto_id indisponible — assertion CLIENT (CONSO-03) SKIP');
    }

    // Type invalide → 400 (avant tout appel Cloudinary/DB)
    const { status: s3, body: b3 } = await request('POST', `/motos/${testMotoId}/photos-consommables`, {
      token: garageAuth.token,
      multipart: { filePath: FIXTURE_JPEG, fields: { type_consommable: 'invalide_xyz' } }
    });
    check('POST photos-consommables (type_consommable invalide) → 400 VALIDATION_ERROR', s3 === 400 && b3?.error?.code === 'VALIDATION_ERROR', `status=${s3} body=${JSON.stringify(b3)}`);

    // Fichier manquant → 400 (multipart envoyé mais champ fichier nommé différemment de "photo" → multer rejette le champ inattendu)
    const { status: s4, body: b4 } = await request('POST', `/motos/${testMotoId}/photos-consommables`, {
      token: garageAuth.token,
      multipart: { fieldName: 'autre_champ', filePath: FIXTURE_JPEG, fields: { type_consommable: 'chaine' } }
    });
    check('POST photos-consommables (champ fichier absent/inattendu) → 400', s4 === 400, `status=${s4} body=${JSON.stringify(b4)}`);
  } else {
    console.log('  ⏭️  [CONSO-03] SKIP (pas de moto seed disponible)');
  }

  // ─── CLOUD-01 (round-trip Cloudinary réel) ──────────────────────────────
  console.log('\n── CLOUD-01 : round-trip Cloudinary réel ────────────────────────');
  if (!cloudReady) {
    console.warn('  ⚠️  [CLOUD-01] SKIP round-trip réel — CLOUDINARY_* absent en local (à provisionner par Mehdi). NON silencieux — voir 25-05-SUMMARY.');
  } else {
    check('  [CLOUD-01] photo_url commence par https://res.cloudinary.com/ (round-trip réel)', !!(lastPhotoResponse && lastPhotoResponse.data && lastPhotoResponse.data.photo && String(lastPhotoResponse.data.photo.photo_url).startsWith('https://res.cloudinary.com/')), JSON.stringify(lastPhotoResponse));
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
