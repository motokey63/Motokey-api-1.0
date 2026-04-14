'use strict';

/**
 * auth/rbac.js — Livraison 4
 *
 * Extraction de rôle depuis un JWT Supabase Auth + helpers de contrôle d'accès.
 * Le rôle vit dans auth.users.app_metadata.role (géré par Supabase, non falsifiable
 * par le client car app_metadata est en lecture seule côté client).
 *
 * Hiérarchie : CLIENT < MECANO < PRO < CONCESSION < ADMIN
 * Usage dans un handler :
 *   if (!requireRole(req.ctx, 'PRO')) return fail(res, 'Permission refusée', 403, 'FORBIDDEN_ROLE');
 */

// Niveau numérique par rôle (plus grand = plus de droits)
const ROLE_HIERARCHY = {
  CLIENT:     1,
  MECANO:     2,
  PRO:        3,
  CONCESSION: 4,
  ADMIN:      5
};

const VALID_ROLES = Object.keys(ROLE_HIERARCHY);

/**
 * Extrait le contexte utilisateur depuis le Bearer token de la requête.
 * Retourne null si : pas de token, token invalide, rôle manquant ou inconnu.
 *
 * @param {import('http').IncomingMessage} req
 * @param {object} SBLayer  — l'objet Supabase exporté par supabase.js
 * @returns {Promise<{user_id, email, role, level, client_type}|null>}
 */
async function extractRoleFromRequest(req, SBLayer) {
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!auth || !SBLayer) return null;

  try {
    const { data: { user }, error } = await SBLayer.supabase.auth.getUser(auth);
    if (error || !user) return null;

    const role = user.app_metadata && user.app_metadata.role;
    if (!role || !VALID_ROLES.includes(role)) return null;

    return {
      user_id:     user.id,
      email:       user.email,
      role,
      level:       ROLE_HIERARCHY[role],
      client_type: (user.app_metadata && user.app_metadata.client_type) || null
    };
  } catch (e) {
    return null;
  }
}

/**
 * Vérifie que req.ctx a un rôle >= minRole.
 * Retourne false si ctx est null (non authentifié) ou si le niveau est insuffisant.
 *
 * @param {object|null} ctx     — req.ctx tel que renseigné par extractRoleFromRequest
 * @param {string}      minRole — rôle minimum requis (ex: 'PRO')
 * @returns {boolean}
 */
function requireRole(ctx, minRole) {
  if (!ctx || !ctx.role) return false;
  if (!VALID_ROLES.includes(minRole)) return false;
  return ctx.level >= ROLE_HIERARCHY[minRole];
}

/**
 * Vérifie que req.ctx a un rôle appartenant à la liste fournie.
 * Utile pour les cas "exactement PRO ou MECANO" sans notion de hiérarchie.
 *
 * @param {object|null} ctx          — req.ctx
 * @param {string[]}    allowedRoles — liste des rôles acceptés
 * @returns {boolean}
 */
function requireAnyRole(ctx, allowedRoles) {
  if (!ctx || !ctx.role) return false;
  return allowedRoles.includes(ctx.role);
}

module.exports = {
  ROLE_HIERARCHY,
  VALID_ROLES,
  extractRoleFromRequest,
  requireRole,
  requireAnyRole
};
