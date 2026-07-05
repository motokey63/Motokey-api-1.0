import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './useAuth';
import { retryRegistrationIfGranted } from '../lib/push';

/**
 * D-08: silently retries device-token registration on every app
 * foreground (and once on mount) if permission was already granted in
 * a prior session but the backend POST never succeeded (e.g. was
 * offline). Never prompts the OS — see lib/push.ts's
 * retryRegistrationIfGranted, which only reads existing permission
 * status. Mount once, inside app/(app)/_layout.tsx (authenticated
 * only — getValidAccessToken() requires a session).
 */
export function usePushRegistrationRetry() {
  const { getValidAccessToken } = useAuth();

  useEffect(() => {
    const attempt = async () => {
      const token = await getValidAccessToken();
      if (!token) return;
      await retryRegistrationIfGranted(token);
    };
    attempt();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });
    return () => sub.remove();
  }, [getValidAccessToken]);
}
