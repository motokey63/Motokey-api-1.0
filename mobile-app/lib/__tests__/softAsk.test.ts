// In-memory Map-backed mock for AsyncStorage, mirroring cache.test.ts.
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

import { SOFT_ASK_SEEN_KEY, hasSeenSoftAsk, markSoftAskSeen, shouldShowSoftAsk } from '../softAsk';

beforeEach(() => {
  mockAsyncStorageMap.clear();
});

describe('shouldShowSoftAsk (pure)', () => {
  it('returns true when the flag has never been seen', () => {
    expect(shouldShowSoftAsk(false)).toBe(true);
  });

  it('returns false when the flag has already been seen', () => {
    expect(shouldShowSoftAsk(true)).toBe(false);
  });
});

describe('hasSeenSoftAsk / markSoftAskSeen round-trip', () => {
  it('returns false when the AsyncStorage key is unset', async () => {
    expect(await hasSeenSoftAsk()).toBe(false);
  });

  it('returns true after markSoftAskSeen() is called', async () => {
    await markSoftAskSeen();
    expect(await hasSeenSoftAsk()).toBe(true);
    expect(mockAsyncStorageMap.get(SOFT_ASK_SEEN_KEY)).toBe('true');
  });
});
