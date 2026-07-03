import {
  parseLimite,
  validateAddMoto,
  buildAddMotoPayload,
  validateClaim,
  buildClaimPayload,
  parseReclamations,
  parseGarages,
} from '../garageLiaison';

describe('parseLimite', () => {
  it('unwraps the REAL two-level backend envelope', () => {
    const envelope = {
      success: true,
      data: { count: 2, limite: 3, can_add: false, cta_pro: true },
      message: 'OK',
      timestamp: 't',
    };
    expect(parseLimite(envelope)).toEqual({ count: 2, limite: 3, can_add: false, cta_pro: true });
  });

  it('round-trips a flat fallback shape', () => {
    const flat = { count: 2, limite: 3, can_add: true, cta_pro: false };
    expect(parseLimite(flat)).toEqual(flat);
  });

  it('returns the always-permissive default for null', () => {
    expect(parseLimite(null)).toEqual({ count: 0, limite: 3, can_add: true, cta_pro: false });
  });
});

describe('validateAddMoto', () => {
  it('returns null (valid) when all required fields are present', () => {
    expect(
      validateAddMoto({ marque: 'Yamaha', modele: 'MT-07', plaque: 'AB-123-CD', vin: 'XYZ', mode_acquisition: 'achat_occasion' })
    ).toBeNull();
  });

  it('returns the required-fields message when marque is empty', () => {
    expect(
      validateAddMoto({ marque: '', modele: 'MT-07', plaque: 'AB', vin: 'XYZ', mode_acquisition: 'achat_occasion' })
    ).toBe('Marque, modèle, plaque et VIN requis.');
  });

  it.each(['marque', 'modele', 'plaque', 'vin'] as const)(
    'returns the required-fields message when %s is empty/whitespace',
    (field) => {
      const base = { marque: 'Yamaha', modele: 'MT-07', plaque: 'AB-123-CD', vin: 'XYZ', mode_acquisition: 'achat_occasion' };
      const form = { ...base, [field]: '   ' };
      expect(validateAddMoto(form)).toBe('Marque, modèle, plaque et VIN requis.');
    }
  );
});

describe('buildAddMotoPayload', () => {
  it('coerces annee/km to numbers and trims strings', () => {
    expect(
      buildAddMotoPayload({
        marque: 'Yamaha',
        modele: 'MT-07',
        plaque: 'AB-123-CD',
        vin: 'XYZ',
        annee: '2021',
        km: '1000',
        mode_acquisition: 'achat_occasion',
      })
    ).toEqual({
      marque: 'Yamaha',
      modele: 'MT-07',
      plaque: 'AB-123-CD',
      vin: 'XYZ',
      annee: 2021,
      km: 1000,
      mode_acquisition: 'achat_occasion',
    });
  });

  it('coerces empty annee to null and empty km to 0', () => {
    const payload = buildAddMotoPayload({
      marque: 'Yamaha',
      modele: 'MT-07',
      plaque: 'AB-123-CD',
      vin: 'XYZ',
      annee: '',
      km: '',
      mode_acquisition: 'inconnu',
    });
    expect(payload.annee).toBeNull();
    expect(payload.km).toBe(0);
  });
});

describe('validateClaim', () => {
  it('requires both vin and plaque', () => {
    expect(validateClaim('', 'AB')).toBe('VIN et plaque requis.');
    expect(validateClaim('XYZ', '')).toBe('VIN et plaque requis.');
  });

  it('returns null when both are present', () => {
    expect(validateClaim('XYZ', 'AB')).toBeNull();
  });
});

describe('buildClaimPayload', () => {
  it('includes the disabled-photo literal', () => {
    expect(buildClaimPayload('XYZ', 'AB-123-CD')).toEqual({
      vin_fourni: 'XYZ',
      plaque_fournie: 'AB-123-CD',
      carte_grise_photo_url: 'pending_manual_verification',
    });
  });
});

describe('parseReclamations', () => {
  it('unwraps the REAL two-level backend envelope into a length-1 array', () => {
    const envelope = {
      success: true,
      data: { reclamations: [{ id: 'r' }], total: 1 },
      message: 'OK',
      timestamp: 't',
    };
    const result = parseReclamations(envelope);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'r' });
  });

  it('falls back to a flat { reclamations } shape', () => {
    expect(parseReclamations({ reclamations: [{ id: 'r' }] })).toHaveLength(1);
  });

  it('returns [] for an empty object', () => {
    expect(parseReclamations({})).toEqual([]);
  });
});

describe('parseGarages', () => {
  it('unwraps the REAL two-level backend envelope into a length-1 array', () => {
    const envelope = {
      success: true,
      data: { garages: [{ id: 'g' }], total: 1 },
      message: 'OK',
      timestamp: 't',
    };
    const result = parseGarages(envelope);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'g' });
  });

  it('falls back to a flat { garages } shape', () => {
    expect(parseGarages({ garages: [{ id: 'g' }] })).toHaveLength(1);
  });

  it('returns [] for an empty object', () => {
    expect(parseGarages({})).toEqual([]);
  });
});
