# Requirements: MotoKey — Garage DMS

**Defined:** 2026-07-09
**Core Value:** Le score d'intégrité anti-fraude (pondération 1.0/0.6/0.3 selon la preuve)

## v1 Requirements

Requirements for milestone v1.5 (Résolution dérive schema.sql). Each maps to roadmap phases.

### Dérive non documentée (Gap A)

- [x] **SCHEMA-02**: Chaque colonne non documentée sur `garages`/`clients`/`interventions`/`devis` (dérive sans fichier de migration correspondant) est identifiée avec son type exact, ses contraintes et sa nullabilité via introspection Postgres
- [x] **SCHEMA-03**: Chaque colonne découverte est corrélée à la livraison/fonctionnalité qui l'a introduite, via l'historique git (commits, messages, fichiers modifiés à la période probable)
- [x] **SCHEMA-04**: Un ou plusieurs fichiers de migration rétroactifs numérotés (20+) documentent chaque colonne découverte, avec un commentaire d'origine expliquant sa provenance
- [x] **SCHEMA-05**: `schema.sql` est mis à jour pour inclure ces colonnes sur `garages`/`clients`/`interventions`/`devis`, avec les mêmes contraintes qu'en prod

### Objets migration 13/15 manquants (Gap B)

- [x] **SCHEMA-06**: La table `billing_events` (migration 15) et les tables `motos_proprietaires_historique`/`liaisons_client_garage`/`reclamations_moto` + la vue `v_motos_avec_proprietaire` (migration 13) sont ajoutées à `schema.sql`, à partir du DDL déjà présent dans `sql/migrations/13_*.sql` et `sql/migrations/15_*.sql`

### Vérification

- [ ] **SCHEMA-07**: Bootstrap vérifié propre (aucune erreur SQL) contre un projet Supabase neuf, comme en Phase 19 ; le header "known-partial-bootstrap" de `schema.sql` est mis à jour pour ne plus lister les Gaps A et B comme non résolus

## v2 Requirements

Aucune — reporté volontairement hors scope (voir Out of Scope).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Parité complète des ~19 tables sans aucun fichier (OR, facturation/billing complet, catalogue pièces, auth client séparée) | Sous-système entier à reconstruire (DDL/RLS/index/triggers), effort largement supérieur à ce milestone de maintenance ; reste une dette distincte documentée dans le header de `schema.sql` |
| Toute nouvelle fonctionnalité utilisateur | Scope explicitement exclu — ce milestone est de la dette d'ingénierie pure, "avant tout nouveau feature" (décision Mehdi 2026-07-09) |
| `scripts/seed-test-moto-15-uat.js` (fichier untracked) | Hors scope — sans rapport avec la dérive schema.sql |
| BILL-06 (Stripe live mode) | Bloqué sur action Dashboard Mehdi, non-code — suivi séparément dans PROJECT.md Known Gaps |
| MSTORE-02 (soumission stores) | Bloqué sur comptes développeur payants, non-code — suivi séparément dans PROJECT.md Known Gaps |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-02 | Phase 20 | Complete |
| SCHEMA-03 | Phase 20 | Complete |
| SCHEMA-04 | Phase 21 | Complete |
| SCHEMA-05 | Phase 21 | Complete |
| SCHEMA-06 | Phase 21 | Complete |
| SCHEMA-07 | Phase 22 | Pending |

**Coverage:**
- v1 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-09*
*Last updated: 2026-07-09 after roadmap creation (Phases 20-22)*
