'use strict';
/* Script ponctuel — génère les icônes PWA (monogramme MK) en PNG bruts.
   Aucune dépendance externe (pas de sharp/canvas) : rasterisation de segments
   épais + supersampling (SSAA x8) + encodage PNG manuel via zlib (stdlib).
   Usage : node scripts/gen-pwa-icons.js
   Sortie : icons/icon-180.png, icons/icon-192.png, icons/icon-512.png */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'icons');
const BG = [0xff, 0x6b, 0x00];   // #ff6b00
const FG = [0xff, 0xff, 0xff];   // blanc
const SIZES = [180, 192, 512];
const SSAA = 8;                   // facteur de supersampling (downscale entier propre)
const PADDING = 0.16;              // marge autour du monogramme (fraction du canvas)
const GAP = 0.05;                  // espace entre M et K (fraction de la largeur utile)
const STROKE = 0.24;                // épaisseur de trait (fraction de la largeur de chaque lettre) — graisse lourde

// Segments définis en coordonnées locales [0,1]x[0,1] par lettre (x droite, y bas)
const LETTER_M = [
  [[0, 0], [0, 1]],            // jambage gauche
  [[1, 0], [1, 1]],            // jambage droit
  [[0, 0], [0.5, 0.62]],       // diagonale gauche vers le creux central
  [[1, 0], [0.5, 0.62]]        // diagonale droite vers le creux central
];
const LETTER_K = [
  [[0, 0], [0, 1]],            // jambage vertical
  [[0, 0.5], [1, 0]],          // bras haut
  [[0, 0.5], [1, 1]]           // bras bas
];

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  let t = abLen2 > 0 ? (apx * abx + apy * aby) / abLen2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * abx, cy = ay + t * aby;
  const dx = px - cx, dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Rasterise une lettre (segments en coord. locales 0..1) dans une box en pixels master
// [bx0,by0]-[bx1,by1], en marquant mask[y*W+x]=1 si couvert.
function paintLetter(mask, W, segments, bx0, by0, bx1, by1, strokeFrac) {
  const bw = bx1 - bx0, bh = by1 - by0;
  const half = strokeFrac * bw / 2;
  const x0 = Math.max(0, Math.floor(bx0 - half - 1));
  const x1 = Math.min(W - 1, Math.ceil(bx1 + half + 1));
  const y0 = Math.max(0, Math.floor(by0 - half - 1));
  const y1 = Math.min(W - 1, Math.ceil(by1 + half + 1));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      // coord locale 0..1 dans la box de la lettre
      const lx = (px + 0.5 - bx0) / bw;
      const ly = (py + 0.5 - by0) / bh;
      for (const [[ax, ay], [cx2, cy2]] of segments) {
        const d = distToSegment(lx, ly, ax, ay, cx2, cy2);
        if (d <= strokeFrac / 2) { mask[py * W + px] = 1; break; }
      }
    }
  }
}

function buildMaster(size) {
  const W = size * SSAA;
  const mask = new Uint8Array(W * W);

  const pad = PADDING * W;
  const contentX0 = pad, contentX1 = W - pad;
  const contentY0 = pad, contentY1 = W - pad;
  const contentW = contentX1 - contentX0;
  const contentH = contentY1 - contentY0;

  const gapPx = GAP * contentW;
  const glyphW = (contentW - gapPx) / 2;

  // M à gauche, K à droite, même hauteur, alignées en haut du contenu
  paintLetter(mask, W, LETTER_M, contentX0, contentY0, contentX0 + glyphW, contentY0 + contentH, STROKE);
  paintLetter(mask, W, LETTER_K, contentX0 + glyphW + gapPx, contentY0, contentX1, contentY0 + contentH, STROKE);

  return mask;
}

function downsample(mask, size) {
  const W = size * SSAA;
  const rgb = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      const sx0 = x * SSAA, sy0 = y * SSAA;
      for (let sy = 0; sy < SSAA; sy++) {
        const row = (sy0 + sy) * W + sx0;
        for (let sx = 0; sx < SSAA; sx++) sum += mask[row + sx];
      }
      const cov = sum / (SSAA * SSAA); // 0..1
      const idx = (y * size + x) * 3;
      rgb[idx]     = Math.round(BG[0] + (FG[0] - BG[0]) * cov);
      rgb[idx + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * cov);
      rgb[idx + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * cov);
    }
  }
  return rgb;
}

// ─── Encodeur PNG minimal (RGB 8 bits, sans filtre par scanline) ───
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}
function encodePNG(rgb, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type 2 = RGB truecolor
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0 (none)
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const mask = buildMaster(size);
  const rgb = downsample(mask, size);
  const png = encodePNG(rgb, size);
  const outPath = path.join(OUT_DIR, `icon-${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`✅ ${outPath} (${png.length} octets)`);
}
