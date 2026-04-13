'use strict';

// Template : alerte de connexion depuis un nouvel IP
// data : { prenom, ip, user_agent, date }

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
  subject: (data) => `MotoKey — Nouvelle connexion détectée`,

  html: (data) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    ${header}
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Nouvelle connexion à votre compte</h1>
      <p style="color:#444;line-height:1.6;margin:0 0 20px;">
        Bonjour ${data.prenom},<br><br>
        Une connexion à votre compte MotoKey vient d'être enregistrée depuis un nouvel appareil ou une nouvelle localisation.
      </p>
      <div style="background:#f9f9f9;border-left:4px solid #ff6b00;padding:16px;border-radius:0 4px 4px 0;margin:0 0 20px;">
        <div style="font-size:13px;color:#555;line-height:1.8;">
          <strong>Date :</strong> ${data.date}<br>
          <strong>Adresse IP :</strong> ${data.ip || 'Inconnue'}<br>
          <strong>Appareil :</strong> ${data.user_agent ? data.user_agent.substring(0, 80) : 'Inconnu'}
        </div>
      </div>
      <p style="color:#444;line-height:1.6;margin:0 0 16px;">
        Si c'est bien vous, vous n'avez rien à faire.
      </p>
      <p style="color:#cc0000;font-size:13px;font-weight:600;margin:0;">
        Si vous ne reconnaissez pas cette connexion, changez immédiatement votre mot de passe
        et contactez-nous à <a href="mailto:motolab63@gmail.com" style="color:#cc0000;">motolab63@gmail.com</a>.
      </p>
    </div>
    ${footer}
  </div>
</body>
</html>`,

  text: (data) =>
    `Nouvelle connexion MotoKey\n\n` +
    `Bonjour ${data.prenom},\n\n` +
    `Une connexion a été détectée sur votre compte :\n` +
    `- Date : ${data.date}\n` +
    `- IP : ${data.ip || 'Inconnue'}\n` +
    `- Appareil : ${data.user_agent || 'Inconnu'}\n\n` +
    `Si c'est vous, aucune action n'est requise.\n` +
    `Dans le cas contraire, changez votre mot de passe et contactez motolab63@gmail.com.\n\n` +
    `— L'équipe MotoKey`
};
