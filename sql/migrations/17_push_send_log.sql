-- Migration 17 : Table push_send_log — garde d'idempotency pour l'envoi de push (D-01/D-02)
-- À appliquer manuellement via Supabase Dashboard > SQL Editor

CREATE TABLE push_send_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT        NOT NULL UNIQUE,
  client_id       UUID        REFERENCES clients(id) ON DELETE SET NULL,
  token           TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_send_log_client ON push_send_log(client_id);

COMMENT ON TABLE push_send_log IS 'Garde d''idempotency des envois push. UNIQUE(idempotency_key) : un INSERT en doublon (code 23505) signale "déjà envoyé" et court-circuite le renvoi (pattern billing_events). client_id/token nullable : sendToToken en test manuel n''a pas de client_id.';
