# Phase 16: Push Wiring End-to-End - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 16-push-wiring-end-to-end
**Areas discussed:** Devis push trigger point, Soft-ask permission screen, Device token lifecycle

---

## Devis push trigger point

| Option | Description | Selected |
|--------|-------------|----------|
| Add 'Envoyer au client' action | Small backend endpoint (e.g. POST /devis/:id/envoyer, MECANO+) flipping brouillon→envoye, plus a button in app.html's devis UI. Becomes the exact moment sendPush() fires. | ✓ |
| Fire push at raw creation (brouillon) | POST /devis triggers the push immediately at creation — contradicts CLIENT-filters-out-brouillon logic. | |
| Something else | Free-form alternative. | |

**User's choice:** "Ajouter l'action Envoyer au client — c'est la bonne approche"

| Follow-up: UI placement | Description | Selected |
|--------|-------------|----------|
| On the devis list, per-row | Button next to each brouillon devis in the existing list. | ✓ |
| Confirmation prompt right after creation | "Envoyer maintenant ?" modal after Créer le devis succeeds. | |
| Something else | Free-form alternative. | |

**User's choice:** "On the devis list, per-row (recommended)"

| Follow-up: lock after sending | Description | Selected |
|--------|-------------|----------|
| Locked after sending | PUT /devis/:id rejected once envoye — new devis needed to change anything. | ✓ |
| Still editable | Garage can keep editing lignes/remise after sending. | |

**User's choice:** "Locked after sending (recommended)"

**Notes:** This area surfaced a real product gap (not just an implementation-ambiguity question) — no existing code path transitions a devis to `envoye`, discovered by tracing `motokey-api.js`/`supabase.js`/`app.html`. User confirmed building the missing action is in scope for this phase.

---

## Soft-ask permission screen

| Option | Description | Selected |
|--------|-------------|----------|
| Once, right after first login | Shown once per install/session post-login, no nagging on decline. | ✓ |
| After a meaningful first action | Wait until user views first devis/moto. | |
| Every launch until granted/declined | Keep asking each cold start. | |

**User's choice:** "Une seule fois après le premier login."

| Follow-up: visual | Description | Selected |
|--------|-------------|----------|
| Full-screen | Dedicated MotoKey-branded screen before the OS prompt. | ✓ |
| In-context modal/sheet | Bottom-sheet over the Motos tab. | |

**User's choice:** "Full-screen."

| Follow-up: retry after decline | Description | Selected |
|--------|-------------|----------|
| Yes, from Compte tab | "Activer les notifications" entry point re-triggers the flow. | ✓ |
| No retry path this phase | Decline is final until reinstall/OS settings. | |

**User's choice:** "Oui depuis Compte tab."

---

## Device token lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Right after soft-ask accepted | Register immediately once OS grants permission. | ✓ |
| On every login regardless | Re-register every login relying on upsert-reassign. | |

**User's choice:** "Après soft-ask accepté."

| Follow-up: registration failure | Description | Selected |
|--------|-------------|----------|
| Silent retry on next foreground | No user-facing error; retry quietly. | ✓ |
| Show a toast/error | Surface visible error to the user. | |

**User's choice:** "Silent retry au prochain foreground."

| Follow-up: logout behavior | Description | Selected |
|--------|-------------|----------|
| Yes, always | DELETE the current device's token on every logout. | ✓ |
| No, leave it registered | Keep receiving push after logout on this device. | |

**User's choice:** "Oui toujours."

---

## Claude's Discretion

- Deep link / tap-to-navigate behavior (MPUSH-05) — area was not selected for discussion; left to planner default (navigate to Devis tab via expo-router, reuse Phase 15 shell).
- Exact "envoyer" endpoint shape (dedicated route vs. extending PUT) — no user preference expressed.
- RBAC level for the envoyer action — no user preference expressed, recommend matching existing MECANO-minimum devis endpoints.
- `expo-notifications` integration mechanics — implementation detail for research/planner.

## Deferred Ideas

- MPUSH-05 exact cold-start/background/foreground mechanics — not discussed in depth, deferred to planner/executor judgment.
- Proactive dead-token deactivation (punted from Phase 13) — not resolved here, left for planner to scope in or push to Phase 17.
- MPUSH-04 (rappel entretien push) — unchanged, Phase 17.
- Granular notification preference center — out of scope per REQUIREMENTS.md.
