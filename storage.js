/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║     MOTOKEY — STORAGE & OCR (storage.js)                ║
 * ║                                                          ║
 * ║   Gère :                                                 ║
 * ║   • Upload factures PDF/images → Supabase Storage       ║
 * ║   • OCR des factures (Google Document AI)               ║
 * ║   • Génération PDF (appel Python pdf_generator.py)      ║
 * ║   • URLs signées pour accès sécurisé                    ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * DÉPENDANCES :
 *   npm install @supabase/supabase-js @google-cloud/documentai
 *   pip install reportlab Pillow  (pour la génération PDF)
 *
 * BUCKETS SUPABASE À CRÉER :
 *   Dans Supabase > Storage, créer 3 buckets :
 *   - factures      (privé)
 *   - photos-motos  (public)
 *   - certificats   (privé)
 */

'use strict';

const { execFile }  = require('child_process');
const { promisify } = require('util');
const path          = require('path');
const fs            = require('fs');
const os            = require('os');
const crypto        = require('crypto');

const execFileAsync = promisify(execFile);

/* ══════════════════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════════════════ */
const CONFIG = {
  supabase: {
    url:         process.env.SUPABASE_URL,
    serviceKey:  process.env.SUPABASE_SERVICE_KEY,
    buckets: {
      factures:    'factures',
      photos:      'photos-motos',
      certificats: 'certificats',
    }
  },
  google: {
    projectId:   process.env.GOOGLE_PROJECT_ID,
    location:    process.env.GOOGLE_LOCATION    || 'eu',
    processorId: process.env.GOOGLE_PROCESSOR_ID,
  },
  pdf: {
    // Chemin vers le générateur Python
    generatorScript: path.join(__dirname, 'pdf_generator.py'),
    python:          process.env.PYTHON_BIN || 'python3',
  },
  upload: {
    maxSizeMo:      10,
    typesAcceptes:  ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    urlExpirySec:   3600, // 1h pour les URLs signées
  }
};

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
function buildSupabaseClient() {
  if (!CONFIG.supabase.url || !CONFIG.supabase.serviceKey) {
    throw new Error('SUPABASE_URL et SUPABASE_SERVICE_KEY requis dans .env');
  }
  // Import dynamique (évite l'erreur si pas encore installé)
  const { createClient } = require('@supabase/supabase-js');
  return createClient(CONFIG.supabase.url, CONFIG.supabase.serviceKey, {
    auth: { persistSession: false }
  });
}

function buildStoragePath(bucket, garage_id, filename) {
  // Structure : garage_id/YYYY/MM/filename
  const now = new Date();
  const yr  = now.getFullYear();
  const mo  = String(now.getMonth() + 1).padStart(2, '0');
  return `${garage_id}/${yr}/${mo}/${filename}`;
}

function mimeToExt(mime) {
  return {
    'application/pdf': 'pdf',
    'image/jpeg':      'jpg',
    'image/png':       'png',
    'image/webp':      'webp',
  }[mime] || 'bin';
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/* ══════════════════════════════════════════════════════════
   STORAGE — Supabase
══════════════════════════════════════════════════════════ */
const StorageService = {

  /**
   * Upload une facture (PDF ou image) vers Supabase Storage
   * Retourne l'URL publique ou signée
   */
  async uploadFacture(garage_id, intervention_id, fileBuffer, mimeType) {
    const sb  = buildSupabaseClient();
    const ext = mimeToExt(mimeType);
    const filename = `facture_${intervention_id}.${ext}`;
    const storagePath = buildStoragePath(CONFIG.supabase.buckets.factures, garage_id, filename);

    // Calcul du hash pour vérification d'intégrité
    const fileHash = sha256(fileBuffer);

    // Upload
    const { data, error } = await sb.storage
      .from(CONFIG.supabase.buckets.factures)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
        duplex: 'half',
      });

    if (error) throw new Error(`Upload Supabase: ${error.message}`);

    // URL signée (expire dans 1h, renouvelable)
    const { data: signed, error: signErr } = await sb.storage
      .from(CONFIG.supabase.buckets.factures)
      .createSignedUrl(storagePath, CONFIG.upload.urlExpirySec);

    if (signErr) throw new Error(`SignedUrl: ${signErr.message}`);

    return {
      storage_path: storagePath,
      signed_url:   signed.signedUrl,
      file_hash:    fileHash,
      mime_type:    mimeType,
      size_bytes:   fileBuffer.length,
      bucket:       CONFIG.supabase.buckets.factures,
    };
  },

  /**
   * Upload une photo de moto (bucket public)
   */
  async uploadPhotoMoto(garage_id, moto_id, fileBuffer, mimeType = 'image/jpeg') {
    const sb  = buildSupabaseClient();
    const ext = mimeToExt(mimeType);
    const storagePath = `${garage_id}/${moto_id}.${ext}`;

    const { error } = await sb.storage
      .from(CONFIG.supabase.buckets.photos)
      .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

    if (error) throw new Error(`Upload photo: ${error.message}`);

    const { data: url } = sb.storage
      .from(CONFIG.supabase.buckets.photos)
      .getPublicUrl(storagePath);

    return { public_url: url.publicUrl, storage_path: storagePath };
  },

  /**
   * Upload un certificat de transfert PDF
   */
  async uploadCertificat(garage_id, transfert_id, pdfBuffer) {
    const sb = buildSupabaseClient();
    const storagePath = buildStoragePath(CONFIG.supabase.buckets.certificats, garage_id, `cert_${transfert_id}.pdf`);

    const { error } = await sb.storage
      .from(CONFIG.supabase.buckets.certificats)
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

    if (error) throw new Error(`Upload certificat: ${error.message}`);

    const { data: signed } = await sb.storage
      .from(CONFIG.supabase.buckets.certificats)
      .createSignedUrl(storagePath, 86400 * 365); // 1 an

    return { storage_path: storagePath, signed_url: signed?.signedUrl };
  },

  /**
   * Générer une URL signée fraîche (appelé quand l'ancienne expire)
   */
  async refreshSignedUrl(bucket, storagePath, expirySec = 3600) {
    const sb = buildSupabaseClient();
    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUrl(storagePath, expirySec);
    if (error) throw new Error(`RefreshUrl: ${error.message}`);
    return data.signedUrl;
  },

  /**
   * Supprimer un fichier
   */
  async deleteFile(bucket, storagePath) {
    const sb = buildSupabaseClient();
    const { error } = await sb.storage.from(bucket).remove([storagePath]);
    if (error) throw new Error(`Delete: ${error.message}`);
    return true;
  },

  /**
   * Lister les fichiers d'un garage
   */
  async listFiles(bucket, garage_id, prefix = '') {
    const sb = buildSupabaseClient();
    const { data, error } = await sb.storage
      .from(bucket)
      .list(`${garage_id}/${prefix}`);
    if (error) throw new Error(`List: ${error.message}`);
    return data;
  },

  /**
   * Validation d'un fichier uploadé par le client
   */
  validerFichier(fileBuffer, mimeType, nomFichier) {
    const erreurs = [];
    // Taille max
    const maxBytes = CONFIG.upload.maxSizeMo * 1024 * 1024;
    if (fileBuffer.length > maxBytes) {
      erreurs.push(`Fichier trop volumineux (max ${CONFIG.upload.maxSizeMo} Mo)`);
    }
    // Type MIME
    if (!CONFIG.upload.typesAcceptes.includes(mimeType)) {
      erreurs.push(`Type non accepté: ${mimeType}. Acceptés: PDF, JPEG, PNG, WebP`);
    }
    // Vérification magic bytes
    const magicBytes = fileBuffer.slice(0, 4).toString('hex');
    const isMagicPDF  = magicBytes.startsWith('25504446'); // %PDF
    const isMagicJPEG = magicBytes.startsWith('ffd8ff');
    const isMagicPNG  = magicBytes.startsWith('89504e47');
    const isMagicWebP = fileBuffer.slice(0, 12).toString('ascii').includes('WEBP');

    if (mimeType === 'application/pdf' && !isMagicPDF)  erreurs.push('Fichier PDF invalide (magic bytes incorrects)');
    if (mimeType === 'image/jpeg'      && !isMagicJPEG) erreurs.push('Fichier JPEG invalide');
    if (mimeType === 'image/png'       && !isMagicPNG)  erreurs.push('Fichier PNG invalide');

    return { valide: erreurs.length === 0, erreurs };
  }
};

/* ══════════════════════════════════════════════════════════
   OCR — Google Document AI
══════════════════════════════════════════════════════════ */
const OCRService = {

  /**
   * Analyser un document avec Google Document AI
   * Retourne les données extraites structurées
   */
  async analyserDocument(fileBuffer, mimeType) {
    // Vérification config
    if (!CONFIG.google.projectId || !CONFIG.google.processorId) {
      console.warn('⚠️  Google Document AI non configuré — mode simulation');
      return OCRService._simuler(fileBuffer, mimeType);
    }

    try {
      const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
      const client = new DocumentProcessorServiceClient();

      const processorName = client.processorPath(
        CONFIG.google.projectId,
        CONFIG.google.location,
        CONFIG.google.processorId
      );

      const [result] = await client.processDocument({
        name: processorName,
        rawDocument: {
          content:  fileBuffer.toString('base64'),
          mimeType: mimeType,
        },
      });

      return OCRService._parser(result.document);

    } catch (err) {
      console.error('OCR Error:', err.message);
      // Fallback sur simulation
      return OCRService._simuler(fileBuffer, mimeType);
    }
  },

  /**
   * Parser les résultats Google Document AI
   */
  _parser(document) {
    const text = document.text || '';
    const entities = {};

    // Extraire les entités nommées
    (document.entities || []).forEach(entity => {
      const key = entity.type.toLowerCase().replace(/\//g, '_');
      entities[key] = entity.mentionText || entity.normalizedValue?.text || '';
    });

    return {
      texte_brut:   text,
      confidence:   Math.round((document.textChanges?.length ? 0.95 : 0.80) * 100),
      entites:      entities,
      donnees:      OCRService._extraireDonnees(text, entities),
      source:       'google_document_ai',
      pages:        document.pages?.length || 1,
    };
  },

  /**
   * Extraction intelligente des données clés d'une facture moto
   */
  _extraireDonnees(texte, entites) {
    const t = texte.toLowerCase();

    // Montant — cherche patterns comme "total: 185,00 €" ou "185.00€"
    const montantMatch = texte.match(/(?:total|montant|ttc)[^\d]*(\d+[\s,.]?\d{0,2})\s*€/i) ||
                         texte.match(/(\d+[,.]?\d{0,2})\s*€\s*(?:ttc|total)/i);
    const montant = montantMatch ? parseFloat(montantMatch[1].replace(',','.').replace(/\s/g,'')) : null;

    // Kilométrage
    const kmMatch = texte.match(/(\d[\d\s]{2,7})\s*km/i);
    const km      = kmMatch ? parseInt(kmMatch[1].replace(/\s/g,'')) : null;

    // Date
    const dateMatch = texte.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    const date      = dateMatch ? `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}` : null;

    // Garage / prestataire
    const garageMatch = texte.match(/(?:garage|atelier|moto|sas|sarl|eurl)[^\n]{0,60}/i);
    const garage_nom  = garageMatch ? garageMatch[0].trim() : entites.supplier_name || null;

    // Numéro de facture
    const factureMatch = texte.match(/(?:facture|devis|bon)\s*n[°o]?\s*([A-Z0-9\-\/]{4,20})/i);
    const num_facture  = factureMatch ? factureMatch[1] : null;

    // Immatriculation
    const plaqueMatch = texte.match(/[A-Z]{2}[\s-]?\d{3}[\s-]?[A-Z]{2}/);
    const plaque      = plaqueMatch ? plaqueMatch[0].replace(/\s/g,'') : null;

    // Prestations détectées
    const prestations = [];
    const keywords = {
      'vidange':       ['vidange','huile','oil'],
      'filtre':        ['filtre','filter'],
      'bougies':       ['bougie','spark','ngk'],
      'chaine':        ['chaîne','chaine','chain'],
      'pneu':          ['pneu','pneumatique','michelin','pirelli','bridgestone','dunlop','metzeler'],
      'frein':         ['frein','brake','disque','plaquette'],
      'courroie':      ['courroie','belt','distribution'],
      'carburateur':   ['carbu','carburat'],
      'revision':      ['révision','revision','entretien','service'],
    };
    Object.entries(keywords).forEach(([prestation, mots]) => {
      if (mots.some(m => t.includes(m))) prestations.push(prestation);
    });

    return {
      montant,
      km,
      date,
      garage_nom,
      num_facture,
      plaque,
      prestations,
      texte_partiel: texte.slice(0, 500),
    };
  },

  /**
   * Mode simulation (quand Google Doc AI n'est pas configuré)
   * Simule une analyse réaliste pour les tests
   */
  _simuler(fileBuffer, mimeType) {
    const taille = fileBuffer.length;
    // Heuristique basique sur la taille
    const isProbablyPDF = mimeType === 'application/pdf';
    return {
      texte_brut:  isProbablyPDF ? '[Texte extrait du PDF - simulation]' : '[Texte extrait de l\'image - simulation]',
      confidence:  Math.floor(Math.random() * 20 + 75), // 75-95%
      entites:     {},
      donnees: {
        montant:     null, // Non détectable en simulation
        km:          null,
        date:        null,
        garage_nom:  null,
        num_facture: null,
        plaque:      null,
        prestations: [],
        texte_partiel: '[Simulation OCR — configurer GOOGLE_PROJECT_ID pour l\'OCR réel]',
      },
      source:   'simulation',
      pages:    1,
      note:     'Mode simulation. Configurer Google Document AI pour l\'OCR réel.',
    };
  },

  /**
   * Score de cohérence OCR vs données intervention
   * Compare ce que l'OCR a trouvé avec ce qui est dans le dossier
   */
  scorerCoherence(ocr_data, intervention) {
    const scores = [];
    const details = [];
    const d = ocr_data.donnees;

    // Montant
    if (d.montant && intervention.montant_ht) {
      const diff = Math.abs(d.montant - intervention.montant_ht) / intervention.montant_ht;
      const ok = diff < 0.25; // Tolérance 25% (TTC vs HT)
      scores.push(ok ? 20 : 0);
      details.push({ check: 'Montant', ok, detail: `OCR: ${d.montant}€ vs Dossier: ${intervention.montant_ht}€ HT` });
    } else {
      scores.push(10); // Neutre si non détecté
      details.push({ check: 'Montant', ok: null, detail: 'Non détecté par OCR' });
    }

    // Kilométrage
    if (d.km && intervention.km) {
      const diff = Math.abs(d.km - intervention.km);
      const ok = diff < 1000; // Tolérance 1000 km
      scores.push(ok ? 20 : 5);
      details.push({ check: 'Kilométrage', ok, detail: `OCR: ${d.km} km vs Dossier: ${intervention.km} km` });
    } else {
      scores.push(10);
      details.push({ check: 'Kilométrage', ok: null, detail: 'Non détecté par OCR' });
    }

    // Plaque
    if (d.plaque && intervention.moto_plaque) {
      const ok = d.plaque.replace(/[\s-]/g,'').toUpperCase() ===
                 intervention.moto_plaque.replace(/[\s-]/g,'').toUpperCase();
      scores.push(ok ? 25 : 0);
      details.push({ check: 'Immatriculation', ok, detail: `OCR: ${d.plaque} vs Dossier: ${intervention.moto_plaque}` });
    } else {
      scores.push(12);
      details.push({ check: 'Immatriculation', ok: null, detail: 'Non détectée par OCR' });
    }

    // Prestations cohérentes
    const titre_lower = (intervention.titre || '').toLowerCase();
    const prestation_ok = d.prestations.length > 0 &&
      d.prestations.some(p => titre_lower.includes(p) || p.includes(titre_lower.split(' ')[0]));
    scores.push(prestation_ok ? 25 : d.prestations.length > 0 ? 10 : 5);
    details.push({
      check: 'Prestations',
      ok: prestation_ok,
      detail: `OCR: [${d.prestations.join(', ')}] vs Titre: "${intervention.titre}"`
    });

    // Confidence OCR
    const confidence_bonus = Math.floor(ocr_data.confidence / 10); // 0-10 pts
    scores.push(confidence_bonus);

    const total = Math.min(100, scores.reduce((a, b) => a + b, 0));
    return { score: total, details, confidence_ocr: ocr_data.confidence };
  }
};

/* ══════════════════════════════════════════════════════════
   PDF GENERATOR — Appel Python
══════════════════════════════════════════════════════════ */
const PDFService = {

  /**
   * Générer une facture PDF via le script Python
   * Retourne un Buffer avec le contenu PDF
   */
  async genererFacture(devisData) {
    // Écrire les données dans un fichier temporaire
    const tmpDir  = os.tmpdir();
    const tmpIn   = path.join(tmpDir, `motokey_in_${Date.now()}.json`);
    const tmpOut  = path.join(tmpDir, `motokey_out_${Date.now()}.pdf`);

    try {
      fs.writeFileSync(tmpIn, JSON.stringify(devisData));

      // Appeler le script Python
      const { stdout, stderr } = await execFileAsync(
        CONFIG.pdf.python,
        ['-c', `
import sys, json
sys.path.insert(0, '${path.dirname(CONFIG.pdf.generatorScript)}')
from pdf_generator import generer_facture
with open('${tmpIn}') as f:
    data = json.load(f)
pdf_bytes = generer_facture(data)
with open('${tmpOut}', 'wb') as f:
    f.write(pdf_bytes)
print('OK:' + str(len(pdf_bytes)))
        `],
        { timeout: 30000 }
      );

      if (!stdout.includes('OK:')) {
        throw new Error(`PDF Generator: ${stderr || stdout}`);
      }

      const pdfBuffer = fs.readFileSync(tmpOut);
      return pdfBuffer;

    } finally {
      // Nettoyage fichiers temporaires
      try { fs.unlinkSync(tmpIn);  } catch {}
      try { fs.unlinkSync(tmpOut); } catch {}
    }
  },

  /**
   * Générer et uploader une facture directement
   */
  async genererEtUploader(garage_id, intervention_id, devisData) {
    const pdfBuffer = await PDFService.genererFacture(devisData);
    const result    = await StorageService.uploadFacture(
      garage_id, intervention_id, pdfBuffer, 'application/pdf'
    );
    return { ...result, pdf_size: pdfBuffer.length };
  }
};

/* ══════════════════════════════════════════════════════════
   PIPELINE COMPLET : Upload → OCR → Score → Sauvegarde
══════════════════════════════════════════════════════════ */
const Pipeline = {

  /**
   * Pipeline complet quand un garagiste upload une facture scannée
   *
   * @param {object} params
   * @param {string} params.garage_id
   * @param {string} params.intervention_id
   * @param {string} params.moto_plaque       Pour vérification OCR
   * @param {number} params.montant_ht        Pour vérification OCR
   * @param {number} params.km                Pour vérification OCR
   * @param {string} params.titre             Titre de l'intervention
   * @param {Buffer} params.fileBuffer        Contenu du fichier
   * @param {string} params.mimeType
   *
   * @returns {object} { storage, ocr, score_coherence, facture_url }
   */
  async traiterFacture(params) {
    const { garage_id, intervention_id, fileBuffer, mimeType } = params;

    // 1. Validation du fichier
    const validation = StorageService.validerFichier(fileBuffer, mimeType, '');
    if (!validation.valide) {
      throw new Error(`Fichier invalide: ${validation.erreurs.join(', ')}`);
    }

    // 2. Upload Supabase Storage
    console.log(`📤 Upload facture ${intervention_id}...`);
    const storage = await StorageService.uploadFacture(garage_id, intervention_id, fileBuffer, mimeType);

    // 3. OCR
    console.log(`🔍 Analyse OCR...`);
    const ocr = await OCRService.analyserDocument(fileBuffer, mimeType);

    // 4. Score de cohérence
    const intervention_mock = {
      titre:       params.titre       || '',
      montant_ht:  params.montant_ht  || 0,
      km:          params.km          || 0,
      moto_plaque: params.moto_plaque || '',
    };
    const coherence = OCRService.scorerCoherence(ocr, intervention_mock);

    // 5. Retour consolidé
    return {
      storage: {
        path:      storage.storage_path,
        url:       storage.signed_url,
        hash:      storage.file_hash,
        size:      storage.size_bytes,
      },
      ocr: {
        source:     ocr.source,
        confidence: ocr.confidence,
        donnees:    ocr.donnees,
        pages:      ocr.pages,
      },
      score_coherence:  coherence.score,
      details_coherence: coherence.details,
      facture_url:      storage.signed_url,
      hash_integrite:   storage.file_hash,
    };
  }
};

/* ══════════════════════════════════════════════════════════
   CONFIGURATION BUCKETS (à lancer une fois)
══════════════════════════════════════════════════════════ */
async function configurerBuckets() {
  console.log('🗄️  Configuration des buckets Supabase Storage...');
  const sb = buildSupabaseClient();
  const buckets = [
    { name: 'factures',    public: false, fileSizeLimit: 10485760 },
    { name: 'photos-motos',public: true,  fileSizeLimit: 5242880  },
    { name: 'certificats', public: false, fileSizeLimit: 5242880  },
  ];
  for (const b of buckets) {
    const { error } = await sb.storage.createBucket(b.name, {
      public:        b.public,
      fileSizeLimit: b.fileSizeLimit,
      allowedMimeTypes: ['application/pdf','image/jpeg','image/png','image/webp'],
    });
    if (error && !error.message.includes('already exists')) {
      console.error(`❌ Bucket ${b.name}: ${error.message}`);
    } else {
      console.log(`✅ Bucket "${b.name}" prêt (${b.public ? 'public' : 'privé'})`);
    }
  }
}

/* ══════════════════════════════════════════════════════════
   EXPORT
══════════════════════════════════════════════════════════ */
module.exports = {
  Storage:    StorageService,
  OCR:        OCRService,
  PDF:        PDFService,
  Pipeline,
  configurerBuckets,
  CONFIG,
};
