import React, { useState } from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
}

/**
 * Mirrors MotoKey_Client.html's `.btn-primary` / `.btn-ghost`. Ghost variant
 * is used for the D-02 "Mot de passe oublié ?" link and other secondary
 * navigation actions.
 */
export function Button({ title, onPress, loading, variant = 'primary', disabled }: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const isDisabled = disabled || loading;

  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={styles.ghostWrap}
      >
        <Text style={[styles.ghostText, pressed && { textDecorationLine: 'underline' }, isDisabled && styles.disabledText]}>
          {loading ? '…' : title}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.primary, pressed && !isDisabled && styles.primaryPressed, isDisabled && styles.primaryDisabled]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryText}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.acc,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: {
    backgroundColor: colors.acc2,
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  ghostWrap: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  ghostText: {
    color: colors.acc,
    fontSize: 13,
    fontWeight: '600',
  },
  disabledText: {
    opacity: 0.6,
  },
});
