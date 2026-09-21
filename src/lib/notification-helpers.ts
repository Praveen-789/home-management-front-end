// Pure helpers for the notification inbox. No React or network code, so Node can test them
// directly. Only type imports cross into other modules, which Node strips before running.
import type { Notification, NotificationPage } from '@/api/notifications';
import type { Pagination } from '@/api/tasks';

// The backend's event list. A type this app does not know yet still renders, with a plain bell.
export const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED', 'TASK_COMPLETED', 'EXPENSE_ADDED', 'EXPENSE_UPDATED',
  'HOUSEHOLD_INVITATION', 'INVITATION_DECLINED', 'MEMBER_JOINED', 'MEMBER_REMOVED', 'CHAT_MESSAGE',
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];

const ICONS: Record<NotificationType, string> = {
  CHAT_MESSAGE: 'chat-outline',
  TASK_ASSIGNED: 'clipboard-account-outline',
  TASK_COMPLETED: 'clipboard-check-outline',
  EXPENSE_ADDED: 'cash-plus',
  EXPENSE_UPDATED: 'cash-sync',
  HOUSEHOLD_INVITATION: 'email-outline',
  INVITATION_DECLINED: 'email-remove-outline',
  MEMBER_JOINED: 'account-plus-outline',
  MEMBER_REMOVED: 'account-minus-outline',
};

export function notificationIcon(type: string): string {
  return ICONS[type as NotificationType] ?? 'bell-outline';
}

// Where tapping a notification leads, or null when it has nowhere to go: a row saved before the
// backend recorded targets, a deleted household, or a type this app does not know.
export type NotificationTarget =
  | { kind: 'chat'; householdId: string; conversationId: string }
  | { kind: 'task'; householdId: string; taskId: string }
  | { kind: 'expense'; householdId: string; expenseId: string }
  | { kind: 'household'; householdId: string }
  // The user is not a member yet, so there is no household to open: the inbox asks for an answer.
  | { kind: 'invitation'; householdId: string; invitationId: string };

export function notificationTarget(notification: { type: string; householdId: string | null; entityId: string | null }): NotificationTarget | null {
  const { type, householdId, entityId } = notification;
  if (!householdId) return null;
  if (type === 'CHAT_MESSAGE') return entityId ? { kind: 'chat', householdId, conversationId: entityId } : null;
  if (type.startsWith('TASK_')) return entityId ? { kind: 'task', householdId, taskId: entityId } : null;
  if (type.startsWith('EXPENSE_')) return entityId ? { kind: 'expense', householdId, expenseId: entityId } : null;
  if (type === 'HOUSEHOLD_INVITATION') return entityId ? { kind: 'invitation', householdId, invitationId: entityId } : null;
  if (type === 'MEMBER_JOINED' || type === 'INVITATION_DECLINED') return { kind: 'household', householdId };
  return null;
}

// "Just now", "5 min ago", "3 hr ago", "Yesterday", then a short date.
export function formatWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} hr ago`;
  if (minutes < 60 * 48) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

// The text on an unread badge. A badge is small, so big counts stop at "99+".
export function unreadLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

// ---- Inbox maintenance ----
// The inbox: the loaded list, if any, and the unread count behind the bell's badge. These functions
// return a new inbox and leave the given one untouched, which is what a Zustand `set` expects.

export type InboxFilter = 'all' | 'unread';
export type NotificationList = { filter: InboxFilter; notifications: Notification[]; pagination: Pagination };
export type Inbox = { list: NotificationList | null; unreadCount: number };

// Records a fetched page. Page 1, or any page for a different filter, replaces the list; a later
// page of the same filter appends to it. An unread page's total is also the exact unread count.
export function storeNotificationPage(inbox: Inbox, filter: InboxFilter, page: number, result: NotificationPage): Inbox {
  const current = inbox.list;
  const notifications = page > 1 && current && current.filter === filter
    ? mergeNotifications(current.notifications, result.notifications)
    : result.notifications;
  return {
    list: { filter, notifications, pagination: result.pagination },
    unreadCount: filter === 'unread' ? result.pagination.total : inbox.unreadCount,
  };
}

// Marks one notification read. It leaves an unread-only list. The count drops only when the row is
// known to be unread; a row the list never loaded leaves the count for the next refresh to correct.
export function applyRead(inbox: Inbox, notificationId: string): Inbox {
  const list = inbox.list;
  const found = list?.notifications.find((item) => item.id === notificationId);
  if (!list || !found || found.isRead) return inbox;
  const updated = list.filter === 'unread'
    ? { ...list, notifications: list.notifications.filter((item) => item.id !== notificationId), pagination: adjustTotal(list.pagination, -1) }
    : { ...list, notifications: list.notifications.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item)) };
  return { list: updated, unreadCount: Math.max(0, inbox.unreadCount - 1) };
}

export function applyReadAll(inbox: Inbox): Inbox {
  const list = inbox.list;
  if (!list) return { list, unreadCount: 0 };
  const updated = list.filter === 'unread'
    ? { ...list, notifications: [], pagination: { ...list.pagination, page: 1, total: 0, totalPages: 0 } }
    : { ...list, notifications: list.notifications.map((item) => (item.isRead ? item : { ...item, isRead: true })) };
  return { list: updated, unreadCount: 0 };
}

export function forgetNotification(inbox: Inbox, notificationId: string): Inbox {
  const list = inbox.list;
  const found = list?.notifications.find((item) => item.id === notificationId);
  if (!list || !found) return inbox;
  const updated = { ...list, notifications: list.notifications.filter((item) => item.id !== notificationId), pagination: adjustTotal(list.pagination, -1) };
  return { list: updated, unreadCount: found.isRead ? inbox.unreadCount : Math.max(0, inbox.unreadCount - 1) };
}

function adjustTotal(pagination: Pagination, delta: number): Pagination {
  const total = Math.max(0, pagination.total + delta);
  return { ...pagination, total, totalPages: Math.ceil(total / pagination.limit) };
}

// Appends a page, dropping any notification already shown. Offset paging repeats a row when a new
// notification arrived between requests and shifted the list.
function mergeNotifications(existing: Notification[], incoming: Notification[]): Notification[] {
  const incomingIds = new Set(incoming.map((notification) => notification.id));
  return [...existing.filter((notification) => !incomingIds.has(notification.id)), ...incoming];
}
