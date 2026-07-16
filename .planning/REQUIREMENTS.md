# Requirements: MotoKey — Garage DMS

**Defined:** 2026-07-16
**Core Value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS ; avec lui, c'est une preuve de valeur vérifiable à la revente.

## v1 Requirements

Requirements for milestone v1.7 (Édition devis brouillon). Each maps to roadmap phases.

### Édition Devis Brouillon

- [ ] **DEVIS-01**: User (MECANO+) voit un bouton "Modifier" sur chaque devis en statut brouillon dans la liste des devis
- [ ] **DEVIS-02**: User peut ajouter, retirer ou modifier des lignes (désignation/qté/prix HT) d'un devis brouillon existant, pré-remplies avec les valeurs actuelles
- [ ] **DEVIS-03**: User peut modifier la remise (%) d'un devis brouillon existant
- [ ] **DEVIS-04**: Les modifications sont enregistrées via `PUT /devis/:id` sans changer le statut du devis (reste `brouillon`)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Édition Devis Brouillon

- **DEVIS-05**: User peut supprimer entièrement un devis en statut brouillon

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Suppression complète d'un devis brouillon | Non demandé pour cette itération — voir DEVIS-05 (v2) |
| Édition d'un devis après envoi (`envoye`/`accepte`/`refuse`) | Règle métier existante et volontaire : un nouveau devis doit être créé pour modifier un devis déjà transmis — comportement déjà correct côté backend (`PUT /devis/:id` rejette hors `brouillon`) |
| Changement backend au endpoint `PUT /devis/:id` ou à `SBLayer.Devis.update()` | Déjà fonctionnel et vérifié pour lignes + `entete.remise_pct` — aucune modification nécessaire |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEVIS-01 | Phase 29 | Pending |
| DEVIS-02 | Phase 29 | Pending |
| DEVIS-03 | Phase 29 | Pending |
| DEVIS-04 | Phase 29 | Pending |

**Coverage:**
- v1 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-16*
*Last updated: 2026-07-16 after roadmap creation — 4/4 requirements mapped to Phase 29 (single-phase milestone).*
