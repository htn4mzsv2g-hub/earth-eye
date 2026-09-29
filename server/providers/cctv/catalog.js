import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CCTV_SOURCE_FILE, CCTV_SOURCE_CACHE_MS } from './constants.js';
import { allocateSourceCap, resolveCatalogCap } from './cap.js';
import { loadGroundHeights, joinGroundHeights } from './groundHeights.js';
import { normalizeSourceItem } from './normalize.js';
import { packAllowed, packStatusLabel } from './permissions.js';
import {
  loadAustinSourcesFromOpenData,
  loadCaltransSourcesFromOpenData,
  loadTflSourcesFromOpenData,
  loadOntarioSourcesFromOpenData,
  loadFintrafficSourcesFromOpenData,
  loadDriveBcSourcesFromOpenData,
  loadTxdotSourcesFromOpenData,
  loadTallinnSourcesFromCatalog,
  loadTarkteeSourcesFromDatex,
  loadWarendorfSourcesFromCatalog,
  loadNswSourcesFromOpenData,
  loadCalgarySourcesFromOpenData,
  loadDelDOTSourcesFromOpenData,
  loadSeattleSourcesFromOpenData,
  loadIowaSourcesFromOpenData,
  loadIcelandSourcesFromOpenData,
  loadHongKongSourcesFromOpenData,
  loadQuebecSourcesFromOpenData,
  loadLakeCountySourcesFromOpenData,
  loadSingaporeSourcesFromOpenData,
  loadAlertCaliforniaSourcesFromOpenData,
  loadHpwrenSourcesFromOpenData,
} from './sources.js';

/** Health state for a pack that is not being polled, from its status label. */
function idlePackState(label, approvedState) {
  if (label === 'KEY REQUIRED') return 'key required';
  if (label === 'APPROVED') return approvedState;
  if (label === 'PENDING REVIEW') return 'pending review';
  if (label === 'OFF (COMMERCIAL-SAFE)') return 'off (commercial-safe)';
  return 'held';
}

/**
 * Live open-data packs, in merge order. Adding a region is one entry here
 * plus its loader in sources.js; the catalog cap is shared across entries
 * round-robin (cap.js), so a new pack never silently evicts an older one.
 * Each pack fails independently (allSettled) and is gated by its own env
 * kill switch.
 */
const LIVE_PACKS = [
  {
    name: 'austin',
    enabled: () => packAllowed('austin'),
    load: loadAustinSourcesFromOpenData,
  },
  {
    name: 'seattle',
    enabled: () => packAllowed('seattle'),
    load: loadSeattleSourcesFromOpenData,
  },
  {
    name: 'iowa',
    enabled: () => packAllowed('iowa'),
    load: loadIowaSourcesFromOpenData,
  },
  {
    name: 'iceland',
    enabled: () => packAllowed('iceland'),
    load: loadIcelandSourcesFromOpenData,
  },
  {
    name: 'hongkong',
    enabled: () => packAllowed('hongkong'),
    load: loadHongKongSourcesFromOpenData,
  },
  {
    name: 'quebec',
    enabled: () => packAllowed('quebec'),
    load: loadQuebecSourcesFromOpenData,
  },
  {
    name: 'lakecounty',
    enabled: () => packAllowed('lakecounty'),
    load: loadLakeCountySourcesFromOpenData,
  },
  {
    name: 'singapore',
    enabled: () => packAllowed('singapore'),
    load: loadSingaporeSourcesFromOpenData,
  },
  {
    name: 'alertcalifornia',
    enabled: () => packAllowed('alertcalifornia'),
    load: loadAlertCaliforniaSourcesFromOpenData,
  },
  {
    name: 'hpwren',
    enabled: () => packAllowed('hpwren'),
    load: loadHpwrenSourcesFromOpenData,
  },
  {
    name: 'caltrans',
    enabled: () => packAllowed('caltrans'),
    load: loadCaltransSourcesFromOpenData,
  },
  {
    name: 'tfl',
    enabled: () => packAllowed('tfl'),
    load: loadTflSourcesFromOpenData,
  },
  {
    name: 'ontario',
    enabled: () => packAllowed('ontario'),
    load: loadOntarioSourcesFromOpenData,
  },
  {
    name: 'fintraffic',
    enabled: () => packAllowed('fintraffic'),
    load: loadFintrafficSourcesFromOpenData,
  },
  {
    name: 'drivebc',
    enabled: () => packAllowed('drivebc'),
    load: loadDriveBcSourcesFromOpenData,
  },
  {
    name: 'txdot',
    enabled: () => packAllowed('txdot'),
    load: loadTxdotSourcesFromOpenData,
  },
  {
    name: 'tallinn',
    enabled: () => packAllowed('tallinn'),
    load: loadTallinnSourcesFromCatalog,
  },
  {
    name: 'tarktee',
    enabled: () => packAllowed('tarktee'),
    load: loadTarkteeSourcesFromDatex,
  },
  {
    name: 'warendorf',
    enabled: () => packAllowed('warendorf'),
    load: loadWarendorfSourcesFromCatalog,
  },
  {
    name: 'nsw',
    enabled: () => packAllowed('nsw'),
    load: loadNswSourcesFromOpenData,
  },
  {
    name: 'calgary',
    enabled: () => packAllowed('calgary'),
    load: loadCalgarySourcesFromOpenData,
  },
  {
    name: 'deldot',
    enabled: () => packAllowed('deldot'),
    load: loadDelDOTSourcesFromOpenData,
  },
];
/**
 * Load CCTV sources from a local JSON file (CCTV_SOURCES_FILE env or default).
 *
 * @returns {Array<object>} Array of raw source objects, or [] on error.
 */
function loadSourcesFromFile(sourceRoot) {
  const sourceFile = process.env.CCTV_SOURCES_FILE || DEFAULT_CCTV_SOURCE_FILE;
  const resolved = path.isAbsolute(sourceFile)
    ? sourceFile
    : path.resolve(sourceRoot, sourceFile);
  try {
    if (!fs.existsSync(resolved)) return [];
    const raw = fs.readFileSync(resolved, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(
      '[CCTV] failed to read source file:',
      resolved,
      error?.message || error,
    );
    return [];
  }
}

/**
 * Load CCTV sources from the CCTV_SOURCES_JSON env variable (inline JSON).
 *
 * @returns {Array<object>} Array of raw source objects, or [] if unset/invalid.
 */
function loadSourcesFromEnv() {
  const raw = process.env.CCTV_SOURCES_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Create an independent catalog rooted in the consuming application. */
export function createCctvCatalog({ sourceRoot = process.cwd() } = {}) {
  /** @type {Array<object>} Cached merged + normalized CCTV source list. */
  let _cctvSourceCache = [];
  /** @type {number} Epoch-ms when the source cache was last refreshed. */
  let _cctvSourceCacheAt = 0;
  /** @type {Promise<Array<object>>|null} In-flight refresh, shared by concurrent
   * callers so a post-TTL burst launches ONE refetch, not one per request. */
  let _cctvSourceInflight = null;
  /** Per-pack source health (Earth Eye §2): state, last attempt/success. */
  const _packHealth = new Map();
  const recordPackHealth = (name, patch) => {
    const prev = _packHealth.get(name) || {
      pack: name,
      lastAttemptAt: null,
      lastSuccessAt: null,
      count: 0,
      error: null,
    };
    _packHealth.set(name, { ...prev, ...patch });
  };

  /**
   * Assemble and cache the merged CCTV source list.
   *
   * Merges every source pack (live open-data packs, local file, env
   * variable), deduplicates by ID, shares the catalog cap fairly across
   * packs, and caches for CCTV_SOURCE_CACHE_MS.
   *
   * @returns {Promise<Array<object>>} Deduplicated, capped source list.
   */
  async function getCctvSources() {
    const now = Date.now();
    if (
      _cctvSourceCache.length &&
      now - _cctvSourceCacheAt <= CCTV_SOURCE_CACHE_MS
    ) {
      return _cctvSourceCache;
    }
    // Single-flight: a burst of requests arriving past the TTL shares ONE refresh
    // instead of each launching the full multi-provider refetch. The `.finally`
    // clears the ref so the next post-TTL cycle starts fresh.
    if (_cctvSourceInflight) return _cctvSourceInflight;
    _cctvSourceInflight = refreshCctvSources().finally(() => {
      _cctvSourceInflight = null;
    });
    return _cctvSourceInflight;
  }

  /**
   * Assemble and cache the merged CCTV source list from file/env + live packs.
   * Always resolves (loaders self-catch to []); on a fully-empty refresh with a
   * good prior catalog it serves stale rather than blanking the CCTV layer.
   *
   * @returns {Promise<Array<object>>} Deduplicated, capped source list.
   */
  async function refreshCctvSources() {
    const fromFile = loadSourcesFromFile(sourceRoot);
    const fromEnv = loadSourcesFromEnv();

    const forceAustin =
      String(process.env.CCTV_FORCE_AUSTIN || '').trim() === '1';
    const preferAustin =
      String(process.env.CCTV_PREFER_AUSTIN || '1').trim() !== '0';
    // Live open-data packs load unless a file/env pack is configured and live
    // packs aren't forced — the same gate that governed the Austin-only fetch
    // now governs every entry in LIVE_PACKS.
    const needsLiveSources =
      forceAustin || (fromFile.length + fromEnv.length === 0 && preferAustin);
    const liveResults = needsLiveSources
      ? await Promise.allSettled(
          // Invoked inside the promise so a loader that throws synchronously
          // (a file-based pack on a malformed row) is isolated like any other
          // failed pack instead of rejecting the whole refresh.
          LIVE_PACKS.map((pack) =>
            Promise.resolve().then(() =>
              pack.enabled() ? pack.load({ sourceRoot }) : [],
            ),
          ),
        )
      : [];
    // Live packs first so file/env overrides win on duplicate IDs; each pack
    // keeps its own priority order and the catalog cap is shared fairly.
    const normalizePack = (name, items) => ({
      name,
      sources: items
        .filter((item) => item && typeof item === 'object')
        .map((item) => normalizeSourceItem(item))
        .filter((item) => item.id),
    });
    const attemptedAt = Date.now();
    LIVE_PACKS.forEach((pack, index) => {
      const label = packStatusLabel(pack.name);
      if (!needsLiveSources || label !== 'APPROVED') {
        const offState = idlePackState(label, 'not polled');
        recordPackHealth(pack.name, { state: offState, status: label });
        return;
      }
      const result = liveResults[index];
      const count =
        result?.status === 'fulfilled' && Array.isArray(result.value)
          ? result.value.length
          : 0;
      if (count > 0) {
        recordPackHealth(pack.name, {
          state: 'online',
          status: label,
          lastAttemptAt: attemptedAt,
          lastSuccessAt: Date.now(),
          count,
          error: null,
        });
      } else {
        // A pack that returns nothing is a dead provider, not "no cameras".
        recordPackHealth(pack.name, {
          state: 'offline',
          status: label,
          lastAttemptAt: attemptedAt,
          count: 0,
          error:
            result?.status === 'rejected'
              ? String(result.reason?.message || result.reason || 'failed')
              : 'Provider returned no cameras (download failed or empty; see server log)',
        });
      }
    });
    const packs = [
      ...LIVE_PACKS.map((pack, index) =>
        normalizePack(
          pack.name,
          liveResults[index]?.status === 'fulfilled'
            ? liveResults[index].value
            : [],
        ),
      ),
      normalizePack('file', fromFile),
      normalizePack('env', fromEnv),
    ];
    const maxCount = resolveCatalogCap(process.env.CCTV_MAX_SOURCES);
    const allocation = allocateSourceCap(packs, maxCount);
    // Shipped ground heights (src/data/local_data/cctv_ground_heights/, produced by
    // scripts/precompute-cctv-heights.mjs) ride along on the served source so
    // the client can place a camera and its monitor plane with zero sampling.
    const capped = joinGroundHeights(
      allocation.sources,
      loadGroundHeights(sourceRoot),
    );
    const trimmed = allocation.packs.filter((pack) => pack.kept < pack.offered);
    if (trimmed.length) {
      const detail = trimmed
        .map((pack) => `${pack.name} ${pack.kept}/${pack.offered}`)
        .join(', ');
      console.warn(
        `[CCTV] source catalog exceeds cap ${maxCount}; shared round-robin across packs (${detail}). Raise CCTV_MAX_SOURCES or lower a per-pack cap to change the mix.`,
      );
    }
    if (capped.length > 0 || _cctvSourceCache.length === 0) {
      _cctvSourceCache = capped;
    } else {
      // Every source came back empty (all live packs timed out / upstream outage)
      // but a good catalog is already cached — serve it stale rather than blanking
      // every CCTV route. Advancing the timestamp waits one TTL before retrying,
      // which (with single-flight) bounds load on a persistently-down upstream.
      console.warn(
        `[CCTV] source refresh returned empty; serving ${_cctvSourceCache.length} stale cameras`,
      );
      for (const [name, h] of _packHealth)
        if (h.state === 'offline' && h.lastSuccessAt)
          recordPackHealth(name, { state: 'stale' });
    }
    _cctvSourceCacheAt = Date.now();
    return _cctvSourceCache;
  }

  /** Frozen per-pack health snapshot (no catalog fetch). */
  getCctvSources.health = () =>
    LIVE_PACKS.map((pack) =>
      Object.freeze(
        _packHealth.get(pack.name) || {
          pack: pack.name,
          state: idlePackState(packStatusLabel(pack.name), 'not yet attempted'),
          status: packStatusLabel(pack.name),
          lastAttemptAt: null,
          lastSuccessAt: null,
          count: 0,
          error: null,
        },
      ),
    );
  return getCctvSources;
}
