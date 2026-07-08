# Phase 17: Maintenance Alert Cron + App Store Submission - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 17-maintenance-alert-cron-app-store-submission
**Areas discussed:** App Store account readiness, Maintenance alert notification policy, Cron mechanism, EAS build setup scope

---

## App Store Account Readiness

**Q: Do you already have an Apple Developer Program membership (paid, $99/yr) set up?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, already enrolled | Have an active Apple Developer account ready | |
| No, not yet | Haven't signed up yet | ✓ |
| Not sure / need to check | Might have one from a prior project | |

**Q: Do you already have a Google Play Console account (one-time $25) set up?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, already enrolled | Have an active Play Console account | |
| No, not yet | Haven't signed up yet | ✓ |
| Not sure / need to check | Might have one already | |

**Q: Neither account exists yet — how should Phase 17 handle this?**

| Option | Description | Selected |
|--------|-------------|----------|
| Build everything code-ready, treat submission as a parked gap | Mirrors Phase 8 (Stripe live mode) pattern — ship cron fully, prep MSTORE-01 content + EAS config, park actual MSTORE-02 submission | ✓ |
| Pause phase now, do accounts first | Stop and create accounts before any further planning | |
| Split into two phases | Re-scope roadmap: 17 = cron only, new 18 = app store submission | |

**Q: What bundle ID / package name should the app use?**

| Option | Description | Selected |
|--------|-------------|----------|
| com.motokey.app | Generic, brand-first | ✓ |
| com.motolab.motokey | Ties to Garage Motolab specifically | |
| Something else | Custom | |

**User's choice:** No accounts exist for either platform. Build everything code-ready this phase; park actual store submission (MSTORE-02) as a known gap, same treatment as Phase 8/BILL-06. Bundle ID: `com.motokey.app`.
**Notes:** This is a hard external blocker — Apple's review process alone can take days once submission starts, and neither account is even created yet. Decision explicitly avoids blocking the cron feature (MPUSH-04) or code-readiness work (EAS config, Privacy Manifest content) on this external dependency.

---

## Maintenance Alert Notification Policy

**Q: When the cron finds a moto crossing a threshold, how naggy should the push notification be?**

| Option | Description | Selected |
|--------|-------------|----------|
| Once per tier crossing | One push at first 80% crossing, one more at first 100% crossing, never repeats | ✓ |
| Once at urgent only (100%) | Skip the 80% warning entirely | |
| Recurring until serviced | Weekly reminder until intervention resets km_derniere | |

**User's choice:** Once per tier crossing.
**Notes:** Matches the ROADMAP's own explicit success criterion ("pas de spam au réexécution du cron"). Requires new persisted "last notified tier" state since the existing threshold calc is read-time-only with no persistence today — implementation shape left to planner (see Claude's Discretion in CONTEXT.md).

---

## Cron Mechanism

**Q: How should the maintenance-alert check actually get triggered on a schedule?**

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions scheduled workflow | Cron workflow calls a protected backend endpoint with a secret header | ✓ |
| Railway's own cron service | Second Railway "Cron Job" service type, runs a script directly | |
| External pinger (cron-job.org) | Third-party SaaS scheduler hits the endpoint | |

**User's choice:** GitHub Actions scheduled workflow.
**Notes:** Reasoning given during presentation: free, versioned in-repo (unlike cron-job.org's external dashboard config), visible run history/logs in GitHub's UI, no new billed Railway service. This introduces the first secret-header-authenticated endpoint in the API (everything else uses Supabase JWT + `requireRole()`) — flagged for the planner as a deliberate exception, not an oversight.

---

## EAS Build Setup Scope

**Q: How far should EAS setup go this phase?**

| Option | Description | Selected |
|--------|-------------|----------|
| Full setup + one real dev build | eas login + eas init + eas.json + one actual `eas build --profile development` | ✓ |
| Config only, no build yet | Write eas.json + projectId, no build command run | |

**User's choice:** Full setup + one real dev build.
**Notes:** Goal is to finally close the Phase 13/16 SC-1 deferral (real device push token registration/delivery), which has been carried forward across three prior phases because Expo Go dropped remote push support in SDK 53.

**Follow-up Q: Do you already have a free Expo account (needed for `eas login`)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, I have one | Already have credentials | |
| No, need to create one | Free signup needed first | ✓ |
| Not sure | Might have one from Expo Go | |

**User's choice:** No, need to create one.
**Notes:** `eas login` requires interactive browser/credential auth — cannot be automated by Claude. This will be a human checkpoint in the plan (same treatment as the Phase 16-04 on-device checkpoint), and account creation itself is a prerequisite sub-step of that checkpoint.

---

## Claude's Discretion

- Exact DB shape for "last notified tier" persistence (new column vs. new table, likely following the `push_send_log` idempotency-table convention from Phase 13)
- Final push notification copy/wording (directional examples only: "Révision à planifier" / "Révision dépassée")
- Cron endpoint batching/pagination approach (data volume currently small)
- Which platform (Android or iOS) to target first for the one EAS dev build in D-06

## Deferred Ideas

- Actual App Store / Play Store submission and public listing — blocked on Mehdi creating both paid developer accounts (Apple $99/yr, Google $25). Tracked as a known gap in PROJECT.md, same pattern as Phase 8/BILL-06. Likely a follow-up session once accounts exist, not necessarily a new roadmap phase.
- Production-profile EAS build (`eas build --profile production`) — sequenced naturally right before actual submission once accounts exist; this phase only produces one `development` profile build.
