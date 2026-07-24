'use strict';
// Tests mock du service historiqueFactureService (L15 socle) — AUCUN appel
// réseau, AUCUN crédit dépensé. Mocke callVision en mutant le module cache
// de anthropicVisionClient AVANT chaque (re)require, même pattern que
// tests/test-etiquette-service-mock.js (L12).
//
// Usage : node tests/test-historique-facture-service-mock.js (pas de serveur requis)

const acv = require('../services/anthropicVisionClient');
const originalCallVision = acv.callVision;

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

function freshAnalyserFactureHistorique() {
  delete require.cache[require.resolve('../services/historiqueFactureService')];
  return require('../services/historiqueFactureService').analyserFactureHistorique;
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Tests mock historiqueFactureService (L15 socle)      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // ── succès : les 6 champs extraits sont renvoyés tels quels ────────────
  {
    acv.callVision = async () => ({ ok: true, data: {
      date_document: '2019-04-12', plaque: 'AB-123-CD', km: 24500,
      nom_garage: 'Garage du Centre', siret: '12345678900012', description_travaux: 'Vidange + filtres'
    }});
    const analyserFactureHistorique = freshAnalyserFactureHistorique();
    const r = await analyserFactureHistorique({ imageUrl: 'https://example.com/facture.jpg' });
    check('succès → ok:true', r.ok === true, JSON.stringify(r));
    check('succès → date_document propagée', r.data.date_document === '2019-04-12', JSON.stringify(r));
    check('succès → plaque propagée', r.data.plaque === 'AB-123-CD', JSON.stringify(r));
    check('succès → km propagé', r.data.km === 24500, JSON.stringify(r));
    check('succès → nom_garage propagé', r.data.nom_garage === 'Garage du Centre', JSON.stringify(r));
    check('succès → siret propagé', r.data.siret === '12345678900012', JSON.stringify(r));
    check('succès → description_travaux propagée', r.data.description_travaux === 'Vidange + filtres', JSON.stringify(r));
  }

  // ── champs illisibles → null, jamais inventés ───────────────────────────
  {
    acv.callVision = async () => ({ ok: true, data: {
      date_document: null, plaque: 'AB-123-CD', km: null, nom_garage: null, siret: null, description_travaux: null
    }});
    const analyserFactureHistorique = freshAnalyserFactureHistorique();
    const r = await analyserFactureHistorique({ imageUrl: 'https://example.com/facture.jpg' });
    check('champ illisible → ok:true quand même', r.ok === true, JSON.stringify(r));
    check('date_document illisible → null (jamais inventée)', r.data.date_document === null, JSON.stringify(r));
    check('km illisible → null (jamais inventé)', r.data.km === null, JSON.stringify(r));
  }

  // ── échec IA (raison quelconque) → {ok:false, raison} propagé tel quel ─
  {
    acv.callVision = async () => ({ ok: false, raison: 'refus' });
    const analyserFactureHistorique = freshAnalyserFactureHistorique();
    const r = await analyserFactureHistorique({ imageUrl: 'https://example.com/facture.jpg' });
    check('échec IA → ok:false', r.ok === false, JSON.stringify(r));
    check('échec IA → raison propagée telle quelle', r.raison === 'refus', JSON.stringify(r));
  }

  // ── échec IA (desactive, le cas réel en dev) ────────────────────────────
  {
    acv.callVision = async () => ({ ok: false, raison: 'desactive' });
    const analyserFactureHistorique = freshAnalyserFactureHistorique();
    const r = await analyserFactureHistorique({ imageUrl: 'https://example.com/facture.jpg' });
    check('VISION_ENABLED=false (mock) → ok:false, raison:desactive', r.ok === false && r.raison === 'desactive', JSON.stringify(r));
  }

  acv.callVision = originalCallVision;

  console.log('\n' + '═'.repeat(60));
  console.log(`${OK} OK / ${KO} KO`);
  console.log('\n⚠️  Rappel : validation sur de vraies factures reste À FAIRE avant de');
  console.log('   considérer cette feature prouvée en prod (même limite que L12 étiquette).');
  process.exit(KO > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('\n❌ Erreur fatale non interceptée :', e.message);
  process.exit(1);
});
