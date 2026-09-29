import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CCTV_MEDIUM, cctvMediumLabel } from '../sources/cctvTypes.js';
import { _syncCctvSourceBadge } from './cctvFrames.js';
import { createPresentation } from '../layers/cctv/presentation.js';

test('cctvMediumLabel names stills, clips and live streams honestly', () => {
  assert.equal(cctvMediumLabel({ feedType: 'image' }), 'STILL IMAGE ONLY');
  assert.equal(cctvMediumLabel({ feedType: 'jpeg' }), CCTV_MEDIUM.still);
  assert.equal(cctvMediumLabel({ feedType: 'mjpeg' }), CCTV_MEDIUM.still);
  assert.equal(cctvMediumLabel({ feedType: 'mp4' }), 'VIDEO CLIP');
  assert.equal(cctvMediumLabel({ feedType: 'webm' }), CCTV_MEDIUM.clip);
  assert.equal(cctvMediumLabel({ feedType: 'hls' }), 'LIVE VIDEO');
  assert.equal(cctvMediumLabel({ feedType: 'stream' }), CCTV_MEDIUM.live);
  assert.equal(cctvMediumLabel({}), CCTV_MEDIUM.still);
  assert.equal(cctvMediumLabel(null), CCTV_MEDIUM.still);
});

test('a video source that resolved to its snapshot reads as a still', () => {
  assert.equal(
    cctvMediumLabel({ feedType: 'hls', isVideo: false }),
    CCTV_MEDIUM.still,
  );
  assert.equal(
    cctvMediumLabel({ feedType: 'mp4', isVideo: false }),
    CCTV_MEDIUM.still,
  );
  // isVideo cannot promote a still source to video.
  assert.equal(
    cctvMediumLabel({ feedType: 'image', isVideo: true }),
    CCTV_MEDIUM.still,
  );
  assert.equal(
    cctvMediumLabel({ feedType: 'mp4', isVideo: true }),
    CCTV_MEDIUM.clip,
  );
});

function badgeHost({ loading = false, error = false, hasFrame = false } = {}) {
  const badge = { textContent: '', dataset: {} };
  return {
    _cctvSourceBadge: badge,
    _cctvFrame: {
      dataset: {
        loading: loading ? 'true' : 'false',
        error: error ? 'true' : 'false',
      },
    },
    _cctvFrameWrap: { classList: { contains: () => hasFrame } },
  };
}

test('source badge leads with the medium and keeps the source-type tag', () => {
  const still = badgeHost();
  _syncCctvSourceBadge.call(
    still,
    { feedType: 'image', sourceKind: 'tfl', sourceStatus: 'live' },
    true,
  );
  assert.equal(
    still._cctvSourceBadge.textContent,
    'STILL IMAGE ONLY · TFL · LIVE',
  );
  assert.equal(still._cctvSourceBadge.dataset.medium, CCTV_MEDIUM.still);
  assert.equal(still._cctvSourceBadge.dataset.frameState, 'ready');

  const live = badgeHost();
  _syncCctvSourceBadge.call(
    live,
    { feedType: 'hls', isVideo: true, sourceKind: 'hls', sourceStatus: 'ok' },
    true,
  );
  assert.equal(live._cctvSourceBadge.textContent, 'LIVE VIDEO · HLS · OK');

  const clip = badgeHost({ loading: true });
  _syncCctvSourceBadge.call(clip, { feedType: 'mp4', isVideo: true }, true);
  assert.equal(clip._cctvSourceBadge.textContent, 'VIDEO CLIP · LOADING');
  assert.equal(clip._cctvSourceBadge.dataset.frameState, 'loading');

  const broken = badgeHost({ error: true });
  _syncCctvSourceBadge.call(broken, { feedType: 'image' }, true);
  assert.equal(
    broken._cctvSourceBadge.textContent,
    'STILL IMAGE ONLY · UNAVAILABLE',
  );

  _syncCctvSourceBadge.call(broken, null, true);
  assert.equal(broken._cctvSourceBadge.textContent, 'SOURCE · UNKNOWN');
  assert.equal(broken._cctvSourceBadge.dataset.medium, undefined);
});

function summaryFor(camera, { health = null, projectionMode = 'video' } = {}) {
  const record = { camera, projection: { mode: projectionMode } };
  const presentation = createPresentation({
    state: {
      _records: [record],
      _healthById: new Map(health ? [[camera.id, health]] : []),
      _showProjection: true,
      _coverageMode: 'sector',
    },
    services: {},
    source: {},
    parts: {
      selection: { getActiveRecord: () => record },
      model: {
        sectorAreaKm2: () => 0.1,
        currentViewContext: () => 'street:1',
        isVideoFeedType: (type) => ['mp4', 'webm', 'hls'].includes(type),
      },
      geometry: { coverageNeighborCount: () => 0 },
      calibration: { deriveCalBadge: () => 'raw-prior' },
    },
  });
  return presentation.buildSummaryText().split(' · ');
}

test('layer summary adds the medium beside the upstream SRC tag', () => {
  const base = {
    id: 'cam-1',
    city: 'London',
    name: 'A40 Westway',
    headingDeg: 90,
    fovDeg: 60,
  };
  const still = summaryFor(
    { ...base, feedType: 'image' },
    {
      health: { sourceKind: 'tfl' },
    },
  );
  assert.ok(still.includes('SRC TFL'));
  assert.ok(still.includes('STILL IMAGE ONLY'));
  assert.equal(still.indexOf('STILL IMAGE ONLY'), still.indexOf('SRC TFL') + 1);

  assert.ok(summaryFor({ ...base, feedType: 'mp4' }).includes('VIDEO CLIP'));
  const live = summaryFor({ ...base, feedType: 'hls' });
  assert.ok(live.includes('LIVE VIDEO'));
  assert.ok(live.includes('SRC HLS'));
  assert.ok(
    summaryFor(
      { ...base, feedType: 'hls' },
      { projectionMode: 'image' },
    ).includes('STILL IMAGE ONLY'),
  );
});
