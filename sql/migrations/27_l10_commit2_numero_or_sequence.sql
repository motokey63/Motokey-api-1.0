-- ═══════════════════════════════════════════════════════════
-- Migration 27 — L10 Commit 2 — Numérotation atomique OR + attente_auto
-- ═══════════════════════════════════════════════════════════
-- Phase 31 (v1.8). Chantier L10, commit 2 (backend). Deux besoins
-- indépendants regroupés dans un seul fichier (pas de dépendance croisée
-- entre les sections, comme 26/26b, mais pas de raison de les séparer ici :
-- ni l'un ni l'autre n'est un ALTER TYPE ... ADD VALUE nécessitant une
-- requête isolée) :
--
--   Section 1 — Bloc A : numérotation `numero` (INT-YYYY-NNNN), atomique,
--   comptée par garage et remise à zéro chaque année. La colonne `numero`
--   existe déjà (nullable, migration 26) — ce script ne la touche pas,
--   il ajoute la table compteur + la fonction d'attribution.
--
--   Section 2 — Bloc B : colonne `attente_auto` sur `ordres_reparation`,
--   qui distingue une transition → 'attente' déclenchée automatiquement
--   par l'ajout d'une ligne complémentaire (tâche/pièce) sur un OR
--   'en_cours', d'une transition → 'attente' posée manuellement par un
--   humain via PATCH /statut (ex: attente pièce). Sert de garde pour
--   l'auto-retour 'attente' → 'en_cours' quand toutes les lignes en
--   attente d'acceptation client sont acceptées : ne se déclenche QUE si
--   attente_auto = TRUE, jamais sur une attente manuelle.
--
-- ⚠️ ORDRE DE DÉPLOIEMENT OBLIGATOIRE (vs le code applicatif) :
-- `supabase.js` (OrdresReparation.create) appellera `attribuer_numero_or()`
-- et `OrTaches.create`/`OrPieces.create` liront/écriront `attente_auto` dès
-- le commit backend suivant. NE PAS APPLIQUER CE SCRIPT avant que ce
-- commit ne soit prêt à être déployé dans la foulée (même précaution que
-- 13/L8 et 26 : script SQL appliqué juste avant le push du code qui en
-- dépend) — dans ce sens précis, l'ordre inverse (script après le code)
-- casserait la création d'OR (RPC inconnue) et l'ajout de lignes
-- (colonne inconnue).
-- ═══════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────
-- SECTION 1 — Bloc A : compteur + fonction de numérotation OR
-- ───────────────────────────────────────────────────────────
-- Table compteur (garage_id, annee) -> dernier_numero attribué. Une ligne
-- par garage et par année, créée à la volée par la fonction ci-dessous.
-- PRIMARY KEY (garage_id, annee) : c'est elle qui rend l'UPSERT atomique
-- (le conflit sur cette contrainte déclenche le verrou de ligne implicite
-- utilisé par ON CONFLICT DO UPDATE).

CREATE TABLE IF NOT EXISTS or_numero_compteurs (
  garage_id      UUID    NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
  annee          INTEGER NOT NULL,
  dernier_numero INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (garage_id, annee)
);

-- Attribution atomique : INSERT ... ON CONFLICT DO UPDATE ... RETURNING.
-- Deux appels concurrents pour le même (garage_id, annee) se sérialisent
-- sur le verrou de ligne pris par le conflit — pas de doublon possible,
-- pas besoin de SELECT ... FOR UPDATE explicite (garantie équivalente).
-- Remise à zéro automatique chaque année : la première attribution de
-- l'année crée une nouvelle ligne (annee différent), qui repart de 1.
CREATE OR REPLACE FUNCTION attribuer_numero_or(p_garage_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_annee  INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_numero INTEGER;
BEGIN
  INSERT INTO or_numero_compteurs (garage_id, annee, dernier_numero)
  VALUES (p_garage_id, v_annee, 1)
  ON CONFLICT (garage_id, annee)
  DO UPDATE SET dernier_numero = or_numero_compteurs.dernier_numero + 1
  RETURNING dernier_numero INTO v_numero;

  RETURN 'INT-' || v_annee || '-' || LPAD(v_numero::TEXT, 4, '0');
END;
$$;


-- ───────────────────────────────────────────────────────────
-- SECTION 2 — Bloc B : attente_auto (origine de la transition → attente)
-- ───────────────────────────────────────────────────────────
-- FALSE par défaut : toute transition → 'attente' existante (via PATCH
-- /statut, motif manuel type "attente pièce") reste attente_auto=FALSE
-- sans aucune migration de données — le défaut couvre déjà tous les OR
-- actuels et futurs tant que le code applicatif ne pose pas TRUE
-- explicitement (uniquement dans le chemin "ligne ajoutée sur OR
-- en_cours", commit backend suivant).

ALTER TABLE ordres_reparation
  ADD COLUMN IF NOT EXISTS attente_auto BOOLEAN NOT NULL DEFAULT FALSE;
