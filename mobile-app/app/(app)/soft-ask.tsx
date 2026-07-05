import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/Button';
import { showToast } from '../../components/Toast';
import { colors } from '../../theme/colors';
import { markSoftAskSeen } from '../../lib/softAsk';
import { registerForPushAsync } from '../../lib/push';

/**
 * Full-screen, one-time soft-ask (MPUSH-01, D-04/D-05). Reached from
 * app/_layout.tsx's RootNav (first authentication, flag unseen) or from
 * the Compte tab's "Activer les notifications" retry entry point (D-06).
 * Both paths land here and both funnel through the same Accept/Decline
 * actions below — retriggering does not need special-case behavior.
 */
export default function SoftAskScreen() {
  const router = useRouter();
  const { getValidAccessToken } = useAuth();
  const [loading, setLoading] = useState(false);

  const goToTabs = () => router.replace('/(app)/(tabs)/motos');

  const onAccept = async () => {
    setLoading(true);
    await markSoftAskSeen();
    const token = await getValidAccessToken();
    if (token) {
      const ok = await registerForPushAsync(token);
      // D-08: failure is silent here — hooks/usePushRegistrationRetry.ts
      // (Task 3) retries on the next app foreground, no user-facing error.
      if (ok) showToast('Notifications activées.', 'success');
    }
    setLoading(false);
    goToTabs();
  };

  const onDecline = async () => {
    await markSoftAskSeen();
    goToTabs();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.logoRow}>
        <Logo />
      </View>
      <Text style={styles.title}>Restez informé</Text>
      <Text style={styles.body}>
        Activez les notifications pour être averti dès qu'un garage vous envoie un devis, et
        pour ne jamais manquer un rappel d'entretien pour votre moto.
      </Text>
      <View style={styles.buttons}>
        <Button title="Activer les notifications" onPress={onAccept} loading={loading} />
        <Button title="Plus tard" variant="ghost" onPress={onDecline} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logoRow: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: colors.tx, marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 14, color: colors.tx2, textAlign: 'center', marginBottom: 32, maxWidth: 320 },
  buttons: { width: '100%', maxWidth: 280, gap: 12 },
});
