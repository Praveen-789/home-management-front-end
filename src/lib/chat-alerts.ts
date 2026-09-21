import { create } from 'zustand';
const seen = new Set<string>();
export const useChatAlert = create<{ alert: { conversationId: string; messageId: string } | null }>(() => ({ alert: null }));
export function showChatAlert(conversationId: string, messageId: string) {
  if (seen.has(messageId)) return;
  seen.add(messageId);
  if (seen.size > 200) seen.delete(seen.values().next().value!);
  useChatAlert.setState({ alert: { conversationId, messageId } });
}
export function dismissChatAlert(messageId: string) {
  if (useChatAlert.getState().alert?.messageId === messageId) useChatAlert.setState({ alert: null });
}
export function resetChatAlerts() { seen.clear(); useChatAlert.setState({ alert: null }); }
