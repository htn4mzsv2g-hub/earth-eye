/**
 * EE-EVENTS-0/1 — Normalized World Event contract (Pure JS).
 *
 * World Events extend existing layers; they do not invent a universal incident
 * truth. News headlines are NEWS REPORT discovery, never sensor facts.
 * City/region geography stays imprecise — never invent precise points from
 * city-level sources. Related refs are structure only (no false causation).
 *
 * No DOM, no Cesium, no network.
 */

/** Earth Eye event kinds (FINAL ENGINEERING / Live World). */
export const EVENT_KINDS = Object.freeze([
  'OFFICIAL ALERT',
  'OFFICIAL REPORT',
  'HUMANITARIAN REPORT',
  'NEWS REPORT',
  'PUBLIC DATA OBSERVATION',
  'EARTH EYE ANALYSIS',
]);

/**
 * Geometry precision vocabulary.
 * - point: source-provided precise coordinates (epicenter, detection cell)
 * - polygon / multipolygon: source-provided extent
 * - bbox: source-provided bounding box
 * - region: named area / zone / city without precise geometry (IMPRECISE)
 * - unknown: no usable location
 *
 * Never upgrade region → point. Never invent lon/lat from a city name.
 */
export const GEOMETRY_PRECISIONS = Object.freeze([
  'point',
  'polygon',
  'multipolygon',
  'bbox',
  'region',
  'unknown',
]);

/** Revision / retraction lifecycle. */
export const REVISION_STATES = Object.freeze([
  'active',
  'updated',
  'corrected',
  'retracted',
  'expired',
  'unknown',
]);

/** Registry / adapter health vocabulary (honest empty states). */
export const EVENT_HEALTH = Object.freeze([
  'READY',
  'EMPTY',
  'DEGRADED',
  'NO DATA',
  'NOT WIRED',
  'OFFLINE',
  'ERROR',
  'NEEDS KEY',
  'RATE LIMITED',
  'PERMISSION HELD',
  'TERMS UNCLEAR',
  'NEEDS REVIEW',
]);

const KIND_SET = new Set(EVENT_KINDS);
const PRECISION_SET = new Set(GEOMETRY_PRECISIONS);
const REVISION_SET = new Set(REVISION_STATES);

function textOrNull(value, max = 2000) {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoOrNull(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  const s = String(value).trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeDeep));
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = freezeDeep(v);
  return Object.freeze(out);
}

/**
 * True when precision is allowed to carry lon/lat point coordinates.
 * Region/unknown must never carry invented precise points.
 */
export function precisionAllowsPoint(precision) {
  return precision === 'point';
}

/**
 * True when a city/areaDesc-only location must stay region (imprecise).
 */
export function isImpreciseGeography(precision) {
  return precision === 'region' || precision === 'unknown';
}

/**
 * Validate a World Event object. Returns { ok, errors, event }.
 * Does not invent missing severity, coordinates, or confidence.
 *
 * @param {object} raw
 */
export function validateWorldEvent(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['event must be an object'], event: null };
  }

  const eventId = textOrNull(raw.eventId, 320);
  if (!eventId) errors.push('eventId required (provider-qualified)');
  else if (!eventId.includes(':'))
    errors.push('eventId must be provider-qualified (provider:id)');

  const kind = textOrNull(raw.kind, 64);
  if (!KIND_SET.has(kind))
    errors.push(`kind must be one of: ${EVENT_KINDS.join(' | ')}`);

  const sources = Array.isArray(raw.sources)
    ? raw.sources.map((s) => textOrNull(s, 120)).filter(Boolean)
    : [];
  if (!sources.length) errors.push('sources[] required');

  // Severity is source-specific and nullable — never invent.
  let severity = null;
  if (raw.severity != null && raw.severity !== '') {
    if (typeof raw.severity === 'object') {
      severity = freezeDeep({
        scale: textOrNull(raw.severity.scale, 80),
        value: raw.severity.value == null ? null : raw.severity.value,
        label: textOrNull(raw.severity.label, 120),
      });
    } else {
      severity = {
        scale: null,
        value: null,
        label: textOrNull(raw.severity, 120),
      };
    }
  }

  const precision = textOrNull(raw.precision, 32) || 'unknown';
  if (!PRECISION_SET.has(precision))
    errors.push(`precision must be one of: ${GEOMETRY_PRECISIONS.join(' | ')}`);

  const geometry = normalizeGeometry(raw.geometry, precision, errors);

  // Precision honesty: region/unknown must not carry precise points.
  if (isImpreciseGeography(precision) && geometry?.type === 'Point') {
    errors.push(
      'precision region/unknown must not carry Point geometry (no invented precise points from city-level sources)',
    );
  }
  if (
    precision === 'point' &&
    geometry &&
    geometry.type !== 'Point' &&
    geometry.type !== null
  ) {
    errors.push('precision point requires Point geometry or null');
  }

  const eventTime = {
    start: isoOrNull(raw.eventTime?.start ?? raw.eventTime),
    end: isoOrNull(raw.eventTime?.end),
    uncertainty: textOrNull(raw.eventTime?.uncertainty, 240),
  };

  const firstReported = isoOrNull(raw.firstReported);
  const lastUpdated = isoOrNull(raw.lastUpdated);
  const retrievedAt = isoOrNull(raw.retrievedAt);
  const expiry = isoOrNull(raw.expiry);

  const revisionState = textOrNull(raw.revisionState, 32) || 'unknown';
  if (!REVISION_SET.has(revisionState))
    errors.push(`revisionState must be one of: ${REVISION_STATES.join(' | ')}`);

  const supportingReportRefs = normalizeRefList(raw.supportingReportRefs);
  const contradictoryReportRefs = normalizeRefList(raw.contradictoryReportRefs);

  const related = normalizeRelated(raw.related);

  let coverage = null;
  if (raw.coverage != null && typeof raw.coverage === 'object') {
    coverage = freezeDeep({
      limits: textOrNull(raw.coverage.limits, 500),
      confidence:
        raw.coverage.confidence == null
          ? null
          : finiteOrNull(raw.coverage.confidence),
      quality: textOrNull(raw.coverage.quality, 240),
      note: textOrNull(raw.coverage.note, 500),
    });
    // Only keep confidence when source provided a finite value.
    if (
      coverage.confidence != null &&
      (coverage.confidence < 0 || coverage.confidence > 1)
    ) {
      errors.push('coverage.confidence must be in [0,1] when provided');
    }
  }

  const attribution = {
    credit: textOrNull(raw.attribution?.credit ?? raw.attribution, 240),
    license: textOrNull(raw.attribution?.license, 240),
    sourceLinks: Array.isArray(raw.attribution?.sourceLinks)
      ? raw.attribution.sourceLinks
          .map((u) => textOrNull(u, 500))
          .filter(Boolean)
      : raw.sourceUrl
        ? [textOrNull(raw.sourceUrl, 500)].filter(Boolean)
        : [],
  };

  const title = textOrNull(raw.title, 240);
  const summary = textOrNull(raw.summary, 2000);
  const category = textOrNull(raw.category, 120);
  const layerId = textOrNull(raw.layerId, 80);

  if (errors.length) return { ok: false, errors, event: null };

  const event = Object.freeze({
    eventId,
    kind,
    sources: Object.freeze([...sources]),
    category,
    title,
    summary,
    severity,
    geometry,
    precision,
    eventTime: Object.freeze(eventTime),
    firstReported,
    lastUpdated,
    retrievedAt,
    expiry,
    revisionState,
    supportingReportRefs,
    contradictoryReportRefs,
    related,
    coverage,
    attribution: Object.freeze(attribution),
    layerId,
    // Domain props from adapter — never treated as causation proof.
    props: Object.freeze({
      ...(raw.props && typeof raw.props === 'object' ? raw.props : {}),
    }),
  });

  return { ok: true, errors: [], event };
}

/**
 * Create a validated World Event or throw.
 * @param {object} raw
 */
export function createWorldEvent(raw) {
  const result = validateWorldEvent(raw);
  if (!result.ok) {
    throw new Error(`Invalid World Event: ${result.errors.join('; ')}`);
  }
  return result.event;
}

/**
 * Build a provider-qualified event id.
 * @param {string} provider
 * @param {string|number} id
 */
export function qualifyEventId(provider, id) {
  const p = textOrNull(provider, 80);
  const i = textOrNull(id, 240);
  if (!p || !i) throw new Error('qualifyEventId requires provider and id');
  if (i.includes(':') && i.startsWith(`${p}:`)) return i;
  return `${p}:${i}`;
}

function normalizeRefList(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(
    value
      .map((ref) => {
        if (typeof ref === 'string') {
          const id = textOrNull(ref, 320);
          return id ? Object.freeze({ eventId: id }) : null;
        }
        if (!ref || typeof ref !== 'object') return null;
        const eventId = textOrNull(ref.eventId || ref.id, 320);
        if (!eventId) return null;
        return Object.freeze({
          eventId,
          relation: textOrNull(ref.relation, 80),
          note: textOrNull(ref.note, 240),
        });
      })
      .filter(Boolean),
  );
}

/**
 * Related places/entities/cameras/weather/roads/hazards — structure only.
 * Never asserts causation.
 */
function normalizeRelated(raw) {
  const empty = () => Object.freeze([]);
  if (!raw || typeof raw !== 'object') {
    return Object.freeze({
      places: empty(),
      entities: empty(),
      cameras: empty(),
      weather: empty(),
      roads: empty(),
      hazards: empty(),
      note: 'Related refs are contextual only — not causal proof.',
    });
  }
  const list = (key) => {
    const arr = raw[key];
    if (!Array.isArray(arr)) return empty();
    return Object.freeze(
      arr
        .map((item) => {
          if (typeof item === 'string') {
            const id = textOrNull(item, 240);
            return id ? Object.freeze({ id, causal: false }) : null;
          }
          if (!item || typeof item !== 'object') return null;
          const id = textOrNull(item.id, 240);
          if (!id) return null;
          return Object.freeze({
            id,
            label: textOrNull(item.label, 160),
            // Never true — related refs are not causal proof.
            causal: false,
          });
        })
        .filter(Boolean),
    );
  };
  return Object.freeze({
    places: list('places'),
    entities: list('entities'),
    cameras: list('cameras'),
    weather: list('weather'),
    roads: list('roads'),
    hazards: list('hazards'),
    note:
      textOrNull(raw.note, 240) ||
      'Related refs are contextual only — not causal proof.',
  });
}

function normalizeGeometry(geometry, precision, errors) {
  if (geometry == null) {
    if (precision === 'point') {
      // Allowed: point precision with missing coords stays null (source gap).
      return null;
    }
    if (precision === 'region') {
      return Object.freeze({
        type: 'Region',
        name: null,
        coordinates: null,
      });
    }
    return null;
  }
  if (typeof geometry !== 'object' || Array.isArray(geometry)) {
    errors.push('geometry must be an object or null');
    return null;
  }

  // If precision is imprecise, Point coordinates are invented — reject.
  const hasCoords =
    geometry.type === 'Point' ||
    geometry.lon != null ||
    geometry.lat != null ||
    (Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length >= 2 &&
      geometry.type !== 'Polygon' &&
      geometry.type !== 'MultiPolygon' &&
      geometry.type !== 'BBox');
  if (
    isImpreciseGeography(precision) &&
    hasCoords &&
    geometry.type !== 'Region'
  ) {
    errors.push(
      'imprecise precision cannot carry Point coordinates (no invented precise points from city-level sources)',
    );
    return null;
  }

  // Named region (city / zone / areaDesc) — imprecise.
  if (
    geometry.type === 'Region' ||
    precision === 'region' ||
    geometry.name ||
    geometry.areaDesc
  ) {
    if (
      precisionAllowsPoint(precision) &&
      (geometry.lon != null || geometry.lat != null)
    ) {
      // Caller asked for point but supplied a named region — reject upgrade.
      errors.push('cannot treat named region as precise point');
    }
    return Object.freeze({
      type: 'Region',
      name: textOrNull(
        geometry.name || geometry.areaDesc || geometry.label,
        500,
      ),
      coordinates: null,
    });
  }

  if (
    geometry.type === 'Point' ||
    (geometry.lon != null && geometry.lat != null)
  ) {
    const lon = finiteOrNull(geometry.coordinates?.[0] ?? geometry.lon);
    const lat = finiteOrNull(geometry.coordinates?.[1] ?? geometry.lat);
    const alt = finiteOrNull(geometry.coordinates?.[2] ?? geometry.alt);
    if (
      lon == null ||
      lat == null ||
      Math.abs(lon) > 180 ||
      Math.abs(lat) > 90
    ) {
      errors.push('Point geometry requires finite lon/lat in range');
      return null;
    }
    if (isImpreciseGeography(precision)) {
      errors.push('imprecise precision cannot carry Point coordinates');
      return null;
    }
    return Object.freeze({
      type: 'Point',
      coordinates: Object.freeze(alt == null ? [lon, lat] : [lon, lat, alt]),
    });
  }

  if (geometry.type === 'BBox' || geometry.bbox) {
    const b = geometry.bbox || geometry.coordinates;
    if (
      !Array.isArray(b) ||
      b.length !== 4 ||
      !b.every((n) => Number.isFinite(n))
    ) {
      errors.push('bbox must be [west,south,east,north]');
      return null;
    }
    return Object.freeze({ type: 'BBox', bbox: Object.freeze([...b]) });
  }

  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    // Pass through validated rings only when present; adapters own ring checks.
    if (!geometry.coordinates) {
      errors.push(`${geometry.type} requires coordinates`);
      return null;
    }
    return Object.freeze({
      type: geometry.type,
      coordinates: geometry.coordinates,
    });
  }

  errors.push(`unsupported geometry type: ${geometry.type || typeof geometry}`);
  return null;
}

/**
 * Honest empty-result envelope when an adapter has no events.
 * @param {{adapterId:string, reason?:string, retrievedAt?:string}} o
 */
export function emptyEventResult(o = {}) {
  return Object.freeze({
    ok: true,
    health: 'EMPTY',
    adapterId: textOrNull(o.adapterId, 80) || 'unknown',
    reason:
      textOrNull(o.reason, 240) ||
      'No events in current scope. Empty is not "nothing happened."',
    events: Object.freeze([]),
    retrievedAt: isoOrNull(o.retrievedAt) || new Date().toISOString(),
  });
}

/**
 * Honest not-wired envelope for tier sources reserved for EE-EVENTS-1.
 * @param {{adapterId:string, source?:string}} o
 */
export function notWiredEventResult(o = {}) {
  return Object.freeze({
    ok: true,
    health: 'NOT WIRED',
    adapterId: textOrNull(o.adapterId, 80) || 'unknown',
    reason:
      textOrNull(o.reason, 240) ||
      `${textOrNull(o.source, 80) || 'Source'} adapter hook registered; live fetch not wired.`,
    events: Object.freeze([]),
    retrievedAt: new Date().toISOString(),
  });
}

/**
 * Honest failure / permission envelopes — never silent empty pretending LIVE.
 * @param {{adapterId?:string, health:string, reason?:string, retrievedAt?:string|number}} o
 */
export function sourceHealthResult(o = {}) {
  const health = textOrNull(o.health, 64) || 'ERROR';
  if (!EVENT_HEALTH.includes(health)) {
    throw new Error(`unknown event health: ${health}`);
  }
  return Object.freeze({
    ok: ['READY', 'EMPTY', 'DEGRADED', 'NO DATA', 'NOT WIRED', 'PERMISSION HELD', 'TERMS UNCLEAR', 'NEEDS REVIEW', 'NEEDS KEY'].includes(health),
    health,
    adapterId: textOrNull(o.adapterId, 80) || 'unknown',
    reason: textOrNull(o.reason, 500) || (health === 'READY' ? null : health),
    events: Object.freeze(Array.isArray(o.events) ? o.events : []),
    retrievedAt: isoOrNull(o.retrievedAt) || new Date().toISOString(),
    count: Array.isArray(o.events) ? o.events.length : 0,
    errors: Object.freeze(Array.isArray(o.errors) ? o.errors.map((e) => String(e)) : []),
  });
}

export function permissionHeldResult(o = {}) {
  return sourceHealthResult({
    ...o,
    health: 'PERMISSION HELD',
    reason:
      o.reason ||
      `${textOrNull(o.source, 80) || 'Source'}: fetch held pending permission / license review. Do not scrape.`,
  });
}

export function termsUnclearResult(o = {}) {
  return sourceHealthResult({
    ...o,
    health: 'TERMS UNCLEAR',
    reason:
      o.reason ||
      `${textOrNull(o.source, 80) || 'Source'}: terms unclear for commercial/private embedding — held.`,
  });
}

export function needsKeyResult(o = {}) {
  return sourceHealthResult({
    ...o,
    health: 'NEEDS KEY',
    reason:
      o.reason ||
      `${textOrNull(o.source, 80) || 'Source'}: API key required; upstream not contacted.`,
  });
}

export function rateLimitedResult(o = {}) {
  return sourceHealthResult({
    ...o,
    health: 'RATE LIMITED',
    reason:
      o.reason ||
      `${textOrNull(o.source, 80) || 'Source'}: upstream or local rate limit.`,
  });
}

export function offlineResult(o = {}) {
  return sourceHealthResult({
    ...o,
    health: 'OFFLINE',
    reason:
      o.reason ||
      `${textOrNull(o.source, 80) || 'Source'}: upstream unavailable.`,
  });
}
