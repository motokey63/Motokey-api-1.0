---
phase: 14-rn-app-scaffolding-native-auth
plan: 02
subsystem: auth
tags: [react-native, expo, react-context, jwt, single-flight, appstate]

requires:
  - phase: 14-01
    provides: "lib/api.ts (apiPost/extractTokens/tokenSecsLeft/errMsg), lib/secureStore.ts (saveSession/loadSession/clearSession, LargeSecureStore), lib/types.ts (AuthSession), constants/config.ts (REFRESH_SKEW_SECS/NEAR_EXPIRY_SECS/REFRESH_POLL_MS)"
provides:
  - "lib/session.ts: createSessionRefresher(deps) — single-flight getValidAccessToken + refreshIfNeeded"
  - "context/AuthContext.tsx: AuthProvider + AuthContext — full session state, all six auth actions, cold-start restore, proactive refresh wiring"
  - "hooks/useAuth.ts: useAuth() consumer hook"
affects: [14-03-auth-screens, 15-feature-parity-screens]

tech-stack:
  added: []
  patterns:
    - "Single-flight refresh via closure-scoped `inFlight` promise guard — concurrent callers await the same in-flight refresh instead of firing parallel requests (protects Supabase's one-time-use/rotating refresh tokens)"
    - "sessionRef (useRef) kept in sync with session state so the pure session.ts refresher always reads the latest session without stale closures"
    - "Proactive refresh dual-wired: 60s setInterval poll + AppState 'active' foreground listener, both delegating to the same refreshIfNeeded()"

key-files:
  created:
    - mobile-app/lib/session.ts
    - mobile-app/lib/__tests__/session.test.ts
    - mobile-app/context/AuthContext.tsx
    - mobile-app/hooks/useAuth.ts
  modified: []

key-decisions:
  - "Toast system doesn't exist yet (arrives in 14-03) — hard-expiry notification uses Alert.alert as an interim fallback with a // TODO(14-03) comment, per plan's explicit fallback instruction"
  - "AuthContext.tsx doesn't wire AuthProvider into app/_layout.tsx — that integration is explicitly 14-03's Task 2 scope (ToastProvider + AuthProvider + routing guard)"

patterns-established:
  - "Auth actions port MotoKey_Client.html handlers verbatim (same endpoints, same request bodies, same branching logic) — future screens/actions should follow the same 1:1 porting discipline"

requirements-completed: [MAUTH-01, MAUTH-02, MAUTH-03]

duration: 15min
completed: 2026-07-02
---

# Phase 14 Plan 02: Auth Session Layer Summary

**Single-flight token refresh primitive (`lib/session.ts`) plus a React `AuthContext` wiring all six `/auth/client/*` actions, encrypted persistence, cold-start restore, and dual-path proactive refresh (60s timer + AppState foreground listener).**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-02T20:38:00Z (approx, following 14-01 completion)
- **Completed:** 2026-07-02T20:48:01Z
- **Tasks:** 2
- **Files modified:** 4 (all new)

## Accomplishments
- `lib/session.ts` exports `createSessionRefresher(deps)` with a closure-scoped `inFlight` single-flight guard — 5 concurrent `getValidAccessToken()` calls during an expiring token produce exactly 1 `/auth/client/refresh` call (D-09, Pitfall 4), proven by a dedicated jest test with a `setTimeout(0)`-delayed mock.
- `context/AuthContext.tsx` implements the full `AuthContextValue` surface (login/register/verifyEmail/requestPasswordReset/confirmPasswordReset/logout/getValidAccessToken), each action porting MotoKey_Client.html's handler logic verbatim, sending no `x-client-type` header.
- Cold-start session restore (MAUTH-02): loads the encrypted session, checks remaining token lifetime, refreshes if needed, and only then settles `status` to `authenticated`/`unauthenticated`.
- Proactive refresh (MAUTH-03): a 60s `setInterval` while authenticated, plus an `AppState.addEventListener('change', ...)` that refreshes immediately on foreground — before any subsequent API call can surface a 401.
- Hard-expiry handling (D-08): on unrecoverable refresh failure, clears the stored session, sets `unauthenticated`, and shows `"Session expirée — reconnectez-vous"` exactly once via a `useRef` guard reset on the next successful persist.
- `hooks/useAuth.ts` throws a clear error when consumed outside `AuthProvider`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Single-flight refresh primitive (lib/session.ts)** - `c6a907a` (test, TDD-style: implementation + full jest suite together)
2. **Task 2: AuthContext + useAuth** - `fee67fd` (feat)

**Plan metadata:** (this commit, following)

## Files Created/Modified
- `mobile-app/lib/session.ts` - `createSessionRefresher(deps)`: pure, testable single-flight refresh primitive (no React)
- `mobile-app/lib/__tests__/session.test.ts` - 7 tests covering all `<behavior>` cases incl. single-flight concurrency
- `mobile-app/context/AuthContext.tsx` - `AuthProvider` + `AuthContext`: session state, all auth actions, cold-start restore, timer + AppState refresh wiring
- `mobile-app/hooks/useAuth.ts` - `useAuth()` consumer hook

## Decisions Made
- Used `Alert.alert` as the hard-expiry notification fallback since the shared toast system is 14-03 scope — left a `// TODO(14-03): route to shared toast` comment in place per the plan's explicit instruction.
- Did not touch `app/_layout.tsx` to mount `AuthProvider` — that wiring (alongside `ToastProvider` and the routing guard) is explicitly 14-03 Task 2's responsibility per the plan boundary.

## Deviations from Plan

None - plan executed exactly as written. `npm install --legacy-peer-deps` was run once (no `node_modules` existed yet in this checkout — a session-environment prerequisite, not a plan deviation) to make `tsc`/`jest` runnable; no `package.json`/`package-lock.json` changes resulted since no new dependencies were needed (AppState and Alert both come from the already-installed `react-native` core).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `useAuth()` is ready for 14-03's screens (login, register, OTP verify, reset-request, reset-confirm) to consume directly — no further session-layer work needed.
- 14-03 must still: mount `AuthProvider` (+ `ToastProvider`) in `app/_layout.tsx`, add the routing guard between `(auth)`/`(app)` route groups, and replace the interim `Alert.alert` hard-expiry notice with the real toast system.
- No blockers identified.

---
*Phase: 14-rn-app-scaffolding-native-auth*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: mobile-app/lib/session.ts
- FOUND: mobile-app/lib/__tests__/session.test.ts
- FOUND: mobile-app/context/AuthContext.tsx
- FOUND: mobile-app/hooks/useAuth.ts
- FOUND: .planning/phases/14-rn-app-scaffolding-native-auth/14-02-SUMMARY.md
- FOUND: commit c6a907a
- FOUND: commit fee67fd
