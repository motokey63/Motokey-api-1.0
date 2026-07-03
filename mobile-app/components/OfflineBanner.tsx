import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fmtCacheTimestamp } from '../lib/cache';
import { colors } from '../theme/colors';

export interface OfflineBannerProps {
  updatedAt: number;
}

/**
 * Top banner (not a toast) shown when MPARITY-05's cache fallback is
 * active — serving stale data after a network failure.
 */
export function OfflineBanner({ updatedAt }: OfflineBannerProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{`Dernière mise à jour : ${fmtCacheTimestamp(updatedAt)}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card2,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.tx2,
  },
});
