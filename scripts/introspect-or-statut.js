// Script d'introspection phase-scoped (Phase 30, MIGR-02). Requete live des
// valeurs REELLES de l'enum Postgres `or_statut` (et `or_tache_statut` en
// side-finding) via l'endpoint PostgREST OpenAPI existant — meme pattern que
// scripts/introspect-schema.js (Phase 19), aucun nouveau credential.
// Ne PAS modifier introspect-schema.js — ce script est volontairement
// separe, single-purpose, et ne sera plus utile une fois la Phase 31 close.
//
// Usage : node scripts/introspect-or-statut.js
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Les 7 statuts CIBLES du cycle unifie v1.8 (REQUIREMENTS MIGR-02).
const TARGET_STATUSES = ['brouillon', 'envoye', 'accepte', 'en_cours', 'termine', 'facture', 'refuse'];

/**
 * Interroge le endpoint PostgREST OpenAPI et retourne le spec.definitions brut.
 * Ne JAMAIS logger la cle — uniquement le host (new URL(url).host).
 */
async function fetchOpenApiSpec(url, key) {
  let host = '(url illisible)';
  try {
    host = new URL(url).host;
  } catch (_) {
    // host reste au fallback ci-dessus
  }
  console.log(`  -> requete PostgREST OpenAPI sur host : ${host}`);

  const res = await fetch(url + '/rest/v1/?apikey=' + key, {
    headers: { Authorization: 'Bearer ' + key }
  });

  if (!res.ok) {
    throw new Error(`PostgREST OpenAPI request failed: HTTP ${res.status} ${res.statusText}`);
  }

  const spec = await res.json();
  return spec.definitions || {};
}

/**
 * Imprime le diff PRESENT/MANQUANT vs les 7 cibles, et les valeurs live
 * HORS-CIBLE (presentes en live mais absentes des 7 cibles).
 */
function printTargetDiff(liveValues) {
  const liveSet = new Set(liveValues || []);
  const targetSet = new Set(TARGET_STATUSES);

  console.log('\n  Comparaison vs les 7 statuts cibles (' + TARGET_STATUSES.join(', ') + ') :');
  for (const target of TARGET_STATUSES) {
    const present = liveSet.has(target);
    console.log(`    [${present ? 'PRESENT' : 'MANQUANT'}] ${target}`);
  }

  const horsCible = (liveValues || []).filter((v) => !targetSet.has(v));
  if (horsCible.length > 0) {
    console.log('\n  Valeurs live HORS-CIBLE (sans equivalent 1:1 parmi les 7 cibles) :');
    for (const v of horsCible) {
      console.log(`    [HORS-CIBLE] ${v}`);
    }
  } else {
    console.log('\n  Aucune valeur live hors-cible.');
  }
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error('ERREUR : SUPABASE_URL et SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) requis dans .env');
    process.exitCode = 1;
    return;
  }

  console.log('\n=== Introspection live or_statut / or_tache_statut (Phase 30, MIGR-02) ===\n');

  const defs = await fetchOpenApiSpec(url, key);

  // --- or_statut (ordres_reparation.statut) ---
  const orDef = defs.ordres_reparation;
  if (!orDef || !orDef.properties || !orDef.properties.statut) {
    console.error('  definition ordres_reparation introuvable dans le spec OpenAPI (ou colonne statut absente) — impossible de lire or_statut.');
    process.exitCode = 1;
    return;
  }

  // Chemin exact dans le spec OpenAPI : definitions.ordres_reparation.properties.statut.enum
  const statutProp = orDef.properties.statut;
  const orStatutValues = Array.isArray(statutProp.enum) ? statutProp.enum : [];
  console.log('or_statut live values:', JSON.stringify(orStatutValues));
  console.log('format:', statutProp.format || '(non fourni)');

  printTargetDiff(orStatutValues);

  // --- or_tache_statut (or_taches.statut) — side-finding, non bloquant ---
  const orTachesDef = defs.or_taches;
  if (!orTachesDef || !orTachesDef.properties || !orTachesDef.properties.statut) {
    console.log('\n  definition or_taches introuvable dans le spec OpenAPI (ou colonne statut absente) — or_tache_statut non audite (side-finding non bloquant).');
  } else {
    const tacheStatutProp = orTachesDef.properties.statut;
    const orTacheStatutValues = Array.isArray(tacheStatutProp.enum) ? tacheStatutProp.enum : [];
    console.log('\nor_tache_statut live values:', JSON.stringify(orTacheStatutValues));
    console.log('format:', tacheStatutProp.format || '(non fourni)');
  }

  // Assertion de sortie : le code (_OR_TRANS / _OR_TRANS_RAM) prouve deja
  // 7 valeurs ecrites en prod. Si le spec en renvoie moins, c'est un indice
  // de cache PostgREST perime (Pitfall 1 de la recherche 30-RESEARCH.md).
  console.log('');
  if (orStatutValues.length >= 7) {
    console.log(`RESULT: OK — ${orStatutValues.length} valeurs live trouvees pour or_statut (>= 7 attendues par le code).\n`);
    process.exitCode = 0;
  } else {
    console.log(`RESULT: ATTENTION — seulement ${orStatutValues.length} valeurs live trouvees pour or_statut, alors que le code (_OR_TRANS/_OR_TRANS_RAM) prouve au moins 7 valeurs ecrites en prod.`);
    console.log('Indice possible : cache PostgREST perime. Essayer NOTIFY pgrst, \'reload schema\'; cote Dashboard, ou cross-checker via pg_enum.\n');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
