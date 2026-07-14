---
status: partial
phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary
source: [25-VERIFICATION.md]
started: 2026-07-14T21:45:27Z
updated: 2026-07-14T21:45:27Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Provision Cloudinary credentials and confirm real round-trip
expected: Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env locally and in Railway env vars for service motokey1.1, then re-run `node tests/test-km-photos-cloudinary.js`. CONSO-03 and CLOUD-01 sections switch from "503 SKIP" to a real round-trip: response photo_url/secure_url begins with https://res.cloudinary.com/, and the image is visible in the Cloudinary Dashboard under motokey/consommables/<moto_id>/ and motokey/km/<moto_id>/. Known, planned dependency since 25-01-PLAN.md (user_setup block) — not a gap.
result: [pending]

### 2. Decide on RBAC hardening priority for rbac.inferLegacyRole()
expected: Review deferred-items.md entries under [25-05] and decide whether/when to schedule a dedicated RBAC-hardening phase to add a `clients` table lookup branch to `inferLegacyRole()`. A conscious decision (fix now, fix in a future phase, or accept as known limitation). Cross-cutting gap affecting 60+ call sites already in prod (interventions, devis, transfert, client device tokens, and now CONSO-03) — blocks the CLIENT-facing half of photo upload today, worth prioritizing before Phase 27/28 (UI consuming these same endpoints).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
