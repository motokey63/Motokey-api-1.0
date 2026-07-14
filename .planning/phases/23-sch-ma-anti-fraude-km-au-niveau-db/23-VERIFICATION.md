---
phase: 23-sch-ma-anti-fraude-km-au-niveau-db
verified: 2026-07-14T10:41:52Z
status: passed
score: 12/12 must-haves verified
---

# Phase 23: Schéma anti-fraude km au niveau DB Verification Report

**Phase Goal:** Le kilométrage moto ne peut plus être modifié que via une source de vérité unique (`releves_km`), protégée contre toute régression par un trigger DB, avec les 3 chemins d'écriture existants fermés ; le schéma consommables est posé de façon extensible.
**Verified:** 2026-07-14T10:41:52Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Insérer un relevé km < max historique de la moto est annulé par un trigger BEFORE INSERT et journalisé dans une table de rejet | ✓ VERIFIED | `verifier_km_monotone` present in schema.sql + migration; live trigger test `reject-regression` and `null-safe-baseline` cases PASS (0 rows inserted, rejection logged with correct km_tente/km_actuel) |
| 2 | motos.km est recalculé automatiquement depuis releves_km à chaque relevé accepté (trigger AFTER INSERT) | ✓ VERIFIED | `trg_sync_moto_km` / `sync_moto_km_depuis_releve` present, `SET km = NEW.km` (direct assignment, no clamp); live test `accept` case confirms `motos.km` synced to 12000 |
| 3 | Un remplacement de compteur démarre une chaîne monotone fraîche | ✓ VERIFIED | `type_evenement = 'remplacement_compteur'` bypass in trigger body; live test `counter-replacement-bypass` (5 assertions) proves accept-after-reset then reject-vs-new-baseline |
| 4 | type_consommable n'accepte que les 9 types v1, extensible par migration légère (TEXT+CHECK) | ✓ VERIFIED | schema.sql:564-566 CHECK lists exactly 9 values; live test `conso-check-violation` (10 assertions: 1 invalid rejected 23514, 9 valid accepted) |
| 5 | trg_update_km (ancien clamp GREATEST) est supprimé | ✓ VERIFIED | `grep "CREATE TRIGGER trg_update_km" schema.sql` = 0 matches; live `pg_trigger` query on bootstrapped DB confirms 0 rows |
| 6 | Un script Node hand-rolled (pg) couvre les 4 cas de trigger + le CHECK 9-types, exécutable contre une DB jetable | ✓ VERIFIED | `scripts/test-releves-km-trigger.js` exists, executed live: 28/28 assertions PASS |
| 7 | FRESH_DB_URL présent dans .env, pointe vers un projet jetable (≠ prod) | ✓ VERIFIED | `.env` contains `FRESH_DB_URL`, host = `db.xjgyoehennuydoocbprj.supabase.co` (≠ `rzbqbaccjyxvtlnfitrr`) |
| 8 | RelevesKm.enregistrer() est l'unique fonction partagée qui insère dans releves_km et normalise succès/rejet | ✓ VERIFIED | `supabase.js:385-417`, exported via `module.exports`, handles PGRST116 rejection into `{accepted:false,...}` |
| 9 | Motos.update() ne peut plus écrire km — pneu_av/ar/km_montage intacts | ✓ VERIFIED | `supabase.js:352` `allowed = ['pneu_av','pneu_ar','pneu_km_montage','couleur','photo_url']` — no 'km' |
| 10 | OrdresReparation.cloturer() route km_sortie via RelevesKm.enregistrer(), surface le rejet | ✓ VERIFIED | `supabase.js:965-968` calls `RelevesKm.enregistrer`; no direct `motos.update({km:...})` remains; result includes `km_releve: releveKm` (supabase.js:1004) |
| 11 | L'acteur du relevé de clôture est le membre garage identifié (ctx.user_id), fallback garage_id | ✓ VERIFIED | `motokey-api.js:2788` passes `acteur_id: ctx.user_id`; `supabase.js:966` `acteur_id: acteur_id \|\| garage_id` |
| 12 | Interventions.create() reste explicitement découplé (D-05), aucun changement de comportement | ✓ VERIFIED | `supabase.js:441-444` D-05 comment present; `km: payload.km` unchanged; no `RelevesKm` reference in `Interventions.create()` body |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sql/migrations/23_consommables_km.sql` | 4 CREATE TABLE + 2 triggers + DROP legacy + RLS-no-policy | ✓ VERIFIED | All present; `DROP TRIGGER IF EXISTS trg_update_km ON interventions` and `DROP FUNCTION IF EXISTS update_moto_km()` present |
| `schema.sql` | Same objects hand-appended same commit | ✓ VERIFIED | 4 CREATE TABLE present once each; DROP block updated (releves_km_rejets, releves_km, photos_consommables, consommables in reverse-dependency order); trg_update_km/update_moto_km absent; trg_recalc_score preserved |
| `scripts/test-releves-km-trigger.js` | pg harness with 5 cases + CHECK case | ✓ VERIFIED | Executed live, 28/28 PASS |
| `supabase.js` | RelevesKm object + 2 closed paths + 1 documented | ✓ VERIFIED | RelevesKm exported; Motos.update/cloturer closed; Interventions.create documented |
| `motokey-api.js` | cloturer endpoint threads ctx.user_id as acteur_id | ✓ VERIFIED | Line 2788 confirmed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| trigger BEFORE INSERT verifier_km_monotone | releves_km_rejets | INSERT du log puis RETURN NULL | ✓ WIRED | Live test confirms rejection rows created with correct km_tente/km_actuel |
| trigger AFTER INSERT trg_sync_moto_km | motos.km | UPDATE motos SET km = NEW.km | ✓ WIRED | Live test confirms motos.km updated directly, no GREATEST |
| scripts/test-releves-km-trigger.js | FRESH_DB_URL (projet jetable) | new Client({connectionString}) | ✓ WIRED | Live connection succeeded against throwaway project, anti-prod guard present |
| OrdresReparation.cloturer() | RelevesKm.enregistrer() | remplacement du bloc UPDATE motos.km direct | ✓ WIRED | supabase.js:965, no direct UPDATE motos.km remains in cloturer |
| Motos.update() | liste allowed sans 'km' | retrait de 'km' du tableau allowed | ✓ WIRED | supabase.js:352 confirmed |
| motokey-api.js endpoint cloturer | OrdresReparation.cloturer(..., {km_sortie, acteur_id}) | passage de ctx.user_id comme acteur_id | ✓ WIRED | motokey-api.js:2788 confirmed |

### Data-Flow Trace (Level 4)

| Artifact | Behavior Traced | Source | Produces Real Effect | Status |
|----------|------------------|--------|----------------------|--------|
| verifier_km_monotone trigger | Reject regression on live bootstrapped DB | Actual PL/pgSQL execution against throwaway Postgres (not static SQL text) | Yes — 28/28 live assertions pass, including NULL-safe baseline and counter-replacement chain reset | ✓ FLOWING |
| RelevesKm.enregistrer() → releves_km → trigger | End-to-end write path from app-layer function through DB trigger | Not independently re-executed against live app runtime in this verification (no server started, per spot-check constraints); code-level trace confirms no bypass exists (grep-verified, function body read directly) | Static trace confirms wiring; DB-side behavior independently proven live via test harness which exercises the identical trigger | ✓ FLOWING (via DB-level live proof + code-level trace) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Schema bootstraps cleanly with 4 new tables | `node scripts/bootstrap-fresh-schema.js` | `SCHEMA_BOOTSTRAP_OK` | ✓ PASS |
| Trigger anti-fraude behaves correctly (5 cases) | `node scripts/test-releves-km-trigger.js` | 28/28 assertions PASS | ✓ PASS |
| RLS default-deny on 4 new tables | Direct pg query: `pg_policies` + `pg_class.relrowsecurity` | 0 policy rows; relrowsecurity=true for all 4 | ✓ PASS |
| trg_update_km absent from bootstrapped DB | Direct pg query: `pg_trigger WHERE tgname='trg_update_km'` | 0 rows | ✓ PASS |
| supabase.js/motokey-api.js syntax valid | `node --check supabase.js && node --check motokey-api.js` | No errors | ✓ PASS |
| RelevesKm exported and callable | `require('./supabase.js').RelevesKm.enregistrer` | function | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| KM-01 | 23-01, 23-02, 23-04 | Le système refuse tout relevé km inférieur au maximum historique de la moto et journalise la tentative de façon visible pour le garage | ✓ SATISFIED | Trigger + rejet table live-verified (28/28 PASS including null-safe baseline and reject-regression) |
| KM-04 | 23-01, 23-03, 23-04 | `releves_km` source de vérité, motos.km dérivé automatiquement, 3 chemins d'écriture fermés via validation partagée | ✓ SATISFIED | trg_update_km removed, RelevesKm.enregistrer() single write gateway, Motos.update/cloturer closed, Interventions.create explicitly documented decoupled (D-05) |
| CONSO-02 | 23-01, 23-02, 23-04 | Le schéma consommables permet d'ajouter un nouveau type plus tard sans migration lourde | ✓ SATISFIED | TEXT+CHECK pattern (9 types v1), same pattern as interventions.niveau_preuve, extensible via lightweight ALTER TABLE...DROP/ADD CONSTRAINT |

No orphaned requirements found — REQUIREMENTS.md maps only KM-01, KM-04, CONSO-02 to Phase 23, matching the union of all 4 plans' declared `requirements` frontmatter exactly.

### Anti-Patterns Found

None. Scanned `sql/migrations/23_consommables_km.sql`, `scripts/test-releves-km-trigger.js`, and the touched sections of `supabase.js`/`motokey-api.js` for TODO/FIXME/placeholder/not-implemented patterns — no matches. No stub returns, no empty handlers, no hardcoded static data flowing to rendering (this is a DB-schema + backend-only phase, no UI).

### Human Verification Required

None required beyond what was already executed live in this verification (bootstrap, trigger test, pg_policies/RLS/trigger-absence queries) — all were run directly against the throwaway Supabase project and confirmed programmatically, superseding the plan's original `checkpoint:human-verify` step for Task 2 of 23-04.

One item remains an explicit deferred action, not a verification gap: **the migration `sql/migrations/23_consommables_km.sql` still needs to be applied manually to prod** via Supabase Dashboard SQL Editor (per project convention — no automated runner exists). This is documented in both 23-01-SUMMARY.md and 23-04-SUMMARY.md as an intentional deployment action outside this phase's automated scope, consistent with CLAUDE.md's "no automated migration runner" convention. Recommend Mehdi apply it before Phase 25 (endpoints) lands.

### Gaps Summary

No gaps. All 12 derived truths across the 4 plans verified against actual code and, where behavioral, against live execution on the throwaway Supabase project (`xjgyoehennuydoocbprj`, confirmed ≠ prod `rzbqbaccjyxvtlnfitrr`). The schema bootstraps cleanly (`SCHEMA_BOOTSTRAP_OK`), the anti-fraude trigger behaves correctly under all 5 test cases (28/28 assertions), RLS default-deny is live-confirmed (0 policies, RLS enabled), the legacy `trg_update_km` clamp is fully removed from both schema.sql and the live bootstrapped DB, and all 3 application-level km write paths are closed with the identified-actor requirement (D-04) and the intervention-history decoupling (D-05) intact.

---

*Verified: 2026-07-14T10:41:52Z*
*Verifier: Claude (gsd-verifier)*
