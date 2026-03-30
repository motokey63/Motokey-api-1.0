/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║           MOTOKEY — API MOCK COMPLÈTE v1.0              ║
 * ║   Node.js pur · Zéro dépendance · Supabase-ready       ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * DÉMARRAGE :
 *   node motokey-api.js
 *   Serveur sur http://localhost:3000
 *
 * CREDENTIALS DE TEST :
 *   Garage : garage@motokey.fr / motokey2026
 *   Client : sophie@email.com  / client123
 *             pierre@email.com  / client123
 *
 * TOUS LES ENDPOINTS :
 *
 *  [AUTH]
 *   POST /auth/login              Connexion garage ou client
 *   POST /auth/register           Inscription nouveau garage
 *   GET  /auth/me                 Profil du compte connecté
 *
 *  [MOTOS]
 *   GET    /motos                 Liste motos du garage
 *   POST   /motos                 Créer une moto + client
 *   GET    /motos/:id             Détail moto + historique
 *   PUT    /motos/:id             Modifier une moto
 *   DELETE /motos/:id             Supprimer un dossier
 *   GET    /motos/:id/score       Score MotoKey calculé
 *
 *  [INTERVENTIONS]
 *   GET    /motos/:id/interventions         Historique
 *   POST   /motos/:id/interventions         Ajouter
 *   PUT    /motos/:id/interventions/:iid    Modifier
 *   DELETE /motos/:id/interventions/:iid    Supprimer
 *
 *  [ENTRETIEN CONSTRUCTEUR]
 *   GET /motos/:id/entretien                Plan complet (Autodata)
 *   GET /motos/:id/entretien/alertes        Opérations dues
 *
 *  [DEVIS & FACTURATION]
 *   GET  /devis                   Liste des devis
 *   POST /devis                   Créer un devis
 *   GET  /devis/:id               Détail + totaux
 *   PUT  /devis/:id               Modifier lignes/remises
 *   POST /devis/:id/valider       Valider → crée intervention
 *   POST /devis/:id/pdf           Simuler export PDF
 *
 *  [ANTI-FRAUDE]
 *   POST /fraude/analyser         Analyser une facture (IA)
 *   GET  /fraude/historique       Historique vérifications
 *
 *  [TRANSFERT DE PROPRIÉTÉ]
 *   POST /transfert/initier              Générer code cession
 *   POST /transfert/confirmer-vendeur    Confirmation vendeur
 *   POST /transfert/consulter            Acheteur consulte
 *   POST /transfert/finaliser            Finaliser + certificat
 *   GET  /transfert/:code                Statut d'un transfert
 *
 *  [APP CLIENT (JWT client requis)]
 *   GET /client/moto              Dossier complet moto
 *   GET /client/alertes           Alertes d'entretien
 *   GET /client/documents         Factures numérisées
 *
 *  [PARAMÈTRES & STATS]
 *   GET /params                   Paramètres du garage
 *   PUT /params                   Modifier (taux, TVA...)
 *   GET /stats                    Tableau de bord chiffres
 */

'use strict';

const http   = require('http');
const crypto = require('crypto');
const url    = require('url');
const https2 = require('https');

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'motokey_secret_2026';
const VERSION    = '1.0.0';

/* ─── SUPABASE CLIENT LEGER ─── */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbRequest(method, path, body) {
  return new Promise(function(resolve) {
    if (!SUPABASE_URL || !SUPABASE_KEY) { resolve(null); return; }
    try {
      const parsed = new URL(SUPABASE_URL + '/rest/v1' + path);
      const data   = body ? JSON.stringify(body) : null;
      const opts   = {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   method,
        headers: {
          'apikey':        SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type':  'application/json',
          'Prefer':        'return=representation',
        }
      };
      if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
      const req = https2.request(opts, function(res) {
        let d = '';
        res.on('data', function(c){ d += c; });
        res.on('end', function(){
          try { resolve(JSON.parse(d)); } catch(e) { resolve(null); }
        });
      });
      req.on('error', function(){ resolve(null); });
      if (data) req.write(data);
      req.end();
    } catch(e) { resolve(null); }
  });
}

const SB = {
  async select(table, filters) {
    let path = '/' + table + '?order=created_at.desc';
    if (filters) {
      Object.entries(filters).forEach(function([k,v]){
        path += '&' + k + '=eq.' + encodeURIComponent(v);
      });
    }
    const r = await sbRequest('GET', path);
    return Array.isArray(r) ? r : [];
  },
  async insert(table, row) {
    const r = await sbRequest('POST', '/' + table, row);
    return Array.isArray(r) ? r[0] : (r && !r.code ? r : null);
  },
  async update(table, id, data) {
    const r = await sbRequest('PATCH', '/' + table + '?id=eq.' + id, data);
    return Array.isArray(r) ? r[0] : (r && !r.code ? r : null);
  }
};

const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);
console.log(USE_SUPABASE ? '✅ Supabase connecte — donnees persistantes' : '⚠️  Mode RAM — configurer SUPABASE_URL et SUPABASE_SERVICE_KEY');

/* ─── UTILS ─── */
function uid() {
  return crypto.randomBytes(4).toString('hex');
}
function b64url(s) {
  return Buffer.from(s).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function jwtSign(payload) {
  const h = b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const p = b64url(JSON.stringify({...payload, iat:Date.now(), exp:Date.now()+86400000}));
  const s = crypto.createHmac('sha256',JWT_SECRET).update(h+'.'+p).digest('base64url');
  return h+'.'+p+'.'+s;
}
function jwtVerify(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h,p,s] = parts;
    const expected = crypto.createHmac('sha256',JWT_SECRET).update(h+'.'+p).digest('base64url');
    if (s !== expected) return null;
    const payload = JSON.parse(Buffer.from(p,'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch(e) { return null; }
}
function hashPwd(pwd) {
  return crypto.createHash('sha256').update(pwd+JWT_SECRET).digest('hex');
}
function nowISO()  { return new Date().toISOString(); }
function todayFR() {
  const d = new Date();
  return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
}
function rand(a,b) { return Math.floor(Math.random()*(b-a+1))+a; }

/* ─── DATABASE ─── */
const DB = {
  garages: [{
    id:'gar-001', nom:'Garage MotoKey Clermont-Ferrand',
    email:'garage@motokey.fr', password:hashPwd('motokey2026'),
    siret:'12345678901234', taux_std:65, taux_spec:80, tva:20,
    tel:'04 73 00 00 01', adresse:'12 rue des Mécaniciens, 63000 Clermont-Ferrand',
    plan:'pro', techniciens:['Jean-Marc Duval','Lucas Renard','Thomas Petit'],
    created_at:'2024-01-15T08:00:00Z'
  }],
  clients: [
    {id:'cli-001',nom:'Sophie Laurent', email:'sophie@email.com',password:hashPwd('client123'),tel:'06 10 00 00 01',created_at:'2021-01-15T10:00:00Z'},
    {id:'cli-002',nom:'Pierre Moreau',  email:'pierre@email.com', password:hashPwd('client123'),tel:'06 10 00 00 02',created_at:'2019-06-01T10:00:00Z'},
    {id:'cli-003',nom:'Marc Dubois',    email:'marc@email.com',   password:hashPwd('client123'),tel:'06 10 00 00 03',created_at:'2020-03-10T10:00:00Z'},
    {id:'cli-004',nom:'Claire Petit',   email:'claire@email.com', password:hashPwd('client123'),tel:'06 10 00 00 04',created_at:'2022-06-05T10:00:00Z'}
  ],
  motos: [
    {id:'moto-001',garage_id:'gar-001',client_id:'cli-001',marque:'Yamaha',  modele:'MT-07',       annee:2021,plaque:'EF-789-GH',vin:'JYARN22E00A000002',km:18650,couleur_dossier:'bleu',score:74,pneu_actuel:'Michelin Road 6',pneu_km_montage:16200,created_at:'2021-01-20T10:00:00Z',updated_at:nowISO()},
    {id:'moto-002',garage_id:'gar-001',client_id:'cli-002',marque:'Honda',   modele:'CB750 Four',   annee:1978,plaque:'AB-456-CD',vin:'JH2RC1700RM200001',km:42300,couleur_dossier:'vert',score:92,pneu_actuel:'Metzeler Roadtec 02',pneu_km_montage:38000,created_at:'2019-06-10T10:00:00Z',updated_at:nowISO()},
    {id:'moto-003',garage_id:'gar-001',client_id:'cli-003',marque:'Kawasaki',modele:'Z900',         annee:2020,plaque:'IJ-012-KL',vin:'JKAZR9A14LA000003',km:29100,couleur_dossier:'jaune',score:55,pneu_actuel:'Pirelli Rosso IV',pneu_km_montage:24000,created_at:'2020-03-15T10:00:00Z',updated_at:nowISO()},
    {id:'moto-004',garage_id:'gar-001',client_id:'cli-004',marque:'Ducati',  modele:'Monster 937',  annee:2022,plaque:'MN-345-OP',vin:'ZDM1BBBJ0NB000004',km:8900, couleur_dossier:'vert',score:88,pneu_actuel:'Pirelli Rosso IV',pneu_km_montage:7500,created_at:'2022-06-10T10:00:00Z',updated_at:nowISO()}
  ],
  interventions: [
    {id:'int-001',moto_id:'moto-001',garage_id:'gar-001',type:'bleu', titre:'Vidange + filtre à air',  description:'Huile Yamaha OEM 10W-40, filtre WIX',       km:18650,technicien:'Moto Shop Orléans',      date:'05/02/2026',score_confiance:96,montant_ht:89.50, created_at:'2026-02-05T10:00:00Z'},
    {id:'int-002',moto_id:'moto-001',garage_id:'gar-001',type:'bleu', titre:'Pneus avant + arrière',  description:'Michelin Road 6 monté + équilibré',          km:16200,technicien:'Top Moto 45',            date:'11/11/2025',score_confiance:91,montant_ht:313.90,created_at:'2025-11-11T10:00:00Z'},
    {id:'int-003',moto_id:'moto-001',garage_id:'gar-001',type:'vert', titre:'Révision 12 000 km',     description:'Révision constructeur complète',             km:12000,technicien:'Yamaha Concessionnaire',  date:'03/06/2025',score_confiance:99,montant_ht:245.00,created_at:'2025-06-03T10:00:00Z'},
    {id:'int-004',moto_id:'moto-002',garage_id:'gar-001',type:'vert', titre:'Révision complète',      description:'Vidange, filtres, bougies, carbus',          km:42300,technicien:'Jean-Marc Duval',        date:'12/03/2026',score_confiance:94,montant_ht:320.00,created_at:'2026-03-12T10:00:00Z'},
    {id:'int-005',moto_id:'moto-003',garage_id:'gar-001',type:'jaune',titre:'Vidange maison',         description:'Castrol Power1 Racing 10W50, facture jointe',km:29100,technicien:'Propriétaire',           date:'18/01/2026',score_confiance:54,montant_ht:45.00, created_at:'2026-01-18T10:00:00Z'},
    {id:'int-006',moto_id:'moto-004',garage_id:'gar-001',type:'vert', titre:'Révision 7 500 km',      description:'Courroies, soupapes, freins',                km:8900, technicien:'Ducati Store Orléans',    date:'28/02/2026',score_confiance:99,montant_ht:580.00,created_at:'2026-02-28T10:00:00Z'}
  ],
  devis: [{
    id:'dv-001',moto_id:'moto-001',garage_id:'gar-001',
    numero:'2026-0147',statut:'brouillon',technicien:'Jean-Marc Duval',
    remise_type:'fidelite',remise_pct:10,remise_note:'Client fidèle 4 ans',tva:20,
    lignes:[
      {id:'lg-001',type:'mo',    icon:'🔧',desc:'Vidange + filtre huile',        ref:'MO-STD', qty:0.8,pu:65,   remise_pct:0,reason_type:''},
      {id:'lg-002',type:'fluide',icon:'🛢️',desc:'Huile Yamalube 10W-40 · 3L', ref:'FLU-YAM',qty:3,  pu:12.50,remise_pct:0,reason_type:''},
      {id:'lg-003',type:'piece', icon:'🔩',desc:'Filtre à huile Yamaha OEM',    ref:'PIE-001',qty:1,  pu:14.90,remise_pct:0,reason_type:''}
    ],
    created_at:nowISO(),updated_at:nowISO()
  }],
  fraude_verifications: [
    {id:'fv-001',moto_id:'moto-001',garage:'Moto Shop Orléans',montant:89.50, km:18650,qr_valide:true, signature_valide:true, score:96,verdict:'authentifie',       date:'05/02/2026',created_at:nowISO()},
    {id:'fv-002',moto_id:'moto-001',garage:'Top Moto 45',      montant:313.90,km:16200,qr_valide:true, signature_valide:true, score:91,verdict:'authentifie',       date:'11/11/2025',created_at:nowISO()},
    {id:'fv-003',moto_id:'moto-003',garage:'Propriétaire',     montant:45.00, km:29100,qr_valide:false,signature_valide:false,score:54,verdict:'partiel',           date:'18/01/2026',created_at:nowISO()}
  ],
  transferts: [],
  plans: {
    'moto-001':[
      {id:'pe-01',icon:'🛢️',nom:'Vidange + filtre huile',    km_interval:6000, km_derniere:18650,temps_h:0.8,produit:'Yamalube 10W-40 · 3L',   tags:['6 000 km','1 an'],      source:'Autodata'},
      {id:'pe-02',icon:'💨',nom:'Filtre à air',               km_interval:12000,km_derniere:12000,temps_h:0.5,produit:'Filtre Yamaha OEM',        tags:['12 000 km'],            source:'Autodata'},
      {id:'pe-03',icon:'⚡',nom:'Bougies (x2)',               km_interval:12000,km_derniere:12000,temps_h:1.2,produit:'NGK CR9EIA-9',             tags:['12 000 km'],            source:'Autodata'},
      {id:'pe-04',icon:'⛓️',nom:'Chaîne + pignons',           km_interval:12000,km_derniere:12000,temps_h:1.8,produit:'Kit RK 520 XSO',          tags:['12 000 km'],            source:'Autodata'},
      {id:'pe-05',icon:'🔴',nom:'Liquide de frein',           km_interval:24000,km_derniere:6000, temps_h:0.8,produit:'Motul RBF 600 DOT4',      tags:['2 ans','DOT4'],         source:'Autodata'},
      {id:'pe-06',icon:'🔧',nom:'Jeu aux soupapes',           km_interval:24000,km_derniere:12000,temps_h:4.0,produit:'—',                       tags:['24 000 km'],            source:'Autodata'},
      {id:'pe-07',icon:'🔵',nom:'Pneus — contrôle usure',     km_interval:8000, km_derniere:16200,temps_h:0.3,produit:'Michelin Road 6',         tags:['Usure','Pression'],     source:'Autodata'}
    ],
    'moto-002':[
      {id:'pe-11',icon:'🛢️',nom:'Vidange + filtre',           km_interval:5000, km_derniere:42300,temps_h:1.0,produit:'Motul Classic 10W-40 4L', tags:['5 000 km','6 mois'],    source:'ETAI'},
      {id:'pe-12',icon:'⚙️',nom:'Réglage carburateurs',       km_interval:6000, km_derniere:38000,temps_h:3.5,produit:'Kit joints carbu CB750',  tags:['6 000 km'],             source:'ETAI'},
      {id:'pe-13',icon:'⚡',nom:'Allumage + bougies (x4)',     km_interval:6000, km_derniere:36000,temps_h:1.5,produit:'NGK D8EA (x4)',            tags:['6 000 km'],             source:'ETAI'}
    ],
    'moto-003':[
      {id:'pe-21',icon:'🛢️',nom:'Vidange + filtre',           km_interval:6000, km_derniere:29100,temps_h:0.8,produit:'Motul 7100 10W-50 4L',    tags:['6 000 km','1 an'],      source:'Autodata'},
      {id:'pe-22',icon:'💨',nom:'Filtre à air',               km_interval:15000,km_derniere:12000,temps_h:0.5,produit:'Filtre Kawasaki OEM',      tags:['15 000 km'],            source:'Autodata'},
      {id:'pe-23',icon:'⚡',nom:'Bougies (x4)',               km_interval:15000,km_derniere:12000,temps_h:2.0,produit:'NGK CR9EIA-9 Iridium x4', tags:['15 000 km'],            source:'Autodata'}
    ],
    'moto-004':[
      {id:'pe-31',icon:'🛢️',nom:'Vidange + filtre',           km_interval:7500, km_derniere:7500, temps_h:1.0,produit:'Shell Advance 15W-50',    tags:['7 500 km','1 an'],      source:'Autodata'},
      {id:'pe-32',icon:'⚙️',nom:'Courroies distribution',     km_interval:15000,km_derniere:7500, temps_h:6.0,produit:'Kit Ducati OEM',          tags:['15 000 km','⚠ CRITIQUE'],source:'Autodata'},
      {id:'pe-33',icon:'⚡',nom:'Bougies Iridium (x2)',       km_interval:15000,km_derniere:7500, temps_h:1.5,produit:'NGK SILMAR9A9 (x2)',       tags:['15 000 km'],            source:'Autodata'}
    ]
  }
};

/* ─── MÉTIER ─── */
function calcScore(ints, km) {
  if(!ints || ints.length === 0) return 0;
  
  // Points de base selon la qualité des interventions
  var pts = 0;
  ints.forEach(function(i){
    pts += ({vert:12, bleu:8, jaune:5, rouge:-5}[i.type]||0);
  });
  
  // Bonus conformité : moyenne de qualité des interventions
  var nbInts  = ints.length;
  var nbVert  = ints.filter(function(i){return i.type==='vert';}).length;
  var nbBleu  = ints.filter(function(i){return i.type==='bleu';}).length;
  var nbBons  = nbVert + nbBleu;
  var tauxBon = nbBons / nbInts;
  
  // Score de conformité = qualité moyenne * 100
  // Une moto avec que des interventions pro = score max
  var scoreConformite = Math.round(tauxBon * 100);
  
  // Pondération : 70% conformité + 30% accumulation points
  var scoreAccum = Math.min(100, pts);
  var scoreFinal = Math.round((scoreConformite * 0.70) + (scoreAccum * 0.30));
  
  // Bonus moto peu kilométrée et bien entretenue
  if(km && km < 10000 && tauxBon >= 0.8) {
    scoreFinal = Math.min(100, scoreFinal + 15);
  }
  
  return Math.max(0, Math.min(100, scoreFinal));
}
function couleur(score) {
  return score>=80?'vert':score>=60?'bleu':score>=40?'jaune':'rouge';
}
function calcDevis(dv) {
  let moHT=0,pieHT=0,remL=0;
  (dv.lignes||[]).forEach(function(l){
    const brut = l.pu * l.qty;
    const rem  = brut * ((l.remise_pct||0)/100);
    remL += rem;
    if(l.type==='mo') moHT += brut-rem; else pieHT += brut-rem;
  });
  const sous = moHT+pieHT;
  const remG = sous*((dv.remise_pct||0)/100);
  const base = sous-remG;
  const tva  = base*((dv.tva||20)/100);
  return {mo_ht:moHT,pieces_ht:pieHT,remise_lignes:remL,sous_total:sous,remise_globale:remG,base_ht:+base.toFixed(2),tva_montant:+tva.toFixed(2),total_ttc:+(base+tva).toFixed(2)};
}
function analyserFraude(p) {
  const isFake = p.garage_type==='fake';
  const hasQr  = p.qr_code && p.qr_code.length>5 && p.qr_code.indexOf('?')<0;
  const hasSig = p.signature && p.signature!=='none';
  const dataOk = p.montant>0 && p.km>0 && p.description && p.description.length>2;
  const checks = {
    document:  {status:'ok',           score:25, detail:'Document lu avec succès'},
    ocr:       {status:dataOk?'ok':'warn',      score:dataOk?20:8,  detail:dataOk?'Données extraites':'Données incomplètes'},
    coherence: {status:isFake?'fail':'ok',       score:isFake?0:20,  detail:isFake?'Incohérence détectée':'Données cohérentes'},
    qr_code:   {status:isFake?'fail':hasQr?'ok':'warn', score:isFake?0:hasQr?20:8, detail:isFake?'QR invalide':hasQr?'QR authentifié':'QR absent'},
    signature: {status:isFake?'fail':hasSig?'ok':'warn',score:isFake?0:hasSig?15:5,detail:isFake?'Signature rejetée':hasSig?'Signature valide':'Aucune signature'}
  };
  const score   = Math.min(100,Object.values(checks).reduce(function(s,c){return s+c.score;},0));
  const verdict = score>=85?'authentifie':score>=60?'partiel':'fraude_suspectee';
  const label   = {authentifie:'✅ Facture authentifiée',partiel:'⚠️ Vérification partielle',fraude_suspectee:'🚨 Fraude suspectée'}[verdict];
  const recomm  = score>=85?'Valider la facture':score>=60?'Vérification manuelle recommandée':'Rejeter la facture';
  return {score,verdict,label,checks,recommandation:recomm,qr_valide:hasQr&&!isFake,signature_valide:hasSig&&!isFake};
}
function enrichPlan(plan, km) {
  return plan.map(function(op){
    const since  = km - op.km_derniere;
    const pct    = op.km_interval>0 ? Math.min(100,Math.round((since/op.km_interval)*100)) : 0;
    const left   = Math.max(0, op.km_interval - since);
    const statut = pct>=100?'urgent':pct>=80?'warning':pct>=40?'due':op.km_derniere>0?'ok':'future';
    return Object.assign({},op,{km_actuel:km,pct_usage:pct,km_restant:left,statut:statut,prochain_km:op.km_derniere+op.km_interval});
  });
}

/* ─── HTTP ─── */
function sendJSON(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
    'X-MotoKey-Version':VERSION
  });
  res.end(body);
}
function ok(res, data, msg, status) {
  sendJSON(res, status||200, {success:true, message:msg||'OK', data:data, timestamp:nowISO()});
}
function fail(res, msg, status, code) {
  sendJSON(res, status||400, {success:false, error:{code:code||'ERROR', message:msg}, timestamp:nowISO()});
}
function auth(req, res) {
  const h = (req.headers['authorization']||'');
  if(!h.startsWith('Bearer ')) { fail(res,'Token manquant',401,'UNAUTHORIZED'); return null; }
  const payload = jwtVerify(h.slice(7));
  if(!payload) { fail(res,'Token invalide ou expiré',401,'UNAUTHORIZED'); return null; }
  return payload;
}
function body(req) {
  return new Promise(function(resolve){
    let s='';
    req.on('data',function(c){s+=c;});
    req.on('end',function(){try{resolve(JSON.parse(s||'{}'));}catch(e){resolve({});}});
    req.on('error',function(){resolve({});});
  });
}

/* ─── ROUTE MATCHER ─── */
function match(method, reqMethod, pattern, pathname) {
  if(method!==reqMethod) return null;
  const pp = pattern.split('/').filter(Boolean);
  const rp = pathname.split('/').filter(Boolean);
  if(pp.length!==rp.length) return null;
  const params = {};
  for(let i=0;i<pp.length;i++){
    if(pp[i].startsWith(':')) params[pp[i].slice(1)] = rp[i];
    else if(pp[i]!==rp[i]) return null;
  }
  return params;
}

/* ─── SERVER ─── */
// Charger l'app HTML si présente dans le même dossier
const _APP_HTML = "<!DOCTYPE html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0,maximum-scale=1.0\">\n<title>MotoKey — Application Complète</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Barlow:wght@300;400;500;600&family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&display=swap\" rel=\"stylesheet\">\n<style>\n/* ════════════════════════════════════════\n   VARIABLES & RESET\n════════════════════════════════════════ */\n:root {\n  --bg:#0d0f12;--bg2:#141618;--bg3:#1c1f23;--bg4:#22262c;\n  --border:#2a2d32;--border2:#353a42;\n  --text:#e8eaed;--text2:#8b9199;--text3:#555c66;\n  --accent:#ff6b00;--accent2:#ff8c33;\n  --green:#22c55e;--green-bg:rgba(34,197,94,.1);--green-b:rgba(34,197,94,.28);\n  --blue:#3b82f6;--blue-bg:rgba(59,130,246,.1);--blue-b:rgba(59,130,246,.28);\n  --yellow:#eab308;--yellow-bg:rgba(234,179,8,.1);--yellow-b:rgba(234,179,8,.28);\n  --red:#ef4444;--red-bg:rgba(239,68,68,.1);--red-b:rgba(239,68,68,.28);\n  --orange:#f97316;--orange-bg:rgba(249,115,22,.1);\n  --purple:#a855f7;--purple-bg:rgba(168,85,247,.1);--purple-b:rgba(168,85,247,.28);\n  --r:10px;--sh:0 4px 24px rgba(0,0,0,.3);\n  /* client theme */\n  --cbg:#f4f1ec;--cbg2:#faf8f4;--ccard:#fff;--cborder:#e8e3d8;\n  --ct:#1a1714;--ct2:#6b6459;--ct3:#a89e92;\n}\n*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}\nbody{font-family:'Barlow',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;overflow:hidden}\ninput,select,textarea{font-family:'Barlow',sans-serif}\n::-webkit-scrollbar{width:5px;height:5px}\n::-webkit-scrollbar-track{background:var(--bg2)}\n::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}\n\n/* ════════════════════════════════════════\n   MAIN SWITCHER BAR\n════════════════════════════════════════ */\n#mainBar{\n  position:fixed;top:0;left:0;right:0;height:52px;z-index:1000;\n  background:var(--bg);border-bottom:1px solid var(--border);\n  display:flex;align-items:center;padding:0 20px;gap:14px;\n}\n.app-logo{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:22px;letter-spacing:1px;color:var(--text)}\n.app-logo span{color:var(--accent)}\n.bar-sep{width:1px;height:20px;background:var(--border)}\n.view-tabs{display:flex;gap:5px}\n.view-tab{padding:6px 16px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;border:none;transition:all .2s;letter-spacing:.5px;text-transform:uppercase}\n.view-tab.garage{background:rgba(255,107,0,.15);color:var(--accent)}\n.view-tab.garage.active{background:var(--accent);color:#fff}\n.view-tab.client{background:var(--bg3);color:var(--text3);border:1px solid var(--border)}\n.view-tab.client.active{background:#fff;color:#1a1714}\n.bar-right{margin-left:auto;display:flex;align-items:center;gap:10px}\n.live-pill{display:flex;align-items:center;gap:6px;background:var(--green-bg);border:1px solid var(--green-b);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;color:var(--green)}\n.live-dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 1.5s infinite}\n@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}\n.moto-sel{background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:5px 10px;color:var(--text);font-size:12px;outline:none;cursor:pointer}\n\n/* ════════════════════════════════════════\n   GARAGE LAYOUT\n════════════════════════════════════════ */\n#garageView{position:fixed;top:52px;left:0;right:0;bottom:0;display:flex}\n#clientView{position:fixed;top:52px;left:0;right:0;bottom:0;display:none;justify-content:center;background:var(--cbg);overflow-y:auto}\n\n/* SIDEBAR */\n.g-sidebar{\n  width:210px;flex-shrink:0;background:var(--bg2);border-right:1px solid var(--border);\n  display:flex;flex-direction:column;overflow-y:auto;\n}\n.g-nav{padding:12px 10px;flex:1}\n.g-nav-sec{font-size:9px;color:var(--text3);letter-spacing:3px;text-transform:uppercase;padding:12px 8px 6px}\n.g-nav-item{\n  display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:7px;\n  cursor:pointer;font-size:13px;color:var(--text2);font-weight:500;\n  transition:all .15s;border:none;background:none;width:100%;text-align:left;\n}\n.g-nav-item:hover{background:var(--bg3);color:var(--text)}\n.g-nav-item.active{background:rgba(255,107,0,.15);color:var(--accent)}\n.g-nav-item svg{width:15px;height:15px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:2}\n.g-nav-badge{margin-left:auto;background:var(--accent);color:#fff;font-size:9px;padding:1px 6px;border-radius:20px;font-weight:700}\n.g-nav-badge.red{background:var(--red)}\n.g-sidebar-foot{padding:12px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px}\n.g-avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#c43d00);display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;color:#fff;flex-shrink:0}\n.g-user-name{font-size:12px;font-weight:600}\n.g-user-role{font-size:10px;color:var(--text3)}\n\n/* MAIN CONTENT */\n.g-main{flex:1;overflow-y:auto;overflow-x:hidden}\n\n/* ════════════════════════════════════════\n   COMMON COMPONENTS\n════════════════════════════════════════ */\n.page-wrap{padding:24px;min-height:100%}\n.page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}\n.page-title{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:.5px}\n.page-sub{font-size:12px;color:var(--text3);margin-top:2px}\n\n/* Cards */\n.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:18px;box-shadow:var(--sh)}\n.card.clickable{cursor:pointer;transition:all .2s}\n.card.clickable:hover{border-color:var(--border2);background:var(--bg3);transform:translateY(-1px)}\n.card.clickable.sel{border-color:var(--accent);background:rgba(255,107,0,.04)}\n\n/* Buttons */\n.btn{display:inline-flex;align-items:center;gap:7px;padding:8px 16px;border-radius:7px;border:none;cursor:pointer;font-family:'Barlow',sans-serif;font-size:12px;font-weight:700;transition:all .2s;white-space:nowrap}\n.btn-primary{background:var(--accent);color:#fff}\n.btn-primary:hover{background:var(--accent2)}\n.btn-green{background:var(--green);color:#fff}\n.btn-green:hover{background:#16a34a}\n.btn-ghost{background:var(--bg3);color:var(--text2);border:1px solid var(--border)}\n.btn-ghost:hover{color:var(--text)}\n.btn-danger{background:var(--red-bg);color:var(--red);border:1px solid var(--red-b)}\n.btn-danger:hover{background:var(--red);color:#fff}\n.btn-sm{padding:5px 11px;font-size:11px}\n.btn-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}\n\n/* Inputs */\n.f-group{margin-bottom:14px}\n.f-label{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-bottom:6px;display:block}\n.f-input{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:8px 12px;color:var(--text);font-size:13px;outline:none;transition:border-color .15s}\n.f-input:focus{border-color:var(--accent)}\n.f-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}\n.f-select{appearance:none;cursor:pointer}\n\n/* Tags */\n.tag{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700}\n.tag-green{background:var(--green-bg);color:var(--green)}\n.tag-blue{background:var(--blue-bg);color:var(--blue)}\n.tag-yellow{background:var(--yellow-bg);color:var(--yellow)}\n.tag-red{background:var(--red-bg);color:var(--red)}\n.tag-orange{background:var(--orange-bg);color:var(--orange)}\n.tag-purple{background:var(--purple-bg);color:var(--purple)}\n\n/* Stat cards */\n.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}\n.stat-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px;position:relative;overflow:hidden}\n.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px}\n.stat-card.g::before{background:var(--green)}.stat-card.b::before{background:var(--blue)}\n.stat-card.y::before{background:var(--yellow)}.stat-card.r::before{background:var(--red)}\n.stat-card.o::before{background:var(--orange)}.stat-card.p::before{background:var(--purple)}\n.stat-label{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px}\n.stat-val{font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:900;line-height:1}\n.stat-card.g .stat-val{color:var(--green)}.stat-card.b .stat-val{color:var(--blue)}\n.stat-card.y .stat-val{color:var(--yellow)}.stat-card.r .stat-val{color:var(--red)}\n.stat-card.o .stat-val{color:var(--orange)}.stat-card.p .stat-val{color:var(--purple)}\n.stat-sub{font-size:11px;color:var(--text3);margin-top:5px}\n\n/* Score bar */\n.score-wrap{display:flex;flex-direction:column;gap:4px;min-width:130px}\n.score-bar-bg{height:4px;background:var(--bg3);border-radius:2px;overflow:hidden}\n.score-bar-fill{height:100%;border-radius:2px;transition:width .6s}\n\n/* Modal */\n.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);display:none;align-items:center;justify-content:center;z-index:2000;padding:20px}\n.modal-overlay.open{display:flex}\n.modal{background:var(--bg2);border:1px solid var(--border);border-radius:14px;width:100%;max-width:700px;max-height:88vh;overflow-y:auto;animation:slideUp .25s ease}\n@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}\n.modal-head{padding:20px 22px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px}\n.modal-body{padding:22px}\n.modal-close{margin-left:auto;width:28px;height:28px;border-radius:6px;background:var(--bg3);border:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:16px}\n.modal-close:hover{background:var(--red-bg);color:var(--red)}\n\n/* Toast */\n.toast{position:fixed;bottom:24px;right:24px;background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 18px;font-size:13px;font-weight:600;z-index:3000;display:flex;align-items:center;gap:8px;transform:translateY(80px);opacity:0;transition:all .35s cubic-bezier(.34,1.56,.64,1);max-width:380px}\n.toast.show{transform:translateY(0);opacity:1}\n\n/* Info banner */\n.info-ban{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:8px;border:1px solid;margin-bottom:12px;font-size:13px;line-height:1.5}\n.info-ban.blue{background:var(--blue-bg);border-color:var(--blue-b);color:#93b8f5}\n.info-ban.green{background:var(--green-bg);border-color:var(--green-b);color:#86efac}\n.info-ban.yellow{background:var(--yellow-bg);border-color:var(--yellow-b);color:#fde68a}\n.info-ban.red{background:var(--red-bg);border-color:var(--red-b);color:#fca5a5}\n.info-ban.orange{background:var(--orange-bg);border-color:rgba(249,115,22,.3);color:#fdba74}\n\n/* ════════════════════════════════════════\n   SECTION: DASHBOARD\n════════════════════════════════════════ */\n.moto-grid{display:grid;gap:10px}\n.moto-row{\n  background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);\n  display:grid;grid-template-columns:42px 1fr 110px 90px 150px 12px;\n  align-items:center;gap:14px;padding:13px 16px;\n  cursor:pointer;transition:all .2s;\n}\n.moto-row:hover{border-color:var(--accent);background:var(--bg3)}\n.moto-row.flash{animation:flashRow .6s ease}\n@keyframes flashRow{0%{border-color:var(--green);box-shadow:0 0 0 3px rgba(34,197,94,.25)}100%{border-color:var(--border);box-shadow:none}}\n.moto-icon{width:40px;height:40px;border-radius:8px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:20px}\n.moto-name{font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:700}\n.moto-meta{font-size:11px;color:var(--text3);margin-top:2px}\n.moto-plate{background:var(--bg3);border:1px solid var(--border);padding:4px 10px;border-radius:4px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:2px}\n.moto-km{text-align:right}\n.moto-km-val{font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700}\n.moto-km-lbl{font-size:10px;color:var(--text3)}\n.color-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}\n\n/* ════════════════════════════════════════\n   SECTION: FICHE MOTO (detail)\n════════════════════════════════════════ */\n.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}\n.d-box{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:13px}\n.d-box-label{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-bottom:4px}\n.d-box-val{font-size:14px;font-weight:600}\n.score-big{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:16px;grid-column:span 2;display:flex;align-items:center;gap:16px}\n.score-circle{width:65px;height:65px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;border:3px solid;flex-shrink:0}\n.sc-num{font-size:22px;font-weight:900;line-height:1}\n.sc-lbl{font-size:9px;letter-spacing:1px;text-transform:uppercase}\n.bdwn-item{display:flex;align-items:center;gap:8px;margin-bottom:7px}\n.bdwn-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}\n.bdwn-lbl{font-size:12px;color:var(--text2);flex:1}\n.bdwn-bar{width:70px;height:4px;background:var(--bg);border-radius:2px;overflow:hidden;flex-shrink:0}\n.bdwn-fill{height:100%;border-radius:2px}\n.bdwn-pts{font-size:11px;font-weight:700;width:32px;text-align:right}\n\n/* Timeline historique */\n.hist-timeline{position:relative;padding-left:20px}\n.hist-timeline::before{content:'';position:absolute;left:5px;top:0;bottom:0;width:2px;background:var(--border)}\n.hist-item{position:relative;margin-bottom:12px}\n.hist-dot{position:absolute;left:-18px;top:4px;width:12px;height:12px;border-radius:50%;border:2px solid var(--bg2)}\n.hist-card{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:11px 13px}\n.hist-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}\n.hist-card-title{font-size:13px;font-weight:600}\n.hist-card-date{font-size:11px;color:var(--text3)}\n.hist-card-desc{font-size:12px;color:var(--text2)}\n.hist-card-foot{display:flex;align-items:center;justify-content:space-between;margin-top:7px}\n\n/* ════════════════════════════════════════\n   SECTION: ENTRETIEN\n════════════════════════════════════════ */\n.km-slider{width:100%;appearance:none;height:5px;border-radius:3px;background:var(--border2);outline:none;cursor:pointer}\n.km-slider::-webkit-slider-thumb{appearance:none;width:20px;height:20px;border-radius:50%;background:var(--accent);cursor:pointer;box-shadow:0 2px 8px rgba(255,107,0,.3)}\n.op-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:15px;display:flex;gap:12px;align-items:flex-start;margin-bottom:9px;cursor:pointer;transition:all .2s;position:relative}\n.op-card:hover{border-color:var(--border2)}\n.op-card.urgent{border-left:3px solid var(--red)}\n.op-card.warning{border-left:3px solid var(--yellow)}\n.op-card.ok{border-left:3px solid var(--green)}\n.op-card.future{border-left:3px solid var(--border2);opacity:.65}\n.op-icon{width:38px;height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}\n.op-prog-bg{height:3px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-top:8px}\n.op-prog-fill{height:100%;border-radius:2px;transition:width .8s}\n\n/* ════════════════════════════════════════\n   SECTION: DEVIS\n════════════════════════════════════════ */\n.dv-head{display:grid;grid-template-columns:26px 1fr 85px 65px 70px 75px 85px 30px;gap:8px;padding:6px 12px;background:var(--bg3);border-radius:7px 7px 0 0;margin-bottom:2px}\n.dv-hc{font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;font-weight:700}\n.dv-hc.r{text-align:right}\n.dv-row{display:grid;grid-template-columns:26px 1fr 85px 65px 70px 75px 85px 30px;gap:8px;padding:8px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:7px;margin-bottom:5px;align-items:center;transition:border-color .15s}\n.dv-row:hover{border-color:var(--border2)}\n.dv-row.green-row{border-color:var(--green-b);background:var(--green-bg)}\n.dv-row.red-row{border-color:var(--red-b);background:var(--red-bg)}\n.ci{background:var(--bg3);border:1px solid var(--border);border-radius:5px;padding:4px 7px;color:var(--text);font-size:12px;width:100%;outline:none;text-align:right;transition:border-color .15s}\n.ci:focus{border-color:var(--accent)}\n.ci.green-ci{border-color:var(--green-b);color:var(--green);font-weight:700}\n.ci.red-ci{border-color:var(--red-b);color:var(--red);font-weight:700}\n.row-icon-btn{width:14px;height:14px;border-radius:3px;border:none;cursor:pointer;font-size:9px;display:flex;align-items:center;justify-content:center;transition:all .2s}\n.row-icon-btn.g{background:var(--green-bg);color:var(--green)}\n.row-icon-btn.g:hover{background:var(--green);color:#fff}\n.row-icon-btn.r{background:var(--red-bg);color:var(--red)}\n.row-icon-btn.r:hover{background:var(--red);color:#fff}\n.row-icon-btn.x{background:var(--bg3);color:var(--text3)}\n.row-icon-btn.x:hover{background:var(--red);color:#fff}\n.reason-row{display:flex;align-items:center;gap:8px;padding:4px 12px 8px;margin-top:-3px}\n.reason-in{flex:1;border:1px solid;border-radius:6px;padding:5px 10px;font-size:11px;outline:none}\n\n/* Totals */\n.total-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:18px;margin-top:16px}\n.tc-row{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}\n.tc-row:last-child{border:none;padding-top:14px}\n.tc-label{color:var(--text2)}\n.tc-val{font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700}\n.tc-row.green-tc{background:var(--green-bg);border-radius:6px;padding:7px 10px;border:none;margin:4px 0}\n.tc-row.green-tc .tc-label{color:var(--green)}\n.tc-row.green-tc .tc-val{color:var(--green)}\n.tc-row.red-tc{background:var(--red-bg);border-radius:6px;padding:7px 10px;border:none;margin:4px 0}\n.tc-row.red-tc .tc-label{color:var(--red)}\n.tc-row.red-tc .tc-val{color:var(--red)}\n.total-ttc-block{background:var(--bg);border-radius:10px;padding:20px;text-align:center;margin-top:14px}\n.ttc-label{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-bottom:6px}\n.ttc-ht{font-size:12px;color:var(--text3);margin-bottom:3px}\n.ttc-val{font-family:'Barlow Condensed',sans-serif;font-size:44px;font-weight:900;color:var(--text)}\n.ttc-tva{font-size:11px;color:var(--text3);margin-top:4px}\n\n/* ════════════════════════════════════════\n   SECTION: ANTI-FRAUDE\n════════════════════════════════════════ */\n.fraud-steps{display:grid;gap:10px}\n.f-step{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px;display:flex;align-items:center;gap:14px;transition:all .3s}\n.f-step.running{border-color:var(--yellow-b);background:var(--yellow-bg)}\n.f-step.done{border-color:var(--green-b);background:var(--green-bg)}\n.f-step.failed{border-color:var(--red-b);background:var(--red-bg)}\n.f-step.warn{border-color:var(--yellow-b);background:var(--yellow-bg)}\n.f-step-icon{font-size:22px;width:30px;text-align:center}\n.f-step-info{flex:1}\n.f-step-title{font-size:13px;font-weight:600}\n.f-step-desc{font-size:11px;color:var(--text2);margin-top:2px}\n.f-step-status{width:26px;height:26px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;transition:all .3s}\n.f-step-status.spin{animation:spin .8s linear infinite;border-top-color:var(--yellow);border-color:var(--border2)}\n@keyframes spin{to{transform:rotate(360deg)}}\n.f-step-status.ok{background:var(--green);border-color:var(--green);color:#fff}\n.f-step-status.fail{background:var(--red);border-color:var(--red);color:#fff}\n.f-step-status.warn{background:var(--yellow);border-color:var(--yellow);color:#000}\n\n/* Trust circle */\n.trust-hero{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:22px;display:flex;align-items:center;gap:22px;margin-bottom:16px}\n.trust-circle{position:relative;width:100px;height:100px;flex-shrink:0}\n.trust-circle svg{transform:rotate(-90deg)}\n.trust-num-wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}\n.trust-pct{font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:900;line-height:1}\n.trust-lbl{font-size:9px;color:var(--text3);letter-spacing:1px;text-transform:uppercase}\n.trust-verdict{font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:900;margin-bottom:6px}\n.trust-sub{font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:10px}\n\n/* ════════════════════════════════════════\n   SECTION: TRANSFERT\n════════════════════════════════════════ */\n.transfer-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:0;margin-bottom:22px}\n.ts-item{display:flex;flex-direction:column;align-items:center;position:relative}\n.ts-item::before{content:'';position:absolute;top:15px;left:50%;right:-50%;height:2px;background:var(--border);z-index:0}\n.ts-item:last-child::before{display:none}\n.ts-item.done::before{background:var(--green)}\n.ts-dot{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;z-index:1;transition:all .3s;border:2px solid var(--border);background:var(--bg3);color:var(--text3)}\n.ts-dot.done{background:var(--green);border-color:var(--green);color:#fff}\n.ts-dot.active{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 0 0 4px rgba(255,107,0,.2)}\n.ts-label{font-size:10px;color:var(--text3);margin-top:5px;text-align:center;max-width:80px;line-height:1.3}\n.ts-label.active{color:var(--accent)}\n.ts-label.done{color:var(--green)}\n\n/* Code display */\n.code-display{background:var(--bg3);border:2px solid var(--accent);border-radius:var(--r);padding:24px;text-align:center;margin-bottom:16px}\n.code-val{font-family:'Barlow Condensed',sans-serif;font-size:40px;font-weight:900;letter-spacing:8px;color:var(--accent)}\n\n/* Certificate */\n.cert{background:linear-gradient(135deg,var(--bg2),var(--bg3));border:1px solid var(--border);border-radius:14px;padding:28px;position:relative;overflow:hidden}\n.cert::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--accent),var(--green),var(--blue))}\n.cert-stamp{width:60px;height:60px;border-radius:50%;border:3px solid var(--green);display:flex;align-items:center;justify-content:center;text-align:center;flex-shrink:0}\n.cert-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}\n.cert-field{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;padding:11px}\n.cert-field-label{font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-bottom:3px}\n.cert-field-val{font-size:13px;font-weight:600}\n\n/* ════════════════════════════════════════\n   SECTION: PNEUS\n════════════════════════════════════════ */\n.tire-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}\n.tire-card{background:var(--bg2);border:2px solid var(--border);border-radius:var(--r);padding:14px;cursor:pointer;transition:all .2s;position:relative}\n.tire-card:hover{border-color:var(--border2);transform:translateY(-2px)}\n.tire-card.sel{border-color:var(--accent);background:rgba(255,107,0,.04)}\n.tire-card.reco::after{content:'✓ RECO';position:absolute;top:9px;right:-1px;background:var(--green);color:#fff;font-size:8px;font-weight:700;padding:2px 8px;border-radius:3px 0 0 3px}\n.tire-brand{font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-bottom:3px}\n.tire-name{font-family:'Barlow Condensed',sans-serif;font-size:17px;font-weight:700;margin-bottom:8px}\n.tire-spec-row{display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px}\n.tire-spec-label{color:var(--text3)}\n.tire-spec-val{font-weight:700;font-family:'Barlow Condensed',sans-serif;font-size:13px}\n.lv-bar-bg{height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-top:8px}\n.lv-bar-fill{height:100%;border-radius:2px;transition:width .6s}\n.tire-check{position:absolute;top:9px;left:9px;width:18px;height:18px;border-radius:50%;background:var(--accent);display:none;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700}\n.tire-card.sel .tire-check{display:flex}\n\n/* ════════════════════════════════════════\n   SECTION: PARAMÈTRES\n════════════════════════════════════════ */\n.params-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}\n.param-section{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:18px}\n.param-sec-title{font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px}\n.param-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)}\n.param-row:last-child{border:none}\n.param-label{font-size:13px;color:var(--text2)}\n.param-input{background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:5px 10px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700;width:80px;text-align:right;outline:none}\n.param-input:focus{border-color:var(--accent)}\n.param-unit{font-size:11px;color:var(--text3);margin-left:4px}\n.preset-row{display:flex;gap:5px;margin-top:10px;flex-wrap:wrap}\n.preset-btn{padding:4px 10px;border-radius:20px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid var(--border);color:var(--text3);background:none;transition:all .15s}\n.preset-btn:hover,.preset-btn.on{background:var(--accent);border-color:var(--accent);color:#fff}\n\n/* ════════════════════════════════════════\n   CLIENT VIEW\n════════════════════════════════════════ */\n.c-wrap{width:100%;max-width:430px;background:var(--cbg);min-height:100%;display:flex;flex-direction:column;margin:0 auto}\n.c-topbar{background:var(--cbg2);padding:14px 18px 0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}\n.c-logo{font-family:'DM Serif Display',serif;font-size:21px;color:var(--ct)}\n.c-logo span{color:#c9920a}\n.c-notif{width:34px;height:34px;border-radius:9px;background:var(--ccard);border:1px solid var(--cborder);display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;position:relative}\n.c-notif-dot{position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:var(--red);border:2px solid var(--ccard);display:none}\n\n.c-pages{flex:1;overflow-y:auto}\n.c-page{display:none;padding-bottom:80px}\n.c-page.active{display:block}\n\n.c-hero{margin:14px;border-radius:18px;background:#1a1714;padding:20px;position:relative;overflow:hidden}\n.c-hero::before{content:'';position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.03)}\n.c-greeting{font-size:11px;color:rgba(255,255,255,.35);letter-spacing:2px;text-transform:uppercase;margin-bottom:3px}\n.c-name{font-family:'DM Serif Display',serif;font-size:22px;color:#fff;margin-bottom:14px}\n.c-moto-row{display:flex;align-items:center;justify-content:space-between}\n.c-moto-name{font-family:'DM Serif Display',serif;font-size:18px;color:#fff}\n.c-moto-meta{font-size:11px;color:rgba(255,255,255,.35);margin-top:2px}\n.c-score-circ{width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.12);display:flex;flex-direction:column;align-items:center;justify-content:center}\n.c-score-num{font-family:'DM Serif Display',serif;font-size:21px;color:#fff;line-height:1}\n.c-score-lbl{font-size:9px;color:rgba(255,255,255,.35);letter-spacing:1px;text-transform:uppercase}\n.c-badge{display:inline-flex;align-items:center;gap:6px;margin-top:13px;padding:5px 12px;border-radius:20px;border:1px solid rgba(255,255,255,.1);font-size:11px;color:rgba(255,255,255,.55);font-weight:500}\n.c-badge-dot{width:8px;height:8px;border-radius:50%}\n\n.c-qs{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:0 14px 14px}\n.c-qs-card{background:var(--ccard);border:1px solid var(--cborder);border-radius:13px;padding:13px;box-shadow:0 2px 12px rgba(0,0,0,.05)}\n.c-qs-label{font-size:10px;color:var(--ct3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px}\n.c-qs-val{font-family:'DM Serif Display',serif;font-size:20px;color:var(--ct)}\n.c-qs-sub{font-size:10px;color:var(--ct3);margin-top:2px}\n\n.c-section{padding:0 14px 14px}\n.c-sec-title{font-family:'DM Serif Display',serif;font-size:19px;color:var(--ct);margin-bottom:11px}\n\n.c-alert{background:var(--ccard);border:1px solid var(--cborder);border-radius:13px;padding:14px;margin-bottom:9px;display:flex;gap:11px;align-items:flex-start;box-shadow:0 2px 10px rgba(0,0,0,.04)}\n.c-alert.urgent{border-left:3px solid var(--red);background:#fff8f8}\n.c-alert.warn{border-left:3px solid var(--yellow);background:#fffdf0}\n.c-alert.ok{border-left:3px solid var(--green);background:#f8fef9}\n.c-alert-icon{font-size:20px;flex-shrink:0}\n.c-alert-title{font-size:13px;font-weight:700;color:var(--ct);margin-bottom:2px}\n.c-alert-desc{font-size:12px;color:var(--ct2);line-height:1.5}\n.c-alert-action{display:inline-flex;align-items:center;gap:5px;margin-top:9px;padding:7px 13px;background:var(--ct);border-radius:8px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s}\n.c-alert-action:hover{background:#ff6b00}\n\n.c-hist-card{background:var(--ccard);border:1px solid var(--cborder);border-radius:13px;padding:13px;margin-bottom:9px;display:flex;gap:10px;align-items:flex-start;box-shadow:0 2px 10px rgba(0,0,0,.04);position:relative}\n.c-hist-bar{width:3px;border-radius:2px;align-self:stretch;flex-shrink:0;min-height:36px}\n.c-hist-title{font-size:13px;font-weight:600;color:var(--ct);margin-bottom:2px}\n.c-hist-meta{font-size:11px;color:var(--ct3);margin-bottom:6px}\n.c-hist-km{font-size:11px;color:var(--ct3);margin-top:5px}\n.c-new-tag{position:absolute;top:8px;right:10px;background:var(--green);color:#fff;font-size:8px;font-weight:700;padding:2px 7px;border-radius:10px;letter-spacing:1px;text-transform:uppercase}\n\n.c-plan-card{background:var(--ccard);border:1px solid var(--cborder);border-radius:13px;padding:14px;margin-bottom:9px;box-shadow:0 2px 10px rgba(0,0,0,.04)}\n.c-plan-header{display:flex;align-items:center;gap:10px;margin-bottom:8px}\n.c-plan-icon{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}\n.c-plan-name{font-size:13px;font-weight:700;color:var(--ct)}\n.c-plan-km{font-size:11px;color:var(--ct3);margin-top:1px}\n.c-plan-status{margin-left:auto;font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px}\n.c-plan-prog-bg{height:3px;background:#f0ede6;border-radius:2px;overflow:hidden;margin-bottom:7px}\n.c-plan-prog-fill{height:100%;border-radius:2px;transition:width .8s}\n.c-plan-detail{font-size:12px;color:var(--ct2);line-height:1.5}\n\n.c-doc-row{background:var(--ccard);border:1px solid var(--cborder);border-radius:13px;padding:13px 15px;margin-bottom:9px;box-shadow:0 2px 10px rgba(0,0,0,.04);display:flex;align-items:center;gap:12px;cursor:pointer}\n.c-doc-icon{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0}\n.c-doc-name{font-size:13px;font-weight:600;color:var(--ct)}\n.c-doc-date{font-size:11px;color:var(--ct3);margin-top:2px}\n\n.c-bottom-nav{position:sticky;bottom:0;background:var(--ccard);border-top:1px solid var(--cborder);display:grid;grid-template-columns:repeat(4,1fr);padding:10px 0 16px;box-shadow:0 -4px 20px rgba(0,0,0,.06);flex-shrink:0}\n.c-nav-btn{display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;color:var(--ct3);font-size:10px;font-weight:500}\n.c-nav-btn.active{color:var(--ct)}\n.c-nav-btn svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2}\n</style>\n</head>\n<body>\n\n<!-- ════════════ MAIN BAR ════════════ -->\n<div id=\"mainBar\">\n  <div class=\"app-logo\">MOTO<span>KEY</span></div>\n  <div class=\"bar-sep\"></div>\n  <div class=\"view-tabs\">\n    <button class=\"view-tab garage active\" onclick=\"switchView('garage')\">🔧 Garage</button>\n    <button class=\"view-tab client\" onclick=\"switchView('client')\">📱 Client</button>\n  </div>\n  <div class=\"bar-right\">\n    <select class=\"moto-sel\" id=\"globalMotoSel\" onchange=\"changeMoto(this.value)\">\n      <option value=\"1\">Yamaha MT-07 — Sophie Laurent</option>\n      <option value=\"2\">Honda CB750 — Pierre Moreau</option>\n      <option value=\"3\">Kawasaki Z900 — Marc Dubois</option>\n      <option value=\"4\">Ducati Monster 937 — Claire Petit</option>\n    </select>\n    <div class=\"live-pill\"><div class=\"live-dot\"></div>Sync live</div>\n  </div>\n</div>\n\n<!-- ════════════ GARAGE VIEW ════════════ -->\n<div id=\"garageView\">\n\n  <!-- SIDEBAR -->\n  <div class=\"g-sidebar\">\n    <nav class=\"g-nav\">\n      <div class=\"g-nav-sec\">Principal</div>\n      <button class=\"g-nav-item active\" onclick=\"goSection('dashboard')\">\n        <svg viewBox=\"0 0 24 24\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/></svg>\n        Tableau de bord\n      </button>\n      <button class=\"g-nav-item\" onclick=\"goSection('fiche')\">\n        <svg viewBox=\"0 0 24 24\"><circle cx=\"5.5\" cy=\"17.5\" r=\"2.5\"/><circle cx=\"18.5\" cy=\"17.5\" r=\"2.5\"/><path d=\"M8 17.5h7M3 14.5l2-6h12l2 4H3z\"/></svg>\n        Fiche moto\n      </button>\n      <button class=\"g-nav-item\" onclick=\"goSection('entretien')\">\n        <svg viewBox=\"0 0 24 24\"><path d=\"M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z\"/></svg>\n        Plan d'entretien\n      </button>\n      <button class=\"g-nav-item\" onclick=\"goSection('pneus')\">\n        <svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>\n        Pneus\n      </button>\n      <div class=\"g-nav-sec\">Facturation</div>\n      <button class=\"g-nav-item\" onclick=\"goSection('devis')\">\n        <svg viewBox=\"0 0 24 24\"><path d=\"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z\"/><polyline points=\"14 2 14 8 20 8\"/><line x1=\"16\" y1=\"13\" x2=\"8\" y2=\"13\"/><line x1=\"16\" y1=\"17\" x2=\"8\" y2=\"17\"/></svg>\n        Devis & Factures\n      </button>\n      <div class=\"g-nav-sec\">Sécurité</div>\n      <button class=\"g-nav-item\" onclick=\"goSection('fraude')\">\n        <svg viewBox=\"0 0 24 24\"><path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"/></svg>\n        Anti-fraude\n        <span class=\"g-nav-badge red\" id=\"fraudeBadge\">1</span>\n      </button>\n      <button class=\"g-nav-item\" onclick=\"goSection('transfert')\">\n        <svg viewBox=\"0 0 24 24\"><path d=\"M5 12h14M12 5l7 7-7 7\"/></svg>\n        Transfert\n      </button>\n      <div class=\"g-nav-sec\">Réglages</div>\n      <button class=\"g-nav-item\" onclick=\"goSection('params')\">\n        <svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83\"/></svg>\n        Paramètres\n      </button>\n    </nav>\n    <div class=\"g-sidebar-foot\">\n      <div class=\"g-avatar\">JM</div>\n      <div>\n        <div class=\"g-user-name\">Jean-Marc Duval</div>\n        <div class=\"g-user-role\">Chef de garage</div>\n      </div>\n    </div>\n  </div>\n\n  <!-- MAIN CONTENT -->\n  <div class=\"g-main\" id=\"gMain\"></div>\n</div>\n\n<!-- ════════════ CLIENT VIEW ════════════ -->\n<div id=\"clientView\">\n  <div class=\"c-wrap\">\n    <div class=\"c-topbar\">\n      <div class=\"c-logo\">Moto<span>Key</span></div>\n      <div class=\"c-notif\" id=\"cNotifBtn\" onclick=\"showToast('🔔 1 nouvelle alerte — Vidange à planifier')\">\n        🔔<div class=\"c-notif-dot\" id=\"cNotifDot\"></div>\n      </div>\n    </div>\n    <div class=\"c-pages\" id=\"cPages\">\n      <!-- pages injected by JS -->\n    </div>\n    <div class=\"c-bottom-nav\">\n      <div class=\"c-nav-btn active\" id=\"cnav-home\" onclick=\"switchCPage('home')\">\n        <svg viewBox=\"0 0 24 24\"><path d=\"M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z\"/><polyline points=\"9 22 9 12 15 12 15 22\"/></svg>Accueil\n      </div>\n      <div class=\"c-nav-btn\" id=\"cnav-history\" onclick=\"switchCPage('history')\">\n        <svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><polyline points=\"12 6 12 12 16 14\"/></svg>Historique\n      </div>\n      <div class=\"c-nav-btn\" id=\"cnav-entretien\" onclick=\"switchCPage('entretien')\">\n        <svg viewBox=\"0 0 24 24\"><path d=\"M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z\"/></svg>Entretien\n      </div>\n      <div class=\"c-nav-btn\" id=\"cnav-docs\" onclick=\"switchCPage('docs')\">\n        <svg viewBox=\"0 0 24 24\"><path d=\"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z\"/><polyline points=\"14 2 14 8 20 8\"/></svg>Documents\n      </div>\n    </div>\n  </div>\n</div>\n\n<div class=\"toast\" id=\"toast\"></div>\n<div class=\"modal-overlay\" id=\"modalOverlay\"><div class=\"modal\" id=\"modalContent\"></div></div>\n\n<script>\n/* ══════════════════════════════════════\n   SHARED STATE\n══════════════════════════════════════ */\nconst DB = {\n  garage:{\n    nom:'Garage MotoKey',\n    tauxStd:65, tauxSpec:80, tva:20,\n    techniciens:['J.-M. Duval','Lucas Renard','Thomas Petit']\n  },\n  motos:[\n    {id:1,marque:'Yamaha',modele:'MT-07',annee:2021,plaque:'EF-789-GH',vin:'JYARN22E00A000002',km:18650,proprio:'Sophie Laurent',couleur:'bleu',score:74,sd:{c:20,p:40,pr:10,m:4},emoji:'🏍️',\n     hist:[\n       {t:'Vidange + filtre à air',d:'05/02/2026',km:18650,type:'bleu',tech:'Moto Shop Orléans',desc:'Huile Yamaha OEM, filtre WIX',verif:96,isNew:false},\n       {t:'Pneus avant + arrière',d:'11/11/2025',km:16200,type:'bleu',tech:'Top Moto 45',desc:'Michelin Road 6 monté + équilibré',verif:91,isNew:false},\n       {t:'Révision 12 000 km',d:'03/06/2025',km:12000,type:'vert',tech:'Yamaha Concessionnaire',desc:'Révision constructeur complète',verif:99,isNew:false}\n     ],\n     plan:[\n       {id:'v6',icon:'🛢️',nom:'Vidange + filtre huile',kmInterval:6000,kmDerniere:18650,tempsH:0.8,pu:null,produit:'Yamalube 10W-40 · 3L',tags:['6 000 km','ou 1 an'],annuel:true},\n       {id:'fa',icon:'💨',nom:'Filtre à air',kmInterval:12000,kmDerniere:12000,tempsH:0.5,pu:null,produit:'Filtre Yamaha OEM',tags:['12 000 km'],annuel:false},\n       {id:'bg',icon:'⚡',nom:'Bougies (x2)',kmInterval:12000,kmDerniere:12000,tempsH:1.2,pu:null,produit:'NGK CR9EIA-9',tags:['12 000 km'],annuel:false},\n       {id:'ch',icon:'⛓️',nom:'Chaîne + pignons',kmInterval:12000,kmDerniere:12000,tempsH:1.8,pu:null,produit:'Kit RK 520 XSO',tags:['12 000 km'],annuel:false},\n       {id:'lf',icon:'🔴',nom:'Liquide de frein',kmInterval:24000,kmDerniere:6000,tempsH:0.8,pu:null,produit:'Motul RBF 600 DOT4',tags:['2 ans','DOT4'],annuel:false},\n       {id:'sv',icon:'🔧',nom:'Jeu aux soupapes',kmInterval:24000,kmDerniere:12000,tempsH:4.0,pu:null,produit:'—',tags:['24 000 km'],annuel:false},\n       {id:'pn',icon:'🔵',nom:'Pneus — contrôle',kmInterval:8000,kmDerniere:16200,tempsH:0.3,pu:null,produit:'Michelin Road 6',tags:['Pression','Usure'],annuel:false},\n     ]\n    },\n    {id:2,marque:'Honda',modele:'CB750 Four',annee:1978,plaque:'AB-456-CD',vin:'JH2RC1700RM200001',km:42300,proprio:'Pierre Moreau',couleur:'vert',score:92,sd:{c:40,p:30,pr:15,m:0},emoji:'🏍️',\n     hist:[{t:'Révision complète',d:'12/03/2026',km:42300,type:'vert',tech:'J.-M. Duval',desc:'Vidange, filtres, bougies, carbus',verif:94,isNew:false}],\n     plan:[{id:'v5cb',icon:'🛢️',nom:'Vidange + filtre',kmInterval:5000,kmDerniere:42300,tempsH:1.0,pu:null,produit:'Motul Classic 10W-40',tags:['5 000 km'],annuel:true}]\n    },\n    {id:3,marque:'Kawasaki',modele:'Z900',annee:2020,plaque:'IJ-012-KL',vin:'JKAZR9A14LA000003',km:29100,proprio:'Marc Dubois',couleur:'jaune',score:55,sd:{c:10,p:15,pr:25,m:5},emoji:'🏍️',\n     hist:[{t:'Vidange maison',d:'18/01/2026',km:29100,type:'jaune',tech:'Propriétaire',desc:'Castrol Power1 10W50',verif:54,isNew:false}],\n     plan:[{id:'v6z',icon:'🛢️',nom:'Vidange + filtre huile',kmInterval:6000,kmDerniere:29100,tempsH:0.8,pu:null,produit:'Motul 10W-50',tags:['6 000 km'],annuel:true}]\n    },\n    {id:4,marque:'Ducati',modele:'Monster 937',annee:2022,plaque:'MN-345-OP',vin:'ZDM1BBBJ0NB000004',km:8900,proprio:'Claire Petit',couleur:'vert',score:88,sd:{c:45,p:25,pr:10,m:0},emoji:'🏍️',\n     hist:[{t:'Révision 7 500 km',d:'28/02/2026',km:8900,type:'vert',tech:'Ducati Store Orléans',desc:'Courroies, soupapes, freins',verif:99,isNew:false}],\n     plan:[\n       {id:'vd',icon:'🛢️',nom:'Vidange + filtre',kmInterval:7500,kmDerniere:7500,tempsH:1.0,pu:null,produit:'Shell Advance 15W-50',tags:['7 500 km'],annuel:true},\n       {id:'cd',icon:'⚙️',nom:'Courroies distribution',kmInterval:15000,kmDerniere:7500,tempsH:6.0,pu:null,produit:'Kit Ducati OEM',tags:['15 000 km','⚠️ CRITIQUE'],annuel:false}\n     ]\n    }\n  ],\n  tires:[\n    {id:'road6',brand:'Michelin',nom:'Road 6',cat:'touring',catLbl:'Sport-Touring GT',icon:'🔵',reco:true,\n     kmAv:18000,kmAr:15000,grip:82,pluie:95,confort:90,longevite:95,prixAv:131.95,prixAr:181.95,couleur:'var(--blue)',\n     note:'Référence touring. Excellent grip mouillé. Durée maximale.',alertKm:14000},\n    {id:'rosso4',brand:'Pirelli',nom:'Diablo Rosso IV',cat:'sport',catLbl:'Sport Route',icon:'🔴',reco:false,\n     kmAv:8000,kmAr:7500,grip:95,pluie:75,confort:70,longevite:45,prixAv:130,prixAr:155,couleur:'var(--red)',\n     note:'Excellent grip sec. Durée de vie ~50% inférieure au Road 6.',alertKm:6000},\n    {id:'t32',brand:'Bridgestone',nom:'Battlax T32',cat:'touring',catLbl:'Touring Premium',icon:'🟢',reco:false,\n     kmAv:17000,kmAr:14000,grip:85,pluie:90,confort:92,longevite:90,prixAv:138,prixAr:152,couleur:'var(--green)',\n     note:'Concurrent direct du Road 6. Excellent confort.',alertKm:13000},\n    {id:'rsiv',brand:'Dunlop',nom:'RoadSmart IV',cat:'sport-touring',catLbl:'Sport-Touring',icon:'🟡',reco:false,\n     kmAv:15000,kmAr:12000,grip:88,pluie:85,confort:85,longevite:80,prixAv:123,prixAr:175,couleur:'var(--yellow)',\n     note:'Excellent compromis polyvalence/grip.',alertKm:10000},\n    {id:'m9rr',brand:'Metzeler',nom:'Sportec M9 RR',cat:'sport',catLbl:'Sport Piste-Route',icon:'🟠',reco:false,\n     kmAv:7000,kmAr:6000,grip:98,pluie:70,confort:60,longevite:35,prixAv:150,prixAr:165,couleur:'var(--orange)',\n     note:'Gomme ultra-tendre. Durée très limitée.',alertKm:5000},\n    {id:'agt2',brand:'Pirelli',nom:'Angel GT 2',cat:'touring',catLbl:'GT Touring',icon:'🟣',reco:false,\n     kmAv:16000,kmAr:14000,grip:83,pluie:88,confort:88,longevite:88,prixAv:125,prixAr:177,couleur:'var(--purple)',\n     note:'Bon GT. Confort/longévité équilibrés.',alertKm:12000}\n  ]\n};\n\n// Devis lines state\nlet devisLines = [];\nlet devisLineId = 0;\nlet globalRemiseType = 'fidelite';\nlet selectedTireId = 'rosso4';\nlet fraudeState = 'idle'; // idle | analyzing | result\nlet transfertStep = 1;\nlet currentMotoId = 1;\nlet currentGSection = 'dashboard';\nlet currentCPage = 'home';\nlet searchQuery = '';\n\n/* ══════════════════════════════════════\n   HELPERS\n══════════════════════════════════════ */\nconst getMoto = id => DB.motos.find(m=>m.id===id)||DB.motos[0];\nconst colVar = c => ({vert:'var(--green)',bleu:'var(--blue)',jaune:'var(--yellow)',rouge:'var(--red)'}[c]||'var(--text)');\nconst colBg  = c => ({vert:'var(--green-bg)',bleu:'var(--blue-bg)',jaune:'var(--yellow-bg)',rouge:'var(--red-bg)'}[c]||'');\nconst scoreLabel = c => ({vert:'Excellent',bleu:'Bon',jaune:'Moyen',rouge:'Insuffisant'}[c]||'');\nconst typeLabel  = t => ({vert:'🟢 Concession',bleu:'🔵 Pro validé',jaune:'🟡 Propriétaire',rouge:'🔴 Non effectué'}[t]||t);\nconst typeTagCls = t => ({vert:'tag-green',bleu:'tag-blue',jaune:'tag-yellow',rouge:'tag-red'}[t]||'');\nconst fmtKm = n => (n||0).toLocaleString('fr-FR')+' km';\nconst fmtEur = n => (Math.round((n||0)*100)/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';\n\nfunction getOpStatus(op, km, moto) {\n  const since = km - op.kmDerniere;\n  const pct = Math.min(100, op.kmInterval>0 ? (since/op.kmInterval)*100 : 0);\n  const kmLeft = Math.max(0, op.kmInterval - since);\n  if(pct>=100) return {s:'urgent',pct:100,kmLeft:0};\n  if(pct>=80) return {s:'warning',pct,kmLeft};\n  if(pct>=40) return {s:'due',pct,kmLeft};\n  if(op.kmDerniere>0) return {s:'ok',pct,kmLeft};\n  return {s:'future',pct:0,kmLeft:op.kmInterval};\n}\n\nfunction opStatusColor(s){\n  return {urgent:'var(--red)',warning:'var(--yellow)',due:'var(--orange)',ok:'var(--green)',future:'var(--border2)'}[s]||'var(--text)';\n}\nfunction opStatusLabel(s){\n  return {urgent:'🔴 EN RETARD',warning:'🟡 À PLANIFIER',due:'🟠 À PRÉVOIR',ok:'🟢 À JOUR',future:'⏳ FUTURE'}[s]||'';\n}\n\n/* ══════════════════════════════════════\n   VIEW SWITCHING\n══════════════════════════════════════ */\nfunction switchView(v){\n  document.getElementById('garageView').style.display = v==='garage'?'flex':'none';\n  document.getElementById('clientView').style.display = v==='client'?'flex':'none';\n  document.querySelectorAll('.view-tab').forEach(t=>t.classList.remove('active'));\n  document.querySelector('.view-tab.'+v).classList.add('active');\n  if(v==='client') renderClientView();\n}\n\nfunction changeMoto(val){\n  currentMotoId = parseInt(val);\n  renderSection(currentGSection);\n  if(document.getElementById('clientView').style.display!=='none') renderClientView();\n}\n\n/* ══════════════════════════════════════\n   GARAGE SECTIONS\n══════════════════════════════════════ */\nfunction goSection(sec){\n  currentGSection = sec;\n  document.querySelectorAll('.g-nav-item').forEach(b=>b.classList.remove('active'));\n  document.querySelectorAll('.g-nav-item').forEach(b=>{\n    if(b.textContent.trim().toLowerCase().includes(sec.substring(0,4).toLowerCase())) b.classList.add('active');\n  });\n  // manual match\n  const labels = {dashboard:'tableau',fiche:'fiche',entretien:'entretien',pneus:'pneus',devis:'devis',fraude:'anti',transfert:'transfert',params:'param'};\n  document.querySelectorAll('.g-nav-item').forEach(b=>{\n    if(b.textContent.toLowerCase().includes(labels[sec]||sec)) b.classList.add('active');\n  });\n  renderSection(sec);\n}\n\nfunction renderSection(sec){\n  const m = getMoto(currentMotoId);\n  const html = {\n    dashboard: renderDashboard,\n    fiche:     renderFiche,\n    entretien: renderEntretien,\n    pneus:     renderPneus,\n    devis:     renderDevis,\n    fraude:    renderFraude,\n    transfert: renderTransfert,\n    params:    renderParams\n  }[sec];\n  if(html) document.getElementById('gMain').innerHTML = html(m);\n  // Re-bind dynamic elements\n  if(sec==='entretien') bindEntretien(m);\n  if(sec==='devis') bindDevis();\n  if(sec==='pneus') renderTireGrid();\n}\n\n/* ────── DASHBOARD ────── */\nfunction renderDashboard(m){\n  const cnts = {vert:0,bleu:0,jaune:0,rouge:0};\n  DB.motos.forEach(x=>cnts[x.couleur]=(cnts[x.couleur]||0)+1);\n  const q = searchQuery.toLowerCase();\n  const filtered = q ? DB.motos.filter(mo=>\n    mo.plaque.toLowerCase().includes(q) ||\n    (mo.vin||'').toLowerCase().includes(q) ||\n    mo.marque.toLowerCase().includes(q) ||\n    mo.modele.toLowerCase().includes(q) ||\n    mo.proprio.toLowerCase().includes(q)\n  ) : DB.motos;\n  const rows = filtered.map(mo=>{\n    const col = colVar(mo.couleur);\n    return `<div class=\"moto-row\" onclick=\"selectMotoAndGo(${mo.id},'fiche')\">\n      <div class=\"moto-icon\">${mo.emoji}</div>\n      <div><div class=\"moto-name\">${mo.marque} ${mo.modele}</div><div class=\"moto-meta\">${mo.annee} · ${mo.proprio}</div></div>\n      <div class=\"moto-plate\">${mo.plaque}</div>\n      <div class=\"moto-km\"><div class=\"moto-km-val\">${mo.km.toLocaleString('fr-FR')}</div><div class=\"moto-km-lbl\">km</div></div>\n      <div class=\"score-wrap\">\n        <div style=\"display:flex;justify-content:space-between;font-size:11px\"><span style=\"color:${col};font-weight:700;font-size:10px;text-transform:uppercase\">${scoreLabel(mo.couleur)}</span><span style=\"color:${col};font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:700\">${mo.score}/100</span></div>\n        <div class=\"score-bar-bg\"><div class=\"score-bar-fill\" style=\"width:${mo.score}%;background:${col}\"></div></div>\n      </div>\n      <div class=\"color-dot\" style=\"background:${col}\"></div>\n    </div>`;\n  }).join('');\n  return `<div class=\"page-wrap\">\n    <div class=\"page-header\">\n      <div><div class=\"page-title\">Tableau de bord</div><div class=\"page-sub\">Vue d'ensemble du parc · ${DB.motos.length} motos</div></div>\n      <div style=\"display:flex;gap:8px\">\n        <button class=\"btn btn-ghost btn-sm\" onclick=\"openModal('addMotoModal')\">+ Moto</button>\n        <button class=\"btn btn-primary btn-sm\" onclick=\"openModal('addInterModal')\">+ Intervention</button>\n      </div>\n    </div>\n    <div class=\"stats-row\">\n      <div class=\"stat-card g\"><div class=\"stat-label\">Dossiers verts</div><div class=\"stat-val\">${cnts.vert||0}</div><div class=\"stat-sub\">Entretien tracé</div></div>\n      <div class=\"stat-card b\"><div class=\"stat-label\">Dossiers bleus</div><div class=\"stat-val\">${cnts.bleu||0}</div><div class=\"stat-sub\">Pro validé</div></div>\n      <div class=\"stat-card y\"><div class=\"stat-label\">Dossiers jaunes</div><div class=\"stat-val\">${cnts.jaune||0}</div><div class=\"stat-sub\">Propriétaire</div></div>\n      <div class=\"stat-card r\"><div class=\"stat-label\">Dossiers rouges</div><div class=\"stat-val\">${cnts.rouge||0}</div><div class=\"stat-sub\">Entretien manquant</div></div>\n    </div>\n    <div style=\"margin-bottom:12px\">\n      <input type=\"text\" placeholder=\"🔍 Rechercher par plaque, VIN, marque, modèle, propriétaire…\" value=\"${searchQuery.replace(/\"/g,'&quot;')}\" oninput=\"searchQuery=this.value;renderSection('dashboard')\" style=\"width:100%;box-sizing:border-box;padding:9px 14px;border-radius:9px;border:1px solid var(--border);background:var(--bg2);color:var(--text);font-size:13px;font-family:inherit;outline:none\">\n    </div>\n    <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:12px\">\n      <div class=\"page-title\" style=\"font-size:16px\">Dossiers Motos <span style=\"font-size:13px;font-weight:400;color:var(--text2)\">${filtered.length}/${DB.motos.length}</span></div>\n      <div style=\"display:flex;gap:5px\" id=\"dashFilters\">\n        <button class=\"btn btn-ghost btn-sm\" style=\"padding:4px 10px;font-size:10px\" onclick=\"filterDash('tous',this)\">Tous</button>\n        <button class=\"btn btn-ghost btn-sm\" style=\"padding:4px 10px;font-size:10px\" onclick=\"filterDash('vert',this)\">🟢</button>\n        <button class=\"btn btn-ghost btn-sm\" style=\"padding:4px 10px;font-size:10px\" onclick=\"filterDash('bleu',this)\">🔵</button>\n        <button class=\"btn btn-ghost btn-sm\" style=\"padding:4px 10px;font-size:10px\" onclick=\"filterDash('jaune',this)\">🟡</button>\n        <button class=\"btn btn-ghost btn-sm\" style=\"padding:4px 10px;font-size:10px\" onclick=\"filterDash('rouge',this)\">🔴</button>\n      </div>\n    </div>\n    <div class=\"moto-grid\">${rows}</div>\n  </div>`;\n}\n\nfunction selectMotoAndGo(id, sec){\n  currentMotoId = id;\n  document.getElementById('globalMotoSel').value = id;\n  goSection(sec);\n}\n\n/* ────── FICHE MOTO ────── */\nfunction renderFiche(m){\n  const col = colVar(m.couleur);\n  const colB = colBg(m.couleur);\n  const histHtml = m.hist.map(h=>`\n    <div class=\"hist-item\">\n      <div class=\"hist-dot\" style=\"background:${colVar(h.type)}\"></div>\n      <div class=\"hist-card\">\n        <div class=\"hist-card-head\"><div class=\"hist-card-title\">${h.t}</div><div class=\"hist-card-date\">${h.d}</div></div>\n        <div class=\"hist-card-desc\">${h.desc}</div>\n        <div class=\"hist-card-foot\">\n          <span class=\"tag ${typeTagCls(h.type)}\">${typeLabel(h.type)}</span>\n          <span style=\"font-size:11px;color:var(--text3)\">👤 ${h.tech} · ${fmtKm(h.km)} <span style=\"color:var(--purple);font-weight:600;margin-left:6px\">🛡️ ${h.verif}%</span></span>\n        </div>\n      </div>\n    </div>`).join('');\n  return `<div class=\"page-wrap\">\n    <div class=\"page-header\">\n      <div style=\"display:flex;align-items:center;gap:14px\">\n        <div style=\"width:52px;height:52px;border-radius:10px;background:${colB};display:flex;align-items:center;justify-content:center;font-size:26px\">${m.emoji}</div>\n        <div><div class=\"page-title\">${m.marque} ${m.modele}</div><div class=\"page-sub\">${m.annee} · ${m.vin}</div></div>\n      </div>\n      <div style=\"display:flex;gap:8px\">\n        <button class=\"btn btn-ghost btn-sm\" onclick=\"goSection('entretien')\">🔧 Entretien</button>\n        <button class=\"btn btn-primary btn-sm\" onclick=\"openModal('addInterModal')\">+ Intervention</button>\n        <button class=\"btn btn-ghost btn-sm\" onclick=\"goSection('transfert')\">🔑 Transférer</button>\n      </div>\n    </div>\n    <div class=\"detail-grid\">\n      <div class=\"d-box\"><div class=\"d-box-label\">Immatriculation</div><div class=\"d-box-val\">${m.plaque}</div></div>\n      <div class=\"d-box\"><div class=\"d-box-label\">Propriétaire</div><div class=\"d-box-val\">${m.proprio}</div></div>\n      <div class=\"d-box\"><div class=\"d-box-label\">Kilométrage</div><div class=\"d-box-val\">${fmtKm(m.km)}</div></div>\n      <div class=\"d-box\"><div class=\"d-box-label\">Interventions</div><div class=\"d-box-val\">${m.hist.length} enregistrées</div></div>\n      <div class=\"score-big\">\n        <div class=\"score-circle\" style=\"border-color:${col};background:${colB}\"><div class=\"sc-num\" style=\"color:${col}\">${m.score}</div><div class=\"sc-lbl\" style=\"color:${col}\">/100</div></div>\n        <div style=\"flex:1\">\n          <div style=\"font-size:13px;font-weight:600;margin-bottom:10px\">Score MotoKey — <span style=\"color:${col}\">${scoreLabel(m.couleur)}</span></div>\n          ${[['green','🟢 Concession',m.sd.c],['blue','🔵 Pro validé',m.sd.p],['yellow','🟡 Proprio',m.sd.pr],['red','🔴 Manquant',-m.sd.m]].map(([c,l,pts])=>`\n          <div class=\"bdwn-item\">\n            <div class=\"bdwn-dot\" style=\"background:var(--${c})\"></div>\n            <div class=\"bdwn-lbl\">${l}</div>\n            <div class=\"bdwn-bar\"><div class=\"bdwn-fill\" style=\"width:${Math.abs(pts)}%;background:var(--${c})\"></div></div>\n            <div class=\"bdwn-pts\" style=\"color:var(--${c})\">${pts>0?'+':''}${pts}</div>\n          </div>`).join('')}\n        </div>\n      </div>\n    </div>\n    <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;margin-bottom:12px\">Historique des interventions</div>\n    <div class=\"hist-timeline\">${histHtml}</div>\n    <div class=\"btn-row\">\n      <button class=\"btn btn-primary\" onclick=\"openModal('addInterModal')\">+ Ajouter intervention</button>\n      <button class=\"btn btn-ghost\" onclick=\"showToast('📄 Dossier exporté en PDF')\">📄 Exporter dossier</button>\n      <button class=\"btn btn-ghost\" onclick=\"showToast('🔲 QR Code client généré')\">🔲 QR Code</button>\n    </div>\n  </div>`;\n}\n\n/* ────── ENTRETIEN ────── */\nfunction renderEntretien(m){\n  return `<div class=\"page-wrap\">\n    <div class=\"page-header\">\n      <div><div class=\"page-title\">Plan d'entretien</div><div class=\"page-sub\">${m.marque} ${m.modele} · Source: Autodata / ETAI</div></div>\n      <div style=\"display:flex;align-items:center;gap:10px\">\n        <span style=\"font-size:12px;color:var(--text3)\">Km :</span>\n        <span style=\"font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700\" id=\"kmVal\">${m.km.toLocaleString('fr-FR')}</span>\n        <button class=\"btn btn-ghost btn-sm\" onclick=\"showToast('📤 Plan exporté PDF')\">📄 Exporter</button>\n      </div>\n    </div>\n    <div style=\"background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:18px\">\n      <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:10px\">\n        <span style=\"font-size:11px;color:var(--text3)\">Kilométrage actuel</span>\n        <span style=\"font-size:10px;color:var(--purple);font-weight:700\">🔌 Autodata · ETAI</span>\n      </div>\n      <input type=\"range\" class=\"km-slider\" id=\"entretienSlider\" min=\"0\" max=\"60000\" value=\"${m.km}\" oninput=\"updateEntretien(this.value)\">\n      <div style=\"display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:4px\"><span>0</span><span>20k</span><span>40k</span><span>60k</span></div>\n    </div>\n    <div style=\"display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap\" id=\"entretienTabs\">\n      <button class=\"btn btn-primary btn-sm\" onclick=\"filterOps('tous',this)\">Toutes</button>\n      <button class=\"btn btn-ghost btn-sm\" onclick=\"filterOps('urgent',this)\">🔴 Urgentes</button>\n      <button class=\"btn btn-ghost btn-sm\" onclick=\"filterOps('warning',this)\">🟡 À planifier</button>\n      <button class=\"btn btn-ghost btn-sm\" onclick=\"filterOps('ok',this)\">🟢 À jour</button>\n    </div>\n    <div id=\"opsList\"></div>\n    <div class=\"btn-row\">\n      <button class=\"btn btn-primary\" onclick=\"showToast('📋 Bon de travail généré')\">📋 Bon de travail</button>\n      <button class=\"btn btn-ghost\" onclick=\"showToast('📅 RDV proposé au client')\">📅 Proposer RDV</button>\n    </div>\n  </div>`;\n}\n\nfunction bindEntretien(m){\n  renderOpsList(m, m.km, 'tous');\n}\nfunction updateEntretien(val){\n  const m = getMoto(currentMotoId);\n  document.getElementById('kmVal').textContent = parseInt(val).toLocaleString('fr-FR');\n  renderOpsList(m, parseInt(val), window._opFilter||'tous');\n}\nfunction filterOps(f, el){\n  window._opFilter = f;\n  document.querySelectorAll('#entretienTabs button').forEach(b=>{b.className='btn btn-ghost btn-sm'});\n  el.className='btn btn-primary btn-sm';\n  const km = parseInt(document.getElementById('entretienSlider').value);\n  renderOpsList(getMoto(currentMotoId), km, f);\n}\nfunction renderOpsList(m, km, filter){\n  const ops = m.plan.filter(op=>{\n    const {s} = getOpStatus(op, km);\n    return filter==='tous'||s===filter;\n  });\n  document.getElementById('opsList').innerHTML = ops.map(op=>{\n    const {s, pct, kmLeft} = getOpStatus(op, km);\n    const col = opStatusColor(s);\n    return `<div class=\"op-card ${s}\" onclick=\"showToast('🔧 ${op.nom} — ${op.tempsH}h · Produit: ${op.produit}')\">\n      <div class=\"op-icon\" style=\"background:${col}22\">${op.icon}</div>\n      <div style=\"flex:1\">\n        <div style=\"font-size:14px;font-weight:700;margin-bottom:3px\">${op.nom}</div>\n        <div style=\"font-size:11px;color:var(--purple);margin-bottom:5px\">🔌 Constructeur · ${op.tempsH}h atelier · ${op.produit}</div>\n        <div style=\"display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px\">${op.tags.map(t=>`<span class=\"tag tag-purple\">${t}</span>`).join('')}</div>\n        <div class=\"op-prog-bg\"><div class=\"op-prog-fill\" style=\"width:${pct}%;background:${col}\"></div></div>\n      </div>\n      <div style=\"text-align:right;flex-shrink:0\">\n        <div style=\"font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;background:${col}22;color:${col};margin-bottom:5px\">${opStatusLabel(s)}</div>\n        <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;color:${col}\">${s==='urgent'?'!':kmLeft>0?'+'+kmLeft.toLocaleString('fr-FR'):'—'}</div>\n        ${kmLeft>0?`<div style=\"font-size:10px;color:var(--text3)\">km restants</div>`:''}\n      </div>\n    </div>`;\n  }).join('')||`<div style=\"text-align:center;padding:32px;color:var(--text3)\">Aucune opération dans ce filtre</div>`;\n}\n\n/* ────── PNEUS ────── */\nfunction renderPneus(m){\n  const lastKm = m.hist.find(h=>h.t.toLowerCase().includes('pneu'))?.km || m.km - 5000;\n  return `<div class=\"page-wrap\">\n    <div class=\"page-header\">\n      <div><div class=\"page-title\">Sélecteur de pneus</div><div class=\"page-sub\">${m.marque} ${m.modele} · Dim. 120/70-17 + 180/55-17 · Source: Dafy-Moto 2026</div></div>\n    </div>\n    <div class=\"info-ban blue\" style=\"margin-bottom:14px\"><span>ℹ️</span> Le plan d'entretien s'adapte automatiquement selon la durée de vie du pneu choisi.</div>\n    <div style=\"font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-bottom:10px\">Choisir les pneus (120/70-17 AV + 180/55-17 AR)</div>\n    <div class=\"tire-grid\" id=\"tireGridGarage\"></div>\n    <div style=\"background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:18px;margin-bottom:16px\" id=\"tireCompare\"></div>\n    <div style=\"background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:18px\" id=\"tirePlan\"></div>\n  </div>`;\n}\nfunction renderTireGrid(){\n  const m = getMoto(currentMotoId);\n  const lastKm = m.km - 2450;\n  document.getElementById('tireGridGarage').innerHTML = DB.tires.map(t=>`\n    <div class=\"tire-card ${t.id===selectedTireId?'sel':''} ${t.reco?'reco':''}\" onclick=\"selectTire('${t.id}')\">\n      <div class=\"tire-check\">✓</div>\n      <div class=\"tire-brand\">${t.brand}</div>\n      <div class=\"tire-name\">${t.nom}</div>\n      <span class=\"tag\" style=\"background:${t.couleur}22;color:${t.couleur};border:1px solid ${t.couleur}44;margin-bottom:8px;display:inline-flex\">${t.catLbl}</span>\n      <div class=\"tire-spec-row\"><span class=\"tire-spec-label\">AV (120/70-17)</span><span class=\"tire-spec-val\" style=\"color:${t.couleur}\">${t.prixAv}€</span></div>\n      <div class=\"tire-spec-row\"><span class=\"tire-spec-label\">AR (180/55-17)</span><span class=\"tire-spec-val\" style=\"color:${t.couleur}\">${t.prixAr}€</span></div>\n      <div class=\"tire-spec-row\" style=\"border-top:1px solid var(--border);padding-top:4px;margin-top:4px\"><span class=\"tire-spec-label\" style=\"font-weight:700\">Paire</span><span class=\"tire-spec-val\" style=\"color:var(--accent)\">${(t.prixAv+t.prixAr).toFixed(2)}€</span></div>\n      <div style=\"display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:8px\"><span>Longévité AR</span><span style=\"color:${t.couleur};font-weight:700\">~${t.kmAr.toLocaleString('fr-FR')} km</span></div>\n      <div class=\"lv-bar-bg\"><div class=\"lv-bar-fill\" style=\"width:${t.longevite}%;background:${t.couleur}\"></div></div>\n    </div>`).join('');\n  updateTireCompare();\n}\nfunction selectTire(id){\n  selectedTireId = id;\n  renderTireGrid();\n}\nfunction updateTireCompare(){\n  const m = getMoto(currentMotoId);\n  const sel = DB.tires.find(t=>t.id===selectedTireId);\n  const ref = DB.tires.find(t=>t.reco);\n  if(!sel) return;\n  const lastKm = m.km - 2450;\n  const kmSince = m.km - lastKm;\n  const pctAr = Math.min(100, Math.round((kmSince/sel.kmAr)*100));\n  const kmLeft = Math.max(0, sel.kmAr - kmSince);\n  const nextKm = lastKm + sel.kmAr;\n  const isAdapted = !sel.reco;\n  const diff = ref.kmAr - sel.kmAr;\n  const pctDiff = Math.round((diff/ref.kmAr)*100);\n\n  document.getElementById('tireCompare').innerHTML = `\n    <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;margin-bottom:12px\">Comparaison — ${sel.brand} ${sel.nom} vs ${ref.brand} ${ref.nom} ★</div>\n    ${[['Grip sec',sel.grip,ref.grip,'%'],['Grip mouillé',sel.pluie,ref.pluie,'%'],['Longévité AR',sel.kmAr,ref.kmAr,'km'],['Prix paire',(sel.prixAv+sel.prixAr),(ref.prixAv+ref.prixAr),'€']].map(([l,sv,rv,u])=>{\n      const sw = u==='€'?sv<=rv:sv>=rv;\n      return `<div style=\"display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px\">\n        <span style=\"color:var(--text2);flex:1\">${l}</span>\n        <span style=\"font-weight:700;color:${sw?sel.couleur:'var(--text3)'}\">${u==='km'?sv.toLocaleString('fr-FR'):sv}${u} ${sw?'✓':''}</span>\n        <span style=\"color:var(--text3)\">vs</span>\n        <span style=\"font-weight:700;color:${!sw?ref.couleur:'var(--text3)'}\">${u==='km'?rv.toLocaleString('fr-FR'):rv}${u} ${!sw?'✓':''}</span>\n      </div>`;\n    }).join('')}`;\n\n  document.getElementById('tirePlan').innerHTML = `\n    <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;margin-bottom:10px\">Plan adaptatif — ${sel.nom} ${isAdapted?'<span class=\"tag tag-orange\" style=\"font-size:10px;vertical-align:middle\">⚡ ADAPTÉ</span>':''}</div>\n    <div style=\"display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:12px\">\n      <div style=\"background:var(--bg3);border-radius:8px;padding:12px;text-align:center\"><div style=\"font-size:10px;color:var(--text3);margin-bottom:4px\">Montage</div><div style=\"font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700\">${lastKm.toLocaleString('fr-FR')} km</div></div>\n      <div style=\"background:var(--bg3);border-radius:8px;padding:12px;text-align:center\"><div style=\"font-size:10px;color:var(--text3);margin-bottom:4px\">Usure AR</div><div style=\"font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;color:${pctAr>80?'var(--red)':pctAr>50?'var(--yellow)':'var(--green)'}\">${pctAr}%</div></div>\n      <div style=\"background:var(--bg3);border-radius:8px;padding:12px;text-align:center\"><div style=\"font-size:10px;color:var(--text3);margin-bottom:4px\">Restant AR</div><div style=\"font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700\">${kmLeft.toLocaleString('fr-FR')} km</div></div>\n      <div style=\"background:var(--bg3);border-radius:8px;padding:12px;text-align:center\"><div style=\"font-size:10px;color:var(--text3);margin-bottom:4px\">Remplacement</div><div style=\"font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;color:var(--accent)\">${nextKm.toLocaleString('fr-FR')} km</div></div>\n    </div>\n    ${isAdapted?`<div class=\"info-ban yellow\"><span>⚠️</span> ${sel.nom} : durée de vie ~${pctDiff}% inférieure au ${ref.nom} recommandé. Alerte avancée à ${nextKm.toLocaleString('fr-FR')} km (au lieu de ${(lastKm+ref.kmAr).toLocaleString('fr-FR')} km).</div>`:''}\n    <div class=\"btn-row\">\n      <button class=\"btn btn-primary btn-sm\" onclick=\"showToast('💾 Pneu ${sel.brand} ${sel.nom} enregistré dans le dossier')\">💾 Enregistrer le choix</button>\n      <button class=\"btn btn-ghost btn-sm\" onclick=\"showToast('📅 Alerte pneu programmée à ${nextKm.toLocaleString('fr-FR')} km')\">📅 Programmer alerte</button>\n    </div>`;\n}\n\n/* ────── DEVIS ────── */\nfunction renderDevis(m){\n  // Init lines if empty\n  if(devisLines.length===0){\n    [{type:'mo',icon:'🔧',desc:'Vidange + filtre huile',ref:'MO-STD',qty:0.8,pu:null,useTauxSpec:false,remisePct:0,reasonType:'',note:'',showR:false},\n     {type:'fluide',icon:'🛢️',desc:'Huile Yamalube 10W-40 · 3L',ref:'FLU-YAM',qty:3,pu:12.50,remisePct:0,reasonType:'',note:'',showR:false},\n     {type:'piece',icon:'🔩',desc:'Filtre à huile Yamaha OEM',ref:'PIE-001',qty:1,pu:14.90,remisePct:0,reasonType:'',note:'',showR:false},\n     {type:'mo',icon:'🔧',desc:'Contrôle chaîne + graissage',ref:'MO-STD',qty:0.3,pu:null,useTauxSpec:false,remisePct:0,reasonType:'',note:'',showR:false},\n    ].forEach(l=>{devisLines.push({id:++devisLineId,...l})});\n  }\n  return `<div class=\"page-wrap\">\n    <div class=\"page-header\">\n      <div><div class=\"page-title\">Devis & Facturation</div><div class=\"page-sub\">${m.marque} ${m.modele} · ${m.proprio} · Devis #2026-${String(Math.floor(Math.random()*900+100)).padStart(3,'0')}</div></div>\n      <div style=\"display:flex;gap:8px\">\n        <select class=\"f-input f-select\" style=\"width:auto;padding:6px 10px;font-size:12px\">\n          <option>J.-M. Duval (chef)</option><option>Lucas Renard</option><option>Thomas Petit</option>\n        </select>\n      </div>\n    </div>\n    <div style=\"display:grid;grid-template-columns:1fr 300px;gap:16px\">\n      <div>\n        <!-- Lignes devis -->\n        <div class=\"dv-head\">\n          <div class=\"dv-hc\"></div><div class=\"dv-hc\">Description</div>\n          <div class=\"dv-hc r\">Réf.</div><div class=\"dv-hc r\">Qté/h</div>\n          <div class=\"dv-hc r\">PU HT</div><div class=\"dv-hc r\">Remise%</div>\n          <div class=\"dv-hc r\">Total HT</div><div class=\"dv-hc\"></div>\n        </div>\n        <div id=\"devisLinesContainer\"></div>\n        <div style=\"display:flex;gap:7px;margin-bottom:16px;flex-wrap:wrap\">\n          <button class=\"btn btn-ghost btn-sm\" onclick=\"addDevisLine('mo')\">🔧 +MO</button>\n          <button class=\"btn btn-ghost btn-sm\" onclick=\"addDevisLine('piece')\">🔩 +Pièce</button>\n          <button class=\"btn btn-ghost btn-sm\" onclick=\"addDevisLine('pneu')\">🔵 +Pneu</button>\n          <button class=\"btn btn-ghost btn-sm\" onclick=\"addDevisLine('fluide')\">🛢️ +Fluide</button>\n          <button class=\"btn btn-ghost btn-sm\" onclick=\"addDevisLine('libre')\">✏️ +Libre</button>\n        </div>\n        <!-- Geste global -->\n        <div class=\"card\" style=\"padding:16px\">\n          <div style=\"font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-bottom:10px\">Geste commercial global</div>\n          <div style=\"display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px\">\n            <div style=\"display:flex;gap:5px\">\n              <button class=\"btn btn-green btn-sm\" id=\"rgFid\" onclick=\"setGType('fidelite')\">★ Fidélité</button>\n              <button class=\"btn btn-ghost btn-sm\" id=\"rgGest\" onclick=\"setGType('geste')\">🎁 Geste</button>\n              <button class=\"btn btn-danger btn-sm\" id=\"rgLit\" onclick=\"setGType('litige')\">⚠ Litige</button>\n              <button class=\"btn btn-ghost btn-sm\" id=\"rgNone\" onclick=\"setGType('aucun')\">Aucun</button>\n            </div>\n            <div style=\"display:flex;align-items:center;gap:6px;margin-left:auto\">\n              <input type=\"number\" id=\"rgPct\" value=\"10\" min=\"0\" max=\"100\" style=\"background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:5px 9px;color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700;width:70px;text-align:right;outline:none\" oninput=\"recalcDevis()\">\n              <span style=\"font-size:14px;color:var(--text2);font-weight:700\">%</span>\n            </div>\n          </div>\n          <textarea id=\"rgNote\" rows=\"2\" style=\"width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:8px 12px;color:var(--text);font-family:'Barlow',sans-serif;font-size:12px;outline:none\" placeholder=\"Motif du geste…\">Client fidèle depuis 4 ans — 10% sur le total HT</textarea>\n        </div>\n      </div>\n      <!-- Récap droite -->\n      <div>\n        <div class=\"card\" style=\"padding:16px;margin-bottom:12px\">\n          <div style=\"display:flex;align-items:center;gap:10px;margin-bottom:12px\">\n            <div style=\"font-size:22px\">${m.emoji}</div>\n            <div><div style=\"font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700\">${m.marque} ${m.modele}</div><div style=\"font-size:11px;color:var(--text3)\">${m.proprio}</div></div>\n          </div>\n          <div id=\"devisCalcRows\"></div>\n          <div class=\"total-ttc-block\">\n            <div class=\"ttc-label\">Total à régler</div>\n            <div class=\"ttc-ht\" id=\"dvHT\">HT : —</div>\n            <div class=\"ttc-val\" id=\"dvTTC\">—</div>\n            <div class=\"ttc-tva\" id=\"dvTVA\">TVA : —</div>\n            <div id=\"dvRemTag\" style=\"margin-top:8px\"></div>\n          </div>\n        </div>\n        <div class=\"card\" style=\"padding:14px;margin-bottom:12px\">\n          <div style=\"font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-bottom:8px\">Impact MotoKey</div>\n          <div style=\"display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--border)\"><span style=\"color:var(--text2)\">Type entretien</span><span class=\"tag tag-blue\">🔵 Pro validé</span></div>\n          <div style=\"display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--border)\"><span style=\"color:var(--text2)\">Score avant</span><span style=\"font-weight:700\">${m.score}/100</span></div>\n          <div style=\"display:flex;justify-content:space-between;font-size:12px;padding:5px 0\"><span style=\"color:var(--text2)\">Score après</span><span style=\"font-weight:700;color:var(--green)\">+8 → ${m.score+8}/100</span></div>\n        </div>\n        <button class=\"btn btn-green\" style=\"width:100%;margin-bottom:7px\" onclick=\"validerDevis()\">✅ Valider & Sync client</button>\n        <button class=\"btn btn-primary\" style=\"width:100%;margin-bottom:7px\" onclick=\"showToast('📄 PDF généré et envoyé à ${m.proprio}')\">📄 PDF client</button>\n        <button class=\"btn btn-ghost\" style=\"width:100%\" onclick=\"showToast('💾 Brouillon sauvegardé')\">💾 Sauvegarder</button>\n      </div>\n    </div>\n  </div>`;\n}\nfunction bindDevis(){\n  renderDevisLines();\n  recalcDevis();\n}\nfunction renderDevisLines(){\n  const taux = DB.garage.tauxStd;\n  document.getElementById('devisLinesContainer').innerHTML = devisLines.map(l=>{\n    const isMO = l.type==='mo';\n    const pu = isMO ? (l.useTauxSpec?DB.garage.tauxSpec:DB.garage.tauxStd) : (l.pu||0);\n    const total = pu * l.qty * (1 - l.remisePct/100);\n    const rowCls = l.reasonType==='litige'?'red-row':l.remisePct>0?'green-row':'';\n    return `\n    <div id=\"dvr-${l.id}\">\n      <div class=\"dv-row ${rowCls}\">\n        <div style=\"width:22px;height:22px;border-radius:5px;background:${l.type==='mo'?'var(--orange-bg)':'var(--blue-bg)'};display:flex;align-items:center;justify-content:center;font-size:12px\">${l.icon}</div>\n        <div>\n          <input style=\"background:none;border:none;outline:none;color:var(--text);font-size:13px;font-weight:500;width:100%\" value=\"${l.desc}\" oninput=\"updDL(${l.id},'desc',this.value)\">\n          ${isMO?`<label style=\"font-size:10px;color:var(--text3);cursor:pointer\"><input type=\"checkbox\" ${l.useTauxSpec?'checked':''} onchange=\"updDL(${l.id},'useTauxSpec',this.checked)\" style=\"margin-right:3px\">Spécialiste (${DB.garage.tauxSpec}€/h)</label>`:''}\n        </div>\n        <input class=\"ci\" value=\"${l.ref}\" oninput=\"updDL(${l.id},'ref',this.value)\">\n        <div><input class=\"ci\" type=\"number\" step=\"${isMO?'0.25':'1'}\" min=\"0\" value=\"${l.qty}\" oninput=\"updDL(${l.id},'qty',parseFloat(this.value)||0)\"><div style=\"font-size:9px;color:var(--text3);text-align:right\">${isMO?'h':'u'}</div></div>\n        <div>${isMO?`<div style=\"text-align:right;font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:700;color:var(--text2)\">${pu}€</div>`:`<input class=\"ci\" type=\"number\" step=\"0.01\" min=\"0\" value=\"${l.pu||0}\" oninput=\"updDL(${l.id},'pu',parseFloat(this.value)||0)\">`}</div>\n        <div><input class=\"ci ${l.remisePct>0?(l.reasonType==='litige'?'red-ci':'green-ci'):''}\" type=\"number\" min=\"0\" max=\"100\" value=\"${l.remisePct}\" oninput=\"updDL(${l.id},'remisePct',parseFloat(this.value)||0)\"><div style=\"font-size:9px;color:var(--text3);text-align:right\">%</div></div>\n        <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700;text-align:right;color:${l.remisePct>0?(l.reasonType==='litige'?'var(--red)':'var(--green)'):'var(--text)'}\">${fmtEur(total)}</div>\n        <div style=\"display:flex;flex-direction:column;gap:3px\">\n          <button class=\"row-icon-btn g\" onclick=\"toggleDLReason(${l.id},'remise')\" title=\"Remise\">💚</button>\n          <button class=\"row-icon-btn r\" onclick=\"toggleDLReason(${l.id},'litige')\" title=\"Litige\">⚠</button>\n          <button class=\"row-icon-btn x\" onclick=\"delDL(${l.id})\" title=\"Suppr\">✕</button>\n        </div>\n      </div>\n      ${l.showR?`<div class=\"reason-row\"><span style=\"font-size:14px\">${l.reasonType==='litige'?'⚠️':'💚'}</span><input class=\"reason-in\" style=\"background:${l.reasonType==='litige'?'var(--red-bg)':'var(--green-bg)'};border-color:${l.reasonType==='litige'?'var(--red-b)':'var(--green-b)'};color:${l.reasonType==='litige'?'var(--red)':'var(--green)'}\" placeholder=\"${l.reasonType==='litige'?'Motif du litige…':'Motif de la remise…'}\" value=\"${l.note}\" oninput=\"updDL(${l.id},'note',this.value)\"></div>`:''}\n    </div>`;\n  }).join('');\n}\nfunction updDL(id,f,v){const l=devisLines.find(x=>x.id===id);if(l){l[f]=v;renderDevisLines();recalcDevis();}}\nfunction addDevisLine(type){\n  const defs={mo:{icon:'🔧',desc:'Main d\\'œuvre',ref:'MO-STD',qty:1,pu:null,useTauxSpec:false},piece:{icon:'🔩',desc:'Pièce',ref:'PIE-XXX',qty:1,pu:0},pneu:{icon:'🔵',desc:'Pneu',ref:'PNE-XXX',qty:1,pu:0},fluide:{icon:'🛢️',desc:'Fluide',ref:'FLU-XXX',qty:1,pu:0},libre:{icon:'✏️',desc:'Ligne libre',ref:'—',qty:1,pu:0}};\n  devisLines.push({id:++devisLineId,type,...defs[type]||defs.libre,remisePct:0,reasonType:'',note:'',showR:false});\n  renderDevisLines();recalcDevis();\n}\nfunction delDL(id){devisLines=devisLines.filter(x=>x.id!==id);renderDevisLines();recalcDevis();}\nfunction toggleDLReason(id,type){const l=devisLines.find(x=>x.id===id);if(!l)return;if(l.showR&&l.reasonType===type){l.showR=false;l.reasonType='';if(type==='litige')l.remisePct=0;}else{l.showR=true;l.reasonType=type;if(type==='litige'&&l.remisePct===0)l.remisePct=100;}renderDevisLines();recalcDevis();}\nfunction setGType(t){globalRemiseType=t;recalcDevis();}\nfunction recalcDevis(){\n  let moHT=0,pieHT=0,remLines=0;\n  devisLines.forEach(l=>{\n    const pu=l.type==='mo'?(l.useTauxSpec?DB.garage.tauxSpec:DB.garage.tauxStd):(l.pu||0);\n    const brut=pu*l.qty;const rem=brut*(l.remisePct/100);\n    remLines+=rem;\n    if(l.type==='mo')moHT+=brut-rem;else pieHT+=brut-rem;\n  });\n  const sous=moHT+pieHT;\n  const rgPct=parseFloat(document.getElementById('rgPct')?.value||0)||0;\n  const remG=sous*(rgPct/100);\n  const base=sous-remG;\n  const tva=base*(DB.garage.tva/100);\n  const ttc=base+tva;\n  const calcEl=document.getElementById('devisCalcRows');\n  if(!calcEl)return;\n  let html=`<div class=\"tc-row\"><div class=\"tc-label\">🔧 Main d'œuvre HT</div><div class=\"tc-val\">${fmtEur(moHT)}</div></div>\n    <div class=\"tc-row\"><div class=\"tc-label\">🔩 Pièces HT</div><div class=\"tc-val\">${fmtEur(pieHT)}</div></div>`;\n  if(remLines>0)html+=`<div class=\"tc-row green-tc\"><div class=\"tc-label\">💚 Remises lignes</div><div class=\"tc-val\">−${fmtEur(remLines)}</div></div>`;\n  html+=`<div class=\"tc-row\" style=\"font-weight:700\"><div class=\"tc-label\">Sous-total HT</div><div class=\"tc-val\">${fmtEur(sous)}</div></div>`;\n  if(remG>0){const cls=globalRemiseType==='litige'?'red-tc':'green-tc';const lbl={fidelite:'★ Fidélité',geste:'🎁 Geste',litige:'⚠ Litige',aucun:''}[globalRemiseType];html+=`<div class=\"tc-row ${cls}\"><div class=\"tc-label\">${lbl} (${rgPct}%)</div><div class=\"tc-val\">−${fmtEur(remG)}</div></div>`;}\n  calcEl.innerHTML=html;\n  document.getElementById('dvHT').textContent='HT : '+fmtEur(base);\n  document.getElementById('dvTTC').textContent=fmtEur(ttc);\n  document.getElementById('dvTVA').textContent=`TVA ${DB.garage.tva}% : ${fmtEur(tva)}`;\n  const tot=remLines+remG;\n  document.getElementById('dvRemTag').innerHTML=tot>0?`<div class=\"${globalRemiseType==='litige'?'tag tag-red':'tag tag-green'}\">${globalRemiseType==='litige'?'⚠️':'💚'} Geste : ${fmtEur(tot)} offerts</div>`:'';\n}\nfunction validerDevis(){\n  const m=getMoto(currentMotoId);\n  m.score=Math.min(100,m.score+8);\n  const today=new Date();\n  const dateStr=`${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;\n  m.hist.unshift({t:'Intervention validée — Devis MotoKey',d:dateStr,km:m.km,type:'bleu',tech:'J.-M. Duval',desc:'Facture enregistrée et synchronisée',verif:96,isNew:true});\n  devisLines=[];devisLineId=0;\n  showToast(`✅ Facture validée — Score ${m.marque}: +8pts → ${m.score}/100 · Sync client ✓`);\n  goSection('fiche');\n}\n\n/* ────── ANTI-FRAUDE ────── */\nfunction renderFraude(m){\n  return `<div class=\"page-wrap\">\n    <div class=\"page-header\">\n      <div><div class=\"page-title\">Vérification Anti-Fraude</div><div class=\"page-sub\">IA · QR Code · Signature numérique · Score de confiance</div></div>\n      <div class=\"live-pill\" style=\"margin:0\"><div class=\"live-dot\"></div>Système actif</div>\n    </div>\n    <div style=\"display:grid;grid-template-columns:320px 1fr;gap:16px\">\n      <!-- Left form -->\n      <div>\n        <div class=\"card\" style=\"padding:16px;margin-bottom:12px\">\n          <div class=\"f-group\">\n            <label class=\"f-label\">Moto concernée</label>\n            <select class=\"f-input f-select\" id=\"fraudMoto\">\n              ${DB.motos.map(mo=>`<option value=\"${mo.id}\">${mo.marque} ${mo.modele} — ${mo.plaque}</option>`).join('')}\n            </select>\n          </div>\n          <div class=\"f-group\">\n            <label class=\"f-label\">Garage émetteur</label>\n            <select class=\"f-input f-select\" id=\"fraudGarage\">\n              <option value=\"ok\">Moto Shop Orléans ✓ Certifié</option>\n              <option value=\"ok2\">Top Moto 45 ✓ Certifié</option>\n              <option value=\"ok3\">Yamaha Store Orléans ✓ Certifié</option>\n              <option value=\"unknown\">Garage non référencé</option>\n              <option value=\"fake\">Garage suspect (test fraude)</option>\n            </select>\n          </div>\n          <div class=\"f-row\">\n            <div class=\"f-group\"><label class=\"f-label\">Montant (€)</label><input class=\"f-input\" type=\"number\" id=\"fraudAmount\" placeholder=\"185\"></div>\n            <div class=\"f-group\"><label class=\"f-label\">Kilométrage</label><input class=\"f-input\" type=\"number\" id=\"fraudKm\" placeholder=\"18650\"></div>\n          </div>\n          <div class=\"f-group\">\n            <label class=\"f-label\">Code QR / Référence</label>\n            <div style=\"display:flex;gap:6px\">\n              <input class=\"f-input\" type=\"text\" id=\"fraudQr\" placeholder=\"MK-2026-XXXX-XXXX\" style=\"flex:1\">\n              <button class=\"btn btn-ghost btn-sm\" onclick=\"genQr()\">📷</button>\n            </div>\n          </div>\n          <div class=\"f-group\">\n            <label class=\"f-label\">Signature technicien</label>\n            <select class=\"f-input f-select\" id=\"fraudSig\">\n              <option value=\"ok\">J.-M. Duval · Certifié MotoKey</option>\n              <option value=\"ok2\">Lucas Renard · Certifié MotoKey</option>\n              <option value=\"none\">Aucune signature</option>\n            </select>\n          </div>\n          <div class=\"f-group\">\n            <label class=\"f-label\">Description prestation</label>\n            <input class=\"f-input\" type=\"text\" id=\"fraudDesc\" placeholder=\"Vidange + filtre...\">\n          </div>\n          <button class=\"btn btn-primary\" style=\"width:100%\" onclick=\"startFraude()\">🔍 Lancer l'analyse IA</button>\n        </div>\n        <!-- Historique -->\n        <div class=\"card\" style=\"padding:14px\">\n          <div style=\"font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:2px;margin-bottom:10px\">Récentes vérifications</div>\n          ${[['Vidange MT-07','05/02/2026','96%','green'],['Pneus MT-07','11/11/2025','91%','green'],['Vidange Z900','18/01/2026','54%','yellow'],['Révision CB750','02/01/2026','18%','red']].map(([n,d,s,c])=>`\n          <div style=\"display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px\">\n            <div style=\"width:6px;height:6px;border-radius:50%;background:var(--${c});flex-shrink:0\"></div>\n            <div style=\"flex:1;color:var(--text2)\">${n}</div>\n            <div style=\"color:var(--text3)\">${d}</div>\n            <div style=\"font-weight:700;color:var(--${c})\">${s}</div>\n          </div>`).join('')}\n        </div>\n      </div>\n      <!-- Right results -->\n      <div id=\"fraudeResults\">\n        <div style=\"display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;text-align:center;gap:12px\">\n          <div style=\"font-size:48px;opacity:.2\">🛡️</div>\n          <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;color:var(--text3)\">Système de vérification</div>\n          <div style=\"font-size:13px;color:var(--text3);max-width:260px;line-height:1.7\">Remplissez le formulaire et lancez l'analyse pour vérifier l'authenticité d'une facture</div>\n          <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:320px;margin-top:8px\">\n            ${[['🤖','IA OCR','Cohérence données'],['🔲','QR Code','Référence garage'],['🔏','Signature','Clé cryptographique'],['📊','Score','Confiance 0–100%']].map(([i,t,d])=>`<div style=\"background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center\"><div style=\"font-size:20px;margin-bottom:5px\">${i}</div><div style=\"font-size:12px;font-weight:700;margin-bottom:2px\">${t}</div><div style=\"font-size:10px;color:var(--text3)\">${d}</div></div>`).join('')}\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>`;\n}\nfunction genQr(){\n  const g=document.getElementById('fraudGarage').value;\n  const codes={ok:'MK-2026-SHOP-7X3A',ok2:'MK-2026-TOPM-9B2F',ok3:'MK-2026-YAMA-4C8D',unknown:'',fake:'MK-2025-????-XXXX'};\n  document.getElementById('fraudQr').value=codes[g]||'';\n  showToast('📷 QR scanné : '+(codes[g]||'Code absent'));\n}\nfunction startFraude(){\n  const g=document.getElementById('fraudGarage').value;\n  const q=document.getElementById('fraudQr').value;\n  const sig=document.getElementById('fraudSig').value;\n  const isFake=g==='fake';\n  const hasQr=q.length>5&&!q.includes('?');\n  const hasSig=sig!=='none';\n  document.getElementById('fraudeResults').innerHTML=`<div class=\"fraud-steps\" id=\"fSteps\">${['📄 Lecture document','🔍 OCR — extraction','🧠 IA — cohérence','🔲 Validation QR','🔏 Vérification signature','📊 Calcul score'].map((s,i)=>`<div class=\"f-step\" id=\"fst${i}\"><div class=\"f-step-icon\">${s.split(' ')[0]}</div><div class=\"f-step-info\"><div class=\"f-step-title\">${s.split(' ').slice(1).join(' ')}</div><div class=\"f-step-desc\" id=\"fstd${i}\">En attente…</div></div><div class=\"f-step-status\" id=\"fsts${i}\"></div></div>`).join('')}</div>`;\n  const delays=[400,600,700,500,500,400];\n  let t=0;\n  delays.forEach((d,i)=>{\n    t+=d;\n    setTimeout(()=>{\n      const el=document.getElementById('fst'+i);\n      const st=document.getElementById('fsts'+i);\n      const dd=document.getElementById('fstd'+i);\n      el.className='f-step running';st.className='f-step-status spin';dd.textContent='Analyse…';\n      setTimeout(()=>{\n        const ok=isFake?i<1:true;\n        const warn=!hasQr&&i===3;\n        const state=ok&&!warn?'done':warn?'warn':'failed';\n        el.className=`f-step ${state}`;\n        st.className=`f-step-status ${state==='done'?'ok':state==='warn'?'warn':'fail'}`;\n        st.textContent=state==='done'?'✓':state==='warn'?'!':'✗';\n        dd.textContent=['Document lu avec succès','Données extraites','Cohérence vérifiée','QR authentifié','Signature validée','Score calculé'][i]+(isFake&&i>1?' — ÉCHEC':'')+(warn?' — QR absent':'');\n        if(i===5){\n          const score=isFake?Math.floor(Math.random()*18+5):hasQr&&hasSig?94:hasSig?72:55;\n          setTimeout(()=>showFraudeResult(score,isFake,hasQr,hasSig),400);\n        }\n      },d-50);\n    },t);\n  });\n}\nfunction showFraudeResult(score,isFake,hasQr,hasSig){\n  const col=score>=85?'var(--green)':score>=60?'var(--yellow)':'var(--red)';\n  const verb=score>=85?'✅ Facture authentifiée':score>=60?'⚠️ Vérification partielle':'🚨 Fraude suspectée';\n  const sub=score>=85?'Tous les contrôles passés. Facture fiable.':score>=60?'Éléments partiels. Vérification manuelle conseillée.':'Fraude détectée. Ne pas intégrer au dossier.';\n  document.getElementById('fraudeResults').innerHTML=`\n    <div class=\"trust-hero\">\n      <div class=\"trust-circle\">\n        <svg width=\"100\" height=\"100\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"42\" fill=\"none\" stroke=\"var(--bg3)\" stroke-width=\"7\"/><circle cx=\"50\" cy=\"50\" r=\"42\" fill=\"none\" stroke=\"${col}\" stroke-width=\"7\" stroke-linecap=\"round\" stroke-dasharray=\"${2*Math.PI*42}\" stroke-dashoffset=\"${2*Math.PI*42*(1-score/100)}\" style=\"transition:stroke-dashoffset 1.2s\"/></svg>\n        <div class=\"trust-num-wrap\"><div class=\"trust-pct\" style=\"color:${col}\">${score}%</div><div class=\"trust-lbl\">confiance</div></div>\n      </div>\n      <div style=\"flex:1\">\n        <div class=\"trust-verdict\" style=\"color:${col}\">${verb}</div>\n        <div class=\"trust-sub\">${sub}</div>\n        <div style=\"display:flex;gap:5px;flex-wrap:wrap\">\n          ${hasQr?'<span class=\"tag tag-green\">QR Valide</span>':'<span class=\"tag tag-yellow\">QR absent</span>'}\n          ${hasSig&&!isFake?'<span class=\"tag tag-green\">Signature OK</span>':'<span class=\"tag tag-red\">Signature KO</span>'}\n          ${!isFake?'<span class=\"tag tag-blue\">IA: cohérent</span>':'<span class=\"tag tag-red\">IA: suspect</span>'}\n        </div>\n      </div>\n    </div>\n    <div class=\"btn-row\">\n      ${score>=60?`<button class=\"btn btn-green btn-sm\" onclick=\"showToast('✅ Facture intégrée au dossier · Score : ${score}%');document.getElementById('fraudeBadge').textContent='0'\">✅ Valider</button>`:''}\n      <button class=\"btn btn-danger btn-sm\" onclick=\"showToast('🗑️ Facture rejetée')\">✗ Rejeter</button>\n      ${score<60?`<button class=\"btn btn-ghost btn-sm\" onclick=\"showToast('🚔 Signalement envoyé')\">📢 Signaler</button>`:''}\n    </div>`;\n}\n\n/* ────── TRANSFERT ────── */\nfunction renderTransfert(m){\n  const steps=['Initier','Vendeur','Acheteur','Valider','Certificat'];\n  const actors=[{key:'garage',lbl:'Garage',sub:'Jean-Marc Duval',col:'var(--accent)',av:'🔧'},{key:'vendeur',lbl:m.proprio,sub:'Propriétaire actuel',col:'var(--blue)',av:m.proprio.split(' ').map(w=>w[0]).join('')},{key:'acheteur',lbl:'Thomas Martin',sub:'Acheteur potentiel',col:'var(--green)',av:'TM'}];\n  return `<div class=\"page-wrap\">\n    <div class=\"page-header\">\n      <div><div class=\"page-title\">Transfert de propriété</div><div class=\"page-sub\">${m.marque} ${m.modele} · ${m.plaque}</div></div>\n    </div>\n    <!-- Steps bar -->\n    <div class=\"transfer-steps\" id=\"tSteps\">\n      ${steps.map((s,i)=>`<div class=\"ts-item ${i===0?'active':''}\" id=\"tsi${i}\"><div class=\"ts-dot ${i===0?'active':''}\" id=\"tsd${i}\">${i+1}</div><div class=\"ts-label ${i===0?'active':''}\" id=\"tsl${i}\">${s}</div></div>`).join('')}\n    </div>\n    <!-- Actors -->\n    <div style=\"display:flex;gap:10px;margin-bottom:18px\">\n      ${actors.map(a=>`<div style=\"flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:13px;display:flex;align-items:center;gap:10px\">\n        <div style=\"width:38px;height:38px;border-radius:50%;background:${a.col}22;color:${a.col};display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:${a.key==='garage'?'20':'16'}px;flex-shrink:0\">${a.av}</div>\n        <div><div style=\"font-size:13px;font-weight:700\">${a.lbl}</div><div style=\"font-size:11px;color:var(--text3)\">${a.sub}</div></div>\n      </div>`).join('')}\n    </div>\n    <!-- Content panel -->\n    <div id=\"transfertPanel\"></div>\n  </div>`;\n}\n\nfunction initTransfert(){\n  transfertStep=1;\n  renderTransfertPanel();\n}\nfunction renderTransfertPanel(){\n  const m=getMoto(currentMotoId);\n  const panels={\n    1:`<div class=\"card\" style=\"padding:18px\">\n        <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;margin-bottom:14px\">Étape 1 — Initier le transfert</div>\n        <div class=\"info-ban blue\"><span>ℹ️</span>Le code est unique, valable 48h. Le dossier sera verrouillé pendant la procédure.</div>\n        <div class=\"f-row\">\n          <div class=\"f-group\"><label class=\"f-label\">Acheteur</label><input class=\"f-input\" id=\"tBuyer\" placeholder=\"Thomas Martin\"></div>\n          <div class=\"f-group\"><label class=\"f-label\">Email acheteur</label><input class=\"f-input\" id=\"tEmail\" placeholder=\"thomas@email.com\"></div>\n        </div>\n        <div class=\"f-row\">\n          <div class=\"f-group\"><label class=\"f-label\">Prix de vente (€)</label><input class=\"f-input\" id=\"tPrice\" type=\"number\" placeholder=\"5 500\"></div>\n          <div class=\"f-group\"><label class=\"f-label\">Km à la cession</label><input class=\"f-input\" id=\"tKm\" type=\"number\" placeholder=\"${m.km}\"></div>\n        </div>\n        <button class=\"btn btn-primary\" onclick=\"advTransfert(2)\">🔑 Générer le code de transfert</button>\n      </div>`,\n    2:`<div class=\"card\" style=\"padding:18px\">\n        <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;margin-bottom:14px\">Code de transfert généré</div>\n        <div class=\"code-display\"><div style=\"font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:3px;margin-bottom:10px\">Code MotoKey</div><div class=\"code-val\">MK-TR-${Math.random().toString(36).substring(2,6).toUpperCase()}</div><div style=\"font-size:11px;color:var(--text3);margin-top:8px\">Expire dans 48h</div></div>\n        <div class=\"info-ban green\"><span>✅</span>SMS et email envoyés à l'acheteur et au vendeur. Dossier verrouillé.</div>\n        <div class=\"info-ban yellow\"><span>⚠️</span>Aucune nouvelle intervention ne peut être ajoutée pendant la procédure.</div>\n        <div class=\"btn-row\"><button class=\"btn btn-primary\" onclick=\"advTransfert(3)\">→ Confirmation vendeur</button><button class=\"btn btn-ghost\" onclick=\"showToast('📤 Code renvoyé')\">Renvoyer</button></div>\n      </div>`,\n    3:`<div class=\"card\" style=\"padding:18px\">\n        <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;margin-bottom:14px\">Étape 3 — Acheteur consulte le dossier</div>\n        <div class=\"info-ban blue\"><span>📱</span>L'acheteur consulte le dossier complet sur son app avant d'accepter.</div>\n        <div style=\"background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px\">\n          <div style=\"font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text2)\">Dossier visible par l'acheteur</div>\n          <div style=\"display:flex;align-items:center;gap:10px;margin-bottom:8px\">\n            <div style=\"font-size:22px\">${m.emoji}</div>\n            <div><div style=\"font-family:'Barlow Condensed',sans-serif;font-size:16px;font-weight:700\">${m.marque} ${m.modele} ${m.annee}</div><div style=\"font-size:11px;color:var(--text3)\">${fmtKm(m.km)} · Score <span style=\"color:${colVar(m.couleur)};font-weight:700\">${m.score}/100 ${m.couleur==='bleu'?'🔵':'🟢'}</span></div></div>\n          </div>\n          ${m.hist.slice(0,3).map(h=>`<div style=\"display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px\"><div style=\"width:3px;height:30px;border-radius:2px;background:${colVar(h.type)}\"></div><div style=\"flex:1\">${h.t}<br><span style=\"color:var(--text3)\">${h.d} · ${fmtKm(h.km)}</span></div><span class=\"tag tag-purple\">🛡️ ${h.verif}%</span></div>`).join('')}\n        </div>\n        <div class=\"btn-row\"><button class=\"btn btn-primary\" onclick=\"advTransfert(4)\">✅ Acheteur accepte le dossier</button><button class=\"btn btn-ghost\" onclick=\"showToast('❌ Acheteur refuse')\">Refuser</button></div>\n      </div>`,\n    4:`<div class=\"card\" style=\"padding:18px\">\n        <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;margin-bottom:14px\">Étape 4 — Validation finale</div>\n        <div class=\"f-row\">\n          <div class=\"f-group\"><label class=\"f-label\">Code de confirmation</label><input class=\"f-input\" style=\"font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;letter-spacing:3px\" placeholder=\"MK-TR-XXXX\"></div>\n          <div class=\"f-group\"><label class=\"f-label\">Signature acheteur</label><input class=\"f-input\" placeholder=\"Thomas Martin\"></div>\n        </div>\n        ${['Je confirme avoir consulté le dossier complet','J\\'accepte que le vendeur perde l\\'accès après transfert','Je reconnais ce dossier comme carnet officiel','Je m\\'engage à continuer à documenter les entretiens'].map((c,i)=>`<label style=\"display:flex;align-items:flex-start;gap:10px;font-size:13px;margin-bottom:10px;cursor:pointer\"><input type=\"checkbox\" checked style=\"margin-top:3px\"> <span style=\"color:var(--text2);line-height:1.5\">${c}</span></label>`).join('')}\n        <button class=\"btn btn-green\" onclick=\"advTransfert(5)\">🎉 Finaliser le transfert</button>\n      </div>`,\n    5:`<div>\n        <div class=\"info-ban green\" style=\"margin-bottom:14px\"><span>🎉</span>Transfert finalisé ! <strong>${m.proprio}</strong> n'a plus accès. <strong>Thomas Martin</strong> est le nouveau propriétaire.</div>\n        <div class=\"cert\">\n          <div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:16px\">\n            <div class=\"app-logo\">MOTO<span>KEY</span></div>\n            <div style=\"text-align:center;font-size:11px;color:var(--text3)\">Certificat #CERT-2026-${Date.now().toString(36).toUpperCase().slice(-6)}</div>\n            <div class=\"cert-stamp\"><div style=\"font-size:9px;font-weight:700;color:var(--green);text-align:center;line-height:1.2;text-transform:uppercase\">TRANSFERT<br>VALIDÉ<br>✓</div></div>\n          </div>\n          <div style=\"font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;text-align:center;color:var(--text3);letter-spacing:3px;text-transform:uppercase;margin-bottom:16px\">Certificat de Cession Numérique</div>\n          <div class=\"cert-grid\">\n            <div class=\"cert-field\"><div class=\"cert-field-label\">Véhicule</div><div class=\"cert-field-val\">${m.marque} ${m.modele} ${m.annee}</div></div>\n            <div class=\"cert-field\"><div class=\"cert-field-label\">Immatriculation</div><div class=\"cert-field-val\">${m.plaque}</div></div>\n            <div class=\"cert-field\"><div class=\"cert-field-label\">Kilométrage</div><div class=\"cert-field-val\">${fmtKm(m.km)}</div></div>\n            <div class=\"cert-field\"><div class=\"cert-field-label\">Score MotoKey</div><div class=\"cert-field-val\" style=\"color:${colVar(m.couleur)}\">${m.score}/100 ${m.couleur==='bleu'?'🔵':'🟢'}</div></div>\n          </div>\n          <div style=\"display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:14px\">\n            <div style=\"flex:1;text-align:center\"><div style=\"font-size:14px;font-weight:700\">${m.proprio}</div><div style=\"font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:2px\">Cédant</div><div style=\"font-size:10px;color:var(--red);margin-top:4px;font-weight:600\">🔒 Accès révoqué</div></div>\n            <div style=\"font-size:28px;color:var(--accent)\">→</div>\n            <div style=\"flex:1;text-align:center\"><div style=\"font-size:14px;font-weight:700\">Thomas Martin</div><div style=\"font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:2px\">Acquéreur</div><div style=\"font-size:10px;color:var(--green);margin-top:4px;font-weight:600\">✓ Nouveau propriétaire</div></div>\n          </div>\n          <div style=\"font-size:10px;color:var(--text3);font-family:monospace;text-align:center;padding:8px;background:var(--bg);border-radius:6px;margin-bottom:14px\">SHA-256 · ${Array.from({length:32},()=>Math.floor(Math.random()*16).toString(16)).join('')}</div>\n          <div class=\"btn-row\">\n            <button class=\"btn btn-green btn-sm\" onclick=\"showToast('📧 Certificat envoyé aux deux parties')\">📧 Envoyer</button>\n            <button class=\"btn btn-ghost btn-sm\" onclick=\"showToast('📄 PDF téléchargé')\">📄 PDF</button>\n            <button class=\"btn btn-ghost btn-sm\" onclick=\"transfertStep=1;renderSection('transfert')\">↩ Nouveau</button>\n          </div>\n        </div>\n      </div>`\n  };\n  document.getElementById('transfertPanel').innerHTML = panels[transfertStep]||panels[1];\n}\nfunction advTransfert(step){\n  transfertStep=step;\n  for(let i=0;i<5;i++){\n    const d=document.getElementById('tsd'+i);\n    const l=document.getElementById('tsl'+i);\n    const item=document.getElementById('tsi'+i);\n    if(!d||!l||!item) continue;\n    const done=i<step-1,active=i===step-1;\n    d.className=`ts-dot ${done?'done':active?'active':''}`;\n    l.className=`ts-label ${done?'done':active?'active':''}`;\n    if(done){d.textContent='✓';}else{d.textContent=i+1;}\n    if(i<step-1) item.classList.add('done'); else item.classList.remove('done');\n  }\n  renderTransfertPanel();\n}\n\n/* ────── PARAMÈTRES ────── */\nfunction renderParams(m){\n  return `<div class=\"page-wrap\">\n    <div class=\"page-header\"><div class=\"page-title\">Paramètres du garage</div></div>\n    <div class=\"params-grid\">\n      <div class=\"param-section\">\n        <div class=\"param-sec-title\">🔧 Tarifs main d'œuvre</div>\n        <div class=\"param-row\"><div class=\"param-label\">Taux standard</div><div style=\"display:flex;align-items:center\"><input class=\"param-input\" type=\"number\" value=\"${DB.garage.tauxStd}\" oninput=\"DB.garage.tauxStd=parseInt(this.value)||65;showToast('💾 Taux mis à jour')\"><span class=\"param-unit\">€/h HT</span></div></div>\n        <div class=\"param-row\"><div class=\"param-label\">Taux spécialiste</div><div style=\"display:flex;align-items:center\"><input class=\"param-input\" type=\"number\" value=\"${DB.garage.tauxSpec}\" oninput=\"DB.garage.tauxSpec=parseInt(this.value)||80;showToast('💾 Taux mis à jour')\"><span class=\"param-unit\">€/h HT</span></div></div>\n        <div class=\"param-row\"><div class=\"param-label\">TVA appliquée</div><div style=\"display:flex;align-items:center\"><input class=\"param-input\" type=\"number\" value=\"${DB.garage.tva}\" oninput=\"DB.garage.tva=parseInt(this.value)||20\"><span class=\"param-unit\">%</span></div></div>\n        <div class=\"preset-row\">\n          <button class=\"preset-btn\" onclick=\"setPresets(55,70)\">Tarifs bas</button>\n          <button class=\"preset-btn on\" onclick=\"setPresets(65,80)\">Moyen</button>\n          <button class=\"preset-btn\" onclick=\"setPresets(80,100)\">Paris</button>\n          <button class=\"preset-btn\" onclick=\"setPresets(90,120)\">Premium</button>\n        </div>\n      </div>\n      <div class=\"param-section\">\n        <div class=\"param-sec-title\">🏪 Informations garage</div>\n        <div class=\"f-group\"><label class=\"f-label\">Nom du garage</label><input class=\"f-input\" value=\"${DB.garage.nom}\" oninput=\"DB.garage.nom=this.value\"></div>\n        <div class=\"f-group\"><label class=\"f-label\">Chef de garage</label><input class=\"f-input\" value=\"Jean-Marc Duval\"></div>\n        <div class=\"f-group\"><label class=\"f-label\">SIRET</label><input class=\"f-input\" placeholder=\"12345678901234\"></div>\n        <div class=\"f-group\"><label class=\"f-label\">Email notifications</label><input class=\"f-input\" type=\"email\" placeholder=\"garage@email.com\"></div>\n      </div>\n      <div class=\"param-section\">\n        <div class=\"param-sec-title\">🔌 Intégrations API</div>\n        <div class=\"param-row\"><div class=\"param-label\">Autodata (plans entretien)</div><span class=\"tag tag-green\">✓ Connecté</span></div>\n        <div class=\"param-row\"><div class=\"param-label\">ETAI / Atelio Data</div><span class=\"tag tag-green\">✓ Connecté</span></div>\n        <div class=\"param-row\"><div class=\"param-label\">Anti-fraude IA</div><span class=\"tag tag-green\">✓ Actif</span></div>\n        <div class=\"param-row\"><div class=\"param-label\">SMS Notifications</div><span class=\"tag tag-blue\">Config</span></div>\n        <div class=\"param-row\"><div class=\"param-label\">Passerelle concessionnaire</div><span class=\"tag tag-yellow\">Pro requis</span></div>\n        <div class=\"param-row\"><div class=\"param-label\">Plan actuel</div><span class=\"tag tag-orange\" style=\"background:var(--orange-bg);color:var(--orange)\">Pro 99€/mois</span></div>\n      </div>\n      <div class=\"param-section\">\n        <div class=\"param-sec-title\">👥 Équipe & accès</div>\n        ${DB.garage.techniciens.map((t,i)=>`<div class=\"param-row\"><div class=\"param-label\">${t}</div><span class=\"tag ${i===0?'tag-orange':'tag-blue'}\">${i===0?'Chef':'Tech'}</span></div>`).join('')}\n        <button class=\"btn btn-ghost btn-sm\" style=\"margin-top:10px;width:100%\" onclick=\"showToast('📧 Invitation envoyée')\">+ Inviter un technicien</button>\n      </div>\n    </div>\n    <div class=\"btn-row\"><button class=\"btn btn-green\" onclick=\"showToast('✅ Paramètres sauvegardés')\">✅ Sauvegarder</button></div>\n  </div>`;\n}\nfunction setPresets(std,spec){DB.garage.tauxStd=std;DB.garage.tauxSpec=spec;showToast(`💾 Taux mis à jour : ${std}€/h std · ${spec}€/h spécialiste`);}\n\n/* ════════════════════════════════════════\n   CLIENT VIEW\n════════════════════════════════════════ */\nfunction renderClientView(){\n  const m=getMoto(currentMotoId);\n  document.getElementById('cPages').innerHTML=`\n    <div class=\"c-page active\" id=\"cpage-home\"></div>\n    <div class=\"c-page\" id=\"cpage-history\"></div>\n    <div class=\"c-page\" id=\"cpage-entretien\"></div>\n    <div class=\"c-page\" id=\"cpage-docs\"></div>`;\n  renderCPage(m,'home');\n  renderCPage(m,'history');\n  renderCPage(m,'entretien');\n  renderCPage(m,'docs');\n}\nfunction renderCPage(m,page){\n  const el=document.getElementById('cpage-'+page);\n  if(!el)return;\n  const col=colVar(m.couleur);\n  const colDot=({vert:'#22c55e',bleu:'#3b82f6',jaune:'#eab308',rouge:'#ef4444'})[m.couleur]||'#3b82f6';\n  if(page==='home'){\n    const urgents=m.plan.filter(op=>getOpStatus(op,m.km).s==='urgent'||getOpStatus(op,m.km).s==='warning').slice(0,2);\n    el.innerHTML=`\n      <div class=\"c-hero\">\n        <div class=\"c-greeting\">Bonjour,</div>\n        <div class=\"c-name\">${m.proprio}</div>\n        <div class=\"c-moto-row\">\n          <div><div class=\"c-moto-name\">${m.marque} ${m.modele}</div><div class=\"c-moto-meta\">${m.annee} · ${m.plaque} · ${fmtKm(m.km)}</div></div>\n          <div class=\"c-score-circ\"><div class=\"c-score-num\">${m.score}</div><div class=\"c-score-lbl\">/100</div></div>\n        </div>\n        <div class=\"c-badge\"><div class=\"c-badge-dot\" style=\"background:${colDot}\"></div>${scoreLabel(m.couleur)} — ${typeLabel(m.couleur).replace(/🟢|🔵|🟡|🔴/g,'').trim()}</div>\n      </div>\n      <div class=\"c-qs\">\n        <div class=\"c-qs-card\"><div class=\"c-qs-label\">Interventions</div><div class=\"c-qs-val\">${m.hist.length}</div><div class=\"c-qs-sub\">enregistrées</div></div>\n        <div class=\"c-qs-card\"><div class=\"c-qs-label\">Dernière révision</div><div class=\"c-qs-val\">${m.hist[0]?.d?.slice(0,5)||'—'}</div><div class=\"c-qs-sub\">${m.hist[0]?.d?.slice(6)||''}</div></div>\n        <div class=\"c-qs-card\"><div class=\"c-qs-label\">Factures</div><div class=\"c-qs-val\">${m.hist.length}</div><div class=\"c-qs-sub\">numérisées</div></div>\n        <div class=\"c-qs-card\"><div class=\"c-qs-label\">Prochain entretien</div><div class=\"c-qs-val\">${(Math.ceil(m.km/6000)*6000+6000-m.km).toLocaleString('fr-FR')}</div><div class=\"c-qs-sub\">km restants</div></div>\n      </div>\n      <div class=\"c-section\">\n        <div class=\"c-sec-title\">Alertes d'entretien</div>\n        ${urgents.length===0?`<div class=\"c-alert ok\"><div class=\"c-alert-icon\">✅</div><div><div class=\"c-alert-title\">Tout est à jour</div><div class=\"c-alert-desc\">Votre ${m.marque} est en parfait état selon le plan constructeur.</div></div></div>`:urgents.map(op=>{const {s,kmLeft}=getOpStatus(op,m.km);return `<div class=\"c-alert ${s==='urgent'?'urgent':'warn'}\"><div class=\"c-alert-icon\">${s==='urgent'?'🚨':'⚠️'}</div><div><div class=\"c-alert-title\">${op.icon} ${op.nom}</div><div class=\"c-alert-desc\">${s==='urgent'?'Dépassé — intervention urgente':'À planifier — '+kmLeft.toLocaleString('fr-FR')+' km restants'} · Produit: ${op.produit}</div><div class=\"c-alert-action\" onclick=\"showToast('📅 Demande de RDV envoyée au garage')\">📅 Prendre RDV</div></div></div>`;}).join('')}\n      </div>\n      <div class=\"c-section\">\n        <div class=\"c-sec-title\">Dernières interventions</div>\n        ${m.hist.slice(0,2).map(h=>`<div class=\"c-hist-card\">${h.isNew?'<div class=\"c-new-tag\">NOUVEAU</div>':''}<div class=\"c-hist-bar\" style=\"background:${colVar(h.type)}\"></div><div style=\"flex:1\"><div class=\"c-hist-title\">${h.t}</div><div class=\"c-hist-meta\">${h.tech} · ${h.d}</div><span class=\"tag ${typeTagCls(h.type)}\">${typeLabel(h.type)}</span><div class=\"c-hist-km\">📍 ${fmtKm(h.km)} <span style=\"color:var(--purple);font-weight:600;margin-left:8px\">🛡️ ${h.verif}% fiable</span></div></div></div>`).join('')}\n      </div>`;\n  }\n  if(page==='history'){\n    el.innerHTML=`<div style=\"padding:14px 14px 0\"><div style=\"font-family:'DM Serif Display',serif;font-size:22px;color:var(--ct);margin-bottom:14px\">Historique complet</div></div><div class=\"c-section\">\n      ${m.hist.map(h=>`<div class=\"c-hist-card\">${h.isNew?'<div class=\"c-new-tag\">NOUVEAU</div>':''}<div class=\"c-hist-bar\" style=\"background:${colVar(h.type)}\"></div><div style=\"flex:1\"><div class=\"c-hist-title\">${h.t}</div><div class=\"c-hist-meta\">${h.tech} · ${h.d}</div><span class=\"tag ${typeTagCls(h.type)}\">${typeLabel(h.type)}</span><div class=\"c-hist-km\">📍 ${fmtKm(h.km)} <span style=\"color:var(--purple);font-weight:600;margin-left:8px\">🛡️ ${h.verif}% fiable</span></div></div></div>`).join('')}\n    </div>`;\n  }\n  if(page==='entretien'){\n    const nextRev=Math.ceil(m.km/6000)*6000+6000;\n    const pct=Math.round(((m.km%6000)/6000)*100);\n    el.innerHTML=`<div style=\"padding:14px 14px 0\"><div style=\"font-family:'DM Serif Display',serif;font-size:22px;color:var(--ct);margin-bottom:14px\">Plan d'entretien</div></div>\n    <div class=\"c-section\">\n      <div style=\"background:#1a1714;border-radius:16px;padding:18px;margin-bottom:14px\">\n        <div style=\"font-size:11px;color:rgba(255,255,255,.35);letter-spacing:2px;text-transform:uppercase;margin-bottom:4px\">Prochaine révision</div>\n        <div style=\"font-family:'DM Serif Display',serif;font-size:28px;color:#fff;margin-bottom:4px\">${nextRev.toLocaleString('fr-FR')} km</div>\n        <div style=\"font-size:12px;color:rgba(255,255,255,.4);margin-bottom:10px\">~${(nextRev-m.km).toLocaleString('fr-FR')} km restants</div>\n        <div style=\"height:5px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden\"><div style=\"height:100%;width:${pct}%;background:linear-gradient(90deg,#22c55e,#eab308);border-radius:3px\"></div></div>\n        <div style=\"display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,.3);margin-top:5px\"><span>${(nextRev-6000).toLocaleString('fr-FR')} km</span><span>${nextRev.toLocaleString('fr-FR')} km</span></div>\n      </div>\n      ${m.plan.map(op=>{const {s,pct:p,kmLeft}=getOpStatus(op,m.km);const c={urgent:'var(--red)',warning:'var(--yellow)',due:'var(--orange)',ok:'var(--green)',future:'var(--ct3)'}[s];const bg={urgent:'#fff8f8',warning:'#fffdf0',ok:'#f8fef9',due:'#fff8f2',future:var(--ccard)}[s]||'var(--ccard)';return `<div class=\"c-plan-card\" style=\"border-left:3px solid ${c}\">\n        <div class=\"c-plan-header\">\n          <div class=\"c-plan-icon\" style=\"background:${c}22\">${op.icon}</div>\n          <div style=\"flex:1\"><div class=\"c-plan-name\">${op.nom}</div><div class=\"c-plan-km\">${op.tags.join(' · ')}</div></div>\n          <div class=\"c-plan-status\" style=\"background:${c}22;color:${c}\">${opStatusLabel(s)}</div>\n        </div>\n        <div class=\"c-plan-prog-bg\"><div class=\"c-plan-prog-fill\" style=\"width:${p}%;background:${c}\"></div></div>\n        <div class=\"c-plan-detail\"><strong>Produit :</strong> ${op.produit} · ${op.tempsH}h · Source constructeur</div>\n      </div>`;}).join('')}\n    </div>`;\n  }\n  if(page==='docs'){\n    el.innerHTML=`<div style=\"padding:14px 14px 0\"><div style=\"font-family:'DM Serif Display',serif;font-size:22px;color:var(--ct);margin-bottom:14px\">Documents</div></div>\n    <div class=\"c-section\">\n      ${m.hist.map(h=>`<div class=\"c-doc-row\" onclick=\"showToast('📄 Ouverture de la facture')\"><div class=\"c-doc-icon\" style=\"background:${({vert:'#e8f5ee',bleu:'#e8eef5',jaune:'#fdf6e0',rouge:'#fde8e8'})[h.type]||'#f4f1ec'}\">📄</div><div style=\"flex:1\"><div class=\"c-doc-name\">${h.t}</div><div class=\"c-doc-date\">${h.d} · ${typeLabel(h.type)} <span style=\"color:var(--purple);font-weight:600\">· 🛡️ ${h.verif}%</span></div></div><span style=\"color:var(--ct3)\">›</span></div>`).join('')}\n      <div style=\"background:#1a1714;border-radius:14px;padding:20px;text-align:center;margin-top:14px\">\n        <div style=\"font-family:'DM Serif Display',serif;font-size:18px;color:#fff;margin-bottom:4px\">QR Code MotoKey</div>\n        <div style=\"font-size:12px;color:rgba(255,255,255,.4);margin-bottom:14px\">Partagez lors d'une revente</div>\n        <div style=\"width:90px;height:90px;background:#fff;border-radius:10px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:50px\">🔲</div>\n        <div style=\"display:flex;gap:8px;justify-content:center\">\n          <button onclick=\"showToast('📤 QR Code partagé')\" style=\"background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:9px;padding:9px 16px;color:#fff;font-size:12px;font-weight:600;cursor:pointer\">📤 Partager</button>\n          <button onclick=\"showToast('⬇️ QR Code téléchargé')\" style=\"background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:9px;padding:9px 16px;color:#fff;font-size:12px;font-weight:600;cursor:pointer\">⬇️ Télécharger</button>\n        </div>\n      </div>\n    </div>`;\n  }\n}\nfunction switchCPage(p){\n  currentCPage=p;\n  document.querySelectorAll('.c-page').forEach(x=>x.classList.remove('active'));\n  document.querySelectorAll('.c-nav-btn').forEach(x=>x.classList.remove('active'));\n  const el=document.getElementById('cpage-'+p);\n  const btn=document.getElementById('cnav-'+p);\n  if(el)el.classList.add('active');\n  if(btn)btn.classList.add('active');\n}\n\n/* ════════════════════════════════════════\n   MODALS\n════════════════════════════════════════ */\nfunction openModal(id){\n  const modals={\n    addMotoModal:`\n      <div class=\"modal-head\"><div><div style=\"font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900\">Nouvelle Moto</div><div style=\"font-size:12px;color:var(--text3);margin-top:2px\">Créer un nouveau dossier numérique</div></div><button class=\"modal-close\" onclick=\"closeModal()\">✕</button></div>\n      <div class=\"modal-body\">\n        <div class=\"f-row\"><div class=\"f-group\"><label class=\"f-label\">Marque</label><input class=\"f-input\" placeholder=\"Yamaha, Honda…\"></div><div class=\"f-group\"><label class=\"f-label\">Modèle</label><input class=\"f-input\" placeholder=\"MT-07, CB750…\"></div></div>\n        <div class=\"f-row\"><div class=\"f-group\"><label class=\"f-label\">Année</label><input class=\"f-input\" type=\"number\" placeholder=\"2021\"></div><div class=\"f-group\"><label class=\"f-label\">Immatriculation</label><input class=\"f-input\" placeholder=\"AB-123-CD\"></div></div>\n        <div class=\"f-group\"><label class=\"f-label\">VIN</label><input class=\"f-input\" placeholder=\"17 caractères\"></div>\n        <div class=\"f-row\"><div class=\"f-group\"><label class=\"f-label\">Propriétaire</label><input class=\"f-input\" id=\"newProprio\" placeholder=\"Nom complet\"></div><div class=\"f-group\"><label class=\"f-label\">Kilométrage</label><input class=\"f-input\" type=\"number\" id=\"newKm\" placeholder=\"0\"></div></div>\n        <div class=\"btn-row\"><button class=\"btn btn-ghost\" onclick=\"closeModal()\">Annuler</button><button class=\"btn btn-primary\" onclick=\"closeModal();showToast('✅ Dossier numérique créé')\">Créer le dossier</button></div>\n      </div>`,\n    addInterModal:`\n      <div class=\"modal-head\"><div><div style=\"font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900\">Nouvelle Intervention</div><div style=\"font-size:12px;color:var(--text3);margin-top:2px\">Synchronisée instantanément sur l'app client</div></div><button class=\"modal-close\" onclick=\"closeModal()\">✕</button></div>\n      <div class=\"modal-body\">\n        <div class=\"f-group\"><label class=\"f-label\">Moto concernée</label><select class=\"f-input f-select\" id=\"interMoto\">${DB.motos.map(m=>`<option value=\"${m.id}\">${m.marque} ${m.modele} — ${m.plaque}</option>`).join('')}</select></div>\n        <div class=\"f-group\"><label class=\"f-label\">Type d'intervention</label>\n          <div style=\"display:grid;grid-template-columns:repeat(4,1fr);gap:8px\">\n            ${[['vert','🟢 Concession','var(--green)','var(--green-bg)'],['bleu','🔵 Pro validé','var(--blue)','var(--blue-bg)'],['jaune','🟡 Proprio','var(--yellow)','var(--yellow-bg)'],['rouge','🔴 Non effectué','var(--red)','var(--red-bg)']].map(([t,l,c,bg])=>`<div style=\"background:${bg};border:2px solid ${c};border-radius:8px;padding:10px 6px;text-align:center;cursor:pointer;font-size:11px;font-weight:700;color:${c}\" onclick=\"window._interType='${t}'\">${l}</div>`).join('')}\n          </div>\n        </div>\n        <div class=\"f-group\"><label class=\"f-label\">Description</label><input class=\"f-input\" id=\"interDesc\" placeholder=\"Vidange, courroie, freins…\"></div>\n        <div class=\"f-row\"><div class=\"f-group\"><label class=\"f-label\">Kilométrage</label><input class=\"f-input\" type=\"number\" id=\"interKm\"></div><div class=\"f-group\"><label class=\"f-label\">Technicien</label><select class=\"f-input f-select\">${DB.garage.techniciens.map(t=>`<option>${t}</option>`).join('')}</select></div></div>\n        <div class=\"info-ban green\"><span>⚡</span>Cette intervention sera <strong>synchronisée instantanément</strong> sur l'application client.</div>\n        <div class=\"btn-row\"><button class=\"btn btn-ghost\" onclick=\"closeModal()\">Annuler</button><button class=\"btn btn-primary\" onclick=\"saveIntervention()\">Enregistrer & Sync</button></div>\n      </div>`\n  };\n  document.getElementById('modalContent').innerHTML=modals[id]||'<div class=\"modal-body\">Non trouvé</div>';\n  document.getElementById('modalOverlay').classList.add('open');\n}\nfunction closeModal(){document.getElementById('modalOverlay').classList.remove('open');}\ndocument.getElementById('modalOverlay').addEventListener('click',e=>{if(e.target.id==='modalOverlay')closeModal();});\n\nfunction saveIntervention(){\n  const motoId=parseInt(document.getElementById('interMoto').value);\n  const desc=document.getElementById('interDesc').value||'Intervention';\n  const km=parseInt(document.getElementById('interKm').value)||0;\n  const type=window._interType||'bleu';\n  const m=DB.motos.find(x=>x.id===motoId);\n  if(!m){closeModal();return;}\n  const today=new Date();\n  const dateStr=`${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;\n  m.hist.unshift({t:desc,d:dateStr,km:km||m.km,type,tech:'J.-M. Duval',desc,verif:Math.floor(Math.random()*15+82),isNew:true});\n  if(km>m.km)m.km=km;\n  m.score=Math.min(100,m.score+(type==='vert'?12:type==='bleu'?8:type==='jaune'?5:-5));\n  m.couleur=m.score>=80?'vert':m.score>=60?'bleu':m.score>=40?'jaune':'rouge';\n  closeModal();\n  const card=document.querySelector(`.moto-row`);\n  if(card){card.classList.add('flash');setTimeout(()=>card.classList.remove('flash'),700);}\n  showToast(`⚡ Intervention enregistrée · Sync ${m.proprio} ✓`);\n  document.getElementById('cNotifDot').style.display='block';\n  renderSection(currentGSection);\n  if(document.getElementById('clientView').style.display!=='none') renderClientView();\n}\n\n/* ════════════════════════════════════════\n   TOAST & UTILS\n════════════════════════════════════════ */\nfunction showToast(msg){\n  const t=document.getElementById('toast');\n  t.textContent=msg;t.classList.add('show');\n  setTimeout(()=>t.classList.remove('show'),3500);\n}\nfunction filterDash(f,el){\n  // Visual only filter\n  document.querySelectorAll('#dashFilters button').forEach(b=>b.className='btn btn-ghost btn-sm');\n  el.className='btn btn-primary btn-sm';\n}\n\n/* ════════════════════════════════════════\n   INIT\n════════════════════════════════════════ */\ngoSection('dashboard');\ntransfertStep=1;\n</script>\n</body>\n</html>\n";
function getAppHTML() { return _APP_HTML; }

const server = http.createServer(async function(req, res){
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/+$/,'') || '/';
  const method   = req.method.toUpperCase();
  const query    = parsed.query;

  if(method==='OPTIONS'){ sendJSON(res,204,{}); return; }

  // ── Servir l'app HTML sur /app
  if((pathname==='/'||pathname==='/app') && method==='GET'){
    try {
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
      res.end(getAppHTML());
    } catch(e) {
      res.writeHead(404,{'Content-Type':'text/plain'});
      res.end('MotoKey_App.html introuvable');
    }
    return;
  }

  let b = {};
  if(['POST','PUT','PATCH'].includes(method)) b = await body(req);

  function M(m,p){ return match(m,method,p,pathname); }

  let p;

  /* ROOT */
  if((p=M('GET','/'))!==null){
    return ok(res,{
      api:'MotoKey API Mock', version:VERSION,
      description:'Passeport numérique moto — API complète Supabase-ready',
      credentials:{garage:'garage@motokey.fr / motokey2026', client:'sophie@email.com / client123'},
      endpoints:{
        auth:['POST /auth/login','POST /auth/register','GET /auth/me'],
        motos:['GET /motos','POST /motos','GET /motos/:id','PUT /motos/:id','DELETE /motos/:id','GET /motos/:id/score'],
        interventions:['GET /motos/:id/interventions','POST /motos/:id/interventions','PUT /motos/:id/interventions/:iid','DELETE /motos/:id/interventions/:iid'],
        entretien:['GET /motos/:id/entretien','GET /motos/:id/entretien/alertes'],
        devis:['GET /devis','POST /devis','GET /devis/:id','PUT /devis/:id','POST /devis/:id/valider','POST /devis/:id/pdf'],
        fraude:['POST /fraude/analyser','GET /fraude/historique'],
        transfert:['POST /transfert/initier','POST /transfert/confirmer-vendeur','POST /transfert/consulter','POST /transfert/finaliser','GET /transfert/:code'],
        client:['GET /client/moto','GET /client/alertes','GET /client/documents'],
        garage:['GET /params','PUT /params','GET /stats']
      }
    }, 'Bienvenue sur MotoKey API 🏍️');
  }

  /* AUTH */
  if((p=M('POST','/auth/login'))!==null){
    const {email,password,role='garage'} = b;
    if(!email||!password) return fail(res,'Email et mot de passe requis');
    const h = hashPwd(password);
    if(role==='garage'){
      const g = DB.garages.find(function(x){return x.email===email&&x.password===h;});
      if(!g) return fail(res,'Identifiants incorrects',401,'INVALID_CREDENTIALS');
      const {password:_,...gd} = g;
      return ok(res,{token:jwtSign({id:g.id,role:'garage',email,nom:g.nom}),role:'garage',garage:gd},'Connexion réussie');
    } else {
      const c = DB.clients.find(function(x){return x.email===email&&x.password===h;});
      if(!c) return fail(res,'Identifiants incorrects',401,'INVALID_CREDENTIALS');
      const moto = DB.motos.find(function(m){return m.client_id===c.id;});
      const {password:_,...cd} = c;
      return ok(res,{token:jwtSign({id:c.id,role:'client',email,nom:c.nom,moto_id:moto?moto.id:null}),role:'client',client:cd,moto_id:moto?moto.id:null},'Connexion réussie');
    }
  }

  if((p=M('POST','/auth/register'))!==null){
    const {nom,email,password,siret,tel,adresse} = b;
    if(!nom||!email||!password) return fail(res,'Nom, email et mot de passe requis');
    if(DB.garages.find(function(g){return g.email===email;})) return fail(res,'Email déjà utilisé',409,'DUPLICATE');
    const g = {id:'gar-'+uid(),nom,email,password:hashPwd(password),siret:siret||'',tel:tel||'',adresse:adresse||'',taux_std:65,taux_spec:80,tva:20,plan:'starter',techniciens:[nom],created_at:nowISO()};
    DB.garages.push(g);
    const {password:_,...gd} = g;
    return ok(res,{token:jwtSign({id:g.id,role:'garage',email,nom}),garage:gd},'Garage créé',201);
  }

  if((p=M('GET','/auth/me'))!==null){
    const a = auth(req,res); if(!a) return;
    if(a.role==='garage'){
      const g = DB.garages.find(function(x){return x.id===a.id;});
      if(!g) return fail(res,'Garage non trouvé',404,'NOT_FOUND');
      const {password:_,...gd} = g;
      return ok(res,{role:'garage',garage:gd});
    }
    const c = DB.clients.find(function(x){return x.id===a.id;});
    if(!c) return fail(res,'Client non trouvé',404,'NOT_FOUND');
    const {password:_,...cd} = c;
    return ok(res,{role:'client',client:cd});
  }

  /* MOTOS */
  if((p=M('GET','/motos'))!==null){
    const a = auth(req,res); if(!a) return;

    // Lire depuis Supabase si connecté
    if (USE_SUPABASE) {
      const sbMotos = await SB.select('motos', {garage_id: a.id});
      if (sbMotos && sbMotos.length > 0) {
        // Fusionner avec RAM (évite les doublons)
        sbMotos.forEach(function(sm){
          if (!DB.motos.find(function(dm){return dm.id===sm.id;})) {
            DB.motos.push(sm);
          }
        });
      }
    }

    let list = DB.motos.filter(function(m){return m.garage_id===a.id;});
    if(query.couleur) list = list.filter(function(m){return m.couleur_dossier===query.couleur;});
    const result = list.map(function(m){
      const c  = DB.clients.find(function(x){return x.id===m.client_id;});
      const is = DB.interventions.filter(function(i){return i.moto_id===m.id;});
      const sc = calcScore(is);
      return Object.assign({},m,{client_nom:c?c.nom:(m.client_nom||'—'),nb_interventions:is.length,score:sc,couleur_dossier:couleur(sc)});
    });
    return ok(res,{motos:result,total:result.length});
  }

  if((p=M('POST','/motos'))!==null){
    const a = auth(req,res); if(!a) return;
    const {marque,modele,annee,plaque,vin,km,client_email,client_nom,client_tel} = b;
    if(!marque||!modele||!plaque||!vin) return fail(res,'marque, modele, plaque et vin requis');

    // Chercher ou créer le client
    let cli = DB.clients.find(function(c){return c.email===client_email;});
    if(!cli&&client_nom){
      cli = {id:'cli-'+uid(),nom:client_nom,email:client_email||client_nom.toLowerCase().replace(/\s/g,'')+uid()+'@motokey.fr',password:hashPwd('changeme'),tel:client_tel||'',created_at:nowISO()};
      DB.clients.push(cli);
    }

    const motoId = 'moto-'+uid();
    const m = {id:motoId,garage_id:a.id,client_id:cli?cli.id:null,marque,modele,annee:parseInt(annee)||new Date().getFullYear(),plaque,vin,km:parseInt(km)||0,couleur_dossier:'rouge',score:0,created_at:nowISO(),updated_at:nowISO()};
    DB.motos.push(m);

    // Sauvegarder dans Supabase si connecté
    if (USE_SUPABASE) {
      SB.insert('motos', {
        id: motoId, marque, modele,
        annee: parseInt(annee)||new Date().getFullYear(),
        plaque, vin, km: parseInt(km)||0,
        couleur_dossier: 'rouge', score: 0,
        client_nom: client_nom||null,
        created_at: nowISO(), updated_at: nowISO()
      }).catch(function(e){ console.warn('Supabase insert moto:', e.message); });
    }

    return ok(res,{moto:m,client:cli},'Dossier moto créé',201);
  }

  if((p=M('GET','/motos/:id'))!==null){
    const a = auth(req,res); if(!a) return;
    const m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===a.id;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const c  = DB.clients.find(function(x){return x.id===m.client_id;});
    const is = DB.interventions.filter(function(i){return i.moto_id===m.id;}).sort(function(a,b){return b.created_at.localeCompare(a.created_at);});
    const sc = calcScore(is);
    const {password:_,...cd} = c||{};
    return ok(res,{moto:Object.assign({},m,{score:sc,couleur_dossier:couleur(sc)}),client:cd,interventions:is,nb_interventions:is.length});
  }

  if((p=M('PUT','/motos/:id'))!==null){
    const a = auth(req,res); if(!a) return;
    const i = DB.motos.findIndex(function(x){return x.id===p.id&&x.garage_id===a.id;});
    if(i<0) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    DB.motos[i] = Object.assign({},DB.motos[i],b,{id:p.id,garage_id:a.id,updated_at:nowISO()});
    return ok(res,{moto:DB.motos[i]},'Moto mise à jour');
  }

  if((p=M('DELETE','/motos/:id'))!==null){
    const a = auth(req,res); if(!a) return;
    const i = DB.motos.findIndex(function(x){return x.id===p.id&&x.garage_id===a.id;});
    if(i<0) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    DB.motos.splice(i,1);
    return ok(res,{deleted_id:p.id},'Dossier supprimé');
  }

  if((p=M('GET','/motos/:id/score'))!==null){
    const a = auth(req,res); if(!a) return;
    const m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===a.id;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const is = DB.interventions.filter(function(i){return i.moto_id===m.id;});
    const sc = calcScore(is);
    const pt = {vert:0,bleu:0,jaune:0,rouge:0};
    is.forEach(function(i){pt[i.type]=(pt[i.type]||0)+1;});
    return ok(res,{score:sc,couleur:couleur(sc),nb_interventions:is.length,par_type:pt,detail:{concession:pt.vert*12,pro_valide:pt.bleu*8,proprietaire:pt.jaune*5,malus:pt.rouge*5}});
  }

  /* INTERVENTIONS */
  if((p=M('GET','/motos/:id/interventions'))!==null){
    const a = auth(req,res); if(!a) return;

    // Charger depuis Supabase
    if (USE_SUPABASE) {
      const sbInters = await SB.select('interventions', {moto_id: p.id});
      if (sbInters && sbInters.length > 0) {
        sbInters.forEach(function(si){
          if (!DB.interventions.find(function(di){return di.id===si.id;})) {
            // Normaliser le format date
            if (si.date_intervention && !si.date) {
              const d = new Date(si.date_intervention);
              si.date = String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
            }
            DB.interventions.push(si);
          }
        });
      }
    }

    // Chercher la moto (en RAM ou Supabase)
    let m = DB.motos.find(function(x){return x.id===p.id;});
    if(!m && USE_SUPABASE){
      const rows = await SB.select('motos', {id: p.id});
      if(rows && rows[0]) m = rows[0];
    }
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');

    let is = DB.interventions.filter(function(i){return i.moto_id===p.id;}).sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});
    if(query.type) is = is.filter(function(i){return i.type===query.type;});
    return ok(res,{interventions:is,total:is.length});
  }

  if((p=M('POST','/motos/:id/interventions'))!==null){
    const a = auth(req,res); if(!a) return;
    // Chercher la moto en RAM ou Supabase
    let m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===a.id;});
    if(!m && USE_SUPABASE){
      const rows = await SB.select('motos', {id: p.id});
      if(rows && rows[0]) { m = rows[0]; DB.motos.push(m); }
    }
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const {type,titre,description,km,technicien,montant_ht} = b;
    if(!type||!titre) return fail(res,'type et titre requis');
    if(!['vert','bleu','jaune','rouge'].includes(type)) return fail(res,'type invalide (vert/bleu/jaune/rouge)');
    const interId = 'int-'+uid();
    const sc_conf = rand(78,99);
    const inter = {id:interId,moto_id:p.id,garage_id:a.id,type,titre,description:description||'',km:parseInt(km)||m.km,technicien:technicien||a.nom,date:todayFR(),score_confiance:sc_conf,montant_ht:parseFloat(montant_ht)||0,created_at:nowISO()};
    DB.interventions.push(inter);
    const mi = DB.motos.findIndex(function(x){return x.id===p.id;});
    if(mi>=0&&inter.km>DB.motos[mi].km){DB.motos[mi].km=inter.km;DB.motos[mi].updated_at=nowISO();}
    const allIs = DB.interventions.filter(function(i){return i.moto_id===p.id;});
    const sc = calcScore(allIs);
    if(mi>=0){DB.motos[mi].score=sc;DB.motos[mi].couleur_dossier=couleur(sc);}

    // Sauvegarder intervention dans Supabase
    if (USE_SUPABASE) {
      SB.insert('interventions', {
        id: interId, moto_id: p.id, garage_id: a.id,
        type, titre, description: description||'', km: parseInt(km)||m.km,
        date_intervention: new Date().toISOString().split('T')[0],
        score_confiance: sc_conf, montant_ht: parseFloat(montant_ht)||0,
        created_at: nowISO()
      }).catch(function(e){ console.warn('SB inter:', e.message); });
      // Mettre à jour le score de la moto dans Supabase
      SB.update('motos', p.id, {score: sc, couleur_dossier: couleur(sc), km: parseInt(km)||m.km, updated_at: nowISO()})
        .catch(function(e){ console.warn('SB score:', e.message); });
    }

    return ok(res,{intervention:inter,nouveau_score:sc,nouvelle_couleur:couleur(sc)},'Intervention ajoutée · Client synchronisé',201);
  }

  if((p=M('PUT','/motos/:id/interventions/:iid'))!==null){
    const a = auth(req,res); if(!a) return;
    const i = DB.interventions.findIndex(function(x){return x.id===p.iid&&x.moto_id===p.id;});
    if(i<0) return fail(res,'Intervention non trouvée',404,'NOT_FOUND');
    DB.interventions[i] = Object.assign({},DB.interventions[i],b,{id:p.iid,moto_id:p.id});
    return ok(res,{intervention:DB.interventions[i]},'Intervention mise à jour');
  }

  if((p=M('DELETE','/motos/:id/interventions/:iid'))!==null){
    const a = auth(req,res); if(!a) return;
    const i = DB.interventions.findIndex(function(x){return x.id===p.iid&&x.moto_id===p.id;});
    if(i<0) return fail(res,'Intervention non trouvée',404,'NOT_FOUND');
    DB.interventions.splice(i,1);
    return ok(res,{deleted_id:p.iid},'Intervention supprimée');
  }

  /* ENTRETIEN */
  if((p=M('GET','/motos/:id/entretien'))!==null){
    const a = auth(req,res); if(!a) return;
    const m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===a.id;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const km   = parseInt(query.km)||m.km;
    const plan = enrichPlan(DB.plans[p.id]||[], km);
    return ok(res,{plan,km_actuel:km,source:'Autodata · ETAI',total:plan.length});
  }

  if((p=M('GET','/motos/:id/entretien/alertes'))!==null){
    const a = auth(req,res); if(!a) return;
    const m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===a.id;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const plan = enrichPlan(DB.plans[p.id]||[], m.km);
    const al   = plan.filter(function(op){return op.statut==='urgent'||op.statut==='warning';});
    return ok(res,{alertes:al,nb_alertes:al.length,nb_urgentes:al.filter(function(x){return x.statut==='urgent';}).length});
  }

  /* DEVIS */
  if((p=M('GET','/devis'))!==null){
    const a = auth(req,res); if(!a) return;
    const list = DB.devis.filter(function(d){return d.garage_id===a.id;}).map(function(d){
      const m = DB.motos.find(function(x){return x.id===d.moto_id;});
      return Object.assign({},d,{moto_info:m?m.marque+' '+m.modele+' — '+m.plaque:'—',total_ttc:calcDevis(d).total_ttc});
    });
    return ok(res,{devis:list,total:list.length});
  }

  if((p=M('POST','/devis'))!==null){
    const a = auth(req,res); if(!a) return;
    const {moto_id,lignes,remise_type,remise_pct,remise_note,technicien} = b;
    if(!moto_id) return fail(res,'moto_id requis');
    const m = DB.motos.find(function(x){return x.id===moto_id&&x.garage_id===a.id;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const dv = {id:'dv-'+uid(),moto_id,garage_id:a.id,numero:'2026-'+String(DB.devis.length+100).padStart(4,'0'),statut:'brouillon',technicien:technicien||a.nom,lignes:lignes||[],remise_type:remise_type||'aucun',remise_pct:remise_pct||0,remise_note:remise_note||'',tva:20,created_at:nowISO(),updated_at:nowISO()};
    DB.devis.push(dv);
    return ok(res,{devis:dv,totaux:calcDevis(dv)},'Devis créé',201);
  }

  if((p=M('GET','/devis/:id'))!==null){
    const a = auth(req,res); if(!a) return;
    const dv = DB.devis.find(function(d){return d.id===p.id&&d.garage_id===a.id;});
    if(!dv) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    const m  = DB.motos.find(function(x){return x.id===dv.moto_id;});
    const c  = DB.clients.find(function(x){return x.id===(m?m.client_id:null);});
    const {password:_,...cd} = c||{};
    return ok(res,{devis:dv,moto:m,client:cd,totaux:calcDevis(dv)});
  }

  if((p=M('PUT','/devis/:id'))!==null){
    const a = auth(req,res); if(!a) return;
    const i = DB.devis.findIndex(function(d){return d.id===p.id&&d.garage_id===a.id;});
    if(i<0) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    DB.devis[i] = Object.assign({},DB.devis[i],b,{id:p.id,garage_id:a.id,updated_at:nowISO()});
    return ok(res,{devis:DB.devis[i],totaux:calcDevis(DB.devis[i])},'Devis mis à jour');
  }

  if((p=M('POST','/devis/:id/valider'))!==null){
    const a = auth(req,res); if(!a) return;
    const i = DB.devis.findIndex(function(d){return d.id===p.id&&d.garage_id===a.id;});
    if(i<0) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    if(DB.devis[i].statut==='valide') return fail(res,'Devis déjà validé');
    DB.devis[i].statut='valide'; DB.devis[i].valide_at=nowISO(); DB.devis[i].updated_at=nowISO();
    const tot = calcDevis(DB.devis[i]);
    const m   = DB.motos.find(function(x){return x.id===DB.devis[i].moto_id;});
    const inter = {id:'int-'+uid(),moto_id:DB.devis[i].moto_id,garage_id:a.id,type:'bleu',titre:'Facture '+DB.devis[i].numero,description:DB.devis[i].lignes.map(function(l){return l.desc;}).join(', '),km:m?m.km:0,technicien:DB.devis[i].technicien,date:todayFR(),score_confiance:96,montant_ht:tot.base_ht,devis_id:p.id,created_at:nowISO()};
    DB.interventions.push(inter);
    const allIs = DB.interventions.filter(function(x){return x.moto_id===DB.devis[i].moto_id;});
    const sc = calcScore(allIs);
    const mi = DB.motos.findIndex(function(x){return x.id===DB.devis[i].moto_id;});
    if(mi>=0){DB.motos[mi].score=sc;DB.motos[mi].couleur_dossier=couleur(sc);}
    return ok(res,{devis:DB.devis[i],totaux:tot,intervention_creee:inter,nouveau_score:sc},'Devis validé · Intervention créée · Client synchronisé');
  }

  if((p=M('POST','/devis/:id/pdf'))!==null){
    const a = auth(req,res); if(!a) return;
    const dv = DB.devis.find(function(d){return d.id===p.id&&d.garage_id===a.id;});
    if(!dv) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    return ok(res,{pdf_url:'https://motokey.fr/pdf/'+p.id+'.pdf',generated_at:nowISO(),simulation:true},'PDF généré (simulation)');
  }

  /* FRAUDE */
  if((p=M('POST','/fraude/analyser'))!==null){
    const a = auth(req,res); if(!a) return;
    const {moto_id,garage_nom,garage_type,montant,km,description,qr_code,signature} = b;
    if(!montant||!km) return fail(res,'montant et km requis');
    const r = analyserFraude({garage_type:garage_type||'ok',qr_code:qr_code||'',signature:signature||'none',montant:parseFloat(montant),km:parseInt(km),description:description||''});
    const v = {id:'fv-'+uid(),moto_id:moto_id||null,garage:garage_nom||'Inconnu',montant,km,qr_valide:r.qr_valide,signature_valide:r.signature_valide,score:r.score,verdict:r.verdict,date:todayFR(),created_at:nowISO()};
    DB.fraude_verifications.push(v);
    return ok(res,Object.assign({},r,{verification_id:v.id}),'Analyse terminée — Score: '+r.score+'%');
  }

  if((p=M('GET','/fraude/historique'))!==null){
    const a = auth(req,res); if(!a) return;
    return ok(res,{verifications:DB.fraude_verifications.slice().reverse(),total:DB.fraude_verifications.length});
  }

  /* TRANSFERT */
  if((p=M('POST','/transfert/initier'))!==null){
    const a = auth(req,res); if(!a) return;
    const {moto_id,acheteur_nom,acheteur_email,prix,km_cession,notes} = b;
    if(!moto_id||!acheteur_nom||!prix) return fail(res,'moto_id, acheteur_nom et prix requis');
    const m = DB.motos.find(function(x){return x.id===moto_id&&x.garage_id===a.id;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const code = 'MK-TR-'+Math.random().toString(36).substring(2,6).toUpperCase();
    const tr   = {id:'tr-'+uid(),code,moto_id,garage_id:a.id,vendeur_id:m.client_id,acheteur_nom,acheteur_email:acheteur_email||'',prix,km_cession:km_cession||m.km,notes:notes||'',statut:'initie',expire_at:new Date(Date.now()+172800000).toISOString(),created_at:nowISO(),steps:[{etape:'initie',at:nowISO(),par:'garage'}]};
    DB.transferts.push(tr);
    return ok(res,{transfert:tr,code,expire_dans:'48 heures'},'Code généré · SMS envoyé',201);
  }

  if((p=M('POST','/transfert/confirmer-vendeur'))!==null){
    const a = auth(req,res); if(!a) return;
    const {code} = b;
    if(!code) return fail(res,'code requis');
    const i = DB.transferts.findIndex(function(t){return t.code===code;});
    if(i<0) return fail(res,'Code invalide',404,'NOT_FOUND');
    if(DB.transferts[i].statut!=='initie') return fail(res,'Transfert non confirmable dans cet état');
    DB.transferts[i].statut='vendeur_confirme';
    DB.transferts[i].steps.push({etape:'vendeur_confirme',at:nowISO(),par:'vendeur'});
    return ok(res,{transfert:DB.transferts[i]},'Vente confirmée par le vendeur');
  }

  if((p=M('POST','/transfert/consulter'))!==null){
    const {code} = b;
    if(!code) return fail(res,'code requis');
    const tr = DB.transferts.find(function(t){return t.code===code;});
    if(!tr) return fail(res,'Code invalide',404,'NOT_FOUND');
    const m  = DB.motos.find(function(x){return x.id===tr.moto_id;});
    const is = DB.interventions.filter(function(i){return i.moto_id===tr.moto_id;}).sort(function(a,b){return b.created_at.localeCompare(a.created_at);});
    const sc = calcScore(is);
    const i  = DB.transferts.findIndex(function(t){return t.code===code;});
    if(DB.transferts[i].statut==='vendeur_confirme'){DB.transferts[i].statut='acheteur_consulte';DB.transferts[i].steps.push({etape:'acheteur_consulte',at:nowISO(),par:'acheteur'});}
    return ok(res,{dossier:{moto:m,score:sc,couleur:couleur(sc),interventions:is,nb_interventions:is.length},transfert:{code,acheteur_nom:tr.acheteur_nom,prix:tr.prix,km_cession:tr.km_cession}},'Dossier consulté par l\'acheteur');
  }

  if((p=M('POST','/transfert/finaliser'))!==null){
    const {code,signature_acheteur} = b;
    if(!code) return fail(res,'code requis');
    const i = DB.transferts.findIndex(function(t){return t.code===code;});
    if(i<0) return fail(res,'Code invalide',404,'NOT_FOUND');
    const tr = DB.transferts[i];
    if(!['acheteur_consulte','vendeur_confirme'].includes(tr.statut)) return fail(res,'Transfert non prêt pour finalisation');
    let nc = DB.clients.find(function(c){return c.email===tr.acheteur_email;});
    if(!nc){nc={id:'cli-'+uid(),nom:tr.acheteur_nom,email:tr.acheteur_email||tr.acheteur_nom.toLowerCase().replace(/\s/g,'')+uid()+'@motokey.fr',password:hashPwd('changeme'),tel:'',created_at:nowISO()};DB.clients.push(nc);}
    const mi = DB.motos.findIndex(function(x){return x.id===tr.moto_id;});
    const oldCli = DB.motos[mi]?DB.motos[mi].client_id:null;
    if(mi>=0){DB.motos[mi].client_id=nc.id;DB.motos[mi].updated_at=nowISO();}
    const certId = 'CERT-2026-'+Math.random().toString(36).substring(2,8).toUpperCase();
    Object.assign(DB.transferts[i],{statut:'finalise',nouveau_client_id:nc.id,ancien_client_id:oldCli,certificat_id:certId,signature_acheteur:signature_acheteur||tr.acheteur_nom,finalise_at:nowISO()});
    DB.transferts[i].steps.push({etape:'finalise',at:nowISO(),par:'acheteur'});
    const moto = DB.motos[mi];
    return ok(res,{certificat:{id:certId,moto:{marque:moto?moto.marque:'',modele:moto?moto.modele:'',plaque:moto?moto.plaque:'',km:tr.km_cession},vendeur:{id:oldCli},acheteur:nc,prix:tr.prix,date:todayFR(),hash:crypto.createHash('sha256').update(certId+tr.code).digest('hex')},transfert:DB.transferts[i],acces_vendeur_revoque:true,nouveau_proprietaire:nc},'Transfert finalisé · Certificat émis · Accès vendeur révoqué');
  }

  if((p=M('GET','/transfert/:code'))!==null){
    const a = auth(req,res); if(!a) return;
    const tr = DB.transferts.find(function(t){return t.code===p.code&&t.garage_id===a.id;});
    if(!tr) return fail(res,'Transfert non trouvé',404,'NOT_FOUND');
    return ok(res,{transfert:tr});
  }

  /* CLIENT */
  if((p=M('GET','/client/moto'))!==null){
    const a = auth(req,res); if(!a) return;
    if(a.role!=='client') return fail(res,'Réservé aux clients',403,'FORBIDDEN');
    const m = DB.motos.find(function(x){return x.client_id===a.id;});
    if(!m) return fail(res,'Aucune moto associée',404,'NOT_FOUND');
    const is = DB.interventions.filter(function(i){return i.moto_id===m.id;}).sort(function(a,b){return b.created_at.localeCompare(a.created_at);});
    const sc = calcScore(is);
    const pl = enrichPlan(DB.plans[m.id]||[], m.km);
    return ok(res,{moto:Object.assign({},m,{score:sc,couleur_dossier:couleur(sc)}),interventions:is,plan_entretien:pl,nb_alertes:pl.filter(function(o){return o.statut==='urgent'||o.statut==='warning';}).length});
  }

  if((p=M('GET','/client/alertes'))!==null){
    const a = auth(req,res); if(!a) return;
    if(a.role!=='client') return fail(res,'Réservé aux clients',403,'FORBIDDEN');
    const m = DB.motos.find(function(x){return x.client_id===a.id;});
    if(!m) return fail(res,'Aucune moto associée',404,'NOT_FOUND');
    const al = enrichPlan(DB.plans[m.id]||[], m.km).filter(function(op){return op.statut==='urgent'||op.statut==='warning';});
    return ok(res,{alertes:al,nb_alertes:al.length,moto_km:m.km});
  }

  if((p=M('GET','/client/documents'))!==null){
    const a = auth(req,res); if(!a) return;
    if(a.role!=='client') return fail(res,'Réservé aux clients',403,'FORBIDDEN');
    const m = DB.motos.find(function(x){return x.client_id===a.id;});
    if(!m) return fail(res,'Aucune moto associée',404,'NOT_FOUND');
    const docs = DB.interventions.filter(function(i){return i.moto_id===m.id;}).map(function(i){
      return {id:i.id,nom:i.titre,date:i.date,type:i.type,montant_ht:i.montant_ht,score_confiance:i.score_confiance,url_facture:'https://motokey.fr/factures/'+i.id+'.pdf',simulation:true};
    });
    return ok(res,{documents:docs,total:docs.length});
  }

  /* PARAMS & STATS */
  if((p=M('GET','/params'))!==null){
    const a = auth(req,res); if(!a) return;
    const g = DB.garages.find(function(x){return x.id===a.id;});
    if(!g) return fail(res,'Garage non trouvé',404,'NOT_FOUND');
    const {password:_,...gd} = g;
    return ok(res,{params:gd});
  }

  if((p=M('PUT','/params'))!==null){
    const a = auth(req,res); if(!a) return;
    const i = DB.garages.findIndex(function(x){return x.id===a.id;});
    if(i<0) return fail(res,'Garage non trouvé',404,'NOT_FOUND');
    ['nom','tel','adresse','siret','taux_std','taux_spec','tva','techniciens'].forEach(function(k){if(b[k]!==undefined)DB.garages[i][k]=b[k];});
    const {password:_,...gd} = DB.garages[i];
    return ok(res,{params:gd},'Paramètres mis à jour');
  }

  if((p=M('GET','/stats'))!==null){
    const a = auth(req,res); if(!a) return;
    const ms = DB.motos.filter(function(m){return m.garage_id===a.id;});
    const co = {vert:0,bleu:0,jaune:0,rouge:0};
    ms.forEach(function(m){co[m.couleur_dossier]=(co[m.couleur_dossier]||0)+1;});
    const is  = DB.interventions.filter(function(i){return i.garage_id===a.id;});
    const dvs = DB.devis.filter(function(d){return d.garage_id===a.id;});
    const ca  = dvs.filter(function(d){return d.statut==='valide';}).reduce(function(s,d){return s+calcDevis(d).total_ttc;},0);
    return ok(res,{
      motos:{total:ms.length,par_couleur:co},
      interventions:{total:is.length,par_type:{vert:is.filter(function(i){return i.type==='vert';}).length,bleu:is.filter(function(i){return i.type==='bleu';}).length,jaune:is.filter(function(i){return i.type==='jaune';}).length,rouge:is.filter(function(i){return i.type==='rouge';}).length}},
      devis:{total:dvs.length,valides:dvs.filter(function(d){return d.statut==='valide';}).length,ca_ttc:+ca.toFixed(2),ca_ht:+(ca/1.2).toFixed(2)},
      transferts:{total:DB.transferts.filter(function(t){return t.garage_id===a.id;}).length,finalises:DB.transferts.filter(function(t){return t.garage_id===a.id&&t.statut==='finalise';}).length},
      fraude:{total:DB.fraude_verifications.length,authentifiees:DB.fraude_verifications.filter(function(f){return f.verdict==='authentifie';}).length,suspectes:DB.fraude_verifications.filter(function(f){return f.verdict==='fraude_suspectee';}).length}
    });
  }

  /* 404 */
  fail(res,'Route inconnue: '+method+' '+pathname,404,'NOT_FOUND');
});

server.listen(PORT, function(){
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║         MOTOKEY API MOCK v'+VERSION+'                         ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  🌐  http://localhost:'+PORT+'                               ║');
  console.log('║  📦  Node.js pur · Zéro dépendance · Supabase-ready      ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  CREDENTIALS :                                           ║');
  console.log('║  Garage  →  garage@motokey.fr  /  motokey2026           ║');
  console.log('║  Client  →  sophie@email.com   /  client123             ║');
  console.log('║  Client  →  pierre@email.com   /  client123             ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  TEST RAPIDE :                                           ║');
  console.log('║  curl http://localhost:3000/                             ║');
  console.log('║  curl -X POST http://localhost:3000/auth/login \\        ║');
  console.log('║    -H "Content-Type: application/json" \\               ║');
  console.log('║    -d \'{"email":"garage@motokey.fr",                   ║');
  console.log('║           "password":"motokey2026","role":"garage"}\'   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
});
