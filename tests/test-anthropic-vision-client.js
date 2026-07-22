'use strict';
// Tests purs du socle callVision — AUCUN appel réseau, AUCUN crédit dépensé.
// Injecte un client Anthropic factice (2e paramètre de callVision) pour
// exercer chaque branche de gestion d'erreur du contrat { ok, raison }.
// Usage : node tests/test-anthropic-vision-client.js (pas de serveur requis)

const { callVision } = require('../services/anthropicVisionClient');

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

function fakeClient(createImpl) {
  return { messages: { create: createImpl } };
}

const SCHEMA = {
  type: 'object',
  properties: { libelle: { type: ['string', 'null'] } },
  required: ['libelle'],
  additionalProperties: false
};

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Tests purs callVision (L12 socle) ─ sans crédit       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // ── VISION_ENABLED=false en dev (défaut du process courant) ──────────────
  {
    const r = await callVision({ imageUrl: 'https://example.com/x.jpg', model: 'claude-haiku-4-5', systemPrompt: 'x' });
    check('VISION_ENABLED=false (défaut dev) → {ok:false, raison:desactive}', r.ok === false && r.raison === 'desactive', JSON.stringify(r));
  }

  // ── imageUrl manquante (client factice pour bypasser le gate "desactive") ─
  {
    const client = fakeClient(async () => { throw new Error('ne doit jamais être appelé'); });
    const r = await callVision({ model: 'claude-haiku-4-5', systemPrompt: 'x' }, client);
    check('imageUrl manquante → {ok:false, raison:image_manquante}', r.ok === false && r.raison === 'image_manquante', JSON.stringify(r));
  }

  // ── model manquant ─────────────────────────────────────────────────────
  {
    const client = fakeClient(async () => { throw new Error('ne doit jamais être appelé'); });
    const r = await callVision({ imageUrl: 'https://example.com/x.jpg', systemPrompt: 'x' }, client);
    check('model manquant → {ok:false, raison:model_manquant}', r.ok === false && r.raison === 'model_manquant', JSON.stringify(r));
  }

  // ── succès, sortie structurée ──────────────────────────────────────────
  {
    const client = fakeClient(async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify({ libelle: 'Plaquettes avant' }) }]
    }));
    const r = await callVision({ imageUrl: 'https://example.com/x.jpg', model: 'claude-haiku-4-5', systemPrompt: 'x', jsonSchema: SCHEMA }, client);
    check('succès + jsonSchema → {ok:true, data:{libelle}}', r.ok === true && r.data && r.data.libelle === 'Plaquettes avant', JSON.stringify(r));
  }

  // ── succès, texte libre (pas de jsonSchema) ────────────────────────────
  {
    const client = fakeClient(async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Une description libre.' }]
    }));
    const r = await callVision({ imageUrl: 'https://example.com/x.jpg', model: 'claude-haiku-4-5', systemPrompt: 'x' }, client);
    check('succès sans jsonSchema → {ok:true, data:string}', r.ok === true && r.data === 'Une description libre.', JSON.stringify(r));
  }

  // ── JSON invalide dans la réponse ──────────────────────────────────────
  {
    const client = fakeClient(async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'pas du JSON valide {{{' }]
    }));
    const r = await callVision({ imageUrl: 'https://example.com/x.jpg', model: 'claude-haiku-4-5', systemPrompt: 'x', jsonSchema: SCHEMA }, client);
    check('JSON invalide → {ok:false, raison:json_invalide}', r.ok === false && r.raison === 'json_invalide', JSON.stringify(r));
  }

  // ── refus (stop_reason refusal) ────────────────────────────────────────
  {
    const client = fakeClient(async () => ({ stop_reason: 'refusal', content: [] }));
    const r = await callVision({ imageUrl: 'https://example.com/x.jpg', model: 'claude-haiku-4-5', systemPrompt: 'x' }, client);
    check('stop_reason refusal → {ok:false, raison:refus}', r.ok === false && r.raison === 'refus', JSON.stringify(r));
  }

  // ── réponse sans bloc texte ─────────────────────────────────────────────
  {
    const client = fakeClient(async () => ({ stop_reason: 'end_turn', content: [] }));
    const r = await callVision({ imageUrl: 'https://example.com/x.jpg', model: 'claude-haiku-4-5', systemPrompt: 'x' }, client);
    check('content vide → {ok:false, raison:reponse_vide}', r.ok === false && r.raison === 'reponse_vide', JSON.stringify(r));
  }

  // ── erreur 429 (quota) ──────────────────────────────────────────────────
  {
    const client = fakeClient(async () => { const e = new Error('rate limited'); e.status = 429; throw e; });
    const r = await callVision({ imageUrl: 'https://example.com/x.jpg', model: 'claude-haiku-4-5', systemPrompt: 'x' }, client);
    check('erreur 429 → {ok:false, raison:quota}', r.ok === false && r.raison === 'quota', JSON.stringify(r));
  }

  // ── erreur 500 ──────────────────────────────────────────────────────────
  {
    const client = fakeClient(async () => { const e = new Error('server error'); e.status = 503; throw e; });
    const r = await callVision({ imageUrl: 'https://example.com/x.jpg', model: 'claude-haiku-4-5', systemPrompt: 'x' }, client);
    check('erreur 5xx → {ok:false, raison:erreur_serveur}', r.ok === false && r.raison === 'erreur_serveur', JSON.stringify(r));
  }

  // ── erreur générique inattendue ─────────────────────────────────────────
  {
    const client = fakeClient(async () => { throw new Error('boom'); });
    const r = await callVision({ imageUrl: 'https://example.com/x.jpg', model: 'claude-haiku-4-5', systemPrompt: 'x' }, client);
    check('erreur générique → {ok:false, raison:erreur_api}', r.ok === false && r.raison === 'erreur_api', JSON.stringify(r));
  }

  // ── garde-fou : jamais de throw qui remonte à l'appelant ───────────────
  {
    const client = fakeClient(async () => { throw new Error('catastrophe'); });
    let threw = false;
    try { await callVision({ imageUrl: 'https://example.com/x.jpg', model: 'claude-haiku-4-5', systemPrompt: 'x' }, client); }
    catch (e) { threw = true; }
    check('callVision ne lève jamais, même sur erreur inattendue', threw === false);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`${OK} OK / ${KO} KO`);
  process.exit(KO > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('\n❌ Erreur fatale non interceptée :', e.message);
  process.exit(1);
});
