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
