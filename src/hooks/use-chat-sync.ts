import { useEffect } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';
import { API_URL } from '@/api/client';
import { isChatClear, isMessage, isMessageDeletion, isRecord } from '@/api/chat';
import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { useNotificationStore } from '@/stores/notification-store';
import { dismissChatAlert, resetChatAlerts, showChatAlert } from '@/lib/chat-alerts';

// Temporary learning logs: set to false when finished debugging.
const DEBUG_SOCKET = __DEV__;

export default function useChatSync() {
  const token = useAuthStore(s => s.session?.token);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const socket = io(API_URL.replace(/\/api\/?$/, ''), { auth: { token }, autoConnect: false });
    if (DEBUG_SOCKET) {
      // Log selected details instead of the entire socket, which contains the auth token.
      console.log('[socket] created', { connected: socket.connected });
      socket.on('connect', () => console.log('[socket] connected', {
        id: socket.id,
        transport: socket.io.engine.transport.name,
      }));
      socket.on('disconnect', reason => console.log('[socket] disconnected', reason));
      socket.on('connect_error', error => console.log('[socket] connection error', error.message));
      socket.onAny((event, ...args) => console.log('[socket] received', event, ...args));
    }
    const valid = () => alive && useAuthStore.getState().session?.token === token;
    const refresh = () => {
      if (!valid() || AppState.currentState !== 'active') return;
      const state = useChatStore.getState();
      if (state.activeId) void state.sync(state.activeId).catch(() => {});
      for (const householdId of Object.keys(state.lists)) void state.loadList(householdId).catch(() => {});
    };
    socket.on('connect', () => { if (valid()) { useChatStore.setState({ connected: true }); refresh(); } });
    socket.on('disconnect', () => { if (valid()) useChatStore.setState({ connected: false }); });
    socket.on('connect_error', () => { if (valid()) useChatStore.setState({ connected: false }); });
    socket.on('chat:message', (payload: unknown) => {
      if (!valid() || !isRecord(payload) || !isMessage(payload.message)) return;
      const state = useChatStore.getState();
      const hasSummary = Number.isSafeInteger(payload.unreadCount) && Number.isSafeInteger(payload.lastReadSequence) &&
        typeof payload.muted === 'boolean';
      state.receive(payload.message, hasSummary ? {
        unreadCount: payload.unreadCount as number,
        lastReadSequence: payload.lastReadSequence as number,
        muted: payload.muted as boolean,
      } : undefined);
      void useNotificationStore.getState().refreshUnreadCount().catch(() => {});
      if (payload.alert === true && payload.muted !== true && payload.message.senderId !== useAuthStore.getState().session?.user.id &&
        AppState.currentState === 'active' && state.activeId !== payload.message.conversationId) {
        showChatAlert(payload.message.conversationId, payload.message.id);
      }
    });
    // A batch arrives as one event, so the bell's count is refreshed once however many were deleted.
    socket.on('chat:messages-deleted', (payload: unknown) => {
      if (!valid() || !isMessageDeletion(payload)) return;
      useChatStore.getState().receiveDeletion(payload);
      payload.messageIds.forEach(dismissChatAlert);
      void useNotificationStore.getState().refreshUnreadCount().catch(() => {});
    });
    // This user cleared the chat on another of their devices.
    socket.on('chat:cleared', (payload: unknown) => {
      if (!valid() || !isChatClear(payload)) return;
      useChatStore.getState().receiveClear(payload);
      void useNotificationStore.getState().refreshUnreadCount().catch(() => {});
    });
    socket.on('chat:read', (payload: unknown) => {
      if (!valid() || !isRecord(payload) || typeof payload.conversationId !== 'string' ||
        !Number.isSafeInteger(payload.lastReadSequence) || !Number.isSafeInteger(payload.unreadCount)) return;
      useChatStore.getState().receiveRead(payload.conversationId, payload.lastReadSequence as number, payload.unreadCount as number);
    });
    socket.on('chat:preferences', (payload: unknown) => {
      if (!valid() || !isRecord(payload) || typeof payload.conversationId !== 'string' || typeof payload.muted !== 'boolean') return;
      useChatStore.getState().receivePreferences(payload.conversationId, payload.muted);
    });
    // Connecting (initially or after a disconnect) is the recovery boundary. The REST calls fill
    // any sequence gap that occurred while live events were unavailable.
    const resume = () => {
      if (!valid()) return;
      if (socket.connected) refresh();
      else socket.connect();
    };
    if (AppState.currentState === 'active') resume();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') resume();
      else socket.disconnect();
    });
    return () => {
      if (DEBUG_SOCKET) console.log('[socket] cleanup');
      socket.offAny();
      alive = false; subscription.remove(); socket.removeAllListeners(); socket.disconnect();
      useChatStore.setState({ connected: false }); resetChatAlerts();
    };
  }, [token]);
}
