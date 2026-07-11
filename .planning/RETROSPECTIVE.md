# MotoKey — Retrospective

## Milestone: v1.1 — L9 Stripe Billing

**Shipped:** 2026-06-16
**Phases:** 5 (3→7) | **Commits:** 6 | **Lines:** +1120 | **Timeline:** 16 jours (2026-05-31 → 2026-06-16)

### What Was Built

1. Migration 15 — DB billing foundation sur `garages` + `billing_events` idempotency
2. 6 Price IDs Stripe (Solo/Atelier/Concession × mensuel/annuel) créés via API script
3. Webhook state machine — 7 événements, grace period 7j, guard idempotency
4. Stripe Checkout trial 14j sans CB + auto-trial garages existants
5. Enforcement quotas motos/users HTTP 402 avec BILLING_ENFORCE flag
6. Customer Portal self-service + emails trial-ending/payment-failed + section Abonnement app.html

### What Worked

- **Script versionné pour Stripe config** : créer les price IDs et le portal via scripts reproductibles plutôt que manuellement dans le Dashboard évite les erreurs et laisse une trace dans git
- **BILLING_ENFORCE flag** : le pattern "feature flag Railway pour activer progressivement" fonctionne bien — permet de livrer sans risquer les garages existants
- **Phases 4-7 en exécution libre** : les phases ont été livrées plus vite hors du workflow GSD formel une fois les fondations posées (phase 3)

### What Was Inefficient

- **GSD artifacts non tenus à jour** : phases 4-7 sans répertoires .planning/phases/ — ça n'a pas bloqué la livraison mais complique la complétion du milestone et perd du contexte
- **HANDOFF.json non supprimé** après complétion — artefact one-shot qui aurait dû être nettoyé immédiatement
- **Plans 03-03 et 03-04** sans SUMMARY : plans créés mais jamais exécutés via GSD (exécution hors workflow)

### Patterns Established

- Stripe SDK setup : webhook avant body(), signature HMAC, bytes bruts
- trial_settings.end_behavior=pause (pas cancel) — pattern à réutiliser pour tout système de trial
- Créer les ressources Stripe via API scripts versionnés (scripts/stripe-*.js) plutôt que le Dashboard

### Key Lessons

- Pour les phases avec des human checkpoints (API keys, env vars), le workflow GSD formel ralentit — l'exécution libre est plus agile mais perd le contexte structuré
- Cocher les REQUIREMENTS.md pendant l'exécution (pas après) facilite la complétion du milestone
- Le HANDOFF.json est le meilleur filet de sécurité quand les artifacts GSD sont incomplets

### Cost Observations

- Sessions : ~2 sessions intensives (2026-05-31 phase 3, 2026-06-16 phases 4-7)
- Notable : toute la billing logic (phases 4-7) livrée en ~45 minutes de session le 16/06

---

## Milestone: v1.2 — Pioneer Program & Production Go-Live

**Shipped:** 2026-07-01 (with known gap — Phase 8 parked)
**Phases:** 4 (8→11), 3/4 complete | **Plans:** 7 | **Commits:** 26 (v1.1→HEAD, includes 1 quick task) | **Timeline:** 9 jours (2026-06-22 → 2026-07-01)

### What Was Built

1. Pioneer Program — coupon PIONEER2026 (100% off, 3 mois repeating) + PromotionCode (max_redemptions:30) + garde-fou non-migration PIONR-02
2. NOTIF-03/NOTIF-04 — emails Resend annulation définitive et bienvenue trial, câblés dans le webhook state machine
3. BILL-05 — enforcement quotas HTTP 402 câblé bout-en-bout dans auth/planLimits.js, activable par flag Railway
4. UX-01/UX-02 — badge rouge score < 40 + chips alerte entretien sur le dashboard garage, calcul à l'affichage sans migration DB
5. Script de seed Stripe live-mode (08-01) livré, prêt pour exécution opérateur — mais la bascule elle-même (08-02) jamais lancée

### What Worked

- **Exécution parallélisée via worktrees** : plusieurs phases (09, 10, 11) livrées via des branches `worktree-agent-*` mergées, permettant l'exécution simultanée sans conflit
- **Discipline GSD complète maintenue** : contrairement à v1.1 (phases 4-7 sans artefacts), les phases 9-11 ont toutes CONTEXT.md + RESEARCH.md/DISCUSSION-LOG.md + VERIFICATION.md — la leçon de v1.1 a été appliquée
- **Séquencer les phases indépendantes de Phase 8** (UX Dashboard, Phase 11) a permis de livrer de la valeur immédiate sans attendre l'action humaine bloquante de Phase 8
- **`/gsd:audit-milestone` a détecté une dérive de traçabilité** avant la clôture : REQUIREMENTS.md marquait BILL-06 "Complete" alors que Phase 8 n'avait ni VERIFICATION.md ni exécution réelle de 08-02 — l'audit 3-sources (traceability + SUMMARY frontmatter + VERIFICATION.md) a fait exactement ce pour quoi il existe

### What Was Inefficient

- **Phase avec checkpoint humain bloquant (Phase 8) a gelé une partie du milestone** : Stripe live mode nécessite des actions Dashboard manuelles (clé live, webhook live) qu'aucune CLI ne peut automatiser — le milestone a dû être clôturé avec ce gap plutôt que d'attendre indéfiniment
- **`requirements-completed` frontmatter incohérent** : 08-01-SUMMARY.md revendiquait `[BILL-06]` alors qu'il n'a livré qu'un script inutilisé (pas la bascule réelle) — cette sur-déclaration s'est propagée jusqu'à REQUIREMENTS.md sans être remarquée avant l'audit. 09-01/10-01/10-02-SUMMARY.md n'avaient carrément pas ce champ, forçant une vérification manuelle croisée avec VERIFICATION.md
- **Script live-mode manquant découvert tardivement** : `scripts/stripe-create-pioneer-coupon.js` référence un `-live.js` qui n'a jamais été créé — trouvé par l'integration checker au moment de l'audit, pas pendant l'exécution de Phase 9
- **Artefacts de test non nettoyés** : fichiers `.bak`, screenshots, logs serveur laissés à la racine du repo en fin de session, découverts au resume-work

### Patterns Established

- Scripts Stripe live séparés des scripts test par suffixe `-live.js` + garde-fou `!key.startsWith('sk_live_')`
- PromotionCode (pas Coupon) porte `max_redemptions` — les deux sont des objets Stripe distincts
- Flag `isDeleted` pour différencier `subscription.deleted` (email) de `subscription.paused` (silencieux) dans un seul handler
- Alertes UI calculées à l'affichage (pas de nouveau champ DB) quand la donnée source existe déjà — évite une migration pour un besoin d'affichage pur
- Milestone clôturable avec un phase humaine-bloquée parkée en "Known Gap" documenté plutôt que de bloquer tout le milestone indéfiniment

### Key Lessons

- Ne jamais faire confiance à `requirements-completed` d'un SUMMARY.md sans vérifier qu'un VERIFICATION.md existe réellement pour la phase — un plan peut revendiquer un requirement qu'il ne fait qu'amorcer (08-01 a créé le script, pas exécuté la bascule)
- Les phases avec checkpoints humains obligatoires (clés API live, webhooks) doivent être identifiées tôt comme "risque de blocage milestone" — envisager de les isoler dans leur propre mini-milestone plutôt que de les mélanger à des phases 100% automatisables
- `/gsd:audit-milestone` avant `/gsd:complete-milestone` vaut le coût même quand on sait déjà qu'il y a un gap — il a trouvé un script live manquant (`stripe-create-pioneer-coupon-live.js`) que personne n'avait anticipé

### Cost Observations

- Sessions : ~4 sessions (contexte gathering 06-24/06-29, exécution 06-29/06-30, audit+clôture 07-01)
- Notable : phases 9-11 (code + vérification) livrées en 2 jours (06-29 → 06-30) une fois le contexte défini ; l'audit + clôture du milestone a pris la majorité de la session du 07-01 à cause de la dérive de traçabilité à investiguer

---

## Milestone: v1.3 — App Client Mobile

**Shipped:** 2026-07-08 (with known gap — MSTORE-02 parked)
**Phases:** 6 (12→17) | **Plans:** 25 | **Commits:** 112 | **Files:** 137 (+21759/-252) | **Timeline:** 8 jours (2026-07-01 → 2026-07-08)

### What Was Built

1. Backend push foundation (Phase 12) + push dispatch service (Phase 13) — device tokens, `services/pushService.js` (Expo Server SDK, idempotent), built and curl-tested independently of any mobile app
2. Native mobile app from scratch (Phase 14) — Expo Router + TypeScript, AES-encrypted `LargeSecureStore` session, proactive single-flight token refresh (60s poll + `AppState` foreground listener)
3. Full feature parity with `MotoKey_Client.html` (Phase 15) — motos, devis, historique, liaison garage, offline read-only cache
4. Push notifications wired end-to-end (Phase 16) — soft-ask, device-token lifecycle, devis-received push + deep link
5. Maintenance-reminder push via secret-gated cron + real EAS Android build with FCM V1 + app store submission content (Phase 17)
6. 4 real production bugs found and fixed via live on-device testing (devis-acceptance status literal, missing moto join, notification-routing devisId drop, missing Android notification channel) — none of which static code review or code-level VERIFICATION.md had caught

### What Worked

- **Backend/mobile decoupling (Phases 12-13 before 14)** : building and curl-testing the push infrastructure before any mobile UI existed de-risked it independently — by the time the app needed it, the backend contract was already proven
- **`/gsd:audit-milestone` run three times, progressively** (2026-07-06 initial → same-day re-audit → 2026-07-08 final) closed gaps incrementally rather than in one big push — went from 7/15 → 9/15 → 14/15 requirements satisfied, each pass driven by real evidence gathering (live device tests, Railway log inspection), not just paperwork
- **Live on-device testing surfaced real bugs static verification missed** : the devis-acceptance status literal (`'valide'` vs. the live DB's actual `'accepte'`) had been sitting in code marked "✓ SATISFIED" in a VERIFICATION.md — only broke when someone actually tapped "Accepter" on a real devis. Same pattern for the Android notification channel (code looked complete, notification just silently never displayed as heads-up)
- **Diagnostic order for "push not received"**: `PUSH_ENABLED` on Railway → HTTP logs (was the request even made) → deployment logs (`❌ Ticket push en erreur`) found the actual root cause (FCM credentials) fast, once established as a checklist

### What Was Inefficient

- **Two phase VERIFICATION.md files never got generated at execution time** (Phase 14, Phase 16) — this orphaned 4 requirements (MAUTH-01/02/03, MPUSH-01) in the first milestone audit purely on a missing-artifact technicality, even though the underlying code and on-device evidence were already solid. Cost a dedicated backfill pass days later.
- **`PUSH_ENABLED` silently disappeared from Railway's production env vars** between the 2026-07-06 gap-closure session (where it was confirmed working) and 2026-07-08 — no record of who/what unset it. Caused a full new debugging session to rediscover a previously-solved problem.
- **`schema.sql` allowed to drift far beyond the already-known `devis` ENUM issue** — the integration checker found it's missing entire tables from migrations 10 through 18 (`client_device_tokens`, `push_send_log`, maintenance-tier columns, `garage_users`, etc.). Not currently exploitable, but a compounding documentation debt that nobody has been assigned to fix.
- **MAUTH-03's on-device test needed real wall-clock time (~1h token TTL)** — this is unavoidable given Supabase's default access-token expiry, but wasn't anticipated at Phase 14's original human-verify checkpoint, causing a second dedicated session days later just to close one requirement.

### Patterns Established

- Diagnostic order for "push notification not arriving": `railway variables` (PUSH_ENABLED) → `railway logs --http` (was the request made) → `railway logs --deployment` (grep `Ticket push en erreur` for FCM/credential errors) → local `PUSH_ENABLED=true node scripts/test-push.js <token>` to verify fast without waiting on a user-triggered app action (FCM credentials are tied to the Expo project, not the calling machine)
- Retroactive VERIFICATION.md generation is a legitimate, cheap way to close "missing artifact" audit gaps — point a `gsd-verifier` agent at the phase directory + current code, have it cite existing SUMMARY/live evidence rather than re-deriving everything
- Session/env-var state on external platforms (Railway, Expo/FCM credentials) can regress silently between sessions with no git trail — worth a quick sanity check (`railway variables`, `eas credentials`) before assuming "it was working last time" still holds

### Key Lessons

- A phase's own VERIFICATION.md marking a requirement "✓ SATISFIED" from code review alone is not the same as it being proven on a real device against a real database — the MPARITY-02 devis-acceptance bug and the Android notification-channel gap both passed code-level checks and only broke in front of an actual user
- Missing phase artifacts (VERIFICATION.md) are cheap to backfill retroactively but expensive to *discover* — they silently orphan otherwise-solid requirements in milestone audits. Generating VERIFICATION.md as part of each phase's own closing checkpoint (not deferred to milestone-audit time) would have avoided the entire 2026-07-08 backfill session.
- External platform config (Railway env vars, Expo/FCM credentials) needs the same "trust but verify" discipline as code — a working state confirmed in one session is not guaranteed to still hold in the next one, with no code diff to explain why

### Cost Observations

- Sessions: ~7 across 8 days (2026-07-01 phase 12, 07-02 phase 13, 07-03/04 phases 14-15, 07-05 phase 16, 07-06 phase 17 + first audit + gap-closure, 07-08 MAUTH-03 closure + VERIFICATION.md backfill + push-delivery debugging + final audit + completion)
- Notable: the 2026-07-08 session alone closed 3 distinct gap categories (one genuine untested requirement, two missing documentation artifacts, one live production incident unrelated to the audit) in a single sitting — a pattern of "audit surfaces gaps, single follow-up session closes all of them with real evidence" repeated successfully from v1.2

---

## Milestone: v1.4 — Maintenance — CLIENT Fixture & Schema Drift

**Shipped:** 2026-07-09
**Phases:** 2 (18→19) | **Plans:** 4 | **Commits:** 10 | **Files:** 10 (+811/-39) | **Timeline:** 2 jours (2026-07-08 → 2026-07-09)

### What Was Built

1. CLIENT login fixture fixed (Phase 18) — `setup-supabase.js` creates/links a Supabase Auth user for `sophie@email.com`, closing a `401` that had been silently pre-existing and breaking `test-api.js`
2. Discovered and fixed a missing `clients` `UNIQUE(email, garage_id)` constraint (migration 19) while fixing the fixture — the seed upsert had been silently no-op'ing on conflict for an unknown period
3. `schema.sql` regenerated for migrations 1–19 (Phase 19) — 3 previously-absent tables, migration-18/19 columns/constraints, `devis.statut` CHECK matching the live 7-value constraint (captured via verbatim `pg_get_constraintdef`, not guessed)
4. Bootstrap verified for real against a genuinely empty, throwaway Supabase project (not simulated) — this closed exactly the "schema.sql drift" inefficiency flagged in v1.3's retrospective
5. Mid-verification, found and fixed a real regression in this phase's own work (migrations 10/13/15 columns never ported by plan 19-02) — plus discovered and deliberately deferred a second, larger category of undocumented drift (no migration file anywhere) on `garages`/`clients`/`interventions`/`devis`

### What Worked

- **Direct `pg` (node-postgres) connection as a fallback verification method**: the Supabase Dashboard SQL Editor truncated the pasted `schema.sql` at 3 different random points across 3 attempts (a genuine browser/clipboard reliability issue, confirmed by re-checking the source each time). Pivoting to `npm install pg --no-save` + a throwaway connection string bypassed the browser entirely and gave a reliable, repeatable bootstrap test — worth reaching for immediately next time a Dashboard paste misbehaves, rather than retrying the same paste.
- **Automated compare-mode diffing (`introspect-schema.js --compare`) caught real drift a human reading migration files would likely have missed** — it found that tracked migrations 10/13/15 (within the phase's own declared 1–19 scope) had never been applied to `schema.sql`, a genuine bug in this phase's own regeneration work, not just the anticipated ~19-untracked-tables gap.
- **Stopping to ask before expanding scope mid-execution**: when the compare surfaced two categories of drift (in-scope-but-missed vs. genuinely undocumented), pausing to get an explicit human decision ("fix A now, defer B") kept the phase bounded instead of silently ballooning into a full schema-parity project.

### What Was Inefficient

- **`schema.sql`'s own regeneration (plan 19-02) missed 3 tracked migration files (10, 13, 15)** despite the phase explicitly scoping itself to "migrations 1–19" — the original research (19-01) apparently didn't cross-check every numbered file in `sql/migrations/` against `schema.sql`'s table definitions, only the ones motivating the phase (12/16/17/18/19). A systematic file-by-file diff at research time would have caught this before execution instead of during verification.
- **~45 minutes lost to Dashboard SQL Editor paste truncation** (3 failed attempts, different failure point each time) before pivoting to a direct Postgres connection — the pivot should probably be the default for any `schema.sql`-sized paste in this environment now, not a last resort.
- **User-facing checkpoint messages initially in English mid-milestone** — Mehdi asked mid-session to switch to French for all conversational replies; noted as a standing preference now, but cost a small amount of back-and-forth to establish.

### Patterns Established

- When a Supabase Dashboard SQL Editor paste truncates unpredictably, don't retry the same paste — reach for `npm install pg --no-save` + a direct Postgres connection string (Project Settings → Database) and execute via the simple query protocol, which handles multi-statement SQL natively.
- Compare-mode schema diffing against prod (not just reading migration files) is the correct way to verify a hand-maintained `schema.sql` tracks reality — file-reading research alone missed real drift that only surfaced once actually diffed against a live introspection.
- When automated verification surfaces drift beyond the plan's anticipated scope, stop and get an explicit scope decision from the human rather than either silently fixing everything (scope creep) or silently ignoring it (incomplete fix) — document the deferred portion in the artifact itself (schema.sql's header) so it isn't lost.

### Key Lessons

- A phase that narrows its own scope ("migrations 1–19 only") still needs to verify it achieved that narrowed scope completely — "in scope" and "actually implemented" can diverge even within a deliberately small phase, as the missed migrations 10/13/15 columns showed.
- Browser-based paste of large SQL scripts is not reliable infrastructure to depend on for verification — prefer a scriptable path (direct DB connection, CLI) as the primary method when the environment allows installing one ad hoc, even for a "one-off human action" step.
- Undocumented, no-migration-file schema drift is apparently an ongoing pattern in this project (ad-hoc Dashboard `ALTER TABLE`s during other livraisons) — not unique to this milestone. Worth flagging as a durable process gap (migrations should be the *only* way schema changes reach prod) rather than something to keep rediscovering milestone after milestone.

### Cost Observations

- Sessions: 1 (2026-07-08 Phase 18, continued 2026-07-09 through Phase 19 execution, verification, and milestone completion in the same extended session)
- Notable: Phase 19's Wave 3 (bootstrap verification) took ~90 of the milestone's ~probably-150 total minutes — almost entirely interactive troubleshooting (paste failures, credential round-trips, the scope-decision conversation) rather than actual schema work, which itself took under 20 minutes across two patches

---

## Milestone: v1.5 — Résolution dérive schema.sql

**Shipped:** 2026-07-11
**Phases:** 3 (20→22) | **Plans:** 9 | **Commits:** 35 | **Files:** 24 (+2405/-166) | **Timeline:** 3 jours (2026-07-09 → 2026-07-11)

### What Was Built

1. 39 undocumented prod columns (Gap A) across `garages`/`clients`/`interventions`/`devis` fully catalogued with exact type/constraints/nullability and origin (git-correlated or Mehdi-confirmed), zero unresolved cells (Phase 20)
2. 3 retroactive numbered migrations (`sql/migrations/20-22`) created, each column carrying an inline origin comment, feeding a `schema.sql` update matching prod exactly for all 39 columns (Phase 21)
3. Gap B closed — 4 tables + 1 view + enum ported verbatim from migrations 13/15, RLS state resolved via a live REST probe rather than assumed (Phase 21)
4. Real fresh-Postgres bootstrap of `schema.sql` proven clean end-to-end via a new committed verification script (`bootstrap-fresh-schema.js`) — a genuine, previously-undetected drift (`billing_events.created_at`) was caught and fixed along the way (Phase 22)
5. `schema.sql`'s stale "known-partial-bootstrap" header rewritten — Gap A/B marked RÉSOLU, while the still-real ~19-table out-of-scope boundary stays intact (Phase 22)

### What Worked

- **Retroactive migrations sourced verbatim from a durable findings artifact** (`20-FINDINGS.md`): Phase 21 became a pure mechanical port with zero re-discovery, because Phase 20 had already resolved every column's exact type/constraints/origin. The integration checker later confirmed 39/39 columns traced with no drift.
- **Accepting a terminal "INCONNU/OUBLIÉ" verdict for undeterminable ghost columns** (7 of them, Phase 20) avoided an open-ended research loop — consistent with v1.3's lesson about isolating unbounded-effort work rather than letting it silently expand a phase.
- **Live re-execution during the verification pass itself, not just reading SUMMARY claims** — re-running the bootstrap during `22-VERIFICATION.md`'s own pass reproduced `SCHEMA_BOOTSTRAP_OK` independently, and it was this live-first posture (established in `22-02`) that caught the fresh project's new `sb_publishable_`/`sb_secret_` key format rejecting the existing PostgREST-based compare tooling — leading directly to discovering the `billing_events.created_at` drift via an `information_schema` fallback.

### What Was Inefficient

- **Two files document a constraint/column in a comment without applying it in their own DDL**: `sql/migrations/21_interventions_undocumented_columns.sql`'s `niveau_preuve` CHECK, and `sql/migrations/15_billing_foundation.sql` never backported with `billing_events.created_at`. Only `schema.sql` itself is authoritative — a future reader relying on either migration file standalone would get an incomplete picture.
- **New Supabase projects' `sb_publishable_`/`sb_secret_` key format broke the existing PostgREST-based `--compare` tooling** (`401 Secret API key required`) — worked around ad hoc with a throwaway `information_schema` script mid-session, but `introspect-schema.js` itself wasn't updated to handle both key formats for future re-use.
- **No README/.env.example created for the new fresh-project bootstrap verification chain** this milestone introduced — a repo-wide pre-existing gap, extended rather than closed.
- **A live database password was pasted directly into chat** during Phase 22's human checkpoint (`FRESH_DB_URL`), despite the plan's own text explicitly warning "jamais dans le chat" — required a follow-up project deletion to fully close the exposure.

### Patterns Established

- Committed, re-runnable verification scripts (`bootstrap-fresh-schema.js`) instead of ad-hoc scratchpad scripts (Phase 19's equivalent was never committed) — makes "prove it still bootstraps clean" cheap to re-run in any future phase.
- Undocumented prod drift workflow, now proven end-to-end: introspect → durable findings artifact with per-column origin verdicts (git-correlated or human-confirmed terminal) → retroactive numbered migration with inline origin comment → `schema.sql` update → live bootstrap+compare verification → header cleanup.
- When a human-action checkpoint explicitly warns against pasting a secret in chat and the user does it anyway, the agent needs its own detection/response step (flag the exposure, recommend rotation or deletion) rather than relying solely on the plan text to prevent it.

### Key Lessons

- A verification tool built against one Supabase project's API key convention (legacy JWT-style `anon`/`service_role`) can silently break against a newer project using the new `sb_publishable_`/`sb_secret_` format — external-platform API conventions should be treated as a moving target to re-check, not something queried once and assumed stable going forward.
- "Prove it live" during the verification pass itself — not just reading artifacts/SUMMARYs — is what actually caught a real drift (`billing_events.created_at`) that three prior phases' grep/diff-based checks had all missed.
- Even an explicit "never paste secrets in chat" instruction embedded in the plan text does not reliably prevent a user from doing it anyway under checkpoint pressure — treat any credential that appears in the transcript as compromised regardless of whether a warning existed, and proactively recommend rotation/deletion.

### Cost Observations

- Sessions: ~2 (2026-07-09/10 Phases 20-21, 2026-07-11 Phase 22 + audit + completion)
- Notable: Phase 22's single human checkpoint (create + supply credentials for + later delete a throwaway Supabase project) accounted for a disproportionate share of the phase's interactive back-and-forth relative to its 3 plans / 7 tasks — consistent with v1.4's observation that Dashboard-dependent checkpoints are the main friction point in an otherwise fast-moving milestone.

---

## Cross-Milestone Trends

| Milestone | Phases | Sessions | Shipped |
|-----------|--------|----------|---------|
| v1.0 Core Platform | L1–L8 | Multiple | 2026-05-29 |
| v1.1 Stripe Billing | 5 (3→7) | ~2 | 2026-06-16 |
| v1.2 Pioneer Program & Go-Live | 4 (8→11), 3/4 complete | ~4 | 2026-07-01 (Phase 8 known gap) |
| v1.3 App Client Mobile | 6 (12→17) | ~7 | 2026-07-08 (MSTORE-02 known gap) |
| v1.4 Maintenance | 2 (18→19) | 1 | 2026-07-09 (undocumented schema drift known gap) |
| v1.5 Résolution dérive schema.sql | 3 (20→22) | ~2 | 2026-07-11 |
