// One-off schema introspection helper (Phase 19). Uses PostgREST OpenAPI — no psql/CLI/new credentials. See .planning/phases/19-schema-sql-regeneration/19-RESEARCH.md.
/**
 * scripts/introspect-schema.js
 *
 * Introspects a live Supabase project's schema via PostgREST's built-in
 * OpenAPI endpoint (GET {SUPABASE_URL}/rest/v1/?apikey=...). No psql, no
 * Supabase CLI, no new credentials — reuses SUPABASE_URL/SUPABASE_SECRET_KEY
 * already in .env (same pattern as setup-supabase.js / seed scripts).
 *
 * Default mode — introspect prod and assert the narrow-scope objects exist:
 *   node scripts/introspect-schema.js
 *
 * Compare mode — diff a fresh (partially bootstrapped) project against prod,
 * limited to the set of tables schema.sql is expected to create (used by
 * plan 03 to verify the regenerated schema.sql bootstraps correctly):
 *   node scripts/introspect-schema.js --compare <FRESH_URL> <FRESH_KEY>
 *
 * The API key is NEVER printed — only the request host (via URL parsing) is
 * logged for confirmation.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Narrow scope (per 19-01-PLAN.md): baseline tables already in schema.sql
// (devis_lignes intentionally excluded — dropped from prod, replaced by
// devis.lignes JSONB) plus the 3 tables added by tracked migrations 12/16/17.
// Plus les 5 objets Gap B (migrations 13/15) ajoutés à schema.sql en Phase 21 : billing_events, motos_proprietaires_historique, liaisons_client_garage, reclamations_moto, et la vue v_motos_avec_proprietaire.
const EXPECTED_TABLES = [
  'garages',
  'techniciens',
  'clients',
  'motos',
  'interventions',
  'plan_entretien',
  'devis',
  'fraude_verifications',
  'transferts',
  'transfert_steps',
  'garage_users',
  'client_device_tokens',
  'push_send_log',
  'billing_events',
  'motos_proprietaires_historique',
  'liaisons_client_garage',
  'reclamations_moto',
  'v_motos_avec_proprietaire'
];

const NARROW_SCOPE_TABLES = ['garage_users', 'client_device_tokens', 'push_send_log'];
const MOTOS_REQUIRED_COLUMNS = ['last_maintenance_tier_notified', 'last_maintenance_tier_notified_at'];

/**
 * Fetch and parse the PostgREST OpenAPI spec for a given Supabase project.
 * Returns { tables: { <name>: { properties: {...}, required: [...] } } }.
 * Never logs the key — only the resolved host.
 */
async function introspect(url, key) {
  if (!url || !key) {
    throw new Error('Missing url or key for introspection call');
  }
  let host = '(unparseable url)';
  try {
    host = new URL(url).host;
  } catch (_) {
    // ignore — host stays as fallback label
  }
  console.log(`  -> querying PostgREST OpenAPI spec at host: ${host}`);

  const res = await fetch(url + '/rest/v1/?apikey=' + key, {
    headers: { Authorization: 'Bearer ' + key }
  });

  if (!res.ok) {
    throw new Error(`PostgREST OpenAPI request failed: HTTP ${res.status} ${res.statusText}`);
  }

  const spec = await res.json();
  const definitions = spec.definitions || {};
  const tables = {};
  for (const [name, def] of Object.entries(definitions)) {
    tables[name] = {
      properties: def.properties || {},
      required: def.required || []
    };
  }
  return tables;
}

/**
 * Print a human-readable summary of tables/columns for a tables map.
 */
function printTables(tables) {
  const names = Object.keys(tables).sort();
  console.log(`  Found ${names.length} table/view definitions.\n`);
  for (const name of names) {
    const t = tables[name];
    const requiredSet = new Set(t.required);
    console.log(`  Table: ${name}`);
    const colNames = Object.keys(t.properties).sort();
    for (const col of colNames) {
      const prop = t.properties[col];
      const type = prop.format || prop.type || 'unknown';
      const notNull = requiredSet.has(col) ? 'NOT NULL (no default)' : 'nullable/has-default';
      const defaultNote = prop.default !== undefined ? ` default=${JSON.stringify(prop.default)}` : '';
      const enumNote = Array.isArray(prop.enum) ? ` enum=[${prop.enum.join(',')}]` : '';
      const fkNote = prop.description && /fkey|foreign/i.test(prop.description) ? ` (${prop.description})` : '';
      console.log(`    - ${col}: ${type} | ${notNull}${defaultNote}${enumNote}${fkNote}`);
    }
    console.log('');
  }
}

/**
 * Default mode: introspect prod, print everything, assert narrow-scope
 * objects are present. Exit 0 if all present, non-zero otherwise.
 */
async function runDefaultMode() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error('ERREUR : SUPABASE_URL et SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) requis dans .env');
    process.exitCode = 1;
    return;
  }

  console.log('\n=== Schema introspection (PostgREST OpenAPI) — prod ===\n');
  const tables = await introspect(url, key);
  printTables(tables);

  console.log('=== Narrow-scope assertions (Phase 19 / SCHEMA-01) ===\n');
  let allPass = true;

  for (const tableName of NARROW_SCOPE_TABLES) {
    const present = Object.prototype.hasOwnProperty.call(tables, tableName);
    console.log(`  [${present ? 'PASS' : 'FAIL'}] table "${tableName}" present`);
    if (!present) allPass = false;
  }

  const motos = tables.motos;
  if (!motos) {
    console.log('  [FAIL] table "motos" present (required to check maintenance-tier columns)');
    allPass = false;
  } else {
    for (const col of MOTOS_REQUIRED_COLUMNS) {
      const present = Object.prototype.hasOwnProperty.call(motos.properties, col);
      console.log(`  [${present ? 'PASS' : 'FAIL'}] motos.${col} present`);
      if (!present) allPass = false;
    }
  }

  console.log('');
  if (allPass) {
    console.log('RESULT: PASS — all narrow-scope objects confirmed present in prod.\n');
    process.exitCode = 0;
  } else {
    console.log('RESULT: FAIL — one or more narrow-scope objects missing. See FAIL lines above.\n');
    process.exitCode = 1;
  }
}

/**
 * Compare mode: introspect a fresh (possibly partially bootstrapped)
 * project and prod, diff on EXPECTED_TABLES only (the set schema.sql is
 * meant to create). Does NOT flag prod-only tables from the ~19
 * out-of-scope subsystem as diffs — the fresh project is a known-partial
 * bootstrap by design (narrow-scope schema.sql, not full 38-table parity).
 */
async function runCompareMode(freshUrl, freshKey) {
  if (!freshUrl || !freshKey) {
    console.error('ERREUR : --compare requiert <FRESH_URL> <FRESH_KEY>');
    console.error('Usage: node scripts/introspect-schema.js --compare <FRESH_URL> <FRESH_KEY>');
    process.exitCode = 1;
    return;
  }

  const prodUrl = process.env.SUPABASE_URL;
  const prodKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!prodUrl || !prodKey) {
    console.error('ERREUR : SUPABASE_URL et SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) requis dans .env pour la baseline prod');
    process.exitCode = 1;
    return;
  }

  console.log('\n=== Schema compare mode (fresh bootstrap vs. prod, narrow scope only) ===\n');

  console.log('Introspecting prod (baseline)...');
  const prodTables = await introspect(prodUrl, prodKey);

  console.log('Introspecting fresh project...');
  const freshTables = await introspect(freshUrl, freshKey);

  console.log(`\nExpected table set (narrow scope, ${EXPECTED_TABLES.length} tables):`);
  console.log('  ' + EXPECTED_TABLES.join(', ') + '\n');

  let allMatch = true;
  const missingTables = [];
  const missingColumnsByTable = {};

  for (const tableName of EXPECTED_TABLES) {
    const inProd = Object.prototype.hasOwnProperty.call(prodTables, tableName);
    const inFresh = Object.prototype.hasOwnProperty.call(freshTables, tableName);

    if (!inProd) {
      console.log(`  [WARN] "${tableName}" is in the expected set but not found in prod — expected-set may be stale.`);
      continue;
    }

    if (!inFresh) {
      console.log(`  [MISSING] table "${tableName}" not found in fresh project`);
      missingTables.push(tableName);
      allMatch = false;
      continue;
    }

    const prodCols = new Set(Object.keys(prodTables[tableName].properties));
    const freshCols = new Set(Object.keys(freshTables[tableName].properties));
    const missingCols = [...prodCols].filter((c) => !freshCols.has(c));

    if (missingCols.length > 0) {
      console.log(`  [MISSING COLUMNS] "${tableName}": ${missingCols.join(', ')}`);
      missingColumnsByTable[tableName] = missingCols;
      allMatch = false;
    } else {
      console.log(`  [OK] "${tableName}" — all prod columns present in fresh project`);
    }
  }

  console.log('');
  if (allMatch) {
    console.log('RESULT: PASS — fresh project matches prod on the full expected (narrow-scope) table/column set.\n');
    process.exitCode = 0;
  } else {
    console.log('RESULT: FAIL — fresh project is missing tables/columns relative to the expected set. See above.\n');
    process.exitCode = 1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--compare') {
    await runCompareMode(args[1], args[2]);
  } else {
    await runDefaultMode();
  }
}

main().catch((err) => {
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
