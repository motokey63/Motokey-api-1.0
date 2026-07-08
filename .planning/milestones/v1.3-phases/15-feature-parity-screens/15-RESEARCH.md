# Phase 15: Feature-Parity Screens - Research

**Researched:** 2026-07-03
**Domain:** Expo Router (SDK 54) navigation architecture + AsyncStorage read-only caching, porting a vanilla-JS web client to React Native screens
**Confidence:** HIGH (navigation patterns, backend contracts, existing code) / MEDIUM (one backend RBAC discrepancy flagged below — needs defensive coding, not a blocker)

## Summary

Phase 15 is a pure frontend port: take five screens' worth of logic already fully implemented in `MotoKey_Client.html` (motos list, fiche moto, devis, add/claim moto, réclamations, garages) and rebuild them as Expo Router screens reusing Phase 14's `apiGet/apiPost/apiPut` helpers, `useAuth()` token access, `colors` theme, and `Button/TextField/Toast` components. Nothing here requires a new backend endpoint, a new state-management library, or (for the online case) any dependency not already in `package.json`.

The two things that are genuinely new for this project are (1) nesting a `Stack` navigator inside one tab of a bottom `Tabs` navigator — a well-documented, stable expo-router v6 pattern (`Tabs` from `'expo-router'`, not the experimental Native Tabs) — and (2) a hand-rolled "fetch, cache on success, serve stale cache + timestamp on network failure" read path using the already-installed `@react-native-async-storage/async-storage`, keyed off `apiFetch`'s existing `{ ok: false, status: 0 }` network-failure shape. Both are small, bounded pieces of work; no new pattern needs inventing from scratch. **Confidence is HIGH for these two questions** and this section of research is prescriptive, not exploratory.

One backend finding requires explicit attention during planning: `GET /motos/:id/entretien` and `GET /motos/:id/entretien/alertes` are gated `rbac.requireRole(ctx, 'MECANO')` server-side (see `auth/rbac.js` hierarchy `CLIENT:1 < MECANO:2`), which means **CLIENT-role tokens will get a 403 on the alertes endpoint**, contradicting the phase's "already CLIENT-accessible" grounding for that one specific sub-endpoint. This is not a new problem introduced by this research — `MotoKey_Client.html`'s own `loadMotos()` already codes around it defensively (`alRes.ok ? [...] : null // null = non accessible (403 RBAC) → section masquée`). The mobile Fiche Moto screen must port that same defensive pattern (treat 403 as "hide plan d'entretien section", not as an error toast) rather than assume the endpoint will succeed for CLIENT users. See Common Pitfalls and Open Questions below.

**Primary recommendation:** Structure `app/(app)/` as `(tabs)/{motos,devis,compte}` with a nested `Stack` under `motos/` for the Fiche Moto + secondary flows; port each `MotoKey_Client.html` render function 1:1 into a `.tsx` screen using existing `apiGet/apiPost` + `useAuth().getValidAccessToken()`; use `FlatList` + `RefreshControl` (both RN core, zero new deps) for lists; build the MPARITY-05 cache as a small pure module (`lib/cache.ts`) mirroring the `lib/session.ts` testable-pure-function style, with `AsyncStorage` keys following the existing `mk_session` naming convention (e.g. `mk_cache_motos`, `mk_cache_devis`).

## User Constraints

### Locked Decisions

- **D-01:** All three garage/moto-linkage flows in scope: claim orphan moto (VIN+plaque), leave a linked garage (with optional motif + confirmation modal), add a moto manually (respecting plan-limit + "Passer Pro" CTA).
- **D-02:** Photo upload for moto claims stays DISABLED, matching web client's current state (`CLOUDINARY_CLOUD` empty). Claim form collects VIN + plaque only, submits `carte_grise_photo_url: 'pending_manual_verification'`, shows "contactez votre garage pour finaliser la réclamation". No camera/Cloudinary integration this phase.
- **D-03:** Bottom tab bar, 3 tabs: Motos, Devis, Compte. Replaces Phase 14's placeholder Home entirely.
- **D-04:** Tapping a moto in the list stack-pushes to a dedicated Fiche Moto screen. List itself stays lightweight (identity + score + couleur only) — deliberate departure from web client's inline-expanding card.
- **D-05:** Secondary garage/moto-linkage flows (ajouter, réclamer, mes réclamations, mes garages) live behind a button/menu on the Motos tab, reached via stack navigation — not separate bottom tabs.
- **D-06 (Claude's Discretion, documented for clarity):** Compte tab is a minimal placeholder this phase — replaces Phase 14's "Bienvenue {email}" + logout screen as-is. Full profile editing/change-password is out of scope (not an MPARITY requirement).
- **D-07:** Fiche Moto shows full parity with `renderMotoCard()`: historique d'interventions (MPARITY-03), plan d'entretien/alertes, pneumatiques — all three sections. All three backing endpoints "already exist and are wired for the CLIENT role" **— see Open Questions: this is confirmed true for interventions, NOT confirmed true for entretien/alertes (see Summary and Pitfall 1).**
- **D-08:** No `@react-native-community/netinfo`. Reuse `apiFetch`'s existing failure path (`{ ok: false, status: 0, data: { error: { message: "Serveur inaccessible..." } } }`) as the offline-fallback trigger.
- **D-09:** Cache scope is narrow: only motos list (enriched with interventions/alertes/pneus) and devis list, stored in `AsyncStorage` alongside a last-successful-fetch timestamp. Fiche moto detail (if not covered by motos-list cache), réclamations, and garages screens remain online-only.

### Claude's Discretion

- Exact `AsyncStorage` key naming and cache invalidation/eviction strategy.
- Tab bar icon choice/visual treatment — check `@expo/vector-icons` (bundled with the `expo` package) before introducing a new icon library. **Research finding: `@expo/vector-icons` does NOT currently resolve from `mobile-app`'s own `node_modules` (see Environment Availability) — either add it explicitly to `package.json`, or use the web client's own emoji-icon precedent (see Architecture Patterns) to avoid a new dependency entirely.**
- Exact stack/route file structure under Expo Router for the new screens — follow file-based conventions already established in `app/(auth)/` and `app/(app)/`.
- Whether the plan-limit "Passer Pro" CTA block needs mobile-specific copy changes beyond a direct port of the web client's text.

### Deferred Ideas (OUT OF SCOPE)

- Real Cloudinary photo upload for moto claims (camera/gallery picker) — deferred until the web client itself enables it.
- Proactive network-state detection (`@react-native-community/netinfo`, live "Hors ligne" banner) — deferred in favor of fallback-on-failure (D-08).
- Full profile-edit (nom/tel) and change-password UI in Compte tab — not an MPARITY requirement.
- Push notifications, deep links, app store submission — scoped to Phase 16/17.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MPARITY-01 | Motos list with statut couleur + score d'intégrité | `GET /motos` returns `score`/`couleur_dossier` as direct stored columns for CLIENT role (`motokey-api.js:670-689`, confirmed via `supabase.js` — no client-side computation needed). Colors already mapped in `theme/colors.ts` (`gn/bl/yw/rd`); backend values are French words `'vert'/'bleu'/'jaune'/'rouge'` needing a lookup map. |
| MPARITY-02 | View + accept/refuse devis | `GET /devis`, `POST /devis/:id/valider`, `POST /devis/:id/refuser` all CLIENT-accessible and confirmed (`motokey-api.js:1099-1142`, `:1242`, `:1308`). Statut labels/colors verified in `MotoKey_Client.html:943-944`. |
| MPARITY-03 | Historique d'entretien/interventions per moto | `GET /motos/:id/interventions` has an explicit CLIENT branch (`motokey-api.js:874-901`) — confirmed accessible. The separate "plan d'entretien" (alertes) endpoint is NOT CLIENT-accessible server-side today (see Pitfall 1) — port the web client's defensive 403-hides-section handling, don't treat as guaranteed content. |
| MPARITY-04 | Claim/revoke garage liaison | `POST /client/reclamations`, `GET /client/reclamations`, `GET /client/garages`, `DELETE /client/garages/:id` all confirmed CLIENT-accessible with response envelopes verified directly against `motokey-api.js` (see Code Examples). |
| MPARITY-05 | Read-only offline cache with "dernière mise à jour" timestamp | `apiFetch`'s catch block already returns the exact failure shape needed to trigger the fallback (`lib/api.ts:36-42`). `AsyncStorage` is already a dependency, used today for the encrypted session blob (`lib/secureStore.ts`) — a plain (unencrypted) JSON cache follows the same file, different key. |

## Standard Stack

### Core (all already present — zero new production dependencies required)

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-router | ~6.0.24 | File-based routing, `Tabs` + nested `Stack` navigators | Already the project's router; `Tabs` (not experimental Native Tabs) is the stable SDK 54 pattern for bottom tab bars |
| @react-native-async-storage/async-storage | 2.2.0 | MPARITY-05 read-only cache storage | Already a dependency (used by `lib/secureStore.ts`); no new package needed |
| react-native (FlatList, RefreshControl, Alert, Modal) | 0.81.5 | Lists, pull-to-refresh, confirm dialogs, revoke-garage modal | Core RN — no separate list-virtualization or confirm-dialog library needed for this phase's data volumes (a handful to a few dozen motos/devis/interventions per user, not a virtualization-scale problem) |
| lib/api.ts (`apiGet`/`apiPost`/`apiPut`/`apiFetch`) | project-local | All data fetching for new screens | Established in Phase 14, 1:1 port of the web client's fetch helpers; `apiFetch` also supports arbitrary methods (e.g. `apiFetch('DELETE', ...)`) for the garage-revoke call |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @expo/vector-icons | ^15.0.3 (nested dependency of `expo`, **not currently resolvable from `mobile-app`'s own module tree** — see Environment Availability) | Tab bar icons | Only if the planner decides icons (not emoji) are needed; requires adding it explicitly to `mobile-app/package.json` first |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Emoji-as-icon (matches `MotoKey_Client.html`'s own `🏍`/`📋`/`🔧`/`⚠️` precedent) | `@expo/vector-icons` | Emoji: zero new dependency, exact web-parity precedent, but less crisp on some Android font renderers. Vector icons: cleaner cross-platform look, but requires adding the package explicitly since it doesn't currently resolve from the app's own `node_modules` |
| `AsyncStorage` plain JSON cache (D-09) | A dedicated cache/query library (react-query, SWR) | React Query would be overkill for a narrowly-scoped 2-key read-only cache with no background refetching/mutation logic required; D-08 explicitly rejects adding new network-state libraries in this spirit |
| `FlatList` | `FlashList` (`@shopify/flash-list`) | Not installed, not needed — list sizes here (motos, devis, interventions per user) are small; FlatList's built-in virtualization is sufficient |

**Installation:** None required for the core path. If icons (not emoji) are chosen: `npm install @expo/vector-icons@^15.0.3` inside `mobile-app/`.

**Version verification:**
```bash
cd mobile-app && npm view expo-router version   # confirms latest available; project is pinned ~6.0.24, matches installed
cd mobile-app && npm view @react-native-async-storage/async-storage version
```
`expo-router@6.0.24` and `async-storage@2.2.0` are the versions actually installed in `mobile-app/node_modules` (verified directly via `package.json` + `node -e "require(...).version"`), not training-data guesses.

## Architecture Patterns

### Recommended Project Structure

```
mobile-app/app/(app)/
├── _layout.tsx                  # unchanged Stack wrapper (auth-gated by root _layout.tsx)
├── (tabs)/
│   ├── _layout.tsx              # Tabs — Motos / Devis / Compte
│   ├── motos/
│   │   ├── _layout.tsx          # Stack nested inside the Motos tab
│   │   ├── index.tsx            # Motos list (D-04: lightweight cards)
│   │   ├── [id].tsx              # Fiche Moto detail (D-07: historique + plan + pneus)
│   │   ├── add.tsx               # Ajouter une moto (D-01, D-05)
│   │   ├── claim.tsx             # Réclamer une moto (D-01, D-02, D-05)
│   │   ├── reclamations.tsx      # Mes réclamations (D-01, D-05)
│   │   └── garages.tsx           # Mes garages + revoke modal (D-01, D-05)
│   ├── devis/
│   │   ├── _layout.tsx          # Stack (or a flat screen if no drill-down is needed — devis
│   │   │                        # accept/refuse happens inline per web client, no detail push needed)
│   │   └── index.tsx            # Devis list (MPARITY-02)
│   └── compte.tsx                # Minimal placeholder (D-06) — repurposed from home.tsx
```

`app/(app)/home.tsx` is deleted; its content (email + logout) becomes `(tabs)/compte.tsx` per D-06. The existing `app/_layout.tsx` root-level redirect target (`router.replace('/(app)/home')`) must be updated to point at the new default tab route (e.g. `/(app)/(tabs)/motos`).

### Pattern 1: Bottom Tabs with a Nested Stack in One Tab

**What:** `Tabs` from `expo-router` renders the bottom bar; any tab that needs multi-screen drill-down (Motos) gets its own subfolder with a `_layout.tsx` returning a `Stack`. Tabs without drill-down (Devis, Compte) stay as flat files directly under `(tabs)/`.
**When to use:** Exactly this phase's shape — one tab (Motos) needs a list→detail→sub-flows stack, the other two don't.
**Example:**
```tsx
// Source: https://docs.expo.dev/router/basics/common-navigation-patterns/ (verified against SDK 54 docs)
// app/(app)/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { colors } from '../../../theme/colors';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.acc }}>
      <Tabs.Screen name="motos" options={{ title: 'Motos' }} />
      <Tabs.Screen name="devis" options={{ title: 'Devis' }} />
      <Tabs.Screen name="compte" options={{ title: 'Compte' }} />
    </Tabs>
  );
}

// app/(app)/(tabs)/motos/_layout.tsx
import { Stack } from 'expo-router';
export default function MotosStack() {
  return <Stack screenOptions={{ headerShown: true }} />;
}
```
Navigate to the detail screen with `router.push('/(app)/(tabs)/motos/' + moto.id)` (or a relative `router.push(\`./${moto.id}\`)` from `index.tsx`); navigate to sub-flows with `router.push('/(app)/(tabs)/motos/add')` etc.

### Pattern 2: Emoji-as-Icon (Zero-Dependency Tab Icons, Web-Parity Precedent)

**What:** `MotoKey_Client.html` uses plain Unicode emoji for every icon in the app (🏍 for motos, 📋 for devis, 🔧 for garages, ⚠️ for errors, ⏳ for loading, 👑 for the Pro CTA) — there is no icon font/library in the web client at all.
**When to use:** For the D-03 tab bar and any icon-shaped UI element, rendering `<Text style={{fontSize: 22}}>🏍</Text>` inside `tabBarIcon` avoids the `@expo/vector-icons` resolution gap entirely (see Environment Availability) while staying at exact visual parity with the reference implementation.
**Example:**
```tsx
<Tabs.Screen
  name="motos"
  options={{
    title: 'Motos',
    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20 }}>🏍️</Text>,
  }}
/>
```

### Pattern 3: Read-Only Cache-on-Failure (MPARITY-05, D-08/D-09)

**What:** A small pure module, `lib/cache.ts`, exposing `getCached<T>(key)`, `setCached<T>(key, data)`, both storing `{ data, updatedAt: number }` as JSON in `AsyncStorage`. Screens call the normal `apiGet` first; on `!ok && status === 0` (the network-failure shape `apiFetch` already returns), fall back to `getCached()` and render with a "Dernière mise à jour : {relative/absolute time}" banner instead of the generic error state. On success, always call `setCached()` to keep the cache fresh for the next failure.
**When to use:** Only for the motos list (enriched) and devis list screens, per D-09's explicit scope — not Fiche Moto detail, réclamations, or garages.
**Example:**
```typescript
// lib/cache.ts — mirrors lib/session.ts's pure/testable style (no React inside)
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T> { data: T; updatedAt: number; }

export async function setCached<T>(key: string, data: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify({ data, updatedAt: Date.now() } as CacheEntry<T>));
}

export async function getCached<T>(key: string): Promise<CacheEntry<T> | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as CacheEntry<T>; } catch { return null; }
}

// screen usage
const { ok, data, status } = await apiGet('/motos', token);
if (ok) {
  const enriched = await enrichMotos(data.motos, token);
  await setCached('mk_cache_motos', enriched);
  setMotos(enriched);
} else if (status === 0) {
  const cached = await getCached<Moto[]>('mk_cache_motos');
  if (cached) { setMotos(cached.data); setStaleSince(cached.updatedAt); }
  else { setError(errMsg(data)); }
} else {
  setError(errMsg(data)); // real server error (401/403/500) — don't silently show stale data
}
```
Note the `status === 0` check specifically (not just `!ok`) — this distinguishes "network unreachable" (fall back to cache) from "server responded with an error" (401/403/500 — show the real error, don't paper over an auth problem with stale cache data).

### Anti-Patterns to Avoid

- **Treating `!ok` as the offline signal:** Use `status === 0` specifically. A 401 (expired session) or 403 (RBAC) is `!ok` too, but showing stale cached data instead of the real auth error would hide a session-expiry bug from the user.
- **Fetching `/motos/:id/entretien/alertes` and treating a 403 as an error toast:** Port the web client's `alRes.ok ? [...] : null` pattern — a 403 there means "section not accessible for CLIENT", not "something went wrong." See Pitfall 1.
- **Building a generic offline sync engine:** D-09 explicitly narrows cache scope to 2 keys, read-only. Don't build a reusable multi-entity cache abstraction beyond what's needed — Out of Scope table explicitly excludes full offline write-sync.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Tab bar + per-tab stack navigation | Custom `View`-based tab switcher (the web client's own `switchClientTab()` pattern) | `Tabs` + nested `Stack` from `expo-router` | Native gesture handling, back-button behavior, and deep-link support come for free; hand-rolling would regress accessibility and platform conventions the web client didn't need to worry about |
| Pull-to-refresh | Custom scroll-position/gesture tracking | `RefreshControl` prop on `FlatList`/`ScrollView` (RN core) | Standard, zero-dependency, exactly matches user expectations on both platforms |
| List rendering for motos/devis/interventions | Custom windowing/pagination | `FlatList` (RN core) | Built-in virtualization is more than sufficient at this data scale; no need for `FlashList` |
| Confirm dialogs (accept/refuse devis, matching web's `confirm()`) | Custom modal component | `Alert.alert(title, msg, [{text:'Annuler'}, {text:'Confirmer', onPress}])` (RN core) | Native OS-styled confirm dialog, zero dependency, faithful port of the web client's `confirm()` semantics |
| Revoke-garage modal (has custom copy + optional text input, can't be a plain `Alert.alert`) | Fully custom modal from scratch | RN core `Modal` component (already the pattern implied by `components/Toast.tsx`'s absolute-positioned overlay style) + `TextField` for the motif input | Matches the web client's actual `revokeModalOverlay` structure (title + legal notice + optional input + 2 buttons) which `Alert.alert` cannot express (no free-text input) |

**Key insight:** Every piece of new UI infrastructure this phase needs (tabs, stacks, pull-to-refresh, confirm dialogs, lists) is covered by `expo-router` + React Native core. The only genuinely custom code is the ~20-line `lib/cache.ts` module and the revoke-garage `Modal`.

## Common Pitfalls

### Pitfall 1: `/motos/:id/entretien/alertes` is not CLIENT-accessible server-side (contradicts phase's stated backend grounding for this one endpoint)

**What goes wrong:** If the Fiche Moto screen calls `GET /motos/:id/entretien/alertes` with a CLIENT bearer token and treats any non-2xx response as a generic error (toast, "impossible de charger"), the plan d'entretien section will always show an error instead of gracefully disappearing — even though this is expected, permanent behavior, not a transient bug.
**Why it happens:** `motokey-api.js:1004` gates this route with `rbac.requireRole(ctx, 'MECANO')`. Per `auth/rbac.js`'s hierarchy (`CLIENT: 1, MECANO: 2, PRO: 3, CONCESSION: 4, ADMIN: 5`), `requireRole(ctx, 'MECANO')` requires level ≥ 2 — CLIENT (level 1) fails this check and gets a 403. There is no CLIENT-specific branch in this handler (unlike `/motos/:id/interventions`, which does have one at line 881). `GET /motos/:id/entretien` (the full plan, not just alerts) has the identical gate.
**How to avoid:** Port `MotoKey_Client.html:722-724`'s exact defensive pattern: `alRes.ok ? (parse alertes array) : null`, and when `alertes === null`, don't render the "Plan d'entretien" section at all (not an error state, not an empty state — just omit the section), exactly matching the web client's own comment: `// null = non accessible (403 RBAC) → section masquée`.
**Warning signs:** A human tester will never see the "Plan d'entretien" section appear for a CLIENT-role account during manual verification, even with the correct code — this is expected given current backend RBAC, not a regression to chase. If MPARITY-03/D-07's "plan d'entretien" success criterion needs to actually render content for real client users, that requires a backend RBAC change (adding a CLIENT branch to these two routes) — which is explicitly out of this phase's zero-backend-changes scope. Flag this to the user if full plan d'entretien visibility is a hard requirement (see Open Questions).

### Pitfall 2: `@expo/vector-icons` does not resolve from `mobile-app`'s own module tree

**What goes wrong:** `import { Ionicons } from '@expo/vector-icons'` from any file under `mobile-app/app/` or `mobile-app/components/` will fail to resolve (Metro/Node module resolution walks up from the importing file's own `node_modules` chain; `@expo/vector-icons` is not there).
**Why it happens:** `@expo/vector-icons@^15.0.3` is a dependency of the top-level `expo` package (confirmed via `expo/package.json`), and is physically installed at `mobile-app/node_modules/expo/node_modules/@expo/vector-icons` — not hoisted to `mobile-app/node_modules/@expo/vector-icons`. Verified directly: `node -e "require.resolve('@expo/vector-icons/package.json')"` from `mobile-app/` throws `MODULE_NOT_FOUND`.
**How to avoid:** Either (a) add `@expo/vector-icons` explicitly to `mobile-app/package.json` dependencies (`npm install @expo/vector-icons@^15.0.3`), or (b) use the emoji-icon pattern (Architecture Pattern 2 above) which needs no new dependency and matches the web client's own precedent exactly.
**Warning signs:** A Metro bundler error at dev-server start (`Unable to resolve module @expo/vector-icons`) the first time any screen imports from it, if not resolved beforehand.

### Pitfall 3: Confusing "network unreachable" with "server returned an error" when deciding to show cached data

**What goes wrong:** If the cache-fallback check is `if (!ok)` instead of `if (status === 0)`, an expired/invalid session (401) or an RBAC mismatch (403) will silently render stale cached data with a "dernière mise à jour" banner instead of surfacing the real problem — masking a bug the user needs to see (e.g., "reconnectez-vous").
**Why it happens:** `apiFetch`'s catch block (genuine network failure — timeout, DNS, server down) returns `status: 0`; a real HTTP error response (401/403/500) returns the actual status code, both with `ok: false`. These are semantically different failure modes.
**How to avoid:** Gate the cache fallback specifically on `status === 0`, matching D-08's own framing ("apiFetch's catch block already returns a network-failure shape").
**Warning signs:** Manual testing shows stale moto/devis data displayed after deliberately expiring a session, instead of the expected "Session expirée" toast/redirect.

### Pitfall 4: Root layout's post-login redirect target needs updating

**What goes wrong:** `app/_layout.tsx`'s `RootNav` currently does `router.replace('/(app)/home')` on successful auth. If `home.tsx` is deleted/moved without updating this redirect, users will hit a 404/blank screen immediately after login.
**Why it happens:** This redirect target is hardcoded as a literal path string, not derived from route structure.
**How to avoid:** Update `router.replace('/(app)/home')` to the new default tab route (e.g. `/(app)/(tabs)/motos`) as part of the restructuring task, and grep the codebase for any other `'/(app)/home'` string literals (e.g. tests) before considering the task done.
**Warning signs:** App hangs on a blank screen or throws a route-not-found error immediately after login/register/reset-flow completion during manual verification.

## Code Examples

Verified patterns directly against `motokey-api.js` (not training-data assumptions):

### Response Envelope Shape (applies to every endpoint in this phase)

```javascript
// Source: motokey-api.js:366-371 — confirmed shared response helpers
function ok(res, data, msg, status) {
  sendJSON(res, status||200, {success:true, message:msg||'OK', data:data, timestamp:nowISO()});
}
function fail(res, msg, status, code) {
  sendJSON(res, status||400, {success:false, error:{code:code||'ERROR', message:msg}, timestamp:nowISO()});
}
```
Every 2xx response body looks like `{ success: true, data: {...}, message, timestamp }`; the actual payload for list endpoints is nested one level under `data`, e.g. `data.motos`, `data.devis`, `data.reclamations`, `data.garages` (never a bare top-level array).

> **Correction (added during plan verification, 2026-07-03):** the sentence originally here — "screens should read `res.data.motos` etc." — is **incorrect** and was caught by the plan checker before execution. `apiFetch` (`mobile-app/lib/api.ts:15-43`) sets `data = await res.json()` and returns `{ ok, status, data }`, so `res.data` **is the entire envelope** `{ success, data:{motos:...}, message, timestamp }`, not the inner payload. Reaching the actual array requires going **two** levels deep: `res.data.data.motos`. A one-level read (`res.data.motos`) is `undefined`. This is also why `MotoKey_Client.html`'s `data.motos || data.data || []` fallback chain is not a valid pattern to copy verbatim into the mobile client — that web client unwraps the envelope earlier in its own fetch wrapper, so its `data` variable at that point is already the inner payload; the mobile `apiFetch` does not do this pre-unwrap. Phase 15's `15-01-PLAN.md`/`15-02-PLAN.md` parse functions (`parseMotosList`, `parseInterventions`, `parseAlertes`, `parseDevisList`, `parseLimite`, `parseReclamations`, `parseGarages`) were corrected to check `data?.data?.<key>` first. **Future phases planning against this RESEARCH.md must use the two-level path, not the one-level guidance above.**

### Moto Score/Couleur Mapping (MPARITY-01)

```javascript
// Source: motokey-api.js:309-310 — couleur_dossier values are French words, not the theme's short keys
function couleur(score) {
  return score>=80?'vert':score>=60?'bleu':score>=40?'jaune':'rouge';
}
```
```typescript
// Mobile mapping needed — theme/colors.ts uses gn/bl/yw/rd, backend returns vert/bleu/jaune/rouge
const COULEUR_MAP: Record<string, string> = { vert: colors.gn, bleu: colors.bl, jaune: colors.yw, rouge: colors.rd };
```

### Devis Statut Labels/Colors (MPARITY-02, exact port)

```javascript
// Source: MotoKey_Client.html:943-944
const STATUT_LABEL = { envoye: 'À valider', valide: 'Validé', refuse: 'Refusé', brouillon: 'Brouillon' };
const STATUT_COLOR = { envoye: 'var(--or)', valide: 'var(--gn)', refuse: 'var(--rd)', brouillon: 'var(--tx3)' };
```
Note: `brouillon` devis are already server-filtered out for CLIENT role (`motokey-api.js:1114`: `.neq('statut', 'brouillon')`), so the mobile UI will never actually need to render the "Brouillon" label for a CLIENT — the label/color entries exist for completeness/parity but the brouillon case is dead code path client-side, same as in the web client.

### Garage Revoke — Response Check Uses `success`, Not Just HTTP Status

```javascript
// Source: motokey-api.js:1687-1715 (DELETE /client/garages/:id)
// Success: return ok(res, { liaison: updated }, 'Garage quitté — votre historique reste conservé (obligations légales)');
// Already-revoked case returns 409 (not 200): fail(res, 'Liaison déjà révoquée', 409, 'ALREADY_REVOKED')
```
`apiFetch`'s `ok: res.ok` (HTTP-status-based) is consistent with the `success` field here since `fail()` always sets a non-2xx status — no need to separately check `data.success` when using the shared `apiFetch` helper (the web client's raw `fetch()` + `j.success` check in `submitRevoke()` is equivalent, just written before the `apiFetch` helper existed for this call site).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Expo Router "Native Tabs" (`expo-router/unstable-native-tabs`) considered as an alternative | Classic `Tabs` from `'expo-router'` (React Navigation Bottom Tabs under the hood) | Native Tabs remains explicitly unstable/experimental as of SDK 54 docs | Use classic `Tabs` — stable, documented, matches this project's existing use of classic `Stack` in `app/_layout.tsx` and `app/(app)/_layout.tsx` |

**Deprecated/outdated:** Nothing else in this phase's scope has shifted from what training data would suggest — `expo-router@6.0.24`'s `Tabs`/`Stack`/nesting API matches documented SDK 54 behavior with no surprises found.

## Open Questions

1. **Should MPARITY-03/D-07's "plan d'entretien" section be visible for real CLIENT users, or is web-parity (i.e., permanently hidden for CLIENT due to backend RBAC) acceptable?**
   - What we know: The backend gates `/motos/:id/entretien` and `/motos/:id/entretien/alertes` at `MECANO` minimum; there is no CLIENT branch. The web reference implementation already handles this by hiding the section on 403.
   - What's unclear: Whether the phase's Success Criteria #3 ("L'utilisateur consulte l'historique d'entretien/interventions") is fully satisfied by interventions-only (which IS CLIENT-accessible), or whether stakeholders expect the plan d'entretien/alertes sub-feature to actually render data for CLIENT users.
   - Recommendation: Plan for parity with the web client (defensive 403-hides-section, per Pitfall 1) since this phase is explicitly zero-backend-changes. If real plan-d'entretien visibility for clients turns out to be a hard requirement, that's a backend RBAC change (add a CLIENT branch mirroring the `/interventions` endpoint's pattern) and belongs in a follow-up phase or an explicit scope amendment — flag to Mehdi rather than silently descoping or silently adding backend code in a phase declared zero-backend-changes.

2. **Devis detail: inline expansion (as the web client does, all data already comes back in the list response) or a separate stack push?**
   - What we know: `GET /devis` already returns full `devis_lignes`/`lignes` nested in each list item (`motokey-api.js`'s `Devis.list` / RAM fallback both include lines) — no separate detail-fetch endpoint is used by the web client.
   - What's unclear: Whether the planner wants a flat `devis/index.tsx` with inline accept/refuse per card (matching D-04's stated departure only applies to motos, not stated for devis) or a nested stack like motos.
   - Recommendation: Given D-04 only calls out the motos list as "a deliberate departure," and devis list items are self-contained (no extra fetch needed for detail), a flat list with inline expand/accept/refuse (closest 1:1 port of `loadClientDevis()`) is simplest and avoids an unnecessary nested stack for `devis/`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| expo-router `Tabs` | D-03 tab bar | ✓ | 6.0.24 (installed) | — |
| @react-native-async-storage/async-storage | MPARITY-05 cache | ✓ | 2.2.0 (installed) | — |
| react-native FlatList/RefreshControl/Alert/Modal | Lists, pull-to-refresh, confirm dialogs, revoke modal | ✓ | 0.81.5 (installed) | — |
| @expo/vector-icons | Tab bar icons (Claude's Discretion) | ✗ (present only nested inside `expo/node_modules`, not resolvable from app code — verified via `require.resolve` failure) | ^15.0.3 (as a sub-dependency of `expo`) | Emoji-as-icon (Architecture Pattern 2) — zero-dependency, matches web client precedent |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `@expo/vector-icons` — fallback is emoji icons (recommended, avoids adding a dependency) or explicit `npm install @expo/vector-icons@^15.0.3` if crisper icons are wanted.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 via `jest-expo@~54.0.17` preset |
| Config file | `mobile-app/package.json` (`"jest"` key) |
| Quick run command | `cd mobile-app && npx jest lib/__tests__/cache.test.ts` (once created) |
| Full suite command | `cd mobile-app && npm test` |

Established pattern (per `lib/__tests__/api.test.ts`, `session.test.ts`, `secureStore.test.ts`): pure-function unit tests for `lib/*.ts` modules, no component-rendering tests exist yet in this project. Follow the same style for `lib/cache.ts` — no new testing library needed.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MPARITY-01 | `couleur_dossier` → theme color mapping is correct for all 4 values | unit | `npx jest lib/__tests__/couleur.test.ts -x` (or co-located with a small `lib/moto.ts` helper module) | ❌ Wave 0 |
| MPARITY-02 | Devis statut label/color lookup returns correct values for `envoye/valide/refuse/brouillon` and falls back sanely for unknown statuts | unit | `npx jest lib/__tests__/devis.test.ts -x` | ❌ Wave 0 |
| MPARITY-03 | Interventions fetch success path parses `data.interventions` array correctly; alertes 403 → `null` (section hidden), not error | unit | `npx jest lib/__tests__/ficheMoto.test.ts -x` (test the parsing helper functions in isolation, not full screen render) | ❌ Wave 0 |
| MPARITY-04 | Add-moto/claim/reclamations/garages payload shaping and plan-limit CTA branch logic | unit | `npx jest lib/__tests__/garageLiaison.test.ts -x` | ❌ Wave 0 |
| MPARITY-05 | `getCached`/`setCached` round-trip; fallback triggers only on `status === 0`, not on other `!ok` statuses | unit | `npx jest lib/__tests__/cache.test.ts -x` | ❌ Wave 0 |

Screen-level (component render / navigation) behavior is manual-only for this phase, consistent with this project having no RN component-testing library (`@testing-library/react-native`) installed and no prior precedent for it in Phase 14. Recommend keeping automated coverage at the pure-logic-module level (parsing, mapping, cache) and relying on the existing human-verification checkpoint pattern (as used for Phase 14's MAUTH criteria) for full-screen/navigation flows.

### Sampling Rate

- **Per task commit:** `npx jest lib/__tests__/<touched-module>.test.ts`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`, plus a human-verification pass covering the 5 success criteria on a real device (per this project's established Phase 14 pattern)

### Wave 0 Gaps

- [ ] `lib/cache.ts` + `lib/__tests__/cache.test.ts` — covers MPARITY-05 (net-new module, no existing file)
- [ ] A small pure-logic module for moto couleur mapping and devis statut labels (e.g. `lib/motoDisplay.ts`, `lib/devisDisplay.ts`) so these lookups are unit-testable independent of screen rendering — covers MPARITY-01/MPARITY-02
- [ ] No new test framework/config needed — `jest-expo` preset already covers this file layout

## Sources

### Primary (HIGH confidence)
- `motokey-api.js` (read directly) — all endpoint RBAC gates, response envelope shapes (`ok()`/`fail()`/`sendJSON()`), route registrations for `/motos`, `/motos/:id/interventions`, `/motos/:id/entretien`, `/motos/:id/entretien/alertes`, `/devis`, `/devis/:id/valider`, `/devis/:id/refuser`, `/client/limite-motos`, `/client/motos`, `/client/reclamations`, `/client/garages`
- `auth/rbac.js` (read directly) — `ROLE_HIERARCHY` (`CLIENT:1 < MECANO:2 < PRO:3 < CONCESSION:4 < ADMIN:5`), `requireRole`/`requireAnyRole` implementations
- `MotoKey_Client.html` (read directly, lines 355-380, 596-729, 943-1021, 1127-1296) — reference implementation for all five screens
- `mobile-app/package.json`, `mobile-app/lib/{api,session,secureStore,types}.ts`, `mobile-app/context/AuthContext.tsx`, `mobile-app/hooks/useAuth.ts`, `mobile-app/theme/colors.ts`, `mobile-app/components/{Button,TextField,Toast}.tsx`, `mobile-app/app/_layout.tsx`, `mobile-app/app/(app)/{_layout,home}.tsx` (all read directly) — established Phase 14 code to reuse
- `schema.sql` (grep-confirmed) — `pneu_av`/`pneu_ar` are real columns on `motos`
- Direct `node -e "require.resolve(...)"` test against `mobile-app/node_modules` — confirmed `@expo/vector-icons` does not resolve from app code today

### Secondary (MEDIUM confidence)
- https://docs.expo.dev/router/advanced/tabs/ — Classic `Tabs` vs Native Tabs guidance (WebFetch, current SDK 54 docs)
- https://docs.expo.dev/router/basics/common-navigation-patterns/ — Tabs-with-nested-Stack file structure pattern (WebFetch)
- https://docs.expo.dev/router/advanced/nesting-navigators/ — Nested navigator mechanics (WebFetch)
- https://docs.expo.dev/guides/using-hermes/ — Hermes Intl/`toLocaleDateString('fr-FR', ...)` support confirmed available on all platforms when using Hermes (WebSearch, cross-referenced against Expo's own Hermes guide)

### Tertiary (LOW confidence)
- None used as the basis for any prescriptive recommendation in this document.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new production dependencies, all verified installed via direct `package.json`/`node_modules` inspection
- Architecture: HIGH — Tabs+Stack nesting pattern confirmed against current official Expo Router docs, consistent with project's existing `Stack`-only usage
- Backend contract (endpoint RBAC + response shapes): HIGH — read directly from `motokey-api.js`/`auth/rbac.js` source, not assumed
- Pitfalls: HIGH for Pitfall 1 (RBAC gap) and Pitfall 2 (vector-icons resolution) — both directly verified against source/tooling, not inferred

**Research date:** 2026-07-03
**Valid until:** 30 days (stable stack; re-verify if `motokey-api.js` RBAC or `expo-router` version changes before planning is acted on)
