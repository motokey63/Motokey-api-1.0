'use strict';
// Test HTTP — L12 Usage A (endpoint POST /catalogue-pieces/analyser-etiquette).
// Usage : node tests/test-catalogue-etiquette.js
// Prérequis : `node motokey-api.js` déjà lancé (serveur local :3000).
// Ce test tourne SANS crédit Anthropic : VISION_ENABLED=false en dev (défaut),
// donc analyserEtiquette() retourne systématiquement {ok:false, raison:'desactive'},
// et le test vérifie que l'endpoint propage bien disponible:false sans planter.

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const FIXTURE_JPEG = path.join(__dirname, 'fixtures', 'sample.jpg');

const CREDS = {
  garage: { email: 'garage@motokey.fr', password: 'motokey2026', role: 'garage' },
  client: { email: 'sophie@email.com', password: 'client123' }
};

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

function request(method, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const { token, json, multipart } = options;
    const url = new URL(BASE_URL + urlPath);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let bodyBuffer = null;

    if (multipart) {
      const boundary = '----motokeyTestBoundary' + Date.now();
      const parts = [];
      if (multipart.fields) {
        for (const [key, val] of Object.entries(multipart.fields)) {
          parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
        }
      }
      if (multipart.filePath) {
        const fileBuffer = fs.readFileSync(multipart.filePath);
        const fileName = path.basename(multipart.filePath);
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${multipart.fieldName || 'photo'}"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n`));
        parts.push(fileBuffer);
      }
      parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
      bodyBuffer = Buffer.concat(parts);
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      headers['Content-Length'] = bodyBuffer.length;
    } else if (json !== undefined) {
      bodyBuffer = Buffer.from(JSON.stringify(json));
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = bodyBuffer.length;
    }

    const req = http.request({ hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body; try { body = raw ? JSON.parse(raw) : null; } catch (e) { body = raw; }
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
  if (status !== 200 || !body?.data?.token) throw new Error(`login échoué (${email}) — ${status} — ${JSON.stringify(body)}`);
  return body.data.token;
}

async function loginClient(email, password) {
  const { status, body } = await request('POST', '/auth/client/login', { json: { email, password } });
  const token = body?.data?.session?.access_token;
  if (status !== 200 || !token) throw new Error(`login client échoué (${email}) — ${status} — ${JSON.stringify(body)}`);
  return token;
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test HTTP POST /catalogue-pieces/analyser-etiquette  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    const { status } = await request('GET', '/');
    if (status !== 200) throw new Error(`status inattendu: ${status}`);
    console.log(`  ✅ Serveur joignable sur ${BASE_URL}`);
  } catch (e) {
    console.error(`❌ Serveur non joignable — lance \`node motokey-api.js\` (${e.message})`);
    process.exit(1);
  }

  const garageToken = await login(CREDS.garage.email, CREDS.garage.password);
  const clientToken = await loginClient(CREDS.client.email, CREDS.client.password);

  console.log('\n── RBAC ─────────────────────────────────────────────────────────');
  {
    const { status, body } = await request('POST', '/catalogue-pieces/analyser-etiquette', { multipart: { filePath: FIXTURE_JPEG } });
    check('sans token → 401 UNAUTHORIZED', status === 401 && body?.error?.code === 'UNAUTHORIZED', `status=${status}`);
  }
  {
    const { status, body } = await request('POST', '/catalogue-pieces/analyser-etiquette', { token: clientToken, multipart: { filePath: FIXTURE_JPEG } });
    check('CLIENT → 403 FORBIDDEN_ROLE', status === 403 && body?.error?.code === 'FORBIDDEN_ROLE', `status=${status} body=${JSON.stringify(body)}`);
  }

  console.log('\n── Validation ───────────────────────────────────────────────────');
  {
    const { status, body } = await request('POST', '/catalogue-pieces/analyser-etiquette', { token: garageToken, multipart: { fields: { dummy: '1' } } });
    check('sans fichier "photo" → 400 VALIDATION_ERROR', status === 400 && body?.error?.code === 'VALIDATION_ERROR', `status=${status} body=${JSON.stringify(body)}`);
  }

  console.log('\n── Flux nominal (VISION_ENABLED=false en dev → disponible:false) ──');
  {
    const { status, body } = await request('POST', '/catalogue-pieces/analyser-etiquette', { token: garageToken, multipart: { filePath: FIXTURE_JPEG } });
    if (status === 503 && body?.error?.code === 'CLOUDINARY_NOT_CONFIGURED') {
      console.warn('  ⚠️  SKIP flux nominal — Cloudinary non configuré en local (à provisionner)');
    } else {
      check('CONCESSION (≥MECANO) + photo valide → 200', status === 200, `status=${status} body=${JSON.stringify(body)}`);
      check('  disponible:false (VISION_ENABLED=false en dev)', body?.data?.disponible === false, JSON.stringify(body?.data));
      check('  raison:desactive', body?.data?.raison === 'desactive', JSON.stringify(body?.data));
      check('  photo_url présent (upload Cloudinary a bien eu lieu malgré échec Vision)', typeof body?.data?.photo_url === 'string' && body.data.photo_url.startsWith('https://'), JSON.stringify(body?.data));
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`${OK} OK / ${KO} KO`);
  process.exit(KO > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('\n❌ Erreur fatale non interceptée :', e.message);
  process.exit(1);
});
