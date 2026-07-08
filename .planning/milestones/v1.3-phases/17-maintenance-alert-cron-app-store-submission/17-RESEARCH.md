# Phase 17: Maintenance Alert Cron + App Store Submission - Research

**Researched:** 2026-07-05
**Domain:** Scheduled backend job (GitHub Actions cron → secret-authenticated Express-style endpoint) + Expo/EAS build tooling + Apple/Google store compliance content
**Confidence:** MEDIUM-HIGH (codebase patterns verified by direct file read = HIGH; EAS/store-policy specifics verified via current official docs = MEDIUM; a few items flagged LOW where docs were ambiguous)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Neither an Apple Developer Program membership ($99/yr) nor a Google Play Console account ($25 one-time) exists yet. Mehdi has not created either.
- **D-02:** Scope resolution (mirrors the existing Phase 8/BILL-06 "known gap" pattern): build everything code-ready this phase, then explicitly park the actual submission step.
  - MPUSH-04 (cron): fully shipped, tested, live in prod — no dependency on store accounts.
  - MSTORE-01: Privacy Manifest (Apple) + Data Safety (Google) **content** written and ready to paste in once accounts exist — the content itself doesn't require the accounts, only the actual upload/submission does.
  - EAS: `eas.json` + EAS `projectId` configured, one real development build produced (Expo/EAS account is free — no paywall, unlike the store accounts).
  - MSTORE-02 (actual TestFlight / Play internal track submission): **PARKED as a known gap**, same treatment as Phase 8 — blocked on Mehdi creating both paid developer accounts. Not a phase failure; do not treat MSTORE-02 as shippable without them.
- **D-03:** Bundle ID / package name: **`com.motokey.app`** for both `ios.bundleIdentifier` and `android.package` in `mobile-app/app.json` (currently unset in both).

### Maintenance Alert Notification Policy

- **D-04:** Notify **once per tier crossing**, never repeat for a tier already notified. A moto crossing 80% ("warning") gets exactly one push ("Révision à planifier"); the same moto later crossing 100% ("urgent") gets exactly one more push ("Révision dépassée"). If the cron re-runs daily and the moto's percentage hasn't moved into a new, not-yet-notified tier, no push is sent.
- **Implication for planner/researcher:** the existing threshold calc (`supabase.js` `Motos.list()` ~line 246-267, and the per-plan endpoint ~line 438-452) is computed fresh on every read with no persistence — some new persisted "last notified tier" state (per moto, or per moto+plan_entretien row) is needed to implement the once-per-tier rule. Exact storage shape (new column vs. new table) is Claude's discretion at planning time — not decided here.

### Cron Mechanism

- **D-05:** Trigger mechanism is a **GitHub Actions scheduled workflow** (`on: schedule: cron: ...`, e.g. daily at 8am) calling a protected backend endpoint (`POST /cron/maintenance-alerts` or similar) with a secret header (e.g. `X-Cron-Secret`, stored as a GitHub Actions secret + Railway env var). Rejected alternatives: Railway's own Cron Job service type (adds a second billed service) and an external pinger like cron-job.org (config lives outside the repo/git history). Reasoning: free, versioned in-repo, visible run history/logs in the GitHub Actions tab.
- **Implication:** the endpoint itself must be safe to call idempotently and must reject calls without the correct secret (new unauthenticated-by-JWT, secret-authenticated endpoint — different auth pattern from the rest of the API).

### EAS Build Setup Scope

- **D-06:** Go all the way to a real build this phase: `eas login` (free Expo account — Mehdi does not have one yet), `eas init` (populates `projectId` in `app.json`), configure `eas.json` with at least a `development` build profile, then run one actual `eas build --profile development`. Goal: close the Phase 13/16 SC-1 deferral (real device push token registration/delivery) with a real EAS dev build.
- **Note:** `eas login` requires interactive browser/credential auth — human checkpoint in the plan, same treatment as the Phase 16-04 on-device checkpoint.

### Claude's Discretion

- Exact DB shape for persisting "last notified tier" per moto (new column on an existing table vs. new table).
- Exact wording/copy of the two push notification bodies ("Révision à planifier" / "Révision dépassée" are directional examples, not locked final copy).
- Whether the cron endpoint processes all garages/clients in one batch or paginates (currently small data volume).
- Whether to target `eas build --platform android` or `--platform ios` first for the one dev build in D-06.

### Deferred Ideas (OUT OF SCOPE)

- **Actual App Store / Play Store submission and public listing (MSTORE-02's real-world completion)** — blocked on Mehdi creating both paid developer accounts. Tracked as a known gap in PROJECT.md, not a phase failure. Revisit once accounts exist.
- **Production `eas build --profile production` (store-ready build)** — this phase only goes as far as one `development` profile build (D-06).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MPUSH-04 | User receives a push when their moto crosses the maintenance threshold, once per tier crossing (no spam on cron re-run) | See "Architecture Patterns → Tier-Crossing Detection", "Don't Hand-Roll", "Code Examples → Cron endpoint + migration" |
| MSTORE-01 | App has Privacy Manifest (Apple) + Data Safety form (Google) content ready | See "Architecture Patterns → Store Compliance Content", "State of the Art", "Common Pitfalls #2/#3" |
| MSTORE-02 | App validated via TestFlight / Android internal track before public submission | See "Environment Availability", "Common Pitfalls #4" — PARKED per D-02, but EAS build + Android internal distribution groundwork is in scope |

</phase_requirements>

## Summary

This phase has two independent halves that share almost no code, so plan them as two work-streams: (1) a backend cron (MPUSH-04) that is a pure extension of existing, well-understood patterns in this codebase (idempotency-guarded push fan-out, per-op tier calc already computed in `supabase.js`), and (2) mobile build/compliance tooling (MSTORE-01/02) that is genuinely new territory requiring current external docs, not training-data assumptions.

For MPUSH-04: the codebase already computes per-operation maintenance tiers (`due`/`warning`/`urgent`) in `supabase.js`'s `Entretien.getPlan(moto_id, km_actuel)` (~line 437-449), and already has a battle-tested idempotency-guarded push fan-out in `services/pushService.js` (`sendPush(clientId, payload, idempotencyKey)`, from Phase 13). The only genuinely new piece is **persisted per-moto "last notified tier" state**, because the existing tier calc is stateless (recomputed fresh on every read). The cleanest fit is two new nullable columns on `motos` (`last_maintenance_tier_notified`, `last_maintenance_tier_notified_at`), updated by the cron itself on every run (both upward when a new tier is crossed — triggering a push — and downward/reset when maintenance work lowers the tier again, silently, no push). This avoids coupling to `plan_entretien`'s per-operation `marquerFaite()` reset logic and matches D-04's phrasing at the moto (not per-operation) granularity. The cron must call the DB layer function directly (`Entretien.getPlan`), **not** the HTTP `/motos/:id/entretien/alertes` endpoint — that endpoint requires `MECANO` minimum RBAC (level ≥ 2), and `CLIENT` is level 1, so a CLIENT-owned moto's own endpoint call would actually 403 in the live RBAC hierarchy (confirmed by reading `auth/rbac.js`). The mobile app's own Fiche Moto screen relies on this same 403-hides-section behavior, so this is a known, working pattern, not a bug — but it does mean the cron cannot reuse this endpoint as a black box; it must call the underlying `Entretien.getPlan` function server-side.

The new cron endpoint (`POST /cron/maintenance-alerts` or similar) is the **first secret-header-authenticated endpoint** in this codebase — every existing endpoint uses Supabase JWT via `rbac.extractRoleFromRequest`/`requireRole`. The server is a raw `http.createServer` with a custom `M(method, path)` router (not actually Express, despite `express` being listed in root `package.json` — that dependency appears unused; `/stripe/webhook` is the only precedent for a non-JWT-authenticated route, and it's mounted *before* generic body parsing for raw-body reasons that don't apply here). The new route should sit alongside the other `M()`-matched routes and do a plain header-equality check against `process.env.CRON_SECRET`, returning 401 on mismatch, exactly analogous in spirit to how `/stripe/webhook` checks `stripe-signature` before proceeding.

For MSTORE-01/02: this is genuinely new territory. Key findings from current docs (not training-data assumptions, per `mobile-app/AGENTS.md`'s explicit warning):
- **EAS setup is a linear, well-documented flow**: `eas login` → `eas init` (populates `app.json`'s `extra.eas.projectId`) → `eas build:configure` (generates `eas.json` with `development`/`preview`/`production` profiles) → `eas build --profile development --platform android`. `expo-dev-client` is not yet in `mobile-app/package.json` and must be added.
- **A real, free Firebase project is required for actual Android push delivery to work at all** — this is a discovery not called out in CONTEXT.md's decisions. Google deprecated the legacy FCM server-key protocol; Expo's push service now requires FCM V1, which requires a Firebase project + `google-services.json` (safe to commit) + a Firebase service-account key uploaded to EAS. Without this, `sendPushNotificationsAsync` calls will still return tickets but **no real notification will arrive on a real Android device** — silently closing the loop on SC-1 requires this extra (still-free) setup step.
- **iOS real device builds and iOS real push both require the not-yet-created paid Apple Developer Program membership** — this is stronger than "Claude's discretion" framing in CONTEXT.md suggests. Only iOS *Simulator* builds are possible without a paid Apple account; a real-device iOS build needs code-signing credentials tied to a paid membership. Given D-01 confirms no Apple account exists, **Android should be the strongly recommended default target** for D-06's one development build (not a coin-flip discretion item) — it's the only platform where the full loop (build → install on real device → real push delivery) is achievable today without spending money or waiting on an external account.
- **Two distinct Apple privacy artifacts exist** and MSTORE-01 likely needs both prepared: (1) the technical `PrivacyInfo.xcprivacy` manifest (declared via `app.json`'s `ios.privacyManifests` field, buildable and testable *now*, no Apple account required), and (2) the App Store Connect "App Privacy" nutrition-label questionnaire (data collection categories), which can only be *submitted* once an Apple Developer account exists — so its *content* should be written as a reference doc now, per D-02.
- Mobile app currently collects: auth email, moto VIN/plaque/km/annee, client contact fields (nom/email/tel, from `add.tsx`), and an Expo push token. No camera/photo capture is wired up (Cloudinary/ImagePicker not referenced anywhere in `mobile-app/`), no location, no payment data (billing stays web/Stripe). This is the accurate data inventory for both Apple's App Privacy label and Google's Data Safety form.

**Primary recommendation:** Ship MPUSH-04 as a pure backend extension (new `motos` columns + cron endpoint + GitHub Actions workflow, reusing `Entretien.getPlan` and `pushService.sendPush` as-is). For MSTORE-01/02, do the full EAS setup targeting **Android** first (free path to closing SC-1), write `PrivacyInfo.xcprivacy` declarations into `app.json` now, and produce two written content docs (Apple App Privacy answers, Google Data Safety answers) for later manual paste-in — explicitly parking the two paid-account-gated submission steps as a known gap, identically to Phase 8.

## Standard Stack

### Core (already installed, reuse as-is)

| Library | Version (verified) | Purpose | Why Standard (for this codebase) |
|---------|---------|---------|--------------|
| `expo-server-sdk` | ^6.1.0 (root `package.json`) | Backend → Expo push relay | Already wired into `services/pushService.js` (Phase 13); do not add a second push client |
| `expo-notifications` | ~0.32.17 (`mobile-app/package.json`) | Client-side push registration/observer | Already wired into `lib/push.ts`/`hooks/useNotificationObserver.ts` (Phase 16) |
| `expo-constants` | ~18.0.13 | Reads `extra.eas.projectId` at runtime | `lib/push.ts` already reads this — populated automatically by `eas init`, no code change needed once EAS is set up |

### Supporting (new to this phase)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `eas-cli` | latest (verify via `npm view eas-cli version` at execution time — not currently installed locally, confirmed via `npx --no-install eas` failing) | Build/submit tooling | Install globally or use `npx eas-cli` for `eas login`/`eas init`/`eas build` |
| `expo-dev-client` | SDK-54-compatible (`npx expo install expo-dev-client`) | Required by any `developmentClient: true` build profile | Not yet in `mobile-app/package.json` — must be added before `eas build --profile development` |
| Firebase project + `google-services.json` + FCM V1 service-account key | N/A (external, free) | Required for real Android push delivery via Expo's relay (FCM V1 migration) | Needed to actually close SC-1 on Android; **not** needed just to produce a development build |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GitHub Actions scheduled workflow (D-05, locked) | Railway Cron Job service type | Rejected by user — adds a second billed Railway service |
| GitHub Actions scheduled workflow (D-05, locked) | External pinger (cron-job.org, EasyCron) | Rejected by user — config lives outside git, less auditable |
| New `motos` columns for tier state | New dedicated table (e.g. `maintenance_alert_state`) | Table is more normalized and could store per-operation granularity, but adds a join for a single boolean-ish piece of state; columns on `motos` match the "small, currently low-volume" reality and the moto-level granularity D-04 describes |
| `push_send_log` reused for tier-crossing idempotency | Rely solely on the new `motos` columns | Recommend using `motos` columns as the **source of truth** for the once-per-tier business rule, and `push_send_log`'s per-call idempotency key only as defense-in-depth against a cron retry within the same run (same pattern Phase 13 already established) |

**Installation:**
```bash
# Backend: no new npm packages needed (expo-server-sdk already installed)

# Mobile: add expo-dev-client before eas build
cd mobile-app
npx expo install expo-dev-client

# EAS CLI (global, one-time)
npm install --global eas-cli
```

**Version verification:** Run at execution time, not from training data:
```bash
npm view eas-cli version
npm view expo-server-sdk version   # confirm ^6.1.0 is still current before any upgrade
```

## Architecture Patterns

### Recommended Project Structure (additions only)

```
motokey-api.js                          # add new M('POST','/cron/maintenance-alerts') route
sql/migrations/
└── 18_motos_maintenance_alert_state.sql # new columns on motos
.github/
└── workflows/
    └── maintenance-alerts.yml           # new GitHub Actions scheduled workflow
mobile-app/
├── eas.json                             # new — build profiles (development/preview/production)
├── app.json                             # add ios.bundleIdentifier, android.package, ios.privacyManifests,
│                                         #     extra.eas.projectId (via eas init), android.googleServicesFile
├── hooks/useNotificationObserver.ts     # extend mapNotificationDataToRoute for type:'moto'
docs/ (or .planning/ — Claude's discretion on location)
├── privacy-manifest-content.md          # Apple App Privacy nutrition-label answers, ready to paste
└── data-safety-content.md               # Google Play Data Safety form answers, ready to paste
```

### Pattern 1: Tier-Crossing Detection (reuse existing calc, add persisted comparison)

**What:** Cron computes the current worst tier across a moto's `plan_entretien` operations using the *existing* `Entretien.getPlan` function (do not reimplement the pct/tier math), compares against a persisted "last notified tier" value, and only sends a push when the current tier is strictly worse than what was last notified.

**When to use:** Every cron run, once per moto with a non-null `client_id` (client-owned motos only — garage-owned/`inconnu` motos have no app user to notify).

**Example (pseudocode matching this codebase's conventions — verify exact supabase.js export names before writing real code):**
```js
// Source: pattern derived from supabase.js Entretien.getPlan (lines ~437-449) +
// services/pushService.js sendPush (Phase 13) — reuse verbatim, do not reinvent tier math.
const TIER_RANK = { null: 0, due: 0, ok: 0, future: 0, warning: 1, urgent: 2 };

async function runMaintenanceAlertCron() {
  const { data: motos } = await supabase
    .from('motos')
    .select('id, client_id, km, last_maintenance_tier_notified')
    .not('client_id', 'is', null);

  for (const moto of motos) {
    const plan = await SBLayer.Entretien.getPlan(moto.id, moto.km); // REUSE — do not reimplement
    const worst = plan.reduce((acc, op) => (TIER_RANK[op.statut] > TIER_RANK[acc] ? op.statut : acc), null);
    const lastRank = TIER_RANK[moto.last_maintenance_tier_notified] ?? 0;
    const currentRank = TIER_RANK[worst] ?? 0;

    if (currentRank > lastRank) {
      const copy = worst === 'urgent'
        ? { title: 'Révision dépassée', body: 'Votre moto a dépassé le seuil de révision.' }
        : { title: 'Révision à planifier', body: 'Votre moto approche du seuil de révision.' };
      await pushService.sendPush(
        moto.client_id,
        { ...copy, data: { type: 'moto_entretien', motoId: moto.id } },
        `maintenance-alert:${moto.id}:${worst}:${new Date().toISOString().slice(0, 10)}` // defense-in-depth per-run idempotency
      );
    }
    // Persist current rank regardless of direction — silently resets downward after maintenance is done.
    if (worst !== moto.last_maintenance_tier_notified) {
      await supabase.from('motos').update({
        last_maintenance_tier_notified: worst,
        last_maintenance_tier_notified_at: new Date().toISOString()
      }).eq('id', moto.id);
    }
  }
}
```

### Pattern 2: Secret-Header Cron Auth (new to this codebase)

**What:** A plain shared-secret header check, distinct from every other endpoint's `rbac.extractRoleFromRequest`/`requireRole` JWT flow, because a scheduled job has no user session.

**When to use:** Only for `/cron/*` routes never called by the mobile/web clients.

**Example (matches this file's raw-`http`/custom-router style — confirmed via direct read of `motokey-api.js`; this is NOT Express despite `express` being an unused dependency in root `package.json`):**
```js
// Source: pattern modeled on the existing /stripe/webhook secret-check (motokey-api.js ~line 517),
// adapted to header-based (not signature-based) auth since there's no webhook payload to sign.
if ((p = M('POST', '/cron/maintenance-alerts')) !== null) {
  const secret = req.headers['x-cron-secret'];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return fail(res, 'Non autorisé', 401, 'UNAUTHORIZED');
  }
  try {
    const result = await runMaintenanceAlertCron();
    return ok(res, result, 'Cron entretien exécuté');
  } catch (e) {
    console.error('[cron] maintenance-alerts échoué:', e.message);
    return fail(res, e.message, 500, 'CRON_ERROR');
  }
}
```

### Pattern 3: GitHub Actions Scheduled Workflow Calling a Secret-Authenticated Endpoint

**What:** `on.schedule.cron` triggers a job that does a single authenticated `curl` POST.

**Example:**
```yaml
# Source: GitHub Actions docs (docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions)
name: Maintenance Alerts Cron
on:
  schedule:
    - cron: '0 6 * * *'   # 06:00 UTC = 08:00 Europe/Paris (verify DST offset at execution time)
  workflow_dispatch: {}    # manual trigger for testing, recommended
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Call maintenance-alerts cron endpoint
        run: |
          curl --fail -X POST "https://motokey11-production.up.railway.app/cron/maintenance-alerts" \
            -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json"
```

### Pattern 4: Notification Data-Payload Routing Extension (moto deep link)

**What:** `mobile-app/hooks/useNotificationObserver.ts`'s `mapNotificationDataToRoute` currently only recognizes `data.type === 'devis_recu'` and returns a static string route. The Motos tab uses a dynamic segment (`motos/[id].tsx`), so the extension must return the `{ pathname, params }` object shape already used by `motos/index.tsx`'s own `router.push` call (not a plain string, since typed-routes requires literal `Href` shapes for dynamic segments).

**Example:**
```ts
// Source: mobile-app/hooks/useNotificationObserver.ts (existing) +
// mobile-app/app/(app)/(tabs)/motos/index.tsx's router.push pattern (existing, line ~117)
export type NotificationRoute =
  | '/(app)/(tabs)/devis'
  | { pathname: '/(app)/(tabs)/motos/[id]'; params: { id: string } };

export function mapNotificationDataToRoute(data: any): NotificationRoute | null {
  if (data && data.type === 'devis_recu') return '/(app)/(tabs)/devis';
  if (data && data.type === 'moto_entretien' && data.motoId) {
    return { pathname: '/(app)/(tabs)/motos/[id]', params: { id: String(data.motoId) } };
  }
  return null;
}
```
The `redirect()` function's `router.push(route as any)` call already accepts this shape unmodified — no change needed there, only to `mapNotificationDataToRoute`'s return type and the existing unit tests (`__tests__` for this hook, not directly read this session but implied by Phase 16's "fully unit-tested" pattern — verify exact test file name before writing new tests).

### Anti-Patterns to Avoid

- **Reimplementing the pct/tier math in the cron:** the same 4-line calc already exists in two places (`Motos.list()` and `Entretien.getPlan()`). Adding a third slightly-different copy in the cron risks silent tier-boundary drift (e.g. off-by-one on the 80%/100% cutoffs). Call `Entretien.getPlan` directly.
- **Calling the CLIENT-facing HTTP endpoint from the cron:** `/motos/:id/entretien/alertes` requires `MECANO` minimum RBAC (level ≥ 2); `CLIENT` is level 1 and would 403. The cron runs server-side with no user context at all — it must call the Supabase-layer function directly, never go through an HTTP hop with RBAC in the middle.
- **Using `push_send_log`'s permanent-uniqueness key as the sole source of truth for "already notified this tier":** because `plan_entretien.km_derniere` can reset (maintenance done, then re-crossing the same tier months later should notify again), a static key like `moto_id:warning` would permanently block all future re-notifications for that tier. Use `motos.last_maintenance_tier_notified` (a value that can go up AND down) as the real source of truth; `push_send_log`'s key is only a same-run retry guard.
- **Treating iOS and Android as symmetric choices for D-06's one dev build:** iOS device builds are blocked on the (not-yet-created) paid Apple Developer account regardless of EAS setup; Android is not. Default to Android unless Mehdi explicitly wants to test only in iOS Simulator (no push, since Simulator doesn't support push tokens).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Push delivery to a client's device(s) | A custom Expo push HTTP client | `services/pushService.js`'s `sendPush`/`sendToToken` (Phase 13, already handles chunking, ticket-level errors, idempotency) | Already proven in prod; re-deriving `expo-server-sdk` call shape risks reintroducing the invalid-token / duplicate-key bugs Phase 13 already fixed |
| Maintenance tier calculation (pct/statut) | A new pct formula in the cron | `supabase.js` `Entretien.getPlan(moto_id, km_actuel)` | Battle-tested in prod dashboards (UX-02); the 40/80/100 cutoffs are load-bearing and must not silently diverge between garage UI, client app, and cron |
| Cron scheduling infrastructure | A custom polling loop or `node-cron` in-process scheduler on Railway | GitHub Actions `on.schedule` (D-05, locked) | User explicitly rejected Railway Cron Job service and external pingers; GitHub Actions is free, versioned, and has visible run logs |
| EAS project/build lifecycle | Manually configuring Xcode/Android Studio native projects | `eas init` + `eas build:configure` + `eas build` | This is a managed Expo workflow project (no `ios/`/`android/` folders committed, per REQUIREMENTS.md's explicit "Bare React Native... hors scope" decision) — EAS is the only supported build path |
| Store compliance content structuring | Freeform prose privacy policy text | Apple's App Privacy category taxonomy / Google's Data Safety category taxonomy (both are structured questionnaires with fixed category names, not free text) | Both platforms validate against their own fixed vocabularies (e.g. "Contact Info", "App Activity") at submission time — writing content now in the platforms' own category structure avoids a rewrite later |

**Key insight:** Every piece of this phase that touches money-gated infrastructure (real device push, real store submission) has a free/no-account-needed subset that can be fully completed now, and a paid/account-gated subset that must be explicitly parked. Conflating the two (e.g. assuming "EAS build" implies "store submission is close") is the main risk to scope discipline this phase.

## Common Pitfalls

### Pitfall 1: Assuming the CLIENT role can call the same threshold endpoint the cron needs
**What goes wrong:** Writing the cron to call `GET /motos/:id/entretien/alertes` over HTTP (even internally) and getting silent 403s for client-owned motos.
**Why it happens:** That endpoint requires `MECANO` minimum (level ≥ 2 in `auth/rbac.js`'s `ROLE_HIERARCHY`), and `CLIENT` is level 1 — lower, not higher, despite CLIENT being "above" MECANO in CLAUDE.md's descriptive hierarchy diagram (MECANO is a garage-side sub-role with its own numeric level, not a subset of CLIENT's permissions).
**How to avoid:** Cron calls `SBLayer.Entretien.getPlan(moto_id, km)` directly — a plain function call, not an HTTP round-trip, so RBAC never enters the picture.
**Warning signs:** Any cron code path importing `req`/`res` objects or constructing a `rbac.requireRole` check for its own internal computation.

### Pitfall 2: FCM V1 credential gap silently swallows Android push delivery
**What goes wrong:** `pushService.sendToToken` returns `{ sent: true, tickets }` with no visible error, but no notification ever arrives on the real Android device.
**Why it happens:** Google deprecated the legacy FCM server-key protocol; Expo's push relay now requires the app to have its own Firebase project registered via FCM V1 (a `google-services.json` + a service-account key uploaded to EAS). Expo's ticket-level API can succeed at the "handed off to Expo's servers" step while the final FCM hop still fails if this isn't configured — Expo's own docs did not fully specify this failure's exact surfaced error, so treat "no error, no notification" on Android as a signal to check this first.
**How to avoid:** Set up a free Firebase project + `google-services.json` + FCM V1 service-account key in EAS *before* attempting to close SC-1 on a real Android device, not after debugging silent delivery failures.
**Warning signs:** Ticket status is not `error`, but the device never shows a banner.

### Pitfall 3: Treating iOS and Android as equally available for the one D-06 dev build
**What goes wrong:** Choosing iOS for the one required dev build, then discovering mid-phase that a real-device iOS build cannot be code-signed without a paid Apple Developer Program membership (which D-01 confirms doesn't exist).
**Why it happens:** EAS build tooling itself is platform-agnostic and free; only the code-signing/distribution step for a *real device* (not Simulator) requires the paid Apple account. This distinction is easy to miss since `eas build --platform ios` will start running before failing later at the signing step.
**How to avoid:** Default to `--platform android` for D-06's one dev build (per this research's primary recommendation) unless Mehdi has decided to only test in iOS Simulator (which has no push token support at all, so wouldn't close SC-1 anyway).
**Warning signs:** EAS build failing partway through with a credentials/provisioning-profile error.

### Pitfall 4: Conflating "EAS free tier" with "no cost path to real store validation"
**What goes wrong:** Assuming MSTORE-02 (TestFlight/Play internal track) can proceed once EAS is set up, without the paid developer accounts.
**Why it happens:** EAS Build/Submit tooling itself has no paywall, but *uploading to* TestFlight requires an Apple Developer Program membership, and *uploading to* a Play internal test track requires a Google Play Console account — both are the same $99/yr and $25 one-time gates D-01 already identifies.
**How to avoid:** Keep MSTORE-02 explicitly parked per D-02; don't let EAS setup progress create a false sense that submission is now unblocked.
**Warning signs:** Plan tasks that assume `eas submit` will succeed without first confirming both store accounts exist.

### Pitfall 5: Typed-routes dynamic segment breaking the moto deep link (recurrence of a Phase 16-class bug)
**What goes wrong:** Returning a plain string like `'/(app)/(tabs)/motos/' + motoId` from `mapNotificationDataToRoute` compiles but either fails Expo Router's typed-routes check or silently doesn't match the `[id]` dynamic segment at runtime.
**Why it happens:** Expo Router's `typedRoutes` experiment (already enabled in `mobile-app/app.json`) expects dynamic routes as `{ pathname: '/literal/[id]', params: { id } }` objects, not interpolated strings — this is the same category of "trust the installed SDK's actual type shape, not assumption" bug Phase 16-04 already hit once with `NotificationTriggerInput`.
**How to avoid:** Match the existing working pattern already used in `motos/index.tsx`'s own `router.push({ pathname: '/(app)/(tabs)/motos/[id]', params: { id: item.id } })` call verbatim.
**Warning signs:** `tsc --noEmit` passing (since `as any` casts can mask this) but tap-to-navigate not landing on the right screen on-device.

### Pitfall 6: GitHub Actions scheduled workflows have a "best effort" timing guarantee
**What goes wrong:** Assuming the cron fires at exactly 06:00 UTC every day.
**Why it happens:** GitHub explicitly documents that scheduled workflows can be delayed (sometimes by 10+ minutes) during periods of high GitHub Actions load, and the shortest supported interval is 5 minutes — this is a platform-level guarantee gap, not a bug in this phase's workflow file.
**How to avoid:** Since the cron logic is idempotent per-tier (not per-day), a delayed or occasionally-skipped run has no correctness impact — document this as an accepted characteristic, not something to "fix" with retries.
**Warning signs:** None needed in code; just don't build retry/backoff logic for this — it would be solving a non-problem given the tier-crossing state already tolerates arbitrary run timing.

## Code Examples

### Migration: persisted tier state on `motos`
```sql
-- Migration 18 : Colonnes motos — état "dernier palier notifié" (MPUSH-04, D-04)
-- À appliquer manuellement via Supabase Dashboard > SQL Editor
-- Suit la convention des migrations 10-17 (colonnes nullables, aucune contrainte FK ajoutée).

ALTER TABLE motos
  ADD COLUMN last_maintenance_tier_notified TEXT
    CHECK (last_maintenance_tier_notified IN ('warning', 'urgent') OR last_maintenance_tier_notified IS NULL),
  ADD COLUMN last_maintenance_tier_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN motos.last_maintenance_tier_notified IS
  'Palier d''entretien le plus sévère déjà notifié au client (NULL/warning/urgent). Mis à jour par le cron
   /cron/maintenance-alerts, à la hausse (déclenche un push) comme à la baisse (silencieux, après entretien
   effectué) — source de vérité pour la règle "une notification par franchissement de palier" (D-04).';
```

### Full route registration point (illustrative — verify exact insertion point near other `M()` routes before writing)
See Pattern 2 above for the endpoint body itself.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| FCM legacy server-key protocol | FCM HTTP v1 API (OAuth via Firebase service account) | Google deprecated legacy FCM in phases through 2024; Expo's push service now requires FCM V1 for Android | Any *new* Expo project sending real Android push needs its own Firebase project + service-account key — Expo can no longer relay Android push for you "for free" the way it once could |
| Remote push in Expo Go | Remote push removed from Expo Go | Since Expo SDK 53 (already documented in this repo's STATE.md/16-04-SUMMARY) | Confirmed still true for SDK 54 — an EAS development build (not Expo Go) is mandatory for any real remote push test, which is exactly why D-06 exists |
| Free-text iOS privacy disclosures | Structured `PrivacyInfo.xcprivacy` manifest + "required reason API" declarations | Enforced by Apple starting Spring 2024 for apps using certain sensitive APIs/third-party SDKs | Managed Expo SDK packages (expo-notifications, expo-secure-store, expo-device, AsyncStorage) generally ship their own `PrivacyInfo` files that Expo's build process aggregates; manual `ios.privacyManifests` entries in `app.json` are typically only needed for gaps Apple's static parser misses in some CocoaPods dependencies — verify the actual generated manifest via an EAS build/prebuild rather than assuming zero manual entries are needed |

**Deprecated/outdated:**
- Assuming "Expo handles push for free with zero setup" for Android — no longer true post-FCM-V1-migration; this is a genuine new setup cost (still $0, but not zero-config).

## Open Questions

1. **Exact wording for the two push notification bodies**
   - What we know: Directional examples given in CONTEXT.md ("Révision à planifier" / "Révision dépassée"), explicitly not locked.
   - What's unclear: Whether Mehdi wants moto make/model included in the body text (requires an extra join at push-time, cheap given expected low motos-per-cron-run volume).
   - Recommendation: Default to including marque/modèle in the body for clarity (e.g. "Votre Yamaha MT-07 approche du seuil de révision"), confirm at planning/checkpoint time.

2. **Whether `google-services.json` / Firebase project setup belongs in this phase's scope or is a follow-up**
   - What we know: It's free and doesn't depend on the paid store accounts; it's required to actually observe a real Android push notification (closing SC-1).
   - What's unclear: Whether Mehdi wants to create the Firebase project during this phase's EAS checkpoint, or treat "one real EAS dev build produced" (D-06's literal wording) as satisfied by the build existing even if push delivery itself isn't re-verified end-to-end on that build.
   - Recommendation: Treat Firebase/FCM V1 setup as in-scope for fully closing SC-1 (it's free, matches the spirit of "close the Phase 13/16 SC-1 deferral" in D-06's own stated goal) but flag it as a separate human checkpoint from `eas login`/`eas init`, since it involves a different external console (Firebase, not Expo).

3. **Whether the cron endpoint needs pagination/batching now**
   - What we know: Claude's discretion per CONTEXT.md; current data volume is small (test/dev scale).
   - What's unclear: Exact current moto count with non-null `client_id` in prod.
   - Recommendation: Ship without pagination (simple `select * from motos where client_id is not null`), loop in-process; revisit only if a future phase reports timeout issues.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend cron logic, mobile tooling | ✓ | v24.14.1 | — |
| npm | Package installs | ✓ | 11.11.0 | — |
| git | Version control | ✓ | 2.53.0.windows.2 | — |
| Railway CLI | Setting `CRON_SECRET` env var (optional — Dashboard also works) | ✓ | 5.15.0 | Use Railway Dashboard manually (per CLAUDE.md secrets discipline: never paste secrets in commands) |
| `eas-cli` | `eas login`/`eas init`/`eas build` (D-06) | ✗ (not installed globally or locally; `npx --no-install eas` failed) | — | `npm install --global eas-cli` (free) before first use |
| `expo` CLI | Local dev server, `expo install` | ✓ (via npx) | 57.0.4 (CLI package, distinct from the app's SDK 54) | — |
| GitHub CLI (`gh`) | Optional — could script GH Actions secret creation | ✗ (not found on PATH) | — | Use GitHub web UI to add repo secrets (`Settings → Secrets and variables → Actions`) — no functional blocker |
| Expo account (expo.dev) | `eas login` | ✗ (Mehdi has not created one — confirmed in CONTEXT.md D-06 note) | — | Free signup at expo.dev/signup — human checkpoint, cannot be automated |
| Firebase project + FCM V1 service account | Real Android push delivery (Pitfall 2) | ✗ (none exists yet) | — | Free Firebase Console signup — human checkpoint |
| Apple Developer Program membership | Real iOS device builds, TestFlight, PrivacyInfo submission | ✗ (D-01, confirmed) | — | **No fallback for iOS real-device work this phase** — parked per D-02; Simulator-only iOS builds remain possible without it but have no push support |
| Google Play Console account | Play internal test track, Data Safety form submission | ✗ (D-01, confirmed) | — | **No fallback for real submission this phase** — parked per D-02 |

**Missing dependencies with no fallback:**
- Apple Developer Program membership (blocks all real-device iOS work and MSTORE-02's iOS half) — explicitly parked, not a phase failure.
- Google Play Console account (blocks MSTORE-02's Android half) — explicitly parked, not a phase failure.

**Missing dependencies with fallback:**
- `eas-cli` — installable for free at execution time.
- Expo account — free signup, human checkpoint.
- Firebase project/FCM V1 credentials — free signup, human checkpoint.
- `gh` CLI — GitHub web UI works fine for adding the one repo secret needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend framework | None formal — root `package.json`'s `"test"` script is `node test-api.js` (manual/ad-hoc), and Phase 13/16 established the convention of one-off `scripts/test-*.js` harnesses + live curl smoke tests (see `scripts/test-push.js`, `16-04-SUMMARY.md`) |
| Mobile framework | `jest` via `jest-expo` preset (confirmed in `mobile-app/package.json`), currently 121/121 passing per `16-04-SUMMARY.md` |
| Config file | Backend: none. Mobile: inline `jest` key in `mobile-app/package.json` |
| Quick run command (mobile) | `cd mobile-app && npx tsc --noEmit && npx jest` |
| Quick run command (backend) | `node --check motokey-api.js` (syntax only) + a new `scripts/test-maintenance-cron.js` harness (Wave 0 gap, see below) |
| Full suite command | Same as quick run — no separate "full" tier exists in this codebase's established convention |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MPUSH-04 | Cron computes correct tier, sends push once per crossing, no double-send on re-run | unit + manual curl | `node scripts/test-maintenance-cron.js` (new) + `curl -X POST .../cron/maintenance-alerts -H "X-Cron-Secret: ..."` | ❌ Wave 0 |
| MPUSH-04 | Secret header rejects unauthenticated calls | manual curl | `curl -i -X POST .../cron/maintenance-alerts` (no header, expect 401) | ✅ (pattern exists — mirror `/stripe/webhook`'s check style) |
| MPUSH-04 (mobile half) | Tap notification with `type:'moto_entretien'` navigates to Fiche Moto | unit (mapNotificationDataToRoute) + on-device checkpoint | `cd mobile-app && npx jest hooks/useNotificationObserver` | ❌ Wave 0 (extend existing test file) |
| MSTORE-01 | `PrivacyInfo.xcprivacy` content is present and matches actual API usage | manual (inspect generated manifest post-EAS-build/prebuild) | `eas build --profile development --platform android` then inspect build artifacts, or `npx expo prebuild` locally to inspect `ios/` output | N/A — verification step, not a unit test |
| MSTORE-02 | TestFlight / Play internal track validated | manual-only, PARKED | N/A — blocked on paid accounts (D-01/D-02) | N/A |

### Sampling Rate
- **Per task commit:** `node --check motokey-api.js` (backend) / `cd mobile-app && npx tsc --noEmit` (mobile)
- **Per wave merge:** Full mobile `jest` suite + live curl smoke test against Railway prod (mirrors 16-04's own verification plan exactly)
- **Phase gate:** Curl smoke test for cron (auth rejection + successful run + idempotent re-run) + mobile jest green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/test-maintenance-cron.js` — new harness, mirrors `scripts/test-push.js`'s structure (dotenv load, direct function call, printed result), covers MPUSH-04's tier-crossing logic against seeded fixture motos (needs a `scripts/seed-test-maintenance-cron.js` fixture, following the existing `scripts/seed-test-*-uat.js` naming convention)
- [ ] Extend `mobile-app/hooks/useNotificationObserver.ts`'s existing test file (exact filename not confirmed this session — locate via `mobile-app/hooks/__tests__/` before planning) to cover the new `moto_entretien` → `{pathname, params}` mapping
- [ ] No framework install needed — both `jest-expo` (mobile) and ad-hoc node scripts (backend) are already established

## Sources

### Primary (HIGH confidence — direct file reads, this session)
- `C:\motokey-api\services\pushService.js` — exact `sendToToken`/`sendPush` signatures and idempotency pattern
- `C:\motokey-api\mobile-app\lib\push.ts` — exact `projectId` read location, registration lifecycle
- `C:\motokey-api\mobile-app\hooks\useNotificationObserver.ts` — exact `mapNotificationDataToRoute` current shape
- `C:\motokey-api\supabase.js` (lines 235-464) — `Motos.list()`, `Entretien.getPlan`/`upsertOperation`/`marquerFaite` exact logic
- `C:\motokey-api\motokey-api.js` (lines 485-620, 671-701, 989-1018, 1552-1600) — router style, `/motos` RBAC branching, `/motos/:id/entretien/alertes` RBAC gate, legacy `/client/moto`/`/client/alertes` (confirmed stale/RAM-only, not the live data path)
- `C:\motokey-api\auth\rbac.js` — exact `ROLE_HIERARCHY` numeric levels (CLIENT=1 < MECANO=2), confirming Pitfall 1
- `C:\motokey-api\sql\migrations\16_client_device_tokens.sql`, `17_push_send_log.sql` — exact schema + migration file conventions
- `C:\motokey-api\mobile-app\app.json`, `mobile-app\package.json` — confirmed no `bundleIdentifier`/`package`/`projectId`, no `eas.json`, no `expo-dev-client`, Expo SDK `~54.0.35`
- `.planning/phases/16-push-wiring-end-to-end/16-04-SUMMARY.md` — SC-1 deferral history, `SchedulableTriggerInputTypes` bug precedent
- `.planning/STATE.md`, `.planning/REQUIREMENTS.md` — requirement text, traceability, prior-phase decisions

### Secondary (MEDIUM confidence — WebFetch/WebSearch against official docs, this session, 2026)
- [Configure a development build in cloud — Expo Docs](https://docs.expo.dev/tutorial/eas/configure-development-build/) — exact `eas login`/`eas init`/`eas build:configure` flow
- [Configuration with eas.json — Expo Docs](https://docs.expo.dev/eas/json/) — build/submit key schema
- [Obtain Google Service Account Keys using FCM V1 — Expo Docs](https://docs.expo.dev/push-notifications/fcm-credentials/) — FCM V1 requirement confirmation
- [Privacy manifests — Expo Docs](https://docs.expo.dev/guides/apple-privacy/) — `ios.privacyManifests` field, required-reason API concept
- [Workflow syntax for GitHub Actions — GitHub Docs](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions) — `on.schedule` cron syntax, secrets usage
- [Provide information for Google Play's Data safety section — Play Console Help](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en) — Data Safety form scope

### Tertiary (LOW confidence — flagged for validation before locking exact copy)
- Exact Apple "required reason API" codes (e.g. CA92.1, C56D.1) for AsyncStorage/expo-secure-store specifically — general concept confirmed via official docs, but the precise reason-code-to-package mapping should be verified by actually running an EAS build/prebuild and inspecting the generated manifest, not assumed from this research.
- GitHub Actions scheduled workflow delay behavior ("10+ minutes during high load") — widely reported in community sources, not pinned to an exact official SLA document this session; treat as a known platform characteristic, not a numeric guarantee.

## Metadata

**Confidence breakdown:**
- Standard stack (backend reuse): HIGH — verified by direct file reads of `pushService.js`/`supabase.js`
- Standard stack (EAS/mobile tooling): MEDIUM — verified via current official Expo docs this session, but local environment has zero prior EAS state to cross-check against
- Architecture (cron auth, tier-crossing pattern): HIGH — derived directly from this codebase's own established conventions (`/stripe/webhook`, `push_send_log`, `Entretien.getPlan`)
- Store compliance content (MSTORE-01): MEDIUM — official docs confirm the mechanism and required categories exist, but exact per-API-declaration codes need verification against a real generated manifest before being treated as final
- Pitfalls: HIGH for RBAC/typed-routes items (verified by direct code read), MEDIUM for FCM V1/Apple account items (verified via official docs but not locally reproducible without external accounts)

**Research date:** 2026-07-05
**Valid until:** ~30 days for the backend/cron portions (stable, internal); ~14 days for the EAS/store-policy portions (Expo/Apple/Google policy details move faster — re-verify against current docs if planning is delayed)
