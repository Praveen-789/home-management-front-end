import { useNotificationStore } from '@/stores/notification-store';
import { useEffect } from 'react';
import { AppState } from 'react-native';

const INTERVAL_MS = 60000;

// Keeps the bell's badge current while the app is open: once on mount, whenever the app returns to
// the foreground, and every minute while it stays there. Nothing runs in the background. Mounted
// once, by the signed-in layout. Failures are ignored; the next tick or screen focus tries again.
export default function useUnreadCountSync() {
  useEffect(() => {
    const refresh = () => { useNotificationStore.getState().refreshUnreadCount().catch(() => {}); };
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      refresh();
      timer ??= setInterval(refresh, INTERVAL_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };

    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()));
    return () => {
      stop();
      subscription.remove();
    };
  }, []);
}
