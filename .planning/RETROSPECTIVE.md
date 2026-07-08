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

## Cross-Milestone Trends

| Milestone | Phases | Sessions | Shipped |
|-----------|--------|----------|---------|
| v1.0 Core Platform | L1–L8 | Multiple | 2026-05-29 |
| v1.1 Stripe Billing | 5 (3→7) | ~2 | 2026-06-16 |
| v1.2 Pioneer Program & Go-Live | 4 (8→11), 3/4 complete | ~4 | 2026-07-01 (Phase 8 known gap) |
| v1.3 App Client Mobile | 6 (12→17) | ~7 | 2026-07-08 (MSTORE-02 known gap) |
