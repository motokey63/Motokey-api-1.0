# Phase 23: Schéma + Anti-Fraude km au niveau DB - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Le kilométrage moto ne peut plus être modifié que via une source de vérité unique (`releves_km`), protégée contre toute régression par un trigger DB. Des 3 chemins d'écriture existants, `Motos.update()` et `OrdresReparation.cloturer()` sont fermés/redirigés vers la validation partagée ; `Interventions.create()` reste volontairement découplé (km historique, voir D-05) mais son découplage devient explicite/documenté au lieu de silencieux. Le schéma `consommables` (9 types v1) est posé de façon extensible. Aucune UI, aucun endpoint HTTP nouveau au-delà de ce qui sert la vérification DB-level dans cette phase — c'est une phase schéma + logique d'intégrité pure (KM-01, KM-04, CONSO-02).

</domain>

<decisions>
## Implementation Decisions

### RLS pour les 3 nouvelles tables
- **D-01:** RLS activé sans policy explicite (service-role-only, default-deny) sur `consommables`, `photos_consommables`, `releves_km` — même pattern que `garage_users`/`client_device_tokens`/`push_send_log` et les tables Gap B de v1.5. Toute l'autorisation réelle vit dans `motokey-api.js` (`requireRole()` + vérification d'ownership via `moto_id`), jamais dans Postgres. **Documenter explicitement ce choix en commentaire dans la migration** (mirroring `schema.sql` lignes 689-702) pour que ce soit lisible comme une décision intentionnelle, pas un oubli redécouvert dans 3 phases (référence directe à Pitfall 4 de PITFALLS.md — c'est exactement le pattern qui a coûté tout v1.5).

### Extensibilité des types de consommables (CONSO-02)
- **D-02:** `type_consommable` en `TEXT` + `CHECK` constraint listant les 9 types v1 (`pneu_av`, `pneu_ar`, `chaine`, `plaquettes_av`, `plaquettes_ar`, `disque_av`, `disque_ar`, `huile_moteur`, `liquide_frein`) — même pattern que `interventions.niveau_preuve` déjà existant. Ajouter un type plus tard = une migration légère (`ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...`), pas une refonte de schéma. Pas de table de référence séparée (rejeté : complexité de jointure supplémentaire non justifiée pour ce besoin).

### Signature garage sur changement de compteur (KM-02)
- **D-03:** « Signé garage » = métadonnées d'audit, pas de cryptographie : `garage_id`, l'utilisateur PRO+ qui a validé (`user_id`/`acteur`), `timestamp`, et une **note obligatoire** expliquant la raison du remplacement (ex : "compteur HS remplacé lors de l'intervention"). Pas de `signature_hash` cryptographique (le pattern `interventions.signature_hash` existe dans le code mais n'a pas été jugé nécessaire ici — traçabilité par métadonnées suffit).

### Log de rejet km (KM-01)
- **D-04:** Le log de rejet (table de rejet consultable) doit être **complet** : `moto_id`, `garage_id`, acteur (client identifié ou membre garage identifié — jamais anonyme), km tenté, km actuel (le vrai max historique au moment de la tentative), `timestamp`. Objectif explicite : permettre au garage de repérer un pattern de tentatives répétées (signal de fraude potentiel), pas juste un compteur d'échecs.

### Source de vérité km (rappel — décidé au niveau milestone, pas re-discuté ici)
- `releves_km` est LA source de vérité. `motos.km` reste une colonne physique mais devient dérivée/cache, recalculée uniquement via le chemin validé — jamais écrite directement ailleurs.

### Fermeture des 3 chemins d'écriture existants (KM-04 — scope confirmé, pas de gray area)
- `Motos.update()` (`supabase.js` ~L350, `allowed = ['km','pneu_av','pneu_ar','pneu_km_montage','couleur','photo_url']`) : retirer `km` de la liste `allowed`.
- `Interventions.create()` (`supabase.js` ~L397) : **voir D-05 ci-dessous** — ne route PAS vers la validation monotone (le km d'intervention est un historique découplé par design), mais son découplage de `motos.km` doit être rendu explicite/documenté plutôt que silencieux.
- `OrdresReparation.cloturer()` (`supabase.js` ~L893-922) : remplacer le garde-fou ad-hoc (`if (km_sortie < or.km_entree) throw` + silent-skip) par un appel à la même fonction de validation partagée, avec rejet+log au lieu du skip silencieux actuel.
- Les colonnes `pneu_av`/`pneu_ar`/`pneu_km_montage` legacy restent intactes dans `Motos.update()` pour cette phase — leur migration/retrait est explicitement scope de Phase 27 (CONSO-04), pas de cette phase.

### Km sur les interventions (`Interventions.create()`) — décision post-recherche
- **D-05:** Le km saisi sur une intervention reste une **métadonnée historique découplée** du ratchet anti-fraude — jamais utilisé pour mettre à jour `motos.km` ni comparé au max historique de `releves_km`. Comportement actuel conservé, mais rendu **explicite et documenté** (commentaire dans le code + `schema.sql`), pas juste un silence non-intentionnel comme aujourd'hui. Permet au garage de continuer à saisir un historique d'entretien passé (km antérieur au km actuel de la moto) sans être bloqué. Résout la question ouverte n°1 de `23-RESEARCH.md`.
- Conséquence : `Interventions.create()` n'a PAS besoin d'appeler la fonction de validation monotone partagée — seul `Motos.update()` (endpoint km normal, hors scope endpoint dans cette phase-ci mais le bypass doit être fermé) et `OrdresReparation.cloturer()` (qui, lui, représente un vrai "km de sortie live", pas un historique) doivent router vers la validation partagée pour respecter KM-04. La fermeture du bypass `Interventions.create()` pour KM-04 consiste à **documenter/garantir qu'il ne touche jamais `motos.km`**, pas à lui imposer la même monotonie.
- Le sort du trigger existant `trg_update_km` (sur `interventions`) est laissé à la discrétion de l'implémentation (voir ci-dessous) — conséquence logique de D-05, pas une nouvelle décision produit.

### Claude's Discretion
- Nom exact du trigger PL/pgSQL et de la fonction de validation partagée.
- Forme exacte de la table de rejet (nom de table, nommage des colonnes) tant que D-04 est respecté.
- Comment le bypass `type_evenement = 'remplacement_compteur'` est représenté dans `releves_km` (colonne enum vs table séparée d'événements) — détail d'implémentation.
- Ordre exact des fichiers de migration (23/24/25/26 vs un seul fichier groupé) tant que la discipline "same-commit schema.sql + bootstrap-fresh-schema.js" (Pitfall 4/Anti-Pattern 2) est respectée.
- Sort du trigger `trg_update_km` existant (sur `interventions`) : le garder tel quel (il ne touche pas `releves_km`, reste isolé) ou le supprimer s'il devient redondant/source de confusion — conséquence technique de D-05, pas de contrainte produit.
- Faut-il seeder une ligne `releves_km` de baseline pour chaque moto existante (confort pour l'audit, pas une exigence de correction) — nice-to-have identifié par la recherche, laissé à la planification.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase-level research (produced 2026-07-14)
- `.planning/phases/23-sch-ma-anti-fraude-km-au-niveau-db/23-RESEARCH.md` — trigger PL/pgSQL exact (BEFORE INSERT gate+log via RETURN NULL, AFTER INSERT motos.km sync), NULL-safe `GREATEST(motos.km, MAX(releves_km.km))` baseline finding, re-confirmed line numbers for the 3 existing km write paths, exact RLS-comment convention to mirror

### Research (v1.6 milestone, produced 2026-07-13/14)
- `.planning/research/SUMMARY.md` — synthèse exécutive, ordre de phases, risques critiques
- `.planning/research/PITFALLS.md` — 8 pitfalls détaillés, TOUS directement pertinents pour cette phase (Pitfall 1-5 sont schema-design-phase ou anti-fraud-logic-phase scope)
- `.planning/research/ARCHITECTURE.md` — patterns d'intégration, structure de fichiers recommandée (`sql/migrations/23-26_*.sql`), Pattern 4 (RBAC/RLS split) et Anti-Pattern 2 (migration sans schema.sql same-commit) directement applicables
- `.planning/research/STACK.md` — trigger PL/pgSQL BEFORE INSERT, pas de nouvelle dépendance npm

### Planning artifacts
- `.planning/ROADMAP.md` Phase 23 section — goal, success criteria, requirements mappés
- `.planning/REQUIREMENTS.md` — KM-01, KM-04, CONSO-02 (texte exact des requirements)
- `.planning/PROJECT.md` — contrainte : ne jamais toucher la pondération anti-fraude 1.0/0.6/0.3 sans validation Mehdi (hors scope de cette phase mais rappel pour ne pas confondre les deux systèmes anti-fraude)

### Discipline schema.sql (v1.5 precedent — critique pour cette phase)
- `scripts/bootstrap-fresh-schema.js` — script de vérification bootstrap à re-lancer après toute modification de `schema.sql`, avant de considérer la phase terminée
- `schema.sql` lignes 689-702 — exemple existant de commentaire documentant "RLS activé sans policy, service-role-only, intentionnel" à répliquer pour les 3 nouvelles tables (D-01)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Trigger idiom déjà live dans `schema.sql` (`trg_recalc_score`, `trg_update_km` — ce dernier est explicitement le MAUVAIS exemple à copier : c'est un clamp `GREATEST()` laxiste, pas un rejet strict) — réutiliser l'idiome PL/pgSQL `BEFORE INSERT`, pas la sémantique de `trg_update_km`.
- Pattern RLS "service-role-only, documenté" déjà établi pour `garage_users`/`client_device_tokens`/`push_send_log` et les 4 tables Gap B — copier exactement ce pattern (D-01).
- Pattern `TEXT + CHECK` déjà établi pour `interventions.niveau_preuve` — copier exactement pour `type_consommable` (D-02).
- Pattern `signature_hash` sur `interventions` existe mais n'est PAS repris ici (D-03 a choisi métadonnées simples) — ne pas copier ce pattern par réflexe.

### Established Patterns
- Discipline schema.sql : migration file + `schema.sql` update dans le MÊME commit + vérification `bootstrap-fresh-schema.js` avant de considérer une migration "terminée" — établie et prouvée en v1.5 (SCHEMA-01→07), doit être respectée dès le premier jour de v1.6 (Anti-Pattern 2 de ARCHITECTURE.md).
- `supabase.js` est l'unique frontière d'accès DB — aucun appel `supabase.from(...)` direct dans `motokey-api.js` (Anti-Pattern 1). Pas d'endpoint HTTP prévu dans cette phase, mais si un helper `supabase.js` est ajouté pour exposer le log de rejet, suivre ce pattern.

### Integration Points
- `motos.km` reste la colonne lue par tout le reste du code existant (score anti-fraude, plan d'entretien, etc.) — devient dérivée mais physique, donc AUCUN autre module du code n'a besoin d'être modifié pour lire le km moto (pas de breaking change en aval de cette phase).
- Les 3 chemins d'écriture km existants (`Motos.update`, `Interventions.create`, `OrdresReparation.cloturer`) sont dans `supabase.js` — grep exhaustif requis en début de recherche/planning pour confirmer qu'aucun 4e chemin n'existe (le research l'a fait une fois mais recommande de re-grep à l'implémentation, per Pitfall 2).

</code_context>

<specifics>
## Specific Ideas

Aucune référence UI dans cette phase (pure DB/backend). Le seul point de vigilance UX mentionné : le log de rejet doit être conçu comme "consultable" par le garage — cette phase pose la donnée (table + éventuel helper de lecture), l'affichage réel est hors scope (Phase 27).

</specifics>

<deferred>
## Deferred Ideas

- **Table de référence `types_consommables`** — rejetée pour cette phase (D-02 a choisi TEXT+CHECK), mais notée comme option si le besoin de vraie extensibilité runtime (ajout de type sans déploiement) se confirme dans un futur milestone.
- **Policies RLS granulaires (join via moto_id)** — rejetées pour cette phase (D-01 a choisi service-role-only), mais Pitfall 5 (correction RLS après cession de moto) reste pertinent si un jour l'app expose un accès direct Supabase SDK côté client (actuellement aucun code mobile/web ne le fait).
- **Signature cryptographique (`signature_hash`)** sur le changement de compteur — rejetée pour cette phase (D-03 a choisi métadonnées d'audit simples), notée si un besoin de non-répudiation renforcée émerge plus tard.
- **Migration/retrait des colonnes `pneu_av`/`pneu_ar`/`pneu_km_montage` legacy** — explicitement hors scope de cette phase, assignée à Phase 27 (CONSO-04) par le roadmap.

### Reviewed Todos (not folded)
Aucun todo en attente ne matchait cette phase (`gsd-tools todo match-phase 23` → 0 résultat).

</deferred>

---

*Phase: 23-sch-ma-anti-fraude-km-au-niveau-db*
*Context gathered: 2026-07-14*
