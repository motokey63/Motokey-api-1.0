# Notification client — ligne OR en attente d'acceptation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quand une ligne (tâche ou pièce) bascule `en_attente_acceptation_client` sur un OR, envoyer un email au client listant toutes les lignes en attente — un seul email par OR tant qu'il n'a pas répondu (anti-spam), avec fail-open (l'échec d'envoi ne bloque jamais la ligne) et visibilité côté atelier quand le client n'est pas notifiable.

**Architecture:** Deux nouvelles colonnes sur `ordres_reparation` (`derniere_notif_attente_envoyee_at` pour l'anti-spam, `notif_attente_echec_motif` pour la visibilité atelier). Deux nouvelles méthodes privées sur `OrdresReparation` (`supabase.js`) appelées depuis `OrTaches.create()`/`OrPieces.create()` (déclenchement) et `OrTaches.accepterLigne()`/`OrPieces.accepterLigne()` (réarmement). Nouveau template email suivant le pattern déjà câblé `services/emailService.js`. Bannière lecture seule dans `MotoKey_Atelier.html`.

**Tech Stack:** Node.js/Express, Supabase (Postgres), `services/emailService.js` (abstraction Resend + fallback dev), tests E2E par script Node autonome (pas de framework de test, convention du repo).

## Global Constraints

- Aucun lien magique d'acceptation/refus sans login depuis l'email (spec, décision 4).
- Aucun deep-link vers l'OR précis dans `MotoKey_Client.html` (spec, décision 5).
- Aucune relance automatique / cron (spec, décision 6).
- Le chemin RAM fallback (`motokey-api.js`, mirror dev de `OrTaches.create`/`OrPieces.create`) reste **non branché** (spec, décision 7).
- Fail-open strict : aucun `throw` ne doit jamais faire échouer la création de ligne ou son passage en `en_attente_acceptation_client` à cause d'un échec d'envoi email (spec, décision 10).
- `EMAIL_ENABLED=true` + `RESEND_API_KEY` sur Railway : action opérationnelle de Mehdi, hors scope de ce plan. Le code doit rester correct et sans risque avec `EMAIL_ENABLED=false` (mode dev actuel).
- `notifications.js` (code mort) : ne pas y toucher, ne pas le supprimer, ne pas le référencer.
- Éditions de code via l'outil Edit natif (str_replace) uniquement — jamais de sed/awk/PowerShell `-replace`, y compris sur les fichiers hors de la liste des 4 fichiers critiques du projet (discipline projet, voir mémoire `feedback_no_sed_critical_files`). `supabase.js` **est** un des 4 fichiers critiques (CLAUDE.md).
- Toute donnée de test créée en base (client/moto/OR) doit être nettoyée par ID exact en fin de script — jamais par email ou pattern (mémoire `feedback_test_fixture_deletion`).
- Migrations SQL appliquées manuellement par Mehdi via Supabase Dashboard SQL Editor — jamais automatiquement par l'agent (convention du repo, voir migrations 10-31).

---

### Task 1: Template email `or-ligne-attente`

**Files:**
- Create: `templates/emails/or-ligne-attente.js`
- Modify: `services/emailService.js:34-43`
- Test: `tests/test-template-or-ligne-attente.js`

**Interfaces:**
- Produces: `module.exports = { subject(data), html(data), text(data) }` où
  `data = { client_nom, moto, plaque, or_numero, lignes: string[], lien }`. Consommé par
  `OrdresReparation._notifierClientAttenteOR` (Task 3) via
  `emailService.send('or-ligne-attente', email, data)`.

- [ ] **Step 1: Écrire le test (module pas encore créé, doit échouer)**

Créer `tests/test-template-or-ligne-attente.js` :

```js
'use strict';
// Test pur (pas de DB) — templates/emails/or-ligne-attente.js
// Usage : node tests/test-template-or-ligne-attente.js

const tpl = require('../templates/emails/or-ligne-attente');

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

const data = {
  client_nom: 'Sophie Martin',
  moto: 'Yamaha MT-07',
  plaque: 'AB-123-CD',
  or_numero: 'INT-2026-0042',
  lignes: ['Remplacement disque avant', 'Plaquettes de frein avant'],
  lien: 'https://motokey-client.example/',
};

console.log('\n=== Test template email or-ligne-attente ===\n');

const subject = tpl.subject(data);
check('subject est une chaine non vide', typeof subject === 'string' && subject.length > 0, `réel: "${subject}"`);

const html = tpl.html(data);
check('html contient la 1ere ligne', html.includes('Remplacement disque avant'));
check('html contient la 2e ligne', html.includes('Plaquettes de frein avant'));
check('html contient le lien', html.includes(data.lien));
check('html contient le nom du client', html.includes(data.client_nom));
check('html contient le numero OR', html.includes(data.or_numero));

const text = tpl.text(data);
check('text contient la 1ere ligne', text.includes('Remplacement disque avant'));
check('text contient la 2e ligne', text.includes('Plaquettes de frein avant'));
check('text contient le lien', text.includes(data.lien));

console.log(`\n${OK}/${OK + KO} checks passés`);
if (KO > 0) process.exitCode = 1;
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node tests/test-template-or-ligne-attente.js`
Expected: `Error: Cannot find module '../templates/emails/or-ligne-attente'`

- [ ] **Step 3: Créer le template**

Créer `templates/emails/or-ligne-attente.js` (même structure que `templates/emails/welcome.js`,
header/footer identiques) :

```js
'use strict';

// Template : notification client — ligne(s) OR en attente d'acceptation
// data : { client_nom, moto, plaque, or_numero, lignes, lien }
// lignes : string[] — libellés des lignes (tâches/pièces) actuellement en attente sur cet OR

const header = `
  <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0;">
    <span style="color:#ff6b00;font-size:22px;font-weight:700;letter-spacing:1px;">MOTO<span style="color:#fff;">KEY</span></span>
  </div>`;

const footer = `
  <div style="background:#f5f5f5;padding:16px 32px;border-radius:0 0 8px 8px;font-size:12px;color:#888;border-top:1px solid #e0e0e0;">
    MotoKey — Passeport numérique moto · MOTOLAB SAS · 142 Av. du Brézet, 63000 Clermont-Ferrand<br>
    <a href="mailto:motolab63@gmail.com" style="color:#888;">motolab63@gmail.com</a>
  </div>`;

module.exports = {
  subject: () => `MotoKey — Une intervention complémentaire attend votre accord`,

  html: (data) => {
    const items = (data.lignes || []).map(l => `<li style="margin:4px 0;">${l}</li>`).join('');
    return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f0f0f0;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    ${header}
    <div style="padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a2e;">Bonjour ${data.client_nom},</h1>
      <p style="color:#444;line-height:1.6;margin:0 0 12px;">
        Une intervention complémentaire nécessite votre accord sur votre
        <strong>${data.moto}</strong> (${data.plaque}), OR <strong>${data.or_numero}</strong> :
      </p>
      <ul style="color:#444;line-height:1.6;margin:0 0 20px;padding-left:20px;">${items}</ul>
      <p style="color:#444;line-height:1.6;margin:0 0 24px;">
        Connectez-vous à votre espace MotoKey pour accepter ou refuser ces travaux
        complémentaires.
      </p>
      <a href="${data.lien}" style="display:inline-block;background:#ff6b00;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:700;">
        Voir mon dossier MotoKey
      </a>
    </div>
    ${footer}
  </div>
</body>
</html>`;
  },

  text: (data) => {
    const items = (data.lignes || []).map(l => `- ${l}`).join('\n');
    return `Bonjour ${data.client_nom},\n\n` +
      `Une intervention complémentaire nécessite votre accord sur votre ${data.moto} (${data.plaque}), OR ${data.or_numero} :\n` +
      `${items}\n\n` +
      `Connectez-vous à votre espace MotoKey pour accepter ou refuser : ${data.lien}\n\n` +
      `— L'équipe MotoKey`;
  }
};
```

- [ ] **Step 4: Relancer le test, vérifier qu'il passe**

Run: `node tests/test-template-or-ligne-attente.js`
Expected: `9/9 checks passés`, `process.exitCode` non défini (0)

- [ ] **Step 5: Enregistrer le template dans `services/emailService.js`**

Modifier `services/emailService.js:34-43` :

```js
const TEMPLATES = {
  welcome:          require('../templates/emails/welcome'),
  verify:           require('../templates/emails/verify'),
  reset:            require('../templates/emails/reset'),
  'login-alert':    require('../templates/emails/login-alert'),
  'billing-confirm': require('../templates/emails/billing-confirm'),
  'trial-ending':    require('../templates/emails/trial-ending'),
  'payment-failed':  require('../templates/emails/payment-failed'),
  'subscription-cancelled': require('../templates/emails/subscription-cancelled'),
  'or-ligne-attente': require('../templates/emails/or-ligne-attente'),
};
```

- [ ] **Step 6: Vérifier la syntaxe**

Run: `node --check services/emailService.js`
Expected: aucune sortie (pas d'erreur)

- [ ] **Step 7: Commit**

```bash
git add templates/emails/or-ligne-attente.js services/emailService.js tests/test-template-or-ligne-attente.js
git commit -m "feat(notif): template email or-ligne-attente + enregistrement"
```

---

### Task 2: Migration SQL — colonnes anti-spam et visibilité atelier

**Files:**
- Create: `sql/migrations/32_notif_attente_or_anti_spam.sql`

**Interfaces:**
- Produces: colonnes `ordres_reparation.derniere_notif_attente_envoyee_at` (TIMESTAMPTZ, nullable)
  et `ordres_reparation.notif_attente_echec_motif` (TEXT, nullable) — consommées par Task 3
  (écriture) et Task 4 (lecture côté atelier).

- [ ] **Step 1: Écrire la migration**

Créer `sql/migrations/32_notif_attente_or_anti_spam.sql` (même style que la migration 31 — ASCII
dans les commentaires, `ADD COLUMN IF NOT EXISTS`, `COMMENT ON COLUMN`) :

```sql
-- ═══════════════════════════════════════════════════════════
-- Migration 32 — Anti-spam notification client OR en attente
-- ═══════════════════════════════════════════════════════════
-- Ajoute 2 colonnes a ordres_reparation :
--
-- derniere_notif_attente_envoyee_at (NULLABLE) — anti-spam : un seul email
-- client par OR tant que le client n'a pas repondu (accepte une ligne).
-- Meme principe que dernier_palier_calendaire_envoye_at (migration 31),
-- mais sur ordres_reparation plutot que consommables. NULL = pas encore
-- notifie ou reinitialise (le compteur se rearme a chaque acceptation de
-- ligne, cf. OrTaches.accepterLigne / OrPieces.accepterLigne).
--
-- notif_attente_echec_motif (NULLABLE) — raison pour laquelle le client
-- n'a PAS pu etre notifie (moto sans client, client sans email, ou echec
-- d'envoi Resend) : 'moto_sans_client' | 'client_sans_email' | 'echec_envoi'.
-- Lu par l'ecran atelier (MotoKey_Atelier.html) pour avertir le mecano
-- que le client ne recevra rien tant que la cause n'est pas corrigee.
-- Remis a NULL des qu'un envoi reussit ou qu'une ligne est acceptee.
--
-- Doctrine fail-open (voir docs/superpowers/specs/2026-07-24-notif-client-or-attente-design.md,
-- decision 10) : un echec d'envoi ne bloque JAMAIS la bascule
-- en_attente_acceptation_client de la ligne elle-meme — seul le canal de
-- notification echoue, pas l'obligation d'accord client.
--
-- À appliquer manuellement via Supabase Dashboard > SQL Editor.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE ordres_reparation
  ADD COLUMN IF NOT EXISTS derniere_notif_attente_envoyee_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notif_attente_echec_motif         TEXT;

COMMENT ON COLUMN ordres_reparation.derniere_notif_attente_envoyee_at IS
  'Anti-spam : horodatage du dernier email client envoye pour cet OR (NULL = pas encore notifie ou rearme apres acceptation de ligne). Un seul email par OR tant que non reinitialise.';
COMMENT ON COLUMN ordres_reparation.notif_attente_echec_motif IS
  'Raison de non-notification client : moto_sans_client | client_sans_email | echec_envoi. NULL = dernier envoi reussi ou sans objet. Affiche cote atelier.';
```

- [ ] **Step 2: Relire le fichier pour vérifier qu'il n'y a pas d'erreur de syntaxe SQL évidente**

Relire `sql/migrations/32_notif_attente_or_anti_spam.sql` avec l'outil Read — vérifier la
cohérence des noms de colonnes avec le reste de la migration (pas d'exécution automatisée
possible, pas d'outil de migration dans ce repo).

- [ ] **Step 3: STOP — checkpoint manuel obligatoire**

Ne pas continuer vers Task 3 avant que Mehdi ait appliqué cette migration en prod via Supabase
Dashboard > SQL Editor (colle le contenu du fichier, exécute). Task 3 contient un test E2E qui
échouera si les colonnes n'existent pas encore.

- [ ] **Step 4: Commit**

```bash
git add sql/migrations/32_notif_attente_or_anti_spam.sql
git commit -m "feat(notif): migration 32 — colonnes anti-spam notif OR attente"
```

---

### Task 3: Déclenchement, anti-spam, réarmement, fail-open

**Files:**
- Modify: `services/emailService.js:51-78` (fonction `send`, retour exploitable)
- Modify: `supabase.js:1037-1057` (nouvelles méthodes `OrdresReparation._marquerNonNotifiable` /
  `OrdresReparation._notifierClientAttenteOR`, colocalisées après `_revenirEnCoursSiPlusDeLigneEnAttente`)
- Modify: `supabase.js:1209` (`OrTaches.create`, point d'appel déclenchement)
- Modify: `supabase.js:1231` (`OrTaches.accepterLigne`, point d'appel réarmement)
- Modify: `supabase.js:1309` (`OrPieces.create`, point d'appel déclenchement)
- Modify: `supabase.js:1328` (`OrPieces.accepterLigne`, point d'appel réarmement)
- Test: `tests/test-notif-attente-or.js`

**Interfaces:**
- Consumes: `emailService.send(template, to, data)` (Task 1), colonnes
  `derniere_notif_attente_envoyee_at`/`notif_attente_echec_motif` (Task 2).
- Produces: `OrdresReparation._notifierClientAttenteOR(or_id): Promise<void>` (jamais de throw),
  `OrdresReparation._marquerNonNotifiable(or_id, raison, detail?): Promise<void>` (jamais de
  throw) — consommées par Task 4 côté lecture uniquement (`or.notif_attente_echec_motif`).

Ce chantier touche 2 fichiers de façon interdépendante (le déclenchement et le réarmement forment
un seul mécanisme cohérent — tester l'un sans l'autre serait incomplet). Le test est écrit
d'abord, mais son "état rouge" attendu n'est pas une erreur de module manquant (comme Task 1) :
c'est un ensemble d'assertions qui échouent parce que rien ne pose encore les colonnes.

- [ ] **Step 1: Écrire le test E2E (échouera : rien ne pose encore les colonnes)**

Créer `tests/test-notif-attente-or.js` :

```js
'use strict';
// Test E2E — SBLayer — Notification client anti-spam sur OR en attente (amendement review 24/07/2026)
// Usage : node tests/test-notif-attente-or.js (depuis la racine du repo)
// Prérequis : migration 32 appliquée (ordres_reparation.derniere_notif_attente_envoyee_at +
// notif_attente_echec_motif), .env présent avec SUPABASE_URL + SUPABASE_SERVICE_KEY.
// EMAIL_ENABLED=false attendu en local — l'envoi passe en mode console.log (safe, pas d'email réel).

const sb = require('../supabase');
if (!sb) {
  console.error('❌ supabase.js a retourné null — vérifie SUPABASE_URL et SUPABASE_SERVICE_KEY dans .env');
  process.exit(1);
}
const { supabase, Motos, OrdresReparation, OrTaches, OrPieces } = sb;

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

// Fixtures créées par ce script, nettoyées à la fin (par ID exact).
const cleanup = { motos: [], clients: [], ordres: [] };

async function creerMotoAvecClient(garage_id, emailClient) {
  const moto = await Motos.create(garage_id, {
    proprietaire_type: 'client',
    client_nom: 'TEST_notif_attente_or',
    client_email: emailClient || undefined,
    marque: 'TestMarque', modele: 'TestModele', annee: 2024,
    plaque: 'TEST-' + Date.now().toString(36).toUpperCase(),
    vin: 'TESTVIN' + Date.now(),
  });
  cleanup.motos.push(moto.id);
  if (moto.client_id) cleanup.clients.push(moto.client_id);
  return moto;
}

async function creerMotoSansClient(garage_id) {
  const moto = await Motos.create(garage_id, {
    proprietaire_type: 'garage',
    marque: 'TestMarque', modele: 'TestModele', annee: 2024,
    plaque: 'TEST-' + Date.now().toString(36).toUpperCase(),
    vin: 'TESTVIN' + Date.now(),
  });
  cleanup.motos.push(moto.id);
  return moto;
}

async function creerOrEnCours(garage_id, moto_id) {
  const { ordre_reparation: or } = await OrdresReparation.create(garage_id, { moto_id, km_entree: 0 });
  await OrdresReparation.update(or.id, garage_id, { statut: 'en_cours' });
  cleanup.ordres.push(or.id);
  return or.id;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test E2E notif client anti-spam OR en attente          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const { data: anyMoto, error: me } = await supabase.from('motos').select('garage_id').limit(1).single();
  if (me || !anyMoto) {
    console.error('❌ Aucune moto en BDD — nécessaire pour récupérer un garage_id valide');
    process.exit(1);
  }
  const garage_id = anyMoto.garage_id;
  console.log(`  garage_id : ${garage_id}`);

  // ── Scénario A : anti-spam — 1 déclenchement pour 3 lignes ajoutées coup sur coup ──
  console.log('\n── Scénario A : anti-spam (3 lignes → 1 seul déclenchement) ────────');
  try {
    const moto = await creerMotoAvecClient(garage_id, `test-notif-${Date.now()}@example.com`);
    const or_id = await creerOrEnCours(garage_id, moto.id);

    await OrTaches.create(garage_id, or_id, { libelle: 'Ligne 1', duree_h: 1, taux_horaire: 60 }, { user_id: 'test', role: 'MECANO' });
    // Le helper est fire-and-forget (create() ne l'attend pas) — laisser une
    // micro-tâche s'écouler avant de relire la colonne.
    await wait(300);
    const { data: orApres1 } = await supabase.from('ordres_reparation').select('derniere_notif_attente_envoyee_at').eq('id', or_id).single();
    check('derniere_notif_attente_envoyee_at posé après la 1ère ligne', !!orApres1.derniere_notif_attente_envoyee_at);
    const ts1 = orApres1.derniere_notif_attente_envoyee_at;

    await OrTaches.create(garage_id, or_id, { libelle: 'Ligne 2', duree_h: 1, taux_horaire: 60 }, { user_id: 'test', role: 'MECANO' });
    await OrPieces.create(garage_id, or_id, { libelle: 'Ligne 3', qte: 1, pu_ht: 10 }, { user_id: 'test', role: 'MECANO' });
    await wait(300);
    const { data: orApres3 } = await supabase.from('ordres_reparation').select('derniere_notif_attente_envoyee_at').eq('id', or_id).single();
    check('timestamp inchangé après 2 lignes supplémentaires (anti-spam)', orApres3.derniere_notif_attente_envoyee_at === ts1,
      `avant: ${ts1} / après: ${orApres3.derniere_notif_attente_envoyee_at}`);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message); KO++;
  }

  // ── Scénario B : réarmement à l'acceptation, nouvelle ligne redéclenche ──
  console.log('\n── Scénario B : réarmement après acceptation ────────────────────────');
  try {
    const moto = await creerMotoAvecClient(garage_id, `test-notif-${Date.now()}@example.com`);
    const or_id = await creerOrEnCours(garage_id, moto.id);

    const t1 = await OrTaches.create(garage_id, or_id, { libelle: 'Ligne A', duree_h: 1, taux_horaire: 60 }, { user_id: 'test', role: 'MECANO' });
    await wait(300);
    await OrTaches.accepterLigne(t1.tache.id, moto.client_id);

    const { data: orApresAccept } = await supabase.from('ordres_reparation').select('derniere_notif_attente_envoyee_at').eq('id', or_id).single();
    check('derniere_notif_attente_envoyee_at remis à NULL après acceptation', orApresAccept.derniere_notif_attente_envoyee_at === null,
      `réel: ${orApresAccept.derniere_notif_attente_envoyee_at}`);

    await OrTaches.create(garage_id, or_id, { libelle: 'Ligne B', duree_h: 1, taux_horaire: 60 }, { user_id: 'test', role: 'MECANO' });
    await wait(300);
    const { data: orApresB } = await supabase.from('ordres_reparation').select('derniere_notif_attente_envoyee_at').eq('id', or_id).single();
    check('un nouveau timestamp est posé pour la ligne B (redéclenchement)', !!orApresB.derniere_notif_attente_envoyee_at);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message); KO++;
  }

  // ── Scénario C : moto sans client (propriété polymorphe L8) ──────────────
  console.log('\n── Scénario C : moto sans client ─────────────────────────────────');
  try {
    const moto = await creerMotoSansClient(garage_id);
    const or_id = await creerOrEnCours(garage_id, moto.id);
    await OrTaches.create(garage_id, or_id, { libelle: 'Ligne C', duree_h: 1, taux_horaire: 60 }, { user_id: 'test', role: 'MECANO' });
    await wait(300);
    const { data: orC } = await supabase.from('ordres_reparation').select('notif_attente_echec_motif, derniere_notif_attente_envoyee_at').eq('id', or_id).single();
    check("notif_attente_echec_motif = 'moto_sans_client'", orC.notif_attente_echec_motif === 'moto_sans_client', `réel: ${orC.notif_attente_echec_motif}`);
    check("derniere_notif_attente_envoyee_at reste NULL (pas d'envoi réussi)", orC.derniere_notif_attente_envoyee_at === null);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message); KO++;
  }

  // ── Scénario D : client sans email ────────────────────────────────────────
  console.log('\n── Scénario D : client sans email ────────────────────────────────');
  try {
    const moto = await creerMotoAvecClient(garage_id, null);
    const or_id = await creerOrEnCours(garage_id, moto.id);
    await OrTaches.create(garage_id, or_id, { libelle: 'Ligne D', duree_h: 1, taux_horaire: 60 }, { user_id: 'test', role: 'MECANO' });
    await wait(300);
    const { data: orD } = await supabase.from('ordres_reparation').select('notif_attente_echec_motif').eq('id', or_id).single();
    check("notif_attente_echec_motif = 'client_sans_email'", orD.notif_attente_echec_motif === 'client_sans_email', `réel: ${orD.notif_attente_echec_motif}`);
  } catch (e) {
    console.error('  ❌ ERREUR:', e.message); KO++;
  }

  // ── Nettoyage (par ID exact) ───────────────────────────────────────────────
  console.log('\n── Nettoyage des fixtures de test ────────────────────────────────');
  for (const or_id of cleanup.ordres) {
    await supabase.from('or_taches').delete().eq('or_id', or_id);
    await supabase.from('or_pieces').delete().eq('or_id', or_id);
    await supabase.from('or_historique').delete().eq('or_id', or_id);
    await supabase.from('ordres_reparation').delete().eq('id', or_id);
  }
  for (const moto_id of cleanup.motos) {
    await supabase.from('motos_proprietaires_historique').delete().eq('moto_id', moto_id);
    await supabase.from('motos').delete().eq('id', moto_id);
  }
  for (const client_id of cleanup.clients) {
    await supabase.from('clients').delete().eq('id', client_id);
  }
  console.log(`  ${cleanup.ordres.length} OR, ${cleanup.motos.length} moto(s), ${cleanup.clients.length} client(s) supprimés par ID exact.`);

  console.log('\n' + '═'.repeat(60));
  console.log(`📊 ${OK}/${OK + KO} checks passés`);
  if (KO > 0) process.exitCode = 1;
  console.log('═'.repeat(60) + '\n');
}

run().catch(err => { console.error('Erreur fatale :', err.message); process.exitCode = 1; });
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue de façon attendue**

Run: `node tests/test-notif-attente-or.js`
Expected: les checks `posé après la 1ère ligne`, `remis à NULL après acceptation`,
`notif_attente_echec_motif = 'moto_sans_client'` et `notif_attente_echec_motif = 'client_sans_email'`
échouent (❌) — rien ne pose encore ces colonnes. Le nettoyage doit quand même s'exécuter sans
erreur (les fixtures sont créées même si les colonnes restent vides).

- [ ] **Step 3: Faire retourner un résultat exploitable à `emailService.send()`**

Modifier `services/emailService.js:51-78` (fonction `send`, actuellement sans `return` explicite
dans les 3 branches) :

```js
async function send(template, to, data) {
  const tpl = TEMPLATES[template];
  if (!tpl) {
    console.error(`❌ [7b] emailService.send — template inconnu: "${template}"`);
    return { error: `template inconnu: ${template}` };
  }

  const subject = tpl.subject(data);
  const html    = tpl.html(data);
  const text    = tpl.text(data);

  if (EMAIL_ENABLED && resendClient) {
    try {
      await resendClient.emails.send({ from: RESEND_FROM, to, subject, html, text });
      console.log(`📧 [7b] Email "${template}" envoyé à ${to}`);
      return { sent: true };
    } catch (e) {
      // On ne lève pas l'erreur : l'email ne doit pas bloquer le flux auth
      console.error(`❌ [7b] Erreur envoi email "${template}" à ${to}:`, e.message);
      return { error: e.message };
    }
  } else {
    // Mode développement
    console.log(`\n📧 [7b][DEV] ─── Email "${template}" ──────────────`);
    console.log(`   À      : ${to}`);
    console.log(`   Sujet  : ${subject}`);
    console.log(`   Texte  : ${text.replace(/\n/g, '\n   ')}`);
    console.log(`──────────────────────────────────────────────────\n`);
    return { sent: true, dev: true };
  }
}
```

(La signature reste compatible : le seul appelant existant, l'email `welcome` dans
`motokey-api.js:2546`, ignore déjà la valeur de retour — `.catch()` sur la promesse continue de
ne jamais se déclencher puisque `send()` ne relance toujours aucune exception.)

- [ ] **Step 4: Ajouter les deux nouvelles méthodes sur `OrdresReparation`**

Modifier `supabase.js` juste après la fin de `_revenirEnCoursSiPlusDeLigneEnAttente` (ligne 1057,
`},` de fermeture) et avant `async changerStatut(...)` :

```js
  // Amendement review 24/07/2026 (voir docs/superpowers/specs/2026-07-24-notif-client-or-attente-design.md,
  // décisions 9/10) : marque l'OR comme "client non notifiable" pour la raison donnée — lu par
  // l'écran atelier (MotoKey_Atelier.html). Ne jamais throw : le côté serveur retourne un résultat
  // en base, jamais une exception qui remonterait jusqu'à la création de ligne.
  async _marquerNonNotifiable(or_id, raison, detail) {
    if (detail) console.error(`⚠️  [L14bis] notif attente OR ${or_id} — ${raison}:`, detail);
    const { error } = await supabase.from('ordres_reparation')
      .update({ notif_attente_echec_motif: raison }).eq('id', or_id);
    if (error) console.error(`⚠️  [L14bis] _marquerNonNotifiable — échec update OR ${or_id}:`, error.message);
  },

  // Amendement review 24/07/2026 (décision 1, anti-spam par OR) : un seul email par OR tant que
  // derniere_notif_attente_envoyee_at n'a pas été réinitialisé (accepterLigne). Relit TOUTES les
  // lignes actuellement en attente sur l'OR (pas seulement celle qui déclenche) pour l'email.
  async _notifierClientAttenteOR(or_id) {
    const { data: or } = await supabase.from('ordres_reparation')
      .select('numero, moto_id, derniere_notif_attente_envoyee_at').eq('id', or_id).single();
    if (!or || or.derniere_notif_attente_envoyee_at) return; // anti-spam : déjà notifié

    const { data: moto } = await supabase.from('motos')
      .select('marque, modele, plaque, client_id').eq('id', or.moto_id).single();
    if (!moto || !moto.client_id) return OrdresReparation._marquerNonNotifiable(or_id, 'moto_sans_client');

    const { data: client } = await supabase.from('clients')
      .select('nom, email').eq('id', moto.client_id).single();
    if (!client || !client.email) return OrdresReparation._marquerNonNotifiable(or_id, 'client_sans_email');

    const [{ data: taches }, { data: pieces }] = await Promise.all([
      supabase.from('or_taches').select('libelle').eq('or_id', or_id).eq('en_attente_acceptation_client', true),
      supabase.from('or_pieces').select('libelle').eq('or_id', or_id).eq('en_attente_acceptation_client', true),
    ]);
    const lignes = [...(taches || []), ...(pieces || [])].map(l => l.libelle);
    if (!lignes.length) return; // garde défensive, ne devrait pas arriver ici

    // Lazy require, même pattern que consommableRappelService plus haut dans ce fichier —
    // évite un cycle supabase.js <-> services/*.
    const emailService = require('./services/emailService');
    const result = await emailService.send('or-ligne-attente', client.email, {
      client_nom: client.nom, moto: `${moto.marque} ${moto.modele}`, plaque: moto.plaque,
      or_numero: or.numero, lignes, lien: process.env.FRONTEND_CLIENT_URL || '',
    });

    if (result && result.error) return OrdresReparation._marquerNonNotifiable(or_id, 'echec_envoi', result.error);

    const { error } = await supabase.from('ordres_reparation')
      .update({ derniere_notif_attente_envoyee_at: new Date().toISOString(), notif_attente_echec_motif: null })
      .eq('id', or_id);
    if (error) console.error(`⚠️  [L14bis] _notifierClientAttenteOR — échec update OR ${or_id}:`, error.message);
  },
```

- [ ] **Step 5: Brancher le déclenchement dans `OrTaches.create()`**

Modifier `supabase.js:1209` — après la ligne existante
`if (enCoursDejaLance) await OrdresReparation._basculerEnAttentePourLigne(or_id, ctx);` et avant
`const orMaj = await OrdresReparation.recalculerTotaux(or_id);` :

```js
    if (enCoursDejaLance) await OrdresReparation._basculerEnAttentePourLigne(or_id, ctx);
    if (requiertAcceptation) OrdresReparation._notifierClientAttenteOR(or_id).catch(e => console.error('❌ [L14bis] _notifierClientAttenteOR:', e.message));
    const orMaj = await OrdresReparation.recalculerTotaux(or_id);
```

- [ ] **Step 6: Brancher le déclenchement dans `OrPieces.create()`**

Même changement dans `supabase.js:1309`, entre l'appel `_basculerEnAttentePourLigne` existant et
`recalculerTotaux` :

```js
    if (enCoursDejaLance) await OrdresReparation._basculerEnAttentePourLigne(or_id, ctx);
    if (requiertAcceptation) OrdresReparation._notifierClientAttenteOR(or_id).catch(e => console.error('❌ [L14bis] _notifierClientAttenteOR:', e.message));
    const orMaj = await OrdresReparation.recalculerTotaux(or_id);
```

- [ ] **Step 7: Brancher le réarmement dans `OrTaches.accepterLigne()`**

Modifier `supabase.js:1231` — après
`await OrdresReparation._revenirEnCoursSiPlusDeLigneEnAttente(existing.or_id, { user_id: client_id, role: 'CLIENT' });`
et avant `const orMaj = await OrdresReparation.recalculerTotaux(existing.or_id);` :

```js
    await OrdresReparation._revenirEnCoursSiPlusDeLigneEnAttente(existing.or_id, { user_id: client_id, role: 'CLIENT' });
    const { error: reErr } = await supabase.from('ordres_reparation')
      .update({ derniere_notif_attente_envoyee_at: null, notif_attente_echec_motif: null })
      .eq('id', existing.or_id);
    if (reErr) throw new Error(reErr.message);
    const orMaj = await OrdresReparation.recalculerTotaux(existing.or_id);
```

- [ ] **Step 8: Brancher le réarmement dans `OrPieces.accepterLigne()`**

Même changement dans `supabase.js:1328` :

```js
    await OrdresReparation._revenirEnCoursSiPlusDeLigneEnAttente(existing.or_id, { user_id: client_id, role: 'CLIENT' });
    const { error: reErr } = await supabase.from('ordres_reparation')
      .update({ derniere_notif_attente_envoyee_at: null, notif_attente_echec_motif: null })
      .eq('id', existing.or_id);
    if (reErr) throw new Error(reErr.message);
    const orMaj = await OrdresReparation.recalculerTotaux(existing.or_id);
```

- [ ] **Step 9: Vérifier la syntaxe**

Run: `node --check supabase.js && node --check services/emailService.js`
Expected: aucune sortie (pas d'erreur)

- [ ] **Step 10: Relancer le test E2E, vérifier qu'il passe entièrement**

Run: `node tests/test-notif-attente-or.js`
Expected: `10/10 checks passés`, `📊` récapitulatif sans `❌`, `process.exitCode` non défini (0)

- [ ] **Step 11: Commit**

```bash
git add services/emailService.js supabase.js tests/test-notif-attente-or.js
git commit -m "feat(notif): anti-spam par OR, réarmement, fail-open (supabase.js + emailService.js)"
```

---

### Task 4: Visibilité côté atelier — bannière « client non notifiable »

**Files:**
- Modify: `MotoKey_Atelier.html` (fonction `renderStatutActions`, ~ligne 854-880)

**Interfaces:**
- Consumes: `or.notif_attente_echec_motif` (Task 2/3, déjà présent dans l'objet `or` retourné par
  `GET /ordres-reparation/:id` → `OrdresReparation.getById` fait déjà `select('*, ...)` sur
  `ordres_reparation`, aucun changement de requête nécessaire côté serveur).

Pas de test automatisé possible ici (pas de framework de test frontend dans ce repo) —
vérification manuelle en navigateur à la fin de la tâche.

- [ ] **Step 1: Ajouter la fonction de rendu et le dictionnaire de libellés**

Modifier `MotoKey_Atelier.html`, juste avant `function renderStatutActions(or, { offline, lignesEnAttente }) {`
(ligne 854) :

```js
// Amendement review 24/07/2026 (décision 9) : le client n'a pas pu être prévenu par email — le
// mécano doit le savoir pour le prévenir lui-même, sinon il attend un accord qui n'arrivera
// jamais. notif_attente_echec_motif est posé par OrdresReparation._notifierClientAttenteOR /
// _marquerNonNotifiable côté serveur (supabase.js), remis à NULL dès qu'un envoi réussit ou
// qu'une ligne est acceptée.
const NON_NOTIFIABLE_LABELS = {
  moto_sans_client:  "Cette moto n'a pas de client associé.",
  client_sans_email: "Ce client n'a pas d'email enregistré.",
  echec_envoi:       "L'envoi de l'email au client a échoué.",
};
function renderNonNotifiableHint(or) {
  const motif = or.notif_attente_echec_motif;
  if (!motif) return '';
  const label = NON_NOTIFIABLE_LABELS[motif] || "Le client n'a pas pu être notifié.";
  return `<div class="statut-hint" style="background:#fef3c7;border-color:#f59e0b;color:#92400e">⚠️ Client non notifiable — préviens-le directement. ${escapeHtml(label)}</div>`;
}

function renderStatutActions(or, { offline, lignesEnAttente }) {
```

- [ ] **Step 2: Afficher la bannière quand l'OR est en attente**

Modifier le bloc `if (or.statut === 'attente') { ... }` (`MotoKey_Atelier.html:869-875`) :

```js
  if (or.statut === 'attente') {
    const blocked = lignesEnAttente;
    return `<div class="statut-actions">
      <button class="btn-action go" ${(offline || blocked) ? 'disabled' : ''} onclick="reprendreOr()">▶ Reprendre les travaux</button>
    </div>
    ${blocked ? '<div class="statut-hint">🔴 Des lignes complémentaires attendent encore l\'accord du client — impossible de reprendre tant qu\'elles ne sont pas validées.</div>' : ''}
    ${renderNonNotifiableHint(or)}`;
  }
```

- [ ] **Step 3: Vérifier la syntaxe JS embarquée**

Run: `node --check motokey-api.js`
Expected: aucune sortie — ce check ne couvre pas directement `MotoKey_Atelier.html` (fichier
HTML, pas un module Node), mais confirme qu'aucune régression n'a été introduite côté serveur
pendant cette tâche. Relire visuellement le bloc modifié avec l'outil Read pour vérifier
l'absence d'erreur de syntaxe JS évidente (accolades, template strings).

- [ ] **Step 4: Vérification manuelle en navigateur**

1. Démarrer le serveur local (`node motokey-api.js`) — nécessite les colonnes de la migration 32
   appliquées en prod (le serveur local pointe sur la même base Supabase).
2. Dans Supabase Dashboard (ou via un script ponctuel), poser manuellement
   `notif_attente_echec_motif = 'client_sans_email'` sur un OR de test réel actuellement en
   statut `attente`.
3. Ouvrir `/atelier`, se connecter avec le compte MÉCANO de test, ouvrir cet OR.
4. Vérifier que la bannière jaune « ⚠️ Client non notifiable — préviens-le directement. Ce client
   n'a pas d'email enregistré. » apparaît sous les actions de statut.
5. Remettre `notif_attente_echec_motif` à `NULL` sur cet OR de test après vérification (ne pas
   laisser une donnée de test polluer un OR réel).

- [ ] **Step 5: Commit**

```bash
git add MotoKey_Atelier.html
git commit -m "feat(notif): bannière atelier client non notifiable"
```

---

## Self-Review

**Couverture spec :**
- Décision 1 (anti-spam par OR) → Task 3, Steps 4-8, testé Scénarios A/B.
- Décision 2 (client sans email, skip silencieux) → Task 3, Step 4 (`_marquerNonNotifiable`),
  testé Scénario D.
- Décision 3 (moto sans client) → Task 3, Step 4, testé Scénario C.
- Décision 4 (contenu email simple, lien login) → Task 1.
- Décision 5 (pas de deep-link) → respecté par construction (Task 1, `lien` = `FRONTEND_CLIENT_URL` brut).
- Décision 6 (pas de relance) → aucune tâche cron ajoutée, conforme.
- Décision 7 (RAM fallback non branché) → `motokey-api.js` non touché par ce plan, conforme.
- Décision 8 (`EMAIL_ENABLED=false` sans risque) → Task 3 Step 3, mode dev retourne `{sent, dev}`.
- Décision 9 (skip visible atelier) → Task 4.
- Décision 10 (fail-open tracé) → Task 3 Step 3 (retour exploitable) + Step 4
  (`_marquerNonNotifiable(or_id, 'echec_envoi', ...)`), jamais de `throw` propagé jusqu'à `create()`.
- Dette `notifications.js` → non touché, conforme aux Global Constraints.
- Prérequis Resend prod → hors scope code, rappelé dans Global Constraints.

**Scan placeholders :** aucun `TBD`/`TODO` ; le point spec explicitement laissé ouvert (décision 9,
« mécanisme non tranché ») est ici tranché concrètement (colonne DB + lecture directe côté
atelier, option (a) de la spec) — pas de report à un plan ultérieur.

**Cohérence des types/noms :** `_notifierClientAttenteOR(or_id)` et `_marquerNonNotifiable(or_id,
raison, detail?)` utilisés identiquement dans Task 3 (définition) et référencés nulle part
ailleurs. `notif_attente_echec_motif` (Task 2, colonne) = `or.notif_attente_echec_motif` (Task 4,
lecture) = valeur écrite par `_marquerNonNotifiable` (Task 3) — trois usages du même nom exact.
`derniere_notif_attente_envoyee_at` : même vérification, cohérent entre Task 2/3.
