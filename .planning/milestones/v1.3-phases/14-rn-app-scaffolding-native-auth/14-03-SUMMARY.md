---
phase: 14-rn-app-scaffolding-native-auth
plan: 03
subsystem: ui
tags: [react-native, expo-router, ui, auth, branding, inter-font]

requires:
  - phase: 14-02
    provides: "context/AuthContext.tsx (AuthProvider), hooks/useAuth.ts — status/email/login/register/verifyEmail/requestPasswordReset/confirmPasswordReset/logout/getValidAccessToken"
provides:
  - "theme/colors.ts — locked MotoKey brand palette (D-06)"
  - "components/{Logo,Button,TextField,OtpCodeInput,Toast}.tsx — shared component kit"
  - "app/_layout.tsx — Inter font load + ToastProvider/AuthProvider + auth routing guard"
  - "app/(auth)/{login,register,verify,reset-request}.tsx + app/(app)/home.tsx — full MAUTH-01 UI flow"
affects: [15-feature-parity-screens]

tech-stack:
  added: []
  patterns:
    - "Shared OtpCodeInput + verify.tsx mode=register|reset param — one component/screen serves both OTP flows (D-01/D-04)"
    - "Module-level showToast() escape hatch registered by ToastProvider on mount — lets non-React code (AuthContext.onHardExpiry) trigger toasts without a hook"
    - "Auth routing guard: useSegments()+useRouter().replace() inside a useEffect in app/_layout.tsx, driven by useAuth().status"

key-files:
  created:
    - mobile-app/theme/colors.ts
    - mobile-app/components/Logo.tsx
    - mobile-app/components/Button.tsx
    - mobile-app/components/TextField.tsx
    - mobile-app/components/OtpCodeInput.tsx
    - mobile-app/components/Toast.tsx
    - mobile-app/app/(auth)/_layout.tsx
    - mobile-app/app/(auth)/login.tsx
    - mobile-app/app/(auth)/register.tsx
    - mobile-app/app/(auth)/reset-request.tsx
    - mobile-app/app/(auth)/verify.tsx
    - mobile-app/app/(app)/_layout.tsx
    - mobile-app/app/(app)/home.tsx
  modified:
    - mobile-app/app/_layout.tsx
    - mobile-app/context/AuthContext.tsx

key-decisions:
  - "AuthContext.onHardExpiry's 14-02 TODO resolved: now calls showToast('Session expirée — reconnectez-vous', 'error') instead of Alert.alert, per Task 1's explicit instruction"
  - "verify.tsx resend button: reset mode calls requestPasswordReset(email) then info toast; register mode shows the same info toast without a destructive re-register call (no password available on the verify screen to safely resubmit)"

requirements-completed: [MAUTH-01]

duration: ~20min
completed: 2026-07-02
---

# Phase 14 Plan 03: Auth UI (Component Kit + Screens) Summary

**Branded component kit (Logo/Button/TextField/OtpCodeInput/Toast) plus the full Expo Router auth flow — login, register, shared OTP verify (register+reset), reset-request, and placeholder Home — wired to 14-02's `useAuth()` with routing gated by session status**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 completed
- **Files modified:** 15 (13 created, 2 modified)

## Accomplishments
- `theme/colors.ts` — exact MotoKey palette locked from `MotoKey_Client.html`'s `:root` (D-06)
- Five-component kit: `Logo` (orange italic "Key"), `Button` (primary/ghost, mirrors `.btn-primary`/`.btn-ghost`), `TextField` (focus-aware, mirrors `.form-group input:focus`), `OtpCodeInput` (shared 8-digit input, fontSize 24 / letterSpacing 8, D-01/D-04), `Toast` (`ToastProvider`/`useToast()` + module-level `showToast()` escape hatch)
- `app/_layout.tsx` rebuilt: loads Inter via `@expo-google-fonts/inter`, mounts `ToastProvider`+`AuthProvider`, and gates navigation between `(auth)`/`(app)` route groups using `useSegments()` + `useRouter().replace()` driven by `useAuth().status`
- Five auth screens shipped: `login.tsx` (email/password + D-02 "Mot de passe oublié ?" ghost link below password), `register.tsx` (nom/email/tel/password/confirm with verbatim validation copy), `verify.tsx` (shared OTP screen, `mode=register|reset` param, D-01/D-04), `reset-request.tsx` (anti-enum reset request), `home.tsx` (D-05 placeholder: "Bienvenue {email}" + logout)
- All French copy ported verbatim from `MotoKey_Client.html` (D-03) — validation messages, screen titles/subtitles, button labels, toast text
- `AuthContext.onHardExpiry`'s 14-02 TODO resolved — now calls the real `showToast()` instead of `Alert.alert`

## Task Commits

1. **Task 1: Brand theme + shared component kit** - `502d9b5` (feat)
2. **Task 2: Router shell, auth guard, Inter font load, providers** - `f6d1b9d` (feat)
3. **Task 3: Auth screens + placeholder Home** - `e52e836` (feat)

**Plan metadata:** (this commit, following)

## Files Created/Modified
- `mobile-app/theme/colors.ts` - locked MotoKey brand palette (D-06)
- `mobile-app/components/Logo.tsx` - "Moto*Key*" lockup, orange italic "Key"
- `mobile-app/components/Button.tsx` - primary/ghost button variants
- `mobile-app/components/TextField.tsx` - focus-aware text input
- `mobile-app/components/OtpCodeInput.tsx` - shared 8-digit OTP input (D-01/D-04)
- `mobile-app/components/Toast.tsx` - `ToastProvider`/`useToast()` + `showToast()` escape hatch
- `mobile-app/app/_layout.tsx` - Inter font load, provider tree, auth routing guard
- `mobile-app/app/(auth)/_layout.tsx` - headerless auth stack
- `mobile-app/app/(auth)/login.tsx` - login screen
- `mobile-app/app/(auth)/register.tsx` - registration screen
- `mobile-app/app/(auth)/verify.tsx` - shared OTP verify screen (register + reset)
- `mobile-app/app/(auth)/reset-request.tsx` - password reset request screen
- `mobile-app/app/(app)/_layout.tsx` - headerless app stack
- `mobile-app/app/(app)/home.tsx` - placeholder Home (D-05)
- `mobile-app/context/AuthContext.tsx` - `onHardExpiry` now uses `showToast()` instead of `Alert.alert`

## Decisions Made
- `AuthContext.onHardExpiry` wired to the new `showToast()` module-level escape hatch, closing 14-02's explicit TODO.
- `verify.tsx`'s "Renvoyer le code" for `mode=register` intentionally does not re-call `register()` (no password value is available on this screen) — it shows the same informational toast as reset mode without a destructive network call, matching the plan's explicit "keep it simple" instruction.

## Deviations from Plan

None - plan executed exactly as written. Confirmed `Redirect`/`useSegments`/`useRouter().replace` availability directly against the installed `expo-router@57.0.2` type declarations (`node_modules/expo-router/build/link/Redirect.d.ts`, `exports.d.ts`) before implementing the routing guard, per `mobile-app/AGENTS.md`'s instruction to verify current Expo Router APIs before writing code.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- MAUTH-01 delivered end-to-end in the UI: register → mandatory OTP → login; login → Home; forgotten password → OTP reset — all consuming `useAuth()` exclusively, no direct token handling in screens.
- Branding (D-06) and verbatim copy (D-03) applied across all five screens.
- Phase 15 (feature-parity screens) can replace `app/(app)/home.tsx` with real content; the `(app)` group layout and routing guard are already in place.
- No blockers identified.

---
*Phase: 14-rn-app-scaffolding-native-auth*
*Completed: 2026-07-02*

## Self-Check: PASSED

- FOUND: mobile-app/theme/colors.ts
- FOUND: mobile-app/components/Logo.tsx
- FOUND: mobile-app/components/Button.tsx
- FOUND: mobile-app/components/TextField.tsx
- FOUND: mobile-app/components/OtpCodeInput.tsx
- FOUND: mobile-app/components/Toast.tsx
- FOUND: mobile-app/app/_layout.tsx
- FOUND: mobile-app/app/(auth)/_layout.tsx
- FOUND: mobile-app/app/(auth)/login.tsx
- FOUND: mobile-app/app/(auth)/register.tsx
- FOUND: mobile-app/app/(auth)/verify.tsx
- FOUND: mobile-app/app/(auth)/reset-request.tsx
- FOUND: mobile-app/app/(app)/_layout.tsx
- FOUND: mobile-app/app/(app)/home.tsx
- FOUND: .planning/phases/14-rn-app-scaffolding-native-auth/14-03-SUMMARY.md
- FOUND: commit 502d9b5
- FOUND: commit f6d1b9d
- FOUND: commit e52e836
