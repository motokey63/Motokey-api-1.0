/**
 * scripts/seed-rbac-test-users.js
 *
 * Crée (ou met à jour) 5 utilisateurs de test — un par rôle RBAC.
 * Idempotent : peut être relancé sans créer de doublons.
 *
 * Usage :
 *   node scripts/seed-rbac-test-users.js
 *
 * Prérequis :
 *   - SUPABASE_URL et SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) dans .env
 *   - Supabase Admin SDK (@supabase/supabase-js)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', 'env', '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERREUR : SUPABASE_URL et SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) requis');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const TEST_USERS = [
  { email: 'admin@motokey-test.local',       password: 'TestAdmin123!',       role: 'ADMIN'      },
  { email: 'concession@motokey-test.local',  password: 'TestConcession123!',  role: 'CONCESSION' },
  { email: 'pro@motokey-test.local',         password: 'TestPro123!',         role: 'PRO'        },
  { email: 'mecano@motokey-test.local',      password: 'TestMecano123!',      role: 'MECANO'     },
  { email: 'client@motokey-test.local',      password: 'TestClient123!',      role: 'CLIENT'     },
];

async function findExistingUser(email) {
  // listUsers retourne jusqu'à 1000 users — suffisant pour un projet de cette taille
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error('listUsers failed: ' + error.message);
  return (data.users || []).find(u => u.email === email) || null;
}

async function seedUser({ email, password, role }) {
  const existing = await findExistingUser(email);

  if (existing) {
    // Idempotence : mettre à jour le rôle si nécessaire
    const currentRole = existing.app_metadata && existing.app_metadata.role;
    if (currentRole === role) {
      console.log(`  [SKIP]   ${email} — déjà existant avec role=${role}`);
      return;
    }
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      app_metadata: { role }
    });
    if (error) throw new Error(`updateUserById(${email}) failed: ` + error.message);
    console.log(`  [UPDATE] ${email} — rôle mis à jour ${currentRole || 'null'} → ${role}`);
  } else {
    // Création avec email confirmé + rôle dans app_metadata
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role }
    });
    if (error) throw new Error(`createUser(${email}) failed: ` + error.message);
    console.log(`  [CREATE] ${email} — créé avec role=${role} (id=${data.user.id})`);
  }
}

async function main() {
  console.log('\n=== Seed RBAC test users ===\n');
  for (const user of TEST_USERS) {
    try {
      await seedUser(user);
    } catch (err) {
      console.error(`  [ERROR]  ${user.email} — ${err.message}`);
    }
  }
  console.log('\nSeed terminé.\n');
}

main().catch(err => {
  console.error('Erreur fatale :', err.message);
  process.exit(1);
});
