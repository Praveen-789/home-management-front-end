import { router } from 'expo-router';
import { Portal, Snackbar } from 'react-native-paper';
import useChatSync from '@/hooks/use-chat-sync';
import usePushNotifications from '@/hooks/use-push-notifications';
import { useChatAlert } from '@/lib/chat-alerts';
export default function ChatRuntime() {
  useChatSync();
  usePushNotifications();
  const alert = useChatAlert(s => s.alert);
  return <Portal><Snackbar visible={!!alert} duration={5000} onDismiss={() => useChatAlert.setState({ alert: null })}
    action={{ label: 'Open', onPress: () => {
      if (alert) router.push({ pathname: '/chats/[conversationId]', params: { conversationId: alert.conversationId } });
      useChatAlert.setState({ alert: null });
    } }}>You have a new chat message</Snackbar></Portal>;
}
