-- ═══════════════════════════════════════════════════════════
-- Migration 21 — Rétroactif : colonnes non documentées interventions (Gap A)
-- ═══════════════════════════════════════════════════════════
-- Documente 4 colonnes présentes en prod sur interventions sans fichier de
-- migration correspondant (Phase 20, SCHEMA-02/03). Idempotent.
-- Les 4 sont des ghost columns : zéro trace de code (git log -S sur 302 commits),
-- inaccessibles via le payload d'insert Interventions.create() (supabase.js L397-408).
-- Enregistrement historique — schema.sql les inclut directement (plan 21-02).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE interventions ADD COLUMN IF NOT EXISTS niveau_preuve  TEXT DEFAULT 'declare';
-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal Phase 20).
-- Contrainte prod : CHECK (niveau_preuve IN ('facture','visuel','declare')) — reproduite dans schema.sql.

ALTER TABLE interventions ADD COLUMN IF NOT EXISTS facture_id     UUID;
-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal Phase 20).
-- FK prod : interventions_facture_id_fkey → factures_scannees(id) ON DELETE SET NULL.
-- La table factures_scannees est HORS PÉRIMÈTRE de schema.sql (voir header schema.sql) :
-- la FK est documentée ici mais volontairement NON reproduite dans schema.sql (bootstrap propre).

ALTER TABLE interventions ADD COLUMN IF NOT EXISTS operation_code TEXT;
-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal Phase 20 — ghost column)

ALTER TABLE interventions ADD COLUMN IF NOT EXISTS photo_url      TEXT;
-- origine indéterminée, colonne non utilisée par le code actuel (verdict terminal Phase 20 — ghost column)
