# MotoKey API — Roadmap

## Milestones

- ✅ **v1.0 Core Platform** — L1→L8 (shipped 2026-05-29)
- ✅ **v1.1 L9 Stripe Billing** — Phases 3→7 (shipped 2026-06-16)
- ✅ **v1.2 Pioneer Program & Production Go-Live** — Phases 8→11 (shipped 2026-07-01, Phase 8 parked as known gap — see MILESTONES.md)
- ✅ **v1.3 App Client Mobile** — Phases 12→17 (shipped 2026-07-08, MSTORE-02 parked as known gap — see MILESTONES.md)
- 🚧 **v1.4 Maintenance — CLIENT Fixture & Schema Drift** — Phases 18→19 (in progress, started 2026-07-08)

## Phases

<details>
<summary>✅ v1.0 Core Platform (L1–L8) — SHIPPED 2026-05-29</summary>

- [x] L1: Auth garage (login/logout/JWT)
- [x] L2: Devis client + validation/refus
- [x] L3a: OR backend + frontend
- [x] L3c: Catalogue pièces + scanner EAN-13
- [x] L4 + L4v2: RBAC 4 niveaux + hardening
- [x] L7b: Auth client + email Resend
- [x] L8: Liaison polymorphe moto

</details>

<details>
<summary>✅ v1.1 L9 Stripe Billing (Phases 3–7) — SHIPPED 2026-06-16</summary>

- [x] Phase 3: DB Foundation + Stripe Dashboard Setup — Migration 15 + 6 Price IDs
- [x] Phase 4: Webhook Infrastructure — 7 events, state machine, idempotency
- [x] Phase 5: Checkout + Trial Flow — trial 14j sans CB, auto-trial, email confirm
- [x] Phase 6: Plan Limit Enforcement — HTTP 402, BILLING_ENFORCE flag
- [x] Phase 7: Self-Service Portal + Billing UI — Customer Portal, emails, section Abonnement

See [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v1.2 Pioneer Program & Production Go-Live (Phases 8–11) — SHIPPED 2026-07-01</summary>

- [ ] Phase 8: Stripe Live Mode — ⏸️ PARKED (known gap — 08-01 script done, 08-02 operational cutover not executed, blocked on human Stripe Dashboard action)
- [x] Phase 9: Pioneer Program — coupon PIONEER2026, 3 mois gratuits + prix bloqué 24 mois + compteur 30 places (completed 2026-06-30)
- [x] Phase 10: Live Operations — enforcement quotas + emails annulation/bienvenue (completed 2026-06-29)
- [x] Phase 11: Dashboard UX Alerts — badge rouge score + alerte kilométrage (completed 2026-06-30)

See [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md) for full details, [milestones/v1.2-MILESTONE-AUDIT.md](milestones/v1.2-MILESTONE-AUDIT.md) for the audit report.

</details>

<details>
<summary>✅ v1.3 App Client Mobile (Phases 12–17) — SHIPPED 2026-07-08</summary>

**Milestone Goal:** Les clients moto disposent d'une app mobile native (React Native/Expo) pour gérer leur moto, leurs devis et recevoir des notifications push — en complément de `MotoKey_Client.html`, sans changement au backend/web existant hors nouvelle surface push.

- [x] Phase 12: Backend Push Foundation — Device tokens + profil client exposés via API, curl-testable sans app mobile (completed 2026-07-01)
- [x] Phase 13: Push Dispatch Service — Service d'envoi de push modelé sur emailService.js, testable indépendamment (completed 2026-07-02)
- [x] Phase 14: RN App Scaffolding + Native Auth — Scaffold Expo Router + authentification native sécurisée (completed 2026-07-03, MAUTH-03 live device proof closed 2026-07-08)
- [x] Phase 15: Feature-Parity Screens — Motos, devis, historique, liaison garage — parité MotoKey_Client.html (completed 2026-07-04)
- [x] Phase 16: Push Wiring End-to-End — Soft-ask, enregistrement token, push devis reçu, deep link (completed 2026-07-05, live device delivery closed 2026-07-08)
- [x] Phase 17: Maintenance Alert Cron + App Store Submission — Push rappel entretien + soumission stores (completed 2026-07-06, MSTORE-02 parked as known gap)

See [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md) for full details, [milestones/v1.3-MILESTONE-AUDIT.md](milestones/v1.3-MILESTONE-AUDIT.md) for the audit report.

</details>

### 🚧 v1.4 Maintenance — CLIENT Fixture & Schema Drift (Phases 18–19) — IN PROGRESS

**Milestone Goal:** Close the two carried-forward known gaps that are pure engineering debt with no external blocker, distinct from Phase 8/BILL-06 and MSTORE-02 which remain blocked on Mehdi's external account actions.

- [x] **Phase 18: CLIENT Login Fixture Fix** - Fix `setup-supabase.js` so the `sophie@email.com` CLIENT fixture has a matching Supabase Auth user and can log in (completed 2026-07-08)
- [x] **Phase 19: Schema.sql Regeneration** - Regenerate `schema.sql` from live prod Supabase schema to reflect migrations 1–19 (narrowed scope — full 38-table parity deferred, see REQUIREMENTS.md) (completed 2026-07-09)

## Phase Details

### Phase 18: CLIENT Login Fixture Fix
**Goal**: Developer/QA can log in as the CLIENT test fixture and receive a valid session, mirroring the existing garage account creation pattern.
**Depends on**: Nothing (independent maintenance fix, isolated to `setup-supabase.js` / seed data)
**Requirements**: CFIX-01
**Success Criteria** (what must be TRUE):
  1. Running `setup-supabase.js` creates (or confirms) a Supabase Auth user for `sophie@email.com`, mirroring the existing garage account creation pattern.
  2. The `clients` table row for `sophie@email.com` has `auth_user_id` populated and correctly linked to that Supabase Auth user.
  3. `POST /auth/client/login` with `sophie@email.com` / `client123` returns 200 with a valid session token (no longer 401).
  4. `test-api.js` (and any other script depending on this fixture) no longer fails on the CLIENT login step.
**Plans**: 1 plan
- [x] 18-01-PLAN.md — Create Sophie's Supabase Auth user + link `auth_user_id` in `setup-supabase.js`, verify CLIENT login returns 200

### Phase 19: Schema.sql Regeneration
**Goal**: A developer can bootstrap a fresh Supabase project from `schema.sql` and get a schema matching prod **for the known-tracked drift** (migrations 1–19), with no manual patching required. Full 38-table parity is explicitly out of scope for v1.4 — see REQUIREMENTS.md Out of Scope (narrowed 2026-07-08 after 19-RESEARCH.md found ~19 additional untracked live tables).
**Depends on**: Nothing (independent maintenance fix, isolated to `schema.sql`, touches no runtime code)
**Requirements**: SCHEMA-01
**Success Criteria** (what must be TRUE):
  1. `schema.sql` includes `CREATE TABLE` statements for `client_device_tokens`, `push_send_log`, and `garage_users` (currently entirely absent).
  2. `schema.sql` includes the moto maintenance-tier columns added by migration 18, and the `clients` `UNIQUE(email, garage_id)` constraint added by migration 19.
  3. `schema.sql`'s devis status constraint documents the exact live CHECK constraint values (confirmed via `pg_get_constraintdef`, not guessed from application code), replacing the stale `statut_devis` ENUM (`brouillon`/`envoye`/`valide`/`annule`) documentation.
  4. `schema.sql`'s header comment explicitly documents that it is a known-partial bootstrap (does not cover the ~19 untracked live tables — repair orders, billing/invoicing, parts catalogue, separate client-auth system).
  5. Executing `schema.sql` against a fresh Supabase project produces tables/columns matching prod for all objects introduced by migrations 1–19, with no errors (verified via manual bootstrap — no local Postgres/CLI available in this environment).
**Plans**: 3 plans
- [x] 19-01-PLAN.md — Capture ground truth: introspection script + verbatim devis.statut CHECK constraint + RLS state of the 3 new tables (Dashboard query)
- [x] 19-02-PLAN.md — Regenerate schema.sql: add garage_users/client_device_tokens/push_send_log, motos mig-18 columns, clients mig-19 UNIQUE, devis.statut ENUM→CHECK, partial-bootstrap header
- [x] 19-03-PLAN.md — Verify bootstrap: run schema.sql in a fresh Supabase project (human) + automated in-scope diff vs prod

## Progress

**Execution Order:**
Phases execute in numeric order: 18 → 19 (no dependency between them — independent files, can also run in either order or in parallel)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| L1–L8 | v1.0 | — | ✅ Complete | 2026-05-29 |
| Phase 3 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 4 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 5 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 6 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 7 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 8 | v1.2 | 1/2 | ⏸️ Parked (known gap) | - |
| Phase 9 | v1.2 | 1/1 | ✅ Complete | 2026-06-30 |
| Phase 10 | v1.2 | 2/2 | ✅ Complete | 2026-06-29 |
| Phase 11 | v1.2 | 2/2 | ✅ Complete | 2026-06-30 |
| Phase 12 | v1.3 | 2/2 | ✅ Complete | 2026-07-01 |
| Phase 13 | v1.3 | 2/2 | ✅ Complete | 2026-07-02 |
| Phase 14 | v1.3 | 4/4 | ✅ Complete | 2026-07-03 |
| Phase 15 | v1.3 | 9/9 | ✅ Complete | 2026-07-04 |
| Phase 16 | v1.3 | 4/4 | ✅ Complete | 2026-07-05 |
| Phase 17 | v1.3 | 4/4 | ✅ Complete (MSTORE-02 parked, known gap) | 2026-07-06 |
| Phase 18 | v1.4 | 1/1 | ✅ Complete | 2026-07-08 |
| Phase 19 | v1.4 | 3/3 | ✅ Complete | 2026-07-09 |

---
*Roadmap updated: 2026-07-09 — Phase 19 complete, SCHEMA-01 satisfied (5/5 must-haves verified). v1.4 milestone complete.*
