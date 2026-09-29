import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadTflSourcesFromOpenData,
  tflClipUrl,
  tflVideoClipsEnabled,
} from '../../server/providers/cctv/sources.js';
import { TFL_IMAGE_ORIGIN } from '../../server/providers/cctv/constants.js';

const IMAGE = `${TFL_IMAGE_ORIGIN}00001.08859.jpg`;
const CLIP = `${TFL_IMAGE_ORIGIN}00001.08859.mp4`;

/** One JamCam place in the shape api.tfl.gov.uk returns. */
function jamCam({ videoUrl = CLIP } = {}) {
  return {
    id: 'JamCams_00001.08859',
    commonName: 'Westway/Wood Lane',
    lat: 51.5176,
    lon: -0.2202,
    additionalProperties: [
      { key: 'available', value: 'true' },
      { key: 'imageUrl', value: IMAGE },
      { key: 'videoUrl', value: videoUrl },
    ],
  };
}

/** Run the loader against a canned list with CCTV_TFL_VIDEO_CLIPS set. */
async function loadWith(places, flag) {
  const originalFetch = globalThis.fetch;
  const originalFlag = process.env.CCTV_TFL_VIDEO_CLIPS;
  const originalLog = console.log;
  if (flag === undefined) delete process.env.CCTV_TFL_VIDEO_CLIPS;
  else process.env.CCTV_TFL_VIDEO_CLIPS = flag;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(places), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  console.log = () => {};
  try {
    return await loadTflSourcesFromOpenData();
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    if (originalFlag === undefined) delete process.env.CCTV_TFL_VIDEO_CLIPS;
    else process.env.CCTV_TFL_VIDEO_CLIPS = originalFlag;
  }
}

test('TfL JamCams stay still images by default', async () => {
  for (const flag of [undefined, '', 'false', '0', 'off']) {
    const [camera] = await loadWith([jamCam()], flag);
    assert.equal(camera.feedType, 'image', `flag=${flag}`);
    assert.equal(camera.url, IMAGE);
    assert.equal(camera.snapshotUrl, IMAGE);
  }
});

test('CCTV_TFL_VIDEO_CLIPS=true uses the official mp4 clip, still as snapshot', async () => {
  for (const flag of ['true', '1', 'TRUE', 'on']) {
    const [camera] = await loadWith([jamCam()], flag);
    assert.equal(camera.feedType, 'mp4', `flag=${flag}`);
    assert.equal(camera.url, CLIP);
    assert.equal(camera.snapshotUrl, IMAGE);
    assert.equal(camera.sourceKind, 'tfl-open-data');
  }
});

test('flag on still falls back to the image when the clip is missing or off-bucket', async () => {
  const [missing] = await loadWith([jamCam({ videoUrl: '' })], 'true');
  assert.equal(missing.feedType, 'image');
  assert.equal(missing.url, IMAGE);
  const [offBucket] = await loadWith(
    [jamCam({ videoUrl: 'https://example.com/00001.08859.mp4' })],
    'true',
  );
  assert.equal(offBucket.feedType, 'image');
  assert.equal(offBucket.url, IMAGE);
});

test('tflClipUrl and tflVideoClipsEnabled are strict', () => {
  assert.equal(tflClipUrl(CLIP), CLIP);
  assert.equal(tflClipUrl(`${CLIP}?t=1`), `${CLIP}?t=1`);
  assert.equal(tflClipUrl(`${TFL_IMAGE_ORIGIN}x.m3u8`), '');
  assert.equal(tflClipUrl(undefined), '');
  const prior = process.env.CCTV_TFL_VIDEO_CLIPS;
  try {
    delete process.env.CCTV_TFL_VIDEO_CLIPS;
    assert.equal(tflVideoClipsEnabled(), false);
    process.env.CCTV_TFL_VIDEO_CLIPS = 'nope';
    assert.equal(tflVideoClipsEnabled(), false);
    process.env.CCTV_TFL_VIDEO_CLIPS = 'yes';
    assert.equal(tflVideoClipsEnabled(), true);
  } finally {
    if (prior === undefined) delete process.env.CCTV_TFL_VIDEO_CLIPS;
    else process.env.CCTV_TFL_VIDEO_CLIPS = prior;
  }
});
