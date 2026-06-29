# Go-Live Production — Enforcement quotas (BILL-05) + vérification NOTIF-04

Document opérationnel autosuffisant. Suivre les sections dans l'ordre. Aucune modification de code requise.

---

## NOTIF-04 — Email bienvenue trial : VÉRIFIÉ COUVERT

**Constat (D-01) :** La fonction `handleCheckoutCompleted()` dans `services/stripeService.js` (lignes 107-118) envoie déjà l'email de bienvenue au moment de l'activation du trial via l'événement `checkout.session.completed` :

```js
emailService.send('billing-confirm', toEmail, {
  nom:                  session.customer_details?.name || 'Garage',
  plan:                 planData.label || planKey,
  trial_end_formatted:  trialEnd,
  app_url:              process.env.FRONTEND_URL || 'https://motokey11-production.up.railway.app',
}).catch(e => console.error('[webhook] Email billing-confirm échoué :', e.message));
```

**Contenu du template `templates/emails/billing-confirm.js` :** "Votre essai gratuit **[plan]** est maintenant actif. Vous disposez de **14 jours** pour explorer toutes les fonctionnalités de MotoKey." — couvre exactement le requirement NOTIF-04 (email de bienvenue à l'activation du trial).

**Décision D-02 :** Aucun nouveau template `trial-welcome` n'a été créé. Le template existant `billing-confirm` reste inchangé.

**Conclusion : NOTIF-04 marqué FAIT sans nouveau code.** Requirement réalisé par la livraison v1.1 (L9 Stripe Billing).

---

## Pré-requis avant le flip

Vérifier que les variables d'environnement suivantes sont actives sur le service Railway `motokey1.1` :

| Variable | État attendu | Notes |
|---|---|---|
| `EMAIL_ENABLED` | `true` | Confirmé actif en prod (STATE.md 2026-06-29) |
| `RESEND_API_KEY` | Configuré | Confirmé actif en prod (welcome email opérationnel) |
| `STRIPE_SECRET_KEY` | Configuré | Mode test actif — voir note ci-dessous |
| `STRIPE_WEBHOOK_SECRET` | Configuré | Webhook actif |

**Note Stripe live mode (Phase 8 PARKED) :** La prod est actuellement en Stripe test mode (Phase 8 en attente d'opération humaine). L'enforcement BILLING_ENFORCE est techniquement indépendant du mode Stripe — il agit sur les limites déjà stockées dans la table `garages` (champ `motos_limit`). Le flip peut être effectué en test mode et restera valide après bascule en live mode. Si la décision est de différer à Phase 8 : documenter explicitement et passer au rollback.

---

## Étape 1 — Vérification de l'état des garages (D-07)

Avant d'activer le flag, vérifier que l'état actuel des garages est cohérent. Ouvrir **Supabase Dashboard → SQL Editor** et exécuter :

```sql
SELECT id, nom, plan_code, subscription_status, motos_limit
FROM garages
ORDER BY created_at;
```

**Critère de sûreté (D-07) :** Pour chaque garage avec `motos_limit` non-null, confirmer que :
- `subscription_status` est `active`, `grace`, ou `blocked` (pas `null` si des motos existent au-delà de la limite).
- Le nombre réel de motos du garage est inférieur ou égal à `motos_limit`.

Pour vérifier le nombre de motos par garage (à exécuter si des doutes sur un garage spécifique) :

```sql
SELECT g.id, g.nom, g.plan_code, g.motos_limit, g.subscription_status,
       COUNT(m.id) AS motos_actuelles
FROM garages g
LEFT JOIN motos m ON m.garage_id = g.id
GROUP BY g.id, g.nom, g.plan_code, g.motos_limit, g.subscription_status
ORDER BY g.created_at;
```

**Résultat attendu :** Aucun garage actif n'a `motos_actuelles > motos_limit` avec `motos_limit` non-null.

> Si un garage est à sa limite ou au-delà : ne pas flipper avant d'avoir résolu l'incohérence (contacter le garage, ajuster `motos_limit` ou `subscription_status` manuellement, ou exclure ce garage du scope initial).

---

## Étape 2 — Cas plan_code = null / motos_limit = null (D-08)

**Comportement garanti par le code `auth/planLimits.js` :**

```js
async function assertMotosLimit(garageId, SBLayer) {
  if (process.env.BILLING_ENFORCE !== 'true') return;  // flag off → aucune contrainte
  if (!SBLayer) return;

  const g = await SBLayer.Garages.getById(garageId);
  if (g.motos_limit === null || g.motos_limit === undefined) return; // illimité (Concession)
  // ...
}
```

- Un garage avec `motos_limit = null` (plan Concession, ou garage sans plan) ne sera **jamais** bloqué par l'enforcement — l'early return s'exécute avant toute vérification.
- Idem pour `assertUsersLimit` avec `users_limit = null`.
- **Comportement attendu et sûr par conception.** Un garage sans plan souscrit (`plan_code = null`) a `motos_limit = null` → traitement illimité jusqu'à souscription.

**Valeurs de limites par plan (source : `services/stripeService.js` → `PLANS`) :**

| plan_code | Nom | motos_limit | users_limit |
|---|---|---|---|
| `solo` | MotoKey Solo | 50 | 2 |
| `atelier` | MotoKey Atelier | 200 | 5 |
| `concession` | MotoKey Concession | null (illimité) | null (illimité) |
| null (sans plan) | — | null (illimité) | null (illimité) |

---

## Étape 3 — Activation du flag (D-09)

**Le flip est une opération Railway env var UNIQUEMENT. Aucun changement de code, aucun redéploiement manuel requis.**

`BILLING_ENFORCE` est relu à chaque requête via `process.env.BILLING_ENFORCE === 'true'` — pas de cache applicatif. L'effet est immédiat après que Railway a appliqué la variable et redéployé le service.

**Option A — Railway CLI :**

```bash
railway variables --set BILLING_ENFORCE=true
```

(Depuis un terminal avec `railway` installé et session active pour le project `741e21a3`, service `motokey1.1`.)

**Option B — Railway Dashboard :**

1. Ouvrir https://railway.app/project/741e21a3
2. Sélectionner le service `motokey1.1`
3. Aller dans l'onglet **Variables**
4. Ajouter ou modifier : `BILLING_ENFORCE` = `true`
5. Railway redéploie automatiquement

**Attendre la fin du redéploiement** (Railway affiche le statut dans l'onglet Deployments) avant de procéder au test.

---

## Étape 4 — Test du HTTP 402 (BILL-05 success criteria)

### Test A — Garage à sa limite de motos (PLAN_LIMIT_MOTOS)

1. Choisir un garage de test au plan **Solo** (`motos_limit = 50`).
2. Créer des motos jusqu'à atteindre exactement `motos_limit` (vérifier avec la query SQL Étape 1).
3. Tenter de créer une moto supplémentaire :

```bash
curl -s -X POST https://motokey11-production.up.railway.app/motos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_DU_GARAGE>" \
  -d '{"immatriculation":"TEST-402","marque":"Test","modele":"Quota","annee":2024}'
```

**Réponse attendue :** HTTP 402 avec body JSON :

```json
{
  "error": "Limite du plan atteinte : 50/50 motos. Passez à un plan supérieur pour en ajouter davantage.",
  "code": "PLAN_LIMIT_MOTOS"
}
```

### Test B — Garage avec abonnement suspendu (blocked)

1. Choisir un garage de test avec `subscription_status = 'blocked'` (ou mettre à jour manuellement via SQL pour le test).
2. Tenter `POST /motos` avec ce garage.

**Réponse attendue :** HTTP 402 avec body JSON :

```json
{
  "error": "Abonnement suspendu — réactivez votre abonnement pour ajouter des motos.",
  "code": "PLAN_LIMIT_MOTOS"
}
```

### Test C — Garage Concession (motos_limit null, doit rester illimité)

1. Choisir un garage avec `plan_code = 'concession'` (`motos_limit = null`).
2. Tenter `POST /motos` (même si proche ou au-delà d'une hypothétique limite).

**Réponse attendue :** HTTP 200 ou 201 — la moto est créée sans erreur 402.

---

## Rollback

En cas de blocage inattendu de garages légitimes après activation :

**Option A — Railway CLI :**

```bash
railway variables --set BILLING_ENFORCE=false
```

**Option B — Railway Dashboard :**

1. Ouvrir https://railway.app/project/741e21a3 → service `motokey1.1` → Variables
2. Modifier `BILLING_ENFORCE` = `false`

**Effet :** Après redéploiement Railway, `assertMotosLimit` et `assertUsersLimit` retournent immédiatement sans vérification (early return sur `process.env.BILLING_ENFORCE !== 'true'`). Tous les garages peuvent à nouveau créer des motos sans restriction. **Aucun changement de code requis.**

---

*Document créé : 2026-06-29 — Phase 10-live-operations plan 10-02*
*Références : auth/planLimits.js, services/stripeService.js, templates/emails/billing-confirm.js*
*Décisions : D-01 (NOTIF-04 couvert), D-02 (pas de nouveau template), D-07 (query vérif), D-08 (null illimité), D-09 (flip Railway)*
