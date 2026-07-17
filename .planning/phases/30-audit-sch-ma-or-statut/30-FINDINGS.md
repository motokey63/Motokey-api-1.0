# Phase 30 — Constats d'audit `or_statut` (MIGR-02)

**Méthode :** requête live PostgREST OpenAPI (`node scripts/introspect-or-statut.js`), pas une inférence depuis `migrations/08-livraison-3a-ordres-reparation.sql` ni depuis le code `_OR_TRANS`/`_OR_TRANS_RAM`.
**Date d'exécution :** 2026-07-17
**Host prod confirmé :** `rzbqbaccjyxvtlnfitrr.supabase.co`

---

## Valeurs live de or_statut (source : PostgREST OpenAPI, 2026-07-17)

Sortie réelle de `node scripts/introspect-or-statut.js` :

```
or_statut live values: ["brouillon","valide_client","en_cours","attente","termine","facture","annule"]
format: public.or_statut
```

**7 valeurs**, exactement celles déjà prouvées par le code (`_OR_TRANS` dans `supabase.js:913-921`, mirroir `_OR_TRANS_RAM` dans `motokey-api.js:2982-2990`) : `brouillon`, `valide_client`, `en_cours`, `attente`, `termine`, `facture`, `annule`. Aucune valeur fantôme supplémentaire détectée — contrairement au pattern des colonnes fantômes du Gap A (migrations 20/21), ici la requête live confirme exactement la borne inférieure prouvée par le code, ni plus ni moins.

### Side-finding : or_tache_statut (Open Question 5, hors scope MIGR-02)

```
or_tache_statut live values: ["a_faire","en_cours","fait"]
format: public.or_tache_statut
```

3 valeurs, identiques à la déclaration trackée (`migrations/08-livraison-3a-ordres-reparation.sql:32-35` : `CREATE TYPE or_tache_statut AS ENUM ('a_faire','en_cours','fait')`). **Aucune dérive détectée sur cet enum** — audité gratuitement dans la même passe, mais hors scope de MIGR-02 (qui porte spécifiquement sur `or_statut`). Aucune action requise en Phase 31 pour `or_tache_statut`.

---

## Ecart vs les 7 statuts cibles

Les 7 cibles du cycle unifié v1.8 : `brouillon, envoye, accepte, en_cours, termine, facture, refuse`.

**Valeurs cibles MANQUANTES dans l'enum live** (candidates à `ADD VALUE` ou à couvrir par TEXT+CHECK) :
- `envoye` — absente de `or_statut`, existe déjà sur `devis.statut` (`schema.sql:344`)
- `accepte` — absente de `or_statut`, existe déjà sur `devis.statut` (`schema.sql:344`)
- `refuse` — absente de `or_statut`, existe déjà sur `devis.statut` (`schema.sql:344`)

**Valeurs live HORS-CIBLE** (présentes en live, sans équivalent 1:1 propre dans les 7 cibles) :
- `valide_client` — pas de mapping évident (voir Questions ouvertes)
- `attente` — statut on-hold, absent du cycle cible à 7 statuts
- `annule` — statut d'annulation garage, absent du cycle cible à 7 statuts (qui a `refuse`, sémantiquement différent — voir Questions ouvertes)

**Valeur fantôme (présente en live mais jamais référencée par `_OR_TRANS`) :** aucune détectée. Les 7 valeurs live correspondent exactement aux 7 valeurs déjà prouvées par le code — pas de pattern "ghost enum value" ici, contrairement aux colonnes fantômes du Gap A.

---

## Reconciliation Table

Une ligne par valeur réelle live (issue de la sortie du script, pas du template UNVERIFIED de la recherche) :

| Valeur live | Utilisée par le code ? | Statut cible | Action |
|---|---|---|---|
| `brouillon` | oui (`_OR_TRANS`, `_OR_TRANS_RAM`) | `brouillon` | garder (même nom) |
| `valide_client` | oui | `envoye` OU `accepte` (ambigu) | DECISION PRODUIT REQUISE (voir Questions ouvertes) |
| `en_cours` | oui | `en_cours` | garder (même nom) |
| `attente` | oui | (hors des 7 — pas de cible directe) | DECISION PRODUIT REQUISE (voir Questions ouvertes) |
| `termine` | oui | `termine` | garder (même nom) |
| `facture` | oui | `facture` | garder (même nom) |
| `annule` | oui | (hors des 7 — `refuse` existe mais sémantique différente) | DECISION PRODUIT REQUISE (voir Questions ouvertes) |

**Valeurs cibles sans équivalent live actuel** (n'apparaissent dans aucune ligne ci-dessus car elles n'existent pas encore dans `or_statut`) :

| Statut cible manquant | Équivalent existant ailleurs | Action |
|---|---|---|
| `envoye` | `devis.statut` (TEXT+CHECK, `schema.sql:344`) | nouvelle valeur à créer sur `or_statut` (ou `TEXT+CHECK` équivalent) — comportement réellement nouveau, pas de statut "envoyé, en attente de réponse" actuellement modélisé sur `ordres_reparation` |
| `accepte` | `devis.statut` | nouvelle valeur — probable cible de `valide_client` (voir Questions ouvertes) |
| `refuse` | `devis.statut` | nouvelle valeur — probable cible de `annule` (voir Questions ouvertes), sémantique à confirmer |

---

## Plan de reconciliation ordonne

### Option A — ENUM patché (`ALTER TYPE or_statut ADD VALUE ...`)

Contraintes Postgres strictes à respecter si cette option est retenue :

1. **Contrainte transactionnelle (erreur 55P04)** : depuis PostgreSQL 12, `ALTER TYPE ... ADD VALUE` peut s'exécuter dans un bloc transactionnel, mais la valeur nouvellement ajoutée **ne peut pas être utilisée dans la même transaction** qui l'a ajoutée (`UPDATE ... SET statut = 'envoye'` ou toute comparaison échouerait avec `unsafe use of new value "envoye" of enum type or_statut`). Concrètement pour ce projet : chaque `migrations/XX-...sql` est déjà encapsulé dans un seul bloc `BEGIN; ... COMMIT;` (convention confirmée, `migrations/08...sql:20,227`) — donc **chaque `ADD VALUE` doit vivre dans sa PROPRE migration/transaction, séparée et antérieure** à toute migration qui écrit des lignes utilisant cette valeur.
   - Ordre requis si Option A est retenue : migration N (`ADD VALUE 'envoye'`, `ADD VALUE 'accepte'`, `ADD VALUE 'refuse'`, chacune dans son propre `BEGIN/COMMIT` ou une seule transaction MAIS aucune écriture de ces valeurs dans la même transaction) → migration N+1 (backfill/rename des lignes existantes vers les nouvelles valeurs, seulement après COMMIT de la migration N).
2. **Absence de `DROP VALUE`** : PostgreSQL ne fournit aucune commande native pour retirer une valeur d'un ENUM. Si `attente`/`annule` doivent disparaître du catalogue (pas seulement du code applicatif), la seule voie est : (a) s'assurer qu'aucune ligne ne référence plus la valeur, (b) recréer le type (`CREATE TYPE or_statut_new AS ENUM (...)`, migrer la colonne, `DROP TYPE` l'ancien) — opération lourde, à faire hors-ligne ou avec verrou table. Sinon, les valeurs orphelines restent indéfiniment dans le catalogue.
3. **`RENAME VALUE`** (disponible depuis PG10) est sûr et simple pour un renommage pur (ex. si `valide_client` devait juste changer de libellé sans changement sémantique) — mais ne s'applique pas proprement ici car le mapping n'est pas un renommage 1:1 (voir Pitfall 3 de la recherche : `attente`/`annule` n'ont pas d'équivalent cible direct, un `RENAME` forcé laisserait une sémantique fausse).

### Option B — RECOMMANDÉE : remplacer l'ENUM par `TEXT + CHECK`

Remplacer la colonne `ordres_reparation.statut` (actuellement `or_statut` ENUM) par une colonne `TEXT NOT NULL CHECK (statut IN (...))`, exactement le pattern déjà utilisé par `devis.statut` (`TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'envoye', 'accepte', 'refuse', 'expire', 'converti', 'annule'))`, `schema.sql:344`) — cohérent avec le fait que la Phase 31 fusionne de toute façon `devis` et `ordres_reparation` en un seul objet.

**Justification :**
- Au volume actuel (6 OR, 8 devis — comptage STATE.md 2026-07-17), la différence de storage/perf ENUM (4 bytes OID) vs TEXT (variable-length) est immatérielle.
- Le facteur décisif est la **flexibilité opérationnelle** : un `CHECK` constraint se modifie via `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ...` dans une transaction ordinaire — pas de danse `ADD VALUE`/rename/recreate-type, pas de contrainte 55P04, pas de valeurs orphelines impossibles à retirer.
- Les deux approches sont également enforced au niveau DB (un `CHECK` n'est pas moins strict qu'un ENUM — ni l'un ni l'autre ne dépend du chemin d'écriture applicatif).
- Cohérence directe avec `devis.statut`, la table que Phase 31 fusionne dans `ordres_reparation`.

**Ce document est le point de départ de la Phase 31** — la recommandation Option B est soumise à l'arbitrage produit de la Task 3 (ci-dessous) avant toute écriture DDL.

---

## Questions ouvertes — DECISIONS PRODUIT POUR MEHDI

Ces 3 questions n'ont **pas** été tranchées par l'exécutant — ce sont des décisions produit, pas des choix techniques.

1. **`valide_client` → `envoye` ou `accepte` ?**
   Le code montre `brouillon → valide_client → en_cours` : `valide_client` est aujourd'hui l'unique porte entre "pas commencé" et "en cours". Le cycle cible sépare ça en deux étapes distinctes (`envoye` = envoyé au client, `accepte` = client a dit oui), avant `en_cours`. `devis.statut` a déjà `envoye` ET `accepte` séparés — hypothèse de la recherche (30-RESEARCH.md, Open Question 2) : `valide_client` s'effondre sur `accepte` (comportement actuel — une seule confirmation client explicite), et `envoye` est un état réellement nouveau (aucun équivalent actuel sur `or_statut` — les OR/devis vont aujourd'hui directement de la création à "en attente de validation client", sans état "envoyé, en attente de réponse" modélisé). **Réponse courte attendue : `valide_client` devient `accepte`, ou `envoye` ?**

2. **`attente` (on-hold, détour depuis `en_cours` avec `attente_motif`) : replier en flag sur `en_cours`, ou garder comme statut supplémentaire hors des 7 ?**
   `attente` est activement utilisé aujourd'hui comme détour depuis `en_cours` (nécessite `attente_motif`). Le cycle cible à 7 statuts n'a pas d'équivalent direct. **Réponse courte attendue : replier en flag (`en_cours` + `en_attente=true` + `attente_motif`), ou conserver `attente` comme 8e statut en dehors des 7 "nécessaires" ?**

3. **`annule` (annulation garage) vs `refuse` (refus client) : mapper `annule → refuse`, ou garder `annule` comme 8e statut distinct ?**
   Sémantiquement distincts : `annule` est aujourd'hui l'échappatoire quasi-universelle côté garage (annulation depuis presque tout état non-terminal), `refuse` dans le cycle cible désigne un refus côté client. Ne pas présupposer l'équivalence. **Réponse courte attendue : `annule` devient `refuse`, ou `annule` reste un statut distinct en plus des 7 ?**

---

## Gate Phase 31

**Aucune écriture DDL sur `or_statut` ne doit avoir lieu avant que ce document existe et que les 3 questions ci-dessus soient tranchées par Mehdi.** Ce document (30-FINDINGS.md) est l'entrée de la Phase 31 — la Phase 31 ne doit démarrer son travail de migration DDL qu'une fois la Task 3 (checkpoint bloquant, cross-check `pg_enum` + arbitrage produit) résolue et les décisions reportées ici.

**Confirmation :** aucun fichier `.sql`/migration touchant `or_statut` n'a été créé pendant la Phase 30 (`git log --oneline -- 'sql/migrations/*or_statut*' 'migrations/*or_statut*'` reste vide au moment de la rédaction de ce document).
