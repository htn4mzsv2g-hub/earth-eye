import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeCctvMedia,
  publicCctvMedia,
  isHlsUrl,
  isClipUrl,
  isImageUrl,
  CCTV_MEDIA_LABEL,
} from '../../server/providers/cctv/mediaKind.js';

test('HLS m3u8 playlists are LIVE VIDEO', () => {
  const d = describeCctvMedia({
    feedType: 'hls',
    url: 'https://example.org/live/cam1/playlist.m3u8',
    snapshotUrl: '',
  });
  assert.equal(d.kind, 'live');
  assert.equal(d.label, 'LIVE VIDEO');
  assert.equal(d.still, false);
});

test('an hls feedType without an m3u8 URL is not called live', () => {
  const d = describeCctvMedia({
    feedType: 'hls',
    url: 'rtsp://example.org/cam',
  });
  assert.equal(d.live, false);
  assert.equal(d.kind, 'none');
});

test('TfL-style records (still + published mp4 clip) are VIDEO CLIP with a still', () => {
  const d = describeCctvMedia({
    feedType: 'image',
    url: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.06502.jpg',
    snapshotUrl:
      'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.06502.jpg',
    clipUrl:
      'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.06502.mp4',
  });
  assert.equal(d.kind, 'clip');
  assert.equal(d.clip, true);
  assert.equal(d.still, true);
  assert.equal(d.live, false);
  assert.equal(d.label, 'VIDEO CLIP');
});

test('mp4 feed URLs are VIDEO CLIP, never LIVE', () => {
  const d = describeCctvMedia({
    feedType: 'mp4',
    url: 'https://example.org/clip.mp4?x=1',
  });
  assert.equal(d.kind, 'clip');
  assert.notEqual(d.label, CCTV_MEDIA_LABEL.live);
});

test('jpg and image-feed cameras are STILL IMAGE ONLY', () => {
  assert.equal(
    describeCctvMedia({ feedType: 'image', url: 'https://x.org/a.jpg' }).kind,
    'still',
  );
  // Image feed from a CGI endpoint without an extension: provider metadata says image.
  assert.equal(
    describeCctvMedia({
      feedType: 'image',
      url: 'https://webcam.example.de/image/jpeg.cgi',
    }).kind,
    'still',
  );
  assert.equal(describeCctvMedia({ feedType: 'image' }).kind, 'none');
});

test('URL predicates', () => {
  assert.equal(isHlsUrl('https://a/b.m3u8'), true);
  assert.equal(isHlsUrl('https://a/b.m3u8?t=1'), true);
  assert.equal(isHlsUrl('/relative.m3u8'), false);
  assert.equal(isClipUrl('https://a/b.mp4'), true);
  assert.equal(isClipUrl('https://a/b.jpg'), false);
  assert.equal(isImageUrl('https://a/b.JPEG'), true);
});

test('public descriptor exposes only same-origin proxy paths', () => {
  const pub = publicCctvMedia(
    {
      id: 'tfl-1',
      feedType: 'image',
      url: 'https://s3/x.jpg',
      snapshotUrl: 'https://s3/x.jpg',
      clipUrl: 'https://s3/x.mp4',
    },
    'tfl-1',
  );
  assert.equal(pub.stillPath, '/api/cctv/frame/tfl-1');
  assert.equal(pub.clipPath, '/api/cctv/clip/tfl-1');
  assert.equal(pub.livePath, null);
  assert.ok(!JSON.stringify(pub).includes('s3/'));
});
