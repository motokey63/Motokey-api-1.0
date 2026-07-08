---
status: resolved
phase: 15-feature-parity-screens
source: [15-VERIFICATION.md]
started: 2026-07-03T22:30:00.000Z
updated: 2026-07-04T08:51:00.000Z
---

## Current Test

[testing paused — 1 item outstanding: Test 2 blocked on devis fixture data]

## Tests

### 1. Motos tab renders couleur-coded score cards, tap navigates to Fiche Moto
expected: Bottom tab bar shows Motos/Devis/Compte; Motos list cards show a score badge colored per couleur_dossier (vert/bleu/jaune/rouge); tapping a card pushes to /motos/[id] showing historique + (conditionally) plan d'entretien + pneus
result: pass

### 2. Devis accept/refuse flow
expected: Accepting an 'envoye' devis (confirm dialog -> Valider) flips its statut pill to Validé and removes the action row; refusing does the equivalent for Refusé
result: blocked
blocked_by: other
reason: "no devis showing in the list yet — test account (test@motokey.fr) has no garage/moto/devis fixture data seeded"

### 3. Fiche Moto plan d'entretien 403 discipline on a real CLIENT session
expected: For a CLIENT-role user, GET /motos/:id/entretien/alertes returns 403 and the Plan d'entretien section is completely absent (no error banner, no empty message)
result: skipped
reason: "moto ne s'affiche pas côté client — même blocage que Test 4 (cession non répercutée), impossible d'ouvrir une Fiche Moto pour tester"

### 4. Add moto / claim moto / leave garage end-to-end
expected: Add-moto form creates a moto that appears in the list; hitting the plan limit hides the form and shows the Passer Pro card; claim-moto (VIN+plaque, no photo UI) creates a réclamation visible in Mes réclamations; Quitter ce garage opens RevokeGarageModal with the verbatim legal notice, and confirms flips the badge to Quitté
result: issue
reported: "réclamation créée, visible dans mes réclamations motokey ; réclamation acceptée depuis l'application garage mais n'apparait pas sur le compte client test@motokey — elle apparait seulement dans l'app garage"
severity: major

### 5. Offline fallback (airplane mode) for Motos/Devis lists
expected: After loading Motos/Devis online once (populating the cache), enabling airplane mode and reopening the tab shows the previously cached list plus an OfflineBanner reading "Dernière mise à jour : DD/MM à HHhMM" instead of an error
result: pass

## Summary

total: 5
passed: 2
issues: 1
pending: 0
skipped: 1
blocked: 1

## Gaps

- truth: "claim-moto (VIN+plaque) creates a réclamation visible in Mes réclamations; once the garage accepts it, the moto is transferred to the client and appears in the client's Motos list"
  status: resolved
  resolved_by: "15-09-PLAN.md (gap closure) — commit 8992398"
  resolution: "Added guarded useFocusEffect (isFirstFocus ref) to mobile-app/app/(app)/(tabs)/motos/index.tsx (and devis/index.tsx for the identical root cause) so the list silently refetches on tab-return. Confirmed via on-device reproduction of the exact UAT Test 4 scenario 2026-07-04: claimed moto now appears on Motos tab focus-return with no manual pull-to-refresh, no regression to initial load or pull-to-refresh."
  reason: "User reported: réclamation créée, visible dans mes réclamations motokey ; réclamation acceptée depuis l'application garage mais n'apparait pas sur le compte client test@motokey — elle apparait seulement dans l'app garage"
  severity: major
  test: 4
  root_cause: "Mobile-app data-freshness bug, not backend. Backend (cessionMoto + GET /motos CLIENT branch) correctly transitions and reads client_id — already proven for the 'garage'-stock case via Flux A. mobile-app/app/(app)/(tabs)/motos/index.tsx only fetches on mount + manual pull-to-refresh, with no useFocusEffect — so returning to the Motos tab after the garage accepts (on a separate session) never re-triggers GET /motos, leaving the client stuck on the stale pre-claim list."
  artifacts:
    - path: "mobile-app/app/(app)/(tabs)/motos/index.tsx"
      issue: "Missing refetch-on-focus (useFocusEffect) — list only loads on mount and manual pull-to-refresh"
  missing:
    - "Add useFocusEffect (expo-router/@react-navigation/native) in motos/index.tsx to call load() whenever the screen regains focus"
  debug_session: ".planning/debug/reclamation-accepted-not-visible-client.md"
