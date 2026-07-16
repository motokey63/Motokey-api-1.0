# Phase 27: UI Web Garage + Client (jauges, retrait Pneus legacy) - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Le garage (`app.html`) et le client (`MotoKey_Client.html`) voient une jauge % par consommable (9 types) et une jauge générale égale au consommable en plus mauvais état (jamais une moyenne). Les données `pneu_av`/`pneu_ar`/`pneu_km_montage` legacy sont migrées vers des lignes `consommables`, la section Pneus legacy (onglet fiche moto + code mort associé) est retirée, et `CLAUDE.md` est corrigé pour refléter l'état réel du code.

Aucun nouvel appel IA réel, aucun nouveau type de consommable, aucune capture photo côté mobile (hors scope, voir PROJECT.md Out of Scope) — uniquement l'affichage web des données déjà produites par les Phases 23-26.

</domain>

<decisions>
## Implementation Decisions

### Jauge sans donnée (consommable jamais photographié / jamais saisi)
- **D-01:** Un consommable sans photo ET sans saisie mécano (`km_montage` NULL, ou aucune ligne `consommables` du tout pour ce type) affiche un état **"Non renseigné"** distinct — badge neutre/gris, pas de %. Pas de fausse précision (0% "neuf" ou estimation par km seraient trompeurs), cohérent avec le rejet déjà acté en v1.6 Out of Scope du "millimètre de précision sur une photo non calibrée".
- **D-02:** Aucune distinction visuelle entre "ligne consommable existe mais sans photo" et "aucune ligne du tout" — même badge "Non renseigné" dans les deux cas. Simplicité : l'utilisateur voit la même chose (rien de fiable à afficher) sans avoir à interpréter une nuance supplémentaire.
- **D-03:** La jauge générale (maillon le plus faible) **exclut** les consommables "Non renseigné" du calcul — seuls les consommables ayant une vraie donnée (photo/analyse) participent au minimum. Un consommable jamais suivi ne doit jamais faire chuter artificiellement la jauge générale à 0/critique.
- **D-04:** Si **aucun** consommable de la moto n'a de donnée (moto neuve dans le système, migration pas encore faite), la jauge générale affiche un état neutre **"Pas encore suivi"** — pas de %, message invitant à saisir/photographier. Jamais un 0/100 ou 100/100 trompeur.

### Style visuel & placement
- **D-05:** Les jauges vivent dans un **nouvel onglet de la fiche moto garage** qui remplace l'onglet "Pneus" existant (tabDefs `app.html:894-899` : Infos / **Consommables** / Carnet d'entretien / OR liés) — même emplacement que l'ancien onglet Pneus, transition naturelle.
- **D-06:** Chaque jauge individuelle = **barre horizontale + badge couleur**, réutilisant les classes CSS déjà en place (`score-vert`/`score-bleu`/`score-jaune`/`score-rouge` dans `app.html` ; `.vert`/`.bleu`/`.jaune`/`.rouge` dans `MotoKey_Client.html`) — barre remplie à `pct_usure`%, couleur dérivée de `etat` (mapping déjà verrouillé Phase 24 D-01 : bon/moyen/usé/critique ↔ vert/bleu/jaune/rouge).
- **D-07:** La jauge générale (maillon le plus faible) est **mise en avant en haut** de l'onglet, dans le même style que le badge score/couleur déjà affiché dans l'onglet Infos (`app.html:943`) — contiguë visuellement au badge score anti-fraude existant, lecture rapide en un coup d'œil, distincte des 9 jauges de détail listées en dessous.
- **D-08:** Le dashboard garage (liste des motos, `renderDashboard()`) affiche aussi un **chip consommables**, réutilisant le pattern `alerteEntretienChip()` déjà existant (`app.html:805-811`, badge rouge/jaune) — cohérent avec le fait que `GAUGE-04`/`consommables_en_retard` est déjà exposé côté backend (`Motos.list()`) depuis Phase 26.

### Cohérence garage / client
- **D-09:** Le client (`MotoKey_Client.html`) voit la **même granularité** que le garage : les 9 jauges par type + la jauge générale, y compris référence/date de montage quand disponibles — cohérent avec le principe de transparence déjà en place (le client voit déjà son score et ses interventions en détail, pas de vue tronquée ailleurs dans l'app).
- **D-10:** Le client a un **bouton "Ajouter une photo" par jauge/consommable** — l'upload CONSO-03 existe déjà côté backend et est déjà ouvert au rôle CLIENT depuis Phase 25 ; cette phase câble ce bouton en UI web client (pas juste l'affichage passif des jauges).
- **D-11:** Le wording des 4 états est **adapté grand public côté client**, différent du wording technique garage (`bon`/`moyen`/`usé`/`critique`). Direction confirmée par l'utilisateur, libellés exacts laissés à la planification — exemple illustratif donné en discussion : *Très bon état / À surveiller / À changer bientôt / À changer maintenant*. Le contrat de données sous-jacent (`etat` enum bon/moyen/usé/critique) ne change pas — seul le label affiché côté client diffère du label affiché côté garage.

### Claude's Discretion
- **Migration des données Pneus legacy (zone non discutée, utilisateur satisfait de l'approche proposée)** : `pneu_av`/`pneu_ar` (texte libre) + `pneu_km_montage` (une seule valeur partagée avant/arrière, jamais séparée) migrent vers 2 lignes `consommables` (`type_consommable='pneu_av'` et `'pneu_ar'`), chacune avec le même `km_montage` approximatif (seule donnée disponible) et `reference` = le texte libre existant. `date_montage` reste NULL (jamais stockée historiquement). Migration en script SQL versionné appliqué manuellement par Mehdi via Supabase Dashboard, comme toutes les migrations précédentes du milestone.
- Libellés exacts du wording grand public client (D-11) — la direction est verrouillée, la formulation précise (4 chaînes de caractères) est laissée à la planification.
- Détail technique de l'exposition backend des données de jauge (nouvel endpoint dédié `GET /motos/:id/consommables` vs enrichissement de `GET /motos/:id` existant) — aucune donnée pct_usure/etat par consommable n'est actuellement exposée par un endpoint HTTP (seul un booléen `rappel_photo_en_retard` existe depuis Phase 26). C'est un choix d'implémentation qui ne change pas le résultat visible pour l'utilisateur — laissé à la recherche/planification.
- Mécanisme exact de calcul du "maillon le plus faible" (ex: trier par `pct_usure` croissant vs `etat` le plus sévère en cas d'égalité de type) — la RÈGLE (jamais une moyenne, exclusion des "Non renseigné") est verrouillée (D-03), le détail d'implémentation est laissé à la planification.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Contrat de données / backend existant
- `services/visionAnalysisService.js` — contrat `analyzePhoto()` verrouillé (pct_usure/etat/confiance/analyse_status/engine), mapping état→couleur (D-01 Phase 24, ligne ~89)
- `services/consommableRappelService.js` — `isConsommableEnRetard()`, seuils différenciés par type (D-01 Phase 26), `SEUILS`/`LABELS`
- `supabase.js` (lignes 240-326, 1374-1450) — `Motos.list()`/`Motos.getById()` (GAUGE-04, `rappel_photo_en_retard`/`consommables_en_retard`), `Consommables.upsert()`/`listByMoto()`, `PhotosConsommables.insert()`/`listByConsommable()`, `TYPES_CONSOMMABLES` (9 types)
- `motokey-api.js` (lignes ~1098-1126, ~733) — endpoints existants CONSO-01 (PATCH/POST consommables), CONSO-03 (upload photo multipart)

### Schéma DB
- `schema.sql` (lignes 253-255) — colonnes legacy `pneu_av`/`pneu_ar` (TEXT), `pneu_km_montage` (INTEGER, valeur unique partagée)
- `schema.sql` (ligne ~565) — `type_consommable` CHECK constraint (9 types v1)
- `sql/migrations/13_liaison_client_moto.sql` — `proprietaire_type_enum`, utilisé par GAUGE-04 (`proprietaire_type IN ('garage','inconnu')`)

### Code frontend existant (patterns à réutiliser)
- `app.html` (lignes 71-74) — classes CSS `.score-vert`/`.score-bleu`/`.score-jaune`/`.score-rouge`
- `app.html` (lignes 803-816) — `scoreDot()`, `scoreLabel()`, `alerteEntretienChip()` (pattern à répliquer pour le chip consommables dashboard, D-08)
- `app.html` (lignes 892-918, 929-989) — `renderFiche()`, `tabDefs`, `renderFicheTabContent()` (structure à onglets, D-05)
- `app.html` (lignes 1148-1177) — `renderPneus()`/`loadPneus()`/`changerMotoPneus()` : code à **retirer** (legacy)
- `app.html` (ligne 749) — routeur `nav()` : branche `else if (section === 'pneus')` à retirer
- `app.html` (ligne 837) — `labels` map `highlightNav()` : entrée `pneus` à retirer
- `MotoKey_Client.html` (lignes 90-127) — classes CSS `.score-num.vert/bleu/jaune/rouge`, `.interv-badge.*`, `.plan-statut.*`
- `MotoKey_Client.html` (lignes 609-689) — `renderMotoCard()`, section `pneusHtml` (lignes 653-661) à **remplacer** par la section jauges

### Documentation à corriger
- `CLAUDE.md` (lignes 83-84) — section "Pneus" actuellement fausse : affirme que `renderPneus()` "a été supprimée", alors qu'elle existe toujours (`app.html:1148`), accessible via l'onglet fiche moto `ficheTab: 'pneus'`. À corriger après le retrait effectif du code.
- `.planning/REQUIREMENTS.md` — texte exact GAUGE-01, GAUGE-02, CONSO-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Classes CSS couleur déjà en place dans les deux fichiers (`score-vert/bleu/jaune/rouge` côté garage, `.vert/.bleu/.jaune/.rouge` côté client) — pas de nouvelle palette à créer, juste réutiliser
- `alerteEntretienChip()` (app.html) — pattern direct à copier pour le chip consommables dashboard (D-08)
- Pattern `moto-section` (MotoKey_Client.html) déjà utilisé pour "Pneumatiques" (à remplacer) et "Plan d'entretien" — même structure HTML à réutiliser pour la section jauges

### Established Patterns
- Le mapping `etat` (bon/moyen/usé/critique) → couleur (vert/bleu/jaune/rouge) est déjà verrouillé côté contrat de données (Phase 24 D-01) — le frontend n'a qu'à consommer, pas à redéfinir
- `Motos.list()`/`Motos.getById()` font déjà un enrichissement au read-time (lazy require de `consommableRappelService` pour éviter un cycle d'import) — même pattern à suivre si un enrichissement pct_usure/etat par consommable est ajouté à ces fonctions

### Integration Points
- Fiche moto garage : nouvel onglet dans `tabDefs`/`renderFicheTabContent()` (`app.html`)
- Dashboard garage : `renderDashboard()` / `alerteEntretienChip()` (`app.html`)
- Carte moto client : `renderMotoCard()`, remplace `pneusHtml` (`MotoKey_Client.html`)
- Aucun endpoint HTTP actuel n'expose `pct_usure`/`etat` par consommable — seul le booléen `rappel_photo_en_retard` existe (Phase 26). Point d'intégration à créer/étendre en recherche/planification (voir Claude's Discretion).

</code_context>

<specifics>
## Specific Ideas

- Exemple illustratif de wording grand public donné en discussion (D-11) : *Très bon état / À surveiller / À changer bientôt / À changer maintenant* — à affiner en planification, direction confirmée.
- La jauge générale doit être visuellement contiguë au badge score/couleur anti-fraude déjà affiché dans l'onglet Infos (D-07) — pas une section séparée sans lien visuel.

</specifics>

<deferred>
## Deferred Ideas

Aucune — la discussion est restée dans le périmètre de la phase (jauges + retrait Pneus legacy). Rien n'a été identifié comme nouvelle capacité hors scope.

</deferred>

---

*Phase: 27-ui-web-garage-client-jauges-retrait-pneus-legacy*
*Context gathered: 2026-07-15*
