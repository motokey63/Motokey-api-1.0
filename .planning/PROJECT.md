# MotoKey — Garage DMS

## What This Is

MotoKey est un système de gestion de garage moto (DMS) pour Garage Motolab. Concept "3ème clé digitale" : chaque moto a un passeport numérique avec statut couleur, score d'entretien /100, protections anti-fraude et transfert de propriété. Les garages gèrent les motos, les ordres de réparation et les devis. Les clients accèdent à l'historique de leur moto via une app dédiée. Les garages souscrivent à un abonnement Stripe (Solo/Atelier/Concession) avec enforcement de quotas.

## Core Value

Le score d'intégrité anti-fraude (pondération 1.0/0.6/0.3 selon la preuve) — sans lui, MotoKey est un simple DMS ; avec lui, c'est une preuve de valeur vérifiable à la revente.

## Current Milestone: v1.3 App Client Mobile

**Goal:** Les clients moto disposent d'une app mobile native (React Native) pour gérer leur moto, leurs devis et recevoir des notifications push — en complément de MotoKey_Client.html.

**Target features:**
- Auth : réutilisation de l'auth Supabase existante (login/OTP/reset), consommée via l'API MotoKey — pas de nouveau backend auth
- Parité fonctionnelle avec MotoKey_Client.html : mes motos, mes devis (valider/refuser), historique entretien, liaison garage
- Notifications push natives (devis reçu, rappel entretien, etc.) — capacité impossible en HTML classique
- Backend : endpoints REST existants réutilisés + nouveaux si besoin (ex: enregistrement device token push)

**Explicitly separate from this milestone:** Phase 8 (Stripe live mode / BILL-06) reste un known gap indépendant, à reprendre quand Mehdi aura fait la bascule Stripe Dashboard — ne bloque pas v1.3.

## Current State (after v1.2 — 2026-07-01)

- **Shipped:** v1.0 Core Platform (2026-05-29), v1.1 L9 Stripe Billing (2026-06-16), v1.2 Pioneer Program & Production Go-Live (2026-07-01, Phase 8 parked — see Known Gaps below)
- **Prod URL:** https://motokey11-production.up.railway.app
- **Pioneer Program:** code PIONEER2026 configuré et câblé de bout en bout (`allow_promotion_codes: true`), mais uniquement en Stripe TEST — inactif en argent réel tant que Phase 8 n'est pas exécutée
- **Live Ops:** enforcement BILL-05 (HTTP 402) et emails NOTIF-03/NOTIF-04 code-complets et vérifiés câblés ; `BILLING_ENFORCE` reste `false` en prod (flip différé à Phase 8 par décision documentée)
- **Billing status:** Stripe toujours en mode test — `STRIPE_SECRET_KEY=sk_test_…`, `BILLING_ENFORCE=false`
- **Migration:** 15 appliquées prod, migration 16 (`client_device_tokens`) écrite mais **pas encore appliquée** — voir Known Gaps
- **Quick task 260624-l0e:** Mot de passe oublié comptes garage livré 2026-06-24
- **Phase 12 (v1.3) complete — 2026-07-01** : Backend Push Foundation — `POST/DELETE /client/device-tokens` + `GET /client/me` code-complets dans `motokey-api.js`, RBAC `requireAnyRole(['CLIENT'])`, migration 16 écrite. Voir Known Gaps pour le blocage restant.

### Known Gaps (carried into next milestone)

- **Phase 8 — Stripe Live Mode (BILL-06)** : non exécutée. Le script de seed live (08-01) existe ; la bascule opérationnelle (08-02 : clés live, webhook live, Price IDs live, flip Railway) reste bloquée sur une action humaine Stripe Dashboard non encore faite. Détails : `.planning/milestones/v1.2-MILESTONE-AUDIT.md`.
- Script manquant : `scripts/stripe-create-pioneer-coupon-live.js` (référencé par le script TEST, à créer avant l'exécution de Phase 8).
- **Migration 16 (`client_device_tokens`) non appliquée en prod** : bloque le happy-path (SC1/SC2) de `POST`/`DELETE /client/device-tokens` (Phase 12, 2026-07-01) — action humaine requise via Supabase Dashboard > SQL Editor (projet `rzbqbaccjyxvtlnfitrr`), fichier `sql/migrations/16_client_device_tokens.sql`. Voir `.planning/phases/12-backend-push-foundation/12-HUMAN-UAT.md`.
- **Fixture de login CLIENT cassée** (`sophie@email.com`/`client123` → 401) : préexistante, casse aussi `test-api.js` et d'autres endpoints — pas liée à Phase 12, à investiguer séparément.

## Requirements

### Validated

- ✓ Auth garage (login/logout/JWT) — v1.0
- ✓ RBAC 4 niveaux : ADMIN / CONCESSION / PRO / MECANO — v1.0 L4 + L4v2
- ✓ Fiche moto avec score /100 et statut couleur (VERT/BLEU/JAUNE/ROUGE) — v1.0
- ✓ Interventions + preuve anti-fraude (facture/visuel/déclaré) — v1.0
- ✓ Ordres de réparation (OR) avec tâches, pièces, statuts, stepper inline — v1.0 L3a + L3c
- ✓ Catalogue pièces + scanner EAN-13 — v1.0 L3c-a + L3c-b
- ✓ Devis client avec validation/refus — v1.0
- ✓ Auth client (register/login/OTP/reset MDP/welcome email Resend) — v1.0 L7b
- ✓ App client MotoKey_Client.html — devis, motos, liaison garage — v1.0
- ✓ Propriété polymorphe moto (garage/client/inconnu), cession, réclamation, révocation — v1.0 L8
- ✓ Gestion utilisateurs garage (MECANO/PRO, timer inactivité) — v1.0 L4v2
- ✓ Email transactionnel Resend (welcome) — v1.0 L7b
- ✓ Souscription Stripe Checkout trial 14j sans CB — v1.1 BILL-01/02
- ✓ 3 plans tarifaires Solo/Atelier/Concession (mensuel + annuel -17%) — v1.1 BILL-03/04
- ✓ Webhook state machine 7 événements + idempotency + grace period 7j — v1.1 WEBH-01/02/03/04
- ✓ Enforcement quotas motos/users HTTP 402 avec BILLING_ENFORCE flag — v1.1 LIM-01/02/03
- ✓ Customer Portal self-service + emails billing (trial-ending, payment-failed) — v1.1 PORT-01/02, NOTIF-01/02

- ✓ Pioneer Program — coupon PIONEER2026 (100% off, 3 mois repeating) + PromotionCode max_redemptions:30 + allow_promotion_codes Checkout + garde-fou non-migration PIONR-02 — v1.2 Phase 9, 2026-06-30 (câblé bout-en-bout, actif en Stripe TEST uniquement)
- ✓ NOTIF-03 : Email Resend annulation définitive (customer.subscription.deleted) + template subscription-cancelled — v1.2 Phase 10, 2026-06-29
- ✓ NOTIF-04 : Email Resend bienvenue trial (checkout.session.completed) — couvert par billing-confirm existant — v1.2 Phase 10, 2026-06-29
- ✓ BILL-05 : Enforcement quotas HTTP 402 câblé bout-en-bout (auth/planLimits.js) — v1.2 Phase 10, 2026-06-29 (flag `BILLING_ENFORCE` reste false, flip différé à Phase 8)
- ✓ UX-01 : Badge rouge score < 40 visible sur cartes dashboard sans cliquer (`.score-rouge` pré-existant, confirmé Phase 11, 2026-06-30)
- ✓ UX-02 : Chip alerte entretien sur cartes dashboard — "Révision dépassée" (rouge, pct ≥ 100%) + "Révision à planifier" (jaune, pct 80–99%) — calcul à l'affichage sans migration DB — v1.2 Phase 11, 2026-06-30

### Active

- [ ] BILL-06 : Stripe live mode (clés API live + 6 Price IDs live + webhook live sur Railway) — Phase 8 parké, reporté depuis v1.2, bloqué sur action humaine Stripe Dashboard
- [ ] Activer BILLING_ENFORCE=true en prod — dépend de BILL-06

### Out of Scope

- Mode offline — hors scope actuel, complexité trop élevée
- VIN decoder online complet — NHTSA + WMI local suffisant
- Stripe Elements in-app — PCI scope, Checkout hosted suffit
- Multi-garage / per-seat — modèle actuel per-garage suffit
- Stripe Tax / TVA automatique — différé post-L9
- SCA/3DS gestion cartes EU — faible fréquence B2B France, différé

## Context

- **Stack** : Node.js/Express (Railway), Supabase (15 migrations), HTML vanilla (app.html ~42 KB, MotoKey_Client.html ~44 KB), Cloudinary (photos), Anthropic API (OCR factures), Resend (email), Stripe (billing)
- **URL prod** : https://motokey11-production.up.railway.app
- **Supabase** : rzbqbaccjyxvtlnfitrr.supabase.co — 15 migrations appliquées en prod
- **Déploiement** : Railway auto-deploy sur git push origin master
- **Email** : Resend activé en prod (EMAIL_ENABLED=true, RESEND_API_KEY configuré)
- **Billing** : Stripe activé test mode, 6 Price IDs, BILLING_ENFORCE=false (enforcement pas encore actif)
- **Score anti-fraude** : formule 70% conformité + 30% accumulation, pondération 1.0/0.6/0.3 — immuable sans validation explicite
- **Historique livraisons** : v1.0 (L1→L8), v1.1 (L9 Stripe Billing), v1.2 (Pioneer Program + Live Ops + UX Dashboard) — toutes validées prod ; Phase 8 (Stripe live mode) parkée en known gap

## Constraints

- **Tech stack (backend + web)** : Node.js/Express + HTML vanilla — pas de framework front à introduire pour `app.html` / `MotoKey_Client.html`
- **Tech stack (mobile, v1.3+)** : React Native dans `/mobile-app` (nouveau répertoire, même repo) — consomme l'API existante en HTTP, n'introduit aucun changement côté backend/web
- **Sécurité** : `requireRole()` obligatoire sur tout nouvel endpoint sensible
- **Score/pondération** : ne pas modifier sans validation Mehdi
- **Fichiers critiques** : motokey-api.js, app.html, supabase.js, MotoKey_Client.html — édition directe uniquement (pas de scripts PowerShell/sed)
- **Railway** : auto-deploy sur master — toujours `node --check` avant push
- **Billing** : BILLING_ENFORCE à passer true explicitement — ne jamais activer sans décision de Mehdi

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| app.html séparé de motokey-api.js | Évite re-embed manuel, Railway sert depuis même origine sans CORS | ✓ Good |
| HTML vanilla (pas de framework) | Rapidité, pas de build step, déployable partout | ✓ Good |
| Supabase RLS + JWT app_metadata.role | RBAC robuste côté DB, un seul point de vérité | ✓ Good |
| Resend pour email transactionnel | SDK simple, free tier, fallback console.log en dev | ✓ Good |
| Pondération anti-fraude 1.0/0.6/0.3 | Cœur différenciateur — stabilité intentionnelle | ✓ Good |
| Stripe Checkout hosted (pas Elements) | Hors PCI scope, UX acceptable pour B2B | ✓ Good |
| trial_settings.end_behavior=pause | Données conservées à expiration trial, pas de perte | ✓ Good |
| BILLING_ENFORCE=false par défaut | Garages existants non impactés jusqu'à activation explicite | ✓ Good |
| Webhook avant body() dans motokey-api.js | Bytes bruts requis pour signature HMAC Stripe | ✓ Good |
| 6 price IDs via API script versionné | Reproductible, pas d'erreur de saisie Dashboard | ✓ Good |
| PromotionCode (pas Coupon) porte max_redemptions:30 | Coupon et PromotionCode sont 2 objets Stripe distincts ; seul PromotionCode supporte la limite de rédemptions | ✓ Good |
| Scripts live séparés des scripts test (`-live.js`) | Garde-fou explicite sk_live_/sk_test_, pas de risque de croiser les modes | ✓ Good |
| Flag `isDeleted` différencie cancelled/paused dans webhook | Un seul handler `handleSubscriptionBlocked`, email envoyé seulement si annulation définitive | ✓ Good |
| Alerte entretien calculée à l'affichage, sans champ DB | Pas de migration SQL nécessaire, logique simple dans Motos.list() | ✓ Good |
| BILLING_ENFORCE flip différé à Phase 8 (pas fait en v1.2) | Activer l'enforcement avant que Stripe live mode existe casserait les garages existants sans vrai moyen de paiement | ⚠️ Revisit — bloque go-live réel, dépend d'une action humaine Mehdi non encore faite |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Requirements shipped → move to Validated
2. New requirements → add to Active
3. Core Value check — still the right priority?
4. Context update with current state
5. Key Decisions log updated

---
*Last updated: 2026-07-01 — Phase 12 (Backend Push Foundation) complete*
