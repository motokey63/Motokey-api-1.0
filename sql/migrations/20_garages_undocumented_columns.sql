-- ═══════════════════════════════════════════════════════════
-- Migration 20 — Rétroactif : colonnes non documentées garages (Gap A)
-- ═══════════════════════════════════════════════════════════
-- Documente 5 colonnes présentes en prod sur garages sans aucun fichier de
-- migration correspondant (dérive découverte Phase 19, corrélée Phase 20 —
-- SCHEMA-02/03). Idempotent : ADD COLUMN IF NOT EXISTS.
-- Enregistrement historique : schema.sql inclut déjà ces colonnes directement
-- (SCHEMA-05, plan 21-02). Ce fichier ne sera normalement jamais exécuté —
-- sauf pour rattraper un environnement bootstrappé depuis une version
-- antérieure de schema.sql.
-- À appliquer manuellement via Supabase Dashboard > SQL Editor si besoin.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE garages ADD COLUMN IF NOT EXISTS ville             TEXT;
-- origine : découpage d'adresse structuré, préparé mais jamais câblé dans l'app (confirmé Mehdi 2026-07-09 ; données réelles en prod : ville='Clermont-Ferrand')

ALTER TABLE garages ADD COLUMN IF NOT EXISTS cp                TEXT;
-- origine : découpage d'adresse structuré, préparé mais jamais câblé dans l'app (confirmé Mehdi 2026-07-09 ; données réelles en prod : cp='63000')

ALTER TABLE garages ADD COLUMN IF NOT EXISTS type              TEXT NOT NULL DEFAULT 'pro';
-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal Phase 20 — ni git ni Mehdi n'ont pu déterminer l'origine ; ghost column, absente de l'allowlist Garages.update() supabase.js L186)

ALTER TABLE garages ADD COLUMN IF NOT EXISTS marque_officielle TEXT;
-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal Phase 20 — ghost column)

ALTER TABLE garages ADD COLUMN IF NOT EXISTS actif             BOOLEAN NOT NULL DEFAULT true;
-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal Phase 20 — ghost column)
