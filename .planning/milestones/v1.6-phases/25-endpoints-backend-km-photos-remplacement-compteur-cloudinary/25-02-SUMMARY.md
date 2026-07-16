---
phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary
plan: 02
subsystem: testing
tags: [http, integration-test, multipart, jpeg, cloudinary, km]

# Dependency graph
requires:
  - phase: 23-sch-ma-anti-fraude-km-au-niveau-db
    provides: RelevesKm/Consommables/PhotosConsommables DB layer that KM/CONSO endpoints will call
  - phase: 24-helpers-supabase-js-contrat-stub-vision
    provides: analyzePhoto() contract that CONSO-03 section will exercise
provides:
  - tests/test-km-photos-cloudinary.js — ad-hoc HTTP integration harness skeleton (5 stub sections)
  - tests/fixtures/sample.jpg — valid minimal JPEG fixture for multipart upload tests
affects: [25-03-km-endpoints, 25-04-consommables-endpoints, 25-05-photos-cloudinary-endpoints]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ad-hoc raw-http test harness (no jest/mocha) matching tests/test-or-e2e.js style"
    - "Manual multipart/form-data construction (no form-data dependency)"
    - "Explicit non-silent skip guard pattern for optional env-gated assertions (CLOUD-01)"

key-files:
  created:
    - tests/test-km-photos-cloudinary.js
    - tests/fixtures/sample.jpg
  modified: []

key-decisions:
  - "Fixture JPEG built from a known-valid 1x1 base64 buffer written via Node (no external binary/download), per plan constraint"
  - "Garage login (rbac_role=CONCESSION) reused as PRO+ proxy token — no dedicated MECANO/PRO seed account exists yet; documented inline for 25-03+ to revisit if finer-grained roles are needed"

patterns-established:
  - "Stub section markers (// ─── REQ-ID (description) ───) per requirement, filled incrementally by downstream plans in the same phase"

requirements-completed: [KM-02, KM-03, CONSO-01, CONSO-03, CLOUD-01]

# Metrics
duration: 17min
completed: 2026-07-14
---

# Phase 25 Plan 02: Test Harness Skeleton Summary

**Ad-hoc HTTP integration test skeleton (`tests/test-km-photos-cloudinary.js`) plus a genuinely valid multipart JPEG fixture, both wired against a live `node motokey-api.js` and ready for 25-03/04/05 to fill in.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-07-14T19:08:00Z (approx, worktree fast-forward + context read)
- **Completed:** 2026-07-14T19:15:35Z
- **Tasks:** 2
- **Files modified:** 2 (both new)

## Accomplishments
- Created `tests/fixtures/sample.jpg`, a real 287-byte valid JPEG (magic bytes `FF D8 FF` / EOI `FF D9` confirmed), generated from a known-valid base64 buffer via Node — no external binary or download used.
- Created `tests/test-km-photos-cloudinary.js`: raw-`http` request helper (JSON and manual multipart/form-data bodies), `check()` OK/KO helper, `login()` helper, and 5 clearly-delimited stub sections (KM-03, KM-02, CONSO-01, CONSO-03, CLOUD-01) matching `tests/test-or-e2e.js` conventions.
- CLOUD-01 section implements the required non-silent skip guard: warns explicitly when `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` are absent, never a silent skip.
- Verified live end-to-end: started `node motokey-api.js` locally, ran the harness — server ping succeeds, garage login succeeds (rbac_role=CONCESSION), client login succeeds, all 5 sections print their stub markers, and the process exits 0 as required.

## Task Commits

Each task was committed atomically:

1. **Task 1: Ajouter l'image fixture multipart** - `553bcfd` (test)
2. **Task 2: Créer le squelette tests/test-km-photos-cloudinary.js** - `eb521a9` (test)

**Plan metadata:** (this commit) `docs(25-02): complete test harness skeleton plan`

## Files Created/Modified
- `tests/fixtures/sample.jpg` - Minimal valid JPEG (287 bytes, 1x1 white pixel) for multipart upload tests
- `tests/test-km-photos-cloudinary.js` - HTTP integration test skeleton with request/login/check helpers and 5 requirement-stub sections

## Decisions Made
- Reused garage login (rbac_role=CONCESSION) as the PRO+/MECANO+ proxy token in the absence of a dedicated seed account for finer RBAC roles — documented inline in the script for 25-03+ to revisit if a real MECANO-only assertion becomes necessary.
- Built the JPEG fixture from an in-memory base64 buffer rather than attempting byte-level JPEG construction — simpler, still satisfies "no external binary/download", and guarantees valid magic bytes/EOI markers (verified by the plan's exact automated check).

## Deviations from Plan

None - plan executed exactly as written. Both `25-VALIDATION.md` and `25-RESEARCH.md` referenced in the plan's `<context>` block were not present in this worktree at execution time; the plan body itself (tasks, verify commands, acceptance criteria) contained everything needed, so execution proceeded without them. No architectural or scope changes resulted.

## Issues Encountered
- This worktree branch (`worktree-agent-a0f72e59ea92cf618`) was behind `master` (missing Phase 24 work and the Phase 25 plan files entirely). Confirmed via `git merge-base --is-ancestor` that the branch was a clean, non-diverged ancestor of `master`, then fast-forwarded (`git merge --ff-only master`) to pick up the Phase 24/25 planning commits before starting execution. No local work was at risk since the branch had zero unique commits.

## User Setup Required

None - no external service configuration required for this plan. (Cloudinary credentials remain a Plan 25-01 / 25-05 concern; this plan's CLOUD-01 section only wires the non-silent skip guard.)

## Requirements Note

This plan's frontmatter lists all 5 phase requirements (KM-02, KM-03, CONSO-01, CONSO-03, CLOUD-01), but 25-02 only builds the test *harness skeleton* covering all 5 — it does not implement any endpoint. Actual delivery is split across 25-01 (CLOUD-01/CONSO-01 foundations), 25-03 (KM-02/KM-03), 25-04 (CONSO-01), and 25-05 (CONSO-03/CLOUD-01). `requirements mark-complete` was intentionally **not** run for this plan to avoid falsely checking off requirements before their implementing plans land — those plans (or the phase-level verification step) should mark them complete.

## Next Phase Readiness
- `tests/test-km-photos-cloudinary.js` and `tests/fixtures/sample.jpg` are ready for 25-03 (KM-02/KM-03), 25-04 (CONSO-01), and 25-05 (CONSO-03/CLOUD-01) to fill in their respective stub sections with real assertions.
- No blockers. The harness already proves server reachability + dual login (garage/client) work, which downstream plans can build directly on.

---
*Phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: tests/fixtures/sample.jpg
- FOUND: tests/test-km-photos-cloudinary.js
- FOUND commit: 553bcfd
- FOUND commit: eb521a9
