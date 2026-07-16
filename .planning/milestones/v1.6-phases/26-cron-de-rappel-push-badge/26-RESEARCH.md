# Phase 26: Cron de Rappel + Push/Badge - Research

**Researched:** 2026-07-15
**Domain:** Cron job pattern (HTTP-triggered), push notification fan-out (Expo), idempotent state persistence, backend-computed badge exposure — all within an existing Node.js/Express + Supabase codebase (no new libraries)
**Confidence:** HIGH (this phase is 95% adaptation of existing, already-proven code in the same repo — not new technology)

## Summary

Phase 26 is a close structural clone of the existing Phase 17 `services/maintenanceAlertService.js` + `/cron/maintenance-alerts` pattern, simplified from a 3-tier ranked state machine (ok/warning/urgent) to a binary one (late/not late). Every piece of infrastructure needed already exists and is proven in prod: `pushService.sendPush()` handles fan-out + idempotency internally via `push_send_log`, the cron-auth pattern (`X-Cron-Secret`/`CRON_SECRET`) is a documented, accepted exception to the `requireRole()` constraint in `.planning/PROJECT.md`, and the "computed-at-read, no extra DB field" precedent for badges already exists (`UX-02`'s `alerte_entretien` field on `Motos.list()`). No new npm packages, no new external service, no schema uncertainty (migration 23 and `schema.sql` are byte-identical for `consommables`/`photos_consommables`, migration `24_*.sql` is confirmed the next free number).

The only genuinely new logic is: (1) the per-type threshold map (D-01, already fully specified in CONTEXT.md, hardcoded in the service, no migration), (2) the "since last photo" reference resolution (latest `photos_consommables.km_a_la_photo` for a `consommable_id`, falling back to `consommables.km_montage`), and (3) the reset-on-new-photo behavior (D-05) which must be wired into `PhotosConsommables.insert()`.

**Primary recommendation:** Create `services/consommableRappelService.js` (new service file, `runConsommableRappelCron()`), mirroring `maintenanceAlertService.js` structure exactly but with binary state; add `POST /cron/rappels-photo-consommables` in `motokey-api.js` right after the existing `/cron/maintenance-alerts` block, same `X-Cron-Secret` pattern; add migration `sql/migrations/24_consommables_rappel_state.sql` with the 3 nullable columns; implement D-05 reset inside `supabase.js`'s `PhotosConsommables.insert()` (not a DB trigger) so the reset logic lives next to the other consommables business logic in JS, consistent with how `Consommables.upsert()`/`RelevesKm.enregistrer()` already centralize logic in that layer rather than in triggers, and export the pure threshold/lateness calculation as a reusable function so Phase 27's badge/gauge UI (and this phase's own badge exposure) never re-implement it.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Seuils par type de consommable (D-01)** — hardcoded map in the service, no migration, no new table:

| Type | Seuil km | Seuil mois |
|---|---|---|
| `pneu_av` | 3000 | 6 |
| `pneu_ar` | 2500 | 6 |
| `chaine` | 3000 | 6 |
| `plaquettes_av` | 3000 | 6 |
| `plaquettes_ar` | 4500 | 6 |
| `disque_av` | 8000 | 12 |
| `disque_ar` | 8000 | 12 |
| `huile_moteur` | 5000 | 6 |
| `liquide_frein` | 6000 | 12 |

First of the two thresholds (km OR months) crossed triggers the alert.

**Portée et fréquence (D-02, D-03):** ONE grouped push per moto (not per consommable) — if several consommables on the same moto cross their threshold in the same cron pass, one message lists all of them. No periodic re-nag: one reminder per threshold crossing; the cron does not re-fire while the reference (last-photo km/date) hasn't changed. Binary state (late/not-late) — no rank comparison logic needed (unlike `maintenanceAlertService.js`'s 3-tier rank), a NULL/non-NULL check on the "last reminder sent" column suffices.

**Anti-spam / persistance (D-04):** New columns on `consommables`: `dernier_rappel_envoye_at` (TIMESTAMPTZ, nullable), `dernier_rappel_km` (INTEGER, nullable). Set when the cron sends a reminder for that consommable. Same spirit as `motos.last_maintenance_tier_notified` (Phase 17/migration 18) but adapted to the binary case — no dedicated new table.

**Reset automatique (D-05):** As soon as a new row is inserted into `photos_consommables` for a given `consommable_id`, `dernier_rappel_envoye_at`/`dernier_rappel_km` on the corresponding `consommables` row reset to `NULL`. The "since last photo" counter restarts naturally; the cron can re-notify on the next threshold crossing.

**Calcul "depuis la dernière photo" (D-06, D-07, D-08):** If a consommable has never been photographed, the starting reference is `consommables.km_montage`/`consommables.date_montage`. New column `km_a_la_photo` (INTEGER, nullable) on `photos_consommables`, captured = `motos.km` at upload time — the cron compares current `motos.km` to the most recent photo's `km_a_la_photo` (fallback `km_montage` if no photo exists) — avoids an expensive/approximate join on `releves_km` by date at every cron run. A consommable with no exploitable reference at all (neither `km_montage` nor any `km_a_la_photo`) is excluded from the calc (protects against corrupted/inconsistent state only — should not occur in practice given Phase 25 D-05 auto-creation guarantees a first photo always carries `km_a_la_photo`).

### Claude's Discretion

- **Badge garage (GAUGE-04) exposure mechanism:** dedicated endpoint vs raw column exposure vs computed field on existing moto endpoints — CONTEXT.md leans toward "privilégier une exposition backend réutilisable" to avoid duplicating D-01 threshold logic in the Phase 27 frontend. See recommendation below.
- **Exact route name** for the cron endpoint (example given: `/cron/rappels-photo-consommables`) — follow the `/cron/maintenance-alerts` pattern exactly (`X-Cron-Secret`/`CRON_SECRET`, no JWT).
- **Push message text format** (title/body, listing late consommables) — no product preference expressed this session.
- **Push payload `data` shape** — must stay consistent with the existing `{ type: 'moto_entretien', motoId }` pattern from `maintenanceAlertService.js`.
- **Next migration number** — confirmed `24_*.sql` (see Environment/Schema verification below).

### Deferred Ideas (OUT OF SCOPE)

None — the discussion stayed within phase scope (no new capability proposed out of scope).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GAUGE-03 | Client receives push reminder when km-since-last-photo hits 3000km OR 6 months elapsed (first of the two) | `maintenanceAlertService.js` pattern (cron structure) + `pushService.sendPush()` (fan-out/idempotency) fully documented below; D-01 thresholds table is per-type, not the flat 3000km/6mo in the requirement text — CONTEXT.md's D-01 table supersedes/refines the flat requirement wording (confirmed user-approved, not a conflict) |
| GAUGE-04 | Garage sees a badge/indicator for garage/unclaimed motos (no client account to notify) | `proprietaire_type_enum` + `moto_proprietaire_coherence` CHECK constraint (migration 13) confirm the exact filter condition; `Motos.list()`'s existing `alerte_entretien` computed-field precedent (UX-02) is the model to replicate |

## Standard Stack

### Core

No new libraries. This phase reuses:

| Library | Version (installed) | Purpose | Why Standard (already in this repo) |
|---------|---------|---------|--------------|
| `expo-server-sdk` | already in `package.json` (used by `pushService.js`) | Push delivery to Expo push tokens | Already the sole push mechanism in prod (Phase 12/13/16/17); do not introduce a second push path |
| `@supabase/supabase-js` | already in `package.json` | DB access via `supabase.js` `SBLayer` | Sole DB access layer in this codebase |

**No `npm install` needed for this phase.**

### Don't build

No new abstraction layer is needed — `pushService.sendPush(clientId, payload, idempotencyKey)` already does everything: token lookup, per-device idempotency-key suffixing, `push_send_log` insert-first dedup, Expo dispatch, dev-mode console fallback.

## Architecture Patterns

### Recommended file layout for this phase

```
services/
├── maintenanceAlertService.js        # existing Phase 17 pattern — read, do not modify
├── consommableRappelService.js       # NEW — this phase's cron logic
sql/migrations/
├── 23_consommables_km.sql            # existing
├── 24_consommables_rappel_state.sql  # NEW — 3 columns (see Migration section)
motokey-api.js                        # add POST /cron/rappels-photo-consommables next to /cron/maintenance-alerts
supabase.js                           # extend Consommables/PhotosConsommables + (optionally) Motos.list()
```

### Pattern 1: The exact cron pattern to replicate (`services/maintenanceAlertService.js`)

**What:** A single exported async function, called by the HTTP cron endpoint, that:
1. Looks up the relevant motos (Phase 17: `client_id IS NOT NULL`; Phase 26 needs a wider lookup — see below since GAUGE-03 needs client motos and GAUGE-04 needs `garage`/`inconnu` motos, i.e. potentially ALL motos, branching behavior on `proprietaire_type`)
2. Per moto, computes state via a pure helper (Phase 17 delegates to `SBLayer.Entretien.getPlan`; Phase 26 needs a new pure function operating on `consommables` + latest `photos_consommables` per consommable)
3. Compares computed state to persisted state to decide whether to notify (Phase 17: rank comparison; Phase 26: NULL-check per D-03)
4. Sends push conditionally (only for `proprietaire_type = 'client'` — GAUGE-03); for `proprietaire_type IN ('garage','inconnu')` there is no push send (GAUGE-04, no client account) — the cron still updates persisted state so a subsequent badge-exposure read is fresh, OR (see discretion below) the badge is computed at read-time and the cron doesn't even need to persist state for garage/inconnu motos, only for client motos where anti-spam idempotency (D-04) is actually needed.
5. Persists new state (only where it changed) via `.update()`
6. Returns a `{ scanned, notified, details }` summary and logs it

**Verbatim structure from `services/maintenanceAlertService.js` (lines 1-94, full file read):**

```javascript
'use strict';
const SBLayer = require('../supabase');
const pushService = require('./pushService');

const TIER_RANK = { null: 0, ok: 0, due: 0, future: 0, warning: 1, urgent: 2 };

async function runMaintenanceAlertCron() {
  const { data: motos, error } = await SBLayer.supabase
    .from('motos')
    .select('id, client_id, km, marque, modele, last_maintenance_tier_notified')
    .not('client_id', 'is', null);
  // ... per-moto loop: compute worst tier, compare vs last_maintenance_tier_notified,
  // sendPush if currentRank > lastRank, persist new tier if changed ...
}
module.exports = { runMaintenanceAlertCron };
```

**When to use for Phase 26:** Adapt structurally, but:
- Query must select `id, proprietaire_type, km` (not filter to `client_id IS NOT NULL` — GAUGE-04 motos have `client_id IS NULL` per the `moto_proprietaire_coherence` CHECK) — join/lookup `consommables` + latest `photos_consommables` per moto.
- Replace `TIER_RANK` comparison with a simple `dernier_rappel_envoye_at IS NULL` check per **consommable** (not per moto) — D-04's columns live on `consommables`, not `motos`.
- D-02 groups the push **by moto**: collect ALL late consommables for a moto first, then send ONE push (if `proprietaire_type === 'client'`) listing all of them, then persist state for EACH late consommable individually.

### Pattern 2: `pushService.sendPush()` — exact signature, confirmed by reading `services/pushService.js` in full

```javascript
// services/pushService.js line 91
async function sendPush(clientId, payload, idempotencyKey) {
  // 1. Look up ALL active client_device_tokens for clientId
  // 2. If none: return { sent: 0 } — never throws
  // 3. Fan out: for EACH token, suffix idempotencyKey with `::${token}` (per-device dedup)
  //    then call sendToToken(token, {...payload, clientId}, perTokenKey)
  // 4. Returns { sent: N, results: [...] }
}
```

`sendToToken` (lines 35-83) does the actual dedup: **insert-first** into `push_send_log` (UNIQUE `idempotency_key`, migration 17) — a duplicate-key error (23505) short-circuits with `{ skipped: 'duplicate' }`; any OTHER DB error is logged and the send proceeds anyway (fail-open, per the pitfall documented inline: "insert-first ⇒ un envoi échoué consomme quand même la clé"). This means:

**The cron does NOT need its own dedup layer beyond D-04's persisted state.** `sendPush`'s idempotencyKey is a *defense-in-depth* mechanism against double-firing (e.g., cron triggered twice in the same window before D-04's DB write commits), not the primary anti-spam mechanism — D-03/D-04 (the NULL-check on `dernier_rappel_envoye_at`) is the primary guard.

**Confirmed idempotencyKey convention (from `maintenanceAlertService.js` line 65):**
```javascript
const idempotencyKey = `maintenance-alert:${moto.id}:${worst}:${new Date().toISOString().slice(0, 10)}`;
```
Format: `{event-prefix}:{moto.id}:{state-discriminator}:{YYYY-MM-DD}` — day-scoped, so at most one push per moto per calendar day for a given state. **Recommendation for Phase 26**: since the state is binary (not 3-ranked), use a discriminator that captures WHICH consommables are late (so a NEW consommable becoming late the same day still gets its own key, rather than being silently absorbed by an already-consumed day-scoped key for a different consommable on the same moto):
```javascript
const typesLateSlug = lateConsommables.map(c => c.type_consommable).sort().join('+');
const idempotencyKey = `rappel-photo:${moto.id}:${typesLateSlug}:${new Date().toISOString().slice(0, 10)}`;
```
This preserves the day-scoped convention while being correct for the D-02 grouped-push case (the whole point of D-02 is that the push content — which consommables are listed — changes as more consommables cross their threshold, so the key must vary with content, not just with moto+day).

### Pattern 3: The exact cron HTTP endpoint to replicate — `motokey-api.js` lines 749-762

```javascript
  /* CRON — authentifié par secret partagé (X-Cron-Secret), pas de JWT (job planifié sans session utilisateur) */
  if ((p = M('POST', '/cron/maintenance-alerts')) !== null) {
    const secret = req.headers['x-cron-secret'];
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return fail(res, 'Non autorisé', 401, 'UNAUTHORIZED');
    }
    try {
      const result = await maintenanceAlertService.runMaintenanceAlertCron();
      return ok(res, result, 'Cron entretien exécuté');
    } catch (e) {
      console.error('[cron] maintenance-alerts échoué:', e.message);
      return fail(res, e.message, 500, 'CRON_ERROR');
    }
  }
```

**Replicate verbatim structure** for `POST /cron/rappels-photo-consommables`, placed immediately after this block (same file, same section, before `/* ROOT */`). Requires `const consommableRappelService = require('./services/consommableRappelService');` added near the top alongside the existing `maintenanceAlertService` require.

**Confirmed: this endpoint does NOT need `requireRole()`.** `.planning/PROJECT.md` Constraints says "`requireRole()` obligatoire sur tout nouvel endpoint sensible", but the pre-existing `/cron/maintenance-alerts` endpoint is the established, accepted exception — cron jobs authenticate via `X-Cron-Secret`/`CRON_SECRET` because there is no user session (external scheduler call, not a JWT-bearing request). This precedent directly answers the CLAUDE.md/PROJECT.md compliance question raised by the phase description.

### Pattern 4 (GAUGE-04 discretion): Badge exposure — recommend extending `Motos.list()`/`getById()` with a computed field

**Precedent found in `supabase.js` `Motos.list()` (lines 235-269):** UX-02's `alerte_entretien` is already computed at read-time, per moto, with NO dedicated DB column:
```javascript
return rows.map(m => {
  const ops = byMoto[m.id] || [];
  let pctMax = 0;
  for (const op of ops) { /* ... */ }
  return { ...m, pct_max_usage: pctMax, alerte_entretien: ops.length > 0 && pctMax >= 80 };
});
```

**Recommendation:** Follow this exact precedent for GAUGE-04. Extend `Motos.list()` (and `Motos.getById()`) with a computed field, e.g. `rappel_photo_en_retard: boolean` (+ optionally `consommables_en_retard: string[]` for the badge tooltip), computed by calling the **same pure lateness function** the cron uses (extracted from `consommableRappelService.js`, e.g. `computeConsommablesEnRetard(moto, consommables, latestPhotoByConsommable)`), NOT a duplicate of the threshold map. This is the concrete realization of CONTEXT.md's "privilégier une exposition backend réutilisable" — Phase 27's frontend never needs to know about D-01's threshold table at all; it just renders the boolean/array the backend already computed.

**Why not a dedicated endpoint:** A dedicated `GET /motos/rappels-en-retard` endpoint would ALSO need moto ownership/list logic already present in `Motos.list()` (garage_id scoping, RLS via service-role) — duplicating that plumbing instead of reusing it introduces two places for GAUGE-04's `proprietaire_type IN ('garage','inconnu')` filter to drift apart. Since `app.html`'s garage dashboard already calls `Motos.list()` for its motos grid (same one that already surfaces `alerte_entretien`/`couleur_dossier`), adding `rappel_photo_en_retard` there means Phase 27 gets the badge "for free" wherever that list is already rendered — no new endpoint, no new frontend fetch call.

**Tradeoff to flag for the planner:** Computing lateness at read-time for EVERY moto in `Motos.list()` requires fetching `consommables` + latest `photos_consommables` per moto — same N+1-shaped cost already accepted for `plan_entretien` in the same function (lines 249-256). For a single-garage dashboard list (bounded by garage size, not global), this is acceptable; do NOT reuse this computed-list approach for a hypothetical future cross-garage admin view without reconsidering the cost.

### Anti-Patterns to Avoid

- **Reimplementing the D-01 threshold map in the frontend (Phase 27):** CONTEXT.md explicitly flags this as fragile. The backend must be the single source of truth for "is this consommable late" — see Pattern 4.
- **Adding a second push-dispatch code path:** Do not call Expo/`expo-server-sdk` directly from the new service — always go through `pushService.sendPush()`.
- **Persisting D-04 state on `motos` instead of `consommables`:** The binary lateness state is PER-CONSOMMABLE (a moto can have some consommables late and others not) — do not mirror `motos.last_maintenance_tier_notified` structurally onto `motos`; it belongs on `consommables` per D-04, which is already explicit in CONTEXT.md.
- **A DB trigger for D-05's reset:** see Pitfall/Recommendation below — implement in JS (`PhotosConsommables.insert()`), not via `CREATE TRIGGER`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Push delivery + per-device fan-out | A new Expo dispatch loop | `pushService.sendPush(clientId, payload, idempotencyKey)` | Already handles token lookup, fan-out, per-device idempotency-key suffixing, dev-mode fallback |
| Push send dedup | A new `push_send_log`-alike table | Existing `push_send_log` (migration 17), used internally by `sendToToken` | Already UNIQUE-constrained, insert-first pattern proven in prod since Phase 13/17 |
| Cron trigger auth | A new auth scheme | `X-Cron-Secret` / `process.env.CRON_SECRET`, exact copy of `/cron/maintenance-alerts` | Established, accepted exception to `requireRole()`; introducing a second cron-auth convention would be inconsistent and confusing |
| GAUGE-04 threshold recompute in frontend | New JS in `app.html` mirroring D-01 | Backend-computed field on `Motos.list()`/`getById()` | Single source of truth; matches existing `alerte_entretien` (UX-02) precedent exactly |

**Key insight:** Every piece of infrastructure this phase needs was already built for Phase 17 (maintenance cron) and Phase 12/13 (push). This phase is disciplined re-use, not new engineering — the review bar should be "did you copy the pattern correctly," not "did you invent a good pattern."

## Common Pitfalls

### Pitfall 1: Querying `motos` with `.not('client_id', 'is', null)` like Phase 17 does

**What goes wrong:** Phase 17's query filters to `client_id IS NOT NULL` because MPUSH-04 only ever targets client-owned motos. Phase 26 needs BOTH client motos (GAUGE-03, push) AND `garage`/`inconnu` motos (GAUGE-04, badge, `client_id IS NULL` per the `moto_proprietaire_coherence` CHECK in migration 13). Copy-pasting Phase 17's filter verbatim would silently exclude every GAUGE-04 moto from the cron scan.
**Why it happens:** Structural copy-paste without re-deriving the query filter for the new requirement.
**How to avoid:** Select ALL motos (or explicitly branch the query into two: `proprietaire_type = 'client'` for the push path, `proprietaire_type IN ('garage','inconnu')` for the badge-state-refresh path), branching push-vs-no-push behavior on `moto.proprietaire_type` inside the loop, not via the initial `WHERE`.
**Warning signs:** Cron summary (`scanned` count) is suspiciously close to just the client-owned moto count.

### Pitfall 2: D-05 reset implemented via DB trigger instead of in `PhotosConsommables.insert()`

**What goes wrong:** A `CREATE TRIGGER ... AFTER INSERT ON photos_consommables` that resets `consommables.dernier_rappel_envoye_at`/`dernier_rappel_km` would work, but this codebase's established convention (see `sql/migrations/23_consommables_km.sql`'s own header comment: "RLS activé sans policy explicite... toute l'autorisation réelle vit dans motokey-api.js") is to keep business logic in `supabase.js`/`motokey-api.js`, reserving DB triggers for cross-cutting invariants that MUST hold regardless of application code path (e.g., `verifier_km_monotone`, an anti-fraud guarantee that must survive even a buggy app-layer bypass). D-05's reset is a UX/anti-spam nicety, not an anti-fraud invariant — it belongs in JS.
**Why it happens:** Migration 18's `last_maintenance_tier_notified` precedent is JS-managed (in `maintenanceAlertService.js`'s own `.update()` call), reinforcing the JS-side convention — but a planner unfamiliar with that distinction might default to "DB trigger" because migration 23 already has 2 triggers for km.
**How to avoid:** Implement the reset inside `PhotosConsommables.insert()` in `supabase.js` (2 extra lines: after inserting the photo row, `.update({ dernier_rappel_envoye_at: null, dernier_rappel_km: null }).eq('id', consommable_id)` — only if `consommable_id` is present, which Phase 25's D-05 auto-creation guarantees for the upload path). This keeps the reset colocated with the write path already responsible for consommables state (`Consommables.upsert()`/`PhotosConsommables.insert()` in the same file), consistent with how `Consommables.upsert()` already owns `updated_at`.
**Warning signs:** If implemented as a trigger, a bug surfaces only when the trigger body silently fails or the migration isn't applied in a fresh environment (a class of bug this repo has been bitten by twice already — the reserved-word `analyse` column and the `releves_km_rejets` audit-trail-not-firing incident, both documented in `.planning/STATE.md`/`PROJECT.md`). JS-side logic is easier to unit-test with the existing ad-hoc HTTP test harness (`tests/test-*.js`).

### Pitfall 3: Idempotency key not varying with WHICH consommables are late (D-02 grouped push)

**What goes wrong:** If the idempotencyKey is just `rappel-photo:${moto.id}:${date}` (mirroring Phase 17's `${moto.id}:${worst}:${date}` too literally, dropping the `worst`-equivalent discriminator), and a moto already got a push today for `pneu_av` being late, then LATER the same day `chaine` also crosses its threshold, the second (correctly-grouped, updated-content) push would be silently deduped by `push_send_log`'s UNIQUE constraint — the client never learns about `chaine`.
**Why it happens:** The binary-state simplification (D-03) removes the "rank" concept entirely, but the idempotencyKey still needs SOME content-discriminator to stay correct for D-02's "list grows over time" case — losing the discriminator is an easy oversight when simplifying away the rank system.
**How to avoid:** Include a stable, sorted list of late `type_consommable` values in the key (see Pattern 2's recommended `typesLateSlug`).
**Warning signs:** A test scenario where a SECOND consommable crosses its threshold on the same calendar day as a first one, and the resulting push is a no-op (`{ skipped: 'duplicate' }`) despite new information.

### Pitfall 4: Comparing dates naively for the "6 months" threshold

**What goes wrong:** `date_montage`/photo `created_at` are dates; naive `(Date.now() - refDate) / (1000*60*60*24*30)` month approximations drift and can be off by several days per year, which matters less for a 6-month threshold than a stricter one, but is still worth getting right idiomatically (e.g., using a calendar-month diff, not a fixed-30-days divisor) for consistency with how a human reading "6 mois" would expect the boundary to behave.
**Why it happens:** JS has no native calendar-month diff; ad-hoc day-count math is the path of least resistance.
**How to avoid:** Compute month difference via calendar arithmetic: `(nowYear - refYear) * 12 + (nowMonth - refMonth)`, adjusted for day-of-month if exact boundary precision matters (probably not needed here — a reminder firing a day early/late is not a correctness bug, but should be a documented approximation choice, not an accident).
**Warning signs:** None observed in this codebase yet (new logic) — flag as an implementation detail for the planner to make an explicit, documented choice on, since CONTEXT.md doesn't specify exact date-math precision.

### Pitfall 5: `km_montage`/`date_montage` both NULL (D-08's exclusion case) silently crashing instead of being skipped

**What goes wrong:** If the fallback-chain code assumes at least ONE of `km_a_la_photo` (latest photo) or `km_montage` is always present, a moto/consommable in the genuinely-inconsistent state D-08 describes ("normalement impossible") could throw an unhandled exception mid-loop, aborting the ENTIRE cron run for all subsequent motos (not just that one moto) if the per-moto `try/catch` isn't scoped correctly.
**Why it happens:** `maintenanceAlertService.js`'s existing per-moto `try/catch` (lines 42-49) is scoped ONLY around the `Entretien.getPlan()` call, not around the push-send/persist logic — a similar mis-scoping in the new service could let a single bad consommable crash the whole run.
**How to avoid:** Wrap the per-moto (or per-consommable) lateness computation in its own `try/catch`, following the existing `maintenanceAlertService.js` pattern of pushing `{ moto_id, error: e.message }` into `details` and `continue`-ing the loop, exactly mirroring lines 43-49.
**Warning signs:** Cron `scanned` count much higher than `notified + details.length`, or a cron run that silently stops partway through (visible in Railway logs as a truncated `console.log` summary line).

## Code Examples

### Migration `24_consommables_rappel_state.sql` (model: migration 18)

```sql
-- Migration 24 : Colonnes consommables/photos_consommables — état "dernier rappel envoyé"
-- + référence km à la photo (GAUGE-03/04, D-04/D-07)
-- À appliquer manuellement via Supabase Dashboard > SQL Editor

ALTER TABLE consommables
  ADD COLUMN dernier_rappel_envoye_at TIMESTAMPTZ,
  ADD COLUMN dernier_rappel_km        INTEGER;

ALTER TABLE photos_consommables
  ADD COLUMN km_a_la_photo INTEGER;

COMMENT ON COLUMN consommables.dernier_rappel_envoye_at IS
  'Horodatage du dernier rappel photo envoyé pour ce consommable (NULL = jamais notifié ou
   réarmé depuis la dernière photo). Mis à jour par /cron/rappels-photo-consommables ;
   remis à NULL automatiquement par PhotosConsommables.insert() (D-05) dès qu''une nouvelle
   photo est prise pour ce consommable — source de vérité pour la règle "un rappel par
   franchissement de seuil, réarmé à la photo suivante" (D-03).';

COMMENT ON COLUMN consommables.dernier_rappel_km IS
  'motos.km au moment du dernier rappel envoyé pour ce consommable — informatif, réarmé
   avec dernier_rappel_envoye_at.';

COMMENT ON COLUMN photos_consommables.km_a_la_photo IS
  'motos.km au moment de l''upload de cette photo (capturé côté app à l''INSERT) — référence
   de départ pour le calcul "km parcouru depuis la dernière photo" (D-07), évite une jointure
   sur releves_km par date à chaque exécution du cron.';
```

Remember: hand-append this same DDL into `schema.sql` in the same commit (repo discipline, re-confirmed as recently as Phase 23/24/25).

### Pure lateness-calculation function (recommended shape, new file `services/consommableRappelService.js`)

```javascript
'use strict';
const SBLayer = require('../supabase');
const pushService = require('./pushService');

const SEUILS = {
  pneu_av:        { km: 3000, mois: 6 },
  pneu_ar:        { km: 2500, mois: 6 },
  chaine:         { km: 3000, mois: 6 },
  plaquettes_av:  { km: 3000, mois: 6 },
  plaquettes_ar:  { km: 4500, mois: 6 },
  disque_av:      { km: 8000, mois: 12 },
  disque_ar:      { km: 8000, mois: 12 },
  huile_moteur:   { km: 5000, mois: 6 },
  liquide_frein:  { km: 6000, mois: 12 },
};

// Pure — no DB access. Reused by both the cron (push) and Motos.list()/getById() (badge, GAUGE-04).
function isConsommableEnRetard(conso, motoKm, latestPhoto) {
  const seuil = SEUILS[conso.type_consommable];
  if (!seuil) return false; // type inconnu — défensif, ne devrait jamais arriver (CHECK constraint)

  const refKm  = latestPhoto ? latestPhoto.km_a_la_photo : conso.km_montage;
  const refDate = latestPhoto ? latestPhoto.created_at   : conso.date_montage;
  if (refKm == null && !refDate) return false; // D-08 : aucune référence exploitable, exclu

  const kmDepasse = refKm != null && (motoKm - refKm) >= seuil.km;
  const moisDepasse = refDate && moisEcoules(new Date(refDate), new Date()) >= seuil.mois;
  return !!(kmDepasse || moisDepasse);
}

function moisEcoules(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

module.exports = { SEUILS, isConsommableEnRetard, moisEcoules /*, runConsommableRappelCron */ };
```

**Source of the sub-patterns above:** threshold-map literal per D-01 (CONTEXT.md verbatim); NULL-safe fallback pattern mirrors `verifier_km_monotone()`'s `COALESCE`/`GREATEST` NULL-safety documented in migration 23; per-moto `try/catch`-and-continue mirrors `maintenanceAlertService.js` lines 42-49.

## Runtime State Inventory

Not applicable — this phase is purely additive (new columns, new service, new endpoint). No rename/refactor/migration-of-existing-data involved. Confirmed: no stored data, live service config, OS-registered state, secrets, or build artifacts reference anything being renamed or restructured.

## Open Questions

1. **GAUGE-03's flat "3000km OU 6 mois" wording vs D-01's per-type table**
   - What we know: `REQUIREMENTS.md`'s GAUGE-03 text literally says "3000 km OU 6 mois" (singular, flat), while CONTEXT.md's D-01 (session-gathered, user-approved) gives 9 different per-type thresholds.
   - What's unclear: Whether this is an intentional refinement (D-01 supersedes the flat requirement wording) or a drift the planner should flag back to REQUIREMENTS.md.
   - Recommendation: Treat D-01 as authoritative (it's a later, explicit, user-approved decision — CONTEXT.md's own text calls it "Grille de seuils... proposée par Claude... validée par l'utilisateur sans modification"). The planner does not need to resolve this ambiguity — it is already resolved — but should ensure `.planning/REQUIREMENTS.md`'s GAUGE-03 checkbox, when marked complete, references D-01's table rather than restating the flat 3000/6 wording, to avoid a future reader thinking the flat rule was implemented literally.

2. **Whether GAUGE-04's cron pass should persist ANY state for `garage`/`inconnu` motos, given no push is sent**
   - What we know: D-04's columns exist to prevent push spam (a push-specific concern). If GAUGE-04's badge is computed at READ time (Pattern 4 recommendation), the cron arguably doesn't need to touch `dernier_rappel_envoye_at`/`dernier_rappel_km` for garage/inconnu motos at all — the badge would always reflect live state regardless of whether a "cron pass" ever ran.
   - What's unclear: Whether the planner should have the cron loop skip garage/inconnu motos entirely (since they need no push and no anti-spam state), or still scan them for a `scanned`/reporting-completeness reason.
   - Recommendation: Skip garage/inconnu motos in the cron's persistence step entirely — only iterate/persist for `proprietaire_type = 'client'` motos (where D-04's anti-spam matters because a push is actually sent). Compute the GAUGE-04 badge live, independently, at read-time via Pattern 4's shared pure function — never via the cron. This keeps the cron's job singular (push dispatch) and avoids a second, redundant state-write path for data no push consumes.

3. **Whether `Motos.list()` should ALWAYS compute `rappel_photo_en_retard`, or only for garage/inconnu motos (GAUGE-04's stated scope)**
   - What we know: GAUGE-03 already covers client motos via push; GAUGE-04 is specifically scoped to garage/inconnu motos ("sans compte client à notifier").
   - What's unclear: Phase 27 (out of scope here) will decide the exact UI, but the backend computed field could be added universally (cheap to compute for all motos, useful context even for client motos' own dashboard view in Phase 27/28) or scoped only to garage/inconnu.
   - Recommendation: Compute it universally in `Motos.list()`/`getById()` (same computed-field cost regardless of `proprietaire_type`) — cheaper to add once now than to special-case it later when Phase 27/28 inevitably wants to show SOME reminder-lateness indicator on client-owned motos too (e.g., a client viewing their own moto's dashboard before Phase 28's mobile gauges ship). Let Phase 27's plan decide which populations actually RENDER the badge — the backend field should not artificially restrict itself to GAUGE-04's exact wording if it costs nothing extra to compute broadly.

## Environment Availability

Skipped — no external dependencies beyond what's already provisioned and working in this repo (Supabase, Expo push infra via `PUSH_ENABLED`/`expo-server-sdk`, `CRON_SECRET` env var already used by the existing `/cron/maintenance-alerts` endpoint in prod). No new service, no new credential.

**One item worth flagging (not blocking):** whether an external scheduler (Railway cron, or similar) is ALREADY configured to call `/cron/maintenance-alerts` periodically, and whether the SAME scheduler config needs a second entry for the new `/cron/rappels-photo-consommables` route. This is an operational/Railway-dashboard action for Mehdi, not a code task — flag it as a post-merge human action in the plan, mirroring how Cloudinary/RESEND credential provisioning was flagged as a Known Gap in past phases rather than blocking phase completion.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None (no jest/mocha/pytest) — ad-hoc raw-`http` Node scripts, confirmed repo-wide convention (`tests/test-or-e2e.js`, `tests/test-km-photos-cloudinary.js`, `tests/test-client-device-tokens.js`) |
| Config file | none — see Wave 0 |
| Quick run command | `node motokey-api.js` (in one terminal) then `node tests/test-consommable-rappel-cron.js` (new file, in another) |
| Full suite command | `node test-api.js` (root regression suite) + each `tests/test-*.js` individually (no aggregate runner exists) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GAUGE-03 | Client push fires when km/date threshold crossed for a consommable, grouped per moto | integration (HTTP, cron endpoint + fixture data manipulation) | `node tests/test-consommable-rappel-cron.js` | ❌ Wave 0 |
| GAUGE-03 | Cron does not re-send for the same threshold crossing (idempotence) | integration | same file, second cron invocation assertion | ❌ Wave 0 |
| GAUGE-03 | Reset on new photo (D-05) re-arms the reminder | integration | same file, POST photo then re-run cron | ❌ Wave 0 |
| GAUGE-04 | Garage/`inconnu` motos surface a computed lateness field without a push being sent | integration (HTTP, `GET` moto list/detail) | same file or a small addition to `tests/test-km-photos-cloudinary.js` | ❌ Wave 0 |

Manual-only note: verifying an ACTUAL Expo push arrives on a physical device is out of scope for this phase's automated tests (mirrors Phase 17's own validation, which relied on `PUSH_ENABLED=false` dev-mode console-log assertions plus a documented manual device check) — the automated test should assert on `pushService.sendPush()`'s return shape (`{ sent: N }` or dev-mode `{ dev: true }`), not on real delivery.

### Sampling Rate
- **Per task commit:** `node tests/test-consommable-rappel-cron.js` (with server running locally, `PUSH_ENABLED` unset/false so pushes hit the dev console-log fallback, not real Expo)
- **Per wave merge:** `node test-api.js` (root regression, 9/9 baseline per `.planning/STATE.md`) + the new cron test file
- **Phase gate:** Full suite green before `/gsd:verify-work`, plus a manual sanity check that `node --check motokey-api.js` passes (repo convention, `CLAUDE.md`)

### Wave 0 Gaps
- [ ] `tests/test-consommable-rappel-cron.js` — new file, covers GAUGE-03/GAUGE-04, following the exact skeleton-then-fill pattern established by `tests/test-km-photos-cloudinary.js` (a Wave-0 stub that must exit 0 even before later waves fill in assertions)
- [ ] No new shared fixtures needed — reuse `sophie@email.com`/`client123` (client login) and the existing garage seed account; a garage-owned moto fixture (`proprietaire_type='garage'`) already exists in prior test scripts (`test-releves-km-trigger.js` pattern, per `.planning/STATE.md` Phase 23 notes) and can be reused/adapted for GAUGE-04 assertions.
- [ ] No new framework install needed.

## Sources

### Primary (HIGH confidence — direct file reads from this repo, current as of 2026-07-15)
- `services/maintenanceAlertService.js` (full file, 94 lines) — exact cron structure to adapt
- `services/pushService.js` (full file, 119 lines) — `sendPush`/`sendToToken` signatures, idempotency internals
- `motokey-api.js` lines 420-500 (`resolveMotoForCtx`, `handleKmReading`), lines 530-573 (photo-consommable multipart handler, D-05 auto-creation), lines 749-762 (`/cron/maintenance-alerts` endpoint)
- `supabase.js` lines 235-269 (`Motos.list()`, UX-02 `alerte_entretien` precedent), lines 1320-1396 (`Consommables`/`PhotosConsommables` helpers, `TYPES_CONSOMMABLES`)
- `sql/migrations/13_liaison_client_moto.sql` — `proprietaire_type_enum`, `moto_proprietaire_coherence` CHECK
- `sql/migrations/17_push_send_log.sql` — `push_send_log` schema, UNIQUE constraint
- `sql/migrations/18_motos_maintenance_alert_state.sql` — column-addition migration pattern to model
- `sql/migrations/23_consommables_km.sql` + `schema.sql` lines 559-584 — confirmed byte-identical current schema for `consommables`/`photos_consommables`
- `sql/migrations/` directory listing — confirmed `23_consommables_km.sql` is the last file, `24_*.sql` is free
- `.planning/PROJECT.md` — Constraints section (`requireRole()` obligatoire) + confirmed cron precedent as accepted exception
- `.planning/phases/26-cron-de-rappel-push-badge/26-CONTEXT.md` — all D-01 through D-08 decisions, Claude's Discretion items
- `.planning/REQUIREMENTS.md` — GAUGE-01 through GAUGE-06 exact text, traceability table
- `.planning/STATE.md` — Phase 23/24/25 history, known gaps, prior pitfalls (reserved-word `analyse`, `releves_km_rejets` audit-trail gap)
- `tests/test-client-device-tokens.js`, `tests/test-km-photos-cloudinary.js` — confirmed test-harness conventions (raw `http`, no framework)
- `.planning/config.json` — confirmed `workflow.nyquist_validation` absent (Validation Architecture section included per default-enabled rule)

### Secondary (MEDIUM confidence)
None used — this phase required no external/ecosystem research; everything needed was verifiable directly against this repo's own code and history.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, both `expo-server-sdk` and `@supabase/supabase-js` already proven in prod for the exact same purpose
- Architecture: HIGH — direct adaptation of an existing, working, in-repo pattern (Phase 17), read in full
- Pitfalls: HIGH — derived from this repo's own documented incident history (`.planning/STATE.md`) plus direct code reading, not speculative

**Research date:** 2026-07-15
**Valid until:** Effectively indefinite for the architectural recommendations (internal repo patterns don't go stale like external library docs) — but re-verify `sql/migrations/` directory listing immediately before writing the migration file, in case a concurrent phase/session has claimed `24_*.sql` since this research was written.
