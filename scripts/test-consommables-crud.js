// Phase 24 (v1.6), plan 24-02. Verifies the Consommables/PhotosConsommables helpers
// added to supabase.js in the same plan, plus the SQL behavior those helpers depend
// on (upsert-on-conflict, denormalized type_consommable column).
/**
 * scripts/test-consommables-crud.js
 *
 * Deux familles d'assertions, style test-releves-km-trigger.js (PASS/FAIL, --case=,
 * exit 1 si KO) :
 *
 *   --case=structure       — analyse statique de supabase.js (aucune DB). Vérifie la
 *                             FORME des helpers Consommables/PhotosConsommables : présence
 *                             des méthodes, upsert onConflict (pas insert naïf), payload
 *                             PhotosConsommables.insert complet (consommable_id,
 *                             type_consommable, analyse_ia, analyse_status), exports,
 *                             et absence de tout helper de lecture RelevesKm spéculatif.
 *
 *   --case=upsert-behavior — pg-direct contre FRESH_DB_URL (projet Supabase jetable,
 *                             jamais la prod — même garde-fou que
 *                             scripts/test-releves-km-trigger.js). Vérifie le COMPORTEMENT
 *                             SQL dont dépendent les helpers : upsert ON CONFLICT
 *                             (moto_id, type_consommable) met à jour au lieu de dupliquer/
 *                             lever 23505, et photos_consommables persiste bien la colonne
 *                             dénormalisée type_consommable + analyse_ia (JSONB) +
 *                             analyse_status.
 *
 * Décision de vérification (héritée de la décision KM-04/Phase 23, STATE.md) : les
 * helpers supabase.js parlent à la DB via l'API REST Supabase (SUPABASE_URL + service
 * key = PROD). Les exécuter live pointerait sur la prod OU exigerait un 2e credential
 * REST pour le projet jetable. On vérifie donc la FORME du code par analyse statique
 * (--case=structure) et le COMPORTEMENT SQL équivalent via pg-direct contre
 * FRESH_DB_URL, déjà présent dans .env depuis Phase 23 (--case=upsert-behavior).
 *
 * --case=upsert-behavior suppose que le schéma (sql/migrations/23_consommables_km.sql)
 * est déjà bootstrappé sur la DB cible :
 *
 *   node scripts/bootstrap-fresh-schema.js
 *   node scripts/test-consommables-crud.js --case=upsert-behavior
 *
 * NE JAMAIS logger connectionString / process.env.FRESH_DB_URL en clair — seul le
 * host parsé est imprimé, même convention que scripts/test-releves-km-trigger.js.
 *
 * Usage :
 *   node scripts/test-consommables-crud.js
 *   node scripts/test-consommables-crud.js --case=structure
 *   node scripts/test-consommables-crud.js --case=upsert-behavior
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

// --- Cas structure : analyse statique de supabase.js (aucune DB) -----------

function caseStructure() {
  const caseName = 'structure';
  const src = fs.readFileSync(path.join(__dirname, '..', 'supabase.js'), 'utf8');

  assert(caseName, 'const Consommables = { présent', /const Consommables = \{/.test(src));
  assert(caseName, 'Consommables.upsert() présent', /async upsert\(/.test(src));
  assert(caseName, 'Consommables.listByMoto() présent', /async listByMoto\(/.test(src));
  assert(
    caseName,
    "upsert onConflict 'moto_id,type_consommable' présent (pas insert naïf)",
    /onConflict:\s*'moto_id,type_consommable'/.test(src)
  );

  assert(caseName, 'const PhotosConsommables = { présent', /const PhotosConsommables = \{/.test(src));
  assert(caseName, 'PhotosConsommables.insert() présent', /async insert\(/.test(src));
  assert(caseName, 'PhotosConsommables.listByConsommable() présent', /async listByConsommable\(/.test(src));

  // Payload de PhotosConsommables.insert : isole le bloc entre "async insert(" et la
  // fermeture "}," suivante pour vérifier les 4 champs sans dépendre du reste du fichier.
  const insertBlockMatch = src.match(/async insert\(\{[^}]*\}\)\s*\{[\s\S]*?\n  \},/);
  const insertBlock = insertBlockMatch ? insertBlockMatch[0] : '';
  assert(caseName, 'payload insert() référence consommable_id', /consommable_id/.test(insertBlock), 'bloc insert() introuvable ou incomplet');
  assert(caseName, 'payload insert() référence type_consommable', /type_consommable/.test(insertBlock), 'bloc insert() introuvable ou incomplet');
  assert(caseName, 'payload insert() référence analyse_ia', /analyse_ia/.test(insertBlock), 'bloc insert() introuvable ou incomplet');
  assert(caseName, 'payload insert() référence analyse_status', /analyse_status/.test(insertBlock), 'bloc insert() introuvable ou incomplet');

  const exportsMatch = src.match(/module\.exports = \{[\s\S]*?\n\};/);
  const exportsBlock = exportsMatch ? exportsMatch[0] : '';
  assert(caseName, 'module.exports contient Consommables', /\bConsommables,/.test(exportsBlock));
  assert(caseName, 'module.exports contient PhotosConsommables', /\bPhotosConsommables,/.test(exportsBlock));
  assert(caseName, 'module.exports contient RelevesKm', /\bRelevesKm,/.test(exportsBlock));

  assert(
    caseName,
    'aucun helper de lecture RelevesKm spéculatif (list/history/getBy)',
    !/RelevesKm\.(list|history|getBy)/.test(src)
  );
}

// --- Cas upsert-behavior : pg-direct contre FRESH_DB_URL --------------------

async function caseUpsertBehavior() {
  const caseName = 'upsert-behavior';

  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const { Client } = require('pg');
  const crypto = require('crypto');

  const connectionString = process.env.FRESH_DB_URL;

  if (!connectionString) {
    console.error('FRESH_DB_URL manquant dans .env — voir plan 23-02 (checkpoint création projet jetable).');
    KO++;
    return;
  }

  // Garde-fou anti-prod — même style que scripts/test-releves-km-trigger.js.
  if (connectionString.includes('rzbqbaccjyxvtlnfitrr')) {
    console.error('REFUS : FRESH_DB_URL pointe vers la prod. Utiliser un projet jetable.');
    KO++;
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

  const garageId = crypto.randomUUID();
  const motoId = crypto.randomUUID();

  try {
    const { rows: regclassRows } = await client.query("SELECT to_regclass('public.consommables') AS reg");
    if (!regclassRows[0]?.reg) {
      console.error("Table 'consommables' introuvable — lancer d'abord node scripts/bootstrap-fresh-schema.js");
      KO++;
      return;
    }

    await client.query(
      'INSERT INTO garages (id, nom, email) VALUES ($1, $2, $3)',
      [garageId, 'Fixture Garage 24-02', `fixture-24-02-${garageId}@test.local`]
    );

    // Moto fixture garage — CHECK moto_proprietaire_coherence (L8) exige
    // proprietaire_type='garage' + proprietaire_garage_id posé, jamais client_id.
    await client.query(
      `INSERT INTO motos (id, garage_id, marque, modele, annee, plaque, vin, km, proprietaire_type, proprietaire_garage_id)
       VALUES ($1, $2, 'Ducati', 'Monster', 2023, 'FIX-CONSO24', $3, 5000, 'garage', $2)`,
      [motoId, garageId, `VIN-CONSO24-${motoId}`]
    );

    // --- upsert on conflict : une seule ligne, km_montage mis à jour ---
    const first = await client.query(
      `INSERT INTO consommables (moto_id, type_consommable, km_montage) VALUES ($1, 'chaine', 1000) RETURNING id`,
      [motoId]
    );
    assert(caseName, 'insert initial consommable accepté', first.rows.length === 1, `rows=${first.rows.length}`);

    const second = await client.query(
      `INSERT INTO consommables (moto_id, type_consommable, km_montage)
       VALUES ($1, 'chaine', 2000)
       ON CONFLICT (moto_id, type_consommable) DO UPDATE SET km_montage = EXCLUDED.km_montage, updated_at = NOW()
       RETURNING id`,
      [motoId]
    );
    assert(caseName, 're-saisie via ON CONFLICT acceptée (pas de 23505)', second.rows.length === 1, `rows=${second.rows.length}`);

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS n, MAX(km_montage) AS km_montage
       FROM consommables WHERE moto_id = $1 AND type_consommable = 'chaine'`,
      [motoId]
    );
    assert(caseName, 'une seule ligne (moto_id, chaine) après upsert', countRows[0]?.n === 1, `n=${countRows[0]?.n}`);
    assert(caseName, 'km_montage mis à jour à 2000 (upsert, pas duplication)', countRows[0]?.km_montage === 2000, `km_montage=${countRows[0]?.km_montage}`);

    // --- photos_consommables : dénormalisation + contrat vision ---
    const { rows: consoRows } = await client.query(
      `SELECT id FROM consommables WHERE moto_id = $1 AND type_consommable = 'chaine'`,
      [motoId]
    );
    const consommableId = consoRows[0]?.id;

    await client.query(
      `INSERT INTO photos_consommables (moto_id, consommable_id, type_consommable, photo_url, analyse_ia, analyse_status)
       VALUES ($1, $2, 'chaine', 'https://fake/p.jpg', $3::jsonb, 'ok')`,
      [motoId, consommableId, JSON.stringify({ pct_usure: 42, etat: 'moyen', engine: 'stub' })]
    );

    const { rows: photoRows } = await client.query(
      `SELECT type_consommable, analyse_ia, analyse_status FROM photos_consommables
       WHERE moto_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [motoId]
    );
    const photo = photoRows[0];
    assert(caseName, 'type_consommable dénormalisé stocké (chaine)', photo?.type_consommable === 'chaine', `type_consommable=${photo?.type_consommable}`);
    assert(caseName, "analyse_ia->>'engine' = stub", photo?.analyse_ia?.engine === 'stub', `engine=${photo?.analyse_ia?.engine}`);
    assert(caseName, "analyse_status = 'ok'", photo?.analyse_status === 'ok', `analyse_status=${photo?.analyse_status}`);
  } finally {
    try {
      await client.query('DELETE FROM photos_consommables WHERE moto_id = $1', [motoId]);
      await client.query('DELETE FROM consommables WHERE moto_id = $1', [motoId]);
      await client.query('DELETE FROM motos WHERE id = $1', [motoId]);
      await client.query('DELETE FROM garages WHERE id = $1', [garageId]);
    } catch (err) {
      console.error('Avertissement : nettoyage fixtures incomplet —', err.message);
    }
    await client.end();
  }
}

async function main() {
  if (shouldRun('structure')) caseStructure();
  if (shouldRun('upsert-behavior')) await caseUpsertBehavior();

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
