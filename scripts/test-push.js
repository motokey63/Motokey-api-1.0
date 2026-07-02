'use strict';

// Harnais manuel de test pour services/pushService.js (Phase 13 — Push Dispatch Service).
// Ce script définit le contrat d'appel exact que pushService doit implémenter :
//   - sendToToken(token, { title, body, data }, idempotencyKey) — envoi bas niveau, un seul token
//   - sendPush(clientId, { title, body, data }, idempotencyKey) — fan-out vers tous les devices du client
//
// Usage :
//   node scripts/test-push.js <token> [--idempotency-key=<value>] [--client-id=<uuid>]
//
// Invocations de VALIDATION (voir 13-VALIDATION.md) :
//   1. PUSH_ENABLED=false node scripts/test-push.js ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
//      → fallback console.log, exit 0
//   2. node scripts/test-push.js <token> --idempotency-key=test-1   (exécuté deux fois)
//      → 2e exécution logge "déjà envoyé", exit 0
//   3. PUSH_ENABLED=false node scripts/test-push.js not-a-real-token
//      → erreur de validation loggée, exit 0
//   4. PUSH_ENABLED=true node scripts/test-push.js <real-expo-token>
//      → notification visible sur device réel
//
// Pré-requis : .env à la racine du repo (SUPABASE_URL, SUPABASE_SECRET_KEY, etc.)

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// ── Parsing argv ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));
const flags = args.filter(a => a.startsWith('--'));

function getFlag(name) {
  const prefix = `--${name}=`;
  const found = flags.find(f => f.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const token = positional[0];
if (!token) {
  console.error('Usage: node scripts/test-push.js <token> [--idempotency-key=<value>] [--client-id=<uuid>]');
  process.exit(1);
}

const idempotencyKey = getFlag('idempotency-key') || `test-push-${Date.now()}`;
const clientId = getFlag('client-id');

// ── Payload de test fixe ─────────────────────────────────────────────────
const payload = {
  title: 'MotoKey — test push',
  body: 'Notification de test (Phase 13)',
  data: { type: 'test', ts: Date.now() }
};

// ── Require du service (Plan 02 — n'existe pas encore tant que ce plan n'est pas exécuté) ──
const pushService = require('../services/pushService');

console.log('▶  test-push.js — Phase 13 harness');
console.log('   PUSH_ENABLED  :', process.env.PUSH_ENABLED);
console.log('   token         :', token.slice(0, 20) + '…');
console.log('   idempotencyKey:', idempotencyKey);
console.log('   mode          :', clientId ? `sendPush (clientId=${clientId})` : 'sendToToken');

(async () => {
  try {
    let result;
    if (clientId) {
      result = await pushService.sendPush(clientId, payload, idempotencyKey);
    } else {
      result = await pushService.sendToToken(token, payload, idempotencyKey);
    }
    console.log('✅  Résultat :', result);
    process.exit(0);
  } catch (err) {
    console.error('❌  Erreur (gérée, ne fait pas échouer le harnais) :', err.message);
    process.exit(0);
  }
})();
