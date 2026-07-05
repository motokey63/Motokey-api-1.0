import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../../hooks/useAuth';
import { Logo } from '../../../components/Logo';
import { Button } from '../../../components/Button';
import { colors } from '../../../theme/colors';

/**
 * Compte tab (D-06): minimal placeholder at Phase 14 parity — email +
 * logout. Full profile-edit/change-password UI is out of scope for
 * Phase 15 (not an MPARITY requirement). Phase 16 adds a push
 * soft-ask retry entry point + a __DEV__-only local test-notification
 * trigger for manual MPUSH-05 verification.
 */
export default function CompteScreen() {
  const { email, logout } = useAuth();
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.logoRow}>
        <Logo />
      </View>
      <Text style={styles.welcome}>Bienvenue {email ?? ''}</Text>
      <View style={styles.buttonWrap}>
        <Button title="Se déconnecter" onPress={() => logout()} />
        <Button
          title="Activer les notifications"
          variant="ghost"
          onPress={() => router.push('/(app)/soft-ask')}
        />
        {__DEV__ ? (
          <Button
            title="Tester notification (dev)"
            variant="ghost"
            onPress={() =>
              Notifications.scheduleNotificationAsync({
                content: {
                  title: 'Nouveau devis reçu',
                  body: 'Test MPUSH-05 (notification locale)',
                  data: { type: 'devis_recu' },
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                  seconds: 2,
                },
              })
            }
          />
        ) : null}
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
  buttonWrap: { width: '100%', maxWidth: 280, gap: 12 },
});
