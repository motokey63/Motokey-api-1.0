-- ═══════════════════════════════════════════════════════════
-- Migration 13 — Liaison client/moto polymorphe (L8)
-- ═══════════════════════════════════════════════════════════

-- Enums
CREATE TYPE proprietaire_type_enum AS ENUM ('client', 'garage', 'inconnu');
CREATE TYPE mode_acquisition_enum AS ENUM (
  'achat_neuf', 'achat_occasion', 'reprise_garage',
  'cession_perso', 'mise_en_stock', 'inconnu'
);

-- Refonte motos
ALTER TABLE motos
  ADD COLUMN proprietaire_type proprietaire_type_enum NOT NULL DEFAULT 'client',
  ADD COLUMN proprietaire_garage_id UUID NULL REFERENCES garages(id) ON DELETE RESTRICT,
  ADD COLUMN proprio_libre TEXT NULL,
  ADD COLUMN statut_moto TEXT NULL DEFAULT 'actif',
  ADD COLUMN carte_grise_photo_url TEXT NULL;

ALTER TABLE motos ADD CONSTRAINT moto_proprietaire_coherence CHECK (
  (proprietaire_type = 'client'  AND client_id IS NOT NULL AND proprietaire_garage_id IS NULL) OR
  (proprietaire_type = 'garage'  AND proprietaire_garage_id IS NOT NULL AND client_id IS NULL) OR
  (proprietaire_type = 'inconnu' AND client_id IS NULL AND proprietaire_garage_id IS NULL)
);

UPDATE motos SET proprietaire_type = 'client' WHERE client_id IS NOT NULL;
ALTER TABLE motos ALTER COLUMN client_id DROP NOT NULL;

-- Historique propriétaires
CREATE TABLE motos_proprietaires_historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moto_id UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  proprietaire_type proprietaire_type_enum NOT NULL,
  proprietaire_client_id UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
  proprietaire_garage_id UUID NULL REFERENCES garages(id) ON DELETE SET NULL,
  proprio_libre TEXT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NULL,
  mode_acquisition mode_acquisition_enum NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NULL,
  CONSTRAINT historique_coherence CHECK (
    (proprietaire_type = 'client'  AND proprietaire_client_id IS NOT NULL) OR
    (proprietaire_type = 'garage'  AND proprietaire_garage_id IS NOT NULL) OR
    (proprietaire_type = 'inconnu')
  )
);

CREATE INDEX idx_mph_moto ON motos_proprietaires_historique(moto_id);
CREATE INDEX idx_mph_client ON motos_proprietaires_historique(proprietaire_client_id)
  WHERE proprietaire_client_id IS NOT NULL;
CREATE INDEX idx_mph_garage ON motos_proprietaires_historique(proprietaire_garage_id)
  WHERE proprietaire_garage_id IS NOT NULL;
CREATE INDEX idx_mph_actif ON motos_proprietaires_historique(moto_id)
  WHERE date_fin IS NULL;

-- Backfill historique
INSERT INTO motos_proprietaires_historique
  (moto_id, proprietaire_type, proprietaire_client_id, date_debut, mode_acquisition, note)
SELECT id, 'client', client_id, COALESCE(created_at::date, CURRENT_DATE), 'inconnu',
       'Backfill migration L8 : historique anterieur non documente'
FROM motos
WHERE client_id IS NOT NULL;

-- Liaisons client-garage
CREATE TABLE liaisons_client_garage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  garage_id UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'actif',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_revocation TIMESTAMPTZ NULL,
  motif_revocation TEXT NULL,
  cree_par TEXT NOT NULL DEFAULT 'garage',
  UNIQUE(client_id, garage_id)
);

CREATE INDEX idx_lcg_client_actif ON liaisons_client_garage(client_id) WHERE statut = 'actif';
CREATE INDEX idx_lcg_garage_actif ON liaisons_client_garage(garage_id) WHERE statut = 'actif';

INSERT INTO liaisons_client_garage (client_id, garage_id, statut, cree_par)
SELECT DISTINCT m.client_id, m.garage_id, 'actif', 'garage'
FROM motos m
WHERE m.client_id IS NOT NULL AND m.garage_id IS NOT NULL
ON CONFLICT (client_id, garage_id) DO NOTHING;

-- Reclamations
CREATE TABLE reclamations_moto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moto_id UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'en_attente',
  vin_fourni TEXT NOT NULL,
  plaque_fournie TEXT NOT NULL,
  carte_grise_photo_url TEXT NOT NULL,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_resolution TIMESTAMPTZ NULL,
  resolu_par UUID NULL,
  motif_refus TEXT NULL
);

CREATE INDEX idx_rec_moto ON reclamations_moto(moto_id);
CREATE INDEX idx_rec_client ON reclamations_moto(client_id);
CREATE INDEX idx_rec_attente ON reclamations_moto(statut) WHERE statut = 'en_attente';

-- Forfait client
ALTER TABLE clients
  ADD COLUMN is_pro BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN limite_motos_gratuites INT NOT NULL DEFAULT 3;

-- Vue utilitaire
CREATE OR REPLACE VIEW v_motos_avec_proprietaire AS
SELECT m.*,
  CASE
    WHEN m.proprietaire_type = 'client'  THEN c.nom
    WHEN m.proprietaire_type = 'garage'  THEN g.nom || ' (stock)'
    WHEN m.proprietaire_type = 'inconnu' THEN COALESCE(m.proprio_libre, 'Proprietaire inconnu')
  END AS proprietaire_nom_resolu,
  CASE
    WHEN m.proprietaire_type = 'client' THEN c.email
    ELSE NULL
  END AS proprietaire_email_resolu
FROM motos m
LEFT JOIN clients c ON c.id = m.client_id
LEFT JOIN garages g ON g.id = m.proprietaire_garage_id;
