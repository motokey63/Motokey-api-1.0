import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { colors } from '../../../theme/colors';

/**
 * Bottom tab bar (D-03): Motos / Devis / Compte. Replaces the Phase 14
 * placeholder Home. Icons are plain emoji (RESEARCH Pattern 2) — no
 * @expo/vector-icons dependency, matching MotoKey_Client.html precedent.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.acc,
        tabBarInactiveTintColor: colors.tx2,
        tabBarStyle: { backgroundColor: colors.card },
      }}
    >
      <Tabs.Screen
        name="motos"
        options={{
          title: 'Motos',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>🏍️</Text>,
        }}
      />
      <Tabs.Screen
        name="devis"
        options={{
          title: 'Devis',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text>,
        }}
      />
      <Tabs.Screen
        name="compte"
        options={{
          title: 'Compte',
          tabBarIcon: () => <Text style={{ fontSize: 20 }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}
