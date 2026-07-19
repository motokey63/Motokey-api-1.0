/* ══════════════════════════════════════════════════════════
   MOTOKEY — Profil de transmission moto (chaîne/courroie/cardan)
   Fonction pure de matching (aucun accès DB) réutilisable en test, +
   wrapper impur qui lit la table de mapping profils_transmission_modeles.
   Fallback 'chaine' (cas le plus courant en France) si aucun match ou si
   la lecture DB échoue — jamais bloquant pour la création moto.
   ══════════════════════════════════════════════════════════ */

'use strict';

/**
 * Convertit un pattern SQL LIKE ('%' = wildcard) en RegExp insensible à la casse.
 * @param {string} pattern
 * @returns {RegExp}
 */
function convertirPatternEnRegex(pattern) {
  const echappe = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('^' + echappe.replace(/%/g, '.*') + '$', 'i');
}

/**
 * Fonction PURE (aucun accès DB) : trouve le profil de transmission pour une
 * marque/modèle donnés, à partir d'une liste de mappings déjà chargée.
 * @param {?string} marque
 * @param {?string} modele
 * @param {Array<{marque:string, modele_pattern:string, profil_transmission:string}>} mappings
 * @returns {?('chaine'|'courroie'|'cardan')} null si aucun match
 */
function matchProfilTransmission(marque, modele, mappings) {
  if (!marque || !modele) return null;
  const marqueNorm = marque.trim().toLowerCase();
  for (const m of mappings) {
    if (m.marque.trim().toLowerCase() !== marqueNorm) continue;
    if (convertirPatternEnRegex(m.modele_pattern).test(modele.trim())) return m.profil_transmission;
  }
  return null;
}

/**
 * Détecte le profil de transmission (accès DB). Toujours résolu — jamais de
 * rejet : un échec de lecture ou une absence de match retombe sur le défaut
 * 'chaine'/'auto'. Le mécano peut toujours corriger manuellement ensuite via
 * PATCH /motos/:id/profil-transmission.
 * @param {?string} marque
 * @param {?string} modele
 * @returns {Promise<{profil: 'chaine'|'courroie'|'cardan', source: 'auto'}>}
 */
async function detecterProfilTransmission(marque, modele) {
  const SBLayer = require('../supabase'); // require paresseux — évite le cycle supabase.js -> ce fichier -> supabase.js
  try {
    const { data, error } = await SBLayer.supabase
      .from('profils_transmission_modeles')
      .select('marque, modele_pattern, profil_transmission');
    if (error) throw new Error(error.message);
    const match = matchProfilTransmission(marque, modele, data || []);
    return { profil: match || 'chaine', source: 'auto' };
  } catch (e) {
    console.warn('[profilTransmission] détection échouée, fallback chaine/auto:', e.message);
    return { profil: 'chaine', source: 'auto' };
  }
}

module.exports = { convertirPatternEnRegex, matchProfilTransmission, detecterProfilTransmission };
