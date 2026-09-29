import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(
  new URL('../app/startupChrome.js', import.meta.url),
  'utf8',
)
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\n/gm, '')
  .replace('export function', 'function')
  .replace('export const LOADING_COVER_FAIL_OPEN_MS = 8000;\n\n', '');

function fixture({ failOpenMs = 8000 } = {}) {
  const timers = new Map();
  const listeners = new Map();
  const events = [];
  let restored;
  let nextTimer = 0;
  const controller = new AbortController();
  const loadingScreen = {
    classList: { add: (value) => events.push(`class:${value}`) },
    dataset: {},
    style: {},
    isConnected: true,
    setAttribute: (k, v) => events.push(`attr:${k}=${v}`),
    querySelector: () => null,
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    remove: () => events.push('removed'),
  };
  const context = {
    console,
    LOADING_COVER_FAIL_OPEN_MS: failOpenMs,
    setTimeout(fn, delay) {
      const id = ++nextTimer;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    dismissLoadingScreen(el) {
      events.push('dismiss');
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
      if (el.style) el.style.pointerEvents = 'none';
      el.remove?.();
    },
    installLoadingCoverGuard() {
      events.push('guard');
      return () => {};
    },
    initFirstRunExperience() {
      events.push('welcome');
      return { destroy: () => events.push('welcome:destroy') };
    },
    async initKeySetup() {
      return { destroy: () => events.push('settings:destroy') };
    },
  };
  vm.createContext(context);
  // Re-inject constant used by the function body after strip.
  vm.runInContext(
    `var LOADING_COVER_FAIL_OPEN_MS = ${failOpenMs};\n` + source,
    context,
  );
  const stop = context.startApplicationChrome({
    initializeSettings: context.initKeySetup,
    loadingScreen,
    styleManager: {
      initialRestorePromise: new Promise((resolve) => {
        restored = resolve;
      }),
    },
    dataManager: {},
    signal: controller.signal,
  });
  return {
    events,
    listeners,
    stop,
    restored,
    controller,
    loadingScreen,
    fire(delay) {
      for (const [id, task] of [...timers]) {
        if (task.delay === delay) {
          timers.delete(id);
          task.fn();
        }
      }
    },
    timers,
  };
}
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

test('welcome waits for restoration, minimum delay, and the cover transition', async () => {
  const f = fixture();
  f.fire(1000);
  await flush();
  assert.deepEqual(f.events, []);
  f.restored();
  await flush();
  assert.ok(f.events.includes('dismiss'));
  assert.ok(f.events.includes('class:hidden'));
  assert.ok(f.events.includes('guard'));
  f.fire(200);
  assert.ok(f.events.includes('welcome'));
  await f.stop();
  assert.ok(f.events.includes('welcome:destroy'));
  assert.ok(f.events.includes('settings:destroy'));
  assert.equal(f.timers.size, 0);
});

test('reduced motion uses the bounded fallback after the cover hides', async () => {
  const f = fixture();
  f.restored();
  f.fire(1000);
  await flush();
  f.fire(200);
  assert.ok(f.events.includes('dismiss'));
  assert.ok(f.events.includes('welcome'));
  await f.stop();
});

test('fail-open dismisses cover when restore hangs', async () => {
  const f = fixture({ failOpenMs: 8000 });
  f.fire(1000);
  await flush();
  assert.equal(f.events.includes('dismiss'), false);
  f.fire(8000);
  await flush();
  assert.ok(f.events.includes('dismiss'), 'fail-open must dismiss hung restore');
  assert.ok(f.events.includes('class:hidden'));
  assert.ok(f.events.includes('guard'));
  f.fire(200);
  assert.ok(f.events.includes('welcome'));
  await f.stop();
});

test('shutdown while restore is pending never reveals late welcome UI', async () => {
  const f = fixture();
  f.controller.abort();
  await f.stop();
  f.restored();
  await flush();
  f.fire(1000);
  f.fire(8000);
  f.fire(200);
  assert.ok(f.events.includes('settings:destroy'));
  assert.equal(f.events.includes('welcome'), false);
  assert.equal(f.events.includes('dismiss'), false);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.timers.size, 0);
});

test('shutdown after dismiss cancels welcome reveal', async () => {
  const f = fixture();
  f.restored();
  f.fire(1000);
  await flush();
  assert.ok(f.events.includes('dismiss'));
  f.controller.abort();
  await f.stop();
  f.fire(200);
  assert.equal(f.events.includes('welcome'), false);
  assert.ok(f.events.includes('settings:destroy'));
});
