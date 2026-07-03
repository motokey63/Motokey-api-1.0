import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from './Button';
import { colors } from '../theme/colors';

export interface EmptyStateProps {
  icon: string;
  heading: string;
  body: string;
  ctaTitle?: string;
  onCta?: () => void;
  secondaryTitle?: string;
  onSecondary?: () => void;
}

/**
 * Icon (emoji) + heading + body + optional primary/ghost CTA. Reused
 * across Motos/Devis/Réclamations/Garages empty states, per the
 * Copywriting Contract in 15-UI-SPEC.md.
 */
export function EmptyState({ icon, heading, body, ctaTitle, onCta, secondaryTitle, onSecondary }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.body}>{body}</Text>
      {ctaTitle ? (
        <View style={styles.ctaWrap}>
          <Button title={ctaTitle} onPress={onCta ?? (() => {})} />
        </View>
      ) : null}
      {secondaryTitle ? (
        <View style={styles.secondaryWrap}>
          <Button variant="ghost" title={secondaryTitle} onPress={onSecondary ?? (() => {})} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 24,
    marginTop: 48,
    paddingHorizontal: 24,
  },
  icon: {
    fontSize: 32,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.tx,
    marginTop: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.tx2,
    textAlign: 'center',
    marginTop: 8,
  },
  ctaWrap: {
    marginTop: 16,
    alignSelf: 'stretch',
  },
  secondaryWrap: {
    marginTop: 8,
  },
});
