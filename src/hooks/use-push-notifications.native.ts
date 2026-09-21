import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { chatNotificationTarget, replyFailureTarget } from '@/lib/chat-helpers';
import { handleChatAction } from '@/lib/chat-notification-actions';
import { clearReadChatNotifications } from '@/lib/chat-notification-delivery';
import { registerPush } from '@/lib/push-registration';
import { showChatAlert } from '@/lib/chat-alerts';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { useNotificationStore } from '@/stores/notification-store';

Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const data = notification.request.content.data;
    if (data?.delivery === 'chat_local_v1') return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
    const chat = chatNotificationTarget(data);
    const show = !!useAuthStore.getState().session && (!chat || AppState.currentState !== 'active');
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});
export default function usePushNotifications() {
  const token = useAuthStore(s => s.session?.token);
  const userId = useAuthStore(s => s.session?.user.id);
  useEffect(() => {
    if (!token || !userId) return;
    let alive = true;
    const current = () => alive && useAuthStore.getState().session?.token === token;
    const register = (devicePushToken?: Notifications.DevicePushToken) => {
      if (current()) void registerPush(token, false, current, userId, devicePushToken);
    };
    register();
    const cleanup = () => {
      if (!current()) return;
      for (const chat of Object.values(useChatStore.getState().conversations)) {
        if (chat.lastReadSequence > 0) void clearReadChatNotifications(userId, chat.id, chat.lastReadSequence).catch(() => {});
      }
    };
    cleanup();
    const readChanges = useChatStore.subscribe((state, previous) => {
      if (!current()) return;
      for (const chat of Object.values(state.conversations)) {
        if (chat.lastReadSequence > 0 && (chat.lastReadSequence !== previous.conversations[chat.id]?.lastReadSequence ||
          (state.activeId === chat.id && previous.activeId !== chat.id))) {
          void clearReadChatNotifications(userId, chat.id, chat.lastReadSequence).catch(() => {});
        }
      }
    });
    const app = AppState.addEventListener('change', state => { if (state === 'active') register(); });
    const tokenListener = Notifications.addPushTokenListener(register);
    let lastResponse = '';
    const open = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
        // Reply or Mark as read, pressed while the app is running. It is handled in place, with no
        // navigation. A repeated delivery is harmless because the action is idempotent.
        if (!current()) return;
        try { Notifications.clearLastNotificationResponse(); } catch { /* best effort */ }
        void handleChatAction(response);
        return;
      }
      const data = response.notification.request.content.data;
      const id = chatNotificationTarget(data) ?? replyFailureTarget(data);
      const requestId = response.notification.request.identifier;
      if (!id || !current() || lastResponse === requestId) return;
      lastResponse = requestId;
      try { Notifications.clearLastNotificationResponse(); } catch { /* best effort */ }
      // The destination fetches access before rendering content, including a removed household.
      router.push({ pathname: '/chats/[conversationId]', params: { conversationId: id } });
    };
    const tap = Notifications.addNotificationResponseReceivedListener(open);
    // Cold start: the tap that launched the app arrived before this listener existed.
    try {
      const launchResponse = Notifications.getLastNotificationResponse();
      if (launchResponse) open(launchResponse);
    } catch { /* best effort */ }
    const received = Notifications.addNotificationReceivedListener(notification => {
      if (!current()) return;
      const data = notification.request.content.data;
      const id = chatNotificationTarget(data);
      void useNotificationStore.getState().refreshUnreadCount().catch(() => {});
      if (id) {
        const read = useChatStore.getState().conversations[id]?.lastReadSequence;
        if (read && typeof data?.sequence === 'number' && data.sequence <= read) { cleanup(); return; }
        void useChatStore.getState().sync(id).catch(() => {});
        if (AppState.currentState === 'active' && useChatStore.getState().activeId !== id) {
          showChatAlert(id, typeof data?.messageId === 'string' ? data.messageId : notification.request.identifier);
        }
      }
    });
    return () => { alive = false; readChanges(); app.remove(); tokenListener.remove(); tap.remove(); received.remove(); };
  }, [token, userId]);
}
