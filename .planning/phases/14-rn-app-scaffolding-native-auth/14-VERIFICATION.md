---
phase: 14-rn-app-scaffolding-native-auth
verified: 2026-07-08T00:00:00Z
status: human_needed
score: 4/4 truths fully verified, including live on-device proof of MAUTH-03 (2026-07-08 real-device test); 1 unrelated pre-existing gap remains (Resend email)
human_verification:
  - test: "Real email delivery (Resend) for OTP codes during register/reset"
    expected: "OTP codes for register-verification and password-reset arrive in a real inbox rather than being read from the backend's console.log fallback"
    why_human: "Pre-existing, already-documented gap unrelated to Phase 14's own scope — RESEND_API_KEY is not yet configured on Railway and EMAIL_ENABLED=false, tracked in PROJECT.md 'À faire' since before this phase. 14-04-SUMMARY.md confirms the OTP code path itself (generation + verification) is correct regardless of transport; only the transport (real email vs console.log) is unverified. Not a Phase 14 code gap."
---

# Phase 14: RN App Scaffolding + Native Auth Verification Report

**Phase Goal:** Les clients peuvent s'authentifier depuis l'app mobile native, avec une session stockée de façon chiffrée et rafraîchie proactivement.
**Verified:** 2026-07-08
**Status:** human_needed
**Re-verification:** No — initial verification (retroactive — phase executed 2026-07-02/03, VERIFICATION.md was never generated at the time; this closes that documentation gap using evidence already gathered during execution plus fresh code/test re-checks)

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | L'utilisateur peut créer un compte, se connecter et réinitialiser son mot de passe depuis l'app mobile (MAUTH-01) | ✓ VERIFIED | `app/(auth)/register.tsx`, `login.tsx`, `verify.tsx` (shared OTP, `mode=register\|reset`), `reset-request.tsx` all exist, wire to `useAuth()` actions (`register`/`login`/`verifyEmail`/`requestPasswordReset`/`confirmPasswordReset`), and carry the exact verbatim French copy from the plan (`grep` confirms "Mot de passe oublié ?", "Bienvenue !", validation strings). `context/AuthContext.tsx` implements every action against the real `/auth/client/*` endpoints (`apiPost('/auth/client/login'...)`, `/register`, `/verify-email`, `/password-reset`, `/password-reset/confirm`). On-device confirmed per 14-04-SUMMARY.md: register → OTP verify → Home, logout/login, and forgot-password → OTP reset → login with new password all worked against the live Express API (OTP codes read via console.log fallback, not real email — see human_verification #2). |
| 2 | Le token de session est stocké via un mécanisme chiffré (jamais en clair dans AsyncStorage) (MAUTH-02) | ✓ VERIFIED | `lib/secureStore.ts` implements the official Supabase `LargeSecureStore` pattern: AES-256-CTR key generated via `crypto.getRandomValues`, stored in `expo-secure-store` (`SecureStore.setItemAsync`), with only the ciphertext (`aesjs.utils.hex.fromBytes(encryptedBytes)`) written to `AsyncStorage.setItem`. The plaintext JSON session never touches AsyncStorage. `secureStore.test.ts` (3/3 passing, re-run this session) round-trips a session and asserts the persisted AsyncStorage value is NOT the plaintext JSON. On-device confirmed per 14-04-SUMMARY.md (see truth #4 below — persistence works). |
| 3 | Après un retour en premier plan, le token est rafraîchi proactivement avant expiration, sans erreur 401 visible (MAUTH-03) | ✓ VERIFIED (code + live on-device) | `context/AuthContext.tsx` registers `AppState.addEventListener('change', (state) => { if (state === 'active') refresher.refreshIfNeeded(); })` — refreshes immediately on foreground, before any subsequent API call can surface a 401. Backed by `lib/session.ts`'s `createSessionRefresher`, which refreshes when `tokenSecsLeft < REFRESH_SKEW_SECS` (300s) and guards concurrent calls behind a single in-flight promise (`inFlight`). `session.test.ts` (7/7 passing, re-run this session) proves the mechanism unit-level. **Live on-device proof closed 2026-07-08**: Mehdi logged in, let the token approach its ~1h expiry, backgrounded the app, then foregrounded it — Railway HTTP logs captured `POST /auth/client/refresh 200 596ms` at the exact foreground moment, immediately followed by successful `GET /motos 200` / `GET /devis 200` calls with zero 401s in the window; Mehdi confirmed no "Session expirée" toast or any visible interruption on-screen. This closes the item previously carried in `STATE.md` ("MAUTH-03 ... not yet exercised on a real device") and the human_verification entry from this report's first pass. |
| 4 | L'utilisateur reste connecté entre deux ouvertures de l'app (session persistée) | ✓ VERIFIED | `AuthContext.tsx`'s cold-start `useEffect` calls `loadSession()`, and if a session exists with enough remaining token lifetime sets `status='authenticated'` directly (otherwise attempts `refreshIfNeeded()` before deciding). On-device confirmed per 14-04-SUMMARY.md: "killing and reopening the app returns directly to Home (encrypted session survives restart)" — MAUTH-02 end-to-end persistence confirmed live against the real API. |

**Score:** 4/4 truths fully verified, including live on-device proof of MAUTH-03 closed 2026-07-08 (real background/foreground cycle against prod, corroborated by Railway HTTP logs). 1 unrelated pre-existing gap (Resend email transport) remains routed to human verification — not a Phase 14 code or planning gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `mobile-app/` (Expo Router + TypeScript scaffold) | Project scaffolded, typechecks clean | ✓ VERIFIED | `mobile-app/package.json` present; `npx tsc --noEmit` exits 0 (re-run this session). SDK was downgraded 57→54 in 14-04 for Expo Go compatibility (`expo: ~54.0.35`), a documented, non-blocking deviation. |
| `mobile-app/constants/config.ts` | `API_BASE` + storage keys + refresh thresholds | ✓ VERIFIED | Exports `API_BASE = 'https://motokey11-production.up.railway.app'` (correct prod URL, no `motokey-api-10` anywhere in `mobile-app/`), `SESSION_KEY='mk_session'`, `REFRESH_SKEW_SECS=300`, `NEAR_EXPIRY_SECS=60`, `REFRESH_POLL_MS=60_000` — matches plan interfaces exactly. |
| `mobile-app/lib/api.ts` | fetch-based API client, `extractTokens`/`tokenSecsLeft`/`errMsg` | ✓ VERIFIED | Exports present; no `x-client-type` header anywhere in `lib/`, `context/`, or `app/`; no `@supabase/supabase-js` in `package.json`. `api.test.ts` 10/10 passing (re-run this session). |
| `mobile-app/lib/secureStore.ts` | `LargeSecureStore` AES-256 encrypted store | ✓ VERIFIED | `class LargeSecureStore` present with `_encrypt`/`_decrypt` via `aes-js`, `SecureStore.setItemAsync` for the key, `AsyncStorage.setItem` for ciphertext only. `secureStore.test.ts` 3/3 passing. |
| `mobile-app/lib/session.ts` | Single-flight refresh primitive | ✓ VERIFIED | `createSessionRefresher` exports `getValidAccessToken`/`refreshIfNeeded`, closure-scoped `inFlight` guard confirmed in source. `session.test.ts` 7/7 passing, including the 5-concurrent-callers-produce-1-refresh-call assertion. |
| `mobile-app/context/AuthContext.tsx` | `AuthProvider`/`AuthContext` — full session state + actions + refresh wiring | ✓ VERIFIED | All six actions (`login`/`register`/`verifyEmail`/`requestPasswordReset`/`confirmPasswordReset`/`logout`) present and calling the correct `/auth/client/*` endpoints; cold-start restore, 60s timer, and `AppState` foreground listener all present; `getValidAccessToken` delegates to the session refresher. (Now also calls `unregisterPushAsync` on logout — a Phase 16 addition, additive and non-conflicting with Phase 14 scope.) |
| `mobile-app/hooks/useAuth.ts` | `useAuth()` consumer hook | ✓ VERIFIED | Present, throws when used outside `AuthProvider` (confirmed in 14-02-SUMMARY.md; file exists on disk). |
| `mobile-app/theme/colors.ts` + component kit | Brand palette + Logo/Button/TextField/OtpCodeInput/Toast | ✓ VERIFIED | `theme/colors.ts` exists; components directory contains all five per 14-03-SUMMARY.md's Self-Check (all `FOUND`). |
| `mobile-app/app/(auth)/{login,register,verify,reset-request}.tsx` | Five auth screens | ✓ VERIFIED | All four files present and current on disk; `verify.tsx` still serves both `mode='register'` and `mode='reset'` via the shared `OtpCodeInput` component (D-01/D-04); `login.tsx` still has the "Mot de passe oublié ?" ghost link (D-02) and calls `useAuth()`. |
| `mobile-app/app/(app)/home.tsx` (D-05 placeholder) | "Bienvenue {email}" + logout | ⚠️ SUPERSEDED (by design, later phase) | This file no longer exists — Phase 15 (per STATE.md Phase 15-03 note) intentionally replaced the placeholder Home with a real 3-tab navigation shell (`(app)/(tabs)/motos`, `devis`, `compte`) once feature-parity screens existed. This is expected evolution, not a Phase 14 regression: Phase 14's own plan (14-03) explicitly says "Phase 15 replaces this with real feature screens." The root routing guard (`app/_layout.tsx`) now redirects authenticated users to `/(app)/(tabs)/motos` (or `/(app)/soft-ask` pre-first-run) instead of the retired `/(app)/home`, confirmed working via Phase 15/16/17's own verification passes. |
| `mobile-app/app/_layout.tsx` | Root: AuthProvider + font load + routing guard | ✓ VERIFIED | Loads Inter fonts, mounts `ToastProvider`+`AuthProvider`, routing guard via `useSegments()`+`useRouter().replace()` driven by `useAuth().status` — same mechanism as originally built, target route updated for Phase 15's tab shell. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `mobile-app/lib/api.ts` | `https://motokey11-production.up.railway.app/auth/client/*` | `fetch(API_BASE + path)` | ✓ WIRED | `API_BASE` correctly set, `apiFetch` builds `fetch(API_BASE + path, ...)`, no `x-client-type` header sent (per Pitfall 3 discretion). |
| `mobile-app/lib/secureStore.ts` | `expo-secure-store` + `@react-native-async-storage/async-storage` | AES key in SecureStore, ciphertext in AsyncStorage | ✓ WIRED | `SecureStore.setItemAsync`/`getItemAsync`/`deleteItemAsync` for the key; `AsyncStorage.setItem`/`getItem`/`removeItem` for ciphertext only. |
| `mobile-app/context/AuthContext.tsx` | `mobile-app/lib/api.ts (/auth/client/*)` | `apiPost` calls | ✓ WIRED | All six actions confirmed calling the correct endpoint strings with correct payload shapes (verbatim ported from `MotoKey_Client.html` per 14-02-SUMMARY.md). |
| `mobile-app/context/AuthContext.tsx` | `react-native AppState` | `AppState.addEventListener('change', ...)` → `refreshIfNeeded()` | ✓ WIRED | Confirmed present in source; listener correctly cleaned up via `sub.remove()` in the effect's return. |
| `mobile-app/context/AuthContext.tsx` | `mobile-app/lib/secureStore.ts` | `saveSession`/`loadSession`/`clearSession` | ✓ WIRED | `persist()` calls `saveSession`, cold-start effect calls `loadSession`, `logout`/`onHardExpiry` call `clearSession`. |
| `mobile-app/app/(auth)/login.tsx` | `useAuth().login` | `onPress` handler | ✓ WIRED | `login.tsx` destructures `login` from `useAuth()` and invokes it on submit; on success/failure branches toast accordingly. |
| `mobile-app/app/_layout.tsx` | `useAuth().status` routing | `useSegments()` + `router.replace()` | ✓ WIRED | Confirmed: unauthenticated → `/(auth)/login`; authenticated while in `(auth)` group → app home area (now the Phase 15 tab shell). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `AuthContext` `status`/`email` | `session` state, populated by `persist()` after `login`/`verifyEmail`/cold-start `loadSession()` | Real `/auth/client/login` response tokens (`extractTokens(data)`) or real decrypted `secureStore` blob | Yes — confirmed live against the real Express/Supabase-backed API per 14-04-SUMMARY.md (register/login/reset all exercised against the live prod endpoint, not mocked) | ✓ FLOWING |
| `lib/session.ts` `refreshIfNeeded`/`getValidAccessToken` | `tokenSecsLeft(s.accessToken)` computed from a real JWT `exp` claim | Real access token issued by Supabase via `/auth/client/login` or `/auth/client/refresh` | Yes — confirmed both in the unit-test harness (real JWT-shaped tokens) and live against prod on 2026-07-08 (`POST /auth/client/refresh 200` fired at the real foreground moment, real rotated tokens accepted by subsequent `/motos`/`/devis` calls) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Whole mobile-app project typechecks clean | `cd mobile-app && npx tsc --noEmit` | exits 0, no output | ✓ PASS |
| Phase 14 lib unit suites (api/secureStore/session) still pass on current code | `cd mobile-app && npx jest lib/__tests__/api.test.ts lib/__tests__/secureStore.test.ts lib/__tests__/session.test.ts` | 3 suites, 20/20 tests passing | ✓ PASS |
| No forbidden `@supabase/supabase-js` dependency, no `x-client-type` header, no stale prod URL | `grep` across `mobile-app/{lib,context,app,constants}` | all clean (zero matches) | ✓ PASS |
| Phase 14 commits exist in git history | `git log --oneline` for `69ed730/2730363/f91f1b5/b2ac263/3b30e10/c6a907a/fee67fd/502d9b5/f6d1b9d/e52e836/1e31d6f` | all 11 commits found, plus `cc50846`/`fae122d` (14-04 follow-ups) | ✓ PASS |
| MAUTH-03 on-device foreground refresh | Real device: login, wait ~55min, background, foreground; `railway logs --http --since Xm` around the foreground timestamp | `POST /auth/client/refresh 200` (596ms) immediately at foreground, followed by `GET /motos 200`/`GET /devis 200`, zero 401s; no "Session expirée" toast observed on-device | ✓ PASS (2026-07-08) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MAUTH-01 | 14-01, 14-02, 14-03, 14-04 | L'utilisateur peut se connecter / s'inscrire / réinitialiser son mot de passe depuis l'app mobile | ✓ SATISFIED | Full UI + session-layer + endpoint wiring code-verified above; on-device confirmed per 14-04-SUMMARY.md. REQUIREMENTS.md checkbox `[x]`. |
| MAUTH-02 | 14-01, 14-02, 14-04 | Le token de session est stocké chiffré sur l'appareil (expo-secure-store, pas AsyncStorage en clair) | ✓ SATISFIED | `LargeSecureStore` AES-256 pattern code-verified, unit-tested (ciphertext ≠ plaintext assertion), and on-device persistence-across-restart confirmed per 14-04-SUMMARY.md. REQUIREMENTS.md checkbox `[x]`. |
| MAUTH-03 | 14-02, 14-04 | L'app rafraîchit proactivement le token avant expiration au retour d'arrière-plan (pas seulement en réaction à un 401) | ✓ SATISFIED (code + live on-device) | `AppState` foreground listener + single-flight `refreshIfNeeded()` code-verified and unit-tested exhaustively (7/7 session.test.ts cases). Live on-device proof closed 2026-07-08 (see truth #3 above). REQUIREMENTS.md marks this `[x]` Complete — no outstanding item remains for this requirement. |

No orphaned requirements found — MAUTH-01/02/03 all appear in plan `requirements:` frontmatter (14-01 through 14-04) and are accounted for above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODO/FIXME/placeholder/stub/"not implemented" patterns found in any of the core Phase 14 files (`lib/session.ts`, `lib/secureStore.ts`, `lib/api.ts`, `context/AuthContext.tsx`, `app/(auth)/{login,register,verify,reset-request}.tsx`) | ℹ️ Info | None — clean scan. The only `placeholder` occurrences found are legitimate `TextInput`/`TextField` placeholder attribute values (e.g. `placeholder="vous@exemple.fr"`), not stub markers. |
| `mobile-app/app/(app)/home.tsx` | — | File no longer exists (superseded by Phase 15's tab shell) | ℹ️ Info | Expected, planned evolution per 14-03's own plan text and STATE.md's Phase 15-03 note — not a Phase 14 regression. |
| `.planning/ROADMAP.md` | 176 | Progress table still reads "Phase 14 \| v1.3 \| 1/4 \| In Progress \| -" while the phase's own checklist (all 4 plans `[x]`) and REQUIREMENTS.md (all 3 MAUTH reqs `[x]` Complete) show it long finished | ℹ️ Info | Documentation staleness only — matches the same class of stale-bookkeeping issue flagged in 17-VERIFICATION.md for Phase 17's own progress table. Does not affect code or goal achievement. |
| `.planning/phases/14-rn-app-scaffolding-native-auth/` | — | 14-01-SUMMARY.md was originally missing from the main checkout per STATE.md's Pending Todos note ("written in the 14-01 worktree but .planning/phases/ is gitignored") | ℹ️ Info | Already resolved — `14-01-SUMMARY.md` exists and was read in full during this verification. No current impact. |

No blocker or warning-severity anti-patterns found in the code itself.

### Human Verification Required

### 1. Real email delivery (Resend) for OTP codes

**Test:** Once `RESEND_API_KEY` is configured on Railway and `EMAIL_ENABLED=true`, repeat the register and password-reset flows and confirm the OTP code arrives in a real email inbox (not the console.log fallback).
**Expected:** OTP email arrives with the 8-digit code, and the same register/reset flows already confirmed working (per 14-04-SUMMARY.md) continue to work end-to-end with real email transport.
**Why human:** Requires Railway environment variable configuration and a real mailbox — a pre-existing, already-tracked gap (`PROJECT.md` "À faire") unrelated to Phase 14's own code, which already correctly implements the OTP code path regardless of transport.

### Gaps Summary

No code gaps were found. Every artifact described across the four Phase 14 plans (Expo Router scaffold, AES-encrypted `LargeSecureStore`, fetch-based API client, single-flight session refresher, `AuthContext`, branded component kit, five auth screens) exists on disk today, is substantive (no stubs, no TODO/placeholder markers beyond legitimate input-placeholder text), typechecks cleanly (`tsc --noEmit` exits 0), and passes its full unit-test suite (20/20 across `api.test.ts`, `secureStore.test.ts`, `session.test.ts`, re-run fresh this session). All Phase 14 git commits (`69ed730` through `1e31d6f` plus `cc50846`/`fae122d`) are present in history. The one artifact that no longer exists as originally built — the placeholder `app/(app)/home.tsx` — was intentionally and explicitly superseded by Phase 15's real tab-based navigation shell, exactly as Phase 14's own plan anticipated ("Phase 15 replaces this with real feature screens").

The phase goal — native, encrypted, proactively-refreshing mobile authentication — is achieved at both the code and behavioral level for all three MAUTH requirements. MAUTH-03's on-device confirmation, left untested during the original 14-04 human-verify checkpoint (checks 1-4 passed; check 5 was not exercised) and carried as an open item in `STATE.md`, was closed on 2026-07-08: a real background/foreground cycle against prod produced `POST /auth/client/refresh 200` at the exact foreground moment (Railway HTTP logs), followed by successful `/motos`/`/devis` calls and no visible "Session expirée" toast. The only remaining item — real Resend email delivery, blocked on Railway env var configuration — is an unrelated, pre-existing gap already tracked in `PROJECT.md`, not a Phase 14 code or planning gap.

---

*Verified: 2026-07-08*
*Verifier: Claude (gsd-verifier)*
