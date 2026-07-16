# Phase 26: Cron de Rappel + Push/Badge - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 26-cron-de-rappel-push-badge
**Areas discussed:** Portée de la notification, Anti-spam / idempotence, Calcul « depuis la dernière photo »
**Area not discussed (Claude's Discretion):** Mécanisme du badge garage (GAUGE-04)

---

## Portée de la notification

| Option | Description | Selected |
|--------|-------------|----------|
| 1 push groupé par moto | Une seule notif par moto reprenant tous les consommables en retard | ✓ |
| 1 push par consommable en retard | Notif séparée par consommable | |

**User's choice:** 1 push groupé par moto (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Non, un seul rappel jusqu'à nouvelle photo | Notifie une fois au franchissement, ne relance pas | ✓ |
| Oui, relance périodique | Renvoie un rappel à intervalle régulier tant que non résolu | |

**User's choice:** Non, un seul rappel jusqu'à nouvelle photo (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Seuil unique 3000km/6mois pour tous | Simple, correspond au texte brut de GAUGE-03 | |
| Seuils différenciés par type de consommable | Plus réaliste mécaniquement | ✓ |

**User's choice:** Seuils différenciés par type de consommable (non-recommandé, choix explicite de l'utilisateur)

**Follow-up — où définir les seuils différenciés :**

| Option | Description | Selected |
|--------|-------------|----------|
| Map en dur dans le code | Objet JS statique dans le service cron, pas de migration | ✓ |
| Nouvelle colonne/table de config en DB | Permet ajustement futur sans redeploy | |

**User's choice:** Map en dur dans le code (recommandé)

**Follow-up — valeurs de la grille :**

| Option | Description | Selected |
|--------|-------------|----------|
| 3000km/6mois pour tous sauf huile+liquide | Grille simplifiée en 3 valeurs | |
| Laisser Claude proposer une grille complète | Proposition détaillée basée sur standards moto | ✓ |

**User's choice:** Laisser Claude proposer une grille complète

Claude a proposé la grille suivante (voir CONTEXT.md D-01), validée sans modification :
pneu_av 3000km/6mois, pneu_ar 2500km/6mois, chaine 3000km/6mois, plaquettes_av 3000km/6mois,
plaquettes_ar 4500km/6mois, disque_av 8000km/12mois, disque_ar 8000km/12mois,
huile_moteur 5000km/6mois, liquide_frein 6000km/12mois.

**Confirmation grille :**

| Option | Description | Selected |
|--------|-------------|----------|
| Oui, valider cette grille | Figer les 9 valeurs dans CONTEXT.md | ✓ |
| Simplifier à 3 paliers | Regrouper en catégories rapide/moyen/lent | |

**User's choice:** Oui, valider cette grille (recommandé)

**Notes:** Écart notable par rapport à la recommandation initiale de Claude (seuil unique) — l'utilisateur a explicitement préféré la granularité par type, jugeant l'usure mécanique suffisamment différenciée pour le justifier.

---

## Anti-spam / idempotence

| Option | Description | Selected |
|--------|-------------|----------|
| Nouvelles colonnes sur consommables | dernier_rappel_envoye_at + dernier_rappel_km, migration légère | ✓ |
| Nouvelle table dédiée | Historique complet, plus lourd | |

**User's choice:** Nouvelles colonnes sur consommables (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| Reset automatique à la prochaine photo | Compteur "depuis dernière photo" repart de zéro à l'INSERT photo | ✓ |
| Comparaison de rang comme maintenanceAlertService | Pattern à 3 paliers répliqué (sur-ingénierie pour cas binaire) | |

**User's choice:** Reset automatique à la prochaine photo (recommandé)

**Continuation check:** Zone suivante sélectionnée (pas de question supplémentaire sur cette zone).

---

## Calcul « depuis la dernière photo »

| Option | Description | Selected |
|--------|-------------|----------|
| date_montage/km_montage comme point de départ | Évite l'angle mort pour consommable jamais photographié | ✓ |
| Ignorer les consommables jamais photographiés | Angle mort volontaire, contraire au but "sans angle mort" du ROADMAP | |

**User's choice:** date_montage/km_montage comme point de départ (recommandé)

| Option | Description | Selected |
|--------|-------------|----------|
| km_montage OU km au moment de la dernière photo | Nouvelle colonne km_a_la_photo sur photos_consommables, précis, pas de jointure coûteuse | ✓ |
| Jointure sur releves_km par date de photo | Évite la colonne mais plus coûteux/approximatif | |

**User's choice:** km_montage OU km au moment de la dernière photo (recommandé)

**Follow-up — cas limite consommable sans aucune référence km :**

| Option | Description | Selected |
|--------|-------------|----------|
| Exclure du calcul tant qu'aucune référence n'existe | Cas normalement impossible grâce à D-05 Phase 25 | ✓ |
| Utiliser uniquement le critère temps dans ce cas | Fallback sur date_montage/created_at seul | |

**User's choice:** Exclure du calcul tant qu'aucune référence n'existe (recommandé)

---

## Claude's Discretion

- Mécanisme exact du badge garage (GAUGE-04) — zone non sélectionnée par l'utilisateur pour discussion approfondie. Confirmé "prêt pour le CONTEXT.md" quand proposé de revenir dessus.
- Nom exact de la route HTTP cron, format du texte du push, payload `data` du push, numéro de migration SQL exact.

## Deferred Ideas

Aucune — discussion restée strictement dans le périmètre de la phase.
