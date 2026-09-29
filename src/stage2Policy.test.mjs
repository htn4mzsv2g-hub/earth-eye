// Stage 2 (2026-09-28) policy contract: excluded features stay out of the
// production build, the registry carries licence boundaries and review dates,
// commercial-safe mode disables every restricted dataset, and the shared
// enable gate cannot be bypassed. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEV_ONLY_LAYER_IDS,
  DEV_ONLY_SCENE_IDS,
  devExcludedFeaturesEnabled,
  isDevOnlyLayerBlocked,
  isDevOnlySceneBlocked,
} from './policy/devFlags.js';
import {
  DATA_SOURCES,
  SERVICE_SOURCES,
  PERMISSION_REVIEWED_AT,
  disabledReason,
  isSourceAllowed,
  commercialSafeMode,
  setCommercialSafeMode,
  onCommercialSafeChange,
  restrictedSourceIds,
} from './atlas/dataSourceRegistry.js';
import { atlasEnablePolicy } from './atlas/enablePolicy.js';
import { LayerLifecycle } from './data/lifecycle.js';
import { LAYER_ALIASES, parseCommand } from './atlas/commandParser.js';
import { createSceneRecipes } from './scenes/recipes.js';
import { normalizeProject } from './scenes/project.js';

const PROD_ENVS = [
  { PROD: true, DEV: false, MODE: 'production' },
  { PROD: true, DEV: false, MODE: 'production', VITE_EE_DEV_EXCLUDED: '1' },
  { PROD: false, DEV: false, MODE: 'production', VITE_EE_DEV_EXCLUDED: '1' },
  { PROD: true, DEV: true, MODE: 'development', VITE_EE_DEV_EXCLUDED: '1' },
];

function withDevGlobal(t, value) {
  const before = globalThis.__EE_DEV_EXCLUDED__;
  globalThis.__EE_DEV_EXCLUDED__ = value;
  t.after(() => {
    if (before === undefined) delete globalThis.__EE_DEV_EXCLUDED__;
    else globalThis.__EE_DEV_EXCLUDED__ = before;
  });
}

function withCommercialSafe(t, on) {
  const before = commercialSafeMode();
  setCommercialSafeMode(on);
  t.after(() => setCommercialSafeMode(before));
}

test('dev-only flag: a production build can never enable the excluded features', (t) => {
  withDevGlobal(t, true); // even a leaked global cannot win over PROD
  for (const env of PROD_ENVS) {
    assert.equal(devExcludedFeaturesEnabled(env), false, JSON.stringify(env));
    for (const id of DEV_ONLY_LAYER_IDS)
      assert.equal(isDevOnlyLayerBlocked(id, env), true, `${id} blocked`);
    for (const id of DEV_ONLY_SCENE_IDS)
      assert.equal(isDevOnlySceneBlocked(id, env), true, `${id} blocked`);
  }
  // Dev server without the opt-in variable: still off.
  assert.equal(
    devExcludedFeaturesEnabled({ PROD: false, DEV: true, MODE: 'development' }),
    false,
  );
  // Dev server with the explicit opt-in: on (developer testing only).
  assert.equal(
    devExcludedFeaturesEnabled({
      PROD: false,
      DEV: true,
      MODE: 'development',
      VITE_EE_DEV_EXCLUDED: '1',
    }),
    true,
  );
  assert.deepEqual([...DEV_ONLY_LAYER_IDS].sort(), ['alpr-cameras', 'traffic']);
  assert.deepEqual([...DEV_ONLY_SCENE_IDS].sort(), [
    'city-overload',
    'omniscience-pullback',
  ]);
});

test('registry refuses ALPR and simulated traffic; radio is COMMS-pending (not blanket excluded)', () => {
  for (const id of ['alpr-cameras', 'traffic']) {
    assert.match(disabledReason(id, { devExcluded: false }), /^Excluded/);
    assert.equal(isSourceAllowed(id, { devExcluded: false }), false);
    assert.equal(DATA_SOURCES[id].excluded, true);
  }
  assert.equal(disabledReason('traffic', { devExcluded: true }), '');
  // COMMS-0: radio leaves intentionally-excluded; still disabled pending providers.
  assert.equal(DATA_SOURCES.radio.excluded, false);
  assert.equal(DATA_SOURCES.radio.review, 'pending');
  assert.match(disabledReason('radio', { devExcluded: false }), /pending|COMMS|credential|provider/i);
  assert.match(disabledReason('radio', { devExcluded: true }), /pending|COMMS|credential|provider/i);
  assert.equal(isSourceAllowed('radio', { devExcluded: false }), false);
});

function fakeLayer(id) {
  const calls = { enable: 0, update: 0 };
  return {
    calls,
    module: {
      id,
      name: id,
      icon: '',
      source: 'test',
      updateInterval: -1,
      async init() {},
      enable() {
        calls.enable++;
      },
      disable() {},
      async update() {
        calls.update++;
      },
      getStats() {
        return { count: 0, lastUpdate: null };
      },
    },
  };
}

test('shared enable gate: toggle, setEnabled and restore all refuse excluded layers, and the gate is not removable', async (t) => {
  withDevGlobal(t, false);
  const lc = new LayerLifecycle(null, { enablePolicy: atlasEnablePolicy });
  const layers = Object.fromEntries(
    ['alpr-cameras', 'traffic', 'radio', 'earthquakes'].map((id) => {
      const l = fakeLayer(id);
      lc.register(l.module);
      return [id, l];
    }),
  );
  const blocked = [];
  lc.subscribe((change) => {
    if (change.type === 'visibility-blocked' && change.policy)
      blocked.push(change.layerId);
  });
  for (const id of ['alpr-cameras', 'traffic', 'radio']) {
    assert.equal(await lc.setEnabled(id, true, { origin: 'scene' }), false);
    assert.equal(await lc.toggle(id, { origin: 'user' }), false);
    assert.equal(
      await lc.setEnabled(id, true, { origin: 'url-restore' }),
      false,
    );
    assert.equal(lc.isEnabled(id), false, `${id} stays off`);
    assert.equal(layers[id].calls.enable, 0, `${id} never enabled`);
    assert.equal(layers[id].calls.update, 0, `${id} never polled`);
  }
  assert.deepEqual([...new Set(blocked)].sort(), [
    'alpr-cameras',
    'radio',
    'traffic',
  ]);
  await lc.setEnabled('earthquakes', true);
  assert.equal(lc.isEnabled('earthquakes'), true, 'allowed layers still work');

  // The policy cannot be replaced or deleted after construction.
  assert.throws(() => {
    'use strict';
    lc._enablePolicy = () => '';
  }, TypeError);
  assert.throws(() => delete lc._enablePolicy, TypeError);
  assert.equal(await lc.setEnabled('traffic', true), false);

  // A throwing policy fails closed.
  const broken = new LayerLifecycle(null, {
    enablePolicy: () => {
      throw new Error('boom');
    },
  });
  const warn = console.warn;
  console.warn = () => {};
  t.after(() => (console.warn = warn));
  broken.register(fakeLayer('earthquakes').module);
  assert.equal(await broken.setEnabled('earthquakes', true), false);
});

test('typed commands still omit radio (COMMS pending), traffic and ALPR', () => {
  const layers = new Set(LAYER_ALIASES.map(([, id]) => id));
  for (const id of ['radio', 'traffic', 'alpr-cameras'])
    assert.equal(layers.has(id), false, `${id} not in the command vocabulary`);
  for (const phrase of ['show traffic', 'show radio', 'show alpr cameras']) {
    const cmd = parseCommand(phrase);
    const target = JSON.stringify(cmd);
    assert.doesNotMatch(target, /"(traffic|radio|alpr-cameras)"/, phrase);
  }
  assert.ok(layers.has('earthquakes'));
});

test('Director: the two traffic scenes are gone from recipes and from stored/imported projects', (t) => {
  withDevGlobal(t, false);
  const ids = createSceneRecipes().map((r) => r.id);
  for (const id of DEV_ONLY_SCENE_IDS) assert.equal(ids.includes(id), false);
  assert.ok(ids.length > 0);
  const project = normalizeProject({
    scenes: [
      { id: 'city-overload', title: 'City overload', shots: [] },
      { id: 'omniscience-pullback', title: 'Pullback', shots: [] },
      { id: 'mine', title: 'Mine', shots: [] },
    ],
  });
  const kept = (project.scenes || []).map((s) => s.id);
  assert.equal(kept.includes('city-overload'), false);
  assert.equal(kept.includes('omniscience-pullback'), false);
});

test('licence boundaries: review dates, licence fields and non-commercial flags on every source', () => {
  for (const [id, entry] of Object.entries(DATA_SOURCES)) {
    assert.equal(entry.reviewedAt, PERMISSION_REVIEWED_AT, `${id} reviewedAt`);
    assert.ok(entry.license, `${id} licence`);
    assert.ok(entry.attribution, `${id} attribution`);
    assert.equal(typeof entry.commercialRestricted, 'boolean', id);
  }
  for (const s of SERVICE_SOURCES) {
    assert.ok(s.reviewedAt, `${s.id} reviewedAt`);
    assert.ok(s.license && s.attribution, `${s.id} licence/attribution`);
  }
  const locator = DATA_SOURCES['bhote-koshi-locator'];
  assert.equal(locator.license, 'CC BY-NC 4.0');
  assert.equal(locator.commercialUse, 'non-commercial');
  assert.equal(locator.commercialRestricted, true);
  const cables = DATA_SOURCES['telegeography-submarine-cables'];
  assert.equal(cables.license, 'CC BY-NC-SA 3.0');
  assert.equal(cables.commercialRestricted, true);
  assert.equal(DATA_SOURCES['bhote-koshi-2026'].commercialRestricted, true);
});

test('commercial-safe mode cleanly disables every restricted dataset and restores them when off', async (t) => {
  withDevGlobal(t, false);
  withCommercialSafe(t, false);
  const restricted = restrictedSourceIds();
  for (const id of [
    'telegeography-submarine-cables',
    'bhote-koshi-locator',
    'bhote-koshi-2026',
    'flights',
    'weather-lightning',
  ])
    assert.ok(restricted.includes(id), `${id} is restricted`);
  for (const id of Object.keys(DATA_SOURCES))
    assert.equal(
      restricted.includes(id),
      DATA_SOURCES[id].commercialRestricted,
      id,
    );

  const lc = new LayerLifecycle(null, { enablePolicy: atlasEnablePolicy });
  for (const id of ['telegeography-submarine-cables', 'earthquakes'])
    lc.register(fakeLayer(id).module);
  await lc.setEnabled('telegeography-submarine-cables', true);
  assert.equal(
    lc.isEnabled('telegeography-submarine-cables'),
    true,
    'off: allowed',
  );

  const seen = [];
  const off = onCommercialSafeChange((on) => seen.push(on));
  setCommercialSafeMode(true);
  off();
  assert.deepEqual(seen, [true]);
  for (const id of restricted) {
    assert.equal(isSourceAllowed(id), false, `${id} off in commercial-safe`);
    assert.ok(disabledReason(id), id);
  }
  assert.equal(isSourceAllowed('earthquakes'), true);
  assert.equal(isSourceAllowed('telegeography-submarine-cables'), false);
  await lc.setEnabled('telegeography-submarine-cables', false);
  assert.equal(
    await lc.setEnabled('telegeography-submarine-cables', true),
    false,
  );

  setCommercialSafeMode(false);
  assert.equal(isSourceAllowed('telegeography-submarine-cables'), true);
  await lc.setEnabled('telegeography-submarine-cables', true);
  assert.equal(lc.isEnabled('telegeography-submarine-cables'), true);
});
