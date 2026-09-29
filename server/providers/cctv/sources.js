import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_AUSTIN_ROWS_URL,
  DEFAULT_AUSTIN_MAX_SOURCES,
  AUSTIN_DOWNTOWN,
  CALTRANS_CCTV_URL,
  DEFAULT_CALTRANS_DISTRICTS,
  DEFAULT_CALTRANS_MAX_SOURCES,
  CALTRANS_ANCHORS,
  TFL_JAMCAM_URL,
  TFL_IMAGE_ORIGIN,
  DEFAULT_TFL_MAX_SOURCES,
  LONDON_CENTER,
  ONTARIO_511_CAMERAS_URL,
  ONTARIO_511_IMAGE_ORIGIN,
  DEFAULT_ONTARIO_MAX_SOURCES,
  ONTARIO_ANCHORS,
  FINTRAFFIC_STATIONS_URL,
  FINTRAFFIC_IMAGE_ORIGIN,
  FINTRAFFIC_GROUND_ELEVATION_M,
  DIGITRAFFIC_USER,
  DEFAULT_FINTRAFFIC_MAX_SOURCES,
  FINLAND_ANCHORS,
  DRIVEBC_WEBCAMS_URL,
  DRIVEBC_IMAGE_URL,
  DEFAULT_DRIVEBC_MAX_SOURCES,
  DRIVEBC_ANCHORS,
  TXDOT_CCTV_STATUS_URL,
  TXDOT_CCTV_SNAPSHOT_URL,
  TXDOT_DISTRICTS,
  DEFAULT_TXDOT_DISTRICTS,
  DEFAULT_TXDOT_MAX_SOURCES,
  TXDOT_ANCHORS,
  TXDOT_DISTRICT_ELEVATION_M,
  TXDOT_DEFAULT_ELEVATION_M,
  DEFAULT_TALLINN_SOURCE_FILE,
  DEFAULT_TALLINN_MAX_SOURCES,
  TALLINN_IMAGE_ORIGIN,
  TALLINN_CENTER,
  TARKTEE_LOCATIONS_URL,
  TARKTEE_IMAGES_URL,
  TARKTEE_IMAGE_ORIGIN,
  DEFAULT_TARKTEE_MAX_SOURCES,
  TARKTEE_ANCHORS,
  DEFAULT_WARENDORF_SOURCE_FILE,
  WARENDORF_IMAGE_ORIGINS,
  NSW_CAMERAS_URL,
  NSW_IMAGE_ORIGIN,
  DEFAULT_NSW_MAX_SOURCES,
  SYDNEY_CENTER,
  NSW_MAX_VIEW_LABEL,
  DEFAULT_CALGARY_ROWS_URL,
  CALGARY_IMAGE_ORIGIN,
  DEFAULT_CALGARY_MAX_SOURCES,
  CALGARY_DOWNTOWN,
  CALGARY_MAX_CATALOG_BYTES,
  CCTV_SOURCE_FETCH_TIMEOUT_MS,
  DELDOT_CCTV_URL,
  DEFAULT_DELDOT_MAX_SOURCES,
  DELDOT_ANCHORS,
} from './constants.js';
import {
  toFiniteNumber,
  extractAustinCoords,
  extractAustinCameraId,
  extractAustinName,
  extractAustinHeading,
  isLikelyAustinCoordinate,
  fallbackHeadingFromId,
  isLikelyFinlandCoordinate,
  fintrafficCameraName,
  hashSeed,
  isPlausibleLatLon,
  isLikelyBcCoordinate,
  isLikelyTexasCoordinate,
  isLikelyNswCoordinate,
  isLikelyCalgaryCoordinate,
  cameraDisplayCode,
  rowArrayToObject,
  prioritizeSources,
} from './normalize.js';
import { directionToHeading } from '../../../src/data/directionText.js';
import { readResponseJsonCapped } from '../common/http.js';
/**
 * Fetch and parse Austin traffic camera records from the city Open Data portal.
 *
 * Downloads the Socrata rows.json payload, converts each row to a keyed
 * record, extracts camera ID / coords / heading / name, validates against
 * the Austin bounding box, deduplicates by ID, then distance-prioritizes
 * to stay within CCTV_AUSTIN_MAX_SOURCES.
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadAustinSourcesFromOpenData() {
  const endpoint = process.env.CCTV_AUSTIN_ROWS_URL || DEFAULT_AUSTIN_ROWS_URL;
  try {
    const resp = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] Austin source download failed:', resp.status);
      return [];
    }
    const payload = await resp.json();
    const columns = Array.isArray(payload?.meta?.view?.columns)
      ? payload.meta.view.columns
      : [];
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (!columns.length || !rows.length) return [];

    const cameras = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const record = rowArrayToObject(row, columns);
      const cameraId = extractAustinCameraId(record);
      if (!cameraId) continue;

      // Only live cameras: the dataset carries DESIRED (planned, not built),
      // REMOVED and VOID rows whose frame URLs never resolve — those cameras
      // would render as permanent Street View / synthetic fallbacks. Tolerate
      // a missing column (keep the row) so a schema change fails open.
      const status = String(record.camera_status || '')
        .trim()
        .toUpperCase();
      if (status && status !== 'TURNED_ON') continue;

      const { lat, lon } = extractAustinCoords(record);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (!isLikelyAustinCoordinate(lat, lon)) continue;

      const extractedHeading = extractAustinHeading(record);
      const hasHeading = Number.isFinite(extractedHeading);
      const headingDeg = hasHeading
        ? extractedHeading
        : fallbackHeadingFromId(cameraId);
      cameras.push({
        id: cameraId,
        name: extractAustinName(record, cameraId),
        city: 'Austin',
        cityId: 'austin',
        provider: 'Austin Transportation & Public Works',
        lat,
        lon,
        headingDeg,
        headingConfidence: hasHeading ? 'high' : 'low',
        pitchDeg: hasHeading ? -24 : -18,
        fovDeg: hasHeading ? 56 : 44,
        rangeM: hasHeading ? 210 : 145,
        mountHeightM: hasHeading ? 10 : 8,
        groundElevationM: 150,
        feedType: 'image',
        url: `https://cctv.austinmobility.io/image/${encodeURIComponent(cameraId)}.jpg`,
        snapshotUrl: `https://cctv.austinmobility.io/image/${encodeURIComponent(cameraId)}.jpg`,
        sourceKind: 'austin-open-data',
        license: 'Public city traffic camera frame',
      });
    }

    const unique = Array.from(
      new Map(cameras.map((camera) => [camera.id, camera])).values(),
    );
    const maxRaw = Number(
      process.env.CCTV_AUSTIN_MAX_SOURCES || DEFAULT_AUSTIN_MAX_SOURCES,
    );
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(300, Math.floor(maxRaw)))
      : DEFAULT_AUSTIN_MAX_SOURCES;
    const prioritized = prioritizeSources(unique, maxCount, [AUSTIN_DOWNTOWN]);
    if (prioritized.length < unique.length) {
      console.log(
        `[CCTV] Loaded Austin camera sources: ${unique.length} (using nearest ${prioritized.length})`,
      );
    } else {
      console.log('[CCTV] Loaded Austin camera sources:', prioritized.length);
    }
    return prioritized;
  } catch (error) {
    console.warn(
      '[CCTV] Austin source download error:',
      error?.message || error,
    );
    return [];
  }
}

/**
 * Fetch Caltrans CCTV cameras for the configured districts (CCTV_CALTRANS_DISTRICTS,
 * comma-separated 1..12; empty string disables the pack). One official JSON feed per
 * district, identical schema statewide; keyless. Only inService cameras with finite
 * coords and a cwwp2.dot.ca.gov https image URL are kept (the image-URL origin check
 * is defense-in-depth: the proxy only ever fetches catalog URLs, and this pins the
 * catalog to the official host). Districts fetch in parallel and fail independently
 * (Promise.allSettled) — one district outage never darkens the others.
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadCaltransSourcesFromOpenData() {
  const districtsRaw =
    process.env.CCTV_CALTRANS_DISTRICTS ?? DEFAULT_CALTRANS_DISTRICTS;
  const districts = String(districtsRaw)
    .split(',')
    .map((token) => Number(token.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  if (!districts.length) return [];

  const settled = await Promise.allSettled(
    districts.map(async (district) => {
      const resp = await fetch(CALTRANS_CCTV_URL(district), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
      });
      if (!resp.ok) throw new Error(`D${district} HTTP ${resp.status}`);
      const payload = await resp.json();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      return { district, rows };
    }),
  );

  const cameras = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      console.warn(
        '[CCTV] Caltrans district fetch failed:',
        result.reason?.message || result.reason,
      );
      continue;
    }
    const { district, rows } = result.value;
    for (const row of rows) {
      const cctv = row?.cctv;
      if (!cctv || String(cctv.inService).toLowerCase() !== 'true') continue;
      const loc = cctv.location || {};
      const lat = toFiniteNumber(loc.latitude);
      const lon = toFiniteNumber(loc.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const imageUrl = String(cctv.imageData?.static?.currentImageURL || '');
      // Official-host pin (see JSDoc). Also drops records with no still image.
      if (!imageUrl.startsWith('https://cwwp2.dot.ca.gov/')) continue;

      const locationName = String(loc.locationName || '').trim();
      // Leading token of locationName is the stable camera code ("TV102 -- I-580 : …").
      const codeMatch = /^([A-Za-z0-9_-]+)\s*--/.exec(locationName);
      const code = (
        codeMatch ? codeMatch[1] : `x${cameras.length}`
      ).toLowerCase();
      const cameraId = `ca-d${district}-${code}`;

      // loc.direction is a dedicated field ("West", "South") → allow bare words.
      const heading = directionToHeading(loc.direction, true);
      const hasHeading = Number.isFinite(heading);
      const label =
        locationName.replace(/^([A-Za-z0-9_-]+)\s*--\s*/, '') ||
        `Caltrans D${district} ${code}`;
      cameras.push({
        id: cameraId,
        name: loc.nearbyPlace ? `${label} (${loc.nearbyPlace})` : label,
        city: String(loc.nearbyPlace || `Caltrans D${district}`),
        cityId: `ca-d${district}`,
        provider: 'Caltrans',
        lat,
        lon,
        headingDeg: hasHeading ? heading : fallbackHeadingFromId(cameraId),
        headingConfidence: hasHeading ? 'high' : 'low',
        // Same two fabricated pose personalities as Austin (design §1a): these are
        // RAW PRIOR starting points; the client's one-shot ground snap + manual
        // calibration own the truth.
        pitchDeg: hasHeading ? -24 : -18,
        fovDeg: hasHeading ? 56 : 44,
        rangeM: hasHeading ? 210 : 145,
        mountHeightM: hasHeading ? 10 : 8,
        // loc.elevation is reported in FEET (verified: D3 maxes at 7427 ft ≈
        // 2264 m for the Sierra passes — as metres that would top Mt Whitney).
        // Convert to metres and clamp to a sane CA-roads range so an occasional
        // garbage upstream value can't fling a camera kilometres up. Prior only:
        // the client one-shot snap corrects it on 3D-tile stacks — but on a
        // no-tileset stack (keyless OSM) the snap misses and this height freezes,
        // so it must be right-ish on its own.
        groundElevationM: (() => {
          const ft = toFiniteNumber(loc.elevation, NaN);
          return Number.isFinite(ft)
            ? Math.max(-100, Math.min(4000, ft * 0.3048))
            : 150;
        })(),
        feedType: 'image',
        url: imageUrl,
        snapshotUrl: imageUrl,
        sourceKind: 'caltrans-open-data',
        license: 'Public Caltrans highway camera frame',
      });
    }
  }

  const maxRaw = Number(
    process.env.CCTV_CALTRANS_MAX_SOURCES || DEFAULT_CALTRANS_MAX_SOURCES,
  );
  const maxCount = Number.isFinite(maxRaw)
    ? Math.max(8, Math.min(600, Math.floor(maxRaw)))
    : DEFAULT_CALTRANS_MAX_SOURCES;
  const prioritized = prioritizeSources(cameras, maxCount, CALTRANS_ANCHORS);
  console.log(
    `[CCTV] Loaded Caltrans camera sources: ${cameras.length} inService (using nearest ${prioritized.length})`,
  );
  return prioritized;
}

/**
 * Opt-in switch for TfL JamCam video clips. Off unless CCTV_TFL_VIDEO_CLIPS is
 * `true`/`1`/`yes`/`on`, so still images stay the default.
 *
 * @returns {boolean}
 */
export function tflVideoClipsEnabled() {
  const raw = String(process.env.CCTV_TFL_VIDEO_CLIPS || '')
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

/**
 * TfL's official clip URL, pinned to the JamCam bucket and to `.mp4`.
 *
 * @param {unknown} videoUrl - `videoUrl` additional property from the API.
 * @returns {string} The clip URL, or '' when it is missing or off-bucket.
 */
export function tflClipUrl(videoUrl) {
  const url = String(videoUrl || '');
  return url.startsWith(TFL_IMAGE_ORIGIN) && /\.mp4(?:\?|$)/i.test(url)
    ? url
    : '';
}

/**
 * Fetch TfL JamCams (London). Keyless: the optional TFL_APP_KEY only raises the
 * list-endpoint rate limit (frames come from TfL's public S3 bucket, which is not
 * rate-limited); the 15-min source cache keeps list hits far below anonymous
 * limits anyway. Only `available === "true"` cameras with finite coords and an
 * image URL on the official bucket are kept. Attribution: "Powered by TfL Open
 * Data" (registered in src/data/dataCredits.js).
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadTflSourcesFromOpenData() {
  try {
    const appKey = String(process.env.TFL_APP_KEY || '').trim();
    const url = appKey
      ? `${TFL_JAMCAM_URL}?app_key=${encodeURIComponent(appKey)}`
      : TFL_JAMCAM_URL;
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] TfL JamCam download failed:', resp.status);
      return [];
    }
    const places = await resp.json();
    if (!Array.isArray(places)) return [];

    const cameras = [];
    for (const place of places) {
      const props = {};
      for (const p of place?.additionalProperties || []) {
        if (p?.key) props[p.key] = p.value;
      }
      if (String(props.available).toLowerCase() !== 'true') continue;
      const lat = toFiniteNumber(place?.lat);
      const lon = toFiniteNumber(place?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const imageUrl = String(props.imageUrl || '');
      if (!imageUrl.startsWith(TFL_IMAGE_ORIGIN)) continue; // official-bucket pin
      // Stills first (upstream owner decision). CCTV_TFL_VIDEO_CLIPS=true opts
      // into TfL's official short .mp4 clip; the still stays the snapshot.
      const clipUrl = tflVideoClipsEnabled() ? tflClipUrl(props.videoUrl) : '';

      // "JamCams_00002.00865" → "tfl-00002.00865" (provider-stable id).
      const rawId = String(place?.id || '').replace(/^JamCams_/, '');
      if (!rawId) continue;
      const cameraId = `tfl-${rawId}`;

      cameras.push({
        id: cameraId,
        name: String(place?.commonName || `JamCam ${rawId}`),
        city: 'London',
        cityId: 'london',
        provider: 'Transport for London',
        lat,
        lon,
        // No heading signal at all in JamCam data → id-hash fallback, low
        // confidence personality (same as headingless Austin cameras).
        headingDeg: fallbackHeadingFromId(cameraId),
        headingConfidence: 'low',
        pitchDeg: -18,
        fovDeg: 44,
        rangeM: 145,
        mountHeightM: 8,
        groundElevationM: 15, // Thames-basin prior; one-shot snap corrects.
        feedType: clipUrl ? 'mp4' : 'image', // stills first unless opted in
        url: clipUrl || imageUrl,
        snapshotUrl: imageUrl,
        // TfL publishes a short recorded .mp4 per JamCam. Kept separate from
        // `url` so the 3D layer stays on stills, while the CCTV browser can
        // offer the clip honestly labeled VIDEO CLIP (never LIVE).
        clipUrl: tflClipUrl(props.videoUrl),
        sourceKind: 'tfl-open-data',
        license: 'Powered by TfL Open Data',
      });
    }

    const maxRaw = Number(
      process.env.CCTV_TFL_MAX_SOURCES || DEFAULT_TFL_MAX_SOURCES,
    );
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(600, Math.floor(maxRaw)))
      : DEFAULT_TFL_MAX_SOURCES;
    const prioritized = prioritizeSources(cameras, maxCount, [LONDON_CENTER]);
    console.log(
      `[CCTV] Loaded TfL JamCam sources: ${cameras.length} available (using nearest ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] TfL JamCam download error:', error?.message || error);
    return [];
  }
}

/**
 * Bounding-box sanity check for Ontario 511 rows.
 *
 * @param {number} lat
 * @param {number} lon
 * @returns {boolean}
 */
function isLikelyOntarioCoordinate(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= 41.0 && lat <= 57.5 && lon >= -95.6 && lon <= -74.0;
}

/**
 * Pin an Ontario 511 camera view URL to the official still-image host.
 *
 * @param {string} value - Upstream view URL.
 * @returns {string} Canonical 511on.ca still URL, or '' if not accepted.
 */
function normalizeOntarioCctvUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    const match = /^\/map\/Cctv\/([^/?#]+)$/.exec(parsed.pathname);
    if (!match) return '';
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== 'https:' ||
      (host !== '511on.ca' && !host.endsWith('.traveliq.co'))
    ) {
      return '';
    }
    const viewId = decodeURIComponent(match[1]);
    if (!/^[A-Za-z0-9_.-]+$/.test(viewId)) return '';
    return `${ONTARIO_511_IMAGE_ORIGIN}${encodeURIComponent(viewId)}`;
  } catch {
    return '';
  }
}

/**
 * Select the best Ontario 511 still view for a camera.
 *
 * @param {Array<object>} views
 * @returns {{url:string,description:string}|null}
 */
function pickOntarioCctvView(views) {
  const enabled = (Array.isArray(views) ? views : [])
    .filter(
      (view) =>
        String(view?.Status || view?.status || '')
          .trim()
          .toLowerCase() === 'enabled',
    )
    .map((view) => ({
      url: normalizeOntarioCctvUrl(view?.Url || view?.url),
      description: String(view?.Description || view?.description || '').trim(),
    }))
    .filter((view) => view.url);
  if (!enabled.length) return null;
  return (
    enabled.find((view) => !/\bdown\b/i.test(view.description)) || enabled[0]
  );
}

/**
 * Fetch Ontario 511 CCTV cameras. Keyless: the catalog is exposed by the
 * public 511 API, while frame URLs are stable still-image endpoints under
 * 511on.ca/map/Cctv/. Only rows with finite Ontario coords and at least one
 * enabled official still view are kept.
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadOntarioSourcesFromOpenData() {
  try {
    const resp = await fetch(ONTARIO_511_CAMERAS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] Ontario 511 camera download failed:', resp.status);
      return [];
    }
    const rows = await resp.json();
    if (!Array.isArray(rows)) return [];

    const cameras = [];
    for (const row of rows) {
      const rawId = String(row?.Id ?? row?.id ?? '').trim();
      if (!rawId) continue;
      const lat = toFiniteNumber(row?.Latitude ?? row?.latitude);
      const lon = toFiniteNumber(row?.Longitude ?? row?.longitude);
      if (!isLikelyOntarioCoordinate(lat, lon)) continue;

      const view = pickOntarioCctvView(row?.Views || row?.views);
      if (!view) continue;

      const cameraId = `on-${rawId}`;
      const location = String(row?.Location || row?.location || '').trim();
      const roadway = String(row?.Roadway || row?.roadway || '').trim();
      const viewLabel =
        view.description && !/\bdown\b/i.test(view.description)
          ? view.description
          : '';
      const label = [
        location || roadway || `Ontario 511 Camera ${rawId}`,
        viewLabel,
      ]
        .filter(Boolean)
        .join(' - ');
      let heading = directionToHeading(row?.Direction ?? row?.direction, true);
      if (!Number.isFinite(heading)) {
        heading = directionToHeading(view.description, true);
      }
      const hasHeading = Number.isFinite(heading);

      cameras.push({
        id: cameraId,
        name: label,
        city: location || roadway || 'Ontario',
        cityId: 'ontario',
        provider: 'Ontario 511',
        lat,
        lon,
        headingDeg: hasHeading ? heading : fallbackHeadingFromId(cameraId),
        headingConfidence: hasHeading ? 'high' : 'low',
        pitchDeg: hasHeading ? -24 : -18,
        fovDeg: hasHeading ? 56 : 44,
        rangeM: hasHeading ? 210 : 145,
        mountHeightM: hasHeading ? 10 : 8,
        groundElevationM: 200,
        feedType: 'image',
        url: view.url,
        snapshotUrl: view.url,
        sourceKind: 'ontario-511-open-data',
        license: 'Open Government Licence - Ontario',
      });
    }

    const unique = Array.from(
      new Map(cameras.map((camera) => [camera.id, camera])).values(),
    );
    const maxRaw = Number(
      process.env.CCTV_ONTARIO_MAX_SOURCES || DEFAULT_ONTARIO_MAX_SOURCES,
    );
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(1000, Math.floor(maxRaw)))
      : DEFAULT_ONTARIO_MAX_SOURCES;
    const prioritized = prioritizeSources(unique, maxCount, ONTARIO_ANCHORS);
    console.log(
      `[CCTV] Loaded Ontario 511 camera sources: ${unique.length} enabled (using nearest ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn(
      '[CCTV] Ontario 511 camera download error:',
      error?.message || error,
    );
    return [];
  }
}

/**
 * Fetch Fintraffic road weather cameras (all of Finland) from Digitraffic.
 * Keyless; one GeoJSON station list per refresh (~37 KB gzipped, 809 stations
 * / 2,275 presets), identifying itself with the `Digitraffic-User` header the
 * service asks for. One PRESET — one fixed view of a station — is one camera
 * here; the presets of a station share its position, and the id-hash fallback
 * heading fans their gizmos apart instead of stacking them on one bearing.
 *
 * Skips stations whose `collectionStatus` is anything but GATHERING and presets
 * with `inCollection: false`, so the mesh carries no dead cameras. Frame URLs
 * are BUILT from the official image origin and a strictly-validated preset id
 * rather than read from the payload, which pins the frame proxy to
 * weathercam.digitraffic.fi by construction; the catalog fetch refuses
 * redirects (`redirect: 'manual'`) so the list host cannot be steered either.
 *
 * No compass heading exists anywhere in this dataset: the per-preset
 * `direction` on the detail endpoint is road-register relative
 * (INCREASING_DIRECTION = "towards higher road addresses"), not a bearing, and
 * converting it would need road geometry this app does not load. Every preset
 * therefore takes the id-hash fallback and the low-confidence pose personality,
 * the same as headingless Austin and TfL cameras.
 *
 * Attribution: "Fintraffic / digitraffic.fi" (CC BY 4.0), registered in
 * src/data/dataCredits.js.
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadFintrafficSourcesFromOpenData() {
  try {
    const resp = await fetch(FINTRAFFIC_STATIONS_URL, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'Digitraffic-User': DIGITRAFFIC_USER,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (resp.status >= 300 && resp.status < 400) {
      console.warn(
        '[CCTV] Fintraffic station list redirected; redirects are not followed',
      );
      return [];
    }
    if (!resp.ok) {
      console.warn('[CCTV] Fintraffic station download failed:', resp.status);
      return [];
    }
    const payload = await resp.json();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    if (!features.length) return [];

    const cameras = [];
    let stationsSeen = 0;
    for (const feature of features) {
      const props = feature?.properties || {};
      const stationId = String(props.id || '').trim();
      if (!stationId) continue;
      // GATHERING is the only status that means "this station is collecting
      // images right now"; REMOVED_TEMPORARILY and friends would render as
      // permanent Street View / synthetic fallbacks.
      if (String(props.collectionStatus || '').toUpperCase() !== 'GATHERING')
        continue;

      const coords = feature?.geometry?.coordinates;
      const lon = toFiniteNumber(coords?.[0]);
      const lat = toFiniteNumber(coords?.[1]);
      if (!isLikelyFinlandCoordinate(lat, lon)) continue;
      // Third coordinate is metres, but 0 means "not reported" rather than sea
      // level, so only a positive value is a real reading. Prior only: the
      // client's one-shot ground snap corrects it on 3D-tile stacks, and on a
      // no-tileset stack this height is what freezes in.
      const reportedElevation = toFiniteNumber(coords?.[2], 0);
      const groundElevationM =
        reportedElevation > 0
          ? Math.min(1400, reportedElevation)
          : FINTRAFFIC_GROUND_ELEVATION_M;

      stationsSeen += 1;
      for (const preset of props.presets || []) {
        if (preset?.inCollection !== true) continue;
        const presetId = String(preset?.id || '').trim();
        // Strict id shape (station id + two-digit view). Also the guard that
        // keeps a hostile id out of the synthesized frame URL's path.
        if (!/^C\d{7}$/.test(presetId)) continue;
        if (!presetId.startsWith(stationId)) continue;

        const cameraId = `fi-${presetId.toLowerCase()}`;
        const imageUrl = `${FINTRAFFIC_IMAGE_ORIGIN}${presetId}.jpg`;
        cameras.push({
          id: cameraId,
          name: fintrafficCameraName(props.name, stationId, presetId),
          city: 'Finland',
          cityId: 'finland',
          provider: 'Fintraffic',
          lat,
          lon,
          // Headingless personality (see JSDoc), identical to TfL's.
          headingDeg: fallbackHeadingFromId(cameraId),
          headingConfidence: 'low',
          pitchDeg: -18,
          fovDeg: 44,
          rangeM: 145,
          mountHeightM: 8,
          groundElevationM,
          feedType: 'image',
          url: imageUrl,
          snapshotUrl: imageUrl,
          sourceKind: 'fintraffic-open-data',
          license: 'Fintraffic / digitraffic.fi (CC BY 4.0)',
        });
      }
    }

    const maxRaw = Number(
      process.env.CCTV_FINTRAFFIC_MAX_SOURCES || DEFAULT_FINTRAFFIC_MAX_SOURCES,
    );
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(600, Math.floor(maxRaw)))
      : DEFAULT_FINTRAFFIC_MAX_SOURCES;
    const prioritized = prioritizeSources(cameras, maxCount, FINLAND_ANCHORS);
    console.log(
      `[CCTV] Loaded Fintraffic camera sources: ${cameras.length} live presets across ${stationsSeen} stations (using nearest ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn(
      '[CCTV] Fintraffic station download error:',
      error?.message || error,
    );
    return [];
  }
}

/**
 * The DriveBC `credit` field mixes third-party image attribution ("Images
 * courtesy of TransLink") with operational notes ("relies on solar power").
 * Only the attribution kind is carried onto the camera, HTML stripped, so a
 * partner-owned feed names its owner in the panel; everything else is dropped.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function driveBcImageCredit(raw) {
  const text = String(raw || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return /courtesy|provided by|presented in cooperation|city of|parks canada/i.test(
    text,
  )
    ? text
    : '';
}

/** DriveBC orientation codes (the eight compass points) as headings in degrees. */
const DRIVEBC_ORIENTATION_HEADINGS = Object.freeze({
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
});

/**
 * Fetch DriveBC highway cameras (British Columbia). Keyless: one list endpoint
 * served by the DriveBC.ca site. Only cameras that are switched on and published
 * (`is_on` and `should_appear`) with a positive integer id and finite coordinates
 * are kept. Frame URLs are built from that id on the official image host and are
 * never read from the payload. Orientation codes give a high-confidence heading;
 * `elevation` is metres above sea level. Attribution: Open Government Licence –
 * British Columbia (registered in src/data/dataCredits.js).
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadDriveBcSourcesFromOpenData() {
  try {
    const resp = await fetch(DRIVEBC_WEBCAMS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] DriveBC camera download failed:', resp.status);
      return [];
    }
    const rows = await resp.json();
    if (!Array.isArray(rows)) return [];

    const cameras = [];
    for (const row of rows) {
      if (row?.is_on !== true || row?.should_appear !== true) continue;
      if (!Number.isSafeInteger(row.id) || row.id <= 0) continue;
      // GeoJSON point order: [longitude, latitude].
      const [lon, lat] = Array.isArray(row.location?.coordinates)
        ? row.location.coordinates
        : [];
      if (!isLikelyBcCoordinate(lat, lon)) continue;

      const cameraId = `drivebc-${row.id}`;
      const heading =
        DRIVEBC_ORIENTATION_HEADINGS[
          String(row.orientation || '')
            .trim()
            .toUpperCase()
        ];
      const hasHeading = Number.isFinite(heading);
      const region = String(row.region_name || '').trim();
      const imageUrl = DRIVEBC_IMAGE_URL(row.id);
      const credit = driveBcImageCredit(row.credit);
      cameras.push({
        id: cameraId,
        name: String(row.name || '').trim() || `DriveBC camera ${row.id}`,
        // DriveBC regions: Lower Mainland, Vancouver Island, Southern Interior,
        // Northern, and "Border Cams" for the US crossings.
        city:
          region === 'Border Cams' ? 'BC Border' : region || 'British Columbia',
        cityId: 'british-columbia',
        provider: 'DriveBC',
        lat,
        lon,
        headingDeg: hasHeading ? heading : fallbackHeadingFromId(cameraId),
        headingConfidence: hasHeading ? 'high' : 'low',
        // Same two pose personalities as the other packs: raw priors that the
        // client's ground snap and manual calibration refine.
        pitchDeg: hasHeading ? -24 : -18,
        fovDeg: hasHeading ? 56 : 44,
        rangeM: hasHeading ? 210 : 145,
        mountHeightM: hasHeading ? 10 : 8,
        // Clamped like Caltrans so a garbage value can't fling a camera
        // kilometres up; sea level is the prior for the coastal default anchors.
        groundElevationM: Number.isFinite(row.elevation)
          ? Math.max(-100, Math.min(4000, row.elevation))
          : 0,
        feedType: 'image',
        url: imageUrl,
        snapshotUrl: imageUrl,
        sourceKind: 'drivebc-open-data',
        license: 'DriveBC, Open Government Licence – British Columbia',
        credit,
      });
    }

    const maxRaw = Number(
      process.env.CCTV_DRIVEBC_MAX_SOURCES || DEFAULT_DRIVEBC_MAX_SOURCES,
    );
    // Up to the catalog ceiling, so a BC-only setup can load the whole province.
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(1200, Math.floor(maxRaw)))
      : DEFAULT_DRIVEBC_MAX_SOURCES;
    const prioritized = prioritizeSources(cameras, maxCount, DRIVEBC_ANCHORS);
    console.log(
      `[CCTV] Loaded DriveBC camera sources: ${cameras.length} published (using nearest ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn(
      '[CCTV] DriveBC camera download error:',
      error?.message || error,
    );
    return [];
  }
}

/**
 * Normalize one TxDOT district catalog into camera source objects. Split out
 * from the fetch so the shape handling is unit-testable without a network.
 *
 * The payload nests cameras under `roadwayCctvStatuses`, keyed by roadway.
 * Only `Device Online` rows register: an offline TxDOT device keeps serving a
 * stale frame that can be years old and would otherwise look live.
 *
 * @param {object} payload - Parsed GetCctvStatusListByDistrict response.
 * @param {string} district - TxDOT district code, e.g. 'AUS'.
 * @returns {Array<object>} Normalized camera source objects.
 */
export function normalizeTxdotDistrictPayload(payload, district) {
  const byRoadway = payload?.roadwayCctvStatuses;
  if (!byRoadway || typeof byRoadway !== 'object') return [];
  const code = String(district || '').toUpperCase();
  const groundElevationM =
    TXDOT_DISTRICT_ELEVATION_M[code] ?? TXDOT_DEFAULT_ELEVATION_M;
  const cameras = [];
  const seen = new Set();

  for (const rows of Object.values(byRoadway)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (String(row?.statusDescription || '') !== 'Device Online') continue;
      if (row?.hasSnapshot === false) continue;
      // Coordinates must be present as numbers: Number(null) and Number('')
      // are both 0, which would silently park a camera on null island.
      const lat = typeof row?.latitude === 'number' ? row.latitude : NaN;
      const lon = typeof row?.longitude === 'number' ? row.longitude : NaN;
      if (!isLikelyTexasCoordinate(lat, lon)) continue;

      // icd_Id is the device key the snapshot endpoint takes and is unique
      // within a district. An interchange camera appears under both of its
      // roadways, so dedupe on it.
      const icdId = String(row?.icd_Id || '').trim();
      if (!icdId || seen.has(icdId)) continue;
      seen.add(icdId);

      const name = String(row?.name || icdId).trim();
      // Heading comes from an explicit travel token in the NAME ("US-290 EB"),
      // parsed in strict mode: bare cardinals are refused because Texas route
      // names are full of them ("N Lamar", "West Ave"). Deliberately NOT from
      // row.dirDescription / equipLoc.direction: that is the ROADWAY's
      // canonical direction, not the camera's facing (it reads "North" for
      // most Austin rows, including every east-west highway).
      const heading = directionToHeading(name, false);
      const hasHeading = Number.isFinite(heading);
      // The device key itself, base64url-encoded, so every distinct key gets
      // a distinct id (a hash or a slug can collide) and the key is
      // recoverable from the id.
      const cameraId = `txdot-${code.toLowerCase()}-${Buffer.from(icdId, 'utf8').toString('base64url')}`;
      const snapshot = new URL(TXDOT_CCTV_SNAPSHOT_URL);
      snapshot.searchParams.set('icdId', icdId);
      snapshot.searchParams.set('districtCode', code);

      cameras.push({
        id: cameraId,
        name,
        city: String(row?.equipLoc?.roadway || code),
        cityId: `tx-${code.toLowerCase()}`,
        provider: 'TxDOT',
        lat,
        lon,
        headingDeg: hasHeading ? heading : fallbackHeadingFromId(cameraId),
        headingConfidence: hasHeading ? 'high' : 'low',
        // Same two pose personalities as the other packs: raw priors the
        // client's ground snap and manual calibration refine.
        pitchDeg: hasHeading ? -24 : -18,
        fovDeg: hasHeading ? 56 : 44,
        rangeM: hasHeading ? 210 : 145,
        // TxDOT mounts run tall on highway poles and mast arms.
        mountHeightM: hasHeading ? 12 : 10,
        groundElevationM,
        feedType: 'image',
        // JSON carrying a base64 JPEG; media.js decodes it for this origin only.
        url: snapshot.toString(),
        snapshotUrl: snapshot.toString(),
        sourceKind: 'txdot-its',
        license: 'Public TxDOT traffic camera data',
        code: cameraDisplayCode(icdId.toUpperCase()),
      });
    }
  }
  return cameras;
}

/**
 * Fetch TxDOT ITS highway cameras (Texas), keyless. Districts come from
 * CCTV_TXDOT_DISTRICTS (comma-separated codes; empty string disables the
 * pack). One official JSON catalog per district, identical schema statewide;
 * districts fetch in parallel and fail independently.
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadTxdotSourcesFromOpenData() {
  const districtsRaw =
    process.env.CCTV_TXDOT_DISTRICTS ?? DEFAULT_TXDOT_DISTRICTS;
  const districts = [
    ...new Set(
      String(districtsRaw)
        .split(',')
        .map((token) => token.trim().toUpperCase())
        .filter((code) => TXDOT_DISTRICTS.has(code)),
    ),
  ];
  if (!districts.length) return [];

  const settled = await Promise.allSettled(
    districts.map(async (district) => {
      const resp = await fetch(TXDOT_CCTV_STATUS_URL(district), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'earth-eye-cctv-proxy/1.0',
        },
        signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
      });
      if (!resp.ok) throw new Error(`${district} HTTP ${resp.status}`);
      return { district, payload: await resp.json() };
    }),
  );

  const cameras = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      console.warn(
        '[CCTV] TxDOT district fetch failed:',
        result.reason?.message || result.reason,
      );
      continue;
    }
    cameras.push(
      ...normalizeTxdotDistrictPayload(
        result.value.payload,
        result.value.district,
      ),
    );
  }

  const maxRaw = Number(
    process.env.CCTV_TXDOT_MAX_SOURCES || DEFAULT_TXDOT_MAX_SOURCES,
  );
  const maxCount = Number.isFinite(maxRaw)
    ? Math.max(8, Math.min(2000, Math.floor(maxRaw)))
    : DEFAULT_TXDOT_MAX_SOURCES;
  const prioritized = prioritizeSources(cameras, maxCount, TXDOT_ANCHORS);
  console.log(
    `[CCTV] Loaded TxDOT camera sources: ${cameras.length} online across ${districts.join(',')} (using nearest ${prioritized.length})`,
  );
  return prioritized;
}

/**
 * Load Tallinn intersection cameras from the curated catalog file.
 *
 * Frames are public JPEG stills on ristmikud.tallinn.ee (stable /last/camNNN.jpg
 * URLs). The catalog ships coordinates + curated heading priors; only official
 * ristmikud HTTPS URLs are kept (proxy fetches registered URLs only).
 *
 * @returns {Array<object>} Normalized camera source objects.
 */
export function loadTallinnSourcesFromCatalog({
  sourceRoot = process.cwd(),
} = {}) {
  const sourceFile =
    process.env.CCTV_TALLINN_SOURCES_FILE || DEFAULT_TALLINN_SOURCE_FILE;
  const resolved = path.isAbsolute(sourceFile)
    ? sourceFile
    : path.resolve(sourceRoot, sourceFile);
  let rows = [];
  try {
    if (!fs.existsSync(resolved)) {
      console.warn('[CCTV] Tallinn source file missing:', resolved);
      return [];
    }
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    rows = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(
      '[CCTV] Tallinn source file read error:',
      error?.message || error,
    );
    return [];
  }

  const cameras = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const cameraId =
      typeof item.id === 'string' || typeof item.id === 'number'
        ? String(item.id).trim()
        : '';
    if (!cameraId) continue;
    const lat = typeof item.lat === 'number' ? item.lat : NaN;
    const lon = typeof item.lon === 'number' ? item.lon : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // Rough Estonia/Tallinn metro sanity (allows nearby suburbs already in the pack).
    if (lat < 59.2 || lat > 59.7 || lon < 24.3 || lon > 25.4) continue;

    const imageUrl =
      typeof item.url === 'string'
        ? item.url.trim()
        : typeof item.snapshotUrl === 'string'
          ? item.snapshotUrl.trim()
          : '';
    if (!imageUrl.startsWith(TALLINN_IMAGE_ORIGIN)) continue;

    const extractedHeading = toFiniteNumber(item.headingDeg, NaN);
    const hasHeading = Number.isFinite(extractedHeading);
    const headingDeg = hasHeading
      ? ((extractedHeading % 360) + 360) % 360
      : fallbackHeadingFromId(cameraId);
    const headingConfidence = hasHeading
      ? String(item.headingConfidence || '').toLowerCase() === 'low'
        ? 'low'
        : 'high'
      : 'low';
    cameras.push({
      id: cameraId,
      name: String(item.name || cameraId).trim(),
      city: 'Tallinn',
      cityId: 'tallinn',
      provider: 'City of Tallinn',
      lat,
      lon,
      headingDeg,
      headingConfidence,
      pitchDeg: headingConfidence === 'high' ? -24 : -18,
      fovDeg: headingConfidence === 'high' ? 56 : 44,
      rangeM: headingConfidence === 'high' ? 210 : 145,
      mountHeightM: headingConfidence === 'high' ? 10 : 8,
      groundElevationM: toFiniteNumber(item.groundElevationM, 15),
      feedType: 'image',
      url: imageUrl,
      snapshotUrl: imageUrl,
      sourceKind: 'tallinn-ristmikud',
      license: 'Public City of Tallinn traffic camera data',
      poseSource: hasHeading ? 'curated' : undefined,
    });
  }

  const unique = Array.from(
    new Map(cameras.map((camera) => [camera.id, camera])).values(),
  );
  const maxRaw = Number(
    process.env.CCTV_TALLINN_MAX_SOURCES || DEFAULT_TALLINN_MAX_SOURCES,
  );
  const maxCount = Number.isFinite(maxRaw)
    ? Math.max(8, Math.min(300, Math.floor(maxRaw)))
    : DEFAULT_TALLINN_MAX_SOURCES;
  const prioritized = prioritizeSources(unique, maxCount, [TALLINN_CENTER]);
  console.log(
    `[CCTV] Loaded Tallinn camera sources: ${unique.length} (using nearest ${prioritized.length})`,
  );
  return prioritized;
}

/**
 * Extract DATEX2 predefined-location id → {name, lat, lon} from Tarktee XML.
 *
 * @param {string} xml
 * @returns {Map<string,{name:string,lat:number,lon:number}>}
 */
export function parseTarkteeDatexLocations(xml) {
  const out = new Map();
  const blockRe =
    /<predefinedLocation\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/predefinedLocation>/g;
  let match;
  while ((match = blockRe.exec(String(xml || ''))) !== null) {
    const id = match[1];
    const body = match[2];
    // Skip the group container (no coordinates of its own).
    const latMatch = /<latitude>\s*(-?\d+(?:\.\d+)?)\s*<\/latitude>/i.exec(
      body,
    );
    const lonMatch = /<longitude>\s*(-?\d+(?:\.\d+)?)\s*<\/longitude>/i.exec(
      body,
    );
    if (!latMatch || !lonMatch) continue;
    const lat = toFiniteNumber(latMatch[1]);
    const lon = toFiniteNumber(lonMatch[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const nameMatch = /<value\b[^>]*>\s*([^<]+?)\s*<\/value>/i.exec(body);
    const name = nameMatch ? nameMatch[1].trim() : id;
    out.set(id, { name, lat, lon });
  }
  return out;
}

/**
 * Extract DATEX2 traffic-view location id → HTTPS image URL from Tarktee XML.
 *
 * @param {string} xml
 * @returns {Map<string,string>}
 */
export function parseTarkteeDatexImages(xml) {
  const out = new Map();
  const blockRe = /<trafficView\b[^>]*>([\s\S]*?)<\/trafficView>/g;
  let match;
  while ((match = blockRe.exec(String(xml || ''))) !== null) {
    const body = match[1];
    const refMatch =
      /<linearPredefinedLocationReference\b[^>]*\bid="([^"]+)"/i.exec(body);
    const urlMatch = /<urlLinkAddress>\s*([^<\s]+)\s*<\/urlLinkAddress>/i.exec(
      body,
    );
    if (!refMatch || !urlMatch) continue;
    const url = urlMatch[1].trim();
    if (!url.startsWith(TARKTEE_IMAGE_ORIGIN)) continue;
    out.set(refMatch[1], url);
  }
  return out;
}

/**
 * Fetch Estonian Transpordiamet / Tarktee road-weather cameras via DATEX2.
 *
 * Locations and current still URLs are keyless public feeds. Image paths on the
 * ArcGIS MapServer layer go stale; DATEX always carries the current JPEG URL.
 * Only https://tarktee.transpordiamet.ee/images/… URLs are registered.
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadTarkteeSourcesFromDatex() {
  try {
    const [locResp, imgResp] = await Promise.all([
      fetch(TARKTEE_LOCATIONS_URL, {
        headers: { Accept: 'application/xml,text/xml,*/*' },
        signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
      }),
      fetch(TARKTEE_IMAGES_URL, {
        headers: { Accept: 'application/xml,text/xml,*/*' },
        signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
      }),
    ]);
    if (!locResp.ok) {
      console.warn('[CCTV] Tarktee locations download failed:', locResp.status);
      return [];
    }
    if (!imgResp.ok) {
      console.warn('[CCTV] Tarktee images download failed:', imgResp.status);
      return [];
    }
    const [locXml, imgXml] = await Promise.all([
      locResp.text(),
      imgResp.text(),
    ]);
    const locations = parseTarkteeDatexLocations(locXml);
    const images = parseTarkteeDatexImages(imgXml);
    if (!locations.size || !images.size) {
      console.warn('[CCTV] Tarktee DATEX parse empty:', {
        locations: locations.size,
        images: images.size,
      });
      return [];
    }

    const cameras = [];
    for (const [locationId, loc] of locations.entries()) {
      const imageUrl = images.get(locationId);
      if (!imageUrl) continue;
      // Estonia bounding box (mainland + nearby islands).
      if (loc.lat < 57.4 || loc.lat > 59.9 || loc.lon < 21.5 || loc.lon > 28.4)
        continue;

      const numMatch = /\/images\/(\d+)\//.exec(imageUrl);
      const cameraId = numMatch
        ? `ee-tarktee-${numMatch[1]}`
        : `ee-tarktee-${locationId}`;
      cameras.push({
        id: cameraId,
        name: loc.name,
        city: loc.name,
        cityId: 'estonia',
        provider: 'Transpordiamet (Tarktee)',
        lat: loc.lat,
        lon: loc.lon,
        headingDeg: fallbackHeadingFromId(cameraId),
        headingConfidence: 'low',
        pitchDeg: -18,
        fovDeg: 44,
        rangeM: 145,
        mountHeightM: 8,
        groundElevationM: 40,
        feedType: 'image',
        url: imageUrl,
        snapshotUrl: imageUrl,
        sourceKind: 'tarktee-datex',
        license: 'Public Transpordiamet / Tarktee road weather camera data',
      });
    }

    const maxRaw = Number(
      process.env.CCTV_TARKTEE_MAX_SOURCES || DEFAULT_TARKTEE_MAX_SOURCES,
    );
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(300, Math.floor(maxRaw)))
      : DEFAULT_TARKTEE_MAX_SOURCES;
    const prioritized = prioritizeSources(cameras, maxCount, TARKTEE_ANCHORS);
    console.log(
      `[CCTV] Loaded Tarktee camera sources: ${cameras.length} with images (using nearest ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn(
      '[CCTV] Tarktee DATEX download error:',
      error?.message || error,
    );
    return [];
  }
}

/**
 * Load the Warendorf municipal webcams (Stadt Warendorf Marktplatz, Kreis
 * Warendorf registration offices) from the curated catalog file. Poses are
 * curated; only the two official municipal image hosts are registered.
 *
 * @returns {Array<object>} Normalized camera source objects.
 */
export function loadWarendorfSourcesFromCatalog({
  sourceRoot = process.cwd(),
} = {}) {
  const sourceFile =
    process.env.CCTV_WARENDORF_SOURCES_FILE || DEFAULT_WARENDORF_SOURCE_FILE;
  const resolved = path.isAbsolute(sourceFile)
    ? sourceFile
    : path.resolve(sourceRoot, sourceFile);
  let rows = [];
  try {
    if (!fs.existsSync(resolved)) {
      console.warn('[CCTV] Warendorf source file missing:', resolved);
      return [];
    }
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    rows = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(
      '[CCTV] Warendorf source file read error:',
      error?.message || error,
    );
    return [];
  }
  const cameras = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const url =
      typeof item.url === 'string'
        ? item.url.trim()
        : typeof item.snapshotUrl === 'string'
          ? item.snapshotUrl.trim()
          : '';
    if (!id || !WARENDORF_IMAGE_ORIGINS.some((o) => url.startsWith(o)))
      continue;
    const lat = typeof item.lat === 'number' ? item.lat : NaN;
    const lon = typeof item.lon === 'number' ? item.lon : NaN;
    if (!isPlausibleLatLon(lat, lon)) continue;
    cameras.push({
      ...item,
      id,
      url,
      snapshotUrl: url,
      cityId: String(item.cityId || 'warendorf'),
      feedType: 'image',
      sourceKind: 'municipal-webcam',
    });
  }
  console.log('[CCTV] Loaded Warendorf camera sources:', cameras.length);
  return cameras;
}

/**
 * Label for one NSW camera: its `view` sentence when that is really a view
 * ("5 Ways at The Boulevarde looking west towards Sutherland"), else the
 * title ("5 Ways (Miranda)"). A works notice longer than NSW_MAX_VIEW_LABEL or
 * containing a line break is not a label.
 *
 * @param {{view?:string, title?:string}} props
 * @returns {string}
 */
export function nswCameraLabel(props) {
  const view = String(props?.view || '').trim();
  const title = String(props?.title || '').trim();
  const viewIsALabel =
    view.length > 0 &&
    view.length <= NSW_MAX_VIEW_LABEL &&
    !/[\r\n]/.test(view);
  return viewIsALabel ? view : title;
}

/**
 * One Live Traffic NSW camera feature -> one catalog source, or null. Every
 * camera carries a compass `direction` ("N-E") and a `view` sentence.
 *
 * @param {object} feature - GeoJSON feature from the traffic-cam feed.
 * @returns {?object}
 */
export function nswCameraToSource(feature) {
  const rawId = String(feature?.id || '').trim();
  if (!rawId) return null;
  const coords = feature?.geometry?.coordinates;
  // Numbers only: Number(null) and Number('') are 0, which would park a
  // camera on the equator.
  const lon = typeof coords?.[0] === 'number' ? coords[0] : NaN;
  const lat = typeof coords?.[1] === 'number' ? coords[1] : NaN;
  if (!isLikelyNswCoordinate(lat, lon)) return null;
  const props = feature?.properties || {};
  const url = String(props.href || '').trim();
  if (!url.startsWith(NSW_IMAGE_ORIGIN)) return null;
  // "N-E" -> "NE" for the compass lookup.
  const direction = String(props.direction || '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '');
  const heading = directionToHeading(direction, true);
  const hasHeading = Number.isFinite(heading);
  const cameraId = `nsw-${rawId}`;
  return {
    id: cameraId,
    name: nswCameraLabel(props) || `NSW ${rawId}`,
    city: String(props.region || 'New South Wales').replace(/_/g, ' '),
    cityId: 'nsw',
    provider: 'Live Traffic NSW',
    lat,
    lon,
    headingDeg: hasHeading ? heading : fallbackHeadingFromId(cameraId),
    headingConfidence: hasHeading ? 'high' : 'low',
    pitchDeg: hasHeading ? -24 : -18,
    fovDeg: hasHeading ? 56 : 44,
    rangeM: hasHeading ? 210 : 145,
    mountHeightM: hasHeading ? 10 : 8,
    groundElevationM: 25, // Sydney basin prior; the client's ground snap corrects.
    feedType: 'image',
    url,
    snapshotUrl: url,
    sourceKind: 'nsw-livetraffic',
    license: 'Live Traffic NSW — Transport for NSW, CC BY 4.0',
    code: cameraDisplayCode(String(props.title || '').toUpperCase() || rawId),
  };
}

/**
 * Fetch Live Traffic NSW cameras (New South Wales), keyless: the public
 * traffic-cam GeoJSON feed. Frames are stills on webcams.transport.nsw.gov.au.
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadNswSourcesFromOpenData() {
  try {
    const resp = await fetch(NSW_CAMERAS_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'earth-eye-cctv-proxy/1.0',
      },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] NSW camera download failed:', resp.status);
      return [];
    }
    const body = await resp.json();
    const features = Array.isArray(body?.features) ? body.features : [];
    const cameras = features.map(nswCameraToSource).filter(Boolean);
    const maxRaw = Number(
      process.env.CCTV_NSW_MAX_SOURCES || DEFAULT_NSW_MAX_SOURCES,
    );
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(900, Math.floor(maxRaw)))
      : DEFAULT_NSW_MAX_SOURCES;
    const prioritized = prioritizeSources(cameras, maxCount, [SYDNEY_CENTER]);
    console.log(
      `[CCTV] Loaded NSW camera sources: ${cameras.length} (using nearest ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] NSW camera download error:', error?.message || error);
    return [];
  }
}

/**
 * Upgrade a catalog frame URL to HTTPS and pin it to the City of Calgary host.
 *
 * Most rows ship `http://`; the host answers HTTPS and 301-redirects there, so
 * upgrading avoids a redirect on every frame fetch. Anything not on the
 * official origin is refused rather than proxied, the same pin the TfL and
 * Tarktee packs apply.
 *
 * @param {string|null|undefined} raw - `camera_url.url` from the dataset.
 * @returns {?string} Pinned HTTPS URL, or null when unusable.
 */
export function normalizeCalgaryImageUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  parsed.protocol = 'https:';
  const upgraded = parsed.toString();
  return upgraded.startsWith(CALGARY_IMAGE_ORIGIN) ? upgraded : null;
}

/**
 * Stable camera id from a frame URL.
 *
 * The dataset carries no id column; the frame filename ("loc86.jpg") is the
 * only stable per-camera token and is what the city keys on. Falls back to a
 * slug of the whole path so a filename-scheme change degrades to a still-stable
 * id rather than dropping the camera.
 *
 * @param {string} imageUrl - A normalized Calgary frame URL.
 * @returns {?string} Provider-stable id, or null when underivable.
 */
export function calgaryCameraId(imageUrl) {
  const text = String(imageUrl ?? '').trim();
  if (!text) return null;
  let path;
  try {
    path = new URL(text).pathname;
  } catch {
    return null;
  }
  const numbered = path.match(/loc(\d+)\.jpg$/i);
  if (numbered) return `calgary-${numbered[1]}`;
  const slug = path
    .replace(/^\/+|\.[a-z0-9]+$/gi, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
  return slug ? `calgary-${slug}` : null;
}

/**
 * Label for one Calgary camera: the intersection an operator recognises
 * ("Bow Trail / 37 Street SW"), used verbatim including its quadrant suffix,
 * which is part of the street address. It must never be read as a facing.
 *
 * @param {object} record - Raw Socrata row.
 * @param {string} cameraId - Derived stable id.
 * @returns {string}
 */
export function calgaryCameraName(record, cameraId) {
  const location = String(record?.camera_location ?? '').trim();
  if (location) return location;
  const described = String(record?.camera_url?.description ?? '').trim();
  if (described) return described;
  return `Calgary Camera ${String(cameraId).replace(/^calgary-/, '')}`;
}

/**
 * One Open Calgary row -> one catalog source, or null.
 *
 * NO HEADING IS DERIVED FROM THE RECORD, and the fields that look like one are
 * not. Every row carries a `quadrant` ("NE"/"NW"/"SE"/"SW", and combinations
 * like "NW/NE") and a `camera_location` ending in the same token ("9 Avenue /
 * 3 Street SE"). That is Calgary's address grid — the quarter of the city the
 * intersection sits in — not a camera bearing. Handing either to
 * directionToHeading() returns a confident compass bearing for every row and
 * every one would be wrong. Headings therefore use the shared id-hash fallback
 * at low confidence, exactly as headingless TfL and Fintraffic cameras do, and
 * the operator corrects them with the calibration gizmo.
 *
 * @param {object} record - Raw Socrata row.
 * @returns {?object}
 */
export function calgaryCameraToSource(record) {
  if (!record || typeof record !== 'object') return null;
  const coordinates = record?.point?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon = toFiniteNumber(coordinates[0]);
  const lat = toFiniteNumber(coordinates[1]);
  if (!isLikelyCalgaryCoordinate(lat, lon)) return null;

  const imageUrl = normalizeCalgaryImageUrl(record?.camera_url?.url);
  if (!imageUrl) return null;
  const cameraId = calgaryCameraId(imageUrl);
  if (!cameraId) return null;
  const name = calgaryCameraName(record, cameraId);

  return {
    id: cameraId,
    name,
    city: 'Calgary',
    cityId: 'calgary',
    provider: 'The City of Calgary',
    lat,
    lon,
    headingDeg: fallbackHeadingFromId(cameraId),
    headingConfidence: 'low',
    pitchDeg: -18,
    fovDeg: 44,
    rangeM: 145,
    mountHeightM: 8,
    // Calgary sits high on the prairie; the client's one-shot ground snap
    // corrects this prior wherever 3D tiles are loaded.
    groundElevationM: 1045,
    feedType: 'image',
    url: imageUrl,
    snapshotUrl: imageUrl,
    sourceKind: 'calgary-open-data',
    license:
      'Contains information licensed under the Open Government Licence – City of Calgary',
    // Unselected-label code: the intersection, so a camera at rest reads as a
    // place rather than as its id.
    code: cameraDisplayCode(name.toUpperCase()),
  };
}

/**
 * Fetch City of Calgary traffic cameras from Open Calgary (Socrata dataset
 * `k7p9-kppz`), keyless. Frames are stills on trafficcam.calgary.ca.
 *
 * @returns {Promise<Array<object>>} Normalized camera source objects.
 */
export async function loadCalgarySourcesFromOpenData() {
  try {
    const endpoint =
      process.env.CCTV_CALGARY_ROWS_URL || DEFAULT_CALGARY_ROWS_URL;
    const resp = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    // A response this loader will not read still owns its transport until the
    // body is released, so every rejection path cancels before returning.
    const discard = async () => {
      try {
        await resp.body?.cancel();
      } catch {
        /* no-op */
      }
      return [];
    };
    if (resp.status >= 300 && resp.status < 400) {
      console.warn(
        '[CCTV] Calgary catalog redirected; redirects are not followed',
      );
      return discard();
    }
    if (!resp.ok) {
      console.warn('[CCTV] Calgary camera download failed:', resp.status);
      return discard();
    }
    const rows = await readResponseJsonCapped(resp, CALGARY_MAX_CATALOG_BYTES);
    if (!Array.isArray(rows)) return [];
    const cameras = [];
    const seen = new Set();
    for (const record of rows) {
      const camera = calgaryCameraToSource(record);
      if (!camera || seen.has(camera.id)) continue;
      seen.add(camera.id);
      cameras.push(camera);
    }
    const maxRaw = Number(
      process.env.CCTV_CALGARY_MAX_SOURCES || DEFAULT_CALGARY_MAX_SOURCES,
    );
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(400, Math.floor(maxRaw)))
      : DEFAULT_CALGARY_MAX_SOURCES;
    const prioritized = prioritizeSources(cameras, maxCount, [
      CALGARY_DOWNTOWN,
    ]);
    console.log(
      `[CCTV] Loaded Calgary camera sources: ${cameras.length} (using nearest ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn(
      '[CCTV] Calgary camera download error:',
      error?.message || error,
    );
    return [];
  }
}

export async function loadDelDOTSourcesFromOpenData() {
  try {
    const resp = await fetch(DELDOT_CCTV_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!resp.ok) {
      console.warn('[CCTV] DelDOT source download failed:', resp.status);
      return [];
    }
    const payload = await readResponseJsonCapped(resp, 2 * 1024 * 1024);
    const rows = Array.isArray(payload?.videoCameras)
      ? payload.videoCameras
      : [];
    if (!rows.length) return [];

    const cameras = [];
    for (const row of rows) {
      if (String(row?.status).toLowerCase() !== 'active') continue;
      const lat = toFiniteNumber(row?.lat);
      const lon = toFiniteNumber(row?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      // Delaware bounding box — a bad upstream coord can't place a camera out of state.
      if (lat < 38.4 || lat > 39.9 || lon < -75.85 || lon > -75.0) continue;

      // Prefer the catalog's HTTPS HLS transport; no subprocess is required.
      let stream;
      try {
        stream = new URL(String(row?.urls?.m3u8s || ''));
      } catch {
        continue;
      }
      if (
        stream.origin !== 'https://video.deldot.gov' ||
        stream.username ||
        stream.password ||
        !/^\/live\/[A-Za-z0-9_.-]+\/playlist\.m3u8$/.test(stream.pathname)
      )
        continue;
      const streamUrl = stream.href;

      const id = String(row?.id || '').trim();
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) continue;
      const cameraId = `deldot-${id.toLowerCase()}`;
      const title = String(row?.title || '').trim();

      // Title carries an unambiguous travel token for ~1 in 5 cameras
      // ("US 13 SB @ ..."). directionToHeading (allowBare=false) matches only
      // NB/SB/EB/WB, never a bare "W"/"N" street prefix — "W NORTH ST" yields
      // no heading and falls back.
      const heading = directionToHeading(title);
      const hasHeading = Number.isFinite(heading);

      cameras.push({
        id: cameraId,
        name: title || `DelDOT ${id}`,
        city: String(row?.county ? `${row.county} County` : 'Delaware'),
        cityId: `deldot-${String(row?.county || 'de')
          .toLowerCase()
          .replace(/\s+/g, '-')}`,
        provider: 'DelDOT',
        lat,
        lon,
        headingDeg: hasHeading ? heading : fallbackHeadingFromId(cameraId),
        headingConfidence: hasHeading ? 'high' : 'low',
        // Fabricated RAW PRIOR poses (same personalities as Austin/Caltrans);
        // the client ground-snap + manual calibration own the truth.
        pitchDeg: hasHeading ? -24 : -18,
        fovDeg: hasHeading ? 56 : 44,
        rangeM: hasHeading ? 210 : 145,
        mountHeightM: hasHeading ? 10 : 8,
        groundElevationM: 10, // Estimated prior; client ground resolution owns placement.
        feedType: 'hls',
        url: streamUrl,
        snapshotUrl: '',
        sourceKind: 'deldot-open-data',
        license: 'Public DelDOT traffic camera',
      });
    }

    const unique = Array.from(
      new Map(cameras.map((camera) => [camera.id, camera])).values(),
    );
    const maxRaw = Number(
      process.env.CCTV_DELDOT_MAX_SOURCES || DEFAULT_DELDOT_MAX_SOURCES,
    );
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(400, Math.floor(maxRaw)))
      : DEFAULT_DELDOT_MAX_SOURCES;
    const prioritized = prioritizeSources(unique, maxCount, DELDOT_ANCHORS);
    console.log(
      `[CCTV] Loaded DelDOT camera sources: ${unique.length} Active (using nearest ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn(
      '[CCTV] DelDOT source download error:',
      error?.message || error,
    );
    return [];
  }
}


const DEFAULT_SEATTLE_API =
  'https://web.seattle.gov/Travelers/api/Map/Data?zoomId=13&type=2';
const SEATTLE_IMAGE_BASE = 'https://www.seattle.gov/trafficcams/images/';
const DEFAULT_SEATTLE_MAX = 120;
const SEATTLE_CENTER = Object.freeze({ lat: 47.6062, lon: -122.3321 });

/**
 * Seattle SDOT / WSDOT traffic cameras from the public Travelers Map API.
 * Still frames only. Pack is permission-pending (CCTV_SEATTLE_ENABLED=1).
 */
export async function loadSeattleSourcesFromOpenData() {
  const endpoint = process.env.CCTV_SEATTLE_API_URL || DEFAULT_SEATTLE_API;
  try {
    const resp = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'earth-eye-cctv/1.0 (private hosted instance; +https://eartheye.us)',
      },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] Seattle source download failed:', resp.status);
      return [];
    }
    const payload = await resp.json();
    const features = Array.isArray(payload?.Features) ? payload.Features : [];
    const cameras = [];
    for (const feat of features) {
      const coords = feat?.PointCoordinate;
      const lat = Number(coords?.[0]);
      const lon = Number(coords?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const cams = Array.isArray(feat?.Cameras) ? feat.Cameras : [];
      for (const cam of cams) {
        const id = String(cam?.Id || '').trim();
        const file = String(cam?.ImageUrl || '').trim();
        if (!id || !file) continue;
        const kind = String(cam?.Type || 'sdot').toLowerCase();
        cameras.push({
          id: `seattle:${id}`,
          name: String(cam?.Description || id).trim(),
          city: 'Seattle',
          cityId: 'seattle',
          provider:
            kind === 'wsdot'
              ? 'Washington State DOT (via Seattle Travelers)'
              : 'Seattle Department of Transportation',
          lat,
          lon,
          headingDeg: 0,
          headingConfidence: 'low',
          pitchDeg: -18,
          fovDeg: 50,
          rangeM: 160,
          mountHeightM: 8,
          groundElevationM: 50,
          feedType: 'image',
          url: `${SEATTLE_IMAGE_BASE}${encodeURIComponent(file)}`,
          snapshotUrl: `${SEATTLE_IMAGE_BASE}${encodeURIComponent(file)}`,
          sourceKind: 'seattle-travelers',
          license: 'Pending review — City of Seattle / WSDOT traffic camera still',
        });
      }
    }
    const unique = Array.from(
      new Map(cameras.map((c) => [c.id, c])).values(),
    );
    const maxRaw = Number(process.env.CCTV_SEATTLE_MAX_SOURCES || DEFAULT_SEATTLE_MAX);
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(300, Math.floor(maxRaw)))
      : DEFAULT_SEATTLE_MAX;
    const prioritized = prioritizeSources(unique, maxCount, [SEATTLE_CENTER]);
    console.log(
      `[CCTV] Loaded Seattle camera sources: ${unique.length} (using ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] Seattle source load failed:', error?.message || error);
    return [];
  }
}


const DEFAULT_IOWA_API =
  'https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query';
const DEFAULT_IOWA_MAX = 120;
const IOWA_CENTER = Object.freeze({ lat: 41.5868, lon: -93.625 });
const IOWA_PAGE = 1000;

/**
 * Iowa DOT traffic / RWIS cameras from the public ArcGIS FeatureServer.
 * Stills preferred; HLS VideoURL recorded when present. Permission-pending
 * (CCTV_IOWA_ENABLED=1).
 */
export async function loadIowaSourcesFromOpenData() {
  const endpoint = process.env.CCTV_IOWA_API_URL || DEFAULT_IOWA_API;
  try {
    const cameras = [];
    let offset = 0;
    let more = true;
    while (more) {
      const url = new URL(endpoint);
      url.searchParams.set('where', '1=1');
      url.searchParams.set('outFields', '*');
      url.searchParams.set('outSR', '4326');
      url.searchParams.set('f', 'json');
      url.searchParams.set('resultRecordCount', String(IOWA_PAGE));
      url.searchParams.set('resultOffset', String(offset));
      const resp = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'earth-eye-cctv/1.0 (private hosted instance; +https://eartheye.us)',
        },
        signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
      });
      if (!resp.ok) {
        console.warn('[CCTV] Iowa source download failed:', resp.status);
        break;
      }
      const payload = await resp.json();
      const features = Array.isArray(payload?.features) ? payload.features : [];
      for (const feat of features) {
        const a = feat?.attributes || {};
        const g = feat?.geometry || {};
        const lat = Number(a.latitude ?? g.y);
        const lon = Number(a.longitude ?? g.x);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const id = String(a.device_id || a.FID || '').trim();
        const image = String(a.ImageURL || '').trim();
        if (!id || !image) continue;
        const video = String(a.VideoURL || '').trim();
        const kind = String(a.Type || 'Iowa DOT').trim();
        cameras.push({
          id: `iowa:${id}`,
          name: String(a.Desc_ || a.ImageName || id).trim(),
          city: 'Iowa',
          cityId: 'iowa',
          provider: 'Iowa Department of Transportation',
          lat,
          lon,
          headingDeg: 0,
          headingConfidence: 'low',
          pitchDeg: -18,
          fovDeg: 50,
          rangeM: 160,
          mountHeightM: 8,
          groundElevationM: 300,
          feedType: 'image',
          url: image,
          snapshotUrl: image,
          streamUrl: video || null,
          sourceKind: 'iowa-dot-arcgis',
          license:
            'Pending review — CC BY 4.0 + Iowa DOT GIS Terms (traffic camera)',
          meta: { org: a.ORG || null, type: kind || null },
        });
      }
      more = Boolean(payload?.exceededTransferLimit) && features.length > 0;
      offset += features.length;
      if (offset > 5000) break;
    }
    const unique = Array.from(new Map(cameras.map((c) => [c.id, c])).values());
    const maxRaw = Number(process.env.CCTV_IOWA_MAX_SOURCES || DEFAULT_IOWA_MAX);
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(400, Math.floor(maxRaw)))
      : DEFAULT_IOWA_MAX;
    const prioritized = prioritizeSources(unique, maxCount, [IOWA_CENTER]);
    console.log(
      `[CCTV] Loaded Iowa camera sources: ${unique.length} (using ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] Iowa source load failed:', error?.message || error);
    return [];
  }
}


const DEFAULT_ICELAND_API =
  'https://gagnaveita.vegagerdin.is/api/vefmyndavelar2014_1';
const DEFAULT_ICELAND_MAX = 80;
const ICELAND_CENTER = Object.freeze({ lat: 64.1466, lon: -21.9426 });

/**
 * Vegagerðin Iceland road cameras (refreshed stills). Permission-pending
 * (CCTV_ICELAND_ENABLED=1).
 */
export async function loadIcelandSourcesFromOpenData() {
  const endpoint = process.env.CCTV_ICELAND_API_URL || DEFAULT_ICELAND_API;
  try {
    const resp = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'earth-eye-cctv/1.0 (private hosted instance; +https://eartheye.us)',
      },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] Iceland source download failed:', resp.status);
      return [];
    }
    const payload = await resp.json();
    const rows = Array.isArray(payload) ? payload : [];
    const cameras = [];
    for (const row of rows) {
      const lat = Number(row?.Breidd);
      const lon = Number(row?.Lengd);
      const url = String(row?.Slod || '').trim();
      const id = String(row?.Maelist_nr || url || '').trim();
      if (!id || !url || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const name = [row?.Myndavel, row?.Skyring].filter(Boolean).join(' — ') || id;
      cameras.push({
        id: `iceland:${id}`,
        name: String(name).trim(),
        city: 'Iceland',
        cityId: 'iceland',
        provider: 'Vegagerðin (Icelandic Road and Coastal Administration)',
        lat,
        lon,
        headingDeg: 0,
        headingConfidence: 'low',
        pitchDeg: -18,
        fovDeg: 50,
        rangeM: 160,
        mountHeightM: 8,
        groundElevationM: 100,
        feedType: 'image',
        url,
        snapshotUrl: url,
        sourceKind: 'vegagerdin-iceland',
        license: 'Pending review — Vegagerðin public road camera still',
      });
    }
    const unique = Array.from(new Map(cameras.map((c) => [c.id, c])).values());
    const maxRaw = Number(process.env.CCTV_ICELAND_MAX_SOURCES || DEFAULT_ICELAND_MAX);
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(300, Math.floor(maxRaw)))
      : DEFAULT_ICELAND_MAX;
    const prioritized = prioritizeSources(unique, maxCount, [ICELAND_CENTER]);
    console.log(
      `[CCTV] Loaded Iceland camera sources: ${unique.length} (using ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] Iceland source load failed:', error?.message || error);
    return [];
  }
}


const DEFAULT_HK_LOCATIONS =
  'https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml';
const DEFAULT_HK_MAX = 100;
const HK_CENTER = Object.freeze({ lat: 22.3193, lon: 114.1694 });

/**
 * Hong Kong TD traffic snapshot stills. Locations XML + JPEG host.
 * Permission-pending (CCTV_HONGKONG_ENABLED=1).
 */
export async function loadHongKongSourcesFromOpenData() {
  const endpoint = process.env.CCTV_HONGKONG_API_URL || DEFAULT_HK_LOCATIONS;
  try {
    const resp = await fetch(endpoint, {
      headers: {
        Accept: 'application/xml,text/xml,*/*',
        'User-Agent':
          'earth-eye-cctv/1.0 (private hosted instance; +https://eartheye.us)',
      },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] Hong Kong source download failed:', resp.status);
      return [];
    }
    const xml = await resp.text();
    const cameras = [];
    const blocks = xml.split(/<image\b/i).slice(1);
    for (const block of blocks) {
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
        return m ? m[1].trim() : '';
      };
      const key = get('key');
      const url = get('url');
      const lat = Number(get('latitude'));
      const lon = Number(get('longitude'));
      if (!key || !url || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      cameras.push({
        id: `hongkong:${key}`,
        name: get('description') || key,
        city: get('district') || get('region') || 'Hong Kong',
        cityId: 'hongkong',
        provider: 'Hong Kong Transport Department',
        lat,
        lon,
        headingDeg: 0,
        headingConfidence: 'low',
        pitchDeg: -18,
        fovDeg: 50,
        rangeM: 160,
        mountHeightM: 8,
        groundElevationM: 20,
        feedType: 'image',
        url,
        snapshotUrl: url,
        sourceKind: 'hk-td-snapshot',
        license: 'Pending review — DATA.GOV.HK / HK TD traffic snapshot',
      });
    }
    const unique = Array.from(new Map(cameras.map((c) => [c.id, c])).values());
    const maxRaw = Number(process.env.CCTV_HONGKONG_MAX_SOURCES || DEFAULT_HK_MAX);
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(300, Math.floor(maxRaw)))
      : DEFAULT_HK_MAX;
    const prioritized = prioritizeSources(unique, maxCount, [HK_CENTER]);
    console.log(
      `[CCTV] Loaded Hong Kong camera sources: ${unique.length} (using ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] Hong Kong source load failed:', error?.message || error);
    return [];
  }
}


const DEFAULT_QUEBEC_WFS =
  'https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:infos_cameras&outfile=Camera&srsname=EPSG:4326&outputformat=geojson';
const QUEBEC_CLIP = (id) =>
  `https://www.quebec511.info/Carte/Fenetres/camera.ashx?id=${encodeURIComponent(id)}&format=mp4`;
const DEFAULT_QUEBEC_MAX = 80;
const QUEBEC_CENTER = Object.freeze({ lat: 46.8139, lon: -71.208 });

/**
 * Québec 511 traffic cameras (CC BY 4.0 Données Québec). Short MP4 clips —
 * never labeled LIVE. Permission-pending (CCTV_QUEBEC_ENABLED=1).
 */
export async function loadQuebecSourcesFromOpenData() {
  const endpoint = process.env.CCTV_QUEBEC_API_URL || DEFAULT_QUEBEC_WFS;
  try {
    const resp = await fetch(endpoint, {
      headers: {
        Accept: 'application/json,application/geo+json',
        'User-Agent':
          'earth-eye-cctv/1.0 (private hosted instance; +https://eartheye.us)',
      },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] Québec source download failed:', resp.status);
      return [];
    }
    const payload = await resp.json();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    const cameras = [];
    for (const feat of features) {
      const props = feat?.properties || {};
      const coords = feat?.geometry?.coordinates;
      const lon = Number(coords?.[0]);
      const lat = Number(coords?.[1]);
      const id = String(props.IDEcamera || feat?.id || '').trim();
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const name =
        String(
          props.DescriptionLocalisationEn ||
            props.DescriptionLocalisationFr ||
            id,
        ).trim();
      const clip = QUEBEC_CLIP(id);
      cameras.push({
        id: `quebec:${id}`,
        name,
        city: String(props.NomRegionDiffusion || 'Québec').trim(),
        cityId: 'quebec',
        provider:
          'Ministère des Transports et de la Mobilité durable du Québec',
        lat,
        lon,
        headingDeg: 0,
        headingConfidence: 'low',
        pitchDeg: -18,
        fovDeg: 50,
        rangeM: 160,
        mountHeightM: 8,
        groundElevationM: 50,
        // Honest media kind: short looped clip, not a live stream.
        feedType: 'mp4',
        url: clip,
        snapshotUrl: clip,
        sourceKind: 'quebec-511',
        license: 'CC BY 4.0 (Données Québec) — pending embed confirmation',
        attribution:
          'Source: Ministère des Transports et de la Mobilité durable du Québec — Québec 511 (CC BY 4.0)',
        mediaKind: 'clip',
      });
    }
    const unique = Array.from(new Map(cameras.map((c) => [c.id, c])).values());
    const maxRaw = Number(process.env.CCTV_QUEBEC_MAX_SOURCES || DEFAULT_QUEBEC_MAX);
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(300, Math.floor(maxRaw)))
      : DEFAULT_QUEBEC_MAX;
    const prioritized = prioritizeSources(unique, maxCount, [QUEBEC_CENTER]);
    console.log(
      `[CCTV] Loaded Québec camera sources: ${unique.length} (using ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] Québec source load failed:', error?.message || error);
    return [];
  }
}

const DEFAULT_LAKECOUNTY_QUERY =
  'https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/TrafficCamerasTM_Public/FeatureServer/0/query';
const DEFAULT_LAKECOUNTY_MAX = 80;
const LAKECOUNTY_CENTER = Object.freeze({ lat: 42.37, lon: -88.0 });

/**
 * Lake County (IL) PASSAGE stills via IDOT Illinois Gateway FeatureServer.
 * Only rows whose SnapShot host is lakecountypassage.com (travelmidwest excluded).
 */
export async function loadLakeCountySourcesFromOpenData() {
  const base = process.env.CCTV_LAKECOUNTY_API_URL || DEFAULT_LAKECOUNTY_QUERY;
  try {
    const cameras = [];
    let offset = 0;
    for (let page = 0; page < 8; page += 1) {
      const url = new URL(base);
      url.searchParams.set(
        'where',
        "SnapShot LIKE '%lakecountypassage.com%'",
      );
      url.searchParams.set('outFields', '*');
      url.searchParams.set('returnGeometry', 'true');
      url.searchParams.set('outSR', '4326');
      url.searchParams.set('f', 'json');
      url.searchParams.set('resultRecordCount', '500');
      url.searchParams.set('resultOffset', String(offset));
      const resp = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'earth-eye-cctv/1.0 (private hosted instance; +https://eartheye.us)',
        },
        signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
      });
      if (!resp.ok) {
        console.warn('[CCTV] Lake County page failed:', resp.status);
        break;
      }
      const payload = await resp.json();
      const features = Array.isArray(payload?.features) ? payload.features : [];
      if (features.length === 0) break;
      for (const feat of features) {
        const a = feat?.attributes || {};
        const snap = String(a.SnapShot || '').trim();
        if (!snap.includes('lakecountypassage.com')) continue;
        const lon = Number(feat?.geometry?.x ?? a.x);
        const lat = Number(feat?.geometry?.y ?? a.y);
        const id = String(a.OBJECTID || '').trim();
        if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const headingRaw = String(a.CameraDirection || '').trim().toUpperCase();
        const headingMap = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
        const headingDeg = headingMap[headingRaw] ?? 0;
        cameras.push({
          id: `lakecounty:${id}`,
          name: String(a.CameraLocation || `Lake County ${id}`).trim(),
          city: 'Lake County, IL',
          cityId: 'lakecounty',
          provider: 'Lake County PASSAGE / Illinois DOT',
          lat,
          lon,
          headingDeg,
          headingConfidence: headingMap[headingRaw] != null ? 'medium' : 'low',
          pitchDeg: -18,
          fovDeg: 50,
          rangeM: 160,
          mountHeightM: 8,
          groundElevationM: 220,
          feedType: 'image',
          url: snap,
          snapshotUrl: snap,
          sourceKind: 'lake-county-passage',
          license: 'CC BY-SA 2.0 (Illinois Gateway) — pending embed confirmation',
          attribution:
            'Illinois Department of Transportation — Illinois Gateway (CC BY-SA 2.0); images: Lake County PASSAGE',
        });
      }
      offset += features.length;
      if (!payload.exceededTransferLimit) break;
    }
    const unique = Array.from(new Map(cameras.map((c) => [c.id, c])).values());
    const maxRaw = Number(process.env.CCTV_LAKECOUNTY_MAX_SOURCES || DEFAULT_LAKECOUNTY_MAX);
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(300, Math.floor(maxRaw)))
      : DEFAULT_LAKECOUNTY_MAX;
    const prioritized = prioritizeSources(unique, maxCount, [LAKECOUNTY_CENTER]);
    console.log(
      `[CCTV] Loaded Lake County sources: ${unique.length} (using ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] Lake County load failed:', error?.message || error);
    return [];
  }
}

const DEFAULT_SINGAPORE_API =
  'https://api.data.gov.sg/v1/transport/traffic-images';
const DEFAULT_SINGAPORE_MAX = 40;
const SINGAPORE_CENTER = Object.freeze({ lat: 1.35, lon: 103.82 });

/**
 * Singapore LTA traffic images (data.gov.sg). Re-read API each refresh —
 * image URLs are time-scoped. Singapore Open Data Licence v1.0.
 */
export async function loadSingaporeSourcesFromOpenData() {
  const endpoint = process.env.CCTV_SINGAPORE_API_URL || DEFAULT_SINGAPORE_API;
  try {
    const resp = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'earth-eye-cctv/1.0 (private hosted instance; +https://eartheye.us)',
      },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] Singapore source download failed:', resp.status);
      return [];
    }
    const payload = await resp.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const camerasPayload = items[0]?.cameras || [];
    const cameras = [];
    for (const cam of camerasPayload) {
      const id = String(cam.camera_id || '').trim();
      const lat = Number(cam.location?.latitude);
      const lon = Number(cam.location?.longitude);
      const image = String(cam.image || '').trim();
      if (!id || !image || !Number.isFinite(lat) || !Number.isFinite(lon))
        continue;
      cameras.push({
        id: `singapore:${id}`,
        name: `Singapore LTA ${id}`,
        city: 'Singapore',
        cityId: 'singapore',
        provider: 'Land Transport Authority (data.gov.sg)',
        lat,
        lon,
        headingDeg: 0,
        headingConfidence: 'low',
        pitchDeg: -18,
        fovDeg: 50,
        rangeM: 160,
        mountHeightM: 8,
        groundElevationM: 15,
        feedType: 'image',
        url: image,
        snapshotUrl: image,
        sourceKind: 'singapore-lta',
        observedAt: cam.timestamp || items[0]?.timestamp || null,
        license: 'Singapore Open Data Licence v1.0',
        attribution:
          'Contains information from Traffic Images from data.gov.sg under the Singapore Open Data Licence v1.0',
      });
    }
    const unique = Array.from(new Map(cameras.map((c) => [c.id, c])).values());
    const maxRaw = Number(process.env.CCTV_SINGAPORE_MAX_SOURCES || DEFAULT_SINGAPORE_MAX);
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(4, Math.min(200, Math.floor(maxRaw)))
      : DEFAULT_SINGAPORE_MAX;
    const prioritized = prioritizeSources(unique, maxCount, [SINGAPORE_CENTER]);
    console.log(
      `[CCTV] Loaded Singapore sources: ${unique.length} (using ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] Singapore load failed:', error?.message || error);
    return [];
  }
}

const DEFAULT_ALERTCAL_URL =
  'https://cameras.alertcalifornia.org/public-camera-data/all_cameras-v3.json';
const DEFAULT_ALERTCAL_MAX = 60;
const ALERTCAL_CENTER = Object.freeze({ lat: 37.0, lon: -119.5 });

/**
 * ALERTCalifornia wildfire cameras (CC BY-NC-ND 4.0). Non-commercial pack.
 * Full-frame stills only; credit "ALERTCalifornia | UC San Diego".
 */
export async function loadAlertCaliforniaSourcesFromOpenData() {
  const endpoint = process.env.CCTV_ALERTCALIFORNIA_API_URL || DEFAULT_ALERTCAL_URL;
  try {
    const resp = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'earth-eye-cctv/1.0 (private hosted instance; +https://eartheye.us)',
      },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] ALERTCalifornia download failed:', resp.status);
      return [];
    }
    const payload = await resp.json();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    const cameras = [];
    for (const feat of features) {
      const props = feat?.properties || {};
      const coords = feat?.geometry?.coordinates;
      const id = String(props.id || '').trim();
      // Number(null) === 0 — reject missing coordinates explicitly.
      if (
        !id ||
        !Array.isArray(coords) ||
        coords[0] == null ||
        coords[1] == null
      )
        continue;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      const elev = Number(coords[2]);
      const az = Number(props.az_current);
      const frameUrl = `https://cameras.alertcalifornia.org/public-camera-data/${encodeURIComponent(id)}/latest-frame.jpg`;
      cameras.push({
        id: `alertcalifornia:${id}`,
        name: String(props.name || id).trim(),
        city: [props.county, props.state].filter(Boolean).join(', ') || 'California',
        cityId: 'alertcalifornia',
        provider: 'ALERTCalifornia (UC San Diego)',
        lat,
        lon,
        headingDeg: Number.isFinite(az) ? az : 0,
        headingConfidence: Number.isFinite(az) ? 'medium' : 'low',
        pitchDeg: -12,
        fovDeg: Number.isFinite(Number(props.fov)) ? Number(props.fov) : 50,
        rangeM: 400,
        mountHeightM: 12,
        groundElevationM: Number.isFinite(elev) ? elev : 500,
        feedType: 'image',
        url: frameUrl,
        snapshotUrl: frameUrl,
        sourceKind: 'alertcalifornia',
        license: 'CC BY-NC-ND 4.0 — non-commercial',
        attribution: 'ALERTCalifornia | UC San Diego',
        nonCommercial: true,
      });
    }
    const unique = Array.from(new Map(cameras.map((c) => [c.id, c])).values());
    const maxRaw = Number(process.env.CCTV_ALERTCALIFORNIA_MAX_SOURCES || DEFAULT_ALERTCAL_MAX);
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(200, Math.floor(maxRaw)))
      : DEFAULT_ALERTCAL_MAX;
    const prioritized = prioritizeSources(unique, maxCount, [ALERTCAL_CENTER]);
    console.log(
      `[CCTV] Loaded ALERTCalifornia sources: ${unique.length} (using ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] ALERTCalifornia load failed:', error?.message || error);
    return [];
  }
}

const DEFAULT_HPWREN_SITES =
  'https://www.hpwren.ucsd.edu/cameras/sites.js';
const DEFAULT_HPWREN_MAX = 40;
const HPWREN_CENTER = Object.freeze({ lat: 33.0, lon: -116.8 });

/**
 * Parse HPWREN sites.js (`var sites = { ... };`) into a plain object.
 * @param {string} text
 */
export function parseHpwrenSitesJs(text) {
  const m = String(text || '').match(/var\s+sites\s*=\s*(\{[\s\S]*\})\s*;?\s*$/m)
    || String(text || '').match(/sites\s*=\s*(\{[\s\S]*\})/);
  if (!m) return null;
  try {
    // sites.js is JSON-like object literal; wrap as JSON by quoting keys if needed.
    // Actual file uses double-quoted keys already.
    return JSON.parse(m[1]);
  } catch {
    try {
      // eslint-disable-next-line no-new-func
      return Function(`"use strict"; return (${m[1]});`)();
    } catch {
      return null;
    }
  }
}

/**
 * HPWREN research cameras (CC BY-NC-ND 4.0). Non-commercial. Prefer RTS 640px.
 */
export async function loadHpwrenSourcesFromOpenData() {
  const endpoint = process.env.CCTV_HPWREN_API_URL || DEFAULT_HPWREN_SITES;
  try {
    const resp = await fetch(endpoint, {
      headers: {
        Accept: 'application/javascript,text/plain,*/*',
        'User-Agent':
          'earth-eye-cctv/1.0 (private hosted instance; +https://eartheye.us)',
      },
      signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn('[CCTV] HPWREN sites download failed:', resp.status);
      return [];
    }
    const text = await resp.text();
    const sites = parseHpwrenSitesJs(text);
    if (!sites || typeof sites !== 'object') {
      console.warn('[CCTV] HPWREN sites.js parse failed');
      return [];
    }
    const cameras = [];
    for (const [siteKey, site] of Object.entries(sites)) {
      const lat = Number(site?.lat);
      const lon = Number(site?.long ?? site?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const elev = Number(site?.elev);
      const cams = site?.cams && typeof site.cams === 'object' ? site.cams : {};
      for (const [camKey, cam] of Object.entries(cams)) {
        const id = String(camKey || '').trim();
        if (!id) continue;
        const thumb = `https://cdn.hpwren.ucsd.edu/RTS/${encodeURIComponent(id)}-640.jpg`;
        cameras.push({
          id: `hpwren:${id}`,
          name: String(cam?.name || site?.name || id).trim(),
          city: String(site?.name || siteKey).trim(),
          cityId: 'hpwren',
          provider: 'HPWREN (UC San Diego)',
          lat,
          lon,
          headingDeg: 0,
          headingConfidence: 'low',
          pitchDeg: -10,
          fovDeg: 50,
          rangeM: 500,
          mountHeightM: 12,
          groundElevationM: Number.isFinite(elev) ? elev : 800,
          feedType: 'image',
          url: thumb,
          snapshotUrl: thumb,
          sourceKind: 'hpwren',
          license: 'CC BY-NC-ND 4.0 — non-commercial',
          attribution:
            'HPWREN — High Performance Wireless Research & Education Network, UC San Diego (hpwren.ucsd.edu)',
          nonCommercial: true,
        });
      }
    }
    const unique = Array.from(new Map(cameras.map((c) => [c.id, c])).values());
    const maxRaw = Number(process.env.CCTV_HPWREN_MAX_SOURCES || DEFAULT_HPWREN_MAX);
    const maxCount = Number.isFinite(maxRaw)
      ? Math.max(8, Math.min(200, Math.floor(maxRaw)))
      : DEFAULT_HPWREN_MAX;
    const prioritized = prioritizeSources(unique, maxCount, [HPWREN_CENTER]);
    console.log(
      `[CCTV] Loaded HPWREN sources: ${unique.length} (using ${prioritized.length})`,
    );
    return prioritized;
  } catch (error) {
    console.warn('[CCTV] HPWREN load failed:', error?.message || error);
    return [];
  }
}
