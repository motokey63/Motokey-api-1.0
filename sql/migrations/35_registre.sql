-- ═══════════════════════════════════════════════════════════
-- Migration 35 — Registre moto (style visuel du passeport client)
-- ═══════════════════════════════════════════════════════════
-- registre est PUREMENT COSMÉTIQUE : il pilote uniquement l'ambiance visuelle
-- du passeport client (MotoKey_Client.html). Aucune logique métier, aucun
-- score, aucun entretien n'en dépend.
--
-- Strictement séparé de profil_transmission (technique, sert l'entretien) —
-- profil_transmission n'est modifié d'aucune façon par cette migration.
--
-- Défaut déduit de profil_transmission au moment de la création moto
-- (POST /motos, backend) : chaîne -> apex, courroie -> urban, cardan -> odyssee.
-- passione / heritage / boulevard ne sont JAMAIS auto-suggérés — choix manuel
-- du garage uniquement, via un futur endpoint d'édition dédié.
--
-- Conçue pour être jouée UNE SEULE FOIS.
-- À appliquer manuellement via Supabase Dashboard > SQL Editor.
-- ═══════════════════════════════════════════════════════════

-- 1. Colonnes nullables au départ, pour permettre le backfill ci-dessous.
ALTER TABLE motos ADD COLUMN IF NOT EXISTS registre TEXT;
ALTER TABLE motos ADD COLUMN IF NOT EXISTS registre_source TEXT DEFAULT 'auto';

-- 2. Backfill des motos existantes depuis leur profil_transmission actuel.
UPDATE motos SET registre = CASE
  WHEN profil_transmission = 'courroie' THEN 'urban'
  WHEN profil_transmission = 'cardan'   THEN 'odyssee'
  ELSE 'apex'
END
WHERE registre IS NULL;

UPDATE motos SET registre_source = 'auto' WHERE registre_source IS NULL;

-- 3. Verrouillage : DEFAULT 'apex' en filet de sécurité (en pratique
-- Motos.create posera la vraie valeur déduite du profil_transmission), puis
-- NOT NULL sur les deux colonnes désormais entièrement backfillées.
ALTER TABLE motos ALTER COLUMN registre SET DEFAULT 'apex';
ALTER TABLE motos ALTER COLUMN registre SET NOT NULL;
ALTER TABLE motos ALTER COLUMN registre_source SET NOT NULL;

-- 4. Contraintes CHECK — enum figé.
ALTER TABLE motos ADD CONSTRAINT motos_registre_check
  CHECK (registre IN ('apex','passione','odyssee','heritage','boulevard','urban'));
ALTER TABLE motos ADD CONSTRAINT motos_registre_source_check
  CHECK (registre_source IN ('auto','manuel'));
