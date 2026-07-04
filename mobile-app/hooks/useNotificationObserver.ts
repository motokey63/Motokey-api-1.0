import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

// Foreground presentation (Pattern 4) — set once at module load.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NotificationRoute = '/(app)/(tabs)/devis';

/**
 * Pure, exported for unit testing (Pitfall 3 — typedRoutes needs a static
 * literal, so this maps notification `data` to one of a known-safe set of
 * route strings rather than passing `data.type`/`data.url` straight through
 * to `router.push`).
 */
export function mapNotificationDataToRoute(data: any): NotificationRoute | null {
  if (data && data.type === 'devis_recu') return '/(app)/(tabs)/devis';
  return null;
}

/**
 * Mount ONLY inside app/(app)/_layout.tsx (Plan 16-03) — NOT the root
 * _layout.tsx. Mounting at the root would fire router.push before the
 * (app) route group / auth gate exists, causing a silent no-op or nav
 * error on cold start from a killed state (Anti-Pattern, RESEARCH.md).
 */
export function useNotificationObserver() {
  const router = useRouter();

  useEffect(() => {
    function redirect(notification: Notifications.Notification) {
      const route = mapNotificationDataToRoute(notification.request.content.data);
      if (route) router.push(route as any);
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification) redirect(response.notification);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      redirect(response.notification);
    });

    return () => subscription.remove();
  }, [router]);
}
