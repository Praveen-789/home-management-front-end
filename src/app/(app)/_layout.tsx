import { endNavigationTiming } from '@/lib/performance-timing';
import { Stack } from 'expo-router';

// Deep links into a household still get the list underneath them for back navigation.
export const unstable_settings = { initialRouteName: 'index' };

// Signed-in screens. The root layout guards this whole group behind the session.
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} screenListeners={{ transitionEnd: (event) => { if (!event.data.closing) endNavigationTiming(); } }} />;
}
