# Feature Research

**Domain:** Vehicle consumable/wear-part tracking + odometer anti-fraud (motorcycle garage DMS, persistent vehicle-passport model)
**Researched:** 2026-07-13
**Confidence:** MEDIUM-HIGH (odometer anti-fraud patterns are HIGH confidence, grounded in real regulatory/DMS systems; AI vision wear-estimation feasibility is MEDIUM — grounded in vendor/research evidence but no direct Claude Vision benchmark on tire/brake wear exists; consumable data-model fields are HIGH confidence, cross-validated across fleet software and consumer motorcycle apps)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-consumable tracking (tires F/R, chain, brake pads F/R, discs F/R, oil, brake fluid) as discrete rows, not one blob | Every comparable tool (fleet tire mgmt like Fleetio, motorcycle apps like MotorManage/MotoReady) treats each wear part as its own tracked sub-asset with its own install date/mileage and next-due calculation | LOW | Matches PROJECT.md's `consommables` table design (per-moto, extensible). Fields per row: type, mount_km, mount_date, reference (brand/model), latest_wear_pct, latest_ai_label |
| Mount-km / mount-date / reference set at install time | Fleet software (Fleetio) and motorcycle trackers universally record "when installed" as the anchor for wear-rate and next-service calculation — without it, no interval math is possible | LOW | Already in scope. This is the anchor record every wear/reminder calc depends on |
| Odometer reading history (append-only log, not a single field) | Every real vehicle-history system (Car-Pass Belgium, NMVTIS/Carfax/AutoCheck in the US) stores a chronological list of readings tied to the vehicle identity, not a mutable "current mileage" field. This is what makes fraud detectable at all | MEDIUM | `releves_km` per PROJECT.md — each row: km, date, source (garage/client/mechanic), moto_id |
| Monotonic enforcement (reject any reading lower than last known) with a rejection log | This is *the* standard fraud signal used by every vehicle-history service: "any reading lower than a previous one is definitive proof of rollback." Silent acceptance of a lower reading defeats the entire anti-fraud premise | MEDIUM | Must reject at write-time (not just flag after the fact) and log the rejected attempt (who, when, value, garage) for later review — matches how DMS systems require documentation before any correction |
| Counter-replacement as a distinct, role-gated, audited event (not a mileage edit) | Real title/DMS systems never let mileage be silently edited — a US "Exceeds Mechanical Limits" title brand and dealership "Odometer Correction Request" forms both require supervisor/manager sign-off and documentation before any downward or reset change is accepted | MEDIUM | Matches PROJECT.md design (PRO+ only, archives old reading, starts new signed one). Real-world precedent: dealership DMS requires a named accountable approver, not just any staff role — reinforces PRO+ gating over MECANO |
| Manual fallback entry when photo/AI path is unavailable | Every comparable consumer app (Motorbike Service, MotoReady) supports simple manual "mark as replaced / update km" without requiring a photo — photo+AI should be an enhancement layer, not a hard blocker to logging a wear event | LOW | Important given AI analysis starts as a stub — garage staff must be able to record consumable state without waiting on real Vision integration |
| Reminder logic: distance-since-last-check OR time-fallback, whichever comes first | This exact pattern ("mileage or time — whichever comes first") is the industry-standard reminder trigger in every motorcycle/fleet maintenance tool found (MotorManage, MotoReady, Fleetio) | LOW | Already the chosen design (km-since-last-photo OR 6-month fallback) — confirmed as the correct/expected pattern, not a novel choice |
| Weakest-link overall gauge (moto-level summary = worst consumable) | Users expect one glance-able health indicator; deriving it from the single worst-scoring part (not an average) is the pattern that maps to how a mechanic actually triages a bike — one bald tire matters more than five fine parts averaged out | LOW | Directly analogous to MotoKey's existing color-status logic (worst factor drives status), so it's consistent with an established product pattern, not a new paradigm |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI-driven wear analysis as structured, tiered proof (not raw photo dump) | Turns a photo into a comparable, queryable data point (% + label + confidence) that feeds the passport/score narrative — this is what separates MotoKey from "just an album of photos" apps like Motorbike Service | MEDIUM (stub now) → HIGH (real Vision integration later) | Output shape must stay honest about precision — see anti-features below. This is the layer that should eventually plug into the same proof-tier logic as `facture`/`visuel`/`declare` |
| Odometer anti-fraud tied to the transferable moto passport (not the owner account) | This is the single most validated pattern in this research: Belgium's Car-Pass system (VIN-tied, not owner-tied, mandatory at resale) reportedly made mileage fraud "virtually disappear." MotoKey's `moto_id`-anchored design (never `client_id`) mirrors this exactly and is the correct architecture | LOW (architecturally already decided) | Confirms the existing design decision in PROJECT.md ("tout attaché à moto_id, jamais à client_id") is aligned with the one real-world system proven to work at scale |
| Photo history per consumable (visual timeline, not just numeric wear %) | Lets a buyer/mechanic visually verify wear progression, not just trust a number — reinforces the "verifiable proof" core value already central to MotoKey's score system | LOW-MEDIUM | Straightforward extension of existing Cloudinary-based photo infra (already used for other proof types) |
| Reference-object capture guidance in the photo UX (e.g., overlay hint to place a coin/known object next to the tire) | Cheap, low-friction way to prepare for real scale-calibrated CV later — costs little to add to capture UX now (a hint overlay), pays off significantly when a specialized measurement model (not just a general VLM) is eventually swapped in | LOW (UX hint only) | Not needed for the stub, but worth designing the capture screen with this in mind since retrofitting capture UX later is more disruptive than the analysis backend swap |
| Rejection log surfaced to garage as a soft fraud signal | Beyond blocking a bad km entry, showing the garage "3 rejected lower-km entries on this moto in the last 6 months" turns a technical guard into an actionable trust signal, echoing how vehicle-history services present rollback evidence to buyers | LOW-MEDIUM | Natural extension of the rejection log already required for table-stakes monotonic enforcement — mostly a UI/reporting layer on data already being captured |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Millimeter-precise tread-depth / pad-thickness output from a single general-purpose photo analysis | Feels more "real" and lab-grade than a percentage/label | Specialized commercial tire-scanning tools (e.g. Anyline) achieve real mm accuracy using dedicated scanning flows (multi-frame/structured capture, calibrated models) — a general vision-language model reading one uncalibrated photo cannot honestly claim mm precision without a reference object and specialized training. Claiming false precision undermines trust in the exact anti-fraud story MotoKey is built on | Output a bucketed % wear estimate + qualitative condition label (bon/moyen/critique) + explicit confidence level, with copy that frames it as an assist/estimate — not an authoritative measurement. Treat it as its own (lower) proof tier, not equivalent to a real invoice |
| Silent mileage "correction" / edit endpoint for any staff role | Feels convenient when a mechanic mistypes a reading | Defeats the entire anti-fraud premise — every real system (Belgian Car-Pass, US dealership DMS, NMVTIS) treats a downward or corrected mileage as an exceptional, approval-gated, logged event, never a quiet edit. A silent edit path is also the most likely feature to get abused for a client asking a garage "friend" to lower their number | Only path to change a lower/reset reading is the existing PRO+-gated counter-replacement event, which archives the old trail and starts a new signed one — exactly as already scoped |
| Predictive ML wear-trend forecasting (e.g. "tire will hit 0% in 1,200 km") from day one | Sounds like a natural next step once wear % exists | With a stubbed AI and a brand-new consumables table, there isn't yet enough real longitudinal data per moto to fit any meaningful trend — this would be forecasting on fabricated stub data, actively misleading | Defer until real Vision analysis has been live long enough to accumulate multiple genuine readings per consumable across many motos |
| Blockchain / cryptographically hash-chained tamper-proof odometer ledger | Sounds maximally "anti-fraud" and matches the "digital key/passport" branding | Adds significant infra complexity (Node/Express + Supabase stack, no existing blockchain tooling) for a trust guarantee that real-world systems (Car-Pass, DMS) achieve with far simpler means: role-gated writes, an append-only table, RLS, and an audit/rejection log | The existing plan (monotonic enforcement + PRO+-gated replacement event + rejection log, all under Supabase RLS) already delivers the same practical guarantee real systems rely on |
| Full OBD-II / telematics live mileage sync | Would remove manual-entry fraud risk entirely, feels like the "real" fleet-grade solution | Explicitly out of scope per PROJECT.md ("diagnostics OBD-II natifs" already excluded); also disproportionate hardware/integration cost for an independent garage's aftermarket motorcycles vs. the manual-entry + anti-fraud-logic approach already chosen | Keep manual/photo-based entry with monotonic + audit-log anti-fraud — the Belgian Car-Pass precedent shows this achieves near-elimination of fraud without any vehicle-side hardware |

## Feature Dependencies

```
[moto passport identity (motos table, moto_id)]  — existing
    └──requires (already satisfied)──> [consommables table] (per-moto wear parts)
                                            └──requires──> [photos_consommables] (photo + AI analysis per consumable)
                                                                └──requires──> [Cloudinary photo infra] — existing, stub for now
                                                                └──requires──> [AI analysis stub → real Anthropic Vision swap later]

[releves_km history] (odometer log)
    └──requires──> [monotonic enforcement + rejection log]
                        └──requires──> [RBAC / requireRole()] — existing
                                            └──enables──> [counter-replacement event] (PRO+ only, archives + signs new counter)

[per-consumable latest_wear_pct]  ──enables──> [overall weakest-link gauge]

[releves_km + photos_consommables timestamps]  ──enables──> [reminder logic: km-since-last-photo OR 6-month fallback]
                                                                    └──enhances──> [existing push notification infra (MPUSH-01..05)]

[real AI Vision analysis]  ──conflicts (design tension)──> [anti-fraud proof-tier weighting 1.0/0.6/0.3]
```

### Dependency Notes

- **`consommables` requires the existing `motos`/moto-passport identity:** every wear-part row must anchor to `moto_id`, never `client_id` — this is both an existing architectural constraint (PROJECT.md) and the single most validated pattern from real-world systems (Car-Pass ties data to VIN, not owner).
- **`photos_consommables` requires existing Cloudinary infra:** the upload path already exists for other proof photos; this milestone should reuse it (with the AI-analysis step stubbed), not build a parallel photo pipeline.
- **Monotonic enforcement requires `requireRole()`/RBAC (existing):** the rejection-vs-accept decision is not role-gated, but the *exception path* (counter replacement) must reuse the existing PRO+ RBAC middleware rather than inventing new authorization logic.
- **Counter-replacement enables trustworthy long-term odometer history:** without it, any legitimate counter failure/replacement (real event on older motos) would either be impossible to record or would require breaking monotonic enforcement — the archived-old/signed-new pattern resolves this the same way "Exceeds Mechanical Limits" title branding does in US DMV systems.
- **Weakest-link gauge requires per-consumable wear % to exist first:** it's a derived/aggregate feature, not a new data source — sequence consumable tracking before the aggregate gauge in implementation order.
- **Reminder logic requires both `releves_km` and `photos_consommables` timestamps:** the km-since-last-photo calculation needs the last photo date/km AND the current odometer reading, so both stores must exist before reminders can compute anything meaningful. It naturally enhances (does not require rebuilding) the existing push notification system from v1.3.
- **Real AI Vision analysis creates a design tension with the existing proof-tier weighting (1.0/0.6/0.3):** an AI-estimated wear % is not equivalent to a `facture` (invoice) or even a plain `visuel` (photo) proof — it is an automated *interpretation* of a photo, with inherent uncertainty. This should NOT be silently mapped to the `visuel` (0.6) tier. Flag this explicitly as a decision needing Mehdi's validation before the real Vision integration ships (a phase-specific research/decision point, not something to resolve now with the stub).

## MVP Definition

### Launch With (v1 — this milestone, per PROJECT.md scope)

- [ ] `consommables` table (tires F/R, chain, brake pads F/R, discs F/R, oil, brake fluid) with mount_km/mount_date/reference per moto — essential anchor for everything else
- [ ] `releves_km` table with strict monotonic enforcement + rejection+log on lower readings — the actual anti-fraud mechanism, not optional
- [ ] Counter-replacement event, PRO+-gated, archiving old odometer trail and starting a new signed one — the only legitimate exception path
- [ ] `photos_consommables` with stubbed structured AI output (% wear + label + confidence) — clean branch point for real Vision later, per PROJECT.md
- [ ] Garage + mobile client gauge UI: per-consumable % + overall weakest-link gauge
- [ ] Reminder logic: km-since-last-photo OR 6-month time fallback, surfaced as push (mobile) + badge (garage)

### Add After Validation (v1.x)

- [ ] Swap AI stub for real Anthropic Claude Vision analysis — trigger: Anthropic Vision key provisioned + stub output shape validated against real garage usage
- [ ] Swap photo storage stub for real Cloudinary wiring (if not already live by then) — trigger: same convention as `EMAIL_ENABLED`/`PUSH_ENABLED` flag flip
- [ ] Rejection-log surfaced as a garage-facing trust/fraud dashboard signal (not just silently blocked) — trigger: enough real rejected-entry volume to be worth surfacing
- [ ] Decision on how AI-analyzed wear photos map (or don't) into the existing 1.0/0.6/0.3 proof-tier weighting — trigger: real Vision analysis going live, requires explicit Mehdi validation per project constraints

### Future Consideration (v2+)

- [ ] Predictive wear-trend forecasting from accumulated real readings — defer until enough genuine longitudinal data exists per consumable/moto to avoid forecasting on stub/sparse data
- [ ] Reference-object-calibrated measurement (coin/known-object in frame) for closer-to-mm accuracy — defer until real Vision integration proves the qualitative output isn't sufficient
- [ ] Cross-garage/cross-model benchmark wear-rate data (anonymized) — defer, needs meaningful data volume and raises data-sharing questions out of scope now

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `consommables` table + lifecycle (mount/reference) | HIGH | LOW | P1 |
| `releves_km` + monotonic enforcement + rejection log | HIGH | MEDIUM | P1 |
| Counter-replacement event (PRO+ gated) | HIGH | MEDIUM | P1 |
| Photo upload + stubbed AI structured output | HIGH | MEDIUM | P1 |
| Per-consumable + weakest-link gauge UI (mobile+garage) | HIGH | LOW-MEDIUM | P1 |
| Reminder logic (km OR time fallback) + push/badge | MEDIUM-HIGH | LOW-MEDIUM | P1 |
| Rejection-log surfaced as fraud-signal dashboard | MEDIUM | LOW | P2 |
| Real Anthropic Vision swap | HIGH (long-term) | HIGH | P2 |
| Real Cloudinary swap (if still stubbed) | MEDIUM | LOW | P2 |
| Proof-tier integration of AI analysis into score formula | MEDIUM | MEDIUM (needs decision, not just code) | P2 |
| Reference-object calibration UX hint | LOW (now) / MEDIUM (later) | LOW | P3 |
| Predictive wear forecasting | MEDIUM | HIGH | P3 |
| Cross-garage benchmark data | LOW-MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Car-Pass (Belgium, legal mileage registry) | Fleetio / fleet tire mgmt | Motorcycle consumer apps (MotorManage, MotoReady) | MotoKey's Approach |
|---------|---------------------------------------------|----------------------------|-----------------------------------------------------|---------------------|
| Identity anchor | VIN, not owner | Vehicle/asset ID | Usually the user's own bike list (owner-anchored) | `moto_id` (passport), never `client_id` — closer to Car-Pass than to consumer apps |
| Mileage history | Append-only, sourced from garages/inspections/manufacturers, tamper-resistant paper w/ hologram | Telematics + manual entry, per-asset log | Manual entry, single "current mileage" typically | Append-only `releves_km`, software-enforced monotonic + rejection log instead of physical anti-forgery |
| Mileage correction | Not user-editable; only official data sources feed it | Fleet manager/admin role typically required | Freely editable by the owner (trust-based, no fraud model) | PRO+-gated counter-replacement event only, archives old + signs new — closest match to Car-Pass's "only authoritative sources" model, adapted to a role hierarchy instead of a national registry |
| Wear-part tracking granularity | Not in scope (mileage only, not wear parts) | Per-tire sub-asset, tread depth, replacement triggers at defined thresholds | Per-part reminders (chain/pad/tire) tied to mileage-or-time | Per-consumable table with mount km/date/reference + wear % — matches fleet-software granularity, adapted to motorcycle-specific parts |
| Reminder trigger | N/A | Threshold-based (e.g. tread nearing legal minimum) | Mileage OR time, whichever first | Same pattern: km-since-last-photo OR 6-month fallback — validated as the industry-standard trigger, not a novel choice |
| Wear estimation method | N/A | Manual tread measurement or specialized scanner (e.g. Anyline), not general AI photo analysis | Manual/self-reported, no AI analysis found in surveyed apps | Photo + AI structured output (stub now, real Vision later) — this is the actual differentiator vs. every competitor surveyed, since none of them combine photo capture with automated wear interpretation |

## Sources

- [Belgian Car-Pass — official site, "How does Car-Pass work?"](https://www.car-pass.be/en/about-car-pass/how-does-car-pass-work) — HIGH confidence, official source, primary evidence for VIN-anchored (not owner-anchored) mileage registry pattern and its real-world fraud-reduction effect
- [FPS Economy (Belgian government) — Car-Pass FAQ](https://economie.fgov.be/en/themes/consumer-protection/car-pass/car-pass-frequently-asked) — HIGH confidence, government source confirming legal mandate and data sourcing
- [VinCheckup — Odometer History Report & Mileage Rollback Check](https://www.vincheckup.com/vehicle-odometer-history-check) — MEDIUM confidence, vendor content but consistent with monotonic-detection principle used across the industry
- [Timeero — Odometer Rollback: How to Spot and Prevent Odometer Fraud](https://timeero.com/post/odometer-rollback) — MEDIUM confidence, corroborates monotonic-reading detection pattern
- [Virginia DMV — Your Odometer: The Key to Your Car's Value](https://www.dmv.virginia.gov/vehicles/general/odometer) — HIGH confidence, official state source on federal odometer disclosure requirements
- [GoodCar — Odometer Title Brands: Risks, Types & Buyer Tips](https://goodcar.com/title-check/odometer-title-brands) — MEDIUM confidence, explains "Exceeds Mechanical Limits" title branding pattern relevant to counter-replacement/archival design
- [MangoApps — Federal Odometer Disclosure Statement Compliance Log Template](https://www.mangoapps.com/templates/forms/federal-odometer-disclosure-statement-compliance-log) — MEDIUM confidence, corroborates supervisor/manager sign-off requirement for odometer corrections in dealership workflows
- [Iowa DOT — Odometer/Mileage Correction Process](https://iowadot.gov/media/10413/download?inline=) — HIGH confidence, official state process document
- [Fleetio — Tire Management Software](https://www.fleetio.com/features/tire-management) — MEDIUM confidence, vendor source but reflects widely-consistent fleet-industry data model (tread depth, mileage, per-tire sub-asset)
- [Anyline — Commercial Tire Tread Scanner Uses AI (Heavy Duty Trucking)](https://www.truckinginfo.com/10232985/anyline-commercial-tire-tread-scanner-uses-ai) — MEDIUM confidence, trade-press coverage of a real commercial product; used as evidence that mm-accurate tread measurement requires specialized/calibrated scanning, not a single general photo
- [Ultralytics — Vision AI can be used to detect wear on the inside of a tire](https://www.ultralytics.com/blog/vision-ai-can-be-used-to-detect-wear-on-the-inside-of-a-tire) — LOW-MEDIUM confidence, vendor blog, directional evidence only
- [MDPI — Comparative Evaluation of Multimodal LLMs for No-Reference Image Quality Assessment (Claude/OpenAI)](https://www.mdpi.com/2504-2289/9/5/132) — MEDIUM confidence, peer-reviewed-adjacent source on general VLM limitations without reference objects
- [MotorManage — Motorcycle Service Log / Digital Service History Tracker](https://motormanage.app/features/service-log) — MEDIUM confidence, direct competitor product, confirms per-part mileage-linked replacement tracking and mileage-or-time reminder pattern
- [MotoReady — Motorcycle Maintenance Tracker App](https://motoready.pro/) — MEDIUM confidence, direct competitor product, confirms front/rear tire wear tracking and per-part logs matching MotoKey's consumable list almost exactly
- [Motorbike Service App (App Store listing)](https://apps.apple.com/us/app/motorbike-service-motorcycle-maintenance-log-book/id1060640587) — LOW-MEDIUM confidence, App Store description, corroborates manual-entry-first pattern as acceptable baseline

---
*Feature research for: Motorcycle garage DMS — consumable wear tracking + odometer anti-fraud (subsequent milestone on existing MotoKey platform, v1.6)*
*Researched: 2026-07-13*
