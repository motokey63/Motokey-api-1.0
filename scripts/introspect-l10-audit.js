// One-off pre-migration audit helper (Phase 31 / chantier L10 — migration schéma
// devis→ordres_reparation). Uses PostgREST OpenAPI + PostgREST count=exact — pas
// de nouveau credential, meme pattern que introspect-schema.js / introspect-or-statut.js.
/**
 * scripts/introspect-l10-audit.js
 *
 * Lit .env pour SUPABASE_URL / SUPABASE_SECRET_KEY et effectue 2 des 3
 * verifications demandees avant d'ecrire la moindre ligne de SQL pour L10 :
 *
 *   1. COUNT(*) sur devis et ordres_reparation (via PostgREST count=exact,
 *      pas de connexion Postgres directe a la prod).
 *   2. Colonnes exactes de devis / ordres_reparation + detection des tables
 *      de lignes liees (or_taches, or_pieces, or_historique, catalogue_pieces)
 *      via le spec OpenAPI PostgREST (definitions[table].properties).
 *
 * La 3eme verification (SELECT version()) N'EST PAS possible via PostgREST —
 * aucune connexion Postgres directe a la prod n'existe dans ce projet (voir
 * scripts/bootstrap-fresh-schema.js qui REFUSE explicitement tout host prod).
 * Cette requete doit etre executee manuellement par Mehdi au Dashboard SQL
 * Editor, meme convention que le cross-check pg_enum de la Phase 30.
 *
 * Ne JAMAIS logger la cle — seulement le host via new URL(url).host.
 *
 * Usage:
 *   node scripts/introspect-l10-audit.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const TARGET_TABLES = ['devis', 'ordres_reparation'];
const LINE_TABLE_CANDIDATES = ['or_taches', 'or_pieces', 'or_historique', 'catalogue_pieces', 'devis_lignes'];

async function countRows(url, key, table, filterQuery) {
  const qs = filterQuery ? `?select=id&${filterQuery}` : `?select=id`;
  const res = await fetch(`${url}/rest/v1/${table}${qs}`, {
    method: 'HEAD',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      Prefer: 'count=exact'
    }
  });
  if (!res.ok) {
    throw new Error(`COUNT ${table} failed: HTTP ${res.status} ${res.statusText}`);
  }
  const contentRange = res.headers.get('content-range') || '';
  const match = contentRange.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

async function fetchRows(url, key, table, select, limit) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=${limit}`, {
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key
    }
  });
  if (!res.ok) {
    throw new Error(`SELECT ${table} failed: HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchOpenApiSpec(url, key) {
  const res = await fetch(url + '/rest/v1/?apikey=' + key, {
    headers: { Authorization: 'Bearer ' + key }
  });
  if (!res.ok) {
    throw new Error(`PostgREST OpenAPI request failed: HTTP ${res.status} ${res.statusText}`);
  }
  const spec = await res.json();
  return spec.definitions || {};
}

function printColumns(tableName, def) {
  if (!def) {
    console.log(`  [ABSENT] "${tableName}" — non trouvee dans le spec OpenAPI`);
    return;
  }
  const requiredSet = new Set(def.required || []);
  const colNames = Object.keys(def.properties || {}).sort();
  console.log(`  Table: ${tableName} (${colNames.length} colonnes)`);
  for (const col of colNames) {
    const prop = def.properties[col];
    const type = prop.format || prop.type || 'unknown';
    const notNull = requiredSet.has(col) ? 'NOT NULL (no default)' : 'nullable/has-default';
    const enumNote = Array.isArray(prop.enum) ? ` enum=[${prop.enum.join(',')}]` : '';
    const descNote = prop.description ? ` -- ${prop.description}` : '';
    console.log(`    - ${col}: ${type} | ${notNull}${enumNote}${descNote}`);
  }
  console.log('');
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error('ERREUR : SUPABASE_URL et SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) requis dans .env');
    process.exitCode = 1;
    return;
  }

  let host = '(unparseable url)';
  try {
    host = new URL(url).host;
  } catch (_) {
    // ignore
  }
  console.log(`\n=== L10 pre-migration audit — host: ${host} ===\n`);

  console.log('--- 1. COUNT(*) (PostgREST count=exact, pas de SQL direct) ---\n');
  for (const table of TARGET_TABLES) {
    try {
      const count = await countRows(url, key, table);
      console.log(`  ${table}: ${count} ligne(s)`);
    } catch (err) {
      console.log(`  ${table}: ERREUR — ${err.message}`);
    }
  }

  console.log('\n--- 2. Colonnes reelles (spec OpenAPI PostgREST) ---\n');
  const definitions = await fetchOpenApiSpec(url, key);
  for (const table of TARGET_TABLES) {
    printColumns(table, definitions[table]);
  }

  console.log('--- Tables de lignes candidates (detection presence + colonnes) ---\n');
  for (const table of LINE_TABLE_CANDIDATES) {
    const def = definitions[table];
    if (def) {
      printColumns(table, def);
    } else {
      console.log(`  [ABSENT] "${table}" — non trouvee dans le spec OpenAPI (attendu pour devis_lignes, deja supprimee)\n`);
    }
  }

  console.log('--- 3. SELECT version() ---\n');
  console.log('  NON DISPONIBLE via PostgREST OpenAPI (aucune connexion Postgres directe a la prod dans ce projet —');
  console.log('  scripts/bootstrap-fresh-schema.js refuse explicitement tout host prod). A executer manuellement');
  console.log('  par Mehdi au Dashboard Supabase -> SQL Editor : SELECT version();\n');

  console.log('--- 4. devis.or_id : contrainte FK reelle (pg_constraint) ---\n');
  console.log('  NON DISPONIBLE via PostgREST (pg_catalog non expose). A executer manuellement par Mehdi :');
  console.log('    SELECT conname, conrelid::regclass, confrelid::regclass');
  console.log('    FROM pg_constraint WHERE conrelid = \'devis\'::regclass AND contype = \'f\';');
  console.log('  Indice deja disponible (source de verite = code trackee) : sql/migrations/22_devis_undocumented_columns.sql:44');
  console.log('    declare `ALTER TABLE devis ADD COLUMN IF NOT EXISTS or_id UUID;` — SANS clause REFERENCES.');
  console.log('  Coherent avec le spec OpenAPI (aucune note Foreign Key sur devis.or_id, contrairement aux autres FK).');
  console.log('  Hypothese forte : devis.or_id est un UUID libre, PAS de contrainte FK en base. A confirmer par pg_constraint');
  console.log('  (meme prudence que le Gap A colonnes fantomes : une contrainte ajoutee manuellement au Dashboard ne');
  console.log('  laisserait aucune trace git).\n');

  console.log('--- 5. Echantillon devis.lignes (JSONB, 3 lignes de test) ---\n');
  try {
    const sample = await fetchRows(url, key, 'devis', 'id,statut,lignes', 3);
    for (const row of sample) {
      console.log(`  devis ${row.id} (statut=${row.statut}):`);
      console.log('  ' + JSON.stringify(row.lignes, null, 2).split('\n').join('\n  '));
      console.log('');
    }
    if (sample.length === 0) {
      console.log('  (aucune ligne retournee)\n');
    }
  } catch (err) {
    console.log(`  ERREUR — ${err.message}\n`);
  }

  console.log('--- 6. devis : repartition or_id NULL vs NOT NULL ---\n');
  try {
    const sansOr = await countRows(url, key, 'devis', 'or_id=is.null');
    const avecOr = await countRows(url, key, 'devis', 'or_id=not.is.null');
    console.log(`  devis_sans_or (or_id IS NULL)     : ${sansOr}`);
    console.log(`  devis_avec_or (or_id IS NOT NULL) : ${avecOr}\n`);
  } catch (err) {
    console.log(`  ERREUR — ${err.message}\n`);
  }
}

main().catch((err) => {
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
