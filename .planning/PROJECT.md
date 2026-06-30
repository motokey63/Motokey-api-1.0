# MotoKey — Garage DMS

## What This Is

MotoKey est un système de gestion de garage moto (DMS) pour Garage Motolab. Concept "3ème clé digitale" : chaque moto a un passeport numérique avec statut couleur, score d'entretien /100, protections anti-fraude et transfert de propriété. Les garages gèrent les motos, les ordres de réparation et les devis. Les clients accèdent à l'historique de leur moto via une app dédiée. Les garages souscrivent à un abonnement Stripe (Solo/Atelier/Concession) avec enforcement de quotas.

## Core Value

Le score d'intégrité anti-fraude (pondération 1.0/0.6/0.3 selon la preuve) — sans lui, MotoKey est un simple DMS ; avec lui, c'est une preuve de valeur vérifiable à la revente.

## Current Milestone: v1.2 Pioneer Program & Production Go-Live

**Goal:** Lancer MotoKey en conditions réelles — Pioneer Program pour les 30 premiers garages, Stripe live mode, enforcement billing actif, emails complets, et dashboard alertes entretien.

**Target features:**
- Pioneer Program : code promo PIONEER2026 → 3 mois gratuits (coupon Stripe repeating) + prix bloqué 24 mois (non-migration price ID) + compteur 30 places auto
- Billing Go-Live : BILLING_ENFORCE=true activé, Stripe live mode (clés API + Price IDs recréés + webhook live)
- Emails manquants : NOTIF-03 annulation définitive, NOTIF-04 bienvenue activation trial
- UX Dashboard alertes : badge rouge score < 40 (ROUGE) + alerte kilométrage révision dépassé (seuil fixe dynamique, pas de champ DB)

## Current State (v1.2 in progress — 2026-06-30)

- **Shipped:** v1.1 L9 Stripe Billing — 2026-06-16; Phases 9+10+11 livrées 2026-06-30
- **Prod URL:** https://motokey11-production.up.railway.app
- **Pioneer Program:** code PIONEER2026 configuré (Stripe TEST), `allow_promotion_codes: true` actif — Phase 9 complète (UAT runtime pending)
- **Live Ops:** emails NOTIF-03 (annulation) + NOTIF-04 (bienvenue trial) livrés en code — Phase 10 complète (UAT runtime pending Phase 8)
- **Billing status:** Stripe activé mode test, BILLING_ENFORCE=false — go-live différé à Phase 8 (Stripe live mode)
- **Migration:** 15 appliquées prod
- **Quick task 260624-l0e:** Mot de passe oublié comptes garage livré 2026-06-24

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

### Validated (v1.2 — in progress)

- ✓ Pioneer Program — coupon PIONEER2026 (100% off, 3 mois repeating) + PromotionCode max_redemptions:30 + allow_promotion_codes Checkout + garde-fou non-migration PIONR-02 — Phase 9, 2026-06-30
- ✓ NOTIF-03 : Email Resend annulation définitive (customer.subscription.deleted) + template subscription-cancelled — Phase 10, 2026-06-29
- ✓ NOTIF-04 : Email Resend bienvenue trial (checkout.session.completed) — couvert par billing-confirm existant — Phase 10, 2026-06-29
- ✓ BILLING_ENFORCE checklist opérationnelle (scripts/BILLING-ENFORCE-GOLIVE.md) — Phase 10, 2026-06-29
- ✓ UX-01 : Badge rouge score < 40 visible sur cartes dashboard sans cliquer (`.score-rouge` pré-existant, confirmé Phase 11, 2026-06-30)
- ✓ UX-02 : Chip alerte entretien sur cartes dashboard — "Révision dépassée" (rouge, pct ≥ 100%) + "Révision à planifier" (jaune, pct 80–99%) — calcul à l'affichage sans migration DB — Phase 11, 2026-06-30

### Active (v1.2)

- [ ] Activer BILLING_ENFORCE=true en prod (bloqué Phase 8 — Stripe live mode)
- [ ] Go-live Stripe mode live (clés API + Price IDs live + webhook live sur Railway)

### Out of Scope

- Mode offline — hors scope actuel, complexité trop élevée
- App mobile native — web-first, portage mobile ultérieur
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
- **Historique livraisons** : v1.0 (L1→L8) + v1.1 (L9 Stripe Billing) — toutes validées prod

## Constraints

- **Tech stack** : Node.js/Express + HTML vanilla — pas de framework front à introduire
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

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Requirements shipped → move to Validated
2. New requirements → add to Active
3. Core Value check — still the right priority?
4. Context update with current state
5. Key Decisions log updated

---
*Last updated: 2026-06-24 — v1.2 Pioneer Program & Production Go-Live started*
