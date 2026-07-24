# L15 — Plan 2 : Import CLIENT (upload multiple + revue + validation groupée) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Écran client permettant d'importer plusieurs anciennes factures/justificatifs d'entretien pour une moto, de voir l'IA pré-remplir les champs, de vérifier/corriger, et de valider en une fois — consommant les 4 endpoints déjà livrés par le socle L15 (`docs/superpowers/plans/2026-07-24-l15-historique-socle.md`, mergé master `8b5bd45`).

**Architecture:** Tout dans `MotoKey_Client.html` (app vanille JS mono-fichier, pas de build). Nouvel écran top-level `screen-historique-import`, ouvert depuis un bouton dans la section "Historique" de chaque `moto-card`. Upload séquentiel (un fichier = un `POST /motos/:id/historique`), état de formulaire par document en mémoire (`_historiqueFormState`), un seul bouton "Valider tout" déclenchant N appels `POST /historique/:id/valider`.

**Tech Stack:** Vanilla JS, `fetch`/`FormData`, patterns existants (`apiFetch`/`apiGet`/`apiPost`, `uploadConsoPhoto`, `showScreen`, `_unwrap`, `esc`, `fmtDate`, `toast`).

## Global Constraints

- **Aucun framework de test frontend n'existe dans ce repo** — la vérification de chaque tâche est manuelle (navigateur). Utiliser les outils `claude-in-chrome` si disponibles pour l'implémenteur ; sinon décrire précisément l'état visuel attendu pour une vérification humaine.
- **`localStorage` est autorisé dans `MotoKey_Client.html`** (contrairement à `app.html`, contrainte "artifact Anthropic" qui ne s'applique pas à ce fichier) — utiliser `localStorage.getItem(LS_AT)` comme partout ailleurs dans ce fichier.
- **Réutiliser les helpers existants sans les réimplémenter** : `esc()`, `fmtDate()`, `apiGet()`, `apiPost()`, `apiFetch()`, `errMsg()`, `toast()`, `_unwrap()`, `showScreen()`.
- **Upload multipart** : `FormData` + `fetch` avec UNIQUEMENT le header `Authorization` (jamais de `Content-Type` — laissé au navigateur), exactement comme `uploadConsoPhoto()` (`MotoKey_Client.html:699-711`).
- **Upload SÉQUENTIEL, jamais parallèle** (décision 6 du cadrage — "file de traitement") : un fichier à la fois, jamais de `Promise.all()` sur plusieurs uploads simultanés.
- **Jamais d'insertion automatique** (décision 5) : aucun appel à `POST /historique/:id/valider` ne part sans une action explicite de l'utilisateur sur le bouton "Valider tout".
- **CSS** : réutiliser uniquement les classes existantes (`.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-full`, `.btn-sm`, `.form-group`, `.alert-inline`, `.alert-err`, `.empty-state`, `.empty-icon`) — aucune nouvelle classe CSS, aucun framework introduit.
- **Édition de `MotoKey_Client.html`** : `str_replace` natif (outil Edit) uniquement — fichier listé comme critique dans CLAUDE.md, jamais de script PowerShell/sed/awk.
- **Un client peut avoir plusieurs motos** — le `moto_id` ciblé par l'import est toujours celui de la carte sur laquelle l'utilisateur a cliqué, jamais une valeur globale de session.

## File Structure

Un seul fichier modifié dans les 4 tâches, par insertions successives (comme `supabase.js` dans le socle) :

**Modifier :** `MotoKey_Client.html`
- HTML : nouvel écran `#screen-historique-import` (après `#screen-interventions`, ligne ~448) ; bouton d'entrée dans `renderMotoCard()` (ligne ~810-813)
- JS : ajout de `'historique-import'` à la liste `showScreen()` (ligne 471, 474) ; nouvelles fonctions dans le bloc `<script>` existant, état module-level (`_historiqueMotoId`, `_historiqueListCache`, `_historiqueUploadQueue`, `_historiqueFormState`)

---

### Task 1: Écran shell + point d'entrée + liste en lecture seule

**Files:**
- Modify: `MotoKey_Client.html`

**Interfaces:**
- Consumes: `GET /motos/:id/historique` (socle L15, retourne `{historique: [...]}`, chaque élément = ligne `factures_scannees` avec `id, plaque_declaree, date_document, km_declare, ocr_raw, validated_at, km_coherence_statut, km_coherence_motif`).
- Produces: `openHistoriqueImport(motoId)`, `loadHistoriqueImport()`, `renderHistoriqueList()`, `renderHistoriqueCard(doc)` — consommées et étendues par les Tasks 2-4.

- [ ] **Step 1: Ajouter l'écran HTML**

Dans `MotoKey_Client.html`, juste après la fermeture du bloc `#screen-interventions` (après la ligne `</div>` qui suit `ÉCRAN 8 — MES INTERVENTIONS`, avant `<script>`) :

```html
<!-- ══════════════════════════════════════════
     ÉCRAN 9 — IMPORTER MON HISTORIQUE
════════════════════════════════════════════ -->
<div id="screen-historique-import" style="display:none;">
  <div class="app-wrap">
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="font-size:20px;font-weight:600;margin:0">Importer mon historique</h2>
      <button class="btn btn-secondary btn-sm" id="btn-back-from-historique-import">← Mes motos</button>
    </div>
    <div class="card" style="margin-bottom:16px">
      <p style="font-size:13px;color:var(--tx3);margin-bottom:12px">Ajoutez une ou plusieurs photos de vos anciennes factures d'entretien. Nous lisons automatiquement la date, la plaque et le kilométrage — vous validez avant l'ajout définitif.</p>
      <button class="btn btn-primary" id="btn-choisir-photos">📷 Choisir des photos</button>
      <input type="file" id="input-historique-photos" accept="image/jpeg,image/png,image/webp" multiple style="display:none">
    </div>
    <div id="historique-upload-queue"></div>
    <div id="historique-review-content">
      <div class="empty-state"><div class="empty-icon">⏳</div><p>Chargement…</p></div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Enregistrer l'écran dans `showScreen()`**

Remplacer (`MotoKey_Client.html:471,474`) :

```js
function showScreen(id) {
  ['login','register','verify','reset-request','reset-confirm','app','account','interventions'].forEach(s => {
    const el = document.getElementById('screen-' + s);
    if (el) el.style.display = (s === id)
      ? (s === 'app' || s === 'account' || s === 'interventions' ? 'block' : 'flex')
      : 'none';
  });
}
```

par :

```js
function showScreen(id) {
  ['login','register','verify','reset-request','reset-confirm','app','account','interventions','historique-import'].forEach(s => {
    const el = document.getElementById('screen-' + s);
    if (el) el.style.display = (s === id)
      ? (s === 'app' || s === 'account' || s === 'interventions' || s === 'historique-import' ? 'block' : 'flex')
      : 'none';
  });
}
```

- [ ] **Step 3: Ajouter le bouton d'entrée dans `renderMotoCard()`**

Remplacer (`MotoKey_Client.html:810-813`) :

```html
      <div class="moto-section">
        <div class="moto-section-title">Historique · ${intervs.length} intervention${intervs.length !== 1 ? 's' : ''}</div>
        <div class="interv-list">${intervHtml}</div>
      </div>
```

par :

```html
      <div class="moto-section">
        <div class="moto-section-title">Historique · ${intervs.length} intervention${intervs.length !== 1 ? 's' : ''}</div>
        <div class="interv-list">${intervHtml}</div>
        <button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="openHistoriqueImport('${esc(moto.id)}')">📄 Importer un historique</button>
      </div>
```

- [ ] **Step 4: Ajouter l'état module-level et les fonctions de chargement/rendu**

Juste après le bloc `let _interventionsOpen = {};` (`MotoKey_Client.html:1079`), ajouter :

```js
let _historiqueMotoId    = null;
let _historiqueListCache = [];

function openHistoriqueImport(motoId) {
  _historiqueMotoId = motoId;
  showScreen('historique-import');
  loadHistoriqueImport();
}

async function loadHistoriqueImport() {
  const at  = localStorage.getItem(LS_AT);
  const box = document.getElementById('historique-review-content');
  box.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Chargement…</p></div>';

  const { ok, data } = await apiGet('/motos/' + _historiqueMotoId + '/historique', at);
  if (!ok) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠</div><p>' + esc(errMsg(data)) + '</p></div>';
    return;
  }

  _historiqueListCache = _unwrap(data, 'historique') || [];
  renderHistoriqueList();
}

function renderHistoriqueList() {
  const box = document.getElementById('historique-review-content');
  if (!box) return;
  if (!_historiqueListCache.length) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>Aucun document importé pour le moment.</p></div>';
    return;
  }
  box.innerHTML = _historiqueListCache.map(renderHistoriqueCard).join('');
}

function renderHistoriqueCard(doc) {
  if (doc.validated_at) {
    return '<div class="card" style="margin-bottom:16px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">' +
        '<div>' +
          '<div style="font-weight:700;font-size:15px">' + esc(doc.plaque_declaree || '—') + '</div>' +
          '<div style="font-size:12px;color:var(--tx3)">' + fmtDate(doc.date_document) + (doc.km_declare != null ? ' · ' + Number(doc.km_declare).toLocaleString('fr-FR') + ' km' : '') + '</div>' +
        '</div>' +
        '<span style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:99px;background:color-mix(in srgb,var(--gn) 15%,transparent);color:var(--gn)">✓ Validé</span>' +
      '</div>' +
    '</div>';
  }
  return '<div class="card" style="margin-bottom:16px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">' +
      '<div style="font-size:13px;color:var(--tx3)">Document importé — en attente de validation</div>' +
      '<span style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:99px;background:color-mix(in srgb,var(--yw) 15%,transparent);color:var(--yw)">⏳ À valider</span>' +
    '</div>' +
  '</div>';
}
```

- [ ] **Step 5: Wirer le bouton retour**

Juste après la ligne `document.getElementById('btn-back-from-interventions').addEventListener('click', () => showScreen('app'));` (`MotoKey_Client.html:1235`), ajouter :

```js
document.getElementById('btn-back-from-historique-import').addEventListener('click', () => showScreen('app'));
```

- [ ] **Step 6: Vérification manuelle (navigateur)**

Ouvrir `MotoKey_Client.html` (ou l'URL prod client) dans un navigateur, se connecter avec un compte client réel possédant au moins une moto. Sur l'écran "Mes motos", chaque carte doit maintenant afficher un bouton "📄 Importer un historique" sous la liste des interventions. Cliquer dessus :
- Expected : navigation vers l'écran "Importer mon historique", titre + bouton retour visibles, un court "Chargement…" puis soit "Aucun document importé pour le moment." (cas normal, aucune moto n'a encore de `factures_scannees`), soit une liste de cartes si des données existent déjà.
- Cliquer "← Mes motos" : retour à l'écran principal, la carte moto toujours visible.

- [ ] **Step 7: Commit**

```bash
git add MotoKey_Client.html
git commit -m "feat(L15): écran import historique CLIENT — shell + liste en lecture seule"
```

---

### Task 2: Upload multiple — file de traitement séquentielle

**Files:**
- Modify: `MotoKey_Client.html`

**Interfaces:**
- Consumes: `POST /motos/:id/historique` (socle L15, multipart, champ `"photo"`, retourne `{facture_scannee, ocr}`, statut `201`).
- Produces: `uploadHistoriquePhoto(motoId, file, token)`, `handleHistoriquePhotosSelected(fileList)`, `renderHistoriqueUploadQueue()` — utilisées uniquement en interne à cette tâche, `loadHistoriqueImport()` (Task 1) est rappelée une fois l'upload terminé.

- [ ] **Step 1: Ajouter la fonction d'upload et le rendu de la file**

Juste après la fonction `renderHistoriqueCard` ajoutée en Task 1, ajouter :

```js
let _historiqueUploadQueue = []; // [{file, status:'pending'|'uploading'|'done'|'error', error?}]

async function uploadHistoriquePhoto(motoId, file, token) {
  const fd = new FormData();
  fd.append('photo', file);
  const res = await fetch(API_BASE + '/motos/' + motoId + '/historique', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }, // NO Content-Type
    body: fd
  });
  let data; try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}

function renderHistoriqueUploadQueue() {
  const box = document.getElementById('historique-upload-queue');
  if (!box) return;
  if (!_historiqueUploadQueue.length) { box.innerHTML = ''; return; }
  const icons = { pending: '⏳', uploading: '⬆️', done: '✅', error: '❌' };
  box.innerHTML = '<div class="card" style="margin-bottom:16px">' +
    _historiqueUploadQueue.map(function(item) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px">' +
        '<span>' + icons[item.status] + ' ' + esc(item.file.name) + '</span>' +
        (item.status === 'error' ? '<span style="color:var(--rd);font-size:12px">' + esc(item.error || 'Échec') + '</span>' : '') +
      '</div>';
    }).join('') +
  '</div>';
}

async function handleHistoriquePhotosSelected(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const at = localStorage.getItem(LS_AT);
  _historiqueUploadQueue = files.map(function(file) { return { file: file, status: 'pending' }; });
  renderHistoriqueUploadQueue();

  for (let i = 0; i < _historiqueUploadQueue.length; i++) {
    _historiqueUploadQueue[i].status = 'uploading';
    renderHistoriqueUploadQueue();
    const r = await uploadHistoriquePhoto(_historiqueMotoId, _historiqueUploadQueue[i].file, at);
    if (r.ok) {
      _historiqueUploadQueue[i].status = 'done';
    } else {
      _historiqueUploadQueue[i].status = 'error';
      _historiqueUploadQueue[i].error = errMsg(r.data);
    }
    renderHistoriqueUploadQueue();
  }

  toast('Import terminé — vérifiez la liste ci-dessous.', 'success');
  loadHistoriqueImport();
}
```

- [ ] **Step 2: Wirer le bouton "Choisir des photos" et l'input file**

Juste après la ligne ajoutée en Task 1 Step 5 (`document.getElementById('btn-back-from-historique-import')...`), ajouter :

```js
document.getElementById('btn-choisir-photos').addEventListener('click', () => {
  document.getElementById('input-historique-photos').click();
});
document.getElementById('input-historique-photos').addEventListener('change', (e) => {
  handleHistoriquePhotosSelected(e.target.files);
  e.target.value = ''; // permet de réimporter le(s) même(s) fichier(s) ensuite si besoin
});
```

- [ ] **Step 3: Vérification manuelle (navigateur)**

Sur l'écran "Importer mon historique", cliquer "📷 Choisir des photos", sélectionner **2 ou 3 images** (JPEG/PNG) dans le sélecteur système.
- Expected : une carte apparaît sous le bouton listant chaque fichier avec une icône d'état, passant `⏳ → ⬆️ → ✅` (ou `❌` avec un message si `VISION_ENABLED`/Cloudinary manquent en environnement de test — comportement attendu et déjà documenté pour le socle backend, pas un bug de cette tâche), puis un toast "Import terminé". La liste de documents en dessous se recharge automatiquement.
- Si le backend testé est en local sans Cloudinary configuré : les cartes passeront en `❌` avec un message d'erreur 503 — c'est le comportement attendu de l'infrastructure locale (voir Task 7 du socle), pas un défaut de cette tâche. Vérifier plutôt contre un environnement où Cloudinary est configuré (prod) si possible, sinon documenter le résultat local tel quel.

- [ ] **Step 4: Commit**

```bash
git add MotoKey_Client.html
git commit -m "feat(L15): upload multiple séquentiel — file de traitement CLIENT"
```

---

### Task 3: Cartes de revue éditables — pré-remplissage OCR

**Files:**
- Modify: `MotoKey_Client.html`

**Interfaces:**
- Consumes: `doc.ocr_raw` (`{date_document, plaque, km, nom_garage, siret, description_travaux}`, tous nullable — retourné par le socle L15, voir `services/historiqueFactureService.js`).
- Produces: `_historiqueFormState` (état partagé, consommé par la Task 4), `historiqueFormUpdate(docId, field, value)`.

- [ ] **Step 1: Ajouter l'état de formulaire et son initialisation**

Juste après `let _historiqueUploadQueue = [];` (ajoutée en Task 2), ajouter :

```js
let _historiqueFormState = {}; // doc.id -> {plaque_declaree, date_document, km_declare, siret_declare, nom_garage_declare, description_travaux}

function _historiqueInitFormState(doc) {
  if (_historiqueFormState[doc.id]) return;
  const ocrData = doc.ocr_raw || {};
  _historiqueFormState[doc.id] = {
    plaque_declaree:      ocrData.plaque || '',
    date_document:        ocrData.date_document || '',
    km_declare:           ocrData.km != null ? String(ocrData.km) : '',
    siret_declare:        ocrData.siret || '',
    nom_garage_declare:   ocrData.nom_garage || '',
    description_travaux:  ocrData.description_travaux || ''
  };
}

function historiqueFormUpdate(docId, field, value) {
  if (!_historiqueFormState[docId]) _historiqueFormState[docId] = {};
  _historiqueFormState[docId][field] = value;
}
```

- [ ] **Step 2: Remplacer la carte "en attente" par un formulaire éditable**

Dans `renderHistoriqueCard(doc)` (Task 1), remplacer le `return` de la branche non-validée :

```js
  return '<div class="card" style="margin-bottom:16px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">' +
      '<div style="font-size:13px;color:var(--tx3)">Document importé — en attente de validation</div>' +
      '<span style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:99px;background:color-mix(in srgb,var(--yw) 15%,transparent);color:var(--yw)">⏳ À valider</span>' +
    '</div>' +
  '</div>';
```

par :

```js
  _historiqueInitFormState(doc);
  const f = _historiqueFormState[doc.id];
  const ocrBadge = doc.ocr_raw
    ? '<div style="font-size:11px;color:var(--tx3);margin-bottom:10px">🤖 Pré-rempli par l\'IA — vérifiez avant de valider</div>'
    : '<div style="font-size:11px;color:var(--tx3);margin-bottom:10px">Lecture automatique indisponible — remplissez manuellement</div>';
  const rejetHtml = doc.km_coherence_statut === 'rejete'
    ? '<div class="alert-inline alert-err" style="margin-bottom:10px">⚠ ' + esc(doc.km_coherence_motif || 'Kilométrage incohérent') + '</div>'
    : '';

  return '<div class="card" style="margin-bottom:16px">' +
    ocrBadge + rejetHtml +
    '<div class="form-group"><label>Plaque d\'immatriculation *</label><input type="text" value="' + esc(f.plaque_declaree) + '" oninput="historiqueFormUpdate(\'' + esc(doc.id) + '\',\'plaque_declaree\',this.value)"></div>' +
    '<div class="form-group"><label>Date du document *</label><input type="date" value="' + esc(f.date_document) + '" oninput="historiqueFormUpdate(\'' + esc(doc.id) + '\',\'date_document\',this.value)"></div>' +
    '<div class="form-group"><label>Kilométrage relevé *</label><input type="number" min="0" value="' + esc(f.km_declare) + '" oninput="historiqueFormUpdate(\'' + esc(doc.id) + '\',\'km_declare\',this.value)"></div>' +
    '<div class="form-group"><label>Nom du garage</label><input type="text" value="' + esc(f.nom_garage_declare) + '" oninput="historiqueFormUpdate(\'' + esc(doc.id) + '\',\'nom_garage_declare\',this.value)"></div>' +
    '<div class="form-group"><label>SIRET (optionnel)</label><input type="text" value="' + esc(f.siret_declare) + '" oninput="historiqueFormUpdate(\'' + esc(doc.id) + '\',\'siret_declare\',this.value)"></div>' +
    '<div class="form-group"><label>Travaux effectués</label><input type="text" value="' + esc(f.description_travaux) + '" oninput="historiqueFormUpdate(\'' + esc(doc.id) + '\',\'description_travaux\',this.value)"></div>' +
  '</div>';
```

- [ ] **Step 3: Vérification manuelle (navigateur)**

Après un upload réussi (Task 2), la carte du document en attente doit maintenant afficher un formulaire avec 6 champs (plaque, date, km, garage, SIRET, travaux). Si l'OCR a fonctionné (`VISION_ENABLED=true` en environnement testé), les champs plaque/date/km/garage/description doivent être pré-remplis avec les valeurs lues sur la photo — sinon (`VISION_ENABLED=false`, cas local par défaut) les champs sont vides avec le message "Lecture automatique indisponible". Taper dans un champ doit mettre à jour l'état sans recharger la page (vérifiable en tapant, changeant d'écran via retour, puis revenant — **note** : l'état `_historiqueFormState` n'est PAS persisté entre un retour à l'écran principal et un retour à l'import ; c'est un comportement acceptable pour cette tâche, pas un bug à corriger ici).

- [ ] **Step 4: Commit**

```bash
git add MotoKey_Client.html
git commit -m "feat(L15): formulaire de revue éditable — pré-remplissage OCR par document"
```

---

### Task 4: Validation groupée — "Valider tout"

**Files:**
- Modify: `MotoKey_Client.html`

**Interfaces:**
- Consumes: `POST /historique/:id/valider` (socle L15, body `{plaque_declaree, date_document, km_declare, siret_declare, nom_garage_declare, description_travaux}`, `200` succès ou `409 KM_INCOHERENT`), `_historiqueFormState` (Task 3), `loadMotos()` (existant, `MotoKey_Client.html:819`).

- [ ] **Step 1: Ajouter le bouton "Valider tout" conditionnel**

Remplacer `renderHistoriqueList()` (Task 1) :

```js
function renderHistoriqueList() {
  const box = document.getElementById('historique-review-content');
  if (!box) return;
  if (!_historiqueListCache.length) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>Aucun document importé pour le moment.</p></div>';
    return;
  }
  box.innerHTML = _historiqueListCache.map(renderHistoriqueCard).join('');
}
```

par :

```js
function renderHistoriqueList() {
  const box = document.getElementById('historique-review-content');
  if (!box) return;
  if (!_historiqueListCache.length) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>Aucun document importé pour le moment.</p></div>';
    return;
  }
  const pendingCount = _historiqueListCache.filter(function(d) { return !d.validated_at; }).length;
  const validerBtn = pendingCount
    ? '<button class="btn btn-primary btn-full" id="btn-valider-tout-historique" onclick="validerToutHistorique()">Valider ' + pendingCount + ' document' + (pendingCount > 1 ? 's' : '') + '</button>'
    : '';
  box.innerHTML = _historiqueListCache.map(renderHistoriqueCard).join('') + validerBtn;
}
```

- [ ] **Step 2: Ajouter `validerToutHistorique()`**

Juste après `historiqueFormUpdate` (Task 3), ajouter :

```js
async function validerToutHistorique() {
  const at = localStorage.getItem(LS_AT);
  const pending = _historiqueListCache.filter(function(d) { return !d.validated_at; });
  if (!pending.length) return;

  let successCount = 0, errorCount = 0;
  for (const doc of pending) {
    const f = _historiqueFormState[doc.id] || {};
    if (!f.plaque_declaree || !f.date_document || f.km_declare === '' || f.km_declare == null) {
      errorCount++;
      continue; // champs obligatoires manquants — carte laissée visible pour correction
    }
    const { ok, data } = await apiPost('/historique/' + doc.id + '/valider', {
      plaque_declaree: f.plaque_declaree,
      date_document: f.date_document,
      km_declare: parseInt(f.km_declare, 10),
      siret_declare: f.siret_declare || null,
      nom_garage_declare: f.nom_garage_declare || null,
      description_travaux: f.description_travaux || null
    }, at);
    if (ok) {
      successCount++;
    } else {
      errorCount++;
      const idx = _historiqueListCache.findIndex(function(d) { return d.id === doc.id; });
      if (idx >= 0) {
        if (data && data.error && data.error.code === 'KM_INCOHERENT') {
          _historiqueListCache[idx].km_coherence_statut = 'rejete';
          _historiqueListCache[idx].km_coherence_motif  = data.error.message;
        }
      }
    }
  }

  if (successCount) toast(successCount + ' document(s) validé(s) et ajouté(s) à l\'historique.', 'success');
  if (errorCount)   toast(errorCount + ' document(s) n\'ont pas pu être validés — vérifiez les champs en rouge.', 'error');

  await loadHistoriqueImport();
  loadMotos(); // rafraîchit le score/historique de la moto concernée
}
```

- [ ] **Step 3: Vérification manuelle (navigateur)**

Avec au moins un document en attente rempli correctement (Task 3), un bouton "Valider N document(s)" doit apparaître en bas de la liste. Cliquer dessus :
- Expected (cas nominal) : toast de succès, le document disparaît de la liste "en attente" et réapparaît en carte "✓ Validé" avec la plaque/date/km confirmés. En retournant à l'écran "Mes motos", la nouvelle intervention doit apparaître dans la section "Historique" de la moto concernée (type `jaune`).
- Expected (cas km incohérent, à provoquer en saisissant volontairement un kilométrage très bas sur un document dont la date est postérieure à une intervention existante à kilométrage élevé) : toast d'erreur, la carte concernée affiche le bandeau rouge "⚠ [motif]" au lieu de disparaître, les autres documents valides du lot sont bien validés (pas de blocage global).

- [ ] **Step 4: Commit**

```bash
git add MotoKey_Client.html
git commit -m "feat(L15): validation groupée — POST /historique/:id/valider par lot"
```

---

## Self-Review

**Couverture du cadrage :**
- Décision 1 (CLIENT peut importer) → Tasks 1-4, `resolveMotoForCtx` côté backend (déjà livré) gère l'ownership CLIENT sans code frontend supplémentaire nécessaire.
- Décision 5 (IA pré-remplit, humain valide, jamais d'auto-insertion) → Task 3 (pré-remplissage éditable) + Task 4 (validation explicite par bouton, jamais automatique).
- Décision 6 (upload multiple → file de traitement → écran de revue en liste → validation groupée) → Task 2 (file de traitement séquentielle avec statuts visibles), Task 1+3 (écran de revue en liste), Task 4 (un seul bouton pour tout valider, pas de formulaire ligne par ligne soumis individuellement).

**Hors périmètre de ce plan** (renvoyé au Plan 3 déjà annoncé) : import côté GARAGE, UI de contre-signature, résolution UI de divergence client/garage, prestation garage facturable ~30€ en ligne d'intervention L10.

**Scan placeholders :** aucun "TBD"/"TODO" — chaque Step contient le code HTML/JS complet à insérer.

**Cohérence des noms/état :** `_historiqueMotoId`, `_historiqueListCache`, `_historiqueUploadQueue`, `_historiqueFormState` sont chacun introduits une fois (Tasks 1-3) et réutilisés identiquement dans les tâches suivantes sans renommage.
