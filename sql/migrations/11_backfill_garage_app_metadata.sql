-- Migration 11 : Backfill app_metadata.role = 'CONCESSION' pour les comptes garage existants
-- À appliquer manuellement via Supabase Dashboard > SQL Editor
-- Ne concerne que les comptes auth.users liés à un garage et sans rôle défini.

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"CONCESSION"'
)
WHERE id IN (
  SELECT auth_user_id FROM garages WHERE auth_user_id IS NOT NULL
)
AND (raw_app_meta_data->>'role') IS NULL;
