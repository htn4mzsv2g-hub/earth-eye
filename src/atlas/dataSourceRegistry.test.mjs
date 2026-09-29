import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLASSIFICATIONS,
  CLASSIFICATION_TONE,
  DATA_SOURCES,
  sourceFor,
  classifyLayer,
  activeFlightFeed,
  activeFireFeed,
  createRefreshTracker,
  createSourceStatusStore,
  relativeAge,
  chicagoClock,
} from './dataSourceRegistry.js';

test('the classification set is exactly the ten launch classes', () => {
  assert.deepEqual(CLASSIFICATIONS, [
    'LIVE',
    'NEAR LIVE',
    'REFRESHED STILL',
    'VIDEO CLIP',
    'DAILY / PERIODIC',
    'SNAPSHOT',
    'MODEL',
    'SIMULATED',
    'KEY REQUIRED',
    'BROKEN / UNAVAILABLE',
  ]);
  for (const c of CLASSIFICATIONS) assert.ok(CLASSIFICATION_TONE[c]);
  // Red is reserved for errors.
  const bad = Object.entries(CLASSIFICATION_TONE)
    .filter(([, tone]) => tone === 'bad')
    .map(([c]) => c);
  assert.deepEqual(bad, ['BROKEN / UNAVAILABLE']);
});

test('every registry entry is complete and uses a valid class', () => {
  for (const [id, e] of Object.entries(DATA_SOURCES)) {
    assert.ok(CLASSIFICATIONS.includes(e.classification), id);
    for (const k of [
      'name',
      'group',
      'provider',
      'endpoint',
      'cadence',
      'coverage',
      'limitation',
    ])
      assert.ok(typeof e[k] === 'string' && e[k].length > 0, `${id}.${k}`);
    assert.ok(Number.isFinite(e.pollMs), `${id}.pollMs`);
    if (e.keyed) assert.ok(CLASSIFICATIONS.includes(e.keyed.classification));
    assert.equal(e.layerId, id);
    assert.equal(typeof e.safeToSummarize, 'boolean', `${id}.safeToSummarize`);
    assert.ok(e.sourceUrl === null || /^https:\/\//.test(e.sourceUrl), `${id}.sourceUrl`);
    for (const k of ['credit', 'disclaimer', 'limitations'])
      assert.ok(typeof e[k] === 'string' && e[k].length > 0, `${id}.${k}`);
  }
  // Wind is a model forecast, not an observation.
  assert.equal(DATA_SOURCES.wind.classification, 'MODEL');
  // Simulated, camera imagery and surveillance/military context are never
  // summarized.
  for (const id of ['traffic', 'cctv', 'alpr-cameras', 'military-installations'])
    assert.equal(DATA_SOURCES[id].safeToSummarize, false, id);
  // Safety wording stays in the disclaimers.
  assert.match(DATA_SOURCES.directions.disclaimer, /not for navigation/i);
  assert.match(DATA_SOURCES['weather-cyclones'].disclaimer, /not official/i);
});

test('unknown layers are marked unaudited, never LIVE', () => {
  const e = sourceFor('mystery-layer', 'Mystery');
  assert.equal(e.name, 'Mystery');
  assert.notEqual(e.classification, 'LIVE');
  assert.match(e.limitation, /unverified/);
  assert.equal(e.coverage, 'unknown');
});

test('keyless traffic is KEY REQUIRED; only TomTom flow upgrades it', () => {
  assert.equal(classifyLayer('traffic', {}).classification, 'KEY REQUIRED');
  assert.equal(
    classifyLayer('traffic', { mode: 'sim', source: 'Simulated' }).classification,
    'KEY REQUIRED',
  );
  assert.equal(
    classifyLayer('traffic', { mode: 'flow', source: 'TomTom flow' }).classification,
    'NEAR LIVE',
  );
  assert.equal(DATA_SOURCES.traffic.classification, 'KEY REQUIRED');
});

test('aircraft report which real feed is active', () => {
  assert.equal(activeFlightFeed({ source: 'OpenSky Network' }), 'OpenSky');
  assert.equal(
    activeFlightFeed({ source: 'adsb.lol', coverage: '250nm regional fallback' }),
    'adsb.lol fallback',
  );
  const r = classifyLayer('flights', {
    count: 300,
    lastUpdate: Date.now(),
    source: 'adsb.lol',
    coverage: '250nm regional fallback',
  });
  assert.equal(r.classification, 'NEAR LIVE');
  assert.equal(r.feed, 'adsb.lol fallback');
  assert.match(r.fallback, /adsb\.lol/);
});

test('fires say whether they are keyless NASA files or keyed FIRMS', () => {
  assert.equal(
    activeFireFeed({ fallback: true, count: 5 }),
    'NASA 24 h files (keyless)',
  );
  assert.equal(activeFireFeed({ keyRequired: true }), 'key required');
  assert.equal(activeFireFeed({ count: 4, lastUpdate: 1 }), 'FIRMS API (keyed)');
  const r = classifyLayer('local-firms', { fallback: true, count: 10, lastUpdate: 1 });
  assert.equal(r.classification, 'DAILY / PERIODIC');
  assert.equal(r.fallback, 'NASA FIRMS public 24 h files');
});

test('AIS without a key is KEY REQUIRED, never simulated', () => {
  const r = classifyLayer('ais-live-vessels', {
    count: 0,
    error: 'AISSTREAM_API_KEY is not set',
  });
  assert.equal(r.classification, 'KEY REQUIRED');
  assert.equal(
    classifyLayer('ais-live-vessels', { count: 12, lastUpdate: 1 }).classification,
    'LIVE',
  );
});

test('satellites are CelesTrak or unavailable', () => {
  const down = classifyLayer('satellites', {
    count: 0,
    status: 'unavailable',
    error: 'CelesTrak unreachable',
  });
  assert.equal(down.classification, 'BROKEN / UNAVAILABLE');
  const ok = classifyLayer('satellites', { count: 800, lastUpdate: 1, status: 'nominal' });
  assert.equal(ok.classification, 'DAILY / PERIODIC');
  assert.equal(ok.fallback, null);
  const amsat = classifyLayer('satellites', {
    count: 97,
    lastUpdate: 1,
    fallback: true,
    status: 'fallback',
    source: 'AMSAT amateur TLE fallback for Stations (CelesTrak unreachable)',
  });
  assert.match(amsat.fallback, /AMSAT/);
  const cached = classifyLayer('satellites', {
    count: 40,
    lastUpdate: 1,
    status: 'fallback',
    fallback: true,
    source:
      'cached CelesTrak elements for Stations fetched 2026-09-01T00:00:00.000Z (CelesTrak unreachable)',
  });
  assert.match(cached.fallback, /cached CelesTrak/);
  assert.equal(cached.classification, 'DAILY / PERIODIC');
  const held = classifyLayer('satellites', {
    count: 40,
    lastUpdate: 1,
    status: 'unavailable',
    error: 'CelesTrak unreachable',
    source:
      'cached CelesTrak elements, fetched 2026-09-01T00:00:00.000Z (CelesTrak unreachable)',
  });
  assert.equal(held.classification, 'BROKEN / UNAVAILABLE');
  assert.match(held.fallback, /cached CelesTrak/);
  assert.notEqual(held.classification, 'LIVE');
});

test('an enabled layer whose fetch fails with no data is BROKEN', () => {
  const r = classifyLayer('earthquakes', { count: 0, error: 'HTTP 502' });
  assert.equal(r.classification, 'BROKEN / UNAVAILABLE');
  assert.equal(r.tone, 'bad');
  // Disabled layers keep their base class.
  assert.equal(
    classifyLayer('earthquakes', { error: 'HTTP 502' }, { enabled: false }).classification,
    'NEAR LIVE',
  );
});

test('the refresh tracker keeps the last success through later errors', () => {
  let now = 1_000_000;
  const t = createRefreshTracker(() => now);
  t.observe('flights', { lastUpdate: 999_000 });
  now += 30_000;
  t.observe('flights', { lastUpdate: 999_000, error: 'HTTP 429' });
  assert.equal(t.lastSuccess('flights'), 999_000);
  assert.equal(t.lastError('flights').message, 'HTTP 429');
  t.observe('flights', { lastUpdate: 1_029_000 });
  assert.equal(t.lastSuccess('flights'), 1_029_000);
  assert.equal(t.lastError('flights'), null);
  // Future timestamps are ignored.
  t.observe('radar', { lastUpdate: now + 10 * 60_000 });
  assert.equal(t.lastSuccess('radar'), null);
});

test('time formatting', () => {
  assert.equal(relativeAge(5_000), '5 s ago');
  assert.equal(relativeAge(5 * 60_000), '5 min ago');
  assert.equal(relativeAge(3 * 3_600_000), '3 h ago');
  assert.equal(relativeAge(NaN), '—');
  // 2026-09-28T21:20:05Z is 16:20:05 in Chicago (CDT, UTC-5).
  assert.equal(chicagoClock(Date.parse('2026-09-28T21:20:05Z')), '16:20:05 CT');
});

test('source-status store: read-only snapshots, real refresh times, subscribe', async () => {
  let now = 1_000_000;
  const store = createSourceStatusStore({ now: () => now });
  const all = store.getSourceStatus();
  assert.equal(all.length, Object.keys(DATA_SOURCES).length);
  assert.ok(Object.isFrozen(all));
  const quake = store.getSourceStatus('earthquakes');
  assert.ok(Object.isFrozen(quake));
  for (const k of [
    'provider',
    'status',
    'lastSuccessAt',
    'cadence',
    'coverage',
    'limitation',
  ])
    assert.ok(k in quake, k);
  assert.equal(quake.lastSuccessAt, null, 'nothing observed yet = null');
  assert.equal(quake.enabled, false);

  const seen = [];
  const off = store.subscribe((list) => seen.push(list));
  store.report('earthquakes', {
    stats: { count: 243, lastUpdate: now - 5_000 },
    enabled: true,
  });
  await Promise.resolve();
  assert.equal(seen.length, 1);
  const q2 = store.getSourceStatus('earthquakes');
  assert.equal(q2.lastSuccessAt, now - 5_000);
  assert.equal(q2.count, 243);
  assert.equal(q2.status, 'NEAR LIVE');
  assert.equal(q2.failed, false);
  assert.equal(q2.safeToSummarize, true);
  assert.match(q2.disclaimer, /not an earthquake alert/i);
  assert.ok(q2.sourceUrl.startsWith('https://earthquake.usgs.gov/'));

  // A later failure keeps the last success and records the error.
  now += 60_000;
  store.report('earthquakes', {
    stats: { error: 'HTTP 503' },
    enabled: true,
  });
  await Promise.resolve();
  const q3 = store.getSourceStatus('earthquakes');
  assert.equal(q3.lastSuccessAt, 1_000_000 - 5_000);
  assert.equal(q3.status, 'BROKEN / UNAVAILABLE');
  assert.equal(q3.lastError.message, 'HTTP 503');
  assert.equal(q3.failed, true);
  assert.equal(q3.error, 'HTTP 503');
  assert.equal(q3.safeToSummarize, false);
  assert.match(q3.disclaimer, /could not be reached/);
  assert.equal(q3.layerId, 'earthquakes');
  assert.equal(q3.lastSuccess, q3.lastSuccessAt);
  assert.equal(seen.length, 2);

  // An identical report does not notify; unsubscribe stops updates.
  store.report('earthquakes', { stats: { error: 'HTTP 503' }, enabled: true });
  await Promise.resolve();
  assert.equal(seen.length, 2);
  off();
  store.report('flights', { stats: { count: 5, lastUpdate: now }, enabled: true });
  await Promise.resolve();
  assert.equal(seen.length, 2);

  // Readers cannot mutate the store.
  assert.throws(() => {
    'use strict';
    q3.status = 'LIVE';
  });
  assert.equal(store.getSourceStatus('earthquakes').status, 'BROKEN / UNAVAILABLE');
  // Keyless traffic stays KEY REQUIRED through the store as well.
  store.report('traffic', { stats: { mode: 'sim', count: 400 }, enabled: true });
  assert.equal(store.getSourceStatus('traffic').status, 'KEY REQUIRED');
  assert.equal(store.getSourceStatus('traffic').safeToSummarize, false);
  assert.match(store.getSourceStatus('traffic').disclaimer, /provider key|No data/i);
});

test('local-adsb: single coherent status — off keeps LIVE catalog, enabled empty is BROKEN, streaming empty is LIVE', () => {
  const off = classifyLayer('local-adsb', { count: 0 }, { enabled: false });
  assert.equal(off.classification, 'LIVE');
  const enabledEmpty = classifyLayer('local-adsb', { count: 0, status: 'idle' }, { enabled: true });
  assert.equal(enabledEmpty.classification, 'BROKEN / UNAVAILABLE');
  const streamingEmpty = classifyLayer(
    'local-adsb',
    { count: 0, status: 'streaming', loadingLabel: '1 feed live · 0 heard' },
    { enabled: true },
  );
  assert.equal(streamingEmpty.classification, 'LIVE');
  const withAircraft = classifyLayer(
    'local-adsb',
    { count: 3, status: 'streaming', lastUpdate: 1 },
    { enabled: true },
  );
  assert.equal(withAircraft.classification, 'LIVE');
});

test('chicagoClock already includes CT — callers must not append another', () => {
  const stamp = chicagoClock(Date.parse('2026-09-28T21:20:05Z'));
  assert.equal(stamp, '16:20:05 CT');
  assert.equal((stamp.match(/\bCT\b/g) || []).length, 1);
});
