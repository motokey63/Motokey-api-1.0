---
phase: 15
slug: feature-parity-screens
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-03
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 via `jest-expo@~54.0.17` preset |
| **Config file** | `mobile-app/package.json` (`"jest"` key) |
| **Quick run command** | `cd mobile-app && npx jest lib/__tests__/<touched-module>.test.ts` |
| **Full suite command** | `cd mobile-app && npm test` |
| **Estimated runtime** | ~5 seconds (pure-logic unit tests, no component rendering) |

---

## Sampling Rate

- **After every task commit:** Run `cd mobile-app && npx jest lib/__tests__/<touched-module>.test.ts`
- **After every plan wave:** Run `cd mobile-app && npm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green, plus a human-verification pass on a real device covering the 5 MPARITY success criteria (per Phase 14's established checkpoint pattern)
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-0X-XX | TBD | 0 | MPARITY-01 | unit | `npx jest lib/__tests__/motoDisplay.test.ts` | ❌ W0 | ⬜ pending |
| 15-0X-XX | TBD | 0 | MPARITY-02 | unit | `npx jest lib/__tests__/devisDisplay.test.ts` | ❌ W0 | ⬜ pending |
| 15-0X-XX | TBD | 0 | MPARITY-03 | unit | `npx jest lib/__tests__/ficheMoto.test.ts` | ❌ W0 | ⬜ pending |
| 15-0X-XX | TBD | 0 | MPARITY-04 | unit | `npx jest lib/__tests__/garageLiaison.test.ts` | ❌ W0 | ⬜ pending |
| 15-0X-XX | TBD | 0 | MPARITY-05 | unit | `npx jest lib/__tests__/cache.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Exact Task IDs assigned once the planner creates PLAN.md files — this map anchors each requirement to a pure-logic-module test target from RESEARCH.md's Phase Requirements → Test Map.*

---

## Wave 0 Requirements

- [ ] `lib/cache.ts` + `lib/__tests__/cache.test.ts` — `getCached`/`setCached` round-trip, fallback triggers only on `status === 0` (network failure), not on other `!ok` statuses. Covers MPARITY-05.
- [ ] `lib/motoDisplay.ts` + `lib/__tests__/motoDisplay.test.ts` — `couleur_dossier` → theme color mapping for all 4 values (vert/bleu/jaune/rouge). Covers MPARITY-01.
- [ ] `lib/devisDisplay.ts` + `lib/__tests__/devisDisplay.test.ts` — statut label/color lookup for `envoye/valide/refuse/brouillon`, sane fallback for unknown statuts. Covers MPARITY-02.
- [ ] `lib/__tests__/ficheMoto.test.ts` — interventions parsing (`data.interventions` array), alertes 403 → `null` (section hidden per the RBAC gap, not an error state). Covers MPARITY-03.
- [ ] `lib/__tests__/garageLiaison.test.ts` — add-moto/claim/reclamations/garages payload shaping, plan-limit CTA branch logic. Covers MPARITY-04.

No new test framework/config needed — the existing `jest-expo` preset already covers this file layout (per Phase 14 precedent: `lib/__tests__/api.test.ts`, `session.test.ts`, `secureStore.test.ts`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Motos tab renders list with correct couleur/score, tap navigates to Fiche Moto | MPARITY-01 | No RN component-testing library installed (`@testing-library/react-native`); no prior precedent in this project (Phase 14 used the same manual-checkpoint approach for auth screens) | On device/simulator: open Motos tab, confirm each moto card shows couleur-coded score badge; tap a card, confirm navigation to Fiche Moto detail |
| Devis screen accept/refuse updates state and list | MPARITY-02 | Same — screen/navigation rendering is manual-only this phase | Open Devis tab, accept one `envoye` devis, confirm statut updates to "Validé" and action buttons disappear; repeat for refuse |
| Fiche Moto shows historique + plan d'entretien (or gracefully hides plan section on 403) + pneus | MPARITY-03 | Same, plus depends on live backend RBAC response for the CLIENT role on `/entretien/alertes` | Open a moto's Fiche Moto screen; confirm interventions list renders; confirm plan d'entretien section either renders (if RBAC allows) or is cleanly absent (if 403) — no error toast either way; confirm pneus section renders if `pneu_av`/`pneu_ar` present |
| Add moto / claim moto / leave garage flows | MPARITY-04 | Same — form submission + navigation is manual-only this phase | From Motos tab menu: add a moto manually and confirm it appears in the list; submit a moto claim (VIN+plaque only, no photo) and confirm it appears in réclamations; leave a linked garage and confirm the revoke modal + legal notice + statut update to "Quitté" |
| Offline fallback shows cached motos/devis with timestamp | MPARITY-05 | Requires simulating actual network failure on device, not unit-testable in isolation from the screen | Load Motos/Devis online once (populates cache), then disable network (airplane mode) and reopen the app; confirm cached data displays with a visible "dernière mise à jour" timestamp instead of an error |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (5 new `lib/*.ts` modules + their tests)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
