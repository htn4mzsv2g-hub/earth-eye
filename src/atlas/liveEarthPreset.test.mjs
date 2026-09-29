import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_EARTH_CANDIDATES,
  classifyLiveEarthSource,
  formatLiveEarthChip,
  isOverConus,
  selectLiveEarthSources,
  shouldApplyLiveEarthPreset,
  summarizeLiveEarthStatus,
  usStateForAlerts,
} from './liveEarthPreset.js';

test('LIVE EARTH candidates stay intentionally small and use existing layers', () => {
  assert.deepEqual(
    LIVE_EARTH_CANDIDATES.map((row) => row.id),
    [
      'earthquakes',
      'weather-cyclones',
      'weather-alerts',
      'fire-perimeters',
      'flights',
      'cctv',
    ],
  );
  assert.equal(new Set(LIVE_EARTH_CANDIDATES.map((row) => row.id)).size, 6);
});

test('fresh defaults apply but share and authored local state never get overwritten', () => {
  assert.equal(shouldApplyLiveEarthPreset(), true);
  assert.equal(
    shouldApplyLiveEarthPreset({ source: 'share', hasShareState: true }),
    false,
  );
  assert.equal(
    shouldApplyLiveEarthPreset({ source: 'local', enabledLayerIds: [] }),
    false,
  );
  assert.equal(
    shouldApplyLiveEarthPreset({
      source: 'defaults',
      enabledLayerIds: ['flights'],
    }),
    false,
  );
});

test('global view chooses only cheap official global signals', () => {
  assert.deepEqual(
    selectLiveEarthSources({
      altitudeM: 1_000_000,
      latitude: 30.2672,
      longitude: -97.7431,
    }),
    ['earthquakes', 'weather-cyclones'],
  );
});

test('Austin regional view adds state-bounded official alerts and defers expensive local layers', () => {
  assert.equal(isOverConus(30.2672, -97.7431), true);
  assert.equal(usStateForAlerts(30.2672, -97.7431), 'TX');
  assert.deepEqual(
    selectLiveEarthSources({
      altitudeM: 25_000,
      latitude: 30.2672,
      longitude: -97.7431,
    }),
    ['earthquakes', 'weather-cyclones', 'weather-alerts', 'fire-perimeters'],
  );
});

test('local mobile view avoids the high-cost camera catalog', () => {
  assert.deepEqual(
    selectLiveEarthSources({
      altitudeM: 900,
      latitude: 30.2672,
      longitude: -97.7431,
      compact: true,
    }),
    ['earthquakes', 'weather-alerts', 'fire-perimeters', 'flights'],
  );
});

test('desktop startup still defers CCTV until catalog load is viewport-scoped', () => {
  assert.deepEqual(
    selectLiveEarthSources({
      altitudeM: 900,
      latitude: 30.2672,
      longitude: -97.7431,
      compact: false,
    }),
    ['earthquakes', 'weather-alerts', 'fire-perimeters', 'flights'],
  );
});

test('outside US does not enable US-only sources', () => {
  assert.equal(isOverConus(51.5072, -0.1276), false);
  assert.equal(usStateForAlerts(51.5072, -0.1276), '');
  assert.deepEqual(
    selectLiveEarthSources({
      altitudeM: 1_000,
      latitude: 51.5072,
      longitude: -0.1276,
      compact: false,
    }),
    ['earthquakes', 'flights'],
  );
});

test('status chip counts active sources and honest failures, not activity', () => {
  assert.equal(formatLiveEarthChip({ loading: true }), 'LIVE EARTH · STARTING');
  assert.equal(
    formatLiveEarthChip({ active: 2, unavailable: 1 }),
    'LIVE EARTH · 2 SOURCES ACTIVE · 1 UNAVAILABLE',
  );
  assert.equal(
    classifyLiveEarthSource({
      enabled: true,
      lifecycleState: 'enabled',
      stats: { count: 0, error: null },
    }),
    'active',
  );
  assert.equal(
    classifyLiveEarthSource({
      enabled: true,
      lifecycleState: 'enabled',
      stats: { count: 0, error: 'upstream down' },
    }),
    'unavailable',
  );
  const layers = new Map([
    ['earthquakes', { enabled: true, lifecycleState: 'enabled', stats: {} }],
    [
      'weather-alerts',
      { enabled: true, lifecycleState: 'enabled', stats: { error: 'down' } },
    ],
  ]);
  assert.deepEqual(
    summarizeLiveEarthStatus(['earthquakes', 'weather-alerts'], (id) =>
      layers.get(id),
    ),
    {
      active: 1,
      unavailable: 1,
      loading: false,
      label: 'LIVE EARTH · 1 SOURCES ACTIVE · 1 UNAVAILABLE',
    },
  );
});
