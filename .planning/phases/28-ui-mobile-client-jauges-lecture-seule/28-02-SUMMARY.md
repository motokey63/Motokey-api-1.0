---
phase: 28-ui-mobile-client-jauges-lecture-seule
plan: 02
subsystem: ui
tags: [react-native, expo, typescript, mobile, gauges]

# Dependency graph
requires:
  - phase: 28-ui-mobile-client-jauges-lecture-seule (plan 01)
    provides: "etatColor()/CONSO_LABELS/ETAT_WORDING, ConsommableJauge type + parseConsommables(), read-only GaugeBar component"
provides:
  - "Fiche Moto screen (motos/[id].tsx) wired to GET /motos/:id/consommables as a 4th parallel fetch"
  - "General weakest-link gauge pill rendered near the score header"
  - "Usure des Consommables section rendering one GaugeBar per consommable (up to 9)"
  - "Legacy Pneumatiques section fully removed from mobile Fiche Moto"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mobile Fiche Moto load() now does 4 parallel apiGet calls (moto/interventions/alertes/consommables) via a single Promise.all, mirroring the web client's fetch-then-parse pattern"

key-files:
  created: []
  modified:
    - "mobile-app/app/(app)/(tabs)/motos/[id].tsx"

key-decisions:
  - "Empty-state wording is 'Pas encore suivi' WITHOUT the web's 'ajoutez une photo' call-to-action, since mobile has no upload affordance this milestone (D-04) — pointing the user at a non-existent action was deliberately avoided"
  - "Checkpoint (Task 2) verified on-device by Mehdi after a full npm install (node_modules had been empty in this worktree) — approved: general gauge pill, 9-row gauges section, and absence of Pneumatiques all confirmed live"

patterns-established: []

requirements-completed: [GAUGE-05, GAUGE-06]

# Metrics
duration: 12min
completed: 2026-07-16
---

# Phase 28 Plan 02: Mobile Gauges Screen Wiring Summary

**Fiche Moto screen (`motos/[id].tsx`) now fetches `GET /motos/:id/consommables`, renders a general weakest-link gauge pill near the score and a 9-row "Usure des Consommables" section, with the legacy Pneumatiques block fully removed — human-verified on device.**

## Performance

- **Duration:** 12 min (Task 1 execution) + human verification turnaround
- **Started:** 2026-07-16T10:25:22Z (approx, continuing from 28-01)
- **Completed:** 2026-07-16 (checkpoint approved)
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify)
- **Files modified:** 1

## Accomplishments
- `motos/[id].tsx` extended to a 4th parallel `apiGet('/motos/' + id + '/consommables')` call in `load()`, parsed via `parseConsommables()` from 28-01
- General "État général : …" pill rendered contiguous with the score header, using `ETAT_WORDING`/`etatColor()`, with a distinct "Pas encore suivi" empty state (no upload CTA — mobile read-only)
- New "Usure des Consommables" section renders one `GaugeBar` per consommable item (label via `CONSO_LABELS`, `pct_usure`, `etat`, `has_data`)
- Legacy `showPneus`/Pneumatiques JSX block and its underlying condition fully deleted — pneu_av/pneu_ar wear is now shown exclusively via their `GaugeBar` rows in the new section
- Deep link (`moto_entretien` push → `motos/[id]`) confirmed unchanged (D-04, no code touched) — still covered by the existing `useNotificationObserver` route test
- On-device human verification (checkpoint Task 2): Mehdi ran `npm install` (worktree `node_modules` was empty) then `npx expo start`, confirmed the general gauge pill, the 9-row gauges section, absence of the Pneumatiques section, and no issues reported

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire consommables fetch + general gauge + gauges section into [id].tsx, remove Pneumatiques** - `53412c4` (feat)
2. **Task 2: Human verify — on-device gauges + rappel deep link** - checkpoint, no code commit (approved by Mehdi, see Decisions)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `mobile-app/app/(app)/(tabs)/motos/[id].tsx` - Added consommables fetch, general gauge pill, "Usure des Consommables" GaugeBar section; removed legacy Pneumatiques block

## Decisions Made
- Empty-state wording for the general gauge intentionally drops the web's "— ajoutez une photo pour lancer le suivi d'usure" clause (mobile is read-only, D-04) — see plan `<action>` step 4 for the exact rationale.
- Checkpoint resolved via human on-device verification rather than automated screenshot/emulator check — no on-device access available to the executor agent; Mehdi's "approved" response is authoritative per the plan's `<resume-signal>`.

## Deviations from Plan

None - plan executed exactly as written. (Task 1 code changes match the plan's `<action>` spec verbatim: imports, state, 4th fetch, general gauge, gauges section, Pneumatiques removal, styles.)

## Issues Encountered
- The verification worktree's `mobile-app/node_modules` was empty when Mehdi went to run the app for the checkpoint (a known state carried over from 28-01, where it had been junction-linked rather than fully installed) — resolved by Mehdi running a full `npm install` before `npx expo start`. No code changes required; this is an environment-only note, not a plan deviation.
- `mobile-app/package-lock.json` shows a residual local diff (3 `dev`→`devOptional` flips on `@types/react`/`csstype`/`typescript`) as a byproduct of that `npm install` under a different npm version. This is out-of-scope lockfile noise unrelated to plan 28-02's `files_modified` and was left uncommitted.

## User Setup Required

None - no external service configuration required. On-device verification (already completed by Mehdi) required no additional environment variables or dashboard steps beyond the `npm install` noted above.

## Next Phase Readiness
- GAUGE-05/GAUGE-06 complete: mobile client sees the same per-consommable gauges and general weakest-link gauge as the web client, read-only, with the existing push deep link landing on this screen.
- **Phase 28 complete (2/2 plans).** This is the last phase of milestone v1.6 (Suivi usure consommables + anti-fraude km) per PROJECT.md phase order.
- Remaining known gaps carried forward (unrelated to this phase): Cloudinary credentials still not provisioned (blocks real photo upload end-to-end in prod), migration `25_migrate_pneus_to_consommables.sql` still pending manual application in prod by Mehdi.
- Residual `mobile-app/package-lock.json` local diff (see Issues Encountered) — cosmetic, not committed, no action required unless it recurs and causes lockfile conflicts.

---
*Phase: 28-ui-mobile-client-jauges-lecture-seule*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: mobile-app/app/(app)/(tabs)/motos/[id].tsx
- FOUND: commit 53412c4 (Task 1)
