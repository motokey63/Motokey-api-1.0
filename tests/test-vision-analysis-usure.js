'use strict';
// Tests du moteur réel analyzePhoto (L12 Usage B) — AUCUN crédit dépensé.
// Injecte un callVision factice (2e paramètre deps.callVision) pour exercer
// les branches succès/échec sans toucher le réseau.
// IMPORTANT : le gate `if (VISION_ENABLED && visionReady)` est évalué à l'import
// du module, donc ce process doit tourner avec VISION_ENABLED=true et un
// ANTHROPIC_API_KEY non-vide (valeur bidon acceptée — jamais réellement utilisée
// puisque callVision est injecté et ne touche jamais le vrai SDK) :
//
//   VISION_ENABLED=true ANTHROPIC_API_KEY=test-key-not-real node tests/test-vision-analysis-usure.js
//
// Sans ces deux variables, le test ne peut PAS exercer la branche moteur réel
// (visionReady resterait false) — il le signale explicitement en SKIP plutôt
// que de passer silencieusement à côté de la couverture.

const { analyzePhoto, deriveEtat, deriveAnalyseStatus } = require('../services/visionAnalysisService');

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}
function skip(label, reason) { console.log(`  ⏭️  skip: ${label} — ${reason}`); }

const visionReadyForTest = process.env.VISION_ENABLED === 'true' && !!process.env.ANTHROPIC_API_KEY;

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Tests analyzePhoto moteur réel (L12 Usage B)          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  if (!visionReadyForTest) {
    skip('branches moteur réel (succès/échec)', 'lancer avec VISION_ENABLED=true ANTHROPIC_API_KEY=<placeholder>');
  } else {
    // ── succès moteur réel (mocké) ────────────────────────────────────────
    {
      const fakeCallVision = async () => ({ ok: true, data: { pct_usure: 72.4, confiance: 88.0, prescription: 'intervention_pro', prescription_texte: 'Denture de couronne bien entamée, à faire contrôler par un pro sous peu.' } });
      const r = await analyzePhoto({ photoUrl: 'https://example.com/x.jpg', typeConsommable: 'chaine', kmActuel: 20000, kmMontage: 5000 }, { callVision: fakeCallVision });
      check('succès → pct_usure arrondi et clampé [0,100]', r.pct_usure === 72, JSON.stringify(r));
      check('succès → etat dérivé localement via deriveEtat (jamais du modèle)', r.etat === deriveEtat(72), JSON.stringify(r));
      check('succès → confiance arrondie', r.confiance === 88, JSON.stringify(r));
      check('succès → analyse_status dérivé localement via deriveAnalyseStatus', r.analyse_status === deriveAnalyseStatus(88), JSON.stringify(r));
      check('succès → prescription propagée (enum strict)', r.prescription === 'intervention_pro', JSON.stringify(r));
      check("succès → prescription fait partie de l'enum strict des 3 niveaux", ['surveillance', 'intervention_pro', 'urgence_securite'].includes(r.prescription), JSON.stringify(r));
      check('succès → prescription_texte propagé (phrase libre, séparée)', r.prescription_texte === 'Denture de couronne bien entamée, à faire contrôler par un pro sous peu.', JSON.stringify(r));
      check("succès → engine:'anthropic'", r.engine === 'anthropic', JSON.stringify(r));
    }

    // ── clamp des valeurs hors bornes du modèle ────────────────────────────
    {
      const fakeCallVision = async () => ({ ok: true, data: { pct_usure: 137, confiance: -5, prescription: 'urgence_securite', prescription_texte: 'Flanc du pneu hernié, ne pas rouler.' } });
      const r = await analyzePhoto({ photoUrl: 'https://example.com/x.jpg', typeConsommable: 'pneu_av' }, { callVision: fakeCallVision });
      check('pct_usure > 100 → clampé à 100', r.pct_usure === 100, JSON.stringify(r));
      check('confiance < 0 → clampée à 0', r.confiance === 0, JSON.stringify(r));
      check('prescription urgence_securite propagée telle quelle', r.prescription === 'urgence_securite', JSON.stringify(r));
    }

    // ── les 3 niveaux de l'enum sont bien propagés sans transformation ─────
    {
      for (const niveau of ['surveillance', 'intervention_pro', 'urgence_securite']) {
        const fakeCallVision = async () => ({ ok: true, data: { pct_usure: 50, confiance: 70, prescription: niveau, prescription_texte: 'texte de test' } });
        const r = await analyzePhoto({ photoUrl: 'https://example.com/x.jpg', typeConsommable: 'huile_moteur' }, { callVision: fakeCallVision });
        check(`prescription:'${niveau}' propagée sans transformation`, r.prescription === niveau, JSON.stringify(r));
      }
    }

    // ── échec moteur réel → jamais de pct_usure inventé ────────────────────
    {
      const fakeCallVision = async () => ({ ok: false, raison: 'timeout' });
      const r = await analyzePhoto({ photoUrl: 'https://example.com/x.jpg', typeConsommable: 'huile_moteur' }, { callVision: fakeCallVision });
      check('échec → pct_usure:null (jamais inventé)', r.pct_usure === null, JSON.stringify(r));
      check("échec → analyse_status:'echec'", r.analyse_status === 'echec', JSON.stringify(r));
      check('échec → raison propagée', r.raison === 'timeout', JSON.stringify(r));
      check("échec → engine:'anthropic' (le moteur a bien tenté, contrairement au stub)", r.engine === 'anthropic', JSON.stringify(r));
      check('échec → prescription absente (pas de valeur inventée)', r.prescription === undefined, JSON.stringify(r));
    }
  }

  // ── stub toujours fonctionnel si VISION_ENABLED=false (indépendant du gate ci-dessus) ──
  if (process.env.VISION_ENABLED !== 'true') {
    const r = await analyzePhoto({ photoUrl: 'https://example.com/x.jpg', typeConsommable: 'chaine', kmActuel: 10000, kmMontage: 0 });
    check("VISION_ENABLED=false → stub, engine:'stub'", r.engine === 'stub', JSON.stringify(r));
    check('stub → pct_usure toujours un nombre (jamais null)', typeof r.pct_usure === 'number', JSON.stringify(r));
  } else {
    skip('non-régression stub', 'process lancé avec VISION_ENABLED=true — relancer sans cette variable pour couvrir ce cas');
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`${OK} OK / ${KO} KO`);
  process.exit(KO > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('\n❌ Erreur fatale non interceptée :', e.message);
  process.exit(1);
});
