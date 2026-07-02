import { extractTokens, tokenSecsLeft, errMsg } from '../api';

function jwt(payload: Record<string, any>): string {
  return 'x.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.y';
}

describe('extractTokens', () => {
  it('extracts tokens from a flat response', () => {
    expect(extractTokens({ access_token: 'A', refresh_token: 'B' })).toEqual({ at: 'A', rt: 'B' });
  });

  it('extracts tokens from a session-nested response', () => {
    expect(extractTokens({ session: { access_token: 'A', refresh_token: 'B' } })).toEqual({ at: 'A', rt: 'B' });
  });

  it('extracts tokens from a data.session-nested response', () => {
    expect(extractTokens({ data: { session: { access_token: 'A', refresh_token: 'B' } } })).toEqual({ at: 'A', rt: 'B' });
  });

  it('returns empty strings when no tokens present', () => {
    expect(extractTokens({})).toEqual({ at: '', rt: '' });
  });
});

describe('tokenSecsLeft', () => {
  it('returns seconds remaining for a JWT expiring in 1 hour', () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const token = jwt({ exp: nowSecs + 3600 });
    const secsLeft = tokenSecsLeft(token);
    expect(secsLeft).toBeGreaterThan(3590);
    expect(secsLeft).toBeLessThanOrEqual(3600);
  });

  it('returns 0 for a non-JWT string without throwing', () => {
    expect(tokenSecsLeft('not.a.jwt')).toBe(0);
  });

  it('returns 0 for a JWT with no exp claim', () => {
    const token = jwt({ sub: 'user-1' });
    expect(tokenSecsLeft(token)).toBe(0);
  });
});

describe('errMsg', () => {
  it('prefers error.message', () => {
    expect(errMsg({ error: { message: 'X' } })).toBe('X');
  });

  it('falls back to message', () => {
    expect(errMsg({ message: 'Y' })).toBe('Y');
  });

  it('falls back to a default message', () => {
    expect(errMsg({})).toBe('Erreur inattendue.');
  });
});
