-- ═══════════════════════════════════════════════════════════
-- Migration 15 — Billing Foundation (L9 Stripe)
-- ═══════════════════════════════════════════════════════════
-- Ajoute les colonnes billing à garages et crée billing_events.
-- Ces colonnes supportent le cycle de vie d'abonnement Stripe :
-- trial -> active -> grace -> blocked.
--
-- D-01/D-02/D-03 : toutes les colonnes sont DEFAULT NULL — les garages
-- existants restent sans billing actif. La transition auto-trial est
-- gérée en Phase 5 ; l'interprétation NULL=illimité est gérée en Phase 6.
--
-- À appliquer manuellement via Supabase Dashboard > SQL Editor.
-- Idempotent : ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════

-- ── Colonnes billing sur garages (toutes DEFAULT NULL) ──
ALTER TABLE garages ADD COLUMN IF NOT EXISTS stripe_customer_id              TEXT;
ALTER TABLE garages ADD COLUMN IF NOT EXISTS stripe_subscription_id          TEXT;
ALTER TABLE garages ADD COLUMN IF NOT EXISTS plan_code                       TEXT;
ALTER TABLE garages ADD COLUMN IF NOT EXISTS subscription_status             TEXT;
ALTER TABLE garages ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;
ALTER TABLE garages ADD COLUMN IF NOT EXISTS grace_period_ends_at            TIMESTAMPTZ;
ALTER TABLE garages ADD COLUMN IF NOT EXISTS motos_limit                     INTEGER;
ALTER TABLE garages ADD COLUMN IF NOT EXISTS users_limit                     INTEGER;

-- ── Table billing_events (idempotency guard + audit trail) ──
CREATE TABLE IF NOT EXISTS billing_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  TEXT        NOT NULL UNIQUE,
  event_type       TEXT        NOT NULL,
  garage_id        UUID        REFERENCES garages(id) ON DELETE SET NULL,
  payload          JSONB,
  processed_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_garage ON billing_events(garage_id);

COMMENT ON TABLE  billing_events IS 'Audit trail des evenements Stripe recus. stripe_event_id UNIQUE = guard idempotency (rejeu webhook securise).';
COMMENT ON COLUMN billing_events.payload IS 'Corps complet de l''evenement Stripe — permet de rejouer ou auditer sans appeler l''API Stripe.';
COMMENT ON COLUMN garages.subscription_status IS 'Valeurs attendues : NULL (pas de billing actif), trialing, active, grace, blocked, canceled.';
COMMENT ON COLUMN garages.motos_limit IS 'NULL = illimite (Concession ou pas de billing actif). INTEGER = quota plan Solo/Atelier.';
COMMENT ON COLUMN garages.users_limit IS 'NULL = illimite (Concession ou pas de billing actif). INTEGER = quota plan Solo/Atelier.';
