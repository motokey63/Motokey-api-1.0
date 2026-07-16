# Phase 25: Endpoints Backend (km, photos, remplacement compteur, Cloudinary) - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Les garages et clients peuvent soumettre des relevés km et des photos de consommables via l'API HTTP ; le mécano peut saisir les données de montage des 9 types de consommables ; l'upload de photo (compteur ou consommable) stocke réellement l'image sur Cloudinary et renvoie une URL exploitable. Cette phase construit la couche endpoints HTTP + rôle-gating par-dessus les helpers `supabase.js` déjà créés en Phase 23/24 (`RelevesKm.enregistrer()`, `Consommables.upsert()`, `PhotosConsommables.insert()`) et le service `visionAnalysisService.analyzePhoto()`. Aucune UI dans cette phase (Phase 27/28).

</domain>

<decisions>
## Implementation Decisions

### Architecture upload Cloudinary
- **D-01:** Upload **backend-médié**, pas frontend-direct. Le client envoie le fichier photo brut en multipart au backend (`multer`) ; le backend upload sur Cloudinary via le SDK Node (secret API côté serveur, jamais exposé au client) et stocke l'URL `secure_url` retournée. Choisi plutôt que le pattern existant (`MotoKey_Client.html`, upload direct via preset unsigned) parce que Phase 25 n'a aucune UI — le succès criteria #5 du ROADMAP ("stocke réellement l'image sur Cloudinary") doit être vérifiable CETTE phase, via un test isolé (curl multipart ou script Node), pas différé à Phase 27.
- **D-02:** Cloudinary est **obligatoire, sans fallback silencieux** — contrairement à `EMAIL_ENABLED`/`PUSH_ENABLED`/`VISION_ENABLED`. Si les credentials Cloudinary manquent ou sont mal configurés, l'endpoint retourne une erreur explicite (500/503), jamais une URL placeholder. Justification : CLOUD-01 dit explicitement "activation réelle ce milestone — plus aucun placeholder" ; contrairement aux autres flags qui protègent contre une fonctionnalité non-critique en dev, un faux URL Cloudinary silencieux corromprait des données de preuve anti-fraude (photo consommable/compteur).
- **D-03:** Limites fichier : **5 Mo max, JPEG/PNG/WebP uniquement**, validées côté backend avant l'appel Cloudinary (évite de consommer bande passante/quota Cloudinary free tier sur un fichier invalide).

### Saisie consommables (CONSO-01)
- **D-04:** **Deux endpoints coexistent**, tous deux appellent `Consommables.upsert()` en dessous (aucune duplication de logique métier) :
  - Un endpoint **unitaire** (PATCH par type) pour l'usage courant — un mécano modifie un consommable à la fois (ex: remplace une chaîne pendant un OR).
  - Un endpoint **bulk** (reçoit les 9 types en un tableau) pour le setup initial d'une moto — appelle `Consommables.upsert()` en boucle côté backend.

### Photo consommable sans fiche existante
- **D-05:** Si `consommable_id` n'existe pas encore pour le `type_consommable` uploadé (le mécano n'a pas encore fait sa saisie CONSO-01), l'endpoint **auto-crée la ligne consommable** via `Consommables.upsert(moto_id, {type_consommable, km_montage: null, ...})` avant de lier `consommable_id` à la photo — plutôt que de laisser la photo orpheline (`consommable_id` NULL, permis par le schéma mais pas retenu). Garantit que les jauges Phase 27/28 ont toujours une ligne consommable à afficher (jauge partielle avec `km_montage` NULL plutôt qu'absente), et qu'aucune photo n'est "perdue" faute de saisie mécano préalable.

### Claude's Discretion
- Noms exacts des routes HTTP (ex: `/motos/:id/km`, `/motos/:id/km/remplacement-compteur`, `/motos/:id/consommables/:type`, `/motos/:id/consommables`, `/motos/:id/photos-consommables`) — convention à suivre depuis les routes existantes de `motokey-api.js`.
- Variables d'environnement Cloudinary exactes (`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` séparées vs `CLOUDINARY_URL` unique) — choix technique, les deux sont supportées nativement par le SDK Node officiel.
- Endpoint(s) exacts pour le remplacement de compteur (KM-02) — non discuté cette session (utilisateur a choisi de ne pas approfondir), mais les contraintes DB de Phase 23 s'appliquent déjà : `note` obligatoire côté app pour `type_evenement='remplacement_compteur'`, `requireRole(ctx, 'PRO')` minimum (exclut MECANO et CLIENT), photo optionnelle (traité comme un relevé km normal côté schéma — `photo_url` nullable sur `releves_km`).
- Endpoint(s) exacts pour le relevé km normal (KM-03) — CLIENT + membres garage (MECANO+) tous deux autorisés via `requireAnyRole(ctx, ['CLIENT'])` OR `requireRole(ctx, 'MECANO')`, `acteur_type`/`acteur_id` dérivés de `ctx` (jamais anonyme, D-04 Phase 23).
- Détail exact du multipart handling (`multer` memoryStorage vs diskStorage) et de l'appel au SDK Cloudinary (`cloudinary.uploader.upload_stream` vs buffer-to-base64).
- Comment le résultat de `analyzePhoto()` déclenché à l'upload d'une photo consommable est retourné au client (synchrone dans la réponse HTTP de l'upload, vu que le stub est un calcul pur sans latence réseau réelle) — pas de préférence produit exprimée, comportement naturel du stub.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap et requirements
- `.planning/ROADMAP.md` Phase 25 section (lignes 136-146) — 5 success criteria exacts
- `.planning/REQUIREMENTS.md` — KM-02, KM-03, CONSO-01, CONSO-03, CLOUD-01 (texte exact)

### Décisions Phase 23 directement pertinentes (schéma + anti-fraude km)
- `.planning/phases/23-sch-ma-anti-fraude-km-au-niveau-db/23-CONTEXT.md` — D-04 (acteur_id jamais anonyme, threadé depuis ctx.user_id)
- `sql/migrations/23_consommables_km.sql` — commentaires de schéma faisant autorité : `type_evenement='remplacement_compteur'` reset la chaîne monotone (pas d'archive séparée nécessaire), `note` obligatoire côté app pour ce type d'événement (non encore enforced en code — à faire en Phase 25), RLS default-deny sur les 4 tables (autorisation réelle = responsabilité de cette phase)

### Décisions Phase 24 directement pertinentes (helpers + contrat vision)
- `.planning/phases/24-helpers-supabase-js-contrat-stub-vision/24-CONTEXT.md` — contrat verrouillé de `analyzePhoto()`, convention flag-gated `VISION_ENABLED` (à NE PAS répliquer pour Cloudinary — voir D-02, Cloudinary est obligatoire sans fallback, contrairement à VISION/EMAIL/PUSH)
- `services/visionAnalysisService.js` (commentaire d'en-tête ~L1-40) — signature exacte `analyzePhoto({ photoUrl, consommableId, typeConsommable, kmActuel, kmMontage })`, service pur sans accès DB

### Helpers existants à consommer (pas à recréer)
- `supabase.js` `RelevesKm.enregistrer()` (~L385) — unique point d'écriture km, gère déjà lecture/lecture_initiale/remplacement_compteur, retourne `{accepted, releve}` ou `{accepted:false, km_tente, km_actuel}` sur rejet trigger
- `supabase.js` `Consommables.upsert()`/`.listByMoto()` (~L1314) — upsert on-conflict `(moto_id, type_consommable)`
- `supabase.js` `PhotosConsommables.insert()`/`.listByConsommable()` (~L1350) — `photo_url` requis en entrée (donc l'upload Cloudinary doit se terminer AVANT cet appel), `consommable_id` nullable

### RBAC
- `auth/rbac.js` — `requireRole(ctx, minRole)` (hiérarchie CLIENT<MECANO<PRO<CONCESSION<ADMIN), `requireAnyRole(ctx, [...])`, `getGarageIdForUser(ctx, SBLayer)` — patterns exacts à utiliser pour gater KM-02 (PRO+ strict), KM-03/CONSO-03 (CLIENT ou MECANO+), CONSO-01 (MECANO+)

### Pattern d'endpoint dual CLIENT/GARAGE de référence
- `motokey-api.js` ~L690-900 (endpoints motos/interventions) — pattern exact `requireAnyRole(ctx, ['CLIENT'])` avec vérification de propriété via `DB.clients.find(c => c.auth_user_id === ctx.user_id)`, à répliquer pour les endpoints km/photos ouverts à CLIENT+GARAGE

### Pattern existant Cloudinary (à NE PAS répliquer tel quel — voir D-01)
- `MotoKey_Client.html` ~L1100-1220 (`uploadToCloudinary()`, `CLOUDINARY_CLOUD`/`CLOUDINARY_PRESET`) — pattern frontend-direct existant pour `carte_grise_photo_url`, jamais réellement activé (`CLOUDINARY_CLOUD=''`). Documente la convention de nommage `motokey_unsigned` mais Phase 25 choisit une architecture différente (backend-médié, D-01) — ne pas copier ce pattern pour km/consommables.

### Contexte projet
- `.planning/PROJECT.md` — Constraints ("requireRole() obligatoire sur tout nouvel endpoint sensible", "Fichiers critiques : motokey-api.js, app.html, supabase.js, MotoKey_Client.html — édition directe uniquement")

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RelevesKm.enregistrer()`, `Consommables.upsert()`/`.listByMoto()`, `PhotosConsommables.insert()`/`.listByConsommable()` — toute la couche DB existe déjà (Phase 23/24), cette phase n'écrit aucun SQL, seulement du HTTP + rôle-gating + upload Cloudinary
- `analyzePhoto()` — contrat verrouillé, prêt à être appelé synchrone depuis l'endpoint d'upload photo consommable
- `auth/rbac.js` (`requireRole`, `requireAnyRole`, `getGarageIdForUser`) — tout le tooling RBAC nécessaire existe déjà, aucun nouveau helper d'autorisation à créer

### Established Patterns
- Pattern dual CLIENT/GARAGE déjà établi ailleurs dans `motokey-api.js` (devis, interventions, motos) — vérification de propriété via `DB.clients.find(c => c.auth_user_id === ctx.user_id)` côté CLIENT, `garage_id` côté GARAGE
- `fail(res, message, statusCode, errorCode)` — helper de réponse d'erreur existant à réutiliser pour les nouveaux endpoints
- Convention flag-gated `XXX_ENABLED` + fallback silencieux (`EMAIL_ENABLED`/`PUSH_ENABLED`/`VISION_ENABLED`) — **explicitement PAS suivie pour Cloudinary** (D-02), divergence assumée et documentée

### Integration Points
- Aucune dépendance npm actuelle pour multipart (`multer`) ni Cloudinary (`cloudinary`) — les deux doivent être ajoutées à `package.json`
- Aucune variable d'environnement Cloudinary configurée localement ni (a priori) sur Railway — à provisionner avant déploiement prod
- `motokey-api.js` n'a aujourd'hui aucun endpoint de upload de fichier (multipart) — première introduction de ce pattern dans le backend

</code_context>

<specifics>
## Specific Ideas

Aucune référence produit spécifique au-delà des décisions ci-dessus — discussion technique orientée architecture/contrat.

</specifics>

<deferred>
## Deferred Ideas

- **Remplacement compteur (KM-02) — mécanique exacte du motif/note et de la photo** — non discuté cette session (utilisateur a choisi de sauter cette zone). Les contraintes déjà connues (note obligatoire, PRO+ strict, photo optionnelle) sont documentées en Claude's Discretion ci-dessus ; le planner peut trancher les détails restants (texte libre vs enum de motifs) sans re-consultation, sauf si une préférence produit s'avère nécessaire en cours de planification.

### Reviewed Todos (not folded)
Aucun todo en attente ne matchait cette phase (`gsd-tools todo match-phase 25` → 0 résultat).

</deferred>

---

*Phase: 25-endpoints-backend-km-photos-remplacement-compteur-cloudinary*
*Context gathered: 2026-07-14*
