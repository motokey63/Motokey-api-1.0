'use strict';

// Template : email de bienvenue envoyé après inscription
// data : { prenom, email }

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
  subject: (data) => `Bienvenue sur MotoKey, ${data.prenom} !`,

  html: (data) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    ${header}
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Bienvenue, ${data.prenom}&nbsp;!</h1>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Votre compte MotoKey a bien été créé. Vous pouvez maintenant accéder au passeport numérique
        de votre moto, consulter votre historique d'entretien et rester informé des alertes de maintenance.
      </p>
      <p style="color:#444;line-height:1.6;margin:0 0 24px;">
        Un email de vérification vient de vous être envoyé à <strong>${data.email}</strong>.
        Pensez à vérifier vos spams si vous ne le recevez pas.
      </p>
      <p style="color:#888;font-size:13px;margin:0;">
        Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.
      </p>
    </div>
    ${footer}
  </div>
</body>
</html>`,

  text: (data) =>
    `Bienvenue sur MotoKey, ${data.prenom} !\n\n` +
    `Votre compte MotoKey a bien été créé pour l'adresse ${data.email}.\n\n` +
    `Un email de vérification vient de vous être envoyé. Pensez à vérifier vos spams.\n\n` +
    `Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.\n\n` +
    `— L'équipe MotoKey`
};
