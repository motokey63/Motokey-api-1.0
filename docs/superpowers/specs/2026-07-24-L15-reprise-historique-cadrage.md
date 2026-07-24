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

### c) `factures_scannees` — structure prod à confirmer avant de planifier ce point

Table référencée uniquement en commentaire FK dans `schema.sql`, absente du repo. Existe en prod
mais structure réelle inconnue depuis le code. Requête à faire lancer par Mehdi via le Supabase
Dashboard (SQL Editor) — non exécutée par Claude Code :

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'factures_scannees'
ORDER BY ordinal_position;
```

Le plan d'implémentation n'aborde pas la question "réutiliser `factures_scannees` vs. créer une
table séparée pour L15" tant que le résultat de cette requête n'est pas connu.

## Dette hors périmètre L15

- **CLAUDE.md est périmé sur le calcul de score** : il décrit la formule 70/30 + la pondération
  anti-fraude `niveau_preuve` (1.0/0.6/0.3) comme actives, alors qu'en prod le score est un `SUM`
  simple sans lecture de `niveau_preuve` (voir amendement a) ci-dessus). À corriger indépendamment
  de L15 — la réécriture du moteur de score mérite sa propre livraison, pas un correctif de
  documentation seul.
