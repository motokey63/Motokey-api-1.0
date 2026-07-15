# Phase 27: UI Web Garage + Client (jauges, retrait Pneus legacy) - Research

**Researched:** 2026-07-15
**Domain:** Frontend (vanilla JS, no framework) consuming existing Node/Express + Supabase backend — read-mostly UI feature (gauges) + one new multipart upload UI path + legacy code removal + one data migration
**Confidence:** HIGH (all findings verified by direct code read, not training-data assumptions — this is a solo-maintained 2-file frontend with no external library research needed)

## Summary

This phase is almost entirely a **frontend build-out against an already-complete backend contract** (Phases 23-26 delivered the schema, the stub vision analysis, CONSO-01/03 endpoints, and the GAUGE-04 read-time enrichment pattern). No new library, no new backend service, no new vision call. The real work is: (1) design and wire a small new read endpoint (or reuse pattern) to expose `pct_usure`/`etat` per consommable — which **does not exist yet** anywhere in the HTTP surface, (2) build the garage "Consommables" tab and the client card section from scratch (there is **zero existing frontend code** consuming CONSO-01/03 in either `app.html` or `MotoKey_Client.html` today), (3) migrate `pneu_av`/`pneu_ar`/`pneu_km_montage` into `consommables` rows via a versioned SQL script, and (4) delete the legacy Pneus tab/routes and fix `CLAUDE.md`.

The single most important discovery: **`pct_usure`/`etat` live only inside `photos_consommables.analyse_ia` (JSONB), on the most recent photo row per consommable — never on the `consommables` row itself.** Any endpoint or enrichment must join `consommables` → latest `photos_consommables` per type, exactly like `consommableRappelService.isConsommableEnRetard()` already does. The `etat` field is a **monotonic step function of `pct_usure`** (`deriveEtat()` in `services/visionAnalysisService.js`: <30 bon, 30-59 moyen, 60-84 usé, ≥85 critique), which means the "maillon le plus faible" algorithm collapses to one line: **pick the consommable with the maximum `pct_usure` among those with real data** — its `etat` is automatically the most severe (or tied-most-severe) by construction. No separate tie-break rule is needed.

Second key discovery: `GET /motos` and `GET /motos/:id` have **four different code paths** in `motokey-api.js` (CLIENT-list, CLIENT-getById, GARAGE-list via `SBLayer.Motos.list()`, GARAGE-getById via `SBLayer.Motos.getById()`), and only the two GARAGE paths currently benefit from the GAUGE-04 read-time enrichment (`Motos.list()`/`Motos.getById()`). The two CLIENT paths do a raw `supabase.from('motos').select('*')` directly in the route handler, bypassing `SBLayer.Motos` entirely. Enriching the existing endpoints would require touching and keeping in sync **4 separate query sites**. A **new dedicated endpoint** `GET /motos/:id/consommables`, built on the already-established `resolveMotoForCtx()` dual CLIENT/GARAGE ownership helper (used by CONSO-01/03 and KM endpoints since Phase 25), requires **one implementation** and is a natural fit for `MotoKey_Client.html`'s existing per-moto parallel-fetch pattern in `loadMotos()` (which already fetches `/interventions` and `/entretien/alertes` per moto in parallel).

**Primary recommendation:** Add `GET /motos/:id/consommables` (new endpoint, `resolveMotoForCtx()` pattern, open to CLIENT+MECANO+) that returns all 9 types with `{type_consommable, km_montage, date_montage, reference, pct_usure|null, etat|null, has_data:boolean}` plus a computed `jauge_generale` (max pct_usure among `has_data` rows, or `null` if none). Build the garage tab and client card section as pure consumers of this one endpoint. Build a small shared multipart-upload helper (raw `fetch` + `FormData`, no `Content-Type` header) in each file — **this pattern does not exist yet in either file** and must be built new for D-10.

## Project Constraints (from CLAUDE.md)

- **No PowerShell/sed/awk/Python one-liners** to edit `motokey-api.js`, `app.html`, `supabase.js`, `MotoKey_Client.html` — all edits via native `str_replace`-style tools directly in the repo.
- **Never** re-embed `app.html` into a `motokey-api.js` constant. `_MAINTENANCE_HTML` is a maintenance fallback, not a copy of the app — do not touch it for this phase.
- **Never** ask the user to download/recopy files manually.
- Migrations are **SQL scripts in `sql/migrations/`, applied manually by Mehdi via Supabase Dashboard SQL Editor** — never auto-run, never assume applied until confirmed (see STATE.md pattern for migrations 10-24, all manually applied and explicitly confirmed in STATE.md after the fact).
- Never touch the anti-fraude weighting (1.0/0.6/0.3) or the 70/30 score formula — not applicable to this phase, but the `couleur_dossier`/`score` fields must not be conflated with `etat`/`pct_usure` (explicitly out of scope: "Mapping du % usure IA dans la pondération anti-fraude" — REQUIREMENTS.md Out of Scope).
- Always `git status` / `git log --oneline -5` before major changes; always `git push` at end of session.
- Complex/multi-file operations (like the migration script) should be versioned in `sql/migrations/`, following the exact header/comment style of `sql/migrations/24_consommables_rappel_state.sql`.
- No `.claude/skills/` directory exists in this repo (checked — none found), so no project skill files to load.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** A consommable with no photo AND no mécano entry (`km_montage` NULL, or no `consommables` row at all for that type) shows a distinct **"Non renseigné"** state — neutral/grey badge, no %. No 0% "neuf" or km-based estimate (would be false precision, already rejected in v1.6 Out of Scope).
- **D-02:** No visual distinction between "consommable row exists but no photo" and "no row at all" — same "Non renseigné" badge in both cases.
- **D-03:** The general gauge (weakest link) **excludes** "Non renseigné" consommables from the calculation — only consommables with real data (photo/analysis) participate in the minimum-usure... **maximum** (worst state, see algorithm note below). A never-tracked consommable must never artificially drag the general gauge to 0/critique.
- **D-04:** If **no** consommable on the moto has data at all (new moto, migration not yet run), the general gauge shows a neutral **"Pas encore suivi"** state — no %, message inviting data entry/photo. Never a misleading 0/100 or 100/100.
- **D-05:** Gauges live in a **new fiche moto tab in `app.html`** that **replaces** the existing "Pneus" tab (`tabDefs` at `app.html:894-899`: Infos / **Consommables** / Carnet d'entretien / OR liés) — same slot, natural transition.
- **D-06:** Each individual gauge = **horizontal bar + color badge**, reusing existing CSS classes (`score-vert/bleu/jaune/rouge` in `app.html`; `.vert/.bleu/.jaune/.rouge` in `MotoKey_Client.html`) — bar filled to `pct_usure`%, color from `etat` (mapping locked Phase 24 D-01: bon/moyen/usé/critique ↔ vert/bleu/jaune/rouge).
- **D-07:** The general gauge (weakest link) is **prominently displayed at the top** of the tab, same style as the score/couleur badge already shown in the Infos tab (`app.html:943`) — visually adjacent to the existing anti-fraud score badge, distinct from the 9 detail gauges listed below.
- **D-08:** The garage dashboard (`renderDashboard()`) also shows a **consommables chip**, reusing the `alerteEntretienChip()` pattern (`app.html:805-811`, red/yellow badge) — consistent with `GAUGE-04`/`consommables_en_retard` already exposed backend-side (`Motos.list()`) since Phase 26.
- **D-09:** The client (`MotoKey_Client.html`) sees the **same granularity** as the garage: the 9 gauges per type + the general gauge, including reference/mount date when available.
- **D-10:** The client has an **"Ajouter une photo" button per gauge/consommable** — the CONSO-03 upload already exists backend-side and is already open to CLIENT role since Phase 25; this phase wires that button in the client web UI (not just passive display).
- **D-11:** The wording of the 4 states is **adapted for the general public on the client side**, different from the garage technical wording (`bon`/`moyen`/`usé`/`critique`). Direction confirmed, exact labels left to planning — illustrative example given: *Très bon état / À surveiller / À changer bientôt / À changer maintenant*. The underlying data contract (`etat` enum bon/moyen/usé/critique) does not change — only the displayed client-side label differs.

### Claude's Discretion

- **Migration of legacy Pneus data** (undiscussed zone, user satisfied with proposed approach): `pneu_av`/`pneu_ar` (free text) + `pneu_km_montage` (single value shared front/rear, never separate) migrate to 2 `consommables` rows (`type_consommable='pneu_av'` and `'pneu_ar'`), each with the same approximate `km_montage` (only data available) and `reference` = the existing free text. `date_montage` stays NULL (never historically stored). Migration as a versioned SQL script applied manually by Mehdi via Supabase Dashboard, like all previous milestone migrations.
- Exact wording of the 4 client-facing public labels (D-11) — direction locked, exact strings left to planning.
- Backend exposure detail (new dedicated endpoint `GET /motos/:id/consommables` vs enriching existing `GET /motos/:id`) — no pct_usure/etat data is currently exposed by any HTTP endpoint (only the `rappel_photo_en_retard` boolean exists since Phase 26). Implementation choice left to research/planning. **Research recommends the new dedicated endpoint — see Summary above and Architecture Patterns below.**
- Exact "maillon le plus faible" calculation mechanics (sort by `pct_usure` ascending vs most-severe `etat` on ties) — the RULE (never an average, exclude "Non renseigné") is locked (D-03); implementation detail left to planning. **Research resolves this: max(pct_usure) is sufficient and correct because `etat` is a monotonic function of `pct_usure` — see Summary.**

### Deferred Ideas (OUT OF SCOPE)

None — the discussion stayed within phase scope (gauges + legacy Pneus removal). Nothing was identified as a new out-of-scope capability during discussion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GAUGE-01 | Le garage et le client voient une jauge % par consommable pour chaque moto | New `GET /motos/:id/consommables` endpoint design (Architecture Patterns) resolves data sourcing (joins `consommables` + latest `photos_consommables.analyse_ia`); reusable CSS classes identified in both files (Code Examples) |
| GAUGE-02 | Le garage et le client voient une jauge générale égale au consommable en plus mauvais état (maillon le plus faible), jamais une moyenne | Algorithm resolved via `deriveEtat()` monotonicity proof (Summary + Architecture Patterns); D-03/D-04 edge cases documented |
| CONSO-04 | Les données pneu_av/pneu_ar/pneu_km_montage existantes sont migrées vers les nouvelles lignes consommables, puis la section Pneus legacy est retirée de la navigation garage et CLAUDE.md corrigé | Migration script shape provided (Code Examples), exact dead-code locations enumerated (Don't Hand-Roll / Common Pitfalls), CLAUDE.md correction target identified (lines 83-84) |
</phase_requirements>

## Standard Stack

No new libraries needed. This phase is 100% additive/subtractive work inside the existing hand-rolled stack:

| Layer | Tech | Version (verified in repo) | Notes |
|-------|------|---------|-------|
| Backend | Node.js `http` module (not Express, despite `express` in `package.json` deps) | — | `motokey-api.js` is a hand-rolled router (`match()`/`M()`), not using Express routing for these endpoints |
| DB access | `@supabase/supabase-js` | ^2.45.0 | `supabase.js` module, service-role key, RLS default-deny |
| Upload | `multer` | ^2.2.0 (pinned, never 1.x per Phase 25 decision — CVE) | Already wired for CONSO-03; memory storage, 5MB limit, JPEG/PNG/WebP only |
| Photo storage | Cloudinary | via `cloudinaryService.js` | Already wired; 503 `CLOUDINARY_NOT_CONFIGURED` if creds absent — **credentials still not provisioned in prod as of Phase 26 close (see Blockers)** |
| Frontend | Vanilla JS, template-literal HTML, no build step, no framework | — | Both `app.html` and `MotoKey_Client.html` are single-file, self-contained |

**No `npm install` needed for this phase.**

## Architecture Patterns

### Recommended Project Structure (no new files needed)
```
motokey-api.js          # add: GET /motos/:id/consommables handler
supabase.js              # add: helper to join consommables + latest photo per type (or inline in handler)
app.html                 # replace tabDefs 'pneus' entry with 'consommables'; new renderConsommables()/loadConsommables()
MotoKey_Client.html       # replace pneusHtml block in renderMotoCard() with jauges section; new uploadConsoPhoto()
sql/migrations/25_migrate_pneus_to_consommables.sql   # new migration (next available number after 24)
CLAUDE.md                # correct lines 83-84 (Pneus section)
```

### Pattern 1: New dedicated endpoint via `resolveMotoForCtx()` (recommended for backend exposure)

**What:** A new `GET /motos/:id/consommables` route, reusing the exact dual-role ownership resolver already established for CONSO-01/03/KM endpoints in `motokey-api.js`.

**Why this over enriching `GET /motos`/`GET /motos/:id`:** Those two routes have 4 distinct code paths (CLIENT-list raw select, CLIENT-getById raw select, GARAGE-list via `SBLayer.Motos.list()`, GARAGE-getById via `SBLayer.Motos.getById()`). Only the 2 GARAGE paths run through `SBLayer.Motos`, which is where GAUGE-04's enrichment lives. The 2 CLIENT paths (`motokey-api.js` ~893-905 and ~976-993) do `SBLayer.supabase.from('motos').select('*')` directly inline — enriching would mean editing and keeping in sync 4 separate spots across 2 files' worth of logic, doubling the risk of drift. A single new endpoint is one implementation, callable identically by both frontends.

**When to use:** Per-moto fetch, called from the garage fiche moto "Consommables" tab (`renderFicheTabContent()`, mirrors how `ficheTab === 'or'` calls `loadFicheORList(mo.id)`) and from the client's `loadMotos()` per-moto `Promise.all` (mirrors the existing `interventions`/`entretien/alertes` parallel fetch pattern already in `MotoKey_Client.html:714-726`).

**Example (backend handler, follows `handlePhotoConsommable`/CONSO-01 conventions exactly):**
```javascript
// Source: pattern derived from motokey-api.js:1098-1128 (CONSO-01) and
// resolveMotoForCtx() at motokey-api.js:432-447
if((p=M('GET','/motos/:id/consommables'))!==null){
  const a = authSilent(req);
  if (!a && !req.ctx) return fail(res,'Non authentifié',401,'UNAUTHORIZED');
  const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
  const r = await resolveMotoForCtx(ctx, p.id, a); // dual CLIENT/GARAGE, same 404 semantics
  if (!r) return fail(res,'Moto non trouvée',404,'NOT_FOUND');
  try {
    const rows = await buildConsommablesJauges(p.id, r.moto.km); // new helper, see below
    return ok(res, { consommables: rows.items, jauge_generale: rows.jaugeGenerale });
  } catch (e) { return fail(res, e.message, 500, 'SERVER_ERROR'); }
}
```

**Helper (supabase.js or inline), joins consommables + latest photo, mirrors `_consommablesEnRetardPourMoto` in `consommableRappelService.js:85-94`:**
```javascript
// Source: pattern derived from services/consommableRappelService.js:85-94
// and supabase.js Motos.getById() lines 311-319 (same lazy-fetch shape)
async function buildConsommablesJauges(moto_id, motoKm) {
  const consos = await Consommables.listByMoto(moto_id); // existing rows only
  const byType = {}; consos.forEach(c => byType[c.type_consommable] = c);

  const items = [];
  for (const type of TYPES_CONSOMMABLES) {
    const conso = byType[type] || null;
    let pct_usure = null, etat = null, has_data = false;
    if (conso) {
      const photos = await PhotosConsommables.listByConsommable(conso.id); // already sorted desc by created_at
      const latest = photos[0];
      if (latest && latest.analyse_ia) {
        pct_usure = latest.analyse_ia.pct_usure;
        etat = latest.analyse_ia.etat;
        has_data = true;
      }
    }
    items.push({
      type_consommable: type,
      km_montage: conso?.km_montage ?? null,
      date_montage: conso?.date_montage ?? null,
      reference: conso?.reference ?? null,
      pct_usure, etat, has_data
    });
  }

  // D-03: weakest link = max pct_usure among has_data items. deriveEtat() is
  // monotonic non-decreasing in pct_usure (services/visionAnalysisService.js
  // lines 65-70: <30 bon, 30-59 moyen, 60-84 usé, >=85 critique), so max
  // pct_usure automatically carries the most severe (or tied-most-severe) etat.
  // No separate etat-severity tie-break is needed.
  const withData = items.filter(i => i.has_data);
  const jaugeGenerale = withData.length
    ? withData.reduce((worst, i) => i.pct_usure > worst.pct_usure ? i : worst)
    : null; // D-04: null => frontend shows "Pas encore suivi"

  return { items, jaugeGenerale };
}
```

**Note on N+1 queries:** This helper does 1 `Consommables.listByMoto` query + up to 9 `PhotosConsommables.listByConsommable` queries per moto (one per existing consommable row, not per type — types with no row are skipped). This matches the existing cost profile of `Motos.getById()` (which already does the same N+1 shape for GAUGE-04, lines 311-319 of `supabase.js`) — acceptable since this is a per-moto detail fetch, not a list fetch. Do **not** replicate this shape inside `Motos.list()` (dashboard) — the dashboard chip (D-08) already gets what it needs cheaply from the existing `rappel_photo_en_retard`/`consommables_en_retard` fields.

### Pattern 2: Garage tab — replace, don't add, in `tabDefs`

**What:** `app.html:894-899` `tabDefs` array — replace the `{id:'pneus', label:'Pneus'}` entry with `{id:'consommables', label:'Consommables'}`, keep array position (2nd tab, same visual slot per D-05).

**Then in `renderFicheTabContent()` (`app.html:929-989`):** replace the `else if (ficheTab === 'pneus') { ...; loadPneus(mo.id); }` branch (lines 956-958) with a new `else if (ficheTab === 'consommables')` branch calling a new `loadConsommables(mo.id)`, following the exact same shell pattern as the existing branch (`c.innerHTML = '<div id="...Content"><div class="loading">Chargement…</div></div>'; loadX(mo.id);`).

### Pattern 3: Client card section — replace `pneusHtml`, follow `moto-section` convention

**What:** `MotoKey_Client.html:653-661` — the `pneusHtml` const is built **synchronously** from fields already present on the `moto` object (`moto.pneu_av`/`moto.pneu_ar`), because `loadMotos()` only fetches `/motos`, `/interventions`, `/entretien/alertes` per moto today (lines 714-726). Gauges require a **new async fetch** (`/motos/:id/consommables`) that doesn't exist in that `Promise.all` yet — add it there, mirroring the existing 2-endpoint parallel-fetch shape:
```javascript
// Source: pattern extends MotoKey_Client.html:714-726
const [ivRes, alRes, coRes] = await Promise.all([
  apiGet(`/motos/${moto.id}/interventions`, at),
  apiGet(`/motos/${moto.id}/entretien/alertes`, at),
  apiGet(`/motos/${moto.id}/consommables`, at)
]);
// ...
const consommables = coRes.ok ? (coRes.data.consommables || []) : [];
const jaugeGenerale = coRes.ok ? coRes.data.jauge_generale : null;
return { ...moto, interventions, alertes, consommables, jaugeGenerale };
```
Then `renderMotoCard(moto)` builds a new `jaugesHtml` block from `moto.consommables`/`moto.jaugeGenerale`, in a `moto-section` following the exact markup convention of the existing `planHtml` block (lines 634-651) — `.moto-section` > `.moto-section-title` > custom inner content — and replaces the `${planHtml}${pneusHtml}` line (687) with `${planHtml}${jaugesHtml}`.

### Anti-Patterns to Avoid
- **Don't compute `pct_usure`/`etat` from km-since-montage.** The existing legacy `loadPneus()` code (`app.html:1163-1182`) does exactly this (`kmParcourus >= 8000` heuristic) — this is precisely the "fausse précision" pattern the project already rejected (v1.6 Out of Scope: "Millimètre de précision... photo non calibrée"). The new gauges must read `pct_usure`/`etat` from `photos_consommables.analyse_ia` only, never derive from km deltas.
- **Don't add the N+1 `PhotosConsommables.listByConsommable` loop to `Motos.list()`.** That would run it once per moto on every dashboard load (potentially dozens of motos × up to 9 queries each). The dashboard chip (D-08) must stay on the cheap existing `rappel_photo_en_retard` boolean, not the full jauge detail.
- **Don't build the client-side Cloudinary-unsigned-upload pattern for D-10.** `MotoKey_Client.html` already has a client-side direct-to-Cloudinary upload for the ownership-claim carte grise photo (lines ~1194, using `CLOUDINARY_PRESET` unsigned preset + `POST /client/reclamations` with just the resulting URL). **Do not reuse this for consommable photos** — CONSO-03 (`POST /motos/:id/photos-consommables`) expects the raw image bytes via multipart directly to the API (server does the Cloudinary upload + triggers the stub analysis synchronously and returns `analyse`). Mixing the two patterns would upload the photo but skip the vision-stub analysis entirely.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| pct_usure/etat threshold logic | A new "usure" calculation in the frontend or a new backend service | `services/visionAnalysisService.js` `deriveEtat()` — already locked, already the source of the `etat` value stored on every `photos_consommables.analyse_ia` row | Contract explicitly locked "ne pas changer la FORME" — frontend must only read pre-computed values, never recompute |
| Weakest-link tie-break rules | A custom severity-ranking table (bon=1, moyen=2, usé=3, critique=4) plus a secondary pct_usure sort | Plain `max(pct_usure)` among consommables with data | `deriveEtat()` is monotonic — max pct_usure always has max-or-tied etat severity, extra ranking logic is redundant complexity |
| Multipart upload from client web | A generic upload library/dependency | Raw `fetch()` + `FormData`, omitting the `Content-Type` header (browser sets the multipart boundary automatically) | Matches the exact server-side contract already proven working for garage KM photo uploads (`app.html` doesn't have one yet either, but `motokey-api.js`'s `runMulter`/`_upload` expects a single `photo` field name — see Code Examples) |
| "Is this consommable in a bad state" for the dashboard chip | A fresh per-moto pct_usure computation reused from the new endpoint | The already-existing `mo.rappel_photo_en_retard`/`mo.consommables_en_retard` fields from `SBLayer.Motos.list()` (GAUGE-04, live since Phase 26) | Already computed at read-time for every garage dashboard load; reusing avoids a second, more expensive, per-moto N+1 query path on the list view |

**Key insight:** Every piece of "intelligence" this phase needs (usure %, état, retard, weakest-link ordering) is either already computed and stored (`analyse_ia` on photos) or trivially derivable from data already computed by earlier phases (`deriveEtat()` monotonicity). This phase should contain **zero new business logic of consequence** — only presentation + one join query + one migration script.

## Runtime State Inventory

> Included because CONSO-04 is a migration/removal requirement (legacy Pneus data + legacy nav section).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `motos.pneu_av` (TEXT), `motos.pneu_ar` (TEXT), `motos.pneu_km_montage` (INTEGER) — legacy columns on the `motos` table, `schema.sql:253-255`. Prod has live data in these columns (used today by `loadPneus()`/dashboard is not affected, but any moto with pneus data set will have these populated). | **Data migration**: INSERT/UPSERT into `consommables` (2 rows per moto with data, `type_consommable IN ('pneu_av','pneu_ar')`) via a new versioned SQL script. See Code Examples. Columns themselves: recommend **leaving in place** (not dropping) this phase — see Open Questions. |
| Live service config | None — no external service (n8n, Datadog, etc.) references "pneus" by name. Confirmed: no Cloudinary folder, no cron job, no Railway env var references "pneu". | None |
| OS-registered state | None — no Task Scheduler/pm2/systemd unit involved in this UI-only phase. | None |
| Secrets/env vars | None — no secret or env var name references "pneu"/"consommable". | None |
| Build artifacts / installed packages | None — no compiled artifact or installed package embeds the string "pneus". `app.html`/`MotoKey_Client.html` are served directly from disk (`getAppHTML()`/`getClientHTML()`), no build step, no bundler cache to invalidate. | None |

**Canonical question answered:** After all files in the repo are updated (tab removed, routes removed, `CLAUDE.md` corrected), the only runtime state still referencing "pneus" is the 3 legacy DB columns on `motos` (`pneu_av`/`pneu_ar`/`pneu_km_montage`) and any historical rows in `motos_proprietaires_historique`/other tables that never referenced pneus in the first place (checked — they don't). The columns are pure data, not live-service config, so a straightforward one-time copy-forward SQL script resolves them; no re-registration or credential rotation is needed anywhere.

### Dead code to remove (verified by direct grep, exact locations)

| Location | What | Why removable |
|----------|------|----------------|
| `app.html:894-899` `tabDefs` array | `{id:'pneus', label:'Pneus'}` entry | Replaced by `{id:'consommables', label:'Consommables'}` per D-05 |
| `app.html:956-958` in `renderFicheTabContent()` | `else if (ficheTab === 'pneus') { ...; loadPneus(mo.id); }` | Replaced by new `consommables` branch |
| `app.html:1148-1182` | `renderPneus()`, `changerMotoPneus()`, `loadPneus()` (3 functions, ~35 lines) | **Orphaned even today** — no `nav-btn` in the top bar (`app.html:258-263`) calls `nav('pneus')`; only reachable via the fiche-moto tab which is being replaced. Confirmed via grep: no `onclick="nav('pneus'...)"` anywhere in the file. |
| `app.html:749` in `nav()` router | `else if (section === 'pneus') renderPneus();` | Dead branch, same reason as above |
| `app.html:837` in `highlightNav()` | `pneus:'Pneus'` entry in the `labels` map | Dead entry, same reason |
| `MotoKey_Client.html:653-661` in `renderMotoCard()` | `pneusHtml` const block | Replaced by jauges section |
| `CLAUDE.md:83-84` | "### Pneus" section claiming `renderPneus()` "a été supprimée" | **Currently false** (the function exists until this phase removes it) — must be corrected to reflect the new Consommables tab, only after the removal actually lands |

## Common Pitfalls

### Pitfall 1: Confusing `consommables` row existence with having usable jauge data
**What goes wrong:** Treating "a `consommables` row exists" as "there's a % to show." CONSO-03's auto-creation (`motokey-api.js:564-565`, D-05 of Phase 25) creates a bare `consommables` row (no `km_montage`) the moment a photo is uploaded, *before* the analysis result is known to the row itself (the analysis lives on the `photos_consommables` row, not back-written to `consommables`).
**Why it happens:** It's tempting to gate the "Non renseigné" badge on `consommable === null`, which would wrongly show a % for a row that exists but has no photo yet (garage manually saved `km_montage`/`reference` via CONSO-01 with no photo).
**How to avoid:** Gate strictly on `has_data` (i.e., a photo with `analyse_ia` exists), never on row existence — this is exactly what D-01/D-02 lock ("aucune distinction... même badge dans les deux cas").
**Warning signs:** A gauge showing 0% instead of "Non renseigné" for a freshly-migrated `pneu_av`/`pneu_ar` row (which has `km_montage`/`reference` from the migration but no photo — this is the expected steady-state for every migrated moto until someone uploads a photo).

### Pitfall 2: No garage-side data-entry UI exists for CONSO-01 today
**What goes wrong:** Assuming the garage "Consommables" tab can rely on mécanos having already entered `km_montage`/`date_montage`/`reference` via some existing form. **No such form exists anywhere in `app.html`** — CONSO-01's `PATCH /motos/:id/consommables/:type` and `POST /motos/:id/consommables` endpoints (Phase 25) have **zero frontend consumers** today (confirmed via grep: no reference to `/consommables` in `app.html`).
**Why it happens:** CONSO-01 was marked "Complete" in `REQUIREMENTS.md` because the *backend* endpoint was delivered in Phase 25 — but delivering the endpoint isn't the same as delivering a UI for mécanos to use it.
**How to avoid:** This phase's locked scope (per CONTEXT.md Phase Boundary: "uniquement l'affichage web des données déjà produites") does not explicitly ask for a garage-side data-entry form — the garage tab can legitimately be **read-only display**. But flag this clearly to the planner: **after this phase ships, most non-pneu consommables (chaîne, plaquettes, disques, huile, liquide de frein) will show "Non renseigné" indefinitely** unless a client uploads a photo (D-10 covers client-only) or a future phase adds garage-side saisie UI. This is a real product gap worth surfacing, not silently working around by inventing new scope.
**Warning signs:** Demo/QA against a real moto shows only `pneu_av`/`pneu_ar` populated (from migration) and all 7 other types stuck on "Non renseigné" — this is expected, not a bug, given current scope.

### Pitfall 3: `resolveMotoForCtx()` 404 semantics must be preserved for the new endpoint
**What goes wrong:** Returning a different error shape/status for "moto not found" vs "moto not owned by this client/garage" would leak existence information (an enumeration vector) — the codebase deliberately unifies both into a single 404 (`motokey-api.js:432` comment: "Même sémantique 404 que le pattern inline (ne fuit pas l'existence)").
**How to avoid:** The new `GET /motos/:id/consommables` handler must call `resolveMotoForCtx()` exactly like CONSO-01/03 and return the same generic `fail(res,'Moto non trouvée',404,'NOT_FOUND')` on `null`.

### Pitfall 4: The multipart-before-`body()` interception list must include the new upload route if garage-side upload is ever added
**What goes wrong:** All multipart routes in `motokey-api.js` are intercepted **before** the generic `body()` call (lines 721-736), because `body()` coerces the raw request buffer to a string then `JSON.parse`s it — lossy and would corrupt multipart bytes. CONSO-03's route (`/motos/:id/photos-consommables`) is already in that interception list — no change needed there since D-10 reuses the existing endpoint. But if a garage-side "upload photo" affordance is ever added inside the new Consommables tab (not currently in scope per D-10 wording), it would call the *same* existing endpoint, so no new interception entry is needed either way.
**How to avoid:** N/A for this phase if scope stays as locked (client-only upload button) — flagged for awareness only.

### Pitfall 5: `deriveAnalyseStatus` — `analyse_status: 'incertain'` photos still carry a usable `pct_usure`
**What goes wrong:** Assuming `analyse_status === 'incertain'` means the photo has no usable data and should be treated like "Non renseigné."
**Why it happens:** The stub can return `analyse_status: 'incertain'` (confiance < 50) while still returning a fully-formed `pct_usure`/`etat` (`buildStubAnalysis()`, `services/visionAnalysisService.js:107-134` — `analyse_status` and `pct_usure` are independent outputs, not gated on each other).
**How to avoid:** Gauges should display `pct_usure`/`etat` regardless of `analyse_status` (CONTEXT.md's D-01/D-02 don't mention a 3rd "incertain but has data" visual state — treat `analyse_status` as informational only, not a gate on data availability, unless planning decides otherwise). Flag as open question if planner wants a subtler "low confidence" indicator — not required by locked decisions.

## Code Examples

### Migration script shape (new `sql/migrations/25_migrate_pneus_to_consommables.sql`)
```sql
-- Migration 25 : Copie pneu_av/pneu_ar/pneu_km_montage (legacy motos.*) vers
-- des lignes consommables (CONSO-04). Idempotent (ON CONFLICT DO UPDATE) —
-- rejouable sans effet de bord si déjà appliquée.
-- À appliquer manuellement via Supabase Dashboard > SQL Editor.

INSERT INTO consommables (moto_id, type_consommable, km_montage, reference)
SELECT id, 'pneu_av', pneu_km_montage, pneu_av
FROM motos
WHERE pneu_av IS NOT NULL AND btrim(pneu_av) <> ''
ON CONFLICT (moto_id, type_consommable) DO UPDATE
  SET km_montage = EXCLUDED.km_montage,
      reference   = EXCLUDED.reference,
      updated_at  = NOW();

INSERT INTO consommables (moto_id, type_consommable, km_montage, reference)
SELECT id, 'pneu_ar', pneu_km_montage, pneu_ar
FROM motos
WHERE pneu_ar IS NOT NULL AND btrim(pneu_ar) <> ''
ON CONFLICT (moto_id, type_consommable) DO UPDATE
  SET km_montage = EXCLUDED.km_montage,
      reference   = EXCLUDED.reference,
      updated_at  = NOW();

-- date_montage volontairement NON renseigné (jamais stocké historiquement, Claude's
-- Discretion note du CONTEXT.md) — reste NULL, cohérent avec D-01/D-02 (une ligne
-- avec km_montage mais sans photo affiche "Non renseigné" côté jauge, pas un état trompeur).

-- pneu_av/pneu_ar/pneu_km_montage sur `motos` sont volontairement CONSERVÉS (non DROPpés)
-- par cette migration — voir RESEARCH.md Open Questions. Un futur nettoyage schema
-- (DROP COLUMN) peut suivre une fois la migration validée en prod par Mehdi.
```

### Multipart upload helper — new pattern for `MotoKey_Client.html` (D-10)
```javascript
// Source: pattern derived from motokey-api.js:536-578 (handlePhotoConsommable contract) —
// field name MUST be "photo" (multer.single('photo'), motokey-api.js:426), and
// "type_consommable" must be a form field, not JSON (req.body.type_consommable, line 547).
// No existing helper in either app.html or MotoKey_Client.html does this today — apiFetch()
// (MotoKey_Client.html:484-499) and api() (app.html:346-357) both hard-set
// 'Content-Type: application/json' and JSON.stringify the body, incompatible with multipart.
async function uploadConsoPhoto(motoId, typeConsommable, file, token) {
  const fd = new FormData();
  fd.append('photo', file);
  fd.append('type_consommable', typeConsommable);
  const res = await fetch(API_BASE + '/motos/' + motoId + '/photos-consommables', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }, // NO Content-Type — browser sets multipart boundary
    body: fd
  });
  let data; try { data = await res.json(); } catch { data = {}; }
  return { ok: res.ok, status: res.status, data };
}
```

### Gauge bar markup (reuses existing CSS, no new classes needed)
```javascript
// Garage side (app.html) — reuses .score-badge/.score-vert etc. (app.html:70-74)
function jaugeBar(item) {
  if (!item.has_data) {
    return `<div class="pneu-stat"><span class="pneu-label">${LABELS_FR[item.type_consommable]}</span><span class="badge badge-jaune" style="opacity:.6">Non renseigné</span></div>`;
  }
  const cls = {bon:'score-vert', moyen:'score-bleu', 'usé':'score-jaune', critique:'score-rouge'}[item.etat] || 'score-bleu';
  return `<div class="pneu-stat">
    <span class="pneu-label">${LABELS_FR[item.type_consommable]}</span>
    <div style="flex:1;margin:0 12px;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
      <div style="width:${item.pct_usure}%;height:100%;background:currentColor" class="${cls}"></div>
    </div>
    <span class="score-badge ${cls}">${item.pct_usure}% · ${item.etat}</span>
  </div>`;
}
```

## State of the Art

Not applicable in the traditional sense (no external ecosystem to track) — but worth noting internally:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Pneus usure estimated from km-since-montage (`kmParcourus >= 8000` heuristic, `app.html:1171`) | Usure from stub/future-real vision analysis (`pct_usure`/`etat` on `photos_consommables.analyse_ia`) | Phase 24 (vision contract), consumed starting Phase 27 | The km-heuristic is now provably inferior (it was exactly the "fausse précision" the project rejected) — must not be ported forward into the new gauges, even as a fallback |
| Single pneus tab, single moto-wide value | 9-type granular consommables model, per-type gauges + weakest-link summary | Schema since Phase 23, UI catches up in Phase 27 | Every future consumable-related feature (mobile Phase 28) reads this same shape |

## Open Questions

1. **Should `motos.pneu_av`/`pneu_ar`/`pneu_km_montage` columns be dropped from the schema in this phase, or just left unused?**
   - What we know: CONTEXT.md's locked language is "la section Pneus legacy n'apparaît plus dans la navigation garage" and "migrées PUIS retirées" — the "retirées" explicitly refers to the nav section in the surrounding sentence (STATE.md line 75), not explicitly to the DB columns. `supabase.js:399`'s comment ("pneu_* restent (retrait = Phase 27)") suggests intent to eventually retire them from the app layer, but is ambiguous on DB-level DROP COLUMN.
   - What's unclear: Whether "retrait" was meant to include a schema-level DROP COLUMN this phase, or just app-layer cleanup (removing them from `Motos.update()`'s `allowed` array at `supabase.js:399`, and no longer writing/reading them anywhere in the UI).
   - Recommendation: **Do not DROP COLUMN this phase.** Leave the 3 legacy columns in place (unused, harmless) as a safety net until Mehdi has confirmed the migration copied data correctly in prod — matches the project's demonstrated caution pattern around schema changes (v1.5 schema-drift lessons, STATE.md "toute nouvelle migration doit... schema.sql mis à jour dans la même phase, vérifié via bootstrap script"). Do remove `pneu_av`/`pneu_ar`/`pneu_km_montage` from `Motos.update()`'s `allowed` list in `supabase.js:399` (nothing should write to them post-migration) and update the inline comment. Suggest a follow-up cleanup phase/plan for the actual `DROP COLUMN` once Mehdi confirms.

2. **Should the garage "Consommables" tab include any data-entry affordance (CONSO-01 UI), or stay purely read-only?**
   - What we know: CONTEXT.md's Phase Boundary explicitly scopes this phase to "affichage web des données déjà produites par les Phases 23-26" and D-10 explicitly scopes the "Ajouter une photo" button to the client only.
   - What's unclear: Whether Mehdi is aware that, absent any garage-side entry form, most non-pneu consommables will show "Non renseigné" indefinitely for garage-only (non-client-linked) motos (`proprietaire_type IN ('garage','inconnu')` — these never get a client to upload a photo, and GAUGE-04's badge already flags this exact population as "at risk of no photo ever").
   - Recommendation: Build the tab read-only per locked scope; surface this gap explicitly in the phase's SUMMARY/handoff to Mehdi rather than silently expanding scope. If Mehdi wants garage saisie in-phase, it's a small additive task (reuse CONSO-01 endpoint, add a simple form) — but it's not currently locked.

3. **Exact client-facing wording (D-11)?**
   - What we know: Direction locked (grand-public, distinct from garage technical wording), illustrative example given.
   - What's unclear: Final 4 strings.
   - Recommendation: Lock in planning using the given example as the default unless Mehdi objects: *Très bon état / À surveiller / À changer bientôt / À changer maintenant* (maps bon/moyen/usé/critique respectively). "Non renseigné" and "Pas encore suivi" (D-01/D-04) are already French and public-friendly as-is, reusable verbatim on both garage and client sides.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend runtime | ✓ (per `package.json` engines) | ≥20 | — |
| Supabase (prod) | All DB reads for gauges | ✓ (confirmed live in STATE.md, migrations 10-24 applied) | — | — |
| Cloudinary credentials | CONSO-03 photo upload (D-10 button) | **✗ still not provisioned as of Phase 26 close** (STATE.md Blockers: `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` absent in Railway `motokey1.1` env) | — | Upload button will show the existing 503 `CLOUDINARY_NOT_CONFIGURED` error (D-02 of Phase 25 — intentional, never a placeholder). This does not block *building* the UI, only real end-to-end photo upload testing in prod until Mehdi provisions the 3 env vars. |
| `zxing` (barcode scanner) | Unrelated (OR pieces picker, Phase L3c-b) | ✓ | 0.21.3 | N/A — not used by this phase |

**Missing dependencies with no fallback:** None blocking phase implementation.

**Missing dependencies with fallback:** Cloudinary credentials — D-10's upload button can be fully built and will correctly surface the existing 503 error path; real photo upload end-to-end testing in prod is blocked until Mehdi provisions credentials (pre-existing blocker from Phase 25/26, not new to this phase).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (no jest/mocha/vitest) — hand-rolled Node scripts with `assert(caseName, label, condition, detail)` PASS/FAIL counters, `--case=` CLI flag convention |
| Config file | none — see Wave 0 |
| Quick run command | `node scripts/test-consommables-crud.js --case=structure` (static analysis, no DB) — pattern to follow for new script |
| Full suite command | `node scripts/test-consommables-crud.js` (runs all cases) equivalent new script for this phase |

Precedent scripts to model the new test script on: `scripts/test-consommables-crud.js` (structure + live pg-direct cases), `tests/test-consommable-rappel-cron.js`, `tests/test-km-photos-cloudinary.js` (live REST-endpoint assertions against a running server + real/fresh Supabase). Given this phase is almost entirely frontend, **most verification will be structural (grep-based: dead code actually removed, new endpoint present, tab wired) plus one live endpoint check** for `GET /motos/:id/consommables`, rather than exhaustive live E2E — consistent with how Phase 23 KM-04 was verified (STATE.md: "vérifié par analyse statique... pas par un test d'intégration live").

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| GAUGE-01 | `GET /motos/:id/consommables` returns all 9 types with correct shape | live (against FRESH_DB_URL/prod REST, dual CLIENT+GARAGE) | `node scripts/test-consommables-jauges.js --case=endpoint-shape` | ❌ Wave 0 |
| GAUGE-01 | Garage tab / client card render gauges from the endpoint (no km-heuristic left) | structural (grep) | `node scripts/test-consommables-jauges.js --case=frontend-structure` | ❌ Wave 0 |
| GAUGE-02 | Weakest-link = max pct_usure among has_data, excludes Non renseigné, null when none | unit-style (pure function, no DB) | `node scripts/test-consommables-jauges.js --case=jauge-generale-logic` | ❌ Wave 0 |
| CONSO-04 | Migration script copies pneu_av/pneu_ar/pneu_km_montage correctly, idempotent | live pg-direct against FRESH_DB_URL (never prod directly, per project convention) | `node scripts/test-consommables-jauges.js --case=migration` | ❌ Wave 0 |
| CONSO-04 | Legacy Pneus tab/routes/functions fully removed | structural (grep for `renderPneus`, `'pneus'`, dead nav entries) | `node scripts/test-consommables-jauges.js --case=dead-code-removed` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** relevant `--case=` subset (structure/static checks are free, fast)
- **Per wave merge:** full new test script + a manual smoke check of both `app.html` and `MotoKey_Client.html` in a browser against a running local server (no headless browser test infra in this repo — manual visual check is the existing convention for frontend, confirmed by absence of any Playwright/Puppeteer dependency in `package.json`)
- **Phase gate:** Full new script green + `CLAUDE.md` correction diffed against actual code state before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/test-consommables-jauges.js` — new script covering GAUGE-01/GAUGE-02/CONSO-04 per the table above, modeled on `scripts/test-consommables-crud.js`'s `--case=` convention
- [ ] No shared fixtures needed beyond what `scripts/test-consommables-crud.js` and `scripts/test-releves-km-trigger.js` already establish (moto with `proprietaire_type='garage'`, since RLS/CHECK constraints require it per STATE.md Phase 23 learnings)
- [ ] Framework install: none — no new dependency

## Sources

### Primary (HIGH confidence — direct code read, this session)
- `C:\motokey-api\app.html` (lines 71-74, 740-1182, 258-263, 894-989) — CSS classes, nav router, tabDefs, renderFiche/renderFicheTabContent, dead Pneus code, `api()` helper
- `C:\motokey-api\MotoKey_Client.html` (lines 1-140, 441-729, 1163-1218) — CSS classes, `renderMotoCard()`, `loadMotos()`, `apiFetch()`, existing client-side Cloudinary-unsigned upload pattern (claim flow)
- `C:\motokey-api\supabase.js` (lines 235-427, 1374-1453) — `Motos.list()`/`getById()` GAUGE-04 enrichment pattern, `Consommables`/`PhotosConsommables` CRUD, `TYPES_CONSOMMABLES`
- `C:\motokey-api\motokey-api.js` (lines 400-580, 886-1128) — `resolveMotoForCtx()`, `handlePhotoConsommable()` (CONSO-03), CONSO-01 endpoints, `GET /motos`/`GET /motos/:id` (all 4 code paths), multipart interception list
- `C:\motokey-api\services\visionAnalysisService.js` (full file) — locked contract, `deriveEtat()`/`deriveAnalyseStatus()` monotonicity
- `C:\motokey-api\services\consommableRappelService.js` (full file) — `isConsommableEnRetard()`, `SEUILS`/`LABELS`, N+1 join pattern precedent
- `C:\motokey-api\schema.sql` (lines 220-270, 555-620, 815-864) — `motos`/`consommables`/`photos_consommables` table definitions, RLS default-deny confirmation
- `C:\motokey-api\sql\migrations\24_consommables_rappel_state.sql` — migration file header/style convention to follow
- `C:\motokey-api\CLAUDE.md` (lines 83-84) — the exact stale documentation to correct
- `C:\motokey-api\.planning\phases\27-...\27-CONTEXT.md`, `.planning\REQUIREMENTS.md`, `.planning\STATE.md` — locked decisions, requirement text, project history/blockers
- `C:\motokey-api\package.json`, `C:\motokey-api\scripts\test-consommables-crud.js`, `tests/` directory listing — test framework/convention confirmation

### Secondary (MEDIUM confidence)
None used — no external web research was needed for this phase (purely internal codebase research).

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no external library needed, entirely verified against actual `package.json`/code
- Architecture: HIGH — endpoint design directly derived from an already-proven pattern (`resolveMotoForCtx`) used 3x in the codebase already
- Pitfalls: HIGH — all 5 pitfalls are grounded in specific line-numbered code reads, not speculation
- Migration script: MEDIUM-HIGH — shape follows exact precedent (`24_consommables_rappel_state.sql`) but has not been executed/tested this session (per project convention, migrations are written then manually applied/tested by Mehdi via Supabase Dashboard)

**Research date:** 2026-07-15
**Valid until:** Stable — this is internal-codebase research, not dependent on external library churn. Re-verify only if Phase 25/26 code changes before Phase 27 planning starts (unlikely, both are marked Complete).
