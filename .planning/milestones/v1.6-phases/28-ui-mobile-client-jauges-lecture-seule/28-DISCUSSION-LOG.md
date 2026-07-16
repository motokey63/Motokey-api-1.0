# Phase 28: UI Mobile Client (jauges, lecture seule) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-16
**Phase:** 28-ui-mobile-client-jauges-lecture-seule
**Areas discussed:** Placement des jauges, Sort de la section Pneumatiques legacy, Précision du deep-link notification, Style visuel des jauges mobile

---

## Placement des jauges dans l'app

| Option | Description | Selected |
|--------|-------------|----------|
| Section inline dans motos/[id].tsx | Nouvelle section dans l'écran fiche moto existant, à côté de Historique/Plan d'entretien | ✓ |
| Écran dédié séparé | Nouvelle route motos/[id]/consommables.tsx avec sa propre navigation | |

**User's choice:** Section inline (recommandé)
**Notes:** Cohérent avec le pattern déjà en place (une seule page scrollable par moto), et avec D-09 Phase 27 (client web = même granularité que garage).

---

## Sort de la section Pneumatiques legacy

| Option | Description | Selected |
|--------|-------------|----------|
| Remplacer par les jauges, avec fallback | Section legacy retirée, remplacée par jauges pneu_av/pneu_ar avec fallback "Non renseigné" si migration prod pas encore appliquée | ✓ |
| Garder les deux temporairement | Affiche l'ancienne section ET les nouvelles jauges jusqu'à confirmation Mehdi de la migration | |
| Ne rien changer | Section Pneumatiques inchangée, jauges ajoutées séparément | |

**User's choice:** Remplacer par les jauges, avec fallback (recommandé)
**Notes:** Migration `sql/migrations/25_migrate_pneus_to_consommables.sql` pas encore appliquée en prod au moment de cette phase (Known Gap). Fallback "Non renseigné" évite la perte d'info silencieuse pendant la fenêtre de transition.

---

## Précision du deep-link notification

| Option | Description | Selected |
|--------|-------------|----------|
| Atterrir sur la fiche moto (jauges inline visibles) | router.push vers motos/[id] suffit, aucun changement backend/mapNotificationDataToRoute() | ✓ |
| Scroller/mettre en avant la section jauges au chargement | Paramètre highlight ajouté côté mobile uniquement | |
| Nouveau type de notif distinct côté backend | type:'consommable_rappel' au lieu de 'moto_entretien' | |

**User's choice:** Atterrir sur la fiche moto (recommandé)
**Notes:** Puisque les jauges vivent désormais inline sur la même page (décision Placement ci-dessus), aucun changement backend n'est nécessaire — reste strictement dans le périmètre "UI Mobile Client" de la phase.

---

## Style visuel des jauges mobile

| Option | Description | Selected |
|--------|-------------|----------|
| Barre horizontale + badge | Nouveau composant GaugeBar, cohérent avec D-06 Phase 27 (web) | ✓ |
| Badge seul (StatutBadge réutilisé) | Pas de nouveau composant, juste un StatutBadge par consommable | |

**User's choice:** Barre horizontale + badge (recommandé)
**Notes:** Cohérence visuelle garage/client/mobile — même lecture qu'en web (barre + couleur dérivée de l'état).

---

## Claude's Discretion

- Emplacement exact de la nouvelle section dans l'ordre des sections existantes
- Détail du fetch (4ème appel Promise.all)
- Nom exact du composant GaugeBar et sa localisation

## Deferred Ideas

- Nouveau type de notification backend distinct (`consommable_rappel`) — évoqué comme option pour le deep-link, explicitement écarté comme hors périmètre de cette phase. À reconsidérer si le besoin de distinguer statistiquement les deux origines de push se confirme dans une phase future.
