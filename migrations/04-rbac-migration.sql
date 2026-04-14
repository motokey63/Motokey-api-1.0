-- ══════════════════════════════════════════════════════════
-- MOTOKEY — Livraison 4 : RBAC + distinction pro/particulier
-- À exécuter dans Supabase Dashboard > SQL Editor
--
-- Objectif : ajouter la distinction légale pro/particulier
-- sur la table clients (TVA, SIRET, raison sociale).
-- Les rôles (ADMIN, CONCESSION, PRO, MECANO, CLIENT) sont
-- stockés dans auth.users.app_metadata.role côté Supabase
-- Auth — aucune table supplémentaire requise.
-- ══════════════════════════════════════════════════════════

BEGIN;

-- Type enum pour la distinction légale client
DO $$ BEGIN
  CREATE TYPE client_type_enum AS ENUM ('particulier', 'pro');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Colonnes pour la distinction pro/particulier
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_type      client_type_enum NOT NULL DEFAULT 'particulier',
  ADD COLUMN IF NOT EXISTS raison_sociale   text,
  ADD COLUMN IF NOT EXISTS siret            text,
  ADD COLUMN IF NOT EXISTS tva_intracom     text,
  ADD COLUMN IF NOT EXISTS adresse_facturation text;

-- Contrainte métier : si client_type = 'pro', raison_sociale + siret obligatoires.
-- Les clients existants sont tous 'particulier' (DEFAULT) → contrainte non cassante.
ALTER TABLE clients
  ADD CONSTRAINT clients_pro_requirements
  CHECK (
    client_type = 'particulier'
    OR (
      client_type = 'pro'
      AND raison_sociale IS NOT NULL
      AND siret         IS NOT NULL
    )
  );

-- Index unique sur SIRET (évite les doublons comptes pros)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_siret
  ON clients(siret) WHERE siret IS NOT NULL;

-- Documentation colonnes
COMMENT ON COLUMN clients.client_type IS
  'Type légal du client : particulier (TVA incluse) ou pro (TVA intracom/SIRET requis). Distinction comptable obligatoire France.';
COMMENT ON COLUMN clients.siret IS
  'SIRET 14 chiffres, requis si client_type = ''pro''';
COMMENT ON COLUMN clients.tva_intracom IS
  'N° TVA intracommunautaire, optionnel si client UE';
COMMENT ON COLUMN clients.raison_sociale IS
  'Dénomination sociale officielle, requise si client_type = ''pro''';
COMMENT ON COLUMN clients.adresse_facturation IS
  'Adresse de facturation (peut différer de l''adresse de contact)';

COMMIT;
