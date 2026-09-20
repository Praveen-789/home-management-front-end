import { apiRequest } from '@/api/client';
import { isPagination, type Pagination } from '@/api/tasks';

// A notification as the inbox endpoint returns it. `type` stays a plain string so an event the
// backend adds later still loads. `householdId` and `entityId` say where tapping leads: entityId is
// a task or expense ID depending on the type, and either may be null.
export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  householdId: string | null;
  entityId: string | null;
  createdAt: string;
};

export type NotificationPage = { notifications: Notification[]; pagination: Pagination };
// `unread` true lists unread only, false read only; left out lists both.
export type NotificationListQuery = { page?: number; limit?: number; unread?: boolean };

const unexpectedResponse = () => new Error('Unexpected response from HomeHub. Please try again.');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isOptionalId = (value: unknown): value is string | null | undefined => value === undefined || value === null || typeof value === 'string';

// A notification as it arrives. A backend from before targets existed leaves both IDs out.
type RawNotification = Omit<Notification, 'householdId' | 'entityId'> & { householdId?: string | null; entityId?: string | null };

function isRawNotification(value: unknown): value is RawNotification {
  return isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.type === 'string' &&
    typeof value.title === 'string' && typeof value.message === 'string' && typeof value.isRead === 'boolean' &&
    isOptionalId(value.householdId) && isOptionalId(value.entityId) && typeof value.createdAt === 'string';
}

// Missing IDs become null, which the inbox already treats as "nowhere to open".
const toNotification = (raw: RawNotification): Notification => ({ ...raw, householdId: raw.householdId ?? null, entityId: raw.entityId ?? null });

const notificationPath = (notificationId: string) => `/notifications/${encodeURIComponent(notificationId)}`;

// React Native's URLSearchParams is incomplete, so the query string is assembled by hand.
function queryString(query: NotificationListQuery): string {
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function listNotifications(token: string, query: NotificationListQuery = {}): Promise<NotificationPage> {
  const data = await apiRequest(`/notifications${queryString(query)}`, { token });
  const notifications = isRecord(data) ? data.notifications : undefined;
  const pagination = isRecord(data) ? data.pagination : undefined;
  if (!Array.isArray(notifications) || !notifications.every(isRawNotification) || !isPagination(pagination)) throw unexpectedResponse();
  return { notifications: notifications.map(toNotification), pagination };
}

export async function getUnreadCount(token: string): Promise<number> {
  const data = await apiRequest('/notifications/unread-count', { token });
  const count = isRecord(data) ? data.unreadCount : undefined;
  if (typeof count !== 'number') throw unexpectedResponse();
  return count;
}

// Succeeds for a notification that is already read.
export async function markNotificationRead(token: string, notificationId: string): Promise<void> {
  await apiRequest(`${notificationPath(notificationId)}/read`, { method: 'PATCH', token });
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  await apiRequest('/notifications/read-all', { method: 'PATCH', token });
}

export async function deleteNotification(token: string, notificationId: string): Promise<void> {
  await apiRequest(notificationPath(notificationId), { method: 'DELETE', token });
}
