-- ══════════════════════════════════════════════════════════
-- MOTOKEY — Livraison 7b pivot — Auth Supabase natif
-- À exécuter dans Supabase Dashboard > SQL Editor
--
-- Seule modification DB requise pour le pivot vers Supabase Auth natif :
-- clients.garage_id devient nullable pour permettre l'inscription
-- autonome d'un client sans garage associé d'emblée.
-- ══════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE clients
  ALTER COLUMN garage_id DROP NOT NULL;

COMMIT;
