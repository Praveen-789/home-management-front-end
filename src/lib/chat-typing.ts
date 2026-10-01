import { create } from 'zustand';

// "Ravi is typing…". The backend stores nothing: while someone types, their phone says so at most
// every few seconds, and each mark fades on its own once the reports stop or their message arrives.
export const TYPING_REPORT_EVERY = 3000;
// The report interval plus room for a slow network, so a steady typist never flickers.
export const TYPING_SHOWN_FOR = 5000;

// conversationId → userId → name of everyone typing there now, in the order they started.
export const useTyping = create<{ typing: Record<string, Record<string, string>> }>(() => ({ typing: {} }));
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function setTypist(conversationId: string, userId: string, name: string | null) {
  const key = conversationId + '\n' + userId;
  clearTimeout(timers.get(key));
  timers.delete(key);
  useTyping.setState(({ typing }) => {
    const people = { ...typing[conversationId] };
    if (name === null) delete people[userId];
    else people[userId] = name;
    return { typing: { ...typing, [conversationId]: people } };
  });
  if (name !== null) timers.set(key, setTimeout(() => setTypist(conversationId, userId, null), TYPING_SHOWN_FOR));
}
export function receiveTyping(conversationId: string, userId: string, name: string) { setTypist(conversationId, userId, name); }
// Their message has arrived, so they are no longer typing it.
export function stopTyping(conversationId: string, userId: string) {
  if (useTyping.getState().typing[conversationId]?.[userId] !== undefined) setTypist(conversationId, userId, null);
}

let reporter: ((conversationId: string) => void) | null = null;
const reported = new Map<string, number>();
// The chat socket hands over how to reach the backend for as long as the session lasts.
export function setTypingReporter(report: (conversationId: string) => void) { reporter = report; }
// Called on every keystroke; at most one report per chat goes out every few seconds.
export function reportTyping(conversationId: string) {
  const now = Date.now();
  if (!reporter || now - (reported.get(conversationId) ?? -Infinity) < TYPING_REPORT_EVERY) return;
  reported.set(conversationId, now);
  reporter(conversationId);
}
export function resetTyping() {
  timers.forEach(clearTimeout);
  timers.clear(); reported.clear(); reporter = null;
  useTyping.setState({ typing: {} });
}
