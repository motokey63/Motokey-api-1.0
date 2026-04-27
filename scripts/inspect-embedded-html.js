'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// ── Extraction _EMBEDDED_HTML ─────────────────────────────────────────────

function extractEmbeddedHTML(jsPath) {
  const text = fs.readFileSync(jsPath, 'utf8');

  // Backtick (template literal)
  let m = text.match(/const _EMBEDDED_HTML\s*=\s*`([\s\S]*?)`\s*;/);
  if (m) return { html: m[1], delimiter: 'backtick' };

  // Double-quote (longue ligne avec séquences \n, \", \\)
  m = text.match(/const _EMBEDDED_HTML\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/s);
  if (m) {
    const html = m[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
    return { html, delimiter: 'double-quote' };
  }

  // Single-quote
  m = text.match(/const _EMBEDDED_HTML\s*=\s*'((?:[^'\\]|\\.)*)'\s*;/s);
  if (m) {
    const html = m[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
    return { html, delimiter: 'single-quote' };
  }

  return null;
}

// ── Analyse d'un bloc HTML ────────────────────────────────────────────────

function analyse(html, label) {
  const lines = html.split('\n');

  const apiLines  = lines.filter(l => /const\s+API\b|API_URL\s*=/.test(l)).map(l => l.trim());
  const buildLines = lines.filter(l => /Build\s*:/i.test(l)).map(l => l.trim());
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const fnCount    = lines.filter(l => /^\s*(async\s+)?function\s+\w+/.test(l)).length;
  const hasOR      = lines.some(l => /ordre|renderOR|\/or-/i.test(l));
  const hasLogin   = lines.slice(0, 120).some(l => /loginScreen|loginEmail/i.test(l));

  console.log(`\n${'='.repeat(62)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(62));
  console.log(`  Lignes              : ${lines.length}`);
  console.log(`  Taille HTML         : ${html.length} chars (${(html.length/1024).toFixed(1)} KB)`);
  console.log(`  <title>             : ${titleMatch ? titleMatch[1] : 'ABSENT'}`);
  console.log(`  Build marker        : ${buildLines[0] || 'ABSENT'}`);
  console.log(`  API / const API     : ${apiLines[0] || 'ABSENT'}`);
  console.log(`  Nb fonctions JS     : ${fnCount}`);
  console.log(`  Section OR présente : ${hasOR ? 'OUI' : 'NON'}`);
  console.log(`  Écran login présent : ${hasLogin ? 'OUI' : 'NON'}`);
  console.log(`\n  -- Début HTML (200 chars) --`);
  console.log(`  ${JSON.stringify(html.slice(0, 200))}`);

  return { lines: lines.length, chars: html.length, title: titleMatch?.[1] || '', build: buildLines[0] || '', api: apiLines[0] || '', fnCount, hasOR };
}

// ── Main ──────────────────────────────────────────────────────────────────

const jsPath   = path.join(root, 'motokey-api.js');
const htmlPath = path.join(root, 'app.html');

process.stdout.write('Extraction de _EMBEDDED_HTML depuis motokey-api.js ...\n');
const result = extractEmbeddedHTML(jsPath);
if (!result) {
  process.stderr.write('ERREUR : _EMBEDDED_HTML introuvable\n');
  process.exit(1);
}
console.log(`  → Délimiteur détecté : ${result.delimiter}`);

const appHtml = fs.readFileSync(htmlPath, 'utf8');

const sEmb = analyse(result.html, '_EMBEDDED_HTML  (dans motokey-api.js)');
const sApp = analyse(appHtml,     'app.html         (fichier disque)');

// ── Comparatif ────────────────────────────────────────────────────────────

const dLines = sApp.lines - sEmb.lines;
const dChars = sApp.chars - sEmb.chars;

console.log(`\n${'='.repeat(62)}`);
console.log('  COMPARATIF');
console.log('='.repeat(62));
console.log(`  Lignes     : _EMBEDDED=${sEmb.lines}   app.html=${sApp.lines}   delta=${dLines > 0 ? '+' : ''}${dLines}`);
console.log(`  Chars      : _EMBEDDED=${sEmb.chars}  app.html=${sApp.chars}  delta=${dChars > 0 ? '+' : ''}${dChars}`);
console.log(`  <title>    : _EMBEDDED="${sEmb.title}"   app.html="${sApp.title}"`);
console.log(`  Build      : _EMBEDDED="${sEmb.build}"   app.html="${sApp.build}"`);
console.log(`  API decl.  : _EMBEDDED="${sEmb.api}"   app.html="${sApp.api}"`);
console.log(`  functions  : _EMBEDDED=${sEmb.fnCount}   app.html=${sApp.fnCount}`);
console.log(`  Section OR : _EMBEDDED=${sEmb.hasOR?'OUI':'NON'}   app.html=${sApp.hasOR?'OUI':'NON'}`);

if (Math.abs(dChars) === 0) {
  console.log('\n  ✅ Taille identique — probablement identiques');
} else if (Math.abs(dChars) < 500) {
  console.log(`\n  ⚠️  Différence mineure (${dChars > 0 ? '+' : ''}${dChars} chars) — divergence légère`);
} else {
  const which = dChars > 0 ? 'app.html est PLUS COMPLET que _EMBEDDED_HTML' : '_EMBEDDED_HTML est PLUS COMPLET que app.html';
  console.log(`\n  ❌ Différence significative (${dChars > 0 ? '+' : ''}${dChars} chars) — fichiers DIVERGENTS`);
  console.log(`     ${which}`);
}
