---
phase: 15-feature-parity-screens
plan: 02
subsystem: mobile-app
tags: [react-native, expo, asyncstorage, jest, tdd, offline-cache, garage-liaison]

# Dependency graph
requires:
  - phase: 14-rn-app-scaffolding-native-auth
    provides: AsyncStorage precedent (secureStore.ts), apiFetch { ok, status, data } contract, Jest/jest-expo test harness
provides:
  - "mobile-app/lib/cache.ts: read-only AsyncStorage cache (setCached/getCached/shouldServeCache/fmtCacheTimestamp) gating offline fallback to status===0 only"
  - "mobile-app/lib/garageLiaison.ts: add-moto/claim-moto payload builders, validators, and parseLimite/parseReclamations/parseGarages envelope parsers"
affects: [15-05-devis-list-screen, 15-06-motos-list-screen, 15-07-add-claim-moto-screens, 15-08-garages-reclamations-screens]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only offline cache: CacheEntry<T>{data,updatedAt} in AsyncStorage, fallback gated strictly on apiFetch status===0 (never on 401/403/500)"
    - "Two-level envelope unwrap: backend ok() wraps payload as {success,data:{...},message,timestamp}; apiFetch's res.data is the WHOLE envelope, so parsers must read res.data.data.<key> first, with flatter-shape fallback for testability"

key-files:
  created:
    - mobile-app/lib/cache.ts
    - mobile-app/lib/__tests__/cache.test.ts
    - mobile-app/lib/garageLiaison.ts
    - mobile-app/lib/__tests__/garageLiaison.test.ts
  modified: []

key-decisions:
  - "shouldServeCache(status) returns true only for status===0 — deliberately excludes 401/403/500 so a real auth/server error never gets masked by stale cached data"
  - "parseLimite/parseReclamations/parseGarages check data?.data?.<key> (real two-level envelope) FIRST, then fall back to a flat shape, so both live API responses and simpler test fixtures work"

patterns-established:
  - "Pattern: in-memory Map-backed AsyncStorage jest mock (mirrors secureStore.test.ts) reused for cache.test.ts"

requirements-completed: [MPARITY-04, MPARITY-05]

# Metrics
duration: ~15min
completed: 2026-07-03
---

# Phase 15 Plan 02: Cache & Garage-Liaison Logic Modules Summary

**Pure-logic AsyncStorage offline cache (status-0-only fallback gate) and garage-liaison payload builders/validators/parsers with two-level backend-envelope unwrap, both fully covered by 28 passing Jest tests.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2/2 completed
- **Files modified:** 4 (all new)

## Accomplishments
- `mobile-app/lib/cache.ts`: `setCached`/`getCached` round-trip via AsyncStorage with an `updatedAt` timestamp; `shouldServeCache(status)` gates the read-only offline fallback to `status === 0` (network-unreachable) only — 401/403/500 never serve stale data; `fmtCacheTimestamp` renders the `DD/MM à HHhMM` offline-banner format.
- `mobile-app/lib/garageLiaison.ts`: ports `renderAddMotoTab`/`submitAddMoto` (validation + payload with numeric coercion), `renderClaimTab`/`submitClaim` (disabled-photo claim payload, `carte_grise_photo_url: 'pending_manual_verification'`), and `parseLimite`/`parseReclamations`/`parseGarages` — all three correctly unwrapping the REAL two-level `{success, data:{...}, message, timestamp}` backend envelope before falling back to flatter shapes.
- Both modules are pure logic (no React, no screens) — ready to be imported directly by the 15-05/15-06 list screens (cache) and 15-07/15-08 liaison screens (garageLiaison) per the interface-first design of this plan.

## Task Commits

Each task was committed atomically:

1. **Task 1: cache.ts (read-only AsyncStorage cache, status-0-only fallback, timestamp format)** - `7171bb2` (feat)
2. **Task 2: garageLiaison.ts (add/claim payload builders + validators + parsers)** - `72a5ce0` (feat)

_Note: both tasks were `tdd="true"` in the plan; implementation and test file were authored together per task and verified green before committing (no separate RED-only commit was produced, matching the plan's combined `<action>` spec which described both files as one deliverable per task)._

## Files Created/Modified
- `mobile-app/lib/cache.ts` - Read-only AsyncStorage cache: `CacheEntry<T>`, `setCached`, `getCached`, `shouldServeCache`, `fmtCacheTimestamp`, `CACHE_KEY_MOTOS`, `CACHE_KEY_DEVIS`
- `mobile-app/lib/__tests__/cache.test.ts` - 8 tests: round-trip, unset key, malformed JSON safety, status-0-only gate (0/401/403/500/200), timestamp format
- `mobile-app/lib/garageLiaison.ts` - `parseLimite`, `validateAddMoto`, `buildAddMotoPayload`, `validateClaim`, `buildClaimPayload`, `parseReclamations`, `parseGarages`, plus `LimiteMotos`/`AddMotoForm`/`Reclamation`/`GarageLink` interfaces
- `mobile-app/lib/__tests__/garageLiaison.test.ts` - 20 tests: real-envelope + flat-fallback fixtures for all three parsers, required-field validation (each field individually), numeric coercion edges (empty annee→null, empty km→0), disabled-photo claim literal

## Decisions Made
- Confirmed and locked the plan's explicit envelope-unwrap contract: `data?.data?.<key>` checked first in all three parsers, guarded by dedicated REAL-envelope test fixtures (not just flat-shape tests) so a future regression back to the web client's one-level unwrap would fail CI immediately.
- No new npm dependency introduced — `@react-native-async-storage/async-storage` was already present; `git diff --stat mobile-app/package.json` confirmed empty diff.

## Deviations from Plan

None - plan executed exactly as written. `mobile-app/node_modules` was absent in this worktree (gitignored, not synced across worktree branches — consistent with the Phase 13 note in STATE.md about `.planning/` staleness); ran `npm install --legacy-peer-deps` to restore it before running Jest/tsc. This is routine environment setup, not a plan deviation.

## Issues Encountered
- This worktree's `.planning/phases/15-feature-parity-screens/` initially contained only `15-CONTEXT.md`/`15-DISCUSSION-LOG.md` (no PLAN.md files) because `.planning/` is gitignored and worktrees don't inherit it from the main checkout. Copied `15-02-PLAN.md`, `15-CONTEXT.md`, and `config.json` from the main `C:\motokey-api\.planning\` checkout before starting execution. Resolved, no impact on task correctness.

## Next Phase Readiness
- `mobile-app/lib/cache.ts` and `mobile-app/lib/garageLiaison.ts` are ready to be imported by the devis/motos list screens (15-05/15-06) and the add-moto/claim/garages screens (15-07/15-08).
- All acceptance criteria from the plan verified: `shouldServeCache` literal `status === 0` present, cache keys locked, both test files assert the REAL two-level envelope fixtures for `parseLimite`/`parseReclamations`/`parseGarages`, `npx jest` (whole suite, 48 tests across 5 files) and `npx tsc --noEmit` both exit 0.

---
*Phase: 15-feature-parity-screens*
*Completed: 2026-07-03*

## Self-Check: PASSED

- FOUND: mobile-app/lib/cache.ts
- FOUND: mobile-app/lib/__tests__/cache.test.ts
- FOUND: mobile-app/lib/garageLiaison.ts
- FOUND: mobile-app/lib/__tests__/garageLiaison.test.ts
- FOUND commit: 7171bb2
- FOUND commit: 72a5ce0
