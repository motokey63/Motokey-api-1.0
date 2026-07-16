# Phase 25: Endpoints Backend (km, photos, remplacement compteur, Cloudinary) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary
**Areas discussed:** Architecture upload Cloudinary, Saisie consommables (CONSO-01), Photo consommable sans fiche existante

---

## Areas presented but not selected

| Area | Description | Selected for discussion |
|------|-------------|--------------------------|
| Architecture upload Cloudinary | Backend reçoit le fichier vs client upload direct | ✓ |
| Remplacement compteur — motif et photo | Texte libre vs enum de motifs, photo obligatoire ou non | ✗ (skipped by user) |
| Saisie consommables (CONSO-01) | Un type à la fois vs bulk 9 types | ✓ |
| Photo consommable sans fiche existante | Photo orpheline vs auto-création de la ligne consommable | ✓ |

---

## Architecture upload Cloudinary

### Q1: Comment la photo arrive-t-elle sur Cloudinary ?

| Option | Description | Selected |
|--------|-------------|----------|
| Backend-médié | Client envoie fichier brut multipart, backend upload via SDK Node, secret côté serveur, testable sans UI cette phase | ✓ |
| Frontend-direct | Client upload direct via preset unsigned (pattern existant MotoKey_Client.html), backend reçoit juste photo_url | |
| Les deux endpoints acceptent les deux | Flexibilité max, complexité de validation double | |

**User's choice:** Backend-médié (recommandé)
**Notes:** Justifié par le fait que Phase 25 n'a aucune UI et que le succès criteria #5 du ROADMAP doit être vérifiable cette phase même, pas différé à Phase 27.

### Q2: Cloudinary est-il un flag optionnel avec fallback, ou obligatoire ?

| Option | Description | Selected |
|--------|-------------|----------|
| Obligatoire, pas de fallback | CLOUD-01 dit "plus aucun placeholder" — erreur explicite si mal configuré | ✓ |
| Flag CLOUDINARY_ENABLED avec fallback | Même convention que EMAIL/PUSH/VISION | |

**User's choice:** Obligatoire, pas de fallback (recommandé)

### Q3: Limites sur le fichier photo uploadé ?

| Option | Description | Selected |
|--------|-------------|----------|
| 5 Mo max, JPEG/PNG/WebP | Limites raisonnables, protège contre abus avant Cloudinary | ✓ |
| Laisser Cloudinary gérer, pas de limite backend | Moins de code, risque bande passante | |
| Vous décidez | Laisse Claude choisir en planification | |

**User's choice:** 5 Mo max, JPEG/PNG/WebP (recommandé)

---

## Saisie consommables (CONSO-01)

### Q1: Un type à la fois ou bulk (9 types en une fois) ?

| Option | Description | Selected |
|--------|-------------|----------|
| Un type à la fois (PATCH unitaire) | Cohérent avec usage courant (1 pièce remplacée à la fois) | |
| Bulk (les 9 en une requête) | Adapté à un setup initial complet | |
| Les deux endpoints existent | PATCH unitaire + PUT bulk, tous deux appellent Consommables.upsert() en dessous | ✓ |

**User's choice:** Les deux endpoints existent
**Notes:** Aucune duplication de logique métier — les deux appellent le même helper `Consommables.upsert()`.

---

## Photo consommable sans fiche existante

### Q1: Que fait l'endpoint si consommable_id n'existe pas encore pour ce type ?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-crée la ligne consommable | Consommables.upsert() avec km_montage:null avant de lier la photo — jauges Phase 27/28 ont toujours une ligne | ✓ |
| Photo orpheline (consommable_id NULL) | Schéma le permet déjà, mais risque de photos "perdues" | |

**User's choice:** Auto-crée la ligne consommable (recommandé)

---

## Claude's Discretion

- Noms exacts des routes HTTP
- Variables d'environnement Cloudinary exactes (séparées vs CLOUDINARY_URL unique)
- Détails de l'endpoint remplacement compteur (KM-02) — motif texte libre vs enum, non discuté cette session
- Détails de l'endpoint relevé km normal (KM-03) — rôle-gating dual CLIENT/GARAGE selon pattern existant
- Détail exact du multipart handling (multer memoryStorage vs diskStorage)
- Synchronisme du retour d'analyse vision à l'upload photo

## Deferred Ideas

- Remplacement compteur (KM-02) — mécanique exacte du motif/note et de la photo — l'utilisateur a choisi de ne pas approfondir cette zone cette session ; contraintes DB déjà connues documentées dans CONTEXT.md.
