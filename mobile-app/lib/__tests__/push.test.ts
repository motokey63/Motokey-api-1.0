// In-memory Map-backed mock for AsyncStorage, mirroring cache.test.ts/softAsk.test.ts.
const mockAsyncStorageMap = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async (key: string, value: string) => {
      mockAsyncStorageMap.set(key, value);
    }),
    getItem: jest.fn(async (key: string) => mockAsyncStorageMap.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => {
      mockAsyncStorageMap.delete(key);
    }),
  },
}));

jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

jest.mock('expo-device', () => ({
  __esModule: true,
  isDevice: true,
  osName: 'Android',
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: 'test-project-id' } } },
    easConfig: undefined,
  },
}));

jest.mock('../api', () => ({
  __esModule: true,
  apiPost: jest.fn(),
  apiFetch: jest.fn(),
}));

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiPost, apiFetch } from '../api';
import {
  PUSH_TOKEN_KEY,
  getStoredPushToken,
  registerForPushAsync,
  retryRegistrationIfGranted,
  unregisterPushAsync,
} from '../push';

beforeEach(() => {
  mockAsyncStorageMap.clear();
  jest.clearAllMocks();
  (Device as any).isDevice = true;
  (Device as any).osName = 'Android';
  (Constants as any).expoConfig = { extra: { eas: { projectId: 'test-project-id' } } };
  (Constants as any).easConfig = undefined;
});

describe('registerForPushAsync', () => {
  it('Test 1: returns false immediately when Device.isDevice is false, without calling permission APIs', async () => {
    (Device as any).isDevice = false;

    const result = await registerForPushAsync('token-abc');

    expect(result).toBe(false);
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('Test 2: returns false when permission is requested and denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'undetermined' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });

    const result = await registerForPushAsync('token-abc');

    expect(result).toBe(false);
  });

  it('Test 3: returns false when permission granted but no EAS projectId configured', async () => {
    (Constants as any).expoConfig = { extra: {} };
    (Constants as any).easConfig = undefined;
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });

    const result = await registerForPushAsync('token-abc');

    expect(result).toBe(false);
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('Test 4: returns true, POSTs the token, and stores it when permission granted + projectId present + POST succeeds', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValueOnce({ data: 'ExponentPushToken[xyz]' });
    (apiPost as jest.Mock).mockResolvedValueOnce({ ok: true });

    const result = await registerForPushAsync('token-abc');

    expect(result).toBe(true);
    expect(apiPost).toHaveBeenCalledWith(
      '/client/device-tokens',
      { token: 'ExponentPushToken[xyz]', platform: 'android' },
      'token-abc'
    );
    expect(await AsyncStorage.getItem(PUSH_TOKEN_KEY)).toBe('ExponentPushToken[xyz]');
  });

  it('Test 5: returns false (and does not store a token) when the POST fails', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'granted' });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValueOnce({ data: 'ExponentPushToken[xyz]' });
    (apiPost as jest.Mock).mockResolvedValueOnce({ ok: false });

    const result = await registerForPushAsync('token-abc');

    expect(result).toBe(false);
    expect(await AsyncStorage.getItem(PUSH_TOKEN_KEY)).toBeNull();
  });
});

describe('retryRegistrationIfGranted', () => {
  it('Test 6: returns true immediately (no network call) if a token is already stored locally', async () => {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, 'already-stored-token');

    const result = await retryRegistrationIfGranted('token-abc');

    expect(result).toBe(true);
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('Test 7: returns false WITHOUT ever calling requestPermissionsAsync when no token stored and permission not granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'undetermined' });

    const result = await retryRegistrationIfGranted('token-abc');

    expect(result).toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('unregisterPushAsync', () => {
  it('Test 8: calls DELETE /client/device-tokens and clears the stored token, when a token was previously stored', async () => {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, 'stored-token-123');
    (apiFetch as jest.Mock).mockResolvedValueOnce({ ok: true });

    await unregisterPushAsync('token-abc');

    expect(apiFetch).toHaveBeenCalledWith('DELETE', '/client/device-tokens', { token: 'stored-token-123' }, 'token-abc');
    expect(await getStoredPushToken()).toBeNull();
  });

  it('Test 9: no-ops (no apiFetch call) when no token was ever stored', async () => {
    await unregisterPushAsync('token-abc');

    expect(apiFetch).not.toHaveBeenCalled();
  });
});
