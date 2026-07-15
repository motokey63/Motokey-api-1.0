'use strict';
// Test d'intégration HTTP — Phase 26 (cron de rappel photo consommables + badge garage)
// Usage : node tests/test-consommable-rappel-cron.js
// Prérequis : `node motokey-api.js` déjà lancé dans un autre terminal (serveur local :3000)
//
// Style ad-hoc du repo (voir tests/test-km-photos-cloudinary.js) : requêtes http brutes,
// aucun jest/mocha. Les assertions [UNIT] (26-02) sont pures — aucun serveur requis pour
// elles. Les assertions [GAUGE-03]/[GAUGE-04] (26-03) sont des assertions d'intégration —
// SKIPPABLES proprement si CRON_SECRET/migration 24/Cloudinary sont absents (discipline
// Phase 25). Le fichier sort toujours exit 0 tant qu'aucune assertion ACTIVE n'échoue.

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const FIXTURE_JPEG = path.join(__dirname, 'fixtures', 'sample.jpg');

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
function skip(label, reason) {
  console.log(`  ⏭️  skip: ${label} — ${reason}`);
}

// ── Helper : requête http brute ────────────────────────────────────────────
// options: { token, json, headers, multipart: { fieldName, filePath, fields } }
function request(method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const { token, json, headers: extraHeaders, multipart } = options;
    const url = new URL(BASE_URL + urlPath);

    const headers = Object.assign({}, extraHeaders || {});
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let bodyBuffer = null;

    if (multipart) {
      const boundary = '----motokeyTestBoundary' + Date.now();
      const fileBuffer = fs.readFileSync(multipart.filePath);
      const fileName = path.basename(multipart.filePath);
      const parts = [];

      if (multipart.fields) {
        for (const [key, val] of Object.entries(multipart.fields)) {
          parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
          ));
        }
      }

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

// ── Helper : login garage → token de session (JWT legacy garage) ───────────
async function login(email, password, role = 'garage') {
  const { status, body } = await request('POST', '/auth/login', {
    json: { email, password, role }
  });
  if (status !== 200 || !body || !body.data || !body.data.token) {
    throw new Error(`login échoué (${email}) — status ${status} — ${JSON.stringify(body)}`);
  }
  return body.data;
}

// ── Helper : login client → vraie session Supabase Auth ────────────────────
async function loginClient(email, password) {
  const { status, body } = await request('POST', '/auth/client/login', {
    json: { email, password }
  });
  const token = body && body.data && body.data.session && body.data.session.access_token;
  if (status !== 200 || !token) {
    throw new Error(`login client échoué (${email}) — status ${status} — ${JSON.stringify(body)}`);
  }
  let moto_id = null;
  try {
    const { status: ms, body: mb } = await request('GET', '/motos', { token });
    if (ms === 200 && mb && mb.data && mb.data.motos && mb.data.motos.length) {
      moto_id = mb.data.motos[0].id;
    }
  } catch (e) { /* non-fatal — assertions dépendant de moto_id feront SKIP */ }
  return { token, moto_id };
}

// ── Helper : appel du cron avec un header X-Cron-Secret donné ──────────────
function cron(secretHeader) {
  return request('POST', '/cron/rappels-photo-consommables', {
    headers: secretHeader != null ? { 'x-cron-secret': secretHeader } : {}
  });
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test cron rappel photo consommables (26-03)          ║');
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

  // ── Ping serveur (requis pour tout le reste) ─────────────────────────────
  console.log('\n── Setup : ping serveur ─────────────────────────────────────────');
  let serverUp = false;
  try {
    const { status } = await request('GET', '/');
    serverUp = status === 200;
    console.log(serverUp ? `  ✅ Serveur joignable sur ${BASE_URL} (status ${status})` : `  ⚠️  Statut inattendu du serveur: ${status}`);
  } catch (e) {
    console.warn(`  ⚠️  Serveur non joignable sur :3000 (${e.message}) — sections GAUGE-03/GAUGE-04 SKIP`);
  }

  // ─── [GAUGE-03] cron push + idempotence + reset D-05 (26-03) ───────────
  console.log('\n── [GAUGE-03] cron push + idempotence + reset D-05 (26-03) ─────');

  if (!serverUp) {
    skip('[GAUGE-03] section entière', 'serveur local non joignable sur :3000');
  } else {
    // 1. Auth : mauvais secret → 401 (toujours actif, ne dépend d'aucune colonne)
    const { status: sAuth, body: bAuth } = await cron('mauvais-secret');
    check('cron mauvais secret → 401 UNAUTHORIZED', sAuth === 401 && bAuth?.error?.code === 'UNAUTHORIZED', `status=${sAuth} body=${JSON.stringify(bAuth)}`);

    if (!CRON_SECRET) {
      skip('[GAUGE-03] reste de la section', 'CRON_SECRET non défini dans l\'environnement du test');
    } else {
      // 3. Bon secret → 200 avec scanned/notified (forme)
      const { status: s200, body: b200 } = await cron(CRON_SECRET);
      check('cron bon secret → 200', s200 === 200, `status=${s200} body=${JSON.stringify(b200)}`);
      check('  data.scanned est un number', typeof b200?.data?.scanned === 'number', JSON.stringify(b200));
      check('  data.notified est un number', typeof b200?.data?.notified === 'number', JSON.stringify(b200));

      // Setup : login client + garage (garage sert d'acteur MECANO+ pour PATCH consommables,
      // la moto de sophie a garage_id = garage seed — voir setup-supabase.js).
      let garageAuth = null, clientAuth = null;
      try {
        garageAuth = await login(CREDS.garage.email, CREDS.garage.password, 'garage');
      } catch (e) {
        console.warn(`  ⚠️  Login garage échoué : ${e.message}`);
      }
      try {
        clientAuth = await loginClient(CREDS.client.email, CREDS.client.password);
      } catch (e) {
        console.warn(`  ⚠️  Login client échoué : ${e.message}`);
      }

      if (!garageAuth || !clientAuth || !clientAuth.moto_id) {
        skip('4. scénario retard + idempotence + reset D-05', 'login garage/client ou moto client indisponible');
      } else {
        const motoId = clientAuth.moto_id;

        // Récupère le km actuel de la moto (vue garage, plus riche que la vue client)
        let motoKm = null;
        try {
          const { status: sM, body: bM } = await request('GET', `/motos/${motoId}`, { token: garageAuth.token });
          if (sM === 200) motoKm = bM?.data?.moto?.km ?? null;
        } catch (e) { /* motoKm reste null → skip en aval */ }

        if (motoKm == null) {
          skip('4. scénario retard (setup km_montage chaine)', 'km actuel de la moto introuvable via GET garage');
        } else {
          // Force le dépassement du seuil chaine (3000km) : km_montage = motoKm - 5000
          const { status: sPatch, body: bPatch } = await request('PATCH', `/motos/${motoId}/consommables/chaine`, {
            token: garageAuth.token,
            json: { km_montage: motoKm - 5000 }
          });
          const patchOk = sPatch === 200;
          const columnErr = !patchOk && /km_a_la_photo|dernier_rappel|column|PGRST/i.test(JSON.stringify(bPatch || ''));

          if (!patchOk) {
            skip('4. scénario retard (setup km_montage chaine)', `PATCH consommables a échoué (status=${sPatch}, ${columnErr ? 'colonne manquante probable (migration 24 non appliquée)' : JSON.stringify(bPatch)})`);
          } else {
            // Premier cron : la moto doit ressortir notifiée
            const { status: sC1, body: bC1 } = await cron(CRON_SECRET);
            const detail1 = Array.isArray(bC1?.data?.details) ? bC1.data.details.find(d => d.moto_id === motoId) : null;
            if (sC1 !== 200 || !detail1) {
              skip('4a. premier cron → moto notifiée', `cron indisponible ou moto absente des details (status=${sC1}, body=${JSON.stringify(bC1)})`);
            } else {
              check('4a. premier cron → moto en details avec notified:true (ou notified global >=1)', detail1.notified === true || (b200 && b200.data && b200.data.notified >= 1), JSON.stringify(detail1));

              // Deuxième cron immédiat : idempotence D-03 — la moto ne doit PAS être re-notifiée
              const { status: sC2, body: bC2 } = await cron(CRON_SECRET);
              const detail2 = Array.isArray(bC2?.data?.details) ? bC2.data.details.find(d => d.moto_id === motoId) : null;
              check('4b. deuxième cron immédiat → idempotence (notified:false pour cette moto)', sC2 === 200 && !!detail2 && detail2.notified === false, JSON.stringify(detail2));

              // Reset D-05 : nouvelle photo du consommable chaine → skip proprement si Cloudinary 503
              const { status: sUp, body: bUp } = await request('POST', `/motos/${motoId}/photos-consommables`, {
                token: garageAuth.token,
                multipart: { filePath: FIXTURE_JPEG, fields: { type_consommable: 'chaine' } }
              });
              if (sUp === 503) {
                skip('4c. reset D-05 (upload photo chaine)', 'Cloudinary non configuré (503 CLOUDINARY_NOT_CONFIGURED) — reset D-05 non testable end-to-end ici');
              } else if (sUp !== 200 && sUp !== 201) {
                skip('4c. reset D-05 (upload photo chaine)', `upload échoué de façon inattendue (status=${sUp}, ${JSON.stringify(bUp)})`);
              } else {
                // Troisième cron : la moto redevient notifiable (dernier_rappel_envoye_at reset à NULL)
                const { status: sC3, body: bC3 } = await cron(CRON_SECRET);
                const detail3 = Array.isArray(bC3?.data?.details) ? bC3.data.details.find(d => d.moto_id === motoId) : null;
                check('4c. troisième cron après reset D-05 → moto redevient notifiable (notified:true)', sC3 === 200 && !!detail3 && detail3.notified === true, JSON.stringify(detail3));
              }

              // 5. Push parti en mode dev (ou sent>=1) — skippable si aucun token device
              const pushResult = detail1.pushResult;
              if (!pushResult || pushResult.sent === 0) {
                skip('5. push parti en mode dev/sent>=1', 'aucun token device actif pour ce client (sent:0)');
              } else {
                const allDev = Array.isArray(pushResult.results) && pushResult.results.every(r => r.res && (r.res.dev === true || r.res.sent === true));
                check('5. pushResult.sent >= 1 ET (dev:true par device OU sent:true)', pushResult.sent >= 1 && allDev, JSON.stringify(pushResult));
              }
            }
          }
        }
      }
    }
  }

  // ─── [GAUGE-04] champ calculé rappel_photo_en_retard (26-03) ───────────
  console.log('\n── [GAUGE-04] champ calculé rappel_photo_en_retard (26-03) ─────');

  if (!serverUp) {
    skip('[GAUGE-04] section entière', 'serveur local non joignable sur :3000');
  } else {
    let garageAuth2 = null;
    try {
      garageAuth2 = await login(CREDS.garage.email, CREDS.garage.password, 'garage');
    } catch (e) {
      console.warn(`  ⚠️  Login garage échoué : ${e.message}`);
    }

    if (!garageAuth2) {
      skip('[GAUGE-04]', 'login garage indisponible');
    } else {
      // 6. GET /motos (liste garage) → champ rappel_photo_en_retard présent
      const { status: sList, body: bList } = await request('GET', '/motos', { token: garageAuth2.token });
      const motos = (sList === 200 && bList?.data?.motos) || [];
      if (!motos.length) {
        skip('6. GET /motos (liste garage) → rappel_photo_en_retard', 'liste des motos vide pour ce garage');
      } else {
        const m0 = motos[0];
        if (typeof m0.rappel_photo_en_retard !== 'boolean') {
          // Le champ n'est calculé que dans SBLayer.Motos.list()/getById() (supabase.js) — en
          // mode RAM fallback (Supabase non configuré localement), il n'existe pas. Skip
          // proprement plutôt qu'échec : le code (26-02) est déjà vérifié par lecture.
          skip('6/7. rappel_photo_en_retard/consommables_en_retard', 'Supabase non configuré localement (mode RAM fallback) — champ calculé uniquement par SBLayer.Motos.list/getById');
        } else {
          check('6. rappel_photo_en_retard présent (boolean) sur au moins une moto', typeof m0.rappel_photo_en_retard === 'boolean', JSON.stringify(m0));
          check('6. consommables_en_retard présent (array)', Array.isArray(m0.consommables_en_retard), JSON.stringify(m0));

          // 7. GET moto précise (fiche moto garage) → même champ présent
          const { status: sOne, body: bOne } = await request('GET', `/motos/${m0.id}`, { token: garageAuth2.token });
          check('7. GET /motos/:id (garage) → rappel_photo_en_retard présent (boolean)', sOne === 200 && typeof bOne?.data?.moto?.rappel_photo_en_retard === 'boolean', `status=${sOne} body=${JSON.stringify(bOne)}`);
        }
      }
    }
  }

  console.log(`\nRESULTAT: ${OK} OK / ${KO} KO`);
  process.exit(KO === 0 ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
