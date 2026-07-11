// One-off schema bootstrap runner (Phase 22). Executes schema.sql against a
// fresh, throwaway Postgres (Supabase project) over a direct node-postgres
// connection — Phase 19's proven method, committed here so this exact
// verification can be cheaply re-run in the future. See
// .planning/phases/22-v-rification-bootstrap-nettoyage-header/22-RESEARCH.md.
/**
 * scripts/bootstrap-fresh-schema.js
 *
 * Reads FRESH_DB_URL from .env (the direct Postgres connection string for a
 * brand-new, disposable Supabase project — placed there by the human-action
 * checkpoint in plan 22-02) and executes the full schema.sql against it in
 * one call via node-postgres's simple query protocol (handles multi-statement
 * SQL natively).
 *
 * NEVER prints FRESH_DB_URL or any raw connection string — only the parsed
 * host, same convention as scripts/introspect-schema.js.
 *
 * The `pg` package is installed `--no-save` (not a runtime dependency of the
 * app — verification tooling only). If node_modules was wiped since, reinstall
 * with: npm install pg --no-save
 *
 * Usage:
 *   node scripts/bootstrap-fresh-schema.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function bootstrap() {
  const connectionString = process.env.FRESH_DB_URL;

  if (!connectionString) {
    console.error('FRESH_DB_URL manquant dans .env — voir plan 22-02 (checkpoint création projet neuf).');
    process.exit(1);
    return;
  }

  if (connectionString.includes('rzbqbaccjyxvtlnfitrr')) {
    console.error('REFUS : FRESH_DB_URL pointe vers la prod. Utiliser un projet neuf jetable.');
    process.exit(1);
    return;
  }

  let host = '(unparseable url)';
  try {
    host = new URL(connectionString).host;
  } catch (_) {
    // ignore — host stays as fallback label
  }
  console.log(`Connexion à ${host}...`);

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    await client.query(sql); // simple query protocol — handles multi-statement SQL in one call
    console.log('SCHEMA_BOOTSTRAP_OK');
  } catch (err) {
    console.error('SCHEMA_BOOTSTRAP_FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

bootstrap().catch((err) => {
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
