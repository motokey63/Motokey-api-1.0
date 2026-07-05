/**
 * scripts/seed-test-maintenance-cron.js
 *
 * Seeds two client-owned moto fixtures (WARNING tier + URGENT tier) for manual
 * testing of Phase 17 MPUSH-04 (services/maintenanceAlertService.js's
 * runMaintenanceAlertCron()). Idempotent on moto VIN — safe to re-run.
 *
 * Usage:
 *   node scripts/seed-test-maintenance-cron.js
 *
 * Prerequis :
 *   - SUPABASE_URL et SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) dans .env (racine repo)
 *   - garage@motokey.fr (garage) et test@motokey.fr (client) doivent déjà exister
 *   - Migration 18 (sql/migrations/18_motos_maintenance_alert_state.sql) doit être appliquée
 *     pour que le reset last_maintenance_tier_notified fonctionne (sinon warning loggé, non bloquant)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

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

const GARAGE_EMAIL = 'garage@motokey.fr';
const CLIENT_EMAIL = 'test@motokey.fr';

const MOTOS = [
  {
    label: 'WARNING',
    vin: 'MAINT-CRON-WARN-0001',
    plaque: 'MNT-WARN',
    marque: 'Yamaha',
    modele: 'MT-07',
    annee: 2022,
    km: 9000,
    plan: { code_operation: 'vidange', nom: 'Vidange moteur', km_interval: 10000, km_derniere: 1000 } // since=8000, pct=80 -> warning
  },
  {
    label: 'URGENT',
    vin: 'MAINT-CRON-URG-0001',
    plaque: 'MNT-URG',
    marque: 'Honda',
    modele: 'CB500',
    annee: 2021,
    km: 12000,
    plan: { code_operation: 'vidange', nom: 'Vidange moteur', km_interval: 10000, km_derniere: 1000 } // since=11000, pct=100 (clamped) -> urgent
  }
];

async function main() {
  console.log('\n=== Seed test cron entretien (Phase 17 — MPUSH-04) ===\n');

  const { data: garages, error: gErr } = await supabase
    .from('garages')
    .select('id, nom, email')
    .eq('email', GARAGE_EMAIL)
    .limit(1);
  if (gErr) throw new Error('garages lookup failed: ' + gErr.message);
  if (!garages || garages.length === 0) {
    console.error(`ERREUR : aucun garage trouvé avec email=${GARAGE_EMAIL}`);
    process.exit(1);
  }
  const garage = garages[0];
  console.log(`  Garage cible: ${garage.nom} (${garage.id})`);

  const { data: clients, error: cErr } = await supabase
    .from('clients')
    .select('id, nom, email')
    .eq('email', CLIENT_EMAIL)
    .limit(1);
  if (cErr) throw new Error('clients lookup failed: ' + cErr.message);
  if (!clients || clients.length === 0) {
    console.error(`ERREUR : aucun client trouvé avec email=${CLIENT_EMAIL}`);
    process.exit(1);
  }
  const client = clients[0];
  console.log(`  Client cible: ${client.nom} (${client.id})`);

  for (const fixture of MOTOS) {
    const { data: existingMotos, error: eMErr } = await supabase
      .from('motos')
      .select('id, plaque, vin, client_id')
      .eq('vin', fixture.vin)
      .limit(1);
    if (eMErr) throw new Error('motos lookup failed: ' + eMErr.message);

    let moto;
    if (existingMotos && existingMotos.length > 0) {
      moto = existingMotos[0];
      console.log(`  [SKIP] Moto ${fixture.label} VIN=${fixture.vin} existe déjà (id=${moto.id})`);
    } else {
      const { data: createdMoto, error: iMErr } = await supabase
        .from('motos')
        .insert({
          garage_id: garage.id,
          client_id: client.id,
          proprietaire_type: 'client',
          proprietaire_garage_id: null,
          marque: fixture.marque,
          modele: fixture.modele,
          annee: fixture.annee,
          plaque: fixture.plaque,
          vin: fixture.vin,
          km: fixture.km
        })
        .select()
        .single();
      if (iMErr) throw new Error('moto insert failed: ' + iMErr.message);
      moto = createdMoto;
      console.log(`  [CREATE] Moto ${fixture.label} ${fixture.marque} ${fixture.modele} (id=${moto.id}) — VIN=${fixture.vin}, plaque=${fixture.plaque}`);
    }

    // ── plan_entretien (idempotent sur moto_id+code_operation) ──
    const { error: upErr } = await supabase
      .from('plan_entretien')
      .upsert(
        { moto_id: moto.id, ...fixture.plan },
        { onConflict: 'moto_id,code_operation' }
      );
    if (upErr) throw new Error('plan_entretien upsert failed: ' + upErr.message);
    console.log(`  [UPSERT] plan_entretien ${fixture.plan.code_operation} pour moto ${moto.id} (km_interval=${fixture.plan.km_interval}, km_derniere=${fixture.plan.km_derniere})`);

    // ── Reset last_maintenance_tier_notified pour garantir un franchissement "frais" à chaque run ──
    try {
      const { error: resetErr } = await supabase
        .from('motos')
        .update({ last_maintenance_tier_notified: null, last_maintenance_tier_notified_at: null })
        .eq('id', moto.id);
      if (resetErr) throw resetErr;
    } catch (e) {
      console.warn(`  [WARN] Reset last_maintenance_tier_notified impossible (migration 18 appliquée ?) : ${e.message}`);
    }

    console.log(`  → Moto ${fixture.label} id=${moto.id}\n`);
  }

  console.log('Termine.\n');
}

main().catch(err => {
  console.error('Erreur fatale :', err.message);
  process.exit(1);
});
