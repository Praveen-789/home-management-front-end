// This import comes first on purpose. Android can start the bundle with no screen at all, only to
// deliver a Reply or Mark as read press from a notification, and the task must exist by then.
import '@/lib/chat-notification-task';
import 'expo-router/entry';
