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

require('dotenv').config();

const http       = require('http');
const crypto     = require('crypto');
const url        = require('url');
const https2     = require('https');
const clientAuth  = require('./auth/client_auth');
const emailService = require('./services/emailService');
const pushService  = require('./services/pushService');
const maintenanceAlertService = require('./services/maintenanceAlertService');
const consommableRappelService = require('./services/consommableRappelService');
const rbac        = require('./auth/rbac');
const { stripe: stripeClient, handleWebhookEvent, createCheckoutSession, createAutoTrial, createPortalSession } = require('./services/stripeService');
const planLimits = require('./auth/planLimits');
const multer = require('multer');
const cloudinaryService = require('./services/cloudinaryService');
const { analyzePhoto } = require('./services/visionAnalysisService');
const jaugeConsommables = require('./services/jaugeConsommables');

// Couche Supabase (supabase.js) — chargée si SUPABASE_URL + SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_KEY) présents
let SBLayer = null;
try {
  SBLayer = require('./supabase');
  console.log('✅ supabase.js chargé');
} catch(e) {
  console.warn('⚠️  supabase.js introuvable — mode RAM uniquement:', e.message);
}

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'motokey_secret_2026';
const VERSION    = '1.1.0';

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
function isExpoPushToken(token) {
  return (
    typeof token === 'string' &&
    (((token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) &&
      token.endsWith(']')) ||
      /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(token))
  );
}
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
// Version silencieuse : retourne null sans envoyer de 401.
// Utilisée dans les handlers qui acceptent aussi bien un vieux JWT (HS256)
// qu'un JWT Supabase (ES256, validé via req.ctx par extractRoleFromRequest).
// Formate les colonnes billing d'un garage en réponse /billing/status
function buildBillingStatus(g) {
  const { PLANS } = require('./services/stripeService');
  const plan = PLANS[g.plan_code] || null;
  return {
    plan_code:                       g.plan_code || null,
    plan_label:                      plan ? plan.label : null,
    subscription_status:             g.subscription_status || null,
    subscription_current_period_end: g.subscription_current_period_end || null,
    grace_period_ends_at:            g.grace_period_ends_at || null,
    motos_limit:                     g.motos_limit ?? null,
    users_limit:                     g.users_limit ?? null,
  };
}

function authSilent(req) {
  const h = (req.headers['authorization']||'');
  if(!h.startsWith('Bearer ')) return null;
  return jwtVerify(h.slice(7)); // null pour les JWTs ES256 Supabase (algo/secret différents)
}
function body(req) {
  return new Promise(function(resolve){
    let s='';
    req.on('data',function(c){s+=c;});
    req.on('end',function(){try{resolve(JSON.parse(s||'{}'));}catch(e){resolve({});}});
    req.on('error',function(){resolve({});});
  });
}

/* ─── UPLOAD MULTIPART (Phase 25 — première introduction du pattern) ─── */
// D-03 : 5 Mo max, JPEG/PNG/WebP uniquement, mémoire (jamais disque — buffer direct vers Cloudinary)
const _upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype))
});
function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    _upload.single('photo')(req, res, (err) => { if (err) return reject(err); resolve(req.file); });
  });
}

// Résout la moto pour un contexte RBAC, dual CLIENT/GARAGE. Renvoie null si introuvable/non-possédée.
// Même sémantique 404 que le pattern inline (ne fuit pas l'existence).
async function resolveMotoForCtx(ctx, motoId, a) {
  if (!SBLayer) return null;
  if (rbac.requireAnyRole(ctx, ['CLIENT'])) {
    const { data: rows } = await SBLayer.supabase.from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1);
    if (!rows || !rows.length) return null;
    const { data: moto } = await SBLayer.supabase.from('motos').select('*').eq('id', motoId).eq('client_id', rows[0].id).maybeSingle();
    if (!moto) return null;
    return { moto, garage_id: moto.garage_id || null, acteur_type: 'client', acteur_id: rows[0].id };
  }
  if (!rbac.requireRole(ctx, 'MECANO')) return null; // pas assez de droits → traité comme non-résolu par l'appelant (403 en amont)
  const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
  if (!garageId) return null;
  const { data: moto } = await SBLayer.supabase.from('motos').select('*').eq('id', motoId).eq('garage_id', garageId).maybeSingle();
  if (!moto) return null;
  return { moto, garage_id: garageId, acteur_type: 'garage', acteur_id: (ctx && ctx.user_id) || garageId };
}

// Handler partagé relevé km normal (KM-03) et remplacement compteur (KM-02).
// `bodyFields` : chemin JSON passe `b` (déjà parsé par body()) ; chemin multipart
// laisse ce paramètre undefined et récupère les champs texte via req.body après runMulter.
async function handleKmReading(req, res, motoId, { remplacement }, bodyFields) {
  try {
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});

    // KM-02 : remplacement de compteur réservé PRO+ (exclut MECANO et CLIENT)
    if (remplacement) {
      if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    }

    // Extraction champs : multipart (photo présente) vs JSON
    let file = null;
    let fields = bodyFields || {};
    const ct = req.headers['content-type'] || '';
    if (ct.startsWith('multipart/form-data')) {
      try {
        file = await runMulter(req, res);
      } catch (e) {
        if (e && e.code === 'LIMIT_FILE_SIZE') return fail(res, 'Fichier trop volumineux (5 Mo max)', 400, 'FILE_TOO_LARGE');
        return fail(res, e.message || 'Fichier invalide', 400, 'UNSUPPORTED_MEDIA');
      }
      fields = req.body || {};
    }
    const km = fields.km;
    const note = fields.note;

    // KM-02 : note obligatoire pour un remplacement de compteur
    if (remplacement && (!note || !String(note).trim())) {
      return fail(res, 'note obligatoire pour un remplacement de compteur', 400, 'VALIDATION_ERROR');
    }

    // Ownership (dual CLIENT/GARAGE) — même sémantique 404 que le pattern existant
    const r = await resolveMotoForCtx(ctx, motoId, a);
    if (!r) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');

    if (km === undefined || km === null || km === '' || isNaN(parseInt(km))) {
      return fail(res, 'km numérique requis', 400, 'VALIDATION_ERROR');
    }

    // Upload Cloudinary AVANT l'écriture km (photo_url doit être connue avant l'INSERT)
    let photo_url = null;
    if (file) {
      try {
        const up = await cloudinaryService.uploadPhoto(file.buffer, { folder: 'motokey/km/' + motoId });
        photo_url = up.secure_url;
      } catch (e) {
        return fail(res, e.message, e.statusCode || 500, e.code || 'UPLOAD_ERROR');
      }
    }

    // Le trigger DB ne rejette jamais type_evenement:'remplacement_compteur' (reset monotone,
    // gate PRO+ déjà appliqué côté app) — mais on garde la branche accepted:false par sécurité.
    let result;
    if (remplacement) {
      result = await SBLayer.RelevesKm.enregistrer(r.garage_id, motoId, {
        km, type_evenement:'remplacement_compteur', acteur_type: r.acteur_type, acteur_id: r.acteur_id, note, photo_url
      });
    } else {
      result = await SBLayer.RelevesKm.enregistrer(r.garage_id, motoId, {
        km, type_evenement:'lecture', acteur_type: r.acteur_type, acteur_id: r.acteur_id, note: note || null, photo_url
      });
    }

    if (!result.accepted) {
      return sendJSON(res, 409, {
        success: false,
        error: { code: 'KM_REGRESSION', message: 'Kilométrage en régression' },
        km_tente: result.km_tente,
        km_actuel: result.km_actuel,
        timestamp: nowISO()
      });
    }
    return ok(res, { releve: result.releve }, 'Relevé km enregistré', 201);
  } catch (e) {
    return fail(res, e.message, 500, 'SERVER_ERROR');
  }
}

// Handler upload photo consommable (CONSO-03) — multipart intercepté AVANT body().
// Ordre strict (RESEARCH.md "Order of operations") : ctx → multer (taille/MIME) →
// champs texte/type → ownership → Cloudinary (D-02: 503 si non configuré, jamais
// placeholder) → D-05 (auto-création consommable si absent, avant de lier consommable_id)
// → analyse stub synchrone → persistance PhotosConsommables.
async function handlePhotoConsommable(req, res, motoId) {
  try {
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});

    let file;
    try { file = await runMulter(req, res); }
    catch (e) { if (e instanceof multer.MulterError && e.code === 'LIMIT_FILE_SIZE') return fail(res,'Photo trop volumineuse (max 5 Mo)',400,'FILE_TOO_LARGE'); return fail(res, e.message, 400, 'UPLOAD_PARSE_ERROR'); }
    if (!file) return fail(res, 'Photo requise (champ multipart "photo", JPEG/PNG/WebP)', 400, 'VALIDATION_ERROR');

    const type = (req.body && req.body.type_consommable) || null;
    if (!type || !SBLayer.TYPES_CONSOMMABLES.includes(type)) return fail(res,'type_consommable invalide',400,'VALIDATION_ERROR');

    // Ownership (dual CLIENT/GARAGE) — même sémantique 404 que le pattern existant
    const r = await resolveMotoForCtx(ctx, motoId, a);
    if (!r) return fail(res,'Moto non trouvée',404,'NOT_FOUND');

    // Upload Cloudinary AVANT tout écriture DB (photo_url doit être connue avant l'INSERT)
    let secure_url;
    try {
      const up = await cloudinaryService.uploadPhoto(file.buffer, { folder: 'motokey/consommables/'+motoId });
      secure_url = up.secure_url;
    } catch (e) {
      return fail(res, e.message, e.statusCode || 500, e.code || 'UPLOAD_ERROR'); // D-02: 503 si non configuré, jamais placeholder
    }

    // D-05 : trouver/auto-créer la ligne consommable pour ce type AVANT de lier consommable_id
    let conso = (await SBLayer.Consommables.listByMoto(motoId)).find(c => c.type_consommable === type);
    if (!conso) { conso = await SBLayer.Consommables.upsert(motoId, { type_consommable: type, km_montage: null }); }

    // Analyse stub (synchrone) — contrat verrouillé Phase 24
    const kmActuel = r.moto ? (r.moto.km ?? null) : null;
    const analyse = await analyzePhoto({ photoUrl: secure_url, consommableId: conso.id, typeConsommable: type, kmActuel, kmMontage: conso.km_montage ?? null });

    // Persistance historisée
    const photo = await SBLayer.PhotosConsommables.insert({ moto_id: motoId, consommable_id: conso.id, type_consommable: type, photo_url: secure_url, analyse_ia: analyse, analyse_status: analyse.analyse_status, km_a_la_photo: kmActuel });

    return ok(res, { photo, analyse, consommable: conso }, 'Photo consommable enregistrée', 201);
  } catch (e) {
    return fail(res, e.message, 500, 'SERVER_ERROR');
  }
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
const _MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>MotoKey — Maintenance</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;color:#1a1d23;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.box{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px 32px;max-width:440px;text-align:center}
.logo{font-size:28px;font-weight:900;letter-spacing:1px;margin-bottom:24px}
.logo em{color:#ff6b00;font-style:normal}
.icon{font-size:48px;margin-bottom:16px}
h1{font-size:20px;font-weight:700;margin-bottom:12px}
p{font-size:15px;color:#5a6172;line-height:1.6;margin-bottom:16px}
.contact{margin-top:24px;padding-top:24px;border-top:1px solid #e2e5eb;font-size:13px;color:#9ba3b4}
</style>
</head>
<body>
<div class="box">
  <div class="logo">MOTO<em>KEY</em></div>
  <div class="icon">🔧</div>
  <h1>Application en maintenance</h1>
  <p>Le service MotoKey est temporairement indisponible. Nos équipes interviennent pour rétablir l’accès au plus vite.</p>
  <p>Vos données et l’historique de votre moto sont en sécurité.</p>
  <div class="contact">Pour toute urgence, contactez votre garage directement.</div>
</div>
</body>
</html>`;

function getAppHTML() {
  // Essayer le fichier local en priorité (plus récent si déployé)
  try {
    const _fs   = require('fs');
    const _path = require('path');
    const local = _fs.readFileSync(_path.join(__dirname, 'app.html'), 'utf8');
    if (local && local.length > 1000) return local;
  } catch(e) {}
  // Fallback : HTML embarqué dans l'API
  return _MAINTENANCE_HTML;
}

console.log('✅ Route /app — HTML embarqué (' + _MAINTENANCE_HTML.length + ' chars)');

function getClientHTML() {
  // Lire MotoKey_Client.html depuis le disque (priorité sur fallback embarqué)
  try {
    const _fs   = require('fs');
    const _path = require('path');
    const local = _fs.readFileSync(_path.join(__dirname, 'MotoKey_Client.html'), 'utf8');
    if (local && local.length > 100) return local;
  } catch(e) {}
  // Fallback minimal si le fichier n'existe pas encore
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>MotoKey — Espace Client</title></head><body style="font-family:sans-serif;padding:2rem"><h1>MotoKey — Espace Client</h1><p>En cours de déploiement…</p></body></html>';
}

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

  // ── Servir l'app HTML sur / et /app
  if((pathname==='/'||pathname==='/app') && method==='GET'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Cache-Control':'no-cache, no-store, must-revalidate','Pragma':'no-cache','Expires':'0'});
    res.end(getAppHTML());
    return;
  }

  // ── Servir l'espace client sur /client
  if(pathname==='/client' && method==='GET'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Cache-Control':'no-cache, no-store, must-revalidate','Pragma':'no-cache','Expires':'0'});
    res.end(getClientHTML());
    return;
  }

  // ── POST /stripe/webhook ── monté AVANT body() pour conserver les bytes bruts
  if (pathname === '/stripe/webhook' && method === 'POST') {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeClient || !webhookSecret) {
      console.warn('[webhook] Stripe ou STRIPE_WEBHOOK_SECRET non configuré');
      res.writeHead(200); res.end(JSON.stringify({ ignored: true }));
      return;
    }

    const rawBody = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end',  () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

    let event;
    try {
      event = stripeClient.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      console.error('[webhook] Signature invalide :', err.message);
      res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid signature' }));
      return;
    }

    try {
      const result = await handleWebhookEvent(event, SBLayer);
      res.writeHead(200); res.end(JSON.stringify(result));
    } catch (err) {
      console.error('[webhook] Erreur handler :', err.message);
      res.writeHead(500); res.end(JSON.stringify({ error: 'Handler error' }));
    }
    return;
  }

  // ── Routes multipart (upload photo) — interceptées AVANT body() car body() coerce
  // le Buffer en string (LOSSY) puis JSON.parse, ce qui corromprait un multipart/form-data.
  // Chaque route multipart pose req.ctx elle-même (body() normal le fait plus bas, L560).
  const _ct = req.headers['content-type'] || '';
  if (method === 'POST' && _ct.startsWith('multipart/form-data') && /^\/motos\/[^/]+\/km$/.test(pathname)) {
    req.ctx = await rbac.extractRoleFromRequest(req, SBLayer);
    return handleKmReading(req, res, pathname.split('/')[2], { remplacement: false });
  }
  if (method === 'POST' && _ct.startsWith('multipart/form-data') && /^\/motos\/[^/]+\/km\/remplacement-compteur$/.test(pathname)) {
    req.ctx = await rbac.extractRoleFromRequest(req, SBLayer);
    return handleKmReading(req, res, pathname.split('/')[2], { remplacement: true });
  }
  if (method === 'POST' && _ct.startsWith('multipart/form-data') && /^\/motos\/[^/]+\/photos-consommables$/.test(pathname)) {
    req.ctx = await rbac.extractRoleFromRequest(req, SBLayer);
    return handlePhotoConsommable(req, res, pathname.split('/')[2]);
  }

  let b = {};
  if(['POST','PUT','PATCH'].includes(method)) b = await body(req);

  // Extraction du contexte utilisateur (rôle RBAC) depuis le Bearer token.
  // null si pas de token, token invalide, ou rôle non défini.
  // N'impacte pas les routes publiques (elles ignorent req.ctx).
  req.ctx = await rbac.extractRoleFromRequest(req, SBLayer);

  function M(m,p){ return match(m,method,p,pathname); }

  let p;

  /* CRON — authentifié par secret partagé (X-Cron-Secret), pas de JWT (job planifié sans session utilisateur) */
  if ((p = M('POST', '/cron/maintenance-alerts')) !== null) {
    const secret = req.headers['x-cron-secret'];
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return fail(res, 'Non autorisé', 401, 'UNAUTHORIZED');
    }
    try {
      const result = await maintenanceAlertService.runMaintenanceAlertCron();
      return ok(res, result, 'Cron entretien exécuté');
    } catch (e) {
      console.error('[cron] maintenance-alerts échoué:', e.message);
      return fail(res, e.message, 500, 'CRON_ERROR');
    }
  }

  /* CRON — rappel photo consommables (GAUGE-03), même auth X-Cron-Secret que ci-dessus */
  if ((p = M('POST', '/cron/rappels-photo-consommables')) !== null) {
    const secret = req.headers['x-cron-secret'];
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return fail(res, 'Non autorisé', 401, 'UNAUTHORIZED');
    }
    try {
      const result = await consommableRappelService.runConsommableRappelCron();
      return ok(res, result, 'Cron rappels photo consommables exécuté');
    } catch (e) {
      console.error('[cron] rappels-photo-consommables échoué:', e.message);
      return fail(res, e.message, 500, 'CRON_ERROR');
    }
  }

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
        devis:['GET /devis','POST /devis','GET /devis/:id','PUT /devis/:id','POST /devis/:id/envoyer','POST /devis/:id/valider','POST /devis/:id/pdf'],
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
          const rbac_role = result.session?.user?.app_metadata?.role || 'CONCESSION';
          return ok(res, {
            token: jwtSign({ id: g.id, role: 'garage', email, nom: g.nom }),
            role: 'garage', rbac_role, garage: g
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
      return ok(res,{token:jwtSign({id:g.id,role:'garage',email,nom:g.nom}),role:'garage',rbac_role:'CONCESSION',garage:gd},'Connexion réussie');
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
    // RBAC: dual-auth — vieux JWT garage (HS256) OU JWT Supabase (req.ctx)
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});

    // CLIENT : uniquement ses propres motos
    if (rbac.requireAnyRole(ctx, ['CLIENT'])) {
      if (USE_SUPABASE && SBLayer) {
        try {
          const { data: rows } = await SBLayer.supabase.from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1);
          if (!rows || rows.length === 0) return ok(res, { motos: [], total: 0 });
          const { data: motos } = await SBLayer.supabase.from('motos').select('*').eq('client_id', rows[0].id);
          return ok(res, { motos: motos || [], total: (motos || []).length });
        } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
      }
      const cli = DB.clients.find(function(c){ return c.auth_user_id === ctx.user_id; });
      const clientMotos = cli ? DB.motos.filter(function(m){ return m.client_id === cli.id; }) : [];
      return ok(res, { motos: clientMotos, total: clientMotos.length });
    }

    // PRO minimum pour les rôles garage (MECANO, PRO, CONCESSION, ADMIN)
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');

    // Résoudre garage_id : depuis vieux JWT (a.id) ou depuis ctx (Supabase)
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const list = await SBLayer.Motos.list(garageId, { couleur: query.couleur });
        return ok(res, { motos: list, total: list.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    let list = DB.motos.filter(function(m){return m.garage_id===garageId;});
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
    // RBAC: MECANO minimum — CLIENT rejeté
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    // TODO RBAC L8

    const {marque,modele,annee,plaque,vin,km,client_email,client_nom,client_tel,proprio_libre,mode_acquisition} = b;
    const proprietaire_type = b.proprietaire_type || 'client';
    if(!marque||!modele||!plaque||!vin) return fail(res,'marque, modele, plaque et vin requis');

    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    try { await planLimits.assertMotosLimit(garageId, SBLayer); }
    catch (e) { return fail(res, e.message, e.statusCode || 500, e.code || 'ERROR'); }

    if (USE_SUPABASE && SBLayer) {
      try {
        const moto = await SBLayer.Motos.create(garageId, { marque, modele, annee, plaque, vin, km, client_email, client_nom, client_tel, proprietaire_type, proprio_libre, mode_acquisition });
        return ok(res, { moto }, 'Dossier moto créé', 201);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    let cli = DB.clients.find(function(c){return c.email===client_email;});
    if(!cli&&client_nom){
      cli = {id:'cli-'+uid(),nom:client_nom,email:client_email||client_nom.toLowerCase().replace(/\s/g,'')+uid()+'@motokey.fr',password:hashPwd('changeme'),tel:client_tel||'',created_at:nowISO()};
      DB.clients.push(cli);
    }
    const m = {id:'moto-'+uid(),garage_id:garageId,client_id:cli?cli.id:null,marque,modele,annee:parseInt(annee)||new Date().getFullYear(),plaque,vin,km:parseInt(km)||0,couleur_dossier:'rouge',score:0,created_at:nowISO(),updated_at:nowISO()};
    DB.motos.push(m);
    return ok(res,{moto:m,client:cli},'Dossier moto créé',201);
  }

  if((p=M('GET','/motos/:id'))!==null){
    // RBAC: dual-auth — vieux JWT garage (HS256) OU JWT Supabase (req.ctx)
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});

    // CLIENT : accès uniquement à sa propre moto
    if (rbac.requireAnyRole(ctx, ['CLIENT'])) {
      if (USE_SUPABASE && SBLayer) {
        try {
          const { data: rows } = await SBLayer.supabase.from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1);
          if (!rows || rows.length === 0) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
          const { data: moto, error: merr } = await SBLayer.supabase.from('motos').select('*').eq('id', p.id).eq('client_id', rows[0].id).single();
          if (merr || !moto) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
          const { data: ints } = await SBLayer.supabase.from('interventions').select('*').eq('moto_id', p.id).order('created_at', { ascending: false });
          return ok(res, { moto, client: {}, interventions: ints || [], nb_interventions: (ints || []).length });
        } catch(e) { return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND'); }
      }
      const cli = DB.clients.find(function(c){ return c.auth_user_id === ctx.user_id; });
      if (!cli) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
      const m = DB.motos.find(function(x){ return x.id === p.id && x.client_id === cli.id; });
      if (!m) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
      const is = DB.interventions.filter(function(i){ return i.moto_id === m.id; }).sort(function(a,b){ return b.created_at.localeCompare(a.created_at); });
      return ok(res, { moto: m, client: {}, interventions: is, nb_interventions: is.length });
    }

    // MECANO minimum pour les rôles garage
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const moto = await SBLayer.Motos.getById(p.id, garageId);
        const ints = await SBLayer.Interventions.list(p.id, garageId);
        return ok(res, { moto, client: moto.clients || {}, interventions: ints, nb_interventions: ints.length });
      } catch(e) { return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND'); }
    }
    // ── RAM fallback ──
    const m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===garageId;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const c  = DB.clients.find(function(x){return x.id===m.client_id;});
    const is = DB.interventions.filter(function(i){return i.moto_id===m.id;}).sort(function(a,b){return b.created_at.localeCompare(a.created_at);});
    const sc = calcScore(is);
    const {password:_,...cd} = c||{};
    return ok(res,{moto:Object.assign({},m,{score:sc,couleur_dossier:couleur(sc)}),client:cd,interventions:is,nb_interventions:is.length});
  }

  if((p=M('PUT','/motos/:id'))!==null){
    // RBAC: MECANO minimum — CLIENT rejeté
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');

    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const moto = await SBLayer.Motos.update(p.id, garageId, b);
        return ok(res, { moto }, 'Moto mise à jour');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const i = DB.motos.findIndex(function(x){return x.id===p.id&&x.garage_id===garageId;});
    if(i<0) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    DB.motos[i] = Object.assign({},DB.motos[i],b,{id:p.id,garage_id:garageId,updated_at:nowISO()});
    return ok(res,{moto:DB.motos[i]},'Moto mise à jour');
  }

  if((p=M('DELETE','/motos/:id'))!==null){
    // RBAC: CONCESSION minimum
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'CONCESSION')) return fail(res, 'Permission refusée — CONCESSION minimum requis', 403, 'FORBIDDEN_ROLE');

    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        await SBLayer.Motos.delete(p.id, garageId);
        return ok(res, { deleted_id: p.id }, 'Dossier supprimé');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const i = DB.motos.findIndex(function(x){return x.id===p.id&&x.garage_id===garageId;});
    if(i<0) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    DB.motos.splice(i,1);
    return ok(res,{deleted_id:p.id},'Dossier supprimé');
  }

  if((p=M('GET','/motos/:id/score'))!==null){
    // RBAC: MECANO minimum — outil garage
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');

    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const sc = await SBLayer.Motos.getScore(p.id, garageId);
        return ok(res, sc);
      } catch(e) { return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND'); }
    }
    // ── RAM fallback ──
    const m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===garageId;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const is = DB.interventions.filter(function(i){return i.moto_id===m.id;});
    const sc = calcScore(is);
    const pt = {vert:0,bleu:0,jaune:0,rouge:0};
    is.forEach(function(i){pt[i.type]=(pt[i.type]||0)+1;});
    return ok(res,{score:sc,couleur:couleur(sc),nb_interventions:is.length,par_type:pt,detail:{concession:pt.vert*12,pro_valide:pt.bleu*8,proprietaire:pt.jaune*5,malus:pt.rouge*5}});
  }

  /* KILOMÉTRAGE (KM-02/KM-03) — route JSON (sans photo) ; le multipart est intercepté avant body() */
  if((p=M('POST','/motos/:id/km'))!==null){
    return handleKmReading(req, res, p.id, { remplacement:false }, b);
  }
  if((p=M('POST','/motos/:id/km/remplacement-compteur'))!==null){
    return handleKmReading(req, res, p.id, { remplacement:true }, b);
  }

  /* CONSOMMABLES (CONSO-01) — saisie MECANO+, délègue à Consommables.upsert (D-04) */
  if((p=M('PATCH','/motos/:id/consommables/:type'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res,'Non authentifié',401,'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx,'MECANO')) return fail(res,'Permission refusée — MECANO minimum requis',403,'FORBIDDEN_ROLE');
    if (!SBLayer.TYPES_CONSOMMABLES.includes(p.type)) return fail(res, 'type_consommable invalide', 400, 'VALIDATION_ERROR');
    const r = await resolveMotoForCtx(ctx, p.id, a);
    if (!r) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    try {
      const row = await SBLayer.Consommables.upsert(p.id, { type_consommable: p.type, km_montage: b.km_montage, date_montage: b.date_montage, reference: b.reference });
      return ok(res, { consommable: row }, 'Consommable enregistré');
    } catch (e) { return fail(res, e.message, 500, 'SERVER_ERROR'); }
  }

  if((p=M('POST','/motos/:id/consommables'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res,'Non authentifié',401,'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx,'MECANO')) return fail(res,'Permission refusée — MECANO minimum requis',403,'FORBIDDEN_ROLE');
    const items = Array.isArray(b.consommables) ? b.consommables : (Array.isArray(b) ? b : null);
    if (!items || !items.length) return fail(res, 'tableau consommables requis', 400, 'VALIDATION_ERROR');
    const bad = items.find(it => !it || !SBLayer.TYPES_CONSOMMABLES.includes(it.type_consommable));
    if (bad) return fail(res, 'type_consommable invalide dans le tableau: '+(bad&&bad.type_consommable), 400, 'VALIDATION_ERROR');
    const r = await resolveMotoForCtx(ctx, p.id, a);
    if (!r) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    try {
      const rows = [];
      for (const it of items) { rows.push(await SBLayer.Consommables.upsert(p.id, { type_consommable: it.type_consommable, km_montage: it.km_montage, date_montage: it.date_montage, reference: it.reference })); }
      return ok(res, { consommables: rows }, rows.length+' consommables enregistrés', 201);
    } catch (e) { return fail(res, e.message, 500, 'SERVER_ERROR'); }
  }

  /* JAUGES CONSOMMABLES (GAUGE-01/02) — lecture, ouverte CLIENT + MECANO+ via resolveMotoForCtx */
  if((p=M('GET','/motos/:id/consommables'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res,'Non authentifié',401,'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    const r = await resolveMotoForCtx(ctx, p.id, a);
    if (!r) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    try {
      const { items, jaugeGenerale } = await jaugeConsommables.buildConsommablesJauges(p.id);
      return ok(res, { consommables: items, jauge_generale: jaugeGenerale });
    } catch (e) { return fail(res, e.message, 500, 'SERVER_ERROR'); }
  }

  /* INTERVENTIONS */
  if((p=M('GET','/motos/:id/interventions'))!==null){
    // RBAC: CLIENT voit ses propres interventions, MECANO+ voit celles du garage
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});

    // CLIENT : accès uniquement aux interventions de sa propre moto
    if (rbac.requireAnyRole(ctx, ['CLIENT'])) {
      if (USE_SUPABASE && SBLayer) {
        try {
          const { data: rows } = await SBLayer.supabase.from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1);
          if (!rows || rows.length === 0) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
          const { data: moto } = await SBLayer.supabase.from('motos').select('id').eq('id', p.id).eq('client_id', rows[0].id).single();
          if (!moto) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
          let q2 = SBLayer.supabase.from('interventions').select('*').eq('moto_id', p.id).order('created_at', { ascending: false });
          if(query.type) q2 = q2.eq('type', query.type);
          const { data: is } = await q2;
          return ok(res, { interventions: is || [], total: (is || []).length });
        } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
      }
      const cli = DB.clients.find(function(c){ return c.auth_user_id === ctx.user_id; });
      if (!cli) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
      const m = DB.motos.find(function(x){ return x.id === p.id && x.client_id === cli.id; });
      if (!m) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
      let is = DB.interventions.filter(function(i){ return i.moto_id === p.id; }).sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
      if(query.type) is = is.filter(function(i){ return i.type === query.type; });
      return ok(res, { interventions: is, total: is.length });
    }

    // MECANO minimum pour les rôles garage
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const is = await SBLayer.Interventions.list(p.id, garageId, { type: query.type });
        return ok(res, { interventions: is, total: is.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    let is = DB.interventions.filter(function(i){return i.moto_id===p.id;}).sort(function(a,b){return (b.created_at||'').localeCompare(a.created_at||'');});
    if(query.type) is = is.filter(function(i){return i.type===query.type;});
    return ok(res, { interventions: is, total: is.length });
  }

  if((p=M('POST','/motos/:id/interventions'))!==null){
    // RBAC: MECANO minimum — type='vert' réservé CONCESSION+
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');

    const {type,titre,description,km,technicien,montant_ht} = b;
    if(!type||!titre) return fail(res,'type et titre requis');
    if(!['vert','bleu','jaune','rouge'].includes(type)) return fail(res,'type invalide (vert/bleu/jaune/rouge)');

    // type='vert' = tampon concession officiel — interdit aux rôles < CONCESSION
    if (type === 'vert' && !rbac.requireRole(ctx, 'CONCESSION')) {
      return fail(res, 'type=vert réservé aux CONCESSION et ADMIN', 403, 'FORBIDDEN_ROLE');
    }

    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.Interventions.create(garageId, p.id, { type, titre, description, km: parseInt(km)||0, technicien_id: null, montant_ht: parseFloat(montant_ht)||0 });
        return ok(res, result, 'Intervention ajoutée · Client synchronisé', 201);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    let m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===garageId;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const interId = 'int-'+uid();
    const sc_conf = rand(78,99);
    const inter = {id:interId,moto_id:p.id,garage_id:garageId,type,titre,description:description||'',km:parseInt(km)||m.km,technicien:technicien||'',date:todayFR(),score_confiance:sc_conf,montant_ht:parseFloat(montant_ht)||0,created_at:nowISO()};
    DB.interventions.push(inter);
    const mi = DB.motos.findIndex(function(x){return x.id===p.id;});
    if(mi>=0&&inter.km>DB.motos[mi].km){DB.motos[mi].km=inter.km;DB.motos[mi].updated_at=nowISO();}
    const allIs = DB.interventions.filter(function(i){return i.moto_id===p.id;});
    const sc = calcScore(allIs);
    if(mi>=0){DB.motos[mi].score=sc;DB.motos[mi].couleur_dossier=couleur(sc);}
    return ok(res,{intervention:inter,nouveau_score:sc,nouvelle_couleur:couleur(sc)},'Intervention ajoutée · Client synchronisé',201);
  }

  if((p=M('PUT','/motos/:id/interventions/:iid'))!==null){
    // RBAC: MECANO minimum (RAM uniquement)
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');

    const i = DB.interventions.findIndex(function(x){return x.id===p.iid&&x.moto_id===p.id;});
    if(i<0) return fail(res,'Intervention non trouvée',404,'NOT_FOUND');
    DB.interventions[i] = Object.assign({},DB.interventions[i],b,{id:p.iid,moto_id:p.id});
    return ok(res,{intervention:DB.interventions[i]},'Intervention mise à jour');
  }

  if((p=M('DELETE','/motos/:id/interventions/:iid'))!==null){
    // RBAC: MECANO minimum (RAM uniquement)
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');

    const i = DB.interventions.findIndex(function(x){return x.id===p.iid&&x.moto_id===p.id;});
    if(i<0) return fail(res,'Intervention non trouvée',404,'NOT_FOUND');
    DB.interventions.splice(i,1);
    return ok(res,{deleted_id:p.iid},'Intervention supprimée');
  }

  /* ENTRETIEN */
  if((p=M('GET','/motos/:id/entretien'))!==null){
    // RBAC: MECANO minimum — outil garage
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    const m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===garageId;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const km   = parseInt(query.km)||m.km;
    const plan = enrichPlan(DB.plans[p.id]||[], km);
    return ok(res,{plan,km_actuel:km,source:'Autodata · ETAI',total:plan.length});
  }

  if((p=M('GET','/motos/:id/entretien/alertes'))!==null){
    // RBAC: MECANO minimum — outil garage
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    const m = DB.motos.find(function(x){return x.id===p.id&&x.garage_id===garageId;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const plan = enrichPlan(DB.plans[p.id]||[], m.km);
    const al   = plan.filter(function(op){return op.statut==='urgent'||op.statut==='warning';});
    return ok(res,{alertes:al,nb_alertes:al.length,nb_urgentes:al.filter(function(x){return x.statut==='urgent';}).length});
  }

  // POST /motos/:id/vendre (PRO+) — vente d'une moto en stock vers un client — TODO RBAC L8
  if((p=M('POST','/motos/:id/vendre'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const motoId = p.id;
        const { client_email, client_nom, client_tel } = b;
        const mode_acquisition = b.mode_acquisition || 'achat_occasion';
        if (!client_email && !client_nom) return fail(res, 'client_email ou client_nom requis', 400, 'VALIDATION_ERROR');
        // Vérifier que la moto appartient bien à ce garage et est de type 'garage'
        const { data: moto, error: motoErr } = await SBLayer.supabase.from('motos').select('*').eq('id', motoId).eq('garage_id', garageId).single();
        if (motoErr || !moto) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
        if (moto.proprietaire_type !== 'garage') return fail(res, 'La moto n\'est pas en stock garage', 400, 'VALIDATION_ERROR');
        if (moto.proprietaire_garage_id !== garageId) return fail(res, 'La moto n\'appartient pas à ce garage', 403, 'FORBIDDEN');
        // Trouver ou créer le client
        let client = null;
        if (client_email) {
          const { data } = await SBLayer.supabase.from('clients').select('id, garage_id').eq('email', client_email).maybeSingle();
          client = data;
          if (client && !client.garage_id) {
            await SBLayer.supabase.from('clients').update({ garage_id: garageId }).eq('id', client.id);
          }
        }
        if (!client) {
          const { data: newClient, error: cliErr } = await SBLayer.supabase.from('clients').insert({
            garage_id: garageId,
            nom:   client_nom   || client_email,
            email: client_email || null,
            tel:   client_tel   || null
          }).select().single();
          if (cliErr) throw new Error(`[vendre] insert client: ${cliErr.message}`);
          client = newClient;
        }
        // Céder la moto au client
        await SBLayer.cessionMoto(motoId, { type: 'client', id: client.id }, mode_acquisition, ctx.user_id);
        // Créer ou activer la liaison client-garage
        const { data: liaison } = await SBLayer.supabase.from('liaisons_client_garage').select('id, statut').eq('client_id', client.id).eq('garage_id', garageId).maybeSingle();
        if (!liaison) {
          await SBLayer.supabase.from('liaisons_client_garage').insert({ client_id: client.id, garage_id: garageId, statut: 'actif' });
        } else if (liaison.statut !== 'actif') {
          await SBLayer.supabase.from('liaisons_client_garage').update({ statut: 'actif' }).eq('id', liaison.id);
        }
        console.log('[L8] Email invitation à implémenter quand Resend configuré');
        const { data: motoUpdated } = await SBLayer.supabase.from('motos').select('*').eq('id', motoId).single();
        return ok(res, { moto: motoUpdated, client }, 'Moto vendue au client', 200);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
  }

  // POST /motos/:id/reprendre-en-stock (PRO+) — reprise moto client en stock garage — TODO RBAC L8
  if((p=M('POST','/motos/:id/reprendre-en-stock'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const motoId = p.id;
        // Vérifier que la moto appartient bien à ce garage et est de type 'client'
        const { data: moto, error: motoErr } = await SBLayer.supabase.from('motos').select('*').eq('id', motoId).eq('garage_id', garageId).single();
        if (motoErr || !moto) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
        if (moto.proprietaire_type !== 'client') return fail(res, 'La moto n\'est pas propriété d\'un client', 400, 'VALIDATION_ERROR');
        // Céder la moto au garage
        await SBLayer.cessionMoto(motoId, { type: 'garage', id: garageId }, 'reprise_garage', ctx.user_id);
        const { data: motoUpdated } = await SBLayer.supabase.from('motos').select('*').eq('id', motoId).single();
        return ok(res, { moto: motoUpdated }, 'Moto reprise en stock garage', 200);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
  }

  /* DEVIS */
  if((p=M('GET','/devis'))!==null){
    // RBAC: MECANO minimum — CLIENT voit ses propres devis, MECANO+ voit le garage
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});

    // CLIENT : ses propres devis (via ses motos)
    if (rbac.requireAnyRole(ctx, ['CLIENT'])) {
      if (USE_SUPABASE && SBLayer) {
        try {
          const { data: clientRow } = await SBLayer.supabase.from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
          if (!clientRow) return ok(res, { devis: [], total: 0 });
          const { data: motoIds } = await SBLayer.supabase.from('motos').select('id').eq('client_id', clientRow.id);
          if (!motoIds || motoIds.length === 0) return ok(res, { devis: [], total: 0 });
          const ids = motoIds.map(function(m){ return m.id; });
          const { data: list } = await SBLayer.supabase.from('devis').select('*, motos(marque, modele, plaque)').in('moto_id', ids).neq('statut', 'brouillon');
          return ok(res, { devis: list || [], total: (list || []).length });
        } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
      }
      const cli = DB.clients.find(function(c){ return c.auth_user_id === ctx.user_id; });
      if (!cli) return ok(res, { devis: [], total: 0 });
      const cliMotos = DB.motos.filter(function(m){ return m.client_id === cli.id; }).map(function(m){ return m.id; });
      const list = DB.devis.filter(function(d){ return cliMotos.includes(d.moto_id) && d.statut !== 'brouillon'; });
      return ok(res, { devis: list, total: list.length });
    }

    // MECANO+ : tous les devis du garage
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const list = await SBLayer.Devis.list(garageId);
        return ok(res, { devis: list, total: list.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const list = DB.devis.filter(function(d){return d.garage_id===garageId;}).map(function(d){
      const m = DB.motos.find(function(x){return x.id===d.moto_id;});
      return Object.assign({},d,{moto_info:m?m.marque+' '+m.modele+' — '+m.plaque:'—',total_ttc:calcDevis(d).total_ttc});
    });
    return ok(res,{devis:list,total:list.length});
  }

  if((p=M('POST','/devis'))!==null){
    // RBAC: MECANO minimum — CLIENT rejeté
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');

    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    const {moto_id,lignes,remise_type,remise_pct,remise_note} = b;
    if(!moto_id) return fail(res,'moto_id requis');
    if (USE_SUPABASE && SBLayer) {
      try {
        const dv = await SBLayer.Devis.create(garageId, { moto_id, lignes, remise_type, remise_pct, remise_note });
        return ok(res, { devis: dv }, 'Devis créé', 201);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const m = DB.motos.find(function(x){return x.id===moto_id&&x.garage_id===garageId;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const dv = {id:'dv-'+uid(),moto_id,garage_id:garageId,numero:'2026-'+String(DB.devis.length+100).padStart(4,'0'),statut:'brouillon',lignes:lignes||[],remise_type:remise_type||'aucun',remise_pct:remise_pct||0,remise_note:remise_note||'',tva:20,created_at:nowISO(),updated_at:nowISO()};
    DB.devis.push(dv);
    return ok(res,{devis:dv,totaux:calcDevis(dv)},'Devis créé',201);
  }

  if((p=M('GET','/devis/:id'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});

    // CLIENT : vérification propriété + brouillons invisibles
    if (rbac.requireAnyRole(ctx, ['CLIENT'])) {
      if (USE_SUPABASE && SBLayer) {
        try {
          const { data: clientRow } = await SBLayer.supabase.from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
          if (!clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
          const { data: dv } = await SBLayer.supabase.from('devis').select('*, motos(marque, modele, plaque, clients(nom, email))').eq('id', p.id).single();
          if (!dv) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
          const { data: motoCheck } = await SBLayer.supabase.from('motos').select('id').eq('id', dv.moto_id).eq('client_id', clientRow.id).limit(1).single();
          if (!motoCheck) return fail(res, 'Permission refusée', 403, 'FORBIDDEN');
          if (dv.statut === 'brouillon') return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
          return ok(res, { devis: dv, moto: dv.motos, totaux: SBLayer.Devis._calcTotaux(dv) });
        } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
      }
      // ── RAM fallback ──
      const cli = DB.clients.find(function(c){ return c.auth_user_id === ctx.user_id; });
      if (!cli) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const dvC = DB.devis.find(function(d){ return d.id === p.id; });
      if (!dvC) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
      const motoC = DB.motos.find(function(x){ return x.id === dvC.moto_id && x.client_id === cli.id; });
      if (!motoC) return fail(res, 'Permission refusée', 403, 'FORBIDDEN');
      if (dvC.statut === 'brouillon') return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
      return ok(res, { devis: dvC, moto: motoC, totaux: calcDevis(dvC) });
    }

    // MECANO+ : accès garage normal
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const dv = await SBLayer.Devis.getById(p.id, garageId);
        return ok(res, { devis: dv, moto: dv.motos, totaux: SBLayer.Devis._calcTotaux(dv) });
      } catch(e) { return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND'); }
    }
    // ── RAM fallback ──
    const dv = DB.devis.find(function(d){return d.id===p.id&&d.garage_id===garageId;});
    if(!dv) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    const m  = DB.motos.find(function(x){return x.id===dv.moto_id;});
    const c  = DB.clients.find(function(x){return x.id===(m?m.client_id:null);});
    const {password:_,...cd} = c||{};
    return ok(res,{devis:dv,moto:m,client:cd,totaux:calcDevis(dv)});
  }

  if((p=M('PUT','/devis/:id'))!==null){
    // RBAC: MECANO minimum
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const { data: current } = await SBLayer.supabase.from('devis').select('statut').eq('id', p.id).eq('garage_id', garageId).single();
        if (!current) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
        if (current.statut !== 'brouillon') return fail(res, 'Devis déjà envoyé — créez un nouveau devis pour modifier', 400, 'INVALID_STATUS');
        const dv = await SBLayer.Devis.update(p.id, garageId, { entete: b.entete, lignes: b.lignes });
        return ok(res, { devis: dv }, 'Devis mis à jour');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const i = DB.devis.findIndex(function(d){return d.id===p.id&&d.garage_id===garageId;});
    if(i<0) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    if(DB.devis[i].statut!=='brouillon') return fail(res,'Devis déjà envoyé — créez un nouveau devis pour modifier',400,'INVALID_STATUS');
    DB.devis[i] = Object.assign({},DB.devis[i],b,{id:p.id,garage_id:garageId,updated_at:nowISO()});
    return ok(res,{devis:DB.devis[i],totaux:calcDevis(DB.devis[i])},'Devis mis à jour');
  }

  if((p=M('POST','/devis/:id/envoyer'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const dv = await SBLayer.Devis.envoyer(p.id, garageId);
        // client_id est une colonne snapshot directe sur `devis` (schéma réel live) — fallback
        // sur la jointure motos.client_id si absent pour compat avec d'anciennes lignes.
        const pushClientId = dv.client_id || (dv.motos && dv.motos.client_id);
        if (pushClientId) {
          pushService.sendPush(pushClientId, {
            title: 'Nouveau devis reçu',
            body: `Un devis (${dv.numero}) vous a été envoyé.`,
            data: { type: 'devis_recu', devisId: dv.id }
          }, `devis-envoye-${dv.id}`).catch(() => {});
        }
        return ok(res, { devis: dv }, 'Devis envoyé au client');
      } catch(e) { return fail(res, e.message, 400, 'INVALID_STATUS'); }
    }
    // ── RAM fallback ──
    const i = DB.devis.findIndex(function(d){return d.id===p.id&&d.garage_id===garageId;});
    if(i<0) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    if(DB.devis[i].statut!=='brouillon') return fail(res,'Ce devis a déjà été envoyé',400,'INVALID_STATUS');
    DB.devis[i].statut='envoye'; DB.devis[i].updated_at=nowISO();
    const mRam = DB.motos.find(function(x){return x.id===DB.devis[i].moto_id;});
    if (mRam && mRam.client_id) {
      pushService.sendPush(mRam.client_id, {
        title: 'Nouveau devis reçu',
        body: `Un devis (${DB.devis[i].numero}) vous a été envoyé.`,
        data: { type: 'devis_recu', devisId: DB.devis[i].id }
      }, `devis-envoye-${DB.devis[i].id}`).catch(() => {});
    }
    return ok(res,{devis:DB.devis[i]},'Devis envoyé au client');
  }

  if((p=M('POST','/devis/:id/valider'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});

    // CLIENT : validation propriétaire
    if (rbac.requireAnyRole(ctx, ['CLIENT'])) {
      if (USE_SUPABASE && SBLayer) {
        try {
          const { data: clientRow } = await SBLayer.supabase.from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
          if (!clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
          const { data: dvC } = await SBLayer.supabase.from('devis').select('id, moto_id, garage_id, statut').eq('id', p.id).single();
          if (!dvC) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
          const { data: motoCheck } = await SBLayer.supabase.from('motos').select('id').eq('id', dvC.moto_id).eq('client_id', clientRow.id).limit(1).single();
          if (!motoCheck) return fail(res, 'Permission refusée', 403, 'FORBIDDEN');
          if (dvC.statut !== 'envoye') return fail(res, 'Ce devis ne peut pas être validé (statut: ' + dvC.statut + ')', 400, 'INVALID_STATUS');
          const result = await SBLayer.Devis.valider(p.id, dvC.garage_id);
          return ok(res, result, 'Devis validé · Intervention créée · Client synchronisé');
        } catch(e) { return fail(res, e.message, 400, 'ERROR'); }
      }
      // ── RAM fallback ──
      const cli = DB.clients.find(function(c){ return c.auth_user_id === ctx.user_id; });
      if (!cli) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const ic = DB.devis.findIndex(function(d){ return d.id === p.id; });
      if (ic < 0) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
      const dvR = DB.devis[ic];
      const motoC = DB.motos.find(function(x){ return x.id === dvR.moto_id && x.client_id === cli.id; });
      if (!motoC) return fail(res, 'Permission refusée', 403, 'FORBIDDEN');
      if (dvR.statut !== 'envoye') return fail(res, 'Ce devis ne peut pas être validé (statut: ' + dvR.statut + ')', 400, 'INVALID_STATUS');
      DB.devis[ic].statut = 'accepte'; DB.devis[ic].date_acceptation = nowISO(); DB.devis[ic].updated_at = nowISO();
      const totC = calcDevis(DB.devis[ic]);
      const interC = {id:'int-'+uid(),moto_id:dvR.moto_id,garage_id:dvR.garage_id,type:'bleu',titre:'Facture '+dvR.numero,description:(dvR.lignes||[]).map(function(l){return l.desc||l.description||'';}).join(', '),km:motoC?motoC.km:0,date:todayFR(),score_confiance:96,montant_ht:totC.base_ht,devis_id:p.id,created_at:nowISO()};
      DB.interventions.push(interC);
      const sc = calcScore(DB.interventions.filter(function(x){return x.moto_id===dvR.moto_id;}));
      const mi = DB.motos.findIndex(function(x){return x.id===dvR.moto_id;});
      if(mi>=0){DB.motos[mi].score=sc;DB.motos[mi].couleur_dossier=couleur(sc);}
      return ok(res,{devis:DB.devis[ic],totaux:totC,intervention_creee:interC,nouveau_score:sc},'Devis validé · Intervention créée · Client synchronisé');
    }

    // MECANO+ : validation garage
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.Devis.valider(p.id, garageId);
        return ok(res, result, 'Devis validé · Intervention créée · Client synchronisé');
      } catch(e) { return fail(res, e.message, 400, 'ERROR'); }
    }
    // ── RAM fallback ──
    const i = DB.devis.findIndex(function(d){return d.id===p.id&&d.garage_id===garageId;});
    if(i<0) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    if(DB.devis[i].statut==='accepte') return fail(res,'Devis déjà validé');
    DB.devis[i].statut='accepte'; DB.devis[i].date_acceptation=nowISO(); DB.devis[i].updated_at=nowISO();
    const tot = calcDevis(DB.devis[i]);
    const m   = DB.motos.find(function(x){return x.id===DB.devis[i].moto_id;});
    const inter = {id:'int-'+uid(),moto_id:DB.devis[i].moto_id,garage_id:garageId,type:'bleu',titre:'Facture '+DB.devis[i].numero,description:(DB.devis[i].lignes||[]).map(function(l){return l.desc||l.description||'';}).join(', '),km:m?m.km:0,date:todayFR(),score_confiance:96,montant_ht:tot.base_ht,devis_id:p.id,created_at:nowISO()};
    DB.interventions.push(inter);
    const allIs = DB.interventions.filter(function(x){return x.moto_id===DB.devis[i].moto_id;});
    const sc = calcScore(allIs);
    const mi = DB.motos.findIndex(function(x){return x.id===DB.devis[i].moto_id;});
    if(mi>=0){DB.motos[mi].score=sc;DB.motos[mi].couleur_dossier=couleur(sc);}
    return ok(res,{devis:DB.devis[i],totaux:tot,intervention_creee:inter,nouveau_score:sc},'Devis validé · Intervention créée · Client synchronisé');
  }

  if((p=M('POST','/devis/:id/refuser'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});

    // CLIENT : refus propriétaire
    if (rbac.requireAnyRole(ctx, ['CLIENT'])) {
      if (USE_SUPABASE && SBLayer) {
        try {
          const { data: clientRow } = await SBLayer.supabase.from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
          if (!clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
          const { data: dvC } = await SBLayer.supabase.from('devis').select('id, moto_id, statut').eq('id', p.id).single();
          if (!dvC) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
          const { data: motoCheck } = await SBLayer.supabase.from('motos').select('id').eq('id', dvC.moto_id).eq('client_id', clientRow.id).limit(1).single();
          if (!motoCheck) return fail(res, 'Permission refusée', 403, 'FORBIDDEN');
          if (dvC.statut !== 'envoye') return fail(res, 'Ce devis ne peut pas être refusé (statut: ' + dvC.statut + ')', 400, 'INVALID_STATUS');
          const { data: updated } = await SBLayer.supabase.from('devis').update({ statut: 'refuse', date_refus: nowISO() }).eq('id', p.id).select().single();
          return ok(res, { devis: updated }, 'Devis refusé');
        } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
      }
      // ── RAM fallback ──
      const cli = DB.clients.find(function(c){ return c.auth_user_id === ctx.user_id; });
      if (!cli) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const ir = DB.devis.findIndex(function(d){ return d.id === p.id; });
      if (ir < 0) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
      const motoR = DB.motos.find(function(x){ return x.id === DB.devis[ir].moto_id && x.client_id === cli.id; });
      if (!motoR) return fail(res, 'Permission refusée', 403, 'FORBIDDEN');
      if (DB.devis[ir].statut !== 'envoye') return fail(res, 'Ce devis ne peut pas être refusé (statut: ' + DB.devis[ir].statut + ')', 400, 'INVALID_STATUS');
      DB.devis[ir].statut = 'refuse'; DB.devis[ir].date_refus = nowISO(); DB.devis[ir].updated_at = nowISO();
      return ok(res, { devis: DB.devis[ir] }, 'Devis refusé');
    }

    // MECANO+ : annulation interne
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const { data: dvG } = await SBLayer.supabase.from('devis').select('id, statut').eq('id', p.id).eq('garage_id', garageId).single();
        if (!dvG) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
        const { data: updated } = await SBLayer.supabase.from('devis').update({ statut: 'refuse', date_refus: nowISO() }).eq('id', p.id).select().single();
        return ok(res, { devis: updated }, 'Devis refusé');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const ig = DB.devis.findIndex(function(d){ return d.id === p.id && d.garage_id === garageId; });
    if (ig < 0) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
    DB.devis[ig].statut = 'refuse'; DB.devis[ig].date_refus = nowISO(); DB.devis[ig].updated_at = nowISO();
    return ok(res, { devis: DB.devis[ig] }, 'Devis refusé');
  }

  if((p=M('POST','/devis/:id/pdf'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    const dv = DB.devis.find(function(d){return d.id===p.id&&d.garage_id===garageId;});
    if(!dv) return fail(res,'Devis non trouvé',404,'NOT_FOUND');
    return ok(res,{pdf_url:'https://motokey.fr/pdf/'+p.id+'.pdf',generated_at:nowISO(),simulation:true},'PDF généré (simulation)');
  }

  /* FRAUDE */
  if((p=M('POST','/fraude/analyser'))!==null){
    // RBAC: MECANO minimum — outil métier atelier (vérification pendant OR)
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const {moto_id,garage_nom,garage_type,montant,km,description,qr_code,signature} = b;
    if(!montant||!km) return fail(res,'montant et km requis');
    const r = analyserFraude({garage_type:garage_type||'ok',qr_code:qr_code||'',signature:signature||'none',montant:parseFloat(montant),km:parseInt(km),description:description||''});
    const v = {id:'fv-'+uid(),moto_id:moto_id||null,garage:garage_nom||'Inconnu',montant,km,qr_valide:r.qr_valide,signature_valide:r.signature_valide,score:r.score,verdict:r.verdict,date:todayFR(),created_at:nowISO()};
    DB.fraude_verifications.push(v);
    return ok(res,Object.assign({},r,{verification_id:v.id}),'Analyse terminée — Score: '+r.score+'%');
  }

  if((p=M('GET','/fraude/historique'))!==null){
    // RBAC: MECANO minimum — historique des vérifications du garage
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const list = await SBLayer.Fraude.historique(garageId);
        return ok(res, { verifications: list, total: list.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return ok(res,{verifications:DB.fraude_verifications.slice().reverse(),total:DB.fraude_verifications.length});
  }

  /* TRANSFERT */
  if((p=M('POST','/transfert/initier'))!==null){
    // RBAC: PRO+ uniquement (zone admin entité) — acte juridique transfert de propriété
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    const {moto_id,acheteur_nom,acheteur_email,prix,km_cession,notes} = b;
    if(!moto_id||!acheteur_nom||!prix) return fail(res,'moto_id, acheteur_nom et prix requis');
    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.Transferts.initier(garageId, { moto_id, acheteur_nom, acheteur_email, prix, km_cession, notes });
        return ok(res, result, 'Code généré · SMS envoyé', 201);
      } catch(e) { return fail(res, e.message, 400, 'ERROR'); }
    }
    // ── RAM fallback ──
    const m = DB.motos.find(function(x){return x.id===moto_id&&x.garage_id===garageId;});
    if(!m) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
    const code = 'MK-TR-'+Math.random().toString(36).substring(2,6).toUpperCase();
    const tr   = {id:'tr-'+uid(),code,moto_id,garage_id:garageId,vendeur_id:m.client_id,acheteur_nom,acheteur_email:acheteur_email||'',prix,km_cession:km_cession||m.km,notes:notes||'',statut:'initie',expire_at:new Date(Date.now()+172800000).toISOString(),created_at:nowISO(),steps:[{etape:'initie',at:nowISO(),par:'garage'}]};
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

  // GET /client/limite-motos (CLIENT) — compteur motos + statut Pro + CTA — TODO RBAC L8
  if((p=M('GET','/client/limite-motos'))!==null){
    const ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(req, SBLayer) : null);
    if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    if (!rbac.requireAnyRole(ctx, ['CLIENT'])) return fail(res, 'Réservé aux clients', 403, 'FORBIDDEN');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
    try {
      const { data: clientRow, error: cliErr } = await SBLayer.supabase
        .from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
      if (cliErr || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const clientId = clientRow.id;

      const { count, limite, is_pro, can_add } = await SBLayer.checkLimiteMotosClient(clientId);
      return ok(res, { count, limite, is_pro, can_add, cta_pro: !is_pro && !can_add });
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }

  // POST /client/motos (CLIENT) — ajout autonome d'une moto — TODO RBAC L8
  if((p=M('POST','/client/motos'))!==null){
    const ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(req, SBLayer) : null);
    if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    if (!rbac.requireAnyRole(ctx, ['CLIENT'])) return fail(res, 'Réservé aux clients', 403, 'FORBIDDEN');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
    try {
      const { data: clientRow, error: cliErr } = await SBLayer.supabase
        .from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();

      if (cliErr || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const clientId = clientRow.id;

      const { marque, modele, annee, plaque, vin, km, mode_acquisition } = b;
      if (!marque || !modele || !plaque || !vin) return fail(res, 'marque, modele, plaque et vin requis', 400, 'VALIDATION_ERROR');

      const limite = await SBLayer.checkLimiteMotosClient(clientId);
      if (!limite.can_add) return sendJSON(res, 402, { success: false, error: { code: 'LIMIT_REACHED', message: 'Limite de motos atteinte' }, cta_pro: true, timestamp: nowISO() });

      const { data: clientFull, error: cfErr } = await SBLayer.supabase
        .from('clients').select('garage_id').eq('id', clientId).single();
      if (cfErr) throw new Error(cfErr.message);
      const clientGarageId = clientFull ? clientFull.garage_id : null;

      const { data: moto, error: motoErr } = await SBLayer.supabase
        .from('motos')
        .insert({ garage_id: clientGarageId || null, client_id: clientId, marque, modele, annee, plaque, vin, km: km || 0, proprietaire_type: 'client' })
        .select()
        .single();
      if (motoErr) throw new Error(motoErr.message);

      const today = new Date().toISOString().slice(0, 10);
      const { error: histoErr } = await SBLayer.supabase
        .from('motos_proprietaires_historique')
        .insert({ moto_id: moto.id, proprietaire_type: 'client', proprietaire_client_id: clientId, date_debut: today, mode_acquisition: mode_acquisition || 'inconnu', created_by: ctx.user_id });
      if (histoErr) {
        console.error('[POST /client/motos] historique insert failed — orphan moto risk, id:', moto.id, histoErr.message);
        await SBLayer.supabase.from('motos').delete().eq('id', moto.id);
        throw new Error(histoErr.message);
      }

      return ok(res, { moto }, null, 201);
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }

  // POST /client/reclamations (CLIENT) — réclamer une moto orpheline — TODO RBAC L8
  if((p=M('POST','/client/reclamations'))!==null){
    const ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(req, SBLayer) : null);
    if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    if (!rbac.requireAnyRole(ctx, ['CLIENT'])) return fail(res, 'Réservé aux clients', 403, 'FORBIDDEN');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
    try {
      const { data: clientRow, error: cliErr } = await SBLayer.supabase
        .from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
      if (cliErr || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const clientId = clientRow.id;

      const { vin_fourni, plaque_fournie, carte_grise_photo_url } = b;
      if (!vin_fourni || !plaque_fournie || !carte_grise_photo_url) return fail(res, 'vin_fourni, plaque_fournie et carte_grise_photo_url requis', 400, 'VALIDATION_ERROR');

      const { data: motoRows, error: motoErr } = await SBLayer.supabase
        .from('motos').select('id, proprietaire_type, client_id').eq('vin', vin_fourni).eq('plaque', plaque_fournie).limit(1);
      if (motoErr) throw new Error(motoErr.message);
      if (!motoRows || motoRows.length === 0) return fail(res, 'Moto non trouvée avec ce VIN et cette plaque', 404, 'MOTO_NOT_FOUND');
      const moto = motoRows[0];

      if (moto.client_id === clientId) return fail(res, 'Vous êtes déjà propriétaire de cette moto', 409, 'ALREADY_OWNER');

      const { data: existingClaims, error: claimErr } = await SBLayer.supabase
        .from('reclamations_moto').select('id').eq('moto_id', moto.id).eq('client_id', clientId).in('statut', ['en_attente', 'litige']);
      if (claimErr) throw new Error(claimErr.message);
      if (existingClaims && existingClaims.length > 0) return fail(res, 'Une réclamation est déjà en cours pour cette moto', 409, 'CLAIM_ALREADY_PENDING');

      const statut = (moto.proprietaire_type === 'client' && moto.client_id && moto.client_id !== clientId) ? 'litige' : 'en_attente';

      const { data: reclamation, error: insertErr } = await SBLayer.supabase
        .from('reclamations_moto')
        .insert({ moto_id: moto.id, client_id: clientId, statut, vin_fourni, plaque_fournie, carte_grise_photo_url })
        .select()
        .single();
      if (insertErr) throw new Error(insertErr.message);

      return ok(res, { reclamation }, null, 201);
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }

  // GET /client/reclamations (CLIENT) — liste des réclamations du client — TODO RBAC L8
  if((p=M('GET','/client/reclamations'))!==null){
    const ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(req, SBLayer) : null);
    if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    if (!rbac.requireAnyRole(ctx, ['CLIENT'])) return fail(res, 'Réservé aux clients', 403, 'FORBIDDEN');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
    try {
      const { data: clientRow, error: cliErr } = await SBLayer.supabase
        .from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
      if (cliErr || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const clientId = clientRow.id;

      const { data: reclamations, error } = await SBLayer.supabase
        .from('reclamations_moto')
        .select('*, motos(id, plaque, marque, modele)')
        .eq('client_id', clientId)
        .order('date_creation', { ascending: false });
      if (error) return fail(res, error.message, 500, 'DB_ERROR');
      return ok(res, { reclamations: reclamations || [], total: (reclamations || []).length });
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }

  // GET /client/garages (CLIENT) — liste des garages liés au compte client — TODO RBAC L8
  if((p=M('GET','/client/garages'))!==null){
    const ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(req, SBLayer) : null);
    if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    if (!rbac.requireAnyRole(ctx, ['CLIENT'])) return fail(res, 'Réservé aux clients', 403, 'FORBIDDEN');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
    try {
      const { data: clientRow, error: cliErr } = await SBLayer.supabase
        .from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
      if (cliErr || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const clientId = clientRow.id;

      const { data: garages, error } = await SBLayer.supabase
        .from('liaisons_client_garage')
        .select('*, garages(id, nom, email, tel, adresse, logo_url)')
        .eq('client_id', clientId)
        .order('date_creation', { ascending: false });
      if (error) return fail(res, error.message, 500, 'DB_ERROR');
      return ok(res, { garages: garages || [], total: (garages || []).length });
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }

  // DELETE /client/garages/:id (CLIENT) — quitter un garage (révocation) — TODO RBAC L8
  if((p=M('DELETE','/client/garages/:id'))!==null){
    const ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(req, SBLayer) : null);
    if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    if (!rbac.requireAnyRole(ctx, ['CLIENT'])) return fail(res, 'Réservé aux clients', 403, 'FORBIDDEN');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
    try {
      const deleteBody = await body(req).catch(() => ({}));
      const motifRevocation = (deleteBody && deleteBody.motif) || null;

      const { data: clientRow, error: cliErr } = await SBLayer.supabase
        .from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
      if (cliErr || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const clientId = clientRow.id;

      const { data: liaison, error: liaisonErr } = await SBLayer.supabase
        .from('liaisons_client_garage').select('*').eq('id', p.id).single();
      if (liaisonErr || !liaison || liaison.client_id !== clientId) return fail(res, 'Liaison non trouvée', 404, 'NOT_FOUND');
      if (liaison.statut === 'revoque_par_client') return fail(res, 'Liaison déjà révoquée', 409, 'ALREADY_REVOKED');

      const { data: updated, error: updErr } = await SBLayer.supabase
        .from('liaisons_client_garage')
        .update({ statut: 'revoque_par_client', date_revocation: new Date().toISOString(), motif_revocation: motifRevocation })
        .eq('id', p.id)
        .select()
        .single();
      if (updErr) throw new Error(updErr.message);
      return ok(res, { liaison: updated }, 'Garage quitté — votre historique reste conservé (obligations légales)');
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }

  // POST /client/device-tokens (CLIENT) — enregistre/réassigne un device token push Expo
  if((p=M('POST','/client/device-tokens'))!==null){
    const ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(req, SBLayer) : null);
    if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    if (!rbac.requireAnyRole(ctx, ['CLIENT'])) return fail(res, 'Réservé aux clients', 403, 'FORBIDDEN');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
    try {
      const { data: clientRow, error: cliErr } = await SBLayer.supabase
        .from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
      if (cliErr || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const clientId = clientRow.id;

      const { token, platform } = b;
      if (!token || !isExpoPushToken(token)) return fail(res, 'token Expo valide requis', 400, 'VALIDATION_ERROR');
      if (!platform || !['ios', 'android'].includes(platform)) return fail(res, "platform 'ios' ou 'android' requis", 400, 'VALIDATION_ERROR');

      const { data: deviceToken, error: dtErr } = await SBLayer.supabase
        .from('client_device_tokens')
        .upsert({ client_id: clientId, token, platform, last_used_at: nowISO() }, { onConflict: 'token' })
        .select().single();
      if (dtErr) throw new Error(dtErr.message);

      return ok(res, { device_token: deviceToken }, null, 201);
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }

  // DELETE /client/device-tokens (CLIENT) — désenregistre un device token précis (simule un logout)
  if((p=M('DELETE','/client/device-tokens'))!==null){
    const ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(req, SBLayer) : null);
    if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    if (!rbac.requireAnyRole(ctx, ['CLIENT'])) return fail(res, 'Réservé aux clients', 403, 'FORBIDDEN');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
    try {
      const deleteBody = await body(req).catch(() => ({}));
      const token = deleteBody && deleteBody.token;
      if (!token) return fail(res, 'token requis', 400, 'VALIDATION_ERROR');

      const { data: clientRow, error: cliErr } = await SBLayer.supabase
        .from('clients').select('id').eq('auth_user_id', ctx.user_id).limit(1).single();
      if (cliErr || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');
      const clientId = clientRow.id;

      const { data: deleted, error: delErr } = await SBLayer.supabase
        .from('client_device_tokens')
        .delete()
        .eq('token', token)
        .eq('client_id', clientId)
        .select();
      if (delErr) throw new Error(delErr.message);
      if (!deleted || deleted.length === 0) return fail(res, 'Device token non trouvé', 404, 'NOT_FOUND');

      return ok(res, { deleted: true }, null, 200);
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }

  // GET /client/me (CLIENT) — profil du client authentifié (comble le gap /auth/me)
  if((p=M('GET','/client/me'))!==null){
    const ctx = req.ctx || (SBLayer ? await rbac.extractRoleFromRequest(req, SBLayer) : null);
    if (!ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    if (!rbac.requireAnyRole(ctx, ['CLIENT'])) return fail(res, 'Réservé aux clients', 403, 'FORBIDDEN');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
    try {
      const { data: clientRow, error: cliErr } = await SBLayer.supabase
        .from('clients')
        .select('id, nom, email, tel, garage_id, created_at, garages(nom)')
        .eq('auth_user_id', ctx.user_id)
        .single();
      if (cliErr || !clientRow) return fail(res, 'Client introuvable', 404, 'NOT_FOUND');

      return ok(res, {
        id: clientRow.id,
        nom: clientRow.nom,
        email: clientRow.email,
        tel: clientRow.tel,
        garage_id: clientRow.garage_id,
        garage_nom: clientRow.garages ? clientRow.garages.nom : null,
        client_depuis: clientRow.created_at
      });
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }

  /* PARAMS & STATS */
  if((p=M('GET','/params'))!==null){
    // RBAC: MECANO minimum — lecture paramètres garage
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const g = await SBLayer.Garages.getById(garageId);
        return ok(res, { params: g });
      } catch(e) { return fail(res, 'Garage non trouvé', 404, 'NOT_FOUND'); }
    }
    // ── RAM fallback ──
    const g = DB.garages.find(function(x){return x.id===garageId;});
    if(!g) return fail(res,'Garage non trouvé',404,'NOT_FOUND');
    const {password:_,...gd} = g;
    return ok(res,{params:gd});
  }

  if((p=M('PUT','/params'))!==null){
    // RBAC: MECANO minimum — mise à jour paramètres garage
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const g = await SBLayer.Garages.update(garageId, b);
        return ok(res, { params: g }, 'Paramètres mis à jour');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const i = DB.garages.findIndex(function(x){return x.id===garageId;});
    if(i<0) return fail(res,'Garage non trouvé',404,'NOT_FOUND');
    ['nom','tel','adresse','siret','taux_std','taux_spec','tva','techniciens'].forEach(function(k){if(b[k]!==undefined)DB.garages[i][k]=b[k];});
    const {password:_,...gd} = DB.garages[i];
    return ok(res,{params:gd},'Paramètres mis à jour');
  }

  if((p=M('GET','/stats'))!==null){
    // RBAC: MECANO minimum — tableau de bord garage
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const stats = await SBLayer.Garages.getStats(garageId);
        return ok(res, stats);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    // ── RAM fallback ──
    const ms = DB.motos.filter(function(m){return m.garage_id===garageId;});
    const co = {vert:0,bleu:0,jaune:0,rouge:0};
    ms.forEach(function(m){co[m.couleur_dossier]=(co[m.couleur_dossier]||0)+1;});
    const is  = DB.interventions.filter(function(i){return i.garage_id===garageId;});
    const dvs = DB.devis.filter(function(d){return d.garage_id===garageId;});
    const ca  = dvs.filter(function(d){return d.statut==='accepte';}).reduce(function(s,d){return s+calcDevis(d).total_ttc;},0);
    return ok(res,{
      motos:{total:ms.length,par_couleur:co},
      interventions:{total:is.length,par_type:{vert:is.filter(function(i){return i.type==='vert';}).length,bleu:is.filter(function(i){return i.type==='bleu';}).length,jaune:is.filter(function(i){return i.type==='jaune';}).length,rouge:is.filter(function(i){return i.type==='rouge';}).length}},
      devis:{total:dvs.length,valides:dvs.filter(function(d){return d.statut==='accepte';}).length,ca_ttc:+ca.toFixed(2),ca_ht:+(ca/1.2).toFixed(2)},
      transferts:{total:DB.transferts.filter(function(t){return t.garage_id===garageId;}).length,finalises:DB.transferts.filter(function(t){return t.garage_id===garageId&&t.statut==='finalise';}).length},
      fraude:{total:DB.fraude_verifications.length,authentifiees:DB.fraude_verifications.filter(function(f){return f.verdict==='authentifie';}).length,suspectes:DB.fraude_verifications.filter(function(f){return f.verdict==='fraude_suspectee';}).length}
    });
  }

  /* ── ENTITÉS DE FACTURATION ── */

  // GET /entites-facturation — liste les entités de facturation du garage connecté
  if((p=M('GET','/entites-facturation'))!==null){
    // RBAC: PRO+ uniquement (zone admin entité) — raison sociale, SIRET, RIB
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if(USE_SUPABASE && SBLayer){
      const { data, error } = await SBLayer.supabase
        .from('entites_facturation')
        .select('*')
        .eq('garage_id', garageId)
        .order('created_at', { ascending: false });
      if(error) return fail(res, error.message, 500, 'DB_ERROR');
      return ok(res, data || []);
    }
    return ok(res, []);
  }

  /* ── SESSION POLICY ── */

  if((p=M('GET','/garage/session-policy'))!==null){
    // RBAC: tous rôles authentifiés du garage (lecture seule)
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const g = await SBLayer.Garages.getById(garageId);
        return ok(res, { mecano_session_timeout_minutes: g.mecano_session_timeout_minutes || 60 });
      } catch(e) { return fail(res, 'Garage non trouvé', 404, 'NOT_FOUND'); }
    }
    const g = DB.garages.find(function(x){return x.id===garageId;});
    return ok(res, { mecano_session_timeout_minutes: (g && g.mecano_session_timeout_minutes) || 60 });
  }

  if((p=M('PATCH','/garage/session-policy'))!==null){
    // RBAC: PRO+ uniquement — MECANO ne peut pas modifier sa propre politique de session
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    const { mecano_session_timeout_minutes } = b;
    if (![15, 60, 480].includes(mecano_session_timeout_minutes)) {
      return fail(res, 'mecano_session_timeout_minutes doit être 15, 60 ou 480', 400, 'INVALID_INPUT');
    }
    if (USE_SUPABASE && SBLayer) {
      try {
        const g = await SBLayer.Garages.update(garageId, { mecano_session_timeout_minutes });
        return ok(res, { mecano_session_timeout_minutes: g.mecano_session_timeout_minutes }, 'Politique de session mise à jour');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    const i = DB.garages.findIndex(function(x){return x.id===garageId;});
    if (i<0) return fail(res, 'Garage non trouvé', 404, 'NOT_FOUND');
    DB.garages[i].mecano_session_timeout_minutes = mecano_session_timeout_minutes;
    return ok(res, { mecano_session_timeout_minutes }, 'Politique de session mise à jour');
  }

  /* ── BILLING (Phase 5) ── */

  // GET /billing/status (PRO+) — statut abonnement du garage
  if ((p = M('GET', '/billing/status')) !== null) {
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        let g = await SBLayer.Garages.getById(garageId);

        // Auto-trial : si BILLING_ENFORCE=true et aucun plan, créer un trial silencieusement
        const BILLING_ENFORCE = process.env.BILLING_ENFORCE === 'true';
        if (BILLING_ENFORCE && !g.plan_code && stripeClient) {
          await createAutoTrial(garageId, ctx.email, g.nom, SBLayer).catch(e =>
            console.error('[billing] auto-trial échoué :', e.message)
          );
          g = await SBLayer.Garages.getById(garageId);
        }

        // Counts actuels pour l'affichage des quotas restants
        const [motosRes, usersRes] = await Promise.all([
          SBLayer.supabase.from('motos').select('id', { count: 'exact', head: true }).eq('garage_id', garageId),
          SBLayer.supabase.from('garage_users').select('id', { count: 'exact', head: true }).eq('garage_id', garageId).eq('actif', true),
        ]);

        return ok(res, {
          ...buildBillingStatus(g),
          motos_count: motosRes.count ?? null,
          users_count: usersRes.count ?? null,
        }, 'Statut abonnement');
      } catch (e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return ok(res, { plan_code: null, subscription_status: null }, 'Statut abonnement (mode RAM)');
  }

  // POST /billing/portal (PRO+) — génère un lien one-time vers le Customer Portal Stripe
  if ((p = M('POST', '/billing/portal')) !== null) {
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
    if (!stripeClient) return fail(res, 'Stripe non configuré', 503, 'STRIPE_UNAVAILABLE');

    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable', 404, 'NOT_FOUND');

    let stripeCustomerId = null;
    if (USE_SUPABASE && SBLayer) {
      try {
        const g = await SBLayer.Garages.getById(garageId);
        stripeCustomerId = g.stripe_customer_id || null;
      } catch (_) {}
    }
    if (!stripeCustomerId) return fail(res, 'Aucun abonnement Stripe trouvé pour ce garage', 404, 'NO_SUBSCRIPTION');

    try {
      const baseUrl  = process.env.FRONTEND_URL || 'https://motokey11-production.up.railway.app';
      const session  = await createPortalSession(stripeCustomerId, `${baseUrl}/app?section=params`);
      return ok(res, { url: session.url }, 'Session portail créée');
    } catch (e) { return fail(res, e.message, 500, 'STRIPE_ERROR'); }
  }

  // POST /billing/checkout (PRO+) — crée une session Stripe Checkout et retourne l'URL
  if ((p = M('POST', '/billing/checkout')) !== null) {
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
    if (!stripeClient) return fail(res, 'Stripe non configuré', 503, 'STRIPE_UNAVAILABLE');

    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable', 404, 'NOT_FOUND');

    const { plan_key, period } = b;
    if (!plan_key || !['solo', 'atelier', 'concession'].includes(plan_key))
      return fail(res, 'plan_key invalide (solo|atelier|concession)', 400, 'INVALID_PLAN');
    if (!period || !['monthly', 'annual'].includes(period))
      return fail(res, 'period invalide (monthly|annual)', 400, 'INVALID_PERIOD');

    let stripeCustomerId = null;
    if (USE_SUPABASE && SBLayer) {
      try {
        const g = await SBLayer.Garages.getById(garageId);
        stripeCustomerId = g.stripe_customer_id || null;
      } catch (_) {}
    }

    try {
      const baseUrl = process.env.FRONTEND_URL || 'https://motokey11-production.up.railway.app';
      const session = await createCheckoutSession(garageId, plan_key, period, stripeCustomerId, baseUrl);
      return ok(res, { url: session.url, session_id: session.id }, 'Session Checkout créée');
    } catch (e) { return fail(res, e.message, 500, 'STRIPE_ERROR'); }
  }

  /* ── GESTION USERS GARAGE (L4 v2 hardening) ── */

  // GET /garage/users (PRO+) — liste des users du garage
  if((p=M('GET','/garage/users'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const users = await SBLayer.GarageUsers.list(garageId);
        return ok(res, { users, total: users.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return ok(res, { users: [], total: 0 });
  }

  // POST /garage/users (PRO+) — créer un compte MECANO ou PRO
  if((p=M('POST','/garage/users'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    try { await planLimits.assertUsersLimit(garageId, SBLayer); }
    catch (e) { return fail(res, e.message, e.statusCode || 500, e.code || 'ERROR'); }

    const { email, password, role } = b;
    if (!email || !password || !role) return fail(res, 'email, password et role requis', 400, 'MISSING_FIELDS');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'Format email invalide', 400, 'INVALID_EMAIL');
    if (password.length < 8) return fail(res, 'Mot de passe minimum 8 caractères', 400, 'WEAK_PASSWORD');
    if (!['PRO', 'MECANO'].includes(role)) return fail(res, 'role doit être PRO ou MECANO', 400, 'INVALID_ROLE');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis pour cette opération', 503, 'SERVICE_UNAVAILABLE');
    try {
      const user = await SBLayer.GarageUsers.create({ garageId, email, password, role, createdBy: ctx.user_id });
      return ok(res, user, 'Utilisateur créé', 201);
    } catch(e) {
      const status = e.message.includes('already registered') || e.message.includes('already been registered') ? 409 : 400;
      return fail(res, e.message, status, status === 409 ? 'DUPLICATE' : 'ERROR');
    }
  }

  // PATCH /garage/users/:id (PRO+) — modifier rôle ou actif
  if((p=M('PATCH','/garage/users/:id'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    const { role, actif } = b;
    if (role === undefined && actif === undefined) return fail(res, 'role ou actif requis', 400, 'MISSING_FIELDS');
    if (role !== undefined && !['PRO', 'MECANO'].includes(role)) return fail(res, 'role doit être PRO ou MECANO', 400, 'INVALID_ROLE');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis pour cette opération', 503, 'SERVICE_UNAVAILABLE');
    try {
      const updated = await SBLayer.GarageUsers.update(p.id, garageId, { role, actif });
      return ok(res, updated, 'Utilisateur mis à jour');
    } catch(e) { return fail(res, e.message, e.message.includes('introuvable') ? 404 : 500, e.message.includes('introuvable') ? 'NOT_FOUND' : 'DB_ERROR'); }
  }

  // DELETE /garage/users/:id (PRO+) — soft delete (actif = false)
  if((p=M('DELETE','/garage/users/:id'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (!USE_SUPABASE || !SBLayer) return fail(res, 'Supabase requis pour cette opération', 503, 'SERVICE_UNAVAILABLE');
    try {
      await SBLayer.GarageUsers.softDelete(p.id, garageId);
      return ok(res, { id: p.id, actif: false }, 'Utilisateur désactivé');
    } catch(e) { return fail(res, e.message, e.message.includes('introuvable') ? 404 : 500, e.message.includes('introuvable') ? 'NOT_FOUND' : 'DB_ERROR'); }
  }

  // GET /garage/reclamations (PRO+) — réclamations en attente pour ce garage — TODO RBAC L8
  if((p=M('GET','/garage/reclamations'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        // TODO RBAC L8
        // Passe 1 : récupérer les IDs de motos appartenant à ce garage
        const { data: motoRows, error: motoErr } = await SBLayer.supabase
          .from('motos').select('id').eq('garage_id', garageId);
        if (motoErr) return fail(res, motoErr.message, 500, 'DB_ERROR');
        const motoIds = (motoRows || []).map(function(m){ return m.id; });
        if (!motoIds.length) return ok(res, { reclamations: [], total: 0 });

        // Passe 2 : réclamations en attente pour ces motos
        const { data: rows, error } = await SBLayer.supabase
          .from('reclamations_moto')
          .select('*, motos(id, plaque, marque, modele), clients(nom, email, tel)')
          .in('moto_id', motoIds)
          .eq('statut', 'en_attente')
          .order('date_creation', { ascending: false });
        if (error) return fail(res, error.message, 500, 'DB_ERROR');
        return ok(res, { reclamations: rows || [], total: (rows || []).length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
  }

  // PATCH /garage/reclamations/:id (PRO+) — accepter ou refuser une réclamation — TODO RBAC L8
  if((p=M('PATCH','/garage/reclamations/:id'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const { statut, motif_refus } = b;
        if (!statut || !['accepte', 'refuse'].includes(statut)) return fail(res, 'statut doit être "accepte" ou "refuse"', 400, 'VALIDATION_ERROR');
        // Charger la réclamation et vérifier l'appartenance au garage
        const { data: reclamation, error: recErr } = await SBLayer.supabase
          .from('reclamations_moto')
          .select('*, motos!inner(id, plaque, garage_id)')
          .eq('id', p.id)
          .single();
        if (recErr || !reclamation) return fail(res, 'Réclamation non trouvée', 404, 'NOT_FOUND');
        if (reclamation.motos.garage_id !== garageId) return fail(res, 'Réclamation hors périmètre garage', 403, 'FORBIDDEN');
        if (reclamation.statut !== 'en_attente') {
          return fail(res, 'Réclamation déjà traitée (statut: ' + reclamation.statut + ')', 409, 'CONFLICT');
        }
        const now = new Date().toISOString();
        if (statut === 'refuse') {
          const { data: updated, error: updErr } = await SBLayer.supabase
            .from('reclamations_moto')
            .update({ statut: 'refuse', date_resolution: now, resolu_par: ctx.user_id, motif_refus: motif_refus || null })
            .eq('id', p.id)
            .select()
            .single();
          if (updErr) throw new Error(updErr.message);
          return ok(res, { reclamation: updated }, 'Réclamation refusée');
        } else {
          // accepte : cession moto + liaison client + update réclamation
          await SBLayer.cessionMoto(reclamation.moto_id, { type: 'client', id: reclamation.client_id }, 'achat_occasion', ctx.user_id);
          const { data: liaison } = await SBLayer.supabase.from('liaisons_client_garage').select('id, statut').eq('client_id', reclamation.client_id).eq('garage_id', garageId).maybeSingle();
          if (!liaison) {
            await SBLayer.supabase.from('liaisons_client_garage').insert({ client_id: reclamation.client_id, garage_id: garageId, statut: 'actif' });
          } else if (liaison.statut !== 'actif') {
            await SBLayer.supabase.from('liaisons_client_garage').update({ statut: 'actif' }).eq('id', liaison.id);
          }
          const { data: updated, error: updErr } = await SBLayer.supabase
            .from('reclamations_moto')
            .update({ statut: 'accepte', date_resolution: now, resolu_par: ctx.user_id })
            .eq('id', p.id)
            .select()
            .single();
          if (updErr) throw new Error(updErr.message);
          return ok(res, { reclamation: updated }, 'Réclamation acceptée');
        }
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
  }

  // GET /garage/clients (MECANO+) — liste clients liés à ce garage (actifs + révoqués) — TODO RBAC L8
  if((p=M('GET','/garage/clients'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const { data: liaisons, error } = await SBLayer.supabase
          .from('liaisons_client_garage')
          .select('*, clients(id, nom, email, tel, created_at)')
          .eq('garage_id', garageId)
          .order('date_creation', { ascending: false });
        if (error) throw new Error(error.message);
        const clients = (liaisons || []).map(function(l) {
          return Object.assign({}, l, { a_quitte: l.statut !== 'actif' });
        });
        return ok(res, { clients, total: clients.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return fail(res, 'Supabase requis', 503, 'SERVICE_UNAVAILABLE');
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
  // RBAC L4 : rôles définis — voir commentaire RBAC dans chaque handler ci-dessous.

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
    // RBAC: endpoint public — tout visiteur peut s'inscrire.
    // Le rôle CLIENT est assigné automatiquement après signUp réussi.
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
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
        // Assigner le rôle CLIENT dans app_metadata (non falsifiable côté client).
        // Si cet update échoue, le signUp reste valide — le user pourra se connecter
        // mais n'aura pas de rôle jusqu'à correction manuelle.
        const { error: roleErr } = await sbSvc().auth.admin.updateUserById(
          data.user.id,
          { app_metadata: { role: 'CLIENT' } }
        );
        if (roleErr) {
          console.warn('[7b] register: role assignment failed for', data.user.id, '—', roleErr.message);
        }

        // Lier auth_user_id sur le profil clients existant, ou créer un nouveau
        // (garage_id nullable requis — cf. migration 07b-pivot-migration.sql)
        const garageId = req.headers['x-garage-id'] || null;
        const rows = await sbRequest('GET',
          `/clients?email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
        if (Array.isArray(rows) && rows.length > 0) {
          await sbRequest('PATCH', `/clients?id=eq.${rows[0].id}`,
            { auth_user_id: data.user.id, nom: nom.trim(), tel: tel || null });
          console.log('[7b] register: match email → client existant lié', rows[0].id, 'pour', email);
        } else {
          await sbRequest('POST', '/clients', {
            auth_user_id: data.user.id,
            email:        email.toLowerCase().trim(),
            nom:          nom.trim(),
            tel:          tel || null,
            garage_id:    garageId
          });
        }

        // Email de bienvenue — fire-and-forget, n'impacte pas la réponse
        const prenom = (nom.trim().split(' ')[0]) || nom.trim();
        emailService.send('welcome', email, { prenom, email }).catch(function(e) {
          console.error('[7b] welcome email failed:', e.message);
        });
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
    // RBAC: endpoint public — la vérification OTP ne requiert pas d'être authentifié.
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
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
    // RBAC: endpoint public — les credentials suffisent pour s'authentifier.
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
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
    // RBAC: endpoint public — le refresh_token est l'unique preuve d'identité requise.
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
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
    // RBAC: authentifié, tous rôles OK — le Bearer est utilisé pour révoquer la session.
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
  // Dépend du SMTP Supabase (Dashboard → Authentication → Email Templates).
  // Le template "Reset Password" doit utiliser {{ .Token }} pour envoyer le code OTP au client.
  // SMTP par défaut Supabase rate-limité à ~3 emails/heure — config SMTP custom requise en prod.
  if ((p = M('POST', '/auth/client/password-reset')) !== null) {
    // RBAC: endpoint public — anti-énumération oblige, aucune auth requise.
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
    const { email } = b;
    if (!email) return fail(res, 'Champ requis : email', 400, 'MISSING_FIELDS');

    const appUrl = process.env.APP_URL || 'https://motokey.app';
    try {
      const { error } = await sbPub().auth.resetPasswordForEmail(email, {
        redirectTo: appUrl + '/reset-password'
      });
      if (error) console.error('[password-reset] Supabase error:', error.message);
      else        console.log('[password-reset] Email déclenché pour:', email);
    } catch (e) {
      console.error('[password-reset] Exception inattendue:', e.message);
    }

    // Anti-énumération : même réponse que l'email existe ou non
    return ok(res, { message: 'Si ce compte existe, un email de réinitialisation a été envoyé.' });
  }

  // ── POST /auth/client/password-reset/confirm ──────────
  // Accepte deux flux :
  //   1. OTP  : { email, code, new_password }       → verifyOtp(type:'recovery')
  //   2. Link : { access_token, new_password }       → getUser(access_token)
  if ((p = M('POST', '/auth/client/password-reset/confirm')) !== null) {
    // RBAC: endpoint public — le code OTP ou le token de recovery tient lieu d'auth.
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
    const { email, code, access_token, new_password } = b;
    if (!new_password || (!code && !access_token)) {
      return fail(res, 'Champs requis : new_password + (code+email ou access_token)', 400, 'MISSING_FIELDS');
    }

    let userId;
    if (code && email) {
      // Flux OTP recovery (Supabase envoie un code à 6-8 chiffres par email)
      const { data, error: otpErr } = await sbPub().auth.verifyOtp({ email, token: String(code), type: 'recovery' });
      if (otpErr || !data?.user) return fail(res, 'Code invalide ou expiré', 400, 'INVALID_TOKEN');
      userId = data.user.id;
    } else {
      // Flux lien (access_token JWT de recovery extrait de l'URL du lien email)
      const { data: { user }, error: userErr } = await sbSvc().auth.getUser(access_token);
      if (userErr || !user) return fail(res, 'Token invalide ou expiré', 400, 'INVALID_TOKEN');
      userId = user.id;
    }

    const { error } = await sbSvc().auth.admin.updateUserById(userId, { password: new_password });
    if (error) return fail(res, 'Impossible de mettre à jour le mot de passe', 500, 'SERVER_ERROR');

    return ok(res, { message: 'Mot de passe mis à jour — reconnectez-vous' });
  }

  // ── POST /auth/password-reset/garage ──────────────────────
  // Endpoint public — demande de réinitialisation mot de passe compte garage.
  // Anti-énumération : répond toujours succès, que l'email existe ou non.
  if ((p = M('POST', '/auth/password-reset/garage')) !== null) {
    // RBAC: endpoint public — l'utilisateur a oublié son mot de passe, aucune auth possible.
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
    const { email } = b;
    if (!email) return fail(res, 'Champ requis : email', 400, 'MISSING_FIELDS');

    const appUrl = process.env.APP_URL || 'https://motokey11-production.up.railway.app';
    try {
      await sbPub().auth.resetPasswordForEmail(email, {
        redirectTo: appUrl + '/reset-password'
      });
    } catch (e) {
      console.error('[pwd-reset garage]', e.message);
    }

    // Anti-énumération : même réponse que l'email existe ou non
    return ok(res, { message: 'Si ce compte existe, un email de réinitialisation a été envoyé.' });
  }

  // ── POST /auth/password-reset/garage/confirm ──────────────
  // Endpoint public — confirmation OTP + nouveau mot de passe pour compte garage.
  if ((p = M('POST', '/auth/password-reset/garage/confirm')) !== null) {
    // RBAC: endpoint public — le code OTP tient lieu d'auth.
    if (!SBLayer) return fail(res, 'Supabase non configuré', 503, 'SERVICE_UNAVAILABLE');
    const { email, code, new_password } = b;
    if (!email || !code || !new_password) {
      return fail(res, 'Champs requis : email, code, new_password', 400, 'MISSING_FIELDS');
    }
    if (String(new_password).length < 8) {
      return fail(res, 'Mot de passe : 8 caractères minimum', 400, 'WEAK_PASSWORD');
    }

    const { data, error: otpErr } = await sbPub().auth.verifyOtp({ email, token: String(code), type: 'recovery' });
    if (otpErr || !data?.user) return fail(res, 'Code invalide ou expiré', 400, 'INVALID_TOKEN');

    const { error } = await sbSvc().auth.admin.updateUserById(data.user.id, { password: new_password });
    if (error) return fail(res, 'Impossible de mettre à jour le mot de passe', 500, 'SERVER_ERROR');

    return ok(res, { message: 'Mot de passe mis à jour — reconnectez-vous' });
  }

  /* ─── LIVRAISON 3A : ORDRES DE RÉPARATION ─── */

  if((p=M('GET','/ordres-reparation'))!==null){
    // RBAC: MECANO minimum — outil garage
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    const filters = { statut: query.statut, moto_id: query.moto_id };

    if (USE_SUPABASE && SBLayer) {
      try {
        const ordres = await SBLayer.OrdresReparation.list(garageId, filters);
        return ok(res, { ordres, total: ordres.length });
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    let ordres = (DB.ordres_reparation||[]).filter(function(o){ return o.garage_id===garageId; });
    if (filters.statut)   ordres = ordres.filter(function(o){ return o.statut===filters.statut; });
    if (filters.moto_id)  ordres = ordres.filter(function(o){ return o.moto_id===filters.moto_id; });
    ordres.sort(function(a,b){ return b.created_at.localeCompare(a.created_at); });
    return ok(res, { ordres, total: ordres.length });
  }

  if((p=M('POST','/ordres-reparation'))!==null){
    // RBAC: MECANO minimum — création OR réservée PRO et au-dessus
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    const { moto_id, devis_id, technicien_id, km_entree, notes_atelier, notes_client } = b;
    if (!moto_id) return fail(res, 'moto_id requis');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.OrdresReparation.create(garageId, { moto_id, devis_id, technicien_id, km_entree, notes_atelier, notes_client });
        return ok(res, result, 'Ordre de réparation créé', 201);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    const m = DB.motos.find(function(x){ return x.id===moto_id && x.garage_id===garageId; });
    if (!m) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
    DB.ordres_reparation = DB.ordres_reparation || [];
    const numero_or = 'OR-2026-' + String(DB.ordres_reparation.length + 1).padStart(4, '0');
    const or = {
      id: 'or-' + uid(),
      garage_id: garageId,
      numero_or,
      moto_id,
      client_id: m.client_id || null,
      devis_id: devis_id || null,
      technicien_id: technicien_id || null,
      statut: 'brouillon',
      km_entree: parseInt(km_entree) || m.km,
      km_sortie: null,
      date_ouverture: nowISO(),
      date_cloture: null,
      total_mo_ht: 0,
      total_pieces_ht: 0,
      total_ht: 0,
      total_tva: 0,
      total_ttc: 0,
      notes_atelier: notes_atelier || '',
      notes_client: notes_client || '',
      created_at: nowISO(),
      updated_at: nowISO()
    };
    DB.ordres_reparation.push(or);
    return ok(res, { ordre_reparation: or, totaux: { total_ht: 0, total_tva: 0, total_ttc: 0 } }, 'Ordre de réparation créé', 201);
  }

  if((p=M('GET','/ordres-reparation/:id'))!==null){
    // RBAC: MECANO minimum — outil garage
    // TODO RBAC L4 : MECANO doit voir les tâches mais pas total_mo_ht/taux_horaire ni prix_achat sur les pièces
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.OrdresReparation.getById(p.id, garageId);
        return ok(res, result);
      } catch(e) { return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND'); }
    }

    // ── RAM fallback ──
    const or = (DB.ordres_reparation||[]).find(function(o){ return o.id===p.id && o.garage_id===garageId; });
    if (!or) return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND');
    const moto    = DB.motos.find(function(m){ return m.id===or.moto_id; });
    const taches  = (DB.or_taches||[]).filter(function(t){ return t.or_id===or.id; }).sort(function(a,b){ return (a.ordre||0)-(b.ordre||0); });
    const pieces  = (DB.or_pieces||[]).filter(function(pp){ return pp.or_id===or.id; });
    const totaux  = { total_ht: or.total_ht||0, total_tva: or.total_tva||0, total_ttc: or.total_ttc||0, total_mo_ht: or.total_mo_ht||0, total_pieces_ht: or.total_pieces_ht||0 };
    return ok(res, { ordre_reparation: or, moto: moto||null, taches, pieces, totaux });
  }

  if((p=M('PUT','/ordres-reparation/:id'))!==null){
    // RBAC: MECANO minimum — édition OR
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    // Validation des transitions de statut côté layer (cf. SBLayer.OrdresReparation.update)
    // Statuts valides : brouillon → en_cours → termine → annule
    // (Clôture passe par POST /:id/cloturer pour gérer la sync intervention.)
    if (b.statut && !['brouillon','en_cours','annule'].includes(b.statut)) {
      return fail(res, "Transition vers '"+b.statut+"' interdite via PUT (utiliser POST /cloturer pour 'termine')", 400, 'INVALID_TRANSITION');
    }

    if (USE_SUPABASE && SBLayer) {
      try {
        const or = await SBLayer.OrdresReparation.update(p.id, garageId, b);
        return ok(res, { ordre_reparation: or }, 'Ordre mis à jour');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    const i = (DB.ordres_reparation||[]).findIndex(function(o){ return o.id===p.id && o.garage_id===garageId; });
    if (i<0) return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND');
    const allowed = ['statut','technicien_id','km_entree','notes_atelier','notes_client'];
    const patch = {};
    allowed.forEach(function(k){ if (b[k]!==undefined) patch[k] = b[k]; });
    DB.ordres_reparation[i] = Object.assign({}, DB.ordres_reparation[i], patch, { id: p.id, garage_id: garageId, updated_at: nowISO() });
    return ok(res, { ordre_reparation: DB.ordres_reparation[i] }, 'Ordre mis à jour');
  }

  /* ── L3a-ter helpers RAM (mirror de supabase.js) ── */
  // Migration 26 (L10) : 'valide_client' renommé 'accepte', 'refuse' ajouté.
  // §3 spec L10 (décision 16/07, confirmé par Mehdi) : 'refuse' reste
  // MODIFIABLE (retour brouillon possible) — c'est un refus de prix/devis,
  // réversible par nature, PAS un état terminal. 'annule' reste terminal :
  // le garage a physiquement arrêté le dossier, décision définitive.
  const _OR_TRANS_RAM = {
    brouillon: ['accepte', 'refuse', 'annule'],
    accepte:   ['brouillon', 'en_cours', 'annule'],
    en_cours:  ['attente', 'annule'],
    attente:   ['en_cours', 'annule'],
    termine:   ['en_cours', 'annule'],
    facture:   ['annule'],
    annule:    [],                            // terminal absolu (garage a arrêté le dossier)
    refuse:    ['brouillon']                  // PAS terminal — refus réversible, retour brouillon
  };

  function _validerTransitionRAM(ancien, nouveau) {
    if (ancien === 'en_cours' && nouveau === 'termine')
      return { ok:false, code:'WRONG_ENDPOINT', msg:'Utiliser POST /ordres-reparation/:id/cloturer' };
    if (ancien === 'termine' && nouveau === 'facture')
      return { ok:false, code:'WRONG_ENDPOINT', msg:'Utiliser POST /ordres-reparation/:id/facturer' };
    const autorise = _OR_TRANS_RAM[ancien] || [];
    if (!autorise.includes(nouveau))
      return { ok:false, code:'INVALID_TRANSITION', msg:"Transition '"+ancien+"' → '"+nouveau+"' non autorisée" };
    if (nouveau === 'attente') return { ok:true, requiresMotif:true };
    return { ok:true };
  }

  function _logOrHistoriqueRam(orId, ancienStatut, nouveauStatut, action, payload, ctx) {
    if (!DB.or_historique) DB.or_historique = [];
    DB.or_historique.push({
      id:             'h-'+uid(),
      or_id:          orId,
      ancien_statut:  ancienStatut,
      nouveau_statut: nouveauStatut,
      action:         action,
      acteur_id:      ctx ? (ctx.user_id || null) : null,
      acteur_role:    ctx ? (ctx.role    || null) : null,
      payload:        payload || null,
      created_at:     nowISO()
    });
  }

  function _attribuerNumeroFactureRam() {
    const annee = new Date().getFullYear();
    if (!DB._compteur_factures) DB._compteur_factures = {};
    DB._compteur_factures[annee] = (DB._compteur_factures[annee] || 0) + 1;
    return 'FAC-' + annee + '-' + String(DB._compteur_factures[annee]).padStart(4, '0');
  }

  if((p=M('POST','/ordres-reparation/:id/cloturer'))!==null){
    // RBAC: MECANO minimum — clôture engage la facturation
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    const km_sortie = parseInt(b.km_sortie);
    if (!km_sortie || km_sortie <= 0) return fail(res, 'km_sortie requis (entier positif) pour clôturer un OR', 400, 'MISSING_KM');

    if (USE_SUPABASE && SBLayer) {
      try {
        // D-04 : ctx.user_id identifie le membre garage qui clôture (multi-user garage_users) ;
        // il devient l'acteur du relevé km, jamais le garage_id générique.
        const result = await SBLayer.OrdresReparation.cloturer(p.id, garageId, { km_sortie, acteur_id: ctx.user_id });
        return ok(res, result, 'Ordre clôturé · Intervention synchronisée');
      } catch(e) {
        const code = e.message && e.message.indexOf('Transition') >= 0 ? 'INVALID_TRANSITION' : 'DB_ERROR';
        return fail(res, e.message, 400, code);
      }
    }

    // ── RAM fallback ──
    const i = (DB.ordres_reparation||[]).findIndex(function(o){ return o.id===p.id && o.garage_id===garageId; });
    if (i<0) return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND');
    const or = DB.ordres_reparation[i];

    // Validation transition : seul en_cours peut être clôturé
    if (or.statut !== 'en_cours') {
      return fail(res, "Seul un OR en statut 'en_cours' peut être clôturé (statut actuel: '"+or.statut+"')", 400, 'INVALID_TRANSITION');
    }
    if (km_sortie < (or.km_entree || 0)) {
      return fail(res, 'km_sortie ('+km_sortie+') doit être >= km_entree ('+(or.km_entree||0)+')', 400, 'INVALID_KM');
    }

    // Mise à jour OR
    or.statut       = 'termine';
    or.km_sortie    = km_sortie;
    or.date_cloture = nowISO();
    or.updated_at   = nowISO();
    DB.ordres_reparation[i] = or;

    // Mise à jour km moto
    const mi = DB.motos.findIndex(function(m){ return m.id===or.moto_id; });
    if (mi >= 0 && km_sortie > DB.motos[mi].km) {
      DB.motos[mi].km = km_sortie;
      DB.motos[mi].updated_at = nowISO();
    }

    // Sync intervention — logique B :
    //   - si OR.devis_id : on met à jour l'intervention créée par la validation du devis
    //   - sinon : on crée une nouvelle intervention de type 'bleu'
    let intervention = null;
    if (or.devis_id) {
      const ii = DB.interventions.findIndex(function(x){ return x.devis_id===or.devis_id; });
      if (ii >= 0) {
        DB.interventions[ii] = Object.assign({}, DB.interventions[ii], {
          km: km_sortie,
          montant_ht: or.total_ht || 0,
          description: 'OR '+or.numero_or+' — clôturé',
          updated_at: nowISO()
        });
        intervention = DB.interventions[ii];
      }
    }
    if (!intervention) {
      intervention = {
        id: 'int-'+uid(),
        moto_id: or.moto_id,
        garage_id: garageId,
        type: 'bleu',
        titre: 'OR '+or.numero_or,
        description: or.notes_atelier || ('Clôture OR '+or.numero_or),
        km: km_sortie,
        date: todayFR(),
        score_confiance: 96,
        montant_ht: or.total_ht || 0,
        devis_id: or.devis_id || null,
        created_at: nowISO()
      };
      DB.interventions.push(intervention);
    }

    // Recalcul score moto
    let nouveau_score = null, nouvelle_couleur = null;
    if (mi >= 0) {
      const allIs = DB.interventions.filter(function(x){ return x.moto_id===or.moto_id; });
      nouveau_score = calcScore(allIs);
      nouvelle_couleur = couleur(nouveau_score);
      DB.motos[mi].score = nouveau_score;
      DB.motos[mi].couleur_dossier = nouvelle_couleur;
    }

    return ok(res, { ordre_reparation: or, intervention, nouveau_score, nouvelle_couleur }, 'Ordre clôturé · Intervention synchronisée');
  }

  /* ── L3a-ter Endpoint A : PATCH /ordres-reparation/:id/statut ── */
  if((p=M('PATCH','/ordres-reparation/:id/statut'))!==null){
    // TODO RBAC L4 : facture→annule doit être restreint CONCESSION/ADMIN
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    const { nouveau_statut, attente_motif, signature_base64, annulation_motif, refus_motif } = b;
    if (!nouveau_statut) return fail(res, 'nouveau_statut requis', 400, 'MISSING_FIELD');
    if (USE_SUPABASE && SBLayer) {
      try {
        const orMaj = await SBLayer.OrdresReparation.changerStatut(p.id, garageId, ctx, { nouveau_statut, attente_motif, signature_base64, annulation_motif, refus_motif });
        return ok(res, { ordre_reparation: orMaj }, 'Statut mis à jour : ' + nouveau_statut);
      } catch(e) {
        if (e.message && e.message.startsWith('NOT_FOUND:'))
          return fail(res, e.message.replace('NOT_FOUND: ', ''), 404, 'NOT_FOUND');
        if (e.message && e.message.startsWith('WRONG_ENDPOINT:'))
          return fail(res, e.message.replace('WRONG_ENDPOINT: ', ''), 400, 'WRONG_ENDPOINT');
        if (e.message && e.message.startsWith('INVALID_TRANSITION:'))
          return fail(res, e.message.replace('INVALID_TRANSITION: ', ''), 422, 'INVALID_TRANSITION');
        return fail(res, e.message, 400, 'DB_ERROR');
      }
    }
    // ── RAM fallback ──
    const iSt = (DB.ordres_reparation||[]).findIndex(function(o){ return o.id===p.id && o.garage_id===garageId; });
    if (iSt<0) return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND');
    const orSt = DB.ordres_reparation[iSt];
    const vt = _validerTransitionRAM(orSt.statut, nouveau_statut);
    if (!vt.ok) return fail(res, vt.msg, vt.code==='WRONG_ENDPOINT' ? 400 : 422, vt.code);
    if (vt.requiresMotif && !attente_motif) return fail(res, 'attente_motif requis pour passer en attente', 400, 'MISSING_FIELD');
    const patchSt = { statut: nouveau_statut, updated_at: nowISO() };
    if (attente_motif)    patchSt.attente_motif    = attente_motif;
    if (signature_base64) patchSt.signature_client = signature_base64;
    if (annulation_motif) patchSt.annulation_motif = annulation_motif;
    if (refus_motif)      patchSt.refus_motif      = refus_motif;
    DB.ordres_reparation[iSt] = Object.assign({}, orSt, patchSt);
    const motifPayload = attente_motif ? { attente_motif } : annulation_motif ? { annulation_motif } : refus_motif ? { refus_motif } : null;
    _logOrHistoriqueRam(p.id, orSt.statut, nouveau_statut, 'statut_change', motifPayload, ctx);
    return ok(res, { ordre_reparation: DB.ordres_reparation[iSt] }, 'Statut mis à jour : ' + nouveau_statut);
  }

  /* ── L3a-ter Endpoint B : POST /ordres-reparation/:id/facturer ── */
  if((p=M('POST','/ordres-reparation/:id/facturer'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    const { signature_base64 } = b;
    if (USE_SUPABASE && SBLayer) {
      try {
        const orMaj = await SBLayer.OrdresReparation.facturer(p.id, garageId, ctx, { signature_base64 });
        return ok(res, { ordre_reparation: orMaj, numero_facture: orMaj.numero_facture }, 'OR facturé · ' + orMaj.numero_facture);
      } catch(e) {
        if (e.message && e.message.startsWith('NOT_FOUND:'))
          return fail(res, e.message.replace('NOT_FOUND: ', ''), 404, 'NOT_FOUND');
        return fail(res, e.message, 400, 'DB_ERROR');
      }
    }
    // ── RAM fallback ──
    const iFact = (DB.ordres_reparation||[]).findIndex(function(o){ return o.id===p.id && o.garage_id===garageId; });
    if (iFact<0) return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND');
    const orFact = DB.ordres_reparation[iFact];
    if (orFact.statut !== 'termine')
      return fail(res, "Seul un OR 'termine' peut être facturé (statut actuel : '"+orFact.statut+"')", 422, 'INVALID_TRANSITION');
    if (orFact.numero_facture)
      return fail(res, 'Numéro de facture déjà attribué : ' + orFact.numero_facture, 400, 'ALREADY_INVOICED');
    const numero_facture = _attribuerNumeroFactureRam();
    const patchFact = { statut: 'facture', numero_facture, facture_emise_at: nowISO(), updated_at: nowISO() };
    if (signature_base64) patchFact.signature_client = signature_base64;
    DB.ordres_reparation[iFact] = Object.assign({}, orFact, patchFact);
    _logOrHistoriqueRam(p.id, 'termine', 'facture', 'facturation', { numero_facture, avec_signature: !!signature_base64 }, ctx);
    return ok(res, { ordre_reparation: DB.ordres_reparation[iFact], numero_facture }, 'OR facturé · ' + numero_facture);
  }

  /* ── L3a-ter Endpoint C : GET /ordres-reparation/:id/historique ── */
  if((p=M('GET','/ordres-reparation/:id/historique'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (USE_SUPABASE && SBLayer) {
      try {
        const historique = await SBLayer.OrdresReparation.getHistorique(p.id, garageId);
        return ok(res, { historique, total: historique.length });
      } catch(e) {
        if (e.message && e.message.startsWith('NOT_FOUND:'))
          return fail(res, e.message.replace('NOT_FOUND: ', ''), 404, 'NOT_FOUND');
        return fail(res, e.message, 400, 'DB_ERROR');
      }
    }
    // ── RAM fallback ──
    const orHIdx = (DB.ordres_reparation||[]).findIndex(function(o){ return o.id===p.id && o.garage_id===garageId; });
    if (orHIdx<0) return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND');
    const historique = (DB.or_historique||[])
      .filter(function(h){ return h.or_id===p.id; })
      .sort(function(a,b){ return (b.created_at||'').localeCompare(a.created_at||''); });
    return ok(res, { historique, total: historique.length });
  }

  /* ── L3a-ter Endpoint D : GET /ordres-reparation/:id/facture (HTML A4 print-ready) ── */
  if((p=M('GET','/ordres-reparation/:id/facture'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    let orF, motoF, clientF, tachesF, piecesF, garageF;
    if (USE_SUPABASE && SBLayer) {
      try {
        const d = await SBLayer.OrdresReparation.getDetailsCompletsPourFacture(p.id, garageId);
        orF = d.or; motoF = d.moto; clientF = d.client; tachesF = d.taches; piecesF = d.pieces; garageF = d.garage;
      } catch(e) {
        if (e.message && e.message.startsWith('NOT_FOUND:'))
          return fail(res, e.message.replace('NOT_FOUND: ', ''), 404, 'NOT_FOUND');
        return fail(res, e.message, 400, 'DB_ERROR');
      }
    } else {
      orF = (DB.ordres_reparation||[]).find(function(o){ return o.id===p.id && o.garage_id===garageId; });
      if (!orF) return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND');
      motoF   = (DB.motos||[]).find(function(m){ return m.id===orF.moto_id; }) || null;
      clientF = motoF ? ((DB.clients||[]).find(function(c){ return c.id===motoF.client_id; }) || null) : null;
      tachesF = (DB.or_taches||[]).filter(function(t){ return t.or_id===p.id; });
      piecesF = (DB.or_pieces||[]).filter(function(pp){ return pp.or_id===p.id; });
      garageF = (DB.garages||[]).find(function(g){ return g.id===garageId; }) || null;
    }
    if (!orF) return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND');
    if (!orF.numero_facture && !rbac.requireRole(ctx, 'CONCESSION'))
      return fail(res, 'Facture non émise pour cet OR', 400, 'NOT_INVOICED');
    const esc2  = function(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    const fmt2  = function(n){ return Number(n||0).toFixed(2); };
    const annuleF   = orF.statut === 'annule' && !!orF.numero_facture;
    const dateFact  = orF.facture_emise_at ? new Date(orF.facture_emise_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
    const dateNow   = new Date().toLocaleDateString('fr-FR');
    let lignesHTML  = '';
    (tachesF||[]).forEach(function(t){
      lignesHTML += '<tr><td>'+esc2(t.libelle||'')+'</td><td class="c">MO</td><td class="r">'+fmt2(t.duree_h||0)+'h</td><td class="r">'+fmt2(t.taux_horaire||0)+' €</td><td class="r">'+fmt2(t.montant_ht||0)+' €</td></tr>';
    });
    (piecesF||[]).forEach(function(pp){
      const lbl = pp.reference ? esc2(pp.reference)+' — '+esc2(pp.libelle||'') : esc2(pp.libelle||'');
      lignesHTML += '<tr><td>'+lbl+'</td><td class="c">Pièce</td><td class="r">'+fmt2(pp.qte||0)+'</td><td class="r">'+fmt2(pp.pu_ht||0)+' €</td><td class="r">'+fmt2(pp.montant_ht||0)+' €</td></tr>';
    });
    const noLignes        = lignesHTML ? '' : '<tr><td colspan="5" style="text-align:center;color:#9ba3b4;font-style:italic">Aucune ligne</td></tr>';
    const total_mo_ht     = (tachesF||[]).reduce(function(s,t){ return s+(t.montant_ht||0); }, 0);
    const total_pieces_ht = (piecesF||[]).reduce(function(s,pp){ return s+(pp.montant_ht||0); }, 0);
    const total_ht        = orF.total_ht  != null ? orF.total_ht  : total_mo_ht + total_pieces_ht;
    const total_tva       = orF.total_tva != null ? orF.total_tva : total_ht * 0.20;
    const total_ttc       = orF.total_ttc != null ? orF.total_ttc : total_ht + total_tva;
    const annuleBanner    = annuleF ? '<div class="annule-banner">FACTURE ANNULÉE</div>' : '';
    const sigBlock        = orF.signature_client ? '<div class="signature"><h3>Signature client</h3><img src="'+orF.signature_client+'" alt="Signature"></div>' : '';
    const gNom    = garageF ? esc2(garageF.nom||'')                        : '';
    const gAdr    = garageF ? esc2(garageF.adresse||'')                    : '';
    const gEmail  = garageF ? esc2(garageF.email||'')                      : '';
    const gTel    = garageF ? esc2(garageF.telephone||garageF.tel||'')     : '';
    const cNom    = clientF ? esc2(clientF.nom||'')                        : '—';
    const cEmail  = clientF ? esc2(clientF.email||'')                      : '';
    const motoLbl = motoF   ? esc2((motoF.marque||'')+' '+(motoF.modele||'')+' — '+(motoF.plaque||'')) : '';
    const numFact = esc2(orF.numero_facture || 'Aperçu');
    const html =
      '<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width,initial-scale=1.0">\n' +
      '<title>Facture '+numFact+' — MotoKey</title>\n' +
      '<style>\n' +
      '*{margin:0;padding:0;box-sizing:border-box}\n' +
      '@page{size:A4;margin:15mm 12mm}\n' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:12px;color:#1a1d23;background:#fff}\n' +
      '.toolbar{background:#f0f2f5;padding:10px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #d1d5db}\n' +
      '.toolbar button{background:#ff6b00;color:#fff;border:none;border-radius:6px;padding:7px 18px;font-size:13px;font-weight:600;cursor:pointer}\n' +
      '.toolbar .title{font-weight:700;font-size:14px}\n' +
      '@media print{.toolbar{display:none}}\n' +
      '.page{max-width:780px;margin:0 auto;padding:20px 24px}\n' +
      '.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #ff6b00}\n' +
      '.logo{font-size:22px;font-weight:900;letter-spacing:1px}.logo em{color:#ff6b00;font-style:normal}\n' +
      '.garage-info{font-size:11px;color:#5a6172;margin-top:4px}\n' +
      '.facture-title{text-align:right}.facture-title h1{font-size:22px;font-weight:900;color:#1a1d23}\n' +
      '.facture-title .num{font-size:16px;font-weight:700;color:#ff6b00;margin-top:2px}\n' +
      '.facture-title .date{font-size:11px;color:#5a6172;margin-top:4px}\n' +
      '.annule-banner{background:#dc2626;color:#fff;text-align:center;font-size:18px;font-weight:900;letter-spacing:3px;padding:10px;margin-bottom:20px;border-radius:6px}\n' +
      '.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}\n' +
      '.bloc-partie h3{font-size:10px;font-weight:700;text-transform:uppercase;color:#9ba3b4;letter-spacing:1px;margin-bottom:6px}\n' +
      '.bloc-partie p{font-size:12px;line-height:1.6}\n' +
      '.bloc-partie .name{font-weight:700;font-size:13px}\n' +
      'table{width:100%;border-collapse:collapse;margin-bottom:16px}\n' +
      'thead tr{background:#1a1d23;color:#fff}\n' +
      'thead th{padding:8px 10px;text-align:left;font-size:11px;font-weight:600}\n' +
      'tbody tr:nth-child(even){background:#f8f9fb}\n' +
      'tbody td{padding:7px 10px;font-size:11px;border-bottom:1px solid #e2e5eb}\n' +
      '.c{text-align:center}.r{text-align:right}\n' +
      '.totaux{margin-left:auto;width:260px}\n' +
      '.totaux table{margin-bottom:0}\n' +
      '.totaux td{padding:5px 8px}\n' +
      '.ttc{font-weight:900;font-size:14px;color:#ff6b00}\n' +
      '.signature{margin-top:24px;padding-top:16px;border-top:1px solid #e2e5eb}\n' +
      '.signature h3{font-size:10px;font-weight:700;text-transform:uppercase;color:#9ba3b4;letter-spacing:1px;margin-bottom:8px}\n' +
      '.signature img{max-height:80px;border:1px solid #e2e5eb;border-radius:4px}\n' +
      '.footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e5eb;text-align:center;font-size:10px;color:#9ba3b4}\n' +
      '</style>\n</head>\n<body>\n' +
      '<div class="toolbar"><span class="title">Facture '+numFact+'</span>' +
      '<button onclick="window.print()">Imprimer</button></div>\n' +
      '<div class="page">\n'+annuleBanner+'\n' +
      '<div class="header">' +
        '<div><div class="logo">MOTO<em>KEY</em></div>' +
        '<div class="garage-info">'+gNom+'<br>'+gAdr+'<br>'+gEmail+'<br>'+gTel+'</div></div>' +
        '<div class="facture-title"><h1>FACTURE</h1>' +
        '<div class="num">'+numFact+'</div>' +
        '<div class="date">Émise le '+dateFact+'</div></div>' +
      '</div>\n' +
      '<div class="parties">' +
        '<div class="bloc-partie"><h3>Émis par</h3>' +
        '<p class="name">'+gNom+'</p><p>'+gAdr+'</p><p>'+gEmail+'</p><p>'+gTel+'</p></div>' +
        '<div class="bloc-partie"><h3>Facturé à</h3>' +
        '<p class="name">'+cNom+'</p><p>'+cEmail+'</p><p>'+motoLbl+'</p></div>' +
      '</div>\n' +
      '<table><thead><tr>' +
        '<th>Désignation</th><th class="c">Type</th>' +
        '<th class="r">Qté / Durée</th><th class="r">P.U. HT</th><th class="r">Montant HT</th>' +
      '</tr></thead><tbody>'+lignesHTML+noLignes+'</tbody></table>\n' +
      '<div class="totaux"><table><tbody>' +
        '<tr><td>Main-d\'oeuvre HT</td><td class="r">'+fmt2(total_mo_ht)+' €</td></tr>' +
        '<tr><td>Pièces HT</td><td class="r">'+fmt2(total_pieces_ht)+' €</td></tr>' +
        '<tr><td>Total HT</td><td class="r">'+fmt2(total_ht)+' €</td></tr>' +
        '<tr><td>TVA (20%)</td><td class="r">'+fmt2(total_tva)+' €</td></tr>' +
        '<tr class="ttc"><td><strong>Total TTC</strong></td><td class="r"><strong>'+fmt2(total_ttc)+' €</strong></td></tr>' +
      '</tbody></table></div>\n' +
      sigBlock+'\n' +
      '<div class="footer">Facture générée par MotoKey · '+dateNow+'</div>\n' +
      '</div>\n</body>\n</html>';
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','X-MotoKey-Version':VERSION,'Access-Control-Allow-Origin':'*'});
    res.end(html);
    return;
  }

  /* ── Helper RAM : recalcul des totaux d'un OR à partir de ses tâches et pièces ── */
  function _recalcTotauxOR(orId, garageId) {
    const idx = (DB.ordres_reparation||[]).findIndex(function(o){ return o.id===orId && o.garage_id===garageId; });
    if (idx < 0) return null;
    const taches = (DB.or_taches||[]).filter(function(t){ return t.or_id===orId; });
    const pieces = (DB.or_pieces||[]).filter(function(pp){ return pp.or_id===orId; });
    const total_mo_ht     = taches.reduce(function(s,t){ return s + (t.montant_ht||0); }, 0);
    const total_pieces_ht = pieces.reduce(function(s,p){ return s + (p.montant_ht||0); }, 0);
    const total_ht        = total_mo_ht + total_pieces_ht;
    const total_tva = taches.reduce(function(s,t){ return s + (t.montant_ht||0)*0.20; }, 0)
                   + pieces.reduce(function(s,p){ return s + (p.montant_ht||0)*((p.tva_pct||20)/100); }, 0);
    const total_ttc = total_ht + total_tva;
    DB.ordres_reparation[idx].total_mo_ht     = Math.round(total_mo_ht*100)/100;
    DB.ordres_reparation[idx].total_pieces_ht = Math.round(total_pieces_ht*100)/100;
    DB.ordres_reparation[idx].total_ht        = Math.round(total_ht*100)/100;
    DB.ordres_reparation[idx].total_tva       = Math.round(total_tva*100)/100;
    DB.ordres_reparation[idx].total_ttc       = Math.round(total_ttc*100)/100;
    DB.ordres_reparation[idx].updated_at      = nowISO();
    return DB.ordres_reparation[idx];
  }

  if((p=M('POST','/ordres-reparation/:id/taches'))!==null){
    // RBAC: MECANO minimum — atelier
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    const { libelle, description, duree_h, taux_horaire, technicien_id, ordre } = b;
    if (!libelle) return fail(res, 'libelle requis');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.OrTaches.create(garageId, p.id, { libelle, description, duree_h, taux_horaire, technicien_id, ordre });
        return ok(res, result, 'Tâche ajoutée', 201);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    const or = (DB.ordres_reparation||[]).find(function(o){ return o.id===p.id && o.garage_id===garageId; });
    if (!or) return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND');
    DB.or_taches = DB.or_taches || [];
    const dh = parseFloat(duree_h) || 0;
    const th = parseFloat(taux_horaire) || 65;
    const tache = {
      id: 'ort-'+uid(),
      garage_id: garageId,
      or_id: p.id,
      ordre: parseInt(ordre) || (DB.or_taches.filter(function(t){ return t.or_id===p.id; }).length + 1),
      libelle,
      description: description || '',
      duree_h: dh,
      taux_horaire: th,
      montant_ht: Math.round(dh * th * 100)/100,
      technicien_id: technicien_id || null,
      statut: 'a_faire',
      fait_le: null,
      created_at: nowISO(),
      updated_at: nowISO()
    };
    DB.or_taches.push(tache);
    const orMaj = _recalcTotauxOR(p.id, garageId);
    return ok(res, { tache, ordre_reparation: orMaj }, 'Tâche ajoutée', 201);
  }

  if((p=M('PATCH','/or-taches/:id'))!==null){
    // RBAC: MECANO minimum — atelier
    // TODO RBAC L4 : MECANO ne doit pas modifier taux_horaire (lecture seule)
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.OrTaches.update(p.id, garageId, b);
        return ok(res, result, 'Tâche mise à jour');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    const i = (DB.or_taches||[]).findIndex(function(t){ return t.id===p.id && t.garage_id===garageId; });
    if (i<0) return fail(res, 'Tâche non trouvée', 404, 'NOT_FOUND');
    const allowed = ['libelle','description','duree_h','taux_horaire','technicien_id','statut','ordre'];
    const patch = {};
    allowed.forEach(function(k){ if (b[k]!==undefined) patch[k] = b[k]; });
    const newDh = (patch.duree_h !== undefined) ? parseFloat(patch.duree_h) : DB.or_taches[i].duree_h;
    const newTh = (patch.taux_horaire !== undefined) ? parseFloat(patch.taux_horaire) : DB.or_taches[i].taux_horaire;
    if (patch.duree_h !== undefined || patch.taux_horaire !== undefined) {
      patch.montant_ht = Math.round(newDh * newTh * 100)/100;
    }
    if (patch.statut === 'fait' && DB.or_taches[i].statut !== 'fait') {
      patch.fait_le = nowISO();
    }
    DB.or_taches[i] = Object.assign({}, DB.or_taches[i], patch, { id: p.id, garage_id: garageId, updated_at: nowISO() });
    const orMaj = _recalcTotauxOR(DB.or_taches[i].or_id, garageId);
    return ok(res, { tache: DB.or_taches[i], ordre_reparation: orMaj }, 'Tâche mise à jour');
  }

  if((p=M('POST','/ordres-reparation/:id/pieces'))!==null){
    // RBAC: MECANO minimum — atelier
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    const { piece_id, reference, libelle, qte, pu_ht, tva_pct } = b;
    if (!libelle) return fail(res, 'libelle requis (snapshot pour traçabilité)');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.OrPieces.create(garageId, p.id, { piece_id, reference, libelle, qte, pu_ht, tva_pct });
        return ok(res, result, 'Pièce ajoutée', 201);
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    const or = (DB.ordres_reparation||[]).find(function(o){ return o.id===p.id && o.garage_id===garageId; });
    if (!or) return fail(res, 'Ordre non trouvé', 404, 'NOT_FOUND');
    DB.or_pieces = DB.or_pieces || [];
    const q  = parseFloat(qte) || 1;
    const pu = parseFloat(pu_ht) || 0;
    const piece = {
      id: 'orp-'+uid(),
      garage_id: garageId,
      or_id: p.id,
      piece_id: piece_id || null,
      reference: reference || '',
      libelle,
      qte: q,
      pu_ht: pu,
      tva_pct: parseFloat(tva_pct) || 20,
      montant_ht: Math.round(q * pu * 100)/100,
      created_at: nowISO(),
      updated_at: nowISO()
    };
    DB.or_pieces.push(piece);
    const orMaj = _recalcTotauxOR(p.id, garageId);
    return ok(res, { piece, ordre_reparation: orMaj }, 'Pièce ajoutée', 201);
  }

  if((p=M('DELETE','/or-pieces/:id'))!==null){
    // RBAC: MECANO minimum — atelier
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.OrPieces.delete(p.id, garageId);
        return ok(res, result, 'Pièce supprimée');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    const i = (DB.or_pieces||[]).findIndex(function(pp){ return pp.id===p.id && pp.garage_id===garageId; });
    if (i<0) return fail(res, 'Pièce non trouvée', 404, 'NOT_FOUND');
    const orId = DB.or_pieces[i].or_id;
    DB.or_pieces.splice(i,1);
    const orMaj = _recalcTotauxOR(orId, garageId);
    return ok(res, { deleted_id: p.id, ordre_reparation: orMaj }, 'Pièce supprimée');
  }

  /* ── DELETE /or-taches/:id ── */
  if((p=M('DELETE','/or-taches/:id'))!==null){
    // TODO RBAC L4 : MECANO et CLIENT refusés — accès financier réservé PRO+
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.OrTaches.remove(p.id, garageId);
        const orMaj = result.ordre_reparation || {};
        return ok(res, {
          deleted_id: p.id,
          or_id: orMaj.id,
          totaux: { total_taches_ht: orMaj.total_mo_ht, total_pieces_ht: orMaj.total_pieces_ht,
                    total_ht: orMaj.total_ht, total_tva: orMaj.total_tva, total_ttc: orMaj.total_ttc }
        }, 'Tâche supprimée');
      } catch(e) { return fail(res, e.message, e.message.includes('non trouvée') ? 404 : 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    const iT = (DB.or_taches||[]).findIndex(function(t){ return t.id===p.id; });
    if (iT < 0) return fail(res, 'Tâche non trouvée', 404, 'TACHE_NOT_FOUND');
    const tacheOrId = DB.or_taches[iT].or_id;
    const tacheGid  = DB.or_taches[iT].garage_id;
    if (tacheGid !== garageId) return fail(res, 'Accès refusé', 403, 'FORBIDDEN');
    const orParent = (DB.ordres_reparation||[]).find(function(o){ return o.id===tacheOrId; });
    if (orParent && ['facture','annule'].includes(orParent.statut)) {
      return fail(res, 'OR clôturé, modification impossible', 409, 'OR_LOCKED');
    }
    DB.or_taches.splice(iT, 1);
    const orMaj = _recalcTotauxOR(tacheOrId, garageId);
    return ok(res, {
      deleted_id: p.id,
      or_id: tacheOrId,
      totaux: { total_taches_ht: orMaj?.total_mo_ht, total_pieces_ht: orMaj?.total_pieces_ht,
                total_ht: orMaj?.total_ht, total_tva: orMaj?.total_tva, total_ttc: orMaj?.total_ttc }
    }, 'Tâche supprimée');
  }

  /* ── PATCH /or-pieces/:id ── */
  if((p=M('PATCH','/or-pieces/:id'))!==null){
    // TODO RBAC L4 : MECANO et CLIENT refusés — accès financier réservé PRO+
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    // Accepter les deux noms de champs (spec vs schéma DB)
    const payload = {
      libelle:    b.libelle    || b.designation || undefined,
      reference:  b.reference  !== undefined ? b.reference : undefined,
      qte:        b.qte        !== undefined ? b.qte        : (b.quantite       !== undefined ? b.quantite       : undefined),
      pu_ht:      b.pu_ht      !== undefined ? b.pu_ht      : (b.prix_unitaire_ht !== undefined ? b.prix_unitaire_ht : undefined),
      tva_pct:    b.tva_pct    !== undefined ? b.tva_pct    : undefined
    };
    const hasField = Object.values(payload).some(function(v){ return v !== undefined; });
    if (!hasField) return fail(res, 'Aucun champ valide fourni', 400, 'INVALID_INPUT');
    if (payload.qte !== undefined && parseFloat(payload.qte) <= 0) return fail(res, 'quantite doit être > 0', 400, 'INVALID_INPUT');
    if (payload.pu_ht !== undefined && parseFloat(payload.pu_ht) < 0) return fail(res, 'prix_unitaire_ht doit être ≥ 0', 400, 'INVALID_INPUT');
    if (payload.libelle !== undefined && !payload.libelle.trim()) return fail(res, 'designation ne peut pas être vide', 400, 'INVALID_INPUT');

    if (USE_SUPABASE && SBLayer) {
      try {
        const result = await SBLayer.OrPieces.update(p.id, garageId, payload);
        const orMaj = result.ordre_reparation || {};
        return ok(res, {
          piece: result.piece,
          totaux: { total_taches_ht: orMaj.total_mo_ht, total_pieces_ht: orMaj.total_pieces_ht,
                    total_ht: orMaj.total_ht, total_tva: orMaj.total_tva, total_ttc: orMaj.total_ttc }
        }, 'Pièce mise à jour');
      } catch(e) { return fail(res, e.message, e.message.includes('non trouvée') ? 404 : 500, 'DB_ERROR'); }
    }

    // ── RAM fallback ──
    const iP = (DB.or_pieces||[]).findIndex(function(pp){ return pp.id===p.id; });
    if (iP < 0) return fail(res, 'Pièce non trouvée', 404, 'PIECE_NOT_FOUND');
    if (DB.or_pieces[iP].garage_id !== garageId) return fail(res, 'Accès refusé', 403, 'FORBIDDEN');
    const pieceOrId  = DB.or_pieces[iP].or_id;
    const orParentP  = (DB.ordres_reparation||[]).find(function(o){ return o.id===pieceOrId; });
    if (orParentP && ['facture','annule'].includes(orParentP.statut)) {
      return fail(res, 'OR clôturé, modification impossible', 409, 'OR_LOCKED');
    }
    const patchP = {};
    if (payload.libelle   !== undefined) patchP.libelle   = payload.libelle.trim();
    if (payload.reference !== undefined) patchP.reference = payload.reference;
    if (payload.tva_pct   !== undefined) patchP.tva_pct   = parseFloat(payload.tva_pct);
    const newQ  = payload.qte   !== undefined ? parseFloat(payload.qte)   : DB.or_pieces[iP].qte;
    const newPu = payload.pu_ht !== undefined ? parseFloat(payload.pu_ht) : DB.or_pieces[iP].pu_ht;
    patchP.qte        = newQ;
    patchP.pu_ht      = newPu;
    patchP.montant_ht = Math.round(newQ * newPu * 100) / 100;
    DB.or_pieces[iP] = Object.assign({}, DB.or_pieces[iP], patchP, { id: p.id, garage_id: garageId, updated_at: nowISO() });
    const orMajP = _recalcTotauxOR(pieceOrId, garageId);
    return ok(res, {
      piece: DB.or_pieces[iP],
      totaux: { total_taches_ht: orMajP?.total_mo_ht, total_pieces_ht: orMajP?.total_pieces_ht,
                total_ht: orMajP?.total_ht, total_tva: orMajP?.total_tva, total_ttc: orMajP?.total_ttc }
    }, 'Pièce mise à jour');
  }

  /* ── GET /catalogue-pieces?q=:query&limit=:limit ── */
  if((p=M('GET','/catalogue-pieces'))!==null){
    // TODO RBAC L4 : MECANO autorisé en lecture, CLIENT refusé
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    const q     = (query.q || '').trim();
    const limit = Math.min(parseInt(query.limit) || 20, 50);
    if (q.length < 3) return ok(res, { resultats: [] }, 'Query trop courte (min 3 caractères)');

    if (USE_SUPABASE && SBLayer) {
      try {
        const resultats = await SBLayer.CataloguePieces.search(garageId, q, { limit });
        return ok(res, { resultats }, resultats.length + ' résultat(s)');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return ok(res, { resultats: [] }, 'Mode RAM — catalogue non disponible');
  }

  /* ── GET /catalogue-pieces/by-ean/:ean ── */
  if((p=M('GET','/catalogue-pieces/by-ean/:ean'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    const ean = (p.ean || '').trim();
    if (!/^\d{8,14}$/.test(ean)) return fail(res, 'EAN invalide (8 à 14 chiffres)', 400, 'INVALID_INPUT');

    if (USE_SUPABASE && SBLayer) {
      try {
        const piece = await SBLayer.CataloguePieces.getByEan(garageId, ean);
        if (!piece) return fail(res, 'EAN non trouvé dans le catalogue', 404, 'EAN_NOT_FOUND');
        return ok(res, { piece }, 'EAN trouvé');
      } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
    }
    return fail(res, 'Lookup EAN non disponible en mode RAM', 503, 'NOT_IMPLEMENTED');
  }

  /* ── POST /catalogue-pieces ── */
  if((p=M('POST','/catalogue-pieces'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

    if (!b.libelle || !b.libelle.trim()) return fail(res, 'libelle requis', 400, 'INVALID_INPUT');
    if (b.prix_vente_ht === undefined || parseFloat(b.prix_vente_ht) < 0) {
      return fail(res, 'prix_vente_ht requis et doit être ≥ 0', 400, 'INVALID_INPUT');
    }
    if (b.ean && !/^\d{8,14}$/.test(b.ean.trim())) {
      return fail(res, 'EAN invalide (8 à 14 chiffres)', 400, 'INVALID_INPUT');
    }

    if (USE_SUPABASE && SBLayer) {
      try {
        const piece = await SBLayer.CataloguePieces.create(garageId, ctx.user_id, b);
        return ok(res, { piece }, 'Pièce ajoutée au catalogue', 201);
      } catch(e) {
        if (e.message.includes('duplicate') || e.message.includes('unique')) {
          return fail(res, 'Référence ou EAN déjà existant dans le catalogue', 409, 'CONFLICT');
        }
        return fail(res, e.message, 500, 'DB_ERROR');
      }
    }
    return fail(res, 'Création catalogue non disponible en mode RAM', 503, 'NOT_IMPLEMENTED');
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
