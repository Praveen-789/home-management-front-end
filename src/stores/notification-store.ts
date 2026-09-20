import { create } from 'zustand';
import { isApiError } from '@/api/client';
import * as notificationsApi from '@/api/notifications';
import { applyRead, applyReadAll, forgetNotification, storeNotificationPage, type Inbox, type InboxFilter } from '@/lib/notification-helpers';
import { useAuthStore } from '@/stores/auth-store';
import { withToken } from '@/stores/with-token';

export const PAGE_SIZE = 20;

type NotificationState = Inbox & {
  loadNotifications: (filter: InboxFilter, page?: number) => Promise<void>;
  // The one way the badge is brought up to date. The foreground timer calls it today; a push or
  // socket event can call it later without any other change.
  refreshUnreadCount: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  reset: () => void;
};

const initialState: Inbox = { list: null, unreadCount: 0 };

// The newest list and count requests, so a slow reply cannot overwrite newer data. `countVersion`
// also moves on every local change, which makes a count fetched before that change stale.
let latestList = 0;
let countVersion = 0;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  ...initialState,
  loadNotifications: async (filter, page = 1) => {
    const requestId = ++latestList;
    const version = ++countVersion;
    const query = { page, limit: PAGE_SIZE, ...(filter === 'unread' ? { unread: true } : {}) };
    const result = await withToken((token) => notificationsApi.listNotifications(token, query));
    if (latestList !== requestId) return;
    const next = storeNotificationPage(get(), filter, page, result);
    // The page's count is only trusted if nothing changed the count while it was in flight.
    set(countVersion === version ? next : { list: next.list });
  },
  refreshUnreadCount: async () => {
    const version = ++countVersion;
    const unreadCount = await withToken(notificationsApi.getUnreadCount);
    if (countVersion === version) set({ unreadCount });
  },
  // Shown as read at once, because a tap usually navigates away before the reply arrives. A
  // failure puts the row back. A 404 means it was deleted elsewhere, so it leaves the list.
  markRead: async (notificationId) => {
    const before: Inbox = { list: get().list, unreadCount: get().unreadCount };
    countVersion++;
    set(applyRead(before, notificationId));
    try {
      await withToken((token) => notificationsApi.markNotificationRead(token, notificationId));
    } catch (error) {
      countVersion++;
      const gone = isApiError(error) && error.status === 404;
      set(gone ? forgetNotification(before, notificationId) : before);
      if (!gone) throw error;
    }
  },
  markAllRead: async () => {
    await withToken(notificationsApi.markAllNotificationsRead);
    countVersion++;
    set(applyReadAll(get()));
  },
  deleteNotification: async (notificationId) => {
    try {
      await withToken((token) => notificationsApi.deleteNotification(token, notificationId));
    } catch (error) {
      // Already deleted elsewhere: the goal is met, so drop the row instead of failing.
      if (!(isApiError(error) && error.status === 404)) throw error;
    }
    countVersion++;
    set(forgetNotification(get(), notificationId));
  },
  reset: () => {
    latestList++;
    countVersion++;
    set(initialState);
  },
}));

// The inbox belongs to one user; drop it on sign-out or when a different user signs in.
useAuthStore.subscribe((state, previous) => {
  if (state.session?.user.id !== previous.session?.user.id) useNotificationStore.getState().reset();
});
