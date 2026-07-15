-- Migration 25 : Copie pneu_av/pneu_ar/pneu_km_montage (legacy motos.*) vers des
-- lignes consommables (CONSO-04). Idempotent (ON CONFLICT DO UPDATE) — rejouable
-- sans effet de bord. À appliquer MANUELLEMENT via Supabase Dashboard > SQL Editor.

INSERT INTO consommables (moto_id, type_consommable, km_montage, reference)
SELECT id, 'pneu_av', pneu_km_montage, pneu_av
FROM motos
WHERE pneu_av IS NOT NULL AND btrim(pneu_av) <> ''
ON CONFLICT (moto_id, type_consommable) DO UPDATE
  SET km_montage = EXCLUDED.km_montage,
      reference   = EXCLUDED.reference,
      updated_at  = NOW();

INSERT INTO consommables (moto_id, type_consommable, km_montage, reference)
SELECT id, 'pneu_ar', pneu_km_montage, pneu_ar
FROM motos
WHERE pneu_ar IS NOT NULL AND btrim(pneu_ar) <> ''
ON CONFLICT (moto_id, type_consommable) DO UPDATE
  SET km_montage = EXCLUDED.km_montage,
      reference   = EXCLUDED.reference,
      updated_at  = NOW();

-- date_montage volontairement NON renseigné (jamais stocké historiquement) — reste NULL.
-- pneu_av/pneu_ar/pneu_km_montage sur motos sont CONSERVÉS (pas de DROP COLUMN cette phase) —
-- nettoyage schéma différé à un futur plan une fois la copie validée en prod par Mehdi.
