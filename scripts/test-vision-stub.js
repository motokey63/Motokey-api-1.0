// Wave 0 test harness (Phase 24, plan 24-01). Mirrors scripts/test-releves-km-trigger.js's
// PASS/FAIL/assert()/--case= style, but exercises services/visionAnalysisService.js — a PURE
// function module, zéro DB, zéro HTTP. C'est la spécification exécutable du contrat verrouillé
// (VISION-01/VISION-02) consommé identiquement par les futurs endpoints/jauges (Phase 25/27/28).
/**
 * scripts/test-vision-stub.js
 *
 * Script Node autonome (convention établie du repo, voir 24-VALIDATION.md
 * "Test Infrastructure" — aucun framework, style hand-rolled PASS/FAIL) qui prouve le
 * contrat de `services/visionAnalysisService.js` :
 *   - forme fixe du retour de `analyzePhoto()` (D-01, clés snake_case ASCII verrouillées)
 *   - dérivations pures `deriveEtat()` (D-02) et `deriveAnalyseStatus()` (D-03)
 *   - déterminisme par input (même photoUrl/consommableId → même résultat, D-04)
 *   - `analyse_status` n'est JAMAIS 'echec' depuis le stub (D-05)
 *   - fallback silencieux + warning si VISION_ENABLED=true sans ANTHROPIC_API_KEY (D-06)
 *   - appelable en isolation totale, sans serveur HTTP ni DB (success criterion #3)
 *
 * Écrit AVANT que services/visionAnalysisService.js n'existe (Task 1 du plan 24-01) —
 * à ce stade seul `node --check scripts/test-vision-stub.js` est attendu vert ; le run
 * complet échouera (module manquant) jusqu'à la Task 2. C'est le comportement attendu.
 *
 * Cas couverts (voir 24-VALIDATION.md) :
 *   contract-shape                 — forme exacte de l'objet retourné par analyzePhoto()
 *   deterministic-seed             — même input → même sortie ; input différent → variation possible
 *   derivation-thresholds          — table de vérité deriveEtat()/deriveAnalyseStatus()
 *   never-echec                    — 200 seeds distincts, jamais 'echec', au moins un 'incertain'
 *   inconsistent-config-fallback   — VISION_ENABLED=true sans ANTHROPIC_API_KEY = fallback + warning, pas de crash
 *   isolated-call                  — un seul appel direct, sans HTTP ni DB, params optionnels absents
 *
 * PASS <case> / FAIL <case> imprimés par assertion, style OK/KO de test-releves-km-trigger.js.
 * Exit code 1 si au moins un FAIL.
 *
 * Usage :
 *   node scripts/test-vision-stub.js
 *   node scripts/test-vision-stub.js --case=contract-shape
 */

'use strict';

const { spawnSync } = require('child_process');
const { analyzePhoto, deriveEtat, deriveAnalyseStatus } = require('../services/visionAnalysisService');

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

function isIntInRange(n, min, max) {
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
}

// --- Cas 1 : contract-shape --------------------------------------------------
// Un appel avec tous les champs présents. Vérifie types, enums, et le jeu EXACT
// de clés retournées (D-01, snake_case ASCII verrouillé).

async function caseContractShape() {
  const caseName = 'contract-shape';

  const r = await analyzePhoto({
    photoUrl: 'https://fake/x.jpg',
    consommableId: 'c-1',
    typeConsommable: 'chaine',
    kmActuel: 20000,
    kmMontage: 5000,
  });

  assert(caseName, 'pct_usure est un entier 0-100', isIntInRange(r.pct_usure, 0, 100), `pct_usure=${r.pct_usure}`);
  assert(caseName, "etat est l'une des 4 valeurs autorisées",
    ['bon', 'moyen', 'usé', 'critique'].includes(r.etat), `etat=${r.etat}`);
  assert(caseName, 'confiance est un entier 0-100', isIntInRange(r.confiance, 0, 100), `confiance=${r.confiance}`);
  assert(caseName, "analyse_status vaut 'ok' ou 'incertain'",
    ['ok', 'incertain'].includes(r.analyse_status), `analyse_status=${r.analyse_status}`);
  assert(caseName, "analyse_status n'est jamais 'echec' (D-05)", r.analyse_status !== 'echec', `analyse_status=${r.analyse_status}`);
  assert(caseName, "engine vaut 'stub'", r.engine === 'stub', `engine=${r.engine}`);

  const keys = Object.keys(r);
  const expectedKeys = ['pct_usure', 'etat', 'confiance', 'analyse_status', 'engine'];
  assert(caseName, 'les clés sont exactement celles du contrat verrouillé (snake_case ASCII)',
    keys.length === expectedKeys.length && expectedKeys.every((k) => keys.includes(k)),
    `keys=${JSON.stringify(keys)}`);
}

// --- Cas 2 : deterministic-seed ----------------------------------------------
// Même input deux fois → même sortie strictement (D-04). Input différent (photoUrl
// variée sur un petit lot) → au moins une variation observée (pas figé, pseudo-aléatoire).

async function caseDeterministicSeed() {
  const caseName = 'deterministic-seed';

  const input = {
    photoUrl: 'https://fake/deterministic.jpg',
    consommableId: 'c-9',
    typeConsommable: 'pneu_av',
    kmActuel: 12000,
    kmMontage: 2000,
  };

  const r1 = await analyzePhoto(input);
  const r2 = await analyzePhoto(input);
  assert(caseName, 'même input → même sortie strictement (D-04)',
    JSON.stringify(r1) === JSON.stringify(r2), `r1=${JSON.stringify(r1)} r2=${JSON.stringify(r2)}`);

  const results = [];
  for (let i = 0; i < 5; i++) {
    const r = await analyzePhoto({ ...input, photoUrl: `https://fake/deterministic-${i}.jpg` });
    results.push(r);
  }
  const varies = results.some((r) => r.pct_usure !== results[0].pct_usure || r.confiance !== results[0].confiance);
  assert(caseName, 'un lot de photoUrl distinctes produit au moins une variation (pas figé)', varies);
}

// --- Cas 3 : derivation-thresholds --------------------------------------------
// Table de vérité directe sur les fonctions pures, indépendante du seed.

async function caseDerivationThresholds() {
  const caseName = 'derivation-thresholds';

  const etatTable = [
    [0, 'bon'], [29, 'bon'],
    [30, 'moyen'], [59, 'moyen'],
    [60, 'usé'], [84, 'usé'],
    [85, 'critique'], [100, 'critique'],
  ];
  for (const [pct, expected] of etatTable) {
    const got = deriveEtat(pct);
    assert(caseName, `deriveEtat(${pct}) === '${expected}'`, got === expected, `got=${got}`);
  }

  const statusTable = [
    [0, 'incertain'], [49, 'incertain'],
    [50, 'ok'], [99, 'ok'],
  ];
  for (const [confiance, expected] of statusTable) {
    const got = deriveAnalyseStatus(confiance);
    assert(caseName, `deriveAnalyseStatus(${confiance}) === '${expected}'`, got === expected, `got=${got}`);
  }
}

// --- Cas 4 : never-echec ------------------------------------------------------
// 200 seeds distincts → jamais 'echec' (D-05), et au moins un 'incertain' apparaît
// (prouve que la branche incertain est réellement atteignable, pas juste théorique).

async function caseNeverEchec() {
  const caseName = 'never-echec';

  let sawIncertain = false;
  let sawEchec = false;

  for (let i = 0; i < 200; i++) {
    const r = await analyzePhoto({
      photoUrl: `https://fake/${i}.jpg`,
      consommableId: `c-${i}`,
      typeConsommable: 'chaine',
      kmActuel: 1000 * (i % 37),
      kmMontage: 100 * (i % 11),
    });
    if (r.analyse_status === 'echec') sawEchec = true;
    if (r.analyse_status === 'incertain') sawIncertain = true;
  }

  assert(caseName, "aucun des 200 seeds ne produit 'echec' (D-05)", !sawEchec);
  assert(caseName, "au moins un 'incertain' apparaît sur le lot (branche atteignable)", sawIncertain);
}

// --- Cas 5 : inconsistent-config-fallback -------------------------------------
// VISION_ENABLED=true sans ANTHROPIC_API_KEY → fallback silencieux vers le stub +
// warning loggé (D-06), jamais de crash. Vérifié via un sous-processus Node isolé
// (le flag-gate se décide au chargement du module, un require() dans ce process
// serait déjà figé par un précédent require du même module).

function caseInconsistentConfigFallback() {
  const caseName = 'inconsistent-config-fallback';

  const repoRoot = require('path').join(__dirname, '..');
  const script =
    "const {analyzePhoto}=require('./services/visionAnalysisService.js'); " +
    "analyzePhoto({photoUrl:'https://fake/z.jpg',consommableId:'c',typeConsommable:'chaine',kmActuel:1,kmMontage:0})" +
    ".then(r=>{ if(r.engine!=='stub'){process.exit(2)}; process.exit(0); })" +
    ".catch(()=>{process.exit(3)});";

  const result = spawnSync('node', ['-e', script], {
    env: { ...process.env, VISION_ENABLED: 'true', ANTHROPIC_API_KEY: '' },
    encoding: 'utf8',
    cwd: repoRoot,
  });

  const combined = `${result.stdout || ''}${result.stderr || ''}`;
  assert(caseName, 'sortie contient "VISION_ENABLED=true" (contexte du warning D-06)',
    combined.includes('VISION_ENABLED=true'), `combined=${combined}`);
  assert(caseName, 'sortie contient "fallback" (warning D-06)',
    combined.toLowerCase().includes('fallback'), `combined=${combined}`);
  assert(caseName, 'process exit code 0 (pas de crash, engine reste stub)',
    result.status === 0, `status=${result.status}`);
}

// --- Cas 6 : isolated-call ----------------------------------------------------
// Success criterion #3 : un seul appel direct, sans serveur HTTP ni DB, avec des
// paramètres optionnels absents (km/consommable) — ne doit pas crasher.

async function caseIsolatedCall() {
  const caseName = 'isolated-call';

  const r = await analyzePhoto({ photoUrl: 'https://fake/iso.jpg' });

  assert(caseName, 'appel isolé sans km/consommableId ne crashe pas et renvoie un objet', !!r && typeof r === 'object');
  assert(caseName, 'pct_usure reste un entier 0-100 même avec kmActuel/kmMontage absents',
    isIntInRange(r.pct_usure, 0, 100), `pct_usure=${r.pct_usure}`);
  assert(caseName, "etat reste conforme à l'enum", ['bon', 'moyen', 'usé', 'critique'].includes(r.etat), `etat=${r.etat}`);
  assert(caseName, 'engine reste stub', r.engine === 'stub', `engine=${r.engine}`);
}

async function main() {
  if (shouldRun('contract-shape')) await caseContractShape();
  if (shouldRun('deterministic-seed')) await caseDeterministicSeed();
  if (shouldRun('derivation-thresholds')) await caseDerivationThresholds();
  if (shouldRun('never-echec')) await caseNeverEchec();
  if (shouldRun('inconsistent-config-fallback')) caseInconsistentConfigFallback();
  if (shouldRun('isolated-call')) await caseIsolatedCall();

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
