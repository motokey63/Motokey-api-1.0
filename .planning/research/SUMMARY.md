# Project Research Summary

**Project:** MotoKey — Garage DMS (v1.6 milestone: Suivi usure consommables + anti-fraude km)
**Domain:** Vehicle consumable-wear photo tracking + odometer (km) anti-fraud, added to an existing production Node/Express + Supabase monolith
**Researched:** 2026-07-13/14
**Confidence:** HIGH

## Executive Summary

This milestone adds three new capabilities to an already-shipping garage DMS: per-consumable wear tracking (tires, chain, pads, discs, oil, brake fluid) with photo capture, a stubbed Claude Vision analysis endpoint (real AI deferred), and strict monotonic odometer anti-fraud with a PRO+-gated counter-replacement exception. Experts in both domains agree on the shape: wear parts are tracked as discrete per-consumable rows anchored to the vehicle identity (never the owner), and odometer fraud is defeated the same way Belgium's Car-Pass registry does it — an append-only, VIN/vehicle-anchored history with monotonic enforcement, not owner-editable "current mileage." MotoKey's existing architecture (`moto_id`-anchored passport, service-role Supabase access, flag-gated service modules like `EMAIL_ENABLED`/`PUSH_ENABLED`) is already aligned with these patterns, so the recommended approach is almost entirely additive: new tables FK'd to `moto_id` only, a `BEFORE INSERT` Postgres trigger (not a `CHECK` constraint) for monotonic km enforcement, and a `VISION_ENABLED`-flag service module mirroring `pushService.js` exactly, with the stub's JSON shape designed as if it were the real Anthropic response from day one.

The single biggest risk is not building the new feature — it's that this codebase already has **three existing, unguarded write paths to `motos.km`/`interventions.km`** (`Motos.update()`, `Interventions.create()`, `OrdresReparation.cloturer()`), any one of which will silently defeat the new anti-fraud layer if not closed or redirected in the same milestone. A second major risk is repeating the exact undocumented-RLS/schema-drift pattern that consumed all of v1.5 (3 phases) — this milestone must write RLS policies and `schema.sql` updates in the same commit as each migration, verified via the now-proven `scripts/bootstrap-fresh-schema.js`. A third, lower-severity but real risk: the codebase's own `CLAUDE.md` claims the legacy "Pneus" tire UI was removed — it wasn't; it's live in `app.html` and will visually collide with the new generalized consumable gauge unless explicitly retired or reconciled.

The recommended approach is: ship schema + DB-level anti-fraud enforcement first (closing all existing km bypass paths in the same phase, not later), then thin CRUD helpers, then the Vision stub (contract locked before any UI consumes it), then the guarded endpoints, then the reminder cron (reusing `maintenanceAlertService.js`'s idempotency pattern exactly), then UI across garage/client/mobile last. No new frameworks, libraries, or infrastructure are needed — every recommended technology already has a working precedent somewhere in this codebase.

## Key Findings

### Recommended Stack

No new dependencies are needed for this milestone. The odometer anti-fraud mechanism is pure SQL (a `BEFORE INSERT` PL/pgSQL trigger reusing the exact idiom already live in `trg_recalc_score`/`trg_update_km`), the Vision analysis endpoint is a hardcoded stub (no `@anthropic-ai/sdk` import until a future milestone actually wires the real call), and photo upload reuses the existing (currently disabled) client-direct Cloudinary unsigned-preset pattern — the backend never touches image bytes, only a URL string. Research found and corrected a milestone-brief assumption: **neither Cloudinary nor the Anthropic API is "already used" in this codebase** — `storage.js`'s OCR pipeline calls Google Document AI (never installed, dead code, never `require()`'d), and `CLOUDINARY_CLOUD` is an empty string everywhere it appears. The one genuinely reusable, proven-in-prod precedent is the `ENABLED`-flag service pattern from `emailService.js`/`pushService.js`.

**Core technologies:**
- PL/pgSQL `BEFORE INSERT` trigger (native Postgres, no extension) — rejects non-monotonic km, reusing the exact trigger idiom already live in `schema.sql`
- Anthropic Messages API, `image` content block with `source.type: "url"` — deferred to a future milestone; stub now, real call is a ~10-line swap later if the JSON contract is locked correctly today
- Cloudinary unsigned-preset browser upload (existing disabled pattern, plain `fetch()`/`FormData`, no SDK) — backend only ever stores a URL string
- No new validation library, no new scheduler library, no new upload middleware (`multer`) — codebase convention is hand-rolled validation and HTTP-triggered cron endpoints (`X-Cron-Secret` header), not in-process schedulers

### Expected Features

**Must have (table stakes):**
- Per-consumable tracking as discrete rows (tires F/R, chain, pads F/R, discs F/R, oil, brake fluid) with mount_km/mount_date/reference
- Append-only odometer reading history (`releves_km`), not a single mutable field
- Strict monotonic enforcement (reject any reading lower than last known) with a rejection log — silent acceptance defeats the entire anti-fraud premise
- Counter-replacement as a distinct, PRO+-gated, audited event (archives old reading, signs a new chain) — never a silent mileage edit
- Manual fallback entry when photo/AI path is unavailable (photo+AI is an enhancement layer, not a hard blocker)
- Reminder logic: km-since-last-photo OR 6-month time fallback, whichever comes first (industry-standard pattern)
- Weakest-link overall gauge (worst consumable drives the summary, not an average) — consistent with MotoKey's existing color-status logic

**Should have (competitive):**
- AI-driven wear analysis as structured, tiered proof (% + label + confidence), not a raw photo dump
- Odometer anti-fraud tied to the transferable moto passport (`moto_id`, never `client_id`) — the single most validated pattern found (mirrors Belgium's Car-Pass, which "made mileage fraud virtually disappear")
- Photo history per consumable (visual timeline)
- Rejection log surfaced to garage as a soft fraud-trust signal

**Defer (v2+):**
- Millimeter-precise tread-depth output from a single uncalibrated photo — false precision undermines trust; ship a bucketed %/label/confidence instead
- Silent mileage "correction" endpoint for any staff role — the anti-fraud mechanism's entire point is that there is no such path
- Predictive ML wear-trend forecasting — no real longitudinal data exists yet against a stub
- Blockchain/hash-chained tamper-proof ledger — unnecessary complexity; role-gated writes + RLS + audit log already deliver the same real-world guarantee
- Full OBD-II/telematics mileage sync — explicitly out of scope per PROJECT.md
- Reference-object-calibrated measurement, cross-garage benchmark data — defer until real Vision analysis proves the qualitative output insufficient

### Architecture Approach

The milestone is purely additive to the existing single-file-router monolith: new endpoint blocks in `motokey-api.js` (same `M(method, path)` matcher pattern, no Express Router), three new `supabase.js` entity objects (`Consommables`, `PhotosConsommables`, `RelevesKm`), a new flag-gated `services/visionAnalysisService.js` (mirrors `pushService.js`'s `ENABLED`-flag/never-throws structure exactly), and a new cron-scan service (`consommableAlertService.js`) that delegates all push-sending/idempotency to the existing `pushService.sendPush()` rather than reimplementing it. All new tables FK to `moto_id` only (never `client_id`), consistent with the polymorphic-ownership model from L8, and get RLS enabled with policies written in the same migration commit — not clicked into the Supabase Dashboard.

**Major components:**
1. `motokey-api.js` new endpoint blocks — km reading + anti-fraude check, photo upload + stub analysis, counter-replacement (PRO+), gauges read
2. `supabase.js` entity helpers — thin CRUD wrappers for the 3 new tables, the only DB-access boundary
3. `services/visionAnalysisService.js` (new) — `VISION_ENABLED`-flag stub/real Vision analysis, single `analyzePhoto()` export whose return shape is the swap-in contract
4. `services/consommableAlertService.js` (new) — cron-triggered km/time reminder scan, reuses `pushService.sendPush()` for delivery/idempotency, never writes `push_send_log` directly
5. DB layer — `consommables`/`photos_consommables`/`releves_km` tables + `BEFORE INSERT` monotonic trigger + RLS policies, all `moto_id`-anchored

### Critical Pitfalls

1. **`Motos.update()` already lets anyone overwrite `km` with zero validation** — the new anti-fraud endpoint means nothing if this existing whitelisted field (`allowed = ['km', ...]`) isn't closed in the same milestone. Strip `km` from the allowed-fields list; all km changes must go through the guarded path.
2. **Km already has two more silent/inconsistent write paths** (`Interventions.create()` ignores `motos.km` entirely; `OrdresReparation.cloturer()` has an ad-hoc silent-skip guard, not reject+log). All three existing writers must route through one shared validation function, or the system ends up with three mutually-inconsistent definitions of "current km."
3. **`CHECK` constraints cannot see other rows** — monotonic km enforcement requires a `BEFORE INSERT` trigger querying `MAX(km)`/`motos.km` for the moto, with an explicit bypass only for `type_evenement = 'remplacement_compteur'` rows. A denormalized "previous km" column trusted from the app is fragile and silently unenforced if the app forgets to set it.
4. **RLS-enabled-but-unpoliced drift repeat** — this exact pattern (RLS `ENABLE`d via Dashboard, policies never written to a migration file) consumed 3 full phases in v1.5 (Gap B). Write `CREATE POLICY` in the same migration file as `CREATE TABLE`, or explicitly comment "service-role-only, intentional" if that's the real design, and re-run `scripts/bootstrap-fresh-schema.js` before phase sign-off.
5. **Legacy `pneu_*`/"Pneus" nav UI is live in prod and contradicts `CLAUDE.md`'s claim it was removed** — will produce two independently-computed, contradictory tire-wear numbers shown to the same user unless explicitly retired or reconciled during the UI phase.
6. **Stub Vision response shape must be designed as the real contract from day one** — include `analyse_status` (ok/incertain/echec), variable `confiance`, and an `engine` (stub/anthropic-vision-v1) field, and decide the sync/async question now. Building the stub "just enough to unblock UI" turns the future real-call swap into a breaking change across every consumer instead of a flag flip.
7. **Reminder cron needs the same persisted "last reminded" idempotency state as `maintenanceAlertService.js`**, plus an explicit garage-side badge equivalent for garage-owned/unclaimed motos (which have no client to push to) — a fresh cron without this reuse will spam on the second run or silently exclude garage stock.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Schema + DB-level anti-fraud enforcement (including closing existing km bypasses)
**Rationale:** Nothing downstream can be tested without the tables existing, and the biggest single risk (Pitfalls 1-4) is entirely a schema/enforcement-layer concern — must be closed before it's "done," not deferred to a later phase.
**Delivers:** `sql/migrations/23-26_*.sql` (consommables, photos_consommables, releves_km, RLS policies) + same-commit `schema.sql` update + `BEFORE INSERT` monotonic trigger with `remplacement_compteur` bypass + rejection-log table + `scripts/bootstrap-fresh-schema.js` verification + `Motos.update()` km field stripped + `Interventions.create()`/`OrdresReparation.cloturer()` routed through the shared validation function.
**Addresses:** Odometer history, monotonic enforcement, counter-replacement audit trail (FEATURES.md table stakes)
**Avoids:** Pitfalls 1, 2, 3, 4, 5 (all schema-design-phase pitfalls)

### Phase 2: `supabase.js` entity helpers + Vision stub contract
**Rationale:** Thin CRUD wrappers and the stub's JSON shape are the foundation every endpoint and every future UI consumes — the stub contract must be locked before any endpoint or UI is built against it (Pitfall 7).
**Delivers:** `Consommables`/`PhotosConsommables`/`RelevesKm` objects in `supabase.js`; `services/visionAnalysisService.js` with `VISION_ENABLED` flag, `analyzePhoto()` returning `{usure_pct, etat, confiance, analyse_status, engine, source}`.
**Uses:** `ENABLED`-flag service pattern from STACK.md (mirrors `emailService.js`/`pushService.js`)
**Implements:** Architecture components 2-3 (supabase.js entity helpers, visionAnalysisService.js)

### Phase 3: Backend endpoints (km reading, photo upload, counter-replacement, gauges)
**Rationale:** Build anti-fraude/monotonic logic before the gauge read, since gauges depend on a clean `motos.km`/`releves_km` history existing (ARCHITECTURE.md build order).
**Delivers:** `POST /motos/:id/km`, `POST /motos/:id/consommables/:cid/photos`, `POST /motos/:id/km/remplacement-compteur` (PRO+), `GET /motos/:id/consommables` (weakest-link gauge calc).
**Addresses:** Manual fallback entry, counter-replacement RBAC (FEATURES.md table stakes)
**Avoids:** Security Mistake — counter-replacement missing `requireRole('PRO')`

### Phase 4: Reminder cron + push/badge reuse
**Rationale:** Depends on Phase 3's `km_derniere_photo`/`date_derniere_photo` columns being populated by real endpoint traffic.
**Delivers:** `services/consommableAlertService.js` + `POST /cron/consommables-reminders` (same `X-Cron-Secret` pattern), persisted per-consumable "last reminded" state, garage-side badge for garage-owned/unclaimed motos.
**Addresses:** Reminder logic (km OR 6-month fallback) — FEATURES.md table stakes
**Avoids:** Pitfall 8 (reminder spam / garage-stock blind spot)

### Phase 5: Garage web UI (`app.html`) — gauges + photo capture + legacy Pneus reconciliation
**Rationale:** Can be built in parallel with client/mobile once Phase 3 endpoints are stable; must explicitly resolve the legacy tire UI collision, not leave it silently reachable.
**Delivers:** `renderConsommablesGauge(motoId)`, photo-upload UI reusing the `CLOUDINARY_CLOUD` gate pattern, legacy `pneu_*`/Pneus nav+tab retired or reconciled, `CLAUDE.md` updated to match reality.
**Addresses:** Weakest-link gauge UI
**Avoids:** Pitfall 6 (legacy Pneus UI collision), UX Pitfall (stub-derived vs real-derived wear % visual distinction)

### Phase 6: Client web UI (`MotoKey_Client.html`)
**Rationale:** Same gauge screens, client-scoped; depends on the same stable endpoint contracts as Phase 5.
**Delivers:** Client-facing gauge screen + photo capture (same Cloudinary client-side upload pattern as existing `submitClaim()`).

### Phase 7: Mobile app (`mobile-app/`)
**Rationale:** Last, since it depends on the same stable endpoint contracts as Phases 5-6 and has the longest feedback loop (EAS builds) — matches ARCHITECTURE.md's explicit suggested build order.
**Delivers:** New consommables gauge screen, `lib/consommables.ts` API client, one new case in `useNotificationObserver.ts`'s `mapNotificationDataToRoute()`.

### Phase Ordering Rationale

- Schema-first ordering is not just convention — it's the only way to close Pitfalls 1-4 (existing km bypass paths, RLS drift, CHECK-vs-trigger mistake) before any other code depends on the flawed state.
- The Vision stub contract is deliberately sequenced before any endpoint/UI work touches it, because retrofitting the contract later (Pitfall 7) requires touching every consumer simultaneously — a dedicated migration phase, not a flag flip.
- UI phases are last and ordered garage to client to mobile, matching the project's own established build-order precedent (longest feedback loop last) and allowing the legacy Pneus UI decision (Pitfall 6) to be resolved once, centrally, before it's replicated across three UI surfaces.
- The reminder cron is sequenced after backend endpoints specifically because its data source (`km_derniere_photo`/`date_derniere_photo`) doesn't exist until real upload traffic populates it.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Schema + anti-fraud trigger):** Standard Postgres trigger patterns are well-documented (skip deep research), but the interaction between the trigger's rollback behavior and the app-layer rejection-log write (a `RAISE EXCEPTION` rolls back everything in its own transaction, so the log write must happen in a separate statement from the Node layer) is a subtle correctness detail worth a focused check during phase planning.
- **Phase 2 (Vision stub contract):** Low research need for the stub itself, but if/when a future milestone wires the real Anthropic Vision call, that phase should re-fetch current Anthropic Messages API docs (image content block, model names) since the SDK ships frequent minor releases.

Phases with standard patterns (skip research-phase):
- **Phase 3 (backend endpoints):** Direct extension of existing `motokey-api.js`/`supabase.js`/RBAC conventions, already fully documented in ARCHITECTURE.md with code examples.
- **Phase 4 (reminder cron):** Direct copy of the already-proven `maintenanceAlertService.js` pattern.
- **Phases 5-7 (UI):** Direct extension of existing `render*()`/Cloudinary-gate/Expo-screen conventions already live in the codebase.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every claim verified by direct file reads (`package.json`, `.env`, `storage.js`, `MotoKey_Client.html`, `schema.sql`), not assumed from CLAUDE.md/milestone brief — and two brief assumptions were actively corrected (Cloudinary/Anthropic not actually wired anywhere). |
| Features | MEDIUM-HIGH | Odometer anti-fraud patterns are HIGH confidence (grounded in real regulatory/DMS systems: Belgian Car-Pass, US DMV odometer disclosure law). AI vision wear-estimation feasibility is MEDIUM (no direct Claude Vision benchmark exists for tire/brake wear; vendor/trade-press evidence only). Consumable data-model fields are HIGH confidence, cross-validated across fleet software and consumer motorcycle apps. |
| Architecture | HIGH | All findings verified against actual codebase files (`motokey-api.js`, `supabase.js`, `schema.sql`, `services/*.js`, `mobile-app/`), including concrete code examples mirroring existing live patterns. |
| Pitfalls | HIGH for project-specific findings (all directly evidenced via `Motos.update()`, `Interventions.create()`, `OrdresReparation.cloturer()`, `app.html` Pneus section reads) — MEDIUM for general Postgres/Supabase mechanics not independently re-verified against current docs this pass (though treated as HIGH given long-standing, stable RDBMS semantics). |

**Overall confidence:** HIGH

### Gaps to Address

- **AI Vision wear-estimation real-world accuracy is unproven** — no direct evidence Claude Vision (or any general VLM) can reliably estimate tire/brake wear from an uncalibrated photo. The stub defers this risk entirely, but the future real-Vision-swap milestone should budget for a validation/calibration pass against real garage photos before trusting output, and should treat "mm-precise" claims as explicitly out of scope (FEATURES.md anti-feature).
- **Whether `releves_km` becomes the sole source of truth for km, or `motos.km` stays a denormalized cache updated only via the validated path** — PITFALLS.md flags this as a decision that must be made explicitly during Phase 1, not left implicit; not fully resolved by research, needs an explicit call during schema-design.
- **How AI-analyzed wear % maps (or doesn't) into the existing 1.0/0.6/0.3 anti-fraude proof-tier weighting** — explicitly flagged across FEATURES.md and PITFALLS.md as requiring Mehdi's direct validation before the real Vision integration ships; do not silently map it to the `visuel` (0.6) tier. Not a blocker for this stub-based milestone, but must not be decided unilaterally in code.
- **Fate of legacy `motos.pneu_av`/`pneu_ar`/`pneu_km_montage` columns and the "Pneus" nav/tab** — research surfaced the problem and two candidate resolutions (migrate+drop vs. deprecate+hide) but did not pick one; must be an explicit decision recorded during Phase 1/5, and `CLAUDE.md` corrected once resolved (it currently misstates this as already done).
- **Reminder threshold values (km_since_last_photo cutoff, 6-month window) are illustrative in research, not finalized** — ARCHITECTURE.md's example code explicitly flags `kmSince >= 3000` as "threshold illustrative — confirm with Mehdi."

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `motokey-api.js`, `supabase.js`, `auth/rbac.js`, `services/emailService.js`, `services/pushService.js`, `services/maintenanceAlertService.js`, `schema.sql`, `sql/migrations/*.sql`, `MotoKey_Client.html`, `app.html`, `storage.js`, `.env`, `package.json`, `mobile-app/hooks/useNotificationObserver.ts`, `scripts/bootstrap-fresh-schema.js`, `.planning/PROJECT.md`
- Official Anthropic docs — Vision (https://platform.claude.com/docs/en/docs/build-with-claude/vision), fetched 2026-07-14
- Belgian Car-Pass official site and FPS Economy government FAQ — VIN-anchored mileage registry pattern
- Virginia DMV / Iowa DOT official odometer disclosure/correction process documents

### Secondary (MEDIUM confidence)
- VinCheckup, Timeero — odometer rollback detection industry patterns
- GoodCar, MangoApps — title-branding and dealership odometer-correction sign-off conventions
- Fleetio tire management — fleet-industry consumable data-model granularity
- Anyline commercial tire scanner trade-press coverage — evidence that mm-accurate wear measurement needs specialized/calibrated capture, not general photo analysis
- MotorManage, MotoReady — direct competitor consumer motorcycle maintenance apps, confirm per-part mileage-linked tracking and mileage-or-time reminder pattern
- npm registry live queries — current versions of `@anthropic-ai/sdk`, `cloudinary`, `multer` (2026-07-14)

### Tertiary (LOW confidence)
- Ultralytics vendor blog — directional-only evidence on vision AI tire-wear detection
- Motorbike Service App Store listing — corroborates manual-entry-first baseline only

---
*Research completed: 2026-07-14*
*Ready for roadmap: yes*
