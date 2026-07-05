# MotoKey API — Roadmap

## Milestones

- ✅ **v1.0 Core Platform** — L1→L8 (shipped 2026-05-29)
- ✅ **v1.1 L9 Stripe Billing** — Phases 3→7 (shipped 2026-06-16)
- ✅ **v1.2 Pioneer Program & Production Go-Live** — Phases 8→11 (shipped 2026-07-01, Phase 8 parked as known gap — see MILESTONES.md)
- 🚧 **v1.3 App Client Mobile** — Phases 12→17 (in progress, started 2026-07-01)

## Phases

<details>
<summary>✅ v1.0 Core Platform (L1–L8) — SHIPPED 2026-05-29</summary>

- [x] L1: Auth garage (login/logout/JWT)
- [x] L2: Devis client + validation/refus
- [x] L3a: OR backend + frontend
- [x] L3c: Catalogue pièces + scanner EAN-13
- [x] L4 + L4v2: RBAC 4 niveaux + hardening
- [x] L7b: Auth client + email Resend
- [x] L8: Liaison polymorphe moto

</details>

<details>
<summary>✅ v1.1 L9 Stripe Billing (Phases 3–7) — SHIPPED 2026-06-16</summary>

- [x] Phase 3: DB Foundation + Stripe Dashboard Setup — Migration 15 + 6 Price IDs
- [x] Phase 4: Webhook Infrastructure — 7 events, state machine, idempotency
- [x] Phase 5: Checkout + Trial Flow — trial 14j sans CB, auto-trial, email confirm
- [x] Phase 6: Plan Limit Enforcement — HTTP 402, BILLING_ENFORCE flag
- [x] Phase 7: Self-Service Portal + Billing UI — Customer Portal, emails, section Abonnement

See [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v1.2 Pioneer Program & Production Go-Live (Phases 8–11) — SHIPPED 2026-07-01</summary>

- [ ] Phase 8: Stripe Live Mode — ⏸️ PARKED (known gap — 08-01 script done, 08-02 operational cutover not executed, blocked on human Stripe Dashboard action)
- [x] Phase 9: Pioneer Program — coupon PIONEER2026, 3 mois gratuits + prix bloqué 24 mois + compteur 30 places (completed 2026-06-30)
- [x] Phase 10: Live Operations — enforcement quotas + emails annulation/bienvenue (completed 2026-06-29)
- [x] Phase 11: Dashboard UX Alerts — badge rouge score + alerte kilométrage (completed 2026-06-30)

See [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md) for full details, [milestones/v1.2-MILESTONE-AUDIT.md](milestones/v1.2-MILESTONE-AUDIT.md) for the audit report.

</details>

### 🚧 v1.3 App Client Mobile (Phases 12–17) — IN PROGRESS

**Milestone Goal:** Les clients moto disposent d'une app mobile native (React Native/Expo) pour gérer leur moto, leurs devis et recevoir des notifications push — en complément de `MotoKey_Client.html`, sans changement au backend/web existant hors nouvelle surface push.

- [x] **Phase 12: Backend Push Foundation** - Device tokens + profil client exposés via API, curl-testable sans app mobile (completed 2026-07-01)
- [x] **Phase 13: Push Dispatch Service** - Service d'envoi de push modelé sur emailService.js, testable indépendamment (completed 2026-07-02, SC-1 real-device delivery deferred — see Phase Details)
- [x] **Phase 14: RN App Scaffolding + Native Auth** - Scaffold Expo Router + authentification native sécurisée (completed 2026-07-03)
- [x] **Phase 15: Feature-Parity Screens** - Motos, devis, historique, liaison garage — parité MotoKey_Client.html (completed 2026-07-04, 15-09 gap closure — UAT Test 4)
- [x] **Phase 16: Push Wiring End-to-End** - Soft-ask, enregistrement token, push devis reçu, deep link (completed 2026-07-05, MPUSH-02/03 real-device token+delivery deferred to Phase 17 EAS setup — see Phase Details)
- [ ] **Phase 17: Maintenance Alert Cron + App Store Submission** - Push rappel entretien + soumission stores

## Phase Details

### Phase 12: Backend Push Foundation
**Goal**: Le backend expose une capacité d'enregistrement/désenregistrement de device token push par utilisateur client, vérifiable indépendamment de toute app mobile (curl/Postman).
**Depends on**: Nothing (zero dépendance RN, peut démarrer en parallèle de tout le reste)
**Requirements**: MPUSH-02
**Success Criteria** (what must be TRUE):
  1. Un appel `POST /client/device-tokens` avec un token Expo valide et un JWT client valide crée une entrée liée à cet utilisateur, vérifiable via curl — code livré, vérifié manuellement (400/401 live), happy-path 201 non testé en live tant que migration 16 n'est pas appliquée
  2. Un appel `DELETE /client/device-tokens` supprime l'entrée correspondante (simule un logout) — code livré, même statut de vérification que SC1
  3. `GET /client/me` retourne le profil du client authentifié (comble le gap `/auth/me` identifié en recherche) — vérifié live end-to-end (200 confirmé contre Supabase prod)
  4. Les deux endpoints device-tokens sont protégés par `requireRole('CLIENT')` — un appel sans JWT valide échoue — vérifié live (401 confirmé)
**Plans**: 2/2 plans complete (12-01 data+harness, 12-02 endpoints) — 2026-07-01. Vérification manuelle effectuée ; migration 16 (sql/migrations/16_client_device_tokens.sql) reste à appliquer en Supabase Dashboard (rzbqbaccjyxvtlnfitrr) avant que SC1/SC2 soient prouvés en conditions réelles.

### Phase 13: Push Dispatch Service
**Goal**: Un service d'envoi de notifications push existe côté backend, testable manuellement avant même que l'app mobile ou un compte provider push soient prêts.
**Depends on**: Phase 12 (device tokens à cibler pour un envoi de test)
**Requirements**: (aucun requirement dédié — infrastructure habilitante pour MPUSH-03/04, suit le pattern `services/emailService.js`)
**Success Criteria** (what must be TRUE):
  1. `services/pushService.js` expose une fonction d'envoi qui, invoquée manuellement avec un token Expo réel, délivre une notification visible sur un appareil de test
  2. Avec un flag `PUSH_ENABLED=false`, l'envoi tombe en fallback `console.log` sans erreur (même convention que `EMAIL_ENABLED`)
  3. Un envoi avec la même clé d'idempotency qu'un envoi précédent ne déclenche pas une deuxième notification
  4. Un token invalide/expiré est journalisé sans faire planter le processus
**Plans**: 2/2 plans complete (13-01 foundation, 13-02 pushService) — 2026-07-02. SC-2/SC-3/SC-4 confirmed (fallback, idempotency verified live, invalid-token safety). SC-1 (real device delivery) explicitly deferred — no Expo Go / mobile device token available yet; to be exercised once one exists (naturally during Phase 14 or as a standalone check). Migration 17 (push_send_log) applied to prod Supabase — migration file's client_id FK to clients(id) was dropped to match a live schema-apply drift (no functional impact, client_id is debugging-only).
- [x] 13-01-PLAN.md — Foundation Wave 0 : expo-server-sdk + migration 17 push_send_log + PushSendLog helper (supabase.js) + harness scripts/test-push.js
- [x] 13-02-PLAN.md — services/pushService.js : sendToToken/sendPush, garde d'idempotency, fallback PUSH_ENABLED, gestion ticket-level + checkpoint device SC-1/SC-3 (SC-1 deferred, SC-3 confirmed live)

### Phase 14: RN App Scaffolding + Native Auth
**Goal**: Les clients peuvent s'authentifier depuis l'app mobile native, avec une session stockée de façon chiffrée et rafraîchie proactivement.
**Depends on**: Nothing techniquement bloquant côté backend, mais prérequis dur pour toutes les phases suivantes côté app (14 → 15, 16)
**Requirements**: MAUTH-01, MAUTH-02, MAUTH-03
**Success Criteria** (what must be TRUE):
  1. L'utilisateur peut créer un compte, se connecter et réinitialiser son mot de passe depuis l'app mobile (MAUTH-01)
  2. Le token de session est stocké via `expo-secure-store` (jamais en clair dans AsyncStorage) (MAUTH-02)
  3. Après un retour en premier plan (app remise au premier plan après mise en arrière-plan prolongée), le token est rafraîchi proactivement avant expiration, sans erreur 401 visible par l'utilisateur (MAUTH-03)
  4. L'utilisateur reste connecté entre deux ouvertures de l'app (session persistée)
**Plans**: 4 plans (waves 1-4, sequential — layered auth foundation)
- [x] 14-01-PLAN.md — Scaffold Expo Router+TS app, AES LargeSecureStore token store, fetch API client (MAUTH-01/02)
- [x] 14-02-PLAN.md — Auth session context + single-flight proactive refresh (timer + AppState foreground) (MAUTH-01/02/03)
- [x] 14-03-PLAN.md — Branded auth screens (login/register/OTP-verify/reset) + placeholder Home + router guard (MAUTH-01)
- [x] 14-04-PLAN.md — Human E2E verification of MAUTH-01/02/03 on device (checkpoint)
**UI hint**: yes

### Phase 15: Feature-Parity Screens
**Goal**: L'app mobile offre la parité fonctionnelle complète avec `MotoKey_Client.html` pour la gestion moto/devis/historique/liaison garage.
**Depends on**: Phase 14 (auth native)
**Requirements**: MPARITY-01, MPARITY-02, MPARITY-03, MPARITY-04, MPARITY-05
**Success Criteria** (what must be TRUE):
  1. L'utilisateur voit la liste de ses motos avec couleur de statut et score d'intégrité (MPARITY-01)
  2. L'utilisateur consulte un devis et peut le valider ou le refuser (MPARITY-02)
  3. L'utilisateur consulte l'historique d'entretien/interventions de chaque moto (MPARITY-03)
  4. L'utilisateur peut revendiquer ou révoquer une liaison garage (MPARITY-04)
  5. Hors connexion, l'utilisateur voit le dernier état connu de ses motos/devis avec un horodatage "dernière mise à jour" (lecture seule) (MPARITY-05)
**Plans**: 9 plans (waves 1-3 delivered + 15-09 gap closure — frontend-only, zero backend changes)
- [x] 15-01-PLAN.md — Display/parse logic modules (couleur/score, interventions/alertes, devis statut) + tests
- [x] 15-02-PLAN.md — Cache + garage-liaison logic modules (offline fallback, add/claim payloads) + tests
- [x] 15-03-PLAN.md — Navigation shell: Motos/Devis/Compte tabs + nested Motos stack + root redirect
- [x] 15-04-PLAN.md — Shared component kit (ScoreBadge, StatutBadge, EmptyState, OfflineBanner, MotoListCard, RevokeGarageModal)
- [x] 15-05-PLAN.md — Motos tab: list (couleur/score, cached) + Fiche Moto detail (historique, plan-403-hidden, pneus)
- [x] 15-06-PLAN.md — Devis tab: list + accept/refuse with confirm + cache
- [x] 15-07-PLAN.md — Liaison forms: Ajouter une moto (plan-limit + Passer Pro) + Réclamer une moto (VIN+plaque)
- [x] 15-08-PLAN.md — Liaison lists: Mes réclamations + Mes garages (leave-garage revoke modal)
- [x] 15-09-PLAN.md — Gap closure (UAT Test 4): refetch-on-focus (useFocusEffect) for Motos + Devis tabs so accepted réclamations / out-of-band changes appear on tab-return
**UI hint**: yes

### Phase 16: Push Wiring End-to-End
**Goal**: Les utilisateurs reçoivent des notifications push en temps réel quand un devis leur est adressé, avec un parcours de permission respectueux et une navigation directe vers l'écran concerné.
**Depends on**: Phase 12 (endpoints device-tokens), Phase 13 (service d'envoi), Phase 14 (auth native pour login/logout)
**Requirements**: MPUSH-01, MPUSH-02 (validation end-to-end), MPUSH-03, MPUSH-05
**Success Criteria** (what must be TRUE):
  1. Avant le prompt système iOS/Android, l'utilisateur voit un écran de pré-demande ("soft-ask") expliquant l'intérêt des notifications (MPUSH-01)
  2. Au login, le device token de l'utilisateur est enregistré côté backend ; au logout, il est désenregistré (MPUSH-02 bout-en-bout)
  3. Quand un nouveau devis est créé pour l'utilisateur, une notification push arrive sur son appareil en quelques secondes (MPUSH-03)
  4. Taper sur la notification "devis reçu" ouvre directement l'écran du devis concerné (MPUSH-05, deep link)
**Plans**: 4 plans (waves 1-3)
- [x] 16-01-PLAN.md — Backend: Devis.envoyer() + POST /devis/:id/envoyer (brouillon->envoye + sendPush) + PUT lock-on-send guard + seed fixture + app.html devis list fix
- [x] 16-02-PLAN.md — Mobile foundation: expo-notifications dependency + lib/softAsk.ts + lib/push.ts + hooks/useNotificationObserver.ts (all unit-tested pure logic)
- [x] 16-03-PLAN.md — Mobile wiring: soft-ask screen + AuthContext logout unregister + root layout redirect gating + notification observer/retry-hook mounting + Compte tab entry point
- [x] 16-04-PLAN.md — Verification: backend curl smoke test + full mobile suite + human E2E checkpoint, all 8 steps confirmed on-device 2026-07-05 (real on-device push token/delivery explicitly deferred to Phase 17 EAS setup; found+fixed a real notification-trigger bug in compte.tsx mid-checkpoint)
**UI hint**: yes

### Phase 17: Maintenance Alert Cron + App Store Submission
**Goal**: Les utilisateurs sont alertés par push quand leur moto dépasse le seuil de révision, et l'app est prête et validée pour une soumission publique sur les stores.
**Depends on**: Phase 13 (service d'envoi), Phase 16 (deep linking déjà en place, réutilisé pour la fiche moto)
**Requirements**: MPUSH-04, MSTORE-01, MSTORE-02
**Success Criteria** (what must be TRUE):
  1. Quand une moto dépasse le seuil d'entretien (logique UX-02 réutilisée), son propriétaire reçoit une notification push de rappel une seule fois par dépassement — pas de spam au réexécution du cron (MPUSH-04)
  2. Taper sur la notification de rappel entretien ouvre directement la fiche de la moto concernée (réutilise le deep link de Phase 16)
  3. L'app inclut un Privacy Manifest (Apple) et un formulaire Data Safety (Google) complets pour la soumission (MSTORE-01)
  4. L'app a été validée via TestFlight et une piste de test interne Android avant toute soumission publique (MSTORE-02)
**Plans**: TBD

## Progress

**Execution Order:**
Phases exécutent en ordre numérique : 12 → 13 → 14 → 15 → 16 → 17
(Phases 12-13 backend n'ont aucune dépendance RN et peuvent être exécutées avant/en parallèle de la Phase 14 ; Phase 15 n'a aucune dépendance sur l'infra push et peut avancer dès la Phase 14 terminée, en parallèle des Phases 12-13-16 si nécessaire.)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| L1–L8 | v1.0 | — | ✅ Complete | 2026-05-29 |
| Phase 3 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 4 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 5 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 6 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 7 | v1.1 | — | ✅ Complete | 2026-06-16 |
| Phase 8 | v1.2 | 1/2 | ⏸️ Parked (known gap) | - |
| Phase 9 | v1.2 | 1/1 | ✅ Complete | 2026-06-30 |
| Phase 10 | v1.2 | 2/2 | ✅ Complete | 2026-06-29 |
| Phase 11 | v1.2 | 2/2 | ✅ Complete | 2026-06-30 |
| Phase 12 | v1.3 | 2/2 | ✅ Complete | 2026-07-01 |
| Phase 13 | v1.3 | 2/2 | ✅ Complete (SC-1 deferred) | 2026-07-02 |
| Phase 14 | v1.3 | 1/4 | In Progress | - |
| Phase 15 | v1.3 | 9/9 | ✅ Complete (15-09 gap closure — UAT Test 4 resolved) | 2026-07-04 |
| Phase 16 | v1.3 | 4/4 | Complete | 2026-07-05 |
| Phase 17 | v1.3 | 0/TBD | Not started | - |

---
*Roadmap updated: 2026-07-04 — Phase 15 complete (9/9 plans): 15-09 gap closure (refetch-on-focus for Motos + Devis tabs) confirmed on-device, closes UAT Test 4 stale-list-on-focus-return.*
