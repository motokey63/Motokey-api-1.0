# Notification client — ligne OR en attente d'acceptation — Design

> ⚠️ **Prérequis bloquant à vérifier avant implémentation** (fait par Mehdi, hors Claude Code) :
> Resend doit être opérationnel en production pour des destinataires **externes**. En mode
> sandbox, seuls les envois vers l'adresse du propriétaire du compte Resend aboutissent — tant que
> ce n'est pas confirmé, cette livraison serait du code sans effet réel en prod. À vérifier :
> expéditeur configuré, domaine vérifié, un envoi réel testé vers une adresse externe.

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

1. **Anti-spam par OR** (amendement review 24/07/2026, remplace le "un email par ligne" initial) :
   un seul email par OR tant que le client n'a pas répondu. Jordan démonte, trouve 3 choses,
   ajoute 3 lignes en 2 minutes — 3 emails séparés feraient croire au client, après en avoir ouvert
   et accepté un seul, qu'il a tout traité.
   - Nouvelle colonne `ordres_reparation.derniere_notif_attente_envoyee_at` (même principe que
     `dernier_palier_calendaire_envoye_at`, migration 31).
   - Première ligne qui bascule `en_attente_acceptation_client` sur un OR dont le timestamp est
     `NULL` → un seul email listant **toutes** les lignes actuellement en attente sur cet OR (pas
     seulement celle qui vient de basculer), puis le timestamp est posé à `now()`.
   - Toute ligne supplémentaire ajoutée tant que le timestamp est non-`NULL` et qu'aucune
     acceptation n'a eu lieu depuis → **aucun nouvel email**.
   - Le compteur se réarme (`derniere_notif_attente_envoyee_at` remis à `NULL`) dès qu'une ligne
     est acceptée côté client (`POST /or-taches/:id/accepter` ou `/or-pieces/:id/accepter`), pour
     que le prochain lot de travaux supplémentaires redéclenche bien un envoi.
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
   est une action opérationnelle séparée de Mehdi, hors scope de ce chantier de code — voir aussi
   l'encart prérequis en tête de spec.
9. **Skip non silencieux côté atelier** (amendement review) : le skip serveur (client sans email,
   moto sans client) reste silencieux côté logs mais doit être **visible sur l'écran de travail**
   `MotoKey_Atelier.html`. Sans ça, Jordan attend un accord qui n'arrivera jamais et la moto reste
   immobilisée sans cause visible. Le besoin : afficher un état du type « client non notifiable —
   préviens-le directement » quand une ligne est en attente d'acceptation mais qu'aucun email n'a
   pu partir. **Mécanisme exact non tranché ici** — deux options possibles à départager au plan
   d'implémentation : (a) un champ retourné par l'API OR/lignes indiquant l'état de notification,
   ou (b) une lecture d'état côté client à partir de données déjà présentes sur l'OR/la moto (ex:
   absence d'email connue côté front). Voir aussi décision 10 (fail-open), qui remonte par le même
   canal visuel.
10. **Fail-open tracé sur échec d'envoi** (amendement review) : si Resend renvoie une erreur, la
    ligne bascule **quand même** en `en_attente_acceptation_client` — l'obligation légale porte sur
    l'accord du client, pas sur la réussite de l'email. Aucun `throw` ne doit faire échouer la
    création de ligne (ou le passage en attente). Doctrine identique à `anthropicVisionClient` :
    jamais de `throw`, on retourne un résultat. L'échec d'envoi remonte par le même canal visuel
    que la décision 9 — pas un canal séparé.

## Architecture

### Nouveau template email

`templates/emails/or-ligne-attente.js`, même structure que `templates/emails/welcome.js`
(`subject`/`html`/`text`, mêmes `header`/`footer` de marque). Données attendues :

```js
// data : { client_nom, moto (ex: "Yamaha MT-07"), plaque, or_numero, lignes, lien }
// lignes : string[] — libellés de TOUTES les lignes actuellement en_attente_acceptation_client
// sur cet OR (tâches + pièces), pas seulement celle qui a déclenché l'envoi (voir décision 1).
```

Enregistré dans `TEMPLATES` (`services/emailService.js:34-43`) sous la clé `'or-ligne-attente'`.

### Helper de notification (`supabase.js`)

Nouvelle fonction, colocalisée avec `OrdresReparation` (même zone que
`_revenirEnCoursSiPlusDeLigneEnAttente`). Portée sur l'OR entier, pas sur une ligne — c'est elle
qui applique l'anti-spam (décision 1) :

```js
// ctx pas requis ici (contrairement aux helpers _*Ram avec historique) —
// pas de log métier, juste un side-effect email. Ne jamais throw (décision 10, fail-open) :
// le côté serveur doit retourner un résultat/état, jamais lever d'exception.
async function _notifierClientAttenteOR(or_id) {
  const { data: or } = await supabase.from('ordres_reparation')
    .select('numero, moto_id, derniere_notif_attente_envoyee_at').eq('id', or_id).single();
  if (!or || or.derniere_notif_attente_envoyee_at) return; // déjà notifié — anti-spam (décision 1)

  const { data: moto } = await supabase.from('motos')
    .select('marque, modele, plaque, client_id').eq('id', or.moto_id).single();
  if (!moto || !moto.client_id) return _marquerNonNotifiable(or_id, 'moto_sans_client');

  const { data: client } = await supabase.from('clients')
    .select('nom, email').eq('id', moto.client_id).single();
  if (!client || !client.email) return _marquerNonNotifiable(or_id, 'client_sans_email');

  // Toutes les lignes actuellement en attente sur cet OR, pas seulement celle qui déclenche.
  const [{ data: taches }, { data: pieces }] = await Promise.all([
    supabase.from('or_taches').select('libelle').eq('or_id', or_id).eq('en_attente_acceptation_client', true),
    supabase.from('or_pieces').select('libelle').eq('or_id', or_id).eq('en_attente_acceptation_client', true),
  ]);
  const lignes = [...(taches || []), ...(pieces || [])].map(l => l.libelle);
  if (!lignes.length) return; // garde défensive, ne devrait pas arriver ici

  const result = await emailService.send('or-ligne-attente', client.email, {
    client_nom: client.nom, moto: `${moto.marque} ${moto.modele}`, plaque: moto.plaque,
    or_numero: or.numero, lignes, lien: process.env.FRONTEND_CLIENT_URL || '',
  }).catch(e => ({ error: e.message })); // jamais de throw — décision 10

  if (result && result.error) return _marquerNonNotifiable(or_id, 'echec_envoi', result.error);

  await supabase.from('ordres_reparation')
    .update({ derniere_notif_attente_envoyee_at: new Date().toISOString() }).eq('id', or_id);
}
```

`_marquerNonNotifiable(or_id, raison, detail?)` : couvre le besoin décrit en décision 9 —
l'implémentation exacte (champ API vs état dérivé côté front) est tranchée au plan
d'implémentation, pas ici. Les trois raisons possibles (`moto_sans_client`, `client_sans_email`,
`echec_envoi`) doivent toutes remonter par le même canal visuel sur l'écran atelier.

Fire-and-forget au point d'appel (pas de `await` bloquant sur la réponse API de création de
ligne) — même esprit que l'email `welcome` existant (`motokey-api.js:2546`), mais ici la fonction
elle-même ne relance jamais (décision 10 : `emailService.send()` n'a jamais de `throw` interne, et
le `.catch()` transforme toute erreur réseau/API en résultat `{ error }` plutôt qu'en exception).

### Points d'appel

**Création de ligne** — `OrTaches.create()` (`supabase.js:1180`) et `OrPieces.create()`
(`supabase.js:~1290`), juste après l'`insert`, uniquement quand `requiertAcceptation === true`
(donc exactement les cas qui posent déjà `en_attente_acceptation_client: true`) :

```js
if (requiertAcceptation) _notifierClientAttenteOR(or_id);
```

L'appelant ne passe plus le libellé de la ligne — c'est `_notifierClientAttenteOR` qui relit
toutes les lignes en attente au moment de l'envoi (décision 1), donc `or_id` seul suffit.

**Acceptation de ligne** (réarmement du compteur, décision 1) — `OrTaches.accepterLigne()`
(`supabase.js:1218`) et `OrPieces.accepterLigne()` (`supabase.js:~1315`), après la mise à jour de
la ligne acceptée :

```js
await supabase.from('ordres_reparation')
  .update({ derniere_notif_attente_envoyee_at: null }).eq('id', existing.or_id);
```

## Fichiers touchés

- **Create** `templates/emails/or-ligne-attente.js`.
- **Modify** `services/emailService.js` : ajout de l'entrée `'or-ligne-attente'` dans `TEMPLATES`.
- **Modify** `supabase.js` : nouvelle fonction `_notifierClientAttenteOR` (+ `_marquerNonNotifiable`,
  détail au plan), appelée depuis `OrTaches.create()`/`OrPieces.create()` ; réarmement du compteur
  ajouté dans `OrTaches.accepterLigne()` et `OrPieces.accepterLigne()`.
- **Create** une nouvelle migration SQL (numéro à réserver au plan d'implémentation, suite de la
  série existante) : `ALTER TABLE ordres_reparation ADD COLUMN derniere_notif_attente_envoyee_at
  TIMESTAMPTZ` — même principe que `dernier_palier_calendaire_envoye_at` (migration 31).
- **Modify** `MotoKey_Atelier.html` : affichage de l'état « client non notifiable » (décision 9) —
  mécanisme exact (champ API vs état dérivé) à trancher au plan d'implémentation.

Cette livraison **touche une migration DB**, à la différence de la version initiale du spec.

## Test / vérification

Pas de mode `EMAIL_ENABLED=true` disponible en local sans clé Resend réelle — vérification en
mode dev (`console.log`), plus le prérequis Resend (encart en tête de spec) côté Mehdi :
1. Serveur local, `EMAIL_ENABLED=false` (comportement actuel) : ajouter une tâche/pièce
   complémentaire sur un OR `en_cours` via un compte MÉCANO réel → vérifier dans les logs serveur
   le bloc `📧 [7b][DEV] ─── Email "or-ligne-attente" ───`, avec la liste complète des lignes en
   attente (pas juste la dernière).
2. **Anti-spam** : ajouter 3 lignes coup sur coup sur le même OR → un seul email part (le
   premier), les 2 suivantes ne redéclenchent rien. Vérifier `derniere_notif_attente_envoyee_at`
   posé après le 1er envoi.
3. **Réarmement** : accepter une des lignes (`POST /or-taches/:id/accepter` ou équivalent pièces)
   → `derniere_notif_attente_envoyee_at` repasse à `NULL`. Ajouter une 4e ligne → un nouvel email
   part.
4. Cas moto sans client (si un jeu de test polymorphe existe) : pas d'exception levée, ligne bien
   créée quand même, état « non notifiable » visible sur l'écran atelier (mécanisme à tester une
   fois tranché au plan).
5. Cas client avec `email IS NULL` : même vérification que 4.
6. **Fail-open** : simuler un échec Resend (ex: couper le réseau ou clé invalide en mode
   `EMAIL_ENABLED=true` de test) → la ligne bascule quand même en `en_attente_acceptation_client`,
   la création répond normalement (pas de 500), état « non notifiable » visible côté atelier.

## Hors scope (explicite)

- Lien magique d'acceptation/refus sans login depuis l'email.
- Deep-link vers l'OR précis dans `MotoKey_Client.html`.
- Relance automatique (cron) si le client ne répond pas.
- Branchement du chemin RAM fallback (`motokey-api.js`).
- Notification retour vers le garage/mécano quand le client accepte/refuse (symétrique, pas
  demandé).
- Activation réelle de l'envoi (`EMAIL_ENABLED=true` + `RESEND_API_KEY` sur Railway) — action
  opérationnelle de Mehdi, séparée de ce chantier de code.
- Nettoyage/suppression du code mort `notifications.js` — signalé mais pas touché (voir section
  « Dette technique » ci-dessous).

## Dette technique

**`notifications.js` est du code mort.** Découvert pendant la rédaction de ce spec (24/07/2026) :
le fichier définit un module SMS+Email complet (templates `nouvelle_intervention`, `bienvenue`,
`transfert_*`, `alerte_entretien`, appels HTTPS directs à Resend/Twilio, sa propre config
`EMAIL_FROM`/`FRONTEND_URL`) mais **n'est `require()` nulle part** dans `motokey-api.js` ni
ailleurs dans le repo. Aucun chemin d'envoi de cette livraison — ni d'aucune livraison actuellement
en prod — ne passe par ce fichier. Écrit ici noir sur blanc pour qu'une relecture future ne
suppose pas à tort qu'il est actif ou qu'il faut le maintenir en synchro avec
`services/emailService.js`/`services/pushService.js` (les modules réellement câblés). Décision :
laissé intact dans cette livraison, sans suppression ni fusion — un nettoyage éventuel est un
chantier séparé, à ne pas faire retomber sur ce spec.
