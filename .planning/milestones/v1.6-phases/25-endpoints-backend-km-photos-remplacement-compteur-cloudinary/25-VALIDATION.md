---
phase: 25
slug: endpoints-backend-km-photos-remplacement-compteur-cloudinary
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-14
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no jest/mocha/vitest in `package.json`) — project convention is ad-hoc Node scripts (`test-api.js`, `tests/test-or-e2e.js`, `tests/test-client-device-tokens.js`) that spin up raw `http` requests against a running local server and print ✅/❌ per assertion. |
| **Config file** | none — Wave 0 installs `cloudinary`/`multer` and creates the new test script |
| **Quick run command** | `node motokey-api.js` (in one terminal) then `node tests/test-km-photos-cloudinary.js` (new script, in another) |
| **Full suite command** | `node test-api.js && node tests/test-or-e2e.js && node tests/test-client-device-tokens.js && node tests/test-km-photos-cloudinary.js` |
| **Estimated runtime** | ~30 seconds (integration-style HTTP calls against a running local server) |

---

## Sampling Rate

- **After every task commit:** Run the relevant slice of `tests/test-km-photos-cloudinary.js` manually against a locally running `node motokey-api.js` (no fast unit-test layer exists in this codebase to sample more cheaply)
- **After every plan wave:** Run `node tests/test-km-photos-cloudinary.js` in full plus `node --check motokey-api.js` (existing project convention per CLAUDE.md "Commandes utiles")
- **Before `/gsd:verify-work`:** Full suite must be green (including a real Cloudinary round-trip if credentials are available; otherwise the gap must be documented explicitly, not silently skipped)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01 | 01 | 1 | CLOUD-01, CONSO-01 | unit/static | `node --check` + grep on `services/cloudinaryService.js`, `supabase.js` | ✅ (created by plan) | ⬜ pending |
| 25-02 | 02 | 1 | KM-02, KM-03, CONSO-01, CONSO-03, CLOUD-01 | integration harness + fixture | `tests/test-km-photos-cloudinary.js`, `tests/fixtures/` | ✅ (created by plan) | ⬜ pending |
| 25-03 | 03 | 2 | KM-02, KM-03 | integration | `node tests/test-km-photos-cloudinary.js` (km sections) | depends on 25-01, 25-02 | ⬜ pending |
| 25-04 | 04 | 3 | CONSO-01 | integration | `node tests/test-km-photos-cloudinary.js` (consommables sections) | depends on 25-01, 25-03 | ⬜ pending |
| 25-05 | 05 | 4 | CONSO-03, CLOUD-01 | integration (multipart, needs image fixture; Cloudinary round-trip skippable w/o creds) | `node tests/test-km-photos-cloudinary.js` (photo/cloudinary sections) | depends on 25-01, 25-03, 25-04 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Finalized against the 5 plans created by gsd-planner (25-01 through 25-05, waves 1-4) and confirmed by gsd-plan-checker (VERIFICATION PASSED) — every task across all 5 plans carries its own `<automated>` verify command; see each PLAN.md for per-task detail.*

---

## Wave 0 Requirements

- [ ] `tests/test-km-photos-cloudinary.js` — new ad-hoc integration script covering KM-02/KM-03/CONSO-01/CONSO-03/CLOUD-01, following the existing `tests/test-or-e2e.js` style (raw `http` requests, ✅/❌ console output)
- [ ] `tests/fixtures/` — at least one small real JPEG/PNG (<5MB) checked in as a multipart upload fixture, since no existing test script does file uploads
- [ ] Cloudinary dev credentials in local `.env` — without them, CLOUD-01's real-round-trip assertion cannot run locally; this is an explicit setup dependency (Mehdi must provision a Cloudinary account), not a silent skip
- [ ] `npm install cloudinary@^2.10.0 multer@^2.2.0` — no test framework install needed (project has none), but these are the two new runtime dependencies this phase depends on

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Cloudinary dashboard shows uploaded image under correct folder | CLOUD-01 | Confirms the image actually persisted on Cloudinary's side (not just that the API call returned 200) — no API-only way to visually confirm folder structure/image integrity | After running the upload test, log into the Cloudinary dashboard and check the `motokey/...` folder for the uploaded asset |
| Railway env vars (`CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET`) provisioned in prod | CLOUD-01 | Deployment-environment configuration, not exercisable from local test suite | Before/at deploy: confirm the three env vars are set in Railway dashboard for service `motokey1.1`, then re-run `tests/test-km-photos-cloudinary.js` against the deployed URL |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
