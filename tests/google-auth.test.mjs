import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';

// Run the real helper with fake native modules; no device or Google account needed.
function load(file, modules, env = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', 'process', code)(name => {
    if (!(name in modules)) throw new Error('Native module unavailable: ' + name);
    return modules[name];
  }, exports, { env });
  return exports;
}
function nativeSetup({ response = { type: 'success', data: { idToken: 'google-token' } }, failure } = {}) {
  const calls = [];
  const google = {
    GoogleSignin: {
      configure: value => calls.push(['configure', value]),
      hasPlayServices: async () => calls.push(['play-services']),
      signOut: async () => calls.push(['sign-out']),
      signIn: async () => { if (failure) throw failure; return response; },
    },
    isCancelledResponse: result => result.type === 'cancelled',
    isErrorWithCode: error => typeof error?.code === 'string',
    statusCodes: { SIGN_IN_CANCELLED: 'cancelled', IN_PROGRESS: 'progress', PLAY_SERVICES_NOT_AVAILABLE: 'play-unavailable' },
  };
  const helper = load('../src/lib/google-signin.ts', {
    'react-native': { Platform: { OS: 'android' } },
    '@react-native-google-signin/google-signin': google,
  }, { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client' });
  return { ...helper, calls };
}
test('native chooser uses the Web client and returns only the Google ID token', async () => {
  const helper = nativeSetup();
  assert.equal(await helper.chooseGoogleAccount(), 'google-token');
  assert.deepEqual(helper.calls, [['configure', { webClientId: 'web-client', offlineAccess: false }], ['play-services'], ['sign-out']]);
});
test('both cancellation forms return null', async () => {
  assert.equal(await nativeSetup({ response: { type: 'cancelled' } }).chooseGoogleAccount(), null);
  assert.equal(await nativeSetup({ failure: { code: 'cancelled' } }).chooseGoogleAccount(), null);
});
test('missing module/configuration and unavailable Play services give actionable errors', async () => {
  const modules = { 'react-native': { Platform: { OS: 'android' } } };
  await assert.rejects(load('../src/lib/google-signin.ts', modules).chooseGoogleAccount(), /not configured/);
  await assert.rejects(load('../src/lib/google-signin.ts', modules, { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client' }).chooseGoogleAccount(), /development build/);
  await assert.rejects(nativeSetup({ failure: { code: 'play-unavailable' } }).chooseGoogleAccount(), /Google Play services/);
  await assert.rejects(nativeSetup({ response: { type: 'success', data: { idToken: null } } }).chooseGoogleAccount(), /Could not sign in/);
});
test('API uses public Google sign-in and authenticated account linking endpoints', async () => {
  const calls = [];
  const api = load('../src/api/auth.ts', { '@/api/client': { apiRequest: async (...args) => { calls.push(args); return {}; } } });
  await api.googleSignIn('id-token');
  await api.linkGoogleAccount('homehub-token', 'id-token', 'password');
  assert.deepEqual(calls, [
    ['/auth/google', { method: 'POST', body: { idToken: 'id-token' } }],
    ['/auth/google/link', { method: 'POST', token: 'homehub-token', body: { idToken: 'id-token', password: 'password' } }],
  ]);
});
test('Google login persists only HomeHub session and rejects invalid responses/storage failure', async () => {
  let result = { token: 'homehub-token', user: { id: 'u', name: 'User', email: 'u@example.com' }, idToken: 'must-not-save' };
  let failStorage = false;
  let state = {};
  const saved = [];
  const { useAuthStore: store } = load('../src/stores/auth-store.ts', {
    '@/api/token': { tokenExpiresAt: () => Date.now() + 10000 },
    'expo-secure-store': { setItemAsync: async (key, value) => { if (failStorage) throw new Error('storage'); saved.push(JSON.parse(value)); } },
    'react-native': { Platform: { OS: 'android' } },
    zustand: { create: factory => factory(update => Object.assign(state, update)) },
    '@/api/auth': { googleSignIn: async () => result, isSession: value => !!value?.token && !!value?.user },
  });
  await store.loginWithGoogle('google-token');
  assert.deepEqual(saved[0], { token: result.token, user: result.user });
  assert.deepEqual(state.session, saved[0]);
  state.session = null;
  result = {};
  await assert.rejects(store.loginWithGoogle('google-token'), /Unexpected login response/);
  assert.equal(state.session, null);
  result = saved[0];
  failStorage = true;
  await assert.rejects(store.loginWithGoogle('google-token'), /Could not save/);
  assert.equal(state.session, null);
});
