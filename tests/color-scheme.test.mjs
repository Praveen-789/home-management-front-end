import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isThemePreference, resolveDark, THEME_PREFERENCES } from '../src/lib/color-scheme.ts';

test('system preference follows the device and treats unknown as light', () => {
  assert.equal(resolveDark('system', 'dark'), true);
  assert.equal(resolveDark('system', 'light'), false);
  assert.equal(resolveDark('system', null), false);
  assert.equal(resolveDark('system', undefined), false);
});

test('explicit preferences ignore the device setting', () => {
  for (const scheme of ['light', 'dark', null, undefined]) {
    assert.equal(resolveDark('dark', scheme), true, `dark with device ${scheme}`);
    assert.equal(resolveDark('light', scheme), false, `light with device ${scheme}`);
  }
});

test('only the three known preferences are accepted from storage', () => {
  for (const value of THEME_PREFERENCES) assert.equal(isThemePreference(value), true);
  for (const value of ['auto', 'Dark', '', null, undefined, 1]) assert.equal(isThemePreference(value), false);
});
