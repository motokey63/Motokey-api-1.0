# Phase 16: Push Wiring End-to-End - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 16 wires the push infrastructure already built in Phases 12 (device-token endpoints) and 13 (`services/pushService.js`) into real, user-facing triggers: a one-time soft-ask permission screen (MPUSH-01), device-token registration/deregistration tied to login/logout (MPUSH-02, end-to-end), a real push notification fired when a garage sends a devis to a client (MPUSH-03), and tapping that notification deep-linking to the devis screen (MPUSH-05). Explicitly NOT in scope: maintenance-threshold push (MPUSH-04 — Phase 17), app store submission (Phase 17), granular per-notification-type preference center (out of scope per REQUIREMENTS.md).

A load-bearing discovery from this session: no existing action moves a devis from `brouillon` to `envoye` in the current product (`app.html`'s devis UI only has "Créer le devis" → `POST /devis`, which always creates `brouillon`; `GET /devis` filters `brouillon` out for CLIENT). This phase therefore also adds the missing "Envoyer au client" action as the concrete trigger point for MPUSH-03 — this is not scope creep, it's the prerequisite event the push requirement needs to fire on.

</domain>

<decisions>
## Implementation Decisions

### Devis push trigger (MPUSH-03)
- **D-01:** Add a new "Envoyer au client" action (backend endpoint, garage-facing) that transitions a devis `brouillon` → `envoye`. This transition is the exact moment `sendPush()` fires. Without this action, MPUSH-03 has no real event to hook into — no existing code path performs this transition today.
- **D-02:** The button lives per-row in `app.html`'s existing devis list (not a confirmation modal right after creation) — garage reviews a drafted devis, then sends whenever ready.
- **D-03:** Once a devis is `envoye`, it is locked — `PUT /devis/:id` (line/entête edits) must be rejected for non-`brouillon` devis. To change a sent devis, the garage creates a new one. This avoids the client seeing a quote silently change under them without a fresh notification.

### Soft-ask permission screen (MPUSH-01)
- **D-04:** Shown exactly once, right after the user's first login — not on every app launch, not gated behind a first meaningful in-app action.
- **D-05:** Full-screen, dedicated screen (not a modal/bottom-sheet), MotoKey-branded (reuse Phase 14's palette — orange accent, `mobile-app/theme/colors.ts`), explaining push value before the OS system permission prompt appears.
- **D-06:** If the user declines, it is not final — a "Activer les notifications" entry point exists in the Compte tab (built in Phase 15) that re-triggers the soft-ask + OS prompt flow later.

### Device token lifecycle (MPUSH-02, end-to-end)
- **D-07:** Call `POST /client/device-tokens` immediately after the soft-ask is accepted AND the OS grants permission (not unconditionally on every login) — one clear moment tied directly to the permission flow (D-04/D-05).
- **D-08:** If the OS grants permission but the registration call fails (network/500/etc.), fail silently — no user-facing error, since this is best-effort infrastructure the user can't act on — and retry silently on the next app foreground until it succeeds.
- **D-09:** On logout, always call `DELETE /client/device-tokens` for the current device's token. Matches Phase 12 D-03 (removes only the specific token supplied, not all of a client's devices) — logging out on this device stops push here without silencing push on the client's other logged-in devices.

### Claude's Discretion
- **Deep link / tap-to-navigate behavior (MPUSH-05)** — not discussed in depth (user did not select this area). Default: a notification-response listener navigates to the Devis tab (`mobile-app/app/(app)/(tabs)/devis/index.tsx`) via `expo-router`, reusing the Phase 15 tab/stack shell. Cold-start vs backgrounded vs foregrounded handling and exact foreground notification presentation (system banner vs relying on the Devis tab's existing `useFocusEffect` silent refetch from 15-09) are left to the planner/executor to resolve sensibly — revisit if the resulting behavior feels wrong on-device.
- **Exact endpoint shape for "envoyer au client"** (e.g. dedicated `POST /devis/:id/envoyer` vs. extending `PUT /devis/:id` with a status field) — no user preference expressed. Recommend a dedicated endpoint for clarity, especially since D-03's lock-on-send changes what `PUT` is allowed to do post-send.
- **RBAC level for the envoyer action** — no user preference expressed. Recommend matching the existing devis endpoints' `requireRole(ctx, 'MECANO')` minimum (same as `POST`/`PUT /devis` today) unless the planner finds a concrete reason to require stricter PRO+ gating for this client-facing commitment action.
- **`expo-notifications` integration details** (permission API call sequence, listener setup file location) — implementation detail for research/planner. Note: `expo-notifications` is NOT yet a `package.json` dependency in `mobile-app` — will need adding (check SDK 54-compatible version).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` — Phase 16 section ("Push Wiring End-to-End") — 4 success criteria, depends on Phases 12/13/14
- `.planning/REQUIREMENTS.md` — MPUSH-01, MPUSH-02, MPUSH-03, MPUSH-05 acceptance criteria; Out of Scope table (no granular notification preference center)

### Prior phase context (push infra already built)
- `.planning/phases/12-backend-push-foundation/12-CONTEXT.md` — D-01 (multi-device tokens), D-02 (upsert-reassign on token conflict), D-03 (`DELETE` removes only the supplied token, not all of a client's devices — directly informs D-09 above)
- `.planning/phases/13-push-dispatch-service/13-CONTEXT.md` — D-01–D-05 (`sendPush`/`sendToToken` signature, `PUSH_ENABLED` fallback convention); Deferred Ideas notes proactive dead-token deactivation was punted to "Phase 16" — still open, not picked up in this discussion, flag for planner to decide if in scope here or push further to Phase 17
- `.planning/phases/14-rn-app-scaffolding-native-auth/14-CONTEXT.md` — D-06 (brand palette source), established `AuthContext`/session patterns
- `.planning/phases/15-feature-parity-screens/15-CONTEXT.md` — D-03/D-04/D-05 (3-tab bottom bar, Motos stack, Compte tab location — D-06 entry point for retriggering soft-ask lives here)
- `.planning/phases/15-feature-parity-screens/15-09-PLAN.md`, `15-09-SUMMARY.md` — `useFocusEffect` silent-refetch pattern already on the Devis tab, relevant to the foreground-push-arrival discretion note above

### Backend code (devis lifecycle — the trigger-point discovery)
- `motokey-api.js` lines 1099-1168 — `GET /devis` (CLIENT branch: `.neq('statut', 'brouillon')` — confirms clients never see drafts), `POST /devis` (always creates `statut: 'brouillon'`)
- `motokey-api.js` lines 1220-1240 — `PUT /devis/:id` (currently only touches `entete`/`lignes`, no statut transition — D-03 requires this to reject edits once `envoye`)
- `motokey-api.js` lines 1242-1360 — `POST /devis/:id/valider`, `POST /devis/:id/refuser` (both hard-require `statut === 'envoye'` — confirms `envoye` is a real, load-bearing status with no current way to reach it)
- `supabase.js` lines 469-520 — `Devis.create` (`statut: 'brouillon'` default), `Devis.update` (spreads `payload.entete` directly into a generic `update()` helper — do not repurpose this implicit path for the new envoyer transition; use a dedicated method)
- `services/pushService.js` — `sendPush(clientId, {title, body, data}, idempotencyKey)` / `sendToToken(...)` — ready to call as-is, no changes needed for the send call itself
- `app.html` lines ~1185-1245 (`loadDevis`, `saveDevis`, `renderDevisLines`) — existing devis creation UI; the new per-row "Envoyer au client" button (D-02) attaches here

### Project constraints
- `.planning/PROJECT.md` — Constraints section: `requireRole()` mandatory on new sensitive endpoints; direct-edit-only rule for `motokey-api.js`/`app.html` (no PowerShell/sed edits)
- `.planning/STATE.md` — Pending Todos: SC-1 (real device push delivery, open since Phase 13) — Phase 16 wiring a real trigger naturally closes this out; no separate action needed beyond building the trigger for real

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/pushService.js` `sendPush`/`sendToToken` — fully built in Phase 13, callable as-is from wherever the new envoyer endpoint lands
- `mobile-app/context/AuthContext.tsx` `login()`/`logout()` — natural hook points for device-token register (D-07) / unregister (D-09)
- `mobile-app/theme/colors.ts` — brand palette for the full-screen soft-ask (D-05)
- `expo-device` — already an installed dependency (useful for device-info context passed to registration)

### Established Patterns
- `/client/*` CLIENT-facing endpoints: `rbac.extractRoleFromRequest` → `rbac.requireAnyRole(ctx, ['CLIENT'])` (established in Phase 12, reuse if any new CLIENT endpoint is needed)
- Devis endpoints (`POST`/`PUT /devis`): `rbac.requireRole(ctx, 'MECANO')` minimum — the new envoyer endpoint should match unless planner decides otherwise (see Claude's Discretion)
- `PUSH_ENABLED`/`EMAIL_ENABLED` fallback-flag convention already established — no new pattern needed here

### Integration Points
- `motokey-api.js` ~1144-1240 region — natural location for the new "envoyer" endpoint, near existing devis routes
- `app.html` devis list rendering (~1185-1245) — new per-row button
- `mobile-app/app/(app)/(tabs)/devis/index.tsx` (built in 15-06, patched in 15-09) — deep-link target for MPUSH-05, already has focus-based silent refetch
- `mobile-app/app/(app)/(tabs)/compte.tsx` (skeleton from 15-03) — new "Activer les notifications" entry point (D-06)
- `mobile-app/package.json` — add `expo-notifications` dependency (not yet present)

</code_context>

<specifics>
## Specific Ideas

- Soft-ask copy should explain push value covering both notification types the requirements describe (devis reçu now, rappel entretien landing in Phase 17) even though only devis-received ships this phase — it's a one-time ask, framing it narrowly would mean asking again later.
- "Envoyer au client" button: per-row on the existing devis list in `app.html`, not a post-creation modal.

</specifics>

<deferred>
## Deferred Ideas

- Exact deep-link/tap navigation behavior across cold-start/background/foreground app states (MPUSH-05 mechanics) — left to Claude's Discretion above, not a locked decision; revisit if on-device behavior feels wrong.
- Proactive deactivation of dead/invalid push tokens on `DeviceNotRegistered` receipts — originally punted from Phase 13 to "Phase 16", not resolved in this discussion; planner should decide whether it's in scope here or pushes further to Phase 17.
- Rappel entretien push (MPUSH-04) and its cron trigger — unchanged, ships in Phase 17.
- Granular per-notification-type preference center — explicitly out of scope per REQUIREMENTS.md.

</deferred>

---

*Phase: 16-push-wiring-end-to-end*
*Context gathered: 2026-07-04*
