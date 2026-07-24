'use strict';
// Tests unitaires PURS (aucun mock, aucune I/O) — vérifierCoherenceKm compare
// un candidat d'import au voisin chronologique le plus proche (avant ET après),
// pas au max global. Voir amendement (b) du cadrage L15.
// Usage : node tests/test-km-coherence-historique-unit.js

const { verifierCoherenceKm } = require('../services/kmCoherenceHistorique');

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║  MotoKey — Tests unitaires vérifierCoherenceKm (L15 socle)      ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// ── aucun historique existant → toujours valide ─────────────────────────
{
  const r = verifierCoherenceKm({ date_document: '2018-03-01', km_declare: 12000 }, []);
  check('aucun historique → valide', r.statut === 'valide' && r.motif === null, JSON.stringify(r));
}

// ── cohérent entre deux voisins (2015 à 6000, 2020 à 7500 → 2018 à 6800 OK) ─
{
  const existantes = [
    { date_intervention: '2015-01-10', km: 6000 },
    { date_intervention: '2020-06-15', km: 7500 },
  ];
  const r = verifierCoherenceKm({ date_document: '2018-03-01', km_declare: 6800 }, existantes);
  check('entre deux voisins, km croissant → valide', r.statut === 'valide', JSON.stringify(r));
}

// ── régression par rapport au voisin AVANT → rejeté ──────────────────────
{
  const existantes = [
    { date_intervention: '2015-01-10', km: 6000 },
    { date_intervention: '2020-06-15', km: 7500 },
  ];
  const r = verifierCoherenceKm({ date_document: '2018-03-01', km_declare: 5000 }, existantes);
  check('km inférieur au voisin avant → rejeté', r.statut === 'rejete', JSON.stringify(r));
  check('motif mentionne le voisin avant', r.motif && r.motif.includes('2015-01-10'), r.motif);
}

// ── dépassement du voisin APRÈS → rejeté ─────────────────────────────────
{
  const existantes = [
    { date_intervention: '2015-01-10', km: 6000 },
    { date_intervention: '2020-06-15', km: 7500 },
  ];
  const r = verifierCoherenceKm({ date_document: '2018-03-01', km_declare: 9000 }, existantes);
  check('km supérieur au voisin après → rejeté', r.statut === 'rejete', JSON.stringify(r));
  check('motif mentionne le voisin après', r.motif && r.motif.includes('2020-06-15'), r.motif);
}

// ── seulement un voisin avant (import le plus récent) → doit être >= lui ─
{
  const existantes = [{ date_intervention: '2015-01-10', km: 6000 }];
  const ok = verifierCoherenceKm({ date_document: '2022-01-01', km_declare: 15000 }, existantes);
  check('seulement voisin avant, km supérieur → valide', ok.statut === 'valide', JSON.stringify(ok));
  const ko = verifierCoherenceKm({ date_document: '2022-01-01', km_declare: 3000 }, existantes);
  check('seulement voisin avant, km inférieur → rejeté', ko.statut === 'rejete', JSON.stringify(ko));
}

// ── seulement un voisin après (import le plus ancien) → doit être <= lui ─
{
  const existantes = [{ date_intervention: '2022-01-01', km: 15000 }];
  const ok = verifierCoherenceKm({ date_document: '2010-01-01', km_declare: 1000 }, existantes);
  check('seulement voisin après, km inférieur → valide', ok.statut === 'valide', JSON.stringify(ok));
  const ko = verifierCoherenceKm({ date_document: '2010-01-01', km_declare: 20000 }, existantes);
  check('seulement voisin après, km supérieur → rejeté', ko.statut === 'rejete', JSON.stringify(ko));
}

// ── km strictement égal au voisin → valide (limite acceptée) ────────────
{
  const existantes = [{ date_intervention: '2015-01-10', km: 6000 }];
  const r = verifierCoherenceKm({ date_document: '2020-01-01', km_declare: 6000 }, existantes);
  check('km égal au voisin avant → valide (limite incluse)', r.statut === 'valide', JSON.stringify(r));
}

console.log('\n' + '═'.repeat(60));
console.log(`${OK} OK / ${KO} KO`);
console.log('═'.repeat(60) + '\n');
process.exit(KO > 0 ? 1 : 0);
