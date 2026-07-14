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

## [25-05] CLIENT accounts never resolve to `ctx.role === 'CLIENT'` on legacy-JWT dual endpoints — **RÉSOLU 2026-07-15, sévérité revue à la baisse**

**Correction (2026-07-15, suite à question de Mehdi) :** l'analyse initiale ci-dessous
surestimait l'impact prod. Le diagnostic exact, vérifié en direct contre Supabase Auth :

- **Aucun vrai client n'était affecté.** Le flux réel (`POST /auth/client/register`,
  utilisé par `MotoKey_Client.html` L825/L878 et `mobile-app/context/AuthContext.tsx` L127)
  pose déjà `app_metadata.role='CLIENT'` correctement (`motokey-api.js` L2587-2590). Sondage
  live sur 6 comptes clients réels/inscrits : 6/6 avaient `role:'CLIENT'` posé.
- **Seul `sophie@email.com`** (fixture de dev créée par `setup-supabase.js`, Phase 18) n'avait
  pas de rôle posé — `sb.auth.admin.createUser()` sans `app_metadata`, contrairement au vrai
  flux d'inscription.
- **Les scripts de test compoundaient le problème** en connectant sophie via l'ancien
  `POST /auth/login` (`role:'client'`, JWT maison HS256) au lieu du vrai
  `POST /auth/client/login` (session Supabase réelle) qu'utilisent les vraies apps — donc
  même avec le rôle posé, le token de test n'aurait jamais été résolu par
  `rbac.extractRoleFromRequest`.
- `rbac.inferLegacyRole()` n'est **pas** un bug à corriger : c'est un fallback garage-only
  qui fait exactement ce pour quoi il a été écrit (résoudre les vieux tokens garage HS256) —
  il n'a jamais eu vocation à résoudre un rôle CLIENT.

**Corrections appliquées :**
1. `setup-supabase.js` pose désormais `app_metadata.role='CLIENT'` pour sophie (idempotent,
   même motif que `scripts/seed-rbac-test-users.js`) — appliqué live en prod.
2. `tests/test-km-photos-cloudinary.js` : nouveau helper `loginClient()` qui utilise
   `/auth/client/login` (vraie session Supabase) au lieu de `login(..., 'client')`
   (`/auth/login` legacy).
3. `tests/test-client-device-tokens.js` : même correction (`/auth/client/login` +
   `session.access_token`).

**Résultat live :** `tests/test-km-photos-cloudinary.js` 19/19 OK (le CLIENT positive-path
CONSO-03 passe désormais, plus de SKIP) ; `tests/test-client-device-tokens.js` 15/15 OK
(était 3/15) ; `test-api.js` 9/9 inchangé.

**Pas de dette RBAC transverse à planifier avant Phase 27/28** — c'était un défaut de fixture
de test, pas un gap de code affectant les utilisateurs réels.

---

**Analyse initiale (2026-07-14, conservée pour trace) :**

**Discovered during:** Plan 25-05, Task 2 live verification (2026-07-14) — CONSO-03 CLIENT
positive-path assertion (`POST /motos/:id/photos-consommables` as `sophie@email.com`).

**Symptom:** A CLIENT login (`POST /auth/login` with `role:'client'`) issues a legacy
HS256 JWT (`jwtSign({id: c.id, role:'client', ...})`), not a Supabase Auth JWT. Every
dual CLIENT/GARAGE handler in `motokey-api.js` resolves its RBAC context the same way:
`const ctx = req.ctx || (SBLayer ? await rbac.inferLegacyRole(a.id, SBLayer) : ...)`.
`rbac.inferLegacyRole(garageId, SBLayer)` (`auth/rbac.js` ~L126) is documented as being
for "comptes garage legacy" and does exactly that: it looks up the `garages` table by
`id === a.id`. For a CLIENT token, `a.id` is a `clients.id`, never a `garages.id`, so the
lookup returns nothing and `ctx` ends up `null` — indistinguishable from an unauthenticated
request. Confirmed not specific to the new CONSO-03 endpoint: reproduced live against two
pre-existing endpoints unrelated to this plan (`GET /motos/:id/interventions` → 403
`FORBIDDEN_ROLE`, `GET /devis` → 403 `FORBIDDEN_ROLE`) using the exact same `sophie@email.com`
session token that logs in successfully and carries a correct `moto_id`.

**Root cause:** `rbac.inferLegacyRole()` was written for the garage-legacy-JWT case only and
was never extended to also check the `clients` table when the garage lookup misses — a gap
that predates Phase 25 entirely (the helper and this ctx-resolution pattern are used at 60+
call sites already shipped to prod).

**Impact on this plan:** CONSO-03's CLIENT branch (`resolveMotoForCtx` → `rbac.requireAnyRole(ctx,
['CLIENT'])`) is implemented correctly per the interface given in `25-05-PLAN.md` and is
byte-for-byte consistent with the KM-02/KM-03 pattern established in 25-03 — the code is not
the bug. A genuine CLIENT positive-path test against this endpoint returns `404 NOT_FOUND`
(the ownership-safe null from `resolveMotoForCtx`) rather than `200/201`, purely because
`ctx` never carries `role:'CLIENT'` through this legacy-JWT path today.

**Not fixed here (Rule 4 — architectural, out of scope for a single-endpoint plan):**
`rbac.inferLegacyRole()` would need a second lookup branch (`clients` table by `auth_user_id`
or `id`, mirroring the `garages` branch) to return `{role:'CLIENT', level:1, ...}` — but this
function is consumed at 60+ call sites across `motokey-api.js` already live in prod (interventions,
devis, transfert, etc.), so fixing it is a cross-cutting RBAC change that needs its own
verification pass across every dual CLIENT/GARAGE endpoint, not a one-line patch scoped to
CONSO-03. Flagged for Mehdi's attention / a future RBAC-hardening phase.

**Test harness behavior:** `tests/test-km-photos-cloudinary.js` detects the `404` and logs an
explicit non-silent SKIP warning for the CLIENT branch rather than asserting a false pass or
failing the whole suite over a pre-existing, unrelated gap (Scope Boundary rule). All other
CONSO-03/CLOUD-01 assertions (garage positive path incl. D-05 auto-création, D-02 503 without
credentials, validation errors, CLOUD-01 round-trip skip) pass: 18/18 OK.

## [25-05] Two pre-existing, unrelated failures surfaced by the plan's full-suite verification step

**Discovered during:** Plan 25-05, running the plan's own `<verification>` chain
(`node test-api.js && node tests/test-or-e2e.js && node tests/test-client-device-tokens.js &&
node tests/test-km-photos-cloudinary.js`) — out of scope, logged not fixed (Scope Boundary rule).

- `tests/test-or-e2e.js` crashes immediately with `Cannot find module './supabase'` — a stale
  relative require path left over from commit `8b1d817` ("move test-or-e2e.js to tests/
  folder"), which moved the file down one directory without updating `require('./supabase')`
  to `require('../supabase')`. Unrelated to Phase 25/25-05 code.
- `tests/test-client-device-tokens.js` — was 3/15 (12 failed `HTTP 401`), same root cause as
  above (missing `app_metadata.role` on the `sophie@email.com` fixture + test using the legacy
  `/auth/login` instead of `/auth/client/login`). **RÉSOLU 2026-07-15** — now 15/15, see
  correction note above.

`node test-api.js` (9/9) and `tests/test-km-photos-cloudinary.js` (18/18, this plan's own
suite) both pass cleanly.
