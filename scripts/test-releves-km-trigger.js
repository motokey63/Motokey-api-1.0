// Wave 0 test harness (Phase 23, plan 23-02). Mirrors scripts/bootstrap-fresh-schema.js's
// direct node-postgres connection style. Exercises the trigger-level anti-fraude km
// behavior defined in plan 23-01 (verifier_km_monotone / trg_sync_moto_km) plus the
// CHECK 9-types constraint on consommables.type_consommable (CONSO-02).
/**
 * scripts/test-releves-km-trigger.js
 *
 * Script Node autonome (pg direct, pas de framework — convention établie de ce
 * codebase, voir 23-VALIDATION.md "Test Infrastructure") qui exerce :
 *   - le trigger BEFORE INSERT `verifier_km_monotone` sur `releves_km`
 *     (rejet+log via RETURN NULL, NULL-safe contre `motos.km`, chaîne fraîche
 *     après `remplacement_compteur`)
 *   - le trigger AFTER INSERT `trg_sync_moto_km` (sync `motos.km`)
 *   - le CHECK 9-types sur `consommables.type_consommable`
 *
 * IMPORTANT — ce script suppose que le schéma (sql/migrations/23_consommables_km.sql
 * / schema.sql, plan 23-01) est DÉJÀ bootstrappé sur la DB cible. Il ne crée aucun
 * schéma, seulement ses propres fixtures (garage + motos), qu'il nettoie en fin
 * d'exécution. Écrit AVANT que le trigger existe côté DB cible (23-02) : au moment
 * de sa création il n'est PAS exécuté (seul `node --check` valide sa syntaxe ici).
 * Son exécution verte est le gate de 23-04 :
 *
 *   node scripts/bootstrap-fresh-schema.js
 *   node scripts/test-releves-km-trigger.js
 *
 * Connexion via FRESH_DB_URL (.env, projet Supabase jetable — jamais la prod).
 * NE JAMAIS logger connectionString / process.env.FRESH_DB_URL en clair — seul
 * le host parsé est imprimé, même convention que scripts/bootstrap-fresh-schema.js.
 *
 * Cas couverts (voir 23-VALIDATION.md "Wave 0 Requirements") :
 *   accept                        — relevé croissant accepté, motos.km synchronisé
 *   reject-regression             — relevé décroissant annulé + ligne de rejet créée
 *   null-safe-baseline            — 1er relevé d'une moto avec motos.km déjà peuplé
 *                                    ET zéro ligne releves_km préalable : doit être
 *                                    rejeté (Pitfall A / GREATEST(motos.km, ...)).
 *                                    C'est l'état par défaut de toute moto prod le
 *                                    jour du déploiement — pas un edge case.
 *   counter-replacement-bypass    — remplacement_compteur démarre une chaîne
 *                                    monotone fraîche (relevés suivants comparés
 *                                    seulement à ce qui suit le remplacement)
 *   conso-check-violation         — CHECK 9-types sur consommables.type_consommable
 *                                    (code Postgres 23514 = check_violation)
 *
 * Chaque cas possède sa propre moto fixture et construit lui-même tout état
 * préalable nécessaire (aucune dépendance à l'ordre d'exécution des autres cas) —
 * exécutable en entier ou isolé via --case=<nom>.
 *
 * PASS <case> / FAIL <case> imprimés par assertion, style OK/KO de test-api.js.
 * Exit code 1 si au moins un FAIL.
 *
 * Usage :
 *   node scripts/test-releves-km-trigger.js
 *   node scripts/test-releves-km-trigger.js --case=reject-regression
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Client } = require('pg');
const crypto = require('crypto');

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

const NEUF_TYPES_CONSOMMABLES = [
  'pneu_av', 'pneu_ar', 'chaine', 'plaquettes_av', 'plaquettes_ar',
  'disque_av', 'disque_ar', 'huile_moteur', 'liquide_frein',
];

async function main() {
  const connectionString = process.env.FRESH_DB_URL;

  if (!connectionString) {
    console.error('FRESH_DB_URL manquant dans .env — voir plan 23-02 (checkpoint création projet jetable).');
    process.exit(1);
    return;
  }

  // Garde-fou anti-prod — même style que scripts/bootstrap-fresh-schema.js.
  if (connectionString.includes('rzbqbaccjyxvtlnfitrr')) {
    console.error('REFUS : FRESH_DB_URL pointe vers la prod. Utiliser un projet jetable.');
    process.exit(1);
    return;
  }

  let host = '(unparseable url)';
  try {
    host = new URL(connectionString).host;
  } catch (_) {
    // ignore — host reste le fallback
  }
  console.log(`Connexion à ${host}...`);

  const client = new Client({ connectionString });
  await client.connect();

  // UUID de fixtures explicites — un garage + une moto dédiée par cas, pour un
  // nettoyage ciblé et une exécution indépendante de l'ordre (--case).
  const fixtures = {
    garageId: crypto.randomUUID(),
    motoAccept: crypto.randomUUID(),   // cas accept
    motoReject: crypto.randomUUID(),   // cas reject-regression
    motoNullSafe: crypto.randomUUID(), // cas null-safe-baseline
    motoBypass: crypto.randomUUID(),   // cas counter-replacement-bypass
    motoConso: crypto.randomUUID(),    // cas conso-check-violation
  };

  try {
    await setupFixtures(client, fixtures);

    if (shouldRun('accept')) await caseAccept(client, fixtures);
    if (shouldRun('reject-regression')) await caseRejectRegression(client, fixtures);
    if (shouldRun('null-safe-baseline')) await caseNullSafeBaseline(client, fixtures);
    if (shouldRun('counter-replacement-bypass')) await caseCounterReplacementBypass(client, fixtures);
    if (shouldRun('conso-check-violation')) await caseConsoCheckViolation(client, fixtures);
  } finally {
    await cleanupFixtures(client, fixtures);
    await client.end();
  }

  console.log('\n' + '─'.repeat(40));
  console.log(`${OK}/${OK + KO} assertions passées`);
  if (KO === 0) {
    console.log('Tout est vert.\n');
  } else {
    console.log(`${KO} échec(s).\n`);
    process.exitCode = 1;
  }
}

async function setupFixtures(client, f) {
  await client.query(
    'INSERT INTO garages (id, nom, email) VALUES ($1, $2, $3)',
    [f.garageId, 'Fixture Garage 23-02', `fixture-23-02-${f.garageId}@test.local`]
  );

  // moto pour "accept" : km pré-peuplé = 10000, zéro releves_km au départ.
  await client.query(
    `INSERT INTO motos (id, garage_id, marque, modele, annee, plaque, vin, km)
     VALUES ($1, $2, 'Yamaha', 'MT-07', 2023, 'FIX-ACCEPT', $3, 10000)`,
    [f.motoAccept, f.garageId, `VIN-ACCEPT-${f.motoAccept}`]
  );

  // moto pour "reject-regression" : km pré-peuplé = 0, le cas construit lui-même
  // l'historique jusqu'à 12000 avant de tenter la régression.
  await client.query(
    `INSERT INTO motos (id, garage_id, marque, modele, annee, plaque, vin, km)
     VALUES ($1, $2, 'Triumph', 'Street Triple', 2022, 'FIX-REJECT', $3, 0)`,
    [f.motoReject, f.garageId, `VIN-REJECT-${f.motoReject}`]
  );

  // moto pour "null-safe-baseline" : km pré-peuplé = 40000, ZÉRO ligne releves_km
  // avant l'insert testé — reproduit l'état par défaut de toute moto prod existante.
  await client.query(
    `INSERT INTO motos (id, garage_id, marque, modele, annee, plaque, vin, km)
     VALUES ($1, $2, 'Honda', 'CB500', 2022, 'FIX-NULLSAFE', $3, 40000)`,
    [f.motoNullSafe, f.garageId, `VIN-NULLSAFE-${f.motoNullSafe}`]
  );

  // moto pour "counter-replacement-bypass" : km pré-peuplé = 40000, le cas construit
  // lui-même un relevé jusqu'à 40000 avant le remplacement de compteur.
  await client.query(
    `INSERT INTO motos (id, garage_id, marque, modele, annee, plaque, vin, km)
     VALUES ($1, $2, 'Kawasaki', 'Z650', 2021, 'FIX-BYPASS', $3, 40000)`,
    [f.motoBypass, f.garageId, `VIN-BYPASS-${f.motoBypass}`]
  );

  // moto pour "conso-check-violation" (km arbitraire, non pertinent pour ce cas).
  await client.query(
    `INSERT INTO motos (id, garage_id, marque, modele, annee, plaque, vin, km)
     VALUES ($1, $2, 'Suzuki', 'SV650', 2020, 'FIX-CONSO', $3, 0)`,
    [f.motoConso, f.garageId, `VIN-CONSO-${f.motoConso}`]
  );
}

async function cleanupFixtures(client, f) {
  const motoIds = [f.motoAccept, f.motoReject, f.motoNullSafe, f.motoBypass, f.motoConso];
  try {
    await client.query('DELETE FROM consommables WHERE moto_id = ANY($1::uuid[])', [motoIds]);
    await client.query('DELETE FROM releves_km_rejets WHERE moto_id = ANY($1::uuid[])', [motoIds]);
    await client.query('DELETE FROM releves_km WHERE moto_id = ANY($1::uuid[])', [motoIds]);
    await client.query('DELETE FROM motos WHERE id = ANY($1::uuid[])', [motoIds]);
    await client.query('DELETE FROM garages WHERE id = $1', [f.garageId]);
  } catch (err) {
    console.error('Avertissement : nettoyage fixtures incomplet —', err.message);
  }
}

// --- Cas 1 : accept ---------------------------------------------------------
// moto.km=10000, INSERT releves_km (km=12000, 'lecture').
// Assert : 1 ligne dans releves_km ET motos.km == 12000 (sync AFTER INSERT).

async function caseAccept(client, f) {
  const caseName = 'accept';

  const { rows } = await client.query(
    `INSERT INTO releves_km (moto_id, garage_id, km, type_evenement, acteur_type, acteur_id)
     VALUES ($1, $2, 12000, 'lecture', 'garage', $2) RETURNING id`,
    [f.motoAccept, f.garageId]
  );
  assert(caseName, 'insert accepté (1 ligne releves_km)', rows.length === 1, `rows=${rows.length}`);

  const { rows: motoRows } = await client.query('SELECT km FROM motos WHERE id = $1', [f.motoAccept]);
  assert(caseName, 'motos.km synchronisé à 12000', motoRows[0]?.km === 12000, `motos.km=${motoRows[0]?.km}`);
}

// --- Cas 2 : reject-regression ----------------------------------------------
// Construit un max historique à 12000, puis INSERT releves_km (km=9000, 'lecture').
// Assert : l'insert est annulé (0 ligne RETURNING) ET une ligne existe dans
// releves_km_rejets avec km_tente=9000 et km_actuel=12000 ET motos.km reste 12000.

async function caseRejectRegression(client, f) {
  const caseName = 'reject-regression';

  const setup = await client.query(
    `INSERT INTO releves_km (moto_id, garage_id, km, type_evenement, acteur_type, acteur_id)
     VALUES ($1, $2, 12000, 'lecture', 'garage', $2) RETURNING id`,
    [f.motoReject, f.garageId]
  );
  assert(caseName, 'précondition : relevé initial à 12000 accepté', setup.rows.length === 1, `rows=${setup.rows.length}`);

  const { rows } = await client.query(
    `INSERT INTO releves_km (moto_id, garage_id, km, type_evenement, acteur_type, acteur_id)
     VALUES ($1, $2, 9000, 'lecture', 'garage', $2) RETURNING id`,
    [f.motoReject, f.garageId]
  );
  assert(caseName, 'insert annulé (0 ligne RETURNING)', rows.length === 0, `rows=${rows.length}`);

  const { rows: rejetRows } = await client.query(
    'SELECT km_tente, km_actuel FROM releves_km_rejets WHERE moto_id = $1 ORDER BY created_at DESC LIMIT 1',
    [f.motoReject]
  );
  const rejet = rejetRows[0];
  assert(caseName, 'ligne de rejet créée', !!rejet);
  assert(caseName, 'km_tente=9000', rejet?.km_tente === 9000, `km_tente=${rejet?.km_tente}`);
  assert(caseName, 'km_actuel=12000', rejet?.km_actuel === 12000, `km_actuel=${rejet?.km_actuel}`);

  const { rows: motoRows } = await client.query('SELECT km FROM motos WHERE id = $1', [f.motoReject]);
  assert(caseName, 'motos.km reste 12000', motoRows[0]?.km === 12000, `motos.km=${motoRows[0]?.km}`);
}

// --- Cas 3 : null-safe-baseline ---------------------------------------------
// NOUVELLE moto avec motos.km=40000 et ZÉRO ligne releves_km. INSERT (km=100, 'lecture').
// Assert : REJET (annulé + ligne de rejet km_actuel=40000), motos.km reste 40000.
// C'est l'état par défaut de toute moto prod le jour du déploiement — pas un edge case.

async function caseNullSafeBaseline(client, f) {
  const caseName = 'null-safe-baseline';

  const { rows: preexisting } = await client.query(
    'SELECT COUNT(*)::int AS n FROM releves_km WHERE moto_id = $1',
    [f.motoNullSafe]
  );
  assert(caseName, 'précondition : zéro releves_km avant insert testé', preexisting[0].n === 0, `n=${preexisting[0].n}`);

  const { rows } = await client.query(
    `INSERT INTO releves_km (moto_id, garage_id, km, type_evenement, acteur_type, acteur_id)
     VALUES ($1, $2, 100, 'lecture', 'garage', $2) RETURNING id`,
    [f.motoNullSafe, f.garageId]
  );
  assert(caseName, 'insert annulé malgré 0 releves_km préalable (NULL-safe)', rows.length === 0, `rows=${rows.length}`);

  const { rows: rejetRows } = await client.query(
    'SELECT km_tente, km_actuel FROM releves_km_rejets WHERE moto_id = $1 ORDER BY created_at DESC LIMIT 1',
    [f.motoNullSafe]
  );
  const rejet = rejetRows[0];
  assert(caseName, 'ligne de rejet créée avec km_actuel=motos.km (40000)', rejet?.km_actuel === 40000, `km_actuel=${rejet?.km_actuel}`);
  assert(caseName, 'km_tente=100', rejet?.km_tente === 100, `km_tente=${rejet?.km_tente}`);

  const { rows: motoRows } = await client.query('SELECT km FROM motos WHERE id = $1', [f.motoNullSafe]);
  assert(caseName, 'motos.km reste 40000', motoRows[0]?.km === 40000, `motos.km=${motoRows[0]?.km}`);
}

// --- Cas 4 : counter-replacement-bypass -------------------------------------
// moto avec relevés jusqu'à km=40000. INSERT (km=5, 'remplacement_compteur').
// Assert : ACCEPTÉ (bypass), motos.km devient 5.
// Puis INSERT (km=100,'lecture') → ACCEPTÉ (chaîne fraîche).
// Puis INSERT (km=50,'lecture') → REJETÉ (< 100 post-reset).

async function caseCounterReplacementBypass(client, f) {
  const caseName = 'counter-replacement-bypass';

  const build = await client.query(
    `INSERT INTO releves_km (moto_id, garage_id, km, type_evenement, acteur_type, acteur_id)
     VALUES ($1, $2, 40000, 'lecture', 'garage', $2) RETURNING id`,
    [f.motoBypass, f.garageId]
  );
  assert(caseName, 'précondition : relevé à 40000 accepté', build.rows.length === 1, `rows=${build.rows.length}`);

  const resetInsert = await client.query(
    `INSERT INTO releves_km (moto_id, garage_id, km, type_evenement, acteur_type, acteur_id)
     VALUES ($1, $2, 5, 'remplacement_compteur', 'garage', $2) RETURNING id`,
    [f.motoBypass, f.garageId]
  );
  assert(caseName, 'remplacement_compteur (km=5) accepté (bypass)', resetInsert.rows.length === 1, `rows=${resetInsert.rows.length}`);

  const { rows: afterReset } = await client.query('SELECT km FROM motos WHERE id = $1', [f.motoBypass]);
  assert(caseName, 'motos.km devient 5 après remplacement', afterReset[0]?.km === 5, `motos.km=${afterReset[0]?.km}`);

  const freshChain = await client.query(
    `INSERT INTO releves_km (moto_id, garage_id, km, type_evenement, acteur_type, acteur_id)
     VALUES ($1, $2, 100, 'lecture', 'garage', $2) RETURNING id`,
    [f.motoBypass, f.garageId]
  );
  assert(caseName, 'lecture km=100 post-reset acceptée (chaîne fraîche)', freshChain.rows.length === 1, `rows=${freshChain.rows.length}`);

  const rejectedPostReset = await client.query(
    `INSERT INTO releves_km (moto_id, garage_id, km, type_evenement, acteur_type, acteur_id)
     VALUES ($1, $2, 50, 'lecture', 'garage', $2) RETURNING id`,
    [f.motoBypass, f.garageId]
  );
  assert(caseName, 'lecture km=50 post-reset rejetée (< 100 chaîne fraîche)', rejectedPostReset.rows.length === 0, `rows=${rejectedPostReset.rows.length}`);
}

// --- Cas 5 : conso-check-violation ------------------------------------------
// INSERT consommables (type_consommable='invalide') → assert erreur Postgres 23514.
// Puis INSERT chacun des 9 types valides → assert succès.

async function caseConsoCheckViolation(client, f) {
  const caseName = 'conso-check-violation';

  let violationCaught = false;
  let violationCode = null;
  try {
    await client.query(
      "INSERT INTO consommables (moto_id, type_consommable) VALUES ($1, 'invalide')",
      [f.motoConso]
    );
  } catch (err) {
    violationCaught = true;
    violationCode = err.code;
  }
  assert(caseName, 'type_consommable invalide rejeté (23514 check_violation)', violationCaught && violationCode === '23514', `code=${violationCode}`);

  for (const type of NEUF_TYPES_CONSOMMABLES) {
    let inserted = false;
    try {
      const { rows } = await client.query(
        'INSERT INTO consommables (moto_id, type_consommable) VALUES ($1, $2) RETURNING id',
        [f.motoConso, type]
      );
      inserted = rows.length === 1;
    } catch (err) {
      inserted = false;
    }
    assert(caseName, `type_consommable='${type}' accepté`, inserted);
  }
}

main().catch((err) => {
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
