---
phase: 15-feature-parity-screens
plan: 05
subsystem: ui
tags: [react-native, expo-router, flatlist, asyncstorage-cache, offline-fallback]

# Dependency graph
requires:
  - phase: 15-feature-parity-screens (Waves 1-2, plans 15-01/02/03/04)
    provides: motoParse/motoDisplay/cache logic modules, ScoreBadge/StatutBadge/EmptyState/OfflineBanner/MotoListCard components, Tabs+nested Motos Stack navigation shell
provides:
  - Motos tab list screen (mobile-app/app/(app)/(tabs)/motos/index.tsx) — fetch+enrich+cache+empty-state+secondary-flow menu
  - Fiche Moto detail screen (mobile-app/app/(app)/(tabs)/motos/[id].tsx) — historique + plan d'entretien (403-hidden) + pneus
affects: [15-06-devis-tab, 15-07-add-claim-motos, 15-08-reclamations-garages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only offline cache gated strictly on shouldServeCache(status===0), never on generic !ok, to avoid masking real auth/RBAC errors with stale data"
    - "403-hides-section discipline: parseAlertes returning null (RBAC 403) or an empty array omits the Plan d'entretien section entirely — not an error state, not an empty state"
    - "List/detail split (D-04): list screen stays lightweight (identity+score+couleur), detail screen re-fetches fresh and is online-only (no cache, D-09)"

key-files:
  created:
    - mobile-app/app/(app)/(tabs)/motos/index.tsx
    - mobile-app/app/(app)/(tabs)/motos/[id].tsx
  modified: []

key-decisions:
  - "Secondary garage/moto flows (Ajouter/Réclamer/Mes réclamations/Mes garages) surfaced as a ghost-button row above the Motos list (D-05), rather than a native header menu, for simplicity and tsc-clean typed-route pushes"
  - "Fiche Moto detail re-fetches independently of the list's enriched cache entry (D-09) — simpler data flow, no prop-drilling of stale enriched data between screens"

patterns-established:
  - "Pattern 3 (RESEARCH): cache-on-failure — apiGet then setCached() on success, getCached()+staleSince banner on status===0, real error surfaced otherwise"

requirements-completed: [MPARITY-01, MPARITY-03, MPARITY-05]

# Metrics
duration: 25min
completed: 2026-07-03
---

# Phase 15 Plan 05: Motos Tab (List + Fiche Moto Detail) Summary

**Motos tab ported from MotoKey_Client.html's loadMotos()/renderMotoCard(): a lightweight FlatList of couleur/score cards with read-only AsyncStorage offline fallback, and a separate online-only Fiche Moto detail screen with historique interventions, a 403-hides-section plan d'entretien, and pneumatiques.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-03T20:05:00Z (approx, worktree merge + context read)
- **Completed:** 2026-07-03T20:30:00Z (approx)
- **Tasks:** 2 completed
- **Files modified:** 2 created

## Accomplishments
- Motos list tab: `GET /motos` fetched and enriched per-moto (parallel `/interventions` + `/entretien/alertes`), cached via `setCached(CACHE_KEY_MOTOS, ...)`, with offline fallback strictly gated on `shouldServeCache(status===0)` — never masking a real 401/403/500 with stale data
- Empty-state CTAs ("Ajouter ma moto" / "Réclamer une moto") and a ghost-button menu row linking to the four secondary flows (`add`, `claim`, `reclamations`, `garages`) reached via stack push under the Motos tab (D-05)
- Fiche Moto detail screen: online-only (D-09, no cache), shows identity + `<ScoreBadge size="lg">`, garage de référence, historique d'interventions (with inline empty copy when zero), plan d'entretien (rendered ONLY when `alertes && alertes.length > 0` — a 403 for CLIENT or an empty array silently omits the section, matching `MotoKey_Client.html`'s `// null = non accessible (403 RBAC) → section masquée` discipline exactly), and pneumatiques (conditional on `pneu_av`/`pneu_ar`)
- `cd mobile-app && npx tsc --noEmit` exits 0 (zero errors, including the previously-known transient error on `app/_layout.tsx`'s redirect to `/(app)/(tabs)/motos` — now resolved since `motos/index.tsx` exists)
- `cd mobile-app && npm test` — 8 suites / 104 tests, all green (no regressions to Wave 1 logic modules)

## Task Commits

Each task was committed atomically:

1. **Task 1: Motos list tab (fetch + enrich + cache + empty state + secondary-flow menu)** - `638011a` (feat)
2. **Task 2: Fiche Moto detail (historique + plan d'entretien 403-hidden + pneus)** - `eaa0f91` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `mobile-app/app/(app)/(tabs)/motos/index.tsx` - Motos list: FlatList+RefreshControl, per-moto enrich (interventions+alertes), AsyncStorage cache fallback, empty state, secondary-flow menu row
- `mobile-app/app/(app)/(tabs)/motos/[id].tsx` - Fiche Moto detail: header (identity+ScoreBadge lg), garage de référence, historique interventions, plan d'entretien (403-hidden), pneumatiques; online-only with Réessayer retry on network failure

## Decisions Made
- Ported `loadMotos()`'s parallel per-moto enrichment (`Promise.all` over `/interventions` + `/entretien/alertes`) verbatim rather than lazy-loading on card tap, to keep the AsyncStorage cache entry fully self-contained for offline rendering
- Detail screen does not receive the list's already-enriched moto via navigation params — it always re-fetches by `id`, since D-09 scopes it as online-only and the simpler independent-fetch flow avoids stale-prop edge cases
- Secondary-flow navigation targets (`/(app)/(tabs)/motos/add`, `/claim`, `/reclamations`, `/garages`) are the routes plans 15-07/15-08 will create — this plan only wires the `router.push` calls, consistent with the plan's stated file scope (no cross-plan file creation)

## Deviations from Plan

None - plan executed exactly as written. One environment prerequisite was handled (not a deviation from the plan's content): `mobile-app/node_modules` was absent in this worktree (fresh worktree checkout), so `npm install --legacy-peer-deps` was run before `tsc`/`jest` could execute — this regenerated `package-lock.json` with a cosmetic `devOptional`→`dev` flag normalization from a newer local npm, which was reverted (`git checkout -- mobile-app/package-lock.json`) before committing, since it was unrelated dependency-metadata churn, not a real dependency change.

## Issues Encountered
- This worktree branch had diverged from `master` before Waves 1-2 (15-01 through 15-04) were merged upstream — `git merge master --no-edit` (fast-forward) was run first to pull in `lib/motoParse.ts`, `lib/motoDisplay.ts`, `lib/cache.ts`, `components/{MotoListCard,EmptyState,OfflineBanner,ScoreBadge,StatutBadge}.tsx`, and the `(tabs)` navigation shell this plan depends on. No conflicts; fast-forward only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `motos/index.tsx` and `motos/[id].tsx` are ready for Plans 15-07/15-08 to add the sibling routes they link to (`add.tsx`, `claim.tsx`, `reclamations.tsx`, `garages.tsx`) — those files don't exist yet, so the ghost-button menu's `router.push` targets will 404 until those plans land (expected, no cross-plan scope violation)
- `tsc --noEmit` is fully clean across the whole `mobile-app` project, including the previously-known transient Expo Router typed-routes error on `app/_layout.tsx`'s `/(app)/(tabs)/motos` redirect — confirmed resolved now that `motos/index.tsx` exists
- MPARITY-01, MPARITY-03, and MPARITY-05 are code-complete; human/manual verification of the plan-d'entretien 403-hidden behavior and airplane-mode cache banner is deferred to the phase-level checkpoint (per this plan's own `<verification>` section, not a per-plan checkpoint)

---
*Phase: 15-feature-parity-screens*
*Completed: 2026-07-03*

## Self-Check: PASSED

- FOUND: mobile-app/app/(app)/(tabs)/motos/index.tsx
- FOUND: mobile-app/app/(app)/(tabs)/motos/[id].tsx
- FOUND commit: 638011a
- FOUND commit: eaa0f91
