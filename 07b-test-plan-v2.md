# Plan de test — Livraison 7b v2 : Auth Supabase natif

## Prérequis Supabase Dashboard

1. **Authentication > Providers** : Email activé, "Confirm email" = ON  
2. **Authentication > Email Templates** : Template OTP = 6 chiffres (type `signup`)  
3. **Authentication > SMTP** : Resend configuré (host smtp.resend.com, port 465, user resend)  
4. **SQL Editor** : exécuter `migrations/07b-pivot-migration.sql` (garage_id nullable)  
5. Variable Railway `APP_URL` = URL de votre frontend (ex: `https://motokey.app`)  

```bash
BASE=http://localhost:3000
```

Démarrage local (sans EMAIL_ENABLED ni AUTH_DEV_RETURN_CODES — plus utilisés) :

```bash
cd C:/motokey-api
SUPABASE_URL="https://xxxx.supabase.co" \
SUPABASE_SECRET_KEY="sbsec_..." \
SUPABASE_PUBLISHABLE_KEY="sbpub_..." \
APP_URL="http://localhost:3000" \
node motokey-api.js
```

---

## 1. Sanity check

```bash
curl -s "$BASE/auth/client/healthz" | jq .
```

Attendu : `{ "ready_for_7b": true, "jwt_configured": true }`.

---

## 2. Inscription — POST /auth/client/register

### 2a. Succès nominal

```bash
curl -s -X POST "$BASE/auth/client/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr","password":"TestMoto@7b2026!","nom":"Dupont Alice"}' | jq .
```

Attendu : `success: true`, HTTP 201, message "Si ce compte est valide…"  
→ Supabase envoie automatiquement l'OTP de vérification par email.

### 2b. Email déjà pris — même réponse 201 (anti-énumération)

```bash
curl -s -X POST "$BASE/auth/client/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr","password":"TestMoto@7b2026!","nom":"Autre"}' | jq .
```

Attendu : réponse **identique** à 2a — pas de 409, pas d'indication que l'email est pris.

### 2c. Champs manquants → 400

```bash
curl -s -X POST "$BASE/auth/client/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr","password":"TestMoto@7b2026!"}' | jq .
```

Attendu : `error.code: "MISSING_FIELDS"` (nom manquant).

---

## 3. Vérification email — POST /auth/client/verify-email

Récupérez le code OTP 6 chiffres reçu par email (ou depuis Supabase Dashboard > Logs > Auth).

```bash
OTP="123456"   # remplacer par le code réel

curl -s -X POST "$BASE/auth/client/verify-email" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test7b@motokey.fr\",\"token\":\"$OTP\"}" | jq .
```

Attendu : `success: true`, `session` renseignée (access_token + refresh_token Supabase).

### 3b. Code invalide → 400

```bash
curl -s -X POST "$BASE/auth/client/verify-email" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr","token":"000000"}' | jq .
```

Attendu : `error.code: "INVALID_OTP"`.

---

## 4. Connexion — POST /auth/client/login

```bash
curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr","password":"TestMoto@7b2026!"}' | jq .
```

Attendu : `success: true`, `data.session.access_token` et `data.session.refresh_token` présents.

```bash
# Stocker les tokens pour la suite
ACCESS=$(curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr","password":"TestMoto@7b2026!"}' \
  | jq -r '.data.session.access_token')

REFRESH=$(curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr","password":"TestMoto@7b2026!"}' \
  | jq -r '.data.session.refresh_token')
```

### 4b. Mauvais mot de passe → 401

```bash
curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr","password":"WrongPassword1!"}' | jq .
```

Attendu : `error.code: "INVALID_CREDENTIALS"`.

### 4c. Cookie web — X-Client-Type: web

```bash
curl -sv -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: web" \
  -d '{"email":"test7b@motokey.fr","password":"TestMoto@7b2026!"}' 2>&1 \
  | grep -i 'set-cookie\|refresh_token'
```

Attendu : `Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict`.

---

## 5. Rotation refresh — POST /auth/client/refresh

```bash
REFRESH="<valeur du refresh_token>"

curl -s -X POST "$BASE/auth/client/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}" | jq .
```

Attendu : nouvelle `data.session` avec nouveaux access_token et refresh_token.

### 5b. Refresh expiré → 401

```bash
curl -s -X POST "$BASE/auth/client/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"invalid-token"}' | jq .
```

Attendu : `error.code: "INVALID_REFRESH_TOKEN"`.

---

## 6. Déconnexion — POST /auth/client/logout

```bash
ACCESS="<access_token>"

curl -s -X POST "$BASE/auth/client/logout" \
  -H "Authorization: Bearer $ACCESS" | jq .
```

Attendu : `success: true`, `"Déconnecté avec succès"`.

Vérifier que le token est bien révoqué :

```bash
curl -s "$BASE/client/ping" \
  -H "Authorization: Bearer $ACCESS" | jq .
```

Attendu : 401 (token révoqué côté GoTrue).

---

## 7. Reset mot de passe — POST /auth/client/password-reset

```bash
curl -s -X POST "$BASE/auth/client/password-reset" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr"}' | jq .
```

Attendu : `success: true`, message "Si ce compte existe…"  
→ Supabase envoie un lien de reset vers `APP_URL/reset-password#access_token=...`

### 7b. Email inexistant — même réponse 200 (anti-énumération)

```bash
curl -s -X POST "$BASE/auth/client/password-reset" \
  -H "Content-Type: application/json" \
  -d '{"email":"fantome@nowhere.com"}' | jq .
```

Attendu : réponse identique à 7a — pas de 404.

---

## 8. Confirmation reset — POST /auth/client/password-reset/confirm

Récupérez l'`access_token` depuis le fragment d'URL du lien reçu par email
(`APP_URL/reset-password#access_token=XXX&...`).

```bash
RECOVERY_TOKEN="<access_token extrait du lien>"

curl -s -X POST "$BASE/auth/client/password-reset/confirm" \
  -H "Content-Type: application/json" \
  -d "{\"access_token\":\"$RECOVERY_TOKEN\",\"new_password\":\"NouveauMdp@2026!\"}" | jq .
```

Attendu : `success: true`, `"Mot de passe mis à jour — reconnectez-vous"`.

Vérifier que l'ancien mot de passe est rejeté :

```bash
curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr","password":"TestMoto@7b2026!"}' | jq .
```

Attendu : 401.

Vérifier que le nouveau fonctionne :

```bash
curl -s -X POST "$BASE/auth/client/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test7b@motokey.fr","password":"NouveauMdp@2026!"}' | jq .
```

Attendu : session valide.

---

## Variables Railway — état post-pivot

| Variable                  | Valeur                          | Statut       |
|---------------------------|---------------------------------|--------------|
| `SUPABASE_URL`            | https://xxxx.supabase.co        | déjà présent |
| `SUPABASE_SECRET_KEY`     | sbsec_...                       | déjà présent |
| `SUPABASE_PUBLISHABLE_KEY`| sbpub_... (ou SUPABASE_ANON_KEY)| déjà présent |
| `APP_URL`                 | URL frontend pour redirectTo    | **à ajouter**|
| `EMAIL_ENABLED`           | false (SMTP géré par Supabase)  | conserver    |
| `RESEND_API_KEY`          | (configurer dans Supabase SMTP) | optionnel API|
| `RESEND_FROM`             | MotoKey <noreply@motokey.fr>    | conserver    |
| ~~`JWT_REFRESH_SECRET`~~  | _supprimé (plus utilisé)_       | **retirer**  |
| ~~`AUTH_DEV_RETURN_CODES`~~| _supprimé (plus utilisé)_      | **retirer**  |

> **Note** : le SMTP Resend doit être configuré dans **Supabase Dashboard > Auth > SMTP Settings**,
> pas via l'API Railway. La clé `RESEND_API_KEY` dans Railway n'est plus nécessaire pour l'auth.
