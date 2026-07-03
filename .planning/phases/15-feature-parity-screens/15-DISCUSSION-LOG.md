# Phase 15: Feature-Parity Screens - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 15-feature-parity-screens
**Areas discussed:** Périmètre liaison garage (MPARITY-04), Structure de navigation mobile, Contenu de la fiche moto, Cache offline lecture-seule (MPARITY-05)

---

## Périmètre « liaison garage » (MPARITY-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Réclamer une moto | Réclamation VIN+photo, correspond à "revendiquer" | ✓ |
| Quitter un garage | Révocation avec motif optionnel, correspond à "révoquer" | ✓ |
| Ajouter une moto manuellement | Formulaire libre, pas nommé explicitement dans MPARITY-04 | ✓ |

**User's choice:** All three flows in scope.
**Notes:** None additional.

### Follow-up: Photo réclamation

| Option | Description | Selected |
|--------|-------------|----------|
| Même comportement désactivé | Mirror web's disabled CLOUDINARY_CLOUD state | ✓ |
| Activer l'upload photo natif | New camera/Cloudinary integration | |

**User's choice:** Même comportement désactivé (recommended).

---

## Structure de navigation mobile

| Option | Description | Selected |
|--------|-------------|----------|
| Tab bar en bas (motos/devis/compte) | 3 tabs, secondary flows via stack from Motos | ✓ |
| Miroir exact du web (5 onglets + devis séparé) | Reproduces web's 5-tab structure | |
| Tab bar minimaliste (Motos/Devis) + tout en stack | 2 tabs only | |

**User's choice:** Tab bar en bas (motos/devis/compte).

### Follow-up: Fiche moto navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Écran dédié « Fiche moto » | Stack push to detail screen | ✓ |
| Carte expansible inline (comme le web) | Inline expansion in the list | |

**User's choice:** Écran dédié « Fiche moto » (recommended).

### Follow-up: Placement des flux secondaires

| Option | Description | Selected |
|--------|-------------|----------|
| Depuis l'onglet Motos (bouton/menu en haut) | Stack push from Motos tab | ✓ |
| Depuis l'onglet Compte | Lives in Compte/Paramètres instead | |

**User's choice:** Depuis l'onglet Motos.

---

## Contenu de la fiche moto

| Option | Description | Selected |
|--------|-------------|----------|
| Parité complète : historique + plan + pneus | All 3 sections, matching web's moto card | ✓ |
| Historique uniquement (MPARITY-03 strict) | Interventions list only | |

**User's choice:** Parité complète (recommended).

---

## Cache offline lecture-seule (MPARITY-05)

**Notes:** Initially not selected as a discussion area; user chose to discuss it after being offered the choice between discussing now vs. Claude's discretion.

### Détection hors-ligne

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback sur échec réseau | Reuse apiFetch's existing network-error catch | ✓ |
| Détection proactive via NetInfo | New @react-native-community/netinfo dependency | |

**User's choice:** Fallback sur échec réseau (recommended).

### Périmètre du cache

| Option | Description | Selected |
|--------|-------------|----------|
| Motos + devis dans AsyncStorage | Narrow cache scope, reuse existing dependency | ✓ |
| Tout cacher (motos+devis+réclamations+garages) | Broader offline coverage | |

**User's choice:** Motos + devis dans AsyncStorage (recommended).

---

## Claude's Discretion

- AsyncStorage key naming / cache invalidation strategy
- Tab bar icon library/visual treatment
- Exact Expo Router file/route structure for new screens
- Compte tab scope: minimal placeholder (email + logout, Phase 14 parity) rather than full profile-edit/change-password UI, since that's not an MPARITY requirement — inferred from context, not directly asked as a standalone question (bundled into the navigation discussion)

## Deferred Ideas

- Real Cloudinary photo upload for moto claims — matches web's own current disabled state, revisit together in a future phase
- Proactive network detection (NetInfo) — deferred in favor of simpler fallback-on-failure
- Full profile-edit/change-password UI in Compte tab — not an MPARITY requirement
