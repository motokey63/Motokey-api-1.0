import { colors } from '../../theme/colors';
import {
  devisStatutLabel,
  devisStatutColor,
  reclamationStatutLabel,
  reclamationStatutColor,
  parseDevisList,
} from '../devisDisplay';

describe('devisStatutLabel', () => {
  it('maps envoye to À valider', () => {
    expect(devisStatutLabel('envoye')).toBe('À valider');
  });

  it('maps valide to Validé', () => {
    expect(devisStatutLabel('valide')).toBe('Validé');
  });

  it('maps refuse to Refusé', () => {
    expect(devisStatutLabel('refuse')).toBe('Refusé');
  });

  it('maps brouillon to Brouillon', () => {
    expect(devisStatutLabel('brouillon')).toBe('Brouillon');
  });

  it('passes through unknown values unchanged', () => {
    expect(devisStatutLabel('weird')).toBe('weird');
  });
});

describe('devisStatutColor', () => {
  it('maps envoye to acc', () => {
    expect(devisStatutColor('envoye')).toBe(colors.acc);
  });

  it('maps valide to gn', () => {
    expect(devisStatutColor('valide')).toBe(colors.gn);
  });

  it('maps refuse to rd', () => {
    expect(devisStatutColor('refuse')).toBe(colors.rd);
  });

  it('maps brouillon to tx3', () => {
    expect(devisStatutColor('brouillon')).toBe(colors.tx3);
  });

  it('defaults unknown values to tx2', () => {
    expect(devisStatutColor('weird')).toBe(colors.tx2);
  });
});

describe('reclamationStatutLabel', () => {
  it('maps en_attente to En attente', () => {
    expect(reclamationStatutLabel('en_attente')).toBe('En attente');
  });

  it('maps accepte to Acceptée', () => {
    expect(reclamationStatutLabel('accepte')).toBe('Acceptée');
  });

  it('maps refuse to Refusée', () => {
    expect(reclamationStatutLabel('refuse')).toBe('Refusée');
  });

  it('maps litige to Litige', () => {
    expect(reclamationStatutLabel('litige')).toBe('Litige');
  });

  it('passes through unknown values unchanged', () => {
    expect(reclamationStatutLabel('weird')).toBe('weird');
  });
});

describe('reclamationStatutColor', () => {
  it('maps en_attente to acc', () => {
    expect(reclamationStatutColor('en_attente')).toBe(colors.acc);
  });

  it('maps accepte to gn', () => {
    expect(reclamationStatutColor('accepte')).toBe(colors.gn);
  });

  it('maps refuse to rd', () => {
    expect(reclamationStatutColor('refuse')).toBe(colors.rd);
  });

  it('maps litige to rd', () => {
    expect(reclamationStatutColor('litige')).toBe(colors.rd);
  });

  it('defaults unknown values to tx2', () => {
    expect(reclamationStatutColor('weird')).toBe(colors.tx2);
  });
});

describe('parseDevisList', () => {
  it('unwraps the REAL two-level envelope into an array', () => {
    const result = parseDevisList({
      success: true,
      data: { devis: [{ id: 'd' }], total: 1 },
      message: 'OK',
      timestamp: 't',
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });

  it('falls back to a flat {devis:[...]} shape', () => {
    expect(parseDevisList({ devis: [{ id: 'd' }] }).length).toBe(1);
  });

  it('falls back to a bare array', () => {
    expect(parseDevisList([{ id: 'd' }]).length).toBe(1);
  });

  it('falls back to {data:[...]}', () => {
    expect(parseDevisList({ data: [{ id: 'd' }] }).length).toBe(1);
  });

  it('returns [] for an empty object', () => {
    expect(parseDevisList({})).toEqual([]);
  });

  it('returns [] for null', () => {
    expect(parseDevisList(null)).toEqual([]);
  });
});
