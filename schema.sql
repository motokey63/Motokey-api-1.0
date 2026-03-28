-- ╔══════════════════════════════════════════════════════════╗
-- ║         MOTOKEY — SCHÉMA SUPABASE COMPLET v2            ║
-- ║         Corrigé : RLS avec EXISTS au lieu de IN          ║
-- ╚══════════════════════════════════════════════════════════╝

-- ══════════════════════════════════════════════════════════
-- EXTENSIONS
-- ══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════
-- NETTOYAGE
-- ══════════════════════════════════════════════════════════
DROP TABLE IF EXISTS transfert_steps        CASCADE;
DROP TABLE IF EXISTS transferts             CASCADE;
DROP TABLE IF EXISTS fraude_verifications   CASCADE;
DROP TABLE IF EXISTS devis_lignes           CASCADE;
DROP TABLE IF EXISTS devis                  CASCADE;
DROP TABLE IF EXISTS plan_entretien         CASCADE;
DROP TABLE IF EXISTS interventions          CASCADE;
DROP TABLE IF EXISTS motos                  CASCADE;
DROP TABLE IF EXISTS clients                CASCADE;
DROP TABLE IF EXISTS techniciens            CASCADE;
DROP TABLE IF EXISTS garages                CASCADE;
DROP TYPE  IF EXISTS couleur_dossier_type   CASCADE;
DROP TYPE  IF EXISTS type_intervention      CASCADE;
DROP TYPE  IF EXISTS statut_devis           CASCADE;
DROP TYPE  IF EXISTS statut_transfert       CASCADE;
DROP TYPE  IF EXISTS verdict_fraude         CASCADE;
DROP TYPE  IF EXISTS plan_abonnement        CASCADE;
DROP TYPE  IF EXISTS type_ligne_devis       CASCADE;
DROP TYPE  IF EXISTS statut_operation       CASCADE;

-- ══════════════════════════════════════════════════════════
-- TYPES ENUM
-- ══════════════════════════════════════════════════════════
CREATE TYPE couleur_dossier_type AS ENUM ('vert','bleu','jaune','rouge');
CREATE TYPE type_intervention     AS ENUM ('vert','bleu','jaune','rouge');
CREATE TYPE statut_devis          AS ENUM ('brouillon','envoye','valide','annule');
CREATE TYPE statut_transfert      AS ENUM ('initie','vendeur_confirme','acheteur_consulte','finalise','expire','annule');
CREATE TYPE verdict_fraude        AS ENUM ('authentifie','partiel','fraude_suspectee');
CREATE TYPE plan_abonnement       AS ENUM ('starter','pro','expert');
CREATE TYPE type_ligne_devis      AS ENUM ('mo','piece','pneu','fluide','libre');
CREATE TYPE statut_operation      AS ENUM ('urgent','warning','due','ok','future');

-- ══════════════════════════════════════════════════════════
-- TABLE : garages
-- ══════════════════════════════════════════════════════════
CREATE TABLE garages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id    UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nom             TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  siret           TEXT,
  tel             TEXT,
  adresse         TEXT,
  logo_url        TEXT,
  taux_std        NUMERIC(6,2) NOT NULL DEFAULT 65.00,
  taux_spec       NUMERIC(6,2) NOT NULL DEFAULT 80.00,
  tva             NUMERIC(4,1) NOT NULL DEFAULT 20.0,
  plan            plan_abonnement NOT NULL DEFAULT 'starter',
  plan_expire_at  TIMESTAMPTZ,
  sms_active      BOOLEAN DEFAULT false,
  qr_prefix       TEXT DEFAULT 'MK',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- TABLE : techniciens
-- ══════════════════════════════════════════════════════════
CREATE TABLE techniciens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garage_id    UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  nom          TEXT NOT NULL,
  role         TEXT DEFAULT 'technicien',
  email        TEXT,
  certifie     BOOLEAN DEFAULT false,
  cle_publique TEXT,
  actif        BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- TABLE : clients
-- ══════════════════════════════════════════════════════════
CREATE TABLE clients (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id     UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  garage_id        UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  nom              TEXT NOT NULL,
  email            TEXT,
  tel              TEXT,
  adresse          TEXT,
  nb_interventions INTEGER DEFAULT 0,
  client_depuis    TIMESTAMPTZ DEFAULT NOW(),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- TABLE : motos
-- ══════════════════════════════════════════════════════════
CREATE TABLE motos (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garage_id        UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  marque           TEXT NOT NULL,
  modele           TEXT NOT NULL,
  annee            SMALLINT NOT NULL,
  plaque           TEXT NOT NULL,
  vin              TEXT NOT NULL UNIQUE,
  couleur          TEXT,
  km               INTEGER NOT NULL DEFAULT 0,
  couleur_dossier  couleur_dossier_type NOT NULL DEFAULT 'rouge',
  score            SMALLINT NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  pneu_av          TEXT,
  pneu_ar          TEXT,
  pneu_km_montage  INTEGER,
  carte_grise_url  TEXT,
  photo_url        TEXT,
  qr_code_url      TEXT,
  locked           BOOLEAN DEFAULT false,
  locked_reason    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- TABLE : interventions
-- ══════════════════════════════════════════════════════════
CREATE TABLE interventions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moto_id           UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  garage_id         UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  technicien_id     UUID REFERENCES techniciens(id) ON DELETE SET NULL,
  devis_id          UUID,
  type              type_intervention NOT NULL,
  titre             TEXT NOT NULL,
  description       TEXT,
  km                INTEGER NOT NULL DEFAULT 0,
  date_intervention DATE NOT NULL DEFAULT CURRENT_DATE,
  montant_ht        NUMERIC(10,2) DEFAULT 0,
  montant_ttc       NUMERIC(10,2) DEFAULT 0,
  score_confiance   SMALLINT DEFAULT 0 CHECK (score_confiance >= 0 AND score_confiance <= 100),
  qr_code           TEXT,
  signature_hash    TEXT,
  facture_url       TEXT,
  facture_ocr       JSONB,
  notifie_client    BOOLEAN DEFAULT false,
  notifie_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- TABLE : plan_entretien
-- ══════════════════════════════════════════════════════════
CREATE TABLE plan_entretien (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moto_id        UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  code_operation TEXT NOT NULL,
  icon           TEXT DEFAULT '🔧',
  nom            TEXT NOT NULL,
  km_interval    INTEGER NOT NULL DEFAULT 0,
  mois_interval  INTEGER,
  km_derniere    INTEGER DEFAULT 0,
  date_derniere  DATE,
  temps_h        NUMERIC(4,2),
  produit        TEXT,
  tags           TEXT[],
  source         TEXT DEFAULT 'Autodata',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(moto_id, code_operation)
);

-- ══════════════════════════════════════════════════════════
-- TABLE : devis
-- ══════════════════════════════════════════════════════════
CREATE TABLE devis (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  moto_id         UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  garage_id       UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  technicien_id   UUID REFERENCES techniciens(id) ON DELETE SET NULL,
  numero          TEXT NOT NULL,
  statut          statut_devis NOT NULL DEFAULT 'brouillon',
  remise_type     TEXT DEFAULT 'aucun',
  remise_pct      NUMERIC(5,2) DEFAULT 0,
  remise_note     TEXT,
  tva             NUMERIC(4,1) NOT NULL DEFAULT 20.0,
  total_mo_ht     NUMERIC(10,2) DEFAULT 0,
  total_pieces_ht NUMERIC(10,2) DEFAULT 0,
  remise_lignes   NUMERIC(10,2) DEFAULT 0,
  sous_total_ht   NUMERIC(10,2) DEFAULT 0,
  remise_globale  NUMERIC(10,2) DEFAULT 0,
  base_ht         NUMERIC(10,2) DEFAULT 0,
  tva_montant     NUMERIC(10,2) DEFAULT 0,
  total_ttc       NUMERIC(10,2) DEFAULT 0,
  valide_at       TIMESTAMPTZ,
  expire_at       TIMESTAMPTZ,
  pdf_url         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- TABLE : devis_lignes
-- ══════════════════════════════════════════════════════════
CREATE TABLE devis_lignes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  devis_id         UUID NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  position         SMALLINT DEFAULT 0,
  type_ligne       type_ligne_devis NOT NULL DEFAULT 'libre',
  icon             TEXT DEFAULT '🔧',
  description      TEXT NOT NULL,
  reference        TEXT,
  quantite         NUMERIC(8,3) NOT NULL DEFAULT 1,
  prix_unitaire    NUMERIC(10,2) NOT NULL DEFAULT 0,
  remise_pct       NUMERIC(5,2) DEFAULT 0,
  remise_type      TEXT DEFAULT '',
  remise_note      TEXT DEFAULT '',
  total_ht         NUMERIC(10,2) DEFAULT 0,
  taux_specialiste BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- FK devis dans interventions
ALTER TABLE interventions
  ADD CONSTRAINT fk_devis
  FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════════════════
-- TABLE : fraude_verifications
-- ══════════════════════════════════════════════════════════
CREATE TABLE fraude_verifications (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garage_id        UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  moto_id          UUID REFERENCES motos(id) ON DELETE SET NULL,
  intervention_id  UUID REFERENCES interventions(id) ON DELETE SET NULL,
  garage_nom       TEXT,
  montant          NUMERIC(10,2),
  km               INTEGER,
  description      TEXT,
  check_document   JSONB,
  check_ocr        JSONB,
  check_coherence  JSONB,
  check_qr         JSONB,
  check_signature  JSONB,
  score            SMALLINT NOT NULL DEFAULT 0,
  verdict          verdict_fraude NOT NULL,
  recommandation   TEXT,
  decision         TEXT,
  decide_at        TIMESTAMPTZ,
  decide_par       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- TABLE : transferts
-- ══════════════════════════════════════════════════════════
CREATE TABLE transferts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  garage_id           UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  moto_id             UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  vendeur_client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  acheteur_nom        TEXT NOT NULL,
  acheteur_email      TEXT,
  acheteur_tel        TEXT,
  nouveau_client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  prix                NUMERIC(10,2) NOT NULL,
  km_cession          INTEGER NOT NULL,
  notes               TEXT,
  code                TEXT NOT NULL UNIQUE,
  expire_at           TIMESTAMPTZ NOT NULL,
  statut              statut_transfert NOT NULL DEFAULT 'initie',
  signature_vendeur   TEXT,
  signature_acheteur  TEXT,
  certificat_id       TEXT,
  certificat_hash     TEXT,
  certificat_url      TEXT,
  finalise_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- TABLE : transfert_steps
-- ══════════════════════════════════════════════════════════
CREATE TABLE transfert_steps (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfert_id UUID NOT NULL REFERENCES transferts(id) ON DELETE CASCADE,
  etape        TEXT NOT NULL,
  par          TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════
-- TRIGGERS : updated_at automatique
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_garages_upd    BEFORE UPDATE ON garages    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clients_upd    BEFORE UPDATE ON clients    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_motos_upd      BEFORE UPDATE ON motos      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_devis_upd      BEFORE UPDATE ON devis      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transferts_upd BEFORE UPDATE ON transferts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════
-- TRIGGER : Recalcul score MotoKey après chaque intervention
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION recalc_score_moto()
RETURNS TRIGGER AS $$
DECLARE
  v_moto_id  UUID;
  v_score    INTEGER;
  v_couleur  couleur_dossier_type;
BEGIN
  v_moto_id := COALESCE(NEW.moto_id, OLD.moto_id);

  SELECT GREATEST(0, LEAST(100, COALESCE(SUM(
    CASE type
      WHEN 'vert'  THEN 12
      WHEN 'bleu'  THEN 8
      WHEN 'jaune' THEN 5
      WHEN 'rouge' THEN -5
      ELSE 0
    END
  ), 0)))
  INTO v_score
  FROM interventions
  WHERE moto_id = v_moto_id;

  v_couleur := CASE
    WHEN v_score >= 80 THEN 'vert'
    WHEN v_score >= 60 THEN 'bleu'
    WHEN v_score >= 40 THEN 'jaune'
    ELSE 'rouge'
  END::couleur_dossier_type;

  UPDATE motos
  SET score = v_score, couleur_dossier = v_couleur, updated_at = NOW()
  WHERE id = v_moto_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_score
  AFTER INSERT OR UPDATE OR DELETE ON interventions
  FOR EACH ROW EXECUTE FUNCTION recalc_score_moto();

-- ══════════════════════════════════════════════════════════
-- TRIGGER : Mise à jour km moto
-- ══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_moto_km()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE motos
  SET km = GREATEST(km, NEW.km), updated_at = NOW()
  WHERE id = NEW.moto_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_km
  AFTER INSERT OR UPDATE ON interventions
  FOR EACH ROW EXECUTE FUNCTION update_moto_km();

-- ══════════════════════════════════════════════════════════
-- INDEX
-- ══════════════════════════════════════════════════════════
CREATE INDEX idx_motos_garage       ON motos(garage_id);
CREATE INDEX idx_motos_client       ON motos(client_id);
CREATE INDEX idx_motos_plaque       ON motos(plaque);
CREATE INDEX idx_motos_vin          ON motos(vin);
CREATE INDEX idx_motos_couleur      ON motos(couleur_dossier);
CREATE INDEX idx_inter_moto         ON interventions(moto_id);
CREATE INDEX idx_inter_date         ON interventions(date_intervention DESC);
CREATE INDEX idx_inter_type         ON interventions(type);
CREATE INDEX idx_devis_moto         ON devis(moto_id);
CREATE INDEX idx_devis_garage       ON devis(garage_id);
CREATE INDEX idx_devis_statut       ON devis(statut);
CREATE INDEX idx_plan_moto          ON plan_entretien(moto_id);
CREATE INDEX idx_transferts_code    ON transferts(code);
CREATE INDEX idx_transferts_statut  ON transferts(statut);
CREATE INDEX idx_fraude_garage      ON fraude_verifications(garage_id);
CREATE INDEX idx_clients_garage     ON clients(garage_id);

-- ══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════
ALTER TABLE garages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE techniciens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE motos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_entretien       ENABLE ROW LEVEL SECURITY;
ALTER TABLE devis                ENABLE ROW LEVEL SECURITY;
ALTER TABLE devis_lignes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraude_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE transferts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfert_steps      ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION my_garage_id()
RETURNS UUID AS $$
  SELECT id FROM garages WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION my_client_id()
RETURNS UUID AS $$
  SELECT id FROM clients WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- GARAGES
CREATE POLICY "garage_own" ON garages
  FOR ALL USING (auth_user_id = auth.uid());

-- TECHNICIENS
CREATE POLICY "techniciens_own" ON techniciens
  FOR ALL USING (garage_id = my_garage_id());

-- CLIENTS
CREATE POLICY "clients_garage_access" ON clients
  FOR ALL USING (
    garage_id = my_garage_id()
    OR auth_user_id = auth.uid()
  );

-- MOTOS — garage
CREATE POLICY "motos_garage_all" ON motos
  FOR ALL USING (garage_id = my_garage_id());

-- MOTOS — client lecture (EXISTS au lieu de IN)
CREATE POLICY "motos_client_read" ON motos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = motos.client_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- INTERVENTIONS — garage
CREATE POLICY "inter_garage_all" ON interventions
  FOR ALL USING (garage_id = my_garage_id());

-- INTERVENTIONS — client lecture (EXISTS)
CREATE POLICY "inter_client_read" ON interventions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM motos m
      JOIN clients c ON c.id = m.client_id
      WHERE m.id = interventions.moto_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- PLAN ENTRETIEN — garage
CREATE POLICY "plan_garage_all" ON plan_entretien
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM motos m
      WHERE m.id = plan_entretien.moto_id
        AND m.garage_id = my_garage_id()
    )
  );

-- PLAN ENTRETIEN — client lecture (EXISTS)
CREATE POLICY "plan_client_read" ON plan_entretien
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM motos m
      JOIN clients c ON c.id = m.client_id
      WHERE m.id = plan_entretien.moto_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- DEVIS — garage uniquement
CREATE POLICY "devis_garage_all" ON devis
  FOR ALL USING (garage_id = my_garage_id());

-- DEVIS LIGNES — garage (EXISTS)
CREATE POLICY "devis_lignes_garage" ON devis_lignes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM devis d
      WHERE d.id = devis_lignes.devis_id
        AND d.garage_id = my_garage_id()
    )
  );

-- FRAUDE — garage uniquement
CREATE POLICY "fraude_garage_all" ON fraude_verifications
  FOR ALL USING (garage_id = my_garage_id());

-- TRANSFERTS — garage
CREATE POLICY "transferts_garage_all" ON transferts
  FOR ALL USING (garage_id = my_garage_id());

-- TRANSFERT STEPS — garage (EXISTS)
CREATE POLICY "transfert_steps_garage" ON transfert_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM transferts t
      WHERE t.id = transfert_steps.transfert_id
        AND t.garage_id = my_garage_id()
    )
  );

-- ══════════════════════════════════════════════════════════
-- REALTIME
-- ══════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE interventions;
ALTER PUBLICATION supabase_realtime ADD TABLE motos;
ALTER PUBLICATION supabase_realtime ADD TABLE plan_entretien;

-- ══════════════════════════════════════════════════════════
-- VÉRIFICATION FINALE
-- ══════════════════════════════════════════════════════════
SELECT tablename, rowsecurity AS rls
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
