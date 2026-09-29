import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as Cesium from 'cesium';
import { createLiveEarthController } from './liveEarthController.js';

function mockDocument(chip) {
  return {
    getElementById(id) {
      return id === 'live-earth-chip' ? chip : null;
    },
  };
}

function mockViewer({ altitudeM, latitude, longitude }) {
  return {
    camera: {
      positionCartographic: {
        height: altitudeM,
        latitude: Cesium.Math.toRadians(latitude),
        longitude: Cesium.Math.toRadians(longitude),
      },
    },
  };
}

test('LIVE EARTH controller skips share / authored local state', async () => {
  const chip = {
    hidden: true,
    classList: { add() {}, remove() {} },
    dataset: {},
  };
  const enabled = [];
  const controller = createLiveEarthController({
    viewer: mockViewer({
      altitudeM: 2_000_000,
      latitude: 30.27,
      longitude: -97.74,
    }),
    dataManager: {
      getAll: () => [],
      subscribe: () => () => {},
      setEnabled: async (id) => {
        enabled.push(id);
        return true;
      },
      layers: new Map(),
    },
    coordinator: {
      source: 'share',
      getDurableState: () => ({ enabledLayerIds: [] }),
    },
    hasShareState: true,
    documentRef: mockDocument(chip),
    windowRef: { innerWidth: 1280, innerHeight: 800 },
  });
  const result = await controller.start();
  assert.equal(result.applied, false);
  assert.deepEqual(enabled, []);
  controller.destroy();
});

test('LIVE EARTH controller progressively enables Austin regional sources', async () => {
  const chip = {
    hidden: true,
    textContent: '',
    dataset: {},
    classList: { add() {}, remove() {} },
  };
  const enabled = [];
  const layers = new Map([
    [
      'weather-alerts',
      {
        module: {
          setAlertArea(code) {
            this._area = code;
          },
          _area: null,
        },
      },
    ],
  ]);
  const timers = [];
  const controller = createLiveEarthController({
    viewer: mockViewer({
      altitudeM: 25_000,
      latitude: 30.27,
      longitude: -97.74,
    }),
    dataManager: {
      getAll: () =>
        enabled.map((id) => ({
          id,
          enabled: true,
          lifecycleState: 'enabled',
          stats: {},
        })),
      subscribe: (cb) => {
        // no live pushes in this unit test
        void cb;
        return () => {};
      },
      setEnabled: async (id, on, opts) => {
        assert.equal(on, true);
        assert.equal(opts.origin, 'live-earth-preset');
        enabled.push(id);
        return true;
      },
      layers,
    },
    coordinator: {
      source: 'defaults',
      getDurableState: () => ({ enabledLayerIds: [] }),
    },
    hasShareState: false,
    documentRef: mockDocument(chip),
    windowRef: { innerWidth: 1280, innerHeight: 800 },
    setTimer: (fn) => {
      timers.push(fn);
      queueMicrotask(fn);
      return timers.length;
    },
    clearTimer: () => {},
  });
  const result = await controller.start();
  assert.equal(result.applied, true);
  assert.deepEqual(result.ids, [
    'earthquakes',
    'weather-cyclones',
    'weather-alerts',
    'fire-perimeters',
  ]);
  assert.deepEqual(enabled, result.ids);
  assert.equal(layers.get('weather-alerts').module._area, 'TX');
  assert.match(
    chip.textContent,
    /^LIVE EARTH · 4 SOURCES ACTIVE · 0 UNAVAILABLE$/,
  );
  assert.equal(chip.hidden, false);
  controller.destroy();
  assert.equal(chip.hidden, true);
});

test('LIVE EARTH controller counts failed enables as unavailable', async () => {
  const chip = {
    hidden: true,
    textContent: '',
    dataset: {},
    classList: { add() {}, remove() {} },
  };
  const controller = createLiveEarthController({
    viewer: mockViewer({ altitudeM: 8_000_000, latitude: 0, longitude: 0 }),
    dataManager: {
      getAll: () => [
        {
          id: 'earthquakes',
          enabled: false,
          lifecycleState: 'disabled',
          stats: {},
        },
        {
          id: 'weather-cyclones',
          enabled: true,
          lifecycleState: 'enabled',
          stats: {},
        },
      ],
      subscribe: () => () => {},
      setEnabled: async (id) => id === 'weather-cyclones',
      layers: new Map(),
    },
    coordinator: {
      source: 'defaults',
      getDurableState: () => ({ enabledLayerIds: [] }),
    },
    documentRef: mockDocument(chip),
    windowRef: { innerWidth: 390, innerHeight: 844 },
  });
  const result = await controller.start();
  assert.equal(result.applied, true);
  assert.deepEqual(result.ids, ['earthquakes', 'weather-cyclones']);
  assert.match(chip.textContent, /1 SOURCES ACTIVE · 1 UNAVAILABLE/);
  controller.destroy();
});
