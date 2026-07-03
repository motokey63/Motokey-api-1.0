import { parseMotosList, parseInterventions, parseAlertes, fmtStatut } from '../motoParse';

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
