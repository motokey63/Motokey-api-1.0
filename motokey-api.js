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
const _fs   = require('fs');
const _path = require('path');
let APP_HTML = null;
try {
  APP_HTML = _fs.readFileSync(_path.join(__dirname,'MotoKey_App.html'),'utf8');
  console.log('✅ MotoKey_App.html chargé — accessible sur /app');
} catch(e) {
  console.log('ℹ️  MotoKey_App.html absent — copiez-le dans le même dossier pour y accéder via /app');
}

const server = http.createServer(async function(req, res){
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/+$/,'') || '/';
  const method   = req.method.toUpperCase();
  const query    = parsed.query;

  if(method==='OPTIONS'){ sendJSON(res,204,{}); return; }

  // ── Servir l'app HTML sur /app
  if((pathname==='/'||pathname==='/app') && method==='GET' && APP_HTML){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Access-Control-Allow-Origin':'*'});
    res.end(APP_HTML);
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
