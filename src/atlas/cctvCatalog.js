/**
 * CCTV browser model (pure, no DOM): media classes, provider facts, filters,
 * nearest-first sorting, pagination and a playable-status rule.
 *
 * Media class comes from the server's `media` descriptor, which is derived
 * from the provider's own URLs (m3u8 = LIVE VIDEO, mp4 = VIDEO CLIP, image =
 * STILL IMAGE ONLY), see server/providers/cctv/mediaKind.js. Nothing is
 * guessed from a provider's name.
 */

export const MEDIA_KINDS = Object.freeze(['live', 'clip', 'still']);

export const MEDIA_BADGE = Object.freeze({
  live: 'LIVE VIDEO',
  clip: 'VIDEO CLIP',
  still: 'STILL IMAGE ONLY',
  none: 'UNAVAILABLE',
});

const MIN = 60_000;

/**
 * Provider facts used by the viewer. `stillRefreshMs` is how often the viewer
 * re-requests a still: the provider's documented cadence where the code
 * records one (Fintraffic 600 s collectionInterval, TxDOT about once a
 * minute), otherwise a 60 s Earth Eye check. `cadenceKnown` says which.
 * `home` is the provider's public site (origins already used by the proxy).
 */
export const CCTV_PROVIDERS = Object.freeze({
  'Austin Transportation & Public Works': {
    short: 'Austin',
    home: 'https://data.austintexas.gov/',
  },
  Caltrans: { short: 'Caltrans', home: 'https://cwwp2.dot.ca.gov/' },
  'Transport for London': { short: 'TfL', home: 'https://api.tfl.gov.uk/' },
  'Ontario 511': { short: 'Ontario 511', home: 'https://511on.ca/' },
  Fintraffic: {
    short: 'Fintraffic',
    home: 'https://www.digitraffic.fi/',
    stillRefreshMs: 10 * MIN,
    cadenceKnown: true,
    cadence: 'New frame every 10 min (Digitraffic collectionInterval 600 s)',
  },
  DriveBC: { short: 'DriveBC', home: 'https://www.drivebc.ca/' },
  TxDOT: {
    short: 'TxDOT',
    home: 'https://its.txdot.gov/',
    stillRefreshMs: MIN,
    cadenceKnown: true,
    cadence: 'TxDOT publishes roughly once a minute',
  },
  'City of Tallinn': {
    short: 'Tallinn',
    home: 'https://ristmikud.tallinn.ee/',
  },
  'Transpordiamet (Tarktee)': {
    short: 'Tarktee',
    home: 'https://tarktee.transpordiamet.ee/',
  },
  'Stadt Warendorf': { short: 'Warendorf', home: null },
  'Live Traffic NSW': { short: 'NSW', home: 'https://www.livetraffic.com/' },
  'The City of Calgary': { short: 'Calgary', home: 'https://data.calgary.ca/' },
  DelDOT: { short: 'DelDOT', home: 'https://tmc.deldot.gov/' },
});

const DEFAULT_STILL_REFRESH_MS = MIN;

/** Provider facts with honest defaults. */
export function providerInfo(provider) {
  const p = CCTV_PROVIDERS[provider] || {};
  return {
    name: provider || 'Unknown provider',
    short: p.short || provider || 'Unknown',
    home: p.home || null,
    stillRefreshMs: p.stillRefreshMs || DEFAULT_STILL_REFRESH_MS,
    cadenceKnown: Boolean(p.cadenceKnown),
    cadence:
      p.cadence ||
      'Provider cadence not published; Earth Eye re-checks every 60 s',
  };
}

/**
 * The camera's primary media class.
 * @param {{media?:{kind?:string}, feedType?:string}} cam
 * @returns {'live'|'clip'|'still'|'none'}
 */
export function mediaKindOf(cam = {}) {
  const k = cam?.media?.kind;
  if (k === 'live' || k === 'clip' || k === 'still' || k === 'none') return k;
  // Older servers without `media`: the provider feed type is the only signal.
  const ft = String(cam?.feedType || '').toLowerCase();
  if (ft === 'hls') return 'live';
  if (ft === 'mp4' || ft === 'webm' || ft === 'video') return 'clip';
  return 'still';
}

/** Whether a still frame exists for the camera (TfL clips also have one). */
export function hasStill(cam = {}) {
  if (cam?.media && typeof cam.media.still === 'boolean')
    return cam.media.still;
  return mediaKindOf(cam) === 'still';
}

const norm = (v) =>
  String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Filter cameras.
 * @param {Array<object>} cams
 * @param {{kinds?: Iterable<string>, provider?: string, query?: string}} f
 *   `kinds` empty/absent = all media classes; `provider` '' = all.
 */
export function filterCameras(
  cams = [],
  { kinds, provider = '', query = '' } = {},
) {
  const kindSet = new Set(kinds || []);
  const q = norm(query).trim();
  const terms = q ? q.split(/\s+/) : [];
  return cams.filter((cam) => {
    if (kindSet.size && !kindSet.has(mediaKindOf(cam))) return false;
    if (provider && cam.provider !== provider) return false;
    if (terms.length) {
      const hay = norm(
        `${cam.name} ${cam.city} ${cam.provider} ${cam.code || ''} ${cam.id}`,
      );
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

/** Great-circle distance in km. */
export function distanceKm(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Legacy nearest-first sort (no nearby cutoff). Prefer `rankCameras` for
 * viewport-bounded relevance. Returns a new array; items get `_km` when a
 * centre was given.
 */
export function sortCameras(cams = [], center = null) {
  const ok =
    center && Number.isFinite(center.lat) && Number.isFinite(center.lon);
  if (ok) {
    return rankCameras(cams, { center, nearbyOnly: false });
  }
  return [...cams].sort(
    (a, b) =>
      String(a.provider).localeCompare(String(b.provider)) ||
      String(a.name).localeCompare(String(b.name)),
  );
}

/** One page of a list. */
export function paginate(list = [], page = 0, size = 40) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
  return {
    page: p,
    pages,
    total: list.length,
    items: list.slice(p * size, p * size + size),
  };
}

/** Counts by media class and by provider (for the report and filter chips). */
export function countCameras(cams = []) {
  const byKind = { live: 0, clip: 0, still: 0, none: 0 };
  const byProvider = {};
  for (const cam of cams) {
    const k = mediaKindOf(cam);
    byKind[k] = (byKind[k] || 0) + 1;
    const p = (byProvider[cam.provider] ||= {
      total: 0,
      live: 0,
      clip: 0,
      still: 0,
      none: 0,
    });
    p.total++;
    p[k]++;
  }
  return { total: cams.length, byKind, byProvider };
}

/**
 * Playable status from real signals only: the camera's own load result in
 * this session (`load`: 'ok' | 'error' | undefined) and the server health
 * entry (`health.status`: 'ok' | 'degraded').
 * @returns {'Playable'|'Image only'|'Unavailable'|'Not checked'}
 */
export function playableStatus(cam = {}, { health = null, load } = {}) {
  const kind = mediaKindOf(cam);
  if (load === 'error') return 'Unavailable';
  if (kind === 'none') return 'Unavailable';
  if (load === 'ok') return kind === 'still' ? 'Image only' : 'Playable';
  if (health?.status === 'degraded') return 'Unavailable';
  if (health?.status === 'ok')
    return kind === 'still' ? 'Image only' : 'Playable';
  return 'Not checked';
}

/** Previous/next index within a list (wraps). */
export function stepIndex(index, delta, length) {
  if (!length) return -1;
  return (((index + delta) % length) + length) % length;
}

/**
 * Freshness of a re-downloaded still frame (spec acceptance 7). Re-fetching
 * an old frame must not make it look current: when the provider's frame time
 * or the image content hash is unchanged, the frame keeps the time it was
 * first seen and is marked stale.
 *
 * @param {null|{hash:string, frameTime:number|null, firstSeenAt:number}} prev
 * @param {{hash:string, frameTime?:number|null, now:number}} next
 * @returns {{changed:boolean, stale:boolean, hash:string, frameTime:number|null,
 *   observedAt:number|null, firstSeenAt:number}}
 */
export function frameFreshness(prev, { hash, frameTime = null, now }) {
  const ft = Number.isFinite(frameTime) && frameTime > 0 ? frameTime : null;
  if (!prev) {
    return {
      changed: true,
      stale: false,
      hash,
      frameTime: ft,
      observedAt: ft,
      firstSeenAt: now,
    };
  }
  const sameHash = Boolean(hash) && hash === prev.hash;
  const sameTime =
    ft != null && prev.frameTime != null && ft === prev.frameTime;
  const changed = !(sameHash || sameTime);
  return {
    changed,
    stale: !changed,
    hash,
    frameTime: ft,
    observedAt: ft,
    firstSeenAt: changed ? now : prev.firstSeenAt,
  };
}

/**
 * Classify a media failure into the viewer's error states (spec §12):
 * 'offline' (no network / upstream down), 'expired' (lease or signed URL no
 * longer valid), 'unsupported' (browser cannot play the format) or
 * 'unavailable' (anything else).
 * @param {{status?:number, online?:boolean, mediaErrorCode?:number, hlsDetails?:string}} f
 */
export function mediaErrorState(f = {}) {
  if (f.online === false) return 'offline';
  if (f.status === 401 || f.status === 403 || f.status === 410)
    return 'expired';
  if (f.mediaErrorCode === 4) return 'unsupported'; // MEDIA_ERR_SRC_NOT_SUPPORTED
  if (/unsupported|notsupported|incompatible/i.test(f.hlsDetails || ''))
    return 'unsupported';
  if (
    f.status === 502 ||
    f.status === 503 ||
    f.status === 504 ||
    f.status === 0
  )
    return 'offline';
  return 'unavailable';
}

export const ERROR_LABEL = Object.freeze({
  offline: 'OFFLINE',
  expired: 'EXPIRED',
  unsupported: 'UNSUPPORTED',
  unavailable: 'UNAVAILABLE',
});

/** Empty-state copy when the view has no useful nearby public cameras. */
export const NO_PUBLIC_CAMERAS_IN_AREA =
  'NO PUBLIC CAMERAS FOUND IN THIS AREA';

/**
 * Honest media labels used by the catalog / viewer. REFRESHED STILL is the
 * cadence classification for still packs that re-fetch; list/viewer badges for
 * a still frame remain STILL IMAGE ONLY so a clip/still is never sold as live.
 */
export const MEDIA_LABELS = Object.freeze({
  live: 'LIVE VIDEO',
  clip: 'VIDEO CLIP',
  refreshedStill: 'REFRESHED STILL',
  still: 'STILL IMAGE ONLY',
  unavailable: 'UNAVAILABLE',
});

/** Lower = better when distances are comparable. */
export const MEDIA_QUALITY_RANK = Object.freeze({
  live: 0,
  clip: 1,
  still: 2,
  none: 3,
});

/** Distances within this many km are treated as comparable for quality tie-break. */
export const DISTANCE_TIE_KM = 2;

/** Floor / ceiling for the "useful nearby" radius (km). */
export const USEFUL_RADIUS_MIN_KM = 25;
export const USEFUL_RADIUS_MAX_KM = 200;
export const USEFUL_RADIUS_DEFAULT_KM = 80;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Whether a lat/lon sits inside a view rectangle. Handles a simple
 * antimeridian wrap when west > east.
 * @param {number} lat
 * @param {number} lon
 * @param {{west:number,south:number,east:number,north:number}|null} bounds
 */
export function pointInViewBounds(lat, lon, bounds) {
  if (!bounds) return false;
  const { west, south, east, north } = bounds;
  if (
    ![west, south, east, north, lat, lon].every((v) => Number.isFinite(v))
  )
    return false;
  if (lat < south || lat > north) return false;
  if (west <= east) return lon >= west && lon <= east;
  // Crosses the antimeridian: inside if lon is east of west OR west of east.
  return lon >= west || lon <= east;
}

/**
 * Approximate view-rectangle diagonal in km (antimeridian-safe longitude span).
 * @param {{west:number,south:number,east:number,north:number}|null} bounds
 */
export function viewDiagonalKm(bounds) {
  if (!bounds) return NaN;
  const { west, south, east, north } = bounds;
  if (![west, south, east, north].every((v) => Number.isFinite(v))) return NaN;
  let dLon = east - west;
  if (west > east) dLon = 360 - west + east;
  dLon = ((dLon % 360) + 360) % 360;
  if (dLon > 180) dLon = 360 - dLon;
  // Corner-to-corner on an unwrapped longitude span.
  return distanceKm(south, west, north, west + dLon);
}

/**
 * Useful-nearby radius for the current view. Prefer the view diagonal (padded),
 * else an altitude-derived ground footprint, else a metro default. Always
 * clamped so a globe-scale rectangle cannot open a worldwide camera wall.
 * @param {{bounds?: object|null, altitudeM?: number|null}} input
 */
export function usefulRadiusKm({ bounds = null, altitudeM = null } = {}) {
  const diag = viewDiagonalKm(bounds);
  if (Number.isFinite(diag) && diag > 0) {
    return clamp(diag * 1.25, USEFUL_RADIUS_MIN_KM, USEFUL_RADIUS_MAX_KM);
  }
  const alt = Number(altitudeM);
  if (Number.isFinite(alt) && alt > 0) {
    // ~half FOV ground radius at 35° half-angle ≈ tan(35°)*alt.
    const groundKm = (Math.tan((35 * Math.PI) / 180) * alt) / 1000;
    return clamp(
      Math.max(groundKm, USEFUL_RADIUS_MIN_KM),
      USEFUL_RADIUS_MIN_KM,
      USEFUL_RADIUS_MAX_KM,
    );
  }
  return USEFUL_RADIUS_DEFAULT_KM;
}

/**
 * Format a distance for list cards.
 * @param {number} km
 * @returns {string}
 */
export function formatCameraDistance(km) {
  if (!Number.isFinite(km)) return '';
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-US')} km`;
}

function mediaQuality(cam) {
  const k = mediaKindOf(cam);
  return MEDIA_QUALITY_RANK[k] ?? MEDIA_QUALITY_RANK.none;
}

function distancesComparable(aKm, bKm) {
  if (!Number.isFinite(aKm) || !Number.isFinite(bKm)) return false;
  return Math.abs(aKm - bKm) <= DISTANCE_TIE_KM;
}

/**
 * EE-LIVE-4 / Phase 6 camera relevance ranking.
 *
 * Default order:
 *   1. IN CURRENT VIEW
 *   2. NEAREST TO VIEW CENTER
 *   3. NEAREST TO SELECTED LOCATION
 *   4. quality / media type when distance comparable
 *
 * When `nearbyOnly` is true, cameras outside the useful radius (and not in
 * view) are dropped so Austin never surfaces a wall of ~1850 km distant cams.
 *
 * @param {Array<object>} cams
 * @param {{
 *   center?: {lat:number,lon:number}|null,
 *   bounds?: {west:number,south:number,east:number,north:number}|null,
 *   selected?: {lat:number,lon:number}|null,
 *   usefulKm?: number|null,
 *   altitudeM?: number|null,
 *   nearbyOnly?: boolean,
 * }} [opts]
 * @returns {Array<object>} New array; items carry `_km`, `_inView`, `_selectedKm`, `_useful`.
 */
export function rankCameras(
  cams = [],
  {
    center = null,
    bounds = null,
    selected = null,
    usefulKm = null,
    altitudeM = null,
    nearbyOnly = true,
  } = {},
) {
  const centerOk =
    center && Number.isFinite(center.lat) && Number.isFinite(center.lon);
  const selectedOk =
    selected &&
    Number.isFinite(selected.lat) &&
    Number.isFinite(selected.lon);
  const hasGeoAnchor = centerOk || selectedOk || Boolean(bounds);
  // Without a geographic anchor the nearby cutoff cannot be evaluated honestly;
  // keep the catalog visible rather than dropping every row.
  const applyNearby = nearbyOnly && hasGeoAnchor;
  const radius = Number.isFinite(usefulKm)
    ? clamp(usefulKm, USEFUL_RADIUS_MIN_KM, USEFUL_RADIUS_MAX_KM)
    : usefulRadiusKm({ bounds, altitudeM });

  const rows = [];
  for (const cam of cams) {
    const hasPos = Number.isFinite(cam.lat) && Number.isFinite(cam.lon);
    const inView = hasPos && pointInViewBounds(cam.lat, cam.lon, bounds);
    const km =
      centerOk && hasPos
        ? distanceKm(center.lat, center.lon, cam.lat, cam.lon)
        : Infinity;
    const selectedKm =
      selectedOk && hasPos
        ? distanceKm(selected.lat, selected.lon, cam.lat, cam.lon)
        : Infinity;
    const useful =
      inView ||
      (Number.isFinite(km) && km <= radius) ||
      (Number.isFinite(selectedKm) && selectedKm <= radius);
    if (applyNearby && !useful) continue;
    rows.push({
      cam,
      inView: Boolean(inView),
      km,
      selectedKm,
      quality: mediaQuality(cam),
      useful: Boolean(useful),
    });
  }

  rows.sort((a, b) => {
    // 1. In current view first.
    if (a.inView !== b.inView) return a.inView ? -1 : 1;
    // 2. Nearest to view center (strict when not comparable).
    if (!distancesComparable(a.km, b.km) && a.km !== b.km) return a.km - b.km;
    // 3. Nearest to selected location when center distance is comparable.
    if (selectedOk && a.selectedKm !== b.selectedKm) return a.selectedKm - b.selectedKm;
    // 4. Quality / media type when distance is comparable.
    if (a.quality !== b.quality) return a.quality - b.quality;
    if (a.km !== b.km) return a.km - b.km;
    return (
      String(a.cam.provider || '').localeCompare(String(b.cam.provider || '')) ||
      String(a.cam.name || '').localeCompare(String(b.cam.name || '')) ||
      String(a.cam.id || '').localeCompare(String(b.cam.id || ''))
    );
  });

  return rows.map(({ cam, inView, km, selectedKm, useful }) =>
    Object.assign({}, cam, {
      _km: km,
      _inView: inView,
      _selectedKm: selectedKm,
      _useful: useful,
    }),
  );
}
