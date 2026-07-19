-- ═══════════════════════════════════════════════════════════
-- Migration 29 — Profil de transmission moto (chaîne/courroie/cardan)
-- ═══════════════════════════════════════════════════════════
-- Auto-détecté à la création moto (POST /motos) via une table de mapping
-- marque/modèle → profil, avec fallback 'chaine' (cas le plus courant en
-- France) si aucun match. Override manuel possible par un compte PRO+ via
-- PATCH /motos/:id/profil-transmission, qui bascule la source à 'manuel' —
-- jamais silencieux, toujours visible dans la fiche moto.
--
-- Hors scope : ce profil ne pilote PAS encore l'affichage des consommables
-- (types_consommables.applicable_profils n'existe pas dans ce repo — la
-- table consommables réelle, Phase 23, utilise un CHECK 9-types fixe sans
-- notion de profil). Ce profil est une donnée technique de la fiche moto,
-- disponible pour un futur filtrage — non câblé dans cette migration.
--
-- À appliquer manuellement via Supabase Dashboard > SQL Editor.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE motos ADD COLUMN IF NOT EXISTS profil_transmission TEXT
  CHECK (profil_transmission IN ('chaine','courroie','cardan')) DEFAULT 'chaine';
ALTER TABLE motos ADD COLUMN IF NOT EXISTS profil_transmission_source TEXT
  CHECK (profil_transmission_source IN ('auto','manuel')) DEFAULT 'auto';

CREATE TABLE IF NOT EXISTS profils_transmission_modeles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marque              TEXT NOT NULL,
  -- Pattern SQL LIKE (% = wildcard), comparé côté JS via regex — voir
  -- services/profilTransmission.js. Non exhaustif, alimenté au fil de l'eau.
  modele_pattern      TEXT NOT NULL,
  profil_transmission TEXT NOT NULL CHECK (profil_transmission IN ('chaine','courroie','cardan')),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profils_transmission_marque ON profils_transmission_modeles(marque);

INSERT INTO profils_transmission_modeles (marque, modele_pattern, profil_transmission) VALUES
  ('Yamaha','T-MAX%','courroie'),
  ('Honda','SILVER WING%','courroie'),
  ('BMW','R 1%','cardan'),
  ('BMW','K 1%','cardan'),
  ('Moto Guzzi','%','cardan'),
  ('Harley-Davidson','%','courroie');

-- Default-deny (D-01, même pattern que consommables/releves_km Phase 23) :
-- aucun chemin client direct vers cette table, seul service_role (supabase.js) y accède.
ALTER TABLE profils_transmission_modeles ENABLE ROW LEVEL SECURITY;
