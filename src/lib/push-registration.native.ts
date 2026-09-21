import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';
import { apiRequest, isApiError } from '@/api/client';
import { isRecord } from '@/api/chat';
import { registerChatCategory } from '@/lib/chat-notification-actions';
import { usePushState } from '@/lib/push-state';

const key = 'homehub-push-device';
type SavedRegistration = { deviceId: string; expoToken: string; ownerId: string };
let queue: Promise<void> = Promise.resolve();
// Registration and sign-out are serialized: a late registration cannot recreate a logged-out device.
function serialized(action: () => Promise<void>) {
  const work = queue.then(action, action);
  queue = work.catch(() => {});
  return work;
}
function readRegistration(value: string | null): SavedRegistration | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) && typeof parsed.deviceId === 'string' && typeof parsed.expoToken === 'string' && typeof parsed.ownerId === 'string'
      ? { deviceId: parsed.deviceId, expoToken: parsed.expoToken, ownerId: parsed.ownerId }
      : null;
  } catch {
    // Older builds stored only the backend device ID. It remains usable for sign-out and will be
    // upgraded to the structured record after the next successful registration.
    return { deviceId: value, expoToken: '', ownerId: '' };
  }
}

export function registerPush(
  token: string,
  request: boolean,
  current: () => boolean,
  ownerId: string,
  devicePushToken?: Notifications.DevicePushToken,
): Promise<void> {
  return serialized(async () => {
    if (!current()) return;
    usePushState.setState({ busy: true, error: '' });
    try {
      if (!Device.isDevice) {
        usePushState.setState({ enabled: false, error: 'Use a physical phone to enable push notifications.' });
        return;
      }
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('chat', {
        // No `sound` key: a channel plays the phone's default sound. A string here is a bundled file name.
        name: 'Chat messages', importance: Notifications.AndroidImportance.HIGH,
      });
      // The phone stores the category, so the buttons show even when a push arrives with the app closed.
      await registerChatCategory();
      let permissions = await Notifications.getPermissionsAsync();
      if (!permissions.granted && request) {
        if (!permissions.canAskAgain) { await Linking.openSettings(); return; }
        permissions = await Notifications.requestPermissionsAsync();
      }
      if (!permissions.granted) {
        usePushState.setState({ enabled: false });
        return;
      }
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (typeof projectId !== 'string' || !projectId) throw new Error('Push notifications need an Expo project ID in the app configuration.');
      // A native-token listener must pass its token here. Fetching that native token again from
      // inside the listener fires the listener recursively on Android.
      const pushToken = await Notifications.getExpoPushTokenAsync({ projectId, ...(devicePushToken ? { devicePushToken } : {}) });
      if (!current()) return;
      const saved = readRegistration(await SecureStore.getItemAsync(key));
      if (saved?.expoToken === pushToken.data && saved.ownerId === ownerId) {
        usePushState.setState({ enabled: true });
        return;
      }
      const result = await apiRequest('/devices', { token, method: 'POST', body: { token: pushToken.data, platform: Platform.OS } });
      if (!isRecord(result) || !isRecord(result.device) || typeof result.device.id !== 'string') throw new Error('Could not register this phone.');
      await SecureStore.setItemAsync(key, JSON.stringify({ deviceId: result.device.id, expoToken: pushToken.data, ownerId } satisfies SavedRegistration));
      if (!current()) {
        await apiRequest('/devices/' + encodeURIComponent(result.device.id), { token, method: 'DELETE' }).catch(() => {});
        return;
      }
      usePushState.setState({ enabled: true });
    } catch {
      if (current()) usePushState.setState({ enabled: false, error: 'Could not enable notifications. Check your connection and retry.' });
    } finally { usePushState.setState({ busy: false }); }
  });
}
export function unregisterPush(token: string): Promise<void> {
  return serialized(async () => {
    const saved = readRegistration(await SecureStore.getItemAsync(key));
    if (saved) {
      try { await apiRequest('/devices/' + encodeURIComponent(saved.deviceId), { token, method: 'DELETE' }); }
      catch (error) {
        if (!isApiError(error) || ![401, 404].includes(error.status)) throw new Error('Could not disconnect notifications. Check your connection and try signing out again.');
      }
      await SecureStore.deleteItemAsync(key);
    }
    await Notifications.dismissAllNotificationsAsync();
    Notifications.clearLastNotificationResponse();
    usePushState.setState({ enabled: false, error: '' });
  });
}
