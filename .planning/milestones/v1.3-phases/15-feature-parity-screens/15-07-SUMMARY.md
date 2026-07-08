---
phase: 15-feature-parity-screens
plan: 07
subsystem: ui
tags: [expo-router, react-native, forms, garage-liaison, plan-limit]

# Dependency graph
requires:
  - phase: 15-feature-parity-screens (15-02)
    provides: garageLiaison.ts payload builders/validators/parsers (parseLimite, validateAddMoto, buildAddMotoPayload, validateClaim, buildClaimPayload)
  - phase: 15-feature-parity-screens (15-03)
    provides: Motos nested Stack (mobile-app/app/(app)/(tabs)/motos/_layout.tsx) that add.tsx/claim.tsx are registered under
  - phase: 15-feature-parity-screens (15-04)
    provides: TextField/Button/Toast components reused verbatim
provides:
  - "mobile-app/app/(app)/(tabs)/motos/add.tsx: Ajouter une moto form gated by GET /client/limite-motos, Passer Pro CTA when limit reached"
  - "mobile-app/app/(app)/(tabs)/motos/claim.tsx: Réclamer une moto form (VIN+plaque only), disabled-photo notice per D-02"
affects: [15-08 (réclamations/garages list screens link to these two forms via the Motos tab menu)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Plan-limit gate pattern: fetch limite endpoint on mount, parse via parseLimite, conditionally render form vs Passer Pro CTA card (no Picker dependency installed — mode_acquisition uses a Pressable chip row instead)"

key-files:
  created:
    - mobile-app/app/(app)/(tabs)/motos/add.tsx
    - mobile-app/app/(app)/(tabs)/motos/claim.tsx
  modified: []

key-decisions:
  - "mode_acquisition selector implemented as a horizontal wrap of Pressable chips (no @react-native-picker/picker dependency present in package.json/node_modules) rather than a native Picker, per plan's explicit fallback instruction"
  - "Worktree branch was 3 merge-commits behind master (missing Wave 1/2 15-01..15-04) at start — fast-forward merged local master into the worktree branch before starting Task 1 to pick up garageLiaison.ts, TextField/Button/Toast, and the Motos nested Stack"
  - "mobile-app had no node_modules installed in this worktree — ran `npm install --legacy-peer-deps` (matches Phase 14-01 convention) before tsc/jest could run"

patterns-established:
  - "Plan-limit gate pattern (fetch-then-branch-render) for any future screen needing quota-based CTA gating"

requirements-completed: [MPARITY-04]

# Metrics
duration: ~20min
completed: 2026-07-03
---

# Phase 15 Plan 07: Add-moto + Claim-moto forms Summary

**Two garage/moto-linkage screens (`motos/add.tsx`, `motos/claim.tsx`) reached from the Motos tab menu — free-form manual add gated by the plan limit with a "Passer Pro" CTA, and orphan-moto claim via VIN+plaque with photo upload disabled per D-02 — porting MotoKey_Client.html's renderAddMotoTab/submitAddMoto and renderClaimTab/submitClaim onto the Wave 1-2 garageLiaison.ts contracts.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 2 created

## Accomplishments
- `add.tsx`: fetches `GET /client/limite-motos`, parses via `parseLimite`, and either renders the "Passer Pro" CTA card (👑 + copy + disabled button) when `!lim.can_add`, or the full add-moto form (marque/modèle/année/km/plaque/VIN + mode d'acquisition chips) that validates client-side (`validateAddMoto`), posts `buildAddMotoPayload` to `POST /client/motos`, handles HTTP 402 with the exact inline error copy, and routes back to the motos list on success.
- `claim.tsx`: VIN + plaque form only, with a static disabled-photo notice replacing any file/camera input, validates via `validateClaim`, posts `buildClaimPayload` (which owns the `pending_manual_verification` literal) to `POST /client/reclamations`, and routes to `motos/reclamations` on success.
- Both screens use `Stack.Screen options={{ title }}` headers, `ScrollView` layout, and the existing `TextField`/`Button`/`showToast` component contracts verbatim — no new shared components needed.

## Task Commits

1. **Task 1: Ajouter une moto (add.tsx)** - `489847b` (feat)
2. **Task 2: Réclamer une moto (claim.tsx)** - `00d228d` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `mobile-app/app/(app)/(tabs)/motos/add.tsx` - plan-limit-gated add form + Passer Pro CTA
- `mobile-app/app/(app)/(tabs)/motos/claim.tsx` - VIN+plaque claim form with disabled-photo notice

## Decisions Made
- mode_acquisition rendered as Pressable chips (no Picker dependency installed) — matches the plan's documented fallback path exactly.
- Fast-forward merged local `master` into the worktree branch before Task 1 (worktree started 3 merge-commits behind, missing 15-01/02/03/04's garageLiaison.ts, TextField/Button/Toast, and the Motos Stack layout this plan depends on).
- Ran `npm install --legacy-peer-deps` in mobile-app (node_modules was absent in this fresh worktree) to unblock `tsc --noEmit` and `jest`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branch behind master, missing Wave 1-2 dependencies**
- **Found during:** Pre-Task-1 setup
- **Issue:** Worktree branch `worktree-agent-a9b6eec0461a26b82` was still at commit `4ca62da` (pre-Wave-1), while local `master` had advanced to `fdbeca0` (15-01 through 15-04 merged). `mobile-app/lib/garageLiaison.ts`, the Motos nested Stack, and the shared components this plan's interfaces contract depends on did not exist in the worktree.
- **Fix:** `git merge master --no-edit` (fast-forward) in the worktree before starting Task 1.
- **Files modified:** none directly (pulled in 24 files from the 4 prior merge commits)
- **Verification:** `mobile-app/lib/garageLiaison.ts` and `mobile-app/app/(app)/(tabs)/motos/_layout.tsx` present after merge; `git log --oneline -3` showed the fast-forward.
- **Committed in:** merge commit (fast-forward, no new commit hash — `HEAD` advanced to `fdbeca0`)

**2. [Rule 3 - Blocking] mobile-app node_modules absent in worktree**
- **Found during:** Pre-verification (before running `tsc --noEmit`)
- **Issue:** `npx tsc --noEmit` failed with "This is not the tsc command you are looking for" — no `node_modules` directory existed in this worktree's `mobile-app/`.
- **Fix:** Ran `npm install --legacy-peer-deps` in `mobile-app/` (892 packages installed, matches Phase 14-01's documented `--legacy-peer-deps` convention for this project).
- **Files modified:** `mobile-app/package-lock.json` (trivial `devOptional`→`dev` metadata normalization only, no dependency version changes; left uncommitted as out-of-scope/generated noise)
- **Verification:** `npx tsc --noEmit` exits 0; `npx jest --silent` → 8 suites / 104 tests passed.
- **Committed in:** N/A (node_modules is gitignored; package-lock.json diff is trivial and was not committed, per scope-boundary guidance)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - Blocking, both environment/worktree-setup issues, no code-logic deviations)
**Impact on plan:** No scope creep — both fixes were prerequisites to reach a runnable/verifiable state; the plan's actual task instructions were followed exactly as written.

## Issues Encountered
None beyond the two blocking/setup issues documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MPARITY-04's add + claim halves are complete; 15-08 (réclamations/garages list screens) is the remaining half of MPARITY-04 and is expected to link to these two screens from the Motos tab menu.
- `cd mobile-app && npx tsc --noEmit` exits 0 and `npx jest --silent` is green (104/104) as of this plan's completion — no new failures introduced.
- Manual/human verification (from Motos menu → Ajouter → fill form → moto appears in list; hit limit → Passer Pro block; Réclamer → VIN+plaque → réclamation created) is deferred to the phase-level checkpoint per the plan's `<verification>` section — not exercised in this automated run.

---
*Phase: 15-feature-parity-screens*
*Completed: 2026-07-03*

## Self-Check: PASSED

- FOUND: mobile-app/app/(app)/(tabs)/motos/add.tsx
- FOUND: mobile-app/app/(app)/(tabs)/motos/claim.tsx
- FOUND: commit 489847b (Task 1)
- FOUND: commit 00d228d (Task 2)
