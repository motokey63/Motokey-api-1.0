// scripts/test-profil-transmission.js
// Deux volets : (1) assertions pures sur matchProfilTransmission() — aucune DB
// requise ; (2) assertions pg-direct sur les contraintes CHECK posées par la
// migration 29, style établi par scripts/test-releves-km-trigger.js.
//
// Usage :
//   node scripts/test-profil-transmission.js            (les deux volets)
//   node scripts/test-profil-transmission.js --pure-only (volet 1 uniquement, pas de DB requise)

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

let OK = 0;
let KO = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  PASS — ${label}`);
    OK++;
  } else {
    console.log(`  FAIL — ${label}${detail ? ' — ' + detail : ''}`);
    KO++;
  }
}

function runPureTests() {
  const { matchProfilTransmission } = require('../services/profilTransmission');

  const mappings = [
    { marque: 'Yamaha', modele_pattern: 'T-MAX%', profil_transmission: 'courroie' },
    { marque: 'BMW', modele_pattern: 'R 1%', profil_transmission: 'cardan' },
    { marque: 'Moto Guzzi', modele_pattern: '%', profil_transmission: 'cardan' },
  ];

  assert(
    'Yamaha T-MAX 560 → courroie',
    matchProfilTransmission('Yamaha', 'T-MAX 560', mappings) === 'courroie'
  );
  assert(
    'BMW R 1250 GS → cardan (pattern préfixe)',
    matchProfilTransmission('BMW', 'R 1250 GS', mappings) === 'cardan'
  );
  assert(
    'Moto Guzzi V85 TT → cardan (pattern %)',
    matchProfilTransmission('Moto Guzzi', 'V85 TT', mappings) === 'cardan'
  );
  assert(
    'Yamaha MT-07 → aucun match (null)',
    matchProfilTransmission('Yamaha', 'MT-07', mappings) === null
  );
  assert(
    'marque insensible à la casse (yamaha t-max 530)',
    matchProfilTransmission('yamaha', 't-max 530', mappings) === 'courroie'
  );
  assert(
    'marque/modele manquants → null, jamais d\'exception',
    matchProfilTransmission(null, null, mappings) === null
  );
}

async function runDbTests() {
  const { Client } = require('pg');
  const connectionString = process.env.FRESH_DB_URL;

  if (!connectionString) {
    console.log('  SKIP volet DB — FRESH_DB_URL manquant dans .env');
    return;
  }
  if (connectionString.includes('rzbqbaccjyxvtlnfitrr')) {
    console.error('REFUS : FRESH_DB_URL pointe vers la prod. Utiliser un projet jetable.');
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows: seedRows } = await client.query(
      "SELECT COUNT(*)::int AS n FROM profils_transmission_modeles WHERE marque = 'Yamaha' AND modele_pattern = 'T-MAX%'"
    );
    assert('seed Yamaha T-MAX présent', seedRows[0].n === 1, `n=${seedRows[0].n}`);

    let checkViolationCaught = false;
    try {
      await client.query(
        "INSERT INTO profils_transmission_modeles (marque, modele_pattern, profil_transmission) VALUES ('Test', 'X%', 'invalide')"
      );
    } catch (err) {
      checkViolationCaught = err.code === '23514';
    }
    assert('CHECK profil_transmission (table mapping) rejette une valeur invalide', checkViolationCaught);

    const garageId = require('crypto').randomUUID();
    const motoId = require('crypto').randomUUID();
    await client.query(
      'INSERT INTO garages (id, nom, email) VALUES ($1, $2, $3)',
      [garageId, 'Fixture Garage 29', `fixture-29-${garageId}@test.local`]
    );
    await client.query(
      `INSERT INTO motos (id, garage_id, marque, modele, annee, plaque, vin, proprietaire_type, proprietaire_garage_id)
       VALUES ($1, $2, 'Test', 'Fixture', 2024, 'FIX-29', $3, 'garage', $2)`,
      [motoId, garageId, `VIN-29-${motoId}`]
    );
    const { rows: defaultRows } = await client.query(
      'SELECT profil_transmission, profil_transmission_source FROM motos WHERE id = $1',
      [motoId]
    );
    assert(
      'défaut moto = chaine/auto',
      defaultRows[0].profil_transmission === 'chaine' && defaultRows[0].profil_transmission_source === 'auto',
      JSON.stringify(defaultRows[0])
    );

    let motoCheckViolation = false;
    try {
      await client.query("UPDATE motos SET profil_transmission = 'invalide' WHERE id = $1", [motoId]);
    } catch (err) {
      motoCheckViolation = err.code === '23514';
    }
    assert('CHECK profil_transmission (motos) rejette une valeur invalide', motoCheckViolation);

    await client.query('DELETE FROM motos WHERE id = $1', [motoId]);
    await client.query('DELETE FROM garages WHERE id = $1', [garageId]);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log('Volet 1 — assertions pures (matchProfilTransmission)');
  runPureTests();

  if (!process.argv.includes('--pure-only')) {
    console.log('\nVolet 2 — assertions DB (FRESH_DB_URL)');
    await runDbTests();
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

main().catch((err) => {
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
