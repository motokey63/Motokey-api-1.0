// In-memory Map-backed mocks for expo-secure-store and AsyncStorage.
const mockSecureStoreMap = new Map<string, string>();
const mockAsyncStorageMap = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStoreMap.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStoreMap.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStoreMap.delete(key);
  }),
}));

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

if (typeof (globalThis as any).crypto?.getRandomValues !== 'function') {
  (globalThis as any).crypto = require('crypto').webcrypto;
}

import { SESSION_KEY } from '../../constants/config';
import { saveSession, loadSession, clearSession } from '../secureStore';

const sampleSession = { accessToken: 'A', refreshToken: 'B', email: 'x@y.z' };

beforeEach(() => {
  mockSecureStoreMap.clear();
  mockAsyncStorageMap.clear();
});

describe('LargeSecureStore session round-trip', () => {
  it('saves and loads a session, deep-equal to the original', async () => {
    await saveSession(sampleSession);
    const loaded = await loadSession();
    expect(loaded).toEqual(sampleSession);
  });

  it('persists ciphertext (not plaintext JSON) into AsyncStorage', async () => {
    await saveSession(sampleSession);
    const persisted = mockAsyncStorageMap.get(SESSION_KEY);
    expect(persisted).toBeDefined();
    expect(persisted).not.toBe(JSON.stringify(sampleSession));
    expect(persisted).not.toEqual(JSON.stringify(sampleSession));
  });

  it('clearSession removes the session so loadSession returns null', async () => {
    await saveSession(sampleSession);
    await clearSession();
    const loaded = await loadSession();
    expect(loaded).toBeNull();
  });
});
