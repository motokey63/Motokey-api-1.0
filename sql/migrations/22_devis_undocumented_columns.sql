-- ═══════════════════════════════════════════════════════════
-- Migration 22 — Rétroactif : colonnes non documentées devis (Gap A)
-- ═══════════════════════════════════════════════════════════
-- Documente 25 colonnes présentes en prod sur devis sans fichier de migration
-- correspondant (Phase 20, SCHEMA-02/03). Idempotent : ADD COLUMN IF NOT EXISTS.
-- Toutes les 25 relèvent du pattern "code-catch-up" : le code a été aligné en
-- b29d4f5 (2026-07-04) sur un schéma devis déjà dérivé en prod — l'origine DB
-- réelle est antérieure/inconnue (ALTER Dashboard non documenté). Les colonnes
-- date_acceptation/date_refus ont une prise de conscience code antérieure
-- (f2d7d9a, 2026-05-11, renommage refuse_at->date_refus / valide_at->date_acceptation).
-- Enregistrement historique — schema.sql les inclut directement (plan 21-02).
-- ═══════════════════════════════════════════════════════════

-- ── Snapshot client (dénormalisé sur le devis) — code awareness b29d4f5 (2026-07-04), origine DB antérieure/inconnue ──
ALTER TABLE devis ADD COLUMN IF NOT EXISTS client_adresse   TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS client_cp        TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS client_email     TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS client_id        UUID;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS client_nom       TEXT NOT NULL;   -- prod : NOT NULL
ALTER TABLE devis ADD COLUMN IF NOT EXISTS client_siret     TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS client_tel       TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS client_tva       TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS client_ville     TEXT;

-- ── Snapshot moto — code awareness b29d4f5 (2026-07-04), origine DB antérieure/inconnue ──
ALTER TABLE devis ADD COLUMN IF NOT EXISTS moto_label       TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS moto_vin         TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS moto_km          INTEGER;

-- ── Contenu / totaux — code awareness b29d4f5 (2026-07-04), origine DB antérieure/inconnue ──
ALTER TABLE devis ADD COLUMN IF NOT EXISTS lignes           JSONB NOT NULL DEFAULT '[]'::jsonb;  -- remplace la table devis_lignes supprimée
ALTER TABLE devis ADD COLUMN IF NOT EXISTS total_ht         NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS total_tva        NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS remise_montant   NUMERIC(12,2) DEFAULT 0;

-- ── Dates cycle de vie — code awareness b29d4f5 sauf indication ──
ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_creation    TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_validite    DATE;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_envoi       TIMESTAMPTZ;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_acceptation TIMESTAMPTZ;  -- code awareness f2d7d9a (2026-05-11, renommage valide_at->date_acceptation)
ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_refus       TIMESTAMPTZ;  -- code awareness f2d7d9a (2026-05-11, renommage refuse_at->date_refus)

-- ── Divers — code awareness b29d4f5 (2026-07-04), origine DB antérieure/inconnue ──
ALTER TABLE devis ADD COLUMN IF NOT EXISTS or_id            UUID;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS notes            TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS cree_par         TEXT;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS entite_facturation_id UUID NOT NULL;
-- prod : NOT NULL. FK prod : devis_entite_facturation_id_fkey → entites_facturation(id) (pas de ON DELETE explicite).
-- La table entites_facturation est HORS PÉRIMÈTRE de schema.sql (voir header schema.sql) :
-- FK documentée ici mais volontairement NON reproduite dans schema.sql (bootstrap propre).
