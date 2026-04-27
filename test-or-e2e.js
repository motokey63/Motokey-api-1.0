'use strict';
// Test E2E SBLayer — Ordres de Réparation (L3a)
// Usage : node test-or-e2e.js
// Prérequis : migration 08 exécutée, .env présent avec SUPABASE_URL + SUPABASE_SERVICE_KEY

const sb = require('./supabase');

if (!sb) {
  console.error('❌ supabase.js a retourné null — vérifie SUPABASE_URL et SUPABASE_SERVICE_KEY dans .env');
  process.exit(1);
}

const { supabase, OrdresReparation, OrTaches, OrPieces } = sb;

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test E2E Ordres de Réparation (L3a)    ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  // ── Setup : récupération garage / moto ──────────────────────────────────────
  console.log('── Setup ───────────────────────────────────────────────────────');

  const { data: garages, error: ge } = await supabase.from('garages').select('id, nom').limit(1);
  if (ge || !garages?.length) {
    console.error('❌ Aucun garage en BDD — migration garages manquante ?', ge?.message);
    process.exit(1);
  }
  const garage_id = garages[0].id;
  console.log(`  garage_id  : ${garage_id} (${garages[0].nom})`);

  const { data: motos, error: me } = await supabase
    .from('motos').select('id, plaque, client_id, km')
    .eq('garage_id', garage_id).limit(1);
  if (me || !motos?.length) {
    console.error(`❌ Aucune moto pour ce garage ${garage_id}${me ? ' — ' + me.message : ''} — crée-en une dans Supabase liée à ce garage_id`);
    process.exit(1);
  }
  const moto = motos[0];
  console.log(`  moto_id    : ${moto.id} (${moto.plaque})`);
  console.log(`  client_id  : ${moto.client_id || '(null)'}`);

  let or_id, tache_a_id;

  // ── Étape 1 : Créer l'OR ────────────────────────────────────────────────────
  console.log('\n── Étape 1 : Créer l\'OR ────────────────────────────────────────');
  try {
    const { ordre_reparation: or, totaux } = await OrdresReparation.create(garage_id, {
      moto_id:       moto.id,
      km_entree:     12345,
      notes_atelier: 'Test E2E'
    });
    or_id = or.id;
    console.log(`  numero_or  : ${or.numero_or}`);
    console.log(`  id         : ${or.id}`);
    console.log(`  statut     : ${or.statut}`);
    console.log(`  km_entree  : ${or.km_entree}`);
    check('numero_or non-vide',         !!or.numero_or);
    check('statut initial = brouillon', or.statut === 'brouillon');
    check('km_entree = 12345',          Number(or.km_entree) === 12345);
    check('totaux initiaux à zéro',     totaux.total_ttc === 0);
  } catch (e) {
    console.error('  ❌ ERREUR FATALE:', e.message);
    KO++;
    process.exit(1);
  }

  // ── Étape 2 : Ajouter les tâches ────────────────────────────────────────────
  console.log('\n── Étape 2 : Ajouter les tâches ────────────────────────────────');
  try {
    const resA = await OrTaches.create(garage_id, or_id, {
      libelle:      'Vidange moteur',
      duree_h:      0.5,
      taux_horaire: 60
    });
    tache_a_id = resA.tache.id;
    console.log(`  Tâche A id         : ${resA.tache.id}`);
    console.log(`  Tâche A montant_ht : ${resA.tache.montant_ht}  (attendu: 30.00)`);
    check('Tâche A montant_ht = 30', Number(resA.tache.montant_ht) === 30,
      `réel: ${resA.tache.montant_ht}`);

    const resB = await OrTaches.create(garage_id, or_id, {
      libelle:      'Contrôle freinage',
      duree_h:      0.75,
      taux_horaire: 60
    });
    console.log(`  Tâche B id         : ${resB.tache.id}`);
    console.log(`  Tâche B montant_ht : ${resB.tache.montant_ht}  (attendu: 45.00)`);
    check('Tâche B montant_ht = 45', Number(resB.tache.montant_ht) === 45,
      `réel: ${resB.tache.montant_ht}`);
    console.log(`  total_mo_ht OR après 2 tâches : ${resB.ordre_reparation.total_mo_ht}  (attendu: 75.00)`);
    check('total_mo_ht intermédiaire = 75', Number(resB.ordre_reparation.total_mo_ht) === 75);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Étape 3 : Ajouter les pièces ────────────────────────────────────────────
  console.log('\n── Étape 3 : Ajouter les pièces ────────────────────────────────');
  try {
    const resPA = await OrPieces.create(garage_id, or_id, {
      libelle: 'Huile 10W40 4L',
      qte:     1,
      pu_ht:   35,
      tva_pct: 20
    });
    console.log(`  Pièce A montant_ht : ${resPA.piece.montant_ht}  (attendu: 35.00)`);
    check('Pièce A montant_ht = 35', Number(resPA.piece.montant_ht) === 35,
      `réel: ${resPA.piece.montant_ht}`);

    const resPB = await OrPieces.create(garage_id, or_id, {
      libelle: 'Filtre à huile',
      qte:     1,
      pu_ht:   12,
      tva_pct: 20
    });
    console.log(`  Pièce B montant_ht : ${resPB.piece.montant_ht}  (attendu: 12.00)`);
    check('Pièce B montant_ht = 12', Number(resPB.piece.montant_ht) === 12,
      `réel: ${resPB.piece.montant_ht}`);
    console.log(`  total_pieces_ht OR après 2 pièces : ${resPB.ordre_reparation.total_pieces_ht}  (attendu: 47.00)`);
    check('total_pieces_ht intermédiaire = 47', Number(resPB.ordre_reparation.total_pieces_ht) === 47);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Étape 4 : Vérifier les totaux via getById ───────────────────────────────
  console.log('\n── Étape 4 : Vérifier les totaux via getById ───────────────────');
  try {
    const { totaux, taches, pieces } = await OrdresReparation.getById(or_id, garage_id);
    console.log(`  tâches en BDD      : ${taches.length}  (attendu: 2)`);
    console.log(`  pièces en BDD      : ${pieces.length}  (attendu: 2)`);
    console.log(`  total_mo_ht        : ${totaux.total_mo_ht}    (attendu: 75.00)`);
    console.log(`  total_pieces_ht    : ${totaux.total_pieces_ht}    (attendu: 47.00)`);
    console.log(`  total_ht           : ${totaux.total_ht}   (attendu: 122.00)`);
    console.log(`  total_tva          : ${totaux.total_tva}   (attendu: 24.40)`);
    console.log(`  total_ttc          : ${totaux.total_ttc}  (attendu: 146.40)`);
    check('2 tâches en BDD',          taches.length === 2);
    check('2 pièces en BDD',          pieces.length === 2);
    check('total_mo_ht = 75',         Number(totaux.total_mo_ht)     === 75,    `réel: ${totaux.total_mo_ht}`);
    check('total_pieces_ht = 47',     Number(totaux.total_pieces_ht) === 47,    `réel: ${totaux.total_pieces_ht}`);
    check('total_ht = 122',           Number(totaux.total_ht)        === 122,   `réel: ${totaux.total_ht}`);
    check('total_tva = 24.40',        Number(totaux.total_tva)       === 24.40, `réel: ${totaux.total_tva}`);
    check('total_ttc = 146.40',       Number(totaux.total_ttc)       === 146.40,`réel: ${totaux.total_ttc}`);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Étape 5 : Tâche A → fait ────────────────────────────────────────────────
  console.log('\n── Étape 5 : Tâche A → fait ────────────────────────────────────');
  try {
    const { tache } = await OrTaches.update(tache_a_id, garage_id, { statut: 'fait' });
    console.log(`  statut   : ${tache.statut}`);
    console.log(`  fait_le  : ${tache.fait_le}`);
    check('Tâche A statut = fait', tache.statut === 'fait',  `réel: ${tache.statut}`);
    check('fait_le positionné',    !!tache.fait_le);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Étape 6 : OR brouillon → en_cours ──────────────────────────────────────
  console.log('\n── Étape 6 : OR → en_cours (requis avant clôture) ─────────────');
  try {
    const or = await OrdresReparation.update(or_id, garage_id, { statut: 'en_cours' });
    console.log(`  statut : ${or.statut}`);
    check('Statut = en_cours', or.statut === 'en_cours', `réel: ${or.statut}`);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Étape 7 : Clôturer ─────────────────────────────────────────────────────
  console.log('\n── Étape 7 : Clôturer (tâche B encore a_faire → warning attendu) ──');
  console.log('  ↓ console.warn si tâche B non terminée :');
  try {
    const result = await OrdresReparation.cloturer(or_id, garage_id, { km_sortie: 12389 });
    console.log(`  statut       : ${result.ordre_reparation.statut}`);
    console.log(`  km_sortie    : ${result.ordre_reparation.km_sortie}`);
    console.log(`  date_cloture : ${result.ordre_reparation.date_cloture}`);
    console.log(`  intervention : ${result.intervention?.id || '(null)'}`);
    console.log(`  nouveau_score: ${result.nouveau_score ?? '(null)'}`);
    check('Clôture sans erreur',    true);
    check('intervention créée',     !!result.intervention);
    check('totaux non-nuls',        result.totaux.total_ttc > 0);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Étape 8 : Vérifier l'OR final ──────────────────────────────────────────
  console.log('\n── Étape 8 : OR final en BDD ───────────────────────────────────');
  try {
    const { ordre_reparation: orFinal, taches } = await OrdresReparation.getById(or_id, garage_id);
    const tacheB = taches.find(t => t.libelle === 'Contrôle freinage');
    console.log(`  statut       : ${orFinal.statut}`);
    console.log(`  km_sortie    : ${orFinal.km_sortie}`);
    console.log(`  date_cloture : ${orFinal.date_cloture}`);
    console.log(`  tâche B statut : ${tacheB?.statut}  (attendu: a_faire — non touchée)`);
    check('statut = termine',        orFinal.statut === 'termine',        `réel: ${orFinal.statut}`);
    check('km_sortie = 12389',       Number(orFinal.km_sortie) === 12389, `réel: ${orFinal.km_sortie}`);
    check('date_cloture non-null',   !!orFinal.date_cloture);
    check('tâche B intacte (a_faire)', tacheB?.statut === 'a_faire',      `réel: ${tacheB?.statut}`);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Récap ───────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(52));
  console.log(`📊 ${OK}/${OK + KO} checks passés`);
  if (KO === 0) {
    console.log('🎉 Scénario E2E complet.');
  } else {
    console.log(`⚠️  ${KO} erreur(s) détectée(s).`);
  }
  console.log(`🔍 OR en BDD pour inspection manuelle : ${or_id}\n`);
}

run().catch(e => {
  console.error('\n❌ Erreur fatale non interceptée :', e.message);
  process.exit(1);
});
