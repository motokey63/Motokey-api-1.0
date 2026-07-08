# Phase 16: Push Wiring End-to-End - Research

**Researched:** 2026-07-04
**Domain:** Expo push notifications (client-side wiring) + Express/Supabase devis lifecycle (backend trigger)
**Confidence:** HIGH (backend/devis code, RBAC, existing push infra — read directly) / MEDIUM-HIGH (expo-notifications API — official docs) / HIGH (Expo Go SDK54 limitation — official FAQ, load-bearing finding)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Devis push trigger (MPUSH-03)**
- **D-01:** Add a new "Envoyer au client" action (backend endpoint, garage-facing) that transitions a devis `brouillon` → `envoye`. This transition is the exact moment `sendPush()` fires. Without this action, MPUSH-03 has no real event to hook into — no existing code path performs this transition today.
- **D-02:** The button lives per-row in `app.html`'s existing devis list (not a confirmation modal right after creation) — garage reviews a drafted devis, then sends whenever ready.
- **D-03:** Once a devis is `envoye`, it is locked — `PUT /devis/:id` (line/entête edits) must be rejected for non-`brouillon` devis. To change a sent devis, the garage creates a new one. This avoids the client seeing a quote silently change under them without a fresh notification.

**Soft-ask permission screen (MPUSH-01)**
- **D-04:** Shown exactly once, right after the user's first login — not on every app launch, not gated behind a first meaningful in-app action.
- **D-05:** Full-screen, dedicated screen (not a modal/bottom-sheet), MotoKey-branded (reuse Phase 14's palette — orange accent, `mobile-app/theme/colors.ts`), explaining push value before the OS system permission prompt appears.
- **D-06:** If the user declines, it is not final — a "Activer les notifications" entry point exists in the Compte tab (built in Phase 15) that re-triggers the soft-ask + OS prompt flow later.

**Device token lifecycle (MPUSH-02, end-to-end)**
- **D-07:** Call `POST /client/device-tokens` immediately after the soft-ask is accepted AND the OS grants permission (not unconditionally on every login) — one clear moment tied directly to the permission flow (D-04/D-05).
- **D-08:** If the OS grants permission but the registration call fails (network/500/etc.), fail silently — no user-facing error, since this is best-effort infrastructure the user can't act on — and retry silently on the next app foreground until it succeeds.
- **D-09:** On logout, always call `DELETE /client/device-tokens` for the current device's token. Matches Phase 12 D-03 (removes only the specific token supplied, not all of a client's devices) — logging out on this device stops push here without silencing push on the client's other logged-in devices.

### Claude's Discretion
- **Deep link / tap-to-navigate behavior (MPUSH-05)** — not discussed in depth (user did not select this area). Default: a notification-response listener navigates to the Devis tab (`mobile-app/app/(app)/(tabs)/devis/index.tsx`) via `expo-router`, reusing the Phase 15 tab/stack shell. Cold-start vs backgrounded vs foregrounded handling and exact foreground notification presentation (system banner vs relying on the Devis tab's existing `useFocusEffect` silent refetch from 15-09) are left to the planner/executor to resolve sensibly — revisit if the resulting behavior feels wrong on-device.
- **Exact endpoint shape for "envoyer au client"** (e.g. dedicated `POST /devis/:id/envoyer` vs. extending `PUT /devis/:id` with a status field) — no user preference expressed. Recommend a dedicated endpoint for clarity, especially since D-03's lock-on-send changes what `PUT` is allowed to do post-send.
- **RBAC level for the envoyer action** — no user preference expressed. Recommend matching the existing devis endpoints' `requireRole(ctx, 'MECANO')` minimum (same as `POST`/`PUT /devis` today) unless the planner finds a concrete reason to require stricter PRO+ gating for this client-facing commitment action.
- **`expo-notifications` integration details** (permission API call sequence, listener setup file location) — implementation detail for research/planner. Note: `expo-notifications` is NOT yet a `package.json` dependency in `mobile-app` — will need adding (check SDK 54-compatible version).

### Deferred Ideas (OUT OF SCOPE)
- Exact deep-link/tap navigation behavior across cold-start/background/foreground app states (MPUSH-05 mechanics) — left to Claude's Discretion above, not a locked decision; revisit if on-device behavior feels wrong.
- Proactive deactivation of dead/invalid push tokens on `DeviceNotRegistered` receipts — originally punted from Phase 13 to "Phase 16", not resolved in this discussion; planner should decide whether it's in scope here or pushes further to Phase 17.
- Rappel entretien push (MPUSH-04) and its cron trigger — unchanged, ships in Phase 17.
- Granular per-notification-type preference center — explicitly out of scope per REQUIREMENTS.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MPUSH-01 | Soft-ask screen shown before OS permission prompt | `expo-notifications` `requestPermissionsAsync()` confirmed available in Expo Go (local permission API, unaffected by the remote-push Expo Go limitation below). Full-screen route pattern + AsyncStorage "shown once" flag documented in Architecture Patterns. |
| MPUSH-02 (end-to-end) | Device token registered/deregistered at login/logout | Backend endpoints already live (`POST`/`DELETE /client/device-tokens`, Phase 12) — exact request/response shape read directly from `motokey-api.js` lines 1717-1770. Missing piece is the mobile-side `getExpoPushTokenAsync` call + wiring into `AuthContext.login`/`logout`. **Caveat:** real token retrieval/registration cannot be verified end-to-end in Expo Go on SDK 54 — see Environment Availability. |
| MPUSH-03 | Push arrives within seconds when a devis is created/sent | Root cause of "no trigger exists" confirmed by reading `motokey-api.js` devis routes directly (no `brouillon`→`envoye` transition exists anywhere in the codebase today). `services/pushService.js` `sendPush(clientId, payload, idempotencyKey)` is fully built and NOT YET required/called anywhere in `motokey-api.js` — confirmed via grep, only `emailService`/`stripeService` are required today. New endpoint must `require('./services/pushService')` for the first time. |
| MPUSH-05 | Tap notification → navigate to devis screen | Official Expo docs pattern for `getLastNotificationResponseAsync`/`addNotificationResponseReceivedListener` + `router.push` documented below with exact code. Devis tab has no per-item detail route (flat list only) — deep link target is the tab itself, consistent with CONTEXT.md's discretion note. |
</phase_requirements>

## Summary

Phase 16 has two independent halves: a backend half (wire a real `brouillon → envoye` transition that fires `sendPush()`, already built in Phase 13 but never called) and a mobile half (add `expo-notifications` to a currently push-free mobile app, wire permission + token lifecycle to login/logout, and handle notification taps via `expo-router`). Both halves are well-scoped and the supporting backend/mobile code is straightforward to extend along existing established patterns (RBAC `requireRole`, dual Supabase/RAM-fallback branches, `AuthContext` hook points).

The single most important finding, not visible from reading the codebase alone, is an **Expo platform-level regression**: starting with Expo SDK 53 (confirmed still true in the mobile app's pinned SDK 54), **Expo Go no longer supports remote/push notifications at all** — only local (in-app-scheduled) notifications still work in Expo Go. Since the mobile app was deliberately downgraded to SDK 54 in Phase 14-04 specifically to match the tester's installed Expo Go client, this means **MPUSH-02 (real token registration) and MPUSH-03 (real push delivery) cannot be verified on-device via Expo Go** — a development build (EAS Build) is required, and this repo currently has no `eas.json`, no EAS project ID in `app.json`, and no logged-in Expo account. This does not block writing/shipping the code (which is fully testable via jest + manual curl + local test notifications for the deep-link piece), but it does block the on-device human verification a normal Phase completion checkpoint would want for MPUSH-02/03, mirroring the SC-1 pattern already established across Phases 13→15.

**Primary recommendation:** Implement all code (backend `POST /devis/:id/envoyer`, mobile soft-ask + token lifecycle + notification-response listener) exactly as scoped; ship it; and explicitly defer the on-device "does the OS actually deliver the push" verification to whenever a development build exists (naturally Phase 17, which needs EAS Build anyway for MSTORE-01/02) — same deferral pattern already used for SC-1 in Phase 13.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `expo-notifications` | `~0.32.17` | Permission request, Expo push token retrieval, notification listeners | This is the exact version pinned to Expo SDK 54 in Expo's `bundledNativeModules.json` (confirmed live against `sdk-54` branch, cross-checked against every other already-installed `expo-*` package in `mobile-app/package.json`, all of which match this same bundle — e.g. `expo-device@~8.0.10`, `expo-router@~6.0.24`). Confirmed published on npm registry. |
| `expo-server-sdk` | (already installed) | Server-side Expo push sending | Already used by `services/pushService.js` since Phase 13 — no change needed. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `expo-constants` | `~18.0.13` (already installed) | Read `Constants.expoConfig.extra.eas.projectId` for `getExpoPushTokenAsync({projectId})` | Required by the token-retrieval call itself. |
| `expo-device` | `~8.0.10` (already installed) | `Device.osName`/`Device.isDevice` for the `platform` field in `POST /client/device-tokens` and to skip token retrieval on simulators/emulators | Already listed as a reusable asset in CONTEXT.md. |
| `@react-native-async-storage/async-storage` | `2.2.0` (already installed) | Persist "soft-ask already shown" flag across app restarts (D-04) | Plain flag, not session data — matches existing `CACHE_KEY_*` pattern in `lib/cache.ts`, not `expo-secure-store`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `expo-notifications` | Firebase Cloud Messaging directly (`@react-native-firebase/messaging`) | Bare-workflow-only, contradicts the locked "Expo managed workflow, no bare RN" project constraint (REQUIREMENTS.md Out of Scope). Not viable. |
| EAS Build (cloud) dev client | Local Android/iOS build (`expo run:android`/`expo run:ios`) | Local build needs Android Studio/Xcode + Android SDK. **Confirmed absent on this Windows machine** (no `adb`, no `java`, `ANDROID_HOME` unset) — not a viable fallback here. EAS cloud build is the only path, and it requires an Expo account login (human action, not yet done — `npx expo whoami` returns "Not logged in"). |

**Installation:**
```bash
cd mobile-app
npx expo install expo-notifications
```
(`npx expo install` — not plain `npm install` — resolves the SDK-54-correct version automatically; using plain npm install risks pulling the newer `56.x`/`57.x` line seen on the registry, which targets Expo SDK 56/57 and would violate the pinned-SDK54 discipline established in Phase 14-04.)

**Version verification:**
```bash
npm view expo-notifications@0.32.17 version   # → 0.32.17, confirmed on registry
curl -s https://raw.githubusercontent.com/expo/expo/sdk-54/packages/expo/bundledNativeModules.json | grep notifications
# → "expo-notifications": "~0.32.17"
```

## Architecture Patterns

### Recommended Project Structure (mobile-app additions)
```
mobile-app/
├── app.json                        # add "expo-notifications" to plugins[]
├── lib/
│   └── push.ts                     # NEW — registerForPushAsync(), unregisterPushAsync()
├── hooks/
│   └── useNotificationObserver.ts  # NEW — cold-start + runtime tap → router.push
├── context/
│   └── AuthContext.tsx             # MODIFY — call push register/unregister in login()/logout()
├── app/
│   ├── (app)/
│   │   ├── _layout.tsx             # MODIFY — mount useNotificationObserver() here (after auth gate)
│   │   ├── (tabs)/
│   │   │   └── compte.tsx          # MODIFY — "Activer les notifications" entry point (D-06)
│   └── (auth-or-app)/
│       └── soft-ask.tsx            # NEW — full-screen pre-permission explainer (D-04/D-05)
```

### Backend structure (motokey-api.js additions)
```
motokey-api.js
├── require('./services/pushService')   # NEW top-level require (currently absent)
├── POST /devis/:id/envoyer              # NEW — brouillon → envoye + sendPush()
└── PUT  /devis/:id                      # MODIFY — reject if statut !== 'brouillon' (D-03)

supabase.js
└── Devis.envoyer(id, garage_id)         # NEW dedicated method (do not repurpose Devis.update)
```

### Pattern 1: Dual Supabase/RAM-fallback branch (established convention)
**What:** Every existing devis route in `motokey-api.js` has an `if (USE_SUPABASE && SBLayer) { ... } // RAM fallback` structure — both branches implement the same behavior independently.
**When to use:** The new `POST /devis/:id/envoyer` endpoint should follow this same shape for consistency with every neighboring route, even though production always runs with `USE_SUPABASE=true`.
**Example (read from `motokey-api.js` lines 1220-1240, `PUT /devis/:id`):**
```javascript
// Source: motokey-api.js (existing pattern, read directly)
if((p=M('PUT','/devis/:id'))!==null){
  const a = authSilent(req);
  if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
  const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
  if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
  const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
  if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

  if (USE_SUPABASE && SBLayer) {
    try {
      const dv = await SBLayer.Devis.update(p.id, garageId, { entete: b.entete, lignes: b.lignes });
      return ok(res, { devis: dv }, 'Devis mis à jour');
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }
  // ── RAM fallback ──
  ...
}
```
**D-03 implication:** the new statut-lock check (`if (dv.statut !== 'brouillon') return fail(res, "Devis déjà envoyé, non modifiable", 400, 'INVALID_STATUS')`) must run BEFORE calling `SBLayer.Devis.update` — meaning the endpoint needs a `SELECT statut` read first (mirrors the read-then-write shape already used in `POST /devis/:id/valider`, lines 1242-1260).

### Pattern 2: sendPush call site (new — no existing call site to copy verbatim)
**What:** `services/pushService.js`'s `sendPush(clientId, {title, body, data}, idempotencyKey)` is fully built (Phase 13) but has zero call sites in `motokey-api.js` today (confirmed by grep — only `emailService`/`stripeService` are required at the top of the file).
**When to use:** Inside the new `POST /devis/:id/envoyer` handler, after the statut transition succeeds. Needs `clientId` (via `motos.client_id` from the devis's moto — join already done elsewhere, e.g. `select('*, motos(marque, modele, plaque, clients(nom, email))')`).
**Example:**
```javascript
// NEW — first real call site for pushService in motokey-api.js
const pushService = require('./services/pushService'); // add near existing requires (~line 80-82)

// inside POST /devis/:id/envoyer, after statut update:
const idempotencyKey = `devis-envoye-${dv.id}`; // stable, one send per devis-envoi event
pushService.sendPush(dv.motos.client_id, {
  title: 'Nouveau devis reçu',
  body: `Un devis (${dv.numero}) vous a été envoyé.`,
  data: { type: 'devis_recu', devisId: dv.id }
}, idempotencyKey).catch(() => {}); // fire-and-forget, never blocks the HTTP response (matches PUSH_ENABLED fail-open convention)
```
**Idempotency key note:** `sendPush` internally suffixes per-token (`${key}::${token}`), so the base key only needs to be unique per devis-send event — `devis-envoye-${dv.id}` is safe as long as an "envoyer" transition can only happen once per devis (guaranteed by D-03's statut check: once `envoye`, PUT is locked, and there's no path back to `brouillon`).

### Pattern 3: Mobile push registration (permission → token → register)
**What:** Sequence for D-07 (register immediately after soft-ask accept + OS grant).
**Source:** Official Expo docs (`docs.expo.dev/push-notifications/push-notifications-setup/`), adapted to this repo's `apiPost` client.
```typescript
// lib/push.ts — NEW
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiPost, apiFetch } from './api';

export async function registerForPushAsync(token: string): Promise<boolean> {
  if (!Device.isDevice) return false; // simulators/emulators can't get a real push token

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return false;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return false; // no EAS project configured — see Environment Availability

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const platform = Device.osName === 'iOS' ? 'ios' : 'android';

  const { ok } = await apiPost('/client/device-tokens', { token: expoPushToken, platform }, token);
  return ok; // caller (D-08) decides silent-fail + retry-on-foreground behavior
}

export async function unregisterPushAsync(token: string, expoPushToken: string): Promise<void> {
  await apiFetch('DELETE', '/client/device-tokens', { token: expoPushToken }, token).catch(() => {});
}
```
**Caveat:** `apiFetch` currently only exports `apiPost`/`apiGet`/`apiPut` wrappers, not a `apiDelete` — either add one or call `apiFetch('DELETE', ...)` directly (the underlying function already supports any method + body).

### Pattern 4: Notification tap → deep link (MPUSH-05)
**What:** Cold-start + runtime tap handling, `expo-router` navigation.
**Source:** Official Expo docs (`docs.expo.dev/versions/v54.0.0/sdk/notifications/`), exact pattern:
```typescript
// hooks/useNotificationObserver.ts — NEW
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

export function useNotificationObserver() {
  const router = useRouter();

  useEffect(() => {
    function redirect(notification: Notifications.Notification) {
      const data = notification.request.content.data;
      if (data?.type === 'devis_recu') {
        router.push('/(app)/(tabs)/devis' as any); // typedRoutes cast — see Pitfall 3
      }
    }

    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response?.notification) redirect(response.notification);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      redirect(response.notification);
    });

    return () => subscription.remove();
  }, [router]);
}
```
**Mount point:** call this hook inside `app/(app)/_layout.tsx` (mounted only once authenticated and the tabs shell exists) — NOT the root `_layout.tsx`, since the Devis tab route doesn't exist until the `(app)` group is mounted.
**Foreground presentation:** also set (once, e.g. in the root layout or `(app)/_layout.tsx`):
```typescript
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false, shouldSetBadge: false,
    shouldShowBanner: true, shouldShowList: true,
  }),
});
```

### Anti-Patterns to Avoid
- **Repurposing `Devis.update` for the envoyer transition:** CONTEXT.md D-flags this explicitly — `Devis.update` spreads `payload.entete` directly into a generic `update()` helper with no statut-awareness. Use a dedicated `Devis.envoyer(id, garage_id)` method instead.
- **Calling `sendPush` synchronously with `await` and letting a push failure fail the HTTP response:** `pushService.sendToToken`/`sendPush` already never throw (fail-open by design per Phase 13), but the call site should still not block the client-visible "devis envoyé" success response on push delivery — treat it as fire-and-forget.
- **Mounting `useNotificationObserver` in the root `_layout.tsx`:** would fire `router.push('/(app)/(tabs)/devis')` before the auth gate/route group exists, causing a silent no-op or navigation error on cold start from a killed state. Mount inside `(app)/_layout.tsx`.
- **Using plain `npm install expo-notifications` instead of `npx expo install expo-notifications`:** risks installing a version for a newer Expo SDK (56.x/57.x currently on npm) that's incompatible with this repo's pinned SDK 54 — would repeat the SDK-mismatch class of bug that forced the SDK 57→54 downgrade in Phase 14-04.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent push sending (avoid duplicate sends on retry) | Custom dedup table/logic | `services/pushService.js`'s existing `push_send_log` insert-first guard | Already built, tested (SC-2/SC-3/SC-4 confirmed Phase 13), mirrors `billing_events` pattern. Just call `sendPush`/`sendToToken` — do not add a second idempotency layer. |
| Expo push token format validation | Custom regex | `Expo.isExpoPushToken()` (already wrapped as `isExpoPushToken()` in `motokey-api.js` line 188, and used inside `pushService.sendToToken`) | Already validated server-side twice (register endpoint + send-time re-check) — no new validation needed. |
| Cold-start / background / foreground notification-tap detection | Manual `AppState` + custom event bus | `Notifications.getLastNotificationResponseAsync()` (cold start) + `addNotificationResponseReceivedListener()` (runtime) | This exact split is the documented, supported Expo pattern — see Pattern 4 above. Hand-rolling this via `Linking.getInitialURL()` + custom parsing would duplicate SDK-provided functionality and miss edge cases (e.g., response already consumed). |
| "Has the user seen the soft-ask before" flag | Server-side flag on the client record | Local `AsyncStorage` flag, keyed per-device | D-04 says "not gated behind a first meaningful in-app action" and D-06 explicitly allows re-triggering from Compte tab — this is a device-local UX gate, not a server-tracked state; no new backend field/endpoint needed. |

**Key insight:** Nearly everything push-related below the mobile permission/token layer (idempotency, sending, fan-out, per-device dedup) is already built and tested from Phase 13. This phase is 90% wiring existing primitives into new trigger points — resist the urge to add new abstractions.

## Common Pitfalls

### Pitfall 1: Expo Go does not support remote push notifications from SDK 53+ (HIGH confidence, official source)
**What goes wrong:** Following the Expo docs and writing correct code, then testing on the tester's phone via Expo Go, `getExpoPushTokenAsync()` / real push delivery silently fails or the notification never arrives — looks like a code bug but is a platform limitation.
**Why it happens:** Per Expo's official push notifications FAQ: *"In SDK 53 and later, Expo Go does not support push notifications functionality, so to test push you should use a development build."* This repo's mobile app is pinned to SDK 54 (deliberately downgraded in Phase 14-04 to match the tester's Expo Go install). Only **local** (in-app-scheduled) notifications still work in Expo Go — remote/push notifications (which is exactly MPUSH-03) do not.
**How to avoid:** Do not treat "no notification arrived in Expo Go" as a code-correctness signal. Write the code, verify it via jest (unit-testable pieces: payload shape, idempotency key, route redirect logic) and manual curl (backend `sendPush` call, mirroring `scripts/test-push.js`'s existing pattern), and explicitly scope the "verify a real push arrives on a real device" checkpoint as **blocked pending a development build** (see Environment Availability below) — same deferral pattern as Phase 13's SC-1.
**Warning signs:** `getExpoPushTokenAsync` throwing, resolving to an empty/invalid token, or the OS permission prompt appearing but no notification ever showing up despite `PUSH_ENABLED=true` and a valid-looking token in the DB.

### Pitfall 2: `getExpoPushTokenAsync` requires an EAS `projectId` that doesn't exist yet
**What goes wrong:** `Notifications.getExpoPushTokenAsync({ projectId })` needs a real EAS project ID. This repo's `mobile-app/app.json` has no `extra.eas.projectId`, and there is no `eas.json`. `npx expo whoami` confirms no Expo account is logged in on this machine.
**Why it happens:** The mobile app was scaffolded (Phase 14) without ever running `eas init`/`eas build:configure` — EAS Build wasn't needed until push (this phase) and app store submission (Phase 17).
**How to avoid:** The `registerForPushAsync()` code should defensively check for a missing `projectId` and no-op/fail-silently (fits D-08's "fail silently, retry on next foreground" requirement anyway) rather than crash. Setting up the actual EAS project (`eas init`) is a prerequisite for ANY real device token to ever be obtained — flag this to Mehdi as a required manual step (Expo account login) before MPUSH-02/03 can be verified on a real device, regardless of dev-build vs Expo Go.
**Warning signs:** `getExpoPushTokenAsync` rejecting with a project-ID-related error.

### Pitfall 3: `expo-router` typed routes and dynamic `router.push()` from notification data
**What goes wrong:** `mobile-app/app.json` has `"experiments": { "typedRoutes": true }` enabled. `router.push(someStringFromNotificationData)` will trigger a TypeScript error at compile time (`tsc --noEmit`, part of this repo's established quality gate — see Phase 15-03's tsc gap) because a dynamic string isn't statically known to be a valid `Href`.
**Why it happens:** Typed routes generate a union type of valid paths from the file tree; runtime-derived strings from `notification.data` aren't part of that union.
**How to avoid:** Cast explicitly (`router.push('/(app)/(tabs)/devis' as any)`, or use a small allowlist/switch mapping `data.type` → a literal, statically-known route string) rather than passing the raw `data.url`/`data.type` value straight through.
**Warning signs:** `npx tsc --noEmit` failing on the new hook file.

### Pitfall 4: Foreground notification arrival doesn't trigger the Devis tab's `useFocusEffect` refetch
**What goes wrong:** If the user is already on the Devis tab when a push arrives (foreground), `router.push('/(app)/(tabs)/devis')` from the tap handler is a no-op (already on that route) — `useFocusEffect`'s silent refetch (built in 15-09) won't fire because focus never changes, so the new devis won't appear until a manual pull-to-refresh.
**Why it happens:** `useFocusEffect` only fires on focus transitions, not on arbitrary background events.
**How to avoid:** This is a corner case within an already-corner-case scenario (foreground-received AND tapped AND already on the exact tab) — acceptable to leave as a known gap for this phase (the OS banner still shows the notification correctly; only the auto-refresh of an already-visible list is affected), or trivially fixed by also calling a shared `load()`/refetch callback from the tap handler if the planner wants zero-gap coverage. Flag as an explicit scope decision rather than a silent gap.
**Warning signs:** On-device testing where tapping a notification while already on the Devis tab doesn't show the new devis without a manual pull-to-refresh.

### Pitfall 5: `app.html`'s existing devis list table doesn't display `statut` at all today
**What goes wrong:** Planning the "per-row Envoyer au client button" (D-02) assumes there's a row to attach it to with visible status — but the current `loadDevis()` table in `app.html` (lines 1210-1212) only renders `Réf. / Date / Moto / Total HT` columns, with **no statut column and no action buttons of any kind**. Additionally, the field names referenced (`d.reference`, `d.date`, `d.moto`, `d.total_ht`) don't match either backend response shape (`SBLayer.Devis.list()` returns raw devis rows + `motos(marque,modele,plaque)` join with fields `numero`/`created_at`; the RAM fallback returns `moto_info`/`total_ttc`) — meaning this display is likely already silently blank/broken for these columns in the current garage UI, independent of this phase.
**Why it happens:** Pre-existing tech debt, not caused by this phase — the devis list UI was apparently never updated after the backend response shape solidified.
**How to avoid:** The planner should scope adding a statut column (or at minimum a per-row send button that appears only when `statut === 'brouillon'`) AND fix the field references to match the real API shape (`d.numero`, `d.created_at`, `d.moto_info` or `d.motos`, `d.total_ttc`) as part of the same task — otherwise the new button has nothing correctly rendering around it to anchor to.
**Warning signs:** Loading the Devis section in `app.html` today and seeing blank/`—`/`NaN` cells in the Réf/Date/Moto/Total columns.

### Pitfall 6: `PUT /devis/:id` lock-on-send must check statut BEFORE calling `Devis.update`
**What goes wrong:** If the statut check is added inside `Devis.update()` (supabase.js) but the route handler still unconditionally calls it, or if the check happens after a partial write, an `envoye` devis could still get its lines silently replaced.
**Why it happens:** `Devis.update()` currently has no statut awareness at all (reads `payload.entete`/`payload.lignes` and writes unconditionally).
**How to avoid:** Add the statut check as a `SELECT statut` read at the very top of the `PUT /devis/:id` route handler (both Supabase and RAM-fallback branches), returning `400 INVALID_STATUS` before any write path is reached — mirrors the existing pattern already used in `valider`/`refuser` routes (`if (dv.statut !== 'envoye') return fail(...)`).

## Code Examples

### Backend: statut-guarded PUT (extends existing pattern)
```javascript
// Source: adapts motokey-api.js's existing valider/refuser statut-check pattern to PUT
if((p=M('PUT','/devis/:id'))!==null){
  // ...existing RBAC checks unchanged...
  if (USE_SUPABASE && SBLayer) {
    try {
      const { data: current } = await SBLayer.supabase.from('devis').select('statut').eq('id', p.id).eq('garage_id', garageId).single();
      if (!current) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
      if (current.statut !== 'brouillon') return fail(res, 'Devis déjà envoyé — créez un nouveau devis pour modifier', 400, 'INVALID_STATUS');
      const dv = await SBLayer.Devis.update(p.id, garageId, { entete: b.entete, lignes: b.lignes });
      return ok(res, { devis: dv }, 'Devis mis à jour');
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }
  // RAM fallback: same guard against DB.devis[i].statut !== 'brouillon'
}
```

### Backend: new envoyer endpoint (full shape)
```javascript
// Source: NEW route, follows established RBAC/branch conventions read from neighboring routes
if((p=M('POST','/devis/:id/envoyer'))!==null){
  const a = authSilent(req);
  if (!a && !req.ctx) return fail(res, 'Non authentifié', 401, 'UNAUTHORIZED');
  const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : {role:'CONCESSION',level:4,user_id:null,email:null,client_type:null});
  if (!rbac.requireRole(ctx, 'MECANO')) return fail(res, 'Permission refusée — MECANO minimum requis', 403, 'FORBIDDEN_ROLE');
  const garageId = a ? a.id : await rbac.getGarageIdForUser(ctx, SBLayer);
  if (!garageId) return fail(res, 'Garage introuvable pour ce compte', 404, 'NOT_FOUND');

  if (USE_SUPABASE && SBLayer) {
    try {
      const { data: dv } = await SBLayer.supabase.from('devis')
        .select('id, numero, statut, moto_id, motos(client_id)')
        .eq('id', p.id).eq('garage_id', garageId).single();
      if (!dv) return fail(res, 'Devis non trouvé', 404, 'NOT_FOUND');
      if (dv.statut !== 'brouillon') return fail(res, 'Ce devis a déjà été envoyé', 400, 'INVALID_STATUS');

      const { data: updated, error } = await SBLayer.supabase.from('devis')
        .update({ statut: 'envoye', updated_at: new Date().toISOString() })
        .eq('id', p.id).select().single();
      if (error) throw new Error(error.message);

      if (dv.motos?.client_id) {
        const pushService = require('./services/pushService');
        pushService.sendPush(dv.motos.client_id, {
          title: 'Nouveau devis reçu',
          body: `Un devis (${dv.numero}) vous a été envoyé.`,
          data: { type: 'devis_recu', devisId: dv.id }
        }, `devis-envoye-${dv.id}`).catch(() => {});
      }
      return ok(res, { devis: updated }, 'Devis envoyé au client');
    } catch(e) { return fail(res, e.message, 500, 'DB_ERROR'); }
  }
  // RAM fallback: same shape against DB.devis
}
```
(`require('./services/pushService')` inline here for illustration only — in the actual file, hoist it to the top-level requires near line 80-82 alongside `emailService`/`stripeService`, not inside the handler.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Expo Go supports remote push for both platforms | Expo Go supports remote push on neither platform (local notifications only) | SDK 53 (2025), still true in SDK 54/56/57 per official FAQ | Any on-device MPUSH-02/03 verification requires a development build, not just Expo Go — new constraint vs. how Phases 14/15 were verified (those didn't need remote push). |
| Classic Expo push tokens (implicit, account-scoped) | `getExpoPushTokenAsync({ projectId })` requires an explicit EAS `projectId` | Ongoing since EAS Build's introduction | This repo has no EAS project configured yet — a blocking prerequisite, not just a version detail. |

**Deprecated/outdated:**
- Legacy/classic push token behavior without `projectId` — removed; always pass `projectId` explicitly (don't rely on auto-inference from `easConfig`, which won't exist without `eas init` anyway).

## Open Questions

1. **Should Phase 16 include creating the EAS project + a development build, or defer entirely?**
   - What we know: No `eas.json`, no `projectId` in `app.json`, no logged-in Expo account (`npx expo whoami` → "Not logged in"). Local Android/iOS builds aren't possible on this machine (no Android SDK/Java/Xcode).
   - What's unclear: Whether Mehdi wants to set up an Expo account + EAS project now (unblocking real on-device MPUSH-02/03 verification within this phase) or defer to Phase 17 (which needs EAS Build anyway for MSTORE-01/02 app store submission).
   - Recommendation: Ship all code this phase; treat "real device push delivery confirmed" as a checkpoint item explicitly deferred pending EAS setup, mirroring the SC-1 precedent (Phase 13→15). Flag for Mehdi's decision at the plan checkpoint rather than silently building EAS infra into this phase's task list.

2. **Proactive dead-token deactivation on `DeviceNotRegistered` receipts** (carried over from Phase 13's deferred ideas, explicitly flagged in CONTEXT.md as still open).
   - What we know: `services/pushService.js`'s `sendToToken` only inspects ticket-level errors (`tickets.filter(t => t.status === 'error')`), never polls Expo's **receipts** endpoint (which is where `DeviceNotRegistered` actually surfaces, typically minutes after send, not in the initial ticket response).
   - What's unclear: Whether this phase should add receipt polling (`expoClient.getPushNotificationReceiptsAsync`) + a delete against `client_device_tokens`, or defer further.
   - Recommendation: Defer to Phase 17. This phase already has real scope (backend trigger + soft-ask + token lifecycle + deep link); receipt polling is a genuinely separate concern (needs either a delayed job or a cron, and Phase 17 is where cron primitives for MPUSH-04 get investigated anyway per STATE.md's existing research flag "primitive cron Railway à confirmer avant Phase 17"). Bundling it here risks scope creep beyond the 4 locked success criteria.

3. **Should the RAM-fallback branch for the new `envoyer` endpoint be built out fully, or stubbed?**
   - What we know: Every existing devis route has a full dual-branch implementation, but production always runs with `USE_SUPABASE=true` (Railway env has `SUPABASE_URL`/`SUPABASE_KEY` set) — the RAM fallback is effectively dead code in prod, kept for local-dev-without-Supabase convenience.
   - What's unclear: Whether maintaining this parity is worth the extra surface for a phase already carrying meaningful new scope.
   - Recommendation: Keep it for consistency (matches every neighboring route, low cost to mirror), but this is a reasonable place for the planner to trim if the phase needs to shrink.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `expo-notifications` package | MPUSH-01/02/03/05 (mobile code) | ✗ (not yet a dependency) | — | `npx expo install expo-notifications` → resolves `~0.32.17` for SDK 54 |
| EAS project (`eas.json` + `projectId`) | `getExpoPushTokenAsync` (real token retrieval) | ✗ | — | None for real tokens — blocking. Code-level fallback: fail silently (D-08 already requires this behavior anyway). |
| Expo account login (`eas login`) | EAS project creation, EAS Build | ✗ (`npx expo whoami` → "Not logged in") | — | Human action required — Mehdi must create/log into an Expo account. No code workaround. |
| Expo Go (remote push support) | On-device MPUSH-02/03 verification | ✗ (SDK 53+ Expo Go dropped remote push support entirely) | Expo Go matches SDK 54 | Development build via EAS Build cloud (requires the above). No local build fallback (see below). |
| Android SDK / `adb` / Java (for local dev builds as an EAS-Build alternative) | Local `expo run:android` as an alternative to EAS cloud build | ✗ (no `adb`, no `java`, `ANDROID_HOME` unset) | — | None on this machine — EAS cloud build is the only path once an Expo account exists. |
| `eas-cli` | Running EAS commands | ✓ (via `npx`, not globally installed) | `eas-cli/20.5.1` (fetched on demand) | — |
| Jest / `jest-expo` (mobile-app test framework) | Unit-testing the extractable pure logic (redirect-route mapping, payload shapes) | ✓ | `jest-expo@~54.0.17`, `jest@^29.7.0` | — |

**Missing dependencies with no fallback:**
- Expo account login + EAS project setup — blocks any real Expo push token from ever being generated on a device. This is a human action (Mehdi logging into/creating an Expo account), not something Claude can do from this environment.
- Local Android/iOS build tooling — absent, so EAS cloud build (which itself needs the above) is the only viable path to a testable development build.

**Missing dependencies with fallback:**
- `expo-notifications` package itself — trivially installable, not a real gap, just not yet done.
- Real push delivery verification — falls back to: (a) jest-testable pure logic (redirect mapping, payload construction), (b) manual curl against the backend mirroring `scripts/test-push.js`'s existing pattern (`PUSH_ENABLED=true node scripts/test-push.js <token>`), (c) MPUSH-05's tap-to-navigate logic specifically CAN be exercised in Expo Go today using a **locally scheduled** test notification with the same `data: {type:'devis_recu'}` shape (`Notifications.scheduleNotificationAsync`) — local notifications are unaffected by the Expo Go remote-push removal, so this is a legitimate on-device verification path for the navigation logic alone, just not for real remote delivery.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (mobile) | Jest via `jest-expo@~54.0.17`, existing config in `mobile-app/package.json` (`"jest": {"preset": "jest-expo", ...}`) |
| Framework (backend) | None formal — established project convention is manual curl / harness scripts (`scripts/test-push.js`, `test-api.js`), per Phase 12/13 precedent where automated backend tests were explicitly skipped by user decision in favor of manual verification |
| Config file (mobile) | `mobile-app/package.json` `"jest"` key |
| Config file (backend) | none — see Wave 0 |
| Quick run command (mobile) | `cd mobile-app && npx jest lib/__tests__/<new-file>.test.ts` |
| Full suite command (mobile) | `cd mobile-app && npm test` |
| Full check (backend) | `node --check motokey-api.js` (syntax) + manual curl per project convention |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MPUSH-01 | Soft-ask shown exactly once (AsyncStorage flag gating) | unit | `npx jest lib/__tests__/softAsk.test.ts` | ❌ Wave 0 (new pure-logic module recommended: `shouldShowSoftAsk(hasSeenFlag): boolean`) |
| MPUSH-01 | Full-screen visual + OS prompt sequencing | manual-only | — (visual/OS-prompt timing, not unit-testable) | — |
| MPUSH-02 | `POST`/`DELETE /client/device-tokens` request shape from mobile | unit | `npx jest lib/__tests__/push.test.ts` (mock `apiPost`/`apiFetch`) | ❌ Wave 0 |
| MPUSH-02 | Real token registered/deregistered on real login/logout | manual-only, **blocked** | — | Requires development build (Pitfall 1) — not achievable via Expo Go |
| MPUSH-03 | Backend `envoyer` endpoint transitions statut + calls `sendPush` with correct payload/idempotency key | integration (manual curl) | `curl -X POST .../devis/:id/envoyer` against a seeded `brouillon` devis, mirroring `scripts/test-push.js`'s existing manual-verification convention | ❌ Wave 0 — needs a seed devis fixture (`scripts/seed-test-moto-15-uat.js` shows the existing seeding pattern to follow) |
| MPUSH-03 | Real push arrives on real device within seconds | manual-only, **blocked** | — | Requires development build |
| MPUSH-05 | Notification-tap redirect-route mapping (`data.type` → route string) | unit | `npx jest hooks/__tests__/useNotificationObserver.test.ts` (extract `redirect()` as a pure exported function for testability) | ❌ Wave 0 |
| MPUSH-05 | On-device tap → Devis tab navigation | manual, **achievable via local test notification** (not blocked — see Environment Availability fallback) | — | — |

### Sampling Rate
- **Per task commit:** `cd mobile-app && npx jest <touched test files>` + `node --check motokey-api.js`
- **Per wave merge:** `cd mobile-app && npm test` (full mobile suite) + manual curl smoke of the new `envoyer` endpoint
- **Phase gate:** Full mobile jest suite green + manual curl confirms statut transition + push call fires (dev-mode console.log fallback acceptable if `PUSH_ENABLED=false`) before `/gsd:verify-work`. Real on-device push delivery (MPUSH-02/03) explicitly carried as a known-blocked item per Open Question 1, not a gate blocker.

### Wave 0 Gaps
- [ ] `mobile-app/lib/__tests__/push.test.ts` — covers MPUSH-02 (registration/unregistration payload logic, mocked `apiPost`/`apiFetch`)
- [ ] `mobile-app/hooks/__tests__/useNotificationObserver.test.ts` — covers MPUSH-05 (redirect mapping logic, extracted as a pure function)
- [ ] `mobile-app/lib/__tests__/softAsk.test.ts` (or equivalent) — covers MPUSH-01's "shown once" gating logic
- [ ] Backend seed fixture for a `brouillon` devis usable in manual curl verification of the new `envoyer` endpoint — follow the pattern already visible in `scripts/seed-test-moto-15-uat.js` (untracked, present in working tree per `git status`)

## Sources

### Primary (HIGH confidence)
- `motokey-api.js` (read directly, lines 1095-1370, 1710-1780) — devis routes, RBAC pattern, existing `/client/device-tokens` endpoints
- `supabase.js` (read directly, lines 455-562) — `Devis` object methods
- `auth/rbac.js` (read directly, full file) — role hierarchy, `requireRole`/`requireAnyRole` signatures
- `services/pushService.js` (read directly, full file) — `sendToToken`/`sendPush` exact contract, confirmed no receipt-polling exists yet
- `mobile-app/package.json`, `mobile-app/app.json` (read directly) — exact installed versions, confirmed no `expo-notifications`, no EAS `projectId`
- `mobile-app/context/AuthContext.tsx`, `mobile-app/app/_layout.tsx`, `mobile-app/app/(app)/_layout.tsx`, `mobile-app/app/(app)/(tabs)/_layout.tsx`, `mobile-app/app/(app)/(tabs)/devis/index.tsx`, `mobile-app/app/(app)/(tabs)/compte.tsx`, `mobile-app/theme/colors.ts`, `mobile-app/lib/api.ts`, `mobile-app/lib/secureStore.ts`, `mobile-app/constants/config.ts` (all read directly)
- `sql/migrations/16_client_device_tokens.sql`, `sql/migrations/17_push_send_log.sql` (read directly) — confirmed live schema
- `https://raw.githubusercontent.com/expo/expo/sdk-54/packages/expo/bundledNativeModules.json` (fetched directly) — confirmed `expo-notifications: ~0.32.17` for SDK 54, cross-checked against every other pinned `expo-*` version in this repo
- `npm view expo-notifications@0.32.17 version` / `npm view expo-notifications versions` — confirmed registry availability
- `https://docs.expo.dev/push-notifications/faq/` (fetched directly) — "In SDK 53 and later, Expo Go does not support push notifications functionality" — the single most load-bearing finding of this research
- `https://docs.expo.dev/versions/v54.0.0/sdk/notifications/` (fetched directly) — exact API signatures for `requestPermissionsAsync`, `getExpoPushTokenAsync`, `getLastNotificationResponseAsync`, `addNotificationResponseReceivedListener`, `setNotificationHandler`, plus the official `expo-router` deep-link example
- `https://docs.expo.dev/push-notifications/push-notifications-setup/` (fetched directly) — config plugin, Android notification channel setup
- Direct environment probes on this machine: `npx expo whoami` (not logged in), `npx eas-cli --version` (works via npx), `adb`/`java`/`ANDROID_HOME` checks (all absent)

### Secondary (MEDIUM confidence)
- WebSearch aggregation on "Expo Go Android push notifications removed" — multiple third-party sources (gist, React Native Relay, Courier blog) corroborate the FAQ's claim; one result claimed an iOS-only exception, which is **contradicted** by the official FAQ's platform-agnostic wording — the official FAQ (primary source) is treated as authoritative over this contradicting secondary claim.
- `https://expo.dev/changelog/sdk-54` (fetched directly) — did not itself mention the Expo Go push removal (it happened in SDK 53, so SDK 54's changelog is silent on it) — used only to confirm no *additional* SDK-54-specific regression, not as the source of the core finding.

### Tertiary (LOW confidence)
- None flagged — all findings that reached the final document were either read directly from this repo's code or corroborated against Expo's own official docs/FAQ/changelog/registry.

## Metadata

**Confidence breakdown:**
- Standard stack (expo-notifications version): HIGH — verified against Expo's own `bundledNativeModules.json` for the exact SDK branch this repo uses, cross-checked against every other already-installed `expo-*` package version, and confirmed present on the npm registry.
- Architecture (backend devis wiring): HIGH — every referenced line was read directly from `motokey-api.js`/`supabase.js`, not inferred from training data.
- Architecture (mobile push wiring): MEDIUM-HIGH — API shapes come from official Expo docs (fetched live, not training data), but the exact file-placement recommendations (e.g., mounting the observer hook in `(app)/_layout.tsx`) are this research's own reasoned recommendation, not something documented by Expo itself — flagged as a pattern, not a fact.
- Pitfalls (Expo Go remote-push removal): HIGH — this is the single fact this research most aggressively cross-verified (official FAQ + changelog + multiple independent secondary sources + direct environment probing of this specific machine's tooling gaps), precisely because it's the kind of "recent platform change training data might not reflect" fact this research process is designed to catch.
- Environment availability: HIGH — every claim (`npx expo whoami`, `adb`/`java`/`ANDROID_HOME` absence, `eas-cli` reachability via npx) was directly probed on this machine, not assumed.

**Research date:** 2026-07-04
**Valid until:** 30 days for the backend/RBAC/mobile-code findings (stable, internal to this repo); 14 days for the Expo Go / EAS ecosystem findings specifically, since Expo ships frequent SDK updates and this is exactly the kind of external-platform fact that can shift — re-verify against `docs.expo.dev` before executing if this research is consumed more than 2 weeks after the date above.
