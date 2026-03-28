const http = require('http');
let TOKEN = '', OK = 0, KO = 0;

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
  console.log('\n🧪 Tests MotoKey API\n');

  const root = await req('GET','/');
  test('Serveur répond', root.s===200);

  const login = await req('POST','/auth/login',{email:'garage@motokey.fr',password:'motokey2026',role:'garage'});
  test('Login garage', login.s===200, 'HTTP '+login.s);
  if(login.b?.data?.token) TOKEN = login.b.data.token;
  test('Token reçu', !!TOKEN);

  const motos = await req('GET','/motos',null,TOKEN);
  test('Liste motos', motos.s===200);

  const score = await req('GET','/motos/moto-001/score',null,TOKEN);
  test('Score moto', score.s===200||score.s===404);

  const fraude = await req('POST','/fraude/analyser',{montant:142,km:18650,description:'Vidange',garage_type:'ok',qr_code:'MK-2026-SHOP-7X3A',signature:'ok'},TOKEN);
  test('Anti-fraude', fraude.s===200);
  test('Score > 80', (fraude.b?.data?.score||0) >= 80);

  const stats = await req('GET','/stats',null,TOKEN);
  test('Stats garage', stats.s===200);

  const cliLogin = await req('POST','/auth/login',{email:'sophie@email.com',password:'client123',role:'client'});
  test('Login client', cliLogin.s===200);

  console.log('\n'+('─'.repeat(40)));
  console.log('📊 '+OK+'/'+(OK+KO)+' tests passés');
  if(KO===0) console.log('🎉 Tout fonctionne !\n');
  else console.log('⚠️  '+KO+' erreur(s) — vérifiez que l\'API tourne\n');
}

setTimeout(run, 300);
