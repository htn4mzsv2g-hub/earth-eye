import fs from 'node:fs';
import path from 'node:path';
import { poseHash } from '../../../src/data/cctvFootprint.js';

/** Sidecar written by scripts/precompute-cctv-heights.mjs. */
export const DEFAULT_GROUND_HEIGHTS_FILE =
  'src/data/local_data/cctv_ground_heights/cctv_ground_heights.json';

/** @type {{path:string, mtimeMs:number, cameras:object}|null} */
let _cache = null;

/**
 * Load the precomputed ground-height sidecar (heights under each camera's mount
 * and monitor-plane support points). Open DEM only: `provider` must be
 * `reearth-terrain` (or another allowlisted open DEM). Google Photorealistic
 * 3D Tiles–derived caches (`google-3d-tiles`) are refused by default — Google
 * Map Tiles ToS forbids extracting/caching derived heights outside the viewer.
 * Set CCTV_ALLOW_GOOGLE_HEIGHTS=1 only for local regression comparison.
 * Missing/malformed/refused files mean "no shipped heights" (runtime Re:Earth).
 * @param {string} sourceRoot
 * @returns {Record<string, object>} camera id → sidecar entry
 */
export function loadGroundHeights(sourceRoot = process.cwd()) {
  const file =
    process.env.CCTV_GROUND_HEIGHTS_FILE || DEFAULT_GROUND_HEIGHTS_FILE;
  const resolved = path.isAbsolute(file)
    ? file
    : path.resolve(sourceRoot, file);
  try {
    const stat = fs.statSync(resolved);
    if (_cache && _cache.path === resolved && _cache.mtimeMs === stat.mtimeMs) {
      return _cache.cameras;
    }
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    const provider = String(parsed?.provider || '').trim();
    const OPEN_DEM = new Set(['reearth-terrain', 'copernicus-glo30']);
    const allowGoogle =
      String(process.env.CCTV_ALLOW_GOOGLE_HEIGHTS || '')
        .trim()
        .toLowerCase() === '1' ||
      String(process.env.CCTV_ALLOW_GOOGLE_HEIGHTS || '')
        .trim()
        .toLowerCase() === 'true';
    if (provider === 'google-3d-tiles' && !allowGoogle) {
      console.warn(
        '[CCTV] Refusing google-3d-tiles ground heights (ToS / authenticity). ' +
          'Runtime Re:Earth DEM will place cameras. Re-derive with ' +
          'scripts/rederive-cctv-heights-reearth.mjs',
      );
      _cache = { path: resolved, mtimeMs: stat.mtimeMs, cameras: {} };
      return {};
    }
    if (provider && !OPEN_DEM.has(provider) && provider !== 'google-3d-tiles') {
      console.warn(
        `[CCTV] Unknown ground-heights provider "${provider}" — not attaching shipped heights`,
      );
      _cache = { path: resolved, mtimeMs: stat.mtimeMs, cameras: {} };
      return {};
    }
    const cameras =
      parsed &&
      typeof parsed === 'object' &&
      parsed.cameras &&
      typeof parsed.cameras === 'object'
        ? parsed.cameras
        : {};
    _cache = { path: resolved, mtimeMs: stat.mtimeMs, cameras };
    return cameras;
  } catch {
    _cache = null;
    return {};
  }
}

/**
 * Attach a shipped entry to each served source whose id has one AND whose
 * nominal pose still hashes to what the entry was sampled for. A pack whose
 * feed moved a camera or changed its pose simply loses the shipped value and
 * falls back to runtime placement.
 * @param {Array<object>} sources - Normalized served sources.
 * @param {Record<string, object>} entries - Sidecar cameras map.
 * @returns {Array<object>} The same sources, `groundHeights` attached where valid.
 */
export function joinGroundHeights(sources, entries) {
  if (!entries || typeof entries !== 'object') return sources;
  for (const source of sources) {
    const entry = entries[source.id];
    if (!entry || entry.status !== 'ok' || !Number.isFinite(entry.mountGroundM))
      continue;
    if (entry.poseHash !== poseHash(source)) continue;
    const supports = {};
    for (const [key, value] of Object.entries(entry.supports || {})) {
      if (Number.isFinite(value)) supports[key] = value;
    }
    source.groundHeights = {
      poseHash: entry.poseHash,
      mountGroundM: entry.mountGroundM,
      supports,
    };
  }
  return sources;
}
