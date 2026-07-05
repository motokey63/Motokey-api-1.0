'use strict';

// Harnais manuel de test pour services/maintenanceAlertService.js (Phase 17 — MPUSH-04).
// Appelle directement runMaintenanceAlertCron() (pas de HTTP hop) et imprime le résultat.
//
// Usage :
//   node scripts/test-maintenance-cron.js
//
// Pré-requis :
//   1. Migration 18 (sql/migrations/18_motos_maintenance_alert_state.sql) appliquée
//      via Supabase Dashboard > SQL Editor
//   2. node scripts/seed-test-maintenance-cron.js exécuté (crée/rafraîchit les motos
//      WARNING/URGENT de test et reset leur last_maintenance_tier_notified)
//
// Invocations utiles :
//   PUSH_ENABLED=false node scripts/test-maintenance-cron.js
//     → envoi en mode dev (console.log uniquement), pas de vrai push Expo
//   node scripts/test-maintenance-cron.js   (exécuté deux fois de suite)
//     → 2e exécution : currentRank === lastRank pour les motos déjà notifiées, donc 0 push
//       (pas de spam au réexécution du cron — comportement attendu, pas un bug)

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// ── Require du service (Task 2 — n'existe pas encore tant que ce plan n'est pas exécuté) ──
const { runMaintenanceAlertCron } = require('../services/maintenanceAlertService');

console.log('▶  test-maintenance-cron.js — Phase 17 harness');
console.log('   PUSH_ENABLED :', process.env.PUSH_ENABLED);

(async () => {
  try {
    const result = await runMaintenanceAlertCron();
    console.log('Résultat :', result);
    process.exit(0);
  } catch (err) {
    console.error('❌  Erreur (gérée, ne fait pas échouer le harnais) :', err.message);
    process.exit(0);
  }
})();
