# Phase 27: UI Web Garage + Client (jauges, retrait Pneus legacy) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 27-ui-web-garage-client-jauges-retrait-pneus-legacy
**Areas discussed:** Jauge sans donnée, Style visuel & placement, Cohérence garage vs client

---

## Jauge sans donnée (consommable jamais photographié)

| Option | Description | Selected |
|--------|-------------|----------|
| État "Non renseigné" distinct | Pas de %, badge gris/neutre — honnête, pas de fausse précision | ✓ |
| Estimation 0% (jamais usé) | Traite l'absence de photo comme "neuf" | |
| Estimation via km depuis montage | Reprend l'ancienne logique renderPneus() | |

**User's choice:** État "Non renseigné" distinct.
**Notes:** Cohérent avec le rejet déjà acté du "millimètre de précision" en Out of Scope v1.6.

## Type absent (aucune ligne consommable du tout)

| Option | Description | Selected |
|--------|-------------|----------|
| Même traitement (Non renseigné) | Pas de distinction entre ligne sans photo et ligne inexistante | ✓ |
| Distinction visuelle légère | 2 états séparés à maintenir | |

**User's choice:** Même traitement.

## Maillon faible — traitement des consommables "Non renseigné"

| Option | Description | Selected |
|--------|-------------|----------|
| Exclus du calcul (recommandé) | Ne regarde que les consommables ayant une vraie donnée | ✓ |
| Comptent comme critique | Pousse à la complétude, jauge reste critique tant que non complet | |

**User's choice:** Exclus du calcul.

## Aucune donnée du tout sur la moto

| Option | Description | Selected |
|--------|-------------|----------|
| État neutre "Pas encore suivi" | Pas de %, message invitant à saisir/photographier | ✓ |
| Masquer la jauge générale entièrement | Ne montre la section que si au moins un consommable a une donnée | |

**User's choice:** État neutre "Pas encore suivi".

---

## Style visuel & placement — emplacement onglet garage

| Option | Description | Selected |
|--------|-------------|----------|
| Nouvel onglet remplace "Pneus" | Même emplacement que l'ancien onglet Pneus | ✓ |
| Plié dans l'onglet Infos | Section supplémentaire dans Infos existant | |

**User's choice:** Nouvel onglet remplace "Pneus".

## Style visuel — jauge individuelle

| Option | Description | Selected |
|--------|-------------|----------|
| Barre horizontale + badge couleur (recommandé) | Réutilise score-vert/bleu/jaune/rouge existant | ✓ |
| Anneau/radial | Nouveau composant, pas de précédent | |
| Simple % + puce couleur (compact) | Le plus léger, moins "visuel jauge" | |

**User's choice:** Barre horizontale + badge couleur.

## Style visuel — jauge générale

| Option | Description | Selected |
|--------|-------------|----------|
| Mise en avant en haut, style score-badge existant | Contiguë au badge score anti-fraude | ✓ |
| Intégrée dans la liste, juste en premier | Moins de rupture visuelle | |

**User's choice:** Mise en avant en haut.

## Dashboard garage — indicateur consommables

| Option | Description | Selected |
|--------|-------------|----------|
| Oui, chip similaire à l'alerte entretien | Réutilise alerteEntretienChip() existant | ✓ |
| Non, uniquement dans la fiche détaillée | Dashboard reste focalisé score/alerte entretien | |

**User's choice:** Oui, chip similaire à l'alerte entretien.

---

## Cohérence garage vs client — granularité

| Option | Description | Selected |
|--------|-------------|----------|
| Même granularité (recommandé) | 9 jauges + jauge générale, référence/date incluses | ✓ |
| Vue simplifiée | Sans référence/date de montage réservées au garage | |

**User's choice:** Même granularité.

## Cohérence garage vs client — upload photo côté client

| Option | Description | Selected |
|--------|-------------|----------|
| Oui, bouton photo par consommable | Complète le cycle voir+documenter, cohérent avec CONSO-03 déjà ouvert CLIENT | ✓ |
| Non, lecture seule cette phase | Upload différé à une itération suivante | |

**User's choice:** Oui, bouton photo par consommable.

## Cohérence garage vs client — wording des états

| Option | Description | Selected |
|--------|-------------|----------|
| Oui, même wording (recommandé) | "Bon/Moyen/Usé/Critique" partout | |
| Wording adapté grand public | Termes différents côté client, plus accessible | ✓ |

**User's choice:** Wording adapté grand public.
**Notes:** Exemple illustratif donné : Très bon état / À surveiller / À changer bientôt / À changer maintenant. Libellés exacts laissés à la planification.

---

## Claude's Discretion

- Migration des données Pneus legacy (mapping pneu_av/ar/pneu_km_montage → consommables) — zone proposée mais non sélectionnée pour discussion approfondie ; utilisateur satisfait de l'approche proposée par Claude (voir CONTEXT.md section Claude's Discretion).
- Libellés exacts du wording grand public client (D-11).
- Détail technique de l'exposition backend des données de jauge (nouvel endpoint vs enrichissement existant).
- Mécanisme exact de calcul du "maillon le plus faible" en cas d'égalité.

## Deferred Ideas

Aucune — discussion restée dans le périmètre de la phase.
