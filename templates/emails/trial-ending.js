'use strict';

// Template : J-3 avant fin de trial
// data : { nom, plan, trial_end_formatted, portal_url }

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
  subject: (data) => `Votre essai MotoKey se termine dans 3 jours`,

  html: (data) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    ${header}
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Votre essai se termine bientôt</h1>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Bonjour ${data.nom},
      </p>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Votre essai gratuit <strong>${data.plan}</strong> se termine le <strong>${data.trial_end_formatted}</strong>.
        Pour continuer à utiliser MotoKey sans interruption, ajoutez un moyen de paiement avant cette date.
      </p>
      <div style="background:#fff8e1;border:1px solid #f59e0b;border-radius:6px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#92400e;">
        ⚠️ Sans moyen de paiement, votre accès sera suspendu à l'expiration de l'essai.
        Vos données restent en sécurité et peuvent être réactivées à tout moment.
      </div>
      <div style="margin:24px 0;">
        <a href="${data.portal_url}"
           style="background:#ff6b00;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;">
          Ajouter un moyen de paiement
        </a>
      </div>
      <p style="color:#888;font-size:13px;margin:0;">
        Vous pouvez également gérer votre abonnement depuis Paramètres → Abonnement dans votre espace garage.
      </p>
    </div>
    ${footer}
  </div>
</body>
</html>`,

  text: (data) =>
    `Votre essai MotoKey se termine bientôt\n\n` +
    `Bonjour ${data.nom},\n\n` +
    `Votre essai ${data.plan} se termine le ${data.trial_end_formatted}.\n` +
    `Ajoutez un moyen de paiement pour continuer sans interruption :\n${data.portal_url}\n\n` +
    `Sans CB, votre accès sera suspendu à l'expiration. Vos données restent en sécurité.\n\n` +
    `— L'équipe MotoKey`
};
