# Phase 26: Cron de Rappel + Push/Badge - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Un cron backend détecte, pour chaque consommable de chaque moto, si le km parcouru depuis la dernière photo (ou depuis le montage si jamais photographié) dépasse un seuil différencié par type, OU si un délai en mois s'est écoulé depuis cette même référence. Selon le type de propriétaire de la moto (`motos.proprietaire_type`) : le client reçoit un push groupé unique par moto (GAUGE-03), ou le garage dispose d'un moyen de détecter les motos garage/non réclamées en retard (GAUGE-04, `proprietaire_type IN ('garage', 'inconnu')`, sans compte client à notifier). Aucune UI dans cette phase — l'affichage du badge garage et des jauges est Phase 27/28. Cette phase construit uniquement la détection, la persistance anti-spam, et l'envoi push (+ l'exposition backend nécessaire pour que Phase 27 consomme l'équivalent badge sans recalcul dupliqué).

</domain>

<decisions>
## Implementation Decisions

### Seuils par type de consommable
- **D-01:** Seuils **différenciés par type**, définis en **map en dur dans le service cron** (pas de migration de config, pas de nouvelle table) :

  | Type | Seuil km | Seuil mois |
  |---|---|---|
  | `pneu_av` | 3000 | 6 |
  | `pneu_ar` | 2500 | 6 |
  | `chaine` | 3000 | 6 |
  | `plaquettes_av` | 3000 | 6 |
  | `plaquettes_ar` | 4500 | 6 |
  | `disque_av` | 8000 | 12 |
  | `disque_ar` | 8000 | 12 |
  | `huile_moteur` | 5000 | 6 |
  | `liquide_frein` | 6000 | 12 |

  Le premier des deux seuils (km OU mois) franchi déclenche l'alerte (logique GAUGE-03/04 : "le premier des deux").

### Portée et fréquence de la notification
- **D-02:** **1 push groupé par moto**, pas un push par consommable en retard. Si plusieurs consommables d'une même moto dépassent leur seuil au même passage du cron, un seul message liste tous les consommables concernés. Évite le spam si plusieurs consommables dérivent ensemble.
- **D-03:** **Pas de relance périodique.** Un seul rappel est envoyé au franchissement du seuil ; le cron ne relance pas tant que la référence (km/date de dernière photo) n'a pas changé. Le rappel se "réarme" automatiquement dès qu'une nouvelle photo est prise pour ce consommable (voir D-05) — contrairement à `maintenanceAlertService.js` qui compare des rangs à 3 paliers (ok/warning/urgent), ici l'état est binaire (en retard / pas en retard), donc pas besoin de logique de rang : le simple fait qu'une colonne "dernier rappel envoyé" soit NULL ou non suffit à savoir s'il faut notifier.

### Anti-spam / persistance
- **D-04:** Nouvelles colonnes sur `consommables` : `dernier_rappel_envoye_at` (TIMESTAMPTZ, nullable) et `dernier_rappel_km` (INTEGER, nullable). Renseignées quand le cron envoie un rappel pour ce consommable. Même pattern d'esprit que `motos.last_maintenance_tier_notified` (Phase 17/migration 18), mais adapté au cas binaire de cette phase — pas de nouvelle table dédiée.
- **D-05:** **Reset automatique à la photo suivante** — dès qu'une nouvelle ligne est insérée dans `photos_consommables` pour un `consommable_id` donné, `dernier_rappel_envoye_at`/`dernier_rappel_km` sur la ligne `consommables` correspondante repassent à `NULL`. Le compteur "depuis dernière photo" repart de zéro naturellement ; le cron pourra renotifier au prochain franchissement.

### Calcul "depuis la dernière photo"
- **D-06:** Si un consommable n'a **jamais** été photographié, la référence de départ est `consommables.km_montage` / `consommables.date_montage` (pas d'angle mort — une moto jamais photographiée depuis longtemps doit déclencher un rappel).
- **D-07:** Nouvelle colonne `km_a_la_photo` (INTEGER, nullable) sur `photos_consommables`, capturée = `motos.km` au moment de l'upload de la photo. Le cron compare `motos.km` actuel à `km_a_la_photo` de la photo la plus récente pour ce consommable (fallback `km_montage` si aucune photo) — évite une jointure coûteuse/approximative sur `releves_km` par date à chaque exécution du cron.
- **D-08:** Cas d'un consommable sans aucune référence exploitable (ni `km_montage`, ni `km_a_la_photo`) : **exclu du calcul** par le cron. Ce cas est normalement impossible en pratique car la Phase 25 (D-05, auto-création de la ligne `consommable` à l'upload de la première photo) garantit que dès qu'une ligne `consommables` existe suite à un upload, sa première photo associée porte déjà `km_a_la_photo`. Le fallback d'exclusion protège seulement contre un état incohérent imprévu (ex: donnée corrompue).

### Claude's Discretion
- Mécanisme exact du badge garage (GAUGE-04) : endpoint HTTP dédié (ex: champ dérivé exposé sur la fiche moto ou une liste "motos à rappeler") vs simple exposition des colonnes `dernier_rappel_envoye_at`/`km_a_la_photo` pour que Phase 27 recalcule à la volée. Non discuté cette session — le planner peut trancher, en gardant à l'esprit que dupliquer la logique de seuils par type (D-01) dans le frontend Phase 27 serait fragile ; privilégier une exposition backend réutilisable.
- Nom exact de la route HTTP cron (ex: `/cron/rappels-photo-consommables`) — suivre le pattern exact de `/cron/maintenance-alerts` (`motokey-api.js` ~L750-762) : authentification par `X-Cron-Secret` / `process.env.CRON_SECRET`, pas de JWT.
- Format exact du texte du message push groupé (titre/corps, liste des consommables en retard) — pas de préférence produit exprimée cette session.
- Payload `data` du push (type d'événement, `motoId`) — cohérent avec le pattern existant `{ type: 'moto_entretien', motoId }` de `maintenanceAlertService.js`.
- Numéro de la migration SQL suivante (dernière migration existante : `23_consommables_km.sql` — cette phase sera donc `24_*.sql`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap et requirements
- `.planning/ROADMAP.md` Phase 26 section (lignes 153-161) — 3 success criteria exacts
- `.planning/REQUIREMENTS.md` — GAUGE-03, GAUGE-04 (texte exact)

### Pattern cron idempotent existant (à adapter, pas à copier tel quel)
- `services/maintenanceAlertService.js` — pattern cron complet : lookup motos, calcul d'état, comparaison avec état persisté, envoi push conditionnel, persistance du nouvel état. Utilise un système à 3 rangs (ok/warning/urgent) — Phase 26 est binaire (en retard/pas), donc la logique de comparaison est plus simple (D-03).
- `services/pushService.js` `sendPush(clientId, payload, idempotencyKey)` (~L91) — fan-out multi-device, idempotencyKey déjà géré en interne par `push_send_log` (migration 17) ; pas besoin de dé-dupliquer côté cron au-delà de la persistance D-04/D-05.
- `motokey-api.js` ~L750-762 — endpoint `POST /cron/maintenance-alerts`, pattern exact d'authentification `X-Cron-Secret`/`CRON_SECRET` à répliquer pour le nouvel endpoint cron de cette phase.
- `sql/migrations/18_motos_maintenance_alert_state.sql` — pattern de migration légère pour colonnes d'état de notification (référence pour D-04/D-07).

### Schéma consommables/km (Phase 23)
- `sql/migrations/23_consommables_km.sql` — schéma actuel de `consommables` et `photos_consommables` (aucune colonne de rappel ni `km_a_la_photo` — à ajouter cette phase via `sql/migrations/24_*.sql`, respectant la discipline "hand-appended dans schema.sql dans le même commit").
- `sql/migrations/13_liaison_client_moto.sql` — `proprietaire_type_enum` ('client'/'garage'/'inconnu'), condition exacte des motos "garage/non réclamées" pour GAUGE-04 : `proprietaire_type IN ('garage', 'inconnu')`.

### Helpers existants à consommer (Phase 23/24/25 — ne pas recréer)
- `supabase.js` `Consommables.upsert()`/`.listByMoto()` (~L1329-1360) — lecture des consommables par moto.
- `supabase.js` `PhotosConsommables.insert()`/`.listByConsommable()` (~L1365-1393) — le cron doit lire la photo la plus récente par consommable ; l'INSERT de photo doit déclencher le reset D-05 (soit dans le helper, soit via trigger DB — au choix du planner).
- `.planning/phases/25-endpoints-backend-km-photos-remplacement-compteur-cloudinary/25-CONTEXT.md` D-05 — auto-création de la ligne `consommables` à l'upload d'une photo sans fiche existante, garantit qu'un `consommable_id` a toujours au moins une photo associée dès sa création par ce chemin.

### Contexte projet
- `.planning/PROJECT.md` — Constraints ("requireRole() obligatoire sur tout nouvel endpoint sensible" — le nouvel endpoint cron suit le pattern `X-Cron-Secret`, pas `requireRole`, comme `/cron/maintenance-alerts` ; "Fichiers critiques : motokey-api.js, app.html, supabase.js, MotoKey_Client.html — édition directe uniquement").

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/maintenanceAlertService.js` — structure complète à dupliquer/adapter en `services/consommableRappelService.js` (ou nom équivalent) : lookup motos, calcul d'état par moto, push conditionnel, persistance.
- `services/pushService.js` `sendPush()` — prêt à l'emploi, gère déjà idempotence/fan-out multi-device.
- `Consommables`/`PhotosConsommables` (supabase.js) — couche DB existante, seules deux colonnes à ajouter (D-04, D-07).

### Established Patterns
- Cron déclenché en HTTP (`POST /cron/xxx` + `X-Cron-Secret`), pas de `setInterval` interne — scheduler externe (Railway cron ou équivalent) appelle l'endpoint périodiquement.
- Migrations SQL numérotées séquentiellement, hand-appended dans `schema.sql` au même commit.
- `proprietaire_type` (Phase 20/L8) déjà la source de vérité pour distinguer motos client vs garage vs inconnu — pas de nouveau champ à créer pour GAUGE-04.

### Integration Points
- Nouvel endpoint cron dans `motokey-api.js`, juste après (ou à la place structurée à côté de) `/cron/maintenance-alerts`.
- Nouveau service `services/*.js` suivant le pattern Phase 17.
- Migration `24_*.sql` ajoutant les 2+2 colonnes (`consommables.dernier_rappel_envoye_at`/`dernier_rappel_km`, `photos_consommables.km_a_la_photo`).

</code_context>

<specifics>
## Specific Ideas

Grille de seuils par type de consommable (D-01) proposée par Claude sur la base des standards d'entretien moto, validée par l'utilisateur sans modification.

</specifics>

<deferred>
## Deferred Ideas

Aucune — la discussion est restée dans le périmètre de la phase (aucune proposition de nouvelle capacité hors scope).

### Reviewed Todos (not folded)
Aucun todo en attente ne matchait cette phase.

</deferred>

---

*Phase: 26-cron-de-rappel-push-badge*
*Context gathered: 2026-07-15*
