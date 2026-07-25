-- ═══════════════════════════════════════════════════════════
-- Migration 34 — L15 Plan 3 — ajout enum 'archive' (couleur_dossier_type)
-- ═══════════════════════════════════════════════════════════
-- Neutralise au score une intervention supplantée par une divergence
-- garage/client (HistoriqueImport.valider), sans modifier recalc_score_moto()
-- (schema.sql:684-704) : le CASE ... ELSE 0 existant traite déjà tout type
-- non listé comme 0 point. 'rouge' n'est PAS neutre (-5, malus anti-fraude,
-- schema.sql:698) — 'archive' est une vraie valeur neutre à 0.
--
-- Même précédent que sql/migrations/26b_l10_add_refuse_enum_value.sql :
-- ADD VALUE dans son propre fichier, exécuté seul dans le Dashboard SQL
-- Editor. À appliquer en prod AVANT le déploiement du code (supabase.js)
-- qui référence littéralement 'archive' — une valeur ENUM ajoutée ne peut
-- pas être utilisée dans la même transaction qui l'a créée (PG, erreur
-- 55P04 si violé).
-- ═══════════════════════════════════════════════════════════

ALTER TYPE couleur_dossier_type ADD VALUE IF NOT EXISTS 'archive' AFTER 'rouge';
