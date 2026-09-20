import { endNavigationTiming } from '@/lib/performance-timing';
import { Stack } from 'expo-router';

// Deep links into a household still get the list underneath them for back navigation.
export const unstable_settings = { initialRouteName: 'index' };

// Every signed-in screen, pushed and popped as one stack. The side menu's drawer wraps this stack,
// and the folder name is in brackets so it never appears in a URL.
export default function StackLayout() {
  return <Stack screenOptions={{ headerShown: false }} screenListeners={{ transitionEnd: (event) => { if (!event.data.closing) endNavigationTiming(); } }} />;
}
