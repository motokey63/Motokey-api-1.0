-- ═══════════════════════════════════════════════════════════
-- Migration 26 — L10 Unification Devis/OR — schéma (commit 1)
-- ═══════════════════════════════════════════════════════════
-- Phase 31 (v1.8). ordres_reparation reste la table canonique et absorbe
-- devis. Ce commit ne touche QUE le schéma (enum + colonnes) — aucune
-- logique applicative (génération de `numero`, migration `_OR_TRANS`,
-- endpoints) n'est dans ce fichier. Voir 30-FINDINGS.md pour l'audit qui
-- a produit ces décisions et scripts/introspect-l10-audit.js pour les
-- vérifications read-only qui précèdent ce script.
--
-- ⚠️ SPLIT EN 2 FICHIERS (comme 13/14 pour mode_acquisition_enum) :
-- L'instruction ALTER TYPE ... ADD VALUE 'refuse' vit désormais dans son
-- propre fichier séparé : 26b_l10_add_refuse_enum_value.sql — à exécuter
-- seule, dans sa propre requête Dashboard. Ce fichier-ci (26) contient
-- tout le reste (1a, 2, 3, 4, 5). Aucune dépendance croisée entre les deux
-- fichiers — voir l'en-tête de 26b pour le détail de l'ordre d'exécution.
--
-- ⚠️ ORDRE DE DÉPLOIEMENT OBLIGATOIRE (vs le code applicatif) :
-- Ce script RENOMME la valeur d'enum 'valide_client' en 'accepte'.
-- `supabase.js` (_OR_TRANS) et `motokey-api.js` (_OR_TRANS_RAM) référencent
-- LITTÉRALEMENT 'valide_client' aujourd'hui, et 'accepte'/'refuse' dans le
-- commit déjà préparé. Si CE script (26) et 26b ne sont pas TOUS LES DEUX
-- appliqués en prod AVANT le push du commit backend/frontend, toute
-- transition de statut OR cassera en prod (valeur enum manquante).
-- NE PAS APPLIQUER CES SCRIPTS avant que le commit backend correspondant
-- ne soit prêt à être déployé dans la foulée (même fenêtre, comme pour la
-- migration 13/L8 : scripts SQL appliqués juste avant le merge du code qui
-- en dépend).
--
-- ✅ PRÉ-REQUIS CONFIRMÉS PAR MEHDI (Dashboard SQL Editor) :
--   SELECT version();  ->  PostgreSQL 17.6
--   SELECT conname, conrelid::regclass, confrelid::regclass
--   FROM pg_constraint WHERE conrelid = 'devis'::regclass AND contype = 'f';
--   -> 0 FK sur or_id. Seules FK réelles sur devis : entite_facturation_id,
--      garage_id, moto_id. Confirme l'hypothèse de la Section 2.
-- PG 17.6 : ALTER TYPE ... ADD VALUE est autorisé dans un bloc de
-- transaction (supporté depuis PG12) — la Section 1b isole quand même
-- l'instruction par cohérence avec le précédent du projet (migration 14),
-- pas par nécessité technique ici.
--
-- ✅ DÉCISIONS TRANCHÉES PAR MEHDI (répondant aux 4 points soulevés) :
--   1. `date_facturation` retirée du script — on garde `facture_emise_at`
--      existant, pas de doublon.
--   2. `notes` retirée du script — le commit backend fera pointer les
--      notes devis vers `notes_client` existant.
--   3. `numero` inchangé — colonne TEXT nue, génération en commit backend.
--   4. Fichier spec confirmé fidèle (vit hors repo), §4.1 donné en
--      conversation fait foi.
--
-- Sur les données de test (8 devis, 6 ordres_reparation) : `devis.lignes`
-- (JSONB) a 2 formats de clés incompatibles sur seulement 8 lignes (voir
-- conversation) — décision : DELETE FROM devis plutôt qu'écrire un parseur
-- défensif pour des données jetables (TRUNCATE échouerait : devis est
-- référencée par la FK ordres_reparation.devis_id). Aucun des 6 OR
-- existants ne référence de devis (devis_id IS NULL sur les 6, or_id IS
-- NULL sur les 8 devis, confirmé via scripts/introspect-l10-audit.js) —
-- donc DELETE FROM devis seul suffit, ordres_reparation/or_taches/
-- or_pieces/or_historique ne sont PAS touchés par ce script.
-- ═══════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────
-- SECTION 1a — Enum or_statut : renommage valide_client -> accepte
-- ───────────────────────────────────────────────────────────
-- RENAME VALUE est un changement de métadonnées pur (pas de réécriture des
-- lignes existantes, l'OID enum ne change pas) — aucune restriction de
-- transaction connue, contrairement à ADD VALUE ci-dessous. Peut être
-- exécuté avec le reste du script.

ALTER TYPE or_statut RENAME VALUE 'valide_client' TO 'accepte';


-- ───────────────────────────────────────────────────────────
-- SECTION 2 — devis.or_id : colonne morte, supprimée
-- ───────────────────────────────────────────────────────────
-- 0/8 devis avec or_id renseigné, aucune contrainte FK trouvée dans
-- sql/migrations/22_devis_undocumented_columns.sql (ALTER TABLE devis ADD
-- COLUMN or_id UUID; sans REFERENCES) ni dans le spec OpenAPI PostgREST.
-- Le lien réel et fonctionnel est ordres_reparation.devis_id -> devis.id.

ALTER TABLE devis DROP COLUMN IF EXISTS or_id;


-- ───────────────────────────────────────────────────────────
-- SECTION 3 — ordres_reparation : nouvelles colonnes (cycle de vie unifié
-- + champs devis fusionnés)
-- ───────────────────────────────────────────────────────────

ALTER TABLE ordres_reparation
  ADD COLUMN IF NOT EXISTS numero              TEXT NULL,
  ADD COLUMN IF NOT EXISTS date_envoi          TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS date_acceptation    TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS date_debut_travaux  TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS date_fin_travaux    TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS date_refus          TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS date_annulation     TIMESTAMPTZ NULL,
  -- Motifs optionnels des 2 statuts terminaux hors succès (mirroir du
  -- pattern attente_motif déjà existant sur cette table). Comblent le gap
  -- signalé en conversation : le frontend envoyait déjà annulation_motif
  -- dans le payload PATCH /statut sans qu'aucune colonne ne le persiste.
  ADD COLUMN IF NOT EXISTS annulation_motif    TEXT NULL,
  ADD COLUMN IF NOT EXISTS refus_motif         TEXT NULL,
  -- Champs devis fusionnés (noms exacts audités sur devis en prod) :
  ADD COLUMN IF NOT EXISTS remise_montant      NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS remise_pct          NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS remise_type         TEXT NULL,
  ADD COLUMN IF NOT EXISTS remise_note         TEXT NULL,
  ADD COLUMN IF NOT EXISTS tva                 NUMERIC NULL;
  -- date_facturation retirée (doublon facture_emise_at, conservé tel quel)
  -- notes retirée (backend fera pointer devis.notes -> notes_client)

-- Mirroir de la contrainte existante ordres_reparation_numero_unique
-- (garage_id, numero_or) — autorise plusieurs NULL tant que la génération
-- réelle de `numero` n'est pas câblée côté backend.
ALTER TABLE ordres_reparation
  ADD CONSTRAINT ordres_reparation_numero_unifie_unique UNIQUE (garage_id, numero);


-- ───────────────────────────────────────────────────────────
-- SECTION 4 — or_taches / or_pieces : colonnes d'acceptation ligne-à-ligne
-- ───────────────────────────────────────────────────────────
-- Pattern D-05-like : une ligne ajoutée en cours d'exécution est bloquée
-- jusqu'à acceptation client explicite (horodatage + identité, valeur
-- probatoire — PROJECT.md, obligation légale FR). accepte_par_client_id
-- référence clients(id) ; ON DELETE SET NULL pour ne jamais perdre la
-- ligne d'historique si le compte client est supprimé.

ALTER TABLE or_taches
  ADD COLUMN IF NOT EXISTS ajoutee_en_cours              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS en_attente_acceptation_client  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS date_acceptation_ligne         TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accepte_par_client_id          UUID NULL REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE or_pieces
  ADD COLUMN IF NOT EXISTS ajoutee_en_cours              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS en_attente_acceptation_client  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS date_acceptation_ligne         TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accepte_par_client_id          UUID NULL REFERENCES clients(id) ON DELETE SET NULL;


-- ───────────────────────────────────────────────────────────
-- SECTION 5 — Nettoyage données de test (devis uniquement)
-- ───────────────────────────────────────────────────────────
-- lignes JSONB incohérent entre les 8 devis de test (2 schémas de clés
-- différents) — pas de parseur défensif pour des données jetables.
-- ordres_reparation/or_taches/or_pieces/or_historique NE sont PAS
-- tronqués : aucun des 6 OR existants ne référence un devis (devis_id
-- IS NULL sur les 6), donc rien à nettoyer en cascade de leur côté.
-- DELETE (pas TRUNCATE) : devis est référencée par la FK
-- ordres_reparation.devis_id — Postgres refuse TRUNCATE sur une table
-- référencée par FK sans inclure la table référençante ou CASCADE (qui
-- viderait ordres_reparation, à exclure). DELETE n'a pas cette
-- restriction ; devis_id est NULL sur les 6 OR existants donc rien à
-- gérer côté FK.

DELETE FROM devis;
