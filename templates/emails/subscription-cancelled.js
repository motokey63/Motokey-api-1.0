'use strict';

// Template : annulation définitive d'abonnement (customer.subscription.deleted)
// data : { nom, plan, portal_url }

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
  subject: (data) => `Votre abonnement ${data.plan} a été résilié — MotoKey`,

  html: (data) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    ${header}
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Abonnement résilié</h1>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">Bonjour ${data.nom},</p>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Votre abonnement <strong>${data.plan}</strong> a été résilié et votre accès aux fonctionnalités
        MotoKey est désormais désactivé. Vos données restent conservées.
      </p>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Vous pouvez réactiver votre abonnement à tout moment depuis votre espace garage.
      </p>
      <div style="margin:24px 0;">
        <a href="${data.portal_url}"
           style="background:#ff6b00;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;">
          Réactiver mon abonnement
        </a>
      </div>
      <p style="color:#888;font-size:13px;margin:0;">
        Une question ? Contactez-nous à
        <a href="mailto:motolab63@gmail.com" style="color:#888;">motolab63@gmail.com</a>.
      </p>
    </div>
    ${footer}
  </div>
</body>
</html>`,

  text: (data) =>
    `Abonnement ${data.plan} résilié — MotoKey\n\n` +
    `Bonjour ${data.nom},\n\n` +
    `Votre abonnement ${data.plan} a été résilié. Votre accès est désactivé, vos données sont conservées.\n\n` +
    `Réactiver à tout moment : ${data.portal_url}\n\n` +
    `— L'équipe MotoKey`
};
