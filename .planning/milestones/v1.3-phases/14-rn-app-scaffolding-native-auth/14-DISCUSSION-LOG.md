# Phase 14: RN App Scaffolding + Native Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 14-rn-app-scaffolding-native-auth
**Areas discussed:** Auth screen flow & copy, Post-login destination & visual baseline, Session-expiry UX

---

## Areas offered (not all selected)

| Area | Selected? |
|------|-----------|
| Auth screen flow & copy | Yes |
| Post-login destination & visual baseline | Yes |
| Session-expiry UX | Yes |
| Client identification header | No — left as Claude's Discretion |

---

## Auth Screen Flow & Copy

### Register flow

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror web exactly | Signup → immediate mandatory OTP verify screen → login. Same shared OTP component reused for password-reset confirm. | ✓ |
| Allow skip-verify-for-now | Let user dismiss OTP screen, verify later via reminder banner. | |

**User's choice:** Mirror web exactly
**Notes:** Matches MotoKey_Client.html's existing blocking OTP verification pattern.

### Reset entry point

| Option | Description | Selected |
|--------|-------------|----------|
| Text link below password field | Typical mobile auth UX placement | ✓ |
| Separate button/CTA | More prominent but less conventional | |

**User's choice:** Text link below password field

### Error copy

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse web client's exact copy | Consistency, already production-validated | ✓ |
| Write new mobile-specific copy | More work, risk of tone drift | |

**User's choice:** Reuse web client's exact copy

### Reset flow component

| Option | Description | Selected |
|--------|-------------|----------|
| Same shared OTP component | Mirrors web's verifyMode pattern, less code | ✓ |
| Distinct screens | More code, allows divergence later | |

**User's choice:** Same shared OTP component

---

## Post-Login Destination & Visual Baseline

### Post-login screen

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal placeholder Home screen | "Bienvenue {email}" + logout, proves session flow | ✓ |
| Empty router stub only | No visible content, just navigation guard proof | |

**User's choice:** Minimal placeholder Home screen

### Visual style

| Option | Description | Selected |
|--------|-------------|----------|
| Adopt MotoKey brand now | Reuse orange accent + Inter font + logo from MotoKey_Client.html | ✓ |
| Plain/unstyled for now | Defer visual polish, faster short-term | |

**User's choice:** Adopt MotoKey brand now

### UI design contract

| Option | Description | Selected |
|--------|-------------|----------|
| Brand guidance above is enough | Skip formal UI-SPEC — low visual risk, standard forms | ✓ |
| Generate a UI-SPEC first | Run /gsd:ui-phase 14 for fuller design contract | |

**User's choice:** Brand guidance above is enough

---

## Session-Expiry UX

### Hard expiry (refresh token itself invalid)

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to login + "Session expirée" message | Mirrors web client's exact message, clears tokens | ✓ |
| Silent redirect, no message | Simpler but less clear to user | |

**User's choice:** Redirect to login + show message

### Concurrent refresh handling

| Option | Description | Selected |
|--------|-------------|----------|
| Queue concurrent requests behind one refresh | Prevents refresh-token race (one-time-use/rotating) | ✓ |
| Accept the race for now | Simpler, defer hardening | |

**User's choice:** Queue concurrent requests behind one refresh

---

## Claude's Discretion

- `x-client-type` header value (omit vs explicit `mobile`) — area not selected for discussion, research recommendation (omit) stands as default
- State management approach (React Context vs Zustand)
- TypeScript vs plain JS (TypeScript per STACK.md default)
- Exact package/SDK patch versions (verify at implementation time)

## Deferred Ideas

- Device push-token registration at login/logout — Phase 16 scope
- Feature-parity screens (motos/devis/historique/liaison) — Phase 15 scope
- App store submission requirements — Phase 17 scope
