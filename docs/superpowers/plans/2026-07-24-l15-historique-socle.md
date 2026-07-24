# L15 — Reprise d'historique : Socle backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend complet (migration DB, service OCR, vérification de cohérence km, endpoints) permettant à un CLIENT ou un GARAGE d'importer un document d'entretien ancien (facture/justificatif) sur une moto, de le faire lire par l'IA, de le valider humainement, et de le promouvoir en `intervention` datée du passé — sans jamais toucher au moteur de score ni au circuit `releves_km`.

**Architecture:** Table `factures_scannees` étendue sert de zone de dépôt (staging) : un import crée une ligne `ocr_raw` + `photo_url` ; la validation humaine remplit les champs déclarés, vérifie la cohérence km par voisin chronologique en lecture sur `interventions`, gère la divergence client/garage, puis promeut vers une vraie ligne `interventions` (jamais d'insertion automatique). Un nouvel espace métier `HistoriqueImport` dans `supabase.js` porte toute la logique ; `motokey-api.js` ne fait que RBAC + plomberie HTTP, comme le reste du fichier.

**Tech Stack:** Node.js/Express (routeur maison, pas de framework), Supabase (Postgres + supabase-js v2), `@anthropic-ai/sdk` via `services/anthropicVisionClient.js` (L12), Cloudinary (`services/cloudinaryService.js`), tests unitaires maison (`node tests/xxx.js`, pattern `check()`/`OK`/`KO`, pas de framework de test).

## Global Constraints

- **Ne jamais écrire dans `releves_km`** ni déclencher `trg_sync_moto_km`/`trg_verifier_km_monotone` — tout km d'import d'historique vit uniquement dans `interventions.km` / `interventions.date_intervention` (déjà découplé du ratchet monotone, voir `Interventions.create()` `supabase.js:536-554`, commentaire D-05 : "km d'intervention est un HISTORIQUE découplé... permet la saisie d'entretien passé, km < km actuel de la moto").
- **Ne jamais modifier `recalc_score_moto()`** (trigger SQL) ni la logique de calcul de score existante — voir amendement (a) du cadrage. Les interventions importées utilisent `type='jaune'` (existant) et `niveau_preuve='facture'` (colonne existante, jamais lue par le score aujourd'hui — c'est un défaut assumé, pas un bug à corriger ici).
- **Jamais d'insertion automatique en base sans validation humaine explicite** (décision 5 du cadrage) — l'endpoint de staging (`POST /motos/:id/historique`) ne crée JAMAIS de ligne `interventions`, uniquement une ligne `factures_scannees` avec `validated_at IS NULL`.
- **Rejet km tracé, jamais silencieux** (décision 2) — si la cohérence km échoue à la validation, la ligne `factures_scannees` reste en base avec `km_coherence_statut='rejete'` et `km_coherence_motif` rempli ; aucune `intervention` n'est créée ; l'API retourne 409 avec le motif.
- **`interventions.garage_id` est `NOT NULL`** — toujours résolu depuis `moto.garage_id` (toujours posé à la création de la moto, y compris pour un import initié par un CLIENT), jamais laissé vide.
- **Édition des fichiers critiques** (`motokey-api.js`, `supabase.js`) : `str_replace` natif uniquement (via l'outil Edit), jamais de script PowerShell/sed/awk.
- **Migration SQL** : le fichier `.sql` est écrit et commité par l'implémenteur, mais **appliqué manuellement par Mehdi via le Supabase Dashboard SQL Editor** — jamais exécuté directement contre la prod par l'agent (convention déjà établie sur ce projet, voir CLAUDE.md).
- **Modèle Vision** : `claude-haiku-4-5`, même modèle que `services/etiquettePieceService.js` — aucune nouvelle variable d'environnement (réutilise `VISION_ENABLED`/`ANTHROPIC_API_KEY` déjà posées).

---

## File Structure

**Créer :**
- `sql/migrations/33_l15_historique_import_socle.sql` — extension `factures_scannees`
- `services/kmCoherenceHistorique.js` — fonction pure de vérification voisin chronologique
- `services/historiqueFactureService.js` — schéma OCR facture (mirror `etiquettePieceService.js`)
- `tests/test-km-coherence-historique-unit.js` — tests unitaires purs (aucun mock)
- `tests/test-historique-facture-service-mock.js` — tests mock OCR (mirror `test-etiquette-service-mock.js`)
- `tests/test-historique-import-supabase-unit.js` — tests unitaires `HistoriqueImport` (mock `supabase.from`, pattern `test-notif-attente-or-unit.js`)

**Modifier :**
- `supabase.js` — ajoute le namespace `HistoriqueImport` (staging, liste, validation, contre-signature) + export
- `motokey-api.js` — ajoute 1 route multipart (staging) + 3 routes JSON (liste, valider, contresigner) + 1 handler + 1 require

---

### Task 1: Migration SQL — extension `factures_scannees`

**Files:**
- Create: `sql/migrations/33_l15_historique_import_socle.sql`

**Interfaces:**
- Produces: colonnes `garage_id`, `acteur_type`, `acteur_id`, `photo_url`, `plaque_declaree`, `date_document`, `km_declare`, `siret_declare`, `nom_garage_declare`, `km_coherence_statut`, `km_coherence_motif`, `divergence_de`, `intervention_id`, `contresigne_par_garage_id`, `contresigne_at` sur `factures_scannees` — consommées par le namespace `HistoriqueImport` (Task 4-6).

- [ ] **Step 1: Écrire la migration**

```sql
-- ═══════════════════════════════════════════════════════════
-- Migration 33 — L15 socle : extension factures_scannees pour reprise d'historique
-- ═══════════════════════════════════════════════════════════
-- Ajoute les colonnes nécessaires à l'import d'historique (client ET garage),
-- au traçage de divergence, et à la vérification de cohérence km par voisin
-- chronologique. Voir docs/superpowers/specs/2026-07-24-L15-reprise-historique-cadrage.md.
-- image_base64 reste en base pour compat descendante mais n'est plus alimentée par
-- ce flux — les nouveaux imports écrivent dans photo_url (Cloudinary), même pattern
-- que photo_url/facture_url ailleurs dans l'app.
-- Idempotent (IF NOT EXISTS partout). Appliquer manuellement via Supabase Dashboard
-- SQL Editor — jamais exécutée directement par l'agent.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS garage_id UUID REFERENCES garages(id) ON DELETE SET NULL;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS acteur_type TEXT CHECK (acteur_type IN ('client','garage'));
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS acteur_id UUID;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS plaque_declaree TEXT;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS date_document DATE;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS km_declare INTEGER;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS siret_declare TEXT;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS nom_garage_declare TEXT;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS km_coherence_statut TEXT DEFAULT 'valide' CHECK (km_coherence_statut IN ('valide','rejete'));
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS km_coherence_motif TEXT;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS divergence_de UUID REFERENCES factures_scannees(id) ON DELETE SET NULL;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS intervention_id UUID REFERENCES interventions(id) ON DELETE SET NULL;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS contresigne_par_garage_id UUID REFERENCES garages(id) ON DELETE SET NULL;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS contresigne_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_factures_scannees_moto_id ON factures_scannees(moto_id);
```

- [ ] **Step 2: Commit**

```bash
git add sql/migrations/33_l15_historique_import_socle.sql
git commit -m "feat(L15): migration 33 — extension factures_scannees (socle historique)"
```

**Note d'exécution** : cette migration doit être transmise à Mehdi pour application manuelle via Supabase Dashboard AVANT d'exécuter les tests des Tasks 4-6 contre une vraie base (les tests unitaires de ce plan mockent `supabase.from`, donc n'ont pas besoin que la migration soit déjà appliquée pour passer — mais tout test manuel `curl` contre le serveur local en a besoin).

---

### Task 2: `services/kmCoherenceHistorique.js` — vérification voisin chronologique

**Files:**
- Create: `services/kmCoherenceHistorique.js`
- Test: `tests/test-km-coherence-historique-unit.js`

**Interfaces:**
- Produces: `verifierCoherenceKm(candidat, interventionsExistantes)` — `candidat: {date_document: string 'YYYY-MM-DD', km_declare: number}`, `interventionsExistantes: Array<{date_intervention: string, km: number}>` → `{statut: 'valide'|'rejete', motif: string|null}`. Consommé par `HistoriqueImport.valider()` (Task 5).

- [ ] **Step 1: Écrire le test (échoue — module inexistant)**

Créer `tests/test-km-coherence-historique-unit.js` :

```javascript
'use strict';
// Tests unitaires PURS (aucun mock, aucune I/O) — vérifierCoherenceKm compare
// un candidat d'import au voisin chronologique le plus proche (avant ET après),
// pas au max global. Voir amendement (b) du cadrage L15.
// Usage : node tests/test-km-coherence-historique-unit.js

const { verifierCoherenceKm } = require('../services/kmCoherenceHistorique');

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║  MotoKey — Tests unitaires vérifierCoherenceKm (L15 socle)      ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// ── aucun historique existant → toujours valide ─────────────────────────
{
  const r = verifierCoherenceKm({ date_document: '2018-03-01', km_declare: 12000 }, []);
  check('aucun historique → valide', r.statut === 'valide' && r.motif === null, JSON.stringify(r));
}

// ── cohérent entre deux voisins (2015 à 6000, 2020 à 7500 → 2018 à 6800 OK) ─
{
  const existantes = [
    { date_intervention: '2015-01-10', km: 6000 },
    { date_intervention: '2020-06-15', km: 7500 },
  ];
  const r = verifierCoherenceKm({ date_document: '2018-03-01', km_declare: 6800 }, existantes);
  check('entre deux voisins, km croissant → valide', r.statut === 'valide', JSON.stringify(r));
}

// ── régression par rapport au voisin AVANT → rejeté ──────────────────────
{
  const existantes = [
    { date_intervention: '2015-01-10', km: 6000 },
    { date_intervention: '2020-06-15', km: 7500 },
  ];
  const r = verifierCoherenceKm({ date_document: '2018-03-01', km_declare: 5000 }, existantes);
  check('km inférieur au voisin avant → rejeté', r.statut === 'rejete', JSON.stringify(r));
  check('motif mentionne le voisin avant', r.motif && r.motif.includes('2015-01-10'), r.motif);
}

// ── dépassement du voisin APRÈS → rejeté ─────────────────────────────────
{
  const existantes = [
    { date_intervention: '2015-01-10', km: 6000 },
    { date_intervention: '2020-06-15', km: 7500 },
  ];
  const r = verifierCoherenceKm({ date_document: '2018-03-01', km_declare: 9000 }, existantes);
  check('km supérieur au voisin après → rejeté', r.statut === 'rejete', JSON.stringify(r));
  check('motif mentionne le voisin après', r.motif && r.motif.includes('2020-06-15'), r.motif);
}

// ── seulement un voisin avant (import le plus récent) → doit être >= lui ─
{
  const existantes = [{ date_intervention: '2015-01-10', km: 6000 }];
  const ok = verifierCoherenceKm({ date_document: '2022-01-01', km_declare: 15000 }, existantes);
  check('seulement voisin avant, km supérieur → valide', ok.statut === 'valide', JSON.stringify(ok));
  const ko = verifierCoherenceKm({ date_document: '2022-01-01', km_declare: 3000 }, existantes);
  check('seulement voisin avant, km inférieur → rejeté', ko.statut === 'rejete', JSON.stringify(ko));
}

// ── seulement un voisin après (import le plus ancien) → doit être <= lui ─
{
  const existantes = [{ date_intervention: '2022-01-01', km: 15000 }];
  const ok = verifierCoherenceKm({ date_document: '2010-01-01', km_declare: 1000 }, existantes);
  check('seulement voisin après, km inférieur → valide', ok.statut === 'valide', JSON.stringify(ok));
  const ko = verifierCoherenceKm({ date_document: '2010-01-01', km_declare: 20000 }, existantes);
  check('seulement voisin après, km supérieur → rejeté', ko.statut === 'rejete', JSON.stringify(ko));
}

// ── km strictement égal au voisin → valide (limite acceptée) ────────────
{
  const existantes = [{ date_intervention: '2015-01-10', km: 6000 }];
  const r = verifierCoherenceKm({ date_document: '2020-01-01', km_declare: 6000 }, existantes);
  check('km égal au voisin avant → valide (limite incluse)', r.statut === 'valide', JSON.stringify(r));
}

console.log('\n' + '═'.repeat(60));
console.log(`${OK} OK / ${KO} KO`);
console.log('═'.repeat(60) + '\n');
process.exit(KO > 0 ? 1 : 0);
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node tests/test-km-coherence-historique-unit.js`
Expected: `Cannot find module '../services/kmCoherenceHistorique'`

- [ ] **Step 3: Implémenter**

Créer `services/kmCoherenceHistorique.js` :

```javascript
/* ══════════════════════════════════════════════════════════
   MOTOKEY — L15 — Cohérence km pour import d'historique

   Compare un candidat d'import (date + km déclarés) au voisin
   chronologique le plus proche (avant ET après) parmi les
   interventions existantes de la moto — PAS au max global (le
   trigger verifier_km_monotone compare au max, inadapté à un
   import rétroactif, voir amendement (b) du cadrage L15).

   Fonction PURE : aucune I/O, aucun accès réseau/DB. N'écrit
   jamais dans releves_km — la vérification est un contrôle en
   lecture appliqué au moment de la validation humaine
   (HistoriqueImport.valider, supabase.js).
   ══════════════════════════════════════════════════════════ */

'use strict';

/**
 * @param {{date_document: string, km_declare: number}} candidat
 * @param {Array<{date_intervention: string, km: number}>} interventionsExistantes
 * @returns {{statut: 'valide'|'rejete', motif: string|null}}
 */
function verifierCoherenceKm(candidat, interventionsExistantes) {
  const candidatDate = candidat.date_document;
  const candidatKm = candidat.km_declare;

  const triees = (interventionsExistantes || [])
    .slice()
    .sort(function (a, b) {
      if (a.date_intervention < b.date_intervention) return -1;
      if (a.date_intervention > b.date_intervention) return 1;
      return 0;
    });

  let voisinAvant = null;
  let voisinApres = null;
  for (const i of triees) {
    if (i.date_intervention <= candidatDate) voisinAvant = i;
    if (i.date_intervention >= candidatDate && !voisinApres) voisinApres = i;
  }

  if (voisinAvant && candidatKm < voisinAvant.km) {
    return {
      statut: 'rejete',
      motif: `km déclaré (${candidatKm}) inférieur au relevé du ${voisinAvant.date_intervention} (${voisinAvant.km} km)`
    };
  }
  if (voisinApres && candidatKm > voisinApres.km) {
    return {
      statut: 'rejete',
      motif: `km déclaré (${candidatKm}) supérieur au relevé du ${voisinApres.date_intervention} (${voisinApres.km} km)`
    };
  }
  return { statut: 'valide', motif: null };
}

module.exports = { verifierCoherenceKm };
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node tests/test-km-coherence-historique-unit.js`
Expected: `11 OK / 0 KO` (11 checks au total dans les 7 scénarios ci-dessus), exit code 0

- [ ] **Step 5: Commit**

```bash
git add services/kmCoherenceHistorique.js tests/test-km-coherence-historique-unit.js
git commit -m "feat(L15): vérifierCoherenceKm — cohérence km par voisin chronologique"
```

---

### Task 3: `services/historiqueFactureService.js` — OCR facture historique

**Files:**
- Create: `services/historiqueFactureService.js`
- Test: `tests/test-historique-facture-service-mock.js`

**Interfaces:**
- Consumes: `callVision` depuis `services/anthropicVisionClient.js` — signature `callVision({imageUrl, model, systemPrompt, jsonSchema, maxTokens}) → Promise<{ok:true,data} | {ok:false,raison}>` (existant, L12).
- Produces: `analyserFactureHistorique({imageUrl}) → Promise<{ok:true, data:{date_document,plaque,km,nom_garage,siret,description_travaux}} | {ok:false, raison}>`. Consommé par `motokey-api.js` (Task 7).

- [ ] **Step 1: Écrire le test (échoue — module inexistant)**

Créer `tests/test-historique-facture-service-mock.js` (mirror exact de `tests/test-etiquette-service-mock.js`, mêmes conventions) :

```javascript
'use strict';
// Tests mock du service historiqueFactureService (L15 socle) — AUCUN appel
// réseau, AUCUN crédit dépensé. Mocke callVision en mutant le module cache
// de anthropicVisionClient AVANT chaque (re)require, même pattern que
// tests/test-etiquette-service-mock.js (L12).
//
// Usage : node tests/test-historique-facture-service-mock.js (pas de serveur requis)

const acv = require('../services/anthropicVisionClient');
const originalCallVision = acv.callVision;

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

function freshAnalyserFactureHistorique() {
  delete require.cache[require.resolve('../services/historiqueFactureService')];
  return require('../services/historiqueFactureService').analyserFactureHistorique;
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Tests mock historiqueFactureService (L15 socle)      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // ── succès : les 6 champs extraits sont renvoyés tels quels ────────────
  {
    acv.callVision = async () => ({ ok: true, data: {
      date_document: '2019-04-12', plaque: 'AB-123-CD', km: 24500,
      nom_garage: 'Garage du Centre', siret: '12345678900012', description_travaux: 'Vidange + filtres'
    }});
    const analyserFactureHistorique = freshAnalyserFactureHistorique();
    const r = await analyserFactureHistorique({ imageUrl: 'https://example.com/facture.jpg' });
    check('succès → ok:true', r.ok === true, JSON.stringify(r));
    check('succès → date_document propagée', r.data.date_document === '2019-04-12', JSON.stringify(r));
    check('succès → plaque propagée', r.data.plaque === 'AB-123-CD', JSON.stringify(r));
    check('succès → km propagé', r.data.km === 24500, JSON.stringify(r));
    check('succès → nom_garage propagé', r.data.nom_garage === 'Garage du Centre', JSON.stringify(r));
    check('succès → siret propagé', r.data.siret === '12345678900012', JSON.stringify(r));
    check('succès → description_travaux propagée', r.data.description_travaux === 'Vidange + filtres', JSON.stringify(r));
  }

  // ── champs illisibles → null, jamais inventés ───────────────────────────
  {
    acv.callVision = async () => ({ ok: true, data: {
      date_document: null, plaque: 'AB-123-CD', km: null, nom_garage: null, siret: null, description_travaux: null
    }});
    const analyserFactureHistorique = freshAnalyserFactureHistorique();
    const r = await analyserFactureHistorique({ imageUrl: 'https://example.com/facture.jpg' });
    check('champ illisible → ok:true quand même', r.ok === true, JSON.stringify(r));
    check('date_document illisible → null (jamais inventée)', r.data.date_document === null, JSON.stringify(r));
    check('km illisible → null (jamais inventé)', r.data.km === null, JSON.stringify(r));
  }

  // ── échec IA (raison quelconque) → {ok:false, raison} propagé tel quel ─
  {
    acv.callVision = async () => ({ ok: false, raison: 'refus' });
    const analyserFactureHistorique = freshAnalyserFactureHistorique();
    const r = await analyserFactureHistorique({ imageUrl: 'https://example.com/facture.jpg' });
    check('échec IA → ok:false', r.ok === false, JSON.stringify(r));
    check('échec IA → raison propagée telle quelle', r.raison === 'refus', JSON.stringify(r));
  }

  // ── échec IA (desactive, le cas réel en dev) ────────────────────────────
  {
    acv.callVision = async () => ({ ok: false, raison: 'desactive' });
    const analyserFactureHistorique = freshAnalyserFactureHistorique();
    const r = await analyserFactureHistorique({ imageUrl: 'https://example.com/facture.jpg' });
    check('VISION_ENABLED=false (mock) → ok:false, raison:desactive', r.ok === false && r.raison === 'desactive', JSON.stringify(r));
  }

  acv.callVision = originalCallVision;

  console.log('\n' + '═'.repeat(60));
  console.log(`${OK} OK / ${KO} KO`);
  console.log('\n⚠️  Rappel : validation sur de vraies factures reste À FAIRE avant de');
  console.log('   considérer cette feature prouvée en prod (même limite que L12 étiquette).');
  process.exit(KO > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('\n❌ Erreur fatale non interceptée :', e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node tests/test-historique-facture-service-mock.js`
Expected: `Cannot find module '../services/historiqueFactureService'`

- [ ] **Step 3: Implémenter**

Créer `services/historiqueFactureService.js` :

```javascript
/* ══════════════════════════════════════════════════════════
   MOTOKEY — L15 — Lecture de facture/justificatif d'entretien
   ancien pour la reprise d'historique.

   Extrait date/plaque/km/garage/siret/description d'une photo
   de document pour pré-remplir l'écran de validation humaine.
   Jamais d'insertion automatique — l'IA pré-remplit, l'humain
   valide (décision 5 du cadrage L15). Aucun montant extrait
   dans ce socle (hors périmètre de la validation initiale).
   ══════════════════════════════════════════════════════════ */

'use strict';

const { callVision } = require('./anthropicVisionClient');

const MODEL = 'claude-haiku-4-5';

const SCHEMA = {
  type: 'object',
  properties: {
    date_document: { type: ['string', 'null'], description: "Date du document au format YYYY-MM-DD, telle qu'écrite sur la facture/justificatif. null si illisible ou absente." },
    plaque:        { type: ['string', 'null'], description: "Plaque d'immatriculation de la moto telle qu'imprimée sur le document. null si absente ou illisible." },
    km:            { type: ['integer', 'null'], description: "Kilométrage relevé mentionné sur le document. null si absent ou illisible." },
    nom_garage:    { type: ['string', 'null'], description: "Nom du garage/prestataire émetteur, texte libre tel qu'imprimé. null si absent." },
    siret:         { type: ['string', 'null'], description: "Numéro SIRET du garage émetteur, uniquement s'il est imprimé sur le document. null sinon." },
    description_travaux: { type: ['string', 'null'], description: "Résumé bref (une phrase) des travaux/prestations mentionnés. null si illisible." }
  },
  required: ['date_document', 'plaque', 'km', 'nom_garage', 'siret', 'description_travaux'],
  additionalProperties: false
};

const SYSTEM_PROMPT = "Tu es un assistant pour un garage moto qui lit des factures et justificatifs d'entretien " +
  "anciens (parfois plusieurs années). Extrais UNIQUEMENT ce qui est explicitement lisible en texte sur le " +
  "document : la date d'émission, la plaque d'immatriculation de la moto, le kilométrage relevé, le nom du " +
  "garage/prestataire émetteur, son numéro SIRET si présent, et un résumé bref des travaux effectués. " +
  "N'invente jamais une valeur : si un champ n'est pas lisible ou absent du document, réponds null pour ce " +
  "champ précis plutôt que de deviner. La date doit être au format YYYY-MM-DD ; si seul le mois/année est " +
  "lisible, réponds null pour la date plutôt que d'inventer un jour.";

/**
 * @param {{imageUrl:string}} params
 * @returns {Promise<{ok:true, data:{date_document:?string,plaque:?string,km:?number,nom_garage:?string,siret:?string,description_travaux:?string}} | {ok:false, raison:string}>}
 */
async function analyserFactureHistorique({ imageUrl }) {
  return callVision({
    imageUrl,
    model: MODEL,
    systemPrompt: SYSTEM_PROMPT,
    jsonSchema: SCHEMA,
    maxTokens: 512
  });
}

module.exports = { analyserFactureHistorique, MODEL, SCHEMA };
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node tests/test-historique-facture-service-mock.js`
Expected: `13 OK / 0 KO`, exit code 0

- [ ] **Step 5: Commit**

```bash
git add services/historiqueFactureService.js tests/test-historique-facture-service-mock.js
git commit -m "feat(L15): historiqueFactureService — OCR facture historique (mock testé)"
```

---

### Task 4: `supabase.js` — `HistoriqueImport.creerStaging` + `.list`

**Files:**
- Modify: `supabase.js` (ajoute le namespace après `Interventions`, autour de la ligne 572, et l'export autour de la ligne 1901-1927)
- Test: `tests/test-historique-import-supabase-unit.js`

**Interfaces:**
- Produces: `HistoriqueImport.creerStaging({moto_id, garage_id, acteur_type, acteur_id, photo_url, ocr_raw}) → Promise<factureScanneeRow>` et `HistoriqueImport.list(moto_id) → Promise<factureScanneeRow[]>`. Consommés par `motokey-api.js` (Tasks 7-8).
- Consumes: helper générique `insert(table, payload)` déjà défini `supabase.js:78-82`.

- [ ] **Step 1: Écrire le test (échoue — HistoriqueImport undefined)**

Créer `tests/test-historique-import-supabase-unit.js` :

```javascript
'use strict';
// Test UNITAIRE (mocks, AUCUNE écriture en base réelle) — namespace
// HistoriqueImport (L15 socle). Même technique de mock que
// tests/test-notif-attente-or-unit.js : on patche sb.supabase.from
// directement (les méthodes de HistoriqueImport ferment sur cette
// référence), jamais module.exports.supabase (ça ne changerait rien).
// Usage : node tests/test-historique-import-supabase-unit.js

const sb = require('../supabase');
if (!sb) {
  console.error('❌ supabase.js a retourné null — vérifie SUPABASE_URL et SUPABASE_SERVICE_KEY dans .env');
  process.exit(1);
}
const { HistoriqueImport } = sb;

const realFrom = sb.supabase.from;

let OK = 0, KO = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  ✅ ${label}`); OK++; }
  else       { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); KO++; }
}

function mockFrom(queues) {
  const counters = {};
  const trace = [];
  sb.supabase.from = (table) => {
    trace.push({ table, method: 'from', args: [] });
    const idx = counters[table] || 0;
    counters[table] = idx + 1;
    const q = queues[table] || [];
    const response = q[idx] !== undefined
      ? q[idx]
      : { data: null, error: { message: `mock non configuré pour ${table} appel #${idx}` } };
    const b = {};
    ['select', 'eq', 'order', 'limit', 'update', 'insert', 'delete', 'maybeSingle', 'single', 'not', 'neq'].forEach(m => {
      b[m] = (...args) => { trace.push({ table, method: m, args }); return b; };
    });
    b.then = (resolve, reject) => Promise.resolve(response).then(resolve, reject);
    return b;
  };
  return trace;
}
function restoreFrom() { sb.supabase.from = realFrom; }

function insertArgsFor(trace, table) {
  const call = trace.find(c => c.table === table && c.method === 'insert');
  return call ? call.args[0] : null;
}

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  MotoKey — Test unitaire HistoriqueImport (L15 socle)              ║');
  console.log('║  (mocks — aucune écriture en base réelle)                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // ── creerStaging : insert direct, payload propagé tel quel ──────────────
  console.log('\n── creerStaging ──────────────────────────────────────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-1', moto_id: 'moto-1', acteur_type: 'client', ocr_raw: { plaque: 'AB-123-CD' } }, error: null },
      ],
    });
    const row = await HistoriqueImport.creerStaging({
      moto_id: 'moto-1', garage_id: 'garage-1', acteur_type: 'client', acteur_id: 'client-1',
      photo_url: 'https://cloudinary/x.jpg', ocr_raw: { plaque: 'AB-123-CD' }
    });
    check('retourne la ligne insérée', row && row.id === 'fs-1', JSON.stringify(row));
    const payload = insertArgsFor(trace, 'factures_scannees');
    check('insert reçoit moto_id', payload && payload.moto_id === 'moto-1', JSON.stringify(payload));
    check('insert reçoit acteur_type=client', payload && payload.acteur_type === 'client', JSON.stringify(payload));
    check('insert reçoit ocr_raw tel quel', payload && payload.ocr_raw && payload.ocr_raw.plaque === 'AB-123-CD', JSON.stringify(payload));
  } catch (e) {
    check('creerStaging sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── list : filtre par moto_id, tri created_at desc ───────────────────────
  console.log('\n── list ──────────────────────────────────────────────────────────');
  try {
    mockFrom({
      factures_scannees: [
        { data: [{ id: 'fs-2', moto_id: 'moto-1' }, { id: 'fs-1', moto_id: 'moto-1' }], error: null },
      ],
    });
    const rows = await HistoriqueImport.list('moto-1');
    check('retourne les lignes', Array.isArray(rows) && rows.length === 2, JSON.stringify(rows));
  } catch (e) {
    check('list sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── list : tableau vide sur data null (jamais une exception) ────────────
  console.log('\n── list (aucun résultat) ────────────────────────────────────────');
  try {
    mockFrom({ factures_scannees: [{ data: null, error: null }] });
    const rows = await HistoriqueImport.list('moto-sans-historique');
    check('data:null → tableau vide, pas une exception', Array.isArray(rows) && rows.length === 0, JSON.stringify(rows));
  } catch (e) {
    check('list (vide) sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`📊 ${OK}/${OK + KO} checks passés`);
  if (KO > 0) process.exitCode = 1;
  console.log('═'.repeat(60) + '\n');
}

run().catch(err => {
  restoreFrom();
  console.error('Erreur fatale :', err.message);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node tests/test-historique-import-supabase-unit.js`
Expected: `TypeError: Cannot read properties of undefined (reading 'creerStaging')` — `HistoriqueImport` vaut `undefined` (destructuration d'une propriété absente de `sb`), le namespace n'existe pas encore

- [ ] **Step 3: Implémenter — ajouter le namespace dans `supabase.js`**

Localiser la fin du namespace `Interventions` (se termine par `attachFacture` puis `};`) :

```javascript
  async attachFacture(id, facture_url, ocr_data) {
    return update('interventions', id, { facture_url, facture_ocr: ocr_data });
  }
};
```

Insérer juste après cette accolade fermante, avant le commentaire `// PLAN D'ENTRETIEN` :

```javascript

// ══════════════════════════════════════════════════════════
// L15 — REPRISE D'HISTORIQUE (import factures/justificatifs anciens)
// ══════════════════════════════════════════════════════════
const HistoriqueImport = {

  // Zone de dépôt : jamais d'intervention créée ici (décision 5 du cadrage —
  // l'IA pré-remplit ocr_raw, l'humain valide via .valider() avant toute
  // promotion). moto_id/garage_id/acteur_type/acteur_id résolus en amont par
  // resolveMotoForCtx() (motokey-api.js), dual CLIENT/GARAGE.
  async creerStaging({ moto_id, garage_id, acteur_type, acteur_id, photo_url, ocr_raw }) {
    return insert('factures_scannees', { moto_id, garage_id, acteur_type, acteur_id, photo_url, ocr_raw });
  },

  async list(moto_id) {
    const { data, error } = await supabase.from('factures_scannees')
      .select('*').eq('moto_id', moto_id).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }
};
```

- [ ] **Step 4: Exporter `HistoriqueImport`**

Dans `module.exports = { ... }` (fin de fichier), ajouter la clé après `Interventions,` :

```javascript
  Interventions,
  HistoriqueImport,
  Entretien,
```

- [ ] **Step 5: Lancer le test, vérifier qu'il passe**

Run: `node tests/test-historique-import-supabase-unit.js`
Expected: `6/6 checks passés`, exit code 0

- [ ] **Step 6: Commit**

```bash
git add supabase.js tests/test-historique-import-supabase-unit.js
git commit -m "feat(L15): HistoriqueImport.creerStaging + .list — zone de dépôt historique"
```

---

### Task 5: `supabase.js` — `HistoriqueImport.valider` (cohérence km + divergence + promotion)

**Files:**
- Modify: `supabase.js` (ajoute `.valider` dans le namespace `HistoriqueImport` créé Task 4 ; ajoute un require en haut de fichier)
- Test: `tests/test-historique-import-supabase-unit.js` (étend le fichier de la Task 4)

**Interfaces:**
- Consumes: `verifierCoherenceKm` (Task 2), `Interventions.create(garage_id, moto_id, payload)` (existant, `supabase.js:536`).
- Produces: `HistoriqueImport.valider(id, garage_id, ctx, {plaque_declaree, date_document, km_declare, siret_declare, nom_garage_declare, description_travaux, montant_ht, montant_ttc}) → Promise<{facture_scannee, intervention, nouveau_score, nouvelle_couleur}>`, lève une erreur avec `.code === 'KM_INCOHERENT'` si rejeté par la cohérence km. Consommé par `motokey-api.js` (Task 9).

- [ ] **Step 1: Étendre le test (échoue — `.valider` undefined)**

Ajouter dans `tests/test-historique-import-supabase-unit.js`, juste avant le bloc `console.log('\n' + '═'.repeat(60));` final :

```javascript
  // ── valider : cas nominal, cohérent, sans divergence ─────────────────────
  console.log('\n── valider (nominal, cohérent) ──────────────────────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-10', moto_id: 'moto-1', acteur_type: 'client', validated_at: null }, error: null }, // select staging
        { data: [], error: null }, // select divergentes (aucune)
        { data: { id: 'fs-10', moto_id: 'moto-1', validated_at: '2026-07-24T00:00:00.000Z', intervention_id: 'int-10' }, error: null }, // update final
      ],
      interventions: [
        { data: [{ date_intervention: '2015-01-10', km: 6000 }], error: null }, // select existantes pour cohérence
        { data: { id: 'int-10' }, error: null }, // insert() de Interventions.create
        { data: { id: 'int-10' }, error: null }, // update niveau_preuve/facture_id/photo_url
      ],
      motos: [
        { data: { score: 42, couleur_dossier: 'jaune' }, error: null }, // select score/couleur dans Interventions.create — table SÉPARÉE, compteur indépendant de 'interventions'
      ],
    });
    const result = await HistoriqueImport.valider('fs-10', 'garage-1', { email: 'client@example.com' }, {
      plaque_declaree: 'AB-123-CD', date_document: '2018-03-01', km_declare: 6800,
      siret_declare: null, nom_garage_declare: 'Garage du Centre', description_travaux: 'Vidange'
    });
    check('retourne facture_scannee', !!result.facture_scannee, JSON.stringify(result));
    check('retourne intervention', !!result.intervention, JSON.stringify(result));
    const interInsert = trace.find(c => c.table === 'interventions' && c.method === 'insert');
    check('intervention créée avec type=jaune', interInsert && interInsert.args[0].type === 'jaune', JSON.stringify(interInsert));
    check('intervention créée avec km déclaré', interInsert && interInsert.args[0].km === 6800, JSON.stringify(interInsert));
  } catch (e) {
    check('valider (nominal) sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── valider : km incohérent → rejeté, AUCUNE intervention créée ─────────
  console.log('\n── valider (km incohérent) ──────────────────────────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-11', moto_id: 'moto-1', acteur_type: 'client', validated_at: null }, error: null },
        { data: { id: 'fs-11', km_coherence_statut: 'rejete' }, error: null }, // update de traçage du rejet
      ],
      interventions: [
        { data: [{ date_intervention: '2020-06-15', km: 7500 }], error: null },
      ],
    });
    let threw = null;
    try {
      await HistoriqueImport.valider('fs-11', 'garage-1', { email: 'client@example.com' }, {
        plaque_declaree: 'AB-123-CD', date_document: '2018-03-01', km_declare: 20000,
        siret_declare: null, nom_garage_declare: null, description_travaux: null
      });
    } catch (e) { threw = e; }
    check('lève une erreur', !!threw, 'aucune erreur levée');
    check("code KM_INCOHERENT", threw && threw.code === 'KM_INCOHERENT', threw && threw.message);
    check("aucun insert 'interventions' (pas de promotion)", !trace.some(t => t.table === 'interventions' && t.method === 'insert'));
    const stagingUpdate = trace.find(c => c.table === 'factures_scannees' && c.method === 'update');
    check("km_coherence_statut='rejete' tracé sur la ligne staging",
      stagingUpdate && stagingUpdate.args[0].km_coherence_statut === 'rejete', JSON.stringify(stagingUpdate && stagingUpdate.args[0]));
  } catch (e) {
    check('valider (rejet km) sans exception inattendue', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── valider : divergence garage corrige un import client existant ───────
  console.log('\n── valider (divergence, garage corrige client) ──────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-13', moto_id: 'moto-1', acteur_type: 'garage', validated_at: null }, error: null }, // select staging
        { data: [{ id: 'fs-12', acteur_type: 'client' }], error: null }, // select divergentes → trouve fs-12
        { data: { id: 'fs-13', divergence_de: 'fs-12', intervention_id: 'int-13' }, error: null }, // update final
      ],
      interventions: [
        { data: [], error: null },
        { data: { id: 'int-13' }, error: null },
        { data: { id: 'int-13' }, error: null },
      ],
      motos: [
        { data: { score: 50, couleur_dossier: 'bleu' }, error: null }, // table SÉPARÉE, compteur indépendant de 'interventions'
      ],
    });
    const result = await HistoriqueImport.valider('fs-13', 'garage-1', { email: 'mecano@example.com' }, {
      plaque_declaree: 'AB-123-CD', date_document: '2018-03-01', km_declare: 6800,
      siret_declare: '12345678900012', nom_garage_declare: 'Garage du Centre', description_travaux: 'Vidange confirmée'
    });
    const stagingUpdate = trace.find(c => c.table === 'factures_scannees' && c.method === 'update');
    check('divergence_de pointe vers la ligne client existante (fs-12)',
      stagingUpdate && stagingUpdate.args[0].divergence_de === 'fs-12', JSON.stringify(stagingUpdate && stagingUpdate.args[0]));
    check("l'ancienne ligne client (fs-12) n'est PAS supprimée ni écrasée — pas de delete émis",
      !trace.some(t => t.table === 'factures_scannees' && t.method === 'delete'));
  } catch (e) {
    check('valider (divergence) sans exception', false, e.message);
  } finally {
    restoreFrom();
  }
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node tests/test-historique-import-supabase-unit.js`
Expected: `TypeError: HistoriqueImport.valider is not a function`

- [ ] **Step 3: Implémenter — ajouter le require et la méthode `.valider`**

En haut de `supabase.js`, juste après `const { createClient } = require('@supabase/supabase-js');` (ligne 29), ajouter :

```javascript
const { verifierCoherenceKm } = require('./services/kmCoherenceHistorique');
```

Dans le namespace `HistoriqueImport` (créé Task 4), ajouter la méthode `.valider` après `.list` :

```javascript
  ,

  // Validation humaine (décision 5) : le staging (ocr_raw) n'est jamais promu
  // automatiquement. Vérifie la cohérence km par voisin chronologique
  // (amendement (b) — lecture seule sur interventions, jamais releves_km),
  // trace toute divergence garage/client sans écraser l'ancienne ligne
  // (décision 1 — "on ne l'écrase pas : on trace la correction"), puis
  // promeut en intervention type='jaune' / niveau_preuve='facture'.
  async valider(id, garage_id, ctx, { plaque_declaree, date_document, km_declare, siret_declare, nom_garage_declare, description_travaux, montant_ht, montant_ttc }) {
    const { data: staging, error: fe } = await supabase.from('factures_scannees').select('*').eq('id', id).single();
    if (fe || !staging) throw new Error('Document non trouvé');
    if (staging.validated_at) throw new Error('Document déjà validé');

    const { data: existantes, error: ie } = await supabase.from('interventions')
      .select('date_intervention, km').eq('moto_id', staging.moto_id);
    if (ie) throw new Error(ie.message);

    const coherence = verifierCoherenceKm(
      { date_document, km_declare },
      (existantes || []).map(i => ({ date_intervention: i.date_intervention, km: i.km }))
    );

    if (coherence.statut === 'rejete') {
      await supabase.from('factures_scannees').update({
        plaque_declaree, date_document, km_declare,
        siret_declare: siret_declare || null, nom_garage_declare: nom_garage_declare || null,
        km_coherence_statut: 'rejete', km_coherence_motif: coherence.motif
      }).eq('id', id);
      const err = new Error(coherence.motif);
      err.code = 'KM_INCOHERENT';
      throw err;
    }

    // Divergence : une autre ligne déjà validée pour la même plaque + date,
    // avec un acteur différent (client vs garage) — jamais écrasée, tracée.
    const { data: divergentes } = await supabase.from('factures_scannees')
      .select('id, acteur_type').eq('moto_id', staging.moto_id)
      .eq('plaque_declaree', plaque_declaree).eq('date_document', date_document)
      .not('validated_at', 'is', null).neq('acteur_type', staging.acteur_type).neq('id', id);
    const divergence_de = (divergentes && divergentes[0]) ? divergentes[0].id : null;

    const titre = nom_garage_declare ? `Historique importé — ${nom_garage_declare}` : 'Historique importé';
    const inter = await Interventions.create(garage_id, staging.moto_id, {
      type: 'jaune', titre, description: description_travaux || '', km: km_declare,
      montant_ht: montant_ht || 0, montant_ttc: montant_ttc || 0, date: date_document
    });
    const { error: ue2 } = await supabase.from('interventions')
      .update({ niveau_preuve: 'facture', facture_id: id, photo_url: staging.photo_url })
      .eq('id', inter.intervention.id);
    if (ue2) throw new Error(ue2.message);

    const { data: majStaging, error: ue } = await supabase.from('factures_scannees').update({
      plaque_declaree, date_document, km_declare,
      siret_declare: siret_declare || null, nom_garage_declare: nom_garage_declare || null,
      validated_data: { plaque_declaree, date_document, km_declare, siret_declare, nom_garage_declare, description_travaux },
      validated_at: new Date().toISOString(), validated_by: (ctx && ctx.email) || staging.acteur_type,
      km_coherence_statut: 'valide', km_coherence_motif: null,
      divergence_de, intervention_id: inter.intervention.id
    }).eq('id', id).select().single();
    if (ue) throw new Error(ue.message);

    return { facture_scannee: majStaging, intervention: inter.intervention, nouveau_score: inter.nouveau_score, nouvelle_couleur: inter.nouvelle_couleur };
  }
```

Note : le `,` en tête du bloc ci-dessus ferme la virgule laissée après `.list` — retirer le `};` final de `.list` (Task 4) et le remplacer par une virgule avant `.valider`, remettre `};` seulement à la toute fin du namespace (après `.valider`).

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node tests/test-historique-import-supabase-unit.js`
Expected: `16/16 checks passés` (6 de la Task 4 + 10 des 3 nouveaux scénarios), exit code 0

- [ ] **Step 5: Commit**

```bash
git add supabase.js tests/test-historique-import-supabase-unit.js
git commit -m "feat(L15): HistoriqueImport.valider — cohérence km, divergence tracée, promotion"
```

---

### Task 6: `supabase.js` — `HistoriqueImport.contresigner`

**Files:**
- Modify: `supabase.js` (ajoute `.contresigner` dans le namespace `HistoriqueImport`)
- Test: `tests/test-historique-import-supabase-unit.js` (étend encore le même fichier)

**Interfaces:**
- Produces: `HistoriqueImport.contresigner(id, garage_id) → Promise<{facture_scannee, nouveau_score, nouvelle_couleur}>`. Consommé par `motokey-api.js` (Task 10).

- [ ] **Step 1: Étendre le test (échoue — `.contresigner` undefined)**

Ajouter dans `tests/test-historique-import-supabase-unit.js`, avant le bloc final `console.log('\n' + '═'.repeat(60));` :

```javascript
  // ── contresigner : bump jaune→bleu, décision 4 ("remonte d'un cran") ────
  console.log('\n── contresigner (nominal) ────────────────────────────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-20', garage_id: 'garage-1', acteur_type: 'client', validated_at: '2026-07-20T00:00:00.000Z', intervention_id: 'int-20', contresigne_par_garage_id: null }, error: null }, // select staging
        { data: { id: 'fs-20', contresigne_par_garage_id: 'garage-1' }, error: null }, // update final
      ],
      interventions: [
        { data: { id: 'int-20', moto_id: 'moto-1' }, error: null }, // update type=bleu
      ],
      motos: [
        { data: { score: 55, couleur_dossier: 'bleu' }, error: null },
      ],
    });
    const result = await HistoriqueImport.contresigner('fs-20', 'garage-1');
    const interUpdate = trace.find(c => c.table === 'interventions' && c.method === 'update');
    check("intervention passée à type='bleu'", interUpdate && interUpdate.args[0].type === 'bleu', JSON.stringify(interUpdate && interUpdate.args[0]));
    check('résultat contient facture_scannee', !!result.facture_scannee, JSON.stringify(result));
  } catch (e) {
    check('contresigner (nominal) sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── contresigner : refuse un import garage (n'a pas besoin de contre-signature) ──
  console.log('\n── contresigner (rejet — déjà un import garage) ─────────────────');
  try {
    mockFrom({
      factures_scannees: [
        { data: { id: 'fs-21', garage_id: 'garage-1', acteur_type: 'garage', validated_at: '2026-07-20T00:00:00.000Z', intervention_id: 'int-21', contresigne_par_garage_id: null }, error: null },
      ],
    });
    let threw = null;
    try { await HistoriqueImport.contresigner('fs-21', 'garage-1'); } catch (e) { threw = e; }
    check("refuse un import déjà de type 'garage'", !!threw, 'aucune erreur levée');
  } catch (e) {
    check('contresigner (rejet garage) sans exception inattendue', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── contresigner : refuse un garage différent du garage propriétaire ────
  console.log('\n── contresigner (rejet — mauvais garage) ─────────────────────────');
  try {
    mockFrom({
      factures_scannees: [
        { data: { id: 'fs-22', garage_id: 'garage-1', acteur_type: 'client', validated_at: '2026-07-20T00:00:00.000Z', intervention_id: 'int-22', contresigne_par_garage_id: null }, error: null },
      ],
    });
    let threw = null;
    try { await HistoriqueImport.contresigner('fs-22', 'garage-AUTRE'); } catch (e) { threw = e; }
    check("refuse un garage différent du garage propriétaire de la moto", !!threw, 'aucune erreur levée');
  } catch (e) {
    check('contresigner (rejet mauvais garage) sans exception inattendue', false, e.message);
  } finally {
    restoreFrom();
  }
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `node tests/test-historique-import-supabase-unit.js`
Expected: `TypeError: HistoriqueImport.contresigner is not a function`

- [ ] **Step 3: Implémenter — ajouter `.contresigner`**

Dans le namespace `HistoriqueImport`, ajouter une virgule après la fermeture de `.valider` (retirer le `};` final posé Task 5) puis ajouter :

```javascript
  ,

  // Décision 4 du cadrage : "remonte d'un cran si contre-signé par un garage
  // PRO" — seul le garage propriétaire de la moto peut contre-signer (pas
  // n'importe quel PRO), et seul un import CLIENT en a besoin (un import
  // garage est déjà au niveau de confiance maximal du modèle actuel).
  async contresigner(id, garage_id) {
    const { data: staging, error: fe } = await supabase.from('factures_scannees').select('*').eq('id', id).single();
    if (fe || !staging) throw new Error('Document non trouvé');
    if (!staging.validated_at || !staging.intervention_id) throw new Error('Document pas encore validé — impossible de contre-signer');
    if (staging.garage_id !== garage_id) throw new Error("Seul le garage propriétaire de cette moto peut contre-signer");
    if (staging.acteur_type === 'garage') throw new Error("Un import garage n'a pas besoin de contre-signature");
    if (staging.contresigne_par_garage_id) throw new Error('Déjà contre-signé');

    const { data: inter, error: ue } = await supabase.from('interventions')
      .update({ type: 'bleu' }).eq('id', staging.intervention_id).select('id, moto_id').single();
    if (ue) throw new Error(ue.message);

    const { data: majStaging, error: ue2 } = await supabase.from('factures_scannees').update({
      contresigne_par_garage_id: garage_id, contresigne_at: new Date().toISOString()
    }).eq('id', id).select().single();
    if (ue2) throw new Error(ue2.message);

    const { data: moto } = await supabase.from('motos').select('score, couleur_dossier').eq('id', inter.moto_id).single();
    return { facture_scannee: majStaging, nouveau_score: moto?.score, nouvelle_couleur: moto?.couleur_dossier };
  }
};
```

Le `};` final ci-dessus ferme le namespace `HistoriqueImport` — c'est désormais le seul `};` de fermeture du namespace (retirer tout `};` intermédiaire posé aux Tasks 4-5).

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `node tests/test-historique-import-supabase-unit.js`
Expected: `20/20 checks passés` (16 des Tasks 4-5 + 4 des nouveaux scénarios), exit code 0

- [ ] **Step 5: Commit**

```bash
git add supabase.js tests/test-historique-import-supabase-unit.js
git commit -m "feat(L15): HistoriqueImport.contresigner — bump jaune→bleu, ownership vérifiée"
```

---

### Task 7: `motokey-api.js` — `POST /motos/:id/historique` (staging, upload + OCR)

**Files:**
- Modify: `motokey-api.js` (require, handler, route multipart)

**Interfaces:**
- Consumes: `resolveMotoForCtx(ctx, motoId, a)` (existant, `motokey-api.js:410-425`), `runMulter(req, res)` (existant, `motokey-api.js:402-406`), `cloudinaryService.uploadPhoto(buffer, {folder})` (existant), `analyserFactureHistorique({imageUrl})` (Task 3), `SBLayer.HistoriqueImport.creerStaging(...)` (Task 4).
- Produces: route HTTP `POST /motos/:id/historique`, multipart, champ `photo`. Consommée par le frontend (plans 2/3, hors périmètre de ce plan).

- [ ] **Step 1: Ajouter le require**

Dans `motokey-api.js`, après la ligne `const { analyserEtiquette } = require('./services/etiquettePieceService');` (ligne 92), ajouter :

```javascript
const { analyserFactureHistorique } = require('./services/historiqueFactureService');
```

- [ ] **Step 2: Ajouter le handler**

Juste après la fermeture de `handleAnalyserEtiquette` (après la ligne `}` qui suit `}` à la ligne 605, avant le commentaire `/* ─── ROUTE MATCHER ─── */`), ajouter :

```javascript

// Handler upload document historique (L15 socle) — multipart intercepté AVANT
// body(). Dual CLIENT/GARAGE via resolveMotoForCtx (décision 1 du cadrage) —
// crée UNIQUEMENT une ligne de staging (factures_scannees), jamais une
// intervention (décision 5 : jamais d'insertion automatique sans validation
// humaine, voir POST /historique/:id/valider).
async function handleImporterHistorique(req, res, motoId) {
  try {
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    const resolved = await resolveMotoForCtx(ctx, motoId, a);
    if (!resolved) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');

    let file;
    try { file = await runMulter(req, res); }
    catch (e) { if (e instanceof multer.MulterError && e.code === 'LIMIT_FILE_SIZE') return fail(res,'Photo trop volumineuse (max 5 Mo)',400,'FILE_TOO_LARGE'); return fail(res, e.message, 400, 'UPLOAD_PARSE_ERROR'); }
    if (!file) return fail(res, 'Photo requise (champ multipart "photo", JPEG/PNG/WebP)', 400, 'VALIDATION_ERROR');

    let secure_url;
    try {
      const up = await cloudinaryService.uploadPhoto(file.buffer, { folder: 'motokey/historique/'+resolved.moto.id });
      secure_url = up.secure_url;
    } catch (e) {
      return fail(res, e.message, e.statusCode || 500, e.code || 'UPLOAD_ERROR');
    }

    const analyse = await analyserFactureHistorique({ imageUrl: secure_url });

    if (!SBLayer) return fail(res, 'Import historique indisponible (mode RAM)', 501, 'NOT_IMPLEMENTED');
    const staging = await SBLayer.HistoriqueImport.creerStaging({
      moto_id: resolved.moto.id, garage_id: resolved.garage_id,
      acteur_type: resolved.acteur_type, acteur_id: resolved.acteur_id,
      photo_url: secure_url, ocr_raw: analyse.ok ? analyse.data : null
    });

    return ok(res, {
      facture_scannee: staging,
      ocr: analyse.ok ? { disponible: true, champs: analyse.data } : { disponible: false, raison: analyse.raison }
    }, 'Document importé — en attente de validation', 201);
  } catch (e) {
    return fail(res, e.message, 500, 'SERVER_ERROR');
  }
}
```

- [ ] **Step 3: Enregistrer la route multipart**

Dans le bloc des routes multipart (après `/^\/motos\/[^/]+\/photos-consommables$/` et avant `/catalogue-pieces/analyser-etiquette`, autour de la ligne 805-812), ajouter :

```javascript
  if (method === 'POST' && _ct.startsWith('multipart/form-data') && /^\/motos\/[^/]+\/historique$/.test(pathname)) {
    req.ctx = await rbac.extractRoleFromRequest(req, SBLayer);
    return handleImporterHistorique(req, res, pathname.split('/')[2]);
  }
```

- [ ] **Step 4: Vérification syntaxe**

Run: `node --check motokey-api.js`
Expected: aucune sortie (succès silencieux)

- [ ] **Step 5: Vérification manuelle (serveur local, MECANO déjà authentifié)**

Démarrer le serveur (`npm start` si pas déjà lancé), puis :

```bash
curl -s -X POST "http://localhost:3000/motos/<UN_MOTO_ID_VALIDE>/historique" \
  -H "Authorization: Bearer $TOKEN" \
  -F "photo=@/chemin/vers/une/facture.jpg"
```

Expected: `201`, `success:true`, `data.facture_scannee.id` présent, `data.facture_scannee.validated_at` absent/null, `data.ocr.disponible` (true ou false selon `VISION_ENABLED`).

**Note** : nécessite que la migration 33 (Task 1) soit déjà appliquée en base — sinon `INSERT` échoue sur les colonnes manquantes.

- [ ] **Step 6: Commit**

```bash
git add motokey-api.js
git commit -m "feat(L15): POST /motos/:id/historique — staging upload+OCR, dual CLIENT/GARAGE"
```

---

### Task 8: `motokey-api.js` — `GET /motos/:id/historique` (liste)

**Files:**
- Modify: `motokey-api.js` (route JSON)

**Interfaces:**
- Consumes: `resolveMotoForCtx` (existant), `SBLayer.HistoriqueImport.list(moto_id)` (Task 4).

- [ ] **Step 1: Ajouter la route**

Localiser le bloc `if((p=M('GET','/motos/:id/score'))!==null){ ... }` (autour de la ligne 1195-1230). Juste après sa fermeture (`}`), ajouter :

```javascript

  if((p=M('GET','/motos/:id/historique'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    const resolved = await resolveMotoForCtx(ctx, p.id, a);
    if (!resolved) return fail(res, 'Moto non trouvée', 404, 'NOT_FOUND');
    if (!SBLayer) return fail(res, 'Historique indisponible (mode RAM)', 501, 'NOT_IMPLEMENTED');
    try {
      const rows = await SBLayer.HistoriqueImport.list(resolved.moto.id);
      return ok(res, { historique: rows }, 'OK');
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }
```

- [ ] **Step 2: Vérification syntaxe**

Run: `node --check motokey-api.js`
Expected: aucune sortie

- [ ] **Step 3: Vérification manuelle**

```bash
curl -s "http://localhost:3000/motos/<UN_MOTO_ID_VALIDE>/historique" -H "Authorization: Bearer $TOKEN"
```

Expected: `200`, `data.historique` est un tableau contenant la ligne créée à la Task 7.

- [ ] **Step 4: Commit**

```bash
git add motokey-api.js
git commit -m "feat(L15): GET /motos/:id/historique — liste dual CLIENT/GARAGE"
```

---

### Task 9: `motokey-api.js` — `POST /historique/:id/valider`

**Files:**
- Modify: `motokey-api.js` (route JSON)

**Interfaces:**
- Consumes: `SBLayer.HistoriqueImport.valider(id, garage_id, ctx, payload)` (Task 5), `resolveMotoForCtx` (existant).

- [ ] **Step 1: Ajouter la route**

Juste après la route `GET /motos/:id/historique` ajoutée à la Task 8, ajouter :

```javascript

  if((p=M('POST','/historique/:id/valider'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    const { plaque_declaree, date_document, km_declare, siret_declare, nom_garage_declare, description_travaux, montant_ht, montant_ttc } = b;
    if (!plaque_declaree || !date_document || km_declare === undefined || km_declare === null || km_declare === '') {
      return fail(res, 'plaque_declaree, date_document et km_declare requis', 400, 'VALIDATION_ERROR');
    }
    if (!SBLayer) return fail(res, 'Validation indisponible (mode RAM)', 501, 'NOT_IMPLEMENTED');

    const { data: staging0 } = await SBLayer.supabase.from('factures_scannees').select('moto_id').eq('id', p.id).maybeSingle();
    if (!staging0) return fail(res, 'Document non trouvé', 404, 'NOT_FOUND');
    const resolved = await resolveMotoForCtx(ctx, staging0.moto_id, a);
    if (!resolved) return fail(res, 'Accès refusé à ce document', 403, 'FORBIDDEN');

    try {
      const result = await SBLayer.HistoriqueImport.valider(p.id, resolved.garage_id, ctx, {
        plaque_declaree, date_document, km_declare: parseInt(km_declare),
        siret_declare, nom_garage_declare, description_travaux, montant_ht, montant_ttc
      });
      return ok(res, result, 'Historique validé et ajouté au passeport');
    } catch(e) {
      if (e.code === 'KM_INCOHERENT') return fail(res, e.message, 409, 'KM_INCOHERENT');
      return fail(res, e.message, e.message.includes('non trouvé') ? 404 : 500, 'DB_ERROR');
    }
  }
```

- [ ] **Step 2: Vérification syntaxe**

Run: `node --check motokey-api.js`
Expected: aucune sortie

- [ ] **Step 3: Vérification manuelle — cas nominal**

```bash
curl -s -X POST "http://localhost:3000/historique/<FACTURE_SCANNEE_ID_DE_LA_TASK_7>/valider" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"plaque_declaree":"AB-123-CD","date_document":"2018-03-01","km_declare":6800,"nom_garage_declare":"Garage Test"}'
```

Expected: `200`, `data.intervention.type === 'jaune'`, `data.intervention.niveau_preuve` (vérifier via un `GET` intervention séparé si le payload ne l'inclut pas — `Interventions.create` ne retourne que `{intervention, nouveau_score, nouvelle_couleur}`, le niveau_preuve est posé par un `UPDATE` séparé après coup).

- [ ] **Step 4: Vérification manuelle — cas km incohérent**

Réimporter un document (Task 7) puis valider avec un `km_declare` volontairement incohérent (ex: très inférieur à un km déjà existant sur la moto à une date antérieure) :

```bash
curl -s -X POST "http://localhost:3000/historique/<AUTRE_FACTURE_SCANNEE_ID>/valider" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"plaque_declaree":"AB-123-CD","date_document":"2018-03-01","km_declare":100}'
```

Expected: `409`, `error.code === 'KM_INCOHERENT'`, `error.message` mentionne le voisin en conflit.

- [ ] **Step 5: Commit**

```bash
git add motokey-api.js
git commit -m "feat(L15): POST /historique/:id/valider — promotion vers intervention"
```

---

### Task 10: `motokey-api.js` — `POST /historique/:id/contresigner`

**Files:**
- Modify: `motokey-api.js` (route JSON)

**Interfaces:**
- Consumes: `SBLayer.HistoriqueImport.contresigner(id, garage_id)` (Task 6), `rbac.requireRole(ctx, 'PRO')` (existant).

- [ ] **Step 1: Ajouter la route**

Juste après la route `POST /historique/:id/valider` ajoutée à la Task 9, ajouter :

```javascript

  if((p=M('POST','/historique/:id/contresigner'))!==null){
    const a = authSilent(req);
    if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
    const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
    if (!rbac.requireRole(ctx, 'PRO')) return fail(res, 'Permission refusée — PRO minimum requis', 403, 'FORBIDDEN_ROLE');
    const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
    if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');
    if (!SBLayer) return fail(res, 'Contre-signature indisponible (mode RAM)', 501, 'NOT_IMPLEMENTED');
    try {
      const result = await SBLayer.HistoriqueImport.contresigner(p.id, garageId);
      return ok(res, result, 'Document contre-signé — niveau de confiance mis à jour');
    } catch(e) { return fail(res, e.message, e.message.includes('non trouvé') ? 404 : 409, 'DB_ERROR'); }
  }
```

- [ ] **Step 2: Vérification syntaxe**

Run: `node --check motokey-api.js`
Expected: aucune sortie

- [ ] **Step 3: Vérification manuelle**

Avec un token PRO/CONCESSION (pas MECANO — la décision 4 exige "garage PRO") :

```bash
curl -s -X POST "http://localhost:3000/historique/<FACTURE_SCANNEE_VALIDEE_ID>/contresigner" \
  -H "Authorization: Bearer $TOKEN_PRO"
```

Expected: `200` si le document validé est un import CLIENT du même garage ; `403` avec un token MECANO ; `409` si déjà contre-signé ou si c'était déjà un import GARAGE.

- [ ] **Step 4: Commit**

```bash
git add motokey-api.js
git commit -m "feat(L15): POST /historique/:id/contresigner — bump confiance PRO+"
```

---

## Self-Review

**Couverture du cadrage (+ amendements) :**
1. Qui peut importer (CLIENT+GARAGE, divergence tracée, garage fait foi) → Tasks 4, 5, 9 (`resolveMotoForCtx` dual-actor + `divergence_de` tracé, jamais d'écrasement).
2. Cohérence km voisin chronologique, rejet tracé/affiché → Tasks 2, 5, 9 (`verifierCoherenceKm` + 409 KM_INCOHERENT + `km_coherence_statut` persisté).
3. Identification (date+plaque obligatoires, SIRET optionnel) → Task 9 (validation 400 si `plaque_declaree`/`date_document` absents, `siret_declare` jamais requis).
4. Niveau de confiance distinct sous le Pro, remonte si contre-signé → Tasks 5 (`type='jaune'`+`niveau_preuve='facture'` à la promotion), 6 (`contresigner` bump vers `type='bleu'`).
5. OCR réutilise `anthropicVisionClient`, IA pré-remplit/humain valide, jamais d'auto-insertion → Tasks 3 (mirror `etiquettePieceService`), 7 (staging seul, pas d'intervention).
6. Upload multiple → file → revue → validation groupée : **hors périmètre de ce plan** (Socle backend uniquement) — endpoints Task 7-9 supportent un import à la fois par appel, mais rien n'empêche le frontend (Plans 2/3) d'appeler `POST /motos/:id/historique` en boucle puis `GET /motos/:id/historique` pour l'écran de revue groupée.
- Amendement (a) score non touché → `recalc_score_moto()` jamais mentionné dans aucun fichier modifié par ce plan.
- Amendement (b) jamais d'écriture `releves_km` → aucune Task ne touche `releves_km`/`RelevesKm`.
- Amendement (c) `factures_scannees` étendue + `photo_url` Cloudinary → Task 1.

**Scan placeholders :** aucun "TBD"/"TODO"/"similaire à" — chaque Step contient le code complet.

**Cohérence des types/signatures :** `resolveMotoForCtx` retourne `{moto, garage_id, acteur_type, acteur_id}` — utilisé identiquement dans Tasks 7, 8, 9. `HistoriqueImport.valider` retourne `{facture_scannee, intervention, nouveau_score, nouvelle_couleur}` — même shape que `Interventions.create`. `verifierCoherenceKm` retourne `{statut, motif}` — consommé identiquement en Task 5.

**Hors périmètre explicite de ce plan** (renvoyé aux Plans 2/3 déjà annoncés à Mehdi) : écrans d'upload multiple, file de revue, validation groupée (décision 6), ligne de prestation garage facturable ~30€ dans une intervention L10 (décision 1, dernière phrase), tout le frontend `MotoKey_Client.html`/`app.html`.
