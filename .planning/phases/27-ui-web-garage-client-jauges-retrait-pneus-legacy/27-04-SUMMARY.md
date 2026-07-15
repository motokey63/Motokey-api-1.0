---
phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy
plan: 04
subsystem: ui
tags: [html, vanilla-js, multipart-upload, consommables, jauges, client-app]

# Dependency graph
requires:
  - phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy (27-02)
    provides: "GET /motos/:id/consommables endpoint (9 typed items + weakest-link jauge_generale), services/jaugeConsommables.js"
provides:
  - "MotoKey_Client.html renders 9 per-consommable gauges + a weakest-link general gauge with public-friendly wording, replacing the legacy Pneumatiques section"
  - "MotoKey_Client.html uploadConsoPhoto/triggerConsoPhoto — raw multipart FormData upload to POST /motos/:id/photos-consommables, wired to a per-consommable 'Ajouter une photo' button"
affects: [28-ui-mobile-client-jauges-lecture-seule]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw fetch() + FormData for multipart uploads in MotoKey_Client.html (first instance outside the existing apiFetch JSON helper) — no Content-Type header set, browser generates the multipart boundary"
    - "Client-facing wording layer (ETAT_WORDING_CLIENT) kept fully separate from the underlying bon/moyen/usé/critique contract — translation happens only at render time, never persisted"

key-files:
  created: []
  modified:
    - MotoKey_Client.html

key-decisions:
  - "Section title uses 'Usure des Consommables' (capitalized) rather than the plan's literal 'Usure des consommables' example — required as the frontend-structure test's marker assertion is case-sensitive on the word 'Consommables'; no functional change"
  - "uploadConsoPhoto/triggerConsoPhoto placed immediately after jaugesSectionClient/jaugeRowClient rather than near the unrelated carte-grise Cloudinary block (~line 1194), keeping all consommable-gauge code co-located"

requirements-completed: [GAUGE-01, GAUGE-02, CONSO-04]

# Metrics
duration: 15min
completed: 2026-07-16
---

# Phase 27 Plan 04: Client Gauges + Legacy Pneus Removal Summary

**MotoKey_Client.html now renders 9 per-consommable wear gauges plus a weakest-link general gauge with public-friendly wording, and each gauge has a working multipart "Ajouter une photo" button wired to the existing CONSO-03 upload endpoint; the legacy Pneumatiques block is fully removed.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-15T23:55:00+02:00 (approx., after fast-forwarding worktree to master)
- **Completed:** 2026-07-16T00:09:47+02:00
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `loadMotos()` extended to fetch `GET /motos/:id/consommables` in parallel with the existing interventions/alertes fetches per moto, attaching `consommables` (array) and `jaugeGenerale` (item|null) to each enriched moto object
- `jaugesSectionClient(moto)` + `jaugeRowClient(motoId, item)` render the 9 typed gauges (bar + colored badge) and the weakest-link general gauge, using public wording distinct from the garage technical wording (D-11): `Très bon état` / `À surveiller` / `À changer bientôt` / `À changer maintenant`, mapped from `bon`/`moyen`/`usé`/`critique`
- `has_data:false` items render a neutral "Non renseigné" badge with no percentage (D-01); `jaugeGenerale === null` renders "Pas encore suivi" (D-04) instead of a fabricated score
- Legacy `pneusHtml` block (lines 653-661 pre-edit) deleted entirely from `renderMotoCard`; render call changed from `${planHtml}${pneusHtml}` to `${planHtml}${jaugesSectionClient(moto)}`
- `uploadConsoPhoto(motoId, typeConsommable, file, token)` posts raw `FormData` (fields `photo` + `type_consommable`) to `POST /motos/:id/photos-consommables` with only an `Authorization` header — no `Content-Type` set, so the browser generates the multipart boundary correctly
- `triggerConsoPhoto(motoId, typeConsommable)` opens a hidden file input, uploads on selection, refreshes gauges (`loadMotos()`) on success, and shows a graceful message on `503` (Cloudinary not configured) instead of any placeholder
- Deliberately does NOT reuse the carte-grise unsigned-Cloudinary upload pattern (`CLOUDINARY_PRESET`), which would bypass the server-side vision-stub analysis

## Task Commits

Each task was committed atomically:

1. **Task 1: Add /consommables to parallel fetch + render client gauges section (GAUGE-01/02, CONSO-04)** - `635211c` (feat)
2. **Task 2: Wire per-consommable multipart photo upload (D-10, CONSO-03)** - `535e025` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `MotoKey_Client.html` - Added `CONSO_LABELS_CLIENT`/`ETAT_WORDING_CLIENT`/`ETAT_COLOR_CLIENT` constants, `jaugeRowClient`/`jaugesSectionClient` render helpers, `uploadConsoPhoto`/`triggerConsoPhoto` multipart upload helpers; extended `loadMotos()`'s per-moto `Promise.all`; removed the legacy `pneusHtml` block from `renderMotoCard`

## Decisions Made
- Capitalized "Consommables" in the section title to satisfy the case-sensitive structural test marker (`/Consommables/`) — cosmetic only, no behavior change (see key-decisions above)
- No new decisions beyond what 27-CONTEXT.md (D-01/D-03/D-04/D-09/D-10/D-11) and the plan text already locked

## Deviations from Plan

None — plan executed exactly as written. The only adjustment (capitalizing "Consommables" in the section title) is a direct consequence of an explicit acceptance criterion in the plan itself ("MotoKey_Client.html contient un marqueur de section 'Consommables'"), not a deviation from intent.

## Issues Encountered

**Worktree was behind master.** This executor's worktree branch (`worktree-agent-ad0f4f401da9dc11f`) had not yet picked up phases 27-01/27-02/27-03's commits (its HEAD was the phase-26 completion point, an ancestor of `master`). Fast-forwarded the worktree branch to `master` (`git merge --ff-only master`) before starting, since the merge-base was identical to the worktree's HEAD (no divergent local work to lose). This brought in the `GET /motos/:id/consommables` endpoint (27-02) that this plan depends on, plus the phase 27 planning docs.

## User Setup Required

None - no external service configuration required by this plan. Real end-to-end photo upload remains blocked until Mehdi provisions the 3 Cloudinary env vars in Railway (pre-existing Phase 25/26 blocker, unchanged by this plan) — the UI already surfaces the `503` gracefully in the meantime (see `triggerConsoPhoto`'s 503 branch).

## Next Phase Readiness
- Client-side gauge UI (GAUGE-01/02) and legacy pneus removal (CONSO-04) are structurally complete and verified via `node scripts/test-consommables-jauges.js --case=frontend-structure` (3/3 `MotoKey_Client.html` assertions PASS; the 4 remaining FAILs in that same run are `app.html` assertions owned by plan 27-03, out of this plan's `files_modified` scope)
- Manual browser smoke test (per 27-VALIDATION.md) was not performed in this automated execution — recommended before considering Phase 27 fully closed, once 27-03 also lands
- No blockers introduced for Phase 28 (mobile client, read-only jauges) — `GET /motos/:id/consommables` contract is unchanged by this plan

---
*Phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy*
*Completed: 2026-07-16*

## Self-Check: PASSED

- FOUND: MotoKey_Client.html (function jaugesSectionClient, jaugeRowClient, uploadConsoPhoto, triggerConsoPhoto present)
- FOUND: 635211c
- FOUND: 535e025
