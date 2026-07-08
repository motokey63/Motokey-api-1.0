---
phase: 16-push-wiring-end-to-end
plan: 01
subsystem: api
tags: [supabase, postgrest, devis, rbac, push, express]

# Dependency graph
requires:
  - phase: 13-push-dispatch-service
    provides: services/pushService.js sendPush()/sendToToken() (fail-open, fan-out by client_id)
provides:
  - "POST /devis/:id/envoyer (MECANO+): brouillon -> envoye transition, fires pushService.sendPush() fire-and-forget targeting dv.client_id"
  - "PUT /devis/:id statut-lock guard: rejects edits on any non-brouillon devis (400 INVALID_STATUS), Supabase + RAM branches"
  - "Devis data-access layer (supabase.js) rewritten against the REAL live devis schema (denormalized/snapshot, embedded lignes jsonb, persisted totals) — devis_lignes table does not exist in prod"
  - "scripts/seed-test-devis-16-uat.js: idempotent seed fixture producing a brouillon devis for curl UAT"
  - "app.html devis list: correct field refs (numero/created_at/statut/total_ttc), statut badge, per-row Envoyer au client button"
affects: [16-02-mobile-push-registration, 16-03-push-dispatch-wiring, 16-04-e2e-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Denormalized/snapshot table design for devis (client_nom/moto_label/moto_vin/moto_km snapshotted at create, not re-derived by live join every read)"
    - "Totals (total_ht/total_tva/total_ttc) computed and persisted at write time (create/update/valider) instead of computed on read — real schema has NOT NULL numeric columns for these, no separate lines table to join"
    - "entite_facturation_id resolution: first active (actif=true) entite_facturation row for the garage, ordered by created_at ascending — same convention as GET /entites-facturation"

key-files:
  created:
    - scripts/seed-test-devis-16-uat.js
    - .planning/phases/16-push-wiring-end-to-end/deferred-items.md
  modified:
    - supabase.js (Devis object fully rewritten: list/getById/create/update/valider/_calcTotaux/envoyer, new _getEntiteActive helper)
    - motokey-api.js (removed dead devis_lignes(*) join in GET /devis/:id CLIENT branch; push targeting uses dv.client_id)
    - app.html (devis list rendering + envoyerDevis() function)

key-decisions:
  - "Re-ran live schema introspection (PostgREST OpenAPI) rather than trusting Mehdi's Table Editor list alone — found additional NOT NULL columns (client_nom, lignes, total_ht, total_tva, date_creation) and confirmed devis_lignes table does not exist at all, matching the checkpoint's guidance to trust introspection as ground truth"
  - "Chose to persist totals at write time (create/update/valider) rather than compute-on-read, since the real schema has real total_ht/total_tva/total_ttc NOT NULL columns and no separate lines table to join — simpler and more correct than the original plan's on-read _calcTotaux approach, which was designed around the old devis_lignes-join assumption"
  - "Kept the lignes jsonb array shape identical to the old devis_lignes row shape (type_ligne/description/quantite/prix_unitaire/remise_pct) for zero blast-radius on MotoKey_Client.html (already defensively coded with `dv.devis_lignes || dv.lignes`) and the seed fixture's DEVIS_LIGNE constant"
  - "Did not fix app.html's pre-existing saveDevis()/devisLines create-form field mismatch (designation/qte/prix_ht vs description/quantite/prix_unitaire) — out of this plan's declared Task 3 scope (list rendering + envoyer button only); logged to deferred-items.md"
  - "Did not attempt to apply the missing client_device_tokens/push_send_log migrations to prod — pushService.js is explicitly marked do-not-modify in this plan's interfaces, and applying migrations is Phase 12/13 territory; logged to deferred-items.md instead"

requirements-completed: [MPUSH-03]

duration: 55min
completed: 2026-07-04
---

# Phase 16 Plan 01: Devis brouillon->envoye push trigger (real-schema rewrite) Summary

**`POST /devis/:id/envoyer` (MECANO+) transitions a devis from brouillon to envoye and fires `pushService.sendPush()` at `dv.client_id`, on top of a full rewrite of `supabase.js`'s `Devis` data-access layer to match the real live Supabase schema (denormalized snapshot table with embedded `lignes` jsonb — no `devis_lignes` table exists in prod).**

## Performance

- **Duration:** ~55 min (resumed from a paused checkpoint; excludes prior agent's Task 1 work)
- **Completed:** 2026-07-04
- **Tasks:** 3/3 (Task 1 re-verified/corrected, Task 2 fixed to run, Task 3 completed)
- **Files modified:** 4 (supabase.js, motokey-api.js, scripts/seed-test-devis-16-uat.js, app.html)

## Accomplishments
- Re-ran live schema introspection (PostgREST OpenAPI) and got the authoritative, complete `devis` and `entites_facturation` column lists — confirmed `devis_lignes` does not exist as a table in prod at all.
- Rewrote `Devis.list/getById/create/update/valider/_calcTotaux` in `supabase.js` to target the real schema: embedded `lignes` jsonb, NOT NULL `client_nom`/`entite_facturation_id`, persisted `total_ht/total_tva/total_ttc`.
- Verified the entire flow end-to-end against **live prod Supabase** via a local server + curl: create (via seed script) -> GET (total_ttc=108 correct) -> POST /envoyer (statut brouillon->envoye, push call attempted) -> re-send rejected (400 INVALID_STATUS) -> PUT edit rejected (400 INVALID_STATUS).
- Fixed `app.html`'s devis list to show real data (numero/date/moto/statut badge/total_ttc) and added the "Envoyer au client" button, shown only on brouillon rows.
- Discovered (not fixed, logged) that the `client_device_tokens` table referenced by `pushService.js` does not exist in prod yet — migration `16_client_device_tokens.sql` exists in-repo but has not been applied to live Supabase.

## Task Commits

1. **Task 1 (original, prior agent run):** `a6fbb66` - feat: POST /devis/:id/envoyer + PUT statut-lock guard (route shape correct, but called a broken data-access layer)
2. **Task 1 (correction, this run): Rewrite Devis data-access layer against real schema** - `b29d4f5` - fix
3. **Task 2: Seed fixture for curl verification** - `af3b15f` - feat
4. **Task 3: app.html devis list + envoyer button** - `bf02a7d` - feat

**Plan metadata:** (this commit, pending) - docs: complete plan

## Files Created/Modified
- `supabase.js` - `Devis` object fully rewritten (list/getById/create/update/valider/_calcTotaux/envoyer + new `_getEntiteActive` helper) to target the real live schema
- `motokey-api.js` - removed dead `devis_lignes(*)` join (GET /devis/:id CLIENT branch); push targeting in `POST /devis/:id/envoyer` uses `dv.client_id` (real snapshot column) with fallback to `motos.client_id`
- `scripts/seed-test-devis-16-uat.js` - idempotent seed fixture, inserts into real `devis` columns (`lignes` jsonb, snapshot fields, persisted totals)
- `app.html` - devis list rendering fixed (numero/created_at/statut badge/total_ttc), new `envoyerDevis(id)` function
- `.planning/phases/16-push-wiring-end-to-end/deferred-items.md` - two out-of-scope discoveries logged (see below)

## Decisions Made
- **Schema reconciliation:** re-ran PostgREST OpenAPI introspection myself rather than relying solely on Mehdi's Table Editor description, per the checkpoint's explicit instruction to treat introspection as ground truth. Confirmed Mehdi's 6 named columns (id, numero, garage_id, entite_facturation_id, moto_id, client_id) are real, and found the rest of the (larger) real column set: `or_id`, `client_nom` (NOT NULL), `client_adresse/cp/ville/email/tel/siret/tva` (snapshot), `moto_label/moto_vin/moto_km` (snapshot), `lignes` (jsonb, NOT NULL — replaces the now-nonexistent `devis_lignes` table), `total_ht/total_tva/total_ttc` (numeric, NOT NULL, default 0), `remise_pct/remise_montant`, `date_creation/date_validite/date_envoi/date_acceptation/date_refus`, `notes`, `pdf_url`, `cree_par`, plus the already-known `statut/remise_note/remise_type/tva/created_at/updated_at`.
- **Totals persisted at write time, not computed on read:** since the real schema has real NOT NULL `total_ht/total_tva/total_ttc` columns (no separate lines table to join), `_calcTotaux` is now called and its result written on every `create()`/`update()`/`valider()`. This achieves the plan's underlying goal (non-zero totals visible for brouillon/envoye rows) more directly than the original plan's "compute on read via devis_lignes join" approach, which doesn't apply to this schema.
- **`lignes` jsonb shape kept identical to the old `devis_lignes` row shape** (`type_ligne`, `description`, `quantite`, `prix_unitaire`, `remise_pct`, `position`) specifically because `MotoKey_Client.html` (line ~964) was already defensively coded with `dv.devis_lignes || dv.lignes` and reads `l.description`/`l.quantite`/`l.prix_unitaire` — this shape choice meant **zero changes were needed in `MotoKey_Client.html`**.
- **Push targeting uses `dv.client_id` directly** (a real column on the `devis` row) instead of `dv.motos.client_id` (a join) — simpler and matches the real schema's denormalized design intent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4 resolved via user checkpoint decision] Devis data-access layer rewritten against real schema, not the schema the plan assumed**
- **Found during:** Resuming Task 1 (prior agent had already flagged this and paused at a checkpoint)
- **Issue:** The plan's Task 1/Task 2 code (and the prior agent's Task 1 commit `a6fbb66`) assumed a `devis`/`devis_lignes` two-table schema. Live prod Supabase has neither `devis_lignes` as a table nor the columns the old code selected (`select('*, motos(...), devis_lignes(*))`) — this schema was already replaced by a denormalized snapshot design at some point before this plan ran, un-tracked in any versioned migration in this repo.
- **Fix:** Re-ran PostgREST OpenAPI introspection to get the authoritative real schema, then rewrote `Devis.list/getById/create/update/valider/_calcTotaux` in `supabase.js`, removed the dead `devis_lignes(*)` join in `motokey-api.js`'s `GET /devis/:id` CLIENT branch, and changed push targeting to use `dv.client_id`.
- **Files modified:** `supabase.js`, `motokey-api.js`
- **Verification:** Ran the corrected seed script against live prod (idempotent, `[CREATE]` then `[SKIP]`), started a local server pointed at live prod Supabase, and curl-verified the full lifecycle: GET /devis returns `total_ttc: 108` for the seeded fixture, POST /devis/:id/envoyer transitions brouillon->envoye and returns 400 INVALID_STATUS on re-send, PUT /devis/:id returns 400 INVALID_STATUS once envoye.
- **Committed in:** `b29d4f5`

**2. [Rule 1 - Bug] Fixed seed fixture to insert into the real schema**
- **Found during:** Task 2
- **Issue:** The draft seed script inserted into `devis_lignes` (nonexistent table) and did not populate the NOT NULL `client_nom`/`lignes` columns on `devis`.
- **Fix:** Rewrote the devis insert to populate `client_id`, `client_nom`, `moto_label`, `moto_vin`, `moto_km`, `lignes` (jsonb array with the one seeded line), and pre-computed `total_ht`/`total_tva`/`total_ttc`.
- **Files modified:** `scripts/seed-test-devis-16-uat.js`
- **Verification:** Script runs successfully, prints `[CREATE]` then `[SKIP]` on re-run, correct `total_ttc=108`.
- **Committed in:** `af3b15f`

---

**Total deviations:** 2 (1 major schema-driven rewrite resolved via the user's explicit checkpoint decision, 1 direct consequence bug-fix in the seed script)
**Impact on plan:** Both were necessary for the plan's stated goal (a real, curl-verifiable brouillon->envoye transition) to be achievable at all against live prod. No scope creep — Task 3 (app.html) was implemented exactly as scoped, and two additional out-of-scope discoveries were logged rather than fixed (see below).

## Issues Encountered

- **`client_device_tokens` table missing in live prod Supabase.** `services/pushService.js` (Phase 13, explicitly marked do-not-modify) queries this table to fan out pushes; it does not exist in prod, so `sendPush()` fails open with a caught error (`Could not find the table 'public.client_device_tokens' in the schema cache`) and never actually delivers a notification. The migration file `sql/migrations/16_client_device_tokens.sql` already exists in-repo (along with `17_push_send_log.sql`) but has apparently never been applied to live prod. This does not break the `envoyer` transition itself (verified working end-to-end regardless, since `sendPush` is fail-open) but means MPUSH-03 is not yet truly end-to-end at the infrastructure level. Logged in `deferred-items.md` — this is Phase 12/13 territory, not this plan's.
- **`app.html`'s devis creation form (`saveDevis`/`devisLines`) uses field names (`designation`/`qte`/`prix_ht`) that don't match the backend's expected line shape (`description`/`quantite`/`prix_unitaire`/`type_ligne`).** Pre-existing, outside this plan's declared Task 3 scope (list rendering + envoyer button only). Logged in `deferred-items.md` with a recommended fix for a future plan.

## User Setup Required

None — no new external service configuration required. However, see "Issues Encountered" above: applying `sql/migrations/16_client_device_tokens.sql` and `17_push_send_log.sql` to live prod Supabase (via Dashboard SQL Editor) is required before push notifications can actually be delivered, though it is out of this plan's scope.

## Next Phase Readiness

- The `brouillon -> envoye` devis transition is a real, load-bearing event now correctly wired to `pushService.sendPush()`, verified end-to-end against live prod via curl.
- Plan 16-04 (or whichever plan does full mobile E2E verification) should apply the two pending migrations first, otherwise no push will ever actually be delivered even though the code path is fully correct.
- `app.html`'s devis create-form field mismatch (see deferred-items.md) should be fixed before relying on garage-created devis having non-zero totals from the UI (the seed fixture and API-level testing are unaffected).

---
*Phase: 16-push-wiring-end-to-end*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created/modified files verified present on disk (`supabase.js`, `motokey-api.js`,
`scripts/seed-test-devis-16-uat.js`, `app.html`, this SUMMARY.md,
`deferred-items.md`). All 4 commits verified present in git history
(`a6fbb66`, `b29d4f5`, `af3b15f`, `bf02a7d`).
