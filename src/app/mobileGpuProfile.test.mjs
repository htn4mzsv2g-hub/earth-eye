import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMobileGpuProfile,
  resolveMobileResolutionScale,
  applyMobileGpuTuning,
  MOBILE_MAX_SCREEN_SPACE_ERROR,
  MOBILE_TILE_CACHE_SIZE,
  MOBILE_LOADING_DESCENDANT_LIMIT,
} from './mobileGpuProfile.js';

test('desktop defaults keep MSAA 4 and 60 FPS', () => {
  const p = resolveMobileGpuProfile({
    matchMedia: () => ({ matches: false }),
    maxTouchPoints: 0,
    devicePixelRatio: 1,
    innerWidth: 1440,
  });
  assert.equal(p.compact, false);
  assert.equal(p.msaaSamples, 4);
  assert.equal(p.targetFrameRate, 60);
  assert.equal(p.resolutionScale, 1);
});

test('iPhone 3×: resolutionScale stays 1 (DPR crush disabled)', () => {
  assert.equal(resolveMobileResolutionScale(3), 1);
  const crushedLegacy = Math.min(1, 1.75 / 3);
  assert.ok(crushedLegacy < 0.6, 'documents prior mosaic cause');
  const p = resolveMobileGpuProfile({
    matchMedia: (q) => ({ matches: q.includes('pointer: coarse') }),
    maxTouchPoints: 5,
    devicePixelRatio: 3,
    innerWidth: 390,
  });
  assert.equal(p.compact, true);
  assert.equal(p.msaaSamples, 1);
  assert.equal(p.targetFrameRate, 30);
  assert.equal(p.resolutionScale, 1);
});

test('narrow touchless width still uses compact GPU profile', () => {
  const p = resolveMobileGpuProfile({
    matchMedia: () => ({ matches: false }),
    maxTouchPoints: 0,
    devicePixelRatio: 2,
    innerWidth: 800,
  });
  assert.equal(p.compact, true);
  assert.equal(p.msaaSamples, 1);
});

test('applyMobileGpuTuning: SSE 1.25, cache 150, descendant limit, scale 1', () => {
  const globe = {
    maximumScreenSpaceError: 2,
    tileCacheSize: 100,
    loadingDescendantLimit: 20,
    preloadSiblings: false,
  };
  const viewer = { scene: { globe }, resolutionScale: 0.58 };
  const phone = resolveMobileGpuProfile({
    matchMedia: (q) => ({ matches: q.includes('pointer: coarse') }),
    maxTouchPoints: 5,
    devicePixelRatio: 3,
    innerWidth: 390,
  });
  const got = applyMobileGpuTuning(viewer, phone);
  assert.equal(got.applied, true);
  assert.equal(globe.maximumScreenSpaceError, MOBILE_MAX_SCREEN_SPACE_ERROR);
  assert.equal(MOBILE_MAX_SCREEN_SPACE_ERROR, 1.25);
  assert.equal(globe.tileCacheSize, MOBILE_TILE_CACHE_SIZE);
  assert.equal(globe.loadingDescendantLimit, MOBILE_LOADING_DESCENDANT_LIMIT);
  assert.equal(globe.preloadSiblings, true);
  assert.equal(viewer.resolutionScale, 1);
  assert.equal(got.resolutionScale, 1);
});

test('applyMobileGpuTuning is a no-op without a scene', () => {
  assert.equal(applyMobileGpuTuning(null).applied, false);
  assert.equal(applyMobileGpuTuning({}).applied, false);
});
