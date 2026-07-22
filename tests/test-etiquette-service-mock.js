'use strict';
// Tests mock du service etiquettePieceService (L12 Usage A) — AUCUN appel
// réseau, AUCUN crédit dépensé. Mocke callVision en mutant le module cache
// de anthropicVisionClient AVANT chaque (re)require d'etiquettePieceService —
// pas de framework de mock, cohérent avec la convention pure Node du repo.
//
// Contexte : point de contrôle réel (2-3 vraies étiquettes) reporté — Mehdi
// n'a pas de pièce à scanner sous la main au moment de cette session. Ce
// fichier couvre ce que le mock permet de prouver ; la validation sur de
// vraies photos reste À FAIRE avant de considérer la feature prouvée en prod.
//
// Usage : node tests/test-etiquette-service-mock.js (pas de serveur requis)

const acv = require('../services/anthropicVisionClient');
const originalCallVision = acv.callVision;

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

function freshAnalyserEtiquette() {
  delete require.cache[require.resolve('../services/etiquettePieceService')];
  return require('../services/etiquettePieceService').analyserEtiquette;
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Tests mock etiquettePieceService (L12 Usage A)        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // ── succès : les 4 champs extraits sont renvoyés tels quels ────────────
  {
    acv.callVision = async () => ({ ok: true, data: { libelle: 'Plaquettes de frein avant', reference: 'FA123', marque: 'Brembo', ean: '3661104012345' } });
    const analyserEtiquette = freshAnalyserEtiquette();
    const r = await analyserEtiquette({ imageUrl: 'https://example.com/x.jpg' });
    check('succès → ok:true', r.ok === true, JSON.stringify(r));
    check('succès → libelle propagé', r.data.libelle === 'Plaquettes de frein avant', JSON.stringify(r));
    check('succès → reference propagée', r.data.reference === 'FA123', JSON.stringify(r));
    check('succès → marque propagée', r.data.marque === 'Brembo', JSON.stringify(r));
    check('succès → ean propagé', r.data.ean === '3661104012345', JSON.stringify(r));
  }

  // ── champs illisibles → null, jamais inventé ───────────────────────────
  {
    acv.callVision = async () => ({ ok: true, data: { libelle: 'Filtre à huile', reference: null, marque: null, ean: null } });
    const analyserEtiquette = freshAnalyserEtiquette();
    const r = await analyserEtiquette({ imageUrl: 'https://example.com/x.jpg' });
    check('champ illisible → ok:true quand même (libelle seul suffit)', r.ok === true, JSON.stringify(r));
    check('champ illisible → reference:null (jamais inventée)', r.data.reference === null, JSON.stringify(r));
    check('champ illisible → marque:null (jamais inventée)', r.data.marque === null, JSON.stringify(r));
    check('champ illisible → ean:null (jamais inventé)', r.data.ean === null, JSON.stringify(r));
  }

  // ── échec IA (raison quelconque) → {ok:false, raison} propagé tel quel ─
  {
    acv.callVision = async () => ({ ok: false, raison: 'refus' });
    const analyserEtiquette = freshAnalyserEtiquette();
    const r = await analyserEtiquette({ imageUrl: 'https://example.com/x.jpg' });
    check('échec IA → ok:false', r.ok === false, JSON.stringify(r));
    check('échec IA → raison propagée telle quelle', r.raison === 'refus', JSON.stringify(r));
  }

  // ── échec IA (desactive, le cas réel en dev) ────────────────────────────
  {
    acv.callVision = async () => ({ ok: false, raison: 'desactive' });
    const analyserEtiquette = freshAnalyserEtiquette();
    const r = await analyserEtiquette({ imageUrl: 'https://example.com/x.jpg' });
    check('VISION_ENABLED=false (mock) → ok:false, raison:desactive', r.ok === false && r.raison === 'desactive', JSON.stringify(r));
  }

  acv.callVision = originalCallVision;

  console.log('\n' + '═'.repeat(60));
  console.log(`${OK} OK / ${KO} KO`);
  console.log('\n⚠️  Rappel : validation sur de vraies étiquettes (2-3 photos) reportée —');
  console.log('   à faire avant de considérer cette feature prouvée en prod (voir plan L12, Tâche 2 Step 14).');
  process.exit(KO > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('\n❌ Erreur fatale non interceptée :', e.message);
  process.exit(1);
});
