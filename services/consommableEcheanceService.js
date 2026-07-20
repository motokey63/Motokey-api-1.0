/* ══════════════════════════════════════════════════════════
   MOTOKEY — L11 sous-livraison — Notif calendaire consommables
   Cron de "palier 90%" — alerte precoce AVANT le rappel photo binaire
   (Phase 26, consommableRappelService.js, 100%+). Service VOLONTAIREMENT
   distinct : cadence, seuil et etat anti-spam differents (voir migration 31).

   Reutilise SEUILS/LABELS/moisEcoules de consommableRappelService.js (source
   des seuils par defaut, inchangee) mais garde sa propre logique de calcul
   (pourcentage, pas binaire) et son propre etat anti-spam
   (dernier_palier_calendaire_envoye_at / _km, distinct de dernier_rappel_envoye_at).
   ══════════════════════════════════════════════════════════ */

'use strict';

const SBLayer = require('../supabase');
const pushService = require('./pushService');
const { SEUILS, LABELS, moisEcoules } = require('./consommableRappelService');

// Section 2.3 — allowlist EXPLICITE des types suivis par ce cron calendaire (decision
// produit confirmee 20/07/2026, PAS un defaut implicite). Seuls liquide_frein (axe temps
// seul, le DOT s'use au TEMPS pas au kilometrage) et huile_moteur (pire des 2 axes km/mois)
// sont couverts. Tout autre type (pneu_av/ar, chaine = methode photo A ; plaquettes_av/ar,
// disque_av/ar = methode B controle mecano) est HORS PERIMETRE de ce cron — axeCalendaire()
// renvoie null pour eux, et calculerPalier() doit court-circuiter immediatement (return null,
// jamais de calcul) pour qu'ils ne generent JAMAIS de notif via ce cron.
const AXES_CALENDAIRE = {
  liquide_frein: 'mois',
  huile_moteur: 'les-deux',
};

function axeCalendaire(type) {
  return AXES_CALENDAIRE[type] || null;
}

/**
 * PURE. Pourcentage d'usure de l'axe km, ou null si non calculable.
 */
function pctAxeKm(refKm, motoKm, seuilKm) {
  if (refKm == null || motoKm == null || !seuilKm) return null;
  const parcouru = motoKm - refKm;
  return Math.max(0, parcouru) / seuilKm * 100;
}

/**
 * PURE. Pourcentage d'usure de l'axe mois, ou null si non calculable.
 * Reutilise moisEcoules() (arithmetique calendaire, PAS de division /30).
 */
function pctAxeMois(refDate, seuilMois, today) {
  if (!refDate || !seuilMois) return null;
  const ecoule = moisEcoules(new Date(refDate), today);
  return Math.max(0, ecoule) / seuilMois * 100;
}

/**
 * PURE — aucun accès DB. Calcule le palier (%) d'un consommable donne, en
 * lisant COALESCE(override, defaut SEUILS) sur chaque axe, puis en retenant
 * le pire des axes actifs pour ce type (axeCalendaire). D-08 : aucune
 * reference exploitable sur les axes actifs => null (jamais d'exception).
 * @param {{type_consommable:string, km_montage:?number, date_montage:?string, seuil_km_override:?number, seuil_mois_override:?number}} conso
 * @param {?number} motoKm
 * @param {Date} [today]
 * @returns {?number} pourcentage (peut depasser 100), ou null
 */
function calculerPalier(conso, motoKm, today = new Date()) {
  const defauts = SEUILS[conso.type_consommable];
  if (!defauts) return null; // type inconnu => defensif, jamais throw

  const axe = axeCalendaire(conso.type_consommable);
  if (!axe) return null; // hors allowlist (decision produit) => jamais de palier pour ce type

  const seuilKm = conso.seuil_km_override ?? defauts.km;
  const seuilMois = conso.seuil_mois_override ?? defauts.mois;

  const pctKm = axe !== 'mois' ? pctAxeKm(conso.km_montage, motoKm, seuilKm) : null;
  const pctMois = axe !== 'km' ? pctAxeMois(conso.date_montage, seuilMois, today) : null;

  const candidats = [pctKm, pctMois].filter(p => p != null);
  if (!candidats.length) return null; // D-08 : aucune reference exploitable sur les axes actifs
  return Math.max(...candidats);
}

/**
 * PURE. true si le palier 90% est atteint ou depasse.
 */
function isPalier90Atteint(conso, motoKm, today = new Date()) {
  const pct = calculerPalier(conso, motoKm, today);
  return pct != null && pct >= 90;
}

/**
 * Calcule la liste des consommables au palier 90%+ pour une moto donnee (accès DB).
 * @param {{id:string, km:?number}} moto
 * @returns {Promise<object[]>}
 */
async function _consommablesEnPalier90PourMoto(moto) {
  const consos = await SBLayer.Consommables.listByMoto(moto.id);
  return consos.filter(c => isPalier90Atteint(c, moto.km));
}

/**
 * Runner du cron calendaire. Scanne les motos possedees par un client, envoie
 * UN push groupe listant les consommables au palier 90%+, ne renotifie jamais
 * un consommable deja notifie (dernier_palier_calendaire_envoye_at != null)
 * tant que la reference n'a pas ete renouvelee (voir Consommables.upsert()).
 * @returns {Promise<{scanned:number, notified:number, details:object[]}>}
 */
async function runConsommableEcheanceCron() {
  const { data: motos, error } = await SBLayer.supabase
    .from('motos')
    .select('id, client_id, km, marque, modele, proprietaire_type')
    .eq('proprietaire_type', 'client')
    .not('client_id', 'is', null);

  if (error) {
    console.error('❌ [L11-calendaire] lookup motos échoué:', error.message);
    return { error: error.message };
  }

  const details = [];
  let notified = 0;

  for (const moto of motos || []) {
    try {
      const dueAll = await _consommablesEnPalier90PourMoto(moto);
      const newlyDue = dueAll.filter(c => c.dernier_palier_calendaire_envoye_at == null);

      if (newlyDue.length === 0) {
        details.push({ moto_id: moto.id, due: dueAll.map(c => c.type_consommable), notified: false });
        continue;
      }

      const types = dueAll.map(c => c.type_consommable).sort();
      const liste = types.map(t => LABELS[t] || t).join(', ');
      const title = 'Entretien à prévoir prochainement';
      const body = `Votre ${moto.marque || 'moto'} ${moto.modele || ''} approche de l'échéance pour : ${liste}.`.replace(/\s+/g, ' ').trim();

      const idempotencyKey = `echeance-calendaire:${moto.id}:${types.join('+')}:${new Date().toISOString().slice(0, 10)}`;

      const pushResult = await pushService.sendPush(
        moto.client_id,
        { title, body, data: { type: 'moto_entretien', motoId: moto.id } },
        idempotencyKey
      );
      notified++;

      for (const c of newlyDue) {
        await SBLayer.supabase
          .from('consommables')
          .update({ dernier_palier_calendaire_envoye_at: new Date().toISOString(), dernier_palier_calendaire_km: moto.km ?? null })
          .eq('id', c.id);
      }

      details.push({ moto_id: moto.id, due: types, notified: true, pushResult });
    } catch (e) {
      console.warn(`⚠️  [L11-calendaire] échoué pour moto ${moto.id}:`, e.message);
      details.push({ moto_id: moto.id, error: e.message });
      continue;
    }
  }

  const summary = { scanned: (motos || []).length, notified, details };
  console.log(`🔔 [L11-calendaire] scan=${summary.scanned} notified=${summary.notified}`);
  return summary;
}

module.exports = {
  AXES_CALENDAIRE, axeCalendaire,
  pctAxeKm, pctAxeMois, calculerPalier, isPalier90Atteint,
  runConsommableEcheanceCron
};
