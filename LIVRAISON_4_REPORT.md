# Livraison 4 — RBAC + distinction pro/particulier

**Validé en production** : 2026-04-15

## Commits clés

| Hash | Description |
|------|-------------|
| `c66ad69` | Migration SQL client_type + colonnes pro/particulier, seed test users script |
| `33a03fc` | Middleware RBAC + helpers `requireRole` / `requireAnyRole` — extraction rôle depuis JWT Supabase |
| `200d572` | RBAC sur endpoints 7b — role CLIENT auto-assigné au register |
| `8e39578` | Phase 4 RBAC complet sur motos, interventions, devis, entretien |
| `b3785eb` | Durcissement RLS sur 4 tables critiques (clients, motos, interventions, garages) |
| _(ce commit)_ | Rapport final Livraison 4 |

---

## Décisions archi

- **Rôles dans `auth.users.app_metadata.role`** (Supabase Auth) — lecture via `auth.jwt() ->> 'role'` côté SQL, via `ctx.role` côté Node.
- **5 rôles plats avec niveaux numériques** :
  - `ADMIN` (5) > `CONCESSION` (4) > `PRO` (3) > `MECANO` (2) > `CLIENT` (1)
  - `requireRole(ctx, 'PRO')` = niveau ≥ 3, soit PRO, CONCESSION, ADMIN.
- **Comptes séparés garage vs client** — contrainte légale TVA FR : un compte garage ne peut pas être aussi client du même garage.
- **Pattern dual-auth** : chaque handler accepte le vieux JWT HS256 garage (header `Authorization`) OU le JWT Supabase (`req.ctx` posé par le middleware). Aucun breaking change pour l'app legacy.
- **`inferLegacyRole`** : fallback pour comptes garage sans `app_metadata.role` — requête Supabase sur `garages.auth_user_id` pour déduire le rôle `CONCESSION`.
- **`getGarageIdForUser(ctx, SBLayer)`** : résout le `garage_id` à partir du `user_id` Supabase pour les comptes garage n'ayant pas de `a.id` (vieux JWT).
- **`stripFinancialFields(list, ctx)`** : supprime `montant_ht` et champs financiers des interventions retournées aux MECANO.
- **Distinction `client_type`** : `particulier` / `pro` avec champs SIRET + TVA intracom pour les professionnels. Colonnes ajoutées en Phase 4 migration SQL.
- **CLIENT voit le garage qui l'a enregistré** : règle 3b — `garages_select` RLS autorise le CLIENT à lire la ligne garage liée à son `clients.garage_id`.

---

## Endpoints protégés (Phase 4)

### Motos

| Méthode | Route | Règle RBAC |
|---------|-------|------------|
| `GET` | `/motos` | CLIENT → ses propres motos ; MECANO+ → toutes les motos du garage |
| `POST` | `/motos` | PRO minimum (CLIENT et MECANO rejetés) |
| `GET` | `/motos/:id` | CLIENT → sa propre moto uniquement ; MECANO+ → moto du garage |
| `PUT` | `/motos/:id` | PRO minimum |
| `DELETE` | `/motos/:id` | CONCESSION minimum |
| `GET` | `/motos/:id/score` | PRO minimum — outil garage uniquement |

### Interventions

| Méthode | Route | Règle RBAC |
|---------|-------|------------|
| `GET` | `/motos/:id/interventions` | CLIENT → interventions de sa propre moto ; MECANO+ → interventions du garage (champs financiers masqués pour MECANO) |
| `POST` | `/motos/:id/interventions` | MECANO minimum ; `type=vert` réservé CONCESSION+ |
| `PUT` | `/motos/:id/interventions/:iid` | PRO minimum |
| `DELETE` | `/motos/:id/interventions/:iid` | PRO minimum |

### Entretien constructeur

| Méthode | Route | Règle RBAC |
|---------|-------|------------|
| `GET` | `/motos/:id/entretien` | MECANO minimum — outil garage |
| `GET` | `/motos/:id/entretien/alertes` | MECANO minimum — outil garage |

### Devis & facturation

| Méthode | Route | Règle RBAC |
|---------|-------|------------|
| `GET` | `/devis` | MECANO rejeté (403) ; CLIENT → ses propres devis via ses motos ; PRO+ → tous les devis du garage |
| `POST` | `/devis` | PRO minimum |
| `GET` | `/devis/:id` | PRO minimum |
| `PUT` | `/devis/:id` | PRO minimum |
| `POST` | `/devis/:id/valider` | PRO minimum |
| `POST` | `/devis/:id/pdf` | PRO minimum |

### Endpoints 7b — Auth client (Supabase Auth natif)

| Méthode | Route | Règle RBAC |
|---------|-------|------------|
| `GET` | `/auth/client/healthz` | Public — status technique |
| `GET` | `/auth/client/config` | Public — règles mot de passe |
| `GET` | `/auth/client/test-ratelimit` | Public — test rate limiter (5 req / 15 min) |
| `GET` | `/client/ping` | JWT client valide requis |
| `POST` | `/auth/client/register` | Public — crée compte Supabase Auth + ligne `clients` ; role CLIENT auto-assigné dans `app_metadata` |
| `POST` | `/auth/client/verify-email` | Public — vérifie OTP email (Supabase `verifyOtp`) |
| `POST` | `/auth/client/login` | Public — auth via Supabase `signInWithPassword` |
| `POST` | `/auth/client/refresh` | Tous rôles — refresh token (cookie HttpOnly ou body) |
| `POST` | `/auth/client/logout` | Tous rôles authentifiés — révocation session Supabase |
| `POST` | `/auth/client/password-reset` | Public — anti-énumération, même réponse si email inconnu |
| `POST` | `/auth/client/password-reset/confirm` | Public — accepte flux OTP (email + code) ou flux lien (access_token) |

---

## Compte legacy

`garage@motokey.fr` a `role=CONCESSION` assigné manuellement dans `app_metadata` (Supabase Dashboard). Pour tous les autres comptes garage legacy sans `app_metadata.role`, `inferLegacyRole` prend le relais en détectant la présence d'une ligne dans `garages.auth_user_id`.

---

## RLS Supabase (Phase 5)

Migration : `migrations/04-rls-harden.sql`

**4 tables durcies** : `garages`, `clients`, `motos`, `interventions`

**Helpers SQL** (définis dans la migration) :
- `current_user_garage_id()` — `SECURITY DEFINER`, retourne le `garage.id` du user connecté
- `current_user_client_id()` — `SECURITY DEFINER`, retourne le `client.id` du user connecté
- `current_user_role()` — lit `auth.jwt() ->> 'role'` sans aller en base

**Note** : sans impact pratique tant que le backend Node utilise `service_role` pour toutes ses queries (bypass RLS automatique). Ces policies constituent une ceinture de sécurité pour les appels directs à Supabase depuis un futur front client.

**Tables NON durcies — TODO RBAC phase 2** :
`devis`, `factures`, `ordres_reparation`, `or_taches`, `or_pieces`, `catalogue_pieces`, `plans_constructeur`, `factures_scannees`, `pneus`, `photos`

---

## TODOs reportés

1. **Phase 5 bis** — Durcir RLS sur les 10 tables restantes listées ci-dessus
2. **SMTP fail silencieux** : `/auth/client/register` retourne 201 même si Supabase échoue à envoyer l'OTP (anti-énumération voulu). Logger en `WARN` côté serveur pour visibilité opérationnelle.
3. **`/auth/client/login`** — Auditer pour timing attack et unifier les messages d'erreur (actuellement potentiellement discriminants)
4. **Lockout Supabase** — Vérifier dans Dashboard que le lockout après N tentatives est activé
5. **OTP 8 chiffres au lieu de 6** — Cosmétique, configurable dans Supabase Auth settings
6. **Doublon env Railway** : `SUPABASE_SERVICE_KEY` (JWT HS256) + `SUPABASE_SECRET_KEY` (`sb_secret_*`) — à nettoyer et unifier
7. **`storage.js:40`** — Sans fallback double sur `SUPABASE_SECRET_KEY`, risque si variable absente
8. **`sbRequest()`** — Sans timeout HTTP configuré, risque de hang sur appels Supabase lents
9. **Unifier auth garage legacy → Supabase Auth** — Faire migrer les comptes garage HS256 vers des comptes Supabase Auth natifs (livraison dédiée)
10. **Brancher 7b au front** — Connecter `MotoKey_App.html` à l'écran d'inscription client (7b endpoints)

---

## Prochaines priorités suggérées

- Tests réels en garage (saisie de vraies motos + interventions en prod)
- Livraison 5 : migration des comptes garage legacy vers Supabase Auth natif
- Livraison 5 bis : durcissement RLS sur les tables secondaires (TODO n°1 ci-dessus)
- Branchement du front client sur les endpoints 7b (TODO n°10)
