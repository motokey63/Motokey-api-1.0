/* ══════════════════════════════════════════════════════════
   MOTOKEY — L12 — Lecture d'étiquette de pièce (Usage A du socle Vision)

   Extrait libelle/reference/marque/ean d'une photo d'étiquette pour
   pré-remplir une création rapide au catalogue_pieces (garage_id scope).
   Le prix n'est JAMAIS extrait — voir Global Constraints du plan L12.
   ══════════════════════════════════════════════════════════ */

'use strict';

const { callVision } = require('./anthropicVisionClient');

const MODEL = 'claude-haiku-4-5';

const SCHEMA = {
  type: 'object',
  properties: {
    libelle:   { type: ['string', 'null'], description: "Nom/désignation de la pièce tel que lu sur l'étiquette (ex: 'Plaquettes de frein avant'). null si illisible ou absent." },
    reference: { type: ['string', 'null'], description: "Référence fabricant imprimée sur l'étiquette. null si absente ou illisible." },
    marque:    { type: ['string', 'null'], description: "Marque du fabricant. null si absente ou illisible." },
    ean:       { type: ['string', 'null'], description: "Code EAN/code-barres numérique (8 à 14 chiffres) UNIQUEMENT s'il est imprimé en texte lisible sur l'étiquette. null sinon — ne déduis jamais un EAN à partir des barres du code-barres lui-même." }
  },
  required: ['libelle', 'reference', 'marque', 'ean'],
  additionalProperties: false
};

const SYSTEM_PROMPT = "Tu es un assistant pour un garage moto qui lit des étiquettes de pièces détachées. " +
  "Extrais UNIQUEMENT ce qui est explicitement lisible en texte sur l'étiquette dans l'image : le nom/désignation " +
  "de la pièce, sa référence fabricant, sa marque, et son code EAN si le numéro est imprimé en texte à côté du " +
  "code-barres. N'invente jamais une valeur : si un champ n'est pas lisible ou absent de l'étiquette, réponds " +
  "null pour ce champ précis plutôt que de deviner. Ne fournis JAMAIS de prix — ce champ n'existe pas sur une " +
  "étiquette fabricant et ne doit jamais être déduit.";

/**
 * @param {{imageUrl:string}} params
 * @returns {Promise<{ok:true, data:{libelle:?string,reference:?string,marque:?string,ean:?string}} | {ok:false, raison:string}>}
 */
async function analyserEtiquette({ imageUrl }) {
  return callVision({
    imageUrl,
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
    jsonSchema: SCHEMA,
    maxTokens: 512
  });
}

module.exports = { analyserEtiquette, MODEL, SCHEMA };
