# MotoKey — Garage DMS

## What This Is

MotoKey est un système de gestion de garage moto (DMS) pour Garage Motolab. Concept "3ème clé digitale" : chaque moto a un passeport numérique avec statut couleur, score d'entretien /100, protections anti-fraude et transfert de propriété. Les garages gèrent les motos, les ordres de réparation et les devis. Les clients accèdent à l'historique de leur moto via `MotoKey_Client.html` (web) et, depuis v1.3, via une app mobile native (React Native/Expo) avec notifications push. Les garages souscrivent à un abonnement Stripe (Solo/Atelier/Concession) avec enforcement de quotas.

## Core Value

Le score d'intégrité anti-fraude (pondération 1.0/0.6/0.3 selon la preuve) — sans lui, MotoKey est un simple DMS ; avec lui, c'est une preuve de valeur vérifiable à la revente.

## Current State (after v1.3 — 2026-07-08)

- **Shipped:** v1.0 Core Platform (2026-05-29), v1.1 L9 Stripe Billing (2026-06-16), v1.2 Pioneer Program & Production Go-Live (2026-07-01, Phase 8 parked), v1.3 App Client Mobile (2026-07-08, MSTORE-02 parked)
- **Prod URL:** https://motokey11-production.up.railway.app
- **Mobile app:** Expo Router/TypeScript native client (`/mobile-app`) — native auth (encrypted session, proactive refresh), full feature parity with `MotoKey_Client.html` (motos/devis/historique/liaison garage), push notifications (devis reçu, rappel entretien) via Expo + Firebase FCM V1. EAS Android dev build exists and installs; iOS build blocked on a paid Apple Developer account (same gate as MSTORE-02 below).
- **Push infra:** `services/pushService.js` (Expo Server SDK, idempotent via `push_send_log`), gated by Railway's `PUSH_ENABLED` flag (mirrors `EMAIL_ENABLED`'s convention) — must stay `true` in prod for real delivery; historically has been unset/lost between sessions, worth checking first if "no push received" is reported again.
- **Pioneer Program:** code PIONEER2026 configuré et câblé de bout en bout (`allow_promotion_codes: true`), mais uniquement en Stripe TEST — inactif en argent réel tant que Phase 8 n'est pas exécutée
- **Live Ops:** enforcement BILL-05 (HTTP 402) et emails NOTIF-03/NOTIF-04 code-complets et vérifiés câblés ; `BILLING_ENFORCE` reste `false` en prod (flip différé à Phase 8 par décision documentée)
- **Billing status:** Stripe toujours en mode test — `STRIPE_SECRET_KEY=sk_test_…`, `BILLING_ENFORCE=false`
- **Migrations:** 18 appliquées en prod (15 billing, 16 client_device_tokens, 17 push_send_log, 18 motos maintenance-tier columns)
- **Quick task 260624-l0e:** Mot de passe oublié comptes garage livré 2026-06-24

### Known Gaps (carried into next milestone)

- **Phase 8 — Stripe Live Mode (BILL-06)** : non exécutée. Le script de seed live (08-01) existe ; la bascule opérationnelle (08-02 : clés live, webhook live, Price IDs live, flip Railway) reste bloquée sur une action humaine Stripe Dashboard non encore faite. Détails : `.planning/milestones/v1.2-MILESTONE-AUDIT.md`.
- Script manquant : `scripts/stripe-create-pioneer-coupon-live.js` (référencé par le script TEST, à créer avant l'exécution de Phase 8).
- **MSTORE-02 — Validation TestFlight/Play Store non faite** : l'app est prête côté code/contenu (Privacy Manifest, Data Safety, profils EAS), mais n'a jamais été réellement soumise. Bloqué sur la création de deux comptes développeur payants (Apple 99$/an, Google 25$) par Mehdi. Détails : `.planning/milestones/v1.3-MILESTONE-AUDIT.md`.
- **`schema.sql` structurellement obsolète** : ne reflète pas les migrations 10 à 18 appliquées en prod (tables entières absentes : `client_device_tokens`, `push_send_log`, colonnes maintenance moto, `garage_users`, etc.), et son ENUM `statut_devis` documente des valeurs (`valide`/`annule`) qui ne correspondent plus au vrai CHECK constraint live (`accepte`/`refuse`/`expire`/`converti`). Pas exploitable actuellement (personne ne l'exécute contre la prod), mais landmine si utilisé pour bootstrap un nouvel environnement. Détails : `.planning/milestones/v1.3-MILESTONE-AUDIT.md`.
- **Fixture de login CLIENT cassée** (`sophie@email.com`/`client123` → 401) : préexistante, casse aussi `test-api.js` et d'autres endpoints — pas liée à une phase précise, à investiguer séparément.

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

- ✓ MAUTH-01 : Auth mobile native (login/register/reset), réutilise Supabase Auth existant — v1.3 Phase 14, 2026-07-03
- ✓ MAUTH-02 : Session chiffrée sur device (expo-secure-store, jamais AsyncStorage en clair) — v1.3 Phase 14, 2026-07-03
- ✓ MAUTH-03 : Rafraîchissement proactif du token au retour au premier plan — v1.3 Phase 14, preuve live device 2026-07-08
- ✓ MPARITY-01 : Liste motos (couleur + score d'intégrité) — v1.3 Phase 15, 2026-07-04
- ✓ MPARITY-02 : Devis — consultation + valider/refuser — v1.3 Phase 15, 2026-07-04
- ✓ MPARITY-03 : Historique interventions/entretien par moto — v1.3 Phase 15, 2026-07-04
- ✓ MPARITY-04 : Revendiquer/révoquer liaison garage — v1.3 Phase 15, 2026-07-04
- ✓ MPARITY-05 : Offline read-only + horodatage dernière mise à jour — v1.3 Phase 15, 2026-07-04
- ✓ MPUSH-01 : Écran soft-ask avant prompt système de permission push — v1.3 Phase 16, 2026-07-05
- ✓ MPUSH-02 : Device token enregistré/désenregistré au login/logout, bout-en-bout — v1.3 Phase 12 (backend) / Phase 16, preuve live 2026-07-08
- ✓ MPUSH-03 : Notification push immédiate à la création d'un devis — v1.3 Phase 16, preuve live 2026-07-08
- ✓ MPUSH-04 : Notification push seuil d'entretien dépassé, sans spam au réexécution du cron — v1.3 Phase 17, 2026-07-06
- ✓ MPUSH-05 : Tap sur notification navigue vers l'écran concerné (deep link devis/moto) — v1.3 Phase 16/17, 2026-07-08
- ✓ MSTORE-01 : Privacy Manifest (Apple) + Data Safety (Google) prêts pour soumission — v1.3 Phase 17, 2026-07-06

### Active

- [ ] BILL-06 : Stripe live mode (clés API live + 6 Price IDs live + webhook live sur Railway) — Phase 8 parké, reporté depuis v1.2, bloqué sur action humaine Stripe Dashboard
- [ ] Activer BILLING_ENFORCE=true en prod — dépend de BILL-06
- [ ] MSTORE-02 : Validation TestFlight (iOS) + piste de test interne Android avant soumission publique — reporté depuis v1.3, bloqué sur création de comptes développeur payants (Apple/Google) par Mehdi

### Out of Scope

- Mode offline **en écriture** — la lecture seule hors-ligne (motos/devis, horodatage dernière mise à jour) est livrée depuis v1.3 (MPARITY-05) ; la synchronisation en écriture reste hors scope, complexité trop élevée
- VIN decoder online complet — NHTSA + WMI local suffisant
- Stripe Elements in-app — PCI scope, Checkout hosted suffit
- Multi-garage / per-seat — modèle actuel per-garage suffit
- Stripe Tax / TVA automatique — différé post-L9
- SCA/3DS gestion cartes EU — faible fréquence B2B France, différé
- Bare React Native (sans Expo) — Expo managed workflow retenu, pas de module natif custom requis
- Chat in-app, paiement in-app mobile, diagnostics OBD-II natifs, UI flotte, centre de préférences de notification granulaire, push marketing — hors domaine B2C passeport moto (v1.3 scope decisions)

## Context

- **Stack backend/web** : Node.js/Express (Railway), Supabase (18 migrations), HTML vanilla (app.html ~42 KB, MotoKey_Client.html ~44 KB), Cloudinary (photos), Anthropic API (OCR factures), Resend (email), Stripe (billing)
- **Stack mobile (v1.3+)** : React Native/Expo Router + TypeScript (`/mobile-app`), expo-secure-store (LargeSecureStore AES-256), expo-notifications + expo-server-sdk (push), EAS Build (Android dev/preview profiles live ; iOS blocked on paid Apple account)
- **URL prod** : https://motokey11-production.up.railway.app
- **Supabase** : rzbqbaccjyxvtlnfitrr.supabase.co — 18 migrations appliquées en prod
- **Déploiement** : Railway auto-deploy sur git push origin master
- **Email** : Resend activé en prod (EMAIL_ENABLED=true, RESEND_API_KEY configuré)
- **Push** : Expo + Firebase FCM V1, `PUSH_ENABLED` Railway flag doit rester `true` — vérifier en premier si un push ne s'affiche pas
- **Billing** : Stripe activé test mode, 6 Price IDs, BILLING_ENFORCE=false (enforcement pas encore actif)
- **Score anti-fraude** : formule 70% conformité + 30% accumulation, pondération 1.0/0.6/0.3 — immuable sans validation explicite
- **Historique livraisons** : v1.0 (L1→L8), v1.1 (L9 Stripe Billing), v1.2 (Pioneer Program + Live Ops + UX Dashboard), v1.3 (App Client Mobile) — toutes validées prod ; Phase 8 et MSTORE-02 parkés en known gaps

## Constraints

- **Tech stack (backend + web)** : Node.js/Express + HTML vanilla — pas de framework front à introduire pour `app.html` / `MotoKey_Client.html`
- **Tech stack (mobile)** : React Native/Expo managed workflow dans `/mobile-app` — consomme l'API existante en HTTP, n'introduit aucun changement côté backend/web hors nouvelle surface push
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
| React Native/Expo managed (pas bare RN, pas PWA) | Notifications push natives impossibles en PWA classique ; managed workflow évite tout module natif custom | ✓ Good |
| Session mobile chiffrée via expo-secure-store (LargeSecureStore AES-256) | Jamais de token en clair dans AsyncStorage — pattern officiel Supabase pour React Native | ✓ Good |
| Refresh proactif : poll 60s + listener AppState foreground, single-flight guard | Refresh tokens Supabase rotatifs/one-time-use — un race concurrent invaliderait la session | ✓ Good |
| Backend push (Phases 12-13) découplé de l'app mobile | curl-testable avant tout code mobile, dérisque l'infra indépendamment | ✓ Good |
| `PUSH_ENABLED` flag Railway mirroring `EMAIL_ENABLED` | Même convention fail-safe (fallback console.log) que l'email — mais s'est avéré fragile (variable disparue entre sessions), à surveiller | ⚠️ Revisit — fonctionne mais s'est déjà réinitialisé silencieusement une fois |
| MSTORE-02 (soumission stores) parqué comme known gap | Même précédent que BILL-06/Phase 8 — bloqué sur comptes développeur payants, pas de travail code possible | ⚠️ Revisit — attend action humaine Mehdi |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Requirements shipped → move to Validated
2. New requirements → add to Active
3. Core Value check — still the right priority?
4. Context update with current state
5. Key Decisions log updated

---
*Last updated: 2026-07-08 — v1.3 App Client Mobile milestone complete*
