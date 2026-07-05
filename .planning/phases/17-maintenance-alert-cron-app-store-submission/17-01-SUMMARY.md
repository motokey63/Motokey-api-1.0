---
phase: 17-maintenance-alert-cron-app-store-submission
plan: 01
subsystem: api
tags: [supabase, cron, push-notifications, expo-server-sdk, github-actions]

# Dependency graph
requires:
  - phase: 13-push-dispatch-service
    provides: pushService.js sendPush() idempotency-guarded client fan-out
  - phase: 11-ux-dashboard-alerts
    provides: Entretien.getPlan() pct/tier calc (due/warning/urgent thresholds)
provides:
  - runMaintenanceAlertCron() tier-crossing detection + push fan-out service
  - motos.last_maintenance_tier_notified(_at) persisted state columns (migration 18)
  - POST /cron/maintenance-alerts secret-authenticated endpoint
  - .github/workflows/maintenance-alerts.yml daily scheduled trigger
affects: [17-02, 17-03, 17-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Secret-header cron auth (X-Cron-Secret vs process.env.CRON_SECRET) — first non-JWT-authenticated endpoint in the codebase"
    - "Persisted tier-rank state column (up AND down) as source of truth for once-per-tier notification rule, distinct from push_send_log's per-call idempotency guard"

key-files:
  created:
    - scripts/seed-test-maintenance-cron.js
    - scripts/test-maintenance-cron.js
    - services/maintenanceAlertService.js
    - sql/migrations/18_motos_maintenance_alert_state.sql
    - .github/workflows/maintenance-alerts.yml
  modified:
    - motokey-api.js

key-decisions:
  - "Cron computes worst tier via SBLayer.Entretien.getPlan direct function call, never the RBAC-gated /motos/:id/entretien/alertes HTTP endpoint (would 403 for CLIENT-owned motos per auth/rbac.js hierarchy)"
  - "last_maintenance_tier_notified persisted on motos (not a new table) — moto-level granularity matches D-04's phrasing, avoids joining plan_entretien's per-operation reset logic"
  - "Cron endpoint fail-closed: 401 when CRON_SECRET is unset in Railway, not fail-open"

patterns-established:
  - "Secret-header-authenticated route pattern for scheduled/non-user-session endpoints (mirrors /stripe/webhook's secret-check spirit, header-based instead of signature-based)"

requirements-completed: [MPUSH-04]

# Metrics
duration: 3min
completed: 2026-07-05
---

# Phase 17 Plan 01: Maintenance Alert Cron Summary

**Stateless-safe daily cron detects client-owned motos crossing the warning/urgent maintenance tier and sends exactly one push per new tier crossing, reusing Phase 13's push fan-out and Phase 11's tier math verbatim.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-05T17:15:19Z
- **Completed:** 2026-07-05T17:18:18Z
- **Tasks:** 3
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments
- `services/maintenanceAlertService.js` computes the worst maintenance tier per client-owned moto via `Entretien.getPlan` (never re-implementing the pct/tier math), sends a push only on strict tier-rank increase, and persists the new tier both upward (triggers push) and downward (silent, after maintenance is done)
- Migration 18 adds `last_maintenance_tier_notified` + `last_maintenance_tier_notified_at` on `motos`, ready for manual apply via Supabase Dashboard
- `POST /cron/maintenance-alerts` is the first secret-header-authenticated endpoint in the codebase (`X-Cron-Secret` vs `process.env.CRON_SECRET`), fail-closed (401) when the secret is unconfigured
- `.github/workflows/maintenance-alerts.yml` calls the endpoint daily via `curl`, using the correct `motokey11-production` prod URL and a GitHub Actions repo secret (no hardcoded credentials)
- Wave 0 scaffolds (`scripts/seed-test-maintenance-cron.js`, `scripts/test-maintenance-cron.js`) lock the seeded WARNING/URGENT tier fixtures and the `runMaintenanceAlertCron()` call contract for manual verification once migration 18 is applied

## Task Commits

1. **Task 1: Wave 0 — seed fixture + test harness scaffolds** - `26a83a1` (feat)
2. **Task 2: Migration 18 + maintenanceAlertService.runMaintenanceAlertCron()** - `98d6b05` (feat)
3. **Task 3: Secret-authenticated cron endpoint + GitHub Actions workflow** - `46b0486` (feat)

## Files Created/Modified
- `scripts/seed-test-maintenance-cron.js` - Idempotent-on-VIN seeder creating one WARNING-tier (Yamaha MT-07, pct=80) and one URGENT-tier (Honda CB500, pct=100) client-owned moto, resets `last_maintenance_tier_notified` to NULL on each run for a fresh crossing
- `scripts/test-maintenance-cron.js` - Manual harness calling `runMaintenanceAlertCron()` directly and printing the result, never hard-fails
- `services/maintenanceAlertService.js` - `runMaintenanceAlertCron()`: queries client-owned motos, reduces worst tier via `TIER_RANK`, sends push on strict rank increase via `pushService.sendPush`, persists tier state up/down
- `sql/migrations/18_motos_maintenance_alert_state.sql` - `ALTER TABLE motos ADD COLUMN last_maintenance_tier_notified (CHECK warning/urgent/NULL) + last_maintenance_tier_notified_at`
- `.github/workflows/maintenance-alerts.yml` - Daily `on.schedule` cron (06:00 UTC) + `workflow_dispatch` calling the endpoint with `secrets.CRON_SECRET`
- `motokey-api.js` - Added `maintenanceAlertService` require (line 82) and `POST /cron/maintenance-alerts` route (registered inside the `M()`-router section, after body parsing since no raw bytes are needed)

## Decisions Made
- Followed the plan's exact interface contract (TIER_RANK object, idempotency key shape `maintenance-alert:${motoId}:${worst}:${date}`, copy strings "Révision à planifier"/"Révision dépassée") with no deviation
- Push notification bodies include marque/modèle per the plan's exact template, defaulting to the research doc's open-question recommendation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `node --check` passed clean on both `motokey-api.js` and `services/maintenanceAlertService.js`; all grep-based acceptance criteria in the plan matched on first pass.

## User Setup Required

**External services require manual configuration before the cron can run in prod** (per plan frontmatter `user_setup`):
- **Supabase Dashboard** (`rzbqbaccjyxvtlnfitrr`) > SQL Editor: run `sql/migrations/18_motos_maintenance_alert_state.sql`
- **Railway**: add `CRON_SECRET` env var (generate a random secret, never paste in clear text in commands)
- **GitHub repo** > Settings > Secrets and variables > Actions: add `CRON_SECRET` as a repository Actions secret (same value as the Railway env var)

Live smoke test (401 without header, 200 + idempotent re-run with header, against the seeded WARNING/URGENT fixtures) is deferred to Plan 04's checkpoint, since it requires migration 18 applied and `CRON_SECRET` configured first.

## Next Phase Readiness
- MPUSH-04 backend logic is fully code-complete and syntax-verified; blocked only on the three manual setup steps above (tracked, not a code gap)
- `services/maintenanceAlertService.js` is ready to be exercised by `scripts/test-maintenance-cron.js` and by the live curl smoke test once migration 18 + `CRON_SECRET` are in place
- No blockers for Plan 02/03/04 (EAS setup, store compliance content, checkpoint/verification work) — this plan's scope was purely the backend cron half

---
*Phase: 17-maintenance-alert-cron-app-store-submission*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created files found on disk (scripts/seed-test-maintenance-cron.js, scripts/test-maintenance-cron.js, services/maintenanceAlertService.js, sql/migrations/18_motos_maintenance_alert_state.sql, .github/workflows/maintenance-alerts.yml, this SUMMARY.md). All three task commit hashes (26a83a1, 98d6b05, 46b0486) confirmed present in git log.
