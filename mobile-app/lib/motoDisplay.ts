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
