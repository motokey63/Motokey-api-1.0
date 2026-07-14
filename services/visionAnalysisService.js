/* ══════════════════════════════════════════════════════════
   MOTOKEY — v1.6 Phase 24 — Service d'analyse Vision (stub)
   Contrat verrouillé, consommé identiquement par les futurs
   endpoints/jauges (Phase 25/27/28) et par le futur moteur réel.

   ⚠️  CONTRAT CANONIQUE — ne pas changer la FORME sans revoir
   tous les consommateurs (Phase 25/27/28) :

     analyzePhoto({ photoUrl, consommableId, typeConsommable,
                     kmActuel, kmMontage }) → Promise<{
       pct_usure:      int 0-100,
       etat:           'bon' | 'moyen' | 'usé' | 'critique',
       confiance:      int 0-100,
       analyse_status: 'ok' | 'incertain',   // le troisième statut possible côté DB n'est jamais produit par le stub
       engine:         'stub',               // 'anthropic-vision' au futur moteur réel
     }>

   Dérivations (fonctions pures, exportées) :
     deriveEtat(pctUsure)      — seuils D-02 : <30 bon, 30-59 moyen, 60-84 usé, >=85 critique
     deriveAnalyseStatus(conf) — seuil  D-03 : <50 incertain, >=50 ok

   Déterminisme (D-04) : même input (photoUrl ou consommableId) → même sortie,
   via un seed SHA-256 dérivé de l'input, consommé par un PRNG déterministe
   (mulberry32). Le statut d'échec (réservé au futur moteur réel : timeout API,
   image illisible, etc.) n'est JAMAIS produit par le stub (D-05).

   Variables Railway :
   - VISION_ENABLED=true     → réservé au futur moteur réel (non branché ce
                                milestone) ; sans ANTHROPIC_API_KEY, fallback
                                silencieux vers le stub + warning loggé (D-06),
                                jamais de crash — même convention que
                                EMAIL_ENABLED (services/emailService.js) et
                                PUSH_ENABLED (services/pushService.js).
   - ANTHROPIC_API_KEY       → clé API Anthropic (non consommée ce milestone)

   Service PUR : aucun accès DB (aucune dépendance vers le module de couche
   données du repo), aucune requête réseau. La persistance du résultat passe
   par les helpers CRUD dédiés (PhotosConsommables), pas par ce module.
   ══════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');

const VISION_ENABLED = process.env.VISION_ENABLED === 'true';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;

let visionReady = false;
if (VISION_ENABLED) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('⚠️  [24] VISION_ENABLED=true mais ANTHROPIC_API_KEY manquant — fallback stub');
  } else {
    visionReady = true; // réservé au futur moteur réel — non branché ce milestone
    console.log('✅ [24] Config Vision détectée (moteur réel non branché ce milestone)');
  }
} else {
  console.log('🔎 [24] Vision en mode stub (VISION_ENABLED=false) — analyse simulée uniquement');
}

/**
 * Dérive l'état qualitatif à partir du % d'usure (D-02).
 * @param {number} pctUsure
 * @returns {'bon'|'moyen'|'usé'|'critique'}
 */
function deriveEtat(pctUsure) {
  if (pctUsure >= 85) return 'critique';
  if (pctUsure >= 60) return 'usé';
  if (pctUsure >= 30) return 'moyen';
  return 'bon';
}

/**
 * Dérive le statut d'analyse à partir de la confiance (D-03).
 * @param {number} confiance
 * @returns {'ok'|'incertain'}
 */
function deriveAnalyseStatus(confiance) {
  return confiance < 50 ? 'incertain' : 'ok';
}

/**
 * Calcule un seed entier déterministe à partir de l'input (D-04).
 * @param {string|null} photoUrl
 * @param {string|null} consommableId
 * @returns {number}
 */
function seedFromInput(photoUrl, consommableId) {
  const raw = photoUrl || consommableId || 'no-input';
  return crypto.createHash('sha256').update(String(raw)).digest().readUInt32BE(0);
}

/**
 * PRNG déterministe (mulberry32) — même seed → même séquence de tirages.
 * @param {number} seed
 * @returns {() => number} générateur [0, 1)
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Construit une analyse stub déterministe et pseudo-réaliste (D-04) : le %
 * d'usure de base est lié approximativement au km parcouru depuis le montage
 * du consommable, avec un bruit déterministe pour un rendu vivant en dev/démo.
 * @param {object} params
 * @param {string} [params.photoUrl]
 * @param {string} [params.consommableId]
 * @param {string} [params.typeConsommable]
 * @param {number} [params.kmActuel]
 * @param {number} [params.kmMontage]
 * @returns {{pct_usure:number, etat:string, confiance:number, analyse_status:string, engine:'stub'}}
 */
function buildStubAnalysis({ photoUrl, consommableId, typeConsommable, kmActuel, kmMontage } = {}) {
  const seed = seedFromInput(photoUrl, consommableId);
  const rand = mulberry32(seed);

  const kmParcouru = Math.max(0, (Number(kmActuel) || 0) - (Number(kmMontage) || 0));
  const dureeVieKm = 15000; // valeur unique simple tous types ce milestone

  const usureBase = Math.min(95, Math.round((kmParcouru / dureeVieKm) * 100));
  const bruit = Math.round((rand() - 0.5) * 30); // ± 15 points déterministes
  const pct_usure = Math.max(0, Math.min(100, usureBase + bruit));
  const etat = deriveEtat(pct_usure);

  const confiance = Math.max(35, Math.min(99, Math.round(35 + rand() * 64))); // 35-99 → 'incertain' atteignable
  const analyse_status = deriveAnalyseStatus(confiance);

  return { pct_usure, etat, confiance, analyse_status, engine: 'stub' };
}

/**
 * Analyse une photo de consommable et renvoie le contrat verrouillé (D-01).
 * Toujours async : la signature reste stable quand le vrai moteur (réseau)
 * sera branché dans un futur milestone.
 * @param {object} params
 * @param {string} [params.photoUrl]
 * @param {string} [params.consommableId]
 * @param {string} [params.typeConsommable]
 * @param {number} [params.kmActuel]
 * @param {number} [params.kmMontage]
 * @returns {Promise<{pct_usure:number, etat:string, confiance:number, analyse_status:string, engine:string}>}
 */
async function analyzePhoto(params = {}) {
  if (VISION_ENABLED && visionReady) {
    // Emplacement futur du vrai moteur Anthropic Vision — non implémenté ce milestone.
  }
  return buildStubAnalysis(params);
}

module.exports = { analyzePhoto, deriveEtat, deriveAnalyseStatus };
