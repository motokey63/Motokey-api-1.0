'use strict';
// Test pur (pas de DB) — templates/emails/or-ligne-attente.js
// Usage : node tests/test-template-or-ligne-attente.js

const tpl = require('../templates/emails/or-ligne-attente');

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

const data = {
  client_nom: 'Sophie Martin',
  moto: 'Yamaha MT-07',
  plaque: 'AB-123-CD',
  or_numero: 'INT-2026-0042',
  lignes: ['Remplacement disque avant', 'Plaquettes de frein avant'],
  lien: 'https://motokey-client.example/',
};

console.log('\n=== Test template email or-ligne-attente ===\n');

const subject = tpl.subject(data);
check('subject est une chaine non vide', typeof subject === 'string' && subject.length > 0, `réel: "${subject}"`);

const html = tpl.html(data);
check('html contient la 1ere ligne', html.includes('Remplacement disque avant'));
check('html contient la 2e ligne', html.includes('Plaquettes de frein avant'));
check('html contient le lien', html.includes(data.lien));
check('html contient le nom du client', html.includes(data.client_nom));
check('html contient le numero OR', html.includes(data.or_numero));

const text = tpl.text(data);
check('text contient la 1ere ligne', text.includes('Remplacement disque avant'));
check('text contient la 2e ligne', text.includes('Plaquettes de frein avant'));
check('text contient le lien', text.includes(data.lien));

console.log(`\n${OK}/${OK + KO} checks passés`);
if (KO > 0) process.exitCode = 1;
