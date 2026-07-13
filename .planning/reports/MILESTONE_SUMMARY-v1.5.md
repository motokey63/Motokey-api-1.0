# Milestone v1.5 — Project Summary

**Generated:** 2026-07-13
**Purpose:** Team onboarding and project review

---

## 1. Project Overview

MotoKey est un système de gestion de garage moto (DMS) pour Garage Motolab. Concept "3ème clé digitale" : chaque moto a un passeport numérique avec statut couleur (VERT/BLEU/JAUNE/ROUGE), score d'entretien /100, protections anti-fraude et transfert de propriété. Les garages gèrent les motos, les ordres de réparation et les devis ; les clients accèdent à l'historique de leur moto via `MotoKey_Client.html` (web) et, depuis v1.3, via une app mobile native (React Native/Expo) avec notifications push. Les garages souscrivent à un abonnement Stripe (Solo/Atelier/Concession) avec enforcement de quotas.

**Core value:** le score d'intégrité anti-fraude (pondération 1.0/0.6/0.3 selon la preuve — facture/visuel/déclaré) — sans lui, MotoKey est un simple DMS ; avec lui, c'est une preuve de valeur vérifiable à la revente.

**v1.5 scope:** contrairement aux milestones précédents, v1.5 (Résolution dérive schema.sql) est **100% dette d'ingénierie** — aucune fonctionnalité utilisateur livrée. Décision explicite de Mehdi (2026-07-09) : combler la dérive schema.sql avant tout nouveau feature. Les 3 phases (20→22) sont complètes et vérifiées.

## 2. Architecture & Technical Decisions

- **Découverte et correction d'une dérive de schéma non documentée** — des colonnes existaient en prod sur `garages`/`clients`/`interventions`/`devis` sans fichier de migration correspondant (découvert en Phase 19/v1.4). v1.5 catalogue, trace l'origine et rapatrie ces 39 colonnes (Gap A) + 4 tables/1 vue des migrations 13/15 jamais reportées (Gap B) dans `schema.sql`.
  - **Why:** un `schema.sql` fiable est le seul moyen de bootstrapper un nouvel environnement Supabase sans deviner l'état réel de prod.
  - **Phase:** 20-22

- **Corrélation d'origine via `git log -S` (pickaxe) + confirmation humaine pour les cas indéterminables** — chaque colonne non documentée a été recherchée dans l'historique git ; celles sans trace ont reçu un verdict terminal "INCONNU/OUBLIÉ" après confirmation de Mehdi, plutôt que de bloquer la phase sur une recherche indéfinie.
  - **Why:** évite une boucle de recherche ouverte ; accepter l'incertitude documentée vaut mieux qu'un blocage.
  - **Phase:** 20

- **Migrations rétroactives numérotées (20-22) comme piste d'audit, jamais destinées à être rejouées** — `schema.sql` porte directement les colonnes ; les fichiers de migration ne documentent que la provenance.
  - **Why:** séparer "l'état réel du schéma" (schema.sql) de "l'historique de comment on y est arrivé" (migrations).
  - **Phase:** 21

- **RLS résolu par sonde REST live plutôt que supposé** — pour les 4 nouvelles tables Gap B, une requête REST anon-equivalent a confirmé RLS ON / default-deny en comparant contre une table calibrée (`garages`), au lieu de deviner l'état.
  - **Why:** une hypothèse fausse sur la sécurité RLS est un risque silencieux.
  - **Phase:** 21

- **Vérification bootstrap "live", pas seulement grep/diff** — Phase 22 exécute réellement `schema.sql` contre un projet Supabase neuf (connexion `pg` directe, script committé `bootstrap-fresh-schema.js`), au lieu de se fier à une inférence structurelle.
  - **Why:** les phases 19-21 avaient utilisé des checks grep/diff qui ont raté un vrai drift (`billing_events.created_at`) — seule une exécution réelle l'a détecté.
  - **Phase:** 22

- **`schema.sql` header réécrit sans revendiquer une fausse parité complète** — Gap A/B marqués RÉSOLU, mais la limite hors-scope (~19 tables OR/billing/PDP/auth client) reste explicitement documentée comme non couverte.
  - **Why:** honnêteté du statut du fichier — ne pas prétendre à plus que ce qui est vérifié.
  - **Phase:** 22

## 3. Phases Delivered

| Phase | Name | Status | One-Liner |
|-------|------|--------|-----------|
| 20 | Introspection & Corrélation d'Origine | ✅ Complete | 39 colonnes non documentées cataloguées avec type exact et origine (git ou Mehdi) — clients résolu via une migration legacy oubliée, 9 colonnes fantômes (2 confirmées, 7 terminales INCONNU) |
| 21 | Migrations Rétroactives & Mise à Jour schema.sql | ✅ Complete | 3 migrations rétroactives (20-22) + `schema.sql` mis à jour pour Gap A (39 colonnes) et Gap B (4 tables + 1 vue, RLS vérifié par sonde live) |
| 22 | Vérification Bootstrap & Nettoyage Header | ✅ Complete | Bootstrap réel contre un projet Supabase neuf confirmé propre (`SCHEMA_BOOTSTRAP_OK`), drift `billing_events.created_at` détecté et corrigé, header `schema.sql` réécrit |

## 4. Requirements Coverage

- ✅ **SCHEMA-02**: Chaque colonne non documentée identifiée avec type exact, contraintes, nullabilité — Phase 20
- ✅ **SCHEMA-03**: Chaque colonne corrélée à son origine via l'historique git — Phase 20
- ✅ **SCHEMA-04**: Migrations rétroactives numérotées (20+) avec commentaire d'origine — Phase 21
- ✅ **SCHEMA-05**: `schema.sql` mis à jour avec les colonnes Gap A — Phase 21
- ✅ **SCHEMA-06**: `billing_events` + objets migration 13 ajoutés à `schema.sql` — Phase 21
- ✅ **SCHEMA-07**: Bootstrap vérifié propre + header nettoyé — Phase 22

**Coverage: 6/6 requirements satisfied, 0 orphaned, 0 unsatisfied.**

**Audit verdict (v1.5-MILESTONE-AUDIT.md, 2026-07-11):** `status: tech_debt` — aucun blocage, 6/6 requirements satisfaits, 3/3 phases vérifiées passées, 4/4 liens d'intégration câblés, 1/1 flow E2E (cycle de vie du schéma) complet et vérifié en live. Recommandation : proceed to complete-milestone, dette technique non-bloquante à reporter dans le backlog.

## 5. Key Decisions Log

- **Verdict terminal INCONNU/OUBLIÉ accepté pour les colonnes fantômes indéterminables** (7 colonnes) — ni git ni Mehdi n'ont pu déterminer l'origine ; bloquer la phase sur une recherche indéfinie n'aurait rien apporté. *(Phase 20)*
- **`ville`/`cp` sur `garages` confirmées par Mehdi** comme un découpage d'adresse structuré, préparé mais jamais câblé — corroboré par une vraie donnée prod (Clermont-Ferrand/63000). *(Phase 20)*
- **10 colonnes `devis` obsolètes supprimées de `schema.sql`** (jamais écrites par le code, confirmé par grep dans `supabase.js`) après décision explicite de Mehdi ("Oui, nettoyer aussi"). *(Phase 21)*
- **Deux FK hors-scope (`factures_scannees`, `entites_facturation`) ajoutées comme colonnes sans `REFERENCES`** — les tables cibles ne font pas partie du bootstrap de `schema.sql`, une vraie FK casserait un bootstrap neuf. *(Phase 21)*
- **`sb_publishable_`/`sb_secret_`** (nouveau format de clé API Supabase) bloque `introspect-schema.js --compare` sur les projets neufs — contourné par une comparaison directe `information_schema` via `pg`, sans modifier l'outil committé (qui reste correct pour les projets à clé JWT legacy). *(Phase 22)*
- **Drift `billing_events.created_at` corrigé dans le scope de SCHEMA-07** plutôt que différé — la comparaison fraîche-vs-prod l'exigeait explicitement. Origine indéterminée documentée avec la même convention que les colonnes fantômes de Phase 20. *(Phase 22)*
- **Dette d'ingénierie pure avant tout nouveau feature (tout le milestone v1.5)** — décision Mehdi du 2026-07-09 : la dérive schema.sql devait être close avant toute fonctionnalité utilisateur.

## 6. Tech Debt & Deferred Items

D'après `v1.5-MILESTONE-AUDIT.md` (status: `tech_debt`, non-bloquant) :

- `sql/migrations/21_interventions_undocumented_columns.sql` documente la contrainte CHECK `niveau_preuve` en commentaire mais ne l'applique pas dans son propre DDL — seul `schema.sql` porte la contrainte réelle. Rejouer cette migration seule sur un environnement plus ancien ne recréerait pas la contrainte.
- `sql/migrations/15_billing_foundation.sql` (antérieure à ce milestone) n'a jamais été rétro-portée avec la colonne `billing_events.created_at` découverte et corrigée en Phase 22 — même classe de problème que ci-dessus.
- Aucun `README.md`/`.env.example` ne documente la nouvelle chaîne de vérification `clone → bootstrap-fresh-schema.js → introspect-schema.js --compare`.
- `scripts/bootstrap-fresh-schema.js` référence des fichiers PLAN/RESEARCH non trackés avant archivage (`22-RESEARCH.md`, plan 22-02) — attendu de se résoudre à l'archivage du milestone.
- Phase 22 marquée `nyquist_compliant: false` (PARTIAL) dans son `VALIDATION.md` — découverte seulement, non actionnée automatiquement (`/gsd:validate-phase 22` si souhaité).
- **Leçon retrospective transversale (RETROSPECTIVE.md) :** une clé de sécurité de base de données a été collée en clair dans le chat pendant le checkpoint humain de Phase 22, malgré un avertissement explicite du plan ("jamais dans le chat") — a nécessité une suppression de projet pour clore l'exposition. Point de vigilance pour les futurs checkpoints avec identifiants.

**Known Gaps du projet (non liés à v1.5, portés depuis des milestones antérieurs) :**
- **BILL-06 / Phase 8** — Stripe live mode, bloqué sur action humaine Stripe Dashboard (depuis v1.2)
- **MSTORE-02** — soumission TestFlight/Play Store, bloquée sur création de comptes développeur payants Apple/Google (depuis v1.3)

## 7. Getting Started

- **Run the project:** `node motokey-api.js` (backend Express, sert `app.html` en prod via `getAppHTML()`) — Railway auto-deploy sur `git push origin master`
- **Vérifier la syntaxe avant push:** `node --check motokey-api.js`
- **Vérifier prod:** `curl -s -o /dev/null -w "%{http_code}" https://motokey11-production.up.railway.app/`
- **Key directories/files:**
  - `motokey-api.js` (~107 KB) — backend Express
  - `app.html` (~42 KB) — UI garage (source de vérité, servie en prod)
  - `MotoKey_Client.html` (~44 KB) — app client web séparée
  - `supabase.js` (~41 KB) — module DB (queries + helpers)
  - `mobile-app/` — app React Native/Expo (parité client + push)
  - `sql/migrations/` — migrations numérotées, dont les 3 rétroactives de v1.5 (20/21/22)
  - `schema.sql` — bootstrap DDL complet, vérifié propre contre un projet Supabase neuf depuis v1.5
- **Where to look first pour la logique métier :** le score anti-fraude (pondération 1.0/0.6/0.3, formule 70% conformité + 30% accumulation) est le cœur différenciateur — ne pas modifier sans validation explicite de Mehdi (voir `CLAUDE.md`)
- **Discipline d'édition:** `motokey-api.js`, `app.html`, `supabase.js`, `MotoKey_Client.html` s'éditent directement (pas de scripts PowerShell/sed) — voir `CLAUDE.md` pour le détail complet des règles du projet

---

## Stats

- **Timeline:** 2026-07-09 → 2026-07-11 (3 jours)
- **Phases:** 3 / 3 complete
- **Commits:** 37 (git tag range v1.4..v1.5)
- **Files changed:** 40 (+4293 / -224)
- **Contributors:** motokey63
