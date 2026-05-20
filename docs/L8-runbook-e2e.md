# L8 — Runbook E2E · Liaison polymorphe

Branche : `feat/L8-liaison-polymorphe`  
Prérequis : migration SQL 13 appliquée en prod via Supabase Dashboard.

```
BASE=https://motokey11-production.up.railway.app
```

---

## 0. Authentification

### 0-A — Compte garage PRO (ou CONCESSION)

```bash
GARAGE=$(curl -s -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"GARAGE_EMAIL","password":"GARAGE_PASS","role":"garage"}')

TOK_G=$(echo $GARAGE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token garage : $TOK_G"
```

### 0-B — Compte client existant (ou créer via l'UI)

```bash
CLIENT=$(curl -s -X POST $BASE/auth/client/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"CLIENT_EMAIL","password":"CLIENT_PASS"}')

TOK_C=$(echo $CLIENT | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo "Token client : $TOK_C"
```

> Si aucun compte client n'existe, s'inscrire via `POST /auth/client/register`
> avec `{"nom":"Test Client","email":"...","password":"..."}`.

---

## Flux A — Stock garage → Vendre → Client voit la moto

### A1. Créer une moto en stock garage

```bash
MOTO=$(curl -s -X POST $BASE/motos \
  -H "Authorization: Bearer $TOK_G" \
  -H 'Content-Type: application/json' \
  -d '{
    "marque":"Honda","modele":"CB500F","plaque":"AA-001-BB","vin":"JH2PC3503CM000001",
    "annee":2021,"km":8000,"proprietaire_type":"garage"
  }')
echo $MOTO
MOTO_ID=$(echo $MOTO | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Moto ID : $MOTO_ID"
```

**Attendu :** `success:true`, `data.moto.proprietaire_type === "garage"`.

### A2. Vérifier que la moto apparaît en stock garage

```bash
curl -s "$BASE/motos/$MOTO_ID" \
  -H "Authorization: Bearer $TOK_G" | grep -o '"proprietaire_type":"[^"]*"'
```

**Attendu :** `"proprietaire_type":"garage"`.

### A3. Vendre la moto au client

```bash
VENTE=$(curl -s -X POST "$BASE/motos/$MOTO_ID/vendre" \
  -H "Authorization: Bearer $TOK_G" \
  -H 'Content-Type: application/json' \
  -d '{
    "client_email":"CLIENT_EMAIL",
    "client_nom":"Test Client",
    "client_tel":"0612345678",
    "mode_acquisition":"achat_occasion"
  }')
echo $VENTE
```

**Attendu :** `success:true`, `data.moto.proprietaire_type === "client"`,
`data.client.email === "CLIENT_EMAIL"`.

### A4. Client voit la moto dans son espace

```bash
curl -s $BASE/motos \
  -H "Authorization: Bearer $TOK_C"
```

**Attendu :** la moto `$MOTO_ID` apparaît dans la liste avec `proprietaire_type:"client"`.

### A5. (UI) Fiche moto garage — Bouton Vendre doit avoir disparu

Naviguer dans l'UI garage vers la fiche de la moto vendue.
Le bouton "Vendre cette moto" ne doit plus apparaître (type n'est plus `garage`).

---

## Flux B — Client réclame moto orpheline → Garage accepte

### B1. Créer une moto orpheline (type inconnu ou sans client)

```bash
ORPHAN=$(curl -s -X POST $BASE/motos \
  -H "Authorization: Bearer $TOK_G" \
  -H 'Content-Type: application/json' \
  -d '{
    "marque":"Yamaha","modele":"MT-07","plaque":"YY-002-ZZ","vin":"JYARJ18E67A000002",
    "annee":2019,"km":22000,"proprietaire_type":"inconnu"
  }')
ORPHAN_ID=$(echo $ORPHAN | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Moto orpheline ID : $ORPHAN_ID"
```

### B2. Client soumet une réclamation

```bash
CLAIM=$(curl -s -X POST $BASE/client/reclamations \
  -H "Authorization: Bearer $TOK_C" \
  -H 'Content-Type: application/json' \
  -d '{
    "vin_fourni":"JYARJ18E67A000002",
    "plaque_fournie":"YY-002-ZZ",
    "carte_grise_photo_url":"pending_manual_verification"
  }')
echo $CLAIM
CLAIM_ID=$(echo $CLAIM | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Réclamation ID : $CLAIM_ID"
```

**Attendu :** `success:true`, `data.reclamation.statut === "en_attente"`.

### B3. Garage consulte ses réclamations en attente

```bash
curl -s $BASE/garage/reclamations \
  -H "Authorization: Bearer $TOK_G"
```

**Attendu :** `data.reclamations` contient l'entrée avec `motos.plaque:"YY-002-ZZ"`
et `clients.email:"CLIENT_EMAIL"`.

### B4. Garage accepte la réclamation

```bash
curl -s -X PATCH "$BASE/garage/reclamations/$CLAIM_ID" \
  -H "Authorization: Bearer $TOK_G" \
  -H 'Content-Type: application/json' \
  -d '{"statut":"accepte"}'
```

**Attendu :** `success:true`, `data.reclamation.statut === "accepte"`.

### B5. Vérifier la cession

```bash
curl -s "$BASE/motos/$ORPHAN_ID" \
  -H "Authorization: Bearer $TOK_G" | grep -o '"proprietaire_type":"[^"]*"'
```

**Attendu :** `"proprietaire_type":"client"`.

### B6. (UI) Badge réclamations doit passer à 0 dans la nav garage

Recharger l'UI garage. Le badge rouge sur "Réclamations" doit disparaître.

---

## Flux C — Client quitte un garage → Lecture seule + badge

### C1. Vérifier les liaisons actuelles du client

```bash
curl -s $BASE/client/garages \
  -H "Authorization: Bearer $TOK_C"
```

Noter l'ID de liaison (`data.garages[0].id`) avec un garage actif.

```bash
LIAISON_ID=<ID_LIAISON_ICI>
GARAGE_NOM=<NOM_GARAGE_ICI>
```

### C2. Client quitte le garage (DELETE avec body)

```bash
curl -s -X DELETE "$BASE/client/garages/$LIAISON_ID" \
  -H "Authorization: Bearer $TOK_C" \
  -H 'Content-Type: application/json' \
  -d '{"motif":"Test E2E — départ volontaire"}'
```

**Attendu :** `success:true`, message contenant "obligations légales",
`data.liaison.statut === "revoque_par_client"`.

### C3. Confirmer la révocation

```bash
curl -s $BASE/client/garages \
  -H "Authorization: Bearer $TOK_C"
```

**Attendu :** liaison visible avec `statut:"revoque_par_client"`.

### C4. (UI garage) Badge "A quitté" dans section Clients

Naviguer vers nav Clients dans l'UI garage.
La ligne du client doit porter le badge gris "A quitté".

### C5. Vérifier l'idempotence (double révocation = 409)

```bash
curl -s -X DELETE "$BASE/client/garages/$LIAISON_ID" \
  -H "Authorization: Bearer $TOK_C" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

**Attendu :** `success:false`, `error.code === "ALREADY_REVOKED"`, HTTP 409.

---

## Runbook incertitudes — 4 points à valider

### I1 — `proprietaire_type` dans `GET /motos`

Vérifie que le `*` dans `Motos.list` inclut bien la colonne après migration 13.

```bash
curl -s $BASE/motos \
  -H "Authorization: Bearer $TOK_G" | grep -o '"proprietaire_type":"[^"]*"'
```

**Pass :** au moins une entrée retourne `"proprietaire_type":"..."`.  
**Fail :** champ absent → la colonne n'est pas encore dans la table `motos`
(migration 13 incomplète ou non appliquée).

Si fail : vérifier dans Supabase Dashboard que la colonne existe :
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'motos' AND column_name = 'proprietaire_type';
```

### I2 — Selects imbriqués Supabase (reclamations → motos → clients)

```bash
curl -s $BASE/garage/reclamations \
  -H "Authorization: Bearer $TOK_G"
```

Inspecter manuellement la réponse JSON et vérifier la structure :

```
data.reclamations[0].motos.marque      ← doit être une string
data.reclamations[0].motos.modele      ← doit être une string
data.reclamations[0].motos.plaque      ← doit être une string
data.reclamations[0].clients.nom       ← doit être une string
data.reclamations[0].clients.email     ← doit être une string
```

**Pass :** les champs imbriqués sont des scalaires (Supabase renvoie l'objet directement).  
**Fail :** les champs sont `null` ou l'objet est un tableau → la relation FK est
mal nommée côté Supabase (table `clients` vs alias). Corriger le select en ajoutant
l'alias explicite : `.select('*, motos!inner(id, plaque, marque, modele), clients!client_id(nom, email, tel)')`.

### I3 — DELETE avec body (`/client/garages/:id`)

Le backend lit le body via `await body(req)`. Certains proxies/CDN suppriment le body
des requêtes DELETE. Tester directement :

```bash
# Avec body explicite
curl -sv -X DELETE "$BASE/client/garages/$LIAISON_ID" \
  -H "Authorization: Bearer $TOK_C" \
  -H 'Content-Type: application/json' \
  -d '{"motif":"test DELETE body"}'
```

Inspecter la réponse et vérifier :
```
data.liaison.motif_revocation === "test DELETE body"
```

**Pass :** le motif est bien persisté en base.  
**Fail :** `motif_revocation` est `null` malgré le body → Railway/Express strip le body DELETE.
Correction : déplacer le motif en query param `?motif=...` et lire `req.query.motif`
côté backend (changement backend mineur, hors scope Task 4).

### I4 — Race condition badge réclamations

Vérifie que `loadReclamBadge()` est rappelé après chaque action accept/refuse.

Scénario :
1. Ouvrir section Réclamations garage → badge = N (ex: 1)
2. Cliquer Accepter sur la réclamation
3. **Sans recharger la page**, observer le badge dans la nav

**Pass :** badge repasse à 0 immédiatement après l'action (car `repondreReclamation()`
appelle `loadReclamBadge()` puis `loadReclamations()` en séquence).  
**Fail :** badge reste à 1 → `loadReclamBadge()` s'est exécuté avant que la PATCH
ne soit committée en base → ajouter un `await` ou introduire un délai de 300ms.

Correction si fail :
```javascript
// Dans repondreReclamation(), remplacer :
loadReclamBadge(); loadReclamations();
// Par :
await loadReclamations();
loadReclamBadge();
```

---

## Checklist de merge

- [ ] Migration SQL 13 appliquée en prod
- [ ] Flux A complet (stock → vente → client voit la moto)
- [ ] Flux B complet (claim → accept → cession)
- [ ] Flux C complet (quitter → 409 idempotence → badge A quitté)
- [ ] I1 : `proprietaire_type` visible dans GET /motos
- [ ] I2 : selects imbriqués retournent les scalaires attendus
- [ ] I3 : DELETE body persisté (`motif_revocation` non null)
- [ ] I4 : badge passe à 0 sans reload page après accept/refuse
- [ ] Relecture diff par Mehdi
- [ ] `git push origin master` (Railway auto-deploy)
