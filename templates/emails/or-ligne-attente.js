'use strict';

// Template : notification client — ligne(s) OR en attente d'acceptation
// data : { client_nom, moto, plaque, or_numero, lignes, lien }
// lignes : string[] — libellés des lignes (tâches/pièces) actuellement en attente sur cet OR

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
  subject: () => `MotoKey — Une intervention complémentaire attend votre accord`,

  html: (data) => {
    const items = (data.lignes || []).map(l => `<li style="margin:4px 0;">${l}</li>`).join('');
    return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    ${header}
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Bonjour ${data.client_nom},</h1>
      <p style="color:#444;line-height:1.6;margin:0 0 12px;">
        Une intervention complémentaire nécessite votre accord sur votre
        <strong>${data.moto}</strong> (${data.plaque}), OR <strong>${data.or_numero}</strong> :
      </p>
      <ul style="color:#444;line-height:1.6;margin:0 0 20px;padding-left:20px;">${items}</ul>
      <p style="color:#444;line-height:1.6;margin:0 0 24px;">
        Connectez-vous à votre espace MotoKey pour accepter ou refuser ces travaux
        complémentaires.
      </p>
      <a href="${data.lien}" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:700;">
        Voir mon dossier MotoKey
      </a>
    </div>
    ${footer}
  </div>
</body>
</html>`;
  },

  text: (data) => {
    const items = (data.lignes || []).map(l => `- ${l}`).join('\n');
    return `Bonjour ${data.client_nom},\n\n` +
      `Une intervention complémentaire nécessite votre accord sur votre ${data.moto} (${data.plaque}), OR ${data.or_numero} :\n` +
      `${items}\n\n` +
      `Connectez-vous à votre espace MotoKey pour accepter ou refuser : ${data.lien}\n\n` +
      `— L'équipe MotoKey`;
  }
};
