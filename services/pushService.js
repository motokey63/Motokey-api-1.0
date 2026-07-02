/* ══════════════════════════════════════════════════════════
   MOTOKEY — Phase 13 — Push Dispatch Service
   Abstraction Expo Push + fallback console.log (dev)

   Variables Railway :
   - PUSH_ENABLED=true       → active l'envoi réel via Expo
   - EXPO_ACCESS_TOKEN       → optionnel (Enhanced Push Security EAS uniquement — omis pour l'instant)
   ══════════════════════════════════════════════════════════ */

'use strict';

const SBLayer = require('../supabase');

const PUSH_ENABLED = process.env.PUSH_ENABLED === 'true';
let expoClient = null;
let Expo = null;
try {
  ({ Expo } = require('expo-server-sdk'));
} catch (e) {
  console.warn('⚠️  [13] Module expo-server-sdk non disponible — fallback console:', e.message);
}
if (PUSH_ENABLED && Expo) {
  expoClient = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN }); // accessToken optionnel
  console.log('✅ [13] Expo push client initialisé');
} else if (!PUSH_ENABLED) {
  console.log('🔔 [13] Push en mode dev (PUSH_ENABLED=false) — console.log uniquement');
}

/**
 * Envoie une notification push à un token unique.
 * @param {string} token          Token Expo push (ExponentPushToken[...])
 * @param {object} payload        { title, body, data, clientId? }
 * @param {string} idempotencyKey Clé d'idempotence — un envoi par clé unique
 */
async function sendToToken(token, payload, idempotencyKey) {
  // Validation du token AVANT toute écriture DB — SC-4 doit fonctionner sans migration appliquée
  if (!Expo || !Expo.isExpoPushToken(token)) {
    console.warn('⚠️  [13] Token push invalide, ignoré:', token);
    return { skipped: 'invalid-token' };
  }

  // Garde d'idempotence (insert-first, miroir stripeService.js lignes 250-260)
  // RESEARCH Pitfall 4 : insert-first ⇒ un envoi échoué consomme quand même la clé ; un vrai retry doit utiliser une nouvelle clé.
  try {
    await SBLayer.PushSendLog.insert(idempotencyKey, payload.clientId || null, token);
  } catch (e) {
    if (e.message.includes('duplicate') || e.message.includes('unique') || e.message.includes('23505')) {
      console.log(`🔁 [13] Push idempotency-key "${idempotencyKey}" déjà envoyé — ignoré`);
      return { skipped: 'duplicate' };
    }
    // Erreur DB non-duplicate (ex: table absente, réseau) : on log et on POURSUIT l'envoi (fail-open, jamais throw)
    console.warn('⚠️  [13] push_send_log insert échouée (non-duplicate) — envoi poursuivi:', e.message);
  }

  if (PUSH_ENABLED && expoClient) {
    try {
      const messages = [{ to: token, sound: 'default', title: payload.title, body: payload.body, data: payload.data || {} }];
      const chunks = expoClient.chunkPushNotifications(messages);
      const tickets = [];
      for (const chunk of chunks) {
        const ticketChunk = await expoClient.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      }
      // Erreurs au niveau ticket UNIQUEMENT (RESEARCH Pitfall 1 — pas de polling de reçus dans cette phase)
      tickets.filter(t => t.status === 'error').forEach(t => {
        console.error('❌ [13] Ticket push en erreur:', t.message, t.details || '');
      });
      console.log(`🔔 [13] Push envoyé à ${token} (${tickets.length} ticket(s))`);
      return { sent: true, tickets };
    } catch (e) {
      console.error('❌ [13] Erreur envoi push à', token, ':', e.message); // jamais rethrow
      return { error: e.message };
    }
  } else {
    // Mode développement
    console.log(`\n🔔 [13][DEV] ─── Push "${payload.title}" ───`);
    console.log(`   Token : ${token}`);
    console.log(`   Body  : ${payload.body}`);
    console.log(`   Data  : ${JSON.stringify(payload.data || {})}`);
    console.log(`──────────────────────────────────────\n`);
    return { dev: true };
  }
}

module.exports = { sendToToken };
