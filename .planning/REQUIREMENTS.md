# Requirements: MotoKey v1.3

**Defined:** 2026-07-01
**Core Value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.

## v1 Requirements

Requirements pour le milestone App Client Mobile. Chaque requirement mappe à une phase du roadmap.

### Auth Mobile

- [x] **MAUTH-01**: L'utilisateur peut se connecter / s'inscrire / réinitialiser son mot de passe depuis l'app mobile (réutilise les endpoints Supabase auth existants — parité avec MotoKey_Client.html)
- [x] **MAUTH-02**: Le token de session est stocké chiffré sur l'appareil (expo-secure-store, pas AsyncStorage en clair)
- [x] **MAUTH-03**: L'app rafraîchit proactivement le token avant expiration au retour d'arrière-plan (pas seulement en réaction à un 401)

### Parité Fonctionnelle

- [x] **MPARITY-01**: L'utilisateur voit la liste de ses motos (couleur statut + score d'intégrité) depuis l'app mobile
- [x] **MPARITY-02**: L'utilisateur consulte et valide/refuse ses devis depuis l'app mobile
- [ ] **MPARITY-03**: L'utilisateur consulte l'historique d'entretien/interventions de chaque moto
- [x] **MPARITY-04**: L'utilisateur peut revendiquer/révoquer une liaison garage depuis l'app mobile
- [x] **MPARITY-05**: L'utilisateur consulte le dernier état connu (motos/devis) hors-ligne, avec horodatage "dernière mise à jour" (lecture seule, pas de sync offline)

### Notifications Push

- [ ] **MPUSH-01**: L'utilisateur voit un écran de pré-demande ("soft-ask") avant le prompt système de permission push
- [ ] **MPUSH-02**: Le device token est enregistré/désenregistré auprès du backend au login/logout
- [ ] **MPUSH-03**: L'utilisateur reçoit une notification push immédiate quand un nouveau devis est créé pour lui
- [ ] **MPUSH-04**: L'utilisateur reçoit une notification push quand sa moto dépasse le seuil de révision (réutilise la logique de seuil UX-02 existante)
- [ ] **MPUSH-05**: Taper sur une notification navigue directement vers l'écran concerné (deep link devis ou fiche moto)

### App Store

- [ ] **MSTORE-01**: L'app respecte les exigences Privacy Manifest (Apple) et Data Safety (Google) pour la première soumission
- [ ] **MSTORE-02**: L'app est validée via TestFlight / piste de test interne Android avant soumission publique

## v2 Requirements

Reconnus mais hors scope v1.3 — différenciateurs identifiés par la recherche, candidats pour une milestone future.

### Différenciateurs Mobile

- **MDIFF-01**: Wallet pass (Apple/Google) pour le passeport moto — forte cohérence avec le concept "3ème clé digitale"
- **MDIFF-02**: QR-code passeport public partageable pour la revente — différenciateur le plus aligné avec la Core Value, mais nécessite un nouvel endpoint non-authentifié + revue sécurité dédiée
- **MDIFF-03**: Widget écran d'accueil (score/statut moto)
- **MDIFF-04**: Caméra native pour photos de réclamation/liaison
- **MDIFF-05**: Déverrouillage biométrique de l'app

## Out of Scope

Exclusions explicites pour éviter le scope creep.

| Feature | Raison |
|---------|--------|
| Sync offline complète (écriture) | Contrainte produit existante — mode offline hors scope (PROJECT.md) ; seule la lecture-seule (MPARITY-05) est incluse |
| Chat in-app | Hors domaine B2C passeport moto |
| Paiement in-app mobile | Billing reste géré côté web/Stripe Checkout hosted |
| Diagnostics OBD-II natifs | Hors scope — MotoKey est un score logiciel, pas un capteur matériel |
| UI flotte / gestion en masse | App cible le propriétaire individuel (B2C), pas les flottes |
| Centre de préférences de notification granulaire | Complexité inutile pour 2 types de push seulement en v1.3 |
| Push marketing | Anti-feature — uniquement transactionnel/entretien en v1.3 |
| Bare React Native (sans Expo) | Décision de cadrage — Expo managed workflow retenu (pas de module natif custom requis) |

## Traceability

Mapping requirements → phases.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MAUTH-01 | Phase 14 | Complete |
| MAUTH-02 | Phase 14 | Complete |
| MAUTH-03 | Phase 14 | Complete |
| MPARITY-01 | Phase 15 | Complete |
| MPARITY-02 | Phase 15 | Complete |
| MPARITY-03 | Phase 15 | Pending |
| MPARITY-04 | Phase 15 | Complete |
| MPARITY-05 | Phase 15 | Complete |
| MPUSH-01 | Phase 16 | Pending |
| MPUSH-02 | Phase 12 (backend) / Phase 16 (bout-en-bout) | Pending |
| MPUSH-03 | Phase 16 | Pending |
| MPUSH-04 | Phase 17 | Pending |
| MPUSH-05 | Phase 16 | Pending |
| MSTORE-01 | Phase 17 | Pending |
| MSTORE-02 | Phase 17 | Pending |

**Coverage:**
- v1.3 requirements: 15 total
- Mappés à des phases: 15/15 ✓

---
*Requirements définis: 2026-07-01*
*Milestone: v1.3 App Client Mobile*
*Roadmap créé: 2026-07-01 — voir .planning/ROADMAP.md (Phases 12-17)*
