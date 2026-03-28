/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║     MOTOKEY — NOTIFICATIONS (notifications.js)          ║
 * ║     SMS Twilio · Email Resend · Push Supabase           ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * DÉPENDANCES : npm install twilio resend
 * CONFIG .env :
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_FROM
 *   RESEND_API_KEY / EMAIL_FROM
 */

'use strict';

const https = require('https');
const crypto = require('crypto');

const CFG = {
  twilio: {
    sid:   process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    from:  process.env.TWILIO_PHONE_FROM || '+33XXXXXXXXX',
  },
  resend: {
    key:  process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || 'MotoKey <noreply@motokey.fr>',
  },
  app: { url: process.env.FRONTEND_URL || 'https://motokey.fr' }
};

/* ─── HTTP helper ─── */
function post(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body);
    const req  = https.request({ hostname, path, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/* ─── Format numéro FR ─── */
function toE164(tel) {
  const t = (tel || '').replace(/[\s.\-()]/g, '');
  if (t.startsWith('+')) return t;
  if (t.startsWith('00')) return '+' + t.slice(2);
  if (t.startsWith('0'))  return '+33' + t.slice(1);
  return t;
}

/* ══════════════════════════════════════════════════════════
   SMS TEMPLATES
══════════════════════════════════════════════════════════ */
const SMS = {

  templates: {
    nouvelle_intervention: d =>
      `🏍️ MotoKey — ${d.garage_nom}\n` +
      `Nouvelle intervention sur votre ${d.moto} :\n` +
      `📋 ${d.titre}\n📍 ${d.km} km · ${d.date}\n` +
      `Voir votre dossier : ${CFG.app.url}/client`,

    alerte_entretien: d =>
      `⚠️ MotoKey — Rappel entretien\n` +
      `${d.moto} : 🔧 ${d.operation}\n` +
      (d.km_restant > 0
        ? `Dans ~${d.km_restant.toLocaleString('fr-FR')} km`
        : `🚨 Dépassé — intervention urgente`) +
      `\nRDV : ${CFG.app.url}/rdv`,

    devis_envoye: d =>
      `📄 Devis N° ${d.numero} — ${d.garage_nom}\n` +
      `${d.moto} · Total TTC : ${d.total_ttc}€\n` +
      `Consulter : ${CFG.app.url}/devis/${d.devis_id}`,

    facture_validee: d =>
      `✅ Facture confirmée — ${d.moto}\n` +
      `${d.date} · ${d.total_ttc}€ TTC\n` +
      `Score MotoKey : ${d.score}/100 — Dossier mis à jour`,

    transfert_vendeur: d =>
      `🔑 Code de cession MotoKey\n` +
      `Vente : ${d.moto} — ${d.prix}€\n` +
      `Code : ${d.code} (48h)\n` +
      `Confirmer : ${CFG.app.url}/transfert/${d.code}`,

    transfert_acheteur: d =>
      `🏍️ Dossier moto disponible\n` +
      `${d.moto} — partagé par ${d.vendeur}\n` +
      `Code : ${d.code}\n` +
      `Consulter : ${CFG.app.url}/consulter/${d.code}`,

    transfert_finalise: d =>
      `🎉 Transfert finalisé !\n` +
      `${d.moto} — Certificat N° ${d.certificat_id}\n` +
      `Votre dossier : ${CFG.app.url}/client`,

    bienvenue: d =>
      `👋 Bienvenue sur MotoKey !\n` +
      `${d.garage_nom} a créé votre dossier : ${d.moto}\n` +
      `Accéder : ${CFG.app.url}/client`,

    fraude_alerte: d =>
      `🚨 MotoKey — Alerte fraude\n` +
      `Facture suspecte sur ${d.plaque}\n` +
      `Score : ${d.score}% — Vérifier dans l'app`,
  },

  async envoyer(to, message) {
    if (!CFG.twilio.sid || !CFG.twilio.token) {
      console.log(`[SMS SIMULÉ] → ${to}: ${message.slice(0, 60)}...`);
      return { sid: 'SIM_' + Date.now(), status: 'simulated' };
    }
    const body = new URLSearchParams({
      From: CFG.twilio.from, To: toE164(to), Body: message
    }).toString();
    const auth = Buffer.from(`${CFG.twilio.sid}:${CFG.twilio.token}`).toString('base64');
    const r = await post(
      'api.twilio.com',
      `/2010-04-01/Accounts/${CFG.twilio.sid}/Messages.json`,
      { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    );
    if (r.status >= 400) throw new Error(`SMS: ${r.body?.message || r.status}`);
    console.log(`[SMS OK] ${to} → ${r.body.sid}`);
    return { sid: r.body.sid, status: r.body.status };
  },

  async send(to, template, data) {
    const fn = SMS.templates[template];
    if (!fn) throw new Error(`Template SMS inconnu: ${template}`);
    return SMS.envoyer(to, fn(data));
  }
};

/* ══════════════════════════════════════════════════════════
   EMAIL TEMPLATES
══════════════════════════════════════════════════════════ */
function baseEmail(titre, contenu) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f1ec;margin:0;padding:20px}
    .w{background:#fff;border-radius:14px;max-width:520px;margin:0 auto;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .h{background:#0d0f12;padding:22px;text-align:center}
    .logo{font-size:26px;font-weight:900;color:#fff;letter-spacing:1px}
    .logo em{color:#ff6b00;font-style:normal}
    .b{padding:26px}
    .btn{display:block;background:#ff6b00;color:#fff;text-align:center;text-decoration:none;padding:14px;border-radius:10px;font-weight:700;margin-top:18px;font-size:15px}
    .foot{text-align:center;font-size:11px;color:#a89e92;padding:14px;border-top:1px solid #e8e3d8}
    .tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
    .tg{background:#dcfce7;color:#16a34a} .tb{background:#dbeafe;color:#1d4ed8}
    .ty{background:#fef9c3;color:#a16207} .tr{background:#fee2e2;color:#b91c1c}
    table{width:100%;border-collapse:collapse;margin:14px 0;font-size:13px}
    th{background:#f4f1ec;padding:7px 10px;text-align:left;font-size:11px;color:#8b9199;text-transform:uppercase}
    td{padding:9px 10px;border-bottom:1px solid #f4f1ec}
    .ttc td{background:#0d0f12;color:#fff;font-weight:700;font-size:15px;border:none}
  </style></head><body><div class="w">
    <div class="h"><div class="logo">MOTO<em>KEY</em></div></div>
    <div class="b">${contenu}</div>
    <div class="foot">MotoKey · Passeport numérique moto · <a href="https://motokey.fr">motokey.fr</a></div>
  </div></body></html>`;
}

function scoreBadge(score, couleur) {
  const cls = { vert:'tg', bleu:'tb', jaune:'ty', rouge:'tr' }[couleur] || 'tb';
  const lbl = { vert:'✅ EXCELLENT', bleu:'🔵 BON', jaune:'🟡 MOYEN', rouge:'🔴 INSUFFISANT' }[couleur] || '';
  return `<span class="tag ${cls}">${lbl} ${score}/100</span>`;
}

const EMAIL = {

  templates: {

    nouvelle_intervention: d => ({
      subject: `🏍️ Nouvelle intervention — ${d.moto}`,
      html: baseEmail('Nouvelle intervention', `
        <p style="color:#8b9199;font-size:11px;text-transform:uppercase;letter-spacing:2px">Nouvelle intervention</p>
        <h2 style="margin:4px 0 2px">${d.moto}</h2>
        <p style="color:#6b6459;margin:0 0 16px">${d.plaque}</p>
        <div style="background:#f4f1ec;border-left:4px solid #3b82f6;border-radius:8px;padding:14px;margin:14px 0">
          <div style="font-size:15px;font-weight:700;margin-bottom:5px">${d.titre}</div>
          <div style="font-size:13px;color:#6b6459">
            👨‍🔧 ${d.technicien} · 📅 ${d.date}<br>
            📍 ${d.km} km${d.montant_ht ? ` · 💶 ${d.montant_ht}€ HT` : ''}
          </div>
        </div>
        <div style="display:flex;gap:16px;margin:14px 0">
          <div style="flex:1;text-align:center;background:#f4f1ec;border-radius:8px;padding:12px">
            <div style="font-size:11px;color:#8b9199;margin-bottom:4px">SCORE MOTOKEY</div>
            ${scoreBadge(d.score, d.couleur)}
          </div>
          <div style="flex:1;text-align:center;background:#f4f1ec;border-radius:8px;padding:12px">
            <div style="font-size:11px;color:#8b9199;margin-bottom:4px">ANTI-FRAUDE</div>
            <div style="font-size:18px;font-weight:700;color:#a855f7">${d.score_confiance}%</div>
          </div>
        </div>
        <p style="font-size:13px;color:#6b6459;line-height:1.6">
          Enregistré par <strong>${d.garage_nom}</strong> dans votre dossier numérique.
        </p>
        <a href="${CFG.app.url}/client" class="btn">📱 Voir mon dossier MotoKey</a>
      `)
    }),

    devis_client: d => ({
      subject: `📄 Devis N° ${d.numero} — ${d.total_ttc}€ TTC`,
      html: baseEmail('Devis', `
        <p style="color:#8b9199;font-size:11px;text-transform:uppercase;letter-spacing:2px">Devis N° ${d.numero}</p>
        <h2 style="margin:4px 0 2px">${d.garage_nom}</h2>
        <p style="color:#6b6459;margin:0 0 16px">${d.moto}</p>
        <table>
          <tr><th>Prestation</th><th style="text-align:right">HT</th></tr>
          ${(d.lignes || []).map(l =>
            `<tr><td>${l.description}</td><td style="text-align:right">${l.total_ht}€</td></tr>`
          ).join('')}
          ${d.remise_globale > 0 ? `<tr><td style="color:#22c55e">Remise ${d.remise_type}</td><td style="text-align:right;color:#22c55e">-${d.remise_globale}€</td></tr>` : ''}
          <tr><td style="color:#8b9199">TVA ${d.tva}%</td><td style="text-align:right;color:#8b9199">${d.tva_montant}€</td></tr>
          <tr class="ttc"><td>TOTAL TTC</td><td style="text-align:right;color:#ff6b00">${d.total_ttc}€</td></tr>
        </table>
        ${d.remise_note ? `<p style="font-size:12px;color:#22c55e;margin-top:8px">💚 ${d.remise_note}</p>` : ''}
        <a href="${CFG.app.url}/devis/${d.devis_id}" class="btn">📄 Voir le devis complet</a>
      `)
    }),

    transfert_vendeur: d => ({
      subject: `🔑 Code de cession — ${d.moto}`,
      html: baseEmail('Code de cession', `
        <h2 style="margin-bottom:6px">Code de cession 🔑</h2>
        <p style="color:#6b6459;margin:0 0 16px">Vente : <strong>${d.moto}</strong> · ${d.prix}€ · ${d.km_cession} km</p>
        <div style="background:#0d0f12;border:2px solid #ff6b00;border-radius:12px;padding:22px;text-align:center;margin:16px 0">
          <div style="color:#8b9199;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Code MotoKey</div>
          <div style="font-size:34px;font-weight:900;color:#ff6b00;letter-spacing:6px">${d.code}</div>
          <div style="color:#8b9199;font-size:12px;margin-top:8px">Valable 48 heures · Ne pas partager</div>
        </div>
        <div style="background:#fef2f2;border-left:3px solid #ef4444;border-radius:8px;padding:12px;font-size:13px;color:#b91c1c;margin:14px 0">
          ⚠️ Après le transfert, vous n'aurez plus accès au dossier numérique de ce véhicule.
        </div>
        <a href="${CFG.app.url}/transfert/${d.code}" class="btn">Confirmer la vente</a>
      `)
    }),

    transfert_acheteur: d => ({
      subject: `🏍️ Dossier moto disponible — ${d.moto}`,
      html: baseEmail('Dossier disponible', `
        <h2 style="margin-bottom:6px">Dossier disponible 📋</h2>
        <p style="color:#6b6459;margin:0 0 16px">${d.vendeur} partage le dossier de <strong>${d.moto}</strong></p>
        <div style="background:#f4f1ec;border-radius:10px;padding:16px;text-align:center;margin:14px 0">
          <div style="font-size:28px;margin-bottom:6px">🏍️</div>
          <div style="font-size:18px;font-weight:700">${d.moto}</div>
          <div style="margin-top:8px">${scoreBadge(d.score, d.couleur)}</div>
          <div style="font-size:13px;color:#6b6459;margin-top:6px">${d.nb_interventions} interventions · ${d.km} km</div>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;font-size:13px;color:#16a34a;margin:14px 0">
          ✅ Toutes les factures sont certifiées anti-fraude MotoKey
        </div>
        <a href="${CFG.app.url}/consulter/${d.code}" class="btn">📋 Consulter le dossier complet</a>
      `)
    }),

    certificat_transfert: d => ({
      subject: `🎉 Transfert finalisé — Certificat ${d.certificat_id}`,
      html: baseEmail('Transfert finalisé', `
        <h2 style="margin-bottom:6px">Transfert finalisé ! 🎉</h2>
        <p style="color:#6b6459;margin:0 0 16px">Le transfert de <strong>${d.moto}</strong> est confirmé.</p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:18px;margin:14px 0">
          <div style="font-size:11px;color:#8b9199;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px">Certificat MotoKey</div>
          <div style="font-size:13px;color:#374151;line-height:2">
            📋 N° <strong>${d.certificat_id}</strong><br>
            🏍️ Véhicule : <strong>${d.moto}</strong><br>
            📅 Date : <strong>${d.date}</strong><br>
            💶 Prix : <strong>${d.prix}€</strong><br>
            📍 Kilométrage : <strong>${d.km} km</strong>
          </div>
        </div>
        <p style="font-size:12px;color:#8b9199;font-family:monospace;word-break:break-all">
          SHA-256 : ${d.hash}
        </p>
        <a href="${CFG.app.url}/client" class="btn">📱 Accéder à mon dossier</a>
      `)
    }),

    bienvenue: d => ({
      subject: `👋 Bienvenue sur MotoKey — ${d.moto}`,
      html: baseEmail('Bienvenue', `
        <h2 style="margin-bottom:6px">Bienvenue ${d.client_nom} ! 👋</h2>
        <p style="color:#6b6459;margin:0 0 16px"><strong>${d.garage_nom}</strong> a créé votre dossier numérique :</p>
        <div style="background:#f4f1ec;border-radius:12px;padding:18px;text-align:center;margin:14px 0">
          <div style="font-size:28px;margin-bottom:8px">🏍️</div>
          <div style="font-size:20px;font-weight:700">${d.moto}</div>
          <div style="color:#8b9199;font-size:13px;margin-top:4px">${d.plaque}</div>
        </div>
        <div style="display:grid;gap:8px;margin:14px 0">
          ${[
            ['📋','Historique complet de toutes vos interventions'],
            ['🔧','Plan d\'entretien constructeur avec alertes automatiques'],
            ['🛡️','Chaque facture certifiée anti-fraude'],
            ['🔑','Transfert numérique sécurisé lors d\'une revente'],
          ].map(([ic,t]) => `<div style="display:flex;gap:10px;align-items:center;font-size:13px;color:#6b6459"><span style="font-size:18px">${ic}</span>${t}</div>`).join('')}
        </div>
        <a href="${CFG.app.url}/client" class="btn">📱 Accéder à mon dossier</a>
      `)
    }),
  },

  async envoyer({ to, subject, html, attachments = [] }) {
    if (!CFG.resend.key) {
      console.log(`[EMAIL SIMULÉ] → ${to} | ${subject}`);
      return { id: 'SIM_' + Date.now(), status: 'simulated' };
    }
    const payload = { from: CFG.resend.from, to: [to], subject, html };
    if (attachments.length) payload.attachments = attachments;
    const r = await post(
      'api.resend.com', '/emails',
      { 'Authorization': `Bearer ${CFG.resend.key}`, 'Content-Type': 'application/json' },
      payload
    );
    if (r.status >= 400) throw new Error(`Email: ${JSON.stringify(r.body)}`);
    console.log(`[EMAIL OK] → ${to} | ${r.body.id}`);
    return { id: r.body.id, status: 'sent' };
  },

  async send(to, template, data) {
    const fn = EMAIL.templates[template];
    if (!fn) throw new Error(`Template email inconnu: ${template}`);
    return EMAIL.envoyer({ to, ...fn(data) });
  },

  async sendWithPDF(to, template, data, pdfBuffer, filename) {
    const fn = EMAIL.templates[template];
    if (!fn) throw new Error(`Template email inconnu: ${template}`);
    return EMAIL.envoyer({
      to, ...fn(data),
      attachments: [{
        filename: filename || 'facture.pdf',
        content:  pdfBuffer.toString('base64'),
      }]
    });
  }
};

/* ══════════════════════════════════════════════════════════
   ÉVÉNEMENTS MÉTIER — 1 appel = SMS + Email ensemble
══════════════════════════════════════════════════════════ */
const Notif = {

  /**
   * Nouvelle intervention ajoutée par le garage → notifier le client
   */
  async nouvelleIntervention({ client, garage, moto, intervention }) {
    const data = {
      garage_nom:    garage.nom,
      moto:          `${moto.marque} ${moto.modele}`,
      plaque:        moto.plaque,
      titre:         intervention.titre,
      km:            intervention.km?.toLocaleString('fr-FR'),
      date:          intervention.date_intervention || new Date().toLocaleDateString('fr-FR'),
      technicien:    intervention.technicien || garage.nom,
      montant_ht:    intervention.montant_ht,
      score:         moto.score,
      couleur:       moto.couleur_dossier,
      score_confiance: intervention.score_confiance || 0,
    };
    const results = {};
    if (client.tel)   results.sms   = await SMS.send(client.tel, 'nouvelle_intervention', data).catch(e => ({ error: e.message }));
    if (client.email) results.email = await EMAIL.send(client.email, 'nouvelle_intervention', data).catch(e => ({ error: e.message }));
    return results;
  },

  /**
   * Devis envoyé au client
   */
  async devisEnvoye({ client, garage, moto, devis, totaux }) {
    const data = {
      garage_nom:     garage.nom,
      moto:           `${moto.marque} ${moto.modele}`,
      plaque:         moto.plaque,
      numero:         devis.numero,
      devis_id:       devis.id,
      lignes:         devis.devis_lignes || devis.lignes || [],
      remise_type:    devis.remise_type,
      remise_globale: totaux?.remise_globale || 0,
      remise_note:    devis.remise_note,
      tva:            devis.tva,
      tva_montant:    totaux?.tva_montant || 0,
      total_ttc:      totaux?.total_ttc || 0,
    };
    const results = {};
    if (client.tel)   results.sms   = await SMS.send(client.tel, 'devis_envoye', { ...data, total_ttc: data.total_ttc }).catch(e => ({ error: e.message }));
    if (client.email) results.email = await EMAIL.send(client.email, 'devis_client', data).catch(e => ({ error: e.message }));
    return results;
  },

  /**
   * Devis validé → facture + PDF joint optionnel
   */
  async factureValidee({ client, garage, moto, devis, totaux, pdfBuffer }) {
    const data = {
      moto:       `${moto.marque} ${moto.modele}`,
      plaque:     moto.plaque,
      date:       new Date().toLocaleDateString('fr-FR'),
      total_ttc:  totaux?.total_ttc || 0,
      score:      moto.score,
      couleur:    moto.couleur_dossier,
    };
    const results = {};
    if (client.tel)   results.sms = await SMS.send(client.tel, 'facture_validee', data).catch(e => ({ error: e.message }));
    if (client.email) {
      if (pdfBuffer) {
        results.email = await EMAIL.sendWithPDF(
          client.email, 'devis_client', { ...data, garage_nom: garage.nom, numero: devis.numero, lignes: devis.lignes || [], remise_type: devis.remise_type, remise_globale: totaux?.remise_globale || 0, tva: devis.tva, tva_montant: totaux?.tva_montant || 0, devis_id: devis.id },
          pdfBuffer, `Facture_${devis.numero}.pdf`
        ).catch(e => ({ error: e.message }));
      } else {
        results.email = await EMAIL.send(client.email, 'devis_client', { ...data, garage_nom: garage.nom, numero: devis.numero, lignes: [], remise_type: '', remise_globale: 0, tva: 20, tva_montant: 0, devis_id: devis.id }).catch(e => ({ error: e.message }));
      }
    }
    return results;
  },

  /**
   * Initiation transfert → code au vendeur + info à l'acheteur
   */
  async transfertInitie({ vendeur, acheteur, moto, transfert }) {
    const results = {};
    const dataVendeur = {
      moto: `${moto.marque} ${moto.modele}`, code: transfert.code,
      prix: transfert.prix, km_cession: transfert.km_cession,
    };
    const dataAcheteur = {
      moto: `${moto.marque} ${moto.modele}`, code: transfert.code,
      vendeur: vendeur.nom, score: moto.score, couleur: moto.couleur_dossier,
      km: moto.km, nb_interventions: transfert.nb_interventions || 0,
    };
    if (vendeur.tel)          results.sms_vendeur   = await SMS.send(vendeur.tel, 'transfert_vendeur', dataVendeur).catch(e => ({ error: e.message }));
    if (vendeur.email)        results.email_vendeur = await EMAIL.send(vendeur.email, 'transfert_vendeur', dataVendeur).catch(e => ({ error: e.message }));
    if (transfert.acheteur_tel)   results.sms_acheteur   = await SMS.send(transfert.acheteur_tel, 'transfert_acheteur', dataAcheteur).catch(e => ({ error: e.message }));
    if (transfert.acheteur_email) results.email_acheteur = await EMAIL.send(transfert.acheteur_email, 'transfert_acheteur', dataAcheteur).catch(e => ({ error: e.message }));
    return results;
  },

  /**
   * Transfert finalisé → certificat aux deux parties
   */
  async transfertFinalise({ vendeur, acheteur, moto, transfert, certificat }) {
    const data = {
      moto: `${moto.marque} ${moto.modele}`, plaque: moto.plaque,
      certificat_id: certificat.id, hash: certificat.hash,
      prix: transfert.prix, km: transfert.km_cession,
      date: new Date().toLocaleDateString('fr-FR'),
    };
    const results = {};
    if (acheteur?.tel)   results.sms_acheteur   = await SMS.send(acheteur.tel, 'transfert_finalise', data).catch(e => ({ error: e.message }));
    if (acheteur?.email) results.email_acheteur = await EMAIL.send(acheteur.email, 'certificat_transfert', data).catch(e => ({ error: e.message }));
    if (vendeur?.email)  results.email_vendeur  = await EMAIL.send(vendeur.email, 'certificat_transfert', data).catch(e => ({ error: e.message }));
    return results;
  },

  /**
   * Bienvenue nouveau client
   */
  async bienvenue({ client, garage, moto }) {
    const data = {
      client_nom: client.nom, garage_nom: garage.nom,
      moto: `${moto.marque} ${moto.modele} ${moto.annee}`,
      plaque: moto.plaque,
    };
    const results = {};
    if (client.tel)   results.sms   = await SMS.send(client.tel, 'bienvenue', data).catch(e => ({ error: e.message }));
    if (client.email) results.email = await EMAIL.send(client.email, 'bienvenue', data).catch(e => ({ error: e.message }));
    return results;
  },

  /**
   * Alertes entretien automatiques (cron quotidien)
   * Envoie les rappels aux clients dont un entretien est dû
   */
  async envoyerAlertes(alertes) {
    const results = [];
    for (const alerte of alertes) {
      const { client, moto, operation, km_restant } = alerte;
      const data = {
        moto: `${moto.marque} ${moto.modele}`,
        operation, km_restant,
      };
      const r = { client_id: client.id, operation };
      if (client.tel) r.sms = await SMS.send(client.tel, 'alerte_entretien', data).catch(e => ({ error: e.message }));
      results.push(r);
    }
    return results;
  }
};

/* ══════════════════════════════════════════════════════════
   CRON — Alertes automatiques quotidiennes
══════════════════════════════════════════════════════════ */
const Cron = {

  /**
   * À lancer chaque matin avec node-cron ou un service cron externe
   * Exemple : '0 9 * * *' = tous les jours à 9h
   *
   * Avec node-cron :
   *   const cron = require('node-cron');
   *   cron.schedule('0 9 * * *', Cron.alertesEntretien);
   */
  async alertesEntretien(supabaseClient) {
    console.log('[CRON] Vérification des alertes entretien...');
    try {
      // Récupérer toutes les motos avec leur plan et le contact client
      const { data: plans } = await supabaseClient
        .from('plan_entretien')
        .select('*, motos(km, marque, modele, clients(nom, tel, email))')
        .gt('km_interval', 0);

      const alertes = [];
      for (const op of (plans || [])) {
        const moto = op.motos;
        if (!moto) continue;
        const since = moto.km - op.km_derniere;
        const pct   = (since / op.km_interval) * 100;
        if (pct >= 90) { // Alerte à 90% du kilométrage
          alertes.push({
            client:     moto.clients,
            moto,
            operation:  op.nom,
            km_restant: Math.max(0, op.km_interval - since),
          });
        }
      }

      if (alertes.length > 0) {
        const r = await Notif.envoyerAlertes(alertes);
        console.log(`[CRON] ${r.length} alerte(s) envoyée(s)`);
      } else {
        console.log('[CRON] Aucune alerte à envoyer aujourd\'hui');
      }
    } catch (e) {
      console.error('[CRON] Erreur:', e.message);
    }
  }
};

module.exports = { SMS, EMAIL, Notif, Cron };
