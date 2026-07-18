'use strict';
// Test E2E SBLayer — L10 commit 2 (Bloc A numérotation + Bloc B acceptation ligne-à-ligne)
// Usage : node tests/test-or-numero-and-acceptation.js (depuis la racine du repo)
// Prérequis : migration 27 exécutée (or_numero_compteurs, attribuer_numero_or(),
// ordres_reparation.attente_auto), .env présent avec SUPABASE_URL + SUPABASE_SERVICE_KEY.

const sb = require('../supabase');

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

const MOTIF_AUTO = "Travaux complémentaires en attente d'acceptation client";

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test E2E L10 commit 2 (numéro OR + acceptation) ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // ── Setup ────────────────────────────────────────────────────────────────
  console.log('── Setup ───────────────────────────────────────────────────────');

  // Part d'une moto existante plutôt que d'un garage au hasard — au moins
  // un garage en prod n'a aucune moto (Pôle Moto MOTOLAB), .limit(1) sur
  // `garages` seul peut donc tomber sur un garage inutilisable pour ce test.
  const { data: motos, error: me } = await supabase
    .from('motos').select('id, plaque, client_id, km, garage_id').limit(1);
  if (me || !motos?.length) {
    console.error(`❌ Aucune moto en BDD${me ? ' — ' + me.message : ''}`);
    process.exit(1);
  }
  const moto = motos[0];
  const garage_id = moto.garage_id;
  console.log(`  garage_id  : ${garage_id}`);
  console.log(`  moto_id    : ${moto.id} (${moto.plaque})`);

  let clientId = moto.client_id || null;
  if (!clientId) {
    const { data: anyClient } = await supabase.from('clients').select('id').limit(1).single();
    clientId = anyClient ? anyClient.id : null;
  }
  if (!clientId) {
    console.error('❌ Aucun client en BDD — nécessaire pour tester accepterLigne (accepte_par_client_id FK clients.id)');
    process.exit(1);
  }
  console.log(`  client_id  : ${clientId} (pour accepterLigne)`);

  // ── Bloc A — Étape 1 : numérotation séquentielle simple ────────────────────
  console.log('\n── Bloc A · Étape 1 : numérotation séquentielle ────────────────');
  let numeroA1, numeroA2;
  try {
    const r1 = await OrdresReparation.create(garage_id, { moto_id: moto.id, km_entree: moto.km });
    const r2 = await OrdresReparation.create(garage_id, { moto_id: moto.id, km_entree: moto.km });
    numeroA1 = r1.ordre_reparation.numero;
    numeroA2 = r2.ordre_reparation.numero;
    console.log(`  numero #1 : ${numeroA1}`);
    console.log(`  numero #2 : ${numeroA2}`);
    const annee = new Date().getFullYear();
    const re = new RegExp(`^INT-${annee}-\\d{4}$`);
    check('numero #1 au format INT-YYYY-NNNN', re.test(numeroA1), `réel: ${numeroA1}`);
    check('numero #2 au format INT-YYYY-NNNN', re.test(numeroA2), `réel: ${numeroA2}`);
    check('numero #2 = numero #1 + 1',
      parseInt(numeroA2.split('-')[2], 10) === parseInt(numeroA1.split('-')[2], 10) + 1,
      `#1=${numeroA1} #2=${numeroA2}`);
    check('numero_or (ancien champ) toujours renseigné', !!r1.ordre_reparation.numero_or);
  } catch (e) {
    console.error('  ❌ ERREUR FATALE:', e.message);
    KO++;
    process.exit(1);
  }

  // ── Bloc A — Étape 2 : concurrence (pas de doublon) ─────────────────────────
  // Teste attribuerNumeroOr() directement, PAS OrdresReparation.create() en
  // entier : create() alimente aussi `numero_or` (ancien champ, intact,
  // hors scope) via un COUNT(*)+1 non atomique — une vraie création
  // concurrente de 8 OR complets fait remonter CETTE race préexistante
  // (contrainte ordres_reparation_numero_unique), pas un bug de ce commit.
  // Isoler attribuerNumeroOr() ici prouve l'atomicité de `numero` sans
  // dépendre du champ legacy qu'on n'a pas le droit de toucher.
  console.log('\n── Bloc A · Étape 2 : concurrence — attribuerNumeroOr() en parallèle ──');
  try {
    const N = 8;
    const numeros = await Promise.all(
      Array.from({ length: N }, () => OrdresReparation.attribuerNumeroOr(garage_id))
    );
    const uniques = new Set(numeros);
    console.log(`  ${N} appels parallèles → numeros : ${numeros.join(', ')}`);
    check(`${N} numeros tous distincts (pas de doublon)`, uniques.size === N,
      `${uniques.size}/${N} uniques`);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  console.log('\n  ⚠️  NOTE : `numero_or` (ancien champ) génère par COUNT(*)+1 non');
  console.log('  atomique (supabase.js:967-969, intact, hors scope de ce commit) —');
  console.log('  une vraie création concurrente de plusieurs OR via create() peut');
  console.log('  donc violer ordres_reparation_numero_unique. Bug préexistant,');
  console.log('  révélé par ce test, à traiter séparément si Mehdi le souhaite.');

  // ── Bloc B — Étape 1 : ligne ajoutée sur OR en_cours → bascule attente ──────
  console.log('\n── Bloc B · Étape 1 : ligne ajoutée sur OR en_cours ────────────');
  let or_id, tache_id, piece_id;
  try {
    const { ordre_reparation: or } = await OrdresReparation.create(garage_id, { moto_id: moto.id, km_entree: moto.km });
    or_id = or.id;
    // Setup direct (comme test-or-e2e.js Étape 6) : update() bypass la
    // matrice de transition, seulement pour amener l'OR en_cours sans
    // cérémonie — le comportement testé ici est celui de OrTaches.create,
    // pas celui de changerStatut.
    await OrdresReparation.update(or_id, garage_id, { statut: 'en_cours' });

    const resT = await OrTaches.create(garage_id, or_id, {
      libelle: 'Remplacement disque avant', duree_h: 1, taux_horaire: 60
    }, { user_id: 'test-mecano', role: 'MECANO' });
    tache_id = resT.tache.id;
    console.log(`  tâche.ajoutee_en_cours              : ${resT.tache.ajoutee_en_cours}`);
    console.log(`  tâche.en_attente_acceptation_client  : ${resT.tache.en_attente_acceptation_client}`);
    console.log(`  OR.statut après ajout                : ${resT.ordre_reparation.statut}`);
    check('tache.ajoutee_en_cours = true',              resT.tache.ajoutee_en_cours === true);
    check('tache.en_attente_acceptation_client = true', resT.tache.en_attente_acceptation_client === true);

    const { data: orApresT } = await supabase.from('ordres_reparation').select('statut, attente_auto, attente_motif').eq('id', or_id).single();
    check("OR bascule en 'attente'",       orApresT.statut === 'attente',      `réel: ${orApresT.statut}`);
    check('attente_auto = true',           orApresT.attente_auto === true);
    check('attente_motif = motif par défaut', orApresT.attente_motif === MOTIF_AUTO, `réel: ${orApresT.attente_motif}`);

    // Deuxième ligne complémentaire (pièce) pendant que l'OR est déjà en
    // 'attente' d'origine auto — sert l'étape 2 (accepter une ligne ne
    // doit PAS repasser en_cours tant qu'il en reste une autre en attente).
    const resP = await OrPieces.create(garage_id, or_id, {
      libelle: 'Disque de frein avant', qte: 1, pu_ht: 45, tva_pct: 20
    }, { user_id: 'test-mecano', role: 'MECANO' });
    piece_id = resP.piece.id;
    check('piece.en_attente_acceptation_client = true', resP.piece.en_attente_acceptation_client === true);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Bloc B — Étape 2 : acceptation partielle (une ligne sur deux) ───────────
  console.log('\n── Bloc B · Étape 2 : acceptation partielle (1/2 lignes) ───────');
  try {
    const resAcc = await OrTaches.accepterLigne(tache_id, clientId);
    console.log(`  tâche.en_attente_acceptation_client : ${resAcc.tache.en_attente_acceptation_client}`);
    console.log(`  tâche.accepte_par_client_id          : ${resAcc.tache.accepte_par_client_id}`);
    console.log(`  OR.statut après 1/2 acceptée         : ${resAcc.ordre_reparation.statut}`);
    check('tache.en_attente_acceptation_client = false', resAcc.tache.en_attente_acceptation_client === false);
    check('tache.date_acceptation_ligne renseignée',     !!resAcc.tache.date_acceptation_ligne);
    check('tache.accepte_par_client_id = clientId',      resAcc.tache.accepte_par_client_id === clientId);
    check("OR reste 'attente' (pièce encore en attente)", resAcc.ordre_reparation.statut === 'attente',
      `réel: ${resAcc.ordre_reparation.statut}`);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Bloc B — Étape 3 : acceptation complète → auto-retour en_cours ──────────
  console.log('\n── Bloc B · Étape 3 : dernière ligne acceptée → auto-retour en_cours ──');
  try {
    const resAccP = await OrPieces.accepterLigne(piece_id, clientId);
    console.log(`  OR.statut après 2/2 acceptées : ${resAccP.ordre_reparation.statut}`);
    check("OR repasse 'en_cours' (plus aucune ligne en attente)", resAccP.ordre_reparation.statut === 'en_cours',
      `réel: ${resAccP.ordre_reparation.statut}`);
    const { data: orFinal } = await supabase.from('ordres_reparation').select('attente_auto').eq('id', or_id).single();
    check('attente_auto remis à false', orFinal.attente_auto === false);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Bloc B — Étape 4 : garde — jamais d'auto-revert sur attente MANUELLE ────
  console.log('\n── Bloc B · Étape 4 : attente manuelle → PAS d\'auto-revert ────');
  let or2_id, tache2_id;
  try {
    const { ordre_reparation: or2 } = await OrdresReparation.create(garage_id, { moto_id: moto.id, km_entree: moto.km });
    or2_id = or2.id;
    await OrdresReparation.update(or2_id, garage_id, { statut: 'en_cours' });

    // Simule : attente posée manuellement (attente_auto=FALSE), PENDANT
    // qu'une ligne complémentaire est déjà en attente d'acceptation —
    // scénario contrivé pour isoler la garde attente_auto elle-même,
    // indépendamment de la mécanique qui la pose en temps normal.
    const { data: tache2 } = await supabase.from('or_taches').insert({
      garage_id, or_id: or2_id, ordre: 1, libelle: 'Test garde attente_auto',
      duree_h: 0.5, taux_horaire: 60, montant_ht: 30, statut: 'a_faire',
      ajoutee_en_cours: true, en_attente_acceptation_client: true
    }).select().single();
    tache2_id = tache2.id;
    await supabase.from('ordres_reparation').update({
      statut: 'attente', attente_motif: 'Attente pièce (motif manuel, sans lien avec la ligne)', attente_auto: false
    }).eq('id', or2_id);

    const resAcc2 = await OrTaches.accepterLigne(tache2_id, clientId);
    console.log(`  OR.statut après acceptation (attente manuelle) : ${resAcc2.ordre_reparation.statut}`);
    check("OR reste 'attente' (attente_auto était false, pas d'auto-revert)",
      resAcc2.ordre_reparation.statut === 'attente', `réel: ${resAcc2.ordre_reparation.statut}`);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Bloc B — Étape 5 : ligne sur OR brouillon → PAS de bascule ──────────────
  console.log('\n── Bloc B · Étape 5 : ligne sur OR brouillon (hors en_cours) ───');
  try {
    const { ordre_reparation: or3 } = await OrdresReparation.create(garage_id, { moto_id: moto.id, km_entree: moto.km });
    const resT3 = await OrTaches.create(garage_id, or3.id, {
      libelle: 'Vidange (devis initial)', duree_h: 0.5, taux_horaire: 60
    });
    check('tache.ajoutee_en_cours = false (OR en brouillon)',             resT3.tache.ajoutee_en_cours === false);
    check('tache.en_attente_acceptation_client = false (OR en brouillon)', resT3.tache.en_attente_acceptation_client === false);
    check("OR reste 'brouillon'", resT3.ordre_reparation.statut === 'brouillon', `réel: ${resT3.ordre_reparation.statut}`);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message);
    KO++;
  }

  // ── Récap ───────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`📊 ${OK}/${OK + KO} checks passés`);
  if (KO === 0) {
    console.log('🎉 L10 commit 2 (Bloc A + Bloc B) validé.');
  } else {
    console.log(`⚠️  ${KO} échec(s) — voir détail ci-dessus.`);
    process.exitCode = 1;
  }
  console.log('═'.repeat(60) + '\n');
}

run().catch((err) => {
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
