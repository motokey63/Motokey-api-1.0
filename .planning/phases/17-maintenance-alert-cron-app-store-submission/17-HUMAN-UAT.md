---
status: partial
phase: 17-maintenance-alert-cron-app-store-submission
source: [17-VERIFICATION.md]
started: 2026-07-06T00:16:00.000Z
updated: 2026-07-06T00:16:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Reconcile Apple privacy manifest against a real generated manifest
expected: Once a macOS/Linux machine or a paid Apple Developer account is available, run `npx expo prebuild --platform ios` (or inspect an EAS iOS build's artifacts) and compare the resulting `PrivacyInfo.xcprivacy`'s `NSPrivacyAccessedAPITypes` entries against `mobile-app/app.json`'s currently-declared codes (`CA92.1`, `C617.1`, `35F9.1`, `E174.1`). The declared codes should match the real generated manifest exactly (add/remove entries in `app.json` if the real output differs).
result: [pending]

### 2. MSTORE-02 — actual store submission
expected: After Mehdi creates an Apple Developer Program membership ($99/yr) and a Google Play Console account ($25 one-time), run the account-gated flow: upload the store-content docs, run `eas submit` (or manual TestFlight/Play Console upload) for both platforms, and confirm a real install from each internal test track.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
