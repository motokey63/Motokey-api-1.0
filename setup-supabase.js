require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  console.log('\n🚀 Configuration MotoKey Supabase...\n');

  // Test connexion
  console.log('1️⃣  Test connexion...');
  const { error: testErr } = await sb.from('garages').select('count').limit(1);
  if (testErr && testErr.message.includes('does not exist')) {
    console.error('❌ Tables manquantes !');
    console.log('   → Allez dans Supabase > SQL Editor');
    console.log('   → Collez le fichier schema.sql et cliquez Run\n');
    process.exit(1);
  }
  console.log('✅ Connexion Supabase OK');

  // Créer les buckets Storage
  console.log('\n2️⃣  Création des buckets Storage...');
  const buckets = [
    { name: 'factures',     public: false },
    { name: 'photos-motos', public: true  },
    { name: 'certificats',  public: false },
  ];
  for (const b of buckets) {
    const { error } = await sb.storage.createBucket(b.name, {
      public: b.public,
      fileSizeLimit: 10485760,
      allowedMimeTypes: ['application/pdf','image/jpeg','image/png','image/webp'],
    });
    if (error && error.message.includes('already exists')) {
      console.log(`  ℹ️  Bucket "${b.name}" déjà existant`);
    } else if (error) {
      console.error(`  ❌ Bucket "${b.name}": ${error.message}`);
    } else {
      console.log(`  ✅ Bucket "${b.name}" créé`);
    }
  }

  // Compte garage de test
  console.log('\n3️⃣  Création du compte de test...');
  try {
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email: 'garage@motokey.fr',
      password: 'motokey2026',
      email_confirm: true,
    });
    if (authErr && !authErr.message.includes('already registered')) throw authErr;

    const userId = authData?.user?.id;
    if (userId) {
      const { data: garage } = await sb.from('garages').upsert({
        auth_user_id: userId,
        nom:      'Garage MotoKey Clermont-Ferrand',
        email:    'garage@motokey.fr',
        siret:    '12345678901234',
        tel:      '04 73 00 00 01',
        adresse:  '12 rue des Mécaniciens, 63000 Clermont-Ferrand',
        taux_std: 65, taux_spec: 80, tva: 20, plan: 'pro',
      }, { onConflict: 'email' }).select().single();

      if (garage) {
        const { data: client } = await sb.from('clients').upsert({
          garage_id: garage.id,
          nom: 'Sophie Laurent', email: 'sophie@email.com', tel: '06 10 00 00 01',
        }, { onConflict: 'email,garage_id' }).select().single();

        if (client) {
          await sb.from('motos').upsert({
            garage_id: garage.id, client_id: client.id,
            marque: 'Yamaha', modele: 'MT-07', annee: 2021,
            plaque: 'EF-789-GH', vin: 'JYARN22E00A000002',
            km: 18650, couleur_dossier: 'bleu', score: 74,
          }, { onConflict: 'vin' });
          console.log('  ✅ Garage + Client Sophie + Moto MT-07 créés');
        }
      }
    } else {
      console.log('  ℹ️  Compte déjà existant');
    }
  } catch(e) {
    console.log('  ⚠️ ', e.message);
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  ✅  CONFIGURATION TERMINÉE !             ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  Démarrer l\'API :  npm start             ║');
  console.log('║  Login garage   :  garage@motokey.fr     ║');
  console.log('║  Mot de passe   :  motokey2026           ║');
  console.log('╚══════════════════════════════════════════╝\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
