'use strict';

// Template : email de vérification d'adresse email
// data : { prenom, code, expires_minutes }

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
  subject: (data) => `MotoKey — Votre code de vérification : ${data.code}`,

  html: (data) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    ${header}
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Vérifiez votre adresse email</h1>
      <p style="color:#444;line-height:1.6;margin:0 0 24px;">
        Bonjour ${data.prenom},<br><br>
        Entrez le code ci-dessous dans l'application MotoKey pour activer votre compte.
        Ce code est valable ${data.expires_minutes || 15} minutes.
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <span style="display:inline-block;background:#ff6b00;color:#fff;font-size:32px;font-weight:700;
                     letter-spacing:8px;padding:16px 32px;border-radius:8px;">${data.code}</span>
      </div>
      <p style="color:#888;font-size:13px;margin:0;">
        Si vous n'avez pas créé de compte MotoKey, ignorez cet email.
        Ne communiquez ce code à personne.
      </p>
    </div>
    ${footer}
  </div>
</body>
</html>`,

  text: (data) =>
    `Vérification MotoKey\n\n` +
    `Bonjour ${data.prenom},\n\n` +
    `Votre code de vérification : ${data.code}\n\n` +
    `Ce code est valable ${data.expires_minutes || 15} minutes.\n\n` +
    `Ne communiquez ce code à personne.\n\n` +
    `— L'équipe MotoKey`
};
