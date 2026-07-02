import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * "Moto*Key*" lockup (D-06): "Moto" in dark text, "Key" in orange italic.
 * Mirrors MotoKey_Client.html's `.logo` / `.logo em` treatment.
 */
export function Logo({ badge }: { badge?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.logo}>
        Moto
        <Text style={styles.logoAccent}>Key</Text>
      </Text>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: {
    fontFamily: 'Inter_900Black',
    fontSize: 28,
    fontWeight: '900',
    color: colors.tx,
    letterSpacing: 0.5,
  },
  logoAccent: {
    color: colors.acc,
    fontStyle: 'italic',
  },
  badge: {
    backgroundColor: colors.accbg,
    borderColor: colors.acc2,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.acc,
  },
});
