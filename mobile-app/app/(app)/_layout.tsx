import React from 'react';
import { Stack } from 'expo-router';
import { useNotificationObserver } from '../../hooks/useNotificationObserver';
import { usePushRegistrationRetry } from '../../hooks/usePushRegistrationRetry';

export default function AppLayout() {
  useNotificationObserver();
  usePushRegistrationRetry();
  return <Stack screenOptions={{ headerShown: false }} />;
}
