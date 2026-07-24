# L15 — Plan 3 : Import GARAGE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire le pendant GARAGE de la reprise d'historique (import + contre-signature + résolution de divergence + prestation facturable ~30 €) dans `MotoKey_Atelier.html`, en s'appuyant sur le backend déjà dual CLIENT/GARAGE du socle L15, et corriger deux dettes documentées (import garage bloqué à `jaune`, divergence non neutralisée au score).

**Architecture:** Backend : une migration ENUM (`'archive'`) + modification ciblée de `HistoriqueImport.valider()` (`supabase.js`). Frontend : une nouvelle section "Historique" dans `renderBriefing()` (dashboard moto de l'atelier), mirroring les Tasks 1-4 du Plan 2 (import CLIENT, `MotoKey_Client.html`) déjà en prod, plus deux capacités nouvelles (contre-signature, ligne facturable) et un correctif d'affichage (badge "archive") dans les deux apps.

**Tech Stack:** Vanilla JS, `fetch`/`FormData`, patterns existants (`apiFetch`/`apiGet`/`apiPost`, `escapeHtml`, `fmtDateFlexible`, `toast`, `errMsg`, `getToken`, `Promise.allSettled` + cache offline).

## Global Constraints

- **Aucun framework de test frontend** dans ce repo — vérification manuelle/statique par tâche frontend (comme pour le Plan 2). Le backend (Task 1) a un framework de test unitaire par mocks (`tests/test-historique-import-supabase-unit.js`) — **aucune écriture en base réelle**, TDD obligatoire pour cette tâche.
- **`str_replace` natif (outil Edit) uniquement** pour `motokey-api.js`, `MotoKey_Atelier.html`, `MotoKey_Client.html`, `supabase.js` — fichiers critiques listés dans CLAUDE.md. Jamais de sed/awk/PowerShell -replace.
- **Import GARAGE → confiance directe `bleu`** (décision 2 du spec) : `HistoriqueImport.valider()` crée l'intervention avec `type: 'bleu'` si `staging.acteur_type === 'garage'`, `type: 'jaune'` sinon (comportement client inchangé).
- **Neutralisation de divergence via ENUM `'archive'`, jamais `'rouge'`** (décision 3) : `'rouge'` vaut -5 dans `recalc_score_moto()` (`schema.sql:698`), pas 0 — ne jamais l'utiliser pour une intervention simplement supplantée. Le `CASE ... ELSE 0` du trigger traite déjà tout type non listé comme 0 point — **`recalc_score_moto()` n'est pas modifié**, seule la définition de l'ENUM l'est.
- **Détection "OR actif pour cette moto" via `GET /ordres-reparation?moto_id=X`**, filtré sur `OR_STATUTS_ACTIFS` (constante déjà existante `MotoKey_Atelier.html:446`, `['en_cours', 'attente', 'termine']`) — **jamais** via `_currentOrId` (état global sans rapport avec la moto affichée dans le briefing, posé uniquement par l'écran "OR actif").
- **Ligne facturable = appel direct**, pas le formulaire manuel "Ajouter une tâche" (décision 8) : `POST /ordres-reparation/:id/taches` avec `{libelle: "Reprise d'historique", duree_h: 1, taux_horaire: 30}` — garantit `montant_ht = 30`, sans toucher au formulaire existant (qui ne demande pas de taux horaire et produirait `montant_ht = 0` côté Supabase réel, `supabase.js:1366`).
- **Contre-signature = clic direct, pas de modale** (décision 6) — cohérent avec `toggleTache` et le reste de l'atelier.
- **Intervention `'archive'` = visible, badge "Remplacée"**, jamais masquée (décision 7), dans `MotoKey_Atelier.html` ET `MotoKey_Client.html`.
- **Upload SÉQUENTIEL, jamais parallèle** (même contrainte que le Plan 2) — un fichier à la fois, jamais de `Promise.all()` sur plusieurs uploads simultanés.
- **Jamais d'insertion automatique** — validation et contre-signature exigent toujours un clic explicite.
- **CSS** : réutiliser les classes/variables existantes (`.briefing-section`, `.int-row`, `.int-badge`, `--tx3`, `--border`, etc.) — nouvelle classe uniquement pour le badge "archive" (absent des deux fichiers).
- **Migration SQL** : `ALTER TYPE ... ADD VALUE` doit être appliquée en prod par Mehdi (Supabase Dashboard SQL Editor) **avant** le déploiement du code qui référence `'archive'` — même précédent que `sql/migrations/26b_l10_add_refuse_enum_value.sql` (une valeur ajoutée à un ENUM ne peut pas être utilisée dans la même transaction qui l'a créée).

## File Structure

- **Modifier `supabase.js`** : `HistoriqueImport.valider()` (garage→bleu, requête `divergentes` étendue, neutralisation archive).
- **Créer `sql/migrations/34_l15_plan3_archive_enum.sql`** : ajout ENUM.
- **Modifier `tests/test-historique-import-supabase-unit.js`** : TDD pour les deux changements de comportement.
- **Modifier `MotoKey_Atelier.html`** : nouvelle section "Historique" (`renderBriefing`, `openBriefing`), nouvelles fonctions module-level, `INT_TYPE_META` + CSS badge `archive`.
- **Modifier `MotoKey_Client.html`** : badge "Remplacée" sur `interv-badge` (type `archive`).

---

### Task 1: Backend — `HistoriqueImport.valider()` (garage→bleu, neutralisation divergence) + migration

**Files:**
- Create: `sql/migrations/34_l15_plan3_archive_enum.sql`
- Modify: `supabase.js:601-655` (`HistoriqueImport.valider`)
- Modify: `tests/test-historique-import-supabase-unit.js`

**Interfaces:**
- Consumes: rien de nouveau — `verifierCoherenceKm`, `Interventions.create` (signature `(garage_id, moto_id, {type, titre, description, km, montant_ht, montant_ttc, date})`, `supabase.js:537`) déjà utilisés par cette fonction, inchangés.
- Produces: `HistoriqueImport.valider()` inchangé en signature, mais l'intervention créée a `type: 'bleu'` quand `staging.acteur_type === 'garage'` ; l'ancienne intervention supplantée (si divergence) passe à `type: 'archive'`. Consommé par Tasks 2-5 (aucune, ce sont des tâches frontend qui appellent l'endpoint HTTP existant, pas cette fonction directement) et par Task 6 (le badge doit gérer le type `'archive'` qui peut désormais apparaître dans les réponses `GET /motos/:id/historique` et `GET /motos/:id`).

- [ ] **Step 1: Créer la migration ENUM**

Créer `sql/migrations/34_l15_plan3_archive_enum.sql` :

```sql
-- ═══════════════════════════════════════════════════════════
-- Migration 34 — L15 Plan 3 — ajout enum 'archive' (couleur_dossier_type)
-- ═══════════════════════════════════════════════════════════
-- Neutralise au score une intervention supplantée par une divergence
-- garage/client (HistoriqueImport.valider), sans modifier recalc_score_moto()
-- (schema.sql:684-704) : le CASE ... ELSE 0 existant traite déjà tout type
-- non listé comme 0 point. 'rouge' n'est PAS neutre (-5, malus anti-fraude,
-- schema.sql:698) — 'archive' est une vraie valeur neutre à 0.
--
-- Même précédent que sql/migrations/26b_l10_add_refuse_enum_value.sql :
-- ADD VALUE dans son propre fichier, exécuté seul dans le Dashboard SQL
-- Editor. À appliquer en prod AVANT le déploiement du code (supabase.js)
-- qui référence littéralement 'archive' — une valeur ENUM ajoutée ne peut
-- pas être utilisée dans la même transaction qui l'a créée (PG, erreur
-- 55P04 si violé).
-- ═══════════════════════════════════════════════════════════

ALTER TYPE couleur_dossier_type ADD VALUE IF NOT EXISTS 'archive' AFTER 'rouge';
```

- [ ] **Step 2: Écrire les tests qui échouent (TDD) — garage→bleu**

Dans `tests/test-historique-import-supabase-unit.js`, le bloc existant `── valider (divergence, garage corrige client) ──` (ligne ~201-232) teste déjà un cas avec `acteur_type: 'garage'` mais ne vérifie PAS le type de l'intervention créée. Remplacer ce bloc en entier (de `// ── valider : divergence garage corrige un import client existant ───────` à la fin du `finally { restoreFrom(); }` qui le termine, juste avant `// ── contresigner`) par :

```js
  // ── valider : import GARAGE sans divergence → intervention type=bleu ────
  console.log('\n── valider (import garage, sans divergence) → bleu ──────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-14', moto_id: 'moto-1', acteur_type: 'garage', validated_at: null }, error: null }, // select staging
        { data: [], error: null }, // select divergentes (aucune)
        { data: { id: 'fs-14', moto_id: 'moto-1', validated_at: '2026-07-24T00:00:00.000Z', intervention_id: 'int-14' }, error: null }, // update final
      ],
      interventions: [
        { data: [], error: null }, // select existantes pour cohérence
        { data: { id: 'int-14' }, error: null }, // insert() de Interventions.create
        { data: { id: 'int-14' }, error: null }, // update niveau_preuve/facture_id/photo_url
      ],
      motos: [
        { data: { score: 60, couleur_dossier: 'bleu' }, error: null },
      ],
    });
    const result = await HistoriqueImport.valider('fs-14', 'garage-1', { email: 'mecano@example.com' }, {
      plaque_declaree: 'AB-123-CD', date_document: '2018-03-01', km_declare: 6800,
      siret_declare: null, nom_garage_declare: 'Garage du Centre', description_travaux: 'Vidange'
    });
    check('retourne intervention', !!result.intervention, JSON.stringify(result));
    const interInsert = trace.find(c => c.table === 'interventions' && c.method === 'insert');
    check('intervention créée avec type=bleu (acteur_type=garage)', interInsert && interInsert.args[0].type === 'bleu', JSON.stringify(interInsert));
  } catch (e) {
    check('valider (import garage) sans exception', false, e.message);
  } finally {
    restoreFrom();
  }

  // ── valider : divergence garage corrige un import client existant ───────
  console.log('\n── valider (divergence, garage corrige client) ──────────────────');
  try {
    const trace = mockFrom({
      factures_scannees: [
        { data: { id: 'fs-13', moto_id: 'moto-1', acteur_type: 'garage', validated_at: null }, error: null }, // select staging
        { data: [{ id: 'fs-12', acteur_type: 'client', intervention_id: 'int-12' }], error: null }, // select divergentes → trouve fs-12
        { data: { id: 'fs-13', divergence_de: 'fs-12', intervention_id: 'int-13' }, error: null }, // update final
      ],
      interventions: [
        { data: [], error: null },
        { data: { id: 'int-13' }, error: null }, // insert() de Interventions.create
        { data: { id: 'int-13' }, error: null }, // update niveau_preuve/facture_id/photo_url
        { data: { id: 'int-12', type: 'archive' }, error: null }, // update neutralisation de l'ancienne intervention
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
    const interInsert = trace.find(c => c.table === 'interventions' && c.method === 'insert');
    check('nouvelle intervention créée avec type=bleu (acteur_type=garage)', interInsert && interInsert.args[0].type === 'bleu', JSON.stringify(interInsert));
    const archiveUpdate = trace.filter(c => c.table === 'interventions' && c.method === 'update').find(c => c.args[0] && c.args[0].type === 'archive');
    check("ancienne intervention (int-12) neutralisée en type='archive'",
      archiveUpdate && result, JSON.stringify(archiveUpdate));
  } catch (e) {
    check('valider (divergence) sans exception', false, e.message);
  } finally {
    restoreFrom();
  }
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node tests/test-historique-import-supabase-unit.js`
Expected: FAIL sur "intervention créée avec type=bleu" (le code crée encore `type: 'jaune'` inconditionnellement) et sur "ancienne intervention (int-12) neutralisée" (aucun update `type: 'archive'` n'est émis aujourd'hui).

- [ ] **Step 4: Implémenter — garage→bleu + neutralisation archive**

Dans `supabase.js`, remplacer (lignes 601-655, fonction `HistoriqueImport.valider`) :

```js
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

par :

```js
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
    // intervention_id sélectionné en plus (L15 Plan 3) pour pouvoir neutraliser
    // au score l'intervention supplantée sans toucher recalc_score_moto().
    const { data: divergentes } = await supabase.from('factures_scannees')
      .select('id, acteur_type, intervention_id').eq('moto_id', staging.moto_id)
      .eq('plaque_declaree', plaque_declaree).eq('date_document', date_document)
      .not('validated_at', 'is', null).neq('acteur_type', staging.acteur_type).neq('id', id);
    const divergente = (divergentes && divergentes[0]) ? divergentes[0] : null;
    const divergence_de = divergente ? divergente.id : null;

    // Import GARAGE = fait foi par construction (décision 1 du cadrage) —
    // promotion directe en bleu, pas de contre-signature nécessaire (celle-ci
    // reste réservée aux imports CLIENT, voir HistoriqueImport.contresigner).
    const typeIntervention = staging.acteur_type === 'garage' ? 'bleu' : 'jaune';

    const titre = nom_garage_declare ? `Historique importé — ${nom_garage_declare}` : 'Historique importé';
    const inter = await Interventions.create(garage_id, staging.moto_id, {
      type: typeIntervention, titre, description: description_travaux || '', km: km_declare,
      montant_ht: montant_ht || 0, montant_ttc: montant_ttc || 0, date: date_document
    });
    const { error: ue2 } = await supabase.from('interventions')
      .update({ niveau_preuve: 'facture', facture_id: id, photo_url: staging.photo_url })
      .eq('id', inter.intervention.id);
    if (ue2) throw new Error(ue2.message);

    // Neutralise l'ancienne intervention supplantée : type='archive' (0 point
    // dans recalc_score_moto(), jamais 'rouge' qui vaut -5) — "la version
    // garage fait foi" appliquée au score, pas seulement à la traçabilité.
    if (divergente && divergente.intervention_id) {
      const { error: ue3 } = await supabase.from('interventions')
        .update({ type: 'archive' }).eq('id', divergente.intervention_id);
      if (ue3) throw new Error(ue3.message);
    }

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `node tests/test-historique-import-supabase-unit.js`
Expected: PASS sur tous les checks, y compris les 2 nouveaux blocs (import garage → bleu, divergence → archive neutralisée). Vérifier aussi que les blocs préexistants (`valider (nominal, cohérent)` avec `acteur_type: 'client'` → `type=jaune`, `déjà validé`, `km incohérent`, `contresigner`) passent toujours sans régression.

- [ ] **Step 6: Commit**

```bash
git add sql/migrations/34_l15_plan3_archive_enum.sql supabase.js tests/test-historique-import-supabase-unit.js
git commit -m "feat(L15): import garage promeut en bleu, divergence neutralise l'ancienne intervention (archive)"
```

**Note pour le contrôleur** : la migration `34_l15_plan3_archive_enum.sql` doit être appliquée en prod (Supabase Dashboard) par Mehdi **avant** que ce commit ne soit poussé/déployé — sinon `type: 'archive'` provoquera une violation de contrainte ENUM en prod dès la première divergence rencontrée.

---

### Task 2: Atelier — section Historique (shell + liste lecture seule + détection OR actif)

**Files:**
- Modify: `MotoKey_Atelier.html`

**Interfaces:**
- Consumes: `GET /motos/:id/historique` (socle L15, `{historique: [...]}`), `GET /ordres-reparation?moto_id=X` (déjà existant, filtré par `motokey-api.js:2860`, retourne `{ordres: [...]}`), helpers `apiGet`, `escapeHtml`, `fmtDateFlexible`, `getToken`, `Promise.allSettled` + `_settledOrFallback` (déjà présents dans `openBriefing`).
- Produces: état module-level `_historiqueMotoId`, `_historiqueListCache`, `_historiqueActiveOrId` ; fonctions `renderHistoriqueSectionAtelier(motoId, historique, activeOrId)`, `reloadHistoriqueAtelier(motoId)`, `renderHistoriqueCardAtelier(doc)` — consommées et étendues par les Tasks 3-5.

- [ ] **Step 1: Étendre `openBriefing` pour charger historique + OR actif**

Remplacer (`MotoKey_Atelier.html:652-711`, fonction `openBriefing`) le bloc du `Promise.allSettled` et du `bundle` :

```js
    const [motoS, consoS, planS, fraudeS] = await Promise.allSettled([
      apiGet('/motos/' + motoId, token),
      apiGet('/motos/' + motoId + '/consommables', token),
      apiGet('/motos/' + motoId + '/plan-entretien', token),
      apiGet('/fraude/historique', token)
    ]);

    const motoRes   = _settledOrFallback(motoS,   'Erreur inattendue lors du chargement de la moto.');
    const consoRes  = _settledOrFallback(consoS,  'Jauges consommables indisponibles.');
    const planRes   = _settledOrFallback(planS,   'Maintenance constructeur indisponible.');
    const fraudeRes = _settledOrFallback(fraudeS, 'Historique anti-fraude indisponible.');

    if (motoRes.status === 401) { doLogout(); return; }

    if (!motoRes.ok) {
      const cached = cacheDataGet('briefing_' + motoId);
      if (cached) { renderBriefing(motoId, Object.assign({}, cached.value, { stale: true })); return; }
      document.getElementById('briefing-content').innerHTML =
        '<div class="empty-state"><div class="icon">📡</div><p>' + escapeHtml(errMsg(motoRes.data)) + '</p></div>';
      return;
    }

    const motoPayload = motoRes.data.data || motoRes.data;
    const moto = Object.assign({}, motoPayload.moto, { client: motoPayload.client, interventions: motoPayload.interventions });
    const consoPayload = consoRes.ok ? (consoRes.data.data || consoRes.data) : {};
    const planPayload  = planRes.ok  ? (planRes.data.data  || planRes.data)  : {};
    const fraudePayload = fraudeRes.ok ? (fraudeRes.data.data || fraudeRes.data) : {};
    const fraudeFlags = (fraudePayload.verifications || []).filter(f => f.moto_id === motoId && f.verdict !== 'authentifie');

    const bundle = {
      moto,
      consommables: consoPayload.consommables || [],
      planEntretien: planPayload.plan_entretien || [],
      fraudeFlags
    };
    cacheDataSet('briefing_' + motoId, bundle);
    renderBriefing(motoId, Object.assign({}, bundle, { stale: false }));
```

par :

```js
    const [motoS, consoS, planS, fraudeS, historiqueS, orsS] = await Promise.allSettled([
      apiGet('/motos/' + motoId, token),
      apiGet('/motos/' + motoId + '/consommables', token),
      apiGet('/motos/' + motoId + '/plan-entretien', token),
      apiGet('/fraude/historique', token),
      apiGet('/motos/' + motoId + '/historique', token),
      apiGet('/ordres-reparation?moto_id=' + motoId, token)
    ]);

    const motoRes      = _settledOrFallback(motoS,      'Erreur inattendue lors du chargement de la moto.');
    const consoRes     = _settledOrFallback(consoS,     'Jauges consommables indisponibles.');
    const planRes      = _settledOrFallback(planS,      'Maintenance constructeur indisponible.');
    const fraudeRes     = _settledOrFallback(fraudeS,    'Historique anti-fraude indisponible.');
    const historiqueRes = _settledOrFallback(historiqueS, 'Historique importé indisponible.');
    const orsRes        = _settledOrFallback(orsS,        'Ordres de réparation indisponibles.');

    if (motoRes.status === 401) { doLogout(); return; }

    if (!motoRes.ok) {
      const cached = cacheDataGet('briefing_' + motoId);
      if (cached) { renderBriefing(motoId, Object.assign({}, cached.value, { stale: true })); return; }
      document.getElementById('briefing-content').innerHTML =
        '<div class="empty-state"><div class="icon">📡</div><p>' + escapeHtml(errMsg(motoRes.data)) + '</p></div>';
      return;
    }

    const motoPayload = motoRes.data.data || motoRes.data;
    const moto = Object.assign({}, motoPayload.moto, { client: motoPayload.client, interventions: motoPayload.interventions });
    const consoPayload = consoRes.ok ? (consoRes.data.data || consoRes.data) : {};
    const planPayload  = planRes.ok  ? (planRes.data.data  || planRes.data)  : {};
    const fraudePayload = fraudeRes.ok ? (fraudeRes.data.data || fraudeRes.data) : {};
    const fraudeFlags = (fraudePayload.verifications || []).filter(f => f.moto_id === motoId && f.verdict !== 'authentifie');
    const historiquePayload = historiqueRes.ok ? (historiqueRes.data.data || historiqueRes.data) : {};
    const historique = historiquePayload.historique || [];
    const orsPayload = orsRes.ok ? (orsRes.data.data || orsRes.data) : {};
    const orActif = (orsPayload.ordres || []).find(o => OR_STATUTS_ACTIFS.includes(o.statut));
    const activeOrId = orActif ? orActif.id : null;

    const bundle = {
      moto,
      consommables: consoPayload.consommables || [],
      planEntretien: planPayload.plan_entretien || [],
      fraudeFlags,
      historique,
      activeOrId
    };
    cacheDataSet('briefing_' + motoId, bundle);
    renderBriefing(motoId, Object.assign({}, bundle, { stale: false }));
```

- [ ] **Step 2: Ajouter la section "Historique" au rendu du briefing**

Remplacer (`MotoKey_Atelier.html:564`) la signature de `renderBriefing` :

```js
function renderBriefing(motoId, { moto, consommables, planEntretien, fraudeFlags, stale }) {
```

par :

```js
function renderBriefing(motoId, { moto, consommables, planEntretien, fraudeFlags, historique, activeOrId, stale }) {
  _historiqueMotoId = motoId;
  _historiqueListCache = historique || [];
  _historiqueActiveOrId = activeOrId || null;
```

Puis remplacer (`MotoKey_Atelier.html:639-644`) :

```js
    <div class="briefing-section">
      <div class="briefing-section-title">Dernières interventions</div>
      ${intHtml}
    </div>
    ${flagsHtml}
  `;
}
```

par :

```js
    <div class="briefing-section">
      <div class="briefing-section-title">Dernières interventions</div>
      ${intHtml}
    </div>
    <div class="briefing-section">
      <div class="briefing-section-title">Historique importé</div>
      <button class="btn-add-ligne" onclick="ouvrirImportHistoriqueAtelier('${escapeHtml(moto.id)}')">📄 Importer un historique</button>
      <input type="file" id="input-historique-photos-atelier" accept="image/jpeg,image/png,image/webp" multiple style="display:none">
      <div id="historique-upload-queue-atelier"></div>
      <div id="historique-section-content-atelier">${renderHistoriqueSectionAtelier(_historiqueListCache)}</div>
    </div>
    ${flagsHtml}
  `;
}
```

- [ ] **Step 3: Ajouter l'état module-level et les fonctions de rendu/rechargement**

Juste après la fermeture de `renderBriefing` (après le `}` qui suit le bloc précédent, avant `function _settledOrFallback`), ajouter :

```js
let _historiqueMotoId    = null;
let _historiqueListCache = [];
let _historiqueActiveOrId = null;

function ouvrirImportHistoriqueAtelier(motoId) {
  document.getElementById('input-historique-photos-atelier').click();
}

async function reloadHistoriqueAtelier() {
  const token = getToken();
  const { ok, data } = await apiGet('/motos/' + _historiqueMotoId + '/historique', token);
  const box = document.getElementById('historique-section-content-atelier');
  if (!box) return;
  if (!ok) {
    box.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>' + escapeHtml(errMsg(data)) + '</p></div>';
    return;
  }
  const payload = data.data || data;
  _historiqueListCache = payload.historique || [];
  box.innerHTML = renderHistoriqueSectionAtelier(_historiqueListCache);
}

function renderHistoriqueSectionAtelier(historique) {
  if (!historique.length) {
    return '<div class="empty-state"><div class="icon">📄</div><p>Aucun document importé pour le moment.</p></div>';
  }
  return historique.map(renderHistoriqueCardAtelier).join('');
}

function renderHistoriqueCardAtelier(doc) {
  if (doc.validated_at) {
    return '<div class="int-row">' +
      '<div class="int-row-top">' +
        '<span class="int-titre">' + escapeHtml(doc.plaque_declaree || '—') + '</span>' +
        '<span class="int-badge int-badge-vert">✓ Validé</span>' +
      '</div>' +
      '<div class="int-meta">' + escapeHtml(fmtDateFlexible(doc.date_document)) + (doc.km_declare != null ? ' · ' + Number(doc.km_declare).toLocaleString('fr-FR') + ' km' : '') + '</div>' +
    '</div>';
  }
  return '<div class="int-row">' +
    '<div class="int-row-top">' +
      '<span class="int-titre">Document importé — en attente de validation</span>' +
      '<span class="int-badge int-badge-jaune">⏳ À valider</span>' +
    '</div>' +
  '</div>';
}
```

- [ ] **Step 4: Vérification manuelle (navigateur, ou statique si pas de session live)**

Ouvrir `MotoKey_Atelier.html`, se connecter avec un compte garage réel (MECANO ou PRO+), ouvrir une moto (briefing). Sous "Dernières interventions", une nouvelle section "Historique importé" doit apparaître avec le bouton "📄 Importer un historique" et soit "Aucun document importé pour le moment." soit une liste de cartes si des `factures_scannees` existent déjà pour cette moto. Si vérification statique uniquement : relire le code inséré et confirmer que `_historiqueMotoId`/`_historiqueListCache`/`_historiqueActiveOrId` sont bien affectés dans `renderBriefing` avant que la section ne soit construite, et que `renderHistoriqueSectionAtelier` est appelée avec le même tableau que celui stocké dans le cache.

- [ ] **Step 5: Commit**

```bash
git add MotoKey_Atelier.html
git commit -m "feat(L15): section Historique atelier — shell + liste lecture seule + détection OR actif"
```

---

### Task 3: Atelier — upload séquentiel

**Files:**
- Modify: `MotoKey_Atelier.html`

**Interfaces:**
- Consumes: `POST /motos/:id/historique` (socle L15, déjà générique dual CLIENT/GARAGE), `_historiqueMotoId` (Task 2).
- Produces: `uploadHistoriquePhotoAtelier(motoId, file, token)`, `handleHistoriquePhotosSelectedAtelier(fileList)`, `renderHistoriqueUploadQueueAtelier()` — internes à cette tâche, `reloadHistoriqueAtelier()` (Task 2) rappelée à la fin.

- [ ] **Step 1: Ajouter la fonction d'upload et le rendu de la file**

Juste après `renderHistoriqueCardAtelier` (Task 2), ajouter :

```js
let _historiqueUploadQueueAtelier = []; // [{file, status:'pending'|'uploading'|'done'|'error', error?}]

async function uploadHistoriquePhotoAtelier(motoId, file, token) {
  const fd = new FormData();
  fd.append('photo', file);
  const res = await fetch(API_BASE + '/motos/' + motoId + '/historique', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }, // pas de Content-Type — laisser fetch poser le boundary multipart
    body: fd
  });
  let data; try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

function renderHistoriqueUploadQueueAtelier() {
  const box = document.getElementById('historique-upload-queue-atelier');
  if (!box) return;
  if (!_historiqueUploadQueueAtelier.length) { box.innerHTML = ''; return; }
  const icons = { pending: '⏳', uploading: '⬆️', done: '✅', error: '❌' };
  box.innerHTML = '<div class="int-row">' +
    _historiqueUploadQueueAtelier.map(function(item) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px">' +
        '<span>' + icons[item.status] + ' ' + escapeHtml(item.file.name) + '</span>' +
        (item.status === 'error' ? '<span style="color:var(--rd);font-size:12px">' + escapeHtml(item.error || 'Échec') + '</span>' : '') +
      '</div>';
    }).join('') +
  '</div>';
}

async function handleHistoriquePhotosSelectedAtelier(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const token = getToken();
  _historiqueUploadQueueAtelier = files.map(function(file) { return { file: file, status: 'pending' }; });
  renderHistoriqueUploadQueueAtelier();

  for (let i = 0; i < _historiqueUploadQueueAtelier.length; i++) {
    _historiqueUploadQueueAtelier[i].status = 'uploading';
    renderHistoriqueUploadQueueAtelier();
    const r = await uploadHistoriquePhotoAtelier(_historiqueMotoId, _historiqueUploadQueueAtelier[i].file, token);
    if (r.ok) {
      _historiqueUploadQueueAtelier[i].status = 'done';
    } else {
      _historiqueUploadQueueAtelier[i].status = 'error';
      _historiqueUploadQueueAtelier[i].error = errMsg(r.data);
    }
    renderHistoriqueUploadQueueAtelier();
  }

  const doneCount  = _historiqueUploadQueueAtelier.filter(function(item) { return item.status === 'done'; }).length;
  const errorCount = _historiqueUploadQueueAtelier.filter(function(item) { return item.status === 'error'; }).length;
  if (doneCount && !errorCount) {
    toast('Import terminé — vérifiez la liste ci-dessous.', 'success');
  } else if (doneCount && errorCount) {
    toast('Import partiel — certains fichiers ont échoué, vérifiez la liste ci-dessous.', 'error');
  } else {
    toast('Échec de l\'import — vérifiez la liste ci-dessous.', 'error');
  }
  reloadHistoriqueAtelier();
}
```

- [ ] **Step 2: Réinitialiser la file au changement de moto et wirer l'input file**

`ouvrirImportHistoriqueAtelier` (Task 2) n'a besoin d'aucune modification — la réinitialisation
de la file par moto se fait dans `renderBriefing` ci-dessous, puisque c'est là que
`_historiqueMotoId` change réellement à chaque ouverture de briefing.

Dans `renderBriefing` (Task 2 Step 2), remplacer :

```js
function renderBriefing(motoId, { moto, consommables, planEntretien, fraudeFlags, historique, activeOrId, stale }) {
  _historiqueMotoId = motoId;
  _historiqueListCache = historique || [];
  _historiqueActiveOrId = activeOrId || null;
```

par :

```js
function renderBriefing(motoId, { moto, consommables, planEntretien, fraudeFlags, historique, activeOrId, stale }) {
  _historiqueMotoId = motoId;
  _historiqueListCache = historique || [];
  _historiqueActiveOrId = activeOrId || null;
  _historiqueUploadQueueAtelier = [];
```

Puis, à la toute fin du fichier, juste après le dernier `addEventListener` existant (chercher le dernier bloc `document.getElementById(...).addEventListener(...)` avant la fermeture de `</script>`), ajouter :

```js
document.getElementById('input-historique-photos-atelier').addEventListener('change', (e) => {
  handleHistoriquePhotosSelectedAtelier(e.target.files);
  e.target.value = '';
});
```

- [ ] **Step 3: Vérification manuelle**

Sur le briefing d'une moto, cliquer "📷 Importer un historique" (déclenche l'input file caché), sélectionner 1-2 images. Une file d'état doit apparaître sous le bouton (⏳→⬆️→✅ ou ❌), suivie d'un toast cohérent avec le résultat (succès/partiel/échec), puis la liste de documents se recharge automatiquement.

- [ ] **Step 4: Commit**

```bash
git add MotoKey_Atelier.html
git commit -m "feat(L15): upload multiple séquentiel — atelier"
```

---

### Task 4: Atelier — formulaire éditable OCR + contre-signature

**Files:**
- Modify: `MotoKey_Atelier.html`

**Interfaces:**
- Consumes: `doc.ocr_raw`, `doc.km_coherence_statut`/`motif`, `doc.acteur_type`, `doc.contresigne_par_garage_id` (déjà retournés par `GET /motos/:id/historique`, `select('*')`), `POST /historique/:id/contresigner` (socle L15, PRO+ requis côté backend).
- Produces: `_historiqueFormStateAtelier` (consommé par Task 5), `historiqueFormUpdateAtelier(docId, field, value)`, `contresignerHistorique(docId)`.

- [ ] **Step 1: Ajouter l'état de formulaire**

Juste après `let _historiqueUploadQueueAtelier = [];` (Task 3), ajouter :

```js
let _historiqueFormStateAtelier = {}; // doc.id -> {plaque_declaree, date_document, km_declare, siret_declare, nom_garage_declare, description_travaux}

function _historiqueInitFormStateAtelier(doc) {
  if (_historiqueFormStateAtelier[doc.id]) return;
  const ocrData = doc.ocr_raw || {};
  _historiqueFormStateAtelier[doc.id] = {
    plaque_declaree:      ocrData.plaque || '',
    date_document:        ocrData.date_document || '',
    km_declare:           ocrData.km != null ? String(ocrData.km) : '',
    siret_declare:        ocrData.siret || '',
    nom_garage_declare:   ocrData.nom_garage || '',
    description_travaux:  ocrData.description_travaux || ''
  };
}

function historiqueFormUpdateAtelier(docId, field, value) {
  if (!_historiqueFormStateAtelier[docId]) _historiqueFormStateAtelier[docId] = {};
  _historiqueFormStateAtelier[docId][field] = value;
}
```

- [ ] **Step 2: Ajouter `contresignerHistorique`**

Juste après `historiqueFormUpdateAtelier`, ajouter :

```js
async function contresignerHistorique(docId) {
  const token = getToken();
  const { ok, data } = await apiPost('/historique/' + docId + '/contresigner', {}, token);
  if (!ok) { toast(errMsg(data), 'error'); return; }
  toast('Document contre-signé — niveau de confiance mis à jour.', 'success');
  reloadHistoriqueAtelier();
}
```

- [ ] **Step 3: Remplacer `renderHistoriqueCardAtelier` — formulaire éditable + contre-signature**

Remplacer (Task 2) :

```js
function renderHistoriqueCardAtelier(doc) {
  if (doc.validated_at) {
    return '<div class="int-row">' +
      '<div class="int-row-top">' +
        '<span class="int-titre">' + escapeHtml(doc.plaque_declaree || '—') + '</span>' +
        '<span class="int-badge int-badge-vert">✓ Validé</span>' +
      '</div>' +
      '<div class="int-meta">' + escapeHtml(fmtDateFlexible(doc.date_document)) + (doc.km_declare != null ? ' · ' + Number(doc.km_declare).toLocaleString('fr-FR') + ' km' : '') + '</div>' +
    '</div>';
  }
  return '<div class="int-row">' +
    '<div class="int-row-top">' +
      '<span class="int-titre">Document importé — en attente de validation</span>' +
      '<span class="int-badge int-badge-jaune">⏳ À valider</span>' +
    '</div>' +
  '</div>';
}
```

par :

```js
function renderHistoriqueCardAtelier(doc) {
  if (doc.validated_at) {
    const peutContresigner = doc.acteur_type === 'client' && !doc.contresigne_par_garage_id;
    const contresignerBtn = peutContresigner
      ? '<button class="btn-add-ligne" onclick="contresignerHistorique(\'' + escapeHtml(doc.id) + '\')">Contresigner</button>'
      : '';
    return '<div class="int-row">' +
      '<div class="int-row-top">' +
        '<span class="int-titre">' + escapeHtml(doc.plaque_declaree || '—') + '</span>' +
        '<span class="int-badge int-badge-vert">✓ Validé</span>' +
      '</div>' +
      '<div class="int-meta">' + escapeHtml(fmtDateFlexible(doc.date_document)) + (doc.km_declare != null ? ' · ' + Number(doc.km_declare).toLocaleString('fr-FR') + ' km' : '') + '</div>' +
      contresignerBtn +
    '</div>';
  }

  _historiqueInitFormStateAtelier(doc);
  const f = _historiqueFormStateAtelier[doc.id];
  const ocrBadge = doc.ocr_raw
    ? '<div style="font-size:11px;color:var(--tx3);margin-bottom:10px">🤖 Pré-rempli par l\'IA — vérifiez avant de valider</div>'
    : '<div style="font-size:11px;color:var(--tx3);margin-bottom:10px">Lecture automatique indisponible — remplissez manuellement</div>';
  const rejetHtml = doc.km_coherence_statut === 'rejete'
    ? '<div class="stale-banner">⚠ ' + escapeHtml(doc.km_coherence_motif || 'Kilométrage incohérent') + '</div>'
    : '';

  return '<div class="int-row">' +
    ocrBadge + rejetHtml +
    '<div class="field"><input type="text" placeholder="Plaque d\'immatriculation *" value="' + escapeHtml(f.plaque_declaree) + '" oninput="historiqueFormUpdateAtelier(\'' + escapeHtml(doc.id) + '\',\'plaque_declaree\',this.value)"></div>' +
    '<div class="field"><input type="date" value="' + escapeHtml(f.date_document) + '" oninput="historiqueFormUpdateAtelier(\'' + escapeHtml(doc.id) + '\',\'date_document\',this.value)"></div>' +
    '<div class="field"><input type="number" min="0" placeholder="Kilométrage relevé *" value="' + escapeHtml(f.km_declare) + '" oninput="historiqueFormUpdateAtelier(\'' + escapeHtml(doc.id) + '\',\'km_declare\',this.value)"></div>' +
    '<div class="field"><input type="text" placeholder="Nom du garage" value="' + escapeHtml(f.nom_garage_declare) + '" oninput="historiqueFormUpdateAtelier(\'' + escapeHtml(doc.id) + '\',\'nom_garage_declare\',this.value)"></div>' +
    '<div class="field"><input type="text" placeholder="SIRET (optionnel)" value="' + escapeHtml(f.siret_declare) + '" oninput="historiqueFormUpdateAtelier(\'' + escapeHtml(doc.id) + '\',\'siret_declare\',this.value)"></div>' +
    '<div class="field"><input type="text" placeholder="Travaux effectués" value="' + escapeHtml(f.description_travaux) + '" oninput="historiqueFormUpdateAtelier(\'' + escapeHtml(doc.id) + '\',\'description_travaux\',this.value)"></div>' +
  '</div>';
}
```

- [ ] **Step 4: Vérification manuelle**

Après un upload (Task 3), la carte du document en attente doit afficher un formulaire à 6 champs pré-rempli par l'OCR si disponible. Sur un document déjà validé avec `acteur_type: 'client'` non encore contre-signé (nécessite un import client existant sur la même moto, ou un jeu de données de test), le bouton "Contresigner" doit apparaître ; cliquer dessus doit produire un toast de succès et rafraîchir la liste (le bouton disparaît, le document reste "✓ Validé"). Sur un document déjà `acteur_type: 'garage'` ou déjà contre-signé, le bouton ne doit jamais apparaître.

- [ ] **Step 5: Commit**

```bash
git add MotoKey_Atelier.html
git commit -m "feat(L15): formulaire de revue éditable + contre-signature — atelier"
```

---

### Task 5: Atelier — validation groupée + ligne facturable

**Files:**
- Modify: `MotoKey_Atelier.html`

**Interfaces:**
- Consumes: `POST /historique/:id/valider` (socle L15 + Task 1 de ce plan), `POST /ordres-reparation/:id/taches` (déjà existant, `motokey-api.js:3449`), `_historiqueActiveOrId` (Task 2), `_historiqueFormStateAtelier` (Task 4).

- [ ] **Step 1: Ajouter le bouton "Valider tout" + bouton facturation conditionnel**

Remplacer (Task 2) :

```js
function renderHistoriqueSectionAtelier(historique) {
  if (!historique.length) {
    return '<div class="empty-state"><div class="icon">📄</div><p>Aucun document importé pour le moment.</p></div>';
  }
  return historique.map(renderHistoriqueCardAtelier).join('');
}
```

par :

```js
function renderHistoriqueSectionAtelier(historique) {
  if (!historique.length) {
    return '<div class="empty-state"><div class="icon">📄</div><p>Aucun document importé pour le moment.</p></div>';
  }
  const pendingCount = historique.filter(function(d) { return !d.validated_at; }).length;
  const validerBtn = pendingCount
    ? '<button class="btn-add-ligne" onclick="validerToutHistoriqueAtelier()">Valider ' + pendingCount + ' document' + (pendingCount > 1 ? 's' : '') + '</button>'
    : '';
  const facturerBtn = _historiqueActiveOrId
    ? '<button class="btn-add-ligne" onclick="facturerRepriseHistorique()">Facturer cette reprise (~30 €)</button>'
    : '';
  return historique.map(renderHistoriqueCardAtelier).join('') + validerBtn + facturerBtn;
}
```

- [ ] **Step 2: Ajouter `validerToutHistoriqueAtelier` et `facturerRepriseHistorique`**

Juste après `contresignerHistorique` (Task 4), ajouter :

```js
async function validerToutHistoriqueAtelier() {
  const token = getToken();
  const pending = _historiqueListCache.filter(function(d) { return !d.validated_at; });
  if (!pending.length) return;

  let successCount = 0, errorCount = 0;
  for (const doc of pending) {
    const f = _historiqueFormStateAtelier[doc.id] || {};
    if (!f.plaque_declaree || !f.date_document || f.km_declare === '' || f.km_declare == null || !/^\d+$/.test(String(f.km_declare).trim())) {
      errorCount++;
      continue; // champs obligatoires manquants ou km_declare non numérique — carte laissée visible pour correction
    }
    const { ok, data } = await apiPost('/historique/' + doc.id + '/valider', {
      plaque_declaree: f.plaque_declaree,
      date_document: f.date_document,
      km_declare: parseInt(f.km_declare, 10),
      siret_declare: f.siret_declare || null,
      nom_garage_declare: f.nom_garage_declare || null,
      description_travaux: f.description_travaux || null
    }, token);
    if (ok) {
      successCount++;
    } else {
      errorCount++;
      const idx = _historiqueListCache.findIndex(function(d) { return d.id === doc.id; });
      if (idx >= 0 && data && data.error && data.error.code === 'KM_INCOHERENT') {
        _historiqueListCache[idx].km_coherence_statut = 'rejete';
        _historiqueListCache[idx].km_coherence_motif  = data.error.message;
      }
    }
  }

  if (successCount === 1) toast('1 document validé et ajouté à l\'historique.', 'success');
  else if (successCount > 1) toast(successCount + ' documents validés et ajoutés à l\'historique.', 'success');
  if (errorCount === 1) toast('1 document n\'a pas pu être validé — vérifiez les champs en rouge.', 'error');
  else if (errorCount > 1) toast(errorCount + ' documents n\'ont pas pu être validés — vérifiez les champs en rouge.', 'error');

  await reloadHistoriqueAtelier();
}

async function facturerRepriseHistorique() {
  if (!_historiqueActiveOrId) { toast('Aucun OR actif pour cette moto.', 'error'); return; }
  const token = getToken();
  const { ok, data } = await apiPost('/ordres-reparation/' + _historiqueActiveOrId + '/taches', {
    libelle: 'Reprise d\'historique', duree_h: 1, taux_horaire: 30
  }, token);
  if (!ok) { toast(errMsg(data), 'error'); return; }
  toast('Ligne "Reprise d\'historique" (30 €) ajoutée à l\'OR.', 'success');
}
```

- [ ] **Step 3: Vérification manuelle**

Sur le briefing d'une moto avec au moins un document en attente correctement rempli (Task 4), le bouton "Valider N document(s)" doit apparaître en bas de la section. Cliquer dessus doit produire un toast de succès, faire disparaître le document de la liste "en attente" (il réapparaît en "✓ Validé"), et rafraîchir le score affiché plus haut sur le briefing (nécessite de rouvrir le briefing ou d'observer un `openBriefing` ultérieur, `reloadHistoriqueAtelier` ne recharge que la section historique, pas le score/km affichés ailleurs sur le briefing — comportement acceptable pour cette tâche). Si une moto a un OR actif (`en_cours`/`attente`/`termine`), le bouton "Facturer cette reprise (~30 €)" doit apparaître ; cliquer dessus doit ajouter une ligne visible dans l'écran "OR actif" de cet ordre avec un montant de 30 €. Si aucun OR actif, ce bouton ne doit pas apparaître du tout.

- [ ] **Step 4: Commit**

```bash
git add MotoKey_Atelier.html
git commit -m "feat(L15): validation groupée + ligne facturable reprise d'historique — atelier"
```

---

### Task 6: Badge "Remplacée" pour le type `archive` (Atelier + Client)

**Files:**
- Modify: `MotoKey_Atelier.html`
- Modify: `MotoKey_Client.html`

**Interfaces:**
- Consumes: `type: 'archive'` désormais possible sur une intervention (Task 1), retourné par `GET /motos/:id` (`interventions`) dans les deux apps sans changement de forme.
- Produces: rendu visuel distinct pour ce type, aucune nouvelle fonction.

- [ ] **Step 1: Atelier — `INT_TYPE_META` + CSS**

Remplacer (`MotoKey_Atelier.html:545-550`) :

```js
const INT_TYPE_META = {
  vert:  { label: 'Concession', cls: 'int-badge-vert' },
  bleu:  { label: 'Pro validé', cls: 'int-badge-bleu' },
  jaune: { label: 'Déclaré',    cls: 'int-badge-jaune' },
  rouge: { label: 'Malus',      cls: 'int-badge-rouge' }
};
```

par :

```js
const INT_TYPE_META = {
  vert:    { label: 'Concession', cls: 'int-badge-vert' },
  bleu:    { label: 'Pro validé', cls: 'int-badge-bleu' },
  jaune:   { label: 'Déclaré',    cls: 'int-badge-jaune' },
  rouge:   { label: 'Malus',      cls: 'int-badge-rouge' },
  archive: { label: '↩ Remplacée', cls: 'int-badge-archive' }
};
```

Remplacer (`MotoKey_Atelier.html:116-119`) :

```css
.int-badge-vert{background:var(--gnbg);color:var(--gn);}
.int-badge-bleu{background:var(--blbg);color:var(--bl);}
.int-badge-jaune{background:var(--ywbg);color:var(--yw);}
.int-badge-rouge{background:var(--rdbg);color:var(--rd);}
```

par :

```css
.int-badge-vert{background:var(--gnbg);color:var(--gn);}
.int-badge-bleu{background:var(--blbg);color:var(--bl);}
.int-badge-jaune{background:var(--ywbg);color:var(--yw);}
.int-badge-rouge{background:var(--rdbg);color:var(--rd);}
.int-badge-archive{background:var(--border);color:var(--tx3);}
```

- [ ] **Step 2: Client — badge + label + CSS**

Remplacer (`MotoKey_Client.html:786-790`, dans `intervHtml`) :

```js
        <div class="interv-item">
          <div class="interv-badge ${esc(i.type || 'bleu')}"></div>
          <div class="interv-body">
            <div class="interv-title">${esc(i.titre)}</div>
            <div class="interv-meta">${fmtDate(i.date_intervention)}${i.km ? ' · ' + i.km.toLocaleString('fr-FR') + ' km' : ''}${i.technicien_nom ? ' · ' + esc(i.technicien_nom) : ''}</div>
          </div>
        </div>`).join('');
```

par :

```js
        <div class="interv-item">
          <div class="interv-badge ${esc(i.type || 'bleu')}"></div>
          <div class="interv-body">
            <div class="interv-title">${esc(i.titre)}</div>
            <div class="interv-meta">${fmtDate(i.date_intervention)}${i.km ? ' · ' + i.km.toLocaleString('fr-FR') + ' km' : ''}${i.technicien_nom ? ' · ' + esc(i.technicien_nom) : ''}</div>
            ${i.type === 'archive' ? '<div class="interv-replaced-label">Remplacée par le garage</div>' : ''}
          </div>
        </div>`).join('');
```

Remplacer (`MotoKey_Client.html:111-115`) :

```css
.interv-badge{width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:5px;}
.interv-badge.vert{background:var(--gn);}
.interv-badge.bleu{background:var(--bl);}
.interv-badge.jaune{background:var(--yw);}
.interv-badge.rouge{background:var(--rd);}
```

par :

```css
.interv-badge{width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:5px;}
.interv-badge.vert{background:var(--gn);}
.interv-badge.bleu{background:var(--bl);}
.interv-badge.jaune{background:var(--yw);}
.interv-badge.rouge{background:var(--rd);}
.interv-badge.archive{background:var(--tx3);}
.interv-replaced-label{font-size:11px;color:var(--tx3);margin-top:2px;}
```

- [ ] **Step 3: Vérification manuelle**

Après un scénario de divergence réel (import client validé, puis garage corrige la même plaque+date, Task 1-5), l'ancienne intervention doit apparaître dans les deux apps avec le badge "↩ Remplacée" (atelier) / pastille grise + texte "Remplacée par le garage" (client), sans disparaître de la liste "Dernières interventions"/"Historique". Le score affiché ne doit plus compter cette ancienne intervention (vérifiable en comparant le score avant/après la correction garage — doit refléter seulement la nouvelle intervention `bleu`, pas les deux cumulées).

- [ ] **Step 4: Commit**

```bash
git add MotoKey_Atelier.html MotoKey_Client.html
git commit -m "feat(L15): badge 'Remplacée' pour intervention archivée — atelier + client"
```

---

## Self-Review

**Couverture du spec (`docs/superpowers/specs/2026-07-24-l15-plan3-import-garage-design.md`) :**
- Décision 1 (périmètre 4 chantiers) → Tasks 1-6 couvrent import garage (2-3), contre-signature (4), résolution divergence (1+6), prestation facturable (5).
- Décision 2 (garage→bleu) → Task 1.
- Décision 3 (archive, pas rouge) → Task 1 (migration + logique) + Task 6 (affichage).
- Décision 4 (section dans renderBriefing) → Task 2.
- Décision 5 + correction (détection OR actif via query, pas `_currentOrId`) → Task 2 (fetch) + Task 5 (bouton conditionnel).
- Décision 6 (contre-signature sans modale) → Task 4.
- Décision 7 (badge visible, pas masqué) → Task 6.
- Décision 8 (appel direct, pas le formulaire manuel) → Task 5 (`facturerRepriseHistorique`).

**Scan placeholders** : aucun "TBD"/"TODO" — chaque Step contient le code complet à insérer/remplacer.

**Cohérence des noms** : `_historiqueMotoId`, `_historiqueListCache`, `_historiqueActiveOrId`, `_historiqueUploadQueueAtelier`, `_historiqueFormStateAtelier` sont chacun introduits une fois (Tasks 2-4) et réutilisés identiquement dans les tâches suivantes. Suffixe `Atelier` systématique sur les noms de fonctions pour éviter toute collision si `MotoKey_Atelier.html` venait un jour à partager du code avec `MotoKey_Client.html` (fichiers actuellement indépendants, mais la convention de nommage coûte rien et documente l'intention).

**Type consistency** : `renderHistoriqueCardAtelier` (Task 2, étendu Task 4) et `renderHistoriqueSectionAtelier` (Task 2, étendu Task 5) sont chacun remplacés en bloc entier à chaque tâche suivante qui les touche — pas de divergence de signature.
