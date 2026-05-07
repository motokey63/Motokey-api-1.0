-- Migration 12 : Table garage_users — liaison comptes auth.users ↔ garages
-- À appliquer manuellement via Supabase Dashboard > SQL Editor
-- Permet de lier un MECANO/PRO employé à son garage employeur.

CREATE TABLE garage_users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  garage_id    UUID        NOT NULL REFERENCES garages(id)    ON DELETE CASCADE,
  role         TEXT        NOT NULL CHECK (role IN ('PRO', 'MECANO')),
  actif        BOOLEAN     DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  created_by   UUID        REFERENCES auth.users(id),
  UNIQUE (auth_user_id, garage_id)
);

CREATE INDEX idx_garage_users_garage ON garage_users(garage_id) WHERE actif = true;
CREATE INDEX idx_garage_users_auth   ON garage_users(auth_user_id) WHERE actif = true;

COMMENT ON TABLE garage_users IS 'Liaison comptes auth.users ↔ garages avec rôle (PRO ou MECANO). Permet de lier un mécano employé à son garage employeur.';
COMMENT ON COLUMN garage_users.role IS 'PRO = gérant/technicien senior, MECANO = technicien atelier. Ne contient pas CONCESSION/ADMIN/CLIENT (ces rôles sont gérés ailleurs).';
