# Phase 24: Helpers supabase.js + Contrat Stub Vision - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 24-helpers-supabase-js-contrat-stub-vision
**Areas discussed:** Forme exacte du contrat stub, Réalisme du stub, Simulation d'échec/incertitude

---

## Forme exacte du contrat stub

| Option | Description | Selected |
|--------|-------------|----------|
| Entier 0-100 | Simple, direct pour l'affichage jauges | ✓ |
| Décimal 1 chiffre | Plus précis, proche d'une vraie API Vision | |

**Question:** % usure : quel format ?
**User's choice:** Entier 0-100

| Option | Description | Selected |
|--------|-------------|----------|
| 4 niveaux (bon/moyen/usé/critique) | Aligné avec système couleur VERT/BLEU/JAUNE/ROUGE existant | ✓ |
| 3 niveaux (bon/à surveiller/à remplacer) | Plus simple, orienté action garage | |

**Question:** état : quelles valeurs exactes dans l'enum ?
**User's choice:** 4 niveaux (bon/moyen/usé/critique)

| Option | Description | Selected |
|--------|-------------|----------|
| Décimal 0-1 | Convention standard ML/Vision APIs | |
| Entier 0-100 | Cohérent avec % usure, plus simple à afficher | ✓ |

**Question:** confiance : quelle échelle ?
**User's choice:** Entier 0-100

| Option | Description | Selected |
|--------|-------------|----------|
| Indépendants | Deux champs distincts, pas de logique de dérivation | |
| Confiance basse → incertain | Logique dérivée cohérente avec un vrai moteur Vision | ✓ |

**Question:** confiance et analyse_status sont-ils liés ?
**User's choice:** Confiance basse → incertain

**Notes:** Ces 4 réponses verrouillent D-01 (types/enums exacts) et D-03 (dérivation confiance→analyse_status) dans CONTEXT.md.

---

## Réalisme du stub

| Option | Description | Selected |
|--------|-------------|----------|
| Fixe (canned) | Toujours la même réponse, prévisible mais jauges "mortes" en démo | |
| Pseudo-aléatoire | Varie à chaque appel, plus proche de l'expérience finale | ✓ |

**Question:** Le stub renvoie-t-il toujours la même valeur, ou varie-t-il ?
**User's choice:** Pseudo-aléatoire

| Option | Description | Selected |
|--------|-------------|----------|
| Liée au km parcouru | % usure calculé approximativement depuis km_montage vs km actuel | ✓ |
| Totalement aléatoire | Random sans lien avec les données de la moto | |

**Question:** Si pseudo-aléatoire, sur quoi la variation se base-t-elle ?
**User's choice:** Liée au km parcouru

| Option | Description | Selected |
|--------|-------------|----------|
| Toujours différent | Nouvelle valeur à chaque appel, même sur la même photo | |
| Déterministe par photo (seed=photo_url ou id) | Même input = même résultat, reproductible | ✓ |

**Question:** Même photo/consommable appelé 2x : même résultat ou ça change à chaque fois ?
**User's choice:** Déterministe par photo (seed=photo_url ou id)

| Option | Description | Selected |
|--------|-------------|----------|
| Reflète le % usure calculé | État dérivé directement, cohérent, pas de logique séparée | ✓ |
| Biaisée vers 'bon' | Évite les fausses alertes visuelles en dev | |

**Question:** Distribution de l'état stub : biaisée vers 'bon' par défaut, ou reflète fidèlement le % usure calculé ?
**User's choice:** Reflète le % usure calculé

**Notes:** Ces 4 réponses verrouillent D-04 (réalisme/déterminisme) et D-02 (dérivation état←%usure) dans CONTEXT.md.

---

## Simulation d'échec/incertitude

| Option | Description | Selected |
|--------|-------------|----------|
| Jamais en mode stub | 'echec' n'apparaît qu'avec la vraie IA Vision | ✓ |
| Simulé rarement | Permet de tester la branche d'échec dès Phase 25/27 | |

**Question:** Le stub simule-t-il parfois analyse_status='echec' ?
**User's choice:** Jamais en mode stub

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback silencieux vers stub | Même convention EMAIL_ENABLED/PUSH_ENABLED, jamais de crash | ✓ |
| Erreur explicite au démarrage | Refuse de démarrer si config incohérente | |

**Question:** Si VISION_ENABLED=true mais la clé Anthropic n'est PAS configurée : que fait analyzePhoto() ?
**User's choice:** Fallback silencieux vers stub

**Notes:** Ces 2 réponses verrouillent D-05 (echec jamais simulé) et D-06 (fallback config incohérente) dans CONTEXT.md.

---

## Claude's Discretion

- Méthodes CRUD exactes pour Consommables (create vs upsert) et PhotosConsommables (insert + list) — zone grise proposée mais non sélectionnée par l'utilisateur pour discussion, laissée à la planification.
- Seuils numériques exacts (% usure→état, seuil confiance→incertain).
- Mécanisme exact du seed déterministe.
- Nécessité d'un helper de lecture RelevesKm au-delà de enregistrer() existant.

## Deferred Ideas

- Vraie clé Anthropic Vision / appel API réel — hors scope de ce milestone entier (déjà noté au niveau projet, pas une nouvelle décision de cette session).
