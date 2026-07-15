-- ╔══════════════════════════════════════════════════════════╗
-- ║         MOTOKEY — SCHÉMA SUPABASE COMPLET v2            ║
-- ║         Corrigé : RLS avec EXISTS au lieu de IN          ║
-- ╚══════════════════════════════════════════════════════════╝

-- ⚠️ BOOTSTRAP PARTIEL CONNU (Phase 19 v1.4 — 2026-07-08 ; Gap A + Gap B résolus et vérifiés Phases 21-22 v1.5 — 2026-07-10)
-- Ce fichier reflète le schéma prod pour les objets des migrations 1–19 UNIQUEMENT.
-- Il NE couvre PAS ~19 tables/vues qui existent en prod sans fichier de migration :
--   • Ordres de réparation : ordres_reparation, or_taches, or_pieces, or_historique
--   • Facturation/billing   : entites_facturation, factures, factures_scannees, compteurs_documents
--   • E-invoicing (PDP)      : pdp_queue, pdp_transmissions
--   • Catalogue pièces       : catalogue_pieces
--   • Plans constructeur     : plans_constructeur
--   • Propriété moto          : moto_proprietaires
--   • Auth client séparée     : users_client, users_client_sessions, email_verifications, password_resets, auth_logs
--   • Vues                    : v_factures_pdp, v_users_client_stats
-- Un projet bootstrappé ici obtient le socle garage (migrations 1–19), PAS ces sous-systèmes.
-- Parité complète 38 tables : différée (voir REQUIREMENTS.md Out of Scope, narrowed 2026-07-08).
--
-- Gap B (objets des migrations 13/15) — RÉSOLU en Phase 21 (SCHEMA-06), vérifié par bootstrap
-- propre + comparaison automatique vs prod en Phase 22 (SCHEMA-07) :
--   • billing_events (migration 15) + motos_proprietaires_historique, liaisons_client_garage,
--     reclamations_moto et la vue v_motos_avec_proprietaire (migration 13) sont créés ci-dessous.
--
-- Gap A (39 colonnes prod sans fichier de migration, sur garages/clients/interventions/devis) —
-- RÉSOLU en Phase 21 (SCHEMA-04/05), vérifié bootstrap Phase 22 (SCHEMA-07) :
--   • Chaque colonne porte un commentaire d'origine inline dans son bloc CREATE TABLE ci-dessous.
--   • Détail origine/verdict : sql/migrations/20_garages_undocumented_columns.sql,
--     sql/migrations/21_interventions_undocumented_columns.sql,
--     sql/migrations/22_devis_undocumented_columns.sql (+ .planning .../20-FINDINGS.md).

-- ══════════════════════════════════════════════════════════
-- EXTENSIONS
-- ══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════
-- NETTOYAGE
-- ══════════════════════════════════════════════════════════
DROP VIEW  IF EXISTS v_motos_avec_proprietaire     CASCADE;
DROP TABLE IF EXISTS releves_km_rejets             CASCADE;
DROP TABLE IF EXISTS releves_km                    CASCADE;
DROP TABLE IF EXISTS photos_consommables           CASCADE;
DROP TABLE IF EXISTS consommables                  CASCADE;
DROP TABLE IF EXISTS reclamations_moto             CASCADE;
DROP TABLE IF EXISTS liaisons_client_garage        CASCADE;
DROP TABLE IF EXISTS motos_proprietaires_historique CASCADE;
DROP TABLE IF EXISTS billing_events                CASCADE;
DROP TABLE IF EXISTS push_send_log          CASCADE;
DROP TABLE IF EXISTS client_device_tokens   CASCADE;
DROP TABLE IF EXISTS garage_users           CASCADE;
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
DROP TYPE  IF EXISTS statut_transfert       CASCADE;
DROP TYPE  IF EXISTS verdict_fraude         CASCADE;
DROP TYPE  IF EXISTS plan_abonnement        CASCADE;
DROP TYPE  IF EXISTS type_ligne_devis       CASCADE;
DROP TYPE  IF EXISTS statut_operation       CASCADE;
DROP TYPE  IF EXISTS proprietaire_type_enum CASCADE;
DROP TYPE  IF EXISTS client_type_enum       CASCADE;
DROP TYPE  IF EXISTS mode_acquisition_enum     CASCADE;

-- ══════════════════════════════════════════════════════════
-- TYPES ENUM
-- ══════════════════════════════════════════════════════════
CREATE TYPE couleur_dossier_type AS ENUM ('vert','bleu','jaune','rouge');
CREATE TYPE type_intervention     AS ENUM ('vert','bleu','jaune','rouge');
CREATE TYPE statut_transfert      AS ENUM ('initie','vendeur_confirme','acheteur_consulte','finalise','expire','annule');
CREATE TYPE verdict_fraude        AS ENUM ('authentifie','partiel','fraude_suspectee');
CREATE TYPE plan_abonnement       AS ENUM ('starter','pro','expert');
CREATE TYPE type_ligne_devis      AS ENUM ('mo','piece','pneu','fluide','libre');
CREATE TYPE statut_operation      AS ENUM ('urgent','warning','due','ok','future');
CREATE TYPE proprietaire_type_enum AS ENUM ('client', 'garage', 'inconnu');
CREATE TYPE client_type_enum      AS ENUM ('particulier','pro');
CREATE TYPE mode_acquisition_enum AS ENUM ('achat_neuf','achat_occasion','reprise_garage','cession_perso','mise_en_stock','inconnu','don','heritage');

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
  mecano_session_timeout_minutes INTEGER DEFAULT 60 CHECK (mecano_session_timeout_minutes IN (15, 60, 480)),
  stripe_customer_id              TEXT,
  stripe_subscription_id          TEXT,
  plan_code                       TEXT,
  subscription_status             TEXT,
  subscription_current_period_end TIMESTAMPTZ,
  grace_period_ends_at            TIMESTAMPTZ,
  motos_limit                     INTEGER,
  users_limit                     INTEGER,
  -- Gap A (Phase 21, SCHEMA-05) — colonnes prod sans fichier de migration (voir sql/migrations/20)
  ville             TEXT,                          -- découpage d'adresse structuré, préparé mais jamais câblé (confirmé Mehdi 2026-07-09)
  cp                TEXT,                          -- découpage d'adresse structuré, préparé mais jamais câblé (confirmé Mehdi 2026-07-09)
  type              TEXT NOT NULL DEFAULT 'pro',   -- origine indéterminée, non utilisée par le code actuel (verdict terminal Phase 20)
  marque_officielle TEXT,                          -- origine indéterminée, non utilisée par le code actuel (verdict terminal Phase 20)
  actif             BOOLEAN NOT NULL DEFAULT true, -- origine indéterminée, non utilisée par le code actuel (verdict terminal Phase 20)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN garages.mecano_session_timeout_minutes IS
  'Politique de timeout session MÉCANO en minutes. 15=strict, 60=modéré, 480=souple. Configurable par PRO+.';
COMMENT ON COLUMN garages.subscription_status IS 'Valeurs attendues : NULL (pas de billing actif), trialing, active, grace, blocked, canceled.';
COMMENT ON COLUMN garages.motos_limit IS 'NULL = illimite (Concession ou pas de billing actif). INTEGER = quota plan Solo/Atelier.';
COMMENT ON COLUMN garages.users_limit IS 'NULL = illimite (Concession ou pas de billing actif). INTEGER = quota plan Solo/Atelier.';

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
  -- Gap A (Phase 21, SCHEMA-05) — porté depuis migrations/04-rbac-migration.sql @ c66ad69 (RBAC L4, origine documentée, pas une dérive)
  client_type          client_type_enum NOT NULL DEFAULT 'particulier',
  raison_sociale       TEXT,
  siret                TEXT,
  tva_intracom         TEXT,
  adresse_facturation  TEXT,
  is_pro                  BOOLEAN NOT NULL DEFAULT FALSE,
  limite_motos_gratuites  INT NOT NULL DEFAULT 3,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT clients_email_garage_id_key UNIQUE (email, garage_id),
  CONSTRAINT clients_pro_requirements CHECK (
    client_type = 'particulier'
    OR (client_type = 'pro' AND raison_sociale IS NOT NULL AND siret IS NOT NULL)
  )
);

-- ══════════════════════════════════════════════════════════
-- TABLE : garage_users
-- ══════════════════════════════════════════════════════════
CREATE TABLE garage_users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  garage_id    UUID        NOT NULL REFERENCES garages(id)    ON DELETE CASCADE,
  role         TEXT        NOT NULL CHECK (role IN ('PRO', 'MECANO')),
  actif        BOOLEAN     DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  created_by   UUID        REFERENCES auth.users(id),
  UNIQUE (auth_user_id, garage_id)
);

CREATE INDEX idx_garage_users_garage ON garage_users(garage_id) WHERE actif = true;
CREATE INDEX idx_garage_users_auth   ON garage_users(auth_user_id) WHERE actif = true;

COMMENT ON TABLE garage_users IS 'Liaison comptes auth.users ↔ garages avec rôle (PRO ou MECANO). Permet de lier un mécano employé à son garage employeur.';
COMMENT ON COLUMN garage_users.role IS 'PRO = gérant/technicien senior, MECANO = technicien atelier. Ne contient pas CONCESSION/ADMIN/CLIENT (ces rôles sont gérés ailleurs).';

-- ══════════════════════════════════════════════════════════
-- TABLE : client_device_tokens
-- ══════════════════════════════════════════════════════════
CREATE TABLE client_device_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token        TEXT        NOT NULL UNIQUE,
  platform     TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_device_tokens_client ON client_device_tokens(client_id);

COMMENT ON TABLE client_device_tokens IS 'Jetons push Expo (mobile) liés à un client. Un client peut avoir plusieurs devices actifs (multi-appareil, D-01). UNIQUE(token) permet la réassignation upsert (D-02) si un device change de propriétaire.';

-- ══════════════════════════════════════════════════════════
-- TABLE : push_send_log
-- ══════════════════════════════════════════════════════════
-- NOTE (2026-07-02): client_id is intentionally a plain UUID, NOT a foreign key to clients(id).
-- The original REFERENCES clients(id) ON DELETE SET NULL clause caused the multi-column
-- ALTER TABLE application to fail/rollback in the live Supabase project (root cause not
-- identified; clients.id confirmed present and UUID-shaped). Dropping the FK unblocked it.
-- Not required by any current code path: client_id is nullable, used only for debugging
-- per CONTEXT.md's discretion note, and never enforced/joined by pushService.js.
CREATE TABLE push_send_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT        NOT NULL UNIQUE,
  client_id       UUID,
  token           TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_send_log_client ON push_send_log(client_id);

COMMENT ON TABLE push_send_log IS 'Garde d''idempotency des envois push. UNIQUE(idempotency_key) : un INSERT en doublon (code 23505) signale "déjà envoyé" et court-circuite le renvoi (pattern billing_events). client_id/token nullable : sendToToken en test manuel n''a pas de client_id.';

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
  last_maintenance_tier_notified    TEXT CHECK (last_maintenance_tier_notified IN ('warning', 'urgent') OR last_maintenance_tier_notified IS NULL),
  last_maintenance_tier_notified_at TIMESTAMPTZ,
  proprietaire_type       proprietaire_type_enum NOT NULL DEFAULT 'client',
  proprietaire_garage_id   UUID NULL REFERENCES garages(id) ON DELETE RESTRICT,
  proprio_libre            TEXT NULL,
  statut_moto              TEXT NULL DEFAULT 'actif',
  carte_grise_photo_url    TEXT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT moto_proprietaire_coherence CHECK (
    (proprietaire_type = 'client'  AND client_id IS NOT NULL AND proprietaire_garage_id IS NULL) OR
    (proprietaire_type = 'garage'  AND proprietaire_garage_id IS NOT NULL AND client_id IS NULL) OR
    (proprietaire_type = 'inconnu' AND client_id IS NULL AND proprietaire_garage_id IS NULL)
  )
);

COMMENT ON COLUMN motos.last_maintenance_tier_notified IS
  'Palier d''entretien le plus sévère déjà notifié au client (NULL/warning/urgent). Mis à jour par le cron
   /cron/maintenance-alerts, à la hausse (déclenche un push) comme à la baisse (silencieux, après entretien
   effectué) — source de vérité pour la règle "une notification par franchissement de palier" (D-04).';

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
  -- Gap A (Phase 21, SCHEMA-05) — colonnes prod sans fichier de migration (voir sql/migrations/21)
  niveau_preuve   TEXT DEFAULT 'declare' CHECK (niveau_preuve IN ('facture','visuel','declare')),  -- origine indéterminée (terminal Phase 20)
  facture_id      UUID,           -- origine indéterminée (terminal Phase 20). FK prod : factures_scannees(id) ON DELETE SET NULL — table hors périmètre schema.sql (voir header), FK volontairement omise pour bootstrap propre
  operation_code  TEXT,           -- origine indéterminée (terminal Phase 20)
  photo_url       TEXT,           -- origine indéterminée (terminal Phase 20)
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
  numero          TEXT NOT NULL,
  statut          TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'envoye', 'accepte', 'refuse', 'expire', 'converti', 'annule')),
  remise_type     TEXT DEFAULT 'aucun',
  remise_pct      NUMERIC(5,2) DEFAULT 0,
  remise_note     TEXT,
  tva             NUMERIC(4,1) NOT NULL DEFAULT 20.0,
  total_ttc       NUMERIC(10,2) DEFAULT 0,
  pdf_url         TEXT,
  -- Gap A (Phase 21, SCHEMA-05) — colonnes prod sans fichier de migration (voir sql/migrations/22)
  -- Snapshot client dénormalisé
  client_nom       TEXT NOT NULL,
  client_adresse   TEXT,
  client_cp        TEXT,
  client_ville     TEXT,
  client_email     TEXT,
  client_tel       TEXT,
  client_siret     TEXT,
  client_tva       TEXT,
  client_id        UUID,
  -- Snapshot moto
  moto_label       TEXT,
  moto_vin         TEXT,
  moto_km          INTEGER,
  -- Contenu / totaux
  lignes           JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_ht         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tva        NUMERIC(12,2) NOT NULL DEFAULT 0,
  remise_montant   NUMERIC(12,2) DEFAULT 0,
  -- Dates cycle de vie
  date_creation    TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_validite    DATE,
  date_envoi       TIMESTAMPTZ,
  date_acceptation TIMESTAMPTZ,
  date_refus       TIMESTAMPTZ,
  -- Divers
  or_id            UUID,
  notes            TEXT,
  cree_par         TEXT,
  entite_facturation_id UUID NOT NULL,  -- FK prod : entites_facturation(id) — table hors périmètre schema.sql (voir header), FK volontairement omise pour bootstrap propre
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
-- TABLES GAP B — objets migrations 13/15 jamais portés (Phase 21, SCHEMA-06)
-- ══════════════════════════════════════════════════════════

-- billing_events — source : sql/migrations/15_billing_foundation.sql
CREATE TABLE billing_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  TEXT        NOT NULL UNIQUE,
  event_type       TEXT        NOT NULL,
  garage_id        UUID        REFERENCES garages(id) ON DELETE SET NULL,
  payload          JSONB,
  processed_at     TIMESTAMPTZ DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now() -- origine indéterminée, découverte lors de la vérification bootstrap Phase 22 (SCHEMA-07) : absente de sql/migrations/15_billing_foundation.sql et de tout git log ; présente en prod (probablement ajoutée hors migration versionnée)
);
CREATE INDEX idx_billing_events_garage ON billing_events(garage_id);
COMMENT ON TABLE  billing_events IS 'Audit trail des evenements Stripe recus. stripe_event_id UNIQUE = guard idempotency (rejeu webhook securise).';
COMMENT ON COLUMN billing_events.payload IS 'Corps complet de l''evenement Stripe — permet de rejouer ou auditer sans appeler l''API Stripe.';

-- motos_proprietaires_historique — source : sql/migrations/13_liaison_client_moto.sql (backfill INSERT exclu)
CREATE TABLE motos_proprietaires_historique (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moto_id UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  proprietaire_type proprietaire_type_enum NOT NULL,
  proprietaire_client_id UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
  proprietaire_garage_id UUID NULL REFERENCES garages(id) ON DELETE SET NULL,
  proprio_libre TEXT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NULL,
  mode_acquisition mode_acquisition_enum NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NULL,
  CONSTRAINT historique_coherence CHECK (
    (proprietaire_type = 'client'  AND proprietaire_client_id IS NOT NULL) OR
    (proprietaire_type = 'garage'  AND proprietaire_garage_id IS NOT NULL) OR
    (proprietaire_type = 'inconnu')
  )
);
CREATE INDEX idx_mph_moto ON motos_proprietaires_historique(moto_id);
CREATE INDEX idx_mph_client ON motos_proprietaires_historique(proprietaire_client_id) WHERE proprietaire_client_id IS NOT NULL;
CREATE INDEX idx_mph_garage ON motos_proprietaires_historique(proprietaire_garage_id) WHERE proprietaire_garage_id IS NOT NULL;
CREATE INDEX idx_mph_actif ON motos_proprietaires_historique(moto_id) WHERE date_fin IS NULL;

-- liaisons_client_garage — source : sql/migrations/13_liaison_client_moto.sql (backfill INSERT exclu)
CREATE TABLE liaisons_client_garage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  garage_id UUID NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'actif',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_revocation TIMESTAMPTZ NULL,
  motif_revocation TEXT NULL,
  cree_par TEXT NOT NULL DEFAULT 'garage',
  UNIQUE(client_id, garage_id)
);
CREATE INDEX idx_lcg_client_actif ON liaisons_client_garage(client_id) WHERE statut = 'actif';
CREATE INDEX idx_lcg_garage_actif ON liaisons_client_garage(garage_id) WHERE statut = 'actif';

-- reclamations_moto — source : sql/migrations/13_liaison_client_moto.sql
CREATE TABLE reclamations_moto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moto_id UUID NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'en_attente',
  vin_fourni TEXT NOT NULL,
  plaque_fournie TEXT NOT NULL,
  carte_grise_photo_url TEXT NOT NULL,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_resolution TIMESTAMPTZ NULL,
  resolu_par UUID NULL,
  motif_refus TEXT NULL
);
CREATE INDEX idx_rec_moto ON reclamations_moto(moto_id);
CREATE INDEX idx_rec_client ON reclamations_moto(client_id);
CREATE INDEX idx_rec_attente ON reclamations_moto(statut) WHERE statut = 'en_attente';

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
  dernier_rappel_envoye_at TIMESTAMPTZ,
  dernier_rappel_km        INTEGER,
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
  km_a_la_photo     INTEGER,
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

-- v_motos_avec_proprietaire — source : sql/migrations/13_liaison_client_moto.sql
CREATE OR REPLACE VIEW v_motos_avec_proprietaire AS
SELECT m.*,
  CASE
    WHEN m.proprietaire_type = 'client'  THEN c.nom
    WHEN m.proprietaire_type = 'garage'  THEN g.nom || ' (stock)'
    WHEN m.proprietaire_type = 'inconnu' THEN COALESCE(m.proprio_libre, 'Proprietaire inconnu')
  END AS proprietaire_nom_resolu,
  CASE
    WHEN m.proprietaire_type = 'client' THEN c.email
    ELSE NULL
  END AS proprietaire_email_resolu
FROM motos m
LEFT JOIN clients c ON c.id = m.client_id
LEFT JOIN garages g ON g.id = m.proprietaire_garage_id;

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
-- Phase 23 (v1.6) — Triggers km (monotone + sync)
-- ══════════════════════════════════════════════════════════
-- D-05 / KM-04 : le km d'intervention est un historique découplé — il ne doit plus
-- toucher motos.km. On retire l'ancien clamp GREATEST (second writer non coordonné,
-- incompatible avec "releves_km = source de vérité unique"). Désormais motos.km
-- n'est écrit QUE par trg_sync_moto_km ci-dessous.

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
CREATE UNIQUE INDEX idx_clients_siret ON clients(siret) WHERE siret IS NOT NULL;

COMMENT ON COLUMN clients.client_type IS 'Type légal du client : particulier (TVA incluse) ou pro (TVA intracom/SIRET requis). Distinction comptable obligatoire France.';
COMMENT ON COLUMN clients.siret IS 'SIRET 14 chiffres, requis si client_type = ''pro''';
COMMENT ON COLUMN clients.tva_intracom IS 'N° TVA intracommunautaire, optionnel si client UE';
COMMENT ON COLUMN clients.raison_sociale IS 'Dénomination sociale officielle, requise si client_type = ''pro''';
COMMENT ON COLUMN clients.adresse_facturation IS 'Adresse de facturation (peut différer de l''adresse de contact)';

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
ALTER TABLE garage_users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_device_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_send_log            ENABLE ROW LEVEL SECURITY;
-- garage_users / client_device_tokens / push_send_log : RLS enabled with NO explicit
-- policies (confirmed via pg_policies/pg_class.relrowsecurity, plan 19-01) — default-deny
-- for anon/authenticated; only service_role (used by supabase.js) can read/write these tables.

ALTER TABLE billing_events                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE motos_proprietaires_historique ENABLE ROW LEVEL SECURITY;
ALTER TABLE liaisons_client_garage         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reclamations_moto              ENABLE ROW LEVEL SECURITY;
-- Gap B (Phase 21) : RLS enabled with NO explicit policies (default-deny for anon/authenticated;
-- only service_role, utilisé par supabase.js, peut lire/écrire) — même état confirmé qu'en Phase 19
-- pour garage_users/client_device_tokens/push_send_log. Confirmé live (sonde REST anon-equivalent,
-- publishable key, Phase 21 plan 03) : calibration garages -> HTTP 200 [] ; les 4 tables Gap B,
-- y compris les 2 backfillées (liaisons_client_garage, motos_proprietaires_historique qui contiennent
-- des lignes en prod) -> HTTP 200 [] également = signal default-deny, pas "table vide".

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
