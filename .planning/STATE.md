---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: Unification Devis / OR / Facture
status: verifying
stopped_at: Completed 30-01-PLAN.md
last_updated: "2026-07-17T15:28:40.282Z"
last_activity: 2026-07-17
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 2
  completed_plans: 1
---

# MotoKey API — Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-17)

**Core value:** Score d'intégrité anti-fraude (pondération 1.0/0.6/0.3) — sans lui, MotoKey est un simple DMS.
**Current focus:** Phase 30 — audit-sch-ma-or-statut

## Current Position

Phase: 31
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-07-17

```
v1.0 ████████████ SHIPPED
v1.1 ████████████ SHIPPED
v1.2 [█████████░] SHIPPED 2026-07-01 (86%, Phase 8 known gap — carried forward)
v1.3 ████████████ SHIPPED 2026-07-08 (MSTORE-02 known gap — carried forward)
v1.4 ████████████ SHIPPED 2026-07-09 (undocumented schema drift known gap — carried forward)
v1.5 ████████████ SHIPPED 2026-07-11 (Gap A/B schema.sql drift fully resolved, SCHEMA-02→07)
v1.6 ████████████ SHIPPED 2026-07-16 (schéma+anti-fraude km, helpers+stub vision, endpoints backend+Cloudinary, cron rappel, UI web garage+client, UI mobile lecture seule) — 6/6 phases, 21/21 plans, 17/17 requirements
v1.7 [░░░░░░░░░░] ON HOLD — jamais shippée, Phase 29 (Édition Devis Brouillon) implémentée GREEN mais scope obsolète, non committée — remplacée par v1.8
v1.8 [░░░░░░░░░░] 0% — Unification Devis / OR / Facture — ROADMAP.md créé (5 phases), prêt pour planning Phase 30
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Milestones shipped | 7 (v1.0 + v1.1 + v1.2 + v1.3 + v1.4 + v1.5 + v1.6) |
| Known gaps carried forward | Phase 8/BILL-06 (Stripe live mode, since v1.2), MSTORE-02 (store submission, since v1.3), Cloudinary credentials (since Phase 25) — blocked on Mehdi's external account/dashboard actions |
| Next action | `/gsd:plan-phase 30` — Audit Schéma `or_statut` (requête `pg_enum` live + plan de réconciliation) |

Per-plan timing history for v1.6 archived in `.planning/milestones/v1.6-phases/*/*-SUMMARY.md`.
| Phase 30 P01 | ~1h33 (4min actif + attente checkpoint) | 3 tasks | 2 files |

## Accumulated Context

### Decisions

Décisions complètes et à jour dans `.planning/PROJECT.md` (Key Decisions table) — historique détaillé de v1.6 archivé dans `.planning/milestones/v1.6-ROADMAP.md`, `.planning/milestones/v1.6-phases/`, et `.planning/RETROSPECTIVE.md`.

v1.8 kickoff decision (2026-07-17): unify `devis` and `ordres_reparation` into a single object — canonical table stays `ordres_reparation` (name "Interventions" is UI-only label, avoids collision with the pre-existing `interventions` table used by the anti-fraude carnet d'entretien). Unified lifecycle: brouillon→envoyé→accepté→en_cours→terminé→facturé (+refusé, stays editable). Extra work added mid-`en_cours` = new line on the same OR flagged `ajoutee_en_cours`+`en_attente_acceptation_client`, blocked until client accepts (legal timestamp requirement, FR). `devis` table deprecated read-only post-migration, `DROP` deferred to a later delivery.

v1.8 roadmap decision (2026-07-17): 5 phases derived directly from the 4 requirement categories, with MIGR-02 (schema audit) split into its own phase (30) ahead of the schema migration (31), mirroring this project's established schema-first-with-live-verification precedent (v1.5 tech-debt milestone, v1.6 Phase 23 gate). Sequencing: 30 audit → 31 schema migration (MIGR-01/03) → 32 backend lifecycle+numbering (UNIF-01→04) → 33 backend lignes complémentaires (LIGNE-01→04) → 34 frontend fusion (INTERV-01→03). Phase 34 depends on both 32 and 33 (needs both lifecycle actions and ligne-acceptance endpoints for the status banner + badge UI).

- [Phase 30]: valide_client -> accepte (renommage, pas de nouveau statut envoye)
- [Phase 30]: attente conserve comme 8e statut global, complementaire a un futur flag ligne (Phase 32/33)
- [Phase 30]: annule conserve distinct de refuse (annulation garage vs refus client)
- [Phase 30]: Set cible reconcilie corrige a 8 statuts (pas 7) pour la Phase 31 : brouillon/accepte/en_cours/attente/termine/facture/annule/refuse

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 8/BILL-06 (Stripe live mode) et MSTORE-02 (store submission) restent des known gaps externes, bloqués sur des actions humaines Mehdi (Stripe Dashboard, comptes développeur payants).
- **Credentials Cloudinary toujours absents** (`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, ni `.env` local ni Railway `motokey1.1`) — endpoints renvoient 503 `CLOUDINARY_NOT_CONFIGURED` (comportement voulu, jamais de placeholder). Une fois provisionné : re-jouer `node tests/test-km-photos-cloudinary.js`.
- Migration `sql/migrations/25_migrate_pneus_to_consommables.sql` reste à appliquer manuellement en prod par Mehdi (Supabase Dashboard → SQL Editor) — jusque-là, `has_data:false` pour pneu_av/pneu_ar sur les motos dont les seules données pneus vivent encore dans les colonnes legacy `motos.pneu_av`/`motos.pneu_ar`.
- Ce repo a `.planning/` gitignored avec force-add individuel des fichiers — si `gsd-tools.cjs commit` signale `skipped_commit_docs_false`, force-add et committer directement avec git plutôt que de bloquer.
- **Phase 29 ON HOLD (2026-07-17) — scope obsolète.** Décision produit du 16/07/2026 : unification Devis/OR/Facture (un seul objet) remplace l'édition devis brouillon isolée. Code implémenté et vérifié GREEN (15/15, `scripts/test-devis-edit.js`) dans `app.html` mais **non committé** — reste en modifications locales non stagées. Ne pas reprendre tel quel ni committer : Phase 32/33 de v1.8 redéfinissent l'objet cible avant toute reprise éventuelle de logique similaire.
- **⚠️ Dérive de schéma non documentée sur `ordres_reparation.statut` — objet de la Phase 30, ne pas contourner.** Le fichier tracké `migrations/08-livraison-3a-ordres-reparation.sql:26-30` déclare l'ENUM Postgres `or_statut` avec seulement 4 valeurs (`brouillon, en_cours, termine, annule`). Le code backend réel (`motokey-api.js:2982-2990`, table de transitions `_OR_TRANS_RAM`) utilise déjà 7 statuts : `brouillon, valide_client, en_cours, attente, termine, facture, annule` — confirmé aussi par l'UI (stepper 5 étapes vu en test navigateur). Aucune migration trackée n'ajoute `valide_client`/`attente`/`facture` à l'enum — même pattern que le Gap A déjà connu sur `devis` (Phase 21). Phase 30 doit interroger `pg_enum` en prod avant que Phase 31 n'écrive la migration DDL (`ALTER TYPE ... ADD VALUE` a des contraintes strictes, contrairement à un simple `CHECK` constraint).
- **Comptage réel prod (2026-07-17, lecture seule via API authentifiée) :** 8 devis (`brouillon`×2, `envoye`×2, `accepte`×3, `refuse`×1), 6 OR — base de référence pour le comptage avant/après de la Phase 31 (MIGR-01).
- **Lien devis↔OR déjà existant en base, sous-exploité :** `devis.or_id` (schema.sql:378) et `ordres_reparation.devis_id` (migration 08:95) existent déjà comme FK croisées — réutilisable pour la fusion en Phase 31, pas besoin de créer ce lien.
- Phase 29 (v1.7) avait déjà construit un pattern toast+bouton-désactivé pour le feedback de sauvegarde dans `app.html` (`saveDevis()`) — à adapter pour la nouvelle UI unifiée en Phase 34 (§7 de la spec L10), détail d'implémentation à ne pas oublier au planning de cette phase.

## Session Continuity

Last session: 2026-07-17T15:20:15.514Z
Stopped at: Completed 30-01-PLAN.md
