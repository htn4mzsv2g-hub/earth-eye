#!/usr/bin/env node
/**
 * Re-derive CCTV ground heights from the open Re:Earth terrain DEM
 * (https://terrain.reearth.land/heights.json) — not Google Photorealistic 3D Tiles.
 *
 * Writes schemaVersion 1 with provider: "reearth-terrain".
 *
 * Usage:
 *   node scripts/rederive-cctv-heights-reearth.mjs [--limit N] [--out path]
 *
 * Without --limit, processes all cameras that have a served pose in the live
 * catalog endpoint or a local JSON dump. Prefer --limit for incremental runs.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  planeSupportPoints,
  poseHash,
  SUPPORT_KEYS,
} from '../src/data/cctvFootprint.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUT = path.join(
  ROOT,
  'src/data/local_data/cctv_ground_heights/cctv_ground_heights_reearth.json',
);
const UPSTREAM = 'https://terrain.reearth.land/heights.json';
const CHUNK = 48;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

/** @param {Array<[number,number]>} points lon,lat */
async function fetchHeights(points) {
  const param = points
    .map(([lon, lat]) => `${lon.toFixed(5)},${lat.toFixed(5)}`)
    .join(';');
  const url = `${UPSTREAM}?points=${encodeURIComponent(param)}`;
  const resp = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'earth-eye-heights/1.0 (+https://eartheye.us)',
    },
    signal: AbortSignal.timeout(45_000),
  });
  if (!resp.ok) throw new Error(`Re:Earth HTTP ${resp.status}`);
  const body = await resp.json();
  const rows = Array.isArray(body?.results)
    ? body.results
    : Array.isArray(body)
      ? body
      : null;
  if (!rows || rows.length !== points.length) {
    throw new Error(
      `Re:Earth result length mismatch (got ${rows?.length}, want ${points.length})`,
    );
  }
  return rows.map((r) => {
    const ell =
      typeof r?.ellipsoid === 'number'
        ? r.ellipsoid
        : typeof r?.elevation === 'number'
          ? r.elevation
          : NaN;
    return Number.isFinite(ell) ? ell : null;
  });
}

async function loadCameras(limit) {
  // Prefer a local dump if present; else hit live catalog via env URL.
  const dump = process.env.CCTV_CATALOG_DUMP;
  let sources = [];
  if (dump) {
    const raw = JSON.parse(await readFile(dump, 'utf8'));
    sources = Array.isArray(raw) ? raw : raw.sources || raw.cameras || [];
  } else {
    const catalogUrl =
      process.env.CCTV_CATALOG_URL ||
      'https://eartheye.us/api/cctv/catalog';
    const resp = await fetch(catalogUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) throw new Error(`catalog HTTP ${resp.status}`);
    const body = await resp.json();
    sources = Array.isArray(body?.sources)
      ? body.sources
      : Array.isArray(body)
        ? body
        : [];
  }
  const cameras = [];
  for (const src of sources) {
    const lat = Number(src.lat);
    const lon = Number(src.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !src.id) continue;
    const pose = {
      lat,
      lon,
      headingDeg: Number(src.headingDeg) || 0,
      pitchDeg: Number(src.pitchDeg) || -18,
      fovDeg: Number(src.fovDeg) || 50,
      rangeM: Number(src.rangeM) || 160,
      mountHeightM: Number(src.mountHeightM) || 8,
    };
    cameras.push({ id: String(src.id), pose });
    if (limit && cameras.length >= limit) break;
  }
  return cameras;
}

async function main() {
  const limit = Number(arg('--limit', '0')) || 0;
  const outPath = arg('--out', DEFAULT_OUT);
  const cameras = await loadCameras(limit);
  console.log(`[reearth-heights] cameras=${cameras.length} out=${outPath}`);

  /** @type {Record<string, object>} */
  const outCameras = {};
  let ok = 0;
  let miss = 0;

  // Batch all sample points across cameras for fewer round-trips.
  const jobs = [];
  for (const cam of cameras) {
    const footprint = planeSupportPoints(cam.pose);
    const keys = ['mount', ...SUPPORT_KEYS];
    const points = [
      [footprint.mount.lon, footprint.mount.lat],
      ...SUPPORT_KEYS.map((k) => [
        footprint.supports[k].lon,
        footprint.supports[k].lat,
      ]),
    ];
    jobs.push({ cam, keys, points });
  }

  for (let i = 0; i < jobs.length; i += 1) {
    const { cam, keys, points } = jobs[i];
    let heights;
    try {
      heights = await fetchHeights(points);
    } catch (err) {
      console.warn(`[reearth-heights] ${cam.id} fetch failed:`, err.message);
      outCameras[cam.id] = {
        poseHash: poseHash(cam.pose),
        status: 'miss',
        misses: keys.slice(),
        sampledAt: new Date().toISOString(),
        attempts: 1,
      };
      miss += 1;
      continue;
    }
    const supports = {};
    const misses = [];
    let mountGroundM = null;
    for (let k = 0; k < keys.length; k += 1) {
      const h = heights[k];
      if (h == null) {
        misses.push(keys[k]);
        continue;
      }
      if (keys[k] === 'mount') mountGroundM = h;
      else supports[keys[k]] = h;
    }
    if (mountGroundM == null) {
      outCameras[cam.id] = {
        poseHash: poseHash(cam.pose),
        status: 'miss',
        misses,
        sampledAt: new Date().toISOString(),
        attempts: 1,
      };
      miss += 1;
    } else {
      outCameras[cam.id] = {
        poseHash: poseHash(cam.pose),
        status: 'ok',
        misses,
        sampledAt: new Date().toISOString(),
        attempts: 1,
        mountGroundM,
        supports,
      };
      ok += 1;
    }
    if ((i + 1) % 25 === 0 || i + 1 === jobs.length) {
      console.log(`[reearth-heights] progress ${i + 1}/${jobs.length} ok=${ok} miss=${miss}`);
    }
  }

  const payload = {
    schemaVersion: 1,
    provider: 'reearth-terrain',
    heightReference: 'WGS84-ellipsoid',
    generatedAt: new Date().toISOString(),
    note: 'Open DEM via Re:Earth terrain.reearth.land — not Google-derived',
    cameras: outCameras,
  };
  await mkdir(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp`;
  await writeFile(tmp, JSON.stringify(payload));
  await rename(tmp, outPath);
  console.log(`[reearth-heights] wrote ${outPath} ok=${ok} miss=${miss}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
