-- L3c-a : enrichissement catalogue_pieces
-- Colonnes pour traçabilité créateur + support EAN (fondation L3c-b scanner)
-- À appliquer manuellement dans Supabase SQL editor
-- La table catalogue_pieces existe déjà (migration 08)

BEGIN;

ALTER TABLE catalogue_pieces
  ADD COLUMN IF NOT EXISTS ean        TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Force le bon type (la colonne pouvait préexister en BIGINT)
ALTER TABLE catalogue_pieces DROP COLUMN IF EXISTS created_at_garage_id;
ALTER TABLE catalogue_pieces ADD COLUMN created_at_garage_id UUID REFERENCES garages(id);

-- Index pour autocomplete rapide (ilike %q%)
CREATE INDEX IF NOT EXISTS idx_catalogue_pieces_garage_libelle
  ON catalogue_pieces(garage_id, lower(libelle));

CREATE INDEX IF NOT EXISTS idx_catalogue_pieces_garage_reference
  ON catalogue_pieces(garage_id, lower(reference))
  WHERE reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalogue_pieces_ean
  ON catalogue_pieces(ean)
  WHERE ean IS NOT NULL;

COMMIT;
