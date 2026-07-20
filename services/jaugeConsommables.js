/* ══════════════════════════════════════════════════════════
   MOTOKEY — Phase 27 — Jauges consommables (GAUGE-01/02)
   Algorithme pur "maillon le plus faible" (D-03 : max pct_usure parmi
   has_data, JAMAIS une moyenne) + join helper qui assemble les 9 types
   canoniques (consommables + dernière photo analysée) pour un moto_id.
   ══════════════════════════════════════════════════════════ */

'use strict';

/**
 * PURE — aucun accès DB. Détermine le maillon le plus faible parmi une liste
 * d'items jauge (une entrée par type_consommable).
 * D-04 : aucune donnée exploitable (has_data=false partout ou liste vide) → null.
 * D-03 : maillon le plus faible = pct_usure MAX parmi has_data=true (jamais une
 * moyenne). etat étant monotone non-décroissant en pct_usure (deriveEtat), le
 * max pct_usure porte aussi l'etat le plus sévère — pas de tie-break séparé.
 * @param {Array<{type_consommable?:string, has_data:boolean, pct_usure:?number, etat?:?string}>} items
 * @returns {?object} l'item au pct_usure max parmi has_data, ou null
 */
function computeJaugeGenerale(items) {
  const withData = (items || []).filter(i => i && i.has_data && typeof i.pct_usure === 'number');
  if (!withData.length) return null; // D-04: aucune donnée → null → frontend "Pas encore suivi"
  // D-03: maillon le plus faible = max pct_usure parmi has_data (deriveEtat monotone → etat le plus sévère).
  return withData.reduce((worst, i) => (i.pct_usure > worst.pct_usure ? i : worst));
}

/**
 * PURE — aucun accès DB. Pour le type 'chaine', combine les deux zones (brin/couronne)
 * en gardant la PIRE des deux (pct_usure max), jamais "la plus récente gagne" — l'usure
 * de la chaîne est déterminée par son maillon le plus faible entre les deux zones
 * photographiées (doctrine L11 : bon comportement sécurité).
 *
 * Pour un profil courroie (une seule prise, zone toujours NULL) ou si une seule des deux
 * zones a été photographiée jusqu'ici, retourne cette unique analyse exploitable — jamais
 * bloquant en attendant la 2e photo (D-04, cohérent avec le reste du système : montrer ce
 * qui est disponible plutôt que rien).
 *
 * @param {Array<{zone?: ?('brin'|'couronne'), analyse_ia?: ?{pct_usure:number, etat:string}}>} photos
 *        Triées desc created_at (comme retourné par PhotosConsommables.listByConsommable).
 * @returns {?{pct_usure:number, etat:string}} null si aucune photo exploitable
 */
function pickChainAnalysis(photos) {
  const latestByZone = {};
  for (const p of (photos || [])) {
    if (!p || !p.analyse_ia || typeof p.analyse_ia.pct_usure !== 'number') continue;
    const key = p.zone || '_unique'; // profil courroie : toujours zone=NULL → une seule clé
    if (!(key in latestByZone)) latestByZone[key] = p.analyse_ia; // photos triées desc → 1ère rencontre = plus récente pour cette zone
  }
  const candidates = Object.values(latestByZone);
  if (!candidates.length) return null;
  return candidates.reduce((worst, a) => (a.pct_usure > worst.pct_usure ? a : worst));
}

/**
 * Assemble les 9 jauges consommables (TYPES_CONSOMMABLES) pour une moto donnée,
 * en joignant Consommables.listByMoto (état courant, une ligne par type) avec
 * la photo la plus récente ayant une analyse exploitable (analyse_ia.pct_usure).
 * Un consommable sans row DB, ou avec row mais sans photo analysée, a
 * has_data:false — jamais de pct_usure/etat fabriqué (Pitfall 1).
 * @param {string} moto_id
 * @returns {Promise<{items: object[], jaugeGenerale: ?object}>}
 */
async function buildConsommablesJauges(moto_id) {
  const SB = require('../supabase'); // lazy, évite le cycle supabase.js<->jaugeConsommables.js
  const consos = await SB.Consommables.listByMoto(moto_id);
  const byType = {}; consos.forEach(c => { byType[c.type_consommable] = c; });
  const items = [];
  for (const type of SB.TYPES_CONSOMMABLES) {
    const conso = byType[type] || null;
    let pct_usure = null, etat = null, has_data = false;
    if (conso) {
      const photos = await SB.PhotosConsommables.listByConsommable(conso.id); // desc created_at
      if (type === 'chaine') {
        // Migration 30 : pire des 2 zones (brin/couronne), jamais "la dernière gagne".
        const worst = pickChainAnalysis(photos);
        if (worst) { pct_usure = worst.pct_usure; etat = worst.etat; has_data = true; }
      } else {
        const latest = photos[0];
        if (latest && latest.analyse_ia && typeof latest.analyse_ia.pct_usure === 'number') {
          pct_usure = latest.analyse_ia.pct_usure;
          etat = latest.analyse_ia.etat;
          has_data = true;
        }
      }
    }
    items.push({
      type_consommable: type,
      km_montage: conso ? (conso.km_montage ?? null) : null,
      date_montage: conso ? (conso.date_montage ?? null) : null,
      reference: conso ? (conso.reference ?? null) : null,
      pct_usure, etat, has_data
    });
  }
  return { items, jaugeGenerale: computeJaugeGenerale(items) };
}

module.exports = { computeJaugeGenerale, pickChainAnalysis, buildConsommablesJauges };
