import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import { ToastProvider } from '../components/Toast';
import { AuthProvider } from '../context/AuthContext';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../theme/colors';
import { hasSeenSoftAsk } from '../lib/softAsk';

/**
 * Root layout (D-06/D-01..D-05 delivery surface): loads Inter, mounts
 * ToastProvider + AuthProvider, and gates navigation between the (auth) and
 * (app) route groups based on `useAuth().status`.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.acc} />
      </View>
    );
  }

  return (
    <ToastProvider>
      <AuthProvider>
        <RootNav />
      </AuthProvider>
    </ToastProvider>
  );
}

function RootNav() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (status === 'authenticated' && inAuthGroup) {
      (async () => {
        const seen = await hasSeenSoftAsk();
        router.replace(seen ? '/(app)/(tabs)/motos' : '/(app)/soft-ask');
      })();
    }
  }, [status, segments, router]);

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.acc} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
