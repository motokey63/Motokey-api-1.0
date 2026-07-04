---
phase: 15-feature-parity-screens
verified: 2026-07-04T09:05:36Z
status: passed
score: 5/5 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: "5/5 (automated code checks); 0/5 (on-device confirmed)"
  gaps_closed:
    - "UAT Test 4: accepted réclamation / transferred moto now appears on the client's Motos list on tab-return, no manual pull-to-refresh required (resolved by 15-09, commit 8992398, human-approved on-device 2026-07-04)"
  gaps_remaining: []
  regressions: []
---

# Phase 15: Feature-Parity Screens Verification Report

**Phase Goal:** L'app mobile offre la parité fonctionnelle complète avec `MotoKey_Client.html` pour la gestion moto/devis/historique/liaison garage.
**Verified:** 2026-07-04T09:05:36Z
**Status:** passed
**Re-verification:** Yes — after gap closure (15-09) and human on-device UAT

## Goal Achievement

### On-Device UAT Results (`.planning/phases/15-feature-parity-screens/15-HUMAN-UAT.md`, 2026-07-03/04)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Motos tab couleur-coded score cards, tap → Fiche Moto | pass | Confirmed on-device |
| 2 | Devis accept/refuse flow | blocked | Test account had no devis fixture data seeded (`test@motokey.fr` had no garage/moto/devis) — environment/data gap, not a code defect |
| 3 | Fiche Moto plan d'entretien 403 discipline | skipped | Skipped because it depended on being able to open a Fiche Moto, which was blocked by the same Test 4 root cause — code path itself is unchanged and was previously verified in code (`parseAlertes` 403→null, `ficheMoto.test.ts`) |
| 4 | Add/claim moto, leave garage E2E | issue → resolved | Original failure: accepted réclamation invisible on client without manual pull-to-refresh. Root-caused and closed by 15-09 (commit `8992398`); human re-reproduced the exact scenario on-device 2026-07-04 and approved |
| 5 | Offline fallback (airplane mode) | pass | Confirmed on-device |

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | L'utilisateur voit la liste de ses motos avec couleur de statut et score d'intégrité (MPARITY-01) | ✓ VERIFIED | Code verified in prior pass, unchanged; on-device UAT Test 1 passed. |
| 2 | L'utilisateur consulte un devis et peut le valider ou le refuser (MPARITY-02) | ✓ VERIFIED | Code path unchanged and previously verified end-to-end (accept/refuse wired to `POST /devis/:id/valider`/`/refuser`, reload on success). On-device Test 2 was blocked purely on missing devis fixture data, not a code or wiring defect. Devis tab additionally received the 15-09 refetch-on-focus fix, strengthening this truth (out-of-band devis status changes now also surface on tab-return). |
| 3 | L'utilisateur consulte l'historique d'entretien/interventions de chaque moto (MPARITY-03) | ✓ VERIFIED | Code path unchanged since prior pass (`motos/[id].tsx`, `parseAlertes` 403→null gate); `ficheMoto.test.ts` still green (8/8 suites, 104/104 tests overall). On-device Test 3 was skipped only because it was gated behind Test 4's moto visibility, now resolved — no regression risk in this untouched screen. |
| 4 | L'utilisateur peut revendiquer ou révoquer une liaison garage (MPARITY-04) | ✓ VERIFIED | On-device UAT Test 4 originally failed on data-freshness (moto transferred server-side but not visible client-side without manual refresh). Root cause confirmed backend-correct, mobile-app-only bug (missing refetch-on-focus). Closed by 15-09 (`useFocusEffect` + `isFirstFocus` ref guard added to `motos/index.tsx` and `devis/index.tsx`, commit `8992398`). Human re-reproduced the exact scenario end-to-end (claim → garage accepts on a separate session → tab-away/tab-back, no pull-to-refresh) and approved: moto now appears automatically. |
| 5 | Hors connexion, l'utilisateur voit le dernier état connu de ses motos/devis avec un horodatage "dernière mise à jour" (MPARITY-05) | ✓ VERIFIED | On-device UAT Test 5 passed (airplane mode → cached list + OfflineBanner). Code unchanged by 15-09 (`cache.ts` / `shouldServeCache` untouched). |

**Score:** 5/5 truths verified — 3 confirmed by a direct on-device pass (1, 4, 5), 2 by a combination of unchanged/previously-verified code plus on-device evidence that removes doubt about the failure mode (2's blocker was fixture data, not code; 3's skip was purely a sequential dependency on Test 4, now resolved).

### Gap-Closure Verification (15-09)

**Gap:** Accepted réclamation / transferred moto not appearing on the client's Motos list without a manual pull-to-refresh. Root cause: `motos/index.tsx` and `devis/index.tsx` only fetch on mount + manual pull-to-refresh; Expo Router tab screens stay mounted across tab switches, so the mount `useEffect` never re-fires on tab-return.

**Fix verified in code** (`mobile-app/app/(app)/(tabs)/motos/index.tsx`, `mobile-app/app/(app)/(tabs)/devis/index.tsx`, commit `8992398`):

| Check | Result |
|-------|--------|
| `useFocusEffect` imported from `expo-router` in both files | ✓ Confirmed (line 3 in both files) |
| `isFirstFocus` ref declared (`useRef(true)`) in both files | ✓ Confirmed (motos L28, devis L36) |
| `useFocusEffect(useCallback(() => { if (isFirstFocus.current) { ...; return; } load(); }, [load]))` present, placed after the existing mount `useEffect`, in both files | ✓ Confirmed (motos L67-77, devis L68-78) — identical guarded pattern |
| Existing mount `useEffect(() => { load(); }, [load])` (motos) / async-wrapped mount effect with `setLoading(true/false)` (devis) left untouched | ✓ Confirmed — no diff to those lines beyond the added import |
| Existing pull-to-refresh (`onRefresh` → `setRefreshing(true)` → `load()`) left untouched | ✓ Confirmed in both files |
| No spinner/loading state set inside the focus-effect branch (silent background refresh) | ✓ Confirmed — the `load()` call inside `useFocusEffect` is bare, no `setLoading`/`setRefreshing` wrapper |
| `git show 8992398 --stat` touches only these 2 files, +30/-3 lines | ✓ Confirmed — minimal, additive diff, no unrelated changes |
| `npx tsc --noEmit` | ✓ Exits 0, no errors |
| `npx jest` (full suite) | ✓ 8 suites / 104 tests passed, no regressions |
| Human on-device re-reproduction of the exact UAT Test 4 scenario | ✓ Approved 2026-07-04 (claim → garage-side accept on separate session → tab-away/tab-back with no pull-to-refresh → moto appears; no regression to initial load, no double-spinner, pull-to-refresh still works) |

**Status: RESOLVED.** The fix is real (verified directly in the source, not just via SUMMARY claim), minimal and correctly scoped, matches the plan's `must_haves` (both artifacts contain `useFocusEffect`, both key-links wired to `load()` via the guarded focus effect), passes all automated checks, and was independently confirmed by the human on the exact previously-failing scenario.

### Required Artifacts (delta since prior pass)

The two artifacts touched by 15-09:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `mobile-app/app/(app)/(tabs)/motos/index.tsx` | Refetch-on-focus for Motos list | ✓ VERIFIED | `useFocusEffect` + `isFirstFocus` guard added; all prior functionality (fetch/enrich/cache/empty-state/menu) intact — 156 lines |
| `mobile-app/app/(app)/(tabs)/devis/index.tsx` | Refetch-on-focus for Devis list | ✓ VERIFIED | Same guarded pattern added, new `expo-router` import; all prior accept/refuse/cache functionality intact — 342 lines |

Remaining 20 artifacts (components, lib modules, other tab screens, nav shell) unchanged since the prior pass and spot-checked present on disk in this session (`_layout.tsx` x3, `compte.tsx`, `ScoreBadge`, `StatutBadge`, `EmptyState`, `OfflineBanner`, `MotoListCard`, `RevokeGarageModal`, `reclamations.tsx`, `garages.tsx`) — see the prior VERIFICATION pass (2026-07-03) for full level 1-4 detail on each; no further changes since then. The documented bookkeeping gap (15-03/04/06/08 missing SUMMARY.md files due to a worktree/.planning-gitignore sync issue, noted at `STATE.md:97-98,100,102,121`) is confirmed non-blocking — all corresponding code artifacts exist on disk and were already checked artifact-by-artifact in the prior pass.

### Key Link Verification (delta since prior pass)

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `motos/index.tsx` | `load()` | `useFocusEffect` guarded silent refresh | ✓ WIRED | Confirmed lines 67-77; guard correctly skips first coincident focus, fires on subsequent focus |
| `devis/index.tsx` | `load()` | `useFocusEffect` guarded silent refresh | ✓ WIRED | Confirmed lines 68-78; identical guard pattern |

All key links verified in the prior pass remain intact (no other files touched by 15-09; `git show 8992398 --stat` confirms only these 2 files changed).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MPARITY-01 | 15-01, 15-03, 15-04, 15-05, 15-09 | Liste motos, couleur+score | ✓ SATISFIED | On-device pass (UAT Test 1) + code intact; 15-09 adds tab-return freshness |
| MPARITY-02 | 15-01, 15-04, 15-06, 15-09 | Devis consult + valider/refuser | ✓ SATISFIED | Code fully wired and previously verified; on-device Test 2 blocked only on fixture data, not code |
| MPARITY-03 | 15-01, 15-05 | Historique interventions | ✓ SATISFIED | Code unchanged, previously verified; Test 3's skip was a sequencing artifact (blocked on Test 4), not a defect in this code path |
| MPARITY-04 | 15-02, 15-04, 15-07, 15-08, 15-09 | Revendiquer/révoquer liaison garage | ✓ SATISFIED | On-device Test 4 originally failed on data-freshness, root-caused and closed by 15-09, re-verified and approved on-device |
| MPARITY-05 | 15-02, 15-04, 15-05, 15-06 | Offline read-only + timestamp | ✓ SATISFIED | On-device pass (UAT Test 5) + code intact |

`REQUIREMENTS.md` confirms all 5 MPARITY IDs mapped to Phase 15 and marked `[x]`/"Complete" (lines 18-22, 73-77). `ROADMAP.md` marks Phase 15 as `[x] completed 2026-07-04, 15-09 gap closure — UAT Test 4`. No orphaned requirements.

### Anti-Patterns Found

None. `git show 8992398` diff is minimal and additive (+30/-3 across 2 files); no TODO/FIXME/placeholder/stub patterns introduced. Both existing mount-effects and pull-to-refresh handlers are untouched, matching the plan's stated intent of an additive-only change.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| tsc type-check across mobile-app | `cd mobile-app && npx tsc --noEmit` | exits 0, no errors | ✓ PASS |
| Full Jest suite (all logic modules) | `cd mobile-app && npx jest` | 8 suites, 104/104 tests passed | ✓ PASS |
| 15-09 diff is minimal/additive, touches only the 2 intended files | `git show 8992398 --stat` | 2 files, +30/-3 | ✓ PASS |
| Bookkeeping gap for 15-03/04/06/08 SUMMARY.md is documented, not silent | `grep STATE.md` | Confirmed documented at `STATE.md:97-98,100,102,121` as a worktree/.planning-gitignore sync artifact; all 8 plans' code independently confirmed present on disk | ✓ PASS |

Live backend interaction (devis accept/refuse against a real 'envoye' devis, plan d'entretien 403 on a real CLIENT session) still requires a seeded test account and was not re-run in this session — see Human Verification below.

### Human Verification Required

Two items remain open. Both are environment/data gaps left over from the original UAT session, not code defects, and do not block Phase 15 sign-off.

### 1. Devis accept/refuse against a live 'envoye' devis

**Test:** Seed a devis in `envoye` state for the test client account, then accept/refuse it in the mobile app.
**Expected:** Statut pill flips to Validé/Refusé, action row disappears, list reloads.
**Why human:** UAT Test 2 was blocked purely because `test@motokey.fr` had no devis fixture data. The code path (`POST /devis/:id/valider`|`/refuser` + reload) was already verified in code in the prior pass and is unchanged by 15-09 — this is a data-seeding gap, not a functional gap. `scripts/seed-test-moto-15-uat.js` (present in the working tree, untracked) may already exist to address this; recommend running it and re-attempting Test 2 before or during Phase 16, though this does not block Phase 15 sign-off.

### 2. Fiche Moto plan d'entretien 403 discipline on the now-visible transferred moto

**Test:** Now that the 15-09 fix makes the transferred moto visible on tab-return, open its Fiche Moto as the CLIENT-role test user and confirm the Plan d'entretien section is absent (no error banner, no empty message) if the backend returns 403.
**Expected:** Section cleanly omitted, no error UI.
**Why human:** UAT Test 3 was skipped only because the moto wasn't reachable (blocked by Test 4). The code path (`parseAlertes` → `null` on non-ok, section gated on `alertes && alertes.length > 0`) is unchanged since the prior pass, where it was verified in code and covered by `ficheMoto.test.ts` (still green). Re-running this on-device is a recommended quick confirmatory pass, not an unresolved code gap.

### Gaps Summary

No gaps remain that block Phase 15 sign-off. The one substantive UAT failure (Test 4: accepted réclamation invisible without manual pull-to-refresh) was root-caused to a real mobile-app bug (missing refetch-on-focus, confirmed not a backend defect), closed via gap-closure plan 15-09 (commit `8992398`), and verified through: (a) direct code inspection confirming the guarded `useFocusEffect` pattern is present and correctly scoped in both `motos/index.tsx` and `devis/index.tsx`, (b) a clean `tsc --noEmit` and a full 104/104 `jest` pass with no regressions, and (c) an independent human on-device re-reproduction of the exact previously-failing scenario, which the user approved. The two remaining open items (devis fixture data, re-confirming the 403 discipline on the now-reachable moto) are data/sequencing gaps left over from the original UAT session, not code defects, and are recommended as quick follow-ups before or during Phase 16 but are not blockers for closing Phase 15.

Phase 15 status is upgraded from `human_needed` to **passed**.

---

_Verified: 2026-07-04T09:05:36Z_
_Verifier: Claude (gsd-verifier)_
