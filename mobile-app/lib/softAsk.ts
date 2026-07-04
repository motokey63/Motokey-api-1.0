import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Soft-ask "shown once" gate (MPUSH-01, D-04). The flag is a device-local
 * UX gate (not server-tracked — D-06 explicitly allows re-triggering from
 * the Compte tab even after the flag is set), so AsyncStorage is correct
 * here, not expo-secure-store (matches cache.ts's convention, not
 * secureStore.ts's session convention).
 */
export const SOFT_ASK_SEEN_KEY = 'mk_soft_ask_seen';

export async function hasSeenSoftAsk(): Promise<boolean> {
  return (await AsyncStorage.getItem(SOFT_ASK_SEEN_KEY)) === 'true';
}

export async function markSoftAskSeen(): Promise<void> {
  await AsyncStorage.setItem(SOFT_ASK_SEEN_KEY, 'true');
}

/** Pure decision function (D-04): show only if the flag hasn't been set yet. */
export function shouldShowSoftAsk(hasSeenFlag: boolean): boolean {
  return !hasSeenFlag;
}
