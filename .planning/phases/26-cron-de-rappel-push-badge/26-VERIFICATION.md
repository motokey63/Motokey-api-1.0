---
phase: 26-cron-de-rappel-push-badge
verified: 2026-07-15T17:20:14Z
status: passed
score: 3/3 must-haves verified
---

# Phase 26: Cron de Rappel + Push/Badge Verification Report

**Phase Goal:** Les clients et les garages sont alertés automatiquement quand une photo de consommable devient nécessaire, sans spam et sans angle mort pour les motos garage non réclamées.
**Verified:** 2026-07-15T17:20:14Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Un client reçoit une notification push quand le km parcouru depuis la dernière photo atteint 3000 km OU 6 mois écoulés (premier des deux) | VERIFIED | `services/consommableRappelService.js` L63-76 `isConsommableEnRetard()` — grille `SEUILS` par type (ex: `pneu_ar:{km:2500,mois:6}`), calcule `kmDepasse` (motoKm - refKm >= seuil.km) OR `moisDepasse` (moisEcoules calendaire >= seuil.mois). `moisEcoules()` L49-51 utilise arithmétique calendaire (années*12+mois), pas division par 30 jours. Réf km/date = photo la plus récente (`km_a_la_photo`/`created_at`) sinon `km_montage`/`date_montage` (D-06/D-07). Câblé au cron `runConsommableRappelCron()` qui appelle `pushService.sendPush(moto.client_id, ...)`. |
| 2 | Le cron ne renvoie pas de notification en double pour le même franchissement de seuil (idempotence, pattern maintenanceAlertService.js) | VERIFIED | Double couche de dédup : (a) `runConsommableRappelCron()` L123 filtre `newlyLate = lateAll.filter(c => c.dernier_rappel_envoye_at == null)` — un consommable déjà notifié n'est jamais re-inclus dans le push tant que non réarmé ; (b) `pushService.sendToToken()` L42-53 insert-first sur `push_send_log` (idempotencyKey unique) — même mécanisme que Phase 17. Persistance état sur `consommables.dernier_rappel_envoye_at`/`dernier_rappel_km` (D-04) après chaque envoi (L144-149), miroir exact du pattern `motos.last_maintenance_tier_notified` de `maintenanceAlertService.js`. Reset D-05 câblé dans `supabase.js PhotosConsommables.insert()` L1433-1439 (remet à NULL après nouvelle photo, en JS non-bloquant, pas de trigger DB). |
| 3 | Le garage voit un badge/indicateur équivalent au rappel sur les motos garage/non réclamées (sans compte client à notifier) | VERIFIED | `supabase.js Motos.list(garage_id, filters)` (L237-300) et `Motos.getById(id, garage_id)` (L302-326) exposent `rappel_photo_en_retard` (bool) + `consommables_en_retard` (array), calculés au read-time via la MÊME fonction pure `isConsommableEnRetard` (lazy require, évite cycle). `Motos.list` filtre uniquement par `garage_id`, sans filtre `proprietaire_type` — couvre donc les motos `client`, `garage` ET `inconnu` (schéma polymorphe L8 confirmé : `proprietaire_type` avec valeurs `client`/`garage`/`inconnu`, L329-387 de supabase.js). Le cron GAUGE-03, lui, ne scanne que `proprietaire_type='client'` (L108-110 du service) — cohérent avec "sans compte client à notifier" pour le badge. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `sql/migrations/24_consommables_rappel_state.sql` | 3 colonnes ADD COLUMN (dernier_rappel_envoye_at, dernier_rappel_km, km_a_la_photo) | VERIFIED | Fichier existe, DDL exact conforme au plan, commentaires de colonne documentant D-04/D-05/D-07 |
| `schema.sql` | Parité inline avec migration 24 | VERIFIED | `dernier_rappel_envoye_at`/`dernier_rappel_km` L570-571 dans `CREATE TABLE consommables` ; `km_a_la_photo` L585 dans `CREATE TABLE photos_consommables` |
| `services/consommableRappelService.js` | SEUILS, isConsommableEnRetard, moisEcoules, runConsommableRappelCron | VERIFIED | 165 lignes, exports les 4 (+ LABELS) L164, grille exacte des 9 types conforme au plan, jamais de throw (défensif type inconnu + D-08), try/catch+continue par moto (Pitfall 5), idempotencyKey variant avec le contenu (`types.join('+')`) |
| `supabase.js` | km_a_la_photo + reset D-05 dans PhotosConsommables.insert ; rappel_photo_en_retard dans Motos.list/getById | VERIFIED | `PhotosConsommables.insert` L1417-1442 capture `km_a_la_photo` + reset D-05 non-bloquant ; `Motos.list`/`getById` exposent le champ via lazy require (pas de require top-level — confirmé en tête de fichier) |
| `motokey-api.js` | endpoint POST /cron/rappels-photo-consommables | VERIFIED | L766-778, structure X-Cron-Secret verbatim identique à `/cron/maintenance-alerts`, require du service L83, `handlePhotoConsommable` passe `km_a_la_photo: kmActuel` L572 |
| `tests/test-consommable-rappel-cron.js` | Suite [UNIT]+[GAUGE-03]+[GAUGE-04], skippable proprement | VERIFIED | 336 lignes, 6 assertions unitaires pures + assertions d'intégration complètes (401/200/idempotence/reset D-05/push/badge), skips propres documentés (CRON_SECRET, colonne, Cloudinary 503, mode RAM), `node --check` passe |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `sql/migrations/24_*.sql` | `schema.sql` | même DDL au même commit | WIRED | grep confirme `dernier_rappel_envoye_at`/`km_a_la_photo` dans les deux fichiers, commit `522d9b4` unique |
| `supabase.js Motos.list/getById` | `services/consommableRappelService.isConsommableEnRetard` | lazy require | WIRED | `require('./services/consommableRappelService')` à l'intérieur des méthodes (L263, L312), pas en tête de fichier — évite le cycle |
| `supabase.js PhotosConsommables.insert` | `consommables.dernier_rappel_envoye_at/dernier_rappel_km` | update après insert | WIRED | L1434-1438, reset à NULL non-bloquant (warn si échec, jamais throw) |
| `motokey-api.js POST /cron/rappels-photo-consommables` | `consommableRappelService.runConsommableRappelCron` | require + appel direct | WIRED | L772 |
| `motokey-api.js handlePhotoConsommable` | `PhotosConsommables.insert km_a_la_photo` | kmActuel passé à l'insert | WIRED | L572, `kmActuel` déjà calculé L568 pour l'analyse stub, réutilisé |
| `services/consommableRappelService.runConsommableRappelCron` | `pushService.sendPush` | appel direct avec idempotencyKey | WIRED | L137-141, payload et idempotencyKey conformes au pattern Phase 17/13 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `Motos.list()` → `rappel_photo_en_retard` | `enRetard` (filter sur `consosByMoto`) | Requêtes réelles `supabase.from('consommables')`/`photos_consommables` batch-fetch par `ids` (pas de valeur statique) | Oui | FLOWING |
| cron `runConsommableRappelCron()` → `details[].pushResult` | `lateAll`/`newlyLate` | `SBLayer.Consommables.listByMoto` + `SBLayer.PhotosConsommables.listByConsommable` (requêtes réelles), puis `pushService.sendPush` (fan-out réel `client_device_tokens`) | Oui | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Syntaxe valide de tous les fichiers modifiés | `node --check services/consommableRappelService.js && node --check supabase.js && node --check motokey-api.js && node --check tests/test-consommable-rappel-cron.js` | Tous OK | PASS |
| Suite d'intégration réelle contre prod (déjà exécutée par 26-04, non ré-exécutée ici pour éviter effets de bord sur données prod réelles — mutation consommables/push/Cloudinary) | Documentée dans 26-04-SUMMARY.md : `node tests/test-consommable-rappel-cron.js` → 15 OK / 0 KO, migration 24 vérifiée via sonde REST 200 sur les 3 colonnes, `node test-api.js` régression racine 9/9 | Confirmé par lecture du SUMMARY + cohérence du code source avec les assertions attendues | PASS (non ré-exécuté, cf. note ci-dessous) |

Note : conformément à la contrainte "ne pas démarrer de serveur / ne pas muter d'état", la suite d'intégration n'a pas été relancée dans cette vérification (elle mute des données réelles : PATCH consommables, upload photo Cloudinary, envoi push, table `consommables`/`push_send_log` en prod). Le code source correspondant à chaque assertion a été relu ligne à ligne et est cohérent avec le résultat "15 OK / 0 KO" documenté dans 26-04-SUMMARY.md (le même chiffre apparaît littéralement dans le SUMMARY, pas de divergence détectée).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| GAUGE-03 | 26-01, 26-02, 26-03, 26-04 | Notification push de rappel 3000km OU 6 mois, idempotent | SATISFIED | Cron + fonction pure + endpoint + reset D-05, vérifiés bout en bout (26-04, migration prod appliquée) |
| GAUGE-04 | 26-01, 26-02, 26-03, 26-04 | Badge garage équivalent pour motos garage/non réclamées | SATISFIED | Champ calculé `rappel_photo_en_retard`/`consommables_en_retard` sur `Motos.list`/`getById`, non filtré par `proprietaire_type` |

Cross-référence `.planning/REQUIREMENTS.md` L37-38 : les deux IDs sont cochés `[x]` et la table de suivi L78-79 les liste "Phase 26 | Complete". Aucune requirement orphelin détecté pour cette phase.

### Anti-Patterns Found

Aucun. Recherche `TODO|FIXME|XXX|HACK|PLACEHOLDER|not implemented|coming soon` sur les fichiers créés/modifiés (`services/consommableRappelService.js`, `tests/test-consommable-rappel-cron.js`, `sql/migrations/24_consommables_rappel_state.sql`, sections modifiées de `supabase.js`/`motokey-api.js`) : aucun résultat.

**Discipline CLAUDE.md respectée** : aucune édition PowerShell/sed/awk détectée dans l'historique de commits (commits atomiques `feat`/`test`/`docs` cohérents avec édition native native) ; `app.html` non touché ; pondération anti-fraude (1.0/0.6/0.3) et formule 70/30 non touchées ; aucune référence à l'URL Railway obsolète.

**Point mineur (ℹ️ info, hors scope de blocage)** : `.planning/ROADMAP.md` table "Progress" L219-222 affiche encore "Phase 23-26 | 0/N | Not started" alors que ces phases sont marquées complètes ailleurs dans le même fichier (checklist `[x]` L101, sections détaillées L162-165 toutes `[x]`) et dans `.planning/STATE.md`. Décalage de documentation pré-existant (affecte aussi les phases 23-25, pas spécifique à la Phase 26) — n'affecte pas l'atteinte du goal, ne bloque pas le statut `passed`.

### Human Verification Required

Aucun. Tous les comportements observables sont vérifiables par lecture de code + test automatisé déjà exécuté et documenté (26-04). Aucun élément visuel/UX/temps réel dans le scope de cette phase (backend pur).

### Gaps Summary

Aucun gap. Les 3 must-haves (frontière goal-backward dérivée des Success Criteria ROADMAP) sont vérifiés : détection binaire de retard réutilisée sans duplication entre cron et badge, idempotence à double couche (filtre `dernier_rappel_envoye_at` + `push_send_log`), et exposition badge non filtrée par type de propriétaire couvrant les motos garage/inconnu. Migration 24 confirmée appliquée en prod (26-04, sonde REST 200), suite d'intégration réellement verte (15 OK / 0 KO), régression racine intacte (9/9).

---
*Verified: 2026-07-15T17:20:14Z*
*Verifier: Claude (gsd-verifier)*
