import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '../../../../theme/colors';

/**
 * Nested Stack inside the Motos tab (D-04/D-05): list -> fiche moto detail ->
 * sub-flows (add/claim/reclamations/garages). expo-router auto-registers
 * child route files under this folder; no Stack.Screen enumeration needed.
 */
export default function MotosStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.tx,
        headerStyle: { backgroundColor: colors.card },
      }}
    />
  );
}
