import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { couleurColor } from '../lib/motoDisplay';
import { colors } from '../theme/colors';

export interface ScoreBadgeProps {
  score?: number;
  couleurDossier?: string;
  size?: 'sm' | 'lg';
}

/**
 * Renders the moto's score/100 + couleur-coded number, with the "Score
 * MotoKey" label beneath it. Reused on the Motos list (MotoListCard) and
 * the Fiche Moto header. Mirrors MotoKey_Client.html's `.score-badge`
 * markup (score-num + score-label).
 */
export function ScoreBadge({ score, couleurDossier, size = 'sm' }: ScoreBadgeProps) {
  const color = couleurColor(couleurDossier);
  const numberSize = size === 'lg' ? 28 : 20;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.number, { color, fontSize: numberSize }]}>{score ?? '—'}</Text>
      <Text style={styles.label}>Score MotoKey</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-end',
  },
  number: {
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.tx3,
  },
});
