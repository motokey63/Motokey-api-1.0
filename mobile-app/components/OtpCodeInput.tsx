import React from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export interface OtpCodeInputProps {
  value: string;
  onChangeText: (v: string) => void;
}

/**
 * Shared 8-digit OTP input (D-01/D-04) — used by verify.tsx for BOTH
 * register-verification and password-reset-confirm. Mirrors
 * MotoKey_Client.html's `.otp-input` exactly: font-size 24, letter-spacing 8,
 * centered, maxLength 8.
 */
export function OtpCodeInput({ value, onChangeText }: OtpCodeInputProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder="00000000"
      placeholderTextColor={colors.tx3}
      keyboardType="number-pad"
      maxLength={8}
      autoComplete="one-time-code"
      style={styles.otpInput}
    />
  );
}

const styles = StyleSheet.create({
  otpInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    color: colors.tx,
  },
});
