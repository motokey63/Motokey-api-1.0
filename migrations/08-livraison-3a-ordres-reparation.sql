-- ============================================================================
-- MotoKey — Migration Livraison 3a : Ordres de Réparation
-- ============================================================================
-- À exécuter dans Supabase SQL Editor APRÈS 07b-pivot-migration.sql
-- Crée 4 tables : catalogue_pieces, ordres_reparation, or_taches, or_pieces
--
-- Conventions respectées :
--   - UUID PK + uuid_generate_v4()
--   - garage_id NOT NULL REFERENCES garages(id) ON DELETE CASCADE
--   - RLS via my_garage_id() (déjà existant)
--   - Triggers updated_at via update_updated_at()
--   - IF NOT EXISTS partout (idempotent)
--
-- TODO RBAC L4 :
--   - Hierarchy ADMIN > CONCESSION > PRO > CLIENT à appliquer sur SELECT/UPDATE
--   - Sous-rôle MÉCANO : accès or_taches OUI, montant_ht/taux_horaire à masquer
--   - Plafonds couleur : CONCESSION→vert, PRO→bleu, CLIENT→jaune
-- ============================================================================

BEGIN;

-- =========================================================================
-- 1. ENUMS
-- =========================================================================
DO $$ BEGIN
  CREATE TYPE or_statut AS ENUM (
    'brouillon','en_cours','termine','annule'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE or_tache_statut AS ENUM ('a_faire','en_cours','fait');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================================
-- 2. TABLE : catalogue_pieces
-- =========================================================================
CREATE TABLE IF NOT EXISTS catalogue_pieces (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garage_id       UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,

  reference       TEXT NOT NULL,
  code_barre      TEXT,
  libelle         TEXT NOT NULL,
  marque          TEXT,
  categorie       TEXT,

  prix_achat_ht   NUMERIC(10,2) DEFAULT 0,
  prix_vente_ht   NUMERIC(10,2) NOT NULL DEFAULT 0,
  tva_pct         NUMERIC(5,2)  NOT NULL DEFAULT 20,

  stock_qte       INTEGER NOT NULL DEFAULT 0,
  stock_min       INTEGER NOT NULL DEFAULT 0,

  actif           BOOLEAN NOT NULL DEFAULT TRUE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT catalogue_pieces_ref_unique     UNIQUE (garage_id, reference),
  CONSTRAINT catalogue_pieces_barcode_unique UNIQUE (garage_id, code_barre)
);

CREATE INDEX IF NOT EXISTS idx_catalogue_pieces_garage    ON catalogue_pieces(garage_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_pieces_barcode   ON catalogue_pieces(code_barre) WHERE code_barre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalogue_pieces_categorie ON catalogue_pieces(garage_id, categorie);

ALTER TABLE catalogue_pieces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogue_pieces_garage_all ON catalogue_pieces;
CREATE POLICY catalogue_pieces_garage_all ON catalogue_pieces
  FOR ALL USING (garage_id = my_garage_id());

-- TODO RBAC L4 : policy SELECT pour CLIENT (lecture seule prix_vente_ht)
-- TODO RBAC L4 : MÉCANO ne doit pas voir prix_achat_ht (vue dédiée ou colonne mask)

DROP TRIGGER IF EXISTS trg_catalogue_pieces_upd ON catalogue_pieces;
CREATE TRIGGER trg_catalogue_pieces_upd
  BEFORE UPDATE ON catalogue_pieces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =========================================================================
-- 3. TABLE : ordres_reparation
-- =========================================================================
CREATE TABLE IF NOT EXISTS ordres_reparation (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garage_id       UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,

  numero_or       TEXT NOT NULL,                    -- généré côté JS, ex: "OR-2026-XXXX"

  moto_id         UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  devis_id        UUID REFERENCES devis(id)   ON DELETE SET NULL,
  technicien_id   UUID,                              -- TODO RBAC L4: REFERENCES equipe(id)

  statut          or_statut NOT NULL DEFAULT 'brouillon',
  km_entree       INTEGER,
  km_sortie       INTEGER,

  date_ouverture  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_cloture    TIMESTAMPTZ,

  total_mo_ht     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_pieces_ht NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_ht        NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_tva       NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_ttc       NUMERIC(10,2) NOT NULL DEFAULT 0,

  notes_atelier   TEXT,                              -- visibles MÉCANO + PRO
  notes_client    TEXT,                              -- visibles CLIENT

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ordres_reparation_numero_unique UNIQUE (garage_id, numero_or)
);

CREATE INDEX IF NOT EXISTS idx_or_garage   ON ordres_reparation(garage_id);
CREATE INDEX IF NOT EXISTS idx_or_moto     ON ordres_reparation(moto_id);
CREATE INDEX IF NOT EXISTS idx_or_client   ON ordres_reparation(client_id);
CREATE INDEX IF NOT EXISTS idx_or_statut   ON ordres_reparation(garage_id, statut);
CREATE INDEX IF NOT EXISTS idx_or_date_ouv ON ordres_reparation(garage_id, date_ouverture DESC);

ALTER TABLE ordres_reparation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ordres_reparation_garage_all ON ordres_reparation;
CREATE POLICY ordres_reparation_garage_all ON ordres_reparation
  FOR ALL USING (garage_id = my_garage_id());

-- TODO RBAC L4 : policy SELECT pour CLIENT (voir ses propres OR via moto.client_id)
-- Pattern à valider contre le schéma clients/auth post-7b :
-- CREATE POLICY ordres_reparation_client_read ON ordres_reparation
--   FOR SELECT USING (EXISTS (
--     SELECT 1 FROM motos m
--     JOIN clients c ON c.id = m.client_id
--     WHERE m.id = ordres_reparation.moto_id
--       AND c.auth_user_id = auth.uid()
--   ));

DROP TRIGGER IF EXISTS trg_ordres_reparation_upd ON ordres_reparation;
CREATE TRIGGER trg_ordres_reparation_upd
  BEFORE UPDATE ON ordres_reparation
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =========================================================================
-- 4. TABLE : or_taches
-- =========================================================================
CREATE TABLE IF NOT EXISTS or_taches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garage_id       UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  or_id           UUID NOT NULL REFERENCES ordres_reparation(id) ON DELETE CASCADE,

  ordre           INTEGER NOT NULL DEFAULT 0,
  libelle         TEXT NOT NULL,
  description     TEXT,

  duree_h         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  taux_horaire    NUMERIC(10,2) NOT NULL DEFAULT 0,
  montant_ht      NUMERIC(10,2) NOT NULL DEFAULT 0,

  technicien_id   UUID,                              -- TODO RBAC L4: REFERENCES equipe(id)
  statut          or_tache_statut NOT NULL DEFAULT 'a_faire',
  fait_le         TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_or_taches_garage ON or_taches(garage_id);
CREATE INDEX IF NOT EXISTS idx_or_taches_or     ON or_taches(or_id);
CREATE INDEX IF NOT EXISTS idx_or_taches_statut ON or_taches(or_id, statut);

ALTER TABLE or_taches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS or_taches_garage_all ON or_taches;
CREATE POLICY or_taches_garage_all ON or_taches
  FOR ALL USING (garage_id = my_garage_id());

-- TODO RBAC L4 : MÉCANO accès OK mais montant_ht/taux_horaire à masquer

DROP TRIGGER IF EXISTS trg_or_taches_upd ON or_taches;
CREATE TRIGGER trg_or_taches_upd
  BEFORE UPDATE ON or_taches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =========================================================================
-- 5. TABLE : or_pieces (snapshot pour traçabilité)
-- =========================================================================
CREATE TABLE IF NOT EXISTS or_pieces (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garage_id       UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  or_id           UUID NOT NULL REFERENCES ordres_reparation(id) ON DELETE CASCADE,

  -- Lien optionnel vers le catalogue : SET NULL = on garde l'historique
  piece_id        UUID REFERENCES catalogue_pieces(id) ON DELETE SET NULL,

  -- Snapshot figé au moment de la consommation
  reference       TEXT,
  libelle         TEXT NOT NULL,

  qte             NUMERIC(10,3) NOT NULL DEFAULT 1,
  pu_ht           NUMERIC(10,2) NOT NULL DEFAULT 0,
  tva_pct         NUMERIC(5,2)  NOT NULL DEFAULT 20,
  montant_ht      NUMERIC(10,2) NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_or_pieces_garage ON or_pieces(garage_id);
CREATE INDEX IF NOT EXISTS idx_or_pieces_or     ON or_pieces(or_id);
CREATE INDEX IF NOT EXISTS idx_or_pieces_piece  ON or_pieces(piece_id);

ALTER TABLE or_pieces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS or_pieces_garage_all ON or_pieces;
CREATE POLICY or_pieces_garage_all ON or_pieces
  FOR ALL USING (garage_id = my_garage_id());

DROP TRIGGER IF EXISTS trg_or_pieces_upd ON or_pieces;
CREATE TRIGGER trg_or_pieces_upd
  BEFORE UPDATE ON or_pieces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;

-- ============================================================================
-- Vérification post-migration (à lancer manuellement après exécution) :
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public'
--     AND table_name IN ('catalogue_pieces','ordres_reparation','or_taches','or_pieces')
--   ORDER BY table_name;
-- → doit retourner 4 lignes.
-- ============================================================================
