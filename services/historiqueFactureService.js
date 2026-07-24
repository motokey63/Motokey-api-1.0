/* ══════════════════════════════════════════════════════════
   MOTOKEY — L15 — Lecture de facture/justificatif d'entretien
   ancien pour la reprise d'historique.

   Extrait date/plaque/km/garage/siret/description d'une photo
   de document pour pré-remplir l'écran de validation humaine.
   Jamais d'insertion automatique — l'IA pré-remplit, l'humain
   valide (décision 5 du cadrage L15). Aucun montant extrait
   dans ce socle (hors périmètre de la validation initiale).
   ══════════════════════════════════════════════════════════ */

'use strict';

const { callVision } = require('./anthropicVisionClient');

const MODEL = 'claude-haiku-4-5';

const SCHEMA = {
  type: 'object',
  properties: {
    date_document: { type: ['string', 'null'], description: "Date du document au format YYYY-MM-DD, telle qu'écrite sur la facture/justificatif. null si illisible ou absente." },
    plaque:        { type: ['string', 'null'], description: "Plaque d'immatriculation de la moto telle qu'imprimée sur le document. null si absente ou illisible." },
    km:            { type: ['integer', 'null'], description: "Kilométrage relevé mentionné sur le document. null si absent ou illisible." },
    nom_garage:    { type: ['string', 'null'], description: "Nom du garage/prestataire émetteur, texte libre tel qu'imprimé. null si absent." },
    siret:         { type: ['string', 'null'], description: "Numéro SIRET du garage émetteur, uniquement s'il est imprimé sur le document. null sinon." },
    description_travaux: { type: ['string', 'null'], description: "Résumé bref (une phrase) des travaux/prestations mentionnés. null si illisible." }
  },
  required: ['date_document', 'plaque', 'km', 'nom_garage', 'siret', 'description_travaux'],
  additionalProperties: false
};

const SYSTEM_PROMPT = "Tu es un assistant pour un garage moto qui lit des factures et justificatifs d'entretien " +
  "anciens (parfois plusieurs années). Extrais UNIQUEMENT ce qui est explicitement lisible en texte sur le " +
  "document : la date d'émission, la plaque d'immatriculation de la moto, le kilométrage relevé, le nom du " +
  "garage/prestataire émetteur, son numéro SIRET si présent, et un résumé bref des travaux effectués. " +
  "N'invente jamais une valeur : si un champ n'est pas lisible ou absent du document, réponds null pour ce " +
  "champ précis plutôt que de deviner. La date doit être au format YYYY-MM-DD ; si seul le mois/année est " +
  "lisible, réponds null pour la date plutôt que d'inventer un jour.";

/**
 * @param {{imageUrl:string}} params
 * @returns {Promise<{ok:true, data:{date_document:?string,plaque:?string,km:?number,nom_garage:?string,siret:?string,description_travaux:?string}} | {ok:false, raison:string}>}
 */
async function analyserFactureHistorique({ imageUrl }) {
  return callVision({
    imageUrl,
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
    jsonSchema: SCHEMA,
    maxTokens: 512
  });
}

module.exports = { analyserFactureHistorique, MODEL, SCHEMA };
