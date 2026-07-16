/**
 * Moto/intervention/alerte types + list/detail parsers.
 *
 * CRITICAL: apiFetch's `data` field IS the whole backend envelope
 * ({ success, data:{...}, message, timestamp }) — see motokey-api.js's ok()
 * helper and mobile-app/lib/api.ts. Every parser here MUST unwrap TWO levels
 * (data?.data?.<key>) FIRST, then fall back to flatter shapes for
 * robustness. A one-level unwrap silently breaks every screen at runtime
 * while unit tests on flat fixtures stay green — do not regress this.
 */
import { ApiResult } from './types';

export interface Intervention {
  id: string;
  titre: string;
  type?: string;
  date_intervention?: string;
  km?: number;
  technicien_nom?: string;
}

export interface Alerte {
  statut?: string;
  nom?: string;
  nom_operation?: string;
  km_prochain?: number;
}

export interface Moto {
  id: string;
  marque: string;
  modele: string;
  annee?: number;
  km?: number;
  plaque: string;
  score?: number;
  couleur_dossier?: string;
  pneu_av?: string;
  pneu_ar?: string;
  garage?: { nom?: string; tel?: string };
  garage_nom?: string;
  garage_tel?: string;
  interventions?: Intervention[];
  alertes?: Alerte[] | null;
}

export function parseMotosList(data: any): Moto[] {
  return Array.isArray(data?.data?.motos)
    ? data.data.motos
    : Array.isArray(data?.motos)
    ? data.motos
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : [];
}

export function parseInterventions(res: ApiResult): Intervention[] {
  if (!res.ok) return [];
  const d = res.data;
  return Array.isArray(d?.data?.interventions)
    ? d.data.interventions
    : Array.isArray(d?.interventions)
    ? d.interventions
    : Array.isArray(d?.data)
    ? d.data
    : Array.isArray(d)
    ? d
    : [];
}

// `: null` on !res.ok is load-bearing — a 403 for CLIENT means "hide Plan
// d'entretien section", per MotoKey_Client.html line 724 comment
// `// null = non accessible (403 RBAC) → section masquée`.
export function parseAlertes(res: ApiResult): Alerte[] | null {
  if (!res.ok) return null;
  const d = res.data;
  return Array.isArray(d?.data?.alertes)
    ? d.data.alertes
    : Array.isArray(d?.alertes)
    ? d.alertes
    : Array.isArray(d?.data)
    ? d.data
    : Array.isArray(d)
    ? d
    : [];
}

export interface ConsommableJauge {
  type_consommable: string;
  km_montage?: number | null;
  date_montage?: string | null;
  reference?: string | null;
  pct_usure: number | null;
  etat: string | null;
  has_data: boolean;
}

// Two-level unwrap (data?.data?.consommables) FIRST, flat fallback second —
// same rule as parseInterventions/parseAlertes above. Backend key is
// snake_case `jauge_generale`; returned field is camelCase `jaugeGenerale`.
export function parseConsommables(res: ApiResult): { items: ConsommableJauge[]; jaugeGenerale: ConsommableJauge | null } {
  if (!res.ok) return { items: [], jaugeGenerale: null };
  const d = res.data;
  const items = Array.isArray(d?.data?.consommables)
    ? d.data.consommables
    : Array.isArray(d?.consommables)
    ? d.consommables
    : [];
  const jaugeGenerale = d?.data?.jauge_generale ?? d?.jauge_generale ?? null;
  return { items, jaugeGenerale };
}

const STATUT_LABEL: Record<string, string> = {
  urgent: 'URGENT',
  warning: 'À faire',
  due: 'Dûe',
  ok: 'OK',
  future: 'À venir',
};

export function fmtStatut(s?: string): string {
  return STATUT_LABEL[s ?? ''] ?? s ?? '';
}
