import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Read-only offline fallback cache (MPARITY-05, D-08/D-09). Stores the last
 * successful motos/devis list responses in AsyncStorage alongside a
 * last-updated timestamp, so a network failure (apiFetch's `{ status: 0 }`
 * catch-block shape) can serve stale data with a "dernière mise à jour"
 * label instead of a bare error screen.
 *
 * Load-bearing rule: only a network-unreachable status (0) may serve cache.
 * A real HTTP error (401/403/500) must surface the actual error — serving
 * stale cache on a 401 would silently hide an auth failure from the user.
 */

export const CACHE_KEY_MOTOS = 'mk_cache_motos';
export const CACHE_KEY_DEVIS = 'mk_cache_devis';

export interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

export async function setCached<T>(key: string, data: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify({ data, updatedAt: Date.now() }));
}

export async function getCached<T>(key: string): Promise<CacheEntry<T> | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

/**
 * Only status 0 (network unreachable, per apiFetch's catch block) should
 * serve stale cache. Any real HTTP status (401/403/500/etc.) must surface
 * the actual error instead of silently masking it with old data.
 */
export function shouldServeCache(status: number): boolean {
  return status === 0;
}

/** Formats a cache timestamp as `DD/MM à HHhMM`, e.g. `03/07 à 14h32`. */
export function fmtCacheTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${dd}/${mm} à ${hh}h${min}`;
}
