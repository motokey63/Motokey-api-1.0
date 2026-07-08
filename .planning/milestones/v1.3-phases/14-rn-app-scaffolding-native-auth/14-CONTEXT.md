# Phase 14: RN App Scaffolding + Native Auth - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 14 delivers the React Native app scaffold (`/mobile-app`, Expo managed workflow, Expo Router, TypeScript) plus native email/password authentication: register, mandatory OTP email verification, login, password reset (OTP), logout, encrypted session storage (`expo-secure-store` + `LargeSecureStore` pattern), and proactive token refresh on app foreground. It reuses the existing Supabase Auth-backed `/auth/client/*` endpoints as-is — zero backend changes. Explicitly NOT in scope: feature-parity screens (motos/devis/historique/liaison — Phase 15), push notifications (Phase 16-17), app store submission (Phase 17).

</domain>

<decisions>
## Implementation Decisions

### Auth Screen Flow & Copy
- **D-01:** Mirror `MotoKey_Client.html`'s register flow exactly: signup → immediate, mandatory OTP verification screen (blocking — no skip-for-now state) → login. Reuse a single shared OTP component (8-digit code input, matching the web client's `.otp-input` style) for both register-verification and password-reset-confirm flows, mirroring the web client's `verifyMode: 'register' | 'reset'` pattern.
- **D-02:** "Mot de passe oublié" is a text link placed below the password field on the login screen (not a separate prominent CTA).
- **D-03:** Reuse the web client's exact French copy for all auth error/status messages verbatim (e.g. `"Session expirée — reconnectez-vous"`) rather than writing new mobile-specific copy — for consistency and because the copy is already production-validated.
- **D-04:** Password reset uses the same shared OTP component as register-verification (not a distinct screen/component).

### Post-Login & Visual Baseline
- **D-05:** After successful login, show a minimal placeholder Home screen (e.g. "Bienvenue {email}" + logout button) that proves the session/token flow works end-to-end. Phase 15 replaces this with real feature screens — do not build placeholder feature content beyond this.
- **D-06:** Auth screens adopt MotoKey branding now (not deferred to a later design pass): orange accent (`#ff6b00` / `#ff8c33`), Inter font, "Moto*Key*" logo lockup (orange italic "Key") — reuse `MotoKey_Client.html`'s CSS custom properties as the palette source (see code_context below).
- **D-07:** No dedicated `/gsd:ui-phase` UI-SPEC design contract for this phase. Auth screens are simple/standard forms (text inputs, buttons, links) — low visual risk. The brand-adoption decision (D-06) is sufficient guidance for the planner.

### Session Lifecycle
- **D-08:** If the refresh token itself is invalid/expired (hard expiry — no automatic recovery possible, e.g. app reopened after weeks away): clear stored tokens, redirect to the login screen, and show `"Session expirée — reconnectez-vous"` (exact web client message) once.
- **D-09:** Concurrent API calls that occur during an in-flight token refresh must queue behind that single refresh call rather than firing N parallel refresh calls — required because Supabase refresh tokens are one-time-use/rotating, and a race between parallel refreshes can invalidate the session (per research Pitfall 4).

### Claude's Discretion
- **`x-client-type` header value:** send nothing (letting the backend's existing non-`'web'` branch handle it, per research §3/Pitfall 3) vs. sending an explicit `x-client-type: mobile` for future analytics/differentiation. Both are functionally equivalent per research — default to omitting the header unless the planner finds a concrete reason to prefer an explicit value. User did not select this as a discussion area.
- **State management:** React Context for the auth session (per `STACK.md`) — only introduce Zustand if Context becomes unwieldy across screens.
- **TypeScript:** use Expo's default TypeScript template (per `STACK.md`) — not plain JS.
- **Exact package versions:** verify current Expo SDK / library patch versions with `npx expo install --check` at implementation time (research flagged versions as MEDIUM confidence since Expo ships fast).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Mobile stack & architecture (milestone-level research)
- `.planning/research/STACK.md` — Expo SDK/version choices, required libraries (`expo-secure-store`, `aes-js`, `react-native-get-random-values`, `react-native-url-polyfill`, `@supabase/supabase-js`), installation commands, what NOT to use
- `.planning/research/ARCHITECTURE.md` §1 (auth endpoint contract), §3 (auth token flow — mobile transfers cleanly, no backend changes), §5 (suggested build order — RN scaffolding + auth is step 3)
- `.planning/research/PITFALLS.md` Pitfalls 1-4 (direct-Supabase-access anti-pattern, AsyncStorage vs SecureStore, `x-client-type` branch, proactive refresh) — these are the exact pitfalls this phase must avoid

### Existing web client (reference implementation to port)
- `MotoKey_Client.html` — source of truth for: exact `/auth/client/*` endpoint contracts, `extractTokens(data)` token-extraction logic, `silentRefresh()`/`startRefreshTimer()` refresh pattern (refresh when <5min left, poll every 60s), shared OTP verify screen (`verifyMode` register|reset), exact French error copy, CSS custom properties for brand palette (lines ~15-23: `--acc:#ff6b00`, `--acc2:#ff8c33`, status colors)

### Project constraints
- `.planning/PROJECT.md` — Constraints section: mobile app lives in new `/mobile-app` directory, same repo, consumes existing API over HTTP, introduces no backend/web changes
- `.planning/REQUIREMENTS.md` — MAUTH-01/02/03 acceptance criteria (Auth Mobile section)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MotoKey_Client.html` `extractTokens(data)` — token extraction logic to port 1:1 into the RN auth module
- `MotoKey_Client.html` `silentRefresh()` / `startRefreshTimer()` — proactive refresh pattern (decode JWT `exp`, refresh when <5min remain, poll every 60s) — ports directly to RN, just swap the storage backend and add an `AppState` foreground listener
- `MotoKey_Client.html` CSS custom properties (`:root` block, lines ~15-23) — brand palette source for D-06: `--acc:#ff6b00`, `--acc2:#ff8c33`, `--accbg:#fff4ee`, plus status colors `--gn`/`--bl`/`--yw`/`--rd`
- `MotoKey_Client.html` OTP screen markup/CSS (`.otp-input`, 8-digit code, `verifyMode` state) — shared component pattern to replicate in RN (D-01, D-04)

### Established Patterns
- Backend already branches on `x-client-type: web` vs anything-else for refresh-token delivery (cookie vs JSON body) — mobile simply doesn't send `web` (see Claude's Discretion above)
- Password reset uses the OTP-code flow (`password-reset/confirm` with `{email, code, new_password}`), not the link-based flow — this is what `MotoKey_Client.html` actually exercises end-to-end; mobile should replicate the OTP flow, not build new deep-link handling for the link variant

### Integration Points
- `/auth/client/register`, `/auth/client/verify-email`, `/auth/client/login`, `/auth/client/refresh`, `/auth/client/logout`, `/auth/client/password-reset`, `/auth/client/password-reset/confirm` — all confirmed mobile-ready as-is (ARCHITECTURE.md §1.1), zero backend changes needed for this phase
- Session storage: `expo-secure-store` for a small AES-256 key + `AsyncStorage` for the encrypted session blob (official Supabase `LargeSecureStore` pattern) — required because the full session object exceeds SecureStore's ~2048-byte per-key limit

</code_context>

<specifics>
## Specific Ideas

- OTP input UI should match the web client's visual treatment: large, spaced, centered 8-digit code entry (`.otp-input`: font-size 24px, letter-spacing 8px, centered)
- Placeholder Home screen after login: "Bienvenue {email}" + a logout button — nothing more elaborate, this is a session-flow smoke test, not a real screen

</specifics>

<deferred>
## Deferred Ideas

- Device push-token registration at login/logout (`POST`/`DELETE /client/device-tokens`) — belongs to Phase 16 (Push Wiring End-to-End), not Phase 14
- Feature-parity screens (motos list, devis, historique, liaison garage) — Phase 15
- App store submission requirements (Privacy Manifest, Data Safety form) — Phase 17

None — discussion stayed within phase scope otherwise.

</deferred>

---

*Phase: 14-rn-app-scaffolding-native-auth*
*Context gathered: 2026-07-02*
