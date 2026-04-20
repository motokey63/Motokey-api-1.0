BEGIN;

-- Réassigner les motos du client orphelin vers le client avec auth_user_id
UPDATE motos
SET client_id = '8e258a77-f443-4ca3-bb05-cd6198ce719d'
WHERE client_id = '25ec3c7e-5470-4a11-be6c-bb1ea477a45e';

-- Transférer le garage_id du client orphelin vers le bon client
UPDATE clients
SET garage_id = (SELECT garage_id FROM clients WHERE id = '25ec3c7e-5470-4a11-be6c-bb1ea477a45e')
WHERE id = '8e258a77-f443-4ca3-bb05-cd6198ce719d';

-- Supprimer le client doublon sans auth_user_id
DELETE FROM clients
WHERE id = '25ec3c7e-5470-4a11-be6c-bb1ea477a45e';

COMMIT;
