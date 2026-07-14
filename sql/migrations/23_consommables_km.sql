-- ═══════════════════════════════════════════════════════════
-- Migration 23 — Phase 23 (v1.6) : schéma consommables + source de
-- vérité km (releves_km) + anti-fraude km au niveau DB
-- ═══════════════════════════════════════════════════════════
-- Crée 4 tables : consommables, photos_consommables, releves_km,
-- releves_km_rejets. releves_km devient LA source de vérité du km ;
-- motos.km devient une colonne dérivée/cache, synchronisée
-- automatiquement par trg_sync_moto_km (AFTER INSERT).
--
-- Anti-fraude km (KM-01) : trigger BEFORE INSERT verifier_km_monotone
-- rejette (RETURN NULL, jamais d'exception levée) tout relevé inférieur
-- au max historique de la moto, et journalise la tentative dans
-- releves_km_rejets (D-04 : acteur jamais anonyme). Le changement de
-- compteur (type_evenement='remplacement_compteur', gate PRO+ côté
-- app) démarre une chaîne monotone fraîche.
--
-- Consommables (CONSO-02) : type_consommable en TEXT + CHECK (9 types
-- v1), extensible par migration légère — même pattern que
-- interventions.niveau_preuve (schema.sql).
--
-- Supprime aussi le clamp legacy trg_update_km/update_moto_km()
-- (D-05/KM-04) : le km d'intervention est un historique découplé qui
-- ne doit plus toucher motos.km — motos.km n'est désormais écrit QUE
-- par trg_sync_moto_km.
--
-- RLS activé sans policy explicite sur les 4 nouvelles tables
-- (default-deny anon/authenticated, seul service_role lit/écrit) —
-- même pattern que garage_users/client_device_tokens/push_send_log
-- (Phase 19) et les 4 tables Gap B (Phase 21). Autorisation réelle
-- (requireRole + ownership) ajoutée en Phase 25 avec les endpoints
-- HTTP — aucun chemin client-atteignable vers ces tables n'existe
-- encore à ce stade.
--
-- Hand-appended dans schema.sql dans le même commit (discipline v1.6,
-- leçon centrale de v1.5).
-- ═══════════════════════════════════════════════════════════

-- ── D-05 / KM-04 : suppression du clamp legacy ──
-- Le km d'intervention est un historique découplé — il ne doit plus
-- toucher motos.km. On retire l'ancien clamp GREATEST (second writer
-- non coordonné, incompatible avec "releves_km = source de vérité
-- unique"). Désormais motos.km n'est écrit QUE par trg_sync_moto_km
-- ci-dessous.
DROP TRIGGER IF EXISTS trg_update_km ON interventions;
DROP FUNCTION IF EXISTS update_moto_km();

-- ══════════════════════════════════════════════════════════
-- Phase 23 (v1.6) — Consommables + source de vérité km
-- ══════════════════════════════════════════════════════════

CREATE TABLE consommables (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moto_id           UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  -- Extensibilité CONSO-02 : TEXT + CHECK (même pattern que interventions.niveau_preuve).
  -- Ajouter un type plus tard = ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT (migration légère).
  type_consommable  TEXT NOT NULL CHECK (type_consommable IN (
                      'pneu_av','pneu_ar','chaine','plaquettes_av','plaquettes_ar',
                      'disque_av','disque_ar','huile_moteur','liquide_frein')),
  km_montage        INTEGER,
  date_montage      DATE,
  reference         TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (moto_id, type_consommable)
);

CREATE TABLE photos_consommables (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moto_id           UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  consommable_id    UUID REFERENCES consommables(id) ON DELETE CASCADE,
  type_consommable  TEXT,
  photo_url         TEXT NOT NULL,
  analyse_ia        JSONB,           -- rempli par le stub vision (Phase 24/25) — nommé analyse_ia (pas "analyse", mot réservé Postgres/ANALYZE)
  analyse_status    TEXT,            -- ok / incertain / echec (Phase 24)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE releves_km (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moto_id           UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  garage_id         UUID,            -- nullable : moto client sans garage (modèle L8) ; renseigné côté app
  km                INTEGER NOT NULL CHECK (km >= 0),
  type_evenement    TEXT NOT NULL DEFAULT 'lecture'
                      CHECK (type_evenement IN ('lecture','lecture_initiale','remplacement_compteur')),
  acteur_type       TEXT NOT NULL CHECK (acteur_type IN ('client','garage')),  -- D-04 : jamais anonyme
  acteur_id         UUID NOT NULL,
  note              TEXT,            -- obligatoire côté app pour remplacement_compteur (D-03)
  photo_url         TEXT,           -- photo compteur optionnelle (Phase 25)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE releves_km_rejets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moto_id           UUID NOT NULL,
  garage_id         UUID,
  acteur_type       TEXT,
  acteur_id         UUID,
  km_tente          INTEGER NOT NULL,
  km_actuel         INTEGER NOT NULL,  -- vrai max historique au moment de la tentative (D-04)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_releves_km_moto        ON releves_km(moto_id, created_at DESC);
CREATE INDEX idx_releves_km_rejets_moto ON releves_km_rejets(moto_id, created_at DESC);
CREATE INDEX idx_consommables_moto      ON consommables(moto_id);
CREATE INDEX idx_photos_conso_moto      ON photos_consommables(moto_id);

-- ══════════════════════════════════════════════════════════
-- Phase 23 (v1.6) — Triggers km (monotone + sync)
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION verifier_km_monotone()
RETURNS TRIGGER AS $$
DECLARE
  v_moto_km    INTEGER;
  v_last_reset TIMESTAMPTZ;
  v_max_releve INTEGER;
  v_km_actuel  INTEGER;
BEGIN
  -- Bypass total pour un changement de compteur explicite (gate PRO+ fait côté app).
  -- Démarre une chaîne monotone FRAÎCHE : les relevés suivants ne seront comparés
  -- qu'aux relevés postérieurs à ce remplacement.
  IF NEW.type_evenement = 'remplacement_compteur' THEN
    RETURN NEW;
  END IF;

  SELECT km INTO v_moto_km FROM motos WHERE id = NEW.moto_id;

  SELECT MAX(created_at) INTO v_last_reset
    FROM releves_km
    WHERE moto_id = NEW.moto_id AND type_evenement = 'remplacement_compteur';

  SELECT MAX(km) INTO v_max_releve
    FROM releves_km
    WHERE moto_id = NEW.moto_id
      AND (v_last_reset IS NULL OR created_at >= v_last_reset);

  -- NULL-safe baseline (Pitfall A) : sans GREATEST(v_moto_km, ...), le tout premier
  -- releve de CHAQUE moto prod existante (releves_km vide mais motos.km déjà peuplé)
  -- passerait quelle que soit sa valeur, car MAX sur 0 ligne = NULL et "NEW.km < NULL"
  -- vaut NULL (faux) en PL/pgSQL. Après un remplacement, v_moto_km reflète déjà le
  -- nouveau compteur bas (posé par trg_sync_moto_km), donc GREATEST reste correct.
  v_km_actuel := GREATEST(COALESCE(v_moto_km, 0), COALESCE(v_max_releve, 0));

  IF NEW.km < v_km_actuel THEN
    INSERT INTO releves_km_rejets
      (moto_id, garage_id, acteur_type, acteur_id, km_tente, km_actuel, created_at)
    VALUES
      (NEW.moto_id, NEW.garage_id, NEW.acteur_type, NEW.acteur_id, NEW.km, v_km_actuel, NOW());
    RETURN NULL;  -- annule UNIQUEMENT cet insert — pas d'exception, le log survit (Pitfall B)
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verifier_km_monotone
  BEFORE INSERT ON releves_km
  FOR EACH ROW EXECUTE FUNCTION verifier_km_monotone();

CREATE OR REPLACE FUNCTION sync_moto_km_depuis_releve()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE motos SET km = NEW.km, updated_at = NOW() WHERE id = NEW.moto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_moto_km
  AFTER INSERT ON releves_km
  FOR EACH ROW EXECUTE FUNCTION sync_moto_km_depuis_releve();

-- ══════════════════════════════════════════════════════════
-- Phase 23 (v1.6) — RLS default-deny (D-01)
-- ══════════════════════════════════════════════════════════
ALTER TABLE consommables         ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos_consommables  ENABLE ROW LEVEL SECURITY;
ALTER TABLE releves_km           ENABLE ROW LEVEL SECURITY;
ALTER TABLE releves_km_rejets    ENABLE ROW LEVEL SECURITY;
-- Phase 23 (v1.6) : RLS activé SANS policy explicite, INTENTIONNEL — même pattern que
-- garage_users/client_device_tokens/push_send_log (Phase 19) et les 4 tables Gap B (Phase 21).
-- Default-deny pour anon/authenticated ; seul service_role (utilisé par supabase.js) lit/écrit.
-- Toute l'autorisation réelle (requireRole() + ownership via moto_id/garage_id) vit dans
-- motokey-api.js, ajoutée en Phase 25 avec les endpoints HTTP — Phase 23 livre le schéma seul,
-- aucun chemin client-atteignable vers ces tables n'existe encore.
