# Phase 12: Backend Push Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 12-backend-push-foundation
**Areas discussed:** Multi-appareils, Réattribution de token, Sémantique DELETE, Contenu GET /client/me

---

## Multi-appareils

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-appareils (table 1-à-N) | Table `client_device_tokens` avec plusieurs lignes possibles par `client_id`, contrainte unique sur le token. Standard push mobile, pas de surcoût pour Phase 13. | ✓ |
| Un seul token actif (écrasement) | Colonne unique par client_id. Plus simple mais limite réelle pour usage multi-appareils. | |

**User's choice:** Multi-appareils (table 1-à-N)
**Notes:** —

---

## Réattribution de token

| Option | Description | Selected |
|--------|-------------|----------|
| Bascule vers B (upsert) | Upsert sur la colonne token : la ligne change de client_id. Reflète la réalité physique d'un appareil réutilisé/revendu. | ✓ |
| Rejet (409 Conflict) | L'appel échoue si le token appartient déjà à un autre client. Oblige un DELETE explicite avant réenregistrement. | |

**User's choice:** Bascule vers B (upsert)
**Notes:** —

---

## Sémantique DELETE

| Option | Description | Selected |
|--------|-------------|----------|
| Token précis (body requis) | Cohérent avec le multi-appareils : seul le token fourni est retiré. | ✓ |
| Tous les tokens du client | Un DELETE déconnecte tous les appareils — illogique avec le choix multi-appareils. | |

**User's choice:** Token précis (body requis)
**Notes:** —

---

## Contenu GET /client/me

| Option | Description | Selected |
|--------|-------------|----------|
| Profil + garage lié (recommandé) | id, nom, prenom, email, telephone, garage_id + nom du garage lié, date de création. | ✓ |
| Profil minimal | id, nom, prenom, email uniquement. | |
| Profil + compteurs | Comme recommandé, plus nb_motos et nb_devis_en_attente — coût de 2 requêtes DB supplémentaires. | |

**User's choice:** Profil + garage lié (recommandé)
**Notes:** nb_motos / nb_devis_en_attente noté en Deferred Ideas.

---

## Claude's Discretion

- Nommage exact de la table/colonnes (`client_device_tokens` vs `device_tokens`, `platform`, `last_used_at`) — suivre les conventions existantes dans `sql/migrations/`.
- Stockage optionnel de la plateforme (ios/android) et de la version d'app sur la ligne token.

## Deferred Ideas

- Compteurs `nb_motos` / `nb_devis_en_attente` sur `GET /client/me` — reporté pour garder l'endpoint léger à une seule requête.
