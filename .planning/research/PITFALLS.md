# Pitfalls Research

**Domain:** Adding consumable-wear tracking (moto-scoped, transferable) + odometer anti-fraud + stub-to-real AI Vision + reminder/push reuse, to an existing production Garage DMS (MotoKey v1.6)
**Researched:** 2026-07-13
**Confidence:** HIGH for project-specific findings (grounded in direct reads of `schema.sql`, `sql/migrations/`, `supabase.js`, `app.html`, `services/pushService.js`, `services/maintenanceAlertService.js`); MEDIUM for general Postgres/Supabase mechanics not project-specific.

This research is scoped to *this exact codebase's* current state, not generic DMS/anti-fraud advice. Every pitfall below is either directly evidenced in the repo or is a direct consequence of a pattern already present in the repo.

---

## Critical Pitfalls

### Pitfall 1: `Motos.update()` already lets anyone overwrite `km` with zero validation — the new anti-fraud layer can be silently bypassed by the existing endpoint

**What goes wrong:**
`supabase.js` `Motos.update(id, garage_id, payload)` (line ~350) whitelists `km` as a directly-writable field with **no monotonic check, no role gate, no audit row**:
```js
const allowed = ['km','pneu_av','pneu_ar','pneu_km_montage','couleur','photo_url'];
```
If v1.6 builds `releves_km` + strict monotonic enforcement as a *new, separate* code path (e.g. a new `POST /motos/:id/km` endpoint) without also closing or redirecting this existing `PUT /motos/:id` field, the old endpoint remains a fully-open backdoor: any garage user (not just PRO+) can set `km` to any value, including a regression, with no log and no `releves_km` row created. The anti-fraud feature would be real on one path and fictional on another.

**Why it happens:**
The new feature is additive (new tables, new endpoint) rather than a refactor of the existing `km` write surface — it's easy to forget that `km` is already writable elsewhere, especially since `km` lives directly on `motos` (needed for score/entretien calculations) rather than being purely derived from `releves_km`.

**How to avoid:**
- Strip `km` from `Motos.update()`'s allowed list entirely; all km changes must go through the new guarded endpoint (normal reading → validated ratchet; counter replacement → PRO+ only, separate code path).
- If `km` must stay directly settable for legacy reasons (e.g. initial moto creation), gate the *update* path only, not creation.
- Add a regression test that asserts `PUT /motos/:id` with a lower `km` either 400s or is silently ignored for that field.

**Warning signs:**
- Grep for `allowed = [` / `.update({` touching `motos` and `km` outside the new anti-fraud module.
- Any endpoint that lets `km` flow through generic "patch moto" logic.

**Phase to address:**
Schema-design / anti-fraud-logic phase — must be closed *before* the anti-fraud feature is considered "done," not deferred.

---

### Pitfall 2: Km already has two other silent write paths with inconsistent (and non-auditable) behavior — `OR cloturer` and `Interventions.create`

**What goes wrong:**
Two more existing paths touch km with different, undocumented semantics:
- `Interventions.create()` (`supabase.js` ~397) inserts `interventions.km` from `payload.km` **completely disconnected from `motos.km`** — it never reads, compares, or updates `motos.km`. An intervention can record `km: 5000` while the moto's live `km` is `40000`, with no error.
- `OrdresReparation.cloturer()` (~893-922) has an ad-hoc, undocumented monotonic guard: `if (km_sortie < or.km_entree) throw`, and separately `if (moto && km_sortie > moto.km) update motos.km`. This is a **silent skip**, not a **reject + log**, when `km_sortie <= moto.km` — it just doesn't bump the moto row, with no audit trail of the attempted lower value.

If the new `releves_km` table and monotonic enforcement are added as an isolated "km module" without reconciling these two existing paths, the system ends up with three different, mutually-inconsistent definitions of "current km" and three different fraud-handling behaviors (none of which match the target spec: reject + log garage on regression).

**Why it happens:**
Km recording accreted organically across L3a (OR) and L1 (interventions) without a single source of truth; each feature solved its own local need.

**How to avoid:**
- Before writing new schema, inventory every existing write path to `motos.km` and `interventions.km` (this research already found the three above — re-grep at implementation time in case more exist, e.g. moto creation with arbitrary starting km).
- Decide explicitly: does the new `releves_km` table become the *sole* source of truth for km (with `motos.km` becoming a denormalized cache updated only via the new validated path), or does every existing writer get refactored to call the new validation function?
- `OrdresReparation.cloturer()` and `Interventions.create()` should call the same validation function as the new dedicated km endpoint — not duplicate ad-hoc logic.

**Warning signs:**
- Any `.update({ km: ... })` or `.insert({ ..., km: ... })` call on `motos`/`interventions` outside the new anti-fraud module.
- `interventions.km` values that don't correlate with `motos.km` history at the same timestamp.

**Phase to address:**
Anti-fraud-logic phase — this is the phase's actual scope, not a side effect. Should be an explicit success criterion: "all existing km write paths route through the validated ratchet."

---

### Pitfall 3: Postgres `CHECK` constraints cannot see the previous row's value — monotonic km enforcement needs a `BEFORE UPDATE`/`BEFORE INSERT` trigger, not a `CHECK`

**What goes wrong:**
A natural first instinct is `ALTER TABLE releves_km ADD CONSTRAINT km_croissant CHECK (km >= km_precedent)` — but a `CHECK` constraint only evaluates the row being written; it has no visibility into other rows (previous readings) unless that previous value is denormalized into the same row (fragile, requires the app to always pass it correctly) or it's implemented as a `BEFORE INSERT` trigger that looks up `MAX(km)` for the `moto_id` and raises an exception if the new value is lower (except for the explicit PRO+ "counter replacement" event type).

**Why it happens:**
`CHECK` constraints look like the simple, declarative Postgres-native way to enforce invariants, and work for single-row rules (e.g. `score BETWEEN 0 AND 100`, already used in this schema). Cross-row monotonic rules are a different class of problem that's easy to reach for the wrong tool on.

**How to avoid:**
- Implement monotonic enforcement as a trigger function (`BEFORE INSERT ON releves_km`) that queries the last known km for `moto_id` (or reads `motos.km` if that's kept as the live cache) and rejects/flags regressions — with an explicit bypass path for rows tagged as `type_evenement = 'remplacement_compteur'`.
- Do this enforcement at the DB layer (trigger), not only in `supabase.js` application code — Supabase RLS lets `service_role` (used by `supabase.js`) bypass RLS entirely, and any future direct SQL/script/Edge Function would also bypass app-layer-only checks. DB-level enforcement is the only guarantee that survives future code paths.
- Log the rejected attempt (garage_id, moto_id, attempted km, actual km, timestamp) — the spec calls for "reject + log garage," which a bare trigger `RAISE EXCEPTION` does not do by itself; the trigger should also `INSERT` into an audit/rejection table (or the app layer catches the exception and logs it — but then the DB-only enforcement path, e.g. future scripts, is unaudited).

**Warning signs:**
- A migration file with `CHECK (km >= ...)` referencing another row or a subquery — Postgres rejects true cross-row `CHECK` constraints at DDL time, but a poorly-designed workaround (denormalized `km_precedent` column trusted from the app) silently doesn't enforce anything if the app forgets to set it correctly.

**Phase to address:**
Schema-design phase (trigger + rejection-log table), anti-fraud-logic phase (app-side surfacing of rejections to garage UI).

---

### Pitfall 4: New `moto_id`-scoped tables risk repeating this project's own just-closed RLS-drift pattern (RLS enabled via Dashboard, not migration files)

**What goes wrong:**
The project's own recent history (v1.5, Gap B) shows that the last 4 tables added for L8 (`billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto`) had **RLS enabled with zero explicit policies**, confirmed only via a live REST probe in Phase 21 — not via anything in `sql/migrations/13_liaison_client_moto.sql` or `15_billing_foundation.sql`. `schema.sql` lines 697-702 explicitly document this as "default-deny... only service_role can read/write" — meaning these tables are **currently inaccessible from the mobile app / client-authenticated requests entirely**; all access necessarily goes through `supabase.js` using the service-role key.

If `consommables`, `photos_consommables`, and `releves_km` are added the same way (migration creates table + `ENABLE ROW LEVEL SECURITY`, but the actual policies are clicked into the Dashboard "to unblock testing" and never written back to a migration file), the project reproduces the exact undocumented-drift pattern that consumed all of v1.5 (3 phases) to resolve — and `schema.sql`'s freshly-proven clean bootstrap (`scripts/bootstrap-fresh-schema.js`, SCHEMA-07) would immediately go stale again for these tables.

**Why it happens:**
Under deadline pressure, RLS policies are one of the few things that are genuinely faster to prototype in the Supabase Dashboard SQL editor (instant feedback) than to write, test, and commit as a migration file — and once it works, there's no forcing function to backport it.

**How to avoid:**
- Write RLS policies for the 3 new tables **in the migration file itself**, in the same PR/commit as the `CREATE TABLE`, following the exact pattern already established in `schema.sql` (helper functions `my_garage_id()` / `my_client_id()`, `EXISTS` subqueries joining through `motos`).
- If service-role-only (no explicit policy) is the actual intended design — because e.g. all consommables/km access goes through `supabase.js` server endpoints, never direct client REST — say so explicitly in the migration file as a comment (mirroring the existing `schema.sql` comment convention at lines 689-691, 697-702), so it reads as an intentional decision, not an oversight discovered three phases later.
- Re-run `scripts/bootstrap-fresh-schema.js` against a disposable Supabase project after adding the new tables, before considering the schema-design phase done — this is the exact tool this project already built and validated for this purpose.

**Warning signs:**
- A migration file that does `ENABLE ROW LEVEL SECURITY` with no adjacent `CREATE POLICY` and no comment explaining why.
- `schema.sql` not updated in the same commit as the new migration (this project's own SCHEMA-01 finding: migrations 10/13/15 were forgotten from `schema.sql` for months).

**Phase to address:**
Schema-design phase — should be a hard gate, not a follow-up. Verification: bootstrap script run + explicit RLS policy review before phase sign-off.

---

### Pitfall 5: `moto_id`-only scoping must survive ownership transfer (`proprietaire_type` change) — RLS policies for polymorphic ownership are easy to get wrong or leave stale

**What goes wrong:**
The milestone description explicitly requires `consommables`/`photos_consommables`/`releves_km` to hang off `moto_id` and never `client_id`, "since ownership is polymorphic and transferable." The existing RLS pattern for client-readable data (`motos_client_read`, `inter_client_read`, `plan_client_read` in `schema.sql`) all join through `motos.client_id` directly — which today is correct *only* because of the `moto_proprietaire_coherence` CHECK constraint (migration 13) guaranteeing `client_id IS NOT NULL` exactly when `proprietaire_type = 'client'`.

Two concrete ways this breaks for the new tables:
1. If a policy is written as `EXISTS (SELECT 1 FROM motos m JOIN clients c ON c.id = m.client_id WHERE m.id = releves_km.moto_id AND c.auth_user_id = auth.uid())`, it will correctly stop returning rows to the *previous* client the moment `proprietaire_type` flips to `garage`/`inconnu`/new-client on cession — this is actually the desired behavior (old owner loses read access after resale), but it must be verified explicitly, not assumed, since it's exactly the kind of thing that "looks done" in a demo (same client testing, ownership never transferred) and breaks in the field.
2. `proprietaire_type = 'garage'` motos (garage-owned stock, per L8) have **no** client at all — any push/reminder logic that assumes "every moto's wear data has a client to notify" will silently do nothing for garage-stock motos, which is fine for push but needs an explicit garage-side equivalent (badge), not a gap.

**Why it happens:**
Ownership transfer is a rare, easy-to-forget-to-test path — most manual testing during a feature phase uses one fixed client/moto pairing.

**How to avoid:**
- Explicitly test: create wear/km history for a client-owned moto, transfer it (cession) to another client or to garage stock, and verify (a) the old client can no longer read the history via RLS, (b) the new client/garage *can* (history follows the moto, not the person — this is the whole point of the feature), (c) `motos_proprietaires_historique` correctly attributes which readings/photos happened under which owner if that matters for anti-fraude scoring later.
- Never denormalize `client_id` onto `consommables`/`photos_consommables`/`releves_km` rows "for convenience" — always resolve current owner via `moto_id` join at read time, exactly as the milestone spec requires. A denormalized `client_id` snapshot would silently show the *old* owner's data to a *new* owner after transfer, or vice versa.

**Warning signs:**
- Any new table with both `moto_id` and `client_id` columns.
- RLS policy or endpoint code that filters by `client_id` instead of joining through `motos`.

**Phase to address:**
Schema-design phase (RLS correctness), verified again at the ownership-transfer / cession-adjacent testing step if one exists in the roadmap, or added as an explicit test case if not.

---

### Pitfall 6: Legacy tire-tracking (`pneu_av`/`pneu_ar`/`pneu_km_montage` on `motos` + existing "Pneus" nav section) is live in prod and will visually collide with the new generalized `consommables` tire entry — and contradicts this project's own CLAUDE.md

**What goes wrong:**
`app.html` still has a **fully wired, nav-level "Pneus" section** (`{id:'pneus', label:'Pneus'}` in the nav array, `renderPneus()` dispatched from `section === 'pneus'`) *and* a duplicate tab inside the moto fiche (`ficheTab === 'pneus'`) — both calling `loadPneus()`, which reads `motos.pneu_av`, `motos.pneu_km_montage`, and `motos.km` to compute a naive "usure estimée" using a hardcoded `kmParcourus >= 8000` threshold. This directly contradicts this project's own `CLAUDE.md`, which states: *"Pneus vivent dans la fiche moto uniquement. La nav principale n'a pas de section Pneus. La fonction `renderPneus()` historique a été supprimée."* — that claim is stale; the code was read directly for this research and both the nav entry and `renderPneus()` are present and reachable (`app.html` lines 749, 896, 956-958, 1150-1182).

If v1.6 adds a generalized `consommables` table with a `type = 'pneu'` (or `'pneu_avant'`/`'pneu_arriere'`) row and a new wear-gauge UI, without explicitly retiring or migrating the legacy `pneu_*` columns and the two existing UI surfaces, the app ends up with **two independently-computed, inconsistent tire-wear indicators** shown to the same user (old: raw km-since-montage vs. fixed 8000km threshold; new: photo-analysis-derived % usure). This is a user-trust problem for a product whose entire value proposition is "verifiable maintenance history."

**Why it happens:**
The feature is additive by design (new tables, new UI), and the old tire UI still technically "works" so there's no forcing function to touch it — plus the team's own documentation says it was already removed, which would make nobody think to check.

**How to avoid:**
- During schema-design, explicitly decide the fate of `motos.pneu_av`/`pneu_ar`/`pneu_km_montage`: (a) migrate to seed rows in the new `consommables` table and drop the legacy columns (cleanest, but needs a backfill migration + review of every read site), or (b) keep the legacy columns as a deprecated/read-only fallback and hide the old nav section + fiche tab once the new consommables UI ships for tires.
- Update `CLAUDE.md` once the decision is made and executed — the current text is inaccurate and should not be trusted as-is for this milestone.
- Grep `app.html` for `pneu_` at the start of the schema-design phase (not assumed away) to get the authoritative current state, exactly as was done for this research.

**Warning signs:**
- Two different "tire wear" percentages/messages visible to the same user in different screens.
- `CLAUDE.md` and actual `app.html` diverging again (this project has an established, documented history of exactly this kind of drift).

**Phase to address:**
Schema-design phase (decide + document fate of legacy columns), UI phase (retire or reconcile the old nav/tab), and a CLAUDE.md update as part of phase closure (per this project's own "Evolution" convention in PROJECT.md).

---

### Pitfall 7: Stubbing the AI Vision response shape casually now creates a breaking-change wall when the real Anthropic Vision call lands later

**What goes wrong:**
The milestone explicitly defers the real Anthropic Vision call ("stub IA (fausse analyse structurée : % usure + état + confiance)... point de branchement propre pour la vraie clé Anthropic Claude Vision plus tard"). Every consumer of this data — mobile gauges, garage web gauges, the "weakest link" overall-score calculation, and the km/time-based reminder logic — will be built against whatever shape the stub happens to return. If that shape isn't treated as a real contract (versioned, documented, deliberately including the messiness a real Vision call will actually produce — nullable fields, confidence ranges, multi-candidate uncertain results, occasional analysis failure) the eventual swap-in of the real call becomes a breaking change across every consumer simultaneously, rather than a drop-in replacement.

Concretely, likely gaps if the stub is built "just enough to unblock UI":
- Stub always succeeds instantly (synchronous) → real Vision calls are network calls that can be slow, rate-limited, or fail — if nothing in the schema/UI accounts for `status: pending/failed`, the whole photo-upload flow needs re-architecting (probably to async: upload → stub/real analysis job → poll or webhook) rather than a config-flag swap.
- Stub confidence is always a fixed value (e.g. always 90%) → UI never actually exercises low-confidence states (e.g. "needs manual review" banners), so that UX is unbuilt and untested until the real call ships and immediately produces messy results in prod.
- Stub doesn't persist which engine produced a given photo's analysis (`stub` vs `anthropic-vision-v1`) → once real analysis is live, there's no way to distinguish historical stub-derived gauge values from real ones, which matters for an anti-fraude-adjacent feature where the provenance of a wear estimate could itself become a trust question later.

**Why it happens:**
Stubs are typically built to satisfy the immediate need (UI needs *some* number to render) rather than to model the eventual real system's full behavior space, because the real system doesn't exist yet to model against.

**How to avoid:**
- Design the stub's output JSON shape as if it *were* the real Anthropic Vision response schema from day one — include `confiance` as a variable value (not fixed), an `analyse_status` field (`ok`/`incertain`/`echec`), and an `engine` field (`stub`/`anthropic-vision-v1`) persisted on `photos_consommables`.
- Follow this project's own established convention exactly (`EMAIL_ENABLED`, `PUSH_ENABLED`): gate the real call behind e.g. `VISION_ANALYSIS_ENABLED`, with the stub as the `false` fallback — not two different code paths that diverge in behavior beyond "real API call vs fake."
- Decide the sync/async question now, not later: if there's any chance the real call will be slow/unreliable enough to need async handling, build the upload endpoint to return immediately with a `pending` analysis and have gauges/UI handle a "analysis in progress" state — even while the stub itself resolves instantly. Retrofitting async after the UI was built assuming synchronous results is expensive.
- Write down the stub's exact JSON contract in a comment/doc at creation time (per this project's "stub/flag" convention already noted for Cloudinary/Anthropic wiring) so the future swap-in phase has an explicit acceptance criterion: "real call output validates against this same shape."

**Warning signs:**
- UI code that assumes analysis is always present and always instant (no loading/pending/failed states anywhere).
- No `engine`/`source` field on `photos_consommables` to distinguish stub vs real analysis after the fact.

**Phase to address:**
Stub-endpoint phase (contract design) — this is the single highest-leverage phase to get right, since UI phase and the later real-Vision-swap phase both inherit whatever shape is decided here.

---

### Pitfall 8: Reusing the push pipeline for km/time-based photo reminders without reusing the maintenance-alert cron's idempotency pattern will spam users or silently never fire

**What goes wrong:**
`services/maintenanceAlertService.js` already solves "notify once per threshold-crossing, never on every cron re-run" via a persisted `last_maintenance_tier_notified` rank comparison on `motos` (`TIER_RANK`, only push if `currentRank > lastRank`, persist the new rank regardless of direction). It also explicitly filters candidate motos with `.not('client_id', 'is', null)` — meaning garage-owned/unclaimed motos are silently excluded from push (correctly, since there's no client to push to), but the milestone requires a **garage-side badge** as the equivalent notification channel for those cases.

If the new km/time-based photo reminder is built as a fresh cron without reusing this exact pattern, two failure modes are likely:
1. **No persisted "last reminded" state per consumable** → every cron run re-sends a push for every consumable still overdue, since "km parcouru depuis dernière photo" alone doesn't change between cron runs if the owner hasn't driven/uploaded — this is a spam risk on every single cron tick, not just once.
2. **Garage-stock / unclaimed motos silently get zero reminder of any kind** (no push target *and* no separate garage badge implemented) — reusing the maintenance-alert filter without adding the garage-badge counterpart reproduces the client-only blind spot for consommables tracking, on motos a garage owns and might actually want reminded about (pre-sale prep, etc.).

Additionally, the milestone requires **two independent trigger conditions** — km-based *and* a 6-month time-based safety net — each of which needs its own "already reminded for this crossing" state, or the two triggers will double-fire on the same day if both happen to be true simultaneously.

**Why it happens:**
Cron-based reminder logic looks stateless and simple at a glance ("if overdue, push") — the idempotency requirement is a subtle, easy-to-omit detail that only manifests as a bug on the *second* cron run, not the first, so it's easy to miss in a quick manual test.

**How to avoid:**
- Persist a per-consumable (not per-moto) "last reminded at [km/date]" state — likely a column or small table keyed by `(moto_id, consommable_type)`, mirroring `last_maintenance_tier_notified` / `last_maintenance_tier_notified_at`.
- Use the exact idempotency-key convention already established in `pushService.js` (`idempotencyKey` string, insert-first against `push_send_log`, e.g. `photo-rappel:${moto_id}:${consommable_type}:${dateOrKmBucket}`) rather than inventing a new mechanism.
- Explicitly branch on `proprietaire_type` (mirroring the existing `.not('client_id', 'is', null)` filter): client-owned → push via `pushService`; garage-owned/unclaimed → compute a badge at read-time in the garage web UI (same pattern as UX-02's `.score-rouge` / "Révision dépassée" chip, computed at display time with no DB write), not silently skipped.
- Treat km-trigger and time-trigger as two separately-tracked "already notified" states (or a single state keyed by whichever fires, with a `reason` field) so a same-day double-fire is impossible, not just unlikely.

**Warning signs:**
- Reminder cron with no persisted "last notified" comparison, only a live "is currently overdue" check.
- Reminder logic that only queries `client_device_tokens`/client-linked motos, with no garage-side code path at all.

**Phase to address:**
Reminder/push-reuse phase — should explicitly reuse (not reimplement) `maintenanceAlertService.js`'s rank/persisted-state pattern and `pushService.js`'s idempotency-key convention; UI phase for the garage-side badge equivalent.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Leaving `km` writable via `Motos.update()` alongside the new validated km endpoint | Less refactoring in this milestone | Anti-fraud claim becomes false in practice (Pitfall 1) | Never — must close before shipping |
| App-layer-only monotonic km check (no DB trigger) | Faster to write/test in `supabase.js` | Bypassable by any future direct-SQL script or service-role call (Pitfall 3) | Only as a *complement* to a DB trigger, never instead of one |
| Stub Vision response with fixed confidence/always-success | Simpler stub code, faster UI unblocking | Untested low-confidence/failure UI states surface for the first time in prod when the real call lands (Pitfall 7) | Acceptable only if `analyse_status`/variable confidence are still modeled in the schema even while the stub always returns "ok" |
| New reminder cron built standalone instead of extending `maintenanceAlertService.js`'s pattern | Feels cleaner/isolated per feature | Reintroduces the spam/idempotency bug this project already solved once (Pitfall 8) | Never — reuse the pattern, even if it's a separate function/file |
| Leaving legacy `pneu_*` columns + old "Pneus" nav section untouched "for now" | Zero migration risk this milestone | Duplicate, contradictory tire-wear UI shown to real users (Pitfall 6) | Only if explicitly hidden/disabled in UI phase, not left silently reachable |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Supabase RLS (new tables) | Enable RLS via Dashboard to unblock testing, forget to write the policy into a migration file | Write `CREATE POLICY` in the same migration file as `CREATE TABLE`; re-run `scripts/bootstrap-fresh-schema.js` before phase sign-off (Pitfall 4) |
| Supabase RLS (polymorphic ownership) | Denormalize `client_id` onto wear/km rows for query convenience | Always resolve current owner via `moto_id` → `motos.proprietaire_type` join at read time (Pitfall 5) |
| Expo push reuse | Build a new cron/push path from scratch instead of extending `maintenanceAlertService.js` + `pushService.js` | Reuse the rank/persisted-state idempotency pattern and the `idempotencyKey` convention exactly (Pitfall 8) |
| Anthropic Vision (stub → real) | Design stub shape ad hoc, assume synchronous/always-succeeds | Model the stub's output as the real API's eventual contract (status, variable confidence, engine field) from day one (Pitfall 7) |
| Anti-fraude scoring (existing 1.0/0.6/0.3 weighting) | Reuse/extend the existing `niveau_preuve`/`score_confiance` fields or formula for consommables photo-confidence, since they look similar | Keep consommables wear-analysis confidence entirely separate from the interventions anti-fraude score — do not touch the 70/30 formula or 1.0/0.6/0.3 weighting without Mehdi's explicit validation (CLAUDE.md constraint) |
| Cloudinary (stub/deferred wiring) | Store only the eventual photo URL, without moto_id/km-at-photo/timestamp/garage_id metadata "since the URL isn't real yet" | Persist all metadata now (moto_id, km_at_upload, consommable_type, garage_id, uploaded_by) even while the storage backend itself is stubbed/flagged off — matches `EMAIL_ENABLED`/`PUSH_ENABLED` convention of building the real data model before flipping the flag |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Reminder cron scanning all motos and recomputing wear-gauge/weakest-link on every tick (mirrors `maintenanceAlertService.js`'s current full-table scan pattern) | Cron duration grows linearly with total moto count across all garages | Acceptable at current scale (mirrors existing, working pattern); revisit with a `garage_id`/`moto_id` batching or a materialized "next reminder due" index if moto count grows into the thousands | Not a concern at this project's current scale (single-digit-thousands of motos across pioneer garages); flag for revisit if garage count grows substantially |
| Photo history (`photos_consommables`) queried without pagination/limit on the moto fiche/mobile gauge screen | Fiche/gauge screen slows down for motos with long photo history over years | Always query the *latest* photo per consommable type for gauge display; paginate full history views | Noticeable once a moto has dozens of photos per consumable across years of ownership |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Counter-replacement ("remplacement totaliseur") endpoint missing `requireRole('PRO')` | Any MECANO/CLIENT-scoped credential could reset the anti-fraude ratchet, defeating the entire feature's purpose | Explicit `requireRole('PRO')` (CONCESSION/ADMIN inherit) on the replacement endpoint, per CLAUDE.md's blanket rule for sensitive endpoints; add a negative-role test mirroring the existing L4 v2 pattern |
| Km-regression rejection logged only client-side / in application logs, not queryable per-garage | Garage/admin can't audit "how many rejected km-decrease attempts has this moto/client had" — undermines the anti-fraude value proposition itself | Persist rejections to a queryable table (garage_id, moto_id, attempted_km, actual_km, timestamp, actor), not just console logs |
| New tables left RLS-enabled-with-no-policy "same as Gap B tables" without documenting *why* | Indistinguishable from an oversight when discovered later — repeats the exact ambiguity that cost 3 phases (v1.5) to resolve for the last batch of tables | If service-role-only is genuinely intended, say so in a `schema.sql` comment at creation time, not discovered via REST probe months later |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Two independent tire-wear displays (legacy `pneu_*` UI + new consommables gauge) shown to the same user | Confusing, contradictory numbers erode trust in a product whose core pitch is "verifiable" data | Retire or hide the legacy Pneus nav/tab once the new consommables UI covers tires (Pitfall 6) |
| Wear gauge "weakest link" calculation implemented independently in mobile app, garage web, and reminder cron | Three implementations drift over time (exactly the risk the existing UX-02 alert-chip pattern avoided by computing at display time in one place) | Centralize the weakest-link calculation in one server-side function (or one shared client util consumed by both mobile and web), never duplicate the formula three times |
| Stub-derived wear % shown identically to real-analysis-derived wear %, no visual distinction | Once real analysis lands, users can't tell if a historical gauge value was ever actually machine-verified vs a placeholder | Consider a subtle "estimation provisoire" indicator while `ANALYSIS_ENABLED=false`/engine=`stub`, consistent with this project's existing pattern of being explicit about degraded/dev-mode states (e.g. push dev-mode console banner) |

## "Looks Done But Isn't" Checklist

- [ ] **Monotonic km enforcement:** Often missing coverage of *all three* existing write paths (`Motos.update`, `Interventions.create`, `OrdresReparation.cloturer`) — verify by grepping every `.update(` / `.insert(` touching `motos.km` or `interventions.km`, not just the new endpoint.
- [ ] **Counter-replacement audit trail:** Often missing the archived old-value + garage signature actually being queryable later — verify by checking a replacement event round-trips through a "moto history" view, not just that the write succeeded.
- [ ] **RLS on new tables:** Often "enabled but unpoliced" without an explicit decision recorded — verify via `scripts/bootstrap-fresh-schema.js` + explicit review of `pg_policies` for the 3 new tables, not just that `ENABLE ROW LEVEL SECURITY` ran.
- [ ] **Ownership-transfer continuity:** Often untested because manual testing uses one fixed moto/owner pairing — verify by actually transferring a moto with existing wear/km history and confirming access follows the moto.
- [ ] **Reminder idempotency:** Often works correctly on first cron run and spams on the second — verify by running the cron twice in a row against the same fixture data and confirming zero duplicate pushes.
- [ ] **Garage-stock / unclaimed moto reminders:** Often silently excluded (mirrors existing `maintenanceAlertService.js` client-only filter) — verify a `proprietaire_type = 'garage'` moto still surfaces a reminder via the garage badge, not nothing.
- [ ] **Stub-to-real Vision swap boundary:** Often the stub is only tested in its always-succeeds state — verify UI handles a simulated `analyse_status = 'echec'`/low-confidence stub response before the real key ever exists.
- [ ] **schema.sql parity:** Often the new migration ships without `schema.sql` being updated in the same commit (this project's own SCHEMA-01 finding) — verify `schema.sql` diff is part of the same PR as the new migration file(s).

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| `Motos.update()` km bypass shipped to prod before being caught | LOW | Strip `km` from the allowed-fields list, deploy; no data migration needed since it's a code-only gap, but audit recent km history for suspicious regressions during the window it was open |
| RLS policies missing on new tables (Gap-B-style repeat) | MEDIUM | Same recovery this project already executed for Gap B: introspect via `information_schema`/live REST probe, write retroactive migration + policies, update `schema.sql`, re-verify via bootstrap script — this project has a proven playbook for exactly this |
| Stub Vision contract too narrow, real call needs a different shape | HIGH | Requires touching every consumer (mobile gauges, web gauges, reminder logic) simultaneously rather than a flag flip — budget a dedicated migration phase rather than treating the swap as trivial |
| Reminder cron found to be spamming in prod | LOW–MEDIUM | Add the missing persisted "last reminded" state, backfill it from `push_send_log` history to avoid an immediate burst of "catch-up" reminders on deploy |
| Legacy Pneus UI/new consommables UI collision discovered post-ship | LOW | UI-only fix — hide/retire the legacy nav section and fiche tab; no data loss since `motos.pneu_*` columns can remain as read-only history or be backfilled into `consommables` separately |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. `Motos.update()` km bypass | Anti-fraud-logic phase | `km` absent from `Motos.update()` allowed fields; test asserts direct PUT can't lower km |
| 2. Inconsistent existing km write paths | Anti-fraud-logic phase | All of `Motos.update`, `Interventions.create`, `OrdresReparation.cloturer` route through one shared validation function |
| 3. CHECK constraint vs trigger for monotonic km | Schema-design phase | Migration file contains a `BEFORE INSERT`/`BEFORE UPDATE` trigger, not a same-row-only `CHECK`, for the ratchet |
| 4. RLS enabled-without-policy drift repeat | Schema-design phase | `scripts/bootstrap-fresh-schema.js` run clean; `pg_policies` reviewed for all 3 new tables; `schema.sql` updated same commit |
| 5. Ownership-transfer RLS correctness | Schema-design phase + integration testing | Manual/automated test: transfer a moto with wear history, confirm old owner loses read access, new owner/garage gains it |
| 6. Legacy Pneus UI collision | Schema-design phase (decide fate) + UI phase (execute) | Grep `app.html` for `pneu_` shows either full removal/redirect or explicit deprecation notice, not silent duplication |
| 7. Stub-to-real Vision contract drift | Stub-endpoint phase | Stub response includes `analyse_status`, variable `confiance`, `engine` field; UI has states for pending/failed/low-confidence before real key exists |
| 8. Reminder push spam / garage-stock blind spot | Reminder/push-reuse phase | Cron run twice back-to-back produces zero duplicate pushes; garage-owned moto surfaces a badge equivalent |

## Sources

- Direct code inspection (this repository, 2026-07-13): `schema.sql` (RLS/policy section lines 672-810, `motos`/`interventions` table definitions), `sql/migrations/13_liaison_client_moto.sql`, `supabase.js` (`Motos.update`, `Interventions.create`, `OrdresReparation.cloturer`), `services/pushService.js`, `services/maintenanceAlertService.js`, `app.html` (Pneus nav/tab, `loadPneus`).
- `.planning/PROJECT.md` — v1.5 Phase 19-22 findings on undocumented schema/RLS drift (Gap A/Gap B), used as direct precedent for Pitfall 4.
- `CLAUDE.md` (this repo) — cross-checked against actual `app.html` state; found to be stale regarding the "Pneus" nav section, itself evidence supporting Pitfall 6.
- General PostgreSQL semantics (CHECK constraints cannot reference other rows; cross-row invariants require triggers) — standard, well-established RDBMS behavior, not project-specific; not independently re-verified against current Postgres docs for this research pass, treated as HIGH confidence based on long-standing, stable SQL semantics.

---
*Pitfalls research for: MotoKey v1.6 — Suivi usure consommables + anti-fraude km*
*Researched: 2026-07-13*
