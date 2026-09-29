import test from 'node:test';
import assert from 'node:assert/strict';
import { createSatellitesLayer } from './index.js';
import { createOrbits } from './orbits.js';
import { CATALOG_GROUPS } from './policy.js';
import { layerFeedState } from '../../data/feedState.js';
import { DataLayerManager } from '../../data/manager.js';
import { classifyLayer, sourceHealth } from '../../atlas/dataSourceRegistry.js';

const FROM_MS = Date.UTC(2008, 8, 20, 12, 30, 0);
const AUSTIN = { latDeg: 30.2672, lonDeg: -97.7431, fromMs: FROM_MS };
const ISS_OMM = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2008-09-20T12:25:40.104192',
  MEAN_MOTION: 15.72125391,
  ECCENTRICITY: 0.0006703,
  INCLINATION: 51.6416,
  RA_OF_ASC_NODE: 247.4627,
  ARG_OF_PERICENTER: 130.536,
  MEAN_ANOMALY: 325.0288,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 292,
  REV_AT_EPOCH: 56353,
  BSTAR: -1.1606e-5,
  MEAN_MOTION_DOT: -2.182e-5,
  MEAN_MOTION_DDOT: 0,
};
const ISS_TLE = `ISS (ZARYA)
1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927
2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537
`;

function services() {
  return {
    picking: {},
    focus: {},
    readout: {},
    overlays: {},
    context: {},
    render: {},
    layerState: { isExplicitLayerStateOrigin: () => false },
  };
}

function layerWith(readGroup) {
  const layer = createSatellitesLayer({
    source: { readGroup },
    services: services(),
  });
  layer._setDenseCatalogStateForTest();
  return layer;
}

function meta(stats) {
  return new DataLayerManager({})._buildMetaText({
    source: 'CelesTrak',
    stats,
  });
}

test('catalog parse keeps GP/OMM elements and invents nothing from an error page', () => {
  const orbits = createOrbits({
    state: { _catalog: new Map() },
    services: {},
    parts: {},
    source: {},
  });
  assert.deepEqual(orbits.parseCatalog(''), []);
  assert.deepEqual(orbits.parseCatalog('<html>502 bad gateway</html>'), []);
  assert.deepEqual(orbits.parseCatalog('1 valid-fixture-TLE'), []);
  assert.deepEqual(orbits.parseCatalog('[]'), []);
  const parsed = orbits.parseCatalog(
    JSON.stringify([ISS_OMM, { OBJECT_NAME: 'bad' }]),
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].noradId, 25544);
  assert.equal(parsed[0].format, 'omm');
  assert.equal(parsed[0].epochMs, Date.parse('2008-09-20T12:25:40.104192Z'));
});

test('a CelesTrak outage with no elements is UNAVAILABLE and predicts no pass', async () => {
  const layer = layerWith(async () => ({
    ok: true,
    status: 200,
    text: '<html>502</html>',
    tleSource: 'celestrak',
    tleCache: 'MISS',
    fetchedAt: '2026-09-29T12:00:00.000Z',
  }));
  await layer.update({ scene: { primitives: { remove() {} } } });
  const stats = layer.getStats();
  assert.equal(stats.count, 0);
  assert.equal(stats.status, 'unavailable');
  assert.equal(stats.error, 'CelesTrak unreachable');
  assert.equal(stats.fallback, undefined);
  assert.equal(layerFeedState(stats), 'unavailable');
  assert.match(meta(stats), /^UNAVAILABLE · /);
  assert.doesNotMatch(meta(stats), /just now/);
  assert.deepEqual(layer.getNextIssPass(AUSTIN), { status: 'no-tle' });
  assert.equal(layer.getSatelliteOrbitTrack(25544), null);
  assert.equal(layer.findByQuery('ISS'), null);
  const cls = classifyLayer('satellites', stats, { enabled: true });
  assert.equal(cls.classification, 'BROKEN / UNAVAILABLE');
  const health = sourceHealth('satellites', stats, {
    enabled: true,
    now: FROM_MS,
    lastSuccessAt: null,
    classification: cls,
  });
  assert.notEqual(health.state, 'online');
});

test('GP/OMM success selects a satellite, draws an orbit, and labels the epoch as a prediction', async () => {
  const text = JSON.stringify([ISS_OMM]);
  const layer = layerWith(async (group) => {
    assert.ok(CATALOG_GROUPS.some((row) => row.path === group));
    return {
      ok: true,
      status: 200,
      text,
      tleSource: 'celestrak',
      tleCache: 'MISS',
      fetchedAt: '2008-09-20T12:25:40.104Z',
    };
  });
  await layer.update({ scene: { primitives: { remove() {} } } });
  const stats = layer.getStats();
  assert.equal(stats.count, 1);
  assert.equal(stats.status, 'nominal');
  assert.equal(stats.fallback, undefined);
  assert.equal(stats.positionKind, 'sgp4-prediction');
  assert.match(stats.loadingLabel, /epoch 2008-09-20/);
  assert.match(stats.loadingLabel, /not telemetry/);
  assert.equal(layerFeedState(stats), 'nominal');
  const line = meta(stats);
  assert.match(line, /epoch 2008-09-20/);
  assert.match(line, /not telemetry/);
  assert.doesNotMatch(line, /just now/);

  const selected = layer.findByQuery('ISS');
  assert.equal(selected.noradId, 25544);
  assert.equal(selected.telemetry, false);
  assert.equal(selected.positionKind, 'sgp4-prediction');
  assert.ok(Number.isFinite(selected.latitude));
  assert.ok(Number.isFinite(selected.longitude));

  const track = layer.getSatelliteOrbitTrack(25544);
  assert.equal(track.noradId, 25544);
  assert.ok(track.orbitPath.length > 10);
  assert.ok(Number.isFinite(track.current.latitude));
  assert.ok(Number.isFinite(track.current.altitude));

  const pass = layer.getNextIssPass(AUSTIN);
  assert.equal(pass.status, 'ok');
  assert.equal(pass.telemetry, false);
  assert.equal(pass.basis, 'sgp4-elements');
  assert.ok(pass.pass.riseMs > FROM_MS);

  const cls = classifyLayer('satellites', stats, { enabled: true });
  assert.equal(cls.classification, 'DAILY / PERIODIC');
  assert.equal(cls.fallback, null);
});

test('a stale CelesTrak copy is FALLBACK with its fetch time, and a later total outage stays UNAVAILABLE', async () => {
  let mode = 'stale';
  const text = JSON.stringify([ISS_OMM]);
  const layer = layerWith(async () => {
    if (mode === 'down') {
      return {
        ok: false,
        status: 502,
        text: '',
        tleSource: 'celestrak',
        tleCache: 'NONE',
        fetchedAt: '',
      };
    }
    return {
      ok: true,
      status: 200,
      text,
      tleSource: 'celestrak',
      tleCache: 'STALE-ERROR',
      fetchedAt: '2026-09-01T00:00:00.000Z',
    };
  });
  await layer.update({ scene: { primitives: { remove() {} } } });
  const stale = layer.getStats();
  assert.equal(stale.status, 'fallback');
  assert.equal(stale.fallback, true);
  assert.match(stale.source, /cached CelesTrak elements/);
  assert.match(stale.source, /2026-09-01T00:00:00.000Z/);
  assert.match(stale.source, /epoch /);
  assert.equal(layerFeedState(stale), 'fallback');
  assert.match(meta(stale), /^FALLBACK · /);
  assert.doesNotMatch(meta(stale), /just now/);
  assert.equal(layer.getNextIssPass(AUSTIN).status, 'ok');
  const cachedClass = classifyLayer('satellites', stale, { enabled: true });
  assert.match(cachedClass.fallback, /cached CelesTrak/);
  assert.notEqual(cachedClass.classification, 'LIVE');

  mode = 'down';
  await layer.update({ scene: { primitives: { remove() {} } } });
  const held = layer.getStats();
  assert.equal(held.count, 1);
  assert.equal(held.status, 'unavailable');
  assert.equal(held.error, 'CelesTrak unreachable');
  assert.match(held.source, /cached CelesTrak elements/);
  assert.match(held.source, /epoch /);
  assert.equal(layerFeedState(held), 'unavailable');
  const heldLine = meta(held);
  assert.match(heldLine, /^UNAVAILABLE · /);
  assert.match(heldLine, /cached CelesTrak/);
  assert.doesNotMatch(heldLine, /just now/);
  assert.notEqual(layerFeedState(held), 'nominal');
  assert.equal(layer.getNextIssPass(AUSTIN).telemetry, false);
  assert.equal(layer.getSatelliteOrbitTrack('ISS (ZARYA)').noradId, 25544);
});

test('AMSAT elements are FALLBACK only when the source says so', async () => {
  const layer = layerWith(async (group) => {
    if (group !== 'stations') {
      return {
        ok: false,
        status: 502,
        text: '',
        tleSource: 'celestrak',
        tleCache: 'NONE',
        fetchedAt: '',
      };
    }
    return {
      ok: true,
      status: 200,
      text: ISS_TLE,
      tleSource: 'amsat-fallback',
      tleCache: 'FALLBACK',
      fetchedAt: '2026-09-28T00:00:00.000Z',
    };
  });
  await layer.update({ scene: { primitives: { remove() {} } } });
  const stats = layer.getStats();
  assert.equal(stats.status, 'fallback');
  assert.match(stats.source, /AMSAT amateur TLE fallback/);
  assert.match(stats.source, /CelesTrak unreachable/);
  assert.match(stats.source, /epoch /);
  assert.match(stats.loadingLabel, /not telemetry/);
  assert.equal(layerFeedState(stats), 'fallback');
  assert.match(meta(stats), /^FALLBACK · /);
  assert.equal(layer.findByQuery(25544).telemetry, false);
  assert.equal(
    layer.getNextSatellitePass(25544, AUSTIN).basis,
    'sgp4-elements',
  );
  const cls = classifyLayer('satellites', stats, { enabled: true });
  assert.match(cls.fallback, /AMSAT/);
});
