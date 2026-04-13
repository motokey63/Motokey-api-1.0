-- ══════════════════════════════════════════════════════════
-- MOTOKEY — Livraison 7b — Auth client : migration SQL
-- À exécuter dans l'éditeur SQL de Supabase (project > SQL editor)
-- ══════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────
-- TYPE ENUM : auth_token_type
-- ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE auth_token_type AS ENUM ('verify_email', 'password_reset', 'refresh');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
-- TABLE : auth_tokens
-- Codes 6 chiffres pour verify_email et password_reset.
-- Le type 'refresh' est réservé pour usage futur.
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth_tokens (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID         NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type       auth_token_type NOT NULL,
  code       CHAR(6)      NOT NULL,
  expires_at TIMESTAMPTZ  NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  ip         TEXT,
  user_agent TEXT
);

-- ──────────────────────────────────────────────────────────
-- INDEX
-- ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens (user_id, type);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_code_type ON auth_tokens (code, type);

-- ──────────────────────────────────────────────────────────
-- ALTER TABLE clients — colonnes auth 7b
-- ──────────────────────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_hash      TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until       TIMESTAMPTZ;

-- Inscription autonome : un client peut s'enregistrer sans garage associé
ALTER TABLE clients
  ALTER COLUMN garage_id DROP NOT NULL;

-- ──────────────────────────────────────────────────────────
-- RLS
-- TODO RBAC : affiner les policies quand les rôles seront définis
-- ──────────────────────────────────────────────────────────
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_tokens_open" ON auth_tokens;
CREATE POLICY "auth_tokens_open" ON auth_tokens
  USING (true)
  WITH CHECK (true); -- TODO RBAC

COMMIT;
