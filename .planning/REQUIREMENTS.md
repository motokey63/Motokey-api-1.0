# Requirements: MotoKey — Garage DMS

**Defined:** 2026-07-17
**Core Value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS ; avec lui, c'est une preuve de valeur vérifiable à la revente.

## v1 Requirements

Requirements for milestone v1.8 (Unification Devis / OR / Facture). Each maps to roadmap phases.

### Cycle de vie unifié

- [ ] **UNIF-01**: User (MECANO+) crée toujours une nouvelle intervention en statut `brouillon` — aucune création directe en `en_cours`
- [ ] **UNIF-02**: User peut faire progresser une intervention à travers le cycle `brouillon → envoyé → accepté → en_cours → terminé → facturé`
- [ ] **UNIF-03**: Une intervention `refusée` reste visible dans la liste et redevient modifiable (pas d'archivage automatique)
- [ ] **UNIF-04**: Les nouvelles interventions créées après migration reçoivent un numéro dans une série continue unique `INT-2026-XXXX` ; les OR déjà existants conservent leur numéro `OR-2026-XXXX` d'origine comme référence historique (pas de renumérotation rétroactive)

### Travaux complémentaires en cours

- [ ] **LIGNE-01**: User (MECANO+) peut ajouter une ligne à une intervention en statut `en_cours` ; elle est automatiquement marquée `ajoutee_en_cours=true` et `en_attente_acceptation_client=true`
- [ ] **LIGNE-02**: User (CLIENT) peut accepter explicitement une ligne complémentaire spécifique — l'acceptation horodate `date_acceptation_ligne` et trace `accepte_par_client_id`
- [ ] **LIGNE-03**: Le système empêche le passage d'une intervention au statut `terminé` tant qu'il reste au moins une ligne `en_attente_acceptation_client=true` non résolue (acceptée ou retirée)
- [ ] **LIGNE-04**: User (CLIENT) reçoit une notification push immédiate quand une ligne complémentaire attend son acceptation (réutilise l'infra Expo/FCM existante, pattern MPUSH-03)

### Interface unifiée

- [ ] **INTERV-01**: User voit un seul onglet "Interventions" (fusion des anciens onglets Devis et OR) avec filtre par statut
- [ ] **INTERV-02**: User voit un bandeau de statut avec les actions contextuelles disponibles selon l'état de l'intervention (Envoyer / Accepter / Démarrer / Facturer)
- [ ] **INTERV-03**: Une ligne en attente d'acceptation client est visuellement distincte (badge dédié) d'une ligne déjà validée, dans la fiche détail de l'intervention

### Migration & dépréciation

- [ ] **MIGR-01**: Les données existantes de `devis` et `ordres_reparation` sont migrées vers le modèle unifié sans perte (données de test uniquement, confirmé par comptage prod 2026-07-17 : 8 devis, 6 OR)
- [ ] **MIGR-02**: L'enum Postgres `or_statut` réel en prod est audité (`pg_enum`) et réconcilié avec les 7 statuts nécessaires (`brouillon, envoye, accepte, en_cours, termine, facture, refuse`) avant toute écriture de migration DDL — dérive non documentée déjà détectée (voir STATE.md)
- [ ] **MIGR-03**: La table `devis` passe en lecture seule après migration (plus aucune écriture applicative) ; `DROP` explicitement différé à une livraison ultérieure

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

- **PDF-01**: Gabarit PDF unifié vs gabarits distincts par statut (devis/facture) — décision explicitement différée (§8 spec L10), à trancher pendant la phase concernée
- **UNIF-05**: Suppression complète d'une intervention en statut `brouillon` (reprise de l'ancien DEVIS-05, jamais livré)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Renumérotation rétroactive des OR/devis de test existants | Décision confirmée 2026-07-17 — conservation des numéros d'origine, seuls les nouveaux objets utilisent `INT-2026-XXXX` |
| `DROP TABLE devis` | Différé — attendre confirmation qu'aucune dépendance (historique, export comptable) ne subsiste après migration |
| Notification hors app (email/SMS) pour ligne complémentaire | Seul le push app est in-scope v1.8 (LIGNE-04) ; canal hors-app différé |
| Branchement spécial par type de travaux (vidange vs jeu aux soupapes, etc.) | Process identique quelle que soit l'intervention — décision produit §5.4 de la spec L10 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| UNIF-01 | TBD | Pending |
| UNIF-02 | TBD | Pending |
| UNIF-03 | TBD | Pending |
| UNIF-04 | TBD | Pending |
| LIGNE-01 | TBD | Pending |
| LIGNE-02 | TBD | Pending |
| LIGNE-03 | TBD | Pending |
| LIGNE-04 | TBD | Pending |
| INTERV-01 | TBD | Pending |
| INTERV-02 | TBD | Pending |
| INTERV-03 | TBD | Pending |
| MIGR-01 | TBD | Pending |
| MIGR-02 | TBD | Pending |
| MIGR-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14 (roadmap not yet created)

---
*Requirements defined: 2026-07-17*
*Superseded v1.7 REQUIREMENTS.md (DEVIS-01→05, Édition Devis Brouillon) — jamais livré, scope absorbé par l'unification. Historique préservé dans git (commit avant celui-ci).*
