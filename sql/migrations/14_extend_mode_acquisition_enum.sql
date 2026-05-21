-- ═══════════════════════════════════════════════════════════
-- Migration 14 — Extension enum mode_acquisition (L8 fix)
-- ═══════════════════════════════════════════════════════════
-- Ajoute 'don' et 'heritage' à l'enum mode_acquisition_enum.
-- Ces valeurs sont proposées dans le formulaire client "+ Ajouter"
-- (MotoKey_Client.html) et étaient absentes de l'enum défini en
-- migration 13, causant une erreur 500 à la soumission.
--
-- ALTER TYPE ... ADD VALUE ne peut pas s'exécuter dans une transaction
-- — appliquer tel quel via Supabase Dashboard SQL Editor.
--
-- À appliquer en prod AVANT de merger feat/L8-liaison-polymorphe
-- sur master (même protocole que migration 13).
-- ═══════════════════════════════════════════════════════════

ALTER TYPE mode_acquisition_enum ADD VALUE IF NOT EXISTS 'don';
ALTER TYPE mode_acquisition_enum ADD VALUE IF NOT EXISTS 'heritage';
