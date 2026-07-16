import { colors } from '../../theme/colors';
import { COULEUR_MAP, couleurColor, scoreToColor, fmtDate, etatColor, CONSO_LABELS, ETAT_WORDING } from '../motoDisplay';

describe('COULEUR_MAP', () => {
  it('maps vert/bleu/jaune/rouge to the correct theme hex', () => {
    expect(COULEUR_MAP.vert).toBe(colors.gn);
    expect(COULEUR_MAP.bleu).toBe(colors.bl);
    expect(COULEUR_MAP.jaune).toBe(colors.yw);
    expect(COULEUR_MAP.rouge).toBe(colors.rd);
  });
});

describe('couleurColor', () => {
  it('resolves vert to green', () => {
    expect(couleurColor('vert')).toBe(colors.gn);
  });

  it('resolves rouge to red', () => {
    expect(couleurColor('rouge')).toBe(colors.rd);
  });

  it('defaults undefined to red', () => {
    expect(couleurColor(undefined)).toBe(colors.rd);
  });

  it('defaults an unknown value to red', () => {
    expect(couleurColor('unknown')).toBe(colors.rd);
  });
});

describe('scoreToColor', () => {
  it('returns green for 85 (>=80)', () => {
    expect(scoreToColor(85)).toBe(colors.gn);
  });

  it('returns blue for 70 (>=60)', () => {
    expect(scoreToColor(70)).toBe(colors.bl);
  });

  it('returns yellow for 50 (>=40)', () => {
    expect(scoreToColor(50)).toBe(colors.yw);
  });

  it('returns red for 20 (<40)', () => {
    expect(scoreToColor(20)).toBe(colors.rd);
  });
});

describe('fmtDate', () => {
  it('returns a non-empty fr-FR string for a valid date', () => {
    const result = fmtDate('2026-03-15');
    expect(result).not.toBe('');
    expect(typeof result).toBe('string');
  });

  it('returns empty string for empty input', () => {
    expect(fmtDate('')).toBe('');
  });

  it('returns empty string for null input', () => {
    expect(fmtDate(null)).toBe('');
  });
});

describe('etatColor', () => {
  it("resolves 'bon' to green", () => {
    expect(etatColor('bon')).toBe(colors.gn);
  });

  it("resolves 'moyen' to blue", () => {
    expect(etatColor('moyen')).toBe(colors.bl);
  });

  it("resolves 'usé' to yellow", () => {
    expect(etatColor('usé')).toBe(colors.yw);
  });

  it("resolves 'critique' to red", () => {
    expect(etatColor('critique')).toBe(colors.rd);
  });

  it('defaults undefined to neutral blue (not red — unknown is not critical)', () => {
    expect(etatColor(undefined)).toBe(colors.bl);
  });

  it('defaults an unknown value to neutral blue', () => {
    expect(etatColor('anything_unknown')).toBe(colors.bl);
  });
});

describe('CONSO_LABELS', () => {
  it('maps pneu_av to Pneu avant', () => {
    expect(CONSO_LABELS.pneu_av).toBe('Pneu avant');
  });

  it('maps liquide_frein to Liquide de frein', () => {
    expect(CONSO_LABELS.liquide_frein).toBe('Liquide de frein');
  });
});

describe('ETAT_WORDING', () => {
  it('maps bon to Très bon état', () => {
    expect(ETAT_WORDING.bon).toBe('Très bon état');
  });

  it("maps 'usé' to À changer bientôt", () => {
    expect(ETAT_WORDING['usé']).toBe('À changer bientôt');
  });
});
