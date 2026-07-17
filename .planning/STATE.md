---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: Unification Devis / OR / Facture
status: defining_requirements
stopped_at: "Milestone v1.8 démarrée — PROJECT.md mis à jour, REQUIREMENTS.md et ROADMAP.md à définir"
last_updated: "2026-07-17T00:00:00.000Z"
last_activity: 2026-07-17 -- Milestone v1.8 (Unification Devis/OR/Facture) démarrée, v1.7 mise on hold
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-17)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** v1.8 Unification Devis / OR / Facture — définition des requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-07-17 — Milestone v1.8 started

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 ████████████ SHIPPED 2026-07-09 (undocumented schema drift known gap — carried forward)
v1.5 ████████████ SHIPPED 2026-07-11 (Gap A/B schema.sql drift fully resolved, SCHEMA-02→07)
v1.6 ████████████ SHIPPED 2026-07-16 (schéma+anti-fraude km, helpers+stub vision, endpoints backend+Cloudinary, cron rappel, UI web garage+client, UI mobile lecture seule) — 6/6 phases, 21/21 plans, 17/17 requirements
v1.7 [░░░░░░░░░░] ON HOLD — jamais shippée, Phase 29 (Édition Devis Brouillon) implémentée GREEN mais scope obsolète, non committée — remplacée par v1.8
v1.8 [░░░░░░░░░░] 0% — Unification Devis / OR / Facture — requirements en cours de définition
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 7 (v1.0 + v1.1 + v1.2 + v1.3 + v1.4 + v1.5 + v1.6) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3), Cloudinary credentials (since Phase 25) — blocked on Mehdi's external account/dashboard actions |
| Next action | Définir REQUIREMENTS.md puis ROADMAP.md pour v1.8 |

Per-plan timing history for v1.6 archived in `.planning/milestones/v1.6-phases/*/*-SUMMARY.md`.

## Accumulated Context

### Decisions

Décisions complètes et à jour dans `.planning/PROJECT.md` (Key Decisions table) — historique détaillé de v1.6 archivé dans `.planning/milestones/v1.6-ROADMAP.md`, `.planning/milestones/v1.6-phases/`, et `.planning/RETROSPECTIVE.md`.

v1.7 scope decision (2026-07-16): Phase 29 reuses the existing "Créer un devis" form (`saveDevis()`, `renderDevisLines()`, `addDevisLine()`, global `devisLines` array) toggled into an edit mode, rather than building a separate edit screen — explicit user decision, no backend work needed (`PUT /devis/:id` and `SBLayer.Devis.update()` already support editing `lignes` + `entete.remise_pct` while `statut === 'brouillon'`).

v1.8 kickoff decision (2026-07-17): unify `devis` and `ordres_reparation` into a single object — canonical table stays `ordres_reparation` (name "Interventions" is UI-only label, avoids collision with the pre-existing `interventions` table used by the anti-fraude carnet d'entretien). Unified lifecycle: brouillon→envoyé→accepté→en_cours→terminé→facturé (+refusé, stays editable). Extra work added mid-`en_cours` = new line on the same OR flagged `ajoutee_en_cours`+`en_attente_acceptation_client`, blocked until client accepts (legal timestamp requirement, FR). `devis` table deprecated read-only post-migration, `DROP` deferred to a later delivery. Line-item model: recommend aligning on `or_taches`/`or_pieces` (normalized, already richer) rather than devis's flat JSONB `lignes` + redundant `devis_lignes` table.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 8/BILL-06 (Stripe live mode) et MSTORE-02 (store submission) restent des known gaps externes, bloqués sur des actions humaines Mehdi (Stripe Dashboard, comptes développeur payants).
- **Credentials Cloudinary toujours absents** (`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, ni `.env` local ni Railway `motokey1.1`) — endpoints renvoient 503 `CLOUDINARY_NOT_CONFIGURED` (comportement voulu, jamais de placeholder). Une fois provisionné : re-jouer `node tests/test-km-photos-cloudinary.js`.
- Migration `sql/migrations/25_migrate_pneus_to_consommables.sql` reste à appliquer manuellement en prod par Mehdi (Supabase Dashboard → SQL Editor) — jusque-là, `has_data:false` pour pneu_av/pneu_ar sur les motos dont les seules données pneus vivent encore dans les colonnes legacy `motos.pneu_av`/`motos.pneu_ar`.
- Ce repo a `.planning/` gitignored avec force-add individuel des fichiers — si `gsd-tools.cjs commit` signale `skipped_commit_docs_false`, force-add et committer directement avec git plutôt que de bloquer.
- DEVIS-05 (suppression complète d'un devis brouillon) explicitement différé v2 — hors scope de Phase 29.
- **Phase 29 ON HOLD (2026-07-17) — scope obsolète.** Décision produit du 16/07/2026 : unification Devis/OR/Facture (un seul objet, plutôt que devis brouillon distinct des OR). L'usage réel de Mehdi porte sur l'édition des **OR** (`ordres_reparation`), pas des devis brouillon — Phase 29 avait été scopée sur `DEVIS-01/02/03/04` (table `devis`, route `PUT /devis/:id`), ce qui ne correspond pas au besoin métier réel. Code implémenté et vérifié GREEN (15/15, `scripts/test-devis-edit.js`) dans `app.html` (`renderDevisFormCard`, `startEditDevis`, `cancelEditDevis`, `saveDevis` étendu) mais **non committé** — reste en modifications locales non stagées. Ne pas reprendre tel quel ni committer : le chantier d'unification Devis/OR/Facture doit redéfinir l'objet cible avant toute reprise de l'édition brouillon.
- **⚠️ Dérive de schéma non documentée trouvée sur `ordres_reparation.statut` (audit 2026-07-17, à traiter avant toute migration v1.8 Commit 1).** Le fichier tracké `migrations/08-livraison-3a-ordres-reparation.sql:26-30` déclare l'ENUM Postgres `or_statut` avec seulement 4 valeurs (`brouillon, en_cours, termine, annule`). Le code backend réel (`motokey-api.js:2982-2990`, table de transitions `_OR_TRANS_RAM`) utilise déjà 7 statuts : `brouillon, valide_client, en_cours, attente, termine, facture, annule` — confirmé aussi par l'UI (stepper 5 étapes vu en test navigateur). Aucune migration trackée n'ajoute `valide_client`/`attente`/`facture` à l'enum — même pattern que le Gap A déjà connu sur `devis` (Phase 21). Avant d'écrire la migration de fusion, interroger `pg_enum` en prod pour connaître les valeurs réellement en place (`ALTER TYPE ... ADD VALUE` a des contraintes strictes, contrairement à un simple `CHECK` constraint).
- **Comptage réel prod (2026-07-17, lecture seule via API authentifiée) :** 8 devis (`brouillon`×2, `envoye`×2, `accepte`×3, `refuse`×1), 6 OR — cohérent avec l'hypothèse "que des données de test" de la spec L10, mais échantillon trop petit pour confirmer l'absence totale de `valide_client`/`attente`/`facture` en usage réel.
- **Lien devis↔OR déjà existant en base, sous-exploité :** `devis.or_id` (schema.sql:378) et `ordres_reparation.devis_id` (migration 08:95) existent déjà comme FK croisées — réutilisable pour la fusion, pas besoin de créer ce lien.

## Session Continuity

Last session: 2026-07-17T00:00:00.000Z
Stopped at: Milestone v1.8 (Unification Devis/OR/Facture) démarrée — PROJECT.md mis à jour, REQUIREMENTS.md à définir ensuite
