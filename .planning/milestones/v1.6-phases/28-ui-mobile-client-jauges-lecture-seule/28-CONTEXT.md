# Phase 28: UI Mobile Client (jauges, lecture seule) - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

L'app mobile native (Expo Router/TypeScript, `/mobile-app`) affiche, en lecture seule, une jauge % par consommable (9 types) et une jauge générale égale au consommable en plus mauvais état — même source de données que le web (`GET /motos/:id/consommables`, GAUGE-01/02, Phase 25/27). Un tap sur la notification push de rappel photo (Phase 26) navigue directement vers l'écran où ces jauges sont visibles.

Aucune capture photo depuis mobile ce milestone (décision confirmée `.planning/PROJECT.md` — "mobile = lecture seule (jauges + deep link notification), pas de capture photo native ce milestone"), aucun nouveau type de consommable, aucun nouvel appel IA.

</domain>

<decisions>
## Implementation Decisions

### Placement des jauges
- **D-01:** Les jauges vivent en **section inline** dans l'écran fiche moto existant (`app/(app)/(tabs)/motos/[id].tsx`), au même niveau que les sections Historique/Plan d'entretien/Pneumatiques déjà présentes — pas d'écran ni de route dédiée séparée. Une seule page scrollable par moto, cohérent avec le pattern déjà en place sur ce screen et avec D-09 Phase 27 (client web = même granularité que garage, affichage direct pas de vue tronquée).

### Sort de la section Pneumatiques legacy
- **D-02:** La section "Pneumatiques" actuelle (lignes ~140-150 de `[id].tsx`, lit directement `moto.pneu_av`/`moto.pneu_ar`) est **retirée et remplacée** par les jauges pneu_av/pneu_ar (2 des 9 types consommables affichés par la nouvelle section).
- **D-03:** Si une moto n'a pas encore de ligne `consommables` migrée pour pneu_av/pneu_ar (migration prod `sql/migrations/25_migrate_pneus_to_consommables.sql` pas encore appliquée par Mehdi — Known Gap actif au moment de cette phase), la jauge correspondante affiche l'état **"Non renseigné"** (cohérent avec D-01 Phase 27) plutôt que de ne rien afficher — pas de perte d'information silencieuse pendant la fenêtre où la migration prod n'est pas encore jouée.

### Précision du deep-link notification
- **D-04:** Le tap sur la notification de rappel photo (`type: 'moto_entretien'`, envoyée par `consommableRappelService.js` — même type que l'alerte seuil générique MPUSH-04) route vers `motos/[id]` via `mapNotificationDataToRoute()` **sans modification** — puisque les jauges sont maintenant visibles inline sur cette même page (D-01), atterrir sur la fiche moto satisfait le critère de succès "navigue directement vers l'écran jauges". **Aucun changement backend** (pas de nouveau `type` de notification) — reste dans le périmètre strict "UI Mobile Client" de cette phase.

### Style visuel
- **D-05:** Nouveau composant `GaugeBar` (barre horizontale remplie à `pct_usure`%, couleur dérivée de `etat` via le mapping déjà verrouillé Phase 24 D-01 bon/moyen/usé/critique ↔ vert/bleu/jaune/rouge, réutilisant `theme/colors.ts` `gn`/`bl`/`yw`/`rd`) + label texte à côté. Cohérent visuellement avec le web (D-06 Phase 27 : barre horizontale + badge couleur) — même lecture visuelle garage/client/mobile. Premier composant "barre de progression" du repo mobile (n'existe pas encore — seuls `ScoreBadge`/`StatutBadge`, pastilles pleines, existent).
- **D-06 (carried forward, Phase 27 D-11):** Le wording des 4 états ("Non renseigné"/"Pas encore suivi" inclus) reprend le wording grand public déjà verrouillé côté client (`MotoKey_Client.html`) — l'app mobile EST l'expérience client, même contrat de données `etat` (bon/moyen/usé/critique), mêmes libellés affichés.

### Claude's Discretion
- Emplacement exact de la nouvelle section dans l'ordre des sections existantes (avant/après Plan d'entretien) — laissé à la planification.
- Détail du fetch : 4ème appel `Promise.all` dans `load()` de `[id].tsx` vers `GET /motos/:id/consommables`, en parallèle des 3 existants — pattern déjà établi (`apiGet`), pas de nouvelle abstraction nécessaire.
- Nom exact du composant `GaugeBar` et sa localisation (`components/GaugeBar.tsx`) — cohérent avec la convention existante (`components/ScoreBadge.tsx`, `components/StatutBadge.tsx`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrat de données / backend existant
- `motokey-api.js` (lignes 1131-1142) — `GET /motos/:id/consommables` (GAUGE-01/02), ouvert CLIENT + MECANO+ via `resolveMotoForCtx`, retourne `{ consommables: items, jauge_generale: jaugeGenerale }`
- `services/visionAnalysisService.js` — contrat `analyzePhoto()` verrouillé (pct_usure/etat/confiance/analyse_status/engine), mapping état→couleur (Phase 24 D-01)
- `services/consommableRappelService.js` (ligne 139) — push notification `{ type: 'moto_entretien', motoId: moto.id }`, seuils 3000km/6 mois

### Code mobile existant (patterns à réutiliser)
- `mobile-app/app/(app)/(tabs)/motos/[id].tsx` — écran fiche moto : `load()` (lignes 28-47, pattern `Promise.all` d'appels `apiGet`), section Pneumatiques à **retirer** (lignes 140-150, `showPneus`/`moto.pneu_av`/`moto.pneu_ar`)
- `mobile-app/hooks/useNotificationObserver.ts` (lignes 26-36) — `mapNotificationDataToRoute()`, déjà mappe `type: 'moto_entretien'` → `motos/[id]` (ligne 32-33) — **aucun changement requis** (D-04)
- `mobile-app/theme/colors.ts` — palette verrouillée (`gn`/`bl`/`yw`/`rd` pour vert/bleu/jaune/rouge)
- `mobile-app/lib/motoDisplay.ts` — `couleurColor()`/`scoreToColor()`, pattern à répliquer pour un nouveau `etatColor()` (bon/moyen/usé/critique → couleur)
- `mobile-app/components/StatutBadge.tsx` — pattern pill couleur+texte, potentiellement réutilisable pour le label à côté de la barre (D-05)
- `mobile-app/components/ScoreBadge.tsx` — pattern de composant existant à suivre pour `GaugeBar` (props typées, `StyleSheet.create`)

### Schéma DB / cohérence Phase 27
- `27-CONTEXT.md` (`.planning/phases/27-ui-web-garage-client-jauges-retrait-pneus-legacy/`) — décisions D-01→D-11 déjà verrouillées côté web (états "Non renseigné"/"Pas encore suivi", jauge générale = maillon le plus faible jamais une moyenne, exclusion des "Non renseigné" du calcul, wording grand public D-11)
- `sql/migrations/25_migrate_pneus_to_consommables.sql` — migration pneu legacy → consommables, **pas encore appliquée en prod** au moment de cette phase (voir `.planning/PROJECT.md` Known Gaps / Blockers) — justifie D-03 (fallback "Non renseigné")

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apiGet()` (`lib/api.ts`) — helper HTTP déjà utilisé par `[id].tsx`, pas de nouvelle abstraction réseau nécessaire pour le 4ème appel
- `theme/colors.ts` — palette complète déjà présente, aucune nouvelle couleur à définir
- Pattern `Promise.all` dans `load()` — extension directe pour inclure `GET /motos/:id/consommables`

### Established Patterns
- Chaque écran de la fiche moto suit le pattern : loading/error state → `ScrollView` → sections `View style={styles.section}` avec `Text style={styles.sectionTitle}` — la nouvelle section Consommables doit suivre exactement ce pattern
- Mapping couleur déjà verrouillé côté contrat de données (Phase 24 D-01) — le mobile n'a qu'à consommer/répliquer, pas à redéfinir

### Integration Points
- `[id].tsx` : nouveau state `consommables`/`jaugeGenerale`, nouveau fetch dans `load()`, nouvelle section JSX remplaçant la section Pneumatiques
- Aucun changement à `useNotificationObserver.ts` (D-04)
- Aucun changement backend

</code_context>

<specifics>
## Specific Ideas

- La jauge générale doit être mise en avant visuellement, dans l'esprit de D-07 Phase 27 (contiguë au badge score déjà affiché en haut de la fiche moto côté web) — même intention de lecture rapide côté mobile, détail exact laissé à la planification.

</specifics>

<deferred>
## Deferred Ideas

Aucune — la discussion est restée dans le périmètre de la phase (jauges mobile lecture seule + deep link notification). La possibilité d'un type de notification backend distinct (`consommable_rappel`) a été évoquée mais explicitement écartée comme hors périmètre de cette phase (D-04) — à reconsidérer dans une phase future si le besoin de distinguer statistiquement les deux origines de push se confirme.

</deferred>

---

*Phase: 28-ui-mobile-client-jauges-lecture-seule*
*Context gathered: 2026-07-16*
