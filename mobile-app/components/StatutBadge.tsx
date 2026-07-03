import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface StatutBadgeProps {
  label: string;
  color: string;
}

/**
 * Generic small pill for devis/réclamation/garage statut labels. Caller
 * resolves the semantic color (devisStatutColor / reclamationStatutColor /
 * couleurColor) — this component just renders it.
 */
export function StatutBadge({ label, color }: StatutBadgeProps) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '26' }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
