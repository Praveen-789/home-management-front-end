import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function fixture({ allowed = true, current = () => true, delayedToken } = {}) {
  const calls = [], saved = new Map();
  const state = {};
  const deps = {
    // __esModule stops TypeScript's default-import interop from wrapping this mock a second time.
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project-test' } } } } },
    'expo-device': { isDevice: true },
    'expo-notifications': {
      AndroidImportance: { HIGH: 4 },
      setNotificationChannelAsync: async (id, config) => { calls.push(['channel', id, config.importance]); },
      getPermissionsAsync: async () => ({ granted: allowed, canAskAgain: true }),
      requestPermissionsAsync: async () => { calls.push(['permission']); return { granted: true }; },
      getExpoPushTokenAsync: async ({ projectId, devicePushToken }) => { calls.push(['token', projectId, devicePushToken]); if (delayedToken) await delayedToken; return { data: 'ExpoPushToken[test]' }; },
      dismissAllNotificationsAsync: async () => { calls.push(['dismiss']); },
      clearLastNotificationResponse: () => {},
    },
    'expo-secure-store': {
      setItemAsync: async (key, value) => { saved.set(key, value); },
      getItemAsync: async key => saved.get(key),
      deleteItemAsync: async key => { saved.delete(key); },
    },
    'react-native': { Platform: { OS: 'android' }, Linking: { openSettings: async () => {} } },
    '@/api/client': {
      apiRequest: async (path, options) => { calls.push([options.method, path, options.body]); return { device: { id: 'device-1' } }; },
      isApiError: e => e?.name === 'ApiError',
    },
    '@/api/chat': { isRecord: v => !!v && typeof v === 'object' },
    '@/lib/chat-notification-actions': { registerChatCategory: async () => { calls.push(['category']); } },
    '@/lib/push-state': { usePushState: { setState: values => Object.assign(state, values) } },
  };
  const source = readFileSync(new URL('../src/lib/push-registration.native.ts', import.meta.url), 'utf8');
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  const exports = {};
  new Function('require', 'exports', js)(name => { if (!(name in deps)) throw new Error('Unmocked: ' + name); return deps[name]; }, exports);
  return { ...exports, calls, saved, state, current };
}
test('background setup never prompts for permission and does not register a denied phone', async () => {
  const f = fixture({ allowed: false });
  await f.registerPush('session', false, f.current, 'user-1');
  // The Reply and Mark as read buttons need no permission of their own, so they are always registered.
  assert.deepEqual(f.calls.map(c => c[0]), ['channel', 'category']);
  assert.equal(f.state.enabled, false);
});
test('explicit enable creates the Android chat channel before permission and registers the Expo token', async () => {
  const f = fixture({ allowed: false });
  await f.registerPush('session', true, f.current, 'user-1');
  assert.deepEqual(f.calls.map(c => c[0]), ['channel', 'category', 'permission', 'token', 'POST']);
  assert.equal(f.calls[3][1], 'project-test');
  assert.deepEqual(f.calls[4], ['POST', '/devices', { token: 'ExpoPushToken[test]', platform: 'android' }]);
  assert.equal(f.state.enabled, true);
  assert.deepEqual(JSON.parse(f.saved.get('homehub-push-device')), { deviceId: 'device-1', expoToken: 'ExpoPushToken[test]', ownerId: 'user-1' });
});
test('an unchanged token is not posted to the backend again', async () => {
  const f = fixture();
  await f.registerPush('session', false, f.current, 'user-1');
  await f.registerPush('session', false, f.current, 'user-1');
  assert.equal(f.calls.filter(call => call[0] === 'POST').length, 1);
});
test('a native token listener forwards its token instead of fetching it recursively', async () => {
  const f = fixture();
  const native = { type: 'fcm', data: 'native-token' };
  await f.registerPush('session', false, f.current, 'user-1', native);
  assert.equal(f.calls.find(call => call[0] === 'token')[2], native);
});
test('sign-out waits for in-flight registration, revokes the backend device and clears local notifications', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const f = fixture({ delayedToken: gate });
  const registering = f.registerPush('session', false, f.current, 'user-1');
  const unregistering = f.unregisterPush('session');
  release();
  await Promise.all([registering, unregistering]);
  assert.deepEqual(f.calls.filter(c => ['POST', 'DELETE'].includes(c[0])).map(c => c.slice(0, 2)), [['POST', '/devices'], ['DELETE', '/devices/device-1']]);
  assert.equal(f.saved.size, 0);
  assert.equal(f.state.enabled, false);
});
test('a session change during token lookup prevents registering the phone for the old account', async () => {
  let release, current = true;
  const f = fixture({ delayedToken: new Promise(r => { release = r; }), current: () => current });
  const work = f.registerPush('old-session', false, f.current, 'user-1');
  await new Promise(r => setImmediate(r));
  current = false; release(); await work;
  assert.equal(f.calls.some(c => c[0] === 'POST'), false);
});
