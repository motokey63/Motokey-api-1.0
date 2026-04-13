# Plan de test — Livraison 7b : Auth client endpoints

Variables à définir dans votre shell avant les tests :

```bash
BASE=http://localhost:3000
```

Démarrage local :

```bash
cd C:/motokey-api
JWT_CLIENT_SECRET="dev-secret-longue-chaine-de-test-64chars-xxxxxxxxxxxxxxxxxx" \
AUTH_DEV_RETURN_CODES=true \
EMAIL_ENABLED=false \
node motokey-api.js
```

---

## 1. Sanity check 7a (doit retourner ready_for_7b: true)

```bash
curl -s "$BASE/auth/client/healthz" | jq .
```

Résultat attendu :
```json
{ "data": { "ready_for_7b": true, "jwt_configured": true, "version": "7a" } }
```

---

## 2. Inscription — POST /auth/client/register

### 2a. Succès nominal

```bash
curl -s -X POST "$BASE/auth/client/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test7b@motokey.fr",
    "password": "TestMoto@7b2026!",
    "prenom": "Alice",
    "nom": "Dupont",
    "cgu_accepted": true
  }' | jq .
```

Résultat attendu : `success: true`, et si `AUTH_DEV_RETURN_CODES=true` → `_dev_code` visible.  
Notez le code affiché dans les logs console.

### 2b. Email déjà utilisé → 409

```bash
curl -s -X POST "$BASE/auth/client/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test7b@motokey.fr",
    "password": "TestMoto@7b2026!",
    "prenom": "Alice",
    "nom": "Dupont",
    "cgu_accepted": true
  }' | jq .
```

Résultat attendu : `error.code: "EMAIL_EXISTS"`, HTTP 409.

### 2c. Mot de passe faible → 400

```bash
curl -s -X POST "$BASE/auth/client/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test7b2@motokey.fr",
    "password": "123456",
    "prenom": "Bob",
    "nom": "Martin",
    "cgu_accepted": true
  }' | jq .
```

Résultat attendu : `error.code: "WEAK_PASSWORD"`.

### 2d. CGU non acceptées → 400

```bash
curl -s -X POST "$BASE/auth/client/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test7b3@motokey.fr",
    "password": "TestMoto@7b2026!",
    "prenom": "Carol",
    "nom": "Smith",
    "cgu_accepted": false
  }' | jq .
```

Résultat attendu : `error.code: "CGU_NOT_ACCEPTED"`.

---

## 3. Vérification email — POST /auth/client/verify-email

Récupérez le `_dev_code` retourné à l'étape 2a (ou dans les logs console).

```bash
CODE="XXXXXX"   # remplacer par le code réel

curl -s -X POST "$BASE/auth/client/verify-email" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"test7b@motokey.fr\", \"code\": \"$CODE\"}" | jq .
```

Résultat attendu : `success: true`.

### 3b. Code invalide → 400

```bash
curl -s -X POST "$BASE/auth/client/verify-email" \
  -H "Content-Type: application/json" \
  -d '{"email": "test7b@motokey.fr", "code": "000000"}' | jq .
```

Résultat attendu : `error.code: "INVALID_CODE"`.

---

## 4. Connexion — POST /auth/client/login

### 4a. Email non vérifié (avant étape 3) → 403

```bash
curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test7b@motokey.fr", "password": "TestMoto@7b2026!"}' | jq .
```

Résultat attendu (si email non encore vérifié) : `error.code: "EMAIL_NOT_VERIFIED"`.

### 4b. Succès nominal (après vérification email)

```bash
curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test7b@motokey.fr", "password": "TestMoto@7b2026!"}' | jq .
```

Résultat attendu : `access_token`, `refresh_token`, `token_type: "Bearer"`.  
Notez les deux tokens.

```bash
ACCESS=$(curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test7b@motokey.fr", "password": "TestMoto@7b2026!"}' \
  | jq -r '.data.access_token')

REFRESH=$(curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test7b@motokey.fr", "password": "TestMoto@7b2026!"}' \
  | jq -r '.data.refresh_token')
```

### 4c. Mauvais mot de passe → 401

```bash
curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test7b@motokey.fr", "password": "WrongPassword1!"}' | jq .
```

Résultat attendu : `error.code: "INVALID_CREDENTIALS"`.

### 4d. Lockout après 5 échecs (répéter 4c 5 fois)

Après 5 tentatives échouées :
```json
{ "error": { "code": "ACCOUNT_LOCKED" } }
```

### 4e. Cookie web — POST /auth/client/login avec X-Client-Type: web

```bash
curl -sv -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: web" \
  -d '{"email": "test7b@motokey.fr", "password": "TestMoto@7b2026!"}' 2>&1 \
  | grep -i 'set-cookie\|refresh_token'
```

Résultat attendu : `Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict`.

---

## 5. Rotation refresh — POST /auth/client/refresh

```bash
REFRESH="<valeur du refresh_token de l'étape 4b>"

curl -s -X POST "$BASE/auth/client/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\": \"$REFRESH\"}" | jq .
```

Résultat attendu : nouveaux `access_token` et `refresh_token`.

### 5b. Réutilisation du même refresh → détection de vol → 401

Réutiliser le MÊME token que ci-dessus (déjà tourné) :
```bash
curl -s -X POST "$BASE/auth/client/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\": \"$REFRESH\"}" | jq .
```

Résultat attendu : `error.code: "INVALID_REFRESH_TOKEN"`, message "Session compromise détectée".

---

## 6. Déconnexion — POST /auth/client/logout

```bash
NEW_REFRESH="<nouveau refresh_token de l'étape 5>"

curl -s -X POST "$BASE/auth/client/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\": \"$NEW_REFRESH\"}" | jq .
```

Résultat attendu : `success: true`, `"Déconnecté avec succès"`.

Vérifier que le refresh est bien révoqué en tentant un refresh :
```bash
curl -s -X POST "$BASE/auth/client/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\": \"$NEW_REFRESH\"}" | jq .
```

Résultat attendu : 401, session invalide.

---

## 7. Réinitialisation mot de passe — POST /auth/client/password-reset

### 7a. Demande

```bash
curl -s -X POST "$BASE/auth/client/password-reset" \
  -H "Content-Type: application/json" \
  -d '{"email": "test7b@motokey.fr"}' | jq .
```

Résultat attendu : `success: true`, message "Si votre adresse est enregistrée..."  
Avec `AUTH_DEV_RETURN_CODES=true` → `_dev_code` visible.

### 7b. Email inexistant (même réponse — anti-énumération)

```bash
curl -s -X POST "$BASE/auth/client/password-reset" \
  -H "Content-Type: application/json" \
  -d '{"email": "inexistant@nowhere.com"}' | jq .
```

Résultat attendu : identique à 7a (pas de 404, pas de "email non trouvé").

---

## 8. Confirmation reset — POST /auth/client/password-reset/confirm

```bash
RESET_CODE="XXXXXX"   # code récupéré à l'étape 7a

curl -s -X POST "$BASE/auth/client/password-reset/confirm" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"test7b@motokey.fr\",
    \"code\": \"$RESET_CODE\",
    \"new_password\": \"NouveauMdp@2026!\"
  }" | jq .
```

Résultat attendu : `success: true`, `"Mot de passe mis à jour — reconnectez-vous"`.

Vérifier que l'ancien mot de passe est rejeté :
```bash
curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test7b@motokey.fr", "password": "TestMoto@7b2026!"}' | jq .
```

Résultat attendu : 401 `INVALID_CREDENTIALS`.

Vérifier que le nouveau fonctionne :
```bash
curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test7b@motokey.fr", "password": "NouveauMdp@2026!"}' | jq .
```

Résultat attendu : tokens valides.

---

## 9. Route protégée (bonus — test du 7a inchangé)

```bash
ACCESS="<access_token>"

curl -s "$BASE/client/ping" \
  -H "Authorization: Bearer $ACCESS" | jq .
```

Résultat attendu : `{ "pong": true, "user": "test7b@motokey.fr" }`.

---

## Variables Railway à ajouter

| Variable               | Valeur                        | Obligatoire |
|------------------------|-------------------------------|-------------|
| `EMAIL_ENABLED`        | `false` (dev) / `true` (prod) | oui         |
| `RESEND_API_KEY`       | clé depuis resend.com         | si EMAIL_ENABLED=true |
| `RESEND_FROM`          | `MotoKey <noreply@motokey.fr>`| si EMAIL_ENABLED=true |
| `JWT_REFRESH_SECRET`   | idem JWT_CLIENT_SECRET        | recommandé  |
| `AUTH_DEV_RETURN_CODES`| `true` (dev) / `false` (prod) | oui         |
