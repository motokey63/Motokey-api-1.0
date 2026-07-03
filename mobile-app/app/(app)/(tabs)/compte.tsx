import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../../../hooks/useAuth';
import { Logo } from '../../../components/Logo';
import { Button } from '../../../components/Button';
import { colors } from '../../../theme/colors';

/**
 * Compte tab (D-06): minimal placeholder at Phase 14 parity — email +
 * logout. Full profile-edit/change-password UI is out of scope for
 * Phase 15 (not an MPARITY requirement).
 */
export default function CompteScreen() {
  const { email, logout } = useAuth();

  return (
    <View style={styles.wrap}>
      <View style={styles.logoRow}>
        <Logo />
      </View>
      <Text style={styles.welcome}>Bienvenue {email ?? ''}</Text>
      <View style={styles.buttonWrap}>
        <Button title="Se déconnecter" onPress={() => logout()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoRow: { marginBottom: 24 },
  welcome: { fontSize: 18, fontWeight: '600', color: colors.tx, marginBottom: 32 },
  buttonWrap: { width: '100%', maxWidth: 280 },
});
