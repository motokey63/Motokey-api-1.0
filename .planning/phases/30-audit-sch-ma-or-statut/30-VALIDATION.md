---
phase: 30
slug: audit-sch-ma-or-statut
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-17
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no jest/pytest/mocha) — ce projet utilise des scripts Node autonomes contre des projets Supabase live/jetables (`scripts/test-*.js`, pattern `scripts/introspect-schema.js`) |
| **Config file** | none — voir Wave 0 |
| **Quick run command** | `node scripts/introspect-or-statut.js` (nouveau script, Pattern 1 de la recherche) |
| **Full suite command** | Identique — cette phase ne modifie aucun code, pas de suite de régression plus large à lancer |
| **Estimated runtime** | ~5 secondes |

---

## Sampling Rate

- **After every task commit:** Run `node scripts/introspect-or-statut.js`
- **After every plan wave:** N/A — phase mono-wave attendue (audit/doc pure)
- **Before `/gsd:verify-work`:** Le doc de réconciliation doit exister et être committé
- **Max feedback latency:** 5 secondes

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | MIGR-02 (critère 1 : valeurs live listées) | smoke/manual-verify | `node scripts/introspect-or-statut.js` | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 1 | MIGR-02 (critère 2 : écart explicite) | manual-only (artefact doc) | N/A — revu par Mehdi/planner | N/A | ⬜ pending |
| 30-01-03 | 01 | 1 | MIGR-02 (critère 3 : plan ordonné documenté) | manual-only | N/A | N/A | ⬜ pending |
| 30-01-04 | 01 | 1 | MIGR-02 (critère 4 : gate Phase 31) | manual/process check | `git log --oneline -- 'sql/migrations/*or_statut*' 'migrations/*or_statut*'` doit rester vide | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/introspect-or-statut.js` — n'existe pas encore, nécessaire pour couvrir le critère 1 de MIGR-02. Extension étroite de la fonction `introspect()` de `scripts/introspect-schema.js` plutôt qu'une construction from-scratch.

*Aucune fixture/conftest nécessaire — ce projet n'a pas de convention de fixture de test partagée au-delà de `.env` + projets Supabase live/jetables.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Table de réconciliation (valeurs réelles vs 7 statuts cibles) | MIGR-02 | Artefact de documentation, pas du code testable machine | Relire le doc produit, confirmer que chaque valeur réelle de l'enum a une ligne explicite (mappée ou marquée question ouverte) |
| Plan d'ordre des `ALTER TYPE ... ADD VALUE` + contraintes transactionnelles | MIGR-02 | Décision d'architecture (ENUM vs TEXT+CHECK), pas vérifiable par une commande | Relire le doc, confirmer que le choix ENUM-patché vs TEXT+CHECK est explicite avec justification |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
