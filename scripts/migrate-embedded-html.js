'use strict';
/**
 * migrate-embedded-html.js
 * Remplace la constante _EMBEDDED_HTML (~82 KB) dans motokey-api.js
 * par une page de maintenance légère (_MAINTENANCE_HTML).
 * Met aussi à jour getAppHTML() : référence + seuil readFileSync.
 *
 * Usage : node scripts/migrate-embedded-html.js
 */

const fs   = require('fs');
const path = require('path');

const root    = path.join(__dirname, '..');
const jsPath  = path.join(root, 'motokey-api.js');
const bakPath = path.join(root, 'motokey-api.js.bak');

// ── Page de maintenance à embarquer ──────────────────────────────────────────
// (backticks échappés, pas de ${...} non protégés)
const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>MotoKey — Maintenance</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;color:#1a1d23;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.box{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px 32px;max-width:440px;text-align:center}
.logo{font-size:28px;font-weight:900;letter-spacing:1px;margin-bottom:24px}
.logo em{color:#ff6b00;font-style:normal}
.icon{font-size:48px;margin-bottom:16px}
h1{font-size:20px;font-weight:700;margin-bottom:12px}
p{font-size:15px;color:#5a6172;line-height:1.6;margin-bottom:16px}
.contact{margin-top:24px;padding-top:24px;border-top:1px solid #e2e5eb;font-size:13px;color:#9ba3b4}
</style>
</head>
<body>
<div class="box">
  <div class="logo">MOTO<em>KEY</em></div>
  <div class="icon">🔧</div>
  <h1>Application en maintenance</h1>
  <p>Le service MotoKey est temporairement indisponible. Nos équipes interviennent pour rétablir l’accès au plus vite.</p>
  <p>Vos données et l’historique de votre moto sont en sécurité.</p>
  <div class="contact">Pour toute urgence, contactez votre garage directement.</div>
</div>
</body>
</html>`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function abort(msg) {
  console.error('\n❌ ABORT:', msg);
  console.error('   Aucun fichier modifié.');
  process.exit(1);
}

/**
 * Localise "const _EMBEDDED_HTML = <délimiteur>…<délimiteur>;"
 * Supporte : double-quote (monoligne), backtick (multiligne).
 * Retourne { start, end, delimiter } où [start, end) est le bloc complet.
 */
function findEmbeddedHTMLDecl(src) {
  const keyword = 'const _EMBEDDED_HTML';
  const kPos = src.indexOf(keyword);
  if (kPos === -1) return null;

  // Sauter jusqu'au '='
  let i = kPos + keyword.length;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '=') return null;
  i++; // sauter '='
  while (i < src.length && /\s/.test(src[i])) i++;

  const delim = src[i];
  if (delim !== '"' && delim !== "'" && delim !== '`') return null;

  i++; // sauter délimiteur ouvrant

  if (delim === '`') {
    // Template literal — chercher le backtick fermant non-échappé
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`')  { i++; break; }
      i++;
    }
  } else {
    // Chaîne simple ou double quote — parcourt séquences d'échappement
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === delim) { i++; break; }
      i++;
    }
  }

  // Chercher le ';' de clôture (avec espaces/newlines optionnels)
  while (i < src.length && /[\s]/.test(src[i])) i++;
  if (src[i] !== ';') return null;
  i++; // inclure ';'

  return { start: kPos, end: i, delimiter: delim };
}

// ── Vérifier présence de backtick dans le HTML à embarquer ───────────────────
if (MAINTENANCE_HTML.includes('`')) {
  abort('MAINTENANCE_HTML contient un backtick non échappé — corriger le contenu avant.');
}

// ── Lecture source ────────────────────────────────────────────────────────────
if (!fs.existsSync(jsPath)) abort(`Fichier introuvable : ${jsPath}`);
const original = fs.readFileSync(jsPath, 'utf8');
console.log(`\n📄 Lecture : ${jsPath}`);
console.log(`   Taille originale : ${original.length} chars (${(original.length/1024).toFixed(1)} KB)`);

// ── Localisation de _EMBEDDED_HTML ───────────────────────────────────────────
const found = findEmbeddedHTMLDecl(original);
if (!found) abort('const _EMBEDDED_HTML introuvable dans motokey-api.js.');

// Vérification unicité — s'assurer qu'il n'y a pas d'autre occurrence du keyword
const countOccurrences = (original.match(/const _EMBEDDED_HTML/g) || []).length;
if (countOccurrences !== 1) abort(`${countOccurrences} occurrences de "const _EMBEDDED_HTML" trouvées — ambiguïté.`);

const oldDecl  = original.slice(found.start, found.end);
const newDecl  = 'const _MAINTENANCE_HTML = `' + MAINTENANCE_HTML + '`;';

console.log(`\n🔍 Bloc trouvé :`);
console.log(`   Position        : chars ${found.start}–${found.end}`);
console.log(`   Délimiteur      : ${found.delimiter === '"' ? 'double-quote' : found.delimiter === '`' ? 'backtick' : 'single-quote'}`);
console.log(`   Taille ancienne : ${oldDecl.length} chars`);
console.log(`   Taille nouvelle : ${newDecl.length} chars`);
console.log(`   Gain            : ${oldDecl.length - newDecl.length} chars supprimés`);

// ── Construire le contenu modifié ─────────────────────────────────────────────
let modified = original.slice(0, found.start) + newDecl + original.slice(found.end);

// Vérifications post-remplacement
if (modified.includes('const _EMBEDDED_HTML')) {
  abort('La constante _EMBEDDED_HTML est encore présente après remplacement — anomalie.');
}
if (!modified.includes('const _MAINTENANCE_HTML')) {
  abort('_MAINTENANCE_HTML absente du résultat — anomalie.');
}

// ── Mise à jour getAppHTML() : référence + seuil ──────────────────────────────

// 1. return _EMBEDDED_HTML; → return _MAINTENANCE_HTML;
const returnOld = 'return _EMBEDDED_HTML;';
const returnNew = 'return _MAINTENANCE_HTML;';
const returnCount = (modified.match(/return _EMBEDDED_HTML;/g) || []).length;
if (returnCount !== 1) abort(`${returnCount} occurrences de "return _EMBEDDED_HTML;" — attendu 1.`);
modified = modified.replace(returnOld, returnNew);
console.log(`\n✏️  "return _EMBEDDED_HTML;" → "return _MAINTENANCE_HTML;" (${returnCount} occurrence)`);

// 2. Seuil readFileSync : > 10000 → > 1000
const threshOld = 'local.length > 10000';
const threshNew = 'local.length > 1000';
const threshCount = (modified.match(/local\.length > 10000/g) || []).length;
if (threshCount === 0) {
  console.warn('⚠️  Seuil "local.length > 10000" non trouvé — peut-être déjà modifié, ou différent. On continue sans modifier le seuil.');
} else {
  modified = modified.replace(threshOld, threshNew);
  console.log(`✏️  "local.length > 10000" → "local.length > 1000" (${threshCount} occurrence)`);
}

// 3. console.log _EMBEDDED_HTML.length → _MAINTENANCE_HTML.length (si présent)
const logOld = '_EMBEDDED_HTML.length';
const logNew = '_MAINTENANCE_HTML.length';
const logCount = (modified.match(/_EMBEDDED_HTML\.length/g) || []).length;
if (logCount > 0) {
  modified = modified.split(logOld).join(logNew);
  console.log(`✏️  "${logOld}" → "${logNew}" (${logCount} occurrence${logCount > 1 ? 's' : ''})`);
}

// ── Résumé tailles ────────────────────────────────────────────────────────────
console.log(`\n📊 Résumé :`);
console.log(`   Taille avant : ${original.length} chars (${(original.length/1024).toFixed(1)} KB)`);
console.log(`   Taille après : ${modified.length} chars (${(modified.length/1024).toFixed(1)} KB)`);
console.log(`   Différence   : ${modified.length - original.length} chars`);

// ── Sauvegarde + écriture ─────────────────────────────────────────────────────
fs.copyFileSync(jsPath, bakPath);
console.log(`\n💾 Backup écrit : ${bakPath}`);

fs.writeFileSync(jsPath, modified, 'utf8');
console.log(`✅ motokey-api.js mis à jour.`);
console.log('\nVérifiez avec : git diff motokey-api.js');
