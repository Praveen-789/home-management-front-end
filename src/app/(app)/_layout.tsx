import ChatRuntime from '@/components/chat-runtime';
import SideMenu from '@/components/side-menu';
import useUnreadCountSync from '@/hooks/use-unread-count-sync';
import { usePathname } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useTheme } from 'react-native-paper';

// Signed-in screens. The root layout guards this whole group behind the session.
// A drawer holds sibling screens, but HomeHub's screens are a stack (household, then tasks, then a
// task). So the drawer has a single screen, the stack, and exists only to slide the side menu over it.
export default function AppLayout() {
  useUnreadCountSync();
  const { colors } = useTheme();
  const atHome = usePathname() === '/';

  return (
    <>
      <ChatRuntime />
      <Drawer
        drawerContent={(props) => <SideMenu {...props} />}
        screenOptions={{
          // AppShell draws each screen's header, including the menu button.
          headerShown: false,
          drawerType: 'front',
          drawerStyle: { backgroundColor: colors.elevation.level1, width: 304 },
          // Deeper screens keep the left edge for the back swipe.
          swipeEnabled: atHome,
        }}
      />
    </>
  );
}
