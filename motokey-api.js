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

const http       = require('http');
const crypto     = require('crypto');
const url        = require('url');
const https2     = require('https');
const clientAuth  = require('./auth/client_auth');
const emailService = require('./services/emailService');

// Couche Supabase (supabase.js) — chargée si SUPABASE_URL + SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) présents
let SBLayer = null;
try {
  SBLayer = require('./supabase');
  console.log('✅ supabase.js chargé');
} catch(e) {
  console.warn('⚠️  supabase.js introuvable — mode RAM uniquement:', e.message);
}

console.log('=== DEBUG ENV ===');
console.log('JWT_CLIENT_SECRET present:', !!process.env.JWT_CLIENT_SECRET);
console.log('JWT_CLIENT_SECRET length:', process.env.JWT_CLIENT_SECRET ? process.env.JWT_CLIENT_SECRET.length : 0);
console.log('FRONTEND_CLIENT_URL present:', !!process.env.FRONTEND_CLIENT_URL);
console.log('All JWT keys:', Object.keys(process.env).filter(function(k){ return k.includes('JWT'); }));
console.log('================');

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'motokey_secret_2026';
const VERSION    = '1.0.0';

/* ─── SUPABASE CLIENT LEGER ─── */
const SUPABASE_URL = process.env.SUPABASE_URL;
// Nouveau système Publishable/Secret avec fallback legacy
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

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
console.log(USE_SUPABASE ? '✅ Supabase connecte — donnees persistantes' : '⚠️  Mode RAM — configurer SUPABASE_URL et SUPABASE_SECRET_KEY');

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
// App HTML — intégré directement dans l'API (toujours synchronisé)
// Build: 20260330
const _EMBEDDED_HTML = "<!DOCTYPE html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"UTF-8\">\n<meta http-equiv=\"Cache-Control\" content=\"no-cache, no-store, must-revalidate\">\n<meta http-equiv=\"Pragma\" content=\"no-cache\">\n<meta http-equiv=\"Expires\" content=\"0\">\n<!-- MotoKey Build 20260330_064151 -->\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">\n<title>MotoKey v20260330_064151 \u2014 Garage</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap\" rel=\"stylesheet\">\n<style>\n*{margin:0;padding:0;box-sizing:border-box;}\nbody{font-family:'Inter',sans-serif;background:#f0f2f5;color:#1a1d23;min-height:100vh;}\n\n/* \u2500\u2500 Variables \u2500\u2500 */\n:root{\n  --bg:#f0f2f5;--card:#ffffff;--card2:#f8f9fb;\n  --border:#e2e5eb;--border2:#d0d4dc;\n  --tx:#1a1d23;--tx2:#5a6172;--tx3:#9ba3b4;\n  --acc:#ff6b00;--acc2:#ff8c33;--accbg:#fff4ee;\n  --gn:#16a34a;--gnbg:#f0fdf4;--gnbd:#bbf7d0;\n  --bl:#2563eb;--blbg:#eff6ff;--blbd:#bfdbfe;\n  --yw:#d97706;--ywbg:#fffbeb;--ywbd:#fde68a;\n  --rd:#dc2626;--rdbg:#fef2f2;--rdbd:#fecaca;\n  --pu:#7c3aed;--pubg:#f5f3ff;\n  --sh:0 1px 3px rgba(0,0,0,.08),0 1px 2px rgba(0,0,0,.05);\n  --sh2:0 4px 16px rgba(0,0,0,.1);\n}\n\n/* \u2500\u2500 Layout \u2500\u2500 */\n.topbar{background:#fff;border-bottom:1px solid var(--border);padding:0 24px;display:flex;align-items:center;height:60px;gap:16px;position:sticky;top:0;z-index:100;box-shadow:var(--sh);}\n.logo{font-size:20px;font-weight:900;color:var(--tx);letter-spacing:.5px;white-space:nowrap;}\n.logo em{color:var(--acc);font-style:normal;}\n.nav{display:flex;gap:2px;margin-left:8px;}\n.nav-btn{padding:7px 14px;border-radius:8px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:500;color:var(--tx2);transition:all .15s;white-space:nowrap;}\n.nav-btn:hover{background:var(--bg);color:var(--tx);}\n.nav-btn.on{background:var(--accbg);color:var(--acc);font-weight:700;}\n.topbar-right{margin-left:auto;display:flex;align-items:center;gap:10px;}\n.api-pill{display:flex;align-items:center;gap:5px;background:var(--gnbg);border:1px solid var(--gnbd);color:var(--gn);padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;}\n.api-dot{width:6px;height:6px;border-radius:50%;background:var(--gn);animation:pulse 1.5s infinite;}\n@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}\n\n.main{max-width:1100px;margin:0 auto;padding:24px 20px;}\n\n/* \u2500\u2500 Cards \u2500\u2500 */\n.card{background:var(--card);border-radius:14px;border:1px solid var(--border);box-shadow:var(--sh);}\n.card-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}\n.card-title{font-size:15px;font-weight:700;color:var(--tx);}\n.card-body{padding:20px;}\n\n/* \u2500\u2500 Boutons \u2500\u2500 */\n.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:9px;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:all .15s;}\n.btn-primary{background:var(--acc);color:#fff;} .btn-primary:hover{background:var(--acc2);}\n.btn-ghost{background:var(--card);color:var(--tx2);border:1px solid var(--border);} .btn-ghost:hover{background:var(--bg);}\n.btn-sm{padding:5px 11px;font-size:12px;}\n.btn-danger{background:var(--rdbg);color:var(--rd);border:1px solid var(--rdbd);}\n\n/* \u2500\u2500 Score Badge \u2500\u2500 */\n.score-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;}\n.score-vert{background:var(--gnbg);color:var(--gn);border:1px solid var(--gnbd);}\n.score-bleu{background:var(--blbg);color:var(--bl);border:1px solid var(--blbd);}\n.score-jaune{background:var(--ywbg);color:var(--yw);border:1px solid var(--ywbd);}\n.score-rouge{background:var(--rdbg);color:var(--rd);border:1px solid var(--rdbd);}\n\n/* \u2500\u2500 Moto Cards \u2500\u2500 */\n.moto-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}\n.moto-card{background:var(--card);border-radius:14px;border:1px solid var(--border);box-shadow:var(--sh);padding:18px;cursor:pointer;transition:all .2s;}\n.moto-card:hover{transform:translateY(-2px);box-shadow:var(--sh2);border-color:var(--acc);}\n.moto-card.active{border-color:var(--acc);box-shadow:0 0 0 3px var(--accbg);}\n.mc-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;}\n.mc-mk{font-size:17px;font-weight:800;color:var(--tx);}\n.mc-md{font-size:13px;color:var(--tx2);margin-top:1px;}\n.mc-score{text-align:center;}\n.mc-score-num{font-size:28px;font-weight:900;line-height:1;}\n.mc-score-lbl{font-size:9px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;}\n.mc-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}\n.mc-tag{display:inline-flex;align-items:center;gap:4px;background:var(--bg);color:var(--tx2);padding:3px 9px;border-radius:6px;font-size:11px;font-weight:500;}\n.mc-bar{height:4px;background:var(--border);border-radius:2px;overflow:hidden;}\n.mc-bar-fill{height:100%;border-radius:2px;transition:width .5s;}\n.mc-foot{display:flex;align-items:center;justify-content:space-between;margin-top:12px;}\n.mc-own{font-size:12px;color:var(--tx3);}\n\n/* \u2500\u2500 Stats Row \u2500\u2500 */\n.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}\n.stat-card{background:var(--card);border-radius:12px;border:1px solid var(--border);padding:16px;box-shadow:var(--sh);}\n.stat-lbl{font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-weight:600;}\n.stat-val{font-size:26px;font-weight:900;color:var(--tx);}\n.stat-sub{font-size:11px;color:var(--tx3);margin-top:3px;}\n\n/* \u2500\u2500 Intervention List \u2500\u2500 */\n.inter-list{display:flex;flex-direction:column;gap:8px;}\n.inter-item{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:10px;border:1px solid var(--border);padding:12px 14px;}\n.inter-bar{width:3px;min-height:40px;border-radius:2px;align-self:stretch;}\n.inter-info{flex:1;}\n.inter-title{font-size:14px;font-weight:600;color:var(--tx);}\n.inter-meta{font-size:12px;color:var(--tx3);margin-top:2px;}\n.inter-right{text-align:right;}\n.inter-km{font-size:12px;color:var(--tx2);font-weight:500;}\n.inter-fraud{font-size:11px;color:var(--pu);font-weight:600;margin-top:2px;}\n.inter-new{background:var(--gnbg);border-color:var(--gnbd);}\n\n/* \u2500\u2500 Plan Entretien \u2500\u2500 */\n.plan-list{display:flex;flex-direction:column;gap:8px;}\n.plan-item{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:10px;border:1px solid var(--border);padding:12px 14px;border-left:3px solid var(--border2);}\n.plan-icon{font-size:20px;width:28px;text-align:center;}\n.plan-info{flex:1;}\n.plan-name{font-size:13px;font-weight:600;color:var(--tx);}\n.plan-detail{font-size:11px;color:var(--tx3);margin-top:2px;}\n.plan-bar{width:100px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:5px;}\n.plan-bar-fill{height:100%;border-radius:2px;}\n.plan-status{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap;}\n.ps-urgent{background:var(--rdbg);color:var(--rd);}\n.ps-warning{background:var(--ywbg);color:var(--yw);}\n.ps-ok{background:var(--gnbg);color:var(--gn);}\n.ps-due{background:#fff7ed;color:#c2410c;}\n.ps-future{background:var(--bg);color:var(--tx3);}\n\n/* \u2500\u2500 Pneus \u2500\u2500 */\n.tire-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;}\n.tire-card{background:var(--card);border-radius:12px;border:1px solid var(--border);padding:16px;position:relative;overflow:hidden;}\n.tire-card.reco{border-color:var(--acc);box-shadow:0 0 0 2px var(--accbg);}\n.tire-reco-badge{position:absolute;top:10px;right:10px;background:var(--acc);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;}\n.tire-brand{font-size:11px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:1px;}\n.tire-name{font-size:17px;font-weight:800;color:var(--tx);margin:3px 0;}\n.tire-type{font-size:12px;color:var(--tx2);margin-bottom:12px;}\n.tire-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0;}\n.tire-stat{text-align:center;background:var(--bg);border-radius:8px;padding:8px 4px;}\n.tire-stat-val{font-size:16px;font-weight:800;color:var(--tx);}\n.tire-stat-lbl{font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;margin-top:2px;}\n.tire-prices{display:flex;gap:8px;margin-top:10px;}\n.tire-price{flex:1;background:var(--bg);border-radius:8px;padding:8px;text-align:center;}\n.tire-price-val{font-size:15px;font-weight:800;color:var(--tx);}\n.tire-price-lbl{font-size:10px;color:var(--tx3);}\n\n/* \u2500\u2500 Devis \u2500\u2500 */\n.devis-table{width:100%;border-collapse:collapse;font-size:13px;}\n.devis-table th{background:var(--bg);padding:9px 12px;text-align:left;font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:1px solid var(--border);}\n.devis-table td{padding:10px 12px;border-bottom:1px solid var(--border2);}\n.devis-table tr:last-child td{border-bottom:none;}\n.devis-table tr:hover td{background:var(--bg);}\n\n/* \u2500\u2500 Modal \u2500\u2500 */\n.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);z-index:1000;display:none;align-items:center;justify-content:center;padding:20px;}\n.modal-overlay.open{display:flex;}\n.modal{background:#fff;border-radius:18px;width:100%;max-width:520px;box-shadow:0 24px 64px rgba(0,0,0,.2);overflow:hidden;}\n.modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--border);}\n.modal-title{font-size:17px;font-weight:800;color:var(--tx);}\n.modal-close{width:30px;height:30px;border-radius:50%;border:none;background:var(--bg);cursor:pointer;font-size:16px;color:var(--tx2);display:flex;align-items:center;justify-content:center;}\n.modal-close:hover{background:var(--border);}\n.modal-body{padding:22px;display:flex;flex-direction:column;gap:14px;max-height:70vh;overflow-y:auto;}\n.field label{display:block;font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}\n.field input,.field select{width:100%;padding:10px 13px;border-radius:9px;border:1.5px solid var(--border);font-size:14px;color:var(--tx);background:#fff;outline:none;transition:border .15s;}\n.field input:focus,.field select:focus{border-color:var(--acc);}\n.field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}\n.modal-foot{display:flex;gap:10px;justify-content:flex-end;padding:16px 22px;border-top:1px solid var(--border);background:var(--bg);}\n\n/* \u2500\u2500 Toast \u2500\u2500 */\n.toast{position:fixed;bottom:20px;right:20px;background:#1a1d23;color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;display:flex;align-items:center;gap:8px;transform:translateY(80px);opacity:0;transition:all .3s cubic-bezier(.34,1.56,.64,1);max-width:350px;}\n.toast.show{transform:translateY(0);opacity:1;}\n\n/* \u2500\u2500 Type Selector \u2500\u2500 */\n.type-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}\n.type-btn{padding:10px;border-radius:10px;border:2px solid transparent;cursor:pointer;text-align:center;font-size:12px;font-weight:700;transition:all .2s;opacity:.5;}\n.type-btn.sel{opacity:1;transform:scale(1.03);}\n.type-vert{background:#f0fdf4;color:#16a34a;border-color:#bbf7d0;}\n.type-bleu{background:#eff6ff;color:#2563eb;border-color:#bfdbfe;}\n.type-jaune{background:#fffbeb;color:#d97706;border-color:#fde68a;}\n.type-rouge{background:#fef2f2;color:#dc2626;border-color:#fecaca;}\n.type-btn.sel.type-vert{border-color:#16a34a;box-shadow:0 0 0 3px #dcfce7;}\n.type-btn.sel.type-bleu{border-color:#2563eb;box-shadow:0 0 0 3px #dbeafe;}\n.type-btn.sel.type-jaune{border-color:#d97706;box-shadow:0 0 0 3px #fef3c7;}\n.type-btn.sel.type-rouge{border-color:#dc2626;box-shadow:0 0 0 3px #fee2e2;}\n\n/* \u2500\u2500 Section header \u2500\u2500 */\n.sec-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}\n.sec-title{font-size:21px;font-weight:800;color:var(--tx);}\n.sec-sub{font-size:13px;color:var(--tx3);margin-top:2px;}\n\n/* \u2500\u2500 Empty state \u2500\u2500 */\n.empty{text-align:center;padding:48px 20px;color:var(--tx3);}\n.empty-icon{font-size:40px;margin-bottom:12px;}\n.empty-title{font-size:16px;font-weight:700;color:var(--tx2);margin-bottom:6px;}\n.empty-sub{font-size:13px;}\n\n/* \u2500\u2500 Fiche Moto \u2500\u2500 */\n.fiche-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}\n.info-row{display:flex;flex-direction:column;gap:3px;padding:12px;background:var(--bg);border-radius:9px;}\n.info-lbl{font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px;font-weight:600;}\n.info-val{font-size:14px;font-weight:700;color:var(--tx);}\n\n/* \u2500\u2500 Score Circle \u2500\u2500 */\n.score-circle{position:relative;width:80px;height:80px;}\n.score-circle svg{transform:rotate(-90deg);}\n.score-circle-text{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}\n.sc-num{font-size:22px;font-weight:900;line-height:1;}\n.sc-lbl{font-size:9px;color:var(--tx3);letter-spacing:1px;}\n\n/* \u2500\u2500 Responsive \u2500\u2500 */\n@media(max-width:768px){\n  .stats-row{grid-template-columns:repeat(2,1fr);}\n  .fiche-grid{grid-template-columns:1fr;}\n  .nav-btn span{display:none;}\n  .topbar{padding:0 12px;}\n  .main{padding:16px 12px;}\n}\n</style>\n</head>\n<body>\n\n<!-- TOP BAR -->\n<div class=\"topbar\" id=\"topbar\">\n  <div class=\"logo\">MOTO<em>KEY</em></div>\n  <nav class=\"nav\" id=\"mainNav\">\n    <button class=\"nav-btn on\" onclick=\"goSec('dashboard',this)\" data-sec=\"dashboard\">\ud83c\udfe0 Tableau de bord</button>\n    <button class=\"nav-btn\" onclick=\"goSec('motos',this)\" data-sec=\"motos\">\ud83c\udfcd\ufe0f Motos</button>\n    <button class=\"nav-btn\" onclick=\"goSec('entretien',this)\" data-sec=\"entretien\">\ud83d\udd27 Entretien</button>\n    \n    <button class=\"nav-btn\" onclick=\"goSec('devis',this)\" data-sec=\"devis\">\ud83d\udcb6 Devis</button>\n  </nav>\n  <div class=\"topbar-right\" id=\"apiStatus\"></div>\n</div>\n\n<!-- MAIN CONTENT -->\n<div class=\"main\" id=\"mainContent\"></div>\n\n<!-- MODAL -->\n<div class=\"modal-overlay\" id=\"modalOverlay\" onclick=\"if(event.target===this)closeModal()\">\n  <div class=\"modal\" id=\"modalBox\"></div>\n</div>\n\n<!-- TOAST -->\n<div class=\"toast\" id=\"toast\"></div>\n\n<script>\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   DONN\u00c9ES\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nvar G = {\n  garage:{ nom:'Garage MotoKey', tauxStd:65, tauxSpec:80, tva:20,\n    techniciens:['Jean-Marc Duval','Pierre Martin','Sophie Blanc'] },\n  motos:[\n    {id:1,mk:'Yamaha',md:'MT-07',yr:2021,pl:'EF-789-GH',vin:'JYARN22E00A000002',km:18650,own:'Sophie Laurent',col:'bleu',sc:74,\n     hist:[\n       {t:'Vidange + filtre \u00e0 air',d:'05/02/2026',km:18650,ty:'bleu',tech:'Moto Shop Orl\u00e9ans',desc:'Huile Yamaha OEM',vf:96},\n       {t:'Pneus avant + arri\u00e8re',d:'11/11/2025',km:16200,ty:'bleu',tech:'Top Moto 45',desc:'Michelin Road 6',vf:91},\n       {t:'R\u00e9vision 12 000 km',d:'03/06/2025',km:12000,ty:'vert',tech:'Yamaha Concessionnaire',desc:'R\u00e9vision constructeur compl\u00e8te',vf:99}\n     ],\n     plan:[\n       {id:'v6',ic:'\ud83d\udee2\ufe0f',nm:'Vidange + filtre huile',kmi:6000,kmlast:18650,th:.8,prod:'Yamalube 10W-40'},\n       {id:'fa',ic:'\ud83d\udca8',nm:'Filtre \u00e0 air',kmi:12000,kmlast:12000,th:.5,prod:'Filtre Yamaha OEM'},\n       {id:'bg',ic:'\u26a1',nm:'Bougies (x2)',kmi:12000,kmlast:12000,th:1.2,prod:'NGK CR9EIA-9'},\n       {id:'ch',ic:'\u26d3\ufe0f',nm:'Cha\u00eene + pignons',kmi:20000,kmlast:12000,th:1.8,prod:'Kit RK 520 XSO'},\n       {id:'lf',ic:'\ud83d\udd34',nm:'Liquide de frein',kmi:24000,kmlast:6000,th:.8,prod:'Motul RBF 600 DOT4'},\n       {id:'sv',ic:'\ud83d\udd27',nm:'Jeu aux soupapes',kmi:24000,kmlast:12000,th:4,prod:'\u2014'}\n     ]},\n    {id:2,mk:'Honda',md:'CB750 Four',yr:1978,pl:'AB-456-CD',vin:'JH2RC1700RM200001',km:42300,own:'Pierre Moreau',col:'vert',sc:92,\n     hist:[{t:'R\u00e9vision compl\u00e8te',d:'12/03/2026',km:42300,ty:'vert',tech:'J.-M. Duval',desc:'Vidange, filtres, bougies',vf:94}],\n     plan:[{id:'v5',ic:'\ud83d\udee2\ufe0f',nm:'Vidange + filtre',kmi:5000,kmlast:42300,th:1,prod:'Motul Classic 10W-40'}]},\n    {id:3,mk:'Kawasaki',md:'Z900',yr:2020,pl:'IJ-012-KL',vin:'JKAZR9A14LA000003',km:29100,own:'Marc Dubois',col:'jaune',sc:55,\n     hist:[{t:'Vidange maison',d:'18/01/2026',km:29100,ty:'jaune',tech:'Propri\u00e9taire',desc:'Castrol Power1',vf:54}],\n     plan:[{id:'v6z',ic:'\ud83d\udee2\ufe0f',nm:'Vidange + filtre',kmi:6000,kmlast:29100,th:.8,prod:'Motul 10W-50'}]},\n    {id:4,mk:'Ducati',md:'Monster 937',yr:2022,pl:'MN-345-OP',vin:'ZDM1BBBJ0NB000004',km:8900,own:'Claire Petit',col:'vert',sc:88,\n     hist:[{t:'R\u00e9vision 7 500 km',d:'28/02/2026',km:8900,ty:'vert',tech:'Ducati Store Orl\u00e9ans',desc:'Courroies, soupapes',vf:99}],\n     plan:[\n       {id:'vd',ic:'\ud83d\udee2\ufe0f',nm:'Vidange + filtre',kmi:7500,kmlast:7500,th:1,prod:'Shell Advance 15W-50'},\n       {id:'crd',ic:'\u2699\ufe0f',nm:'Courroies distribution',kmi:15000,kmlast:7500,th:6,prod:'Kit Ducati OEM'}\n     ]}\n  ],\n  tires:[\n    {id:'road6',br:'Michelin',nm:'Road 6',cat:'Sport-Touring GT',reco:true,kmAv:18000,kmAr:15000,grip:82,pluie:95,lv:95,pAv:131.95,pAr:181.95,col:'#2563eb'},\n    {id:'rosso4',br:'Pirelli',nm:'Diablo Rosso IV',cat:'Sport Route',reco:false,kmAv:8000,kmAr:7500,grip:95,pluie:75,lv:45,pAv:130,pAr:155,col:'#dc2626'},\n    {id:'t32',br:'Bridgestone',nm:'Battlax T32',cat:'Touring Premium',reco:false,kmAv:17000,kmAr:14000,grip:85,pluie:90,lv:90,pAv:138,pAr:152,col:'#16a34a'},\n    {id:'rs4',br:'Dunlop',nm:'RoadSmart IV',cat:'Sport-Touring',reco:false,kmAv:15000,kmAr:12000,grip:88,pluie:85,lv:80,pAv:123,pAr:175,col:'#d97706'},\n    {id:'m9rr',br:'Metzeler',nm:'Sportec M9 RR',cat:'Sport Piste-Route',reco:false,kmAv:7000,kmAr:6000,grip:98,pluie:70,lv:35,pAv:150,pAr:165,col:'#f97316'},\n    {id:'agt2',br:'Pirelli',nm:'Angel GT 2',cat:'GT Touring',reco:false,kmAv:16000,kmAr:14000,grip:83,pluie:88,lv:88,pAv:125,pAr:177,col:'#7c3aed'}\n  ]\n};\n\nvar curSec = 'dashboard';\nvar curMoto = 1;\nvar window_itype = 'bleu';\nvar searchQuery = '';\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   HELPERS\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction getMoto(id){ return G.motos.find(function(m){return m.id==id;})||G.motos[0]; }\nfunction colHex(c){ return {vert:'#16a34a',bleu:'#2563eb',jaune:'#d97706',rouge:'#dc2626'}[c]||'#888'; }\nfunction colClass(c){ return 'score-'+c; }\nfunction fmtKm(n){ return (n||0).toLocaleString('fr-FR')+' km'; }\nfunction fmtEur(n){ return parseFloat(n||0).toFixed(2).replace('.',',')+' \u20ac'; }\nfunction planStatut(kmlast,kmi,kmActuel){\n  var since=kmActuel-kmlast, pct=kmi>0?Math.min(100,Math.round(since/kmi*100)):0;\n  var left=Math.max(0,kmi-since);\n  var s=pct>=100?'urgent':pct>=80?'warning':pct>=40?'due':kmlast>0?'ok':'future';\n  return {pct,left,s};\n}\nfunction toast(msg){\n  var t=document.getElementById('toast');\n  t.textContent=msg; t.classList.add('show');\n  clearTimeout(window._toast);\n  window._toast=setTimeout(function(){t.classList.remove('show');},3200);\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   NAVIGATION\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction goSec(sec, btn){\n  curSec = sec;\n  document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('on');});\n  if(btn) btn.classList.add('on');\n  else {\n    var b=document.querySelector('[data-sec='+sec+']');\n    if(b) b.classList.add('on');\n  }\n  render();\n}\n\nfunction render(){\n  var el = document.getElementById('mainContent');\n  if(curSec==='dashboard') el.innerHTML = renderDashboard();\n  else if(curSec==='motos') el.innerHTML = renderMotos();\n  else if(curSec==='entretien') el.innerHTML = renderEntretien();\n  else if(curSec==='devis') el.innerHTML = renderDevis();\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   DASHBOARD\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction renderDashboard(){\n  var total=G.motos.length;\n  var parCouleur={vert:0,bleu:0,jaune:0,rouge:0};\n  G.motos.forEach(function(m){parCouleur[m.col]=(parCouleur[m.col]||0)+1;});\n  var totalInters=G.motos.reduce(function(s,m){return s+(m.hist||[]).length;},0);\n  var scoresMoy=Math.round(G.motos.reduce(function(s,m){return s+m.sc;},0)/Math.max(1,total));\n\n  var html='';\n\n  /* En-t\u00eate */\n  html+='<div class=\"sec-header\"><div><div class=\"sec-title\">Tableau de bord</div><div class=\"sec-sub\">Vue d\\'ensemble du parc \u2014 '+G.garage.nom+'</div></div>';\n  html+='<button class=\"btn btn-primary\" onclick=\"openModal(\\'addMoto\\')\">\uff0b Nouvelle moto</button></div>';\n\n  /* Stats */\n  html+='<div class=\"stats-row\">';\n  html+='<div class=\"stat-card\"><div class=\"stat-lbl\">Motos</div><div class=\"stat-val\">'+total+'</div><div class=\"stat-sub\">dans le parc</div></div>';\n  html+='<div class=\"stat-card\"><div class=\"stat-lbl\">Score moyen</div><div class=\"stat-val\" style=\"color:'+colHex(scoresMoy>=80?'vert':scoresMoy>=60?'bleu':scoresMoy>=40?'jaune':'rouge')+'\">'+scoresMoy+'<span style=\"font-size:14px;font-weight:400\">/100</span></div><div class=\"stat-sub\">qualit\u00e9 du parc</div></div>';\n  html+='<div class=\"stat-card\"><div class=\"stat-lbl\">Interventions</div><div class=\"stat-val\">'+totalInters+'</div><div class=\"stat-sub\">enregistr\u00e9es</div></div>';\n  html+='<div class=\"stat-card\"><div class=\"stat-lbl\">R\u00e9partition</div><div style=\"display:flex;gap:6px;flex-wrap:wrap;margin-top:6px\">';\n  html+='<span class=\"score-badge score-vert\">\ud83d\udfe2 '+parCouleur.vert+'</span>';\n  html+='<span class=\"score-badge score-bleu\">\ud83d\udd35 '+parCouleur.bleu+'</span>';\n  html+='<span class=\"score-badge score-jaune\">\ud83d\udfe1 '+parCouleur.jaune+'</span>';\n  html+='<span class=\"score-badge score-rouge\">\ud83d\udd34 '+parCouleur.rouge+'</span>';\n  html+='</div></div>';\n  html+='</div>';\n\n  /* \u2500\u2500 BARRE DE RECHERCHE \u2500\u2500 */\n  var q = searchQuery.trim().toLowerCase();\n  var motosFiltrees = q\n    ? G.motos.filter(function(m){\n        return m.pl.toLowerCase().includes(q)\n            || (m.vin||'').toLowerCase().includes(q)\n            || m.mk.toLowerCase().includes(q)\n            || m.md.toLowerCase().includes(q)\n            || (m.own||'').toLowerCase().includes(q);\n      })\n    : G.motos;\n\n  html+='<div style=\"margin-bottom:16px\">';\n  html+='<div style=\"position:relative\">';\n  html+='<span style=\"position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;pointer-events:none\">\ud83d\udd0d</span>';\n  html+='<input id=\"searchInput\" type=\"text\" ';\n  html+='placeholder=\"Rechercher par immatriculation, VIN, nom\u2026\" ';\n  html+='value=\"'+searchQuery.replace(/\"/g,'&quot;')+'\" ';\n  html+='oninput=\"searchQuery=this.value;render();setTimeout(function(){var el=document.getElementById(\\'searchInput\\');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}},0)\" ';\n  html+='style=\"width:100%;padding:11px 14px 11px 44px;border-radius:10px;border:1.5px solid var(--border);font-size:14px;color:var(--tx);background:#fff;outline:none;box-shadow:var(--sh)\" ';\n  html+='>';\n  html+='</div>';\n  if(q){\n    html+='<div style=\"margin-top:8px;font-size:12px;color:var(--tx3)\">';\n    html+=motosFiltrees.length+' r\u00e9sultat(s) pour \"<strong>'+searchQuery+'</strong>\" ';\n    html+='\u2014 <span onclick=\"searchQuery=\\'\\';render()\" style=\"color:var(--acc);cursor:pointer;font-weight:600\">\u2715 Effacer</span>';\n    html+='</div>';\n  }\n  html+='</div>';\n\n  /* \u2500\u2500 GRILLE MOTOS \u2500\u2500 */\n  html+='<div class=\"moto-grid\">';\n\n  if(q && motosFiltrees.length===0){\n    html+='<div style=\"grid-column:1/-1;text-align:center;padding:48px 20px;color:var(--tx3)\">';\n    html+='<div style=\"font-size:40px;margin-bottom:12px\">\ud83d\udd0d</div>';\n    html+='<div style=\"font-size:16px;font-weight:700;color:var(--tx2);margin-bottom:6px\">Aucune moto trouv\u00e9e</div>';\n    html+='<div style=\"font-size:13px\">Aucun r\u00e9sultat pour \"'+searchQuery+'\"</div>';\n    html+='</div>';\n  }\n\n  motosFiltrees.forEach(function(m){\n    var col=colHex(m.col);\n    var pct=Math.min(100,m.sc);\n    var lastInter=(m.hist&&m.hist[0])?m.hist[0].t:'Aucune intervention';\n    html+='<div class=\"moto-card'+(curMoto==m.id?' active':'')+'\" onclick=\"curMoto='+m.id+';goSec(\\'entretien\\',document.querySelector(\\'[data-sec=entretien]\\'))\">';\n    html+='<div class=\"mc-header\">';\n    html+='<div><div class=\"mc-mk\">'+m.mk+' '+m.md+'</div><div class=\"mc-md\">'+m.yr+' \u00b7 '+m.pl+'</div></div>';\n    html+='<div class=\"mc-score\"><div class=\"mc-score-num\" style=\"color:'+col+'\">'+m.sc+'</div><div class=\"mc-score-lbl\">/100</div></div>';\n    html+='</div>';\n    html+='<div class=\"mc-meta\">';\n    html+='<span class=\"mc-tag\">\ud83d\udccd '+fmtKm(m.km)+'</span>';\n    html+='<span class=\"mc-tag\">\ud83d\udc64 '+m.own+'</span>';\n    html+='<span class=\"score-badge score-'+m.col+'\">'+{vert:'\u2705 Excellent',bleu:'\ud83d\udd35 Bon',jaune:'\ud83d\udfe1 Moyen',rouge:'\ud83d\udd34 Insuffisant'}[m.col]+'</span>';\n    html+='</div>';\n    html+='<div class=\"mc-bar\"><div class=\"mc-bar-fill\" style=\"width:'+pct+'%;background:'+col+'\"></div></div>';\n    html+='<div class=\"mc-foot\"><span class=\"mc-own\">'+lastInter+'</span>';\n    html+='<button class=\"btn btn-ghost btn-sm\" onclick=\"event.stopPropagation();curMoto='+m.id+';openModal(\\'addInter\\')\">+ Intervention</button>';\n    html+='</div></div>';\n  });\n\n  /* Bouton ajouter \u2014 masqu\u00e9 pendant recherche */\n  if(!q){\n    html+='<div class=\"moto-card\" style=\"border-style:dashed;display:flex;align-items:center;justify-content:center;min-height:160px;cursor:pointer;\" onclick=\"openModal(\\'addMoto\\')\">';\n    html+='<div style=\"text-align:center;color:var(--tx3)\"><div style=\"font-size:32px;margin-bottom:8px\">\uff0b</div><div style=\"font-size:14px;font-weight:600\">Ajouter une moto</div></div>';\n    html+='</div>';\n  }\n  html+='</div>';\n\n  /* Derni\u00e8res interventions */\n  html+='<div style=\"margin-top:20px\"><div class=\"sec-header\"><div class=\"sec-title\">Derni\u00e8res interventions</div>';\n  html+='<button class=\"btn btn-ghost btn-sm\" onclick=\"goSec(\\'entretien\\',document.querySelector(\\'[data-sec=entretien]\\'))\">Voir tout \u2192</button></div>';\n  html+='<div class=\"inter-list\">';\n  var allInters=[];\n  G.motos.forEach(function(m){(m.hist||[]).forEach(function(h){allInters.push(Object.assign({},h,{motoNm:m.mk+' '+m.md,motoId:m.id}));});});\n  allInters.slice(0,5).forEach(function(h){\n    var col=colHex(h.ty);\n    html+='<div class=\"inter-item'+(h.isN?' inter-new':'')+'\">';\n    html+='<div class=\"inter-bar\" style=\"background:'+col+'\"></div>';\n    html+='<div class=\"inter-info\"><div class=\"inter-title\">'+h.t+'</div>';\n    html+='<div class=\"inter-meta\">'+h.tech+' \u00b7 '+h.d+' \u00b7 <span style=\"color:var(--tx3)\">'+h.motoNm+'</span></div></div>';\n    html+='<div class=\"inter-right\"><div class=\"inter-km\">'+fmtKm(h.km)+'</div>';\n    html+='<div class=\"inter-fraud\">\ud83d\udee1\ufe0f '+h.vf+'%</div></div>';\n    html+='</div>';\n  });\n  if(allInters.length===0) html+='<div class=\"empty\"><div class=\"empty-icon\">\ud83d\udccb</div><div class=\"empty-title\">Aucune intervention</div></div>';\n  html+='</div></div>';\n\n  return html;\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   MOTOS \u2014 Fiche d\u00e9taill\u00e9e\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction renderMotos(){\n  var m = getMoto(curMoto);\n  var col = colHex(m.col);\n\n  var html='';\n  /* S\u00e9lecteur de moto */\n  html+='<div class=\"sec-header\">';\n  html+='<div><select style=\"font-size:16px;font-weight:700;border:none;background:none;cursor:pointer;color:var(--tx);outline:none\" onchange=\"curMoto=parseInt(this.value);render()\">';\n  G.motos.forEach(function(mo){html+='<option value=\"'+mo.id+'\"'+(mo.id==curMoto?' selected':'')+'>'+mo.mk+' '+mo.md+' \u2014 '+mo.pl+'</option>';});\n  html+='</select></div>';\n  html+='<div style=\"display:flex;gap:8px\">';\n  html+='<button class=\"btn btn-ghost btn-sm\" onclick=\"openModal(\\'addInter\\')\">+ Intervention</button>';\n  html+='<button class=\"btn btn-primary btn-sm\" onclick=\"openModal(\\'addMoto\\')\">+ Nouvelle moto</button>';\n  html+='</div></div>';\n\n  /* Fiche */\n  html+='<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px\">';\n\n  /* Infos */\n  html+='<div class=\"card\"><div class=\"card-head\"><div class=\"card-title\">\ud83c\udfcd\ufe0f Identit\u00e9</div></div><div class=\"card-body\">';\n  html+='<div class=\"fiche-grid\">';\n  [['Marque',m.mk],['Mod\u00e8le',m.md],['Ann\u00e9e',m.yr],['Plaque',m.pl],['VIN',m.vin||'\u2014'],['Kilom\u00e9trage',fmtKm(m.km)],['Propri\u00e9taire',m.own]].forEach(function(r){\n    html+='<div class=\"info-row\"><div class=\"info-lbl\">'+r[0]+'</div><div class=\"info-val\">'+r[1]+'</div></div>';\n  });\n  html+='</div></div></div>';\n\n  /* Score */\n  html+='<div class=\"card\"><div class=\"card-head\"><div class=\"card-title\">\ud83d\udcca Score MotoKey</div></div><div class=\"card-body\">';\n  html+='<div style=\"display:flex;align-items:center;gap:20px;margin-bottom:16px\">';\n  html+='<div style=\"position:relative;width:90px;height:90px;flex-shrink:0\">';\n  var circ=2*Math.PI*38, offset=circ*(1-m.sc/100);\n  html+='<svg width=\"90\" height=\"90\" style=\"transform:rotate(-90deg)\"><circle cx=\"45\" cy=\"45\" r=\"38\" fill=\"none\" stroke=\"#e2e5eb\" stroke-width=\"7\"/><circle cx=\"45\" cy=\"45\" r=\"38\" fill=\"none\" stroke=\"'+col+'\" stroke-width=\"7\" stroke-dasharray=\"'+circ+'\" stroke-dashoffset=\"'+offset+'\" stroke-linecap=\"round\"/></svg>';\n  html+='<div style=\"position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center\">';\n  html+='<div style=\"font-size:24px;font-weight:900;color:'+col+'\">'+m.sc+'</div>';\n  html+='<div style=\"font-size:9px;color:var(--tx3)\">/100</div></div></div>';\n  html+='<div><span class=\"score-badge score-'+m.col+'\" style=\"font-size:13px;padding:6px 14px\">'+{vert:'\u2705 Excellent',bleu:'\ud83d\udd35 Bon',jaune:'\ud83d\udfe1 Moyen',rouge:'\ud83d\udd34 Insuffisant'}[m.col]+'</span>';\n  html+='<div style=\"font-size:12px;color:var(--tx3);margin-top:8px\">'+m.hist.length+' intervention(s) enregistr\u00e9e(s)</div>';\n  html+='<div style=\"font-size:12px;color:var(--tx3);margin-top:4px\">Certifi\u00e9es anti-fraude \ud83d\udee1\ufe0f</div></div></div>';\n  /* Barre types */\n  var types=[['vert','Concession','#16a34a'],['bleu','Pro','#2563eb'],['jaune','Proprio','#d97706'],['rouge','Rouge','#dc2626']];\n  html+='<div style=\"display:grid;grid-template-columns:repeat(4,1fr);gap:6px\">';\n  types.forEach(function(t){\n    var cnt=m.hist.filter(function(h){return h.ty===t[0];}).length;\n    html+='<div style=\"text-align:center;background:var(--bg);border-radius:8px;padding:8px 4px\">';\n    html+='<div style=\"font-size:18px;font-weight:900;color:'+t[2]+'\">'+cnt+'</div>';\n    html+='<div style=\"font-size:10px;color:var(--tx3)\">'+t[1]+'</div></div>';\n  });\n  html+='</div></div></div></div>';\n\n  /* Historique */\n  html+='<div class=\"card\"><div class=\"card-head\"><div class=\"card-title\">\ud83d\udccb Historique des interventions</div>';\n  html+='<button class=\"btn btn-primary btn-sm\" onclick=\"openModal(\\'addInter\\')\">\uff0b Ajouter</button></div>';\n  html+='<div class=\"card-body\"><div class=\"inter-list\">';\n  if(m.hist.length===0){\n    html+='<div class=\"empty\"><div class=\"empty-icon\">\ud83d\udccb</div><div class=\"empty-title\">Aucune intervention</div><div class=\"empty-sub\">Ajoutez la premi\u00e8re intervention de cette moto</div></div>';\n  }\n  m.hist.forEach(function(h){\n    var hcol=colHex(h.ty);\n    html+='<div class=\"inter-item'+(h.isN?' inter-new':'')+'\">';\n    html+='<div class=\"inter-bar\" style=\"background:'+hcol+'\"></div>';\n    html+='<div class=\"inter-info\"><div class=\"inter-title\">'+h.t+'</div>';\n    html+='<div class=\"inter-meta\">'+h.tech+' \u00b7 '+h.d+'</div>';\n    if(h.desc) html+='<div style=\"font-size:12px;color:var(--tx3);margin-top:2px\">'+h.desc+'</div>';\n    html+='</div>';\n    html+='<div class=\"inter-right\"><div class=\"inter-km\">'+fmtKm(h.km)+'</div>';\n    html+='<div class=\"inter-fraud\">\ud83d\udee1\ufe0f '+h.vf+'%</div>';\n    var tlab={vert:'Concession',bleu:'Pro valid\u00e9',jaune:'Propri\u00e9taire',rouge:'Non effectu\u00e9'}[h.ty]||h.ty;\n    html+='<div style=\"margin-top:4px\"><span class=\"score-badge score-'+h.ty+'\" style=\"font-size:10px\">'+tlab+'</span></div>';\n    html+='</div></div>';\n  });\n  html+='</div></div></div>';\n\n  /* \u2500\u2500 SECTION PNEUS \u2500\u2500 */\n  html += renderPneumatiques(m);\n\n  return html;\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   PNEUMATIQUES \u2014 Section int\u00e9gr\u00e9e \u00e0 la fiche moto\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction calcUsurePneu(kmMontage, kmActuel, kmMax) {\n  var kmFait = kmActuel - kmMontage;\n  var pct    = Math.min(100, Math.round((kmFait / kmMax) * 100));\n  var restant= Math.max(0, kmMax - kmFait);\n  var etat   = pct >= 90 ? 'critique' : pct >= 70 ? 'use' : pct >= 40 ? 'moyen' : 'bon';\n  return { pct, restant, kmFait, etat };\n}\n\nfunction renderPneumatiques(m) {\n  var html = '';\n  var km   = m.km || 0;\n\n  // Donn\u00e9es pneus de la moto (depuis l'API ou valeurs par d\u00e9faut)\n  var pneuAv = m.pneu_av   || null;\n  var pneuAr = m.pneu_ar   || null;\n  var kmMont = m.pneu_km_montage || 0;\n\n  // Kilom\u00e9trages moyens par type de pneu\n  var KM_MOYEN = {\n    'Michelin Road 6':      { av: 18000, ar: 15000 },\n    'Pirelli Diablo Rosso IV': { av: 8000, ar: 7500 },\n    'Bridgestone T32':      { av: 17000, ar: 14000 },\n    'Dunlop RoadSmart IV':  { av: 15000, ar: 12000 },\n    'Metzeler Sportec M9':  { av: 7000,  ar: 6000  },\n    'Pirelli Angel GT 2':   { av: 16000, ar: 14000 },\n    'default':              { av: 12000, ar: 10000 },\n  };\n\n  html += '<div class=\"card\" style=\"margin-top:14px\">';\n  html += '<div class=\"card-head\">';\n  html += '<div class=\"card-title\">\ud83d\udd35 Pneumatiques</div>';\n  html += '<button class=\"btn btn-ghost btn-sm\" onclick=\"openModalPneus('+JSON.stringify(m.id)+')\" >\u270f\ufe0f Mettre \u00e0 jour</button>';\n  html += '</div>';\n  html += '<div class=\"card-body\">';\n\n  // Si pas de pneus renseign\u00e9s\n  if (!pneuAv && !pneuAr) {\n    html += '<div class=\"empty\">';\n    html += '<div class=\"empty-icon\">\ud83d\udd35</div>';\n    html += '<div class=\"empty-title\">Pneus non renseign\u00e9s</div>';\n    html += '<div class=\"empty-sub\">Ajoutez les pneus montes pour suivre l\\'usure</div>';\n    html += '<button class=\"btn btn-primary btn-sm\" style=\"margin-top:12px\" onclick=\"openModalPneus('+JSON.stringify(m.id)+')\">+ Ajouter les pneus</button>';\n    html += '</div>';\n  } else {\n    // Afficher avant + arri\u00e8re\n    ['AV','AR'].forEach(function(pos) {\n      var pneu   = pos === 'AV' ? pneuAv : pneuAr;\n      var kmMax  = pos === 'AV'\n        ? (KM_MOYEN[pneu] || KM_MOYEN['default']).av\n        : (KM_MOYEN[pneu] || KM_MOYEN['default']).ar;\n      if (!pneu) return;\n      var usure  = calcUsurePneu(kmMont, km, kmMax);\n      var col    = usure.etat === 'critique' ? 'var(--rd)' :\n                   usure.etat === 'use'       ? 'var(--yw)' :\n                   usure.etat === 'moyen'     ? 'var(--acc)' : 'var(--gn)';\n      var lbl    = usure.etat === 'critique' ? '\ud83d\udd34 Remplacement urgent' :\n                   usure.etat === 'use'       ? '\ud83d\udfe1 \u00c0 surveiller' :\n                   usure.etat === 'moyen'     ? '\ud83d\udfe0 Usure normale' : '\ud83d\udfe2 Bon \u00e9tat';\n\n      html += '<div style=\"margin-bottom:16px;padding:14px;background:var(--bg);border-radius:10px;border:1px solid var(--border)\">';\n      html += '<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:10px\">';\n      html += '<div>';\n      html += '<div style=\"font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px;font-weight:600\">PNEU ' + pos + '</div>';\n      html += '<div style=\"font-size:15px;font-weight:700;color:var(--tx);margin-top:2px\">' + pneu + '</div>';\n      html += '</div>';\n      html += '<div style=\"text-align:right\">';\n      html += '<div style=\"font-size:24px;font-weight:900;color:' + col + '\">' + usure.pct + '%</div>';\n      html += '<div style=\"font-size:10px;color:var(--tx3)\">utilis\u00e9</div>';\n      html += '</div>';\n      html += '</div>';\n\n      // Barre d\\'usure visuelle\n      html += '<div style=\"height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:8px\">';\n      html += '<div style=\"height:100%;width:' + usure.pct + '%;background:' + col + ';border-radius:4px;transition:width .5s\"></div>';\n      html += '</div>';\n\n      // Infos\n      html += '<div style=\"display:flex;justify-content:space-between;font-size:12px;color:var(--tx3)\">';\n      html += '<span>' + lbl + '</span>';\n      html += '<span>~' + usure.restant.toLocaleString('fr-FR') + ' km restants</span>';\n      html += '</div>';\n\n      // Alerte si critique\n      if (usure.etat === 'critique') {\n        html += '<div style=\"margin-top:8px;background:var(--rdbg);border:1px solid var(--rdbd);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--rd);font-weight:600\">';\n        html += '\u26a0\ufe0f Remplacement imm\u00e9diat recommand\u00e9 \u2014 s\u00e9curit\u00e9 compromise';\n        html += '</div>';\n      }\n      html += '</div>';\n    });\n\n    // Infos montage\n    html += '<div style=\"font-size:11px;color:var(--tx3);margin-top:4px\">Mont\u00e9s au km ' + kmMont.toLocaleString('fr-FR') + ' \u00b7 km actuel ' + km.toLocaleString('fr-FR') + ' \u00b7 ' + (km-kmMont).toLocaleString('fr-FR') + ' km parcourus</div>';\n  }\n\n  // \u2500\u2500 PHOTOS PNEUS + ANALYSE IA \u2500\u2500\n  var photos = m.photos_pneus || [];\n  html += '<div style=\"margin-top:18px;border-top:1px solid var(--border);padding-top:16px\">';\n  html += '<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:10px\">';\n  html += '<div>';\n  html += '<div style=\"font-size:13px;font-weight:700;color:var(--tx)\">\ud83d\udcf8 Suivi photo + Analyse IA</div>';\n  html += '<div style=\"font-size:11px;color:var(--tx3);margin-top:2px\">Prenez une photo mensuelle \u2014 l\\'IA analyse l\\'usure automatiquement</div>';\n  html += '</div>';\n  html += '<button class=\"btn btn-primary btn-sm\" onclick=\"openPhotoUpload(' + JSON.stringify(m.id) + ')\">\ud83d\udcf7 Analyser</button>';\n  html += '</div>';\n\n  if (photos.length === 0) {\n    html += '<div style=\"text-align:center;padding:24px;background:var(--bg);border-radius:10px;border:1px dashed var(--border)\">';\n    html += '<div style=\"font-size:32px;margin-bottom:8px\">\ud83d\udcf7</div>';\n    html += '<div style=\"font-size:13px;font-weight:600;color:var(--tx2);margin-bottom:4px\">Aucune photo pour le moment</div>';\n    html += '<div style=\"font-size:12px;color:var(--tx3)\">Photographiez vos pneus une fois par mois</div>';\n    html += '<div style=\"font-size:12px;color:var(--tx3)\">L\\'IA MotoKey analyse l\\'usure et vous alerte</div>';\n    html += '</div>';\n  } else {\n    html += '<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px\">';\n    photos.forEach(function(p) {\n      var usureColor = p.usure_pct >= 80 ? 'var(--rd)' : p.usure_pct >= 60 ? 'var(--yw)' : 'var(--gn)';\n      html += '<div style=\"border-radius:10px;overflow:hidden;border:1px solid var(--border);background:var(--card)\">';\n      html += '<div style=\"position:relative\">';\n      html += '<img src=\"' + p.url + '\" style=\"width:100%;height:120px;object-fit:cover\">';\n      if (p.usure_pct !== undefined) {\n        html += '<div style=\"position:absolute;top:8px;right:8px;background:rgba(0,0,0,.7);color:#fff;border-radius:20px;padding:3px 9px;font-size:11px;font-weight:700\">';\n        html += p.usure_pct + '% us\u00e9</div>';\n      }\n      html += '</div>';\n      html += '<div style=\"padding:8px 10px\">';\n      html += '<div style=\"font-size:11px;font-weight:600;color:var(--tx2)\">' + (p.pos === 'av' ? 'Pneu Avant' : p.pos === 'ar' ? 'Pneu Arri\u00e8re' : 'AV + AR') + ' \u00b7 ' + (p.date||'') + '</div>';\n      if (p.analyse_ia) {\n        html += '<div style=\"font-size:11px;color:' + usureColor + ';margin-top:4px;font-weight:600\">\ud83e\udd16 ' + p.analyse_ia + '</div>';\n      }\n      if (p.note) {\n        html += '<div style=\"font-size:11px;color:var(--tx3);margin-top:2px\">' + p.note + '</div>';\n      }\n      html += '</div></div>';\n    });\n    html += '</div>';\n  }\n  html += '</div>';\n\n  html += '</div></div>';\n  return html;\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   ENTRETIEN\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction renderEntretien(){\n  var m = getMoto(curMoto);\n  var html='';\n\n  html+='<div class=\"sec-header\">';\n  html+='<div><select style=\"font-size:16px;font-weight:700;border:none;background:none;cursor:pointer;color:var(--tx);outline:none\" onchange=\"curMoto=parseInt(this.value);render()\">';\n  G.motos.forEach(function(mo){html+='<option value=\"'+mo.id+'\"'+(mo.id==curMoto?' selected':'')+'>'+mo.mk+' '+mo.md+'</option>';});\n  html+='</select></div>';\n  html+='<button class=\"btn btn-primary btn-sm\" onclick=\"openModal(\\'addInter\\')\">\uff0b Intervention</button>';\n  html+='</div>';\n\n  /* Alertes urgentes */\n  var alertes=m.plan.filter(function(op){var st=planStatut(op.kmlast,op.kmi,m.km);return st.s==='urgent'||st.s==='warning';});\n  if(alertes.length>0){\n    html+='<div style=\"background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px\">';\n    html+='<div style=\"font-size:20px\">\u26a0\ufe0f</div>';\n    html+='<div><div style=\"font-weight:700;color:#dc2626;font-size:14px\">'+alertes.length+' alerte(s) d\\'entretien</div>';\n    html+='<div style=\"font-size:12px;color:#b91c1c\">'+alertes.map(function(a){return a.nm;}).join(' \u00b7 ')+'</div></div></div>';\n  }\n\n  /* Plan */\n  html+='<div class=\"card\"><div class=\"card-head\"><div class=\"card-title\">\ud83d\udd27 Plan d\\'entretien \u2014 '+m.mk+' '+m.md+' '+m.yr+'</div><div style=\"font-size:12px;color:var(--tx3)\">'+fmtKm(m.km)+' actuels</div></div>';\n  html+='<div class=\"card-body\"><div class=\"plan-list\">';\n\n  m.plan.forEach(function(op){\n    var st=planStatut(op.kmlast,op.kmi,m.km);\n    var col={urgent:'#dc2626',warning:'#d97706',due:'#c2410c',ok:'#16a34a',future:'#9ba3b4'}[st.s]||'#888';\n    var stClass={urgent:'ps-urgent',warning:'ps-warning',due:'ps-due',ok:'ps-ok',future:'ps-future'}[st.s]||'ps-future';\n    var stLbl={urgent:'\ud83d\udd34 En retard',warning:'\ud83d\udfe1 \u00c0 planifier',due:'\ud83d\udfe0 \u00c0 pr\u00e9voir',ok:'\ud83d\udfe2 \u00c0 jour',future:'\u23f3 Future'}[st.s]||'';\n    var prochain=op.kmlast+op.kmi;\n    html+='<div class=\"plan-item\" style=\"border-left-color:'+col+'\">';\n    html+='<div class=\"plan-icon\">'+op.ic+'</div>';\n    html+='<div class=\"plan-info\"><div class=\"plan-name\">'+op.nm+'</div>';\n    html+='<div class=\"plan-detail\">'+op.prod+' \u00b7 '+op.th+'h \u00b7 Tous les '+fmtKm(op.kmi)+'</div>';\n    html+='<div class=\"plan-bar\"><div class=\"plan-bar-fill\" style=\"width:'+st.pct+'%;background:'+col+'\"></div></div>';\n    html+='<div style=\"font-size:11px;color:var(--tx3);margin-top:3px\">Prochain \u00e0 '+prochain.toLocaleString('fr-FR')+' km';\n    if(st.s!=='urgent') html+=' \u00b7 encore '+fmtKm(st.left);\n    html+='</div></div>';\n    html+='<div><span class=\"plan-status '+stClass+'\">'+stLbl+'</span></div>';\n    html+='</div>';\n  });\n\n  if(m.plan.length===0) html+='<div class=\"empty\"><div class=\"empty-icon\">\ud83d\udd27</div><div class=\"empty-title\">Plan d\\'entretien non disponible</div></div>';\n  html+='</div></div></div>';\n\n  /* Historique compact */\n  html+='<div class=\"card\" style=\"margin-top:14px\"><div class=\"card-head\"><div class=\"card-title\">\ud83d\udccb Interventions r\u00e9centes</div>';\n  html+='<button class=\"btn btn-ghost btn-sm\" onclick=\"goSec(\\'motos\\',document.querySelector(\\'[data-sec=motos]\\'))\">Voir fiche \u2192</button></div>';\n  html+='<div class=\"card-body\"><div class=\"inter-list\">';\n  m.hist.slice(0,4).forEach(function(h){\n    var hcol=colHex(h.ty);\n    html+='<div class=\"inter-item\"><div class=\"inter-bar\" style=\"background:'+hcol+'\"></div>';\n    html+='<div class=\"inter-info\"><div class=\"inter-title\">'+h.t+'</div><div class=\"inter-meta\">'+h.tech+' \u00b7 '+h.d+'</div></div>';\n    html+='<div class=\"inter-right\"><div class=\"inter-km\">'+fmtKm(h.km)+'</div><div class=\"inter-fraud\">\ud83d\udee1\ufe0f '+h.vf+'%</div></div>';\n    html+='</div>';\n  });\n  if(m.hist.length===0) html+='<div class=\"empty\"><div class=\"empty-icon\">\ud83d\udccb</div><div class=\"empty-title\">Aucune intervention</div></div>';\n  html+='</div></div></div>';\n\n  return html;\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   PNEUS\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction renderPneus(){\n  var html='';\n  html+='<div class=\"sec-header\"><div><div class=\"sec-title\">S\u00e9lecteur de pneus</div><div class=\"sec-sub\">Comparatif et prix 2026</div></div></div>';\n  html+='<div class=\"tire-grid\">';\n  G.tires.forEach(function(t){\n    html+='<div class=\"tire-card'+(t.reco?' reco':'')+'\">';\n    if(t.reco) html+='<div class=\"tire-reco-badge\">\u2b50 Recommand\u00e9</div>';\n    html+='<div class=\"tire-brand\">'+t.br+'</div>';\n    html+='<div class=\"tire-name\" style=\"color:'+t.col+'\">'+t.nm+'</div>';\n    html+='<div class=\"tire-type\">'+t.cat+'</div>';\n    html+='<div class=\"tire-stats\">';\n    [['Grip',t.grip],['Pluie',t.pluie],['Long\u00e9vit\u00e9',t.lv]].forEach(function(s){\n      html+='<div class=\"tire-stat\"><div class=\"tire-stat-val\" style=\"color:'+t.col+'\">'+s[1]+'</div><div class=\"tire-stat-lbl\">'+s[0]+'</div>';\n      html+='<div style=\"height:3px;background:var(--border);border-radius:2px;margin-top:4px;overflow:hidden\"><div style=\"height:100%;width:'+s[1]+'%;background:'+t.col+'\"></div></div>';\n      html+='</div>';\n    });\n    html+='</div>';\n    html+='<div class=\"tire-prices\">';\n    html+='<div class=\"tire-price\"><div class=\"tire-price-val\">'+fmtEur(t.pAv)+'</div><div class=\"tire-price-lbl\">Avant</div></div>';\n    html+='<div class=\"tire-price\"><div class=\"tire-price-val\">'+fmtEur(t.pAr)+'</div><div class=\"tire-price-lbl\">Arri\u00e8re</div></div>';\n    html+='<div class=\"tire-price\"><div class=\"tire-price-val\" style=\"color:var(--acc)\">'+fmtEur(t.pAv+t.pAr)+'</div><div class=\"tire-price-lbl\">Total</div></div>';\n    html+='</div>';\n    html+='<div style=\"margin-top:10px;font-size:11px;color:var(--tx3)\">Dur\u00e9e ~'+t.kmAv.toLocaleString('fr-FR')+' km AV / '+t.kmAr.toLocaleString('fr-FR')+' km AR</div>';\n    html+='</div>';\n  });\n  html+='</div>';\n  return html;\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   DEVIS\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction renderDevis(){\n  var m=getMoto(curMoto);\n  var lines=[\n    {type:'mo',desc:'Vidange + filtre huile',qty:0.8,pu:G.garage.tauxStd,total:0.8*G.garage.tauxStd},\n    {type:'fluide',desc:'Huile Yamalube 10W-40 \u00b7 3L',qty:3,pu:12.5,total:37.5},\n    {type:'piece',desc:'Filtre \u00e0 huile OEM',qty:1,pu:14.9,total:14.9}\n  ];\n  var sousTotal=lines.reduce(function(s,l){return s+l.total;},0);\n  var remise=sousTotal*0.1;\n  var base=sousTotal-remise;\n  var tva=base*(G.garage.tva/100);\n  var ttc=base+tva;\n\n  var html='';\n  html+='<div class=\"sec-header\"><div><div class=\"sec-title\">Devis & Factures</div><div class=\"sec-sub\">'+m.mk+' '+m.md+' \u00b7 '+m.pl+'</div></div>';\n  html+='<select style=\"padding:7px 12px;border-radius:9px;border:1.5px solid var(--border);font-size:13px;color:var(--tx);cursor:pointer\" onchange=\"curMoto=parseInt(this.value);render()\">';\n  G.motos.forEach(function(mo){html+='<option value=\"'+mo.id+'\"'+(mo.id==curMoto?' selected':'')+'>'+mo.mk+' '+mo.md+'</option>';});\n  html+='</select></div>';\n\n  html+='<div style=\"display:grid;grid-template-columns:1fr 340px;gap:14px\">';\n\n  /* Lignes */\n  html+='<div class=\"card\"><div class=\"card-head\"><div class=\"card-title\">Lignes du devis</div></div>';\n  html+='<div style=\"overflow:auto\"><table class=\"devis-table\">';\n  html+='<thead><tr><th>Description</th><th>Qt\u00e9</th><th>PU HT</th><th>Total HT</th></tr></thead><tbody>';\n  lines.forEach(function(l){\n    var icon={mo:'\ud83d\udd27',fluide:'\ud83d\udee2\ufe0f',piece:'\ud83d\udd29'}[l.type]||'\ud83d\udce6';\n    html+='<tr><td>'+icon+' '+l.desc+'</td><td>'+l.qty+(l.type==='mo'?' h':' u')+'</td><td>'+fmtEur(l.pu)+'</td><td style=\"font-weight:700\">'+fmtEur(l.total)+'</td></tr>';\n  });\n  html+='</tbody></table></div></div>';\n\n  /* Totaux */\n  html+='<div class=\"card\"><div class=\"card-head\"><div class=\"card-title\">R\u00e9capitulatif</div></div><div class=\"card-body\">';\n  [['Sous-total HT',fmtEur(sousTotal)],['Remise fid\u00e9lit\u00e9 10%','- '+fmtEur(remise)],['Base HT',fmtEur(base)],['TVA '+G.garage.tva+'%',fmtEur(tva)]].forEach(function(r){\n    html+='<div style=\"display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border2);font-size:13px\"><span style=\"color:var(--tx2)\">'+r[0]+'</span><span style=\"font-weight:600\">'+r[1]+'</span></div>';\n  });\n  html+='<div style=\"display:flex;justify-content:space-between;align-items:center;padding:12px;margin-top:8px;background:var(--tx);border-radius:10px\">';\n  html+='<span style=\"color:rgba(255,255,255,.7);font-size:14px;font-weight:600\">TOTAL TTC</span>';\n  html+='<span style=\"color:var(--acc);font-size:20px;font-weight:900\">'+fmtEur(ttc)+'</span></div>';\n  html+='<button class=\"btn btn-primary\" style=\"width:100%;margin-top:12px;justify-content:center\" onclick=\"toast(\\'\u2705 Devis valid\u00e9 \u00b7 Facture g\u00e9n\u00e9r\u00e9e\\')\">\u2705 Valider \u2192 Facture PDF</button>';\n  html+='</div></div>';\n  html+='</div>';\n  return html;\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   MODALS\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nfunction openModal(id){\n  var box=document.getElementById('modalBox');\n  var m=getMoto(curMoto);\n  if(id==='addMoto'){\n    box.innerHTML='<div class=\"modal-head\"><div class=\"modal-title\">\ud83c\udfcd\ufe0f Nouvelle moto</div><button class=\"modal-close\" onclick=\"closeModal()\">\u2715</button></div>'+\n    '<div class=\"modal-body\">'+\n    '<div class=\"field-row\"><div class=\"field\"><label>Marque</label><input id=\"nm_marque\" placeholder=\"Yamaha, Honda\u2026\"></div><div class=\"field\"><label>Mod\u00e8le</label><input id=\"nm_modele\" placeholder=\"MT-07, CB750\u2026\"></div></div>'+\n    '<div class=\"field-row\"><div class=\"field\"><label>Ann\u00e9e</label><input id=\"nm_annee\" type=\"number\" placeholder=\"2024\"></div><div class=\"field\"><label>Immatriculation</label><input id=\"nm_plaque\" placeholder=\"AB-123-CD\"></div></div>'+\n    '<div class=\"field\"><label>VIN (17 caract\u00e8res)</label>'+\n    '<div style=\"position:relative\">'+\n    '<input id=\"nm_vin\" placeholder=\"ex: JYARN22E00A000001\" maxlength=\"17\" '+\n    'oninput=\"this.value=this.value.toUpperCase();if(this.value.length===17)decodeVIN(this.value)\" '+\n    'style=\"padding-right:110px\">'+\n    '<div id=\"vin_status\" style=\"position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:700;color:var(--tx3)\">17 caract\u00e8res</div>'+\n    '</div></div>'+\n    '<div id=\"vin_result\" style=\"display:none;background:var(--gnbg);border:1px solid var(--gnbd);border-radius:9px;padding:12px;font-size:13px;color:var(--gn);margin-top:-6px\">'+\n    '\u2705 <span id=\"vin_info\"></span>'+\n    '</div>'+\n    '<div class=\"field-row\"><div class=\"field\"><label>Propri\u00e9taire</label><input id=\"nm_proprio\" placeholder=\"Nom complet\"></div><div class=\"field\"><label>Email</label><input id=\"nm_email\" type=\"email\" placeholder=\"client@email.com\"></div></div>'+\n    '<div class=\"field-row\"><div class=\"field\"><label>T\u00e9l\u00e9phone</label><input id=\"nm_tel\" placeholder=\"06 XX XX XX XX\"></div><div class=\"field\"><label>Kilom\u00e9trage</label><input id=\"nm_km\" type=\"number\" placeholder=\"0\"></div></div>'+\n    '</div>'+\n    '<div class=\"modal-foot\"><button class=\"btn btn-ghost\" onclick=\"closeModal()\">Annuler</button><button class=\"btn btn-primary\" onclick=\"saveMoto()\">Cr\u00e9er le dossier</button></div>';\n  }\n  else if(id==='addInter'){\n    window_itype='bleu';\n    var motoOptions=G.motos.map(function(mo){return '<option value=\"'+mo.id+'\"'+(mo.id==curMoto?' selected':'')+'>'+mo.mk+' '+mo.md+' \u2014 '+mo.pl+'</option>';}).join('');\n    var techOptions=G.garage.techniciens.map(function(t){return '<option>'+t+'</option>';}).join('');\n    box.innerHTML='<div class=\"modal-head\"><div class=\"modal-title\">\u26a1 Nouvelle intervention</div><button class=\"modal-close\" onclick=\"closeModal()\">\u2715</button></div>'+\n    '<div class=\"modal-body\">'+\n    '<div class=\"field\"><label>Moto</label><select id=\"im\" class=\"field select\">'+motoOptions+'</select></div>'+\n    '<div class=\"field\"><label>Type d\\'intervention</label>'+\n    '<div class=\"type-grid\">'+\n    '<div id=\"itype_vert\" class=\"type-btn type-vert\" onclick=\"selectType(\\'vert\\')\">\ud83d\udfe2 Concession<br><span style=\"font-size:10px;opacity:.7\">+12 pts</span></div>'+\n    '<div id=\"itype_bleu\" class=\"type-btn type-bleu sel\" onclick=\"selectType(\\'bleu\\')\">\ud83d\udd35 Pro valid\u00e9<br><span style=\"font-size:10px;opacity:.7\">+8 pts</span></div>'+\n    '<div id=\"itype_jaune\" class=\"type-btn type-jaune\" onclick=\"selectType(\\'jaune\\')\">\ud83d\udfe1 Propri\u00e9taire<br><span style=\"font-size:10px;opacity:.7\">+5 pts</span></div>'+\n    '<div id=\"itype_rouge\" class=\"type-btn type-rouge\" onclick=\"selectType(\\'rouge\\')\">\ud83d\udd34 Non effectu\u00e9<br><span style=\"font-size:10px;opacity:.7\">-5 pts</span></div>'+\n    '</div></div>'+\n    '<div class=\"field\"><label>Description</label><input id=\"idesc\" placeholder=\"Vidange, courroie, freins, pneus\u2026\" oninput=\"checkPneuSection()\"></div>'+'<div id=\"pneu_section\" style=\"display:none;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;margin-top:-6px\">'+'<div style=\"font-size:12px;font-weight:700;color:var(--tx2);margin-bottom:10px\">\ud83d\udd35 D\u00e9tails changement de pneus</div>'+'<div class=\"field-row\">'+'<div class=\"field\"><label>Pneu Avant</label><select id=\"inter_pn_av\" class=\"field select\">'+'<option value=\"\">\u2014 Sans changement \u2014</option>'+['Michelin Road 6','Pirelli Diablo Rosso IV','Bridgestone T32','Dunlop RoadSmart IV','Metzeler Sportec M9 RR','Pirelli Angel GT 2'].map(function(p){return '<option>'+p+'</option>';}).join('')+'</select></div>'+'<div class=\"field\"><label>Pneu Arri\u00e8re</label><select id=\"inter_pn_ar\" class=\"field select\">'+'<option value=\"\">\u2014 Sans changement \u2014</option>'+['Michelin Road 6','Pirelli Diablo Rosso IV','Bridgestone T32','Dunlop RoadSmart IV','Metzeler Sportec M9 RR','Pirelli Angel GT 2'].map(function(p){return '<option>'+p+'</option>';}).join('')+'</select></div>'+'</div>'+'<div style=\"font-size:11px;color:var(--tx3)\">\ud83d\udcf8 Apr\u00e8s la pose, allez dans la fiche moto pour ajouter une photo et analyser l\\'usure par IA</div>'+'</div>'+\n    '<div class=\"field-row\">'+\n    '<div class=\"field\"><label>Kilom\u00e9trage</label><input id=\"ikm\" type=\"number\" placeholder=\"'+m.km+'\"></div>'+\n    '<div class=\"field\"><label>Technicien</label><select id=\"itech\">'+techOptions+'</select></div>'+\n    '</div>'+\n    '<div style=\"background:var(--blbg);border:1px solid var(--blbd);border-radius:9px;padding:10px 12px;font-size:12px;color:var(--bl)\">\u26a1 Synchronis\u00e9e instantan\u00e9ment sur l\\'app client</div>'+\n    '</div>'+\n    '<div class=\"modal-foot\"><button class=\"btn btn-ghost\" onclick=\"closeModal()\">Annuler</button><button class=\"btn btn-primary\" onclick=\"saveInter()\">Enregistrer</button></div>';\n  }\n  document.getElementById('modalOverlay').classList.add('open');\n}\n\nfunction closeModal(){\n  document.getElementById('modalOverlay').classList.remove('open');\n}\n\n/* \u2500\u2500 Modal mise \u00e0 jour pneus \u2500\u2500 */\nfunction openModalPneus(motoId) {\n  var m   = getMoto(motoId);\n  var box = document.getElementById('modalBox');\n  var pneus = ['Michelin Road 6','Pirelli Diablo Rosso IV','Bridgestone T32','Dunlop RoadSmart IV','Metzeler Sportec M9 RR','Pirelli Angel GT 2','Autre'];\n  var opts  = pneus.map(function(p){ return '<option'+(m.pneu_av===p?' selected':'')+'>'+p+'</option>'; }).join('');\n  box.innerHTML =\n    '<div class=\"modal-head\"><div class=\"modal-title\">\ud83d\udd35 Mettre \u00e0 jour les pneus</div><button class=\"modal-close\" onclick=\"closeModal()\">\u2715</button></div>'+\n    '<div class=\"modal-body\">'+\n    '<div class=\"field\"><label>Pneu Avant</label><select id=\"pn_av\" class=\"field select\"><option value=\"\">\u2014 Non renseign\u00e9 \u2014</option>'+opts+'</select></div>'+\n    '<div class=\"field\"><label>Pneu Arri\u00e8re</label><select id=\"pn_ar\" class=\"field select\"><option value=\"\">\u2014 Non renseign\u00e9 \u2014</option>'+opts.replace(/selected/g,'')+'</select></div>'+\n    '<div class=\"field\"><label>Kilom\u00e9trage au montage</label><input id=\"pn_km\" type=\"number\" value=\"'+(m.pneu_km_montage||m.km||0)+'\" placeholder=\"km actuels lors du montage\"></div>'+\n    '<div style=\"background:var(--blbg);border:1px solid var(--blbd);border-radius:9px;padding:10px 12px;font-size:12px;color:var(--bl)\">\ud83d\udca1 Le % d\\'usure est calcul\u00e9 automatiquement selon les km parcourus depuis le montage</div>'+\n    '</div>'+\n    '<div class=\"modal-foot\"><button class=\"btn btn-ghost\" onclick=\"closeModal()\">Annuler</button><button class=\"btn btn-primary\" onclick=\"savePneus('+JSON.stringify(motoId)+')\">Enregistrer</button></div>';\n  document.getElementById('modalOverlay').classList.add('open');\n}\n\nfunction savePneus(motoId) {\n  var m   = getMoto(motoId);\n  var av  = document.getElementById('pn_av').value;\n  var ar  = document.getElementById('pn_ar').value;\n  var km  = parseInt(document.getElementById('pn_km').value) || m.km;\n  m.pneu_av          = av  || null;\n  m.pneu_ar          = ar  || null;\n  m.pneu_km_montage  = km;\n  // Sauvegarder via API\n  apiCall('PUT','/motos/'+motoId,{pneu_av:av,pneu_ar:ar,pneu_km_montage:km});\n  closeModal();\n  toast('\u2705 Pneus mis \u00e0 jour');\n  render();\n}\n\n/* \u2500\u2500 Upload photo pneu \u2500\u2500 */\nfunction openPhotoUpload(motoId) {\n  var box = document.getElementById('modalBox');\n  var today = new Date().toLocaleDateString('fr-FR');\n  box.innerHTML =\n    '<div class=\"modal-head\"><div class=\"modal-title\">\ud83d\udcf8 Ajouter une photo pneu</div><button class=\"modal-close\" onclick=\"closeModal()\">\u2715</button></div>'+\n    '<div class=\"modal-body\">'+\n    '<div style=\"text-align:center;padding:20px;border:2px dashed var(--border);border-radius:12px;cursor:pointer\" onclick=\"document.getElementById(\\'pn_photo\\').click()\">'+\n    '<div style=\"font-size:40px;margin-bottom:8px\">\ud83d\udcf7</div>'+\n    '<div style=\"font-size:14px;font-weight:600;color:var(--tx2)\">Cliquer pour choisir une photo</div>'+\n    '<div style=\"font-size:12px;color:var(--tx3);margin-top:4px\">JPG, PNG \u2014 max 5 Mo</div>'+\n    '</div>'+\n    '<input type=\"file\" id=\"pn_photo\" accept=\"image/*\" style=\"display:none\" onchange=\"previewPhoto(this)\">'+\n    '<div id=\"pn_preview\" style=\"display:none;margin-top:10px;text-align:center\">'+\n    '<img id=\"pn_img\" style=\"max-width:100%;border-radius:10px;max-height:200px;object-fit:cover\">'+\n    '</div>'+\n    '<div class=\"field\"><label>Position</label>'+\n    '<select id=\"pn_pos\" class=\"field select\"><option value=\"av\">Avant</option><option value=\"ar\">Arri\u00e8re</option><option value=\"les_deux\">Les deux</option></select></div>'+\n    '<div class=\"field\"><label>Date</label><input id=\"pn_date\" type=\"text\" value=\"'+today+'\"></div>'+\n    '<div class=\"field\"><label>Note (optionnel)</label><input id=\"pn_note\" placeholder=\"ex: bord d\\'usure atteint c\u00f4t\u00e9 gauche\"></div>'+\n    '</div>'+\n    '<div class=\"modal-foot\"><button class=\"btn btn-ghost\" onclick=\"closeModal()\">Annuler</button><button class=\"btn btn-primary\" onclick=\"savePhoto('+JSON.stringify(motoId)+')\">Sauvegarder</button></div>';\n  document.getElementById('modalOverlay').classList.add('open');\n}\n\nfunction previewPhoto(input) {\n  if (!input.files || !input.files[0]) return;\n  var reader = new FileReader();\n  reader.onload = function(e) {\n    var img = document.getElementById('pn_img');\n    var prev = document.getElementById('pn_preview');\n    if(img) img.src = e.target.result;\n    if(prev) prev.style.display = 'block';\n  };\n  reader.readAsDataURL(input.files[0]);\n}\n\nasync function savePhoto(motoId) {\n  var input = document.getElementById('pn_photo');\n  var date  = document.getElementById('pn_date').value;\n  var pos   = document.getElementById('pn_pos').value;\n  var note  = document.getElementById('pn_note').value;\n  var m     = getMoto(motoId);\n  if(!input.files || !input.files[0]) { toast('\u26a0\ufe0f S\u00e9lectionnez une photo'); return; }\n\n  var btn = document.querySelector('#modalBox .btn-primary');\n  if(btn){ btn.textContent='\ud83e\udd16 Analyse IA\u2026'; btn.disabled=true; }\n\n  var reader = new FileReader();\n  reader.onload = async function(e) {\n    var dataUrl   = e.target.result;\n    var base64    = dataUrl.split(',')[1];\n    var mimeType  = dataUrl.split(';')[0].split(':')[1];\n\n    // Analyse IA via Anthropic API\n    var analyseIA  = null;\n    var usurePct   = null;\n\n    try {\n      var resp = await fetch('https://api.anthropic.com/v1/messages', {\n        method: 'POST',\n        headers: {\n          'Content-Type':      'application/json',\n          'anthropic-version': '2023-06-01',\n          'anthropic-dangerous-direct-browser-access': 'true',\n        },\n        body: JSON.stringify({\n          model: 'claude-sonnet-4-20250514',\n          max_tokens: 200,\n          messages: [{\n            role: 'user',\n            content: [\n              {\n                type: 'image',\n                source: { type: 'base64', media_type: mimeType, data: base64 }\n              },\n              {\n                type: 'text',\n                text: 'Analyse ce pneu de moto. R\u00e9ponds UNIQUEMENT en JSON: {\"usure_pct\": <0-100>, \"etat\": \"<bon|moyen|use|critique>\", \"message\": \"<conseil court en fran\u00e7ais max 15 mots>\", \"remplacement_urgent\": <true|false>}'\n              }\n            ]\n          }]\n        })\n      });\n\n      if (resp.ok) {\n        var data = await resp.json();\n        var txt  = data.content[0].text.trim();\n        try {\n          var clean  = txt.replace(/```json|```/g,'').trim();\n          var result = JSON.parse(clean);\n          usurePct  = result.usure_pct;\n          analyseIA = result.message;\n          if(result.remplacement_urgent){\n            toast('\ud83d\udea8 IA : Remplacement urgent du pneu recommand\u00e9 !');\n          }\n        } catch(e2) {\n          analyseIA = txt.slice(0,80);\n        }\n      }\n    } catch(e) {\n      console.warn('Analyse IA \u00e9chou\u00e9e:', e.message);\n      analyseIA = 'Analyse IA non disponible';\n    }\n\n    if(!m.photos_pneus) m.photos_pneus = [];\n    m.photos_pneus.unshift({\n      url:       dataUrl,\n      date:      date,\n      pos:       pos,\n      note:      note,\n      usure_pct: usurePct,\n      analyse_ia: analyseIA\n    });\n\n    closeModal();\n    toast('\ud83d\udcf8 Photo analys\u00e9e \u00b7 ' + (analyseIA || 'Photo ajout\u00e9e'));\n    render();\n  };\n  reader.readAsDataURL(input.files[0]);\n}\n\nfunction selectType(type){\n  window_itype=type;\n  ['vert','bleu','jaune','rouge'].forEach(function(t){\n    var el=document.getElementById('itype_'+t);\n    if(el) el.classList.remove('sel');\n  });\n  var sel=document.getElementById('itype_'+type);\n  if(sel) sel.classList.add('sel');\n  // Afficher section pneus si description contient \"pneu\"\n  checkPneuSection();\n}\n\nfunction checkPneuSection(){\n  var desc = (document.getElementById('idesc')||{value:''}).value.toLowerCase();\n  var show = desc.includes('pneu') || desc.includes('pneuma') || desc.includes('gomme');\n  var section = document.getElementById('pneu_section');\n  if(section) section.style.display = show ? 'block' : 'none';\n}\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   API\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nvar API_URL=(window.location.protocol==='file:')\n  ?'https://motokey-api-10-production.up.railway.app'\n  :window.location.origin;\nvar API_TOKEN='';\n\nasync function apiLogin(email,password,role){\n  try{\n    var r=await fetch(API_URL+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,role})});\n    var data=await r.json();\n    if(data.success){API_TOKEN=data.data.token;return data.data;}\n  }catch(e){console.warn('API offline');}\n}\n\nasync function apiCall(method,path,body){\n  try{\n    var opts={method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+API_TOKEN}};\n    if(body) opts.body=JSON.stringify(body);\n    var r=await fetch(API_URL+path,opts);\n    return await r.json();\n  }catch(e){return null;}\n}\n\n/* Chargement des vraies motos depuis l'API */\nasync function loadFromAPI(){\n  var res=await apiCall('GET','/motos');\n  if(res&&res.success&&res.data&&res.data.motos&&res.data.motos.length>0){\n    var apiMotos=res.data.motos;\n    var mapped=await Promise.all(apiMotos.map(async function(mo){\n      var ints=await apiCall('GET','/motos/'+mo.id+'/interventions');\n      var hist=(ints&&ints.success&&ints.data&&ints.data.interventions)||[];\n      return {\n        id:mo.id, mk:mo.marque, md:mo.modele, yr:mo.annee,\n        pl:mo.plaque, vin:mo.vin, km:mo.km, own:mo.client_nom||mo.client||'\u2014',\n        col:mo.couleur_dossier||'rouge', sc:mo.score||0,\n        hist:hist.map(function(h){return {t:h.titre,d:h.date_intervention,km:h.km,ty:h.type,tech:h.technicien||'\u2014',desc:h.description||'',vf:h.score_confiance||0};}),\n        plan:[]\n      };\n    }));\n    G.motos=mapped;\n    curMoto=mapped[0]?mapped[0].id:curMoto;\n    render();\n    toast('\u2705 '+mapped.length+' moto(s) charg\u00e9e(s) depuis la base');\n  }\n}\n\n/* Indicateur API */\n(async function(){\n  try{\n    var r=await fetch(API_URL+'/');\n    if(r.ok){\n      var pill=document.createElement('div');\n      pill.className='api-pill';\n      pill.innerHTML='<div class=\"api-dot\"></div>API Railway \u2713';\n      document.getElementById('apiStatus').appendChild(pill);\n      var sess=await apiLogin('garage@motokey.fr','motokey2026','garage');\n      if(sess) await loadFromAPI();\n    }\n  }catch(e){}\n})();\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   SAUVEGARDE\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n/* \u2550\u2550 D\u00c9CODAGE VIN AUTOMATIQUE \u2550\u2550 */\n\n// Base locale motos courantes par WMI + mod\u00e8le\nvar VIN_DB = {\n  // Yamaha\n  'JYA': {marque:'Yamaha', modeles:{'MT':'MT-07','R1':'YZF-R1','R6':'YZF-R6','TE':'T\u00e9n\u00e9r\u00e9','TR':'Tracer'}},\n  'JYE': {marque:'Yamaha', modeles:{}},\n  // Honda\n  'JH2': {marque:'Honda',  modeles:{'CB':'CB500F','VF':'VFR800','NC':'NC750X','AF':'Africa Twin','PC':'CB1000R'}},\n  'JH3': {marque:'Honda',  modeles:{}},\n  // Kawasaki\n  'JKA': {marque:'Kawasaki',modeles:{'ZR':'Z900','ZX':'Ninja','VN':'Vulcan','KL':'KLX'}},\n  'JKB': {marque:'Kawasaki',modeles:{}},\n  'JKC': {marque:'Kawasaki',modeles:{}},\n  // Suzuki\n  'JS1': {marque:'Suzuki', modeles:{'GS':'GSX-S750','DL':'V-Strom','SV':'SV650'}},\n  'JS2': {marque:'Suzuki', modeles:{}},\n  // Ducati\n  'ZDM': {marque:'Ducati', modeles:{'MS':'Monster','MU':'Multistrada','PA':'Panigale','SC':'Scrambler'}},\n  'ZD4': {marque:'Ducati', modeles:{}},\n  // BMW\n  'WB1': {marque:'BMW',    modeles:{'01':'R1250GS','04':'F900R','09':'S1000RR','10':'F850GS'}},\n  'WB3': {marque:'BMW',    modeles:{}},\n  // KTM\n  'VBK': {marque:'KTM',    modeles:{'3D':'390 Duke','7D':'790 Duke','9D':'990 Duke','12':'1290 Super'}},\n  // Triumph\n  'SMT': {marque:'Triumph',modeles:{'DA':'Daytona','ST':'Street Triple','TI':'Tiger','TH':'Thunderbird'}},\n  // Harley-Davidson\n  '1HD': {marque:'Harley-Davidson',modeles:{'1K':'Sportster','1L':'Softail','1Y':'Touring'}},\n  // Royal Enfield\n  'ME3': {marque:'Royal Enfield',modeles:{'E3':'Meteor 350','E5':'Classic 350','E6':'Himalayan'}},\n  // Aprilia\n  'ZAP': {marque:'Aprilia',modeles:{'RS':'RSV4','TU':'Tuono','SX':'SX 125'}},\n  // Moto Guzzi\n  'ZGU': {marque:'Moto Guzzi',modeles:{'V7':'V7','V9':'V9','V1':'V100'}},\n};\n\nasync function decodeVIN(vin) {\n  var statusEl = document.getElementById('vin_status');\n  var resultEl = document.getElementById('vin_result');\n  var infoEl   = document.getElementById('vin_info');\n  if(!statusEl) return;\n\n  // Compteur de caract\u00e8res\n  statusEl.textContent = vin.length+'/17';\n  statusEl.style.color = vin.length===17 ? 'var(--acc)' : 'var(--tx3)';\n  if(vin.length !== 17){ if(resultEl) resultEl.style.display='none'; return; }\n\n  statusEl.textContent = '\ud83d\udd0d D\u00e9codage\u2026';\n  statusEl.style.color = 'var(--acc)';\n\n  // 1. D\u00e9codage local par WMI\n  var wmi   = vin.substring(0,3).toUpperCase();\n  var local = VIN_DB[wmi];\n\n  // 2. Ann\u00e9e depuis le 10\u00e8me caract\u00e8re du VIN\n  var anneeChar = vin.charAt(9).toUpperCase();\n  var anneeMap  = {'A':2010,'B':2011,'C':2012,'D':2013,'E':2014,'F':2015,'G':2016,'H':2017,'J':2018,'K':2019,'L':2020,'M':2021,'N':2022,'P':2023,'R':2024,'S':2025,'T':2026,'V':2027};\n  var annee = anneeMap[anneeChar] || null;\n\n  // 3. Essayer NHTSA API\n  try {\n    var r = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/'+vin+'?format=json');\n    var data = await r.json();\n    var results = data.Results || [];\n    function getVal(v){ var i=results.find(function(x){return x.Variable===v;}); return (i&&i.Value&&i.Value!=='Not Applicable'&&i.Value!==null&&i.Value!=='')?i.Value:null; }\n\n    var make  = getVal('Make');\n    var model = getVal('Model');\n    var year  = getVal('Model Year');\n    var body  = getVal('Body Class') || '';\n    var disp  = getVal('Displacement (CC)') || '';\n    var type  = getVal('Motorcycle Model') || model;\n\n    // Utiliser NHTSA si donn\u00e9es compl\u00e8tes, sinon local\n    var finalMake  = make  || (local ? local.marque : null);\n    var finalModel = model || null;\n    var finalYear  = year  || (annee ? String(annee) : null);\n\n    if(finalMake) {\n      // Remplir les champs\n      var fMk = document.getElementById('nm_marque');\n      var fMd = document.getElementById('nm_modele');\n      var fYr = document.getElementById('nm_annee');\n      if(fMk) fMk.value = capFirst(finalMake);\n      if(fMd && finalModel) fMd.value = capFirst(finalModel);\n      if(fYr && finalYear)  fYr.value = finalYear;\n\n      // Message r\u00e9sultat\n      statusEl.textContent = '\u2705 D\u00e9cod\u00e9';\n      statusEl.style.color = 'var(--gn)';\n      if(resultEl) resultEl.style.display = 'block';\n      var desc = capFirst(finalMake);\n      if(finalModel) desc += ' ' + capFirst(finalModel);\n      if(finalYear)  desc += ' ' + finalYear;\n      if(disp)       desc += ' \u00b7 ' + disp + ' cc';\n      if(infoEl) infoEl.textContent = desc;\n\n      // Si mod\u00e8le vide, mettre le focus dessus\n      var fMd2 = document.getElementById('nm_modele');\n      if(fMd2 && !finalModel) {\n        fMd2.placeholder = 'Mod\u00e8le non trouv\u00e9 \u2014 saisir manuellement';\n        fMd2.focus();\n      }\n    } else {\n      statusEl.textContent = '\u2753 VIN inconnu';\n      statusEl.style.color = 'var(--tx3)';\n      if(resultEl) resultEl.style.display = 'none';\n    }\n\n  } catch(e) {\n    // Fallback 100% local si pas d'internet\n    if(local) {\n      var fMk2 = document.getElementById('nm_marque');\n      var fYr2 = document.getElementById('nm_annee');\n      if(fMk2) fMk2.value = local.marque;\n      if(fYr2 && annee) fYr2.value = String(annee);\n      statusEl.textContent = '\u26a0\ufe0f Hors ligne \u2014 partiel';\n      statusEl.style.color = 'var(--yw)';\n      if(resultEl) resultEl.style.display = 'block';\n      if(infoEl) infoEl.textContent = local.marque + (annee ? ' \u00b7 ' + annee : '') + ' (compl\u00e9ter le mod\u00e8le)';\n      var fMd3 = document.getElementById('nm_modele');\n      if(fMd3) fMd3.focus();\n    } else {\n      statusEl.textContent = '\u274c Erreur r\u00e9seau';\n      statusEl.style.color = 'var(--rd)';\n    }\n  }\n}\n\nfunction capFirst(s) {\n  if(!s) return '';\n  s = s.trim();\n  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();\n}\n\nasync function saveMoto(){\n  var marque=(document.getElementById('nm_marque')||{value:''}).value.trim();\n  var modele=(document.getElementById('nm_modele')||{value:''}).value.trim();\n  var annee=parseInt((document.getElementById('nm_annee')||{value:2024}).value)||2024;\n  var plaque=(document.getElementById('nm_plaque')||{value:''}).value.trim().toUpperCase();\n  var vin=(document.getElementById('nm_vin')||{value:''}).value.trim().toUpperCase();\n  var proprio=(document.getElementById('nm_proprio')||{value:''}).value.trim();\n  var email=(document.getElementById('nm_email')||{value:''}).value.trim();\n  var tel=(document.getElementById('nm_tel')||{value:''}).value.trim();\n  var km=parseInt((document.getElementById('nm_km')||{value:0}).value)||0;\n  if(!marque||!modele||!plaque||!vin||!proprio){toast('\u26a0\ufe0f Champs requis : marque, mod\u00e8le, plaque, VIN, propri\u00e9taire');return;}\n  if(vin.length!==17){toast('\u26a0\ufe0f VIN = 17 caract\u00e8res exactement');return;}\n  var btn=document.querySelector('#modalBox .btn-primary');\n  if(btn){btn.textContent='Cr\u00e9ation\u2026';btn.disabled=true;}\n  var result=await apiCall('POST','/motos',{marque,modele,annee,plaque,vin,km,client_nom:proprio,client_email:email||null,client_tel:tel||null});\n  if(result&&result.success){\n    var nm=result.data.moto,nc=result.data.client;\n    G.motos.push({id:nm.id,mk:nm.marque,md:nm.modele,yr:nm.annee,pl:nm.plaque,vin:nm.vin,km:nm.km,own:nc?nc.nom:proprio,col:'rouge',sc:0,hist:[],plan:[]});\n    closeModal();\n    toast('\u2705 '+marque+' '+modele+' cr\u00e9\u00e9e pour '+proprio);\n    render();\n  }else{\n    toast('\u274c '+(result&&result.error?result.error.message:'Erreur API'));\n    if(btn){btn.textContent='Cr\u00e9er le dossier';btn.disabled=false;}\n  }\n}\n\nasync function saveInter(){\n  var motoId=(document.getElementById('im')||{value:curMoto}).value||curMoto;\n  var desc=(document.getElementById('idesc')||{value:'Intervention'}).value||'Intervention';\n  var km=parseInt((document.getElementById('ikm')||{value:0}).value)||0;\n  var ty=window_itype||'bleu';\n  // R\u00e9cup\u00e9rer les pneus si renseign\u00e9s\n  var pnAv=(document.getElementById('inter_pn_av')||{value:''}).value||'';\n  var pnAr=(document.getElementById('inter_pn_ar')||{value:''}).value||'';\n  if(pnAv||pnAr){\n    var m=G.motos.find(function(x){return x.id==motoId;})||getMoto(curMoto);\n    if(pnAv) m.pneu_av=pnAv;\n    if(pnAr) m.pneu_ar=pnAr;\n    m.pneu_km_montage=km||m.km;\n    apiCall('PUT','/motos/'+motoId,{pneu_av:pnAv||m.pneu_av,pneu_ar:pnAr||m.pneu_ar,pneu_km_montage:km||m.km});\n  }\n  var btn=document.querySelector('#modalBox .btn-primary');\n  if(btn){btn.textContent='Enregistrement\u2026';btn.disabled=true;}\n  var result=await apiCall('POST','/motos/'+motoId+'/interventions',{type:ty,titre:desc,description:desc,km:km,montant_ht:0});\n  var m=G.motos.find(function(x){return x.id==motoId;})||getMoto(curMoto);\n  var today=new Date();\n  var ds=String(today.getDate()).padStart(2,'0')+'/'+String(today.getMonth()+1).padStart(2,'0')+'/'+today.getFullYear();\n  if(result&&result.success){\n    m.hist.unshift({t:desc,d:ds,km:km||m.km,ty:ty,tech:'J.-M. Duval',desc:desc,vf:result.data.intervention.score_confiance||85,isN:true});\n    if(km>m.km) m.km=km;\n    m.sc=result.data.nouveau_score||m.sc;\n    m.col=result.data.nouvelle_couleur||m.col;\n    closeModal();\n    toast('\u26a1 Intervention enregistr\u00e9e \u00b7 Score mis \u00e0 jour');\n  }else{\n    m.hist.unshift({t:desc,d:ds,km:km||m.km,ty:ty,tech:'J.-M. Duval',desc:desc,vf:85,isN:true});\n    if(km>m.km) m.km=km;\n    var pts={vert:12,bleu:8,jaune:5,rouge:-5}[ty]||0;\n    m.sc=Math.max(0,Math.min(100,m.sc+pts));\n    if(m.km<10000&&m.sc<70) m.sc=Math.min(100,m.sc+20);\n    m.col=m.sc>=80?'vert':m.sc>=60?'bleu':m.sc>=40?'jaune':'rouge';\n    closeModal();\n    toast('\u26a1 Intervention enregistr\u00e9e (mode local)');\n  }\n  render();\n}\n\n/* \u2550\u2550 INIT \u2550\u2550 */\nrender();\n</script>\n</body>\n</html>\n";

function getAppHTML() {
  // Essayer le fichier local en priorité (plus récent si déployé)
  try {
    const _fs   = require('fs');
    const _path = require('path');
    const local = _fs.readFileSync(_path.join(__dirname, 'MotoKey_App.html'), 'utf8');
    if (local && local.length > 10000) return local;
  } catch(e) {}
  // Fallback : HTML embarqué dans l'API
  return _EMBEDDED_HTML;
}

console.log('✅ Route /app — HTML embarqué (' + _EMBEDDED_HTML.length + ' chars)');

const server = http.createServer(async function(req, res){
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/+$/,'') || '/';
  const method   = req.method.toUpperCase();
  const query    = parsed.query;

  if(method==='OPTIONS'){
    res.writeHead(200,{
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type,Authorization',
      'Content-Length':'0'
    });
    res.end();
    return;
  }

  // ── Servir l'app HTML sur /app
  if((pathname==='/'||pathname==='/app') && method==='GET'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Cache-Control':'no-cache, no-store, must-revalidate','Pragma':'no-cache','Expires':'0'});
    res.end(getAppHTML());
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

    // ── Supabase path ──
    if (USE_SUPABASE && SBLayer) {
      try {
        if (role === 'garage') {
          const result = await SBLayer.Auth.loginGarage({ email, password });
          const g = result.garage;
          return ok(res, {
            token: jwtSign({ id: g.id, role: 'garage', email, nom: g.nom }),
            role: 'garage', garage: g
          }, 'Connexion réussie');
        } else {
          const result = await SBLayer.Auth.loginClient({ email, password });
          const c = result.client;
          return ok(res, {
            token: jwtSign({ id: c.id, role: 'client', email, nom: c.nom, moto_id: result.moto_id }),
            role: 'client', client: c, moto_id: result.moto_id
          }, 'Connexion réussie');
        }
      } catch(e) {
        return fail(res, e.message || 'Identifiants incorrects', 401, 'INVALID_CREDENTIALS');
      }
    }

    // ── RAM fallback ──
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

    // ── Supabase path ──
    if (USE_SUPABASE && SBLayer) {
      try {
        const g = await SBLayer.Auth.registerGarage({ nom, email, password, siret, tel, adresse });
        return ok(res, {
          token: jwtSign({ id: g.id, role: 'garage', email, nom }),
          garage: g
        }, 'Garage créé', 201);
      } catch(e) {
        const status = e.message && e.message.includes('déjà') ? 409 : 400;
        return fail(res, e.message, status, status===409?'DUPLICATE':'ERROR');
      }
    }

    // ── RAM fallback ──
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

    if (USE_SUPABASE && SBLayer) {
      try {
        const list = await SBLayer.Motos.list(a.id, { couleur: query.couleur });
        return ok(res, { motos: list, total: list.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
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

    if (USE_SUPABASE && SBLayer) {
      try {
        const moto = await SBLayer.Motos.create(a.id, { marque, modele, annee, plaque, vin, km, client_email, client_nom, client_tel });
        return ok(res, { moto }, 'Dossier moto créé', 201);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    let cli = DB.clients.find(function(c){return c.email===client_email;});
    if(!cli&&client_nom){
      cli = {id:'cli-'+uid(),nom:client_nom,email:client_email||client_nom.toLowerCase().replace(/\s/g,'')+uid()+'@motokey.fr',password:hashPwd('changeme'),tel:client_tel||'',created_at:nowISO()};
      DB.clients.push(cli);
    }
    const m = {id:'moto-'+uid(),garage_id:a.id,client_id:cli?cli.id:null,marque,modele,annee:parseInt(annee)||new Date().getFullYear(),plaque,vin,km:parseInt(km)||0,couleur_dossier:'rouge',score:0,created_at:nowISO(),updated_at:nowISO()};
    DB.motos.push(m);
    return ok(res,{moto:m,client:cli},'Dossier moto créé',201);
  }

  if((p=M('GET','/motos/:id'))!==null){
    const a = auth(req,res); if(!a) return;
    if (USE_SUPABASE && SBLayer) {
      try {
        const moto = await SBLayer.Motos.getById(p.id, a.id);
        const ints = await SBLayer.Interventions.list(p.id, a.id);
        return ok(res, { moto, client: moto.clients || {}, interventions: ints, nb_interventions: ints.length });
      } catch(e) { return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND'); }
    }
    // ── RAM fallback ──
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
    if (USE_SUPABASE && SBLayer) {
      try {
        const moto = await SBLayer.Motos.update(p.id, a.id, b);
        return ok(res, { moto }, 'Moto mise à jour');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const i = DB.motos.findIndex(function(x){return x.id===p.id&&x.garage_id===a.id;});
    if(i<0) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    DB.motos[i] = Object.assign({},DB.motos[i],b,{id:p.id,garage_id:a.id,updated_at:nowISO()});
    return ok(res,{moto:DB.motos[i]},'Moto mise à jour');
  }

  if((p=M('DELETE','/motos/:id'))!==null){
    const a = auth(req,res); if(!a) return;
    if (USE_SUPABASE && SBLayer) {
      try {
        await SBLayer.Motos.delete(p.id, a.id);
        return ok(res, { deleted_id: p.id }, 'Dossier supprimé');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const i = DB.motos.findIndex(function(x){return x.id===p.id&&x.garage_id===a.id;});
    if(i<0) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    DB.motos.splice(i,1);
    return ok(res,{deleted_id:p.id},'Dossier supprimé');
  }

  if((p=M('GET','/motos/:id/score'))!==null){
    const a = auth(req,res); if(!a) return;
    if (USE_SUPABASE && SBLayer) {
      try {
        const sc = await SBLayer.Motos.getScore(p.id, a.id);
        return ok(res, sc);
      } catch(e) { return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND'); }
    }
    // ── RAM fallback ──
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
    if (USE_SUPABASE && SBLayer) {
      try {
        const is = await SBLayer.Interventions.list(p.id, a.id, { type: query.type });
        return ok(res, { interventions: is, total: is.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    let is = DB.interventions.filter(function(i){return i.moto_id===p.id;}).sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});
    if(query.type) is = is.filter(function(i){return i.type===query.type;});
    return ok(res,{interventions:is,total:is.length});
  }

  if((p=M('POST','/motos/:id/interventions'))!==null){
    const a = auth(req,res); if(!a) return;
    const {type,titre,description,km,technicien,montant_ht} = b;
    if(!type||!titre) return fail(res,'type et titre requis');
    if(!['vert','bleu','jaune','rouge'].includes(type)) return fail(res,'type invalide (vert/bleu/jaune/rouge)');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.Interventions.create(a.id, p.id, { type, titre, description, km: parseInt(km)||0, technicien_id: null, montant_ht: parseFloat(montant_ht)||0 });
        return ok(res, result, 'Intervention ajoutée · Client synchronisé', 201);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    let m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===a.id;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const interId = 'int-'+uid();
    const sc_conf = rand(78,99);
    const inter = {id:interId,moto_id:p.id,garage_id:a.id,type,titre,description:description||'',km:parseInt(km)||m.km,technicien:technicien||a.nom,date:todayFR(),score_confiance:sc_conf,montant_ht:parseFloat(montant_ht)||0,created_at:nowISO()};
    DB.interventions.push(inter);
    const mi = DB.motos.findIndex(function(x){return x.id===p.id;});
    if(mi>=0&&inter.km>DB.motos[mi].km){DB.motos[mi].km=inter.km;DB.motos[mi].updated_at=nowISO();}
    const allIs = DB.interventions.filter(function(i){return i.moto_id===p.id;});
    const sc = calcScore(allIs);
    if(mi>=0){DB.motos[mi].score=sc;DB.motos[mi].couleur_dossier=couleur(sc);}
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
    if (USE_SUPABASE && SBLayer) {
      try {
        const list = await SBLayer.Devis.list(a.id);
        return ok(res, { devis: list, total: list.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const list = DB.devis.filter(function(d){return d.garage_id===a.id;}).map(function(d){
      const m = DB.motos.find(function(x){return x.id===d.moto_id;});
      return Object.assign({},d,{moto_info:m?m.marque+' '+m.modele+' — '+m.plaque:'—',total_ttc:calcDevis(d).total_ttc});
    });
    return ok(res,{devis:list,total:list.length});
  }

  if((p=M('POST','/devis'))!==null){
    const a = auth(req,res); if(!a) return;
    const {moto_id,lignes,remise_type,remise_pct,remise_note} = b;
    if(!moto_id) return fail(res,'moto_id requis');
    if (USE_SUPABASE && SBLayer) {
      try {
        const dv = await SBLayer.Devis.create(a.id, { moto_id, lignes, remise_type, remise_pct, remise_note });
        return ok(res, { devis: dv }, 'Devis créé', 201);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const m = DB.motos.find(function(x){return x.id===moto_id&&x.garage_id===a.id;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const dv = {id:'dv-'+uid(),moto_id,garage_id:a.id,numero:'2026-'+String(DB.devis.length+100).padStart(4,'0'),statut:'brouillon',lignes:lignes||[],remise_type:remise_type||'aucun',remise_pct:remise_pct||0,remise_note:remise_note||'',tva:20,created_at:nowISO(),updated_at:nowISO()};
    DB.devis.push(dv);
    return ok(res,{devis:dv,totaux:calcDevis(dv)},'Devis créé',201);
  }

  if((p=M('GET','/devis/:id'))!==null){
    const a = auth(req,res); if(!a) return;
    if (USE_SUPABASE && SBLayer) {
      try {
        const dv = await SBLayer.Devis.getById(p.id, a.id);
        return ok(res, { devis: dv, moto: dv.motos, totaux: SBLayer.Devis._calcTotaux(dv) });
      } catch(e) { return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND'); }
    }
    // ── RAM fallback ──
    const dv = DB.devis.find(function(d){return d.id===p.id&&d.garage_id===a.id;});
    if(!dv) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    const m  = DB.motos.find(function(x){return x.id===dv.moto_id;});
    const c  = DB.clients.find(function(x){return x.id===(m?m.client_id:null);});
    const {password:_,...cd} = c||{};
    return ok(res,{devis:dv,moto:m,client:cd,totaux:calcDevis(dv)});
  }

  if((p=M('PUT','/devis/:id'))!==null){
    const a = auth(req,res); if(!a) return;
    if (USE_SUPABASE && SBLayer) {
      try {
        const dv = await SBLayer.Devis.update(p.id, a.id, { entete: b.entete, lignes: b.lignes });
        return ok(res, { devis: dv }, 'Devis mis à jour');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const i = DB.devis.findIndex(function(d){return d.id===p.id&&d.garage_id===a.id;});
    if(i<0) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    DB.devis[i] = Object.assign({},DB.devis[i],b,{id:p.id,garage_id:a.id,updated_at:nowISO()});
    return ok(res,{devis:DB.devis[i],totaux:calcDevis(DB.devis[i])},'Devis mis à jour');
  }

  if((p=M('POST','/devis/:id/valider'))!==null){
    const a = auth(req,res); if(!a) return;
    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.Devis.valider(p.id, a.id);
        return ok(res, result, 'Devis validé · Intervention créée · Client synchronisé');
      } catch(e) { return fail(res, e.message, 400, 'ERROR'); }
    }
    // ── RAM fallback ──
    const i = DB.devis.findIndex(function(d){return d.id===p.id&&d.garage_id===a.id;});
    if(i<0) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    if(DB.devis[i].statut==='valide') return fail(res,'Devis déjà validé');
    DB.devis[i].statut='valide'; DB.devis[i].valide_at=nowISO(); DB.devis[i].updated_at=nowISO();
    const tot = calcDevis(DB.devis[i]);
    const m   = DB.motos.find(function(x){return x.id===DB.devis[i].moto_id;});
    const inter = {id:'int-'+uid(),moto_id:DB.devis[i].moto_id,garage_id:a.id,type:'bleu',titre:'Facture '+DB.devis[i].numero,description:(DB.devis[i].lignes||[]).map(function(l){return l.desc||l.description||'';}).join(', '),km:m?m.km:0,date:todayFR(),score_confiance:96,montant_ht:tot.base_ht,devis_id:p.id,created_at:nowISO()};
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
    if (USE_SUPABASE && SBLayer) {
      try {
        const list = await SBLayer.Fraude.historique(a.id);
        return ok(res, { verifications: list, total: list.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return ok(res,{verifications:DB.fraude_verifications.slice().reverse(),total:DB.fraude_verifications.length});
  }

  /* TRANSFERT */
  if((p=M('POST','/transfert/initier'))!==null){
    const a = auth(req,res); if(!a) return;
    const {moto_id,acheteur_nom,acheteur_email,prix,km_cession,notes} = b;
    if(!moto_id||!acheteur_nom||!prix) return fail(res,'moto_id, acheteur_nom et prix requis');
    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.Transferts.initier(a.id, { moto_id, acheteur_nom, acheteur_email, prix, km_cession, notes });
        return ok(res, result, 'Code généré · SMS envoyé', 201);
      } catch(e) { return fail(res, e.message, 400, 'ERROR'); }
    }
    // ── RAM fallback ──
    const m = DB.motos.find(function(x){return x.id===moto_id&&x.garage_id===a.id;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const code = 'MK-TR-'+Math.random().toString(36).substring(2,6).toUpperCase();
    const tr   = {id:'tr-'+uid(),code,moto_id,garage_id:a.id,vendeur_id:m.client_id,acheteur_nom,acheteur_email:acheteur_email||'',prix,km_cession:km_cession||m.km,notes:notes||'',statut:'initie',expire_at:new Date(Date.now()+172800000).toISOString(),created_at:nowISO(),steps:[{etape:'initie',at:nowISO(),par:'garage'}]};
    DB.transferts.push(tr);
    return ok(res,{transfert:tr,code,expire_dans:'48 heures'},'Code généré · SMS envoyé',201);
  }

  if((p=M('POST','/transfert/confirmer-vendeur'))!==null){
    const {code} = b;
    if(!code) return fail(res,'code requis');
    if (USE_SUPABASE && SBLayer) {
      try {
        const tr = await SBLayer.Transferts.confirmerVendeur(code);
        return ok(res, { transfert: tr }, 'Vente confirmée par le vendeur');
      } catch(e) { return fail(res, e.message, 400, 'ERROR'); }
    }
    // ── RAM fallback ──
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
    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.Transferts.consulter(code);
        return ok(res, result, "Dossier consulté par l'acheteur");
      } catch(e) { return fail(res, e.message, 400, 'ERROR'); }
    }
    // ── RAM fallback ──
    const tr = DB.transferts.find(function(t){return t.code===code;});
    if(!tr) return fail(res,'Code invalide',404,'NOT_FOUND');
    const m  = DB.motos.find(function(x){return x.id===tr.moto_id;});
    const is = DB.interventions.filter(function(i){return i.moto_id===tr.moto_id;}).sort(function(a,b){return b.created_at.localeCompare(a.created_at);});
    const sc = calcScore(is);
    const i  = DB.transferts.findIndex(function(t){return t.code===code;});
    if(DB.transferts[i].statut==='vendeur_confirme'){DB.transferts[i].statut='acheteur_consulte';DB.transferts[i].steps.push({etape:'acheteur_consulte',at:nowISO(),par:'acheteur'});}
    return ok(res,{dossier:{moto:m,score:sc,couleur:couleur(sc),interventions:is,nb_interventions:is.length},transfert:{code,acheteur_nom:tr.acheteur_nom,prix:tr.prix,km_cession:tr.km_cession}},"Dossier consulté par l'acheteur");
  }

  if((p=M('POST','/transfert/finaliser'))!==null){
    const {code,signature_acheteur} = b;
    if(!code) return fail(res,'code requis');
    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.Transferts.finaliser(code, signature_acheteur);
        return ok(res, result, 'Transfert finalisé · Certificat émis · Accès vendeur révoqué');
      } catch(e) { return fail(res, e.message, 400, 'ERROR'); }
    }
    // ── RAM fallback ──
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
    Object.assign(DB.transferts[i],{statut:'finalise',nouveau_client_id:nc.id,certificat_id:certId,signature_acheteur:signature_acheteur||tr.acheteur_nom,finalise_at:nowISO()});
    DB.transferts[i].steps.push({etape:'finalise',at:nowISO(),par:'acheteur'});
    const moto = DB.motos[mi];
    return ok(res,{certificat:{id:certId,moto:{marque:moto?moto.marque:'',modele:moto?moto.modele:'',plaque:moto?moto.plaque:'',km:tr.km_cession},acheteur:nc,prix:tr.prix,date:todayFR(),hash:crypto.createHash('sha256').update(certId+tr.code).digest('hex')},transfert:DB.transferts[i],nouveau_proprietaire:nc},'Transfert finalisé · Certificat émis · Accès vendeur révoqué');
  }

  if((p=M('GET','/transfert/:code'))!==null){
    const a = auth(req,res); if(!a) return;
    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.Transferts.consulter(p.code);
        return ok(res, { transfert: result.transfert });
      } catch(e) { return fail(res, 'Transfert non trouvé', 404, 'NOT_FOUND'); }
    }
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
    if (USE_SUPABASE && SBLayer) {
      try {
        const g = await SBLayer.Garages.getById(a.id);
        return ok(res, { params: g });
      } catch(e) { return fail(res, 'Garage non trouvé', 404, 'NOT_FOUND'); }
    }
    // ── RAM fallback ──
    const g = DB.garages.find(function(x){return x.id===a.id;});
    if(!g) return fail(res,'Garage non trouvé',404,'NOT_FOUND');
    const {password:_,...gd} = g;
    return ok(res,{params:gd});
  }

  if((p=M('PUT','/params'))!==null){
    const a = auth(req,res); if(!a) return;
    if (USE_SUPABASE && SBLayer) {
      try {
        const g = await SBLayer.Garages.update(a.id, b);
        return ok(res, { params: g }, 'Paramètres mis à jour');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const i = DB.garages.findIndex(function(x){return x.id===a.id;});
    if(i<0) return fail(res,'Garage non trouvé',404,'NOT_FOUND');
    ['nom','tel','adresse','siret','taux_std','taux_spec','tva','techniciens'].forEach(function(k){if(b[k]!==undefined)DB.garages[i][k]=b[k];});
    const {password:_,...gd} = DB.garages[i];
    return ok(res,{params:gd},'Paramètres mis à jour');
  }

  if((p=M('GET','/stats'))!==null){
    const a = auth(req,res); if(!a) return;
    if (USE_SUPABASE && SBLayer) {
      try {
        const stats = await SBLayer.Garages.getStats(a.id);
        return ok(res, stats);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
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

  /* ── ENTITÉS DE FACTURATION ── */

  // GET /entites-facturation — liste les entités de facturation du garage connecté
  if((p=M('GET','/entites-facturation'))!==null){
    const a = auth(req,res); if(!a) return;
    if(USE_SUPABASE && SBLayer){
      const { data, error } = await SBLayer.supabase
        .from('entites_facturation')
        .select('*')
        .eq('garage_id', a.id)
        .order('created_at', { ascending: false });
      if(error) return fail(res, error.message, 500, 'DB_ERROR');
      return ok(res, data || []);
    }
    return ok(res, []);
  }

  /* ── LIVRAISON 7a : AUTH CLIENT ── */

  // GET /auth/client/healthz — sanity check, prêt pour 7b si jwt_configured: true
  if((p=M('GET','/auth/client/healthz'))!==null){
    return ok(res,{
      ready_for_7b:            !!process.env.JWT_CLIENT_SECRET,
      jwt_configured:          !!process.env.JWT_CLIENT_SECRET,
      frontend_url_configured: !!process.env.FRONTEND_CLIENT_URL,
      version:                 '7a'
    });
  }

  // GET /auth/client/config — règles mdp + infos éditeur (public, sans token)
  if((p=M('GET','/auth/client/config'))!==null){
    return ok(res, Object.assign({}, clientAuth.CONFIG_DATA, { jwt_configured: !!process.env.JWT_CLIENT_SECRET }));
  }

  // GET /auth/client/test-ratelimit — vérifie le rate limiter (5 OK puis 429)
  if((p=M('GET','/auth/client/test-ratelimit'))!==null){
    if(!clientAuth.rateLimitAuth(req, res, pathname)) return;
    return ok(res,{ message:'OK — rate limit non atteint', limit: 5, window: '15 min' });
  }

  // GET /client/ping — route protégée, nécessite un JWT client valide
  if((p=M('GET','/client/ping'))!==null){
    if(!await clientAuth.requireClient(req, res)) return;
    return ok(res,{ pong: true, user: req.clientUser.email, id: req.clientUser.id });
  }

  /* ── LIVRAISON 7b : AUTH CLIENT ENDPOINTS (Supabase Auth natif) ── */
  // TODO RBAC : sécuriser avec vérification de rôle quand les rôles seront définis

  // ── Helpers locaux 7b ──────────────────────────────────
  function parseCookie(req, name) {
    const c = req.headers['cookie'] || '';
    const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setRefreshCookie(res, token, maxAge) {
    res.setHeader('Set-Cookie',
      `refresh_token=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge || 2592000}; Path=/auth/client/refresh`);
  }
  function clearRefreshCookie(res) {
    res.setHeader('Set-Cookie',
      'refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/auth/client/refresh');
  }
  // Raccourcis vers les clients Supabase exposés par supabase.js
  function sbPub() { return SBLayer ? SBLayer.supabasePublic : null; } // anon — auth.uid() actif
  function sbSvc() { return SBLayer ? SBLayer.supabase        : null; } // service role — admin ops

  // ── POST /auth/client/register ─────────────────────────
  if ((p = M('POST', '/auth/client/register')) !== null) {
    // TODO RBAC
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
    const b = await body(req);
    const { email, password, nom, tel } = b;
    if (!email || !password || !nom) {
      return fail(res, 'Champs requis : email, password, nom', 400, 'MISSING_FIELDS');
    }

    try {
      const { data, error } = await sbPub().auth.signUp({
        email,
        password,
        options: { data: { nom: nom.trim(), tel: tel || null } }
      });
      // Supabase envoie automatiquement l'OTP de confirmation

      if (!error && data.user) {
        // Lier auth_user_id sur le profil clients existant, ou créer un nouveau
        // (garage_id nullable requis — cf. migration 07b-pivot-migration.sql)
        const garageId = req.headers['x-garage-id'] || null;
        const rows = await sbRequest('GET',
          `/clients?email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
        if (Array.isArray(rows) && rows.length > 0) {
          await sbRequest('PATCH', `/clients?id=eq.${rows[0].id}`,
            { auth_user_id: data.user.id, nom: nom.trim(), tel: tel || null });
        } else {
          await sbRequest('POST', '/clients', {
            auth_user_id: data.user.id,
            email:        email.toLowerCase().trim(),
            nom:          nom.trim(),
            tel:          tel || null,
            garage_id:    garageId
          });
        }
      }
    } catch (e) {
      console.error('[7b] register error:', e.message);
    }

    // Anti-énumération : même réponse que l'email soit pris ou non
    return ok(res,
      { message: 'Si ce compte est valide, un email de vérification a été envoyé.' },
      null, 201);
  }

  // ── POST /auth/client/verify-email ─────────────────────
  if ((p = M('POST', '/auth/client/verify-email')) !== null) {
    // TODO RBAC
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
    const b = await body(req);
    const { email, token: otp } = b;
    if (!email || !otp) {
      return fail(res, 'Champs requis : email, token', 400, 'MISSING_FIELDS');
    }

    const { data, error } = await sbPub().auth.verifyOtp({
      email,
      token: String(otp),
      type:  'signup'
    });
    if (error) return fail(res, 'Code invalide ou expiré', 400, 'INVALID_OTP');

    return ok(res, {
      message: 'Email vérifié — vous pouvez maintenant vous connecter.',
      session: data.session || null
    });
  }

  // ── POST /auth/client/login ────────────────────────────
  if ((p = M('POST', '/auth/client/login')) !== null) {
    // TODO RBAC
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
    const b = await body(req);
    const { email, password } = b;
    if (!email || !password) {
      return fail(res, 'Champs requis : email, password', 400, 'MISSING_FIELDS');
    }

    const { data, error } = await sbPub().auth.signInWithPassword({ email, password });
    if (error) return fail(res, 'Email ou mot de passe incorrect', 401, 'INVALID_CREDENTIALS');

    // TODO login-alert : envoyer emailService.send('login-alert', ...) si l'IP est nouvelle
    // (comparer avec data.user.last_sign_in_at une fois la table auth_logs branchée)

    const isWeb = req.headers['x-client-type'] === 'web';
    if (isWeb && data.session) {
      setRefreshCookie(res, data.session.refresh_token, data.session.expires_in);
    }
    return ok(res, { session: data.session });
  }

  // ── POST /auth/client/refresh ──────────────────────────
  if ((p = M('POST', '/auth/client/refresh')) !== null) {
    // TODO RBAC
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
    const b      = await body(req);
    const isWeb  = req.headers['x-client-type'] === 'web';
    const rTok   = b.refresh_token || (isWeb ? parseCookie(req, 'refresh_token') : null);

    if (!rTok) return fail(res, 'refresh_token requis', 400, 'MISSING_REFRESH_TOKEN');

    const { data, error } = await sbPub().auth.refreshSession({ refresh_token: rTok });
    if (error) {
      if (isWeb) clearRefreshCookie(res);
      return fail(res, 'Session expirée — reconnectez-vous', 401, 'INVALID_REFRESH_TOKEN');
    }

    if (isWeb && data.session) {
      setRefreshCookie(res, data.session.refresh_token, data.session.expires_in);
    }
    return ok(res, { session: data.session });
  }

  // ── POST /auth/client/logout ───────────────────────────
  if ((p = M('POST', '/auth/client/logout')) !== null) {
    // TODO RBAC
    const isWeb  = req.headers['x-client-type'] === 'web';
    const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();

    if (SBLayer && bearer) {
      try {
        await sbSvc().auth.admin.signOut(bearer);
      } catch (e) {
        console.warn('[7b] logout signOut:', e.message);
      }
    }
    if (isWeb) clearRefreshCookie(res);
    return ok(res, { message: 'Déconnecté avec succès' });
  }

  // ── POST /auth/client/password-reset ──────────────────
  if ((p = M('POST', '/auth/client/password-reset')) !== null) {
    // TODO RBAC
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
    const b = await body(req);
    const { email } = b;
    if (!email) return fail(res, 'Champ requis : email', 400, 'MISSING_FIELDS');

    const appUrl = process.env.APP_URL || 'https://motokey.app';
    try {
      await sbPub().auth.resetPasswordForEmail(email, {
        redirectTo: appUrl + '/reset-password'
      });
    } catch (e) {
      console.error('[7b] password-reset error:', e.message);
    }

    // Anti-énumération : même réponse que l'email existe ou non
    return ok(res, { message: 'Si ce compte existe, un email de réinitialisation a été envoyé.' });
  }

  // ── POST /auth/client/password-reset/confirm ──────────
  if ((p = M('POST', '/auth/client/password-reset/confirm')) !== null) {
    // TODO RBAC
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
    const b = await body(req);
    const { access_token, new_password } = b;
    if (!access_token || !new_password) {
      return fail(res, 'Champs requis : access_token, new_password', 400, 'MISSING_FIELDS');
    }

    // Valider le token de récupération (type "recovery" émis par Supabase)
    const { data: { user }, error: userErr } = await sbSvc().auth.getUser(access_token);
    if (userErr || !user) return fail(res, 'Token invalide ou expiré', 400, 'INVALID_TOKEN');

    const { error } = await sbSvc().auth.admin.updateUserById(user.id, { password: new_password });
    if (error) return fail(res, 'Impossible de mettre à jour le mot de passe', 500, 'SERVER_ERROR');

    return ok(res, { message: 'Mot de passe mis à jour — reconnectez-vous' });
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
