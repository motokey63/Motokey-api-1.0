'use strict';
// Tests — L11 notif calendaire consommables (service + endpoint + overrides PATCH)
// Usage : node tests/test-consommable-echeance-cron.js
// [UNIT] ne nécessite aucun serveur — fonctions pures uniquement.
// [CRON]/[PATCH-OVERRIDE] (ajoutées Tâches 4/6) nécessitent `node motokey-api.js`
// démarré localement + CRON_SECRET dans l'environnement (SKIP propre sinon).

const {
  calculerPalier, isPalier90Atteint, axeCalendaire
} = require('../services/consommableEcheanceService');

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}
function skip(label, reason) {
  console.log(`  ⏭️  skip: ${label} — ${reason}`);
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Tests notif calendaire consommables (L11)            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // ─── [UNIT] calcul palier 90% (section 2.3) ─────────────────────────────
  console.log('\n── [UNIT] calcul palier 90% (section 2.3) ───────────────────────');

  const AUJOURDHUI = new Date('2026-07-20');

  // 1. liquide_frein — temps seul : le km, même très dépassé, est ignoré.
  {
    const conso = { type_consommable: 'liquide_frein', km_montage: 0, date_montage: '2026-06-20' };
    const pct = calculerPalier(conso, 999999, AUJOURDHUI); // km énorme si l'axe km comptait
    check('liquide_frein : axe km ignoré (pct proche de 8.33%, pas ~100%)', pct != null && Math.abs(pct - 100 / 12) < 0.01, `pct=${pct}`);
    check('liquide_frein : isPalier90Atteint === false', isPalier90Atteint(conso, 999999, AUJOURDHUI) === false);
    check("axeCalendaire('liquide_frein') === 'mois'", axeCalendaire('liquide_frein') === 'mois');
  }

  // 2. huile_moteur — km arrive avant le temps (seuil km=5000, mois=6)
  {
    const conso = { type_consommable: 'huile_moteur', km_montage: 0, date_montage: '2026-06-20' }; // 1 mois, pct_mois≈16.7%
    const motoKm = 4750; // pct_km = 95%
    const pct = calculerPalier(conso, motoKm, AUJOURDHUI);
    check('huile_moteur km-avant-temps : pct ≈ 95 (piloté par km)', pct != null && Math.abs(pct - 95) < 0.01, `pct=${pct}`);
    check('huile_moteur km-avant-temps : isPalier90Atteint === true', isPalier90Atteint(conso, motoKm, AUJOURDHUI) === true);
  }

  // 3. huile_moteur — le temps arrive avant le km (seuil km=5000, mois=6)
  {
    const conso = { type_consommable: 'huile_moteur', km_montage: 0, date_montage: '2026-01-20' }; // 6 mois pile, pct_mois=100%
    const motoKm = 500; // pct_km = 10%
    const pct = calculerPalier(conso, motoKm, AUJOURDHUI);
    check('huile_moteur temps-avant-km : pct ≈ 100 (piloté par mois)', pct != null && Math.abs(pct - 100) < 0.01, `pct=${pct}`);
    check('huile_moteur temps-avant-km : isPalier90Atteint === true', isPalier90Atteint(conso, motoKm, AUJOURDHUI) === true);
  }

  // 4. override change le seuil (COALESCE(override, défaut))
  {
    const sansOverride = { type_consommable: 'huile_moteur', km_montage: 0, date_montage: '2026-07-01' };
    const avecOverride  = { ...sansOverride, seuil_km_override: 1000 };
    const motoKm = 950; // pct défaut (5000) = 19% ; pct override (1000) = 95%
    const pctDefaut = calculerPalier(sansOverride, motoKm, AUJOURDHUI);
    const pctOverride = calculerPalier(avecOverride, motoKm, AUJOURDHUI);
    check('sans override : pct ≈ 19 (< 90)', pctDefaut != null && Math.abs(pctDefaut - 19) < 0.01, `pct=${pctDefaut}`);
    check('avec seuil_km_override=1000 : pct ≈ 95 (>= 90)', pctOverride != null && Math.abs(pctOverride - 95) < 0.01, `pct=${pctOverride}`);
    check('isPalier90Atteint bascule true uniquement avec override', isPalier90Atteint(sansOverride, motoKm, AUJOURDHUI) === false && isPalier90Atteint(avecOverride, motoKm, AUJOURDHUI) === true);
  }

  // 5. défensif — type inconnu / aucune référence (D-08, jamais d'exception)
  {
    check('type inconnu → null', calculerPalier({ type_consommable: 'inconnu', km_montage: 0 }, 99999, AUJOURDHUI) === null);
    check('aucune référence exploitable → null', calculerPalier({ type_consommable: 'chaine', km_montage: null, date_montage: null }, 99999, AUJOURDHUI) === null);
  }

  // 6. hors allowlist (décision produit) — un type non couvert par ce cron (ex. plaquettes_av)
  // ne doit JAMAIS déclencher de palier, même avec une référence extrêmement ancienne.
  {
    const conso = { type_consommable: 'plaquettes_av', km_montage: 0, date_montage: '2020-01-01' };
    check("axeCalendaire('plaquettes_av') === null (hors allowlist)", axeCalendaire('plaquettes_av') === null);
    check('plaquettes_av hors allowlist : calculerPalier === null malgré référence très ancienne', calculerPalier(conso, 999999, AUJOURDHUI) === null, `pct=${calculerPalier(conso, 999999, AUJOURDHUI)}`);
    check('plaquettes_av hors allowlist : isPalier90Atteint === false', isPalier90Atteint(conso, 999999, AUJOURDHUI) === false);
  }

  console.log(`\nRESULTAT: ${OK} OK / ${KO} KO`);
  process.exit(KO === 0 ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
