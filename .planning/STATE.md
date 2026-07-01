---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: App Client Mobile
status: defining_requirements
last_updated: "2026-07-01T10:00:00.000Z"
last_activity: 2026-07-01
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** v1.3 App Client Mobile — app React Native pour clients moto (parité MotoKey_Client.html + notifications push). Phase 8 (Stripe live mode) reste un known gap séparé, indépendant.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-07-01 — Milestone v1.3 started

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward, separate from v1.3)
v1.3 [░░░░░░░░░░] DEFINING REQUIREMENTS — App Client Mobile (React Native)
     Phase 8 (Stripe live mode) ⏸️ PARKED — separate/independent, not part of v1.3 scope
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 3 (v1.0 + v1.1 + v1.2) |
| Requirements v1.2 | 9 total, 8/9 shipped, BILL-06 carried forward (separate from v1.3) |
| Next action | Define v1.3 requirements, then `/gsd:plan-phase` |
| Phase 08-stripe-live-mode | ⏸️ PARKED — 08-01 ✅, 08-02 bloqué op humaine — known gap, independent of v1.3, see MILESTONES.md |

## Accumulated Context

- **URL prod** : https://motokey11-production.up.railway.app (Railway auto-deploy sur master)
- **Supabase** : rzbqbaccjyxvtlnfitrr.supabase.co — 15 migrations appliquées prod
- **Email** : Resend activé prod (EMAIL_ENABLED=true, RESEND_API_KEY configuré, welcome email opérationnel)
- **RBAC** : ADMIN > CONCESSION > PRO > MECANO — middleware `requireRole()` sur tous les endpoints sensibles
- **Score anti-fraude** : immuable sans validation Mehdi (pondération 1.0/0.6/0.3, formule 70/30)
- **Fichiers critiques** : motokey-api.js, app.html, supabase.js, MotoKey_Client.html — pas de modif via scripts shell
- **Stripe** : activé mode test, BILLING_ENFORCE=false (enforcement pas encore actif) → live mode + enforcement reportés en known gap (Phase 8), à reprendre dans un prochain milestone
- **Billing** : 6 Price IDs Stripe test, Customer Portal bpc_1Tiyd9… configuré, webhook actif
- **Pioneer Program** : coupon Stripe repeating 3 mois + non-migration price ID 24 mois + max 30 places auto
- **Phase 8 context** : Live mode → scripts de création Price IDs déjà versionnés en test (scripts/), pattern réutilisable pour live

## Actions Pending (non-bloquantes)

- Tester Customer Portal manuellement (POST /billing/portal → redirect Stripe)

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260330-i6w | Application MotoKey complète — 5 sections, thème clair, API connectée | 2026-03-30 | fcbd038 | [260330-i6w](./quick/260330-i6w-remplace-app-html-par-l-application-moto/) |
| 260624-l0e | Mot de passe oublié comptes garage — OTP recovery Supabase, 2 endpoints publics, UI login+confirm | 2026-06-24 | bcc8762 | [260624-l0e](./quick/260624-l0e-impl-menter-mot-de-passe-oubli-pour-les-/) |

## Session Log

| Date | Activity |
|------|----------|
| 2026-05-30 | Milestone v1.1 L9 Stripe Billing démarré — requirements définis (17), roadmap créé (phases 3-7) |
| 2026-05-31 | Phase 3 context gathered — décisions migration 15, Stripe products, stripeService.js skeleton, prix annuels. |
| 2026-05-31 | Phase 3 Plans 01+02 complets. stripe@22.2.0 installé, services/stripeService.js créé, migration 15 appliquée prod. |
| 2026-06-16 | Milestone v1.1 COMPLET — Phases 3→7 livrées. 6 price IDs créés via API, webhook state machine, checkout trial 14j, enforcement quotas 402, Customer Portal configuré (bpc_1Tiyd9…). Railway vars posées via CLI. Test checkout validé (cs_test_a1Bp4s…). Commits: 9c43711 → 9f28fe0. |
| 2026-06-22 | Milestone v1.1 archivé — MILESTONES.md, ROADMAP.md, PROJECT.md mis à jour. REQUIREMENTS.md supprimé. RETROSPECTIVE.md créé. Tag v1.1 à créer. |
| 2026-06-24 | Quick task 260624-l0e : mot de passe oublié comptes garage livré — 2 endpoints publics, UI app.html, OTP Supabase recovery. Commits bcc8762+2a4a466. Pushé origin/master. |
| 2026-06-24 | Milestone v1.2 Pioneer Program & Production Go-Live démarré — requirements en cours de définition. |
| 2026-06-24 | Roadmap v1.2 créé — 4 phases (8→11), 9/9 requirements mappés. Phase 8: Stripe Live Mode, Phase 9: Pioneer Program, Phase 10: Live Operations, Phase 11: Dashboard UX Alerts. |
| 2026-06-29 | Phase 8 mise en attente (bascule live différée — op humaine Stripe non encore faite). Passage à Phase 9 Pioneer Program — contexte à définir. |
| 2026-06-29 | Phase 9 context gathered — allow_promotion_codes Stripe Checkout, coupon 100% off 3 mois repeating, max_redemptions: 30, script stripe-create-pioneer-coupon.js. CONTEXT.md + DISCUSSION-LOG.md créés. |
| 2026-06-29 | Phase 9 planifiée — 1 plan (09-01), 3 tâches, 1 wave. Researcher: Coupon+PromotionCode (2 objets distincts), max_redemptions sur PromotionCode. Plan checker: VERIFICATION PASSED (10/10 dimensions). |
| 2026-06-29 | Phase 10 plan 01 exécuté — NOTIF-03 livré. Template subscription-cancelled.js + handleSubscriptionBlocked isDeleted flag + switch webhook différencié. Commits a8473a8 + 1f46fd7. |
| 2026-06-30 | Phase 11 plans 01+02 exécutés — UX-02 livré (alerteEntretienChip + Motos.list enrichi, commits c416bd7+96d909c). UX-01 confirmé couvert (D-05, .score-badge.score-rouge existant). Vérification visuelle prod approuvée. Phase 11 COMPLETE. |
| 2026-07-01 | Audit milestone v1.2 — status gaps_found. Phase 8 sans VERIFICATION.md, plan 08-02 jamais exécuté, BILL-06 non satisfait (Stripe toujours sk_test_). Intégration checker : 0 lien cassé sur les autres phases, BILL-05/enforcement pleinement câblé malgré flag off. Rapport : .planning/milestones/v1.2-MILESTONE-AUDIT.md. |
| 2026-07-01 | Milestone v1.2 clôturé (option "proceed anyway") — Phase 8/BILL-06 noté Known Gap, carried forward. Archivage : milestones/v1.2-ROADMAP.md, v1.2-REQUIREMENTS.md, v1.2-MILESTONE-AUDIT.md. REQUIREMENTS.md supprimé (fraîche pour prochain milestone). PROJECT.md évolué (Validated/Active/Key Decisions). Tag v1.2 créé et pushé. |
| 2026-07-01 | Nettoyage artefacts de test non trackés (.playwright-mcp/, .bak, screenshots, logs) + .gitignore (*.bak, *.log, .playwright-mcp/). Commit + push. |
| 2026-07-01 | Milestone v1.3 App Client Mobile démarré. Décisions de cadrage : app native React Native (pas PWA), cible clients moto (parité MotoKey_Client.html), nouveau répertoire /mobile-app dans le même repo, auth Supabase réutilisée, périmètre = parité fonctionnelle + notifications push. Phase 8 explicitement gardée séparée/indépendante de v1.3. |
