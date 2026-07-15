// Phase 27 (v1.6), plan 27-01 — Wave 0 test harness mandated by 27-VALIDATION.md
// before any implementation task (27-02/27-03/27-04) can claim Nyquist coverage.
/**
 * scripts/test-consommables-jauges.js
 *
 * Style test-consommables-crud.js / test-releves-km-trigger.js (PASS/FAIL,
 * --case=, exit 1 si KO). Cinq cas, chacun filtrable via --case= :
 *
 *   --case=jauge-generale-logic — pure, AUCUNE DB/réseau. Vérifie
 *                                  computeJaugeGenerale() (services/jaugeConsommables.js,
 *                                  livré en 27-02) : maillon le plus faible = pct_usure
 *                                  max parmi has_data=true, jamais une moyenne.
 *
 *   --case=endpoint-shape       — hybride. Structural (toujours) : GET
 *                                  /motos/:id/consommables enregistré dans
 *                                  motokey-api.js et référence resolveMotoForCtx.
 *                                  Live (optionnel) : si JAUGES_TEST_BASE_URL/TOKEN/
 *                                  MOTO_ID sont posés, appelle l'endpoint réel.
 *
 *   --case=frontend-structure   — grep, AUCUNE DB. Vérifie app.html (onglet
 *                                  Consommables, loadConsommables/renderConsommables,
 *                                  absence de l'heuristique legacy kmParcourus>=8000)
 *                                  et MotoKey_Client.html (uploadConsoPhoto, section
 *                                  Consommables, absence de pneusHtml).
 *
 *   --case=migration             — live pg-direct contre FRESH_DB_URL (projet
 *                                  Supabase jetable, jamais la prod — même garde-fou
 *                                  que scripts/test-consommables-crud.js). Rejoue
 *                                  sql/migrations/25_migrate_pneus_to_consommables.sql
 *                                  (livrée en 27-02) deux fois pour prouver
 *                                  l'idempotence ON CONFLICT.
 *
 *   --case=dead-code-removed     — grep, AUCUNE DB. Vérifie que app.html ne contient
 *                                  plus aucun résidu de l'ancienne section Pneus
 *                                  (livré en 27-03) et que CLAUDE.md a été corrigé.
 *
 * NE JAMAIS logger connectionString / process.env.FRESH_DB_URL en clair — seul le
 * host parsé est imprimé, même convention que scripts/test-consommables-crud.js.
 *
 * Cases structurelles/pures (jauge-generale-logic, frontend-structure,
 * dead-code-removed) et la partie structurelle de endpoint-shape sont attendues
 * FAIL (RED) tant que 27-02/27-03/27-04 n'ont pas livré leur code — c'est
 * volontaire pour ce plan Wave 0.
 *
 * Usage :
 *   node scripts/test-consommables-jauges.js
 *   node scripts/test-consommables-jauges.js --case=jauge-generale-logic
 *   node scripts/test-consommables-jauges.js --case=endpoint-shape
 *   node scripts/test-consommables-jauges.js --case=frontend-structure
 *   node scripts/test-consommables-jauges.js --case=migration
 *   node scripts/test-consommables-jauges.js --case=dead-code-removed
 */

'use strict';

const fs = require('fs');
const path = require('path');

let OK = 0;
let KO = 0;

function assert(caseName, label, condition, detail) {
  if (condition) {
    console.log(`  PASS ${caseName} — ${label}`);
    OK++;
  } else {
    console.log(`  FAIL ${caseName} — ${label}${detail ? ' — ' + detail : ''}`);
    KO++;
  }
}

const CASE_FILTER = (() => {
  const arg = process.argv.find((a) => a.startsWith('--case='));
  return arg ? arg.split('=')[1] : null;
})();

function shouldRun(caseName) {
  return !CASE_FILTER || CASE_FILTER === caseName;
}

// ─────────────────────────────────────────────────────────────────────────
// Cas jauge-generale-logic : fonction pure, aucune DB/réseau
// ─────────────────────────────────────────────────────────────────────────

function caseJaugeGeneraleLogic() {
  const caseName = 'jauge-generale-logic';

  let computeJaugeGenerale;
  try {
    ({ computeJaugeGenerale } = require('../services/jaugeConsommables'));
  } catch (err) {
    assert(caseName, "require('../services/jaugeConsommables') réussit", false, err.message);
    return;
  }

  assert(
    caseName,
    'computeJaugeGenerale([]) retourne null (D-04 : aucune donnée)',
    computeJaugeGenerale([]) === null
  );

  const aucuneDonnee = [
    { has_data: false, pct_usure: null },
    { has_data: false, pct_usure: null },
  ];
  assert(
    caseName,
    "tous has_data=false ('Non renseigné' exclus) → null",
    computeJaugeGenerale(aucuneDonnee) === null
  );

  const melange = [
    { type_consommable: 'chaine', has_data: true, pct_usure: 20, etat: 'bon' },
    { type_consommable: 'pneu_av', has_data: true, pct_usure: 70, etat: 'usé' },
    { type_consommable: 'huile_moteur', has_data: false, pct_usure: null, etat: null },
  ];
  const pireMaillon = computeJaugeGenerale(melange);
  assert(
    caseName,
    "maillon le plus faible = pct_usure max parmi has_data (pneu_av=70, PAS la moyenne=45)",
    !!pireMaillon && pireMaillon.pct_usure === 70 && pireMaillon.type_consommable === 'pneu_av',
    pireMaillon ? `pct_usure=${pireMaillon.pct_usure} type=${pireMaillon.type_consommable}` : 'null'
  );

  const pireEtat = computeJaugeGenerale([
    { has_data: true, pct_usure: 10, etat: 'bon' },
    { has_data: true, pct_usure: 90, etat: 'critique' },
  ]);
  assert(
    caseName,
    "etat='critique' (pire état = pct_usure max, jamais une moyenne)",
    !!pireEtat && pireEtat.etat === 'critique',
    pireEtat ? `etat=${pireEtat.etat}` : 'null'
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cas endpoint-shape : structural toujours + live optionnel
// ─────────────────────────────────────────────────────────────────────────

function caseEndpointShapeStructural() {
  const caseName = 'endpoint-shape';
  const src = fs.readFileSync(path.join(__dirname, '..', 'motokey-api.js'), 'utf8');

  // GET spécifiquement (une route POST '/motos/:id/consommables' existe déjà depuis
  // Phase 25/CONSO-01 — matcher le seul substring de route confondrait les deux
  // handlers et masquerait un vrai RED avant que 27-02 n'ajoute le GET).
  const routeIdx = src.indexOf("M('GET','/motos/:id/consommables')");
  assert(caseName, "route GET '/motos/:id/consommables' enregistrée", routeIdx !== -1, 'route GET introuvable');

  if (routeIdx !== -1) {
    // resolveMotoForCtx doit être référencé dans le même handler : cherche depuis
    // routeIdx jusqu'à la prochaine registration de route (ou 1500 chars, le premier
    // des deux), plutôt qu'un indexOf global qui trouverait la première occurrence
    // du fichier entier (utilisée par d'autres handlers).
    const windowEnd = Math.min(src.length, routeIdx + 1500);
    const handlerWindow = src.slice(routeIdx, windowEnd);
    assert(
      caseName,
      'le handler GET référence resolveMotoForCtx (même bloc, ~1500 chars)',
      /resolveMotoForCtx/.test(handlerWindow),
      'resolveMotoForCtx introuvable dans la fenêtre du handler GET'
    );
  }
}

async function caseEndpointShapeLive() {
  const caseName = 'endpoint-shape';
  const { JAUGES_TEST_BASE_URL, JAUGES_TEST_TOKEN, JAUGES_TEST_MOTO_ID } = process.env;

  if (!JAUGES_TEST_BASE_URL || !JAUGES_TEST_TOKEN || !JAUGES_TEST_MOTO_ID) {
    console.log('  SKIP endpoint-shape (live) — set JAUGES_TEST_BASE_URL/TOKEN/MOTO_ID to enable');
    return;
  }

  try {
    const res = await fetch(`${JAUGES_TEST_BASE_URL}/motos/${JAUGES_TEST_MOTO_ID}/consommables`, {
      headers: { Authorization: `Bearer ${JAUGES_TEST_TOKEN}` },
    });
    assert(caseName, 'GET /motos/:id/consommables → 200', res.status === 200, `status=${res.status}`);

    const body = await res.json().catch(() => ({}));
    assert(
      caseName,
      'body.consommables est un tableau de 9 éléments',
      Array.isArray(body.consommables) && body.consommables.length === 9,
      `consommables=${Array.isArray(body.consommables) ? body.consommables.length : typeof body.consommables}`
    );
    assert(
      caseName,
      'body.jauge_generale présent',
      Object.prototype.hasOwnProperty.call(body, 'jauge_generale')
    );
  } catch (err) {
    assert(caseName, 'requête live endpoint-shape réussit', false, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Cas frontend-structure : grep app.html + MotoKey_Client.html
// ─────────────────────────────────────────────────────────────────────────

function caseFrontendStructure() {
  const caseName = 'frontend-structure';
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  const clientSrc = fs.readFileSync(path.join(__dirname, '..', 'MotoKey_Client.html'), 'utf8');

  assert(caseName, 'app.html contient function loadConsommables', /function loadConsommables/.test(appSrc));
  assert(caseName, 'app.html contient function renderConsommables', /function renderConsommables/.test(appSrc));
  assert(caseName, "app.html contient l'onglet {id:'consommables'", /\{id:\s*'consommables'/.test(appSrc));
  assert(
    caseName,
    "app.html NE contient PAS l'heuristique legacy kmParcourus >= 8000",
    !/kmParcourus\s*>=\s*8000/.test(appSrc)
  );

  assert(caseName, 'MotoKey_Client.html contient function uploadConsoPhoto', /function uploadConsoPhoto/.test(clientSrc));
  assert(
    caseName,
    "MotoKey_Client.html contient un marqueur de section 'Consommables'",
    /Consommables/.test(clientSrc)
  );
  assert(
    caseName,
    "MotoKey_Client.html NE contient PAS l'identifiant legacy pneusHtml",
    !/pneusHtml/.test(clientSrc)
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Cas migration : pg-direct contre FRESH_DB_URL, skip si absent
// ─────────────────────────────────────────────────────────────────────────

async function caseMigration() {
  const caseName = 'migration';

  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const connectionString = process.env.FRESH_DB_URL;

  if (!connectionString) {
    console.log('  SKIP migration — FRESH_DB_URL not set');
    return;
  }

  // Garde-fou anti-prod — même style que scripts/test-consommables-crud.js.
  if (connectionString.includes('rzbqbaccjyxvtlnfitrr')) {
    assert(caseName, 'FRESH_DB_URL ne pointe pas vers la prod', false, 'REFUS : connexion prod détectée');
    return;
  }

  let host = '(unparseable url)';
  try {
    host = new URL(connectionString).host;
  } catch (_) {
    // ignore — host reste le fallback
  }
  console.log(`  Connexion à ${host}...`);

  const migrationPath = path.join(__dirname, '..', 'sql', 'migrations', '25_migrate_pneus_to_consommables.sql');
  if (!fs.existsSync(migrationPath)) {
    assert(
      caseName,
      'sql/migrations/25_migrate_pneus_to_consommables.sql existe',
      false,
      'fichier introuvable — livré en 27-02'
    );
    return;
  }
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  const { Client } = require('pg');
  const crypto = require('crypto');
  const client = new Client({ connectionString });
  await client.connect();

  const garageId = crypto.randomUUID();
  const motoId = crypto.randomUUID();

  try {
    const { rows: regclassRows } = await client.query("SELECT to_regclass('public.consommables') AS reg");
    if (!regclassRows[0]?.reg) {
      assert(
        caseName,
        "table 'consommables' existe",
        false,
        "introuvable — lancer d'abord node scripts/bootstrap-fresh-schema.js"
      );
      await client.end();
      return;
    }

    await client.query(
      'INSERT INTO garages (id, nom, email) VALUES ($1, $2, $3)',
      [garageId, 'Fixture Garage 27-01', `fixture-27-01-${garageId}@test.local`]
    );

    // Moto fixture garage — CHECK moto_proprietaire_coherence (L8) exige
    // proprietaire_type='garage' + proprietaire_garage_id posé, jamais client_id.
    await client.query(
      `INSERT INTO motos (id, garage_id, marque, modele, annee, plaque, vin, km, proprietaire_type, proprietaire_garage_id, pneu_av, pneu_ar, pneu_km_montage)
       VALUES ($1, $2, 'Yamaha', 'MT-07', 2022, 'FIX-JAUGE27', $3, 4000, 'garage', $2, 'Michelin Pilot Road 5', 'Michelin Pilot Road 5', 2000)`,
      [motoId, garageId, `VIN-JAUGE27-${motoId}`]
    );

    await client.query(migrationSql);

    const { rows: firstRun } = await client.query(
      `SELECT type_consommable, reference, km_montage FROM consommables
       WHERE moto_id = $1 AND type_consommable IN ('pneu_av','pneu_ar') ORDER BY type_consommable`,
      [motoId]
    );
    assert(
      caseName,
      '2 lignes consommables pneu_av/pneu_ar créées depuis les colonnes legacy',
      firstRun.length === 2,
      `n=${firstRun.length}`
    );
    assert(
      caseName,
      'reference/km_montage correspondent aux colonnes legacy migrées',
      firstRun.every((r) => r.reference === 'Michelin Pilot Road 5' && r.km_montage === 2000),
      JSON.stringify(firstRun)
    );

    // Idempotence : ré-exécuter la migration ne doit pas dupliquer les lignes.
    await client.query(migrationSql);
    const { rows: secondRun } = await client.query(
      `SELECT COUNT(*)::int AS n FROM consommables WHERE moto_id = $1 AND type_consommable IN ('pneu_av','pneu_ar')`,
      [motoId]
    );
    assert(
      caseName,
      'ré-exécution idempotente (ON CONFLICT, pas de duplication)',
      secondRun[0]?.n === 2,
      `n=${secondRun[0]?.n}`
    );
  } catch (err) {
    assert(caseName, "la migration s'exécute sans erreur", false, err.message);
  } finally {
    try {
      await client.query('DELETE FROM consommables WHERE moto_id = $1', [motoId]);
      await client.query('DELETE FROM motos WHERE id = $1', [motoId]);
      await client.query('DELETE FROM garages WHERE id = $1', [garageId]);
    } catch (err) {
      console.error('Avertissement : nettoyage fixtures incomplet —', err.message);
    }
    await client.end();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Cas dead-code-removed : grep app.html + CLAUDE.md
// ─────────────────────────────────────────────────────────────────────────

function caseDeadCodeRemoved() {
  const caseName = 'dead-code-removed';
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');
  const claudeSrc = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');

  const legacyPatterns = [
    { label: 'function renderPneus', re: /function renderPneus/ },
    { label: 'function loadPneus', re: /function loadPneus/ },
    { label: 'changerMotoPneus', re: /changerMotoPneus/ },
    { label: "section === 'pneus'", re: /section\s*===\s*'pneus'/ },
    { label: "pneus:'Pneus'", re: /pneus:\s*'Pneus'/ },
  ];
  for (const { label, re } of legacyPatterns) {
    assert(caseName, `app.html NE contient PAS ${label}`, !re.test(appSrc));
  }

  assert(
    caseName,
    "CLAUDE.md corrigé — la section Pneus mentionne désormais 'Consommables'",
    /### Pneus[\s\S]{0,600}Consommables/.test(claudeSrc)
  );
}

// ─────────────────────────────────────────────────────────────────────────

async function main() {
  if (shouldRun('jauge-generale-logic')) caseJaugeGeneraleLogic();
  if (shouldRun('endpoint-shape')) {
    caseEndpointShapeStructural();
    await caseEndpointShapeLive();
  }
  if (shouldRun('frontend-structure')) caseFrontendStructure();
  if (shouldRun('migration')) await caseMigration();
  if (shouldRun('dead-code-removed')) caseDeadCodeRemoved();

  console.log('\n' + '─'.repeat(40));
  console.log(`${OK}/${OK + KO} assertions passées`);
  if (KO === 0) {
    console.log('Tout est vert.\n');
  } else {
    console.log(`${KO} échec(s).\n`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
