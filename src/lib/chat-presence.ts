import { create } from 'zustand';
import type { ChatPerson, Conversation } from '@/api/chat';

type Presence = { isOnline: boolean; lastSeenAt: string | null };
export type PresenceEvent = Presence & { userId: string; updatedAt: string };
type Entry = Presence & { revision: number; eventAt?: number };
export const usePresence = create<{ users: Record<string, Entry> }>(() => ({ users: {} }));
let revision = 0;
let epoch = 0;
export const presenceBoundary = () => ({ revision, epoch });
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function isPresenceEvent(value: unknown): value is PresenceEvent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.userId === 'string' && v.userId.length > 0 && typeof v.isOnline === 'boolean' &&
    (v.lastSeenAt === null || timestamp(v.lastSeenAt)) && timestamp(v.updatedAt);
}
export function receivePresence(event: PresenceEvent) {
  usePresence.setState(state => {
    const previous = state.users[event.userId];
    const eventAt = Date.parse(event.updatedAt);
    if (previous?.eventAt !== undefined && eventAt < previous.eventAt) return state;
    return { users: { ...state.users, [event.userId]: {
      isOnline: event.isOnline, lastSeenAt: event.lastSeenAt, eventAt, revision: ++revision,
    } } };
  });
}
// A REST response cannot overwrite a socket event received after its request started.
// Epochs reject responses from a previous connection or signed-in session.
export function receivePresenceSnapshot(people: ChatPerson[], boundary: ReturnType<typeof presenceBoundary>) {
  if (boundary.epoch !== epoch) return;
  usePresence.setState(state => {
    const users = { ...state.users };
    for (const person of people) {
      if (typeof person.isOnline !== 'boolean' || users[person.id]?.revision > boundary.revision) continue;
      users[person.id] = { isOnline: person.isOnline,
        lastSeenAt: timestamp(person.lastSeenAt) ? person.lastSeenAt : null,
        revision: ++revision, eventAt: users[person.id]?.eventAt };
    }
    return { users };
  });
}
export function resetPresence() { epoch++; revision = 0; usePresence.setState({ users: {} }); }
export function presenceLabel(conversation: Pick<Conversation, 'type' | 'participants'>,
  userId: string, users: Record<string, Presence>, connected: boolean): string | null {
  if (!connected) return null;
  const others = conversation.participants.filter(p => p.id !== userId);
  if (conversation.type === 'HOUSEHOLD') {
    const online = others.filter(p => users[p.id]?.isOnline).length;
    return online ? `${online} online` : null;
  }
  const peer = others[0];
  const status = peer && users[peer.id];
  if (!status) return null;
  if (status.isOnline) return 'Online';
  if (!status.lastSeenAt || !Number.isFinite(Date.parse(status.lastSeenAt))) return null;
  return `Last seen ${new Date(status.lastSeenAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })}`;
}
