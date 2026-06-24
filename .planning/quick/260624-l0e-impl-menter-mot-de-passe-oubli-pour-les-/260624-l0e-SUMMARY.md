---
phase: quick-260624-l0e
plan: 01
subsystem: auth
tags: [auth, password-reset, garage, otp, supabase]
key-files:
  modified:
    - motokey-api.js
    - app.html
decisions:
  - "Flux OTP-only pour le garage (pas de flux lien) — cohérent avec le besoin d'une UI embarquée dans app.html, pas de redirect externe"
  - "Email de recovery envoyé par SMTP Supabase (template Reset Password avec {{ .Token }}) — pas Resend, identique au reset client L7b"
  - "Anti-énumération maintenu : réponse identique que l'email existe ou non"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-24T13:14:44Z"
  tasks_completed: 3
  files_modified: 2
---

# Quick Task 260624-l0e: Mot de passe oublié comptes garage — Summary

**One-liner:** Flux OTP recovery Supabase pour reset mot de passe garage via deux endpoints publics dédiés et UI app.html à 2 écrans.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Endpoints backend POST /auth/password-reset/garage + /confirm | bcc8762 | motokey-api.js |
| 2 | UI reset mot de passe garage dans app.html | bcc8762 | app.html |
| 3 | Vérification syntaxe et push git | bcc8762 | — |

## What Was Built

### Backend (motokey-api.js)

Two public endpoints inserted after `POST /auth/client/password-reset/confirm` (around L2392):

- `POST /auth/password-reset/garage` — Request endpoint. Calls `sbPub().auth.resetPasswordForEmail()` with `redirectTo`. Always returns the same success message (anti-enumeration). No `requireRole()` — public by design.

- `POST /auth/password-reset/garage/confirm` — Confirm endpoint. Validates `email + code + new_password` (min 8 chars), calls `sbPub().auth.verifyOtp({ type: 'recovery' })`, then `sbSvc().auth.admin.updateUserById()` to set the new password.

### Frontend (app.html)

- "Mot de passe oublié ?" link added below the Connexion button in `#loginScreen`.
- `#resetGarageScreen` — Email input screen, "Envoyer le code" button, back link.
- `#resetGarageConfirmScreen` — Code (OTP) + new password + confirm password fields, "Réinitialiser" button, back link.
- 4 JS functions: `showResetGarage()`, `showLoginFromReset()`, `async requestResetGarage()`, `async confirmResetGarage()`.
- `_resetGarageEmail` variable carries the email between the two screens.
- On success: `toast()` shown, loginScreen displayed, email pre-filled, password field cleared.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `node --check motokey-api.js` passed.
- `app.html` verification script passed (all 8 required markers present).
- Both routes present, public, no `requireRole()`.
- Commit `bcc8762` pushed to `origin/master` — Railway auto-deploy triggered.

## Self-Check: PASSED

- `motokey-api.js` modified: contains `/auth/password-reset/garage` — confirmed via grep during execution.
- `app.html` modified: contains all 8 required markers — confirmed by Node verification script.
- Commit `bcc8762` exists: confirmed by `git log --oneline -3`.
- Pushed to `origin/master`: confirmed by git push output (`8d8343c..bcc8762`).
