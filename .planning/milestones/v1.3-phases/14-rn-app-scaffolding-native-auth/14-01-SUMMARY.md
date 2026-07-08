---
phase: 14-rn-app-scaffolding-native-auth
plan: 01
subsystem: mobile
tags: [expo, expo-router, typescript, expo-secure-store, aes-js, fetch]

requires: []
provides:
  - Expo Router + TypeScript mobile app scaffold under /mobile-app
  - AES-encrypted LargeSecureStore token store (MAUTH-02 foundation)
  - fetch-based API client for /auth/client/* endpoints (MAUTH-01 foundation)
affects: [14-02-auth-session-layer, 14-03-auth-screens, 14-04-device-verification]

tech-stack:
  added: [expo (SDK 57), expo-router, typescript, expo-secure-store, aes-js, react-native-get-random-values]
  patterns: ["fetch-only API access (no @supabase/supabase-js) per Pitfall 1", "LargeSecureStore pattern: AES key in SecureStore, encrypted blob in AsyncStorage"]

key-files:
  created:
    - mobile-app/lib/api.ts
    - mobile-app/lib/secureStore.ts
    - mobile-app/lib/types.ts
    - mobile-app/constants/config.ts
    - mobile-app/lib/__tests__/api.test.ts
    - mobile-app/lib/__tests__/secureStore.test.ts
  modified: []

key-decisions:
  - "No @supabase/supabase-js dependency — mobile app calls the existing Express REST API via fetch only, matching MotoKey_Client.html's actual pattern and avoiding Pitfall 1 (direct-Supabase-access bypassing backend business logic/RBAC)"
  - "Flattened Expo SDK 57's new src/app default template layout to root-level app/ to match every path plans 14-02/14-03/14-04 already commit to"
  - "Pinned jest@^29.7.0 + @types/jest@^29 + @react-native/jest-preset@^0.86.0 (--legacy-peer-deps) to resolve jest-expo@57.0.0's internal jest-runtime deps conflicting with jest's latest 30.x tag and RN 0.86.0"

patterns-established:
  - "LargeSecureStore: AES-256 key in expo-secure-store, encrypted session blob in AsyncStorage (works around SecureStore's ~2048-byte per-key limit)"
  - "x-client-type header omitted entirely (Claude's-discretion per CONTEXT.md) — backend's non-web branch returns tokens in JSON body"

requirements-completed: []

duration: 20min
completed: 2026-07-02
---

# Phase 14: RN App Scaffolding + Native Auth — Plan 01 Summary

**Expo Router + TypeScript scaffold with AES-encrypted LargeSecureStore token store and a fetch-only API client porting MotoKey_Client.html's auth endpoint contracts 1:1**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 completed
- **Files modified:** 11 (mostly new scaffold + lib files)

## Accomplishments
- Scaffolded `/mobile-app` via `create-expo-app` (Expo SDK 57, Router, TypeScript template), flattened to root `app/`
- Built `lib/api.ts` — fetch client for `/auth/client/register`, `/verify-email`, `/login`, `/refresh`, `/logout`, `/password-reset`, `/password-reset/confirm`, matching MotoKey_Client.html payload shapes verbatim
- Built `lib/secureStore.ts` — AES-256 `LargeSecureStore` (key in `expo-secure-store`, encrypted blob in `AsyncStorage`), per MAUTH-02
- 13 passing tests across `api.test.ts` and `secureStore.test.ts`
- `README.md` documents the API-only access rule (no direct Supabase client)

## Task Commits

1. **Task 1: Scaffold Expo Router + TS app** - `69ed730` (feat)
2. **Task 2: fetch API client (TDD)** - `2730363` (test) → `f91f1b5` (feat)
3. **Task 3: LargeSecureStore token store** - `b2ac263` (feat)

**Plan metadata:** `3b30e10` (docs: complete plan)

## Files Created/Modified
- `mobile-app/lib/api.ts` - fetch-based client for all `/auth/client/*` endpoints
- `mobile-app/lib/secureStore.ts` - AES-encrypted LargeSecureStore token persistence
- `mobile-app/lib/types.ts` - shared TS types for session/user/API responses
- `mobile-app/constants/config.ts` - API base URL (pinned to `motokey11-production.up.railway.app`)
- `mobile-app/lib/__tests__/api.test.ts`, `mobile-app/lib/__tests__/secureStore.test.ts` - test coverage

## Decisions Made
- No `@supabase/supabase-js` in the app — `fetch` only, per Pitfall 1 and the actual `MotoKey_Client.html` reference implementation. `react-native-url-polyfill` correspondingly dropped.
- `x-client-type` header omitted entirely (Claude's Discretion per CONTEXT.md).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Flattened Expo SDK 57's `src/app` default layout to root `app/`**
- **Found during:** Task 1 (scaffold)
- **Issue:** `create-expo-app@latest` on SDK 57 now scaffolds a `src/app` layout by default; plans 14-02/14-03/14-04 all commit to root-level `app/` paths
- **Fix:** Moved scaffolded routes/layout to root `app/` directory
- **Committed in:** `69ed730`

**2. [Rule 3 - Blocking] Pinned jest/jest-preset versions**
- **Found during:** Task 2 (TDD test setup)
- **Issue:** `jest-expo@57.0.0` depends on jest-runtime `^29.2.1`, conflicting with jest's latest `30.x` tag against RN 0.86.0
- **Fix:** Pinned `jest@^29.7.0`, `@types/jest@^29`, `@react-native/jest-preset@^0.86.0` with `--legacy-peer-deps`
- **Committed in:** `69ed730`

**3. [Rule 1 - Minor] Reworded doc comments tripping the plan's own grep guards**
- **Found during:** Task 2/3 verification
- **Issue:** Doc comments literally containing the strings `x-client-type` / `@supabase/supabase-js` (as prohibitions) tripped the plan's negative-grep acceptance criteria
- **Fix:** Reworded without changing meaning
- **Committed in:** `f91f1b5`, `b2ac263`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 minor)
**Impact on plan:** All auto-fixes necessary for correctness/tooling. No scope creep.

## Issues Encountered
None beyond the deviations above.

## Next Phase Readiness
`lib/api.ts`, `lib/secureStore.ts`, `lib/types.ts` are ready for 14-02 to build the session/refresh layer and `AuthContext` on top.

---
*Phase: 14-rn-app-scaffolding-native-auth*
*Completed: 2026-07-02*
