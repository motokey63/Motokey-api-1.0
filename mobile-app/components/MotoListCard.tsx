import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ScoreBadge } from './ScoreBadge';
import { Moto } from '../lib/motoParse';
import { colors } from '../theme/colors';

export interface MotoListCardProps {
  moto: Moto;
  onPress: () => void;
}

/**
 * Lightweight moto row (D-04): identity + score + couleur only, NO inline
 * expansion. Tapping navigates to the dedicated Fiche Moto detail screen.
 */
export function MotoListCard({ moto, onPress }: MotoListCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.left}>
        <Text style={styles.marque}>
          {moto.marque} {moto.modele}
          {moto.annee ? <Text style={styles.annee}> {moto.annee}</Text> : null}
        </Text>
        <Text style={styles.km}>{moto.km ? moto.km.toLocaleString('fr-FR') + ' km' : ''}</Text>
        <Text style={styles.plaque}>{moto.plaque}</Text>
      </View>
      <ScoreBadge score={moto.score} couleurDossier={moto.couleur_dossier} size="sm" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: {
    flexShrink: 1,
  },
  marque: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.tx,
  },
  annee: {
    fontWeight: '400',
    color: colors.tx2,
  },
  km: {
    fontSize: 13,
    color: colors.tx2,
    marginTop: 2,
  },
  plaque: {
    fontSize: 13,
    color: colors.tx3,
    marginTop: 2,
  },
});
