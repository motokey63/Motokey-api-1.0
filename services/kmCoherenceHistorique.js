/* ══════════════════════════════════════════════════════════
   MOTOKEY — L15 — Cohérence km pour import d'historique

   Compare un candidat d'import (date + km déclarés) au voisin
   chronologique le plus proche (avant ET après) parmi les
   interventions existantes de la moto — PAS au max global (le
   trigger verifier_km_monotone compare au max, inadapté à un
   import rétroactif, voir amendement (b) du cadrage L15).

   Fonction PURE : aucune I/O, aucun accès réseau/DB. N'écrit
   jamais dans releves_km — la vérification est un contrôle en
   lecture appliqué au moment de la validation humaine
   (HistoriqueImport.valider, supabase.js).
   ══════════════════════════════════════════════════════════ */

'use strict';

/**
 * @param {{date_document: string, km_declare: number}} candidat
 * @param {Array<{date_intervention: string, km: number}>} interventionsExistantes
 * @returns {{statut: 'valide'|'rejete', motif: string|null}}
 */
function verifierCoherenceKm(candidat, interventionsExistantes) {
  const candidatDate = candidat.date_document;
  const candidatKm = candidat.km_declare;

  const triees = (interventionsExistantes || [])
    .slice()
    .sort(function (a, b) {
      if (a.date_intervention < b.date_intervention) return -1;
      if (a.date_intervention > b.date_intervention) return 1;
      return 0;
    });

  let voisinAvant = null;
  let voisinApres = null;
  for (const i of triees) {
    if (i.date_intervention <= candidatDate) voisinAvant = i;
    if (i.date_intervention >= candidatDate && !voisinApres) voisinApres = i;
  }

  if (voisinAvant && candidatKm < voisinAvant.km) {
    return {
      statut: 'rejete',
      motif: `km déclaré (${candidatKm}) inférieur au relevé du ${voisinAvant.date_intervention} (${voisinAvant.km} km)`
    };
  }
  if (voisinApres && candidatKm > voisinApres.km) {
    return {
      statut: 'rejete',
      motif: `km déclaré (${candidatKm}) supérieur au relevé du ${voisinApres.date_intervention} (${voisinApres.km} km)`
    };
  }
  return { statut: 'valide', motif: null };
}

module.exports = { verifierCoherenceKm };
