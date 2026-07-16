---
phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy
verified: 2026-07-16T00:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 27: UI Web Garage + Client (jauges, retrait Pneus legacy) Verification Report

**Phase Goal:** Le garage et le client voient l'état d'usure de chaque consommable et l'état général de la moto (maillon le plus faible), et la section Pneus historique n'existe plus en doublon contradictoire.
**Verified:** 2026-07-16
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Le garage voit, sur la fiche moto dans `app.html`, une jauge % par consommable (9 types) | ✓ VERIFIED | `app.html:1056` `loadConsommables()` fetches `api('/motos/'+id+'/consommables')`; `renderConsommables()`/`jaugeBarConso()` render 9-item list from `LABELS_CONSO` (9 keys); tab `{id:'consommables', label:'Consommables'}` replaces old `pneus` slot |
| 2 | Le client voit, dans `MotoKey_Client.html`, la même jauge % par consommable | ✓ VERIFIED | `MotoKey_Client.html:782` adds `apiGet(\`/motos/${moto.id}/consommables\`, at)` to the per-moto `Promise.all`; `jaugesSectionClient()`/`jaugeRowClient()` (lines 621-648) render 9 items with `CONSO_LABELS_CLIENT`; called via `${jaugesSectionClient(moto)}` at line 751 |
| 3 | Le garage et le client voient une jauge générale = maillon le plus faible, jamais une moyenne | ✓ VERIFIED | `services/jaugeConsommables.js` `computeJaugeGenerale()` uses `reduce` to find max `pct_usure` among `has_data` items (no averaging); unit-verified by `node scripts/test-consommables-jauges.js --case=jauge-generale-logic` — 4/4 PASS, explicitly asserting pneu_av(70) wins over average(45) and worst `etat` is returned |
| 4 | Les données `pneu_av`/`pneu_ar`/`pneu_km_montage` migrées vers `consommables`, section Pneus legacy retirée de la nav garage | ✓ VERIFIED | `sql/migrations/25_migrate_pneus_to_consommables.sql` exists, idempotent (`ON CONFLICT (moto_id, type_consommable) DO UPDATE`), no `DROP COLUMN`; `app.html` contains zero occurrences of `renderPneus`, `loadPneus`, `changerMotoPneus`, `section === 'pneus'`, `pneus:'Pneus'`, `id:'pneus'`; `supabase.js:399` `Motos.update` allow-list trimmed to `['couleur','photo_url']` (no more `pneu_*` writes) |
| 5 | `CLAUDE.md` corrigé, plus de contradiction doc/code | ✓ VERIFIED | `CLAUDE.md:83-87` now reads "### Pneus (retiré en Phase 27, remplacé par Consommables)" and describes the new Consommables tab backed by `GET /motos/:id/consommables` — matches shipped code |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/test-consommables-jauges.js` | Wave 0 test harness, 5 cases | ✓ VERIFIED | Exists, `node --check` passes, all 5 case names present |
| `services/jaugeConsommables.js` | Pure `computeJaugeGenerale` + async `buildConsommablesJauges` | ✓ VERIFIED | Exists, both exported, lazy `require('../supabase')` inside async fn (no import cycle) |
| `sql/migrations/25_migrate_pneus_to_consommables.sql` | Idempotent forward-copy, no DROP COLUMN | ✓ VERIFIED | Content matches spec exactly, both pneu_av/pneu_ar inserts present |
| `motokey-api.js` | `GET /motos/:id/consommables` route | ✓ VERIFIED | Route at line 1132, calls `buildConsommablesJauges`, returns `{consommables, jauge_generale}` |
| `app.html` | Consommables tab + gauges, dead Pneus code removed | ✓ VERIFIED | `loadConsommables`/`renderConsommables`/`jaugeBarConso`/`consoChip` present; legacy Pneus identifiers absent |
| `CLAUDE.md` | Corrected Pneus/Consommables documentation | ✓ VERIFIED | Section rewritten, contains `Consommables`, no longer falsely claims removal happened pre-Phase-27 |
| `MotoKey_Client.html` | Client gauge section + multipart upload, `pneusHtml` removed | ✓ VERIFIED | `jaugesSectionClient`, `jaugeRowClient`, `uploadConsoPhoto`, `triggerConsoPhoto` all present; `pneusHtml` absent |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `scripts/test-consommables-jauges.js` | `services/jaugeConsommables.js` | require of computeJaugeGenerale | ✓ WIRED | gsd-tools auto-verified |
| `motokey-api.js` | `services/jaugeConsommables.js` | `buildConsommablesJauges` call in GET handler | ✓ WIRED | gsd-tools auto-verified; confirmed at motokey-api.js:1139 |
| `services/jaugeConsommables.js` | `supabase.js` | lazy require of `Consommables`/`PhotosConsommables` | ✓ WIRED | gsd-tools auto-verified |
| `motokey-api.js` | `resolveMotoForCtx` | dual CLIENT/GARAGE ownership resolution | ✓ WIRED | gsd-tools auto-verified |
| `app.html loadConsommables` | `/motos/:id/consommables` | `api()` fetch | ✓ WIRED | gsd-tools reported "Source file not found" (tool parsing artifact — the `from` field embeds a function name, not a bare path); manually confirmed via grep at app.html:1060 `api('/motos/'+id+'/consommables')` |
| `app.html renderDashboard` | `mo.consommables_en_retard` | consommables chip | ✓ WIRED | gsd-tools tool-parsing false negative (same cause); manually confirmed `consoChip(mo)` called at app.html:791, reads `mo.consommables_en_retard`/`mo.rappel_photo_en_retard` at line 813 |
| `MotoKey_Client.html loadMotos` | `/motos/:id/consommables` | added to parallel fetch | ✓ WIRED | gsd-tools tool-parsing false negative; manually confirmed `apiGet(\`/motos/${moto.id}/consommables\`, at)` at MotoKey_Client.html:782 |
| `MotoKey_Client.html uploadConsoPhoto` | `/motos/:id/photos-consommables` | multipart FormData POST | ✓ WIRED | gsd-tools tool-parsing false negative; manually confirmed `fetch(API_BASE + '/motos/' + motoId + '/photos-consommables', ...)` at MotoKey_Client.html:653 |

Note: The gsd-tools `verify key-links` command reported "Source file not found" for all four 27-03/27-04 links. This is a tool limitation — the plan frontmatter's `from:` field for these links embeds a function name after the file path (e.g. `"app.html loadConsommables"`) rather than a bare path, which the tool's file-existence check cannot parse. All four links were independently confirmed via direct grep against the actual files above (real files exist, patterns present) — not a genuine gap.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `app.html renderConsommables` | `data.consommables` / `data.jauge_generale` | `GET /motos/:id/consommables` → `jaugeConsommables.buildConsommablesJauges(p.id)` → `Consommables.listByMoto` + `PhotosConsommables.listByConsommable` (real Supabase queries, no static return) | Yes (query-backed; empty until photos are analysed, which is correct `has_data:false` semantics, not a stub) | ✓ FLOWING |
| `MotoKey_Client.html jaugesSectionClient` | `moto.consommables` / `moto.jaugeGenerale` | Same endpoint, consumed via `apiGet` in `loadMotos()` parallel fetch, destructured from `coRes.data` | Yes | ✓ FLOWING |
| `app.html consoChip` | `mo.consommables_en_retard` / `mo.rappel_photo_en_retard` | Pre-existing GAUGE-04 fields exposed on `GET /motos` list items since Phase 26 — not re-derived, correctly reused, no N+1 fetch | Yes | ✓ FLOWING |

Note: end-to-end `has_data:true` gauge values require (a) migration 25 applied manually in prod (pending, per project convention — Mehdi applies via Supabase Dashboard) and (b) Cloudinary credentials provisioned in Railway (pre-existing blocker since Phase 25, unrelated to Phase 27 code). Until then, gauges correctly render `has_data:false` / "Non renseigné" / "Pas encore suivi" rather than fabricated values — this is the designed null-safe behavior (D-04), not a defect.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Pure weakest-link algorithm correctness | `node scripts/test-consommables-jauges.js --case=jauge-generale-logic` | 4/4 PASS | ✓ PASS |
| Endpoint route registration + resolveMotoForCtx wiring | `node scripts/test-consommables-jauges.js --case=endpoint-shape` | 2/2 structural PASS; live sub-check SKIP (no `JAUGES_TEST_*` env vars — requires running server) | ✓ PASS (structural) / ? SKIP (live) |
| Frontend structural assertions (both HTML files) | `node scripts/test-consommables-jauges.js --case=frontend-structure` | 7/7 PASS | ✓ PASS |
| Legacy Pneus dead-code removal + CLAUDE.md correction | `node scripts/test-consommables-jauges.js --case=dead-code-removed` | 6/6 PASS | ✓ PASS |
| Migration 25 idempotency against live throwaway DB | `node scripts/test-consommables-jauges.js --case=migration` | Crashes with `Cannot find module 'pg'` (local `.env` has `FRESH_DB_URL` set, but `pg` package is not installed anywhere in the repo — `node_modules/pg` absent, not in `package.json`) | ✗ FAIL (environmental, pre-existing) |

`node --check` passes clean on `motokey-api.js`, `supabase.js`, `services/jaugeConsommables.js`.

**On the `migration` case failure:** This is NOT a Phase 27 regression. `require('pg')` at line 122 of the pre-existing `scripts/test-consommables-crud.js` (unrelated to this phase, shipped before Phase 27) fails identically (`node scripts/test-consommables-crud.js --case=upsert-behavior` → same `Cannot find module 'pg'`). The `pg` npm package has never been added to this repo's dependencies; the live-DB test convention assumes it is installed ad hoc when someone actually runs a live migration check. The migration SQL itself (`sql/migrations/25_migrate_pneus_to_consommables.sql`) was manually reviewed and is idempotent, correct, and matches spec (both `pneu_av`/`pneu_ar` inserts with `ON CONFLICT DO UPDATE`, no `DROP COLUMN`). This does not block the phase goal — migration is applied manually by Mehdi via Supabase Dashboard per project convention, not by this test script.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| GAUGE-01 | 27-01, 27-02, 27-03, 27-04 | Le garage et le client voient une jauge % par consommable pour chaque moto | ✓ SATISFIED | `app.html` Consommables tab + `MotoKey_Client.html` jauges section, both fed by `GET /motos/:id/consommables` |
| GAUGE-02 | 27-01, 27-02, 27-03, 27-04 | Jauge générale = maillon le plus faible, jamais une moyenne | ✓ SATISFIED | `computeJaugeGenerale` max-reduce, unit-tested 4/4 |
| CONSO-04 | 27-01, 27-02, 27-03, 27-04 | Migration pneus→consommables + retrait section Pneus legacy + CLAUDE.md corrigé | ✓ SATISFIED | Migration 25 exists+idempotent, all legacy Pneus code removed from `app.html`, CLAUDE.md corrected |

REQUIREMENTS.md maps all three IDs to Phase 27 with status "Complete" — no orphaned requirements found (all 3 IDs declared consistently across all 4 plan frontmatters and REQUIREMENTS.md).

### Anti-Patterns Found

No blockers or warnings found. Scanned `services/jaugeConsommables.js`, the new `app.html` functions (`loadConsommables`, `renderConsommables`, `jaugeBarConso`, `consoChip`), and the new `MotoKey_Client.html` functions (`jaugesSectionClient`, `jaugeRowClient`, `uploadConsoPhoto`, `triggerConsoPhoto`) for TODO/FIXME/placeholder/empty-return patterns — none found. All `has_data:false` / empty-state branches are intentional, spec'd null-safe states (D-04), not stubs — confirmed they are reached only when no analysed photo exists, and are overwritten correctly once real data flows in.

### Human Verification Required

### 1. Visual rendering of gauges on a real moto fiche (garage)

**Test:** Open `app.html` against a running local/staging server, navigate to a moto fiche, open the Consommables tab.
**Expected:** 9 gauge bars render with correct colors (score-vert/bleu/jaune/rouge) matching `etat`; the general gauge badge at top shows the weakest-link item; motos with zero data show "Pas encore suivi".
**Why human:** Visual layout/CSS rendering and color-contrast cannot be verified via grep.

### 2. Visual rendering of gauges on the client moto card

**Test:** Open `MotoKey_Client.html`, view a moto card.
**Expected:** Gauges section shows public wording (Très bon état / À surveiller / À changer bientôt / À changer maintenant), "Ajouter une photo" button opens a native file picker.
**Why human:** Visual/UX verification, file picker interaction.

### 3. Dashboard consommables chip

**Test:** View the garage dashboard with a moto flagged `consommables_en_retard` or `rappel_photo_en_retard`.
**Expected:** "📸 Photo consommable à faire" chip appears next to the existing alerte entretien chip.
**Why human:** Requires a live moto row with the flag set (not present in a static code check).

### 4. End-to-end photo upload flow

**Test:** Click "Ajouter une photo" on a consommable, select an image.
**Expected:** Multipart POST to `/motos/:id/photos-consommables`; currently expected to 503 gracefully (`CLOUDINARY_NOT_CONFIGURED`) until Mehdi provisions Cloudinary creds in Railway — pre-existing blocker since Phase 25, not a Phase 27 defect.
**Why human:** Requires live server + real file + observing network response.

### 5. Migration 25 application in prod

**Test:** Mehdi applies `sql/migrations/25_migrate_pneus_to_consommables.sql` manually via Supabase Dashboard SQL Editor, then re-checks a moto that previously had `pneu_av`/`pneu_ar` legacy data.
**Expected:** Two new `consommables` rows appear (`type_consommable IN ('pneu_av','pneu_ar')`) with correct `reference`/`km_montage`; re-running the migration is a no-op (idempotent).
**Why human:** Requires prod DB access and is explicitly a manual, non-automated step per project convention.

### Gaps Summary

No gaps blocking the phase goal. All 5 observable truths verified, all 7 required artifacts exist/substantive/wired, all 8 key links confirmed (4 via gsd-tools, 4 via manual grep after a tool-parsing limitation with compound `from:` fields). Requirements GAUGE-01, GAUGE-02, CONSO-04 are all satisfied with code evidence. The one automated test-harness case that fails locally (`--case=migration`, due to the `pg` npm package never having been installed in this repo) is a pre-existing environmental gap shared with `scripts/test-consommables-crud.js` (predates Phase 27) and does not affect the shipped migration SQL's correctness or the phase's actual deliverables — migration application is a manual, out-of-band step by design. Five items are flagged for human/manual verification (visual rendering ×2, dashboard chip, live upload flow, prod migration application) — these require a running server / prod DB access and cannot be verified via static code inspection.

---

_Verified: 2026-07-16_
_Verifier: Claude (gsd-verifier)_
