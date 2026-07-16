# Phase 23: Schéma + Anti-Fraude km au niveau DB - Research

**Researched:** 2026-07-14
**Domain:** PostgreSQL/Supabase schema design, PL/pgSQL triggers, RLS default-deny pattern, closing existing write paths in a live Node/Express + Supabase monolith
**Confidence:** HIGH (all core claims verified by direct reads of `schema.sql`, `supabase.js`, `sql/migrations/*.sql`, `scripts/bootstrap-fresh-schema.js`, `.env`, `package.json` — re-grepped for this research pass, not reused from cache)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**RLS pour les 3 nouvelles tables**
- **D-01:** RLS activé sans policy explicite (service-role-only, default-deny) sur `consommables`, `photos_consommables`, `releves_km` — même pattern que `garage_users`/`client_device_tokens`/`push_send_log` et les tables Gap B de v1.5. Toute l'autorisation réelle vit dans `motokey-api.js` (`requireRole()` + vérification d'ownership via `moto_id`), jamais dans Postgres. Documenter explicitement ce choix en commentaire dans la migration (mirroring `schema.sql` lignes 689-702).

**Extensibilité des types de consommables (CONSO-02)**
- **D-02:** `type_consommable` en `TEXT` + `CHECK` constraint listant les 9 types v1 (`pneu_av`, `pneu_ar`, `chaine`, `plaquettes_av`, `plaquettes_ar`, `disque_av`, `disque_ar`, `huile_moteur`, `liquide_frein`) — même pattern que `interventions.niveau_preuve` déjà existant. Ajouter un type plus tard = migration légère (`DROP CONSTRAINT`/`ADD CONSTRAINT`), pas une refonte. Pas de table de référence séparée.

**Signature garage sur changement de compteur (KM-02)**
- **D-03:** « Signé garage » = métadonnées d'audit, pas de cryptographie : `garage_id`, l'utilisateur PRO+ qui a validé, `timestamp`, et une note obligatoire. Pas de `signature_hash` cryptographique (le pattern existe sur `interventions` mais n'est pas jugé nécessaire ici).

**Log de rejet km (KM-01)**
- **D-04:** Log de rejet complet : `moto_id`, `garage_id`, acteur (jamais anonyme), km tenté, km actuel (vrai max historique), `timestamp`. Objectif : permettre au garage de repérer un pattern de tentatives répétées.

**Source de vérité km (rappel milestone)**
- `releves_km` est LA source de vérité. `motos.km` reste une colonne physique mais devient dérivée/cache, recalculée uniquement via le chemin validé.

**Fermeture des 3 chemins d'écriture existants (KM-04 — scope confirmé)**
- `Motos.update()` (`supabase.js` ~L350) : retirer `km` de la liste `allowed`.
- `Interventions.create()` (`supabase.js` ~L397) : router son écriture de km vers la même fonction de validation partagée.
- `OrdresReparation.cloturer()` (`supabase.js` ~L893-922) : remplacer le garde-fou ad-hoc par un appel à la même fonction, avec rejet+log au lieu du skip silencieux.
- Colonnes `pneu_av`/`pneu_ar`/`pneu_km_montage` legacy restent intactes dans `Motos.update()` cette phase — migration/retrait assigné à Phase 27.

### Claude's Discretion
- Nom exact du trigger PL/pgSQL et de la fonction de validation partagée.
- Forme exacte de la table de rejet (nom, colonnes) tant que D-04 est respecté.
- Comment le bypass `type_evenement = 'remplacement_compteur'` est représenté (colonne enum vs table séparée).
- Ordre exact des fichiers de migration (23/24/25/26 vs un seul fichier groupé) tant que la discipline schema.sql same-commit + bootstrap est respectée.

### Deferred Ideas (OUT OF SCOPE)
- Table de référence `types_consommables` (rejetée — TEXT+CHECK choisi).
- Policies RLS granulaires (join via moto_id) — rejetées, notées si accès direct SDK client émerge un jour.
- Signature cryptographique (`signature_hash`) sur changement de compteur — rejetée.
- Migration/retrait des colonnes `pneu_av`/`pneu_ar`/`pneu_km_montage` legacy — Phase 27 (CONSO-04).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KM-01 | Le système refuse tout relevé km inférieur au maximum historique de la moto et journalise la tentative de façon visible pour le garage | Trigger design (BEFORE INSERT, return-NULL-not-exception pattern) + rejection-log table shape + NULL-safe baseline pitfall documented below |
| KM-04 | `releves_km` est la source de vérité ; `motos.km` recalculé/dérivé automatiquement ; les 3 chemins d'écriture existants passent tous par la même validation partagée, plus aucun bypass possible | Exact current code for all 3 write paths (re-grepped, line numbers confirmed) + shared-validation-function design + AFTER INSERT sync-trigger recommendation |
| CONSO-02 | Le schéma consommables permet d'ajouter un nouveau type de consommable plus tard sans migration lourde | Exact `TEXT + CHECK` pattern from `interventions.niveau_preuve` (schema.sql L302) to mirror for `type_consommable` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **File-edit discipline:** No PowerShell/Python/sed/awk one-liners against `motokey-api.js`, `app.html`, `supabase.js`, `MotoKey_Client.html`. Direct `str_replace`-style edits or a versioned script under `scripts/` that makes a `.bak` first. This phase touches `supabase.js` (closing 3 write paths) — must be edited directly, not scripted.
- **Never touch the 1.0/0.6/0.3 anti-fraude weighting or the 70/30 score formula** without Mehdi's explicit validation. This phase's km anti-fraud is a *separate* integrity system — do not conflate `niveau_preuve`/score weighting with the new km monotonic trigger.
- **`supabase.js` is the only DB access boundary** — no `supabase.from(...)` calls directly in `motokey-api.js`. Not directly relevant this phase (no new endpoints), but the shared km-validation function must live in `supabase.js`.
- **Verify `git status` / `git log --oneline -5` before any major change.**
- **Run `node --check motokey-api.js`** (and, by established convention, `supabase.js` / new `services/*.js`) before any commit touching those files.
- **CLAUDE.md's "Pneus removed from nav" claim is confirmed STALE** (per PITFALLS.md Pitfall 6, independently reconfirmed by this research not re-grepping `app.html` since it's out of this phase's scope) — do not rely on it; irrelevant to Phase 23 (no UI), relevant for whoever later touches CLAUDE.md/Phase 27.
- **`.planning/` is gitignored with individual force-add** — if `gsd-tools.cjs commit` reports `skipped_commit_docs_false`, force-add and commit directly with git.

## Summary

Phase 23 is a pure schema + DB-trigger + write-path-closure phase — no HTTP endpoints, no UI. Three new tables (`consommables`, `photos_consommables`, `releves_km`) get created, all FK'd to `moto_id` only (never `client_id`, per the L8 polymorphic-ownership precedent), all RLS-enabled-with-no-policy (service-role-only, documented per the exact comment convention already at `schema.sql` lines 689-702). The core technical challenge is the odometer anti-fraud trigger: `CHECK` constraints cannot see other rows, so monotonic enforcement requires a `BEFORE INSERT` PL/pgSQL trigger on `releves_km`. Research resolved the "Research Flag" from `.planning/research/SUMMARY.md` (does `RAISE EXCEPTION` roll back a same-transaction log write?) — **yes, it does**, and the fix is not to raise an exception at all: have the trigger write to the rejection-log table as a normal statement, then `RETURN NULL` (not `RETURN NEW`) to silently cancel just that row's insertion into `releves_km`, all within the same transaction, so nothing rolls back. This works for *every* write path (app, script, Dashboard SQL), not just ones that catch a Postgres exception — which matters directly for D-04 ("log de rejet complet").

A second, previously-undocumented finding matters more than the trigger mechanics themselves: **the monotonic check must compare against `GREATEST(motos.km, MAX(releves_km.km) for that moto)`, not `MAX(releves_km.km)` alone.** Because `releves_km` starts empty and every existing moto already has a live `motos.km` value in prod, a naive `SELECT MAX(km) FROM releves_km WHERE moto_id = NEW.moto_id` returns `NULL` for every moto's first-ever reading — and `NEW.km < NULL` evaluates to `NULL` (falsy) in PL/pgSQL, meaning the very first `releves_km` insert for **every existing moto** would silently bypass the anti-fraud check entirely, regardless of how low the submitted value is. This is not an edge case — it's the default state for all ~current production motos the day this ships.

All three existing km write paths were re-grepped and their line numbers/behavior from PITFALLS.md are confirmed accurate as of this research pass (no drift): `Motos.update()` L350-351, `Interventions.create()` L397, `OrdresReparation.cloturer()` L893-923. `Interventions.create()` routing its `km` through the shared validation function raises a genuine, not-yet-resolved product question (see Open Questions) — CONTEXT.md's D-04 says to route it through validation "plutôt que d'ignorer motos.km" but doesn't specify what should happen when an intervention's km is legitimately lower than the moto's current live km (e.g., late data entry). This needs an explicit call during planning, not an implicit one.

**Primary recommendation:** One `BEFORE INSERT ON releves_km` trigger (monotonic gate + log-then-cancel-via-RETURN-NULL, NULL-safe against `motos.km` baseline) + one separate `AFTER INSERT ON releves_km` trigger (syncs `motos.km = NEW.km`, no `GREATEST` clamping — the BEFORE trigger already guarantees safety) + a dedicated rejection-log table + RLS-enabled-no-policy on all 3 new tables with the exact `schema.sql` comment convention + closing all 3 existing write paths through one `supabase.js` function (`RelevesKm.enregistrer()` or similar) in the same phase. Next migration number is confirmed `23` (last used is `22`, nothing 23+ exists yet).

## Standard Stack

### Core

No new dependencies. This phase is pure SQL (migrations + `schema.sql`) plus `supabase.js` function additions.

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|---------------|
| PL/pgSQL `BEFORE INSERT` / `AFTER INSERT` triggers | Native to Supabase-managed Postgres (no extension) | Monotonic km enforcement + `motos.km` sync | `CHECK` constraints cannot reference other rows (confirmed standard, stable Postgres semantics — HIGH confidence, long-standing RDBMS behavior). Two live precedents already exist in `schema.sql`: `trg_recalc_score` (AFTER INSERT/UPDATE/DELETE on `interventions`, L624-626) and `trg_update_km` (AFTER INSERT/UPDATE on `interventions`, L641-643) — reuse the idiom, not the `GREATEST()`-clamp semantics of the latter (that's the wrong example to copy, per CONTEXT.md's own code-context note). |
| `TEXT + CHECK` constraint | N/A | `type_consommable` extensibility (CONSO-02) | Exact precedent already live: `interventions.niveau_preuve TEXT DEFAULT 'declare' CHECK (niveau_preuve IN ('facture','visuel','declare'))` — `schema.sql` L302. Mirror this verbatim for the 9 v1 consumable types. |
| `pg` (already in `node_modules`, installed `--no-save`) | present | Only needed for `scripts/bootstrap-fresh-schema.js` re-run verification | Not a runtime dependency of the app — verification tooling only, already installed, confirmed via `require.resolve('pg')`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `RETURN NULL` from `BEFORE INSERT` trigger (silent row-cancel, log survives) | `RAISE EXCEPTION` + app-layer `catch` writes the log row in a separate statement | Exception approach only logs rejections that originate from `supabase.js`'s catch block — a hypothetical raw-SQL/Dashboard insert attempt would be correctly rejected but **not logged**, which is a gap against D-04 ("log de rejet complet", implicitly for any actor). `RETURN NULL` logs unconditionally, in the same transaction, regardless of caller. Recommended: `RETURN NULL` pattern as primary; keep an app-layer pre-check too (fast, friendly error message) as a UX nicety, not as the enforcement mechanism — exactly matching STACK.md's already-stated "add app-layer pre-check too, but the trigger is the actual gate" guidance. |
| `RETURN NULL` (no exception) | `dblink`/autonomous-transaction pattern (open a second connection from inside the trigger to commit the log independently of the outer transaction's rollback) | Only needed if the design requires the exception to still propagate to the client as a hard Postgres error *and* have a durable log survive that rollback. Adds an extension dependency (`CREATE EXTENSION dblink`) and per-rejection connection overhead. Not needed here — `RETURN NULL` achieves the same "log durably, cancel the write" outcome with zero extra extensions, using standard trigger semantics. |

**Installation:** None required — no `npm install` for this phase.

## Architecture Patterns

### Recommended Project Structure

```
sql/migrations/
├── 23_consommables.sql          # CREATE TABLE consommables (moto_id FK, type_consommable TEXT+CHECK)
├── 24_photos_consommables.sql   # CREATE TABLE photos_consommables (moto_id + consommable_id FK)
├── 25_releves_km.sql            # CREATE TABLE releves_km + releves_km_rejets + BEFORE/AFTER triggers
└── 26_consommables_rls.sql      # ENABLE ROW LEVEL SECURITY (no policies) + schema.sql-convention comments for all 3 new tables
schema.sql                        # hand-appended same commit, in dependency order (see below)
supabase.js                       # Motos.update() km stripped; new RelevesKm entity object added;
                                   # Interventions.create() and OrdresReparation.cloturer() call the
                                   # shared validation function instead of writing motos.km directly
scripts/
└── bootstrap-fresh-schema.js     # rerun (existing tool) before phase sign-off — requires FRESH_DB_URL checkpoint (see Environment Availability)
```

Numbering 23-26 is illustrative — CONTEXT.md leaves exact file grouping to Claude's discretion. What's non-negotiable: the migration(s) and the same-commit `schema.sql` update, verified via bootstrap script, per Anti-Pattern 2 in ARCHITECTURE.md.

### Pattern 1: Monotonic-gate trigger that logs unconditionally (resolves the SUMMARY.md Research Flag)

**What:** A `BEFORE INSERT ON releves_km FOR EACH ROW` trigger that (1) computes the true current-max km as `GREATEST(v_moto_km, COALESCE(v_max_releve, 0))`, (2) if `NEW.type_evenement <> 'remplacement_compteur'` and `NEW.km < v_current_max`, INSERTs a row into the rejection-log table and `RETURN NULL` (cancels just this row, no exception, nothing rolls back), (3) otherwise `RETURN NEW`.

**When to use:** This is the actual KM-01 enforcement mechanism. Must be `BEFORE INSERT`, not `CHECK`, not app-layer-only (STACK.md: app-layer-only is bypassable by any future direct-SQL/service-role code path, since `supabase.js` already uses the service-role key which bypasses RLS).

**Example (illustrative — table/column names are Claude's discretion per CONTEXT.md, but the logic shape is not):**
```sql
-- Source: derived from schema.sql's existing trg_update_km/trg_recalc_score idiom (L624-643),
-- adapted to reject-and-log instead of clamp, per CONTEXT.md D-01/D-04 and STACK.md's
-- "app-layer check is not sufficient alone" guidance.
CREATE OR REPLACE FUNCTION verifier_km_monotone()
RETURNS TRIGGER AS $$
DECLARE
  v_moto_km      INTEGER;
  v_max_releve   INTEGER;
  v_km_actuel    INTEGER;
BEGIN
  -- Bypass total pour un changement de compteur explicite (role check déjà fait côté app avant l'insert)
  IF NEW.type_evenement = 'remplacement_compteur' THEN
    RETURN NEW;
  END IF;

  SELECT km INTO v_moto_km FROM motos WHERE id = NEW.moto_id;
  SELECT MAX(km) INTO v_max_releve FROM releves_km WHERE moto_id = NEW.moto_id;

  -- NULL-safe baseline : sans le GREATEST(v_moto_km, ...), le tout premier releve_km
  -- de CHAQUE moto existante en prod passerait la vérif quelle que soit sa valeur,
  -- car MAX(km) sur une table vide pour ce moto_id renvoie NULL, et
  -- "NEW.km < NULL" s'évalue à NULL (faux) en PL/pgSQL, pas à TRUE.
  v_km_actuel := GREATEST(COALESCE(v_moto_km, 0), COALESCE(v_max_releve, 0));

  IF NEW.km < v_km_actuel THEN
    INSERT INTO releves_km_rejets (moto_id, garage_id, acteur_type, acteur_id, km_tente, km_actuel, created_at)
    VALUES (NEW.moto_id, NEW.garage_id, NEW.acteur_type, NEW.acteur_id, NEW.km, v_km_actuel, NOW());
    RETURN NULL;  -- annule SEULEMENT l'insert de cette ligne — pas d'exception, rien n'est rollback
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verifier_km_monotone
  BEFORE INSERT ON releves_km
  FOR EACH ROW EXECUTE FUNCTION verifier_km_monotone();
```

**Application-side consequence:** `supabase.js`'s shared insert function must handle the "0 rows returned" case (the row was silently cancelled by the trigger). Supabase-js's `.insert(...).select().single()` will throw `PGRST116` ("no rows returned") when the trigger cancels the row — this exact error code is **already handled elsewhere in this codebase** (per CLAUDE.md's L4 v2 hardening notes: `loginGarage` PGRST116 fix, 07/05/2026) — reuse that precedent's error-handling shape rather than inventing a new one. On `PGRST116`, the app should query `releves_km_rejets` for the just-written rejection row (by `moto_id` + recent timestamp) to build the HTTP 400 payload, or simpler: have the app's own pre-check (see Pattern 3) already know the values and skip the round-trip.

### Pattern 2: Separate `AFTER INSERT` trigger syncs `motos.km` (answers Research Question 4)

**What:** A second, independent trigger, `AFTER INSERT ON releves_km FOR EACH ROW`, that runs only for rows that actually got inserted (i.e., ones the BEFORE trigger did not cancel) and does a plain `UPDATE motos SET km = NEW.km, updated_at = NOW() WHERE id = NEW.moto_id`.

**When to use:** Always, for every accepted `releves_km` insert, including `remplacement_compteur` events (a counter replacement still needs to update `motos.km` to the new reading).

**Recommendation and why (DB trigger, not app layer):** Do this in the DB, not in `supabase.js` after a successful insert. Same argument as the monotonic check itself — an app-layer-only sync is bypassable by any future direct-SQL write to `releves_km` (a script, an admin fix, a future migration backfill), and would leave `motos.km` stale relative to the "source of truth" the moment any code path other than the one blessed helper function is used. This matches the two-trigger precedent already live on `interventions` (`trg_recalc_score` + `trg_update_km` are two separate AFTER triggers on the same table) — same shape, new table.

**Important:** do **not** copy `trg_update_km`'s `GREATEST(km, NEW.km)` clamp semantics for this new trigger. That clamp exists because the *old* `interventions`→`motos.km` sync had no upstream monotonic guarantee. Here, the BEFORE INSERT trigger on `releves_km` already guarantees `NEW.km` is safe to write directly — a plain assignment is correct and simpler, and clamping would silently mask a bug if it ever mismatched.

```sql
CREATE OR REPLACE FUNCTION sync_moto_km_depuis_releve()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE motos SET km = NEW.km, updated_at = NOW() WHERE id = NEW.moto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_moto_km
  AFTER INSERT ON releves_km
  FOR EACH ROW EXECUTE FUNCTION sync_moto_km_depuis_releve();
```

### Pattern 3: Shared validation function in `supabase.js` — single call site for all 3 existing write paths (answers Research Question 2)

**What:** One new function, e.g. `RelevesKm.enregistrer(garage_id, moto_id, { km, type_evenement, acteur_type, acteur_id, note })`, that performs the `releves_km` insert (letting the DB trigger be the actual gate) and normalizes both the success and the PGRST116-rejection cases into a consistent return shape (`{ accepted: true, releve }` or `{ accepted: false, km_actuel, km_tente }`).

**Current code — re-verified this research pass, confirmed accurate vs PITFALLS.md:**

```javascript
// supabase.js L350-356 — Motos.update() — km currently fully open, no validation, no role gate
async update(id, garage_id, payload) {
  const allowed = ['km','pneu_av','pneu_ar','pneu_km_montage','couleur','photo_url'];
  const clean   = Object.fromEntries(Object.entries(payload).filter(([k]) => allowed.includes(k)));
  const { data, error } = await supabase.from('motos').update(clean).eq('id', id).eq('garage_id', garage_id).select().single();
  if (error) throw new Error(error.message);
  return data;
},
```
**Fix:** remove `'km'` from `allowed`. `pneu_av`/`pneu_ar`/`pneu_km_montage` stay untouched this phase (Phase 27 scope).

```javascript
// supabase.js L397-412 — Interventions.create() — km fully disconnected from motos.km today
async create(garage_id, moto_id, payload) {
  const inter = await insert('interventions', {
    moto_id, garage_id,
    type: payload.type, titre: payload.titre, description: payload.description || '',
    km: payload.km,   // <-- never compared to motos.km, never validated
    technicien_id: payload.technicien_id || null,
    montant_ht: payload.montant_ht || 0, montant_ttc: payload.montant_ttc || 0,
    date_intervention: payload.date || new Date().toISOString().split('T')[0]
  });
  const { data: moto } = await supabase.from('motos').select('score, couleur_dossier').eq('id', moto_id).single();
  return { intervention: inter, nouveau_score: moto?.score, nouvelle_couleur: moto?.couleur_dossier };
},
```
**Fix:** route `payload.km` (when present) through `RelevesKm.enregistrer()` before/alongside the `interventions` insert. **See Open Questions — what happens on rejection here is not yet decided by CONTEXT.md.**

```javascript
// supabase.js L893-923 — OrdresReparation.cloturer() — ad-hoc guard, NOT reject+log, silent skip on regression
async cloturer(id, garage_id, { km_sortie }) {
  const or = await OrdresReparation._getOrRaw(id, garage_id);
  if (or.statut !== 'en_cours')
    throw new Error(`Transition interdite : seul un OR 'en_cours' peut être clôturé (statut actuel: '${or.statut}')`);
  if (km_sortie < (or.km_entree || 0))
    throw new Error(`km_sortie (${km_sortie}) doit être >= km_entree (${or.km_entree || 0})`);
  // ... totals recalc ...
  await supabase.from('ordres_reparation').update({ statut: 'termine', km_sortie, date_cloture: new Date().toISOString() }).eq('id', id);

  const { data: moto } = await supabase.from('motos').select('km').eq('id', or.moto_id).single();
  if (moto && km_sortie > moto.km) {
    await supabase.from('motos').update({ km: km_sortie }).eq('id', or.moto_id);  // <-- direct write, bypasses everything
  }
  // else: silent no-op — exactly the "skip, not reject+log" behavior PITFALLS.md flagged
```
**Fix:** replace the final `if (moto && km_sortie > moto.km) { direct update }` block with a call to `RelevesKm.enregistrer(garage_id, or.moto_id, { km: km_sortie, type_evenement: 'lecture', acteur_type: 'garage', acteur_id: ... })`, surfacing `accepted: false` as part of the cloture response instead of silently doing nothing. Note: the existing `km_sortie < or.km_entree` guard is a *different*, OR-internal invariant (exit km can't be less than entry km) — keep it, it's orthogonal to the moto-wide monotonic check.

### Pattern 4: RLS-enabled-no-policy, documented per exact existing convention (answers Research Question 3)

**Exact comment convention already live at `schema.sql` L689-702** (verified, matches CONTEXT.md's citation exactly):

```sql
ALTER TABLE garage_users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_device_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_send_log            ENABLE ROW LEVEL SECURITY;
-- garage_users / client_device_tokens / push_send_log : RLS enabled with NO explicit
-- policies (confirmed via pg_policies/pg_class.relrowsecurity, plan 19-01) — default-deny
-- for anon/authenticated; only service_role (used by supabase.js) can read/write these tables.

ALTER TABLE billing_events                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE motos_proprietaires_historique ENABLE ROW LEVEL SECURITY;
ALTER TABLE liaisons_client_garage         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reclamations_moto              ENABLE ROW LEVEL SECURITY;
-- Gap B (Phase 21) : RLS enabled with NO explicit policies (default-deny for anon/authenticated;
-- only service_role, utilisé par supabase.js, peut lire/écrire) — même état confirmé qu'en Phase 19
-- pour garage_users/client_device_tokens/push_send_log. Confirmé live (sonde REST anon-equivalent,
-- publishable key, Phase 21 plan 03) : ...
```

**Mirror for the 3 new tables (illustrative wording, adapt table names to whatever Phase 23 lands on):**
```sql
ALTER TABLE consommables         ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos_consommables  ENABLE ROW LEVEL SECURITY;
ALTER TABLE releves_km           ENABLE ROW LEVEL SECURITY;
ALTER TABLE releves_km_rejets    ENABLE ROW LEVEL SECURITY;
-- Phase 23 (v1.6) : RLS enabled with NO explicit policies, INTENTIONAL — same pattern as
-- garage_users/client_device_tokens/push_send_log (Phase 19) and the 4 Gap B tables (Phase 21).
-- Default-deny for anon/authenticated; only service_role (used by supabase.js) can read/write.
-- All real authorization (requireRole() + moto_id/garage_id ownership check) lives in
-- motokey-api.js, added in a later phase (25) when the HTTP endpoints are built — Phase 23 ships
-- schema-only, so there is no client-reachable path to these tables yet regardless.
```

### Anti-Patterns to Avoid

- **Reusing `trg_update_km`'s `GREATEST()` clamp semantics for the new trigger:** that pattern silently hides regressions instead of flagging them — wrong tool for an anti-fraud requirement (STACK.md Alternatives Considered, confirmed).
- **FK'ing any of the 3 new tables to `client_id`:** contradicts the L8 polymorphic-ownership model (`motos.proprietaire_type`) — always resolve ownership via `moto_id` → `motos` join (ARCHITECTURE.md Anti-Pattern 3, directly applicable, unchanged for this phase).
- **Shipping the migration without the same-commit `schema.sql` update + `bootstrap-fresh-schema.js` verification** — this is the exact root cause the entire v1.5 milestone (3 phases) existed to fix (ARCHITECTURE.md Anti-Pattern 2).
- **Letting the trigger inspect JWT/role data:** Postgres triggers have no access to the Express request context. The `remplacement_compteur` PRO+ gate must be enforced by `requireRole('PRO')` at the endpoint layer (future phase) — the trigger only trusts that `type_evenement` was set correctly by already-authorized application code (STACK.md, confirmed, directly applicable).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Cross-row km monotonic invariant | A `CHECK` constraint referencing another row (Postgres rejects true cross-row `CHECK`s at DDL time) or a denormalized "previous km" column trusted from the app | `BEFORE INSERT` trigger (Pattern 1) | Standard, stable Postgres semantics — not project-specific, HIGH confidence |
| Reject-and-log-atomically | `dblink`/autonomous transaction extension | `RETURN NULL` from the `BEFORE INSERT` trigger after writing the log row (Pattern 1) | Achieves the same outcome with zero new extensions, using documented standard trigger-return semantics |
| Migration application to prod | A custom migration-runner script | Existing convention: apply via Supabase Dashboard SQL Editor manually, same as every prior migration (no automated runner exists in this codebase, confirmed by STACK.md/ARCHITECTURE.md) | Consistency — introducing a runner now would be a new, isolated pattern for one phase |
| Request payload validation for the shared km function | A schema-validation library (`zod`/`joi`/`ajv`) | Hand-rolled `if`/`&&` checks, matching every existing endpoint in this codebase (confirmed: zero validation libs in `package.json`) | Consistency (STACK.md, confirmed) |

**Key insight:** every piece of this phase has a live, working precedent already in `schema.sql`/`supabase.js`. The discipline is reuse-with-adaptation (clamp → reject, single-writer → shared-function), not new invention.

## Runtime State Inventory

> This phase is not a rename/rebrand, but it closes 3 live write paths against existing prod data, and the trigger's correctness depends on prod `motos.km` state — included per the same spirit (a grep of the code finds files; it does not find the runtime-data gap below).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Every existing moto in prod already has a non-empty `motos.km` value; `releves_km` will start empty. A naive `MAX(km) FROM releves_km WHERE moto_id=X` for any existing moto's first-ever reading returns `NULL`, and `NEW.km < NULL` is `NULL` (falsy) in PL/pgSQL — the check would silently pass regardless of the submitted value for every moto's first reading. | **Code edit, not data migration.** The trigger must compare against `GREATEST(motos.km, COALESCE(MAX(releves_km.km), 0))`, never `MAX(releves_km.km)` alone (Pattern 1, already reflected in the example trigger above). No backfill of historical `releves_km` rows is required for correctness — the `motos.km` baseline read at check-time is sufficient. (Optional, not required this phase: seeding one `releves_km` row per existing moto with `km = motos.km, type_evenement = 'lecture_initiale'` for a cleaner audit trail — left to planner's discretion, not a correctness requirement.) |
| Live service config | None — no external service (n8n, Datadog, etc.) stores km-related config outside this repo. | None. |
| OS-registered state | None — no cron/scheduler/task references km data (the reminder cron is Phase 26, out of scope here). | None. |
| Secrets/env vars | None new required for the migration/trigger itself. `FRESH_DB_URL` (used only by `scripts/bootstrap-fresh-schema.js` for the mandatory pre-sign-off verification) is **not currently set** in `.env` — see Environment Availability below. | Human checkpoint: create a disposable Supabase project and set `FRESH_DB_URL`, same as Phase 22's precedent, before the bootstrap verification step can run. |
| Build artifacts | None — no compiled/installed package embeds km logic. | None — verified by direct read, nothing found. |

## Common Pitfalls

### Pitfall A: NULL-safe baseline is the single highest-risk correctness gap in this phase

**What goes wrong:** If the trigger only checks `NEW.km < (SELECT MAX(km) FROM releves_km WHERE moto_id = NEW.moto_id)`, every existing moto's first-ever `releves_km` insert passes regardless of value, because the subquery returns `NULL` and any comparison against `NULL` is `NULL` (falsy) in PL/pgSQL — not an error, not a warning, just silently permissive. This would look correct in any test that inserts *two* readings for the *same* moto (second reading correctly rejected if lower) but fail silently for the realistic first-use case: an existing prod moto with `motos.km = 40000` getting its first `releves_km` row with `km = 100`.

**Why it happens:** The natural mental model ("compare against the last reading") maps cleanly to a fresh/greenfield table, but `motos.km` already has real history that `releves_km` doesn't yet reflect.

**How to avoid:** `GREATEST(motos.km, COALESCE(MAX(releves_km.km), 0))` as the comparison baseline, always (Pattern 1).

**Warning signs:** A trigger or test that only exercises "insert two rows for the same moto, second one lower, expect rejection" without ever testing "insert one row for a moto with pre-existing `motos.km`, lower than that, expect rejection."

### Pitfall B: `RAISE EXCEPTION` + app-layer catch does not satisfy "log for every actor" (resolves SUMMARY.md's Research Flag)

**What goes wrong:** A `RAISE EXCEPTION` inside the trigger rolls back everything in that statement's transaction, including any log-table `INSERT` the trigger itself performed earlier in the same execution — so a naive "log then raise" trigger silently loses the log row every single time (100% failure rate for that requirement, not a rare race). Moving the log write to an app-layer `catch` block works, but only covers callers that go through `supabase.js`'s specific catch site — a hypothetical raw-SQL insert against `releves_km` (future script, Dashboard) would still be correctly rejected but leave zero trace.

**How to avoid:** Use `RETURN NULL` (Pattern 1) — no exception is raised, so the log `INSERT` executed earlier in the same trigger invocation is never rolled back, and this holds regardless of which code path attempted the write.

**Warning signs:** A migration file with `RAISE EXCEPTION` inside a trigger that also tries to write a log row in the same function body — this combination does not durably log, by design of Postgres transaction semantics.

### Pitfall C: `Interventions.create()`'s km semantics are genuinely ambiguous — don't silently pick a behavior

**What goes wrong:** Unlike a dedicated "km reading" endpoint or an OR closure (both represent "the moto's odometer right now"), an intervention record's `km` field could legitimately be entered for a past event (late data entry) or could be redundant with a more recent reading already on file. If `Interventions.create()` is wired to call the shared validation function and hard-fails the whole intervention creation on any regression, a mécano entering a backdated service record for legitimate reasons gets blocked from creating the intervention at all — not just from bumping `motos.km`.

**How to avoid:** This is a product decision, not something research resolved — see Open Questions below. Whatever is decided, do not let it silently fall out of "just call the same function and let it throw."

**Warning signs:** A test/manual check that creates an intervention with `km` lower than `motos.km` and observes the *whole intervention* silently fail to save (not just the km sync), when that wasn't an explicit decision.

## Runtime State Inventory — see above (folded in per phase type)

## Code Examples

See Architecture Patterns 1-4 above for the complete illustrative trigger functions, sync trigger, shared `supabase.js` function shape, and RLS comment block — all derived from live precedent in this exact codebase (`schema.sql` L302, L624-643, L689-702; `supabase.js` L350-356, L397-412, L893-923).

## State of the Art

| Old Approach (this codebase, today) | New Approach (this phase) | When Changed | Impact |
|--------------------------------------|-----------------------------|---------------|--------|
| `motos.km` directly writable via `Motos.update()`'s `allowed` whitelist, zero validation | `km` removed from `allowed`; all writes go through `releves_km` + shared validation function | Phase 23 | Closes the single largest anti-fraud bypass identified in PITFALLS.md Pitfall 1 |
| `Interventions.create()` writes `interventions.km` fully disconnected from `motos.km` | Routes through the shared validation function (exact rejection behavior: open question, see below) | Phase 23 | Closes PITFALLS.md Pitfall 2 (partially — pending the open question resolution) |
| `OrdresReparation.cloturer()` silently skips the `motos.km` update on regression (no log) | Calls the shared validation function, rejection surfaced in the cloture response + logged | Phase 23 | Closes PITFALLS.md Pitfall 2 |
| `trg_update_km` clamps (`GREATEST`) on `interventions` writes | New `trg_sync_moto_km` on `releves_km` does a plain assignment, relying on the upstream BEFORE trigger's guarantee | Phase 23 (new trigger, old one untouched — `trg_update_km` still fires on `interventions` inserts unless explicitly modified) | **Note:** `trg_update_km` is NOT being removed this phase per current scope (CONTEXT.md doesn't mention it) — but since `Interventions.create()`'s km write path is being redirected through the shared validation function, `trg_update_km` (AFTER INSERT/UPDATE ON interventions, still live) would **also** fire and independently `GREATEST`-clamp `motos.km` from `interventions.km` — creating a second, uncoordinated writer to `motos.km` unless explicitly addressed. See Open Questions. |

## Open Questions

1. **What should `Interventions.create()` do when `payload.km` is lower than the moto's current km — reject the whole intervention, or accept the intervention but skip/log the km sync?**
   - What we know: CONTEXT.md D-04 says route it through the shared validation function "plutôt que d'ignorer motos.km" — but doesn't specify the failure behavior.
   - What's unclear: Whether a legitimate backdated intervention (mécano entering a past service record) should be blocked entirely by the anti-fraud gate, or allowed to save with its km value simply not propagated to `motos.km`/`releves_km`.
   - Recommendation: Surface this explicitly to Mehdi during planning (or make an explicit, documented call if planning proceeds without him) — do not let this fall out implicitly from "the function throws, so intervention creation throws too."

2. **`trg_update_km` (existing, AFTER INSERT/UPDATE ON `interventions`) is not mentioned in CONTEXT.md's scope — does it need to be dropped/modified once `Interventions.create()` also drives `releves_km`?**
   - What we know: `trg_update_km` currently does `UPDATE motos SET km = GREATEST(km, NEW.km) WHERE id = NEW.moto_id` on every `interventions` insert/update — this is a second, independent writer to `motos.km`, uncoordinated with the new `releves_km`-driven sync trigger.
   - What's unclear: If both triggers stay live, `motos.km` gets written by two different mechanisms for the same intervention-creation event (once via the new shared-validation-function → `releves_km` → `trg_sync_moto_km` path, once via the old `trg_update_km` reading straight from `interventions.km`). Depending on ordering/values this could be harmless (idempotent, same final value) or could reintroduce a silent clamp-not-reject path that undermines the whole point of this phase.
   - Recommendation: Decide explicitly during planning whether `trg_update_km` should be dropped in this phase (cleanest — it becomes fully redundant once `releves_km` is the sole path) or left alone with a documented reason. Given this phase's own stated goal ("plus aucun bypass possible" per KM-04's requirement text), leaving a second live writer to `motos.km` unaddressed would arguably violate the requirement's own wording. Flag for explicit resolution, not silent inheritance.

3. **Should a `releves_km` row be seeded for every existing moto at migration time (baseline audit trail), or is the `motos.km`-as-baseline check (Pitfall A fix) sufficient?**
   - What we know: The NULL-safe `GREATEST()` fix makes the trigger *correct* without any backfill.
   - What's unclear: Whether the garage-facing "history of readings" view (a later UI phase) would look confusingly empty/discontinuous for existing motos without a seeded baseline row.
   - Recommendation: Not required for Phase 23 correctness; note as a nice-to-have for whoever builds the history UI (Phase 27), not a blocker here.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Supabase Postgres (prod) | Applying the migration | ✓ | current prod (unchanged) | — |
| `pg` npm package | `scripts/bootstrap-fresh-schema.js` | ✓ (installed in `node_modules`, `--no-save`) | present, not pinned in `package.json` (existing convention) | If wiped: `npm install pg --no-save` |
| `dotenv` npm package | Same script | ✓ | present | — |
| `FRESH_DB_URL` env var (disposable Supabase project connection string) | Mandatory bootstrap verification step before phase sign-off | ✗ | — | **No fallback with equivalent confidence.** Requires the same human checkpoint used in Phase 22 (create a new throwaway Supabase project, paste its direct-connection string into `.env`). This blocks the "prove bootstrap is clean" gate specifically — the migration itself can still be written/applied to prod without it, but the phase's own non-functional requirement (schema.sql discipline verification) cannot be completed until this exists. |

**Missing dependencies with no fallback:**
- `FRESH_DB_URL` — blocks the bootstrap-verification step (not the migration work itself). Flag as a checkpoint for Mehdi early in phase execution, not at the end.

**Missing dependencies with fallback:**
- None beyond the above.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — this codebase has no automated test framework (no Jest/Mocha/pytest; confirmed via `package.json`, only `"test": "node test-api.js"`, a hand-rolled HTTP smoke-test script with `OK`/`KO` counters, 63 lines). |
| Config file | none — see Wave 0 |
| Quick run command | `psql`/`pg`-based ad hoc script exercising the trigger directly (no HTTP layer involved this phase — no endpoints exist yet) |
| Full suite command | `node scripts/bootstrap-fresh-schema.js` (clean bootstrap against a throwaway project) + a new small trigger-verification script (Wave 0 gap) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| KM-01 | Reject regression + log | DB-level (trigger) | `node scripts/test-releves-km-trigger.js` — direct `pg` insert attempts against a test/throwaway DB, asserting rejected rows are cancelled (0 rows back) and a `releves_km_rejets` row exists | ❌ Wave 0 |
| KM-01 | NULL-safe baseline (Pitfall A) | DB-level (trigger) | Same script — case: moto with pre-existing `motos.km`, zero prior `releves_km` rows, insert a lower value, assert rejection | ❌ Wave 0 |
| KM-04 | 3 write paths route through shared validation | Integration (via `supabase.js` functions directly, no HTTP needed since no endpoints exist this phase) | Extend `test-api.js` is not applicable yet (no endpoints) — instead, a small Node script calling `Motos.update()`, `Interventions.create()`, `OrdresReparation.cloturer()` directly against a throwaway/test DB and asserting `km` never lands on `motos` except via the shared path | ❌ Wave 0 |
| CONSO-02 | `type_consommable` CHECK rejects invalid values, accepts the 9 v1 types | DB-level | Same or a sibling script: attempt `INSERT INTO consommables (..., type_consommable) VALUES (..., 'invalide')`, assert Postgres error `23514` (check_violation) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Manual `psql`/`pg`-script verification of the specific trigger behavior just written (no HTTP endpoints to smoke-test this phase).
- **Per wave merge:** `node scripts/bootstrap-fresh-schema.js` against the throwaway project (requires `FRESH_DB_URL`, see Environment Availability).
- **Phase gate:** Bootstrap script clean + `pg_policies` reviewed for the 3(+1) new tables showing zero policies (intentional) + trigger-verification script green, before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `scripts/test-releves-km-trigger.js` (or similar name) — a small `pg`-based script (mirrors `scripts/bootstrap-fresh-schema.js`'s connection style) exercising: (a) normal accepted reading, (b) rejected regression + log row assertion, (c) NULL-safe first-reading-for-existing-moto case (Pitfall A), (d) `remplacement_compteur` bypass. This does not exist yet — no automated coverage of trigger logic exists in this codebase today.
- [ ] `FRESH_DB_URL` in `.env` — human checkpoint (create disposable Supabase project), same as Phase 22's precedent, needed before the bootstrap-verification gate can run at all.
- [ ] No framework install needed — the project's own convention (hand-rolled Node scripts against `pg`/`http`) is sufficient and consistent; do not introduce Jest/Mocha for this phase alone.

## Sources

### Primary (HIGH confidence)
- Direct file reads, this research pass (2026-07-14): `supabase.js` (L235-424, L825-923 — `Motos`, `Interventions`, `OrdresReparation` objects, all 3 write-path line numbers re-confirmed), `schema.sql` (L1-40 header/DROP block, L236-303 `motos`/`interventions` table defs incl. `niveau_preuve`/`signature_hash`, L585-643 trigger definitions, L670-810 RLS section), `sql/migrations/22_devis_undocumented_columns.sql` (migration file style convention), `scripts/bootstrap-fresh-schema.js` (verification tool, `FRESH_DB_URL` requirement), `.env` (confirmed `FRESH_DB_URL` absent, Supabase keys present), `package.json` (confirmed no test framework, `pg`/`dotenv` present in `node_modules`)
- `.planning/phases/23-.../23-CONTEXT.md` — locked decisions (D-01 through D-04), Claude's discretion, deferred ideas
- `.planning/REQUIREMENTS.md` — exact KM-01/KM-04/CONSO-02 requirement text
- `.planning/research/PITFALLS.md`, `ARCHITECTURE.md`, `STACK.md`, `SUMMARY.md` — milestone-level research, cross-referenced and re-verified (not blindly trusted) against current code state this pass

### Secondary (MEDIUM confidence)
- General PostgreSQL trigger semantics (`RETURN NULL` from a `BEFORE ROW` trigger cancels that row's operation without raising an exception; `RAISE EXCEPTION` rolls back the entire enclosing transaction including prior statements in the same trigger invocation) — standard, well-documented, stable Postgres behavior, not independently re-fetched from official docs this pass but treated as HIGH confidence given long-standing RDBMS semantics (same treatment PITFALLS.md/STACK.md already applied to the `CHECK`-constraint-cannot-see-other-rows claim).

### Tertiary (LOW confidence)
- None — all findings this pass were either direct code reads or standard, stable Postgres semantics.

## Metadata

**Confidence breakdown:**
- Standard stack (no new deps, trigger idiom reuse): HIGH — direct precedent in `schema.sql`, no new tooling
- Architecture (shared validation function, RLS convention, trigger split): HIGH — all patterns mirror live, working code in this exact repo
- Pitfalls (NULL-safe baseline, RAISE EXCEPTION rollback behavior): HIGH — first is a direct logical consequence of the schema state confirmed by direct read (`motos.km` populated, `releves_km` doesn't exist yet); second is standard Postgres transaction semantics
- Open Questions (Interventions.create() rejection behavior, `trg_update_km` fate): Explicitly unresolved — flagged for planner/Mehdi, not guessed at

**Research date:** 2026-07-14
**Valid until:** No hard expiry — this is schema/trigger design against a stable, already-deployed Postgres feature set (no fast-moving external dependency). Re-verify write-path line numbers only if `supabase.js` changes materially before this phase is implemented.
