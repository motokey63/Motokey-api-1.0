import { parseMotosList, parseInterventions, parseAlertes, fmtStatut, parseConsommables } from '../motoParse';

describe('parseMotosList', () => {
  it('unwraps the REAL two-level envelope into an array', () => {
    const result = parseMotosList({
      success: true,
      data: { motos: [{ id: '1' }, { id: '2' }], total: 2 },
      message: 'OK',
      timestamp: 't',
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
  });

  it('falls back to a flat {motos:[...]} shape', () => {
    expect(parseMotosList({ motos: [{ id: '1' }] }).length).toBe(1);
  });

  it('falls back to a bare array', () => {
    expect(parseMotosList([{ id: '1' }]).length).toBe(1);
  });

  it('falls back to {data:[...]}', () => {
    expect(parseMotosList({ data: [{ id: '1' }] }).length).toBe(1);
  });

  it('returns [] for an empty object', () => {
    expect(parseMotosList({})).toEqual([]);
  });

  it('returns [] for null', () => {
    expect(parseMotosList(null)).toEqual([]);
  });
});

describe('parseInterventions', () => {
  it('unwraps the REAL two-level envelope into an array', () => {
    const result = parseInterventions({
      ok: true,
      status: 200,
      data: { success: true, data: { interventions: [{ id: 'i' }] }, message: 'OK' },
    });
    expect(result.length).toBe(1);
  });

  it('falls back to a flat {interventions:[...]} shape', () => {
    const result = parseInterventions({ ok: true, status: 200, data: { interventions: [{ id: 'i' }] } });
    expect(result.length).toBe(1);
  });

  it('returns [] on a 403 (RBAC)', () => {
    expect(parseInterventions({ ok: false, status: 403, data: {} })).toEqual([]);
  });
});

describe('parseAlertes', () => {
  it('unwraps the REAL two-level envelope into an array', () => {
    const result = parseAlertes({
      ok: true,
      status: 200,
      data: { success: true, data: { alertes: [{ statut: 'due' }] }, message: 'OK' },
    });
    expect(result?.length).toBe(1);
  });

  it('falls back to a flat {alertes:[...]} shape', () => {
    const result = parseAlertes({ ok: true, status: 200, data: { alertes: [{ statut: 'due' }] } });
    expect(result?.length).toBe(1);
  });

  it('returns null on a 403 (RBAC — section hidden, not an error)', () => {
    expect(parseAlertes({ ok: false, status: 403, data: {} })).toBeNull();
  });
});

describe('fmtStatut', () => {
  it('maps urgent to URGENT', () => {
    expect(fmtStatut('urgent')).toBe('URGENT');
  });

  it('maps warning to À faire', () => {
    expect(fmtStatut('warning')).toBe('À faire');
  });

  it('maps due to Dûe', () => {
    expect(fmtStatut('due')).toBe('Dûe');
  });

  it('maps ok to OK', () => {
    expect(fmtStatut('ok')).toBe('OK');
  });

  it('maps future to À venir', () => {
    expect(fmtStatut('future')).toBe('À venir');
  });

  it('passes through unknown values unchanged', () => {
    expect(fmtStatut('xyz')).toBe('xyz');
  });
});

describe('parseConsommables', () => {
  it('unwraps the REAL two-level envelope into items + jaugeGenerale', () => {
    const result = parseConsommables({
      ok: true,
      status: 200,
      data: {
        success: true,
        data: {
          consommables: new Array(9).fill(null).map((_, i) => ({
            type_consommable: `type_${i}`,
            pct_usure: 50,
            etat: 'moyen',
            has_data: true,
          })),
          jauge_generale: { type_consommable: 'chaine', pct_usure: 80, etat: 'critique', has_data: true },
        },
        message: 'OK',
      },
    });
    expect(result.items.length).toBe(9);
    expect(result.jaugeGenerale).toEqual({ type_consommable: 'chaine', pct_usure: 80, etat: 'critique', has_data: true });
  });

  it('falls back to a flat { consommables, jauge_generale } shape', () => {
    const result = parseConsommables({
      ok: true,
      status: 200,
      data: { consommables: [{ type_consommable: 'chaine', pct_usure: 10, etat: 'bon', has_data: true }], jauge_generale: null },
    });
    expect(result.items.length).toBe(1);
    expect(result.jaugeGenerale).toBeNull();
  });

  it('returns { items: [], jaugeGenerale: null } on a non-ok response (403/404/network)', () => {
    expect(parseConsommables({ ok: false, status: 403, data: {} })).toEqual({ items: [], jaugeGenerale: null });
  });

  it('returns { items: [], jaugeGenerale: null } on null/empty data without throwing', () => {
    expect(parseConsommables({ ok: true, status: 200, data: null })).toEqual({ items: [], jaugeGenerale: null });
  });
});
