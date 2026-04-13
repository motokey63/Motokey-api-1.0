/* ══════════════════════════════════════════════════════════
   MOTOKEY — Livraison 7b — Service email
   Abstraction Resend + fallback console.log (dev)

   Variables Railway :
   - EMAIL_ENABLED=true      → active l'envoi réel via Resend
   - RESEND_API_KEY          → clé API Resend
   - RESEND_FROM             → expéditeur (ex: "MotoKey <noreply@motokey.fr>")
   - AUTH_DEV_RETURN_CODES   → si true, les codes sont exposés dans la réponse API
   ══════════════════════════════════════════════════════════ */

'use strict';

const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
const RESEND_FROM   = process.env.RESEND_FROM || 'MotoKey <noreply@motokey.fr>';

let resendClient = null;
if (EMAIL_ENABLED) {
  try {
    const { Resend } = require('resend');
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️  [7b] EMAIL_ENABLED=true mais RESEND_API_KEY manquant — fallback console');
    } else {
      resendClient = new Resend(process.env.RESEND_API_KEY);
      console.log('✅ [7b] Resend initialisé');
    }
  } catch (e) {
    console.warn('⚠️  [7b] Module resend non disponible — fallback console:', e.message);
  }
} else {
  console.log('📧 [7b] Email en mode dev (EMAIL_ENABLED=false) — console.log uniquement');
}

const TEMPLATES = {
  welcome:       require('../templates/emails/welcome'),
  verify:        require('../templates/emails/verify'),
  reset:         require('../templates/emails/reset'),
  'login-alert': require('../templates/emails/login-alert')
};

/**
 * Envoie un email transactionnel.
 * @param {string} template  Clé du template (welcome|verify|reset|login-alert)
 * @param {string} to        Adresse destinataire
 * @param {object} data      Données passées au template
 */
async function send(template, to, data) {
  const tpl = TEMPLATES[template];
  if (!tpl) {
    console.error(`❌ [7b] emailService.send — template inconnu: "${template}"`);
    return;
  }

  const subject = tpl.subject(data);
  const html    = tpl.html(data);
  const text    = tpl.text(data);

  if (EMAIL_ENABLED && resendClient) {
    try {
      await resendClient.emails.send({ from: RESEND_FROM, to, subject, html, text });
      console.log(`📧 [7b] Email "${template}" envoyé à ${to}`);
    } catch (e) {
      // On ne lève pas l'erreur : l'email ne doit pas bloquer le flux auth
      console.error(`❌ [7b] Erreur envoi email "${template}" à ${to}:`, e.message);
    }
  } else {
    // Mode développement
    console.log(`\n📧 [7b][DEV] ─── Email "${template}" ──────────────`);
    console.log(`   À      : ${to}`);
    console.log(`   Sujet  : ${subject}`);
    console.log(`   Texte  : ${text.replace(/\n/g, '\n   ')}`);
    console.log(`──────────────────────────────────────────────────\n`);
  }
}

module.exports = { send };
