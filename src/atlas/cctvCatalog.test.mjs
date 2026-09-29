import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MEDIA_BADGE,
  mediaKindOf,
  hasStill,
  filterCameras,
  sortCameras,
  paginate,
  countCameras,
  playableStatus,
  providerInfo,
  stepIndex,
} from './cctvCatalog.js';

const cams = [
  { id: 'a', name: '5th St / Congress', city: 'Austin', provider: 'Austin Transportation & Public Works', lat: 30.27, lon: -97.74, media: { kind: 'still', still: true } },
  { id: 'tfl-1', name: 'Trafalgar Square', city: 'London', provider: 'Transport for London', lat: 51.5, lon: -0.12, media: { kind: 'clip', clip: true, still: true } },
  { id: 'deldot-1', name: 'I-95 @ Newport', city: 'Wilmington', provider: 'DelDOT', lat: 39.71, lon: -75.6, media: { kind: 'live', live: true, still: false } },
  { id: 'tln-1', name: 'Viru väljak', city: 'Tallinn', provider: 'City of Tallinn', lat: 59.43, lon: 24.75, media: { kind: 'still', still: true } },
];

test('media badges are the three honest labels', () => {
  assert.equal(MEDIA_BADGE.live, 'LIVE VIDEO');
  assert.equal(MEDIA_BADGE.clip, 'VIDEO CLIP');
  assert.equal(MEDIA_BADGE.still, 'STILL IMAGE ONLY');
});

test('media kind comes from the server descriptor, with a feed-type fallback', () => {
  assert.deepEqual(cams.map(mediaKindOf), ['still', 'clip', 'live', 'still']);
  assert.equal(mediaKindOf({ feedType: 'hls' }), 'live');
  assert.equal(mediaKindOf({ feedType: 'mp4' }), 'clip');
  assert.equal(mediaKindOf({ feedType: 'image' }), 'still');
  assert.equal(hasStill(cams[1]), true);
  assert.equal(hasStill(cams[2]), false);
});

test('filters by media class, provider and accent-insensitive search', () => {
  assert.deepEqual(filterCameras(cams, { kinds: ['live'] }).map((c) => c.id), ['deldot-1']);
  assert.deepEqual(filterCameras(cams, { kinds: ['still', 'clip'] }).map((c) => c.id), ['a', 'tfl-1', 'tln-1']);
  assert.deepEqual(filterCameras(cams, { provider: 'Transport for London' }).map((c) => c.id), ['tfl-1']);
  assert.deepEqual(filterCameras(cams, { query: 'viru valjak' }).map((c) => c.id), ['tln-1']);
  assert.deepEqual(filterCameras(cams, { query: 'london trafalgar' }).map((c) => c.id), ['tfl-1']);
  assert.equal(filterCameras(cams, {}).length, 4);
  assert.equal(filterCameras(cams, { kinds: ['live'], provider: 'Caltrans' }).length, 0);
});

test('nearest-first sort from the view centre', () => {
  const sorted = sortCameras(cams, { lat: 51.4, lon: 0 });
  assert.equal(sorted[0].id, 'tfl-1');
  assert.ok(sorted[0]._km < 20);
  assert.equal(sorted[3].id, 'a');
  // Without a centre: provider then name, and the input is not mutated.
  const plain = sortCameras(cams);
  assert.equal(plain[0].provider, 'Austin Transportation & Public Works');
  assert.equal(cams[0]._km, undefined);
});

test('pagination clamps and reports totals', () => {
  const list = Array.from({ length: 95 }, (_, i) => i);
  assert.deepEqual(paginate(list, 0, 40).items.length, 40);
  assert.equal(paginate(list, 2, 40).items.length, 15);
  assert.equal(paginate(list, 9, 40).page, 2);
  assert.equal(paginate([], 0, 40).pages, 1);
});

test('counts by media class and provider', () => {
  const c = countCameras(cams);
  assert.equal(c.total, 4);
  assert.deepEqual(c.byKind, { live: 1, clip: 1, still: 2, none: 0 });
  assert.equal(c.byProvider.DelDOT.live, 1);
});

test('playable status only from real signals', () => {
  assert.equal(playableStatus(cams[0]), 'Not checked');
  assert.equal(playableStatus(cams[0], { load: 'ok' }), 'Image only');
  assert.equal(playableStatus(cams[2], { load: 'ok' }), 'Playable');
  assert.equal(playableStatus(cams[2], { load: 'error' }), 'Unavailable');
  assert.equal(playableStatus(cams[1], { health: { status: 'degraded' } }), 'Unavailable');
  assert.equal(playableStatus({ media: { kind: 'none' } }), 'Unavailable');
});

test('provider facts and prev/next stepping', () => {
  assert.equal(providerInfo('Fintraffic').stillRefreshMs, 600_000);
  assert.equal(providerInfo('Fintraffic').cadenceKnown, true);
  assert.equal(providerInfo('Caltrans').cadenceKnown, false);
  assert.match(providerInfo('Caltrans').cadence, /not published/);
  assert.equal(stepIndex(0, -1, 4), 3);
  assert.equal(stepIndex(3, 1, 4), 0);
  assert.equal(stepIndex(0, 1, 0), -1);
});

import { frameFreshness, mediaErrorState } from './cctvCatalog.js';

test('re-downloading an unchanged frame keeps its old time and is marked stale', () => {
  const a = frameFreshness(null, { hash: 'h1', frameTime: 1000, now: 5000 });
  assert.deepEqual([a.changed, a.stale, a.firstSeenAt, a.observedAt], [true, false, 5000, 1000]);
  // Same bytes, new download: not current.
  const b = frameFreshness(a, { hash: 'h1', frameTime: 1000, now: 65000 });
  assert.deepEqual([b.changed, b.stale, b.firstSeenAt], [false, true, 5000]);
  // Same provider time but re-encoded bytes: still the same observation.
  const c = frameFreshness(b, { hash: 'h2', frameTime: 1000, now: 125000 });
  assert.deepEqual([c.changed, c.stale, c.firstSeenAt], [false, true, 5000]);
  // No provider time: the hash decides.
  const d = frameFreshness(c, { hash: 'h3', frameTime: null, now: 185000 });
  assert.deepEqual([d.changed, d.stale, d.firstSeenAt, d.observedAt], [true, false, 185000, null]);
  const e = frameFreshness(d, { hash: 'h3', now: 245000 });
  assert.equal(e.stale, true);
  // New time and new bytes: fresh.
  const f = frameFreshness(e, { hash: 'h4', frameTime: 2000, now: 305000 });
  assert.deepEqual([f.changed, f.stale, f.firstSeenAt], [true, false, 305000]);
});

test('media failures map to separate error states', () => {
  assert.equal(mediaErrorState({ online: false, status: 200 }), 'offline');
  assert.equal(mediaErrorState({ status: 410 }), 'expired');
  assert.equal(mediaErrorState({ status: 403 }), 'expired');
  assert.equal(mediaErrorState({ mediaErrorCode: 4 }), 'unsupported');
  assert.equal(mediaErrorState({ hlsDetails: 'manifestIncompatibleCodecsError' }), 'unsupported');
  assert.equal(mediaErrorState({ status: 502 }), 'offline');
  assert.equal(mediaErrorState({ status: 404 }), 'unavailable');
});

test('mediaErrorState: HTTP status wins over a generic media error code', async () => {
  const { mediaErrorState } = await import('./cctvCatalog.js');
  // Native HLS / MP4 report a 410 playlist as code 4; the status says EXPIRED.
  assert.equal(mediaErrorState({ online: true, status: 410 }), 'expired');
  assert.equal(mediaErrorState({ online: true, status: 503 }), 'offline');
  assert.equal(mediaErrorState({ online: true, status: 404 }), 'unavailable');
  // Only when the URL answers OK is code 4 a format problem.
  assert.equal(mediaErrorState({ online: true, mediaErrorCode: 4 }), 'unsupported');
  assert.equal(mediaErrorState({ online: false, status: 410 }), 'offline');
});

import {
  MEDIA_LABELS,
  NO_PUBLIC_CAMERAS_IN_AREA,
  USEFUL_RADIUS_MAX_KM,
  formatCameraDistance,
  pointInViewBounds,
  rankCameras,
  usefulRadiusKm,
  viewDiagonalKm,
} from './cctvCatalog.js';

const austinBounds = {
  west: -97.9,
  south: 30.1,
  east: -97.5,
  north: 30.5,
};

const rankingCams = [
  {
    id: 'austin-inview',
    name: 'Congress Bridge',
    city: 'Austin',
    provider: 'Austin Transportation & Public Works',
    lat: 30.26,
    lon: -97.74,
    media: { kind: 'still', still: true },
  },
  {
    id: 'austin-near',
    name: 'I-35 Round Rock',
    city: 'Round Rock',
    provider: 'TxDOT',
    lat: 30.51,
    lon: -97.68,
    media: { kind: 'still', still: true },
  },
  {
    id: 'austin-live',
    name: 'Downtown live',
    city: 'Austin',
    provider: 'Austin Transportation & Public Works',
    lat: 30.265,
    lon: -97.745,
    media: { kind: 'live', live: true },
  },
  {
    id: 'dallas',
    name: 'I-35E Dallas',
    city: 'Dallas',
    provider: 'TxDOT',
    lat: 32.78,
    lon: -96.8,
    media: { kind: 'still', still: true },
  },
  {
    id: 'delaware',
    name: 'I-95 Newport',
    city: 'Wilmington',
    provider: 'DelDOT',
    lat: 39.71,
    lon: -75.6,
    media: { kind: 'live', live: true },
  },
  {
    id: 'london',
    name: 'Trafalgar',
    city: 'London',
    provider: 'Transport for London',
    lat: 51.508,
    lon: -0.128,
    media: { kind: 'clip', clip: true, still: true },
  },
];

test('preserved camera media labels stay honest', () => {
  assert.equal(MEDIA_LABELS.live, 'LIVE VIDEO');
  assert.equal(MEDIA_LABELS.clip, 'VIDEO CLIP');
  assert.equal(MEDIA_LABELS.refreshedStill, 'REFRESHED STILL');
  assert.equal(MEDIA_LABELS.still, 'STILL IMAGE ONLY');
  assert.equal(MEDIA_BADGE.still, 'STILL IMAGE ONLY');
  assert.equal(
    NO_PUBLIC_CAMERAS_IN_AREA,
    'NO PUBLIC CAMERAS FOUND IN THIS AREA',
  );
});

test('pointInViewBounds handles ordinary and antimeridian rectangles', () => {
  assert.equal(pointInViewBounds(30.26, -97.74, austinBounds), true);
  assert.equal(pointInViewBounds(39.71, -75.6, austinBounds), false);
  assert.equal(
    pointInViewBounds(0, 179, { west: 170, south: -10, east: -170, north: 10 }),
    true,
  );
  assert.equal(
    pointInViewBounds(0, 0, { west: 170, south: -10, east: -170, north: 10 }),
    false,
  );
});

test('useful radius clamps a globe-scale view so distant packs cannot flood Austin', () => {
  const globe = { west: -180, south: -85, east: 180, north: 85 };
  assert.ok(viewDiagonalKm(globe) > 10_000);
  assert.equal(usefulRadiusKm({ bounds: globe }), USEFUL_RADIUS_MAX_KM);
  const city = usefulRadiusKm({ bounds: austinBounds });
  assert.ok(city >= 25 && city <= 200);
  assert.ok(city < 150, `Austin city useful radius should stay local, got ${city}`);
});

test('Austin view ranks in-view first and drops ~1850 km distant cameras', () => {
  const center = { lat: 30.2672, lon: -97.7431 };
  const ranked = rankCameras(rankingCams, {
    center,
    bounds: austinBounds,
    nearbyOnly: true,
  });
  const ids = ranked.map((c) => c.id);
  assert.ok(ids.includes('austin-inview'));
  assert.ok(ids.includes('austin-live'));
  assert.ok(ids.includes('austin-near'));
  assert.equal(ids.includes('delaware'), false, 'Delaware ~2400 km must not appear');
  assert.equal(ids.includes('london'), false, 'London must not appear');
  assert.equal(ids.includes('dallas'), false, 'Dallas ~300 km beyond useful radius');
  // In-view before near-but-outside.
  assert.ok(ids.indexOf('austin-inview') < ids.indexOf('austin-near'));
  assert.ok(ids.indexOf('austin-live') < ids.indexOf('austin-near'));
  // Every surviving row carries distance and usefulness flags.
  for (const cam of ranked) {
    assert.equal(cam._useful, true);
    assert.ok(Number.isFinite(cam._km));
    assert.ok(cam._km < 200);
  }
  // Delaware alone is ~2,100 km from Austin — the reported problem class.
  const delawareOnly = rankCameras(
    rankingCams.filter((c) => c.id === 'delaware'),
    { center, bounds: austinBounds, nearbyOnly: true },
  );
  assert.deepEqual(delawareOnly, []);
});

test('empty nearby result is the honest area message, not a distant wall', () => {
  const ocean = rankCameras(
    rankingCams.filter((c) => c.id === 'london' || c.id === 'delaware'),
    {
      center: { lat: 30.27, lon: -97.74 },
      bounds: austinBounds,
      nearbyOnly: true,
    },
  );
  assert.equal(ocean.length, 0);
  assert.match(NO_PUBLIC_CAMERAS_IN_AREA, /NO PUBLIC CAMERAS FOUND IN THIS AREA/);
});

test('selected location breaks near-distance ties before media quality', () => {
  const twins = [
    {
      id: 'still-closer-to-selected',
      name: 'Still near pin',
      provider: 'A',
      lat: 30.27,
      lon: -97.74,
      media: { kind: 'still' },
    },
    {
      id: 'live-farther-from-selected',
      name: 'Live farther from pin',
      provider: 'A',
      lat: 30.275,
      lon: -97.74,
      media: { kind: 'live' },
    },
  ];
  const ranked = rankCameras(twins, {
    center: { lat: 30.2725, lon: -97.74 },
    selected: { lat: 30.27, lon: -97.74 },
    nearbyOnly: false,
  });
  // Center distances are comparable (~0.3 km); selected proximity wins.
  assert.equal(ranked[0].id, 'still-closer-to-selected');
});

test('comparable center distance prefers live over still', () => {
  const twins = [
    {
      id: 'still',
      name: 'Still',
      provider: 'A',
      lat: 30.27,
      lon: -97.74,
      media: { kind: 'still' },
    },
    {
      id: 'live',
      name: 'Live',
      provider: 'A',
      lat: 30.2705,
      lon: -97.74,
      media: { kind: 'live' },
    },
  ];
  const ranked = rankCameras(twins, {
    center: { lat: 30.27025, lon: -97.74 },
    nearbyOnly: false,
  });
  assert.equal(ranked[0].id, 'live');
  assert.equal(MEDIA_BADGE[mediaKindOf(ranked[0])], 'LIVE VIDEO');
  assert.equal(MEDIA_BADGE[mediaKindOf(ranked[1])], 'STILL IMAGE ONLY');
});

test('formatCameraDistance stays readable', () => {
  assert.equal(formatCameraDistance(1.23), '1.2 km');
  assert.equal(formatCameraDistance(42.2), '42 km');
  assert.equal(formatCameraDistance(1850), '1,850 km');
  assert.equal(formatCameraDistance(Infinity), '');
});

test('explicit search mode can still include distant cameras (nearbyOnly false)', () => {
  const ranked = rankCameras(rankingCams, {
    center: { lat: 30.27, lon: -97.74 },
    bounds: austinBounds,
    nearbyOnly: false,
  });
  assert.ok(ranked.some((c) => c.id === 'london'));
  assert.ok(ranked[0]._inView || ranked[0]._km < ranked.at(-1)._km);
});
