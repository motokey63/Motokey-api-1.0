-- ═══════════════════════════════════════════════════════════
-- Migration 30 — Distinction zone photo chaîne (brin/couronne)
-- ═══════════════════════════════════════════════════════════
-- La chaîne nécessite 2 photos réelles (brin + couronne, doctrine L11 point 4),
-- alors que services/jaugeConsommables.js (Phase 27) ne retenait jusqu'ici que la
-- photo la plus récente par type_consommable pour calculer l'état affiché
-- ("latest wins") — deux uploads réels pour le même type_consommable='chaine'
-- écraseraient silencieusement l'un des deux résultats d'analyse.
--
-- Cette colonne permet de distinguer les deux prises pour calculer le pire des
-- deux zones (voir services/jaugeConsommables.js, pickChainAnalysis()).
--
-- NULL pour tous les autres types (pneus, chaîne en profil courroie — une seule
-- prise, pas de distinction de zone) — comportement "latest wins" inchangé pour
-- eux, aucune régression.
--
-- À appliquer manuellement via Supabase Dashboard > SQL Editor.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE photos_consommables ADD COLUMN IF NOT EXISTS zone TEXT
  CHECK (zone IN ('brin','couronne'));
