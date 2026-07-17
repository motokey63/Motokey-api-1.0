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

### Cross-check pg_enum (Task 3, Mehdi — Supabase Dashboard SQL Editor, 2026-07-17)

Requête exécutée par Mehdi directement contre `pg_enum` (source de vérité ultime du catalogue Postgres, indépendante du cache PostgREST) :

```sql
SELECT enumlabel, enumsortorder
FROM pg_enum
WHERE enumtypid = 'or_statut'::regtype
ORDER BY enumsortorder;
```

Résultat :

```
enumlabel,enumsortorder
brouillon,1
valide_client,1.5
en_cours,2
attente,2.5
termine,3
facture,3.5
annule,4
```

**CONCORDANCE CONFIRMÉE** : mêmes 7 valeurs, même ensemble, que la sortie du script `introspect-or-statut.js` (PostgREST OpenAPI). Aucun écart — le cache PostgREST n'était pas périmé (Pitfall 1 de la recherche écarté, aucun `NOTIFY pgrst, 'reload schema'` nécessaire).

**Lecture utile de `enumsortorder`** : les valeurs `valide_client` (1.5), `attente` (2.5) et `facture` (3.5) portent des `enumsortorder` fractionnaires, intercalées entre les 4 valeurs entières (`brouillon`=1, `en_cours`=2, `termine`=3, `annule`=4). C'est la signature Postgres d'un `ALTER TYPE or_statut ADD VALUE 'x' AFTER 'y'` exécuté après la création initiale du type — la preuve directe que ces 3 valeurs ont été ajoutées manuellement (hors migration trackée) après la déclaration originelle à 4 valeurs de `migrations/08-livraison-3a-ordres-reparation.sql:26`. Ceci confirme précisément le récit de dérive documenté dans STATE.md : la migration 08 (4 valeurs) était bien l'état initial réel, et `valide_client`/`attente`/`facture` sont des ajouts non documentés ultérieurs.

### Side-finding : or_tache_statut (Open Question 5, hors scope MIGR-02)

```
or_tache_statut live values: ["a_faire","en_cours","fait"]
format: public.or_tache_statut
```

3 valeurs, identiques à la déclaration trackée (`migrations/08-livraison-3a-ordres-reparation.sql:32-35` : `CREATE TYPE or_tache_statut AS ENUM ('a_faire','en_cours','fait')`). **Aucune dérive détectée sur cet enum** — audité gratuitement dans la même passe, mais hors scope de MIGR-02 (qui porte spécifiquement sur `or_statut`). Aucune action requise en Phase 31 pour `or_tache_statut`.

---

## Ecart vs les 7 statuts cibles

Les 7 cibles du cycle unifié v1.8 : `brouillon, envoye, accepte, en_cours, termine, facture, refuse`.

> **⚠️ MISE À JOUR POST-TASK 3 (2026-07-17) — le set réconcilié final n'est PAS 7 statuts, c'est 8.**
> Les décisions produit de Mehdi (Task 3, voir "Questions ouvertes" et "Reconciliation Table" ci-dessous) gardent `attente` ET `annule` comme statuts distincts, en plus des 7 cibles de MIGR-02. `envoye` en revanche disparaît du besoin réel (pas de statut dédié — un timestamp suffit). Net : le cycle réconcilié réel est **`brouillon, accepte (ex-valide_client), en_cours, attente, termine, facture, annule, refuse (nouveau)`** — 8 valeurs, pas 7. Le framing "7 statuts cibles" de REQUIREMENTS MIGR-02 ne se vérifie donc PAS 1:1 sur le terrain ; il reste la référence documentaire d'origine mais la Phase 31 doit travailler sur ce set de 8, pas sur les 7 initialement listés. Ne pas silencieusement retomber sur "7" ailleurs dans ce document sans cette note.

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
| `valide_client` | oui | `accepte` (TRANCHÉ — Mehdi, 2026-07-17) | **RENOMMER** `valide_client` → `accepte`. Pas d'état `envoye` distinct créé : l'envoi reste un timestamp (`date_envoi`) sur un OR `brouillon`, pas un statut à part (décision Mehdi, voir Questions ouvertes §1) |
| `en_cours` | oui | `en_cours` | garder (même nom) |
| `attente` | oui | `attente` — **conservé comme 8e statut global** (TRANCHÉ — Mehdi, 2026-07-17) | **GARDER** `attente` tel quel, en plus des 7 cibles. Piloté à terme par les flags `en_attente_acceptation_client` au niveau ligne (Phase 32/33) : dès qu'une ligne bascule ce flag à `true`, l'OR entier passe en `attente` ; il redescend en `en_cours` une fois la ligne acceptée. Voir note résiduelle ci-dessous sur l'usage actuel du code. |
| `termine` | oui | `termine` | garder (même nom) |
| `facture` | oui | `facture` | garder (même nom) |
| `annule` | oui | `annule` — **conservé distinct de `refuse`** (TRANCHÉ — Mehdi, 2026-07-17) | **GARDER** `annule` tel quel, en plus des 7 cibles. Sémantique différente de `refuse` : `refuse` = le client rejette le devis (avant travaux) ; `annule` = le garage annule en cours de route (moto non réparable, client injoignable…), potentiellement après début des travaux. Fusionner perdrait de l'information utile pour stats/relance client (rationale Mehdi). |

**Valeurs cibles sans équivalent live actuel** (mise à jour post-décisions Task 3, 2026-07-17) :

| Statut cible manquant | Équivalent existant ailleurs | Action (post-décision Mehdi) |
|---|---|---|
| `envoye` | `devis.statut` (TEXT+CHECK, `schema.sql:344`) | **PAS de nouvelle valeur enum créée** (TRANCHÉ). Mehdi a explicitement écarté la création d'un 8e/9e statut `envoye` distinct : l'envoi au client reste modélisé comme un timestamp (`date_envoi`) sur un OR en `brouillon`, pas un changement de statut. Décision plus simple, gardée telle quelle — voir Questions ouvertes §1. |
| `accepte` | `devis.statut` | **PAS une nouvelle valeur — un RENOMMAGE** de `valide_client` existant (TRANCHÉ, voir Questions ouvertes §1). Impact Phase 31 : `RENAME VALUE` (Option A) ou simple relabel dans le `CHECK` (Option B), pas un `ADD VALUE`. |
| `refuse` | `devis.statut` | **Reste une vraie valeur MANQUANTE, à créer.** Ce n'est PAS un renommage de `annule` — Mehdi a tranché que les deux restent distincts (voir Questions ouvertes §3). `refuse` doit être ajouté à `or_statut` comme une 8e valeur réellement nouvelle si la Phase 31 veut représenter le refus client au niveau OR (aujourd'hui ce cas existe côté `devis.statut` mais pas côté `ordres_reparation.statut`). |

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

**STATUT : ✅ TOUTES RÉSOLUES (Task 3, Mehdi, 2026-07-17).** Les 3 questions ci-dessous sont conservées telles que formulées à l'origine (contexte pour la Phase 31), chacune suivie de la décision tranchée par Mehdi et sa justification.

1. **`valide_client` → `envoye` ou `accepte` ?**
   Le code montre `brouillon → valide_client → en_cours` : `valide_client` est aujourd'hui l'unique porte entre "pas commencé" et "en cours". Le cycle cible sépare ça en deux étapes distinctes (`envoye` = envoyé au client, `accepte` = client a dit oui), avant `en_cours`. `devis.statut` a déjà `envoye` ET `accepte` séparés — hypothèse de la recherche (30-RESEARCH.md, Open Question 2) : `valide_client` s'effondre sur `accepte` (comportement actuel — une seule confirmation client explicite), et `envoye` est un état réellement nouveau (aucun équivalent actuel sur `or_statut` — les OR/devis vont aujourd'hui directement de la création à "en attente de validation client", sans état "envoyé, en attente de réponse" modélisé).

   **✅ RÉSOLU — Décision Mehdi : `valide_client` → `accepte`** (pas `envoye`). Rationale (verbatim Mehdi) : "Le nom 'validé par le client' correspond sémantiquement à l'acceptation, pas à l'envoi. Ça implique qu'il n'y a pas d'état 'envoyé' distinct dans le système actuel — l'envoi serait juste un timestamp (`date_envoi`) sur un OR en brouillon, pas un statut à part. C'est plus simple, je recommande de le garder ainsi plutôt que d'ajouter un 8e statut." → Aucun statut `envoye` créé ; `valide_client` est renommé/mappé vers `accepte`.

2. **`attente` (on-hold, détour depuis `en_cours` avec `attente_motif`) : replier en flag sur `en_cours`, ou garder comme statut supplémentaire hors des 7 ?**
   `attente` est activement utilisé aujourd'hui comme détour depuis `en_cours` (nécessite `attente_motif`). Le cycle cible à 7 statuts n'a pas d'équivalent direct.

   **✅ RÉSOLU — Décision Mehdi : `attente` reste un 8e statut global**, complémentaire (pas remplacé) par un flag au niveau ligne. Rationale (verbatim Mehdi) : "Ça change la donne par rapport à mon design initial. J'avais proposé un flag au niveau de la ligne (`en_attente_acceptation_client`). Mais si `attente` existe déjà comme statut global de l'OR, il faut clarifier : est-ce que ça sert aujourd'hui à autre chose (attente pièce, attente créneau atelier) ? Si oui, je recommande de garder `attente` comme 8e statut global, piloté automatiquement par mes flags de ligne (dès qu'une ligne a `en_attente_acceptation_client=true`, l'OR entier bascule en `attente` ; il redescend en `en_cours` une fois la ligne acceptée). Les deux mécanismes se complètent, ils ne s'excluent pas."

   **Sous-question résiduelle soulevée par Mehdi — usage actuel de `attente`, vérifié dans le code (non bloquant, note pour Phase 31) :** grep dans `supabase.js`/`motokey-api.js` (`_OR_TRANS`, `changerStatut`) confirme que `attente` est aujourd'hui un simple **hold générique manuel** au niveau de l'OR entier : transition `en_cours → attente` déclenchée à la main (pas automatiquement), avec `attente_motif` obligatoire en texte libre (`supabase.js:1113-1114`, `motokey-api.js:3155`) — aucune catégorisation structurée (pas de distinction "attente pièce" vs "attente créneau atelier" dans le schéma actuel, le motif est du texte libre non typé). **Aucun code existant ne référence `en_attente_acceptation_client` ni `ajoutee_en_cours`** (grep confirmé vide sur tout le repo) — le mécanisme de flag ligne→statut global proposé par Mehdi est entièrement à construire en Phase 32/33, il n'existe aucune version partielle à réconcilier. La compatibilité que Mehdi anticipe ("les deux mécanismes se complètent") est donc structurellement possible : le hold manuel actuel (motif libre) et le futur hold automatique piloté par ligne peuvent cohabiter sur le même statut `attente`, à condition que la Phase 32/33 décide comment distinguer (ou non) un `attente` manuel d'un `attente` auto-déclenché par ligne (ex. `attente_motif` structuré vs `en_attente_acceptation_client` sur une ligne liée) — point à trancher en Phase 32/33, pas ici.

3. **`annule` (annulation garage) vs `refuse` (refus client) : mapper `annule → refuse`, ou garder `annule` comme 8e statut distinct ?**
   Sémantiquement distincts : `annule` est aujourd'hui l'échappatoire quasi-universelle côté garage (annulation depuis presque tout état non-terminal), `refuse` dans le cycle cible désigne un refus côté client. Ne pas présupposer l'équivalence.

   **✅ RÉSOLU — Décision Mehdi : `annule` reste distinct de `refuse`** (pas de fusion). Rationale (verbatim Mehdi) : "Ce sont deux réalités métier différentes : `refuse` = le client rejette le devis (avant travaux), `annule` = le garage annule en cours de route (moto non réparable, client injoignable, etc.), potentiellement même après le début des travaux. Les fusionner perdrait de l'information utile pour les stats/relance client." → `refuse` doit être créé comme valeur réellement nouvelle sur `or_statut` (Phase 31), `annule` est conservé tel quel.

**Synthèse de l'impact sur le set cible** : voir l'encart d'avertissement en tête de la section "Ecart vs les 7 statuts cibles" — le set réconcilié final est 8 statuts (`brouillon, accepte, en_cours, attente, termine, facture, annule, refuse`), pas 7.

---

## Gate Phase 31

**✅ GATE LEVÉ (2026-07-17) — Phase 31 peut démarrer son travail de migration DDL sur cette base.**

- Cross-check `pg_enum` (Task 3, Mehdi, Dashboard SQL Editor) exécuté et **concordant** avec la sortie live du script — aucun écart, aucun refresh de cache PostgREST nécessaire.
- Les 3 questions produit (`valide_client`, `attente`, `annule`) sont **toutes tranchées** par Mehdi (voir "Questions ouvertes" ci-dessus) :
  - `valide_client` → `accepte` (renommage, pas de nouvel `envoye`)
  - `attente` → conservé comme 8e statut global (pas de flag remplaçant)
  - `annule` → conservé distinct de `refuse` (pas de fusion)
- **Set cible réel pour la Phase 31 : 8 statuts**, pas 7 — `brouillon, accepte, en_cours, attente, termine, facture, annule, refuse`. Le framing "7 statuts cibles" de REQUIREMENTS MIGR-02 doit être lu à la lumière de cette correction ; `refuse` est la seule valeur réellement nouvelle à créer (`ADD VALUE` ou `CHECK` étendu), tout le reste est soit un renommage (`valide_client`→`accepte`) soit une conservation telle quelle.
- Une sous-question résiduelle non bloquante subsiste pour la Phase 32/33 (pas la Phase 31 DDL) : comment distinguer, si besoin, un `attente` déclenché manuellement (motif libre existant) d'un futur `attente` auto-déclenché par le flag ligne `en_attente_acceptation_client` — voir note résiduelle dans "Questions ouvertes" §2.

**Confirmation :** aucun fichier `.sql`/migration touchant `or_statut` n'a été créé pendant la Phase 30 (`git log --oneline -- 'sql/migrations/*or_statut*' 'migrations/*or_statut*'` reste vide au moment de la rédaction de ce document, y compris après la mise à jour Task 3).
