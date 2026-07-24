-- ═══════════════════════════════════════════════════════════
-- Migration 33 — L15 socle : extension factures_scannees pour reprise d'historique
-- ═══════════════════════════════════════════════════════════
-- Ajoute les colonnes nécessaires à l'import d'historique (client ET garage),
-- au traçage de divergence, et à la vérification de cohérence km par voisin
-- chronologique. Voir docs/superpowers/specs/2026-07-24-L15-reprise-historique-cadrage.md.
-- image_base64 reste en base pour compat descendante mais n'est plus alimentée par
-- ce flux — les nouveaux imports écrivent dans photo_url (Cloudinary), même pattern
-- que photo_url/facture_url ailleurs dans l'app.
-- Idempotent (IF NOT EXISTS partout). Appliquer manuellement via Supabase Dashboard
-- SQL Editor — jamais exécutée directement par l'agent.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS garage_id UUID REFERENCES garages(id) ON DELETE SET NULL;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS acteur_type TEXT CHECK (acteur_type IN ('client','garage'));
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS acteur_id UUID;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS plaque_declaree TEXT;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS date_document DATE;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS km_declare INTEGER;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS siret_declare TEXT;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS nom_garage_declare TEXT;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS km_coherence_statut TEXT DEFAULT 'valide' CHECK (km_coherence_statut IN ('valide','rejete'));
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS km_coherence_motif TEXT;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS divergence_de UUID REFERENCES factures_scannees(id) ON DELETE SET NULL;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS intervention_id UUID REFERENCES interventions(id) ON DELETE SET NULL;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS contresigne_par_garage_id UUID REFERENCES garages(id) ON DELETE SET NULL;
ALTER TABLE factures_scannees ADD COLUMN IF NOT EXISTS contresigne_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_factures_scannees_moto_id ON factures_scannees(moto_id);
