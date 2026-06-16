'use strict';

// Template : échec de paiement — grace period déclenchée
// data : { nom, portal_url, grace_end_formatted }

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
  subject: (data) => `Action requise — Échec de paiement MotoKey`,

  html: (data) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    ${header}
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Échec de paiement</h1>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Bonjour ${data.nom},
      </p>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Le renouvellement de votre abonnement MotoKey n'a pas pu être traité.
        Votre accès reste actif pendant une <strong>période de grâce de 7 jours</strong>
        ${data.grace_end_formatted ? `jusqu'au <strong>${data.grace_end_formatted}</strong>` : ''}.
      </p>
      <div style="background:#fef2f2;border:1px solid #ef4444;border-radius:6px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#991b1b;">
        🔴 Passé ce délai, l'accès à MotoKey sera suspendu. Mettez à jour votre moyen de paiement dès maintenant.
      </div>
      <div style="margin:24px 0;">
        <a href="${data.portal_url}"
           style="background:#ff6b00;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;">
          Mettre à jour le paiement
        </a>
      </div>
      <p style="color:#888;font-size:13px;margin:0;">
        Si vous pensez qu'il s'agit d'une erreur, contactez-nous à
        <a href="mailto:motolab63@gmail.com" style="color:#888;">motolab63@gmail.com</a>.
      </p>
    </div>
    ${footer}
  </div>
</body>
</html>`,

  text: (data) =>
    `Échec de paiement MotoKey — action requise\n\n` +
    `Bonjour ${data.nom},\n\n` +
    `Le renouvellement de votre abonnement a échoué.\n` +
    `Période de grâce${data.grace_end_formatted ? ` jusqu'au ${data.grace_end_formatted}` : ' : 7 jours'}.\n\n` +
    `Mettez à jour votre moyen de paiement : ${data.portal_url}\n\n` +
    `— L'équipe MotoKey`
};
