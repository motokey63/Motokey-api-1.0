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

/**
 * Résout le garage_id depuis un contexte RBAC Supabase JWT.
 * Pour les users PRO/CONCESSION/ADMIN qui ont un garage associé.
 * @param {object|null} ctx     — req.ctx produit par extractRoleFromRequest
 * @param {object}      SBLayer — module supabase.js
 * @returns {Promise<string|null>} UUID du garage ou null
 */
async function getGarageIdForUser(ctx, SBLayer) {
  if (!ctx || !ctx.user_id || !SBLayer) return null;
  try {
    const { data, error } = await SBLayer.supabase
      .from('garages')
      .select('id')
      .eq('auth_user_id', ctx.user_id)
      .single();
    return (error || !data) ? null : data.id;
  } catch (e) {
    return null;
  }
}

/**
 * Rôle inféré pour les comptes garage legacy (vieux JWT HS256).
 * Dans ces tokens, a.id = PK de la table garages (pas le Supabase user_id).
 * Si un garage existe avec cet id → role CONCESSION par défaut (ceinture+bretelles
 * pour les comptes legacy hypothétiques dont on ne connaît pas encore le rôle).
 *
 * @param {string} garageId — PK de la table garages (= a.id du vieux JWT)
 * @param {object} SBLayer
 * @returns {Promise<{role,level,...}|null>}
 */
async function inferLegacyRole(garageId, SBLayer) {
  if (!garageId || !SBLayer) return null;
  try {
    const { data, error } = await SBLayer.supabase
      .from('garages')
      .select('id')
      .eq('id', garageId)
      .single();
    if (error || !data) return null;
    return {
      user_id:     null,
      email:       null,
      role:        'CONCESSION',
      level:       ROLE_HIERARCHY['CONCESSION'],
      client_type: null
    };
  } catch (e) {
    return null;
  }
}

/**
 * Retire les champs financiers des objets renvoyés aux MECANOs.
 * Applique récursivement sur tableau ou objet unique.
 * Sans effet pour tout rôle autre que MECANO.
 *
 * Champs retirés : montant_ht, montant_ttc, taux_horaire, prix,
 *                  total, total_ht, total_ttc, remise, remise_pct,
 *                  remise_note, remise_type
 */
function stripFinancialFields(obj, ctx) {
  if (!ctx || ctx.role !== 'MECANO') return obj;
  const FIELDS = [
    'montant_ht', 'montant_ttc', 'taux_horaire', 'prix',
    'total', 'total_ht', 'total_ttc',
    'remise', 'remise_pct', 'remise_note', 'remise_type'
  ];
  function strip(o) {
    if (!o || typeof o !== 'object') return o;
    const r = Object.assign({}, o);
    FIELDS.forEach(function(f) { delete r[f]; });
    return r;
  }
  return Array.isArray(obj) ? obj.map(strip) : strip(obj);
}

module.exports = {
  ROLE_HIERARCHY,
  VALID_ROLES,
  extractRoleFromRequest,
  requireRole,
  requireAnyRole,
  getGarageIdForUser,
  inferLegacyRole,
  stripFinancialFields
};
