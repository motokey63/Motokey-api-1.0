# Guide photo consommables (L11 — morceau 3/3) — Design

## Contexte

Ce morceau clôt le fil "L11" (doctrine produit consommables/photo/IA/anti-fraude — voir mémoire
`project_l11_consommables_doctrine`). Un audit du code réel (20/07/2026), fait avant tout codage,
a révélé que l'essentiel du morceau 3/3 tel qu'imaginé initialement ("tables consommables +
branchement UI upload") **existe déjà** :

- Schéma DB complet (`consommables`, `photos_consommables`, `releves_km` + anti-fraude monotonie) — Phase 23-25/27, hors nom "L11".
- Endpoint serveur `POST /motos/:id/photos-consommables` (multipart, upload Cloudinary **signé** côté serveur, auto-création consommable, appel IA stub, persistance) — `motokey-api.js:512` (`handlePhotoConsommable`).
- Câblage client déjà en prod dans `MotoKey_Client.html` (`triggerConsoPhoto()` / `uploadConsoPhoto()`, ligne ~656-688) — bouton "📸 Ajouter une photo" déjà visible en fiche moto pour les 9 types de consommables.
- `GET /motos/:id/consommables` (jauges, `services/jaugeConsommables.js`) déjà affiché côté garage (`app.html`, lecture seule) et côté client.
- Analyse IA (`services/visionAnalysisService.js`) : stub déterministe assumé, moteur Anthropic Vision réel explicitement non branché ce milestone (commentaire dans le code, pas un oubli — hors scope de ce morceau).

**Découverte critique** : ce flux déjà déployé est actuellement **cassé en prod**. `cloudinaryService.js`
exige `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` (upload signé), des variables **différentes**
de `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_UPLOAD_PRESET` (upload non-signé, câblées la veille pour le
flux réclamation client — voir commit `94d6c1f`). Vérifié sur Railway (noms de variables uniquement,
jamais les valeurs) : `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` sont absentes. Tout appel réel à
`POST /motos/:id/photos-consommables` retombe donc en `503 CLOUDINARY_NOT_CONFIGURED`.

Conséquence : les constantes `CLOUDINARY_CLOUD`/`CLOUDINARY_PRESET`/`uploadToCloudinary()` ajoutées
la veille dans `app.html` sont du code mort pour ce flux — le mécanisme non-signé côté client ne sert
qu'au flux réclamation (déjà testé E2E, fonctionnel), pas aux photos consommables qui passent par le
serveur avec des credentials signés distincts.

Autre écart doctrine/code découvert : le bouton photo apparaît aujourd'hui pour les 9 types de
consommables sans distinction, alors que la doctrine (point 4) réserve le suivi photo+IA aux seuls
`pneu_av`/`pneu_ar`/`chaine` (méthode A) — plaquettes/disques relèvent d'un contrôle mécano manuel
(méthode B, pas photographiable proprement), huile/liquide de frein d'un suivi temps+km sans photo
(méthode C).

Enfin, aucun guide photo SVG n'existe (le "vrai gap restant" identifié par la doctrine elle-même) —
`triggerConsoPhoto()` ouvre aujourd'hui un sélecteur de fichier natif brut, sans guide ni contexte
visuel, et sans utiliser `motos.profil_transmission` (livré la veille, migration 29 pas encore
appliquée en prod à ce jour) pour adapter l'affichage.

## Décisions validées (une par une avec Mehdi, 20/07/2026)

1. **Déblocage Cloudinary signé** : Mehdi pose `CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` sur
   Railway lui-même (dashboard Cloudinary → Railway), avant que ce morceau soit testable de bout en
   bout. Claude Code ne manipule jamais ces valeurs.
2. **Upload garage/mécano** : reste hors scope. `app.html` demeure lecture seule sur les
   consommables — le mécano continue d'utiliser `PATCH /motos/:id/consommables/:type` (saisie
   manuelle km_montage/référence, déjà existant) pendant une intervention. L'upload photo reste une
   action client dans son espace.
3. **Code mort `app.html`** : à retirer (les 3 ajouts de la veille — constantes + fonction — ne
   servent à rien pour ce flux).
4. **Segmentation méthodes A/B/C** : à corriger. Le bouton "Ajouter une photo" ne doit plus
   apparaître que pour `pneu_av`/`pneu_ar`/`chaine`. Les 6 autres types gardent l'affichage jauge
   existant (aucun changement de comportement pour eux, juste la disparition du bouton photo qui
   n'a jamais eu de sens pour ces méthodes).
5. **Fidélité du guide photo** : "croquis illustré + zone de cadrage" (option B validée via le
   compagnon visuel) — cadre de capture explicite en surimpression, repère textuel sur le point
   précis à photographier. Pas un simple pictogramme minimaliste, pas non plus une illustration
   photoréaliste.
6. **Profondeur d'adaptation par `profil_transmission`** : les 3 cas de la doctrine sont couverts
   dans ce morceau (chaîne / courroie / cardan), pas seulement le cas majoritaire chaîne — la colonne
   `motos.profil_transmission` livrée la veille n'a justement été construite que pour ça ; la laisser
   inutilisée reviendrait à livrer la moitié de la fonctionnalité qui l'a motivée.
7. **Photo compteur / ancrage km (doctrine point 6)** : chantier à part, explicitement hors scope
   de ce morceau. Aucune UI pour `POST /motos/:id/km` n'est ajoutée ici.
8. **Double photo chaîne (brin + couronne)** : `jaugeConsommables.js` (Phase 27) ne retient que la
   photo la plus récente par `type_consommable` pour calculer l'état affiché ("latest wins", pas de
   logique de pire-des-deux) — deux uploads réels pour un même type écraseraient silencieusement
   l'un des deux résultats d'analyse. Décision : **une seule photo réelle est uploadée pour la
   chaîne** (couronne, jugée la plus représentative de l'usure). Le guide illustre pédagogiquement
   les deux zones (brin + couronne) mais un seul fichier part au serveur. Entorse légère à la lettre
   de la doctrine ("2 photos"), qui évite de toucher `jaugeConsommables.js` (fichier partagé/testé,
   Phase 27) dans ce morceau.

## Architecture

### Nouvelle modale (`MotoKey_Client.html`)

Un nouveau bloc HTML statique `#consoGuideModalOverlay`, suivant exactement le pattern déjà établi
par `#revokeModalOverlay` (ligne 362) : `display:none` par défaut, `position:fixed;inset:0`,
backdrop semi-transparent, fermeture au clic sur le fond (`onclick="if(event.target===this)..."`),
carte centrée `max-width:460px`. Contenu injecté dynamiquement (le SVG et les textes changent selon
le type/profil).

### Fonction pure de sélection du guide

```js
function getGuidePhoto(typeConsommable, profilTransmission) {
  // → { svg: string, titre: string, sousTitre: string } | null
  // null = pas de guide, pas de bouton photo (cas cardan pour 'chaine')
}
```

Cette fonction ne fait aucun accès réseau/DOM — un dictionnaire statique de guides (pneu, chaîne,
courroie) indexé par type + profil, avec le cas `cardan` retournant `null` pour `type==='chaine'`.

### Flux modifié

`triggerConsoPhoto(motoId, typeConsommable)` (actuellement : ouvre directement un `<input type=file>`)
devient :
1. Résout `profilTransmission` depuis la moto déjà chargée côté client (disponible dans l'état déjà
   présent en mémoire, pas de nouvel appel réseau).
2. Appelle `getGuidePhoto(typeConsommable, profilTransmission)`.
   - Si `null` (cas cardan/chaine) : n'est normalement jamais appelée, car le bouton lui-même est
     absent dans ce cas (voir `jaugeRowClient`, section suivante) — garde-fou défensif seulement.
3. Ouvre `#consoGuideModalOverlay` avec le guide résolu.
4. Le bouton "J'ai compris, prendre la photo" dans la modale ferme la modale et déclenche l'ouverture
   du file input natif — **le reste du flux est strictement inchangé** : `uploadConsoPhoto()`, l'appel
   `POST /motos/:id/photos-consommables`, la gestion des erreurs 503/autres, ne bougent pas.

### Masquage du bouton par méthode (`jaugeRowClient`)

`jaugeRowClient()` (ligne 628) ne génère le bouton "📸 Ajouter une photo" que si
`type_consommable` ∈ `{pneu_av, pneu_ar, chaine}` **et** (si `chaine`) le profil n'est pas `cardan`
(dans ce dernier cas, un texte informatif statique remplace le bouton : "Vidange de pont au
kilométrage prescrit — aucune photo requise pour ce type de transmission.").

### `app.html`

Retrait pur des 3 ajouts de la veille (`CLOUDINARY_CLOUD`, `CLOUDINARY_PRESET`,
`uploadToCloudinary()`) — aucun autre changement. Le côté garage reste lecture seule sur les
consommables.

### Aucune migration DB

Ce morceau ne touche aucune table, aucune colonne. `profil_transmission`/`profil_transmission_source`
existent déjà (migration 29, appliquée ou non en prod — à vérifier avant de tester, sinon le
fallback `chaine`/`auto` s'applique silencieusement de toute façon).

## Fichiers touchés

- **Modify** `MotoKey_Client.html` : nouvelle modale statique, fonction `getGuidePhoto()`, guides
  SVG (pneu, chaîne, courroie) en dictionnaire statique, `triggerConsoPhoto()` modifié,
  `jaugeRowClient()` modifié (masquage conditionnel + cas cardan).
- **Modify** `app.html` : suppression des 3 éléments Cloudinary ajoutés la veille (commit `94d6c1f`).

## Test / vérification

Même méthode que la veille (réclamation) — test réel en prod une fois les clés posées, pas de mock :
1. Compte client test + moto test créés via l'API (comme hier), avec `profil_transmission='chaine'`.
2. Upload réel d'une photo pour `pneu_av` : vérifier guide affiché → upload → `200`/`201` → jauge
   mise à jour.
3. Upload réel d'une photo pour `chaine` (profil chaîne) : vérifier guide 2-zones affiché, 1 seule
   requête réseau observée (pas 2).
4. Vérifier que `plaquettes_av` n'a plus de bouton photo (juste l'affichage jauge existant).
5. Créer une 2e moto test avec `profil_transmission='cardan'` (via
   `PATCH /motos/:id/profil-transmission`) : vérifier que la ligne "chaîne" affiche le texte
   informatif au lieu du bouton.
6. Nettoyage complet des données de test en fin de session (moto + client + garage + comptes Auth),
   comme la veille — ne pas laisser traîner (cf. incident L8 `statiicrazer@gmail.com`).

## Hors scope (explicite)

- Upload photo côté garage/mécano.
- Photo compteur / ancrage km (`POST /motos/:id/km`).
- Vrai moteur IA Vision (le stub `visionAnalysisService.js` reste tel quel).
- Nettoyage du code legacy `pneu_av`/`pneu_ar`/`pneu_km_montage` sur `motos` (déjà noté différé
  dans la migration 25).
