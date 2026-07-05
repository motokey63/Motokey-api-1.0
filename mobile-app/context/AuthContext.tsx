import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { apiPost, extractTokens, errMsg, tokenSecsLeft } from '../lib/api';
import { saveSession, loadSession, clearSession } from '../lib/secureStore';
import { AuthSession } from '../lib/types';
import { createSessionRefresher } from '../lib/session';
import { REFRESH_POLL_MS, NEAR_EXPIRY_SECS } from '../constants/config';
import { showToast } from '../components/Toast';
import { unregisterPushAsync } from '../lib/push';

/**
 * Owns the client auth session end-to-end: cold-start restore (MAUTH-02),
 * every action against the Express `/auth/client/*` endpoints (MAUTH-01,
 * ports MotoKey_Client.html's handlers verbatim), and proactive refresh via
 * a 60s timer + AppState foreground listener (MAUTH-03), backed by the
 * single-flight primitive in `lib/session.ts` (D-09).
 *
 * Screens in plan 14-03 consume this exclusively through `useAuth()` and
 * never touch tokens directly.
 */
export interface AuthContextValue {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  email: string | null;
  login(email: string, password: string): Promise<{ ok: boolean; error?: string }>;
  register(email: string, password: string, nom: string, tel?: string): Promise<{ ok: boolean; error?: string }>;
  verifyEmail(email: string, code: string): Promise<{ ok: boolean; authed: boolean; error?: string }>;
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(email: string, code: string, newPassword: string): Promise<{ ok: boolean; error?: string }>;
  logout(): Promise<void>;
  getValidAccessToken(): Promise<string | null>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const sessionRef = useRef<AuthSession | null>(null);
  const hardExpiryNotifiedRef = useRef(false);

  const persist = useCallback(async (s: AuthSession) => {
    sessionRef.current = s;
    setSessionState(s);
    await saveSession(s);
    setStatus('authenticated');
    hardExpiryNotifiedRef.current = false;
  }, []);

  const onHardExpiry = useCallback(async () => {
    sessionRef.current = null;
    setSessionState(null);
    await clearSession();
    setStatus('unauthenticated');
    if (!hardExpiryNotifiedRef.current) {
      hardExpiryNotifiedRef.current = true;
      showToast('Session expirée — reconnectez-vous', 'error');
    }
  }, []);

  const refresher = useMemo(
    () =>
      createSessionRefresher({
        getSession: () => sessionRef.current,
        setSession: persist,
        onHardExpiry,
      }),
    [persist, onHardExpiry]
  );

  // Cold-start restore (mirrors MotoKey_Client.html's init(), MAUTH-02)
  useEffect(() => {
    (async () => {
      const s = await loadSession();
      if (!s) {
        setStatus('unauthenticated');
        return;
      }
      sessionRef.current = s;
      setSessionState(s);
      if (tokenSecsLeft(s.accessToken) > NEAR_EXPIRY_SECS) {
        setStatus('authenticated');
      } else {
        const ok = await refresher.refreshIfNeeded();
        setStatus(ok ? 'authenticated' : 'unauthenticated');
      }
    })();
  }, [refresher]);

  // Proactive refresh: 60s poll (web parity)
  useEffect(() => {
    if (status !== 'authenticated') return;
    const id = setInterval(() => {
      refresher.refreshIfNeeded();
    }, REFRESH_POLL_MS);
    return () => clearInterval(id);
  }, [status, refresher]);

  // Proactive refresh: on app foreground (MAUTH-03) — before any 401 is visible
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresher.refreshIfNeeded();
    });
    return () => sub.remove();
  }, [refresher]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { ok, data } = await apiPost('/auth/client/login', { email, password });
      if (!ok) return { ok: false, error: errMsg(data) };
      const { at, rt } = extractTokens(data);
      await persist({ accessToken: at, refreshToken: rt, email });
      return { ok: true };
    },
    [persist]
  );

  const register = useCallback(async (email: string, password: string, nom: string, tel?: string) => {
    const body: Record<string, any> = { email, password, nom };
    if (tel) body.tel = tel;
    const { ok, data } = await apiPost('/auth/client/register', body);
    if (!ok) return { ok: false, error: errMsg(data) };
    return { ok: true };
  }, []);

  const verifyEmail = useCallback(
    async (email: string, code: string) => {
      const { ok, data } = await apiPost('/auth/client/verify-email', { email, token: code });
      if (!ok) return { ok: false, authed: false, error: errMsg(data) };
      const { at, rt } = extractTokens(data);
      if (at && rt) {
        await persist({ accessToken: at, refreshToken: rt, email });
        return { ok: true, authed: true };
      }
      return { ok: true, authed: false };
    },
    [persist]
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    await apiPost('/auth/client/password-reset', { email }); // anti-enum: always resolves
  }, []);

  const confirmPasswordReset = useCallback(async (email: string, code: string, newPassword: string) => {
    const { ok, data } = await apiPost('/auth/client/password-reset/confirm', {
      email,
      code,
      new_password: newPassword,
    });
    if (!ok) return { ok: false, error: errMsg(data) };
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    const s = sessionRef.current;
    if (s?.accessToken) {
      await unregisterPushAsync(s.accessToken).catch(() => {});
    }
    if (s?.refreshToken) {
      await apiPost('/auth/client/logout', { refresh_token: s.refreshToken }).catch(() => {});
    }
    sessionRef.current = null;
    setSessionState(null);
    await clearSession();
    setStatus('unauthenticated');
  }, []);

  const getValidAccessToken = useCallback(() => refresher.getValidAccessToken(), [refresher]);

  const value: AuthContextValue = useMemo(
    () => ({
      status,
      email: session?.email ?? null,
      login,
      register,
      verifyEmail,
      requestPasswordReset,
      confirmPasswordReset,
      logout,
      getValidAccessToken,
    }),
    [
      status,
      session,
      login,
      register,
      verifyEmail,
      requestPasswordReset,
      confirmPasswordReset,
      logout,
      getValidAccessToken,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
