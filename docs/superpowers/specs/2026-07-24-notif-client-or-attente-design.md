# Notification client — ligne OR en attente d'acceptation — Design

## Contexte

Gap identifié le 23/07/2026 (lecture seule, voir mémoire `project_l14_notif_client_gap`) et
confirmé de nouveau le 24/07/2026 : quand `OrTaches.create()` ou `OrPieces.create()` pose
`en_attente_acceptation_client: true` sur une ligne complémentaire (`supabase.js` ~1180-1212 et
~1290-1312), **aucun canal ne prévient le client**. `GET /client/ordres-reparation` remonte bien
le flag dans la réponse, mais rien ne pousse le client à ouvrir l'app pour le découvrir — l'OR
reste bloqué en `attente` silencieusement tant que le client ne se connecte pas spontanément.

Mehdi, après validation navigateur de L14 (badge 🔴/🟢 acceptation) : le devis complémentaire ne
sert à rien en usage réel tant que ce gap n'est pas comblé.

**Découverte faite en explorant ce chantier** : un fichier `notifications.js` existe à la racine
du repo — un module SMS+Email complet (templates `nouvelle_intervention`, `bienvenue`,
`transfert_*`, appels HTTPS directs à Resend/Twilio) — mais il n'est **`require()` nulle part**
dans `motokey-api.js`. Code mort, avec en plus sa propre convention de variables d'env
(`EMAIL_FROM`/`FRONTEND_URL`) différente de celle réellement active
(`RESEND_FROM`/`FRONTEND_CLIENT_URL` dans `services/emailService.js`/`auth/client_auth.js`).
Décision : ignoré, on construit sur le chemin réellement câblé (`services/emailService.js` +
`templates/emails/*.js`, celui qui gère déjà `welcome`).

## Décisions validées (une par une avec Mehdi, 24/07/2026)

1. **Timing** : email immédiat, un envoi par ligne qui bascule `en_attente_acceptation_client`.
   Pas de groupement/debounce si plusieurs lignes sont ajoutées coup sur coup sur le même OR.
2. **Client sans email** (`clients.email` nullable) : skip silencieux + `console.log`, pas
   d'erreur bloquante pour le mécano. Même doctrine que `pushService.js` (skip si pas de token).
3. **Moto sans client** (propriété polymorphe L8 — moto garage/inconnu, `motos.client_id IS
   NULL`) : même traitement, skip silencieux — pas de destinataire.
4. **Contenu email** : notification simple + lien vers le login client existant
   (`FRONTEND_CLIENT_URL`). Pas de lien magique à usage unique pour accepter/refuser directement
   depuis l'email — scope minimal, réutilise le flux L2 "Mes devis" déjà livré et son
   authentification existante.
5. **Pas de deep-link vers l'OR précis** : `MotoKey_Client.html` n'a aujourd'hui aucun support de
   query param pour ouvrir directement un OR. Le lien pointe vers la page de login générale ; le
   client navigue lui-même jusqu'à "Mes devis" une fois connecté. Amélioration future possible,
   explicitement pas dans ce morceau.
6. **Pas de relance automatique** : un seul email au moment de la bascule, pas de cron de relance
   (sur le modèle de `/cron/rappels-photo-consommables`) si le client ne répond pas. YAGNI tant
   que le taux de non-réponse n'est pas mesuré en usage réel.
7. **Chemin RAM fallback non branché** : le mirror dev de `OrTaches.create`/`OrPieces.create`
   dans `motokey-api.js` (~3379/~3470, utilisé si Supabase est injoignable) ne déclenche pas
   l'email. Mode dégradé dev-only, hors priorité ; garde le hook à un seul endroit (`supabase.js`,
   le chemin prod réel).
8. **`EMAIL_ENABLED=false` en prod actuellement** : le code est livrable et sans risque dès
   maintenant — `emailService.send()` bascule automatiquement en mode `console.log` dev tant que
   le flag est `false`. L'activation réelle (`EMAIL_ENABLED=true` + `RESEND_API_KEY` sur Railway)
   est une action opérationnelle séparée de Mehdi, hors scope de ce chantier de code.

## Architecture

### Nouveau template email

`templates/emails/or-ligne-attente.js`, même structure que `templates/emails/welcome.js`
(`subject`/`html`/`text`, mêmes `header`/`footer` de marque). Données attendues :

```js
// data : { client_nom, moto (ex: "Yamaha MT-07"), plaque, or_numero, ligne_libelle, lien }
```

Enregistré dans `TEMPLATES` (`services/emailService.js:34-43`) sous la clé `'or-ligne-attente'`.

### Helper de notification (`supabase.js`)

Nouvelle fonction, colocalisée avec `OrdresReparation` (même zone que
`_revenirEnCoursSiPlusDeLigneEnAttente`) :

```js
// ctx pas requis ici (contrairement aux helpers _*Ram avec historique) —
// pas de log métier, juste un side-effect email.
async function _notifierClientLigneEnAttente(or_id, ligne_libelle) {
  const { data: or } = await supabase.from('ordres_reparation')
    .select('numero, moto_id').eq('id', or_id).single();
  if (!or) return;
  const { data: moto } = await supabase.from('motos')
    .select('marque, modele, plaque, client_id').eq('id', or.moto_id).single();
  if (!moto || !moto.client_id) return; // moto sans client (L8) — rien à notifier
  const { data: client } = await supabase.from('clients')
    .select('nom, email').eq('id', moto.client_id).single();
  if (!client || !client.email) return; // pas d'email — skip silencieux

  emailService.send('or-ligne-attente', client.email, {
    client_nom:   client.nom,
    moto:         `${moto.marque} ${moto.modele}`,
    plaque:       moto.plaque,
    or_numero:    or.numero,
    ligne_libelle,
    lien:         process.env.FRONTEND_CLIENT_URL || '',
  }).catch(e => console.error('❌ [L14bis] Email or-ligne-attente échoué:', e.message));
}
```

Fire-and-forget (pas de `await` bloquant sur la réponse API) — même pattern que l'email
`welcome` existant (`motokey-api.js:2546`). `emailService.send()` n'a elle-même jamais de
`throw` interne, mais le `.catch()` reste une garde défensive explicite au point d'appel.

### Points d'appel

Dans `OrTaches.create()` (`supabase.js:1180`) et `OrPieces.create()` (`supabase.js:~1290`),
juste après l'`insert`, uniquement quand `requiertAcceptation === true` (donc exactement les cas
qui posent déjà `en_attente_acceptation_client: true`) :

```js
if (requiertAcceptation) _notifierClientLigneEnAttente(or_id, payload.libelle);
```

(`payload.libelle` existe identiquement dans les deux payloads — tâches et pièces partagent le
même nom de champ, voir `supabase.js:1199` et `~1301`.)

## Fichiers touchés

- **Create** `templates/emails/or-ligne-attente.js`.
- **Modify** `services/emailService.js` : ajout de l'entrée `'or-ligne-attente'` dans `TEMPLATES`.
- **Modify** `supabase.js` : nouvelle fonction `_notifierClientLigneEnAttente`, appelée depuis
  `OrTaches.create()` et `OrPieces.create()`.

Aucune migration DB — aucune nouvelle colonne/table.

## Test / vérification

Pas de mode `EMAIL_ENABLED=true` disponible en local sans clé Resend réelle — vérification en
mode dev (`console.log`) :
1. Serveur local, `EMAIL_ENABLED=false` (comportement actuel) : ajouter une tâche/pièce
   complémentaire sur un OR `en_cours` via un compte MÉCANO réel → vérifier dans les logs
   serveur le bloc `📧 [7b][DEV] ─── Email "or-ligne-attente" ───` avec les bonnes données
   (nom client, moto, libellé ligne).
2. Cas moto sans client (si un jeu de test polymorphe existe) : vérifier absence de tout log
   email, pas d'exception levée, ligne bien créée quand même.
3. Cas client avec `email IS NULL` : même vérification.
4. Confirmer que la création de ligne répond toujours normalement (statut HTTP, `ordre_reparation`
   dans la réponse) même si le helper échoue — couper temporairement Supabase ou simuler une
   erreur pour vérifier le fire-and-forget ne bloque rien.

## Hors scope (explicite)

- Lien magique d'acceptation/refus sans login depuis l'email.
- Deep-link vers l'OR précis dans `MotoKey_Client.html`.
- Relance automatique (cron) si le client ne répond pas.
- Branchement du chemin RAM fallback (`motokey-api.js`).
- Notification retour vers le garage/mécano quand le client accepte/refuse (symétrique, pas
  demandé).
- Activation réelle de l'envoi (`EMAIL_ENABLED=true` + `RESEND_API_KEY` sur Railway) — action
  opérationnelle de Mehdi, séparée de ce chantier de code.
- Nettoyage/suppression du code mort `notifications.js` — signalé mais pas touché.
