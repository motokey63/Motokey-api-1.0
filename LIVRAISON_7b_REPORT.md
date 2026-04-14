# Livraison 7b — Auth client Supabase natif

**Validé en production** : 14 avril 2026

## Commits clés
- `9ba2966` — pivot vers Supabase Auth natif (archivage code maison bcrypt)
- `894c41e` — fix deadlock stream sur les 6 handlers /auth/client/*

## Architecture
Auth client 100% Supabase Auth natif. Les clients s'inscrivent via 
`supabase.auth.signUp`, Supabase gère bcrypt/OTP/reset/refresh, 
SMTP via Resend branché côté Dashboard Supabase.

## Endpoints
- ✅ POST /auth/client/register (201 + email OTP)
- ✅ POST /auth/client/verify-email (200 + session JWT)
- ✅ POST /auth/client/login (200 + session)
- ⏸️ POST /auth/client/refresh (non testé — plomberie identique)
- ⏸️ POST /auth/client/logout (non testé)
- ⏸️ POST /auth/client/password-reset (non testé)
- ⏸️ POST /auth/client/password-reset/confirm (non testé)

## Configs déployées
- Migration SQL : clients.garage_id nullable
- Supabase : SMTP Resend + Confirm email ON + templates OTP
- Railway : APP_URL ajouté, JWT_REFRESH_SECRET et AUTH_DEV_RETURN_CODES supprimés

## TODOs identifiés (à traiter plus tard)
1. storage.js:40 lit uniquement SUPABASE_SERVICE_KEY sans fallback 
   — patcher avec double fallback comme supabase.js
2. sbRequest() sans timeout — risque de hang si Supabase lent, 
   ajouter AbortController 10s
3. OTP à 8 chiffres au lieu de 6 (choisi à l'origine) — cosmétique, 
   Supabase Dashboard > Auth > Providers > Email > OTP Length
4. Dual auth sur clients (auth_user_id legacy + 7b) — cohabitation 
   assumée, à consolider plus tard
5. Hook Python dans Claude Code (warning PreToolUse) — à désactiver 
   dans settings
6. Endpoints 7b restants à tester : refresh, logout, password-reset
7. Doublon Railway SUPABASE_SERVICE_KEY (JWT) + SUPABASE_SECRET_KEY 
   (sb_secret_*) — deux valeurs réelles, nettoyage à pré
