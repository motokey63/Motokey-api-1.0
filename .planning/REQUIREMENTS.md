# Requirements: MotoKey — Garage DMS

**Defined:** 2026-07-14
**Core Value:** Le score d'intégrité anti-fraude (pondération 1.0/0.6/0.3 selon la preuve)

## v1 Requirements

Requirements for milestone v1.6 (Suivi usure consommables + anti-fraude km). Each maps to roadmap phases.

### Anti-fraude km (KM)

- [ ] **KM-01**: Le système refuse tout relevé km inférieur au maximum historique de la moto et journalise la tentative de façon visible pour le garage
- [ ] **KM-02**: Un compte PRO/CONCESSION/ADMIN peut déclarer un changement de compteur (remplacement totaliseur), qui archive l'ancien relevé et démarre un nouveau compteur signé — action interdite aux comptes MECANO et CLIENT
- [ ] **KM-03**: Un client ou un membre du garage peut soumettre un relevé km normal (avec photo du compteur optionnelle) sans déclencher de changement de compteur
- [ ] **KM-04**: `releves_km` est la source de vérité du kilométrage — `motos.km` est recalculé/dérivé automatiquement à chaque relevé validé ; les trois chemins d'écriture existants (`Motos.update`, `Interventions.create`, `OrdresReparation.cloturer`) passent tous par la même validation partagée, plus aucun bypass possible

### Consommables (CONSO)

- [ ] **CONSO-01**: Chaque moto a une fiche consommables avec les 9 types donnés (pneu_av/ar, chaîne, plaquettes_av/ar, disque_av/ar, huile_moteur, liquide_frein), chacun avec km_montage/date_montage/référence saisis par le mécano
- [ ] **CONSO-02**: Le schéma consommables permet d'ajouter un nouveau type de consommable plus tard sans migration lourde
- [ ] **CONSO-03**: Un client ou un membre du garage peut uploader une photo d'un consommable, historisée avec sa date et son analyse
- [ ] **CONSO-04**: Les données `pneu_av`/`pneu_ar`/`pneu_km_montage` existantes sont migrées vers les nouvelles lignes consommables, puis la section Pneus legacy est retirée de la navigation garage et `CLAUDE.md` corrigé

### Stub IA Vision (VISION)

- [ ] **VISION-01**: Une photo de consommable uploadée déclenche une analyse via un service dédié flag-gated (`VISION_ENABLED`), qui renvoie une fausse analyse structurée tant que la clé Anthropic n'est pas configurée
- [ ] **VISION-02**: La réponse d'analyse (stub ou réelle plus tard) suit un contrat fixe (% usure, état, confiance, statut d'analyse, moteur) consommé identiquement par les jauges

### Cloudinary (CLOUD)

- [ ] **CLOUD-01**: L'upload de photo (compteur ou consommable) stocke réellement l'image sur Cloudinary et renvoie une URL exploitable — pas de placeholder, activation réelle ce milestone

### Jauges & rappels (GAUGE)

- [ ] **GAUGE-01**: Le garage et le client voient une jauge % par consommable pour chaque moto
- [ ] **GAUGE-02**: Le garage et le client voient une jauge générale égale au consommable en plus mauvais état (maillon le plus faible), jamais une moyenne
- [ ] **GAUGE-03**: Un client reçoit une notification push de rappel photo quand le km parcouru depuis la dernière photo d'un consommable atteint 3000 km OU que 6 mois se sont écoulés (le premier des deux déclenche)
- [ ] **GAUGE-04**: Le garage voit un badge/indicateur équivalent au rappel pour les motos garage/non réclamées (sans compte client à notifier)

## v2 Requirements

Aucune requirement explicitement reportée à v2 — voir Out of Scope pour les exclusions volontaires de ce milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Vrai appel Anthropic Claude Vision | Clé Anthropic non configurée — stub uniquement ce milestone, branchement réel différé à un futur milestone (point de branchement propre prévu : flag `VISION_ENABLED`) |
| Mapping du % usure IA dans la pondération anti-fraude existante 1.0/0.6/0.3 | Décision produit non triviale nécessitant la validation explicite de Mehdi — ne pas mapper unilatéralement en code (contrainte `CLAUDE.md` sur cette formule) |
| Seuil de rappel configurable par garage | Fixé à 3000km/6 mois pour ce milestone — configurabilité par garage déférée si le besoin se confirme |
| Millimètre de précision sur l'usure pneu/plaquette depuis une photo non calibrée | Fausse précision qui nuirait à la confiance — sortie bucketée %/label/confiance uniquement (anti-feature identifié en recherche) |
| ML prédictif de tendance d'usure | Aucune donnée longitudinale réelle n'existe encore contre un stub |
| Ledger blockchain/hash-chained | Complexité inutile — écritures role-gated + RLS + log d'audit suffisent |
| Sync OBD-II/télématique complète | Hors scope déjà acté dans PROJECT.md |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| KM-01 | TBD | Pending |
| KM-02 | TBD | Pending |
| KM-03 | TBD | Pending |
| KM-04 | TBD | Pending |
| CONSO-01 | TBD | Pending |
| CONSO-02 | TBD | Pending |
| CONSO-03 | TBD | Pending |
| CONSO-04 | TBD | Pending |
| VISION-01 | TBD | Pending |
| VISION-02 | TBD | Pending |
| CLOUD-01 | TBD | Pending |
| GAUGE-01 | TBD | Pending |
| GAUGE-02 | TBD | Pending |
| GAUGE-03 | TBD | Pending |
| GAUGE-04 | TBD | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 15 ⚠️ (expected — roadmapper fills this in next)

---
*Requirements defined: 2026-07-14*
*Last updated: 2026-07-14 after initial definition*
