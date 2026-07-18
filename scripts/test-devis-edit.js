// Phase 29 (v1.7), plan 29-01. Vérifie la bascule création/édition du formulaire
// devis dans app.html (bouton Modifier, pré-remplissage, verrouillage moto, routage
// PUT/POST dans saveDevis()). Aucun changement backend dans ce plan — PUT /devis/:id
// et SBLayer.Devis.update() sont déjà fonctionnels et hors scope.
/**
 * scripts/test-devis-edit.js
 *
 * Une seule famille de cas — --case=structure — analyse statique de app.html
 * (aucune connexion DB, aucun serveur requis).
 *
 * Usage :
 *   node scripts/test-devis-edit.js
 *   node scripts/test-devis-edit.js --case=structure
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

// --- Cas structure : analyse statique de app.html (aucune DB) --------------

function caseStructure() {
  const caseName = 'structure';
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.html'), 'utf8');

  assert(caseName, 'devisListCache déclaré', /let devisListCache\s*=\s*\[\]/.test(src));
  assert(caseName, 'devisEditId déclaré (null = mode création)', /let devisEditId\s*=\s*null/.test(src));

  assert(caseName, 'function renderDevisFormCard( présent', /function renderDevisFormCard\(/.test(src));
  assert(caseName, 'function startEditDevis( présent', /function startEditDevis\(/.test(src));
  assert(caseName, 'function cancelEditDevis( présent', /function cancelEditDevis\(/.test(src));

  assert(
    caseName,
    "loadDevis() insère #devisFormZone rendu par renderDevisFormCard()",
    /id="devisFormZone">\$\{renderDevisFormCard\(\)\}/.test(src)
  );
  assert(
    caseName,
    "loadDevis() réinitialise devisListCache puis devisEditId=null au rechargement",
    /devisListCache\s*=\s*liste;[\s\S]{0,40}devisEditId\s*=\s*null;/.test(src)
  );

  assert(
    caseName,
    'bouton Modifier + Envoyer dans la même branche brouillon',
    /statut===['"]brouillon['"][\s\S]{0,200}startEditDevis\('\$\{d\.id\}'\)[\s\S]{0,200}envoyerDevis\('\$\{d\.id\}'\)/.test(src)
  );

  assert(
    caseName,
    'moto affichée en lecture seule (disabled) en mode édition',
    /value="\$\{motoLabel\}" disabled/.test(src)
  );
  assert(
    caseName,
    'remise pré-remplie depuis le devis existant en édition',
    /remiseVal/.test(src) && /id="dRemise"[^>]*value="\$\{remiseVal\}"/.test(src)
  );

  // Isoler le corps de saveDevis() avant de tester ses branches.
  const saveDevisMatch = src.match(/async function saveDevis\(\)\s*\{[\s\S]*?\n\}/);
  const saveDevisBlock = saveDevisMatch ? saveDevisMatch[0] : '';
  assert(caseName, 'saveDevis() trouvé', !!saveDevisMatch, 'fonction saveDevis introuvable');
  assert(caseName, 'branche édition : if (devisEditId)', /if\s*\(devisEditId\)/.test(saveDevisBlock));
  assert(
    caseName,
    "édition appelle PUT /devis/:id avec entete.remise_pct + lignes (pas moto_id)",
    /api\('\/devis\/'\+devisEditId,\s*'PUT',\s*\{\s*entete:\s*\{\s*remise_pct\s*\}\s*,\s*lignes\s*\}\)/.test(saveDevisBlock)
  );
  assert(
    caseName,
    'création (hors édition) toujours en POST /devis',
    /api\('\/devis',\s*'POST'/.test(saveDevisBlock)
  );

  assert(
    caseName,
    'cancelEditDevis() remet devisEditId à null',
    /function cancelEditDevis\(\)\s*\{[\s\S]*?devisEditId\s*=\s*null/.test(src)
  );
}

async function main() {
  if (shouldRun('structure')) caseStructure();

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
