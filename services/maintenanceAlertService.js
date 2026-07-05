/* ══════════════════════════════════════════════════════════
   MOTOKEY — Phase 17 — Maintenance Alert Cron (MPUSH-04)
   Détecte les franchissements de palier d'entretien (warning/urgent)
   sur les motos possédées par un client, et envoie un push unique
   par franchissement (jamais de spam au réexécution du cron).

   Ne recalcule jamais le pct/palier localement — délègue entièrement
   à supabase.js Entretien.getPlan (même calcul que les dashboards prod).
   ══════════════════════════════════════════════════════════ */

'use strict';

const SBLayer = require('../supabase');
const pushService = require('./pushService');

// Rang de sévérité des paliers — seul un rang strictement supérieur au dernier
// palier notifié déclenche un push (D-04 : une notification par franchissement).
const TIER_RANK = { null: 0, ok: 0, due: 0, future: 0, warning: 1, urgent: 2 };

/**
 * Parcourt toutes les motos possédées par un client, calcule leur pire palier
 * d'entretien via Entretien.getPlan, envoie un push si le palier a strictement
 * progressé depuis le dernier notifié, et persiste le nouveau palier (à la
 * hausse comme à la baisse).
 * @returns {Promise<{ scanned: number, notified: number, details: object[] } | { error: string }>}
 */
async function runMaintenanceAlertCron() {
  const { data: motos, error } = await SBLayer.supabase
    .from('motos')
    .select('id, client_id, km, marque, modele, last_maintenance_tier_notified')
    .not('client_id', 'is', null);

  if (error) {
    console.error('❌ [17] maintenanceAlertService — lookup motos échoué:', error.message);
    return { error: error.message };
  }

  const details = [];
  let notified = 0;

  for (const moto of motos || []) {
    let plan;
    try {
      plan = await SBLayer.Entretien.getPlan(moto.id, moto.km || 0);
    } catch (e) {
      console.warn(`⚠️  [17] Entretien.getPlan échoué pour moto ${moto.id}:`, e.message);
      details.push({ moto_id: moto.id, error: e.message });
      continue;
    }

    const worst = (plan || []).reduce(
      (acc, op) => (TIER_RANK[op.statut] > TIER_RANK[acc] ? op.statut : acc),
      null
    );

    const lastRank = TIER_RANK[moto.last_maintenance_tier_notified] ?? 0;
    const currentRank = TIER_RANK[worst] ?? 0;

    let pushResult = null;
    if (currentRank > lastRank) {
      const copy = worst === 'urgent'
        ? { title: 'Révision dépassée', body: `Votre ${moto.marque || 'moto'} ${moto.modele || ''} a dépassé le seuil de révision.`.trim() }
        : { title: 'Révision à planifier', body: `Votre ${moto.marque || 'moto'} ${moto.modele || ''} approche du seuil de révision.`.trim() };

      const idempotencyKey = `maintenance-alert:${moto.id}:${worst}:${new Date().toISOString().slice(0, 10)}`;
      pushResult = await pushService.sendPush(
        moto.client_id,
        { ...copy, data: { type: 'moto_entretien', motoId: moto.id } },
        idempotencyKey
      );
      notified++;
    }

    if (worst !== moto.last_maintenance_tier_notified) {
      try {
        const { error: updErr } = await SBLayer.supabase
          .from('motos')
          .update({ last_maintenance_tier_notified: worst, last_maintenance_tier_notified_at: new Date().toISOString() })
          .eq('id', moto.id);
        if (updErr) throw updErr;
      } catch (e) {
        console.warn(`⚠️  [17] Persistance last_maintenance_tier_notified échouée pour moto ${moto.id}:`, e.message);
      }
    }

    details.push({ moto_id: moto.id, worst, lastRank, currentRank, notified: currentRank > lastRank, pushResult });
  }

  const summary = { scanned: (motos || []).length, notified, details };
  console.log(`🔔 [17] maintenanceAlertService — scan=${summary.scanned} notified=${summary.notified}`);
  return summary;
}

module.exports = { runMaintenanceAlertCron };
