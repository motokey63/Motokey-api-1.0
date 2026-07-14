# Phase 24: Helpers supabase.js + Contrat Stub Vision - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Le contrat de réponse d'analyse IA (stub aujourd'hui, réel plus tard via `services/visionAnalysisService.js`) est verrouillé — forme fixe, consommée identiquement par tous les futurs endpoints/jauges (Phase 25, 27, 28). Aucun appel réel Anthropic dans cette phase (flag-gated `VISION_ENABLED`, même convention que `EMAIL_ENABLED`/`PUSH_ENABLED`). Les helpers CRUD des 3 tables créées en Phase 23 (`consommables`, `photos_consommables`, `releves_km`) existent dans `supabase.js` comme unique point d'accès DB. Aucune UI, aucun endpoint HTTP nouveau dans cette phase — c'est une phase contrat + couche d'accès données pure.

</domain>

<decisions>
## Implementation Decisions

### Forme exacte du contrat stub
- **D-01:** `% usure` = entier 0-100 (ex: `42`). `état` = enum 4 valeurs : `bon` / `moyen` / `usé` / `critique` — aligné avec le système couleur VERT/BLEU/JAUNE/ROUGE déjà existant dans le score anti-fraude, pour une cohérence visuelle dans les futures jauges. `confiance` = entier 0-100 (même échelle que `% usure`, pas un décimal 0-1).

### Dérivation état ← % usure
- **D-02:** `état` est dérivé directement du `% usure` calculé via des seuils (pas une valeur indépendante ni un tirage séparé). Cohérent, pas de logique de dérivation dupliquée à maintenir, exerce naturellement toutes les jauges couleur en dev. Seuils numériques exacts laissés à la planification (Claude's Discretion ci-dessous).

### Dérivation analyse_status ← confiance
- **D-03:** `confiance` basse (sous un seuil, exact laissé à la planification) fait basculer automatiquement `analyse_status` sur `incertain`. Sinon `ok`. Logique dérivée, cohérente avec ce qu'un vrai moteur Vision ferait (confiance faible = résultat incertain).

### Réalisme et déterminisme du stub
- **D-04:** Le stub est **pseudo-aléatoire**, pas une valeur fixe canned — les jauges doivent sembler "vivantes" en dev/démo, plus proche de l'expérience finale avec la vraie IA. La variation du `% usure` est **liée approximativement au km parcouru** depuis `km_montage` du consommable vs le km actuel de la moto (pas totalement déconnecté des données réelles). Le stub est **déterministe par photo/consommable** : un seed dérivé de l'URL de la photo ou de l'ID du consommable garantit qu'un même input redonne toujours le même résultat — reproductible pour les tests, cohérent si un re-scan est déclenché.

### Simulation d'échec/incertitude
- **D-05:** `analyse_status='echec'` n'est **JAMAIS** renvoyé par le stub — réservé exclusivement au vrai moteur Vision (timeout API, image illisible, etc.). Le stub ne regarde jamais vraiment la photo, donc n'a aucune base légitime pour simuler un échec de lecture. `incertain` reste possible via D-03 (confiance basse dérivée du calcul, pas un tirage d'échec).

### Fallback config incohérente (VISION_ENABLED=true sans clé)
- **D-06:** Si `VISION_ENABLED=true` mais la clé Anthropic API n'est pas configurée, `analyzePhoto()` fait un **fallback silencieux vers le stub** avec un warning loggé — même convention exacte que `EMAIL_ENABLED`/`PUSH_ENABLED` (`services/emailService.js:22`, `services/pushService.js:20`). Jamais de crash serveur sur une config incohérente.

### Claude's Discretion
- Méthodes CRUD exactes pour `Consommables` (create vs upsert, vu la contrainte `UNIQUE(moto_id, type_consommable)` posée en Phase 23) et `PhotosConsommables` (insert + list, relation à `consommable_id`) — décision technique, pas de préférence produit exprimée.
- Seuils numériques exacts de dérivation `% usure → état` (D-02) et du seuil de `confiance` qui déclenche `incertain` (D-03) — valeurs raisonnables à fixer en planification, pas un choix produit critique tant que la LOGIQUE de dérivation (D-02/D-03) est respectée.
- Mécanisme exact du seed déterministe (D-04) — hash de l'URL photo, de l'ID consommable, ou combinaison.
- Si un helper de lecture (list/history) pour `RelevesKm` est nécessaire dans cette phase, au-delà de `RelevesKm.enregistrer()` qui existe déjà depuis Phase 23 — le success criteria #4 du ROADMAP mentionne "RelevesKm existent comme helpers CRUD minces", qui pourrait simplement confirmer l'existant plutôt qu'exiger un nouvel ajout. Laissé à la recherche/planification pour trancher selon les besoins réels de Phase 25/27.
- Nom exact des méthodes, structure interne du calcul stub, organisation du code dans `visionAnalysisService.js`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap et requirements
- `.planning/ROADMAP.md` Phase 24 section — 4 success criteria exacts (contrat, flag VISION_ENABLED, testabilité isolée, helpers CRUD)
- `.planning/REQUIREMENTS.md` — VISION-01, VISION-02 (texte exact des requirements)

### Décisions Phase 23 directement pertinentes
- `.planning/phases/23-sch-ma-anti-fraude-km-au-niveau-db/23-CONTEXT.md` — D-01 (pattern RLS service-role-only à répliquer identiquement pour `consommables`/`photos_consommables`), D-02 (pattern `TEXT+CHECK` pour `type_consommable`, déjà posé), rappel que `releves_km` est déjà la source de vérité km avec `RelevesKm.enregistrer()` fonctionnel

### Convention flag-gated à répliquer pour VISION_ENABLED
- `services/emailService.js` (notamment ligne ~22, fallback si clé manquante malgré le flag) — convention exacte `EMAIL_ENABLED`
- `services/pushService.js` (notamment ligne ~20-26, même pattern) — convention exacte `PUSH_ENABLED`

### Pattern CRUD helper de référence
- `supabase.js` ~L1250 (`CataloguePieces`) — style de CRUD helper mince existant à suivre
- `supabase.js` ~L385 (`RelevesKm`) — helper déjà créé en Phase 23, `enregistrer()` disponible

### Contexte projet
- `.planning/PROJECT.md` — décision milestone v1.6 : "Stub IA minimal réaliste (% usure + état + confiance + analyse_status + engine) — contrat verrouillé dès Phase 24 comme le futur contrat réel, pas de vrai appel Anthropic ce milestone"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RelevesKm` (`supabase.js:385`) — objet déjà créé en Phase 23 avec `enregistrer()` fonctionnel et testé (28/28 PASS contre DB live). Cette phase n'a probablement pas besoin de le recréer, seulement de confirmer/compléter s'il manque un helper de lecture.
- `CataloguePieces` (`supabase.js:1250`) — pattern CRUD mince à suivre pour `Consommables`/`PhotosConsommables` (search/getByEan/create — équivalent structurel).
- `services/emailService.js` et `services/pushService.js` — pattern flag-gated + fallback silencieux + warning log, à copier pour `VISION_ENABLED`.

### Established Patterns
- `ENABLED`-flag + fallback console/stub si la clé réelle manque — établi par `EMAIL_ENABLED`/`PUSH_ENABLED`, doit être répliqué à l'identique pour `VISION_ENABLED`.
- `supabase.js` est l'unique frontière d'accès DB — aucun appel `supabase.from(...)` direct dans `motokey-api.js` ni dans `services/visionAnalysisService.js` (celui-ci n'a d'ailleurs pas besoin d'accéder à la DB du tout — il calcule/renvoie une structure, la persistance passe par les helpers `PhotosConsommables`).

### Integration Points
- Les 4 tables Phase 23 (`consommables`, `photos_consommables`, `releves_km`, `releves_km_rejets`) existent en prod depuis 2026-07-14 (migration appliquée) — schéma live et prêt, cette phase est une pure couche JS par-dessus, aucune dépendance DB bloquante.
- `visionAnalysisService.js` n'a aucun endpoint HTTP consommateur dans cette phase (Phase 25 les créera) — doit être appelable et vérifiable directement en isolation (test Node autonome, style `scripts/test-releves-km-trigger.js`).

</code_context>

<specifics>
## Specific Ideas

L'enum `état` (bon/moyen/usé/critique) doit visuellement faire écho au système couleur VERT/BLEU/JAUNE/ROUGE déjà utilisé pour le score anti-fraude moto — cohérence de langage visuel dans toute l'app, pas une coïncidence de nommage.

</specifics>

<deferred>
## Deferred Ideas

- **Vraie clé Anthropic Vision / appel API réel** — différé, explicitement hors scope de ce milestone entier (décision projet v1.6). Cette phase verrouille le CONTRAT (forme, types, enums), pas l'implémentation réelle.
- **Seuils production réels de dérivation** (% usure→état, confiance→incertain) — pourraient être révisés une fois la vraie IA branchée ; seule la FORME du contrat (noms de champs, types, enums) doit rester stable entre stub et réel, c'est le point même du contrat verrouillé (D-01 à D-03).

### Reviewed Todos (not folded)
Aucun todo en attente ne matchait cette phase (`gsd-tools todo match-phase 24` → 0 résultat).

</deferred>

---

*Phase: 24-helpers-supabase-js-contrat-stub-vision*
*Context gathered: 2026-07-14*
