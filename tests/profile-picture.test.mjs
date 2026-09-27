import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { initials, largePictureUrl, PROFILE_UPLOAD_SIDE, PROFILE_VIEW_SIDE, uploadSize } from '../src/lib/images.ts';
import { canChangePicture } from '../src/lib/household-permissions.ts';

const me = { id: 'me', name: 'Praveen Kumar', email: 'me@example.com', avatarUrl: null };
const pictured = { ...me, avatarUrl: 'https://res.cloudinary.com/demo/image/upload/avatar-1' };
const file = { uri: 'file:///cache/photo.jpg', name: 'photo.jpg', type: 'image/jpeg' };

// Loads the real auth store with fake storage, network and zustand, so its picture actions can be
// followed step by step. `profile` is what the backend answers with.
function authStore({ saved = { token: 'session-token', user: me }, profile = pictured, platform = 'android', failUpload = false } = {}) {
  const calls = [];
  const storage = new Map(saved ? [['homehub-session', JSON.stringify(saved)]] : []);
  let state = {};
  const deps = {
    '@/lib/push-registration': { unregisterPush: async () => {} },
    '@/api/token': { tokenExpiresAt: () => Date.now() + 60_000 },
    'expo-secure-store': {
      getItemAsync: async key => storage.get(key) ?? null,
      setItemAsync: async (key, value) => { calls.push(['save', key]); storage.set(key, value); },
      deleteItemAsync: async key => { storage.delete(key); },
    },
    'react-native': { Platform: { OS: platform } },
    zustand: { create: factory => { const api = factory(update => { state = { ...state, ...update }; }, () => state); state = { ...api }; return { getState: () => state }; } },
    '@/api/auth': { isSession: value => !!value?.token && !!value?.user?.id, SESSION_STORAGE_KEY: 'homehub-session' },
    '@/api/images': {
      uploadWithTicket: async (token, path, chosen) => { calls.push(['upload', token, path, chosen]); if (failUpload) throw new Error('Cannot reach the photo service.'); return { publicId: 'homehub/users/me/new-id' }; },
    },
    '@/api/profile': {
      AVATAR_UPLOADS_PATH: '/users/me/avatar/uploads',
      getProfile: async token => { calls.push(['profile', token]); return profile; },
      setAvatar: async (token, publicId) => { calls.push(['set', token, publicId]); return profile; },
      removeAvatar: async token => { calls.push(['remove', token]); return { ...profile, avatarUrl: null }; },
    },
  };
  const source = readFileSync(new URL('../src/stores/auth-store.ts', import.meta.url), 'utf8');
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  const exports = {};
  new Function('require', 'exports', js)(name => { if (!(name in deps)) throw new Error('Unmocked: ' + name); return deps[name]; }, exports);
  const store = exports.useAuthStore;
  return { store, calls, storage, of: kind => calls.filter(call => call[0] === kind), session: () => store.getState().session };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('initials stand in for a missing picture', () => {
  assert.equal(initials('Praveen Kumar'), 'PK');
  assert.equal(initials('  asha  '), 'A');
  assert.equal(initials('Ravi Kumar Sharma'), 'RK');
  assert.equal(initials('😀 smile'), '😀S'); // an emoji stays in one piece
  assert.equal(initials('élodie'), 'É');
  assert.equal(initials(''), '?');
  assert.equal(initials('   '), '?');
});

test('a profile picture is uploaded much smaller than a task photo', () => {
  assert.equal(PROFILE_UPLOAD_SIDE, 1024);
  assert.deepEqual(uploadSize(3000, 3000, PROFILE_UPLOAD_SIDE), { width: 1024, height: null });
  assert.deepEqual(uploadSize(1200, 1600, PROFILE_UPLOAD_SIDE), { width: null, height: 1024 });
  assert.equal(uploadSize(1024, 800, PROFILE_UPLOAD_SIDE), null);
  // The same picture is left alone under the ordinary photo limit.
  assert.equal(uploadSize(1200, 1600), null);
  // Sharp in the viewer means the upload is at least as large as what the viewer asks for.
  assert.ok(PROFILE_UPLOAD_SIDE >= PROFILE_VIEW_SIDE);
});

test('the viewer asks for a larger copy of the same crop, and leaves other URLs alone', () => {
  const base = 'https://res.cloudinary.com/demo/image/upload';
  // The exact shapes the backend builds for a person and for a household.
  assert.equal(largePictureUrl(`${base}/c_fill,g_face,w_400,h_400,f_auto,q_auto/homehub/users/u/abc`),
    `${base}/c_fill,g_face,w_1000,h_1000,f_auto,q_auto/homehub/users/u/abc`);
  assert.equal(largePictureUrl(`${base}/c_fill,g_auto,w_400,h_400,f_auto,q_auto/homehub/households/h/picture/abc`),
    `${base}/c_fill,g_auto,w_1000,h_1000,f_auto,q_auto/homehub/households/h/picture/abc`);
  // Anything else comes back untouched, so the viewer still shows the small picture.
  for (const url of ['https://example.com/me.jpg', `${base}/f_auto,q_auto/homehub/households/h/abc`, '']) assert.equal(largePictureUrl(url), url);
  // A public ID that happens to contain the size text is not rewritten.
  const tricky = `${base}/c_fill,g_face,w_400,h_400,f_auto,q_auto/homehub/users/w_400,h_400/abc`;
  assert.equal(largePictureUrl(tricky), `${base}/c_fill,g_face,w_1000,h_1000,f_auto,q_auto/homehub/users/w_400,h_400/abc`);
});

test('only owners and admins may change the household picture', () => {
  assert.equal(canChangePicture('OWNER'), true);
  assert.equal(canChangePicture('ADMIN'), true);
  assert.equal(canChangePicture('MEMBER'), false);
});

test('changing the avatar uploads to the user\'s own folder, then saves the backend\'s answer', async () => {
  const f = authStore();
  await f.store.getState().restoreSession();
  await settle();
  f.calls.length = 0;
  await f.store.getState().changeAvatar(file);
  assert.deepEqual(f.calls.map(call => call[0]), ['upload', 'set', 'save']);
  assert.deepEqual(f.of('upload')[0], ['upload', 'session-token', '/users/me/avatar/uploads', file]);
  assert.deepEqual(f.of('set')[0], ['set', 'session-token', 'homehub/users/me/new-id']);
  // The token is untouched, so nothing that watches for a sign-in or sign-out reacts.
  assert.deepEqual(f.session(), { token: 'session-token', user: pictured });
  assert.deepEqual(JSON.parse(f.storage.get('homehub-session')), { token: 'session-token', user: pictured });
});

test('removing the avatar saves the cleared profile', async () => {
  const f = authStore({ saved: { token: 'session-token', user: pictured } });
  await f.store.getState().restoreSession();
  await f.store.getState().removeAvatar();
  assert.equal(f.of('remove').length, 1);
  assert.equal(f.session().user.avatarUrl, null);
  assert.equal(JSON.parse(f.storage.get('homehub-session')).user.avatarUrl, null);
});

test('a failed upload changes nothing and reports why', async () => {
  const f = authStore({ failUpload: true });
  await f.store.getState().restoreSession();
  await settle();
  await assert.rejects(f.store.getState().changeAvatar(file), /Cannot reach the photo service/);
  assert.equal(f.of('set').length, 0);
  // Restoring already refreshed the profile once; the failed upload saved nothing more.
  assert.equal(f.of('save').length, 1);
});

test('opening the app refreshes the saved profile, so a picture set on another phone appears', async () => {
  const f = authStore();
  await f.store.getState().restoreSession();
  // The app is ready with the saved details before the network answers.
  assert.equal(f.store.getState().ready, true);
  await settle();
  assert.deepEqual(f.of('profile'), [['profile', 'session-token']]);
  assert.equal(f.session().user.avatarUrl, pictured.avatarUrl);
});

test('an answer for someone else, or after signing out, is ignored', async () => {
  const f = authStore();
  await f.store.getState().restoreSession();
  await settle();
  await f.store.getState().updateUser({ ...pictured, id: 'someone-else', name: 'Intruder' });
  assert.equal(f.session().user.name, 'Praveen Kumar');
  await f.store.getState().logout();
  await f.store.getState().updateUser(pictured);
  assert.equal(f.session(), null);
  assert.equal(f.storage.has('homehub-session'), false);
});

test('picture actions need a signed-in user', async () => {
  const signedOut = authStore({ saved: null });
  await signedOut.store.getState().restoreSession();
  await assert.rejects(signedOut.store.getState().changeAvatar(file), /session has expired/);
  await assert.rejects(signedOut.store.getState().removeAvatar(), /session has expired/);
  assert.equal(signedOut.calls.length, 0);
});
