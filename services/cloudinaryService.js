/* ══════════════════════════════════════════════════════════
   MOTOKEY — v1.6 Phase 25 — Service Cloudinary (stockage réel photos)

   CLOUD-01 : stockage réel des photos compteur/consommables.

   ⚠️  D-02 CRITIQUE — DIVERGE du pattern EMAIL_ENABLED/PUSH_ENABLED/
   VISION_ENABLED : PAS de fallback silencieux. Si les credentials
   Cloudinary sont absents, uploadPhoto() lève une erreur typée
   (statusCode=503, code='CLOUDINARY_NOT_CONFIGURED') AVANT tout appel
   SDK. Un faux placeholder URL corromprait des données de preuve
   anti-fraude (photos consommables / compteur km) — inacceptable.

   Variables Railway :
   - CLOUDINARY_CLOUD_NAME
   - CLOUDINARY_API_KEY
   - CLOUDINARY_API_SECRET
   ══════════════════════════════════════════════════════════ */

'use strict';

const cloudinary = require('cloudinary').v2;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || null;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || null;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || null;

const CLOUDINARY_READY = !!(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

if (CLOUDINARY_READY) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  console.log('✅ [25] Config Cloudinary détectée');
} else {
  console.warn('⚠️  [25] Cloudinary non configuré (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET manquants)');
}

/**
 * Upload une photo (buffer) vers Cloudinary.
 * D-02 : jamais de fallback silencieux — sans credentials, throw 503 typé.
 * @param {Buffer} buffer
 * @param {{folder?: string}} options
 * @returns {Promise<object>} résultat Cloudinary { secure_url, public_id, ... }
 */
async function uploadPhoto(buffer, { folder = 'motokey' } = {}) {
  if (!CLOUDINARY_READY) {
    const err = new Error('Cloudinary non configuré');
    err.statusCode = 503;
    err.code = 'CLOUDINARY_NOT_CONFIGURED';
    throw err;
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) {
          const e = new Error(error.message || 'Échec upload Cloudinary');
          e.statusCode = 502;
          e.code = 'CLOUDINARY_UPLOAD_FAILED';
          return reject(e);
        }
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadPhoto, CLOUDINARY_READY };
