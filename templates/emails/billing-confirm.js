'use strict';

// Template : confirmation d'abonnement MotoKey
// data : { nom, plan, trial_end_formatted, app_url }

const header = `
  <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0;">
    <span style="color:#ff6b00;font-size:22px;font-weight:700;letter-spacing:1px;">MOTO<span style="color:#fff;">KEY</span></span>
  </div>`;

const footer = `
  <div style="background:#f5f5f5;padding:16px 32px;border-radius:0 0 8px 8px;font-size:12px;color:#888;border-top:1px solid #e0e0e0;">
    MotoKey — Passeport numérique moto · MOTOLAB SAS · 142 Av. du Brézet, 63000 Clermont-Ferrand<br>
    <a href="mailto:motolab63@gmail.com" style="color:#888;">motolab63@gmail.com</a>
  </div>`;

module.exports = {
  subject: (data) => `Votre abonnement ${data.plan} est activé — MotoKey`,

  html: (data) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    ${header}
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Abonnement activé !</h1>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Bonjour ${data.nom},
      </p>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Votre essai gratuit <strong>${data.plan}</strong> est maintenant actif.
        Vous disposez de <strong>14 jours</strong> pour explorer toutes les fonctionnalités de MotoKey.
      </p>
      ${data.trial_end_formatted ? `<p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Votre essai se termine le <strong>${data.trial_end_formatted}</strong>. Pensez à renseigner
        votre moyen de paiement avant cette date pour éviter toute interruption de service.
      </p>` : ''}
      <div style="margin:24px 0;">
        <a href="${data.app_url || 'https://motokey11-production.up.railway.app'}"
           style="background:#ff6b00;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;">
          Accéder à MotoKey
        </a>
      </div>
      <p style="color:#888;font-size:13px;margin:0;">
        Pour gérer votre abonnement ou mettre à jour votre moyen de paiement,
        rendez-vous dans Paramètres → Abonnement depuis votre espace garage.
      </p>
    </div>
    ${footer}
  </div>
</body>
</html>`,

  text: (data) =>
    `Abonnement ${data.plan} activé — MotoKey\n\n` +
    `Bonjour ${data.nom},\n\n` +
    `Votre essai gratuit ${data.plan} est maintenant actif (14 jours).\n` +
    (data.trial_end_formatted ? `Fin de l'essai : ${data.trial_end_formatted}\n\n` : '\n') +
    `Accédez à votre espace : ${data.app_url || 'https://motokey11-production.up.railway.app'}\n\n` +
    `— L'équipe MotoKey`
};
