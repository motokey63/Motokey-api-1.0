'use strict';

// Test end-to-end : login Supabase → POST /billing/checkout → URL Stripe
// Usage : node scripts/test-checkout.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const API = 'https://motokey11-production.up.railway.app';

async function run() {
  // 1. Login Supabase pour obtenir un JWT ES256 (req.ctx)
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: 'garage@motokey.fr', password: 'motokey2026' });
  if (error) { console.error('❌ Login Supabase :', error.message); process.exit(1); }
  const token = data.session.access_token;
  console.log('✅ JWT Supabase obtenu');

  // 2. POST /billing/checkout
  const res = await fetch(`${API}/billing/checkout`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ plan_key: 'solo', period: 'monthly' }),
  });
  const json = await res.json();
  if (!json.success) { console.error('❌ /billing/checkout :', json.error); process.exit(1); }

  console.log('✅ Session Checkout créée');
  console.log('   session_id :', json.data.session_id);
  console.log('   URL        :', json.data.url);
  console.log('\n👉 Ouvre cette URL dans le navigateur pour voir la page Stripe Checkout (mode test)');
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
