// In-memory Map-backed mock for AsyncStorage, mirroring secureStore.test.ts.
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CACHE_KEY_MOTOS,
  CACHE_KEY_DEVIS,
  setCached,
  getCached,
  shouldServeCache,
  fmtCacheTimestamp,
} from '../cache';

beforeEach(() => {
  mockAsyncStorageMap.clear();
});

describe('cache keys', () => {
  it('locks the AsyncStorage key names', () => {
    expect(CACHE_KEY_MOTOS).toBe('mk_cache_motos');
    expect(CACHE_KEY_DEVIS).toBe('mk_cache_devis');
  });
});

describe('setCached / getCached round-trip', () => {
  it('round-trips data with a positive updatedAt timestamp', async () => {
    await setCached('k', [1, 2]);
    const entry = await getCached<number[]>('k');

    expect(entry).not.toBeNull();
    expect(entry!.data).toEqual([1, 2]);
    expect(entry!.updatedAt).toEqual(expect.any(Number));
    expect(entry!.updatedAt).toBeGreaterThan(0);
  });

  it('returns null for an unset key', async () => {
    const entry = await getCached('missing-key');
    expect(entry).toBeNull();
  });

  it('returns null (no throw) for malformed JSON', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(async () => 'not-json{{{');
    const entry = await getCached('bad-key');
    expect(entry).toBeNull();
  });
});

describe('shouldServeCache', () => {
  it('is true only for status 0 (network unreachable)', () => {
    expect(shouldServeCache(0)).toBe(true);
  });

  it('is false for real HTTP error statuses', () => {
    expect(shouldServeCache(401)).toBe(false);
    expect(shouldServeCache(403)).toBe(false);
    expect(shouldServeCache(500)).toBe(false);
  });

  it('is false for a successful status', () => {
    expect(shouldServeCache(200)).toBe(false);
  });
});

describe('fmtCacheTimestamp', () => {
  it('formats as DD/MM à HHhMM', () => {
    const ms = new Date('2026-07-03T14:32:00').getTime();
    const s = fmtCacheTimestamp(ms);

    expect(s).toEqual(expect.any(String));
    expect(s.length).toBeGreaterThan(0);
    expect(s).toContain('03/07');
    expect(s).toContain('14h32');
  });
});
