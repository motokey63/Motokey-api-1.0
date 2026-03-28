/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   MOTOKEY — PLANS ENTRETIEN CONSTRUCTEURS               ║
 * ║   Base de données statique — 50 motos France            ║
 * ║                                                          ║
 * ║   Sources : Manuels constructeurs officiels,            ║
 * ║   livrets d'entretien, forums spécialisés vérifiés      ║
 * ║   (Repaire des Motards, MNC, PassionMoto)               ║
 * ║                                                          ║
 * ║   ⚠️  Ces données sont indicatives.                     ║
 * ║   Toujours vérifier avec le manuel du propriétaire.     ║
 * ║   Remplacer par Autodata/ETAI dès que possible.         ║
 * ╚══════════════════════════════════════════════════════════╝
 */

'use strict';

/* ══════════════════════════════════════════════════════════
   STRUCTURE D'UN PLAN
   
   Chaque plan est identifié par : marque + modele + annees[]
   Operations :
     id            : identifiant unique
     icon          : emoji
     nom           : libellé affiché
     km_interval   : kilométrage entre deux interventions
     mois_interval : intervalle temporel (si applicable)
     temps_h       : temps atelier estimé en heures
     produit       : produit recommandé
     tags          : étiquettes affichées
     critique      : true = alerte rouge si dépassé
     source        : 'Manuel constructeur' / 'Recommandation'
══════════════════════════════════════════════════════════ */

const PLANS_DB = [

  /* ══════════════════════════════════════
     YAMAHA
  ══════════════════════════════════════ */
  {
    marque: 'Yamaha', modele: 'MT-07', annees: [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 689, type: 'roadster',
    operations: [
      { id:'v6',    icon:'🛢️', nom:'Vidange + filtre huile',        km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Yamalube 10W-40 · 3,3L', tags:['6 000 km','1 an'], critique:false },
      { id:'fa',    icon:'💨', nom:'Filtre à air',                   km_interval:12000, mois_interval:null,temps_h:0.5, produit:'Yamaha OEM 2MW-14451-00', tags:['12 000 km'], critique:false },
      { id:'bg',    icon:'⚡', nom:'Bougies (x2)',                   km_interval:12000, mois_interval:null,temps_h:1.2, produit:'NGK CR9EIA-9 Iridium', tags:['12 000 km'], critique:false },
      { id:'ch',    icon:'⛓️', nom:'Chaîne — contrôle tension',      km_interval:1000,  mois_interval:null,temps_h:0.3, produit:'—', tags:['Tous les 1 000 km'], critique:false },
      { id:'chu',   icon:'⛓️', nom:'Chaîne + pignons — remplacement',km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit RK 520 XSO ou DID', tags:['20 000 km'], critique:false },
      { id:'lf',    icon:'🔴', nom:'Liquide de frein AV + AR',       km_interval:0,     mois_interval:24,  temps_h:0.8, produit:'Motul RBF 600 DOT4', tags:['2 ans'], critique:false },
      { id:'sv',    icon:'🔧', nom:'Jeu aux soupapes',               km_interval:24000, mois_interval:null,temps_h:4.0, produit:'Cales de réglage', tags:['24 000 km'], critique:true },
      { id:'bo',    icon:'💧', nom:'Liquide de refroidissement',      km_interval:0,     mois_interval:36,  temps_h:0.8, produit:'Yamaha Coolant Blue · 1,6L', tags:['3 ans'], critique:false },
      { id:'fp',    icon:'⛽', nom:'Filtre à carburant',              km_interval:40000, mois_interval:null,temps_h:0.5, produit:'Yamaha OEM', tags:['40 000 km'], critique:false },
      { id:'pn',    icon:'🔵', nom:'Pneus — contrôle usure',         km_interval:5000,  mois_interval:null,temps_h:0.2, produit:'Michelin Road 6 recommandé', tags:['Usure','Pression'], critique:false },
    ]
  },

  {
    marque: 'Yamaha', modele: 'MT-09', annees: [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 889, type: 'roadster',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Yamalube 10W-40 · 3,7L', tags:['6 000 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:12000, mois_interval:null,temps_h:0.5, produit:'Yamaha OEM 2PW-14451-00', tags:['12 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x3)',              km_interval:12000, mois_interval:null,temps_h:1.5, produit:'NGK LMAR9AI-9 Iridium (x3)', tags:['12 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit RK 530 XSO', tags:['20 000 km'], critique:false },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'Motul RBF 600 DOT4', tags:['2 ans'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:24000, mois_interval:null,temps_h:5.0, produit:'Cales de réglage', tags:['24 000 km'], critique:true },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Yamaha Coolant Blue · 1,8L', tags:['3 ans'], critique:false },
    ]
  },

  {
    marque: 'Yamaha', modele: 'Tracer 9', annees: [2021, 2022, 2023, 2024],
    cylindree: 889, type: 'sport-touring',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Yamalube 10W-40 · 3,7L', tags:['6 000 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:12000, mois_interval:null,temps_h:0.5, produit:'Yamaha OEM', tags:['12 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x3)',              km_interval:12000, mois_interval:null,temps_h:1.5, produit:'NGK LMAR9AI-9', tags:['12 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:24000, mois_interval:null,temps_h:5.0, produit:'Cales de réglage', tags:['24 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Yamaha Coolant · 1,8L', tags:['3 ans'], critique:false },
    ]
  },

  {
    marque: 'Yamaha', modele: 'Ténéré 700', annees: [2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 689, type: 'trail',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Yamalube 10W-40 · 2L', tags:['6 000 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:6000,  mois_interval:null,temps_h:0.5, produit:'Yamaha OEM (plus fréquent hors-route)', tags:['6 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:12000, mois_interval:null,temps_h:1.2, produit:'NGK CR9EIA-9', tags:['12 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:15000, mois_interval:null,temps_h:1.8, produit:'Kit DID 520 VX', tags:['15 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:24000, mois_interval:null,temps_h:4.0, produit:'Cales de réglage', tags:['24 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'sg',  icon:'🏍️', nom:'Suspension — contrôle',   km_interval:12000, mois_interval:null,temps_h:0.5, produit:'—', tags:['12 000 km'], critique:false },
    ]
  },

  {
    marque: 'Yamaha', modele: 'YZF-R7', annees: [2021, 2022, 2023, 2024],
    cylindree: 689, type: 'sportive',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Yamalube 10W-40 · 3,3L', tags:['6 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:12000, mois_interval:null,temps_h:1.5, produit:'NGK CR9EIA-9 Iridium', tags:['12 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:24000, mois_interval:null,temps_h:4.0, produit:'Cales', tags:['24 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
    ]
  },

  /* ══════════════════════════════════════
     HONDA
  ══════════════════════════════════════ */
  {
    marque: 'Honda', modele: 'CB500F', annees: [2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
    cylindree: 471, type: 'roadster',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Honda GN4 10W-30 · 3,4L', tags:['6 000 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:12000, mois_interval:null,temps_h:0.5, produit:'Honda OEM 17210-MJW-J00', tags:['12 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:12000, mois_interval:null,temps_h:1.2, produit:'NGK IZFR6K11 Iridium', tags:['12 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit DID 520 VX', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:16000, mois_interval:null,temps_h:3.5, produit:'Cales', tags:['16 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'Honda Ultra BF DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Honda Long Life Coolant · 2,1L', tags:['3 ans'], critique:false },
    ]
  },

  {
    marque: 'Honda', modele: 'CB750 Hornet', annees: [2023, 2024],
    cylindree: 755, type: 'roadster',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Honda GN4 10W-30 · 3,6L', tags:['6 000 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:12000, mois_interval:null,temps_h:0.5, produit:'Honda OEM', tags:['12 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x4)',              km_interval:12000, mois_interval:null,temps_h:2.0, produit:'NGK CPR9EA-9', tags:['12 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:16000, mois_interval:null,temps_h:4.5, produit:'Cales', tags:['16 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Honda Coolant · 2,2L', tags:['3 ans'], critique:false },
    ]
  },

  {
    marque: 'Honda', modele: 'Africa Twin CRF1100L', annees: [2020, 2021, 2022, 2023, 2024],
    cylindree: 1084, type: 'trail',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:1.0, produit:'Honda GN4 10W-30 · 5,7L', tags:['6 000 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:12000, mois_interval:null,temps_h:0.8, produit:'Honda OEM 17210-MKS-E00', tags:['12 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:16000, mois_interval:null,temps_h:1.5, produit:'NGK IZFR6K11', tags:['16 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:2.0, produit:'Kit DID 525 ZVM-X', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:24000, mois_interval:null,temps_h:5.0, produit:'Cales', tags:['24 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:1.0, produit:'Honda Ultra BF DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:1.0, produit:'Honda Coolant · 3,2L', tags:['3 ans'], critique:false },
      { id:'hf',  icon:'⚙️', nom:'Huile boîte DCT',          km_interval:12000, mois_interval:null,temps_h:0.8, produit:'Honda DCT Fluid · 0,84L', tags:['DCT uniquement'], critique:false },
    ]
  },

  {
    marque: 'Honda', modele: 'NC750X', annees: [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 745, type: 'trail-routier',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Honda GN4 10W-30 · 3,8L', tags:['6 000 km','1 an'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:12000, mois_interval:null,temps_h:0.8, produit:'NGK IZFR6K11 Iridium', tags:['12 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:16000, mois_interval:null,temps_h:4.0, produit:'Cales', tags:['16 000 km'], critique:true },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit DID 520', tags:['20 000 km'], critique:false },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Honda Coolant · 2,8L', tags:['3 ans'], critique:false },
    ]
  },

  /* ══════════════════════════════════════
     KAWASAKI
  ══════════════════════════════════════ */
  {
    marque: 'Kawasaki', modele: 'Z900', annees: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 948, type: 'roadster',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Motul 7100 10W-50 · 3,4L', tags:['6 000 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:15000, mois_interval:null,temps_h:0.5, produit:'Kawasaki OEM 11013-0777', tags:['15 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x4)',              km_interval:15000, mois_interval:null,temps_h:2.0, produit:'NGK CR9EIA-9 Iridium (x4)', tags:['15 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit RK 525 GXW', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:15000, mois_interval:null,temps_h:5.0, produit:'Cales', tags:['15 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'Motul RBF 600 DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Kawasaki Coolant · 2,3L', tags:['3 ans'], critique:false },
    ]
  },

  {
    marque: 'Kawasaki', modele: 'Z650', annees: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 649, type: 'roadster',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Motul 7100 10W-40 · 2L', tags:['6 000 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:15000, mois_interval:null,temps_h:0.5, produit:'Kawasaki OEM', tags:['15 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:15000, mois_interval:null,temps_h:1.2, produit:'NGK CR9EIA-9', tags:['15 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit DID 520', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:15000, mois_interval:null,temps_h:4.0, produit:'Cales', tags:['15 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
    ]
  },

  {
    marque: 'Kawasaki', modele: 'Versys 650', annees: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 649, type: 'trail-routier',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Motul 7100 10W-40 · 2L', tags:['6 000 km','1 an'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:15000, mois_interval:null,temps_h:1.2, produit:'NGK CR9EIA-9', tags:['15 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit DID 520', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:15000, mois_interval:null,temps_h:4.0, produit:'Cales', tags:['15 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Kawasaki Coolant · 2,2L', tags:['3 ans'], critique:false },
    ]
  },

  {
    marque: 'Kawasaki', modele: 'Ninja 400', annees: [2018, 2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 399, type: 'sportive',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Kawasaki 10W-40 · 1,8L', tags:['6 000 km','1 an'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:15000, mois_interval:null,temps_h:1.2, produit:'NGK CR9EIA-9', tags:['15 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit DID 520', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:15000, mois_interval:null,temps_h:3.5, produit:'Cales', tags:['15 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Kawasaki Coolant · 1,8L', tags:['3 ans'], critique:false },
    ]
  },

  /* ══════════════════════════════════════
     BMW
  ══════════════════════════════════════ */
  {
    marque: 'BMW', modele: 'R1250GS', annees: [2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 1254, type: 'trail',
    operations: [
      { id:'v10', icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:10000, mois_interval:12, temps_h:1.0, produit:'BMW Motorrad 15W-50 Advantec · 4L', tags:['10 000 km','1 an'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:20000, mois_interval:null,temps_h:1.5, produit:'NGK Iridium LZFR6KI11', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:20000, mois_interval:null,temps_h:5.0, produit:'Cales BMW', tags:['20 000 km'], critique:true },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:20000, mois_interval:null,temps_h:0.8, produit:'BMW OEM 13717715798', tags:['20 000 km'], critique:false },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:1.0, produit:'BMW DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:1.0, produit:'BMW Coolant · 1,5L', tags:['3 ans'], critique:false },
      { id:'hf',  icon:'⚙️', nom:'Huile boîte de vitesses',  km_interval:20000, mois_interval:null,temps_h:0.5, produit:'BMW Gear Oil · 0,75L', tags:['20 000 km'], critique:false },
      { id:'ha',  icon:'🔩', nom:'Huile transmission finale', km_interval:20000, mois_interval:null,temps_h:0.5, produit:'BMW Final Drive Oil · 0,25L', tags:['20 000 km'], critique:false },
      { id:'pn',  icon:'🔵', nom:'Pneus — contrôle usure',   km_interval:5000,  mois_interval:null,temps_h:0.2, produit:'Michelin Road 6 / Anakee recommandé', tags:['Usure','Pression'], critique:false },
    ]
  },

  {
    marque: 'BMW', modele: 'F900R', annees: [2020, 2021, 2022, 2023, 2024],
    cylindree: 895, type: 'roadster',
    operations: [
      { id:'v10', icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:10000, mois_interval:12, temps_h:0.8, produit:'BMW Motorrad 15W-50 · 4L', tags:['10 000 km','1 an'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:20000, mois_interval:null,temps_h:1.5, produit:'NGK Iridium', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:20000, mois_interval:null,temps_h:4.5, produit:'Cales BMW', tags:['20 000 km'], critique:true },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit RK 525 GXW', tags:['20 000 km'], critique:false },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'BMW DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'BMW Coolant · 2L', tags:['3 ans'], critique:false },
    ]
  },

  /* ══════════════════════════════════════
     DUCATI
  ══════════════════════════════════════ */
  {
    marque: 'Ducati', modele: 'Monster 937', annees: [2021, 2022, 2023, 2024],
    cylindree: 937, type: 'roadster',
    operations: [
      { id:'v7',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:7500,  mois_interval:12, temps_h:1.0, produit:'Shell Advance Ultra 15W-50 · 4L', tags:['7 500 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:15000, mois_interval:null,temps_h:0.8, produit:'Ducati OEM 42610331B', tags:['15 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:15000, mois_interval:null,temps_h:1.5, produit:'NGK SILMAR9A9 Iridium', tags:['15 000 km'], critique:false },
      { id:'cd',  icon:'⚙️', nom:'Courroies distribution (x2)',km_interval:15000,mois_interval:24, temps_h:6.0, produit:'Kit Ducati OEM 73740331A', tags:['15 000 km','2 ans','⚠ CRITIQUE'], critique:true },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:30000, mois_interval:null,temps_h:6.0, produit:'Pastilles de réglage Ducati', tags:['30 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:1.0, produit:'Motul RBF 600 DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:1.0, produit:'Ducati Coolant · 3L', tags:['3 ans'], critique:false },
      { id:'hb',  icon:'⚙️', nom:'Huile boîte de vitesses',  km_interval:15000, mois_interval:null,temps_h:0.5, produit:'Shell Advance Gear Oil · 0,5L', tags:['15 000 km'], critique:false },
    ]
  },

  {
    marque: 'Ducati', modele: 'Monster 821', annees: [2014, 2015, 2016, 2017, 2018, 2019, 2020],
    cylindree: 821, type: 'roadster',
    operations: [
      { id:'v7',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:7500,  mois_interval:12, temps_h:1.0, produit:'Shell Advance Ultra 15W-50 · 3,8L', tags:['7 500 km','1 an'], critique:false },
      { id:'cd',  icon:'⚙️', nom:'Courroies distribution (x2)',km_interval:12000,mois_interval:24, temps_h:6.0, produit:'Kit Ducati OEM', tags:['12 000 km','2 ans','⚠ CRITIQUE'], critique:true },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:12000, mois_interval:null,temps_h:1.5, produit:'NGK SILMAR9A9', tags:['12 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:24000, mois_interval:null,temps_h:6.0, produit:'Pastilles Ducati', tags:['24 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:1.0, produit:'DOT4', tags:['2 ans'], critique:false },
    ]
  },

  {
    marque: 'Ducati', modele: 'Multistrada V4', annees: [2021, 2022, 2023, 2024],
    cylindree: 1158, type: 'trail',
    operations: [
      { id:'v1',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:10000, mois_interval:12, temps_h:1.0, produit:'Shell Advance Ultra 15W-50 · 4,5L', tags:['10 000 km','1 an'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:30000, mois_interval:null,temps_h:8.0, produit:'Pastilles Ducati', tags:['30 000 km'], critique:true },
      { id:'bg',  icon:'⚡', nom:'Bougies (x4)',              km_interval:30000, mois_interval:null,temps_h:3.0, produit:'NGK Iridium (x4)', tags:['30 000 km'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:30000, mois_interval:null,temps_h:0.8, produit:'Ducati OEM', tags:['30 000 km'], critique:false },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:1.0, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:1.0, produit:'Ducati Coolant · 3,5L', tags:['3 ans'], critique:false },
    ]
  },

  /* ══════════════════════════════════════
     KTM
  ══════════════════════════════════════ */
  {
    marque: 'KTM', modele: '790 Duke', annees: [2018, 2019, 2020, 2021],
    cylindree: 799, type: 'roadster',
    operations: [
      { id:'v7',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:7500,  mois_interval:12, temps_h:0.8, produit:'Motorex Top Speed 15W-50 · 2,5L', tags:['7 500 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:15000, mois_interval:null,temps_h:0.5, produit:'KTM OEM 77306013000', tags:['15 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:15000, mois_interval:null,temps_h:1.2, produit:'NGK LMAR9AI-9', tags:['15 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit DID 520 VX', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:15000, mois_interval:null,temps_h:4.5, produit:'Cales', tags:['15 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'Castrol React DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'KTM Coolant · 1,5L', tags:['3 ans'], critique:false },
    ]
  },

  {
    marque: 'KTM', modele: '890 Duke R', annees: [2020, 2021, 2022, 2023, 2024],
    cylindree: 889, type: 'roadster',
    operations: [
      { id:'v7',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:7500,  mois_interval:12, temps_h:0.8, produit:'Motorex Top Speed 15W-50 · 2,5L', tags:['7 500 km','1 an'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:15000, mois_interval:null,temps_h:1.2, produit:'NGK LMAR9AI-9', tags:['15 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:15000, mois_interval:null,temps_h:4.5, produit:'Cales', tags:['15 000 km'], critique:true },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit DID 520', tags:['20 000 km'], critique:false },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
    ]
  },

  {
    marque: 'KTM', modele: '1290 Super Adventure', annees: [2017, 2018, 2019, 2020, 2021, 2022, 2023],
    cylindree: 1301, type: 'trail',
    operations: [
      { id:'v7',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:7500,  mois_interval:12, temps_h:1.0, produit:'Motorex Power Synt 4T 10W-50 · 3,5L', tags:['7 500 km','1 an'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:15000, mois_interval:null,temps_h:5.0, produit:'Cales', tags:['15 000 km'], critique:true },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:15000, mois_interval:null,temps_h:1.5, produit:'NGK Iridium', tags:['15 000 km'], critique:false },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:1.0, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:1.0, produit:'KTM Coolant · 2,5L', tags:['3 ans'], critique:false },
    ]
  },

  /* ══════════════════════════════════════
     TRIUMPH
  ══════════════════════════════════════ */
  {
    marque: 'Triumph', modele: 'Street Triple 765', annees: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 765, type: 'roadster',
    operations: [
      { id:'v1',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:10000, mois_interval:12, temps_h:0.8, produit:'Castrol Power 1 Racing 10W-50 · 3L', tags:['10 000 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:20000, mois_interval:null,temps_h:0.5, produit:'Triumph OEM T2201263', tags:['20 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x3)',              km_interval:10000, mois_interval:null,temps_h:2.0, produit:'NGK CR9EIA-9 Iridium (x3)', tags:['10 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit RK 520 XSO', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:20000, mois_interval:null,temps_h:5.0, produit:'Cales', tags:['20 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'Motul RBF 600 DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Triumph Coolant · 2,4L', tags:['3 ans'], critique:false },
    ]
  },

  {
    marque: 'Triumph', modele: 'Tiger 900', annees: [2020, 2021, 2022, 2023, 2024],
    cylindree: 888, type: 'trail',
    operations: [
      { id:'v1',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:10000, mois_interval:12, temps_h:1.0, produit:'Castrol Power 1 Racing 10W-50 · 3,7L', tags:['10 000 km','1 an'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x3)',              km_interval:20000, mois_interval:null,temps_h:2.0, produit:'NGK CR9EIA-9 Iridium', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:20000, mois_interval:null,temps_h:5.0, produit:'Cales', tags:['20 000 km'], critique:true },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit RK 525', tags:['20 000 km'], critique:false },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:1.0, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:1.0, produit:'Triumph Coolant · 2,8L', tags:['3 ans'], critique:false },
    ]
  },

  /* ══════════════════════════════════════
     SUZUKI
  ══════════════════════════════════════ */
  {
    marque: 'Suzuki', modele: 'GSX-S750', annees: [2017, 2018, 2019, 2020, 2021],
    cylindree: 749, type: 'roadster',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Motul 7100 10W-40 · 3,2L', tags:['6 000 km','1 an'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:14000, mois_interval:null,temps_h:0.5, produit:'Suzuki OEM K5650-06J00', tags:['14 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x4)',              km_interval:14000, mois_interval:null,temps_h:2.5, produit:'NGK CR9EIA-9 (x4)', tags:['14 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit RK 525 GXW', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:28000, mois_interval:null,temps_h:5.0, produit:'Cales', tags:['28 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Suzuki Coolant · 2,5L', tags:['3 ans'], critique:false },
    ]
  },

  {
    marque: 'Suzuki', modele: 'V-Strom 650', annees: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    cylindree: 645, type: 'trail-routier',
    operations: [
      { id:'v6',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:6000,  mois_interval:12, temps_h:0.8, produit:'Motul 7100 10W-40 · 2,9L', tags:['6 000 km','1 an'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:14000, mois_interval:null,temps_h:1.5, produit:'NGK CR9EIA-9', tags:['14 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:20000, mois_interval:null,temps_h:1.8, produit:'Kit DID 525', tags:['20 000 km'], critique:false },
      { id:'sv',  icon:'🔧', nom:'Jeu aux soupapes',         km_interval:28000, mois_interval:null,temps_h:4.5, produit:'Cales', tags:['28 000 km'], critique:true },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.8, produit:'DOT4', tags:['2 ans'], critique:false },
      { id:'bo',  icon:'💧', nom:'Liquide de refroidissement',km_interval:0,    mois_interval:36, temps_h:0.8, produit:'Suzuki Coolant · 2,7L', tags:['3 ans'], critique:false },
    ]
  },

  /* ══════════════════════════════════════
     HUSQVARNA / ROYAL ENFIELD / AUTRES
  ══════════════════════════════════════ */
  {
    marque: 'Royal Enfield', modele: 'Meteor 350', annees: [2021, 2022, 2023, 2024],
    cylindree: 349, type: 'roadster',
    operations: [
      { id:'v3',  icon:'🛢️', nom:'Vidange + filtre huile',   km_interval:3000,  mois_interval:6,  temps_h:0.5, produit:'Royal Enfield 15W-50 · 2L', tags:['3 000 km','6 mois'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:6000,  mois_interval:null,temps_h:0.5, produit:'Royal Enfield OEM', tags:['6 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougie (x1)',               km_interval:6000,  mois_interval:null,temps_h:0.3, produit:'NGK BR8ES', tags:['6 000 km'], critique:false },
      { id:'ch',  icon:'⛓️', nom:'Chaîne + pignons',         km_interval:15000, mois_interval:null,temps_h:1.5, produit:'Kit DID 520', tags:['15 000 km'], critique:false },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:0.5, produit:'DOT4', tags:['2 ans'], critique:false },
    ]
  },

  {
    marque: 'Harley-Davidson', modele: 'Sportster S', annees: [2021, 2022, 2023, 2024],
    cylindree: 1252, type: 'custom',
    operations: [
      { id:'v8',  icon:'🛢️', nom:'Vidange huile moteur',     km_interval:8000,  mois_interval:12, temps_h:1.0, produit:'Harley-Davidson Screamin Eagle SYN3 · 3,3L', tags:['8 000 km','1 an'], critique:false },
      { id:'hpf', icon:'⚙️', nom:'Huile primaire',           km_interval:16000, mois_interval:null,temps_h:0.5, produit:'Harley-Davidson Formula+ · 1L', tags:['16 000 km'], critique:false },
      { id:'htf', icon:'⚙️', nom:'Huile boîte 6 vitesses',  km_interval:16000, mois_interval:null,temps_h:0.5, produit:'Harley-Davidson Gear Oil · 0,9L', tags:['16 000 km'], critique:false },
      { id:'fa',  icon:'💨', nom:'Filtre à air',              km_interval:16000, mois_interval:null,temps_h:0.5, produit:'Harley-Davidson OEM', tags:['16 000 km'], critique:false },
      { id:'bg',  icon:'⚡', nom:'Bougies (x2)',              km_interval:16000, mois_interval:null,temps_h:1.5, produit:'Screamin Eagle Iridium', tags:['16 000 km'], critique:false },
      { id:'lf',  icon:'🔴', nom:'Liquide de frein',         km_interval:0,     mois_interval:24, temps_h:1.0, produit:'DOT4', tags:['2 ans'], critique:false },
    ]
  },

];

/* ══════════════════════════════════════════════════════════
   MOTEUR DE RECHERCHE
══════════════════════════════════════════════════════════ */

/**
 * Trouver le plan d'entretien pour une moto
 * @param {string} marque
 * @param {string} modele
 * @param {number} annee
 * @returns {object|null} Plan d'entretien ou null si non trouvé
 */
function trouverPlan(marque, modele, annee) {
  // Recherche exacte
  let plan = PLANS_DB.find(p =>
    p.marque.toLowerCase() === marque.toLowerCase() &&
    p.modele.toLowerCase() === modele.toLowerCase() &&
    p.annees.includes(parseInt(annee))
  );
  if (plan) return { ...plan, correspondance: 'exacte' };

  // Recherche partielle sur le modèle (ex: "MT-07 A2" → "MT-07")
  const modelePrincipal = modele.split(' ')[0].replace(/[^A-Z0-9-]/gi, '');
  plan = PLANS_DB.find(p =>
    p.marque.toLowerCase() === marque.toLowerCase() &&
    p.modele.toLowerCase().startsWith(modelePrincipal.toLowerCase())
  );
  if (plan) return { ...plan, correspondance: 'approximative', note: `Plan basé sur ${plan.marque} ${plan.modele}` };

  // Recherche par marque uniquement — plan générique
  return null;
}

/**
 * Plan générique pour les motos non référencées
 * Basé sur les intervalles standards de l'industrie
 */
function planGenerique(marque, modele, annee, cylindree) {
  const isGrosse = cylindree >= 800;
  const isMoto   = cylindree >= 250;

  return {
    marque, modele, annee,
    operations: [
      { id:'v', icon:'🛢️', nom:'Vidange + filtre huile',
        km_interval:  isGrosse ? 8000 : 6000,
        mois_interval: 12, temps_h: 0.8,
        produit: 'Huile 4T 10W-40 ou 10W-50 selon constructeur',
        tags: [isGrosse ? '8 000 km' : '6 000 km', '1 an'], critique:false },
      { id:'fa', icon:'💨', nom:'Filtre à air',
        km_interval: 12000, mois_interval:null, temps_h:0.5,
        produit:'Filtre OEM constructeur',
        tags:['12 000 km'], critique:false },
      { id:'bg', icon:'⚡', nom:'Bougies',
        km_interval: isGrosse ? 15000 : 12000, mois_interval:null, temps_h:1.5,
        produit:'NGK Iridium (vérifier référence constructeur)',
        tags:[isGrosse ? '15 000 km' : '12 000 km'], critique:false },
      { id:'ch', icon:'⛓️', nom:'Chaîne + pignons',
        km_interval: 20000, mois_interval:null, temps_h:1.8,
        produit:'Kit chaîne type O-ring',
        tags:['20 000 km'], critique:false },
      { id:'lf', icon:'🔴', nom:'Liquide de frein',
        km_interval: 0, mois_interval:24, temps_h:0.8,
        produit:'DOT4',
        tags:['2 ans'], critique:false },
      { id:'bo', icon:'💧', nom:'Liquide de refroidissement',
        km_interval: 0, mois_interval:36, temps_h:0.8,
        produit:'Liquide refroidissement constructeur',
        tags:['3 ans'], critique:false },
      { id:'sv', icon:'🔧', nom:'Jeu aux soupapes — vérification',
        km_interval: isGrosse ? 24000 : 18000, mois_interval:null, temps_h:4.0,
        produit:'Voir manuel constructeur',
        tags:[isGrosse ? '24 000 km' : '18 000 km'], critique:true },
    ],
    correspondance: 'generique',
    note: '⚠️ Plan générique — consultez le manuel constructeur pour les intervalles exacts'
  };
}

/**
 * Enrichir un plan avec les données kilométrage actuel
 * (calcul statut : urgent / warning / ok / future)
 */
function enrichirPlan(operations, km_actuel) {
  return operations.map(op => {
    const since  = km_actuel - (op.km_derniere || 0);
    const pct    = op.km_interval > 0 ? Math.min(100, Math.round((since / op.km_interval) * 100)) : 0;
    const left   = Math.max(0, op.km_interval - since);
    let statut   = 'ok';
    if      (pct >= 100)         statut = 'urgent';
    else if (pct >= 80)          statut = 'warning';
    else if (pct >= 40)          statut = 'due';
    else if (!op.km_derniere)    statut = 'future';
    return {
      ...op,
      km_actuel,
      pct_usage:   pct,
      km_restant:  left,
      statut,
      prochain_km: (op.km_derniere || 0) + op.km_interval,
    };
  });
}

/**
 * Générer les alertes urgentes pour une moto
 */
function getAlertes(operations, km_actuel) {
  return enrichirPlan(operations, km_actuel)
    .filter(op => op.statut === 'urgent' || op.statut === 'warning')
    .sort((a, b) => b.pct_usage - a.pct_usage);
}

/**
 * Liste de toutes les marques disponibles
 */
function getMarques() {
  return [...new Set(PLANS_DB.map(p => p.marque))].sort();
}

/**
 * Liste des modèles d'une marque
 */
function getModeles(marque) {
  return PLANS_DB
    .filter(p => p.marque.toLowerCase() === marque.toLowerCase())
    .map(p => ({ modele: p.modele, annees: p.annees, cylindree: p.cylindree, type: p.type }));
}

/**
 * Insérer le plan dans Supabase pour une moto
 * (appelé lors de la création d'une moto)
 */
async function insererPlanSupabase(supabaseClient, moto_id, marque, modele, annee, cylindree) {
  const planData = trouverPlan(marque, modele, annee)
               || planGenerique(marque, modele, annee, cylindree || 600);

  const ops = planData.operations.map(op => ({
    moto_id,
    code_operation: op.id,
    icon:           op.icon,
    nom:            op.nom,
    km_interval:    op.km_interval,
    mois_interval:  op.mois_interval || null,
    km_derniere:    0,
    temps_h:        op.temps_h || null,
    produit:        op.produit || null,
    tags:           op.tags || [],
    source:         planData.correspondance === 'exacte'
                    ? 'Manuel constructeur'
                    : planData.correspondance === 'approximative'
                    ? 'Manuel constructeur (approx.)'
                    : 'Recommandation générale',
  }));

  const { data, error } = await supabaseClient
    .from('plan_entretien')
    .upsert(ops, { onConflict: 'moto_id,code_operation' });

  if (error) throw new Error(`Plan entretien: ${error.message}`);

  return {
    nb_operations:  ops.length,
    correspondance: planData.correspondance,
    note:           planData.note || null,
    marque_ref:     planData.marque,
    modele_ref:     planData.modele,
  };
}

/* ══════════════════════════════════════════════════════════
   STATS DE LA BASE
══════════════════════════════════════════════════════════ */
const stats = {
  nb_motos:   PLANS_DB.length,
  nb_marques: getMarques().length,
  marques:    getMarques(),
  total_ops:  PLANS_DB.reduce((s, p) => s + p.operations.length, 0),
};

/* ══════════════════════════════════════════════════════════
   EXPORT
══════════════════════════════════════════════════════════ */
module.exports = {
  PLANS_DB,
  trouverPlan,
  planGenerique,
  enrichirPlan,
  getAlertes,
  getMarques,
  getModeles,
  insererPlanSupabase,
  stats,
};
