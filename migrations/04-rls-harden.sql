BEGIN;

-- ───────────────────────────────────────────────
-- Helper function : récupère le garage_id du user connecté
-- ───────────────────────────────────────────────
-- Si l'user connecté est un garagiste (a une ligne dans garages
-- avec auth_user_id = auth.uid()), retourne l'id de son garage.
-- Sinon NULL.
CREATE OR REPLACE FUNCTION current_user_garage_id()
RETURNS uuid AS $$
  SELECT id FROM garages WHERE auth_user_id = auth.uid() LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function : récupère le client_id du user connecté
CREATE OR REPLACE FUNCTION current_user_client_id()
RETURNS uuid AS $$
  SELECT id FROM clients WHERE auth_user_id = auth.uid() LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function : récupère le rôle depuis le JWT
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text AS $$
  SELECT auth.jwt() ->> 'role'
$$ LANGUAGE sql STABLE;

-- ───────────────────────────────────────────────
-- Table : garages
-- ───────────────────────────────────────────────
DROP POLICY IF EXISTS "permissive_all" ON garages;
DROP POLICY IF EXISTS "garages_select" ON garages;
DROP POLICY IF EXISTS "garages_insert" ON garages;
DROP POLICY IF EXISTS "garages_update" ON garages;
DROP POLICY IF EXISTS "garages_delete" ON garages;

CREATE POLICY "garages_select" ON garages FOR SELECT USING (
  current_user_role() = 'ADMIN'
  OR auth_user_id = auth.uid()
  OR id = current_user_garage_id()
  -- CLIENT voit le garage qui l'a enregistré (règle 3b)
  OR (
    current_user_role() = 'CLIENT'
    AND id IN (
      SELECT garage_id FROM clients WHERE id = current_user_client_id()
    )
  )
);

CREATE POLICY "garages_modify" ON garages FOR ALL USING (
  current_user_role() = 'ADMIN'
  OR auth_user_id = auth.uid()
);

-- ───────────────────────────────────────────────
-- Table : clients
-- ───────────────────────────────────────────────
DROP POLICY IF EXISTS "permissive_all" ON clients;
DROP POLICY IF EXISTS "clients_select" ON clients;
DROP POLICY IF EXISTS "clients_modify" ON clients;

CREATE POLICY "clients_select" ON clients FOR SELECT USING (
  current_user_role() = 'ADMIN'
  -- CLIENT : voit lui-même
  OR auth_user_id = auth.uid()
  -- Rôles garage : voient les clients de leur garage
  OR (
    current_user_role() IN ('CONCESSION', 'PRO', 'MECANO')
    AND garage_id = current_user_garage_id()
  )
);

-- INSERT/UPDATE/DELETE : seulement les rôles garage de leur garage
-- (CLIENT ne crée/modifie/supprime pas son propre profil via cette
-- policy — il passe par les endpoints auth dédiés)
CREATE POLICY "clients_modify" ON clients FOR ALL USING (
  current_user_role() = 'ADMIN'
  OR (
    current_user_role() IN ('CONCESSION', 'PRO')
    AND garage_id = current_user_garage_id()
  )
) WITH CHECK (
  current_user_role() = 'ADMIN'
  OR (
    current_user_role() IN ('CONCESSION', 'PRO')
    AND garage_id = current_user_garage_id()
  )
);

-- ───────────────────────────────────────────────
-- Table : motos
-- ───────────────────────────────────────────────
DROP POLICY IF EXISTS "permissive_all" ON motos;
DROP POLICY IF EXISTS "motos_select" ON motos;
DROP POLICY IF EXISTS "motos_modify" ON motos;

CREATE POLICY "motos_select" ON motos FOR SELECT USING (
  current_user_role() = 'ADMIN'
  -- CLIENT : ses propres motos
  OR (
    current_user_role() = 'CLIENT'
    AND client_id = current_user_client_id()
  )
  -- Rôles garage : motos de leur garage
  OR (
    current_user_role() IN ('CONCESSION', 'PRO', 'MECANO')
    AND garage_id = current_user_garage_id()
  )
);

CREATE POLICY "motos_modify" ON motos FOR ALL USING (
  current_user_role() = 'ADMIN'
  OR (
    current_user_role() IN ('CONCESSION', 'PRO')
    AND garage_id = current_user_garage_id()
  )
) WITH CHECK (
  current_user_role() = 'ADMIN'
  OR (
    current_user_role() IN ('CONCESSION', 'PRO')
    AND garage_id = current_user_garage_id()
  )
);

-- ───────────────────────────────────────────────
-- Table : interventions
-- ───────────────────────────────────────────────
DROP POLICY IF EXISTS "permissive_all" ON interventions;
DROP POLICY IF EXISTS "interventions_select" ON interventions;
DROP POLICY IF EXISTS "interventions_modify" ON interventions;

CREATE POLICY "interventions_select" ON interventions FOR SELECT USING (
  current_user_role() = 'ADMIN'
  -- CLIENT : interventions de ses propres motos
  OR (
    current_user_role() = 'CLIENT'
    AND moto_id IN (
      SELECT id FROM motos WHERE client_id = current_user_client_id()
    )
  )
  -- Rôles garage : interventions sur les motos de leur garage
  OR (
    current_user_role() IN ('CONCESSION', 'PRO', 'MECANO')
    AND moto_id IN (
      SELECT id FROM motos WHERE garage_id = current_user_garage_id()
    )
  )
);

-- INSERT/UPDATE/DELETE : MECANO+ peut créer/modifier (avec règles
-- métier sur le type d'intervention validées côté backend)
CREATE POLICY "interventions_modify" ON interventions FOR ALL USING (
  current_user_role() = 'ADMIN'
  OR (
    current_user_role() IN ('CONCESSION', 'PRO', 'MECANO')
    AND moto_id IN (
      SELECT id FROM motos WHERE garage_id = current_user_garage_id()
    )
  )
) WITH CHECK (
  current_user_role() = 'ADMIN'
  OR (
    current_user_role() IN ('CONCESSION', 'PRO', 'MECANO')
    AND moto_id IN (
      SELECT id FROM motos WHERE garage_id = current_user_garage_id()
    )
  )
);

-- ───────────────────────────────────────────────
-- TODO RBAC phase 2 : durcir aussi ces tables si elles existent
-- ───────────────────────────────────────────────
-- devis, factures, ordres_reparation, or_taches, or_pieces,
-- catalogue_pieces, plans_constructeur, factures_scannees,
-- pneus si table séparée, photos si table séparée
-- → laissées en USING(true) pour cette livraison

COMMIT;
