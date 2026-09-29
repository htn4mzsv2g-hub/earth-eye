// Source health break-tests (Stage 2): forced failures must surface as
// OFFLINE / RATE LIMITED / KEY REQUIRED / STALE / DEGRADED, never as a quiet
// "no activity". Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEALTH_STATES,
  sourceHealth,
  staleAfterMs,
  firstAnswerTimeoutMs,
  createSourceStatusStore,
  DATA_SOURCES,
} from './dataSourceRegistry.js';
import { LayerLifecycle } from '../data/lifecycle.js';

const NOW = Date.parse('2026-09-28T12:00:00Z');
const on = (extra = {}) => ({
  enabled: true,
  now: NOW,
  disabledReason: '',
  ...extra,
});

test('the six required health states exist', () => {
  for (const s of [
    'online',
    'degraded',
    'offline',
    'key required',
    'rate limited',
    'stale',
  ])
    assert.ok(HEALTH_STATES.includes(s), s);
});

test('every live source reports a provider name and both timestamps', () => {
  for (const id of Object.keys(DATA_SOURCES)) {
    const h = sourceHealth(
      id,
      { count: 3 },
      on({ lastSuccessAt: NOW - 1000, lastAttemptAt: NOW - 1000 }),
    );
    assert.ok(h.provider, `${id} provider`);
    assert.ok('lastSuccessAt' in h && 'lastAttemptAt' in h, id);
  }
});

test('healthy answer = ONLINE, including an honest empty answer', () => {
  const h = sourceHealth(
    'earthquakes',
    { count: 12 },
    on({ lastSuccessAt: NOW - 5000 }),
  );
  assert.equal(h.state, 'online');
  const empty = sourceHealth(
    'earthquakes',
    { count: 0 },
    on({ lastSuccessAt: NOW - 5000 }),
  );
  assert.equal(empty.state, 'online');
  assert.match(empty.detail, /answered/);
});

test('break: HTTP 429 = RATE LIMITED', () => {
  const h = sourceHealth(
    'military',
    { count: 0, error: 'HTTP 429 Too Many Requests' },
    on(),
  );
  assert.equal(h.state, 'rate limited');
  assert.equal(h.label, 'RATE LIMITED');
  const cooled = sourceHealth(
    'flights',
    { count: 40, error: 'OpenSky rate limit; cooling down' },
    on({ lastSuccessAt: NOW - 60_000 }),
  );
  assert.equal(cooled.state, 'rate limited');
  assert.match(cooled.detail, /last good data/);
});

test('break: bad or missing key = KEY REQUIRED', () => {
  assert.equal(
    sourceHealth('earthquakes', { error: 'HTTP 401 Unauthorized' }, on()).state,
    'key required',
  );
  assert.equal(
    sourceHealth('local-firms', { error: 'Invalid API key' }, on()).state,
    'key required',
  );
});

test('break: network blocked = OFFLINE, and with old data = DEGRADED', () => {
  const dead = sourceHealth(
    'earthquakes',
    { count: 0, error: 'TypeError: Failed to fetch' },
    on(),
  );
  assert.equal(dead.state, 'offline');
  assert.notEqual(dead.state, 'online');
  const partial = sourceHealth(
    'earthquakes',
    { count: 30, managerRefreshError: 'network error' },
    on({ lastSuccessAt: NOW - 90_000 }),
  );
  assert.equal(partial.state, 'degraded');
});

test('break: a provider that never answers = OFFLINE after the first-answer window', () => {
  const entry = DATA_SOURCES.earthquakes;
  const early = sourceHealth(
    'earthquakes',
    { count: 0 },
    on({ enabledAt: NOW - 5_000 }),
  );
  assert.equal(early.state, 'connecting');
  const late = sourceHealth(
    'earthquakes',
    { count: 0 },
    on({ enabledAt: NOW - firstAnswerTimeoutMs(entry) - 1 }),
  );
  assert.equal(late.state, 'offline');
  assert.match(late.detail, /has not answered/);
});

test('break: stale data = STALE (success older than 3 polls, min 2 min)', () => {
  const entry = DATA_SOURCES.military;
  assert.equal(staleAfterMs(entry), 120_000);
  const fresh = sourceHealth(
    'military',
    { count: 5 },
    on({ lastSuccessAt: NOW - 100_000 }),
  );
  assert.equal(fresh.state, 'online');
  const stale = sourceHealth(
    'military',
    { count: 5 },
    on({ lastSuccessAt: NOW - 121_000 }),
  );
  assert.equal(stale.state, 'stale');
  // Provider-reported observation time older than the window is stale too.
  const oldObs = sourceHealth(
    'military',
    { count: 5, observedAt: NOW - 600_000 },
    on({ lastSuccessAt: NOW - 1000 }),
  );
  assert.equal(oldObs.state, 'stale');
});

test('disabled, excluded and blocked sources say why instead of looking idle', () => {
  // Traffic is no longer policy-excluded: keyless reads KEY REQUIRED (no fake cars).
  const traffic = sourceHealth('traffic', {}, { enabled: false, now: NOW });
  assert.equal(traffic.state, 'key required');
  assert.match(traffic.detail, /TOMTOM_API_KEY|provider key/i);
  assert.match(
    sourceHealth('radio', {}, { enabled: false, now: NOW }).detail,
    /Blocked|permission review|COMMS/i,
  );
  assert.equal(
    sourceHealth(
      'earthquakes',
      {},
      { enabled: false, now: NOW, disabledReason: '' },
    ).state,
    'off',
  );
});

test('status store: failure after success shows DEGRADED with last success + last attempt; time moves it to STALE', () => {
  let t = NOW;
  const store = createSourceStatusStore({ now: () => t });
  store.report('military', {
    enabled: true,
    stats: {
      count: 4,
      lastUpdate: t,
      managerLastAttemptAt: t,
      managerLastSuccessAt: t,
    },
  });
  let s = store.getSourceStatus('military');
  assert.equal(s.health, 'online');
  assert.equal(s.lastSuccessAt, NOW);
  t += 30_000;
  store.report('military', {
    enabled: true,
    stats: {
      count: 4,
      lastUpdate: NOW,
      error: 'HTTP 503',
      managerLastAttemptAt: t,
      managerLastSuccessAt: NOW,
    },
  });
  s = store.getSourceStatus('military');
  assert.equal(s.health, 'degraded');
  assert.equal(s.lastSuccessAt, NOW);
  assert.equal(s.lastAttemptAt, t);
  store.report('military', {
    enabled: true,
    stats: {
      count: 4,
      lastUpdate: NOW,
      managerLastAttemptAt: t,
      managerLastSuccessAt: NOW,
    },
  });
  t += 10 * 60_000;
  store.tick();
  s = store.getSourceStatus('military');
  assert.equal(s.health, 'stale');
  assert.equal(s.healthLabel, 'STALE');
});

test('lifecycle records last attempt and last success; a throwing update is not a success', async () => {
  const lc = new LayerLifecycle(null);
  let fail = true;
  lc.register({
    id: 'earthquakes',
    name: 'Earthquakes',
    icon: '',
    source: 'test',
    updateInterval: -1,
    async init() {},
    enable() {},
    disable() {},
    async update() {
      if (fail) throw new Error('HTTP 429');
    },
    getStats() {
      return { count: 0 };
    },
  });
  const warn = console.warn;
  const err = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    await lc.setEnabled('earthquakes', true);
  } finally {
    console.warn = warn;
    console.error = err;
  }
  const stats = lc.getAll().find((l) => l.id === 'earthquakes').stats;
  assert.ok(Number.isFinite(stats.managerLastAttemptAt), 'attempt recorded');
  assert.equal(stats.managerLastSuccessAt, null, 'failure is not a success');
  assert.equal(
    lc.isEnabled('earthquakes'),
    false,
    'failed enable leaves it off',
  );
  const h = sourceHealth('earthquakes', stats, {
    enabled: false,
    now: Date.now(),
    disabledReason: '',
  });
  assert.equal(h.state, 'rate limited', 'failed enable is not a quiet OFF');
  fail = false;
  await lc.setEnabled('earthquakes', true);
  const ok = lc.getAll().find((l) => l.id === 'earthquakes').stats;
  assert.ok(Number.isFinite(ok.managerLastSuccessAt), 'success recorded');
  assert.equal(ok.managerRefreshError, null);
  assert.equal(
    sourceHealth(
      'earthquakes',
      ok,
      on({ now: Date.now(), lastSuccessAt: ok.managerLastSuccessAt }),
    ).state,
    'online',
  );
});
