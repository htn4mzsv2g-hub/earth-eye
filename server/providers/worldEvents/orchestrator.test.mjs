import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldEventsOrchestrator } from './orchestrator.js';
import { fetchReliefWebWorldEvents } from './sources/reliefweb.js';
import { fetchFirmsWorldEvents } from './sources/tierA.js';
import { normalizeGdeltArticleToWorldEvent } from '../../../src/events/adapters/gdelt.js';

test('ReliefWeb live path is PERMISSION HELD without fetching', async () => {
  const result = await fetchReliefWebWorldEvents();
  assert.equal(result.health, 'PERMISSION HELD');
  assert.equal(result.events.length, 0);
  assert.match(result.reason, /do not scrape/i);
});

test('FIRMS without key is NEEDS KEY and does not call upstream', async () => {
  let called = false;
  const result = await fetchFirmsWorldEvents({
    mapKey: '',
    fetchImpl: async () => {
      called = true;
      throw new Error('should not fetch');
    },
  });
  assert.equal(result.health, 'NEEDS KEY');
  assert.equal(called, false);
  assert.equal(result.events.length, 0);
});

test('orchestrator merges mocked sources with honest health', async () => {
  const responses = {
    'api.weather.gov': {
      features: [
        {
          id: 'urn:oid:test:1',
          properties: {
            id: 'urn:oid:test:1',
            event: 'Flood Watch',
            severity: 'Severe',
            areaDesc: 'Travis',
            onset: '2026-09-29T12:00:00Z',
            expires: '2026-09-30T12:00:00Z',
            senderName: 'NWS',
            status: 'Actual',
            urgency: 'Expected',
            certainty: 'Possible',
            '@id': 'https://api.weather.gov/alerts/urn:oid:test:1',
          },
          geometry: null,
        },
      ],
    },
    'earthquake.usgs.gov': {
      features: [
        {
          id: 'us7000test',
          geometry: { type: 'Point', coordinates: [-98.1, 30.4, 10] },
          properties: {
            mag: 3.2,
            place: '5 km N of Austin, TX',
            time: Date.parse('2026-09-29T10:00:00.000Z'),
          },
        },
      ],
    },
    'nhc.noaa.gov': { activeStorms: [] },
    'arcgis.com': { type: 'FeatureCollection', features: [] },
    'gdacs.org': {
      features: [
        {
          type: 'Feature',
          properties: {
            eventid: 1,
            eventtype: 'EQ',
            name: 'Test EQ',
            alertlevel: 'Orange',
            country: 'X',
            fromdate: '2026-09-28T00:00:00Z',
          },
          geometry: { type: 'Point', coordinates: [12, 41] },
        },
      ],
    },
    'gdeltproject.org': {
      articles: [
        {
          url: 'https://example.com/story',
          title: 'Storm approaches coast',
          seendate: '20260929T080000Z',
          sourcecountry: 'United States',
        },
      ],
    },
  };

  const fetchImpl = async (url) => {
    const u = String(url);
    let body = { features: [] };
    for (const [host, payload] of Object.entries(responses)) {
      if (u.includes(host)) {
        body = payload;
        break;
      }
    }
    if (u.includes('firms.modaps')) {
      return {
        ok: false,
        status: 403,
        body: { cancel: async () => {} },
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => body,
      text: async () => JSON.stringify(body),
      body: { cancel: async () => {} },
    };
  };

  // Patch readResponseJsonCapped path: our fetchImpl must work with readResponseJsonCapped
  // which reads the body stream. Provide a minimal Response-like with arrayBuffer/text.
  const fetchImpl2 = async (url) => {
    const u = String(url);
    let body = { features: [] };
    for (const [host, payload] of Object.entries(responses)) {
      if (u.includes(host)) {
        body = payload;
        break;
      }
    }
    if (u.includes('firms.modaps')) {
      return new Response('no', { status: 403 });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const orch = createWorldEventsOrchestrator({
    fetchImpl: fetchImpl2,
    now: () => Date.parse('2026-09-29T12:00:00.000Z'),
  });
  // Ensure FIRMS sees no key
  const prev = process.env.FIRMS_MAP_KEY;
  delete process.env.FIRMS_MAP_KEY;
  try {
    const status = await orch.status();
    assert.equal(status.slice, 'EE-EVENTS-1');
    assert.ok(status.live);
    const byId = Object.fromEntries(status.sources.map((s) => [s.id, s]));
    assert.equal(byId['nws-alerts'].health, 'READY');
    assert.equal(byId['usgs-earthquakes'].health, 'READY');
    assert.equal(byId['nasa-firms'].health, 'NEEDS KEY');
    assert.equal(byId.reliefweb.health, 'PERMISSION HELD');
    assert.equal(byId.gdacs.health, 'READY');
    assert.equal(byId.gdelt.health, 'READY');
    // Empty cyclone / perimeter feeds are EMPTY not fake LIVE
    assert.equal(byId['noaa-cyclones'].health, 'EMPTY');
    assert.equal(byId['wfigs-perimeters'].health, 'EMPTY');

    const list = await orch.listEvents({ limit: 50 });
    assert.ok(list.count >= 3);
    assert.ok(list.events.every((e) => e.eventId.includes(':')));
    assert.ok(list.events.some((e) => e.kind === 'NEWS REPORT'));
    assert.ok(list.events.some((e) => e.kind === 'OFFICIAL ALERT'));
    // No fabricated: every event has sources
    assert.ok(list.events.every((e) => e.sources?.length));
    // GDELT never point precision
    for (const e of list.events.filter((x) => x.kind === 'NEWS REPORT')) {
      assert.notEqual(e.precision, 'point');
    }
  } finally {
    if (prev != null) process.env.FIRMS_MAP_KEY = prev;
  }
});

test('GDELT normalizer rejects missing url/title (no fabrications)', () => {
  assert.equal(normalizeGdeltArticleToWorldEvent({ title: 'x' }), null);
  assert.equal(normalizeGdeltArticleToWorldEvent({ url: 'https://x.com/a' }), null);
});
