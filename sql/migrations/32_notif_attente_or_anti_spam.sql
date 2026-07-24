-- ═══════════════════════════════════════════════════════════
-- Migration 32 — Anti-spam notification client OR en attente
-- ═══════════════════════════════════════════════════════════
-- Ajoute 2 colonnes a ordres_reparation :
--
-- derniere_notif_attente_envoyee_at (NULLABLE) — anti-spam : un seul email
-- client par OR tant que le client n'a pas repondu (accepte une ligne).
-- Meme principe que dernier_palier_calendaire_envoye_at (migration 31),
-- mais sur ordres_reparation plutot que consommables. NULL = pas encore
-- notifie ou reinitialise (le compteur se rearme a chaque acceptation de
-- ligne, cf. OrTaches.accepterLigne / OrPieces.accepterLigne).
--
-- notif_attente_echec_motif (NULLABLE) — raison pour laquelle le client
-- n'a PAS pu etre notifie (moto sans client, client sans email, ou echec
-- d'envoi Resend) : 'moto_sans_client' | 'client_sans_email' | 'echec_envoi'.
-- Lu par l'ecran atelier (MotoKey_Atelier.html) pour avertir le mecano
-- que le client ne recevra rien tant que la cause n'est pas corrigee.
-- Remis a NULL des qu'un envoi reussit ou qu'une ligne est acceptee.
--
-- Doctrine fail-open (voir docs/superpowers/specs/2026-07-24-notif-client-or-attente-design.md,
-- decision 10) : un echec d'envoi ne bloque JAMAIS la bascule
-- en_attente_acceptation_client de la ligne elle-meme — seul le canal de
-- notification echoue, pas l'obligation d'accord client.
--
-- Aucune valeur par defaut : les 2 colonnes restent NULL sur les lignes
-- existantes, aucune reecriture de ordres_reparation. Colonnes non lues
-- par le code applicatif a ce stade (branchees en Task 3 du plan
-- d'implementation) — appliquer cette migration seule est sans effet sur
-- le comportement actuel.
--
-- À appliquer manuellement via Supabase Dashboard > SQL Editor.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE ordres_reparation
  ADD COLUMN IF NOT EXISTS derniere_notif_attente_envoyee_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notif_attente_echec_motif         TEXT;

COMMENT ON COLUMN ordres_reparation.derniere_notif_attente_envoyee_at IS
  'Anti-spam : horodatage du dernier email client envoye pour cet OR (NULL = pas encore notifie ou rearme apres acceptation de ligne). Un seul email par OR tant que non reinitialise.';
COMMENT ON COLUMN ordres_reparation.notif_attente_echec_motif IS
  'Raison de non-notification client : moto_sans_client | client_sans_email | echec_envoi. NULL = dernier envoi reussi ou sans objet. Affiche cote atelier.';
