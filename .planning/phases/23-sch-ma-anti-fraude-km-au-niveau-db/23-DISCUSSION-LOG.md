# Phase 23: Schéma + Anti-Fraude km au niveau DB - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 23-sch-ma-anti-fraude-km-au-niveau-db
**Areas discussed:** RLS approach, Consommables type extensibility, Counter-replacement signature meaning, Rejection log content

---

## RLS pour les 3 nouvelles tables

| Option | Description | Selected |
|--------|-------------|----------|
| Service-role-only, RLS activé sans policy | Même pattern que garage_users/client_device_tokens/push_send_log et les tables Gap B (v1.5) — autorisation réelle 100% dans motokey-api.js, RLS = filet default-deny documenté | ✓ |
| Vraies policies granulaires | CREATE POLICY joignant via moto_id (miroir motos_client_read) — garantie DB-level pour la perte d'accès de l'ancien propriétaire après cession | |

**User's choice:** Service-role-only, RLS activé sans policy (option recommandée)
**Notes:** Décision cohérente avec le pattern déjà établi pour les tables Gap B de v1.5 (Pitfall 4 de PITFALLS.md). Doit être documentée explicitement en commentaire dans la migration pour éviter de répéter la dérive qui a coûté 3 phases entières en v1.5.

---

## Mécanisme d'extensibilité pour les types de consommables (CONSO-02)

| Option | Description | Selected |
|--------|-------------|----------|
| TEXT + CHECK constraint | Même pattern que niveau_preuve existant, 9 types en dur — ajout futur = migration légère | ✓ |
| Table de référence types_consommables | Table séparée (id/label/actif) — ajout futur = simple INSERT, zéro migration | |

**User's choice:** TEXT + CHECK constraint (option recommandée)
**Notes:** Cohérent avec le pattern existant `interventions.niveau_preuve`. La table de référence reste une option notée pour un futur milestone si le besoin de vraie extensibilité runtime se confirme.

---

## Que signifie « signé garage » pour un changement de compteur (KM-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Métadonnées d'audit | garage_id + utilisateur PRO+ + timestamp + note obligatoire | ✓ |
| Signature hash cryptographique | Même mécanisme que interventions.signature_hash existant | |

**User's choice:** Métadonnées d'audit (option recommandée)
**Notes:** Le pattern `signature_hash` existe dans le code (`interventions`) mais n'a pas été jugé nécessaire ici — traçabilité par métadonnées jugée suffisante.

---

## Log de rejet km (KM-01) — contenu minimal

| Option | Description | Selected |
|--------|-------------|----------|
| Complet | moto_id, garage_id, acteur identifié, km tenté, km actuel, timestamp | ✓ |
| Minimal | moto_id, km tenté, km actuel, timestamp — sans identifier l'acteur | |

**User's choice:** Complet (option recommandée)
**Notes:** Objectif explicite : permettre de repérer un pattern de tentatives répétées (signal de fraude), pas juste compter les échecs.

---

## Claude's Discretion

- Nom exact du trigger PL/pgSQL et de la fonction de validation partagée
- Forme exacte de la table de rejet (nommage précis des colonnes, tant que le contenu D-04 est respecté)
- Représentation du bypass `remplacement_compteur` (colonne enum vs table d'événements séparée)
- Découpage exact des fichiers de migration (23/24/25/26 séparés vs groupés)

## Deferred Ideas

- Table de référence `types_consommables` (extensibilité runtime sans déploiement)
- Policies RLS granulaires via moto_id (si un accès direct Supabase SDK côté client apparaît un jour)
- Signature cryptographique (`signature_hash`) sur le changement de compteur
- Migration/retrait des colonnes `pneu_av`/`pneu_ar`/`pneu_km_montage` legacy — assigné à Phase 27 (CONSO-04), pas cette phase
