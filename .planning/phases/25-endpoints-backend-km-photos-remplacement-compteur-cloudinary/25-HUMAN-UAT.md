---
status: partial
phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary
source: [25-VERIFICATION.md]
started: 2026-07-14T21:45:27Z
updated: 2026-07-15T00:00:00Z
---

## Current Test

[awaiting human testing — item 1 only, item 2 resolved]

## Tests

### 1. Provision Cloudinary credentials and confirm real round-trip
expected: Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in .env locally and in Railway env vars for service motokey1.1, then re-run `node tests/test-km-photos-cloudinary.js`. CONSO-03 and CLOUD-01 sections switch from "503 SKIP" to a real round-trip: response photo_url/secure_url begins with https://res.cloudinary.com/, and the image is visible in the Cloudinary Dashboard under motokey/consommables/<moto_id>/ and motokey/km/<moto_id>/. Known, planned dependency since 25-01-PLAN.md (user_setup block) — not a gap.
result: [pending]

### 2. Decide on RBAC hardening priority for rbac.inferLegacyRole()
expected: Review deferred-items.md entries under [25-05] and decide whether/when to schedule a dedicated RBAC-hardening phase to add a `clients` table lookup branch to `inferLegacyRole()`. A conscious decision (fix now, fix in a future phase, or accept as known limitation). Cross-cutting gap affecting 60+ call sites already in prod (interventions, devis, transfert, client device tokens, and now CONSO-03) — blocks the CLIENT-facing half of photo upload today, worth prioritizing before Phase 27/28 (UI consuming these same endpoints).
result: RESOLVED 2026-07-15 — original diagnosis was overstated. Live verification against Supabase Auth showed all real client accounts (registered via the actual `/auth/client/register` flow used by MotoKey_Client.html and the mobile app) correctly have `app_metadata.role='CLIENT'` set (6/6 sampled). The only broken account was the `sophie@email.com` dev fixture (created by setup-supabase.js without setting app_metadata), combined with test scripts authenticating it via the legacy `/auth/login` instead of the real `/auth/client/login`. `rbac.inferLegacyRole()` is not a bug — it's a garage-only fallback working as designed. Fixed: setup-supabase.js now sets the role (applied live), test harnesses switched to the real client login flow. No RBAC hardening phase needed. tests/test-km-photos-cloudinary.js now 19/19, tests/test-client-device-tokens.js now 15/15 (was 3/15).

## Summary

total: 2
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
