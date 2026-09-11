import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real hook with a minimal focus lifecycle and React hook adapter.
function mount(push = () => {}) {
  let focus, cleanup, disabled = false, focused = true;
  const exports = {};
  const react = {
    useRef: value => ({ current: value }),
    useState: value => [value, next => { disabled = next; }],
    useCallback: callback => callback,
  };
  const router = {
    router: { push },
    useNavigation: () => ({ isFocused: () => focused }),
    useFocusEffect: callback => { focus = callback; },
  };
  const source = ts.transpileModule(readFileSync(new URL('../src/hooks/use-push-once.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => name === 'react' ? react : name === 'expo-router' ? router : { beginNavigationTiming() {}, cancelNavigationTiming() {} } });
  const hook = exports.default();
  cleanup = focus();
  return { ...hook, disabled: () => disabled, blur: () => { focused = false; cleanup(); }, focus: () => { focused = true; cleanup = focus(); } };
}

test('same-frame repeated taps and different controls dispatch only one push', () => {
  const calls = [];
  const screen = mount(href => calls.push(href));
  screen.push('/tasks/1');
  screen.push('/tasks/1');
  screen.push('/tasks/create');
  assert.deepEqual(calls, ['/tasks/1']);
  assert.equal(screen.disabled(), true);
});

test('stale taps after blur are ignored and returning restores navigation', () => {
  const calls = [];
  const screen = mount(href => calls.push(href));
  screen.push('/tasks/1');
  screen.blur();
  screen.push('/tasks/2');
  screen.focus();
  assert.equal(screen.disabled(), false);
  screen.push('/tasks/2');
  assert.deepEqual(calls, ['/tasks/1', '/tasks/2']);
});

test('a synchronous router failure releases the lock for a retry', () => {
  let calls = 0;
  const screen = mount(() => { if (++calls === 1) throw new Error('Route failed'); });
  assert.throws(() => screen.push('/tasks/1'), /Route failed/);
  assert.equal(screen.disabled(), false);
  screen.push('/tasks/1');
  assert.equal(calls, 2);
});
