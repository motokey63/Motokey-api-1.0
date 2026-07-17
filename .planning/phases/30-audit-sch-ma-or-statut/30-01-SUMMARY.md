---
phase: 30-audit-sch-ma-or-statut
plan: 01
subsystem: database
tags: [postgres, enum, pg_enum, postgrest, supabase, schema-audit, or_statut]

# Dependency graph
requires:
  - phase: 08-livraison-3a-ordres-reparation (migration)
    provides: déclaration trackée mais périmée de l'ENUM or_statut (4 valeurs)
provides:
  - Script d'introspection live versionné (scripts/introspect-or-statut.js) pour les valeurs réelles de or_statut/or_tache_statut en prod
  - 30-FINDINGS.md : table de réconciliation complète, plan de migration ordonné (Option A ENUM patché vs Option B TEXT+CHECK recommandée), 3 décisions produit tranchées par Mehdi
  - Constat structurel : le set cible réconcilié est 8 statuts (brouillon, accepte, en_cours, attente, termine, facture, annule, refuse), pas les 7 initialement listés par MIGR-02
affects: [31-migration-schema-or-statut]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Introspection live via PostgREST OpenAPI (spec.definitions.<table>.properties.<col>.enum) cross-checkée contre pg_enum au Dashboard avant toute décision de migration DDL — 4e application de ce playbook après Gap A/B (Phase 19-22) et Phase 23"
    - "enumsortorder fractionnaire (1.5, 2.5, 3.5) comme signature diagnostique d'un ALTER TYPE ADD VALUE AFTER exécuté hors migration trackée"

key-files:
  created: [scripts/introspect-or-statut.js]
  modified: [.planning/phases/30-audit-sch-ma-or-statut/30-FINDINGS.md]

key-decisions:
  - "valide_client -> accepte (renommage, pas de nouveau statut envoye créé — l'envoi reste un timestamp date_envoi sur un OR brouillon)"
  - "attente conservé comme 8e statut global, complémentaire à un futur flag ligne en_attente_acceptation_client (Phase 32/33), pas remplacé par lui"
  - "annule conservé distinct de refuse (annulation garage vs refus client sont deux réalités métier différentes, à ne pas fusionner pour préserver les stats/relance client)"
  - "Recommandation Option B (TEXT+CHECK, cohérent avec devis.statut) documentée comme point de départ Phase 31, soumise à confirmation lors du planning de cette phase"

patterns-established:
  - "Cross-check pg_enum obligatoire avant toute décision de migration DDL touchant un ENUM Postgres en prod, même quand le script live et le code applicatif concordent déjà"

requirements-completed: [MIGR-02]

# Metrics
duration: ~4min de travail actif exécutant (Tasks 1+2+3 combinées) ; ~1h33 de temps calendaire total en comptant le temps d'attente du checkpoint bloquant (Mehdi : exécution SQL Dashboard + 3 arbitrages produit)
completed: 2026-07-17
---

# Phase 30 Plan 01: Audit Schéma or_statut Summary

**Audit live (PostgREST OpenAPI + pg_enum) confirme 7 valeurs réelles pour l'ENUM `or_statut` en prod, sans valeur fantôme ; 3 décisions produit tranchées par Mehdi révèlent que le set cible réconcilié est en réalité 8 statuts, pas les 7 de MIGR-02 — gate Phase 31 levé.**

## Performance

- **Duration:** ~4 min de travail actif (Tasks 1-3) ; checkpoint bloquant Task 3 a ajouté ~1h30 d'attente humaine (exécution SQL Dashboard + 3 décisions produit par Mehdi)
- **Started:** 2026-07-17T13:44:00Z (approx, avant premier commit)
- **Completed:** 2026-07-17T15:19:00Z (approx, commit eda834b UTC)
- **Tasks:** 3/3 complétées
- **Files modified:** 2 (1 créé : scripts/introspect-or-statut.js, 1 créé puis mis à jour : 30-FINDINGS.md)

## Accomplishments
- Script d'introspection live `scripts/introspect-or-statut.js` créé, exécuté contre la prod (`rzbqbaccjyxvtlnfitrr.supabase.co`) : confirme 7 valeurs réelles de `or_statut` (`brouillon, valide_client, en_cours, attente, termine, facture, annule`), aucune valeur fantôme, plus 3 valeurs de `or_tache_statut` en side-finding sans dérive.
- Cross-check `pg_enum` exécuté par Mehdi au Supabase Dashboard : concordance exacte confirmée avec la sortie du script — pas de cache PostgREST périmé. Les `enumsortorder` fractionnaires (1.5/2.5/3.5) confirment que `valide_client`/`attente`/`facture` ont été ajoutés hors migration trackée, après la déclaration initiale à 4 valeurs de `migrations/08-livraison-3a-ordres-reparation.sql`.
- Les 3 questions produit non tranchables techniquement (`valide_client`, `attente`, `annule`) ont reçu une décision explicite de Mehdi avec justification métier, documentée dans 30-FINDINGS.md.
- Constat structurel important remonté explicitement (pas caché) : le set cible réel pour la Phase 31 est **8 statuts**, pas les 7 de la formulation initiale MIGR-02 — `attente` et `annule` restent tous deux distincts en plus des 7 cibles.
- Aucune écriture DDL/`.sql` effectuée durant la phase (gate Phase 31 respecté de bout en bout).

## Task Commits

Chaque tâche a été committée atomiquement :

1. **Task 1: Créer scripts/introspect-or-statut.js** - `3fa9c1c` (feat)
2. **Task 2: Rédiger 30-FINDINGS.md** - `f6b63d9` (docs)
3. **Task 3: Cross-check Dashboard + arbitrage des questions produit** - `eda834b` (docs)

**Plan metadata:** (à suivre — commit final de complétion du plan)

## Files Created/Modified
- `scripts/introspect-or-statut.js` - Requête live PostgREST OpenAPI des valeurs enum `or_statut`/`or_tache_statut`, diff PRESENT/MANQUANT/HORS-CIBLE vs les 7 cibles historiques, jamais de fuite de clé
- `.planning/phases/30-audit-sch-ma-or-statut/30-FINDINGS.md` - Constats d'audit complet : valeurs live, cross-check pg_enum, table de réconciliation avec décisions tranchées, plan de migration ordonné (Option A/B), questions produit résolues, gate Phase 31 levé

## Decisions Made
- **`valide_client` → `accepte`** (pas `envoye`) : le nom "validé par le client" correspond sémantiquement à l'acceptation. Pas d'état `envoye` distinct créé — l'envoi devient un timestamp `date_envoi` sur un OR `brouillon`.
- **`attente` conservé comme 8e statut global** en plus des 7 cibles, complémentaire (pas remplacé) par un futur flag ligne `en_attente_acceptation_client` — les deux mécanismes coexisteront (Phase 32/33 devra définir comment les distinguer si besoin). Vérification code (grep `supabase.js`/`motokey-api.js`) : l'usage actuel de `attente` est un hold manuel générique avec motif texte libre (`attente_motif`), sans catégorisation structurée ; aucun code `en_attente_acceptation_client`/`ajoutee_en_cours` n'existe encore — le mécanisme de flag ligne est entièrement à construire, pas de version partielle à réconcilier.
- **`annule` conservé distinct de `refuse`** : annulation garage (peut survenir après début des travaux) vs refus client (avant travaux) sont deux réalités métier différentes, dont la fusion perdrait de l'information pour les stats/relance client.
- **Recommandation Option B (TEXT+CHECK)** maintenue comme point de départ documenté pour la Phase 31, cohérente avec `devis.statut` déjà en TEXT+CHECK — sujette à confirmation lors du planning effectif de la Phase 31.
- **Set cible corrigé pour Phase 31 : 8 statuts** (`brouillon, accepte, en_cours, attente, termine, facture, annule, refuse`), pas les 7 de MIGR-02 — explicitement flagué dans 30-FINDINGS.md plutôt que silencieusement absorbé.

## Deviations from Plan

None - plan exécuté exactement comme écrit. Le cross-check pg_enum a confirmé une concordance parfaite (pas d'écart à documenter comme prévu par le plan en cas de divergence). La vérification résiduelle de l'usage code de `attente` (demandée en instruction de reprise, non bloquante) a été effectuée et documentée dans 30-FINDINGS.md sans nécessiter de fix ou de décision supplémentaire.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. Mehdi a exécuté une requête `SELECT` en lecture seule au Supabase Dashboard (aucune configuration, aucun secret manipulé par l'exécutant).

## Next Phase Readiness

Phase 31 (migration schéma DDL) peut démarrer sur la base de 30-FINDINGS.md : les 3 décisions produit sont tranchées, le cross-check pg_enum est confirmé, et le set cible corrigé (8 statuts, pas 7) est explicitement documenté pour éviter que la Phase 31 planifie sur la base erronée des 7 statuts originels de MIGR-02. Aucun blocage — la seule note résiduelle non bloquante est la sous-question de distinction future entre `attente` manuel et `attente` auto-déclenché par ligne, à trancher lors du planning Phase 32/33 (pas Phase 31, qui ne touche que le DDL du statut lui-même).

---
*Phase: 30-audit-sch-ma-or-statut*
*Completed: 2026-07-17*

## Self-Check: PASSED

All claimed files exist and all claimed commits are present in git history:
- FOUND: scripts/introspect-or-statut.js
- FOUND: .planning/phases/30-audit-sch-ma-or-statut/30-FINDINGS.md
- FOUND: .planning/phases/30-audit-sch-ma-or-statut/30-01-SUMMARY.md
- FOUND: 3fa9c1c (Task 1)
- FOUND: f6b63d9 (Task 2)
- FOUND: eda834b (Task 3)
