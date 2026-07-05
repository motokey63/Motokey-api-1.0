-- Migration 18 : Colonnes motos — état "dernier palier notifié" (MPUSH-04, D-04)
-- À appliquer manuellement via Supabase Dashboard > SQL Editor

ALTER TABLE motos
  ADD COLUMN last_maintenance_tier_notified TEXT
    CHECK (last_maintenance_tier_notified IN ('warning', 'urgent') OR last_maintenance_tier_notified IS NULL),
  ADD COLUMN last_maintenance_tier_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN motos.last_maintenance_tier_notified IS
  'Palier d''entretien le plus sévère déjà notifié au client (NULL/warning/urgent). Mis à jour par le cron
   /cron/maintenance-alerts, à la hausse (déclenche un push) comme à la baisse (silencieux, après entretien
   effectué) — source de vérité pour la règle "une notification par franchissement de palier" (D-04).';
