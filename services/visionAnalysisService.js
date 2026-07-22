/* ══════════════════════════════════════════════════════════
   MOTOKEY — v1.6 Phase 24 puis L12 (22/07/2026) — Service d'analyse Vision
   Contrat verrouillé, consommé identiquement par les endpoints/jauges
   existants (Phase 25/27/28) et par le moteur réel Anthropic (L12).

   ⚠️  CONTRAT CANONIQUE — ne pas changer la FORME des 5 champs
   originaux sans revoir tous les consommateurs (Phase 25/27/28) :

     analyzePhoto({ photoUrl, consommableId, typeConsommable,
                     kmActuel, kmMontage }, deps?) → Promise<{
       pct_usure:      ?int 0-100,           // null si echec (jamais inventé)
       etat:           ?'bon'|'moyen'|'usé'|'critique',
       confiance:      ?int 0-100,
       analyse_status: 'ok' | 'incertain' | 'echec',
       engine:         'stub' | 'anthropic',
       prescription?:      string,           // additif L12, enum strict — absent du stub
       prescription_texte?: string,          // additif L12, phrase libre lisible — absent du stub
       raison?:        string,               // additif L12, présent seulement si echec
     }>

   Dérivations (fonctions pures, exportées) :
     deriveEtat(pctUsure)      — seuils D-02 : <30 bon, 30-59 moyen, 60-84 usé, >=85 critique
     deriveAnalyseStatus(conf) — seuil  D-03 : <50 incertain, >=50 ok

   Déterminisme du stub (D-04) : même input → même sortie, via un seed
   SHA-256 dérivé de l'input, consommé par un PRNG déterministe (mulberry32).
   Utilisé quand VISION_ENABLED=false ou moteur réel indisponible.

   Moteur réel (L12) : appelle services/anthropicVisionClient.js#callVision
   avec le modèle claude-sonnet-5. Ne dérive JAMAIS etat/analyse_status
   depuis la réponse du modèle — pct_usure et confiance sont les seules
   valeurs numériques lues de l'API, etat/analyse_status restent calculés
   localement via deriveEtat/deriveAnalyseStatus pour garantir l'invariant
   D-02/D-03 quel que soit le moteur (stub ou réel). `prescription` est un
   enum STRICT à 3 niveaux ('surveillance'|'intervention_pro'|'urgence_securite')
   sur lequel le code peut réagir de façon fiable ; `prescription_texte` est
   une phrase libre, uniquement informative pour l'humain, jamais utilisée
   dans une condition. Sur échec (voir contrat callVision), retourne
   analyse_status:'echec' et pct_usure:null — JAMAIS un chiffre inventé pour
   masquer l'échec.

   Variables Railway :
   - VISION_ENABLED=true     → active le moteur réel. Sans ANTHROPIC_API_KEY,
                                fallback silencieux vers le stub + warning
                                loggé (D-06), jamais de crash — même
                                convention que EMAIL_ENABLED (emailService.js)
                                et PUSH_ENABLED (pushService.js).
   - ANTHROPIC_API_KEY       → clé API Anthropic

   Service quasi-pur : aucun accès DB direct — délègue tout appel réseau à
   services/anthropicVisionClient.js. La persistance du résultat passe par
   les helpers CRUD dédiés (PhotosConsommables), pas par ce module.
   ══════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');
const { callVision } = require('./anthropicVisionClient');

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

const USURE_MODEL = 'claude-sonnet-5';

const USURE_SCHEMA = {
  type: 'object',
  properties: {
    pct_usure:    { type: 'integer', description: "Pourcentage d'usure estimé du consommable, de 0 (neuf) à 100 (hors service). Base ton estimation sur des critères concrets et visibles sur la photo, jamais une supposition." },
    confiance:    { type: 'integer', description: "Confiance dans cette estimation, de 0 à 100, selon la lisibilité/qualité/cadrage de la photo. Mets une confiance basse plutôt qu'un pct_usure inventé si la photo est floue ou mal cadrée." },
    prescription: { type: 'string', enum: ['surveillance', 'intervention_pro', 'urgence_securite'], description: "Niveau d'action, EXACTEMENT l'une de ces 3 valeurs : 'surveillance' (rien d'urgent, à revoir plus tard), 'intervention_pro' (à faire contrôler/remplacer par un professionnel prochainement), 'urgence_securite' (danger, ne pas rouler / intervention immédiate). Ce champ est lu par du code — n'utilise jamais une autre valeur que ces 3." },
    prescription_texte: { type: 'string', description: "Phrase courte et explicative en français, lisible par un humain, qui justifie la prescription choisie (ex: 'Garniture des plaquettes très fine, à remplacer sous 500 km'). Ce champ est uniquement informatif, jamais utilisé par du code." }
  },
  required: ['pct_usure', 'confiance', 'prescription', 'prescription_texte'],
  additionalProperties: false
};

const CRITERES_PAR_TYPE = {
  pneu_av: "profondeur des sculptures comparée au témoin d'usure, craquelures du flanc, usure irrégulière entre bords et centre, présence de hernies ou coupures",
  pneu_ar: "profondeur des sculptures comparée au témoin d'usure, craquelures du flanc, usure irrégulière entre bords et centre, présence de hernies ou coupures",
  chaine: "tension et jeu visible, présence de rouille ou manque de graissage, grippage des maillons, état des dents de la couronne/pignon si visibles sur la photo",
  plaquettes_av: "épaisseur de la garniture restante par rapport au support métallique, usure irrégulière entre les deux côtés",
  plaquettes_ar: "épaisseur de la garniture restante par rapport au support métallique, usure irrégulière entre les deux côtés",
  disque_av: "épaisseur du disque, présence de rayures profondes ou de voile visible, régularité de la zone de contact",
  disque_ar: "épaisseur du disque, présence de rayures profondes ou de voile visible, régularité de la zone de contact",
  huile_moteur: "couleur et opacité de l'huile (du translucide au noir), présence de particules visibles",
  liquide_frein: "couleur du liquide (du jaune clair au brun foncé/trouble), niveau visible dans le réservoir"
};

function buildUsurePrompt(typeConsommable) {
  const critere = CRITERES_PAR_TYPE[typeConsommable] || "l'état général visible sur la photo";
  return "Tu es un mécanicien moto expert qui évalue l'usure d'un consommable à partir d'une photo, pour un " +
    "système de suivi d'entretien de garage. Type de consommable : " + typeConsommable + ". Évalue l'usure en " +
    "te basant sur des critères concrets et observables : " + critere + ". Donne une prescription (champ " +
    "`prescription`) choisie STRICTEMENT parmi 3 valeurs exactes selon la gravité : 'surveillance', " +
    "'intervention_pro' ou 'urgence_securite' — ce champ est consommé par du code, n'invente jamais une " +
    "4e valeur ni une phrase à sa place. Fournis séparément une phrase explicative dans `prescription_texte` " +
    "pour justifier ce choix à l'humain. Si la photo ne permet pas d'évaluer correctement ces critères (floue, " +
    "mal cadrée, mauvais sujet), donne une confiance basse plutôt qu'un pourcentage d'usure inventé.";
}

/**
 * Analyse une photo de consommable et renvoie le contrat verrouillé (D-01), étendu L12.
 * Toujours async. deps.callVision permet l'injection en test (2e paramètre optionnel).
 * @param {object} params
 * @param {string} [params.photoUrl]
 * @param {string} [params.consommableId]
 * @param {string} [params.typeConsommable]
 * @param {number} [params.kmActuel]
 * @param {number} [params.kmMontage]
 * @param {{callVision?:Function}} [deps]
 * @returns {Promise<{pct_usure:?number, etat:?string, confiance:?number, analyse_status:string, prescription?:string, prescription_texte?:string, raison?:string, engine:string}>}
 */
async function analyzePhoto(params = {}, deps = {}) {
  const doCallVision = deps.callVision || callVision;

  if (VISION_ENABLED && visionReady) {
    const result = await doCallVision({
      imageUrl: params.photoUrl,
      model: USURE_MODEL,
      systemPrompt: buildUsurePrompt(params.typeConsommable || 'consommable'),
      jsonSchema: USURE_SCHEMA,
      maxTokens: 512
    });

    if (result.ok) {
      const pct_usure = Math.max(0, Math.min(100, Math.round(result.data.pct_usure)));
      const confiance = Math.max(0, Math.min(100, Math.round(result.data.confiance)));
      return {
        pct_usure,
        etat: deriveEtat(pct_usure),
        confiance,
        analyse_status: deriveAnalyseStatus(confiance),
        prescription: result.data.prescription,
        prescription_texte: result.data.prescription_texte,
        engine: 'anthropic'
      };
    }

    console.warn('[L12] analyse Vision usure indisponible (' + result.raison + ') — aucun pct_usure calculé, jamais de valeur inventée');
    return {
      pct_usure: null,
      etat: null,
      confiance: null,
      analyse_status: 'echec',
      raison: result.raison,
      engine: 'anthropic'
    };
  }

  return buildStubAnalysis(params);
}

module.exports = { analyzePhoto, deriveEtat, deriveAnalyseStatus };
