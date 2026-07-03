/**
 * Devis + réclamation statut label/color lookups and list parser. Ported
 * verbatim from MotoKey_Client.html's STATUT_LABEL/STATUT_COLOR (devis) and
 * sLabel (réclamation) constants. Pure functions, no React.
 *
 * parseDevisList follows the same two-level envelope unwrap discipline as
 * motoParse.ts — see that file's header comment for the full rationale.
 */
import { colors } from '../theme/colors';

export const DEVIS_STATUT_LABEL: Record<string, string> = {
  envoye: 'À valider',
  valide: 'Validé',
  refuse: 'Refusé',
  brouillon: 'Brouillon',
};

export const DEVIS_STATUT_COLOR: Record<string, string> = {
  envoye: colors.acc,
  valide: colors.gn,
  refuse: colors.rd,
  brouillon: colors.tx3,
};

export function devisStatutLabel(s: string): string {
  return DEVIS_STATUT_LABEL[s] ?? s;
}

export function devisStatutColor(s: string): string {
  return DEVIS_STATUT_COLOR[s] ?? colors.tx2;
}

export const RECLAMATION_STATUT_LABEL: Record<string, string> = {
  en_attente: 'En attente',
  accepte: 'Acceptée',
  refuse: 'Refusée',
  litige: 'Litige',
};

export const RECLAMATION_STATUT_COLOR: Record<string, string> = {
  en_attente: colors.acc,
  accepte: colors.gn,
  refuse: colors.rd,
  litige: colors.rd,
};

export function reclamationStatutLabel(s: string): string {
  return RECLAMATION_STATUT_LABEL[s] ?? s;
}

export function reclamationStatutColor(s: string): string {
  return RECLAMATION_STATUT_COLOR[s] ?? colors.tx2;
}

export interface DevisLigne {
  description?: string;
  desc?: string;
  quantite?: number;
  prix_unitaire?: number;
}

export interface Devis {
  id: string;
  numero?: string;
  statut: string;
  total_ttc?: number;
  created_at?: string;
  valide_at?: string;
  refuse_at?: string;
  motos?: { marque?: string; modele?: string; plaque?: string };
  devis_lignes?: DevisLigne[];
  lignes?: DevisLigne[];
}

export function parseDevisList(data: any): Devis[] {
  return Array.isArray(data?.data?.devis)
    ? data.data.devis
    : Array.isArray(data?.devis)
    ? data.devis
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : [];
}
