# Livraison 7b — Rapport de validation complet

**Session de validation** : 14 avril 2026  
**Dernier commit** : 894c41e

## Commits clés
- `9ba2966` — pivot vers Supabase Auth natif (archivage code maison bcrypt)
- `894c41e` — fix deadlock stream sur les 6 handlers /auth/client/*

## Architecture
Auth client 100% Supabase Auth natif. Backend wrapper léger autour
de supabase.auth.{signUp, verifyOtp, signInWithPassword,
refreshSession, signOut, resetPasswordForEmail, updateUser}.
SMTP via Resend branché côté Dashboard Supabase. OTP 8 chiffres
(config Supabase Dashboard > Auth > Providers > Email > OTP Length).

## Endpoints validés en production

| Endpoint | Status | Détails |
|---|---|---|
| POST /auth/client/register | ✅ 201 | signUp OK, OTP envoyé via Resend |
| POST /auth/client/verify-email | ✅ 200 | email_confirmed_at renseigné, session JWT ES256 émise |
| POST /auth/client/login | ✅ 200 | session valide, last_sign_in_at mis à jour |
| POST /auth/client/refresh | ✅ 200 | rotation AT ✅, rotation RT ✅, cookie web HttpOnly/Secure/SameSite=Strict ✅ |
| POST /auth/client/logout | ✅ 200 | "Déconnecté avec succès", révocation effective ✅ |
| POST /auth/client/password-reset | ✅ 200 | anti-enum OK (même message email valide/invalide) |
| POST /auth/client/password-reset/confirm | ⏸️ non testé | en attente token de recovery (email Mehdi) |

## Audit sécurité rapide

- **Timing attack login** : ⚠️ faille détectée — 141ms de différence moyenne
  (email valide + mauvais mdp : ~222ms vs email inconnu : ~81ms).
  Cause : Supabase effectue la comparaison bcrypt pour les emails existants
  et court-circuite pour les emails inconnus. Correction possible via
  un délai artificiel côté wrapper (ex. `await sleep(200)` avant toute
  réponse 401 sur /login). À traiter en TODO.

- **Lockout après X tentatives** : ⚠️ aucun blocage observé après 7 tentatives
  consécutives avec mauvais password. Supabase Auth dispose d'une protection
  native mais elle ne s'est pas déclenchée sur ce projet — vérifier dans
  Supabase Dashboard > Auth > Rate Limiting. À auditer.

- **Message login unifié** : ✅ OK (anti-enum) — "Email ou mot de passe
  incorrect" identique qu'il s'agisse d'un email valide ou inconnu. Statut
  401 identique dans les deux cas.

## Bugs trouvés et corrigés pendant cette session

1. **Deadlock stream ReadableStream** (`894c41e`) — les 6 handlers
   /auth/client/* rappelaient `body(req)` sur un stream déjà consommé
   par le dispatcher principal (ligne 440). La Promise ne se résolvait
   jamais → hang infini sur tous les endpoints POST 7b. Fix : suppression
   des 6 `const b = await body(req)` redondants.

## TODOs / dettes techniques identifiées cette session

1. **Timing attack /login** — ajouter un délai minimal constant (~200ms)
   avant toute réponse 401 sur /auth/client/login pour neutraliser
   la différence bcrypt/court-circuit
2. **Lockout Supabase** — vérifier et activer Rate Limiting dans Supabase
   Dashboard > Auth > Rate Limiting (brute force protection)
3. **password-reset/confirm** — à tester dès réception du token de
   recovery par email (reprise Tâche 7)
4. **OTP 8 chiffres** — à ajuster en 6 dans Supabase Dashboard si
   souhaité (cosmétique)

## TODOs hérités des sessions précédentes (non traités ici)

1. `storage.js:40` lit uniquement `SUPABASE_SERVICE_KEY` sans fallback
   — patcher avec double fallback comme `supabase.js`
2. `sbRequest()` sans timeout — risque de hang si Supabase lent,
   ajouter `AbortController` 10s
3. Dual auth sur clients (`auth_user_id` legacy + 7b) — cohabitation
   assumée, à consolider plus tard
4. Hook Python dans Claude Code (warning PreToolUse) — à désactiver
   dans settings
5. Doublon Railway `SUPABASE_SERVICE_KEY` (JWT) + `SUPABASE_SECRET_KEY`
   (sb_secret_*) — deux valeurs réelles, nettoyage à prévoir

## Prochaines priorités suggérées

Pour la prochaine session, choisir entre :
- **Tâche 7** (password-reset/confirm) — à compléter dès token disponible
- **Livraison 4 — RBAC** — remplacer les `// TODO RBAC` par des checks
  de rôle réels (garage vs client)
- **Brancher 7b au front** — écran inscription/login client dans
  MotoKey_App.html
- **Fix timing attack** — délai constant sur /login (30min de travail)
- **Déployer L3a** — Ordres de Réparation

## Reprise pour la prochaine session

Lire ce fichier, puis :
1. Si email de reset reçu : fournir le token et reprendre à Tâche 7
2. Sinon : choisir dans les priorités ci-dessus
