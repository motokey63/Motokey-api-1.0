---
phase: 16-push-wiring-end-to-end
plan: 04
subsystem: verification
tags: [curl-smoke-test, jest, tsc, devis, push, railway-deploy]
status: complete

# Dependency graph
requires:
  - phase: 16-push-wiring-end-to-end (16-01)
    provides: "POST /devis/:id/envoyer + PUT statut-lock guard (real-schema Devis data layer)"
  - phase: 16-push-wiring-end-to-end (16-02)
    provides: "lib/softAsk.ts, lib/push.ts, hooks/useNotificationObserver.ts"
  - phase: 16-push-wiring-end-to-end (16-03)
    provides: "soft-ask screen + AuthContext logout unregister + root layout redirect gating + notification observer/retry-hook mounting + Compte tab entry point"
provides:
  - "Live-prod curl-verified evidence: brouillon->envoye transition, PUT statut-lock (400 INVALID_STATUS), re-send rejection (400 INVALID_STATUS, no double-send)"
  - "Full mobile jest suite green (121/121) + tsc --noEmit clean, confirmed against the actual merged 16-01/16-02/16-03 code"
  - "Discovery + fix: 51 local commits (all of 16-01/16-02/16-03) had never been pushed to origin/master, so Railway prod was running pre-Phase-16 code until this plan pushed them"
  - "Human-confirmed on-device pass of all 8 checkpoint steps (soft-ask sequencing, Compte retrigger, MPUSH-05 tap-to-navigate), with one real bug found and fixed mid-checkpoint (see key-decisions)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deployment verification as a first-class plan step: a curl smoke test against 'live prod' is only meaningful if local commits have actually been pushed and Railway has redeployed — this plan treats an unpushed branch as a Rule-3 blocking issue, not an assumption to skip"

key-files:
  created: []
  modified:
    - "mobile-app/app/(app)/(tabs)/compte.tsx"

key-decisions:
  - "[Rule 3 - Blocking] Found local master 51 commits ahead of origin/master (all of Plans 16-01/16-02/16-03 work) — POST /devis/:id/envoyer returned 404 'Route inconnue' on first live-prod curl attempt because Railway had never redeployed. Pushed origin master (git push origin master, commit 7f6dc86) per CLAUDE.md's own explicit deployment workflow, waited ~45s for Railway auto-deploy, re-ran the smoke test successfully. This is a deployment/process fix, not a code change — no architectural decision needed."
  - "Reset the seed fixture's already-envoye devis (from a prior plan's manual curl testing) back to statut=brouillon via a one-off Supabase update (not a repo file edit) so Task 1's brouillon->envoye transition could be exercised again, idempotently, without touching seed-test-devis-16-uat.js's committed logic."
  - "[Task 2 checkpoint bug, found+fixed on-device] `compte.tsx`'s __DEV__-only test-notification button called `scheduleNotificationAsync({ trigger: { seconds: 2 } as any })` — the `as any` was masking a real type error. The installed expo-notifications build (SDK 54) requires the trigger to be a discriminated union tagged with a `type` field (`SchedulableTriggerInputTypes.TIME_INTERVAL`); the untagged shorthand throws `TypeError: The trigger object you provided is invalid` at runtime inside `parseTrigger`. Fixed to `{ type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 }`. Re-verified on-device: step 7 (tap local test notification -> navigates to Devis tab) then passed. tsc --noEmit and full jest suite (121/121) re-confirmed green after the fix."

requirements-completed: [MPUSH-01, MPUSH-05]

duration: ~25min (Task 1) + ~15min (Task 2 checkpoint incl. bug fix)
completed: 2026-07-05
---

# Phase 16 Plan 04: Backend + Mobile Verification Summary

**Task 1's automated backend curl smoke test and full mobile jest/tsc suite both passed, and Task 2's on-device human checkpoint confirmed all 8 steps — with one real bug found and fixed mid-checkpoint (invalid notification trigger shape).**

## Status: COMPLETE

Task 1 (automated) and Task 2 (human-verify checkpoint) are both done. Mehdi ran the mobile app on-device via Expo Go over a `--tunnel` connection and confirmed all 8 steps of the checkpoint behaved as expected after one fix was applied mid-flow (see Decisions Made #3).

## Performance

- **Task 1 duration:** ~25 min (including diagnosing and fixing the unpushed-commits deployment gap)
- **Task 2 duration:** ~15 min (including diagnosing and fixing the notification-trigger bug found at step 7)
- **Started:** 2026-07-05
- **Tasks:** 2/2 complete

## Accomplishments (Task 1)

- Seeded/reset the Phase 16 UAT fixture (`scripts/seed-test-devis-16-uat.js`, devis id `111a16f8-7591-49bf-a341-359a6836553b`, numero `2026-PUSH16`) — found it already in `envoye` state from Plan 16-01's own prior verification pass, reset to `brouillon` via a one-off Supabase update to make Task 1's transition re-testable.
- **Discovered a real deployment gap:** the first live curl attempt against `POST /devis/:id/envoyer` returned `404 Route inconnue` — local `master` was 51 commits ahead of `origin/master` (all of Plans 16-01, 16-02, 16-03's work, going back to `a6fbb66`). Railway auto-deploys from `origin/master` only, so prod was still running pre-Phase-16 code. Fixed by `git push origin master` (commit range `4ca62da..7f6dc86`), waited ~45s, confirmed Railway redeployed (root endpoint 200), then re-ran the smoke test successfully end-to-end.
- Curl smoke test (all 3 required calls) passed against **live prod, post-redeploy**:
  - `POST /devis/111a16f8.../envoyer` → HTTP 200, `"statut":"envoye"` confirmed in response body.
  - `PUT /devis/111a16f8...` (attempted edit on now-envoye devis) → HTTP 400, `{"code":"INVALID_STATUS","message":"Devis déjà envoyé — créez un nouveau devis pour modifier"}`.
  - `POST /devis/111a16f8.../envoyer` (re-send attempt) → HTTP 400, `{"code":"INVALID_STATUS","message":"Ce devis a déjà été envoyé"}` — confirms no double-send path exists.
  - Re-fetch after both rejected calls confirms `total_ttc: 108` and `statut: "envoye"` unchanged — no partial/side-effect mutation from the rejected calls.
- `cd mobile-app && npx jest`: **11 suites / 121 tests passed**, 0 failures — includes 16-02's softAsk/push/useNotificationObserver tests and all Phase 14/15 tests (no regressions).
- `cd mobile-app && npx tsc --noEmit`: exit 0, clean.
- `node --check motokey-api.js`: exit 0, clean (re-confirmed after the push/redeploy).

## Evidence — Curl Response Bodies (load-bearing, per plan's `<output>` instruction)

**Step 3 — `POST /devis/:id/envoyer` (HTTP 200):**
```json
{
  "success": true,
  "message": "Devis envoyé au client",
  "data": {
    "devis": {
      "id": "111a16f8-7591-49bf-a341-359a6836553b",
      "numero": "2026-PUSH16",
      "statut": "envoye",
      "total_ht": 90,
      "total_tva": 18,
      "total_ttc": 108,
      "date_envoi": "2026-07-05T01:59:28.19+00:00",
      "...": "(truncated — full devis snapshot row + embedded lignes[] + motos join)"
    }
  }
}
```

**Step 4 — `PUT /devis/:id` on now-`envoye` devis (HTTP 400):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS",
    "message": "Devis déjà envoyé — créez un nouveau devis pour modifier"
  }
}
```

**Step 5 — `POST /devis/:id/envoyer` re-send attempt (HTTP 400):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS",
    "message": "Ce devis a déjà été envoyé"
  }
}
```

## Task 2 — On-Device Checkpoint (all 8 steps confirmed)

Run over Expo Go via `npx expo start --tunnel` (ngrok tunnel, so the device didn't need to share a LAN with the dev machine). Steps 1-6 and 8 passed on the first attempt. Step 7 (tap the `__DEV__` local test notification → navigate to Devis tab) crashed on the first attempt with:

```
Uncaught (in promise, id: 0) TypeError: The `trigger` object you provided is invalid.
It needs to contain a `type` or `channelId` entry.
  at parseTrigger (expo-notifications/build/scheduleNotificationAsync.js)
  at Button.props.onPress (app/(app)/(tabs)/compte.tsx)
```

Root cause and fix: see Decisions Made #3 below. Re-ran step 7 after the fix — passed. Step 8 (logout) re-confirmed no crash, landed back on login screen.

## Task Commits

No new source-file commits for Task 1 (verification-only, `files_modified: []` per plan frontmatter — confirmed). The only repo-affecting action for Task 1 was pushing the 51 already-committed local commits to `origin/master` (no new commit created by the push itself; `git push origin master` → `4ca62da..7f6dc86`). Task 2's bug fix to `compte.tsx` is a new, separate commit (see below).

## Files Created/Modified

- `mobile-app/app/(app)/(tabs)/compte.tsx` — fixed the `__DEV__` test-notification trigger shape (Task 2 checkpoint fix).

## Decisions Made

1. **[Rule 3 - Blocking] Pushed 51 unpushed local commits to origin/master to unblock live-prod verification.** Found during the very first curl call of Task 1 (`404 Route inconnue: POST /devis/:id/envoyer`). Root cause: local `master` had Plans 16-01/16-02/16-03's work fully committed but never pushed — Railway (which auto-deploys strictly from `origin/master`) was still serving pre-Phase-16 code. This is exactly the scenario CLAUDE.md's own "toujours `git push` à la fin d'une session" convention warns about. Fixed via a plain `git push origin master` (no force, no rebase — pure fast-forward), confirmed via `git log origin/master..HEAD` showing 0 commits after the push, then waited for and confirmed Railway's redeploy before re-running the smoke test.
2. **Reset the seed fixture's devis statut back to `brouillon`** via a one-off Supabase `UPDATE` (not a file edit) so the idempotent seed script's existing (already-`envoye`) row could be used to re-exercise the transition, rather than mutating `seed-test-devis-16-uat.js`'s committed insert logic or creating a second throwaway fixture row.
3. **[Task 2 checkpoint bug, found+fixed on-device] `compte.tsx`'s test-notification trigger was untyped and wrong for the installed SDK.** `scheduleNotificationAsync({ trigger: { seconds: 2 } as any })` — the `as any` cast was masking a genuine type error rather than a false positive. The installed expo-notifications build (bundled with Expo SDK 54) made `NotificationTriggerInput` a discriminated union requiring an explicit `type` tag (`SchedulableTriggerInputTypes.TIME_INTERVAL`, `.DAILY`, `.CALENDAR`, etc.) — the older untagged shorthand `{ seconds: 2 }` throws at runtime inside `parseTrigger`. Confirmed the exact shape via the installed package's own `Notifications.types.d.ts` (`TimeIntervalTriggerInput = { type: SchedulableTriggerInputTypes.TIME_INTERVAL; channelId?: string; repeats?: boolean; seconds: number }`) rather than guessing from memory, per `mobile-app/AGENTS.md`'s "Expo HAS CHANGED" warning. Fixed to `{ type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 }`. Re-verified: `tsc --noEmit` clean, full jest suite 121/121 green, and step 7 passed on-device after Fast Refresh picked up the change.

## Issues Encountered

- **Windows-only libuv teardown crash** (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`) occurred after the one-off Supabase reset script's `process.exit()` call. This is the same pre-existing, already-documented Windows-only issue noted in STATE.md's Blockers/Concerns (confirmed not a Phase 13 regression, doesn't reproduce on Railway/Linux) — the script's actual DB write completed successfully before the crash (confirmed by the printed "Reset OK" line and by the subsequent curl calls seeing the correct `brouillon` state). No action needed, not a new issue.
- **Task 2 checkpoint bug** — see Decisions Made #3. Found and fixed within the checkpoint itself; did not require a separate gap-closure plan.

## User Setup Required

None. Both tasks are complete.

## Carry-Forward (not new gaps, restated per this plan's `<output>` spec)

Real Expo push token registration against a live device (MPUSH-02's device-token half) and real remote push delivery (MPUSH-03's device half) both require an EAS development build, which does not exist in this repo yet (no `eas.json`, no `projectId`, no logged-in Expo account). Per the 2026-07-04 planning decision, this is explicitly deferred to Phase 17 and did not block this checkpoint or this phase's completion. MPUSH-01 (soft-ask) and MPUSH-05 (tap-to-navigate, via local notification) are fully proven end-to-end on-device.

---
*Phase: 16-push-wiring-end-to-end*
*Status: COMPLETE*

## Self-Check: PASSED

- `16-04-SUMMARY.md` (this file) verified present on disk, finalized with Task 2's outcome.
- `.planning/STATE.md` verified present on disk, updated to reflect Phase 16 completion.
- `git log --oneline --all | grep 7f6dc86` confirms the `origin/master` push (deployment-gap fix) is present in history.
- `compte.tsx` fix verified via `tsc --noEmit` (clean) and `jest` (121/121) before and after being committed.
- Note: `.planning/` is gitignored in this repo and `commit_docs` is `false` in project config — STATE.md/SUMMARY.md updates are filesystem-only by design (confirmed via `gsd-tools commit`, which reported `skipped_commit_docs_false`), not a missed commit.
