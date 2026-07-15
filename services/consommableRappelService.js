/* ══════════════════════════════════════════════════════════
   MOTOKEY — Phase 26 — Cron de rappel photo consommables (GAUGE-03/04)
   Grille de seuils D-01 (km OU mois, le premier des deux franchi déclenche
   le retard) + fonction pure de détection réutilisée par le cron ET par
   l'exposition badge garage (Motos.list/getById, supabase.js).

   Détection BINAIRE (pas de rangs comme maintenanceAlertService.js Phase 17) :
   un consommable est soit en retard, soit non — jamais d'exception, jamais
   de "je ne sais pas" (D-08 : absence de référence exploitable => false).
   ══════════════════════════════════════════════════════════ */

'use strict';

const SBLayer = require('../supabase');
const pushService = require('./pushService');

// Grille de seuils D-01 EXACTE — map en dur, aucune migration/table.
const SEUILS = {
  pneu_av: { km: 3000, mois: 6 },
  pneu_ar: { km: 2500, mois: 6 },
  chaine: { km: 3000, mois: 6 },
  plaquettes_av: { km: 3000, mois: 6 },
  plaquettes_ar: { km: 4500, mois: 6 },
  disque_av: { km: 8000, mois: 12 },
  disque_ar: { km: 8000, mois: 12 },
  huile_moteur: { km: 5000, mois: 6 },
  liquide_frein: { km: 6000, mois: 12 },
};

const LABELS = {
  pneu_av: 'Pneu avant',
  pneu_ar: 'Pneu arriere',
  chaine: 'Chaine',
  plaquettes_av: 'Plaquettes avant',
  plaquettes_ar: 'Plaquettes arriere',
  disque_av: 'Disque avant',
  disque_ar: 'Disque arriere',
  huile_moteur: 'Huile moteur',
  liquide_frein: 'Liquide de frein',
};

/**
 * Nombre de mois calendaires écoulés entre deux dates (PAS une division par
 * 30 jours — arithmétique calendaire, Pitfall 4).
 * @param {Date} from
 * @param {Date} to
 * @returns {number}
 */
function moisEcoules(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * Fonction PURE (aucun accès DB) : un consommable est-il en retard de photo ?
 * La référence (km/date) est celle de la photo la plus récente si elle existe,
 * sinon celle du montage déclaré. Sans AUCUNE référence exploitable, le
 * consommable est exclu (D-08 : jamais d'exception).
 * @param {{type_consommable:string, km_montage:?number, date_montage:?string}} conso
 * @param {?number} motoKm
 * @param {?{km_a_la_photo:?number, created_at:string}} latestPhoto
 * @returns {boolean}
 */
function isConsommableEnRetard(conso, motoKm, latestPhoto) {
  const seuil = SEUILS[conso.type_consommable];
  if (!seuil) return false; // type inconnu => défensif, jamais throw

  const refKm = latestPhoto ? latestPhoto.km_a_la_photo : conso.km_montage;
  const refDate = latestPhoto ? latestPhoto.created_at : conso.date_montage;

  if (refKm == null && !refDate) return false; // D-08 : aucune référence exploitable

  const kmDepasse = refKm != null && motoKm != null && (motoKm - refKm) >= seuil.km;
  const moisDepasse = !!refDate && moisEcoules(new Date(refDate), new Date()) >= seuil.mois;

  return !!(kmDepasse || moisDepasse);
}

/**
 * Calcule la liste des consommables en retard pour une moto donnée (accès DB).
 * Réutilisé par le cron ET (indirectement, via require paresseux) par
 * l'exposition badge garage dans supabase.js.
 * @param {{id:string, km:?number}} moto
 * @returns {Promise<object[]>} tableau des objets consommable complets en retard
 */
async function _consommablesEnRetardPourMoto(moto) {
  const consos = await SBLayer.Consommables.listByMoto(moto.id);
  const enRetard = [];
  for (const conso of consos) {
    const photos = await SBLayer.PhotosConsommables.listByConsommable(conso.id);
    const latestPhoto = (photos && photos.length) ? photos[0] : null;
    if (isConsommableEnRetard(conso, moto.km, latestPhoto)) enRetard.push(conso);
  }
  return enRetard;
}

/**
 * Runner du cron de rappel photo (GAUGE-03). Scanne uniquement les motos
 * possédées par un client (le badge garage GAUGE-04 est calculé au
 * read-time, pas par ce cron — voir Open Question 2 du RESEARCH), envoie UN
 * push groupé listant tous les consommables actuellement en retard, et ne
 * renotifie jamais un consommable déjà notifié (D-03) tant qu'une nouvelle
 * photo (D-05) ne l'a pas réarmé.
 * @returns {Promise<{scanned:number, notified:number, details:object[]}>}
 */
async function runConsommableRappelCron() {
  const { data: motos, error } = await SBLayer.supabase
    .from('motos')
    .select('id, client_id, km, marque, modele, proprietaire_type')
    .eq('proprietaire_type', 'client')
    .not('client_id', 'is', null);

  if (error) {
    console.error('❌ [26] consommableRappelService — lookup motos échoué:', error.message);
    return { error: error.message };
  }

  const details = [];
  let notified = 0;

  for (const moto of motos || []) {
    try {
      const lateAll = await _consommablesEnRetardPourMoto(moto);
      const newlyLate = lateAll.filter(c => c.dernier_rappel_envoye_at == null);

      if (newlyLate.length === 0) {
        details.push({ moto_id: moto.id, late: lateAll.map(c => c.type_consommable), notified: false });
        continue;
      }

      const types = lateAll.map(c => c.type_consommable).sort();
      const liste = types.map(t => LABELS[t] || t).join(', ');
      const title = 'Photos d entretien a faire';
      const body = `Votre ${moto.marque || 'moto'} ${moto.modele || ''} : ${types.length} consommable(s) a photographier (${liste}).`.replace(/\s+/g, ' ').trim();

      const idempotencyKey = `rappel-photo:${moto.id}:${types.join('+')}:${new Date().toISOString().slice(0, 10)}`;

      const pushResult = await pushService.sendPush(
        moto.client_id,
        { title, body, data: { type: 'moto_entretien', motoId: moto.id } },
        idempotencyKey
      );
      notified++;

      for (const c of newlyLate) {
        await SBLayer.supabase
          .from('consommables')
          .update({ dernier_rappel_envoye_at: new Date().toISOString(), dernier_rappel_km: moto.km ?? null })
          .eq('id', c.id);
      }

      details.push({ moto_id: moto.id, late: types, notified: true, pushResult });
    } catch (e) {
      console.warn(`⚠️  [26] consommableRappelService échoué pour moto ${moto.id}:`, e.message);
      details.push({ moto_id: moto.id, error: e.message });
      continue;
    }
  }

  const summary = { scanned: (motos || []).length, notified, details };
  console.log(`🔔 [26] consommableRappelService — scan=${summary.scanned} notified=${summary.notified}`);
  return summary;
}

module.exports = { SEUILS, LABELS, isConsommableEnRetard, moisEcoules, runConsommableRappelCron };
