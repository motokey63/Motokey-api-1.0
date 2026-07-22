/* ══════════════════════════════════════════════════════════
   MOTOKEY — L12 — Socle d'appel Anthropic Vision réel

   Un seul point d'entrée pour tout appel Vision du projet (étiquette
   pièce, usure consommables, et tout usage futur). Ne construit le
   client qu'une fois, au chargement du module, selon VISION_ENABLED +
   ANTHROPIC_API_KEY — mêmes variables déjà utilisées par
   services/visionAnalysisService.js (Phase 24), aucune nouvelle
   variable d'environnement introduite.

   Contrat : callVision() ne lève JAMAIS d'exception. Elle retourne
   toujours { ok:true, data } ou { ok:false, raison }. Charge à
   l'appelant de décider quoi faire d'un échec (jamais un fallback
   stub silencieux — voir Global Constraints du plan L12).
   ══════════════════════════════════════════════════════════ */

'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const VISION_ENABLED = process.env.VISION_ENABLED === 'true';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;

function buildClient() {
  if (!VISION_ENABLED) {
    console.log('🔎 [L12] Anthropic Vision inactif (VISION_ENABLED=false)');
    return null;
  }
  if (!ANTHROPIC_API_KEY) {
    console.warn('⚠️  [L12] VISION_ENABLED=true mais ANTHROPIC_API_KEY manquant — appels Vision désactivés');
    return null;
  }
  console.log('✅ [L12] Anthropic Vision actif');
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

const defaultClient = buildClient();

/**
 * Appelle l'API Anthropic Vision sur une image accessible par URL publique.
 * Ne lève jamais — toujours { ok:true, data } ou { ok:false, raison }.
 *
 * @param {object} params
 * @param {string} params.imageUrl - URL publique de l'image (ex. secure_url Cloudinary).
 * @param {string} params.model - ID de modèle exact (ex. 'claude-haiku-4-5').
 * @param {string} params.systemPrompt - Instructions système pour cet appel.
 * @param {object} [params.jsonSchema] - JSON Schema strict pour une sortie structurée.
 *   Si omis, `data` sera le texte brut de la réponse.
 * @param {number} [params.maxTokens=1024]
 * @param {object} [injectedClient] - Client factice pour les tests (2e paramètre positionnel).
 *   Omis/undefined = utilise le client par défaut construit depuis l'environnement.
 * @returns {Promise<{ok:true, data:*} | {ok:false, raison:string}>}
 */
async function callVision(params, injectedClient) {
  const { imageUrl, model, systemPrompt, jsonSchema, maxTokens = 1024 } = params || {};
  const client = injectedClient !== undefined ? injectedClient : defaultClient;

  if (!client) return { ok: false, raison: 'desactive' };
  if (!imageUrl) return { ok: false, raison: 'image_manquante' };
  if (!model) return { ok: false, raison: 'model_manquant' };

  const requestParams = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: 'Analyse cette image selon les instructions ci-dessus.' }
      ]
    }]
  };
  if (jsonSchema) {
    requestParams.output_config = { format: { type: 'json_schema', schema: jsonSchema } };
  }

  let response;
  try {
    response = await client.messages.create(requestParams);
  } catch (e) {
    if (e && e.status === 429) return { ok: false, raison: 'quota' };
    if (e && typeof e.status === 'number' && e.status >= 500) return { ok: false, raison: 'erreur_serveur' };
    if (e && (e.name === 'APIConnectionError' || e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED')) {
      return { ok: false, raison: 'timeout' };
    }
    console.error('[L12 callVision] erreur inattendue:', e && e.message);
    return { ok: false, raison: 'erreur_api' };
  }

  if (response.stop_reason === 'refusal') {
    return { ok: false, raison: 'refus' };
  }

  const textBlock = (response.content || []).find(function (b) { return b.type === 'text'; });
  if (!textBlock || !textBlock.text) {
    return { ok: false, raison: 'reponse_vide' };
  }

  if (jsonSchema) {
    let data;
    try { data = JSON.parse(textBlock.text); }
    catch (e) { return { ok: false, raison: 'json_invalide' }; }
    return { ok: true, data };
  }
  return { ok: true, data: textBlock.text };
}

module.exports = { callVision, VISION_ENABLED };
