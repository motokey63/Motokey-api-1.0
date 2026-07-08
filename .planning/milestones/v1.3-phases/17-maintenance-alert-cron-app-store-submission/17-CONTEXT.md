# Phase 17: Maintenance Alert Cron + App Store Submission - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Two bundled capabilities per ROADMAP.md:
1. **MPUSH-04** — Backend cron detects motos crossing the existing UX-02 maintenance threshold (≥80% "warning", ≥100% "urgent") and sends a push notification (via the Phase 13 `pushService.js` fan-out), deep-linking to the moto's fiche (reusing Phase 16's notification-tap navigation).
2. **MSTORE-01/02** — App is made submission-ready: Privacy Manifest (Apple) + Data Safety form (Google) content, EAS project setup, and (as far as external accounts allow) a validation pass via TestFlight / Android internal test track.

This phase does NOT include: real App Store/Play Store publication (blocked on external account creation — see Decisions), new maintenance-tracking features beyond what UX-02 already calculates, or any change to the anti-fraud scoring formula.

</domain>

<decisions>
## Implementation Decisions

### App Store Account Readiness (blocking constraint)
- **D-01:** Neither an Apple Developer Program membership ($99/yr) nor a Google Play Console account ($25 one-time) exists yet. Mehdi has not created either.
- **D-02:** Scope resolution (mirrors the existing Phase 8/BILL-06 "known gap" pattern in this project): build everything code-ready in this phase, then explicitly park the actual submission step.
  - MPUSH-04 (cron): fully shipped, tested, live in prod — no dependency on store accounts.
  - MSTORE-01: Privacy Manifest (Apple) + Data Safety (Google) **content** written and ready to paste in once accounts exist — the content itself doesn't require the accounts, only the actual upload/submission does.
  - EAS: `eas.json` + EAS `projectId` configured, one real development build produced (Expo/EAS account is free — no paywall, unlike the store accounts).
  - MSTORE-02 (actual TestFlight / Play internal track submission): **PARKED as a known gap**, same treatment as Phase 8 — blocked on Mehdi creating both paid developer accounts. Not a phase failure; do not treat MSTORE-02 as shippable without them.
- **D-03:** Bundle ID / package name: **`com.motokey.app`** for both `ios.bundleIdentifier` and `android.package` in `mobile-app/app.json` (currently unset in both).

### Maintenance Alert Notification Policy
- **D-04:** Notify **once per tier crossing**, never repeat for a tier already notified. A moto crossing 80% ("warning") gets exactly one push ("Révision à planifier"); the same moto later crossing 100% ("urgent") gets exactly one more push ("Révision dépassée"). If the cron re-runs daily and the moto's percentage hasn't moved into a new, not-yet-notified tier, no push is sent. This directly satisfies the ROADMAP's own success criterion ("pas de spam au réexécution du cron").
- **Implication for planner/researcher:** the existing threshold calc (`supabase.js` `Motos.list()` ~line 246-267, and the per-plan endpoint ~line 438-452) is computed fresh on every read with no persistence — some new persisted "last notified tier" state (per moto, or per moto+plan_entretien row) is needed to implement the once-per-tier rule. Exact storage shape (new column vs. new table) is Claude's discretion at planning time — not decided here.

### Cron Mechanism
- **D-05:** Trigger mechanism is a **GitHub Actions scheduled workflow** (`on: schedule: cron: ...`, e.g. daily at 8am) calling a protected backend endpoint (`POST /cron/maintenance-alerts` or similar) with a secret header (e.g. `X-Cron-Secret`, stored as a GitHub Actions secret + Railway env var). Rejected alternatives: Railway's own Cron Job service type (adds a second billed service to maintain) and an external pinger like cron-job.org (config lives outside the repo/git history — less auditable). Reasoning given: free, versioned in-repo, visible run history/logs in the GitHub Actions tab.
- **Implication:** the endpoint itself must be safe to call idempotently and must reject calls without the correct secret (this is a new unauthenticated-by-JWT, secret-authenticated endpoint — a different auth pattern from the rest of the API, worth flagging to the planner).

### EAS Build Setup Scope
- **D-06:** Go all the way to a real build this phase, not just config: `eas login` (free Expo account — Mehdi does not have one yet, needs to create it), `eas init` (populates `projectId` in `app.json`), configure `eas.json` with at least a `development` build profile, then run one actual `eas build --profile development` to produce a real installable dev build. Goal: finally close the Phase 13/16 SC-1 deferral (real device push token registration/delivery, impossible in Expo Go since SDK 53 removed remote push there) with a real EAS dev build.
- **Note:** `eas login` requires interactive browser/credential auth — this step cannot be automated by Claude and will be a human checkpoint in the plan, same treatment as the Phase 16-04 on-device checkpoint.

### Claude's Discretion
- Exact DB shape for persisting "last notified tier" per moto (new column on an existing table vs. new table) — planner decides based on existing schema conventions.
- Exact wording/copy of the two push notification bodies ("Révision à planifier" / "Révision dépassée" are directional examples from discussion, not locked final copy).
- Whether the cron endpoint processes all garages/clients in one batch or paginates — an implementation detail based on expected data volume (currently small).
- Whether to target `eas build --platform android` or `--platform ios` first for the one dev build in D-06 — Claude/Mehdi can decide at execution time based on which device is more convenient to test with (the Phase 16 checkpoint was run on Android via Expo Go).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs/ADRs are referenced for this phase in ROADMAP.md, REQUIREMENTS.md, or during this discussion. The following are internal source-of-truth *implementation* files (see `<code_context>` below for what each provides) — not formal specs, but load-bearing for correctness:

### Push infrastructure (reuse, do not reimplement)
- `services/pushService.js` — `sendToToken`/`sendPush` fan-out, idempotency-key pattern (Phase 13)
- `mobile-app/lib/push.ts`, `mobile-app/hooks/useNotificationObserver.ts` — client-side registration/observer (Phase 16)
- `.planning/phases/16-push-wiring-end-to-end/16-04-SUMMARY.md` — documents the exact SC-1 deferral this phase's EAS work is meant to close, and the notification-trigger shape bug/fix (`SchedulableTriggerInputTypes`) relevant if this phase schedules any local notifications for testing

### Maintenance threshold logic (reuse, do not reimplement the calc)
- `supabase.js` (~line 246-267, `Motos.list()` UX-02 enrichment; ~line 438-452, per-plan endpoint) — the existing pct/tier calculation MPUSH-04 must reuse verbatim, not reinvent

### Expo/EAS version discipline
- `mobile-app/AGENTS.md` — "Expo HAS CHANGED": read exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any EAS/notifications code; do not rely on training-data assumptions about API shape (this already caused one real bug in Phase 16)

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/pushService.js` `sendPush(clientId, payload, idempotencyKey)` — already does per-client device-token fan-out with idempotency; the cron just needs to call this per affected moto's owning client, with a per-moto+tier idempotency key to naturally prevent double-sends even if the cron somehow runs twice
- `supabase.js` threshold calc — battle-tested pct/tier logic (due/warning/urgent), already proven correct in prod dashboards (Phase 11 UX-02)
- Phase 16's deep-link navigation pattern (`useNotificationObserver.ts` + notification `data` payload routing) — MPUSH-04's "tap opens fiche moto" requirement is the same mechanism already built for devis, just needs a moto-route `data.type` variant

### Established Patterns
- Idempotency via a persisted log table (`push_send_log`, from Phase 13) — likely the natural home for "already notified for this tier" state, following the same insert-first-guard convention as `billing_events`/`stripeService.js`, rather than adding a new column to `motos` or `plan_entretien`
- Secret-header-authenticated endpoints are NOT an existing pattern in this codebase (everything else uses Supabase JWT via `requireRole()`) — the cron endpoint will be the first exception; planner should be explicit about how this differs from `requireRole()` and why (no user session exists for a scheduled job)

### Integration Points
- New endpoint (e.g. `POST /cron/maintenance-alerts`) in `motokey-api.js`, alongside existing route definitions
- New GitHub Actions workflow file (e.g. `.github/workflows/maintenance-alerts.yml`)
- `mobile-app/app.json` — needs `ios.bundleIdentifier`, `android.package`, EAS `projectId` (via `eas init`), plus Privacy Manifest / Data Safety-relevant permission declarations
- New `mobile-app/eas.json` (does not exist yet)

</code_context>

<specifics>
## Specific Ideas

- Notification copy directional examples from discussion: "Révision à planifier" (80% tier), "Révision dépassée" (100% tier) — not locked, Claude's discretion on final wording (see Decisions).
- Mehdi does not yet have an Expo/EAS account — plan must include account creation as an explicit checkpoint step, not assume it exists.

</specifics>

<deferred>
## Deferred Ideas

- **Actual App Store / Play Store submission and public listing (MSTORE-02's real-world completion)** — blocked on Mehdi creating both paid developer accounts (Apple $99/yr, Google $25 one-time). Tracked the same way Phase 8/BILL-06 is tracked: a known gap in PROJECT.md, not a phase failure. Revisit once accounts exist — likely needs its own follow-up session, not necessarily a new roadmap phase, since the code/content work will already be done.
- **Production `eas build --profile production` (store-ready build)** — this phase only goes as far as one `development` profile build (D-06). Production builds are more naturally sequenced right before actual submission, once store accounts exist.

None — discussion stayed within phase scope otherwise.

</deferred>

---

*Phase: 17-maintenance-alert-cron-app-store-submission*
*Context gathered: 2026-07-05*
