import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_SUMMARIES_ENABLED,
  COMMAND_STATUS,
  MAX_RESULTS,
  TOOL_SCHEMAS,
  createAnalystTools,
  parseAnalystInput,
  validateArgs,
  withTimeout,
} from './analystTools.js';

const CAMS = [
  {
    id: 'a',
    name: 'Near still',
    provider: 'Caltrans',
    lat: 30.27,
    lon: -97.74,
    media: { kind: 'still' },
  },
  {
    id: 'b',
    name: 'Near live',
    provider: 'DelDOT',
    lat: 30.3,
    lon: -97.7,
    media: { kind: 'live' },
  },
  {
    id: 'c',
    name: 'Far',
    provider: 'TfL',
    lat: 51.5,
    lon: -0.12,
    media: { kind: 'clip' },
  },
];

function makeTools(over = {}) {
  const calls = [];
  const tools = createAnalystTools({
    geocode: async () => ({
      results: [
        {
          formatted_address: 'Austin, Texas, United States',
          geometry: { location: { lat: 30.2672, lng: -97.7431 } },
          types: ['locality'],
        },
      ],
    }),
    runAction: async (name, args) => {
      calls.push([name, args]);
      if (name === 'analyst_query')
        return {
          ok: true,
          items: [
            {
              layerKey: 'earthquakes',
              id: 'us1',
              place: '10 km N of X',
              magnitude: 4.2,
              distanceKm: 12.5,
            },
          ],
          coverage: { note: 'from loaded data' },
        };
      return { ok: true };
    },
    getCameras: async () => CAMS,
    sources: {
      getSourceStatus: (id) => ({
        id,
        name: id,
        status: 'NEAR LIVE',
        retrievedAt: 1_700_000_000_000,
        observedAt: null,
        enabled: true,
        disabled: false,
        sourceUrl: 'https://earthquake.usgs.gov/',
      }),
    },
    isLayerOn: () => true,
    openCamera: (id) => calls.push(['openCamera', id]),
    ...over,
  });
  return { tools, calls };
}

test('AI summaries are off in this build', () => {
  assert.equal(AI_SUMMARIES_ENABLED, false);
});

test('queries and map actions are separate tool kinds', () => {
  const kinds = Object.fromEntries(
    Object.entries(TOOL_SCHEMAS).map(([k, v]) => [k, v.kind]),
  );
  assert.equal(kinds.resolve_place, 'query');
  assert.equal(kinds.query_entities, 'query');
  assert.equal(kinds.locate_cameras, 'query');
  assert.equal(kinds.source_health, 'query');
  assert.equal(kinds.inspect_entity, 'query');
  assert.equal(kinds.satellite_pass, 'query');
  assert.equal(kinds.ai_status, 'query');
  assert.equal(kinds.selected_entity, 'query');
  assert.equal(kinds.fly_to, 'action');
  assert.equal(kinds.select_entity, 'action');
  assert.equal(kinds.set_layer, 'action');
  assert.equal(kinds.stop_follow, 'action');
  assert.equal(kinds.control_cockpit, 'action');
  assert.equal(kinds.annotate, 'action');
  assert.equal(kinds.clear_annotations, 'action');
  assert.equal(kinds.control_scene, 'action');
});

test('schema validation refuses unknown, missing, out-of-range and over-limit args', () => {
  assert.equal(validateArgs('nope', {}).ok, false);
  assert.match(validateArgs('fly_to', { lat: 1 }).error, /Missing "lon"/);
  assert.match(validateArgs('fly_to', { lat: 91, lon: 0 }).error, /-90 to 90/);
  assert.match(
    validateArgs('fly_to', { lat: 1, lon: 2, extra: 1 }).error,
    /Unknown argument/,
  );
  assert.match(
    validateArgs('locate_cameras', { lat: 1, lon: 2, limit: MAX_RESULTS + 1 })
      .error,
    /limit/,
  );
  assert.match(
    validateArgs('locate_cameras', { lat: 1, lon: 2, mediaKind: 'hd' }).error,
    /one of/,
  );
  assert.match(
    validateArgs('query_entities', { layerId: 'cctv', lat: 1, lon: 2 }).error,
    /one of/,
  );
  assert.equal(
    validateArgs('resolve_place', { query: 'x'.repeat(121) }).ok,
    false,
  );
  assert.equal(
    validateArgs('set_layer', { layerId: 'x', on: 'yes' }).ok,
    false,
  );
  assert.deepEqual(validateArgs('resolve_place', { query: '  Austin ' }), {
    ok: true,
    args: { query: 'Austin' },
  });
});

test('timeouts reject slow tools', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20), /timed out/);
  const { tools } = makeTools({
    getCameras: () => new Promise(() => {}),
    timeoutMs: 20,
  });
  const r = await tools.run('locate_cameras', { lat: 30, lon: -97 });
  assert.equal(r.ok, false);
  assert.match(r.error, /timed out/);
});

test('resolve_place: coordinates, airport gazetteer, then the geocoder with citation', async () => {
  const { tools } = makeTools();
  const c = await tools.run('resolve_place', { query: '30.27, -97.74' });
  assert.equal(c.items[0].lat, 30.27);
  const a = await tools.run('resolve_place', { query: 'DFW' });
  assert.match(a.items[0].label, /Dallas/);
  assert.match(a.citations[0].provider, /airport gazetteer/);
  const g = await tools.run('resolve_place', { query: 'Austin' });
  assert.equal(g.ok, true);
  assert.equal(g.items[0].lon, -97.7431);
  assert.match(g.citations[0].provider, /Nominatim/);
  assert.ok(
    g.citations[0].url.startsWith('https://nominatim.openstreetmap.org'),
  );
});

test('resolve_place reports "no place found" instead of guessing', async () => {
  const { tools } = makeTools({ geocode: async () => ({ results: [] }) });
  const r = await tools.run('resolve_place', { query: 'Zzyzxqq' });
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 0);
  assert.match(r.note, /No place found/);
});

test('locate_cameras: nearest first, radius, media filter, citations per provider', async () => {
  const { tools } = makeTools();
  const r = await tools.run('locate_cameras', {
    lat: 30.27,
    lon: -97.74,
    radiusKm: 50,
  });
  assert.deepEqual(
    r.items.map((x) => x.id),
    ['a', 'b'],
  );
  assert.equal(r.total, 2);
  assert.deepEqual(r.citations.map((c) => c.provider).sort(), [
    'Caltrans',
    'DelDOT',
  ]);
  const live = await tools.run('locate_cameras', {
    lat: 30.27,
    lon: -97.74,
    mediaKind: 'live',
  });
  assert.deepEqual(
    live.items.map((x) => x.id),
    ['b'],
  );
  assert.match(live.items[0].detail, /LIVE VIDEO/);
  const lim = await tools.run('locate_cameras', {
    lat: 30.27,
    lon: -97.74,
    limit: 1,
  });
  assert.equal(lim.items.length, 1);
});

test('query_entities uses analyst_query over loaded data and never turns a layer on', async () => {
  const { tools, calls } = makeTools();
  const r = await tools.run('query_entities', {
    layerId: 'earthquakes',
    lat: 35,
    lon: 139,
    radiusKm: 300,
  });
  assert.equal(r.ok, true);
  assert.equal(r.status, COMMAND_STATUS.SUCCESS);
  assert.equal(r.items[0].id, 'us1');
  assert.match(r.items[0].detail, /M4.2/);
  assert.equal(r.items[0].identity?.type, 'earthquakes');
  assert.equal(calls[0][0], 'analyst_query');
  assert.deepEqual(calls[0][1].scope, {
    kind: 'radius',
    center: { lat: 35, lon: 139 },
    km: 300,
  });
  assert.ok(r.citations[0].provider);
  // EE-LIVE-5: display off still queries; never auto-enables (SHOW ON MAP separate).
  const off = makeTools({ isLayerOn: () => false });
  const r2 = await off.tools.run('query_entities', {
    layerId: 'earthquakes',
    lat: 35,
    lon: 139,
  });
  assert.equal(r2.ok, true);
  assert.equal(off.calls.length, 1);
  assert.equal(off.calls[0][0], 'analyst_query');
  assert.match(r2.note, /display is off|SHOW ON MAP/i);
  assert.equal(r2.status, COMMAND_STATUS.PARTIAL);
});

test('source_health reads the registry status; unknown layer is an error', async () => {
  const { tools } = makeTools();
  const one = await tools.run('source_health', { layerId: 'earthquakes' });
  assert.equal(one.items.length, 1);
  assert.match(one.items[0].detail, /NEAR LIVE/);
  const all = await tools.run('source_health', {});
  assert.ok(all.items.length > 10);
  const bad = await tools.run('source_health', { layerId: 'nope' });
  assert.equal(bad.ok, false);
});

test('map actions: fly_to, select camera by stable id, set_layer respects the permission gate', async () => {
  const { tools, calls } = makeTools({
    openCamera: (id) => {
      calls.push(['openCamera', id]);
      return { ok: true, status: 'SUCCESS', known: true, id };
    },
  });
  const fly = await tools.run('fly_to', { lat: 30, lon: -97 });
  assert.equal(fly.ok, true);
  assert.equal(fly.status, COMMAND_STATUS.SUCCESS);
  assert.deepEqual(calls.at(-1), [
    'fly_to_location',
    { latitude: 30, longitude: -97, viewMode: 'overview' },
  ]);
  const cam = await tools.run('select_entity', {
    layerId: 'cctv',
    id: 'caltrans:123',
  });
  assert.equal(cam.ok, true);
  assert.equal(cam.status, COMMAND_STATUS.SUCCESS);
  assert.equal(cam.items[0].identity?.id, 'caltrans:123');
  assert.deepEqual(calls.at(-1), ['openCamera', 'caltrans:123']);
  assert.equal(
    (await tools.run('set_layer', { layerId: 'earthquakes', on: true })).ok,
    true,
  );
  const radio = await tools.run('set_layer', { layerId: 'radio', on: true });
  assert.equal(radio.ok, false);
  assert.match(radio.error, /pending permission review/);
  assert.equal(
    (await tools.run('set_layer', { layerId: 'nope', on: true })).ok,
    false,
  );
});

test('the Analyst box parser is deterministic and refuses what it does not know', () => {
  assert.deepEqual(
    parseAnalystInput('cameras near Austin').plan.map(
      (s) => s.tool || s.center,
    ),
    ['resolve_place', 'locate_cameras'],
  );
  const eq = parseAnalystInput('Earthquakes near Tokyo within 300 km');
  assert.equal(eq.plan[0].args.query, 'tokyo');
  assert.deepEqual(eq.plan[1].args, { layerId: 'earthquakes', radiusKm: 300 });
  assert.deepEqual(parseAnalystInput('live cameras').plan[0], {
    center: 'view',
  });
  assert.equal(
    parseAnalystInput('live cameras').plan[1].args.mediaKind,
    'live',
  );
  assert.equal(parseAnalystInput('fly to Denver').plan[1].tool, 'fly_to');
  assert.equal(
    parseAnalystInput('source health').plan[0].tool,
    'source_health',
  );
  assert.deepEqual(parseAnalystInput('show earthquakes').plan[0].args, {
    layerId: 'earthquakes',
    on: true,
  });
  assert.equal(
    parseAnalystInput('flights near DFW').plan[1].args.layerId,
    'flights',
  );
  assert.match(parseAnalystInput('write me a poem').error, /Not understood/);
  assert.match(parseAnalystInput('').error, /Type a question/);
});

test('ai_status reports summaries off; stop_follow and cockpit call runAction', async () => {
  const { tools, calls } = makeTools();
  const ai = await tools.run('ai_status', {});
  assert.equal(ai.ok, true);
  assert.equal(ai.status, COMMAND_STATUS.UNAVAILABLE);
  assert.match(ai.items[0].label, /off/i);
  assert.match(ai.note, /UNAVAILABLE|off/i);
  assert.equal((await tools.run('stop_follow', {})).ok, true);
  assert.equal(calls.at(-1)[0], 'stop_tracking');
  assert.equal(
    (await tools.run('control_cockpit', { action: 'exit' })).ok,
    true,
  );
  assert.deepEqual(calls.at(-1), ['control_cockpit', { action: 'exit' }]);
});

test('parser understands iss pass, ai status and stop following', () => {
  assert.equal(parseAnalystInput('ai status').plan[0].tool, 'ai_status');
  assert.equal(parseAnalystInput('stop following').plan[0].tool, 'stop_follow');
  assert.equal(
    parseAnalystInput('iss pass').plan.at(-1).tool,
    'satellite_pass',
  );
});

test('set_layer refuses excluded and held sources (Stage 3.5)', async () => {
  const calls = [];
  const tools = createAnalystTools({
    runAction: async (name, args) => {
      calls.push({ name, args });
      return { ok: true };
    },
    isLayerOn: () => false,
    sources: { getSourceStatus: () => ({ status: 'ok' }) },
  });
  const alpr = await tools.run('set_layer', {
    layerId: 'alpr-cameras',
    on: true,
  });
  assert.equal(alpr.ok, false);
  assert.match(
    String(alpr.error || ''),
    /not allowed|excluded|policy|disabled|held|refused|Unknown|cannot/i,
  );
  // Traffic is approved for keyed TomTom road conditions; sim dots stay prod-blocked in the layer.
  const traffic = await tools.run('set_layer', {
    layerId: 'traffic',
    on: true,
  });
  assert.equal(traffic.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.layerId, 'traffic');
});

test('query_entities cites provenance and refuses unknown layer', async () => {
  const tools = createAnalystTools({
    runAction: async () => ({
      ok: true,
      items: [{ id: 'x', label: 'X', distanceKm: 1 }],
      count: 1,
    }),
    isLayerOn: () => true,
    sources: {
      getSourceStatus: (id) => ({
        status: 'online',
        provider: 'test-provider',
        lastSuccessAt: Date.now() - 1000,
      }),
    },
  });
  const bad = await tools.run('query_entities', {
    layerId: 'not-a-layer',
    lat: 30,
    lon: -97,
  });
  assert.equal(bad.ok, false);
});

test('annotate_map wraps annotations array (Stage 3 action layer)', async () => {
  const calls = [];
  const tools = createAnalystTools({
    runAction: async (name, args) => {
      calls.push({ name, args });
      return { ok: true, drawn: 1 };
    },
    isLayerOn: () => true,
    sources: { getSourceStatus: () => ({}) },
  });
  const r = await tools.run('annotate', {
    type: 'pin',
    lat: 30.27,
    lon: -97.74,
    label: 'QA',
  });
  assert.equal(r.ok, true);
  assert.equal(calls[0].name, 'annotate_map');
  assert.equal(calls[0].args.annotations[0].type, 'pin');
  assert.equal(calls[0].args.annotations[0].latitude, 30.27);
});

test('EE-LIVE-5: locate_cameras uses rankCameras and empty-area copy', async () => {
  const { tools } = makeTools();
  const r = await tools.run('locate_cameras', {
    lat: 30.27,
    lon: -97.74,
    radiusKm: 50,
  });
  assert.equal(r.ok, true);
  assert.equal(r.status, COMMAND_STATUS.SUCCESS);
  assert.ok(r.items[0].identity?.type === 'cctv');
  assert.match(r.items[0].detail, /LIVE VIDEO|STILL IMAGE|VIDEO CLIP/);
  const empty = await tools.run('locate_cameras', {
    lat: 0,
    lon: 0,
    radiusKm: 5,
  });
  assert.equal(empty.ok, true);
  assert.match(empty.note, /NO PUBLIC CAMERAS FOUND IN THIS AREA/);
});

test('EE-LIVE-5: selected_entity shares exact Earth Eye identity', async () => {
  const identity = {
    id: 'flights:abc',
    type: 'flights',
    source: 'ADS-B',
    layerId: 'flights',
    providerId: 'abc',
    label: 'TEST1',
    lat: 30,
    lon: -97,
  };
  const { tools } = makeTools({ getSelectedIdentity: () => identity });
  const r = await tools.run('selected_entity', {});
  assert.equal(r.ok, true);
  assert.equal(r.status, COMMAND_STATUS.SUCCESS);
  assert.equal(r.items[0].identity.id, 'flights:abc');
  assert.equal(r.items[0].identity.type, 'flights');
  assert.equal(r.items[0].identity.source, 'ADS-B');
  assert.equal(
    parseAnalystInput('selected entity').plan[0].tool,
    'selected_entity',
  );
  const none = makeTools({ getSelectedIdentity: () => null });
  const empty = await none.tools.run('selected_entity', {});
  assert.equal(empty.items.length, 0);
  assert.match(empty.note, /No entity selected/);
});

test('EE-LIVE-5: select_entity camera FAILED when viewer reports not found', async () => {
  const { tools } = makeTools({
    openCamera: () => ({
      ok: false,
      status: 'FAILED',
      error: 'This camera is not in the current camera catalog.',
    }),
  });
  const r = await tools.run('select_entity', {
    layerId: 'cctv',
    id: 'missing:1',
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, COMMAND_STATUS.FAILED);
  assert.match(r.error, /not in the current camera catalog/);
});

test('EE-LIVE-5: select_entity UNAVAILABLE when openCamera missing', async () => {
  const { tools } = makeTools({ openCamera: undefined });
  // makeTools spreads over defaults — force missing by rebuilding
  const tools2 = createAnalystTools({
    runAction: async () => ({ ok: true }),
    getCameras: async () => [],
    sources: { getSourceStatus: () => ({}) },
    isLayerOn: () => true,
  });
  const r = await tools2.run('select_entity', { layerId: 'cctv', id: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.status, COMMAND_STATUS.UNAVAILABLE);
});

test('EE-EVENTS-4: selected World Event detail and related cameras use shared identity/ranking', async () => {
  const event = {
    eventId: 'usgs:evt-1',
    title: 'Test quake',
    kind: 'PUBLIC DATA OBSERVATION',
    sources: ['USGS'],
    attribution: {
      credit: 'USGS',
      sourceLinks: ['https://earthquake.usgs.gov/'],
    },
    precision: 'point',
    geometry: { type: 'Point', coordinates: [-97.74, 30.27] },
    eventTime: { start: '2026-09-29T10:00:00Z' },
    retrievedAt: '2026-09-29T10:01:00Z',
  };
  const { tools } = makeTools({ getSelectedWorldEvent: () => event });
  const detail = await tools.run('event_detail', {});
  assert.equal(detail.status, COMMAND_STATUS.SUCCESS);
  assert.equal(detail.items[0].identity.type, 'world-events');
  assert.equal(detail.items[0].identity.id, 'usgs:evt-1');
  assert.match(detail.citations[0].provider, /USGS/);

  const cams = await tools.run('related_cameras', { radiusKm: 50, limit: 2 });
  assert.equal(cams.status, COMMAND_STATUS.SUCCESS);
  assert.deepEqual(
    cams.items.map((x) => x.id),
    ['a', 'b'],
  );
  assert.ok(cams.items[0].distanceKm <= cams.items[1].distanceKm);
  assert.match(cams.note, /RELATED/);
});

test('EE-EVENTS-4: detail action runs without 3D; show layer reports real availability', async () => {
  const event = {
    eventId: 'gdacs:evt-2',
    title: 'Test alert',
    kind: 'OFFICIAL ALERT',
    sources: ['GDACS'],
    precision: 'point',
    geometry: { type: 'Point', coordinates: [10, 20] },
  };
  const calls = [];
  const tools = createAnalystTools({
    graphicsFailed: true,
    getSelectedWorldEvent: () => event,
    openWorldEventDetail: (id) => {
      calls.push(['detail', id]);
      return { ok: true, status: 'SUCCESS' };
    },
    showWorldEventLayer: () => {
      calls.push(['layer']);
      return { ok: true, status: 'SUCCESS' };
    },
    getCameras: async () => [],
    getViewBounds: () => null,
    sources: { getSourceStatus: () => ({}) },
    isLayerOn: () => true,
  });
  const opened = await tools.run('open_event_detail', {});
  assert.equal(opened.status, COMMAND_STATUS.SUCCESS);
  assert.deepEqual(calls, [['detail', 'gdacs:evt-2']]);
  const shown = await tools.run('show_layer', { layerId: 'world-events' });
  assert.equal(shown.status, COMMAND_STATUS.UNAVAILABLE);
  assert.equal(calls.length, 1);
});

test('EE-EVENTS-4: Analyst parser exposes event query and same-state actions', () => {
  assert.equal(parseAnalystInput('event details').plan[0].tool, 'event_detail');
  assert.equal(
    parseAnalystInput('related cameras').plan[0].tool,
    'related_cameras',
  );
  assert.equal(
    parseAnalystInput('open event detail').plan[0].tool,
    'open_event_detail',
  );
  assert.deepEqual(parseAnalystInput('show world events').plan[0], {
    tool: 'show_layer',
    args: { layerId: 'world-events' },
  });
});
