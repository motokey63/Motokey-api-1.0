# MotoKey — Garage DMS

## What This Is

MotoKey est un système de gestion de garage moto (DMS) pour Garage Motolab. Concept "3ème clé digitale" : chaque moto a un passeport numérique avec statut couleur, score d'entretien /100, protections anti-fraude et transfert de propriété. Les garages gèrent les motos, les ordres de réparation et les devis. Les clients accèdent à l'historique de leur moto via `MotoKey_Client.html` (web) et, depuis v1.3, via une app mobile native (React Native/Expo) avec notifications push. Les garages souscrivent à un abonnement Stripe (Solo/Atelier/Concession) avec enforcement de quotas.

## Core Value

Le score d'intégrité anti-fraude (pondération 1.0/0.6/0.3 selon la preuve) — sans lui, MotoKey est un simple DMS ; avec lui, c'est une preuve de valeur vérifiable à la revente.

## Current Milestone: v1.8 Unification Devis / OR / Facture

**Goal:** Fusionner devis et OR en un objet unique (`ordres_reparation`, cycle de vie continu brouillon→facturé) pour éliminer la ressaisie manuelle et la confusion entre les deux objets actuels.

**Target features:**
- Cycle de vie unifié : `brouillon → envoyé → accepté → en_cours → terminé → facturé` (+ `refusé`, reste modifiable, redevient éditable)
- Numérotation unique continue (`INT-2026-XXXX`), un seul onglet UI "Interventions" (fusion Devis/OR) — `ordres_reparation` reste le nom canonique en base, "Interventions" n'est qu'un libellé UI (pas de collision avec la table `interventions` du carnet d'entretien anti-fraude)
- Ligne ajoutée en cours d'exécution (`ajoutee_en_cours`) bloquée jusqu'à acceptation client explicite (`en_attente_acceptation_client`, horodatage + identité — valeur probatoire, obligation légale FR)
- Table `devis` dépréciée en lecture seule après migration — `DROP` différé à une livraison ultérieure une fois confirmé qu'aucune dépendance ne subsiste
- Démarrage toujours par un devis (`brouillon`/`envoyé`) — jamais de création directe en `en_cours`

v1.7 (Édition devis brouillon) — **mis ON HOLD 2026-07-17, jamais shippé** : scope devenu obsolète suite à la décision produit d'unification du 16/07/2026, remplacé par v1.8. Code Phase 29 implémenté et vérifié GREEN (15/15) mais non committé — détail dans `.planning/STATE.md`.

v1.6 (Suivi usure consommables + anti-fraude km) shipped 2026-07-16 — see `.planning/milestones/v1.6-ROADMAP.md` for full detail.

## Current State (after v1.6 — 2026-07-16)

- **Shipped:** v1.0 Core Platform (2026-05-29), v1.1 L9 Stripe Billing (2026-06-16), v1.2 Pioneer Program & Production Go-Live (2026-07-01, Phase 8 parked), v1.3 App Client Mobile (2026-07-08, MSTORE-02 parked), v1.4 Maintenance — CLIENT Fixture & Schema Drift (2026-07-09), v1.5 Résolution dérive schema.sql (2026-07-11)
- **Prod URL:** https://motokey11-production.up.railway.app
- **Mobile app:** Expo Router/TypeScript native client (`/mobile-app`) — native auth (encrypted session, proactive refresh), full feature parity with `MotoKey_Client.html` (motos/devis/historique/liaison garage), push notifications (devis reçu, rappel entretien) via Expo + Firebase FCM V1. EAS Android dev build exists and installs; iOS build blocked on a paid Apple Developer account (same gate as MSTORE-02 below).
- **Push infra:** `services/pushService.js` (Expo Server SDK, idempotent via `push_send_log`), gated by Railway's `PUSH_ENABLED` flag (mirrors `EMAIL_ENABLED`'s convention) — must stay `true` in prod for real delivery; historically has been unset/lost between sessions, worth checking first if "no push received" is reported again.
- **Pioneer Program:** code PIONEER2026 configuré et câblé de bout en bout (`allow_promotion_codes: true`), mais uniquement en Stripe TEST — inactif en argent réel tant que Phase 8 n'est pas exécutée
- **Live Ops:** enforcement BILL-05 (HTTP 402) et emails NOTIF-03/NOTIF-04 code-complets et vérifiés câblés ; `BILLING_ENFORCE` reste `false` en prod (flip différé à Phase 8 par décision documentée)
- **Billing status:** Stripe toujours en mode test — `STRIPE_SECRET_KEY=sk_test_…`, `BILLING_ENFORCE=false`
- **Migrations:** 19 appliquées en prod (15 billing, 16 client_device_tokens, 17 push_send_log, 18 motos maintenance-tier columns, 19 clients UNIQUE(email, garage_id))
- **Quick task 260624-l0e:** Mot de passe oublié comptes garage livré 2026-06-24
- **v1.4 Phase 18 (2026-07-08) :** Fixture de login CLIENT (`sophie@email.com`/`client123`) réparée — compte Supabase Auth créé et lié via `auth_user_id`, idempotent sur re-seed. A aussi révélé une contrainte UNIQUE manquante sur `clients(email, garage_id)` (migration 19), bloquant silencieusement l'upsert de test depuis toujours.
- **v1.4 Phase 19 (2026-07-09) :** `schema.sql` régénéré et vérifié — bootstrap propre confirmé contre un projet Supabase neuf (via connexion Postgres directe, le paste dans l'éditeur SQL Dashboard s'étant révélé peu fiable dans cette session) + comparaison automatique vs prod. A aussi révélé et corrigé un vrai oubli : les migrations 10/13/15 (billing Stripe, liaison polymorphe L8) n'avaient jamais été reportées dans `schema.sql`. Une dérive supplémentaire, non documentée par aucun fichier de migration (colonnes sur `garages`/`clients`/`interventions`/`devis`), a été découverte et volontairement différée à une phase future (décision Mehdi 2026-07-09) — voir Known Gaps.
- **v1.5 Phase 20 (2026-07-09) :** Les 39 colonnes non documentées identifiées en Phase 19 sont désormais entièrement cataloguées — type exact/contraintes/nullabilité (via `information_schema`/`pg_constraint`, Dashboard SQL) et origine (git ou confirmation Mehdi) dans `.planning/phases/20-introspection-corr-lation-d-origine/20-FINDINGS.md`. Découverte notable : le cluster `clients` (5 colonnes) était déjà entièrement documenté dans une migration legacy oubliée (`migrations/04-rbac-migration.sql`, hors du dossier `sql/migrations/` habituel) — zéro travail restant dessus. `ville`/`cp` sur `garages` confirmées par Mehdi comme un découpage d'adresse jamais câblé (une valeur réelle en prod : Clermont-Ferrand/63000) ; 7 autres colonnes fantômes restent à origine INCONNUE de façon terminale (ni git ni Mehdi n'ont pu la déterminer). Prêt pour Phase 21 (migrations rétroactives).
- **v1.5 Phase 21 (2026-07-10) :** `schema.sql` reflète désormais l'état complet de prod pour Gap A et Gap B. Migrations rétroactives 20/21/22 créées dans `sql/migrations/` (34 colonnes Gap A avec commentaire d'origine chacune). `schema.sql` mis à jour : 39 colonnes Gap A portées sur `garages`/`clients`/`interventions`/`devis` (dont le port RBAC `clients` depuis la migration legacy, et la suppression de 10 colonnes `devis` obsolètes absentes de prod) ; 5 objets Gap B (`billing_events` + le cluster liaison-client-garage de la migration 13 + `v_motos_avec_proprietaire`) ajoutés verbatim, RLS activé sur les 4 nouvelles tables suite à une sonde REST live confirmant le default-deny. Vérification finale (grep/diff + introspection prod live) : 4/4 must-haves PASS, aucune colonne ou objet non documenté restant. Seul reste non-bloquant : l'en-tête de `schema.sql` (known-partial-bootstrap) à nettoyer en Phase 22.
- **v1.5 Phase 22 (2026-07-11) :** SCHEMA-07 clôture le milestone. `scripts/bootstrap-fresh-schema.js` (nouveau, committé) exécute `schema.sql` contre un projet Supabase neuf jetable via connexion `pg` directe — `SCHEMA_BOOTSTRAP_OK` confirmé. `introspect-schema.js --compare` étendu aux 5 objets Gap B a d'abord échoué contre le projet neuf (nouveau format de clé `sb_publishable_`/`sb_secret_` rejeté par l'endpoint OpenAPI PostgREST, `401`) — contourné par une comparaison `information_schema` directe sur la même connexion `pg`, qui a révélé une dérive réelle non cataloguée : `billing_events.created_at` (absente de la migration 15 et de `schema.sql`, origine indéterminée, aucune trace git) — corrigée dans `schema.sql`, bootstrap et comparaison re-exécutés propres. `v_motos_avec_proprietaire` confirmée exister structurellement via `information_schema.views`. En-tête de `schema.sql` réécrit : Gap A et Gap B marqués RÉSOLU, boundary hors-scope (~19 tables OR/billing/PDP/auth client) préservée intacte. Vérification finale : 9/9 must-haves PASS (bootstrap re-testé live en session de vérification). **Milestone v1.5 (Résolution dérive schema.sql) — scope d'ingénierie complet, prêt pour audit/clôture.**
- **v1.6 Phase 23 (2026-07-14) :** Premier milestone feature depuis la clôture de la dette v1.5. 4 tables créées (`consommables`, `photos_consommables`, `releves_km`, `releves_km_rejets`) avec trigger `verifier_km_monotone` (BEFORE INSERT, rejette + journalise toute régression km, NULL-safe pour les motos prod existantes sans historique) et trigger de sync `motos.km` (AFTER INSERT) — `releves_km` devient la source de vérité unique du kilométrage. Les 3 chemins d'écriture applicatifs existants (`Motos.update()`, `Interventions.create()` documenté découplé D-05, `OrdresReparation.cloturer()`) fermés au profit d'un seul validateur partagé `RelevesKm.enregistrer()` ; décision D-04 ajoutée en cours de plan-check : la clôture d'OR thread l'identité du membre garage (`ctx.user_id`) comme acteur du relevé, pas le `garage_id` générique — audit trail correct en garage multi-utilisateurs. Gate final exécuté en conditions réelles contre un projet Supabase jetable (`xjgyoehennuydoocbprj`) : bootstrap propre + script de test trigger 28/28 PASS + RLS default-deny confirmé live + parité migration/schema.sql. Cette exécution réelle (pas juste une revue statique) a révélé et corrigé 2 bugs que la revue SQL seule n'avait pas attrapés : `analyse` est un mot réservé Postgres (renommé `analyse_ia`) et les motos fixtures du script de test violaient la contrainte L8 `moto_proprietaire_coherence`. Vérification finale : 12/12 must-haves PASS, KM-01/KM-04/CONSO-02 complets. Migration appliquée en prod le jour même (Dashboard SQL Editor) — a aussi corrigé un bug prod actif : le code 23-03 (poussé sur `origin/master`, auto-déployé par Railway) appelait déjà `RelevesKm.enregistrer()` avant que la table `releves_km` n'existe en prod, cassant silencieusement toute clôture d'OR entre le déploiement du code et l'application de la migration.
- **v1.6 Phase 24 (2026-07-14) :** `services/visionAnalysisService.js` créé — `analyzePhoto()` flag-gated par `VISION_ENABLED` (même convention que `EMAIL_ENABLED`/`PUSH_ENABLED`), contrat de réponse verrouillé (`pct_usure`/`etat`/`confiance`/`analyse_status`/`engine`) via un stub déterministe SHA-256+mulberry32, service pur sans accès DB. `supabase.js` reçoit les helpers CRUD minces `Consommables` (upsert on-conflict, pas insert naïf — respecte la contrainte UNIQUE moto_id/type_consommable) et `PhotosConsommables` (insert/listByConsommable, persiste `analyse_ia`/`analyse_status`) ; `RelevesKm` (Phase 23) confirmé suffisant, aucun helper spéculatif ajouté. Vérification finale : 4/4 must-haves PASS, VISION-01/VISION-02 complets — contrat vision et frontière DB prêts pour Phase 25 (endpoints + Cloudinary), qui câblera le déclenchement réel à l'upload de photo.
- **v1.6 Phase 25 (2026-07-14) :** 5 endpoints livrés (4 vagues, `motokey-api.js` fichier partagé) : relevé km normal (KM-03) + remplacement de compteur PRO+ strict avec note obligatoire (KM-02), saisie consommables unitaire/bulk MECANO+ (CONSO-01), upload photo consommable avec pipeline complet upload→analyse→persistance (CONSO-03), stockage Cloudinary réel via `services/cloudinaryService.js` (CLOUD-01, D-02 : 503 typé si non configuré, jamais de placeholder). Premier pattern d'upload multipart introduit dans `motokey-api.js` (interception avant le `body()` inconditionnel du routeur, mirroring `/stripe/webhook`) ; helper `resolveMotoForCtx` extrait et réutilisé par 5 endpoints. D-05 : auto-création de la ligne consommable si le mécano n'a pas encore fait sa saisie, avant tout lien `consommable_id`. Vérification finale : 5/5 must-haves code-corrects, 18/18 assertions live contre prod Supabase, régression `test-api.js` 9/9 intacte. Statut `human_needed` (approuvé par Mehdi 2026-07-14) sur 2 points hors scope de la phase : (1) credentials Cloudinary pas encore provisionnés (dépendance externe planifiée depuis 25-01, le code prouve sa discipline D-02 par un 503 typé en attendant) ; (2) un CLIENT positive-path 404 sur CONSO-03 initialement attribué à tort à une "dette RBAC transverse 60+ endpoints" — **diagnostic corrigé 2026-07-15** : c'était un défaut de fixture de test (`sophie@email.com` sans `app_metadata.role`, tests utilisant le mauvais endpoint de login), aucun utilisateur réel affecté, corrigé le jour même — voir Known Gaps.
- **v1.6 Phase 26 (2026-07-15) :** Cron de rappel photo consommables livré (4 plans, 4 vagues séquentielles). Migration 24 ajoute 3 colonnes d'état (`consommables.dernier_rappel_envoye_at`/`dernier_rappel_km`, `photos_consommables.km_a_la_photo`). `services/consommableRappelService.js` centralise la grille de seuils (3000km OU 6 mois calendaire, premier des deux) dans une fonction pure `isConsommableEnRetard()` réutilisée à la fois par le cron (push clients) et par l'exposition badge (`Motos.list()`/`getById()`, motos garage/inconnu) — logique jamais dupliquée. `POST /cron/rappels-photo-consommables` (X-Cron-Secret, mirror exact de `/cron/maintenance-alerts`) scanne les motos client, envoie un push groupé par moto, et réarme l'état (D-05, `dernier_rappel_envoye_at`→NULL) dès qu'une nouvelle photo est uploadée — géré en JS applicatif dans `PhotosConsommables.insert()`, pas par un trigger Postgres. Gate final (26-04) : migration appliquée en prod par Mehdi, suite d'intégration relancée réellement contre prod (15/15 assertions actives, plus aucun skip pour colonne absente ou CRON_SECRET manquant), régression racine `test-api.js` intacte (9/9). Vérification finale : 3/3 must-haves PASS, GAUGE-03/GAUGE-04 complets. Note opérationnelle non bloquante en suspens : confirmer avec Mehdi si le scheduler externe (Railway cron) a besoin d'une seconde entrée planifiée pour ce nouvel endpoint.
- **v1.6 Phase 27 (2026-07-15) :** UI web jauges livrée (4 plans, 3 vagues — 27-03/27-04 exécutées en parallèle sur des worktrees isolés, mergées sans conflit de code car fichiers disjoints). Garage (`app.html`) : nouvel onglet Consommables remplace l'onglet Pneus au même emplacement nav, 9 jauges par type + jauge générale maillon faible en tête d'onglet, chip dashboard `consoChip` réutilisant les champs GAUGE-04 sans fetch supplémentaire. Client (`MotoKey_Client.html`) : section jauges wording grand public (Très bon état/À surveiller/À changer bientôt/À changer maintenant), upload photo par consommable en multipart brut (`uploadConsoPhoto`, premier pattern multipart du fichier, 503 géré proprement si Cloudinary non configuré). Section Pneus legacy entièrement supprimée des deux fichiers (zéro occurrence `renderPneus`/`loadPneus`/`pneusHtml`/`section==='pneus'`) ; `Motos.update` allow-list trimmée à `['couleur','photo_url']`. `CLAUDE.md` corrigé pour ne plus prétendre à tort que le retrait Pneus avait déjà eu lieu. Vérification finale : 5/5 must-haves PASS (code réel, pas seulement déclaratif), GAUGE-01/GAUGE-02/CONSO-04 complets, `node scripts/test-consommables-jauges.js --case=frontend-structure` 7/7 PASS. 5 items flagués pour test humain (rendu visuel des jauges ×2, chip dashboard, flux upload live, application prod de la migration 25) — aucun ne bloque le goal de la phase, tous nécessitent un serveur/DB live hors de portée d'une vérification statique.
- **v1.6 Phase 28 (2026-07-16) :** UI mobile jauges (lecture seule) livrée (2 plans, 2 waves). Fondations (28-01, worktree isolé) : `etatColor()`/`CONSO_LABELS`/`ETAT_WORDING` dans `mobile-app/lib/motoDisplay.ts` (parité verbatim avec `MotoKey_Client.html`), `parseConsommables()` dans `motoParse.ts` (pattern enveloppe deux niveaux existant), composant `GaugeBar` lecture seule — 44/44 tests jest, `tsc --noEmit` clean. Câblage écran (28-02, worktree isolé) : `mobile-app/app/(app)/(tabs)/motos/[id].tsx` reçoit un 4ème fetch parallèle `GET /motos/:id/consommables`, une pastille "État général" (maillon le plus faible) près du score, une section "Usure des Consommables" (9 lignes GaugeBar), et la section Pneumatiques legacy est entièrement retirée. Le deep link de notification `moto_entretien` → `motos/[id]` (D-04) était déjà correct côté `useNotificationObserver.ts`, aucun changement backend. Checkpoint human-verify approuvé par Mehdi sur device (jauges visibles, Pneumatiques absent, deep link fonctionnel). Suite complète mobile 142/142 tests passants après merge des deux plans (aucune régression). Incident opérationnel en cours d'exécution : `mobile-app/node_modules` s'est retrouvé vide dans le checkout principal (effet de bord des exécutions en worktree isolé) — corrigé par `npm install` + normalisation cosmétique du lockfile. Vérification finale : 9/9 must-haves PASS, GAUGE-05/GAUGE-06 complets, trace de flux de données jusqu'à `services/jaugeConsommables.js`/Supabase confirmée (pas un stub). **Milestone v1.6 (Suivi usure consommables + anti-fraude km) : 6/6 phases complètes — prêt pour `/gsd:complete-milestone`.**

### Known Gaps (carried into next milestone)

- **Phase 8 — Stripe Live Mode (BILL-06)** : non exécutée. Le script de seed live (08-01) existe ; la bascule opérationnelle (08-02 : clés live, webhook live, Price IDs live, flip Railway) reste bloquée sur une action humaine Stripe Dashboard non encore faite. Détails : `.planning/milestones/v1.2-MILESTONE-AUDIT.md`.
- Script manquant : `scripts/stripe-create-pioneer-coupon-live.js` (référencé par le script TEST, à créer avant l'exécution de Phase 8).
- **MSTORE-02 — Validation TestFlight/Play Store non faite** : l'app est prête côté code/contenu (Privacy Manifest, Data Safety, profils EAS), mais n'a jamais été réellement soumise. Bloqué sur la création de deux comptes développeur payants (Apple 99$/an, Google 25$) par Mehdi. Détails : `.planning/milestones/v1.3-MILESTONE-AUDIT.md`.
- ~~**`schema.sql` — en-tête known-partial-bootstrap obsolète**~~ → **RÉSOLU (v1.5 Phase 22, 2026-07-10, SCHEMA-07)** : bootstrap propre vérifié contre un projet Supabase neuf (connexion Postgres directe, comparaison automatique vs prod), et l'en-tête de `schema.sql` réécrit — Gap A et Gap B ne sont plus listés comme non résolus. La dérive non documentée découverte en Phase 19 est entièrement close (SCHEMA-02→07). Reste hors scope, distinct : parité complète des ~19 tables (OR, billing/factures, catalogue, PDP, auth client) — voir en-tête `schema.sql` bloc 1 et REQUIREMENTS.md Out of Scope.
- **Credentials Cloudinary non provisionnés (v1.6 Phase 25)** : `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` absents de `.env` local et de Railway (`motokey1.1`). Dépendance externe planifiée depuis 25-01-PLAN.md — le code se comporte correctement en attendant (503 `CLOUDINARY_NOT_CONFIGURED`, jamais de placeholder, D-02). Une fois provisionnés : re-jouer `node tests/test-km-photos-cloudinary.js` pour confirmer le round-trip réel (`https://res.cloudinary.com/...`).
- ~~**Dette RBAC transverse — `rbac.inferLegacyRole()` ne résout jamais `role='CLIENT'`**~~ → **RÉSOLU 2026-07-15, diagnostic initial surestimé** : l'analyse Phase 25 avait conclu à tort à un gap RBAC affectant 60+ endpoints prod. Vérification live sur Supabase Auth : les vrais clients (inscrits via `POST /auth/client/register`, flux réel de `MotoKey_Client.html`/app mobile) ont tous `app_metadata.role='CLIENT'` correctement posé (6/6 sondés) — aucun utilisateur réel affecté. Le vrai problème : le compte fixture de dev `sophie@email.com` (créé par `setup-supabase.js`, Phase 18) n'avait pas de rôle posé, et les scripts de test l'authentifiaient via l'ancien `/auth/login` (JWT maison) au lieu du vrai `/auth/client/login` (session Supabase). Corrigé : `setup-supabase.js` pose désormais le rôle (appliqué live), `tests/test-km-photos-cloudinary.js` et `tests/test-client-device-tokens.js` utilisent le vrai flux de login client. `rbac.inferLegacyRole()` n'est pas un bug — fallback garage-only qui fonctionne comme prévu. Détails : `deferred-items.md` (Phase 25).

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

- ✓ CFIX-01 : Fixture de login CLIENT (`sophie@email.com`/`client123`) — compte Supabase Auth créé + `auth_user_id` lié dans `setup-supabase.js`, idempotent — v1.4 Phase 18, 2026-07-08 (a aussi révélé et corrigé une contrainte UNIQUE(email, garage_id) manquante sur `clients`, migration 19)
- ✓ SCHEMA-01 : `schema.sql` régénéré pour les migrations 1–19 (3 nouvelles tables, colonnes maintenance moto, contrainte UNIQUE clients, CHECK devis.statut réel) + bootstrap vérifié contre un projet Supabase neuf — v1.4 Phase 19, 2026-07-09 (a aussi corrigé un oubli des migrations 10/13/15 découvert en cours de vérification ; dérive non documentée restante différée, voir Known Gaps)

- ✓ SCHEMA-02 : Les 39 colonnes non documentées sur `garages`/`clients`/`interventions`/`devis` sont identifiées avec type exact, contraintes et nullabilité (introspection PostgREST + `information_schema`/`pg_constraint`) — v1.5 Phase 20, 2026-07-09
- ✓ SCHEMA-03 : Chaque colonne non documentée est corrélée à son origine via l'historique git — `clients` résolu par une migration legacy oubliée (`migrations/04-rbac-migration.sql`), `devis` classé "code-catch-up" (le code a été corrigé pour suivre une DB déjà dérivée), et pour `garages`/`interventions` : `ville`/`cp` confirmés par Mehdi comme découpage d'adresse jamais câblé, les 7 autres colonnes (`type`, `marque_officielle`, `actif`, `niveau_preuve`, `facture_id`, `photo_url`, `operation_code`) en verdict terminal INCONNU (origine non déterminable ni par git ni par Mehdi) — v1.5 Phase 20, 2026-07-09
- ✓ SCHEMA-04 : Migrations rétroactives numérotées 20/21/22 documentant les 34 colonnes Gap A (garages 5, interventions 4, devis 25), chaque colonne portant un commentaire d'origine sourcé depuis 20-FINDINGS.md — v1.5 Phase 21, 2026-07-10
- ✓ SCHEMA-05 : `schema.sql` mis à jour pour inclure les 39 colonnes Gap A sur `garages`/`clients`/`interventions`/`devis` (port RBAC `clients` depuis `migrations/04-rbac-migration.sql`, FK hors-scope omises, 10 colonnes `devis` obsolètes supprimées) — v1.5 Phase 21, 2026-07-10
- ✓ SCHEMA-06 : `billing_events`, `motos_proprietaires_historique`, `liaisons_client_garage`, `reclamations_moto` + vue `v_motos_avec_proprietaire` ajoutés à `schema.sql` verbatim depuis migrations 13/15, `mode_acquisition_enum` (8 valeurs) déclaré, RLS activé sur les 4 tables (sonde REST live confirmée) — v1.5 Phase 21, 2026-07-10
- ✓ SCHEMA-07 : Bootstrap vérifié propre contre un projet Supabase neuf (connexion Postgres directe, `SCHEMA_BOOTSTRAP_OK`) + comparaison automatique fresh vs prod (18 objets, dont les 5 Gap B et la vue `v_motos_avec_proprietaire` confirmée structurellement) + header `schema.sql` réécrit (Gap A/B marqués RÉSOLU, boundary hors-scope ~19 tables préservée) — v1.5 Phase 22, 2026-07-11 (a aussi révélé et corrigé une dérive réelle non planifiée : `billing_events.created_at`, absente de la migration 15 et de `schema.sql`, origine indéterminée)

- ✓ KM-01 : Le système refuse tout relevé km inférieur au maximum historique de la moto (trigger DB `verifier_km_monotone`, BEFORE INSERT) et journalise la tentative dans `releves_km_rejets` — v1.6 Phase 23, 2026-07-14
- ✓ KM-04 : `releves_km` est la source de vérité du kilométrage — `motos.km` recalculé automatiquement via trigger de sync ; les 3 chemins d'écriture existants (`Motos.update()`, `Interventions.create()` documenté découplé D-05, `OrdresReparation.cloturer()`) passent tous par `RelevesKm.enregistrer()`, plus aucun bypass applicatif — v1.6 Phase 23, 2026-07-14 (a aussi ajouté D-04 : acteur_id threadé depuis `ctx.user_id` sur la clôture d'OR, audit trail par membre garage plutôt que garage_id générique)
- ✓ CONSO-02 : Schéma `consommables`/`photos_consommables` extensible via `type_consommable` TEXT+CHECK (9 types v1), ajout futur = migration légère sans changement structurel — v1.6 Phase 23, 2026-07-14
- ✓ KM-03 : Relevé km normal (CLIENT propriétaire ou membre garage MECANO+), photo optionnelle, ne déclenche jamais de changement de compteur — v1.6 Phase 25, 2026-07-14
- ✓ KM-02 : Remplacement de compteur réservé PRO+ strict (MECANO/CLIENT → 403), note obligatoire, archive l'ancien relevé via `type_evenement='remplacement_compteur'` — v1.6 Phase 25, 2026-07-14
- ✓ CONSO-01 : Saisie consommables MECANO+ (PATCH unitaire par type + POST bulk jusqu'aux 9 types), validée contre `TYPES_CONSOMMABLES` avant écriture DB, délègue à `Consommables.upsert()` (D-04, pas de logique dupliquée) — v1.6 Phase 25, 2026-07-14
- ✓ CONSO-03 : Upload photo consommable (garage + CLIENT validés live, fixture `sophie@email.com` corrigée 2026-07-15) — pipeline upload Cloudinary → auto-création consommable si absente (D-05) → analyse stub → historisation — v1.6 Phase 25, 2026-07-14
- ✓ CLOUD-01 : Stockage réel Cloudinary (code complet, D-02 : jamais de placeholder), round-trip live en attente de credentials (voir Known Gaps) — v1.6 Phase 25, 2026-07-14
- ✓ GAUGE-03 : Cron `POST /cron/rappels-photo-consommables` — push groupé par moto client, idempotent (pas de doublon au réexécution), réarmé (D-05) dès nouvelle photo uploadée — vérifié live contre prod (15/15 assertions) — v1.6 Phase 26, 2026-07-15
- ✓ GAUGE-04 : Champ calculé `rappel_photo_en_retard`/`consommables_en_retard` exposé sur `Motos.list()`/`getById()` — badge garage pour motos garage/inconnu sans compte client à notifier, même grille de seuils que le cron (fonction pure partagée) — v1.6 Phase 26, 2026-07-15
- ✓ GAUGE-01 : Jauge % par consommable (9 types) visible côté garage (`app.html`, onglet Consommables) et côté client (`MotoKey_Client.html`, section jauges wording grand public), toutes deux alimentées par `GET /motos/:id/consommables` — v1.6 Phase 27, 2026-07-15
- ✓ GAUGE-02 : Jauge générale = consommable en plus mauvais état (`computeJaugeGenerale`, max-reduce, jamais une moyenne), unit-testée 4/4 — v1.6 Phase 27, 2026-07-15
- ✓ CONSO-04 : Migration `sql/migrations/25_migrate_pneus_to_consommables.sql` (idempotente, pas de DROP COLUMN) copie `pneu_av`/`pneu_ar`/`pneu_km_montage` vers `consommables` ; section Pneus legacy entièrement retirée d'`app.html` (nav + fonctions), `Motos.update` allow-list trimmée ; `CLAUDE.md` corrigé pour refléter le retrait réel — v1.6 Phase 27, 2026-07-15
- ✓ GAUGE-05 : Jauge % par consommable (9 types) visible sur l'app mobile native, lecture seule — même source de données que le web (`GET /motos/:id/consommables`), section "Usure des Consommables" dans `motos/[id].tsx`, composant `GaugeBar` réutilisable — v1.6 Phase 28, 2026-07-16
- ✓ GAUGE-06 : Jauge générale mobile = consommable en plus mauvais état (parité web), et tap sur la notification de rappel photo navigue directement vers l'écran fiche moto où ces jauges sont visibles (`mapNotificationDataToRoute`, déjà routé, aucun changement backend requis) — v1.6 Phase 28, 2026-07-16

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

- **Stack backend/web** : Node.js/Express (Railway), Supabase (22 fichiers de migration, dont 3 rétroactifs 20-22 documentant la dérive Gap A), HTML vanilla (app.html ~42 KB, MotoKey_Client.html ~44 KB), Cloudinary (photos), Anthropic API (OCR factures), Resend (email), Stripe (billing)
- **Stack mobile (v1.3+)** : React Native/Expo Router + TypeScript (`/mobile-app`), expo-secure-store (LargeSecureStore AES-256), expo-notifications + expo-server-sdk (push), EAS Build (Android dev/preview profiles live ; iOS blocked on paid Apple account)
- **URL prod** : https://motokey11-production.up.railway.app
- **Supabase** : rzbqbaccjyxvtlnfitrr.supabase.co — 19 migrations réellement appliquées en prod (20-22 sont rétroactives/idempotentes, documentant un état déjà présent, pas de nouveau DDL exécuté)
- **`schema.sql`** : bootstrap propre prouvé contre un projet Supabase neuf (v1.5 Phase 22, SCHEMA-07) — plus aucun objet Gap A/Gap B non documenté ; reste hors-scope, distinct : parité complète des ~19 tables sans fichier (OR, billing/factures, catalogue, PDP, auth client séparée), voir en-tête `schema.sql` bloc 1
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
| Colonnes fantômes à origine indéterminable acceptées comme verdict terminal INCONNU/OUBLIÉ (7 colonnes, Phase 20) | Ni git ni Mehdi n'ont pu déterminer l'origine — bloquer la phase sur une recherche indéfinie n'aurait rien apporté | ✓ Good |
| SCHEMA-07 exigeait une preuve d'exécution live (bootstrap réel), pas une inférence structurelle grep-only | Les phases précédentes (19-21) avaient utilisé des checks grep/diff ; seule une exécution réelle contre un Postgres vierge prouve que le SQL parse et s'exécute sans erreur | ✓ Good |
| Dette d'ingénierie pure avant tout nouveau feature (v1.5 entier) | Décision Mehdi 2026-07-09 — la dérive schema.sql devait être close avant toute fonctionnalité utilisateur | ✓ Good |
| D-04 : acteur_id de clôture d'OR = ctx.user_id (membre garage), pas garage_id générique | Sans ça, l'audit trail d'un relevé km contesté serait impossible à attribuer à une personne dans un garage multi-utilisateurs (garage_users) — trou exactement sur le système que la pondération anti-fraude protège | ✓ Good |
| Gate de fin de phase schéma = exécution réelle contre DB jetable, jamais revue statique seule (confirmé Phase 23) | La revue SQL de 23-01 n'avait pas attrapé le mot réservé `analyse` ni la violation CHECK L8 sur les fixtures — seule l'exécution live les a révélés | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Requirements shipped → move to Validated
2. New requirements → add to Active
3. Core Value check — still the right priority?
4. Context update with current state
5. Key Decisions log updated

---
*Last updated: 2026-07-17 — Milestone v1.7 (Édition devis brouillon) put ON HOLD, never shipped — scope superseded by product decision to unify Devis/OR/Facture (2026-07-16). Milestone v1.8 (Unification Devis / OR / Facture) started. Schema audit (2026-07-17) found undocumented drift on `ordres_reparation.statut` (Postgres ENUM `or_statut` missing `valide_client`/`attente`/`facture`, already used in code) — must be reconciled before any migration. 1 known gap carried forward from v1.6 (credentials Cloudinary, since Phase 25).*
