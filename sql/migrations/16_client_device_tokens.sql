-- Migration 16 : Table client_device_tokens — jetons push mobile (Expo)
-- À appliquer manuellement via Supabase Dashboard > SQL Editor

CREATE TABLE client_device_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token        TEXT        NOT NULL UNIQUE,
  platform     TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_device_tokens_client ON client_device_tokens(client_id);

COMMENT ON TABLE client_device_tokens IS 'Jetons push Expo (mobile) liés à un client. Un client peut avoir plusieurs devices actifs (multi-appareil, D-01). UNIQUE(token) permet la réassignation upsert (D-02) si un device change de propriétaire.';
