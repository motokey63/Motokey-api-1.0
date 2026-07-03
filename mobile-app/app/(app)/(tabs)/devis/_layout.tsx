import React from 'react';
import { Stack } from 'expo-router';

/**
 * Devis is a single flat screen (RESEARCH Open Question 2) — inline
 * accept/refuse, no drill-down. Header-less stack keeps the tab title
 * from the parent Tabs layer.
 */
export default function DevisStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
