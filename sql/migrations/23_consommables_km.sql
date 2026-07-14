-- ═══════════════════════════════════════════════════════════
-- Migration 23 — Phase 23 (v1.6) : schéma consommables + source de
-- vérité km (releves_km) + anti-fraude km au niveau DB
-- ═══════════════════════════════════════════════════════════
-- Crée 4 tables : consommables, photos_consommables, releves_km,
-- releves_km_rejets. releves_km devient LA source de vérité du km ;
-- motos.km devient une colonne dérivée/cache, synchronisée
-- automatiquement par trg_sync_moto_km (AFTER INSERT, ajouté par la
-- suite de cette migration ci-dessous — voir bloc Triggers).
--
-- Consommables (CONSO-02) : type_consommable en TEXT + CHECK (9 types
-- v1), extensible par migration légère — même pattern que
-- interventions.niveau_preuve (schema.sql).
--
-- Hand-appended dans schema.sql dans le même commit (discipline v1.6,
-- leçon centrale de v1.5).
-- ═══════════════════════════════════════════════════════════

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
  analyse           JSONB,           -- rempli par le stub vision (Phase 24/25)
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
