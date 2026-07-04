import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiPost, apiFetch } from './api';

/**
 * Device-token lifecycle (MPUSH-02, D-07/D-08/D-09). Two entry points:
 *  - registerForPushAsync: called from the soft-ask "Accept" action — MAY
 *    prompt the OS permission dialog (D-07).
 *  - retryRegistrationIfGranted: called on app foreground (D-08) — NEVER
 *    prompts the OS; only retries the network registration if permission
 *    was already granted in a prior session but the POST never succeeded.
 * Both funnel into completeRegistration() once permission is confirmed.
 */
export const PUSH_TOKEN_KEY = 'mk_push_token';

export async function getStoredPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_TOKEN_KEY);
}

async function completeRegistration(accessToken: string): Promise<boolean> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return false; // no EAS project configured yet (Pitfall 2) — fail silently, D-08

  let expoPushToken: string;
  try {
    expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return false;
  }

  const platform = Device.osName === 'iOS' ? 'ios' : 'android';
  const { ok } = await apiPost('/client/device-tokens', { token: expoPushToken, platform }, accessToken);
  if (!ok) return false;

  await AsyncStorage.setItem(PUSH_TOKEN_KEY, expoPushToken);
  return true;
}

/** Called from the soft-ask accept action. May prompt the OS permission dialog. */
export async function registerForPushAsync(accessToken: string): Promise<boolean> {
  if (!Device.isDevice) return false;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return false;

  return completeRegistration(accessToken);
}

/** Called on app foreground (D-08). Never prompts the OS — read-only permission check. */
export async function retryRegistrationIfGranted(accessToken: string): Promise<boolean> {
  if (!Device.isDevice) return false;
  const already = await getStoredPushToken();
  if (already) return true;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return false;

  return completeRegistration(accessToken);
}

/** Called from AuthContext.logout() (D-09). No-ops if no token was ever stored. */
export async function unregisterPushAsync(accessToken: string): Promise<void> {
  const token = await getStoredPushToken();
  if (!token) return;
  await apiFetch('DELETE', '/client/device-tokens', { token }, accessToken).catch(() => {});
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}
