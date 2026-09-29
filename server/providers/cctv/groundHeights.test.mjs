import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadGroundHeights, joinGroundHeights } from './groundHeights.js';

test('loadGroundHeights refuses google-3d-tiles by default', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geh-'));
  const file = path.join(dir, 'heights.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      provider: 'google-3d-tiles',
      cameras: {
        'cam-1': {
          status: 'ok',
          poseHash: 'p1-x',
          mountGroundM: 10,
          supports: {},
        },
      },
    }),
  );
  const prev = process.env.CCTV_GROUND_HEIGHTS_FILE;
  const allow = process.env.CCTV_ALLOW_GOOGLE_HEIGHTS;
  process.env.CCTV_GROUND_HEIGHTS_FILE = file;
  delete process.env.CCTV_ALLOW_GOOGLE_HEIGHTS;
  try {
    const cams = loadGroundHeights(dir);
    assert.deepEqual(cams, {});
  } finally {
    if (prev === undefined) delete process.env.CCTV_GROUND_HEIGHTS_FILE;
    else process.env.CCTV_GROUND_HEIGHTS_FILE = prev;
    if (allow === undefined) delete process.env.CCTV_ALLOW_GOOGLE_HEIGHTS;
    else process.env.CCTV_ALLOW_GOOGLE_HEIGHTS = allow;
  }
});

test('loadGroundHeights accepts reearth-terrain', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geh-'));
  const file = path.join(dir, 'heights.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      provider: 'reearth-terrain',
      cameras: {
        'cam-1': {
          status: 'ok',
          poseHash: 'p1-x',
          mountGroundM: 12,
          supports: { mc: 11 },
        },
      },
    }),
  );
  const prev = process.env.CCTV_GROUND_HEIGHTS_FILE;
  process.env.CCTV_GROUND_HEIGHTS_FILE = file;
  try {
    const cams = loadGroundHeights(dir);
    assert.equal(cams['cam-1'].mountGroundM, 12);
  } finally {
    if (prev === undefined) delete process.env.CCTV_GROUND_HEIGHTS_FILE;
    else process.env.CCTV_GROUND_HEIGHTS_FILE = prev;
  }
});
