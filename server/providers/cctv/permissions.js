/**
 * Per-pack CCTV permission records (PRODUCTION_SPEC §3, §13).
 *
 * Public access is not permission. A pack is served only when its record is
 * `review: 'approved'` (written licence or terms that allow app use), or when
 * the owner explicitly approves a pending pack with CCTV_<PACK>_ENABLED=1
 * after review. CCTV_<PACK>_ENABLED=0 is a kill switch for any pack.
 *
 * Permission values: 'yes' | 'no' | 'unknown' | 'n/a'. Evidence quotes or
 * points at what the provider actually publishes; nothing is assumed.
 * Pure module (reads process.env only in packAllowed).
 *
 * Review states:
 *   approved      written licence/terms allow app use (served)
 *   pending       not yet reviewed; owner may approve with CCTV_<PACK>_ENABLED=1
 *   held          deliberately held by the owner (Maryland CHART, DelDOT):
 *                 no env switch can serve it; only a reviewed code change
 *   key-required  the provider now needs a developer key Earth Eye does not
 *                 have (Ontario 511): never served, never shown as working
 *   not-implemented  reviewed candidate with no loader yet (fire cameras)
 * Every record carries reviewedAt (the date its permission was last checked)
 * and a licence. EE_COMMERCIAL_SAFE=1 also refuses any pack whose
 * commercialUse is not 'allowed'.
 */
import { commercialSafeMode } from '../policy-flags.js';

export const CCTV_PERMISSIONS_REVIEWED_AT = '2026-09-28';

const UNKNOWN = Object.freeze({
  display: 'unknown',
  embed: 'unknown',
  proxy: 'unknown',
  store: 'unknown',
  export: 'unknown',
  analyze: 'unknown',
});

const OPEN = (extra = {}) =>
  Object.freeze({
    display: 'yes',
    embed: 'yes',
    proxy: 'yes',
    store: 'unknown',
    export: 'unknown',
    analyze: 'unknown',
    ...extra,
  });

export const CCTV_PACK_PERMISSIONS = Object.freeze({
  austin: {
    provider: 'Austin Transportation & Public Works',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated; the city says video is not recorded or retained',
    evidence:
      'Listed on data.austintexas.gov (dataset b4k4-adkb, access level public), but the dataset page states no licence. Public access is not permission.',
    evidenceUrl: 'https://data.austintexas.gov/d/b4k4-adkb',
  },
  caltrans: {
    provider: 'Caltrans',
    review: 'approved',
    permissions: OPEN(),
    commercialUse: 'allowed',
    aiUse: 'not stated',
    retention: 'Caltrans does not retain or archive camera images',
    evidence:
      'CWWP2: files "are available for integration into your application … There is no charge for the use of this data." Fair use: no bulk streaming of 10+ streams without a written agreement.',
    evidenceUrl:
      'https://cwwp2.dot.ca.gov/closed-circuit-television-cameras.html',
  },
  tfl: {
    provider: 'Transport for London',
    review: 'approved',
    permissions: OPEN(),
    commercialUse: 'allowed',
    aiUse: 'not stated',
    retention: 'Not stated',
    evidence: 'TfL Open Data terms; attribution "Powered by TfL Open Data".',
    evidenceUrl:
      'https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service',
  },
  ontario: {
    provider: 'Ontario 511',
    review: 'key-required',
    keyRequired: true,
    permissions: OPEN(),
    commercialUse: 'allowed',
    aiUse: 'not stated',
    retention: 'Not stated',
    license: 'Open Government Licence – Ontario',
    evidence:
      'Open Government Licence – Ontario, but the 511on.ca camera API now answers HTTP 400 "Invalid Key" without a developer key. KEY REQUIRED: not loaded until a legitimate key is supplied and verified.',
    evidenceUrl: 'https://511on.ca/developers/doc',
  },
  fintraffic: {
    provider: 'Fintraffic',
    review: 'approved',
    permissions: OPEN({ store: 'yes', export: 'yes', analyze: 'yes' }),
    commercialUse: 'allowed',
    aiUse: 'not stated',
    retention: 'Not stated',
    evidence: 'Digitraffic data is licensed CC BY 4.0.',
    evidenceUrl: 'https://www.digitraffic.fi/en/terms-of-service/',
  },
  drivebc: {
    provider: 'DriveBC',
    review: 'approved',
    permissions: OPEN({ store: 'yes', export: 'yes', analyze: 'yes' }),
    commercialUse: 'allowed',
    aiUse: 'not stated',
    retention: 'Not stated',
    evidence: 'Open Government Licence – British Columbia.',
    evidenceUrl:
      'https://www2.gov.bc.ca/gov/content/data/policy-standards/open-data/open-government-licence-bc',
  },
  txdot: {
    provider: 'TxDOT',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated',
    evidence: 'No licence or terms captured for the ITS camera feed.',
    evidenceUrl: null,
  },
  tallinn: {
    provider: 'City of Tallinn',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated',
    evidence: 'No licence or terms captured for the camera feed.',
    evidenceUrl: null,
  },
  tarktee: {
    provider: 'Transpordiamet (Tarktee)',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated',
    evidence: 'No licence captured; the catalog currently times out.',
    evidenceUrl: null,
  },
  warendorf: {
    provider: 'Stadt Warendorf',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated',
    evidence: 'Municipal webcam; no licence captured.',
    evidenceUrl: null,
  },
  nsw: {
    provider: 'Live Traffic NSW',
    review: 'approved',
    permissions: OPEN({ store: 'yes', export: 'yes', analyze: 'yes' }),
    commercialUse: 'allowed',
    aiUse: 'not stated',
    retention: 'Not stated',
    evidence: 'Transport for NSW open data, CC BY 4.0.',
    evidenceUrl: 'https://opendata.transport.nsw.gov.au/',
  },
  calgary: {
    provider: 'The City of Calgary',
    review: 'approved',
    permissions: OPEN({ store: 'yes', export: 'yes', analyze: 'yes' }),
    commercialUse: 'allowed',
    aiUse: 'not stated',
    retention: 'Not stated',
    evidence: 'Open Government Licence – City of Calgary.',
    evidenceUrl:
      'https://data.calgary.ca/stories/s/Open-Calgary-Terms-of-Use/u45n-7awa',
  },
  deldot: {
    provider: 'DelDOT',
    review: 'held',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated',
    evidence:
      'Public live HLS with no written licence: the same posture as Maryland CHART, which is held pending embed permission.',
    evidenceUrl: null,
  },
  // Not loaded at all (no loader in catalog.js); listed so the permissions
  // endpoint states plainly that it is held.
  maryland: {
    provider: 'Maryland CHART (MDOT SHA)',
    review: 'held',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated',
    evidence:
      'Public live HLS, but no written permission to embed or proxy. Held disabled pending embed permission; no loader exists in this build.',
    evidenceUrl: 'https://chart.maryland.gov/',
  },
  // Wildfire camera networks: reviewed candidates, NON-COMMERCIAL terms.
  // No loader exists yet (Stage 3 adds them as a separate, labelled pack
  // with its own disable flag); listed so the licence boundary is recorded
  // and commercial-safe mode already excludes them.
  alertcalifornia: {
    provider: 'ALERTCalifornia (UC San Diego)',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'non-commercial',
    aiUse: 'unknown',
    retention: 'Transient stills only — do not archive beyond transient use',
    license: 'CC BY-NC-ND 4.0 — non-commercial; full frame; credit ALERTCalifornia | UC San Diego',
    evidence:
      'Research APPROVED WITH CONDITIONS (CC BY-NC-ND 4.0). Non-commercial only; no derivatives (show full frame with info bar); credit exactly "ALERTCalifornia | UC San Diego". Enable with CCTV_ALERTCALIFORNIA_ENABLED=1 when not in commercial-safe mode.',
    evidenceUrl: 'https://alertcalifornia.org/crediting-and-branding/',
  },
  hpwren: {
    provider: 'HPWREN (UC San Diego)',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'non-commercial',
    aiUse: 'unknown',
    retention: 'Transient stills only — prefer RTS 640px thumbnails; ≤1 fetch/min/camera',
    license: 'CC BY-NC-ND 4.0 — non-commercial; attribution to HPWREN (hpwren.ucsd.edu)',
    evidence:
      'Research APPROVED WITH CONDITIONS. Non-commercial; credit HPWREN; use RTS thumbnails. Overlaps some ALERTCalifornia cams — dedupe by location when both enabled. CCTV_HPWREN_ENABLED=1 when not commercial-safe.',
    evidenceUrl: 'https://www.hpwren.ucsd.edu/news/20210318/',
  },
  lakecounty: {
    provider: 'Lake County PASSAGE / Illinois DOT Gateway',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Transient stills only',
    license: 'CC BY-SA 2.0 (Illinois Gateway dataset) — pending embed confirmation',
    evidence:
      'Research APPROVED WITH CONDITIONS: only Lake County-hosted SnapShot rows (lakecountypassage.com). travelmidwest.com rows excluded (robots Disallow + 403). CCTV_LAKECOUNTY_ENABLED=1 after review.',
    evidenceUrl: 'https://gis-idot.opendata.arcgis.com/',
  },
  singapore: {
    provider: 'Land Transport Authority (data.gov.sg)',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'allowed',
    aiUse: 'unknown',
    retention: 'Re-read API each refresh — image URLs are time-scoped',
    license: 'Singapore Open Data Licence v1.0',
    evidence:
      'Research APPROVED. Singapore Open Data Licence v1.0 permits commercial use with attribution notice. CCTV_SINGAPORE_ENABLED=1 after review (small feed today).',
    evidenceUrl: 'https://data.gov.sg/open-data-licence',
  },
  seattle: {
    provider: 'Seattle Department of Transportation (SDOT)',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated',
    license: 'Not captured (City of Seattle open data / Travelers API)',
    evidence:
      'Public Travelers Map API returns camera metadata + still image filenames. Public access is not permission — pending written licence review. Owner may enable with CCTV_SEATTLE_ENABLED=1 after review.',
    evidenceUrl: 'https://web.seattle.gov/Travelers/',
  },
  quebec: {
    provider: 'Ministère des Transports et de la Mobilité durable du Québec (Québec 511)',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Transient clips only — do not archive frames beyond transient use',
    license: 'CC BY 4.0 (Données Québec) — pending written embed confirmation',
    evidence:
      'Research APPROVED (batch 1): CC BY 4.0 on Données Québec; WFS catalog + MP4 clips (5 s loops). Label VIDEO CLIP never LIVE. Fetch on demand (Cloudflare). Owner enables with CCTV_QUEBEC_ENABLED=1 after review.',
    evidenceUrl: 'https://www.donneesquebec.ca/recherche/dataset/camera-de-circulation',
  },
  hongkong: {
    provider: 'Hong Kong Transport Department',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated',
    license: 'DATA.GOV.HK open data terms (pending written embed review)',
    evidence:
      'Public Traffic Camera Locations XML + stills on tdcctv.data.one.gov.hk. Public access is not permission. Owner may enable with CCTV_HONGKONG_ENABLED=1 after review.',
    evidenceUrl: 'https://data.gov.hk/en-data/dataset/hk-td-tis_2-traffic-snapshot-images',
  },
  iceland: {
    provider: 'Vegagerðin (Icelandic Road and Coastal Administration)',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated',
    license: 'Not fully captured (umferdin.is / Vegagerðin public cameras) — pending review',
    evidence:
      'Public JSON camera list + JPEG stills. Public access is not permission. Owner may enable with CCTV_ICELAND_ENABLED=1 after review.',
    evidenceUrl: 'https://umferdin.is/en/cameras',
  },
  iowa: {
    provider: 'Iowa Department of Transportation',
    review: 'pending',
    permissions: UNKNOWN,
    commercialUse: 'unknown',
    aiUse: 'unknown',
    retention: 'Not stated',
    license: 'CC BY 4.0 + Iowa DOT GIS Data Terms of Use (pending written embed review)',
    evidence:
      'Public ArcGIS FeatureServer (Traffic_Cameras_View) + 511 stills/HLS. CC BY 4.0 on open data portal; additional GIS terms apply. Public access is not permission — pending written licence review. Owner may enable with CCTV_IOWA_ENABLED=1 after review.',
    evidenceUrl: 'https://data.iowadot.gov/datasets/IowaDOT::traffic-cameras-3/about',
  },
});

/** Licence names for packs whose record does not spell one out. */
const PACK_LICENSES = Object.freeze({
  austin: 'Not stated (dataset page has no licence)',
  caltrans: 'Caltrans CWWP2 terms (free integration; fair use)',
  tfl: 'TfL Open Data terms ("Powered by TfL Open Data")',
  fintraffic: 'CC BY 4.0 (Digitraffic)',
  drivebc: 'Open Government Licence – British Columbia',
  txdot: 'Not captured',
  tallinn: 'Not captured',
  tarktee: 'Not captured',
  warendorf: 'Not captured',
  nsw: 'CC BY 4.0 (Transport for NSW)',
  calgary: 'Open Government Licence – City of Calgary',
  seattle: 'Not stated (pending review)',
  quebec: 'CC BY 4.0 (pending embed confirmation)',
  hongkong: 'DATA.GOV.HK terms (pending review)',
  iceland: 'Not stated (pending review)',
  iowa: 'CC BY 4.0 + Iowa DOT GIS Terms (pending review)',
  lakecounty: 'CC BY-SA 2.0 (pending embed confirmation)',
  singapore: 'Singapore Open Data Licence v1.0 (pending gate)',
  alertcalifornia: 'CC BY-NC-ND 4.0 (non-commercial)',
  hpwren: 'CC BY-NC-ND 4.0 (non-commercial)',
  deldot: 'Not captured (no written licence)',
  maryland: 'Not captured (embed/redistribution unresolved)',
});

/** Plain status label for a pack (never 'approved' for a broken/keyed pack). */
export function packStatusLabel(pack, env = process.env) {
  const rec = CCTV_PACK_PERMISSIONS[pack];
  if (!rec) return 'unknown';
  if (rec.review === 'key-required') return 'KEY REQUIRED';
  if (rec.review === 'held') return 'HELD';
  if (rec.review === 'not-implemented') return 'NOT IMPLEMENTED';
  if (commercialSafeMode(env) && rec.commercialUse !== 'allowed')
    return 'OFF (COMMERCIAL-SAFE)';
  if (packAllowed(pack, env)) return 'APPROVED';
  return 'PENDING REVIEW';
}

/**
 * Whether a pack may be served.
 * @param {string} pack
 * @param {Record<string,string|undefined>} [env]
 */
export function packAllowed(pack, env = process.env) {
  const raw = String(env[`CCTV_${pack.toUpperCase()}_ENABLED`] ?? '').trim();
  if (raw === '0') return false; // kill switch
  const rec = CCTV_PACK_PERMISSIONS[pack];
  if (!rec) return false; // unknown packs stay off
  // Held, key-required and unimplemented packs cannot be switched on by env.
  if (['held', 'key-required', 'not-implemented'].includes(rec.review))
    return false;
  if (commercialSafeMode(env) && rec.commercialUse !== 'allowed') return false;
  if (rec.review === 'approved') return true;
  return raw === '1'; // owner approval after review
}

/** Public, JSON-safe permission summary (for /api/cctv/permissions). */
export function publicPackPermissions(env = process.env) {
  return Object.entries(CCTV_PACK_PERMISSIONS).map(([pack, r]) => ({
    pack,
    provider: r.provider,
    review: r.review,
    status: packStatusLabel(pack, env),
    keyRequired: r.keyRequired === true,
    reviewedAt: r.reviewedAt || CCTV_PERMISSIONS_REVIEWED_AT,
    license: r.license || PACK_LICENSES[pack] || 'Not captured',
    commercialSafe: commercialSafeMode(env),
    enabled: packAllowed(pack, env),
    permissions: r.permissions,
    commercialUse: r.commercialUse,
    aiUse: r.aiUse,
    retention: r.retention,
    evidence: r.evidence,
    evidenceUrl: r.evidenceUrl,
  }));
}
