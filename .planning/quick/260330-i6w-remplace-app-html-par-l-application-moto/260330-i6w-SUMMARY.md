# Quick Task 260330-i6w — Summary

**Task:** Remplace app.html par l'application MotoKey complète
**Date:** 2026-03-30
**Commit:** fcbd038

## What Was Done

### Task 1 — app.html complet (582 lignes)
- Écran de login (email + password, POST /auth/login, Bearer token)
- Dashboard : grille 3 colonnes, cartes motos avec score/couleur, barre de recherche live (marque/modèle/plaque/client)
- Fiche moto : détail moto sélectionnée OU formulaire création (saveMoto → POST /motos)
- Entretien : plan constructeur (GET /motos/:id/entretien) + formulaire ajout intervention (saveInter → POST /motos/:id/interventions)
- Pneus : calcul km depuis montage, alerte si > 8000 km
- Devis : liste (GET /devis) + création avec lignes dynamiques (POST /devis)

### Task 2 — Embarquement + git push
- HTML embarqué dans motokey-api.js via JSON.stringify (const _APP_HTML)
- git push → Railway redéploie automatiquement

## Verification
- PASS: toutes sections présentes (auth/login, motos, interventions, devis, f0f2f5, pneu, Bearer)
- PASS: HTML embarqué dans motokey-api.js
- Credentials test: garage@motokey.fr / motokey2026
