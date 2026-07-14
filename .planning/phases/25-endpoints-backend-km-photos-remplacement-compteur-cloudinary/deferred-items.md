# Phase 25 — Deferred Items

## [25-03] `releves_km_rejets` audit trail not populated by the deployed prod trigger

**Discovered during:** Plan 25-03, Task 2 live verification (2026-07-14) against prod (`rzbqbaccjyxvtlnfitrr`).

**Symptom:** `RelevesKm.enregistrer()` correctly rejects a regressive km insert (trigger
`verifier_km_monotone` returns `NULL`, Postgres/PostgREST responds `PGRST116` as expected —
the anti-fraud gate itself works). But the `INSERT INTO releves_km_rejets` statement that
`sql/migrations/23_consommables_km.sql` defines inside that same trigger function does not
appear to persist: `releves_km_rejets` stays empty across two independent reproductions
(direct low-km inserts via `SBLayer.RelevesKm.enregistrer` bypass path), while a manual
direct `INSERT` into `releves_km_rejets` with the same service-role client succeeds and is
immediately visible via `SELECT` — ruling out RLS/visibility as the cause.

**Root cause:** Not determined. Most likely explanation: the function body actually applied
in prod via the manual Supabase Dashboard SQL Editor run (2026-07-14, per STATE.md) differs
from `sql/migrations/23_consommables_km.sql` as committed in this repo — the Phase 23 gate
that proved 28/28 PASS ran against a disposable Supabase project (`FRESH_DB_URL`), not prod;
prod's migration application was a separate manual step verified only by a `200 []` REST
probe (table existence + RLS), not by exercising the trigger's rejection path.

**Impact:**
- Anti-fraude core protection (KM-01 "rejette tout relevé km inférieur au maximum
  historique") **still works** — verified live, rejections are correctly blocked.
- The **audit/journalisation** half of KM-01 ("journalise la tentative dans
  `releves_km_rejets`") **appears broken in prod** — rejected attempts are not being logged,
  which weakens forensic traceability of fraud attempts (not the fraud prevention itself).

**Mitigation applied in this plan (in scope, Rule 1 — bug):** `RelevesKm.enregistrer()`
(`supabase.js`) now falls back to `motos.km` (the KM-04 synced source of truth) when no
`releves_km_rejets` row is found, so the HTTP 409 response's `km_actuel` field is never
`null`. This fixes the endpoint-level contract this plan is responsible for (KM-02/KM-03
must_haves) without touching the trigger itself.

**Not fixed here (needs Mehdi + Supabase Dashboard access):**
- Confirm the actual deployed body of `verifier_km_monotone()` in prod matches
  `sql/migrations/23_consommables_km.sql` (e.g. via Dashboard SQL Editor
  `SELECT prosrc FROM pg_proc WHERE proname = 'verifier_km_monotone'`).
- If it differs, re-run the `CREATE OR REPLACE FUNCTION verifier_km_monotone()` block from
  the migration file against prod.
- Re-verify with a throwaway low-km insert that `releves_km_rejets` receives a row.

**Cleanup performed:** a manual debug row I inserted directly into `releves_km_rejets`
during diagnosis (id `c800bfe5-3da0-475c-ac26-868af503a14f`) was deleted immediately after.
Two real test relevés were written to prod moto `2270b55e-8457-439d-a7d8-49b29b70c2ac` via
the actual HTTP endpoints as part of normal test-harness execution (established convention,
see `tests/test-km-photos-cloudinary.js` header and 25-02 decision log) — its `km` is now
18850 (was 18650 before this session); not reverted, consistent with how other test scripts
(e.g. `tests/test-or-e2e.js`) already write real records against prod seed data.
