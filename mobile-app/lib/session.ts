import { apiPost, extractTokens, tokenSecsLeft } from './api';
import { AuthSession } from './types';
import { REFRESH_SKEW_SECS, NEAR_EXPIRY_SECS } from '../constants/config';

/**
 * Single-flight token refresh primitive (MAUTH-03, D-09, Pitfall 4).
 *
 * Ports MotoKey_Client.html's `silentRefresh()` / `startRefreshTimer()` policy
 * (refresh when <5min left, treat as expired when <60s left) with a hard
 * single-flight guard: concurrent callers during an in-flight refresh AWAIT
 * the same promise instead of firing parallel `/auth/client/refresh` calls,
 * because Supabase refresh tokens are one-time-use/rotating and a race would
 * invalidate the session.
 *
 * Pure/testable — no React here. `context/AuthContext.tsx` wires this to
 * component state via the `deps` callbacks.
 */
export interface SessionRefresher {
  /** Returns the current token if it has >60s left, else awaits a single-flight refresh; null on hard expiry. */
  getValidAccessToken(): Promise<string | null>;
  /** Proactive: refreshes when <300s (REFRESH_SKEW_SECS) left. Returns true if the session is still valid afterwards. */
  refreshIfNeeded(): Promise<boolean>;
}

export function createSessionRefresher(deps: {
  getSession: () => AuthSession | null;
  setSession: (s: AuthSession) => Promise<void>;
  onHardExpiry: () => Promise<void>;
}): SessionRefresher {
  let inFlight: Promise<boolean> | null = null;

  async function doRefresh(): Promise<boolean> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const s = deps.getSession();
      if (!s?.refreshToken) {
        await deps.onHardExpiry();
        return false;
      }
      const { ok, data } = await apiPost('/auth/client/refresh', { refresh_token: s.refreshToken });
      if (!ok) {
        await deps.onHardExpiry();
        return false;
      }
      const { at, rt } = extractTokens(data);
      if (!at) {
        await deps.onHardExpiry();
        return false;
      }
      await deps.setSession({ ...s, accessToken: at, refreshToken: rt || s.refreshToken });
      return true;
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  async function refreshIfNeeded(): Promise<boolean> {
    const s = deps.getSession();
    if (!s) return false;
    if (tokenSecsLeft(s.accessToken) >= REFRESH_SKEW_SECS) return true;
    return doRefresh();
  }

  async function getValidAccessToken(): Promise<string | null> {
    const s = deps.getSession();
    if (!s) return null;
    if (tokenSecsLeft(s.accessToken) > NEAR_EXPIRY_SECS) return s.accessToken;
    const ok = await doRefresh();
    return ok ? deps.getSession()?.accessToken ?? null : null;
  }

  return { getValidAccessToken, refreshIfNeeded };
}
