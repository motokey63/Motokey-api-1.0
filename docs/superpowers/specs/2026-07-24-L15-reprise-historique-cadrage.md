# L15 — Reprise d'historique (import de factures anciennes) — Cadrage

## Enjeu

Une moto de 15 ans avec 50 factures démarre aujourd'hui à score 0. C'est le cas où le passeport
numérique a le plus de valeur — et celui où l'absence de reprise d'historique fait le plus mal au
concept.

## Décisions validées (cadrage session claude.ai, 24/07/2026)

1. **Qui peut importer** : le CLIENT et le GARAGE peuvent tous les deux importer de l'historique.
   En cas de divergence entre les deux versions, **la version garage fait foi**. On ne l'écrase
   pas : on trace la correction. La prestation garage facturable (~30 €) est une ligne dans une
   intervention L10, pas un objet à part.

2. **Cohérence km** : le trigger `verifier_km_monotone` compare au max historique — inadapté pour
   un import rétroactif. Pour l'import d'historique, comparer au **voisin chronologique** plutôt
   qu'au max global. Exemple cohérent : 2015 à 6000 km puis 2020 à 7500 km. L'inverse (km qui
   régresse par rapport au voisin chronologique) est **refusé, tracé et affiché** — le rejet est
   une valeur anti-fraude en soi, pas une erreur silencieuse à masquer.

3. **Identification du document** : date + plaque obligatoires. SIRET optionnel. Nom du garage en
   texte libre (un garage fermé n'est vérifiable nulle part). Fallback sur le VIN si la plaque a
   changé depuis ; sinon revue manuelle.

4. **Niveau de confiance** : un niveau distinct, positionné sous le 🔵 Pro — "historique déclaré
   avec justificatif". Remonte d'un cran si contre-signé par un garage PRO. Pondéré par l'âge du
   document dans la part accumulation du score.

5. **OCR** : réutiliser `anthropicVisionClient` (L12), avec un pattern étiquette pièce. L'IA
   pré-remplit, l'humain valide. **Jamais d'insertion automatique** sans validation humaine.

6. **UX** : upload multiple → file de traitement → écran de revue en liste → validation groupée.
   Pas un formulaire ligne par ligne.

## Hors périmètre

- Connexion boîte mail (OAuth/RGPD). Un PDF reçu par mail s'uploade comme n'importe quel autre
  document — pas d'intégration mail directe dans ce périmètre.

## Amendements post-recherche codebase (24/07)

Recherche menée avant l'écriture du plan d'implémentation (fork dédié, 24/07/2026). Trois écarts
entre le cadrage initial et l'état réel du code — décisions prises ci-dessous, à respecter dans
le plan d'implémentation.

### a) Score — `niveau_preuve` stocké, moteur de score non touché

`recalc_score_moto()` (trigger SQL, prod réelle) est un simple `SUM` plafonné par type
d'intervention (+12/+8/+5/-5). **Ce n'est pas** la formule 70/30 documentée dans CLAUDE.md — cette
formule n'existe qu'en JS (`calcScore()`), utilisée uniquement par le fallback RAM, jamais en
prod Supabase. La colonne `interventions.niveau_preuve` (facture/visuel/declare) existe mais
n'est lue par aucun calcul de score actuel — la pondération anti-fraude 1.0/0.6/0.3 n'est
implémentée nulle part.

**Décision** : L15 stocke et affiche `niveau_preuve` sur les interventions importées (y compris
le nouveau niveau "historique déclaré avec justificatif" de la décision 4 ci-dessus). L15 **ne
modifie pas** `recalc_score_moto()`. La réécriture du moteur de score pour qu'il consomme enfin
`niveau_preuve` est **hors périmètre L15** — chantier séparé, à ouvrir indépendamment.
Conséquence assumée : le score d'une moto à historique importé restera sous-évalué (les
interventions importées comptent comme n'importe quelle intervention du même type, sans
pondération par preuve ni bonus d'ancienneté) tant que ce chantier séparé n'est pas fait. C'est
un défaut documenté et assumé, pas un bug à corriger dans L15.

### b) Cohérence km — jamais d'écriture dans `releves_km`

`trg_sync_moto_km` écrase `motos.km` sans condition à chaque insertion dans `releves_km`, et
cette table n'a pas de colonne de date d'événement distincte de `created_at` (horodatage
d'insertion réel). Un import rétroactif qui passerait par ce circuit écraserait le km actuel réel
de la moto avec une valeur historique.

**Décision** : les imports d'historique **n'écrivent jamais** dans `releves_km`. Ils écrivent
uniquement dans `interventions.km` / `interventions.date_intervention`. La vérification de
cohérence chronologique (comparaison au voisin le plus proche par date, décision 2 ci-dessus) se
fait **en lecture applicative sur `interventions`**, jamais en écriture sur le circuit
`releves_km` / `trg_sync_moto_km`. Aucun trigger existant n'est modifié par L15.

### c) `factures_scannees` — structure prod confirmée (24/07)

Requête `information_schema.columns` exécutée par Mehdi, résultat :

| colonne | type | nullable | défaut |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| moto_id | uuid | NO | — |
| image_base64 | text | YES | — |
| mime_type | text | YES | — |
| ocr_raw | jsonb | YES | — |
| validated_data | jsonb | YES | — |
| validated_at | timestamptz | YES | — |
| validated_by | text | YES | — |
| created_at | timestamptz | NO | `now()` |

**Constat** : table déjà rattachée à `moto_id` uniquement (pas de `garage_id`/`client_id` —
convient bien à la décision 1, import possible par les deux côtés sur la même ancre). Mais il
manque tout ce dont L15 a besoin : pas de colonne pour la **date du document** (`created_at` est
l'horodatage d'upload, pas la date de la facture — décision 3 exige date obligatoire), pas de
`plaque_declaree` (décision 3), pas de `km_declare` (nécessaire pour la vérification voisin
chronologique, décision 2), pas d'`acteur_type`/`acteur_id` (qui a importé : client ou garage —
décision 1), pas de `niveau_confiance` ni de traçage de divergence (décisions 1 et 4).
`validated_by` est un `text` libre, pas une FK — insuffisant pour distinguer client/garage de
façon fiable. Le stockage est en `image_base64` (texte en base), pas une URL Cloudinary comme
partout ailleurs dans l'app (`photo_url`, `facture_url` via `cloudinaryService`) — divergence de
pattern à trancher.

Aucune référence à `factures_scannees` trouvée dans `motokey-api.js` ou `supabase.js` lors de la
recherche du 24/07 — la table semble poser un socle jamais raccordé à un endpoint, pas un flux
actif en production actuellement.

**Décision (24/07)** : étendre `factures_scannees` par migration — ajout des colonnes
manquantes (`acteur_type`, `acteur_id`, `plaque_declaree`, `date_document`, `km_declare`,
`niveau_confiance`, colonnes de traçage de divergence) **et** ajout d'une colonne `photo_url`
(Cloudinary, même pattern que `photo_url`/`facture_url` ailleurs dans l'app) pour les nouveaux
imports. `image_base64` reste en base pour compat descendante mais n'est plus alimentée par le
flux L15 — les nouveaux imports écrivent dans `photo_url` via `cloudinaryService`.

## Dette hors périmètre L15

- **CLAUDE.md est périmé sur le calcul de score** : il décrit la formule 70/30 + la pondération
  anti-fraude `niveau_preuve` (1.0/0.6/0.3) comme actives, alors qu'en prod le score est un `SUM`
  simple sans lecture de `niveau_preuve` (voir amendement a) ci-dessus). À corriger indépendamment
  de L15 — la réécriture du moteur de score mérite sa propre livraison, pas un correctif de
  documentation seul.

### Dette issue de la revue finale de branche (socle backend, 24/07/2026)

Trois trous réels dans le modèle de confiance, bornés par l'amendement (a) (le moteur de score
n'est de toute façon pas branché sur `niveau_preuve` aujourd'hui) — non bloquants pour le merge
du socle, mais à traiter avant ou pendant le chantier séparé de réécriture du moteur de score
(ou avant les Plans 2/3 si l'un d'eux les touche indirectement) :

- **Un import GARAGE ne peut jamais atteindre `type='bleu'`** : `contresigner` refuse de
  contre-signer un import déjà `acteur_type='garage'` avec le motif "déjà au niveau de confiance
  maximal" (`supabase.js`, `HistoriqueImport.contresigner`), mais `valider` promeut TOUT import
  (client ou garage) avec `type:'jaune'` — aucun chemin ne fait passer un import garage à `bleu`.
  Résultat : un import client contre-signé (`bleu`) est mieux noté qu'un import garage qui
  "fait foi" par construction (décision 1), qui reste `jaune` indéfiniment. Le commentaire du
  code et le comportement réel se contredisent. À trancher : soit corriger le commentaire (un
  import garage reste `jaune`, assumé), soit faire promouvoir directement en `bleu` un import
  `acteur_type='garage'` dans `valider`.

- **La divergence est tracée mais l'ancienne intervention n'est jamais neutralisée → double
  comptage potentiel au score** : quand un garage corrige un import client déjà validé,
  `HistoriqueImport.valider` pose bien `divergence_de` sur la nouvelle ligne `factures_scannees`
  (traçage de la correction, décision 1 respectée au niveau du document) mais crée une SECONDE
  ligne `interventions` sans rien faire à la première — les deux restent actives et comptent
  chacune dans `recalc_score_moto()` pour un seul événement d'entretien réel. "La version garage
  fait foi" n'est donc pas réalisé au niveau du score, seulement au niveau de la traçabilité
  documentaire. À adresser probablement en même temps que la réécriture du moteur de score
  (ex: exclure du `SUM` une intervention dont `factures_scannees.divergence_de` pointe vers elle).

- **Un CLIENT qui importe sur une moto sans `garage_id` produit un 500 opaque** :
  `resolveMotoForCtx` (motokey-api.js, code existant hors périmètre L15) anticipe explicitement
  ce cas (`garage_id: moto.garage_id || null`), mais `interventions.garage_id` est `NOT NULL` —
  l'insert échoue et remonte en 500 générique plutôt qu'un message clair. À vérifier si ce cas
  est réellement atteignable en pratique (toutes les motos vues en session avaient un
  `garage_id` posé), et si oui ajouter un garde-fou 4xx explicite dans `POST
  /historique/:id/valider`.
