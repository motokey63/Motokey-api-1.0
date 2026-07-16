/**
 * Moto display helpers — couleur_dossier→hex mapping, score→couleur, date
 * formatting. Ported 1:1 from MotoKey_Client.html (fmtDate, couleur mapping)
 * for use by every Phase 15 moto screen. Pure functions, no React.
 */
import { colors } from '../theme/colors';

export const COULEUR_MAP: Record<string, string> = {
  vert: colors.gn,
  bleu: colors.bl,
  jaune: colors.yw,
  rouge: colors.rd,
};

export function couleurColor(couleurDossier?: string): string {
  return COULEUR_MAP[couleurDossier ?? ''] ?? colors.rd;
}

export function scoreToColor(score: number): string {
  return score >= 80 ? colors.gn : score >= 60 ? colors.bl : score >= 40 ? colors.yw : colors.rd;
}

export function fmtDate(d?: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
}

// Consommables (Phase 28) — verbatim parity with MotoKey_Client.html lines
// 612-647 (CONSO_LABELS / ETAT_WORDING). type_consommable → FR label.
export const CONSO_LABELS: Record<string, string> = {
  pneu_av: 'Pneu avant',
  pneu_ar: 'Pneu arrière',
  chaine: 'Chaîne',
  plaquettes_av: 'Plaquettes avant',
  plaquettes_ar: 'Plaquettes arrière',
  disque_av: 'Disque avant',
  disque_ar: 'Disque arrière',
  huile_moteur: 'Huile moteur',
  liquide_frein: 'Liquide de frein',
};

// etat → public-facing wording (grand public, not the raw etat value).
export const ETAT_WORDING: Record<string, string> = {
  bon: 'Très bon état',
  moyen: 'À surveiller',
  'usé': 'À changer bientôt',
  critique: 'À changer maintenant',
};

const ETAT_MAP: Record<string, string> = {
  bon: colors.gn,
  moyen: colors.bl,
  'usé': colors.yw,
  critique: colors.rd,
};

// Unlike couleurColor's red default, an unknown/absent wear state defaults
// to neutral blue — reading it as "critique/rouge" would misinform the
// client about a consommable we simply have no data for.
export function etatColor(etat?: string): string {
  return ETAT_MAP[etat ?? ''] ?? colors.bl;
}
