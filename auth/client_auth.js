/* ══════════════════════════════════════════════════════
   MOTOKEY — LIVRAISON 7a
   Socle authentification client
   Adapté : Node.js pur (sans Express) + bcryptjs

   Variables Railway requises :
   - JWT_CLIENT_SECRET       (secret fort, min 64 caractères aléatoires)
   - JWT_CLIENT_ACCESS_TTL   (optionnel, défaut "15m")
   - JWT_CLIENT_REFRESH_TTL  (optionnel, défaut "30d")
   - FRONTEND_CLIENT_URL     (URL du MotoKey_Client.html pour les liens email)

   Exporte :
   - requireClient(req, res)           async → true si OK, false si refus envoyé
   - rateLimitAuth(req, res, pathname) sync  → true si OK, false si 429 envoyé
   - hashPassword, verifyPassword
   - validatePasswordStrength
   - generateTokens, verifyAccessToken, rotateRefreshToken, revokeSession
   - generateSecureToken, hashToken
   - logAuthEvent            fonction d'audit
   - CONFIG_DATA             objet config publique (pour la route /auth/client/config)
   ══════════════════════════════════════════════════════ */

'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

// ── Supabase client (tables users_client_sessions, auth_logs, etc.) ──
let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (SB_URL && SB_KEY) {
    supabase = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
    console.log('✅ [7a] Supabase client auth initialisé');
  } else {
    console.warn('⚠️  [7a] SUPABASE_URL/SERVICE_KEY manquant — sessions et audit désactivés');
  }
} catch (e) {
  console.warn('⚠️  [7a] @supabase/supabase-js indisponible:', e.message);
}

// Config
const JWT_SECRET = process.env.JWT_CLIENT_SECRET;
const ACCESS_TTL = process.env.JWT_CLIENT_ACCESS_TTL || '15m';
const REFRESH_TTL_DAYS = 30;
const BCRYPT_COST = 12;

if (!JWT_SECRET) {
  console.error('⚠️  JWT_CLIENT_SECRET manquant dans les variables Railway — auth client désactivée');
}

// Liste des 100 mots de passe les plus courants
// Source : Have I Been Pwned / CNIL
const COMMON_PASSWORDS = new Set([
  '123456','123456789','12345678','password','qwerty','motdepasse','azerty',
  'azertyuiop','111111','1234567','1234567890','000000','iloveyou','admin',
  'welcome','monkey','1234','qwerty123','password1','soleil','doudou',
  'chouchou','bonjour','france','marseille','loulou','chocolat','nicolas',
  'jetaime','camille','julien','amour','bisous','maman','papa','liberte',
  'coucou','secret','toto','666666','abcdef','qwertz','password123','motdepasse1',
  'a1b2c3d4','123qwe','passw0rd','trustno1','letmein','master','dragon','sunshine',
  'football','princess','baseball','shadow','michael','computer','jennifer',
  'superman','harley','12341234','qazwsx','michelle','daniel','starwars',
  'klaster','112233','jordan','george','hannah','charlie','andrew','matrix',
  'maggie','yellow','hunter','corvette','ashley','sandra','vanessa','diamond',
  'biteme','ginger','zaq12wsx','freedom','tigger','forever','angel','legend'
]);

// Config publique exportée (utilisée par la route GET /auth/client/config)
const CONFIG_DATA = {
  password_rules: {
    min_length:        12,
    max_length:        128,
    require_lowercase: true,
    require_uppercase: true,
    require_digit:     true,
    require_special:   true,
    reject_common:     true
  },
  cgu_version:  'v1.0',
  rgpd_contact: 'motolab63@gmail.com',
  editeur: {
    nom:     'MOTOLAB',
    forme:   'SAS',
    siret:   '94124974000015',
    adresse: '142 Avenue du Brézet, 63000 Clermont-Ferrand'
  },
  hebergement: {
    base_de_donnees: 'Supabase (Union Européenne)',
    api:             'Railway (Union Européenne)',
    emails:          'Resend (Union Européenne)'
  }
};


/* ──────────────────────────────────────────────────────
   HELPER INTERNE : réponse JSON d'erreur (Node.js pur)
   ────────────────────────────────────────────────────── */
function _sendErr(res, status, code, message) {
  const body = JSON.stringify({
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString()
  });
  res.writeHead(status, {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end(body);
}


/* ══════════════════════════════════════════════════════
   VALIDATION DU MOT DE PASSE (règles CNIL/ANSSI)
   ══════════════════════════════════════════════════════ */
function validatePasswordStrength(password) {
  const errors = [];
  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Mot de passe requis'], score: 0 };
  }
  if (password.length < 12)  errors.push('Minimum 12 caractères');
  if (password.length > 128) errors.push('Maximum 128 caractères');
  if (!/[a-z]/.test(password))        errors.push('Au moins une minuscule');
  if (!/[A-Z]/.test(password))        errors.push('Au moins une majuscule');
  if (!/[0-9]/.test(password))        errors.push('Au moins un chiffre');
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push('Au moins un caractère spécial');
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Ce mot de passe est trop courant, choisissez-en un autre');
  }

  // Score de force (0 à 100)
  let score = 0;
  if (password.length >= 12) score += 20;
  if (password.length >= 16) score += 10;
  if (password.length >= 20) score += 10;
  if (/[a-z]/.test(password))        score += 10;
  if (/[A-Z]/.test(password))        score += 10;
  if (/[0-9]/.test(password))        score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  // Bonus variété
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= 8)  score += 10;
  if (uniqueChars >= 12) score += 5;
  score = Math.min(100, score);

  return {
    valid: errors.length === 0,
    errors,
    score,
    force: score >= 85 ? 'tres_fort' : score >= 70 ? 'fort' : score >= 50 ? 'moyen' : 'faible'
  };
}


/* ══════════════════════════════════════════════════════
   HASH & VÉRIFICATION
   ══════════════════════════════════════════════════════ */
async function hashPassword(plain) {
  return await bcrypt.hash(plain, BCRYPT_COST);
}

async function verifyPassword(plain, hash) {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

// Génère un token sécurisé (256 bits) pour email verification, reset password, etc.
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex'); // 64 caractères hex
}

// Hash un token pour stockage DB (évite le stockage en clair)
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}


/* ══════════════════════════════════════════════════════
   JWT — ACCESS + REFRESH TOKEN
   ══════════════════════════════════════════════════════ */
function signAccessToken(user) {
  return jwt.sign(
    {
      sub:   user.id,
      email: user.email,
      type:  'access',
      ver:   user.password_changed_at ? new Date(user.password_changed_at).getTime() : 0
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL, algorithm: 'HS256', issuer: 'motokey' }
  );
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'motokey' });
  } catch {
    return null;
  }
}

// Génère une paire access + refresh, enregistre le refresh en DB
async function generateTokens(user, meta = {}) {
  const accessToken  = signAccessToken(user);
  const refreshToken = generateSecureToken();
  const refreshHash  = hashToken(refreshToken);
  const familleId    = meta.famille_id || crypto.randomUUID();
  const expireA      = new Date(Date.now() + REFRESH_TTL_DAYS * 86400000);

  if (supabase) {
    await supabase.from('users_client_sessions').insert({
      user_id:            user.id,
      refresh_token_hash: refreshHash,
      famille_id:         familleId,
      user_agent:         meta.user_agent || null,
      ip:                 meta.ip || null,
      expire_a:           expireA.toISOString()
    });
  }

  return {
    access_token:       accessToken,
    refresh_token:      refreshToken,
    access_expires_in:  15 * 60,
    refresh_expires_in: REFRESH_TTL_DAYS * 86400,
    token_type:         'Bearer'
  };
}

// Rotation refresh token : révoque l'ancien, crée un nouveau dans la même famille
// Si refresh révoqué réutilisé → vol potentiel, on nuke toute la famille
async function rotateRefreshToken(oldRefreshToken, meta = {}) {
  if (!supabase) return { ok: false, reason: 'supabase_unavailable' };

  const oldHash = hashToken(oldRefreshToken);
  const { data: session } = await supabase
    .from('users_client_sessions')
    .select('*')
    .eq('refresh_token_hash', oldHash)
    .single();

  if (!session) {
    return { ok: false, reason: 'session_inconnue' };
  }

  // Détection de réutilisation (vol de refresh token)
  if (session.revoque) {
    // On révoque TOUTE la famille pour forcer une reconnexion totale
    await supabase
      .from('users_client_sessions')
      .update({ revoque: true, revoque_a: new Date().toISOString(), revoque_raison: 'security' })
      .eq('famille_id', session.famille_id);
    await logAuthEvent({
      user_id:    session.user_id,
      type_event: 'refresh_reuse_detected',
      success:    false,
      message:    'Réutilisation détectée, famille entière révoquée',
      ip:         meta.ip,
      user_agent: meta.user_agent
    });
    return { ok: false, reason: 'reuse_detected' };
  }

  // Expiré ?
  if (new Date(session.expire_a) < new Date()) {
    return { ok: false, reason: 'expire' };
  }

  // Récupérer l'utilisateur
  const { data: user } = await supabase
    .from('users_client')
    .select('*')
    .eq('id', session.user_id)
    .single();
  if (!user || !user.compte_actif) return { ok: false, reason: 'user_inactif' };

  // Révoquer l'ancien
  await supabase
    .from('users_client_sessions')
    .update({ revoque: true, revoque_a: new Date().toISOString(), revoque_raison: 'rotation' })
    .eq('id', session.id);

  // Créer le nouveau dans la même famille
  const tokens = await generateTokens(user, {
    ...meta,
    famille_id: session.famille_id
  });

  return { ok: true, tokens, user };
}

// Révocation d'une session (logout)
async function revokeSession(refreshToken, raison = 'logout') {
  if (!supabase) return;
  const hash = hashToken(refreshToken);
  await supabase
    .from('users_client_sessions')
    .update({ revoque: true, revoque_a: new Date().toISOString(), revoque_raison: raison })
    .eq('refresh_token_hash', hash);
}

// Révocation de toutes les sessions d'un user (ex: changement mot de passe)
async function revokeAllSessionsForUser(userId, raison = 'security') {
  if (!supabase) return;
  await supabase
    .from('users_client_sessions')
    .update({ revoque: true, revoque_a: new Date().toISOString(), revoque_raison: raison })
    .eq('user_id', userId)
    .eq('revoque', false);
}


/* ══════════════════════════════════════════════════════
   AUDIT LOG
   ══════════════════════════════════════════════════════ */
async function logAuthEvent(ev) {
  if (!supabase) return;
  try {
    await supabase.from('auth_logs').insert({
      user_id:     ev.user_id || null,
      email_tente: ev.email_tente || null,
      type_event:  ev.type_event,
      success:     ev.success !== false,
      message:     ev.message || null,
      ip:          ev.ip || null,
      user_agent:  ev.user_agent || null,
      metadata:    ev.metadata || null
    });
  } catch (e) {
    console.error('logAuthEvent fail:', e.message);
  }
}

// Helper : extraire IP du request (gère les proxies Railway)
function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || null;
}


/* ══════════════════════════════════════════════════════
   MIDDLEWARE : requireClient  (Node.js pur — sans Express)
   Protège les routes /client/*
   Retourne true si OK (req.clientUser renseigné)
   Retourne false si refusé (réponse déjà envoyée)
   ══════════════════════════════════════════════════════ */
async function requireClient(req, res) {
  if (!JWT_SECRET) {
    _sendErr(res, 503, 'auth_unavailable', 'Auth client non configurée (JWT_CLIENT_SECRET manquant)');
    return false;
  }
  try {
    const authHeader = req.headers['authorization'] || '';
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      _sendErr(res, 401, 'no_token', 'Authentification requise');
      return false;
    }

    const token   = m[1];
    const payload = verifyAccessToken(token);
    if (!payload || payload.type !== 'access') {
      _sendErr(res, 401, 'invalid_token', 'Session invalide ou expirée');
      return false;
    }

    if (supabase) {
      // Charger l'utilisateur et vérifier qu'il est toujours actif
      const { data: user } = await supabase
        .from('users_client')
        .select('id, email, email_verifie, compte_actif, password_changed_at, prenom, nom')
        .eq('id', payload.sub)
        .single();

      if (!user || !user.compte_actif) {
        _sendErr(res, 401, 'user_inactive', 'Compte inactif');
        return false;
      }

      // Vérifier que le token n'a pas été émis avant le dernier changement de mdp
      const pwdChangedTs = user.password_changed_at ? new Date(user.password_changed_at).getTime() : 0;
      if (payload.ver && payload.ver < pwdChangedTs) {
        _sendErr(res, 401, 'token_obsolete', 'Veuillez vous reconnecter');
        return false;
      }

      if (!user.email_verifie) {
        _sendErr(res, 403, 'email_not_verified', 'Email non vérifié');
        return false;
      }

      req.clientUser = user;
    } else {
      // Mode dégradé sans Supabase : JWT valide suffit
      req.clientUser = { id: payload.sub, email: payload.email };
    }

    return true;
  } catch (e) {
    console.error('requireClient error:', e);
    _sendErr(res, 500, 'server_error', 'Erreur serveur auth');
    return false;
  }
}


/* ══════════════════════════════════════════════════════
   MIDDLEWARE : rateLimitAuth  (Node.js pur — sans Express)
   Anti brute force : max 5 tentatives / IP / 15 min
   Retourne true si OK, false si 429 envoyé
   ══════════════════════════════════════════════════════ */
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 min
const RATE_LIMIT_MAX = 5;

function rateLimitAuth(req, res, pathname) {
  const ip  = getIp(req) || 'unknown';
  const key = ip + ':' + pathname;
  const now = Date.now();

  let entry = rateLimitStore.get(key);
  if (!entry || now - entry.firstAt > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, firstAt: now };
  }
  entry.count++;
  rateLimitStore.set(key, entry);

  // Nettoyage périodique (une chance sur 100)
  if (Math.random() < 0.01) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (now - v.firstAt > RATE_LIMIT_WINDOW_MS) rateLimitStore.delete(k);
    }
  }

  if (entry.count > RATE_LIMIT_MAX) {
    const retrySeconds = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.firstAt)) / 1000);
    const body = JSON.stringify({
      success: false,
      error: {
        code:    'rate_limited',
        message: `Trop de tentatives. Réessayez dans ${Math.ceil(retrySeconds / 60)} minute(s).`
      },
      timestamp: new Date().toISOString()
    });
    res.writeHead(429, {
      'Content-Type':                 'application/json',
      'Retry-After':                  String(retrySeconds),
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    });
    res.end(body);
    return false;
  }

  return true;
}


module.exports = {
  // Password
  validatePasswordStrength,
  hashPassword,
  verifyPassword,

  // Tokens
  generateSecureToken,
  hashToken,
  generateTokens,
  verifyAccessToken,
  rotateRefreshToken,
  revokeSession,
  revokeAllSessionsForUser,

  // Audit
  logAuthEvent,
  getIp,

  // Middleware (Node.js pur, retournent true/false)
  requireClient,
  rateLimitAuth,

  // Config publique
  CONFIG_DATA,

  // Constants (pour tests)
  REFRESH_TTL_DAYS,
  BCRYPT_COST
};
