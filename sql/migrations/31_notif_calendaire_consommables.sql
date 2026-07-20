-- ═══════════════════════════════════════════════════════════
-- Migration 31 — Notif calendaire consommables (L11 sous-livraison)
-- ═══════════════════════════════════════════════════════════
-- Ajoute 4 colonnes a consommables :
--
-- seuil_km_override / seuil_mois_override (NULLABLE) — permettent a un PRO+ de
-- personnaliser par consommable les seuils par defaut definis dans SEUILS
-- (services/consommableRappelService.js). NULL = comportement par defaut inchange
-- (COALESCE(override, defaut) cote services/consommableEcheanceService.js).
--
-- dernier_palier_calendaire_envoye_at / dernier_palier_calendaire_km — etat
-- "dernier palier 90% notifie" pour le NOUVEAU service calendaire
-- (services/consommableEcheanceService.js), sur le meme modele que
-- dernier_rappel_envoye_at/dernier_rappel_km (migration 24) mais VOLONTAIREMENT
-- distinct de ces colonnes : le rappel photo (Phase 26, binaire 100%+, "c'est en
-- retard") et le palier calendaire (nouveau, 90%, "ca approche") sont deux
-- notifications independantes avec des cadences differentes — les fusionner
-- ferait qu'une notification supprimerait silencieusement l'autre.
--
-- Les 4 colonnes de rappel (Phase 26 + celles-ci) sont reinitialisees ensemble
-- a chaque changement de km_montage/date_montage, cf. supabase.js
-- Consommables.upsert() (correctif Tache 1, etendu Tache 3).
--
-- À appliquer manuellement via Supabase Dashboard > SQL Editor.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE consommables
  ADD COLUMN IF NOT EXISTS seuil_km_override                  INTEGER,
  ADD COLUMN IF NOT EXISTS seuil_mois_override                 INTEGER,
  ADD COLUMN IF NOT EXISTS dernier_palier_calendaire_envoye_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dernier_palier_calendaire_km        INTEGER;

COMMENT ON COLUMN consommables.seuil_km_override IS
  'Override PRO+ du seuil km par defaut (SEUILS[type].km, services/consommableRappelService.js). NULL = seuil par defaut.';
COMMENT ON COLUMN consommables.seuil_mois_override IS
  'Override PRO+ du seuil mois par defaut (SEUILS[type].mois). NULL = seuil par defaut.';
COMMENT ON COLUMN consommables.dernier_palier_calendaire_envoye_at IS
  'Horodatage du dernier palier 90% notifie par le cron calendaire (NULL = jamais notifie ou rearme). Distinct de dernier_rappel_envoye_at (Phase 26, binaire 100%+) — deux notifications independantes.';
COMMENT ON COLUMN consommables.dernier_palier_calendaire_km IS
  'motos.km au moment du dernier palier 90% notifie — informatif, rearme avec dernier_palier_calendaire_envoye_at.';
