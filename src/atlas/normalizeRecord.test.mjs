import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecord } from './normalizeRecord.js';
import { deriveRecordClass, DATA_SOURCES } from './dataSourceRegistry.js';

test('normalizeRecord keeps observation, publication and retrieval separate', () => {
  const r = normalizeRecord({
    layerId: 'earthquakes',
    providerId: 'us7000xyz',
    observedAt: 1_000,
    publishedAt: 2_000,
    retrievedAt: 3_000,
    geometry: { lon: -98, lat: 30 },
    precision: 'approx',
  });
  assert.equal(r.id, 'earthquakes:us7000xyz');
  assert.equal(r.observedAt, 1_000);
  assert.equal(r.publishedAt, 2_000);
  assert.equal(r.retrievedAt, 3_000);
  assert.equal(r.recordClass, 'observed');
  assert.ok(r.attribution);
  assert.equal(r.license, DATA_SOURCES.earthquakes.license);
});

test('normalizeRecord never invents an observation time from retrieval', () => {
  const r = normalizeRecord({
    layerId: 'earthquakes',
    providerId: 'x',
    retrievedAt: 9_000,
  });
  assert.equal(r.observedAt, null);
  assert.equal(r.publishedAt, null);
  assert.equal(r.retrievedAt, 9_000);
});

test('satellites and wind are predicted/forecast, not observed', () => {
  assert.equal(deriveRecordClass(DATA_SOURCES.satellites), 'predicted');
  assert.equal(deriveRecordClass(DATA_SOURCES.wind), 'forecast');
  assert.equal(
    normalizeRecord({ layerId: 'satellites', providerId: '25544' }).recordClass,
    'predicted',
  );
});

test('normalizeRecord requires stable ids', () => {
  assert.throws(() => normalizeRecord({ layerId: 'earthquakes' }));
});
