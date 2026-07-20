'use strict';
/**
 * scripts/cleanup-test-fixtures.js
 *
 * Supprime un compte Auth Supabase de test (+ sa ligne garage_users associée) par email
 * EXACT, avec post-check confirmant 0 résidu. Créé pour la fixture MECANO éphémère de
 * tests/test-consommable-echeance-cron.js (Tâche 6, L11 notif calendaire) — aucune fixture
 * de test ne doit survivre à une session (discipline post-incident, comptes de test qui ont
 * traîné des mois, cf. L8 statiicrazer@gmail.com).
 *
 * Usage : railway run node scripts/cleanup-test-fixtures.js <email>
 * (railway run injecte les env vars Railway actuelles — SUPABASE_URL/SUPABASE_SECRET_KEY —
 * garantit qu'on nettoie le même projet Supabase que la prod plutôt qu'un .env local
 * potentiellement désynchronisé après la rotation CRON_SECRET du 19/07/2026.)
 *
 * Garde-fou : refuse tout email qui ne contient pas "test" (anti-suppression accidentelle
 * d'un compte réel).
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

const email = process.argv[2];
if (!email) {
  console.error('Usage: railway run node scripts/cleanup-test-fixtures.js <email>');
  process.exit(1);
}
if (!/test/i.test(email)) {
  console.error(`REFUS : "${email}" ne contient pas "test" — garde-fou anti-suppression accidentelle.`);
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERREUR : SUPABASE_URL et SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) requis (lancer via railway run).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) { console.error('listUsers a échoué:', error.message); process.exit(1); }

  const user = (data.users || []).find(u => u.email === email);
  if (!user) {
    console.log(`[SKIP] aucun compte Auth trouvé pour ${email} — rien à nettoyer.`);
  } else {
    const { error: guErr } = await supabase.from('garage_users').delete().eq('auth_user_id', user.id);
    if (guErr) console.warn('[WARN] suppression garage_users échouée (peut être normal si absent):', guErr.message);
    else console.log(`[OK] ligne(s) garage_users supprimée(s) pour ${email}`);

    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr) { console.error('[ERROR] suppression du compte Auth échouée:', delErr.message); process.exit(1); }
    console.log(`[OK] compte Auth supprimé pour ${email}`);
  }

  // Post-check explicite — confirme 0 résidu, jamais une simple supposition de succès.
  const { data: verify, error: verifyErr } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (verifyErr) { console.error('Post-check listUsers a échoué:', verifyErr.message); process.exit(1); }
  const stillThere = (verify.users || []).some(u => u.email === email);
  if (stillThere) {
    console.error(`[POSTCHECK FAIL] ${email} existe encore !`);
    process.exit(1);
  }
  console.log(`[POSTCHECK OK] ${email} n'existe plus (0 résidu).`);
}

main().catch(err => { console.error('Erreur fatale:', err.message); process.exit(1); });
