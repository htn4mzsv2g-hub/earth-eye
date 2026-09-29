import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mayRetainFeed,
  mayRetainLayer,
  retentionVerdict,
  listRetentionCatalog,
} from './retentionPolicy.js';
import { COLLECTION_POLICIES } from './policies.js';
import { createPermittedHistoryMiddleware } from './historyApi.js';
import { createCollectionStore } from './store.js';

test('usgs and nws may retain; lightning and adsbdb routes may not', () => {
  assert.equal(mayRetainFeed('usgs-earthquakes'), true);
  assert.equal(mayRetainFeed('nws-weather-alerts'), true);
  assert.equal(mayRetainFeed('weather-lightning'), false);
  assert.equal(mayRetainFeed('adsbdb-routes'), false);
  assert.equal(mayRetainFeed('cctv-frames'), false);
  assert.equal(mayRetainFeed('unknown-feed'), false);
});

test('every scheduled collection policy has an explicit retain rule', () => {
  for (const p of COLLECTION_POLICIES) {
    assert.equal(
      mayRetainFeed(p.id),
      true,
      `${p.id} must be retain-class before scheduling`,
    );
  }
});

test('retentionVerdict never invents retain for unknown', () => {
  const v = retentionVerdict('made-up-source');
  assert.equal(v.retainsObservations, false);
  assert.equal(v.class, 'unknown');
});

test('catalog marks forbidden honestly', () => {
  const cat = listRetentionCatalog();
  const lightning = cat.find((c) => c.id === 'weather-lightning');
  assert.ok(lightning);
  assert.equal(lightning.retainsObservations, false);
  assert.match(lightning.reason, /Vaisala/i);
});

test('permitted-history API refuses lightning and returns empty for unknown empty store', async () => {
  const store = createCollectionStore({ dataDir: null, now: () => 1_000 });
  const sched = {
    store,
    status: () => ({ continuousClaim: false }),
  };
  const mw = createPermittedHistoryMiddleware({ getScheduler: () => sched });

  const forbid = await invoke(mw, '/weather-lightning');
  assert.equal(forbid.status, 403);
  assert.deepEqual(forbid.body.records, []);

  const empty = await invoke(mw, '/usgs-earthquakes');
  assert.equal(empty.status, 200);
  assert.equal(empty.body.ok, true);
  assert.deepEqual(empty.body.records, []);
  assert.match(empty.body.note || '', /No retained|not collected/i);

  store.apply('usgs-earthquakes', [
    {
      id: 'earthquakes:x',
      layerId: 'earthquakes',
      observedAt: 900,
      publishedAt: 900,
      retrievedAt: 1000,
      recordClass: 'observed',
      geometry: { lon: -97.7, lat: 30.3 },
      props: { mag: 3.1 },
    },
  ]);
  const got = await invoke(mw, '/usgs-earthquakes?limit=10');
  assert.equal(got.status, 200);
  assert.equal(got.body.records.length, 1);
  assert.equal(got.body.records[0].props.mag, 3.1);
});

function invoke(mw, url) {
  return new Promise((resolve) => {
    const req = { method: 'GET', url };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(body) {
        resolve({
          status: this.statusCode,
          body: JSON.parse(body || '{}'),
        });
      },
    };
    mw(req, res);
  });
}

test('flights layer is not wholly retainable while adsbdb-routes is forbid', () => {
  assert.equal(mayRetainLayer('flights'), false);
  assert.equal(mayRetainLayer('earthquakes'), true);
});
