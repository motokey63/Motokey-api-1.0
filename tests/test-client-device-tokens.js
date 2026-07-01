const http = require('http');
let OK = 0, KO = 0;

function req(method, path, body, token) {
  return new Promise(resolve => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      hostname:'localhost', port:3000, path, method,
      headers:{
        'Content-Type':'application/json',
        ...(token ? {'Authorization':'Bearer '+token} : {}),
        ...(data   ? {'Content-Length':Buffer.byteLength(data)} : {})
      }
    }, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve({s:res.statusCode,b:JSON.parse(d)});}catch{resolve({s:res.statusCode,b:d});} });
    });
    r.on('error',e=>resolve({s:0,b:{error:e.message}}));
    if(data) r.write(data);
    r.end();
  });
}

function test(nom, ok, detail='') {
  if(ok){ console.log('  ✅ '+nom); OK++; }
  else  { console.log('  ❌ '+nom+(detail?' — '+detail:'')); KO++; }
}

async function run() {
  console.log('\n🧪 Tests MotoKey — client device tokens (Phase 12)\n');

  const login = await req('POST','/auth/login',{email:'sophie@email.com',password:'client123',role:'client'});
  test('Login client', login.s===200, 'HTTP '+login.s);
  const TOKEN = login.b?.data?.token;
  test('Token reçu', !!TOKEN);

  const SAMPLE = 'ExponentPushToken[gsd-test-'+Date.now()+']';

  const me = await req('GET','/client/me',null,TOKEN);
  test('GET /client/me', me.s===200, 'HTTP '+me.s);
  test('client/me.id présent', !!me.b?.data?.id);
  const meData = me.b?.data || {};
  ['nom','email','tel','garage_id','garage_nom','client_depuis'].forEach(key => {
    test('client/me expose '+key, Object.prototype.hasOwnProperty.call(meData, key));
  });

  const reg = await req('POST','/client/device-tokens',{token:SAMPLE,platform:'ios'},TOKEN);
  test('POST /client/device-tokens (enregistrement)', reg.s===201, 'HTTP '+reg.s);

  const bad = await req('POST','/client/device-tokens',{token:'not-a-token',platform:'ios'},TOKEN);
  test('POST /client/device-tokens rejette token invalide (400)', bad.s===400, 'HTTP '+bad.s);

  const del = await req('DELETE','/client/device-tokens',{token:SAMPLE},TOKEN);
  test('DELETE /client/device-tokens (désenregistrement)', del.s===200, 'HTTP '+del.s);

  const del2 = await req('DELETE','/client/device-tokens',{token:SAMPLE},TOKEN);
  test('DELETE /client/device-tokens déjà supprimé (404)', del2.s===404, 'HTTP '+del2.s);

  const noauth = await req('POST','/client/device-tokens',{},null);
  test('POST /client/device-tokens sans auth (401)', noauth.s===401, 'HTTP '+noauth.s);

  console.log('\n'+('─'.repeat(40)));
  console.log('📊 '+OK+'/'+(OK+KO)+' tests passés');
  if(KO===0) console.log('🎉 Tout fonctionne !\n');
  else console.log('⚠️  '+KO+' erreur(s) — vérifiez que l\'API tourne et que la migration 16 est appliquée\n');
}

setTimeout(run, 300);
