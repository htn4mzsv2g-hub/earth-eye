import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCollectionStore } from '../server/collection/store.js';
import { createCollectionScheduler } from '../server/collection/scheduler.js';
import {
  COLLECTION_POLICIES,
  SOURCE_REVIEW_QUEUE,
} from '../server/collection/policies.js';
import { fetchUsgsEarthquakes } from '../server/collection/adapters.js';

test('collection store upserts idempotently and rejects older observations', () => {
  const store = createCollectionStore({ now: () => 10_000, dataDir: null });
  store.apply('usgs-earthquakes', [
    {
      id: 'earthquakes:a',
      layerId: 'earthquakes',
      observedAt: 5_000,
      publishedAt: 6_000,
      retrievedAt: 10_000,
      recordClass: 'observed',
      geometry: null,
      props: {},
    },
  ]);
  store.apply('usgs-earthquakes', [
    {
      id: 'earthquakes:a',
      layerId: 'earthquakes',
      observedAt: 4_000, // older — ignore
      publishedAt: 6_000,
      retrievedAt: 10_000,
      recordClass: 'observed',
      geometry: null,
      props: {},
    },
  ]);
  assert.equal(store.list('usgs-earthquakes')[0].observedAt, 5_000);
  store.apply('usgs-earthquakes', [
    {
      id: 'earthquakes:a',
      layerId: 'earthquakes',
      observedAt: 7_000,
      publishedAt: 8_000,
      retrievedAt: 10_000,
      recordClass: 'observed',
      geometry: null,
      props: {},
    },
  ]);
  assert.equal(store.list('usgs-earthquakes')[0].observedAt, 7_000);
});

test('review queue sources are never in the active collection policies', () => {
  const active = new Set(COLLECTION_POLICIES.map((p) => p.id));
  for (const r of SOURCE_REVIEW_QUEUE)
    assert.equal(active.has(r.id), false, r.id);
});

test('scheduler continuousClaim stays false without Option C env + durable dir', () => {
  const prevC = process.env.EE_COLLECTION_CONTINUOUS;
  const prevD = process.env.EE_COLLECTION_DATA_DIR;
  delete process.env.EE_COLLECTION_CONTINUOUS;
  delete process.env.EE_COLLECTION_DATA_DIR;
  try {
    const sched = createCollectionScheduler({
      enabled: true,
      store: createCollectionStore({ dataDir: null }),
    });
    const st = sched.status();
    assert.equal(st.continuousClaim, false);
    assert.match(st.note || '', /awake|Continuous claim|auto-stop/i);
  } finally {
    if (prevC === undefined) delete process.env.EE_COLLECTION_CONTINUOUS;
    else process.env.EE_COLLECTION_CONTINUOUS = prevC;
    if (prevD === undefined) delete process.env.EE_COLLECTION_DATA_DIR;
    else process.env.EE_COLLECTION_DATA_DIR = prevD;
  }
});

test('scheduler continuousClaim is true only with continuous env + writable data dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-coll-'));
  const prevC = process.env.EE_COLLECTION_CONTINUOUS;
  const prevD = process.env.EE_COLLECTION_DATA_DIR;
  process.env.EE_COLLECTION_CONTINUOUS = '1';
  process.env.EE_COLLECTION_DATA_DIR = dir;
  try {
    const store = createCollectionStore({ dataDir: dir });
    assert.equal(store.durable.ready, true);
    const sched = createCollectionScheduler({ enabled: true, store });
    sched.start();
    const st = sched.status();
    assert.equal(st.continuousClaim, true);
    assert.equal(st.durable.ready, true);
    sched.stop();
  } finally {
    if (prevC === undefined) delete process.env.EE_COLLECTION_CONTINUOUS;
    else process.env.EE_COLLECTION_CONTINUOUS = prevC;
    if (prevD === undefined) delete process.env.EE_COLLECTION_DATA_DIR;
    else process.env.EE_COLLECTION_DATA_DIR = prevD;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('durable store survives recreate from the same data dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-coll-'));
  try {
    const a = createCollectionStore({ now: () => 10_000, dataDir: dir });
    a.apply('usgs-earthquakes', [
      {
        id: 'earthquakes:persist',
        layerId: 'earthquakes',
        observedAt: 9_000,
        publishedAt: 9_500,
        retrievedAt: 10_000,
        recordClass: 'observed',
        geometry: null,
        props: { place: 'demo' },
      },
    ]);
    assert.equal(a.count('usgs-earthquakes'), 1);
    const b = createCollectionStore({ now: () => 11_000, dataDir: dir });
    assert.equal(b.count('usgs-earthquakes'), 1);
    assert.equal(b.list('usgs-earthquakes')[0].id, 'earthquakes:persist');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scheduler collectNow records success health', async () => {
  const store = createCollectionStore({ dataDir: null });
  const sched = createCollectionScheduler({
    enabled: true,
    store,
    adapters: {
      'usgs-geojson': async () => ({
        records: [
          {
            id: 'earthquakes:x',
            layerId: 'earthquakes',
            observedAt: Date.now() - 60_000,
            publishedAt: Date.now() - 30_000,
            retrievedAt: Date.now(),
            recordClass: 'observed',
            geometry: null,
            props: {},
          },
        ],
      }),
      'nhc-current': async () => {
        const e = new Error('deferred');
        e.code = 'adapter-deferred';
        throw e;
      },
      'firms-csv': async () => {
        const e = new Error('deferred');
        e.code = 'adapter-deferred';
        throw e;
      },
    },
  });
  await sched.collectNow('usgs-earthquakes');
  const h = store.getHealth('usgs-earthquakes');
  assert.ok(h.lastSuccessAt);
  assert.equal(h.records, 1);
  sched.stop();
});

test('USGS adapter normalizes observation ≠ publication ≠ retrieval', async () => {
  const payload = {
    features: [
      {
        id: 'us7000demo',
        geometry: { type: 'Point', coordinates: [-98.5, 30.1, 10] },
        properties: {
          time: 1_000,
          updated: 2_000,
          mag: 4.1,
          place: 'demo',
          url: 'https://example.test/eq',
        },
      },
    ],
  };
  const { records } = await fetchUsgsEarthquakes({
    fetchImpl: async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].observedAt, 1_000);
  assert.equal(records[0].publishedAt, 2_000);
  assert.ok(records[0].retrievedAt > 2_000);
  assert.equal(records[0].recordClass, 'observed');
  assert.equal(records[0].id, 'earthquakes:us7000demo');
});
