/**
 * Add-moto / claim-moto / réclamations / garages payload builders, validators
 * and response parsers (MPARITY-04, D-01/D-02). Ports MotoKey_Client.html's
 * renderAddMotoTab/submitAddMoto (lines 1127-1172), renderClaimTab/submitClaim
 * (lines 1174-1223), loadClientReclamationsTab (lines 1225-1247) and
 * loadClientGaragesTab (lines 1249-1269).
 *
 * CRITICAL: every 2xx endpoint here wraps its payload in the backend's `ok()`
 * envelope `{ success, data:{...}, message, timestamp }` (motokey-api.js
 * lines 366-371), and apiFetch's `res.data` IS that whole envelope — so
 * reaching the real payload requires TWO levels: `data?.data?.<key>`. The
 * web client's own one-level unwrap (`data.reclamations`, `data.garages`) is
 * NOT valid here and would silently return empty/default values at runtime.
 * parseLimite/parseReclamations/parseGarages check the real two-level shape
 * FIRST, then fall back to flatter shapes for robustness/testability.
 */

export interface LimiteMotos {
  count: number;
  limite: number;
  can_add: boolean;
  cta_pro: boolean;
}

export function parseLimite(data: any): LimiteMotos {
  const d = data?.data ?? data ?? {};
  return {
    count: d.count ?? 0,
    limite: d.limite ?? 3,
    can_add: d.can_add ?? true,
    cta_pro: d.cta_pro ?? false,
  };
}

export interface AddMotoForm {
  marque: string;
  modele: string;
  plaque: string;
  vin: string;
  annee?: string;
  km?: string;
  mode_acquisition: string;
}

export function validateAddMoto(f: AddMotoForm): string | null {
  const marque = (f.marque || '').trim();
  const modele = (f.modele || '').trim();
  const plaque = (f.plaque || '').trim();
  const vin = (f.vin || '').trim();
  if (!marque || !modele || !plaque || !vin) {
    return 'Marque, modèle, plaque et VIN requis.';
  }
  return null;
}

export function buildAddMotoPayload(f: AddMotoForm) {
  return {
    marque: f.marque.trim(),
    modele: f.modele.trim(),
    plaque: f.plaque.trim(),
    vin: f.vin.trim(),
    annee: parseInt(f.annee || '', 10) || null,
    km: parseInt(f.km || '', 10) || 0,
    mode_acquisition: f.mode_acquisition,
  };
}

export function validateClaim(vin: string, plaque: string): string | null {
  if (!(vin || '').trim() || !(plaque || '').trim()) {
    return 'VIN et plaque requis.';
  }
  return null;
}

export function buildClaimPayload(vin: string, plaque: string) {
  return {
    vin_fourni: vin.trim(),
    plaque_fournie: plaque.trim(),
    // Photo upload disabled per D-02 (mirrors web client's empty
    // CLOUDINARY_CLOUD state) — literal string, no Cloudinary integration.
    carte_grise_photo_url: 'pending_manual_verification',
  };
}

export interface Reclamation {
  id: string;
  statut: string;
  vin_fourni?: string;
  date_creation?: string;
  motif_refus?: string;
  motos?: { marque?: string; modele?: string; plaque?: string };
}

export interface GarageLink {
  id: string;
  statut: string;
  date_creation?: string;
  garages?: { nom?: string; adresse?: string; tel?: string };
}

export function parseReclamations(data: any): Reclamation[] {
  return Array.isArray(data?.data?.reclamations)
    ? data.data.reclamations
    : Array.isArray(data?.reclamations)
      ? data.reclamations
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : [];
}

export function parseGarages(data: any): GarageLink[] {
  return Array.isArray(data?.data?.garages)
    ? data.data.garages
    : Array.isArray(data?.garages)
      ? data.garages
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : [];
}
