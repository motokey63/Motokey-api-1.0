-- Migration 24 : Colonnes consommables/photos_consommables — état "dernier rappel envoyé"
-- + référence km à la photo (GAUGE-03/04, D-04/D-07)
-- À appliquer manuellement via Supabase Dashboard > SQL Editor

ALTER TABLE consommables
  ADD COLUMN dernier_rappel_envoye_at TIMESTAMPTZ,
  ADD COLUMN dernier_rappel_km        INTEGER;

ALTER TABLE photos_consommables
  ADD COLUMN km_a_la_photo INTEGER;

COMMENT ON COLUMN consommables.dernier_rappel_envoye_at IS
  'Horodatage du dernier rappel photo envoye pour ce consommable (NULL = jamais notifie ou rearme depuis la derniere photo). Mis a jour par /cron/rappels-photo-consommables ; remis a NULL par PhotosConsommables.insert() (D-05).';
COMMENT ON COLUMN consommables.dernier_rappel_km IS
  'motos.km au moment du dernier rappel envoye pour ce consommable — informatif, rearme avec dernier_rappel_envoye_at.';
COMMENT ON COLUMN photos_consommables.km_a_la_photo IS
  'motos.km au moment de l upload de cette photo — reference de depart pour le calcul km parcouru depuis la derniere photo (D-07).';
