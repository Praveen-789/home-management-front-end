import { requireOptionalNativeModule } from 'expo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { handleChatAction } from '@/lib/chat-notification-actions';
import { presentChatDelivery } from '@/lib/chat-notification-delivery';

const TASK = 'homehub-chat-notification-actions';

// When the app is closed or in the background, Android delivers a Reply or Mark as read press by
// starting this bundle with no screen mounted. No component ever runs, so the task has to be
// defined while the bundle loads. That is why index.ts imports this file before the router.
// iOS never runs this task for a button press, so it is Android only.
//
// A development build made before expo-task-manager was installed lacks its native half, and a
// plain import would crash that build on launch. It is loaded only when the native half exists.
// Data-only chat delivery requires this native module; older builds must be rebuilt.
if (Platform.OS === 'android' && requireOptionalNativeModule('ExpoTaskManager')) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK, async ({ data }) => {
    try {
      await handleChatAction(data);
      await presentChatDelivery(data);
      return Notifications.BackgroundNotificationTaskResult.NoData;
    } catch {
      console.warn('[notifications] Could not process background chat notification.');
      return Notifications.BackgroundNotificationTaskResult.Failed;
    }
  });
  void Notifications.registerTaskAsync(TASK).catch(() => {
    console.warn('[notifications] Could not register chat notification task. Reopen the app and check the native build.');
  });
}
