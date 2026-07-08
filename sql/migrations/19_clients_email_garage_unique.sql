-- Migration 19 : Contrainte UNIQUE(email, garage_id) sur clients (CFIX-01)
-- À appliquer manuellement via Supabase Dashboard > SQL Editor
--
-- Découvert en exécutant setup-supabase.js (Phase 18, plan 01) : le upsert
-- `sb.from('clients').upsert({...}, { onConflict: 'email,garage_id' })`
-- échoue avec l'erreur Postgres 42P10 "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" car aucune contrainte
-- unique ne couvre (email, garage_id) sur la table clients. Ce bug est
-- antérieur à ce plan (le upsert utilisait déjà ce onConflict) et empêchait
-- silencieusement la création/mise à jour du client fixture Sophie
-- (sophie@email.com), bloquant `/auth/client/login`.
--
-- Vérifié avant application : aucune paire (email, garage_id) dupliquée
-- n'existe actuellement dans clients (contrôlé via requête SELECT le
-- 2026-07-08), donc l'ajout de la contrainte ne provoquera aucun échec de
-- déduplication.

ALTER TABLE clients
  ADD CONSTRAINT clients_email_garage_id_key UNIQUE (email, garage_id);
