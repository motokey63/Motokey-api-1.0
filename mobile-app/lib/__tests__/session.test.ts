import { createSessionRefresher } from '../session';
import { apiPost } from '../api';
import { AuthSession } from '../types';

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, apiPost: jest.fn() };
});

const mockedApiPost = apiPost as jest.Mock;

function jwt(payload: Record<string, any>): string {
  return 'x.' + Buffer.from(JSON.stringify(payload)).toString('base64') + '.y';
}

function nowSecs(): number {
  return Math.floor(Date.now() / 1000);
}

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: jwt({ exp: nowSecs() + 3600 }),
    refreshToken: 'refresh-token-1',
    email: 'sophie@email.com',
    ...overrides,
  };
}

/** Builds a deps bag backed by a simple in-memory session ref, mirroring AuthContext's sessionRef pattern. */
function makeDeps(initial: AuthSession | null) {
  let session: AuthSession | null = initial;
  const onHardExpiry = jest.fn(async () => {
    session = null;
  });
  const setSession = jest.fn(async (s: AuthSession) => {
    session = s;
  });
  return {
    getSession: () => session,
    setSession,
    onHardExpiry,
  };
}

beforeEach(() => {
  mockedApiPost.mockReset();
});

describe('getValidAccessToken', () => {
  it('returns the current token without refreshing when >60s left', async () => {
    const session = makeSession({ accessToken: jwt({ exp: nowSecs() + 3600 }) });
    const deps = makeDeps(session);
    const refresher = createSessionRefresher(deps);

    const token = await refresher.getValidAccessToken();

    expect(token).toBe(session.accessToken);
    expect(mockedApiPost).not.toHaveBeenCalled();
  });

  it('triggers exactly one refresh call and returns the new access token when <60s left', async () => {
    const newAccessToken = jwt({ exp: nowSecs() + 3600 });
    mockedApiPost.mockResolvedValue({
      ok: true,
      status: 200,
      data: { access_token: newAccessToken, refresh_token: 'refresh-token-2' },
    });
    const session = makeSession({ accessToken: jwt({ exp: nowSecs() + 10 }) });
    const deps = makeDeps(session);
    const refresher = createSessionRefresher(deps);

    const token = await refresher.getValidAccessToken();

    expect(mockedApiPost).toHaveBeenCalledTimes(1);
    expect(mockedApiPost).toHaveBeenCalledWith('/auth/client/refresh', { refresh_token: 'refresh-token-1' });
    expect(token).toBe(newAccessToken);
  });

  it('produces exactly one underlying refresh call for 5 concurrent callers (single-flight)', async () => {
    const newAccessToken = jwt({ exp: nowSecs() + 3600 });
    mockedApiPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              data: { access_token: newAccessToken, refresh_token: 'refresh-token-2' },
            });
          }, 0);
        })
    );
    const session = makeSession({ accessToken: jwt({ exp: nowSecs() + 10 }) });
    const deps = makeDeps(session);
    const refresher = createSessionRefresher(deps);

    const results = await Promise.all([
      refresher.getValidAccessToken(),
      refresher.getValidAccessToken(),
      refresher.getValidAccessToken(),
      refresher.getValidAccessToken(),
      refresher.getValidAccessToken(),
    ]);

    expect(mockedApiPost).toHaveBeenCalledTimes(1);
    results.forEach((token) => expect(token).toBe(newAccessToken));
  });

  it('resolves to null and invokes onHardExpiry once when refresh fails (hard expiry)', async () => {
    mockedApiPost.mockResolvedValue({ ok: false, status: 401, data: { error: { message: 'invalid_grant' } } });
    const session = makeSession({ accessToken: jwt({ exp: nowSecs() + 10 }) });
    const deps = makeDeps(session);
    const refresher = createSessionRefresher(deps);

    const token = await refresher.getValidAccessToken();

    expect(token).toBeNull();
    expect(deps.onHardExpiry).toHaveBeenCalledTimes(1);
  });

  it('does not re-refresh a later call once the in-flight promise is cleared and the new token is still valid', async () => {
    const newAccessToken = jwt({ exp: nowSecs() + 3600 });
    mockedApiPost.mockResolvedValue({
      ok: true,
      status: 200,
      data: { access_token: newAccessToken, refresh_token: 'refresh-token-2' },
    });
    const session = makeSession({ accessToken: jwt({ exp: nowSecs() + 10 }) });
    const deps = makeDeps(session);
    const refresher = createSessionRefresher(deps);

    const first = await refresher.getValidAccessToken();
    expect(mockedApiPost).toHaveBeenCalledTimes(1);

    const second = await refresher.getValidAccessToken();

    expect(mockedApiPost).toHaveBeenCalledTimes(1);
    expect(first).toBe(newAccessToken);
    expect(second).toBe(newAccessToken);
  });
});

describe('refreshIfNeeded', () => {
  it('returns true and does not call refresh when >300s left', async () => {
    const session = makeSession({ accessToken: jwt({ exp: nowSecs() + 3600 }) });
    const deps = makeDeps(session);
    const refresher = createSessionRefresher(deps);

    const result = await refresher.refreshIfNeeded();

    expect(result).toBe(true);
    expect(mockedApiPost).not.toHaveBeenCalled();
  });

  it('calls refresh once and returns true on success when <300s left', async () => {
    const newAccessToken = jwt({ exp: nowSecs() + 3600 });
    mockedApiPost.mockResolvedValue({
      ok: true,
      status: 200,
      data: { access_token: newAccessToken, refresh_token: 'refresh-token-2' },
    });
    const session = makeSession({ accessToken: jwt({ exp: nowSecs() + 120 }) });
    const deps = makeDeps(session);
    const refresher = createSessionRefresher(deps);

    const result = await refresher.refreshIfNeeded();

    expect(result).toBe(true);
    expect(mockedApiPost).toHaveBeenCalledTimes(1);
  });
});
