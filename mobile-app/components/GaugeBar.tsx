import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { etatColor, ETAT_WORDING } from '../lib/motoDisplay';
import { colors } from '../theme/colors';

export interface GaugeBarProps {
  label: string;
  pctUsure: number | null;
  etat: string | null;
  hasData: boolean;
}

/**
 * Read-only horizontal wear gauge row (label | 90px bar | wording pill).
 * D-04: mobile drops the "Ajouter une photo" upload button present in
 * MotoKey_Client.html's jaugeRowClient — mobile is read-only this milestone.
 * D-05: first "progress bar" component in the mobile repo.
 */
export function GaugeBar({ label, pctUsure, etat, hasData }: GaugeBarProps) {
  if (!hasData) {
    return (
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.pill, { backgroundColor: colors.yw + '26' }]}>
          <Text style={[styles.pillText, { color: colors.yw }]}>Non renseigné</Text>
        </View>
      </View>
    );
  }

  const color = etatColor(etat ?? undefined);
  const pct = Math.max(0, Math.min(100, pctUsure ?? 0));
  const wording = ETAT_WORDING[etat ?? ''] ?? etat ?? '';

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <View style={[styles.pill, { backgroundColor: color + '26' }]}>
        <Text style={[styles.pillText, { color }]}>{wording}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    flex: 1,
    fontSize: 14,
    color: colors.tx,
  },
  track: {
    width: 90,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
