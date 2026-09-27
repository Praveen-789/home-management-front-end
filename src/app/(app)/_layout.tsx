import ChatRuntime from '@/components/chat-runtime';
import useUnreadCountSync from '@/hooks/use-unread-count-sync';
import { Slot } from 'expo-router';

// Signed-in screens. The root layout guards this whole group behind the session.
// HomeHub's screens are one stack, defined in the (stack) group; the five top-level screens show
// the bottom tab bar (AppShell's `tabs`), and deeper screens a back arrow. Slot renders the stack
// while this layout mounts what must live once per session: the badge sync and the chat socket.
export default function AppLayout() {
  useUnreadCountSync();
  return (
    <>
      <ChatRuntime />
      <Slot />
    </>
  );
}
