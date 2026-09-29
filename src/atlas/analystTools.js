/**
 * Earth Eye Analyst: deterministic source-query tools and map actions
 * (PRODUCTION_SPEC §11, §12). No model, no network AI, no paid service.
 *
 * Two kinds of tool, kept apart on purpose:
 *   - query  (read-only): resolve_place, query_entities, locate_cameras,
 *            source_health, incident_workspace, permitted_history, inspect_entity, satellite_pass, ai_status.
 *            They never move the map or change a layer.
 *   - action (map):       fly_to, select_entity, set_layer, stop_follow,
 *            control_cockpit, annotate, clear_annotations, control_scene.
 *            They only run when the user asks (typed command or button).
 *
 * Every tool validates its arguments against a small schema, clamps result
 * counts, runs under a timeout, and returns citations for every item (provider,
 * source link, classification, retrieval time). A tool that cannot answer says
 * so; nothing is invented. AI summaries are off in this build.
 *
 * Pure module: every side effect comes in through `deps`.
 *
 * EE-LIVE-5: Analyst shares the same selected identity, camera viewer, and
 * ranked camera sets as the globe. Query data never auto-enables display;
 * command results use SUCCESS / PARTIAL / FAILED / UNAVAILABLE from execution.
 */
import { findAirport } from './airports.js';
import { findLayer, parseCoordinates } from './commandParser.js';
import {
  mediaKindOf,
  providerInfo,
  MEDIA_KINDS,
  rankCameras,
} from './cctvCatalog.js';
import {
  COMMAND_STATUS,
  commandStatusFromResult,
  earthEyeIdentity,
} from './analystIdentity.js';
import {
  DATA_SOURCES,
  isSourceAllowed,
  sourceFor,
} from './dataSourceRegistry.js';
import { buildIncidentWorkspace } from '../data/incidentWorkspace.js';
import { INCIDENT_EVENT_LAYERS } from '../data/incidentWorkspace.js';
import { buildEventDetail } from '../events/live/detail.js';
import {
  relatedAnchorFromEvent,
  relatedCamerasForEvent,
} from '../events/live/related.js';
import {
  WORLD_EVENTS_LAYER_ID,
  worldEventIdentity,
} from '../events/live/selectionBridge.js';

/** AI summaries are off: no model is configured or allowed in this stage. */
export const AI_SUMMARIES_ENABLED = false;

export { COMMAND_STATUS, earthEyeIdentity } from './analystIdentity.js';

export const MAX_RESULTS = 25;
export const DEFAULT_RESULTS = 10;
export const TOOL_TIMEOUT_MS = 8_000;

/** Layers the entity query engine (analyst_query) can read. */
export const QUERY_LAYERS = Object.freeze([
  'flights',
  'military',
  'ais-live-vessels',
  'local-firms',
  'earthquakes',
  'satellites',
  'local-datacenters',
  'local-dams',
  'fire-perimeters',
  'weather-cyclones',
]);

const NOMINATIM = Object.freeze({
  provider: 'OpenStreetMap Nominatim',
  url: 'https://nominatim.openstreetmap.org/',
  license: '© OpenStreetMap contributors, ODbL',
});

const num = (min, max, extra = {}) => ({ type: 'number', min, max, ...extra });
const str = (maxLength, extra = {}) => ({
  type: 'string',
  maxLength,
  ...extra,
});
const LIMIT = num(1, MAX_RESULTS, { integer: true });

/** Tool schemas: `required` fields must be present, unknown fields are refused. */
export const TOOL_SCHEMAS = Object.freeze({
  resolve_place: {
    kind: 'query',
    props: {
      query: str(120, { minLength: 1 }),
      limit: num(1, 5, { integer: true }),
    },
    required: ['query'],
  },
  query_entities: {
    kind: 'query',
    props: {
      layerId: str(64, { enum: QUERY_LAYERS }),
      lat: num(-90, 90),
      lon: num(-180, 180),
      radiusKm: num(1, 1000),
      limit: LIMIT,
    },
    required: ['layerId', 'lat', 'lon'],
  },
  locate_cameras: {
    kind: 'query',
    props: {
      lat: num(-90, 90),
      lon: num(-180, 180),
      radiusKm: num(1, 500),
      mediaKind: str(8, { enum: MEDIA_KINDS }),
      limit: LIMIT,
    },
    required: ['lat', 'lon'],
  },
  permitted_history: {
    kind: 'query',
    props: {
      feedId: str(64),
      limit: LIMIT,
    },
    required: [],
  },
  incident_workspace: {
    kind: 'query',
    props: {
      layerId: str(64, { enum: [...INCIDENT_EVENT_LAYERS] }),
      id: str(128, { minLength: 1 }),
      lat: num(-90, 90),
      lon: num(-180, 180),
      label: str(200),
      radiusKm: num(1, 250),
      limit: LIMIT,
      provider: str(120),
      classification: str(64),
      observedAt: str(64),
      sourceUrl: str(400),
    },
    required: ['layerId', 'id', 'lat', 'lon'],
  },
  source_health: {
    kind: 'query',
    props: { layerId: str(64), limit: num(1, 100, { integer: true }) },
    required: [],
  },
  fly_to: {
    kind: 'action',
    props: { lat: num(-90, 90), lon: num(-180, 180), label: str(120) },
    required: ['lat', 'lon'],
  },
  select_entity: {
    kind: 'action',
    // Camera open uses shared CAMERAS viewer — no globe/fly-to required.
    // Non-cctv paths still return UNAVAILABLE when renderer is down.
    graphicsRequired: false,
    props: {
      layerId: str(64, { minLength: 1 }),
      id: str(200, { minLength: 1 }),
    },
    required: ['layerId', 'id'],
  },
  set_layer: {
    kind: 'action',
    // Data enablement works without Cesium; globe markers soft-fail in non-3D.
    graphicsRequired: false,
    props: { layerId: str(64, { minLength: 1 }), on: { type: 'boolean' } },
    required: ['layerId', 'on'],
  },
  stop_follow: {
    kind: 'action',
    props: {},
    required: [],
  },
  control_cockpit: {
    kind: 'action',
    props: {
      action: str(16, { enum: ['enter', 'exit', 'toggle'] }),
    },
    required: ['action'],
  },
  annotate: {
    kind: 'action',
    props: {
      type: str(16, { enum: ['pin', 'label'] }),
      label: str(120),
      lat: num(-90, 90),
      lon: num(-180, 180),
      target: str(120),
    },
    required: ['type'],
  },
  clear_annotations: {
    kind: 'action',
    props: {},
    required: [],
  },
  inspect_entity: {
    kind: 'query',
    props: {
      layerId: str(64, { minLength: 1 }),
      id: str(200, { minLength: 1 }),
    },
    required: ['layerId', 'id'],
  },
  satellite_pass: {
    kind: 'query',
    props: {
      target: str(120),
      lat: num(-90, 90),
      lon: num(-180, 180),
      minElevationDeg: num(5, 60),
    },
    required: [],
  },
  control_scene: {
    kind: 'action',
    props: {
      action: str(16, { enum: ['list', 'play', 'stop'] }),
      sceneId: str(64),
    },
    required: ['action'],
  },
  selected_entity: {
    kind: 'query',
    props: {},
    required: [],
  },
  event_detail: {
    kind: 'query',
    props: {},
    required: [],
  },
  related_cameras: {
    kind: 'query',
    props: {
      radiusKm: num(1, 500),
      limit: LIMIT,
    },
    required: [],
  },
  open_event_detail: {
    kind: 'action',
    graphicsRequired: false,
    props: {},
    required: [],
  },
  show_layer: {
    kind: 'action',
    props: { layerId: str(64, { enum: [WORLD_EVENTS_LAYER_ID] }) },
    required: [],
  },
  ai_status: {
    kind: 'query',
    props: {},
    required: [],
  },
});

/**
 * Validate tool arguments against its schema.
 * @returns {{ok:true,args:object}|{ok:false,error:string}}
 */
export function validateArgs(tool, args) {
  const schema = TOOL_SCHEMAS[tool];
  if (!schema) return { ok: false, error: `Unknown tool "${tool}"` };
  if (!args || typeof args !== 'object' || Array.isArray(args))
    return { ok: false, error: 'Arguments must be an object' };
  for (const key of Object.keys(args)) {
    if (!(key in schema.props))
      return { ok: false, error: `Unknown argument "${key}"` };
  }
  for (const key of schema.required) {
    if (args[key] === undefined || args[key] === null || args[key] === '')
      return { ok: false, error: `Missing "${key}"` };
  }
  const out = {};
  for (const [key, rule] of Object.entries(schema.props)) {
    const v = args[key];
    if (v === undefined) continue;
    if (rule.type === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v))
        return { ok: false, error: `"${key}" must be a number` };
      if (rule.integer && !Number.isInteger(v))
        return { ok: false, error: `"${key}" must be a whole number` };
      if (v < rule.min || v > rule.max)
        return {
          ok: false,
          error: `"${key}" must be ${rule.min} to ${rule.max}`,
        };
    } else if (rule.type === 'string') {
      if (typeof v !== 'string')
        return { ok: false, error: `"${key}" must be text` };
      const t = v.trim();
      if (rule.minLength && t.length < rule.minLength)
        return { ok: false, error: `"${key}" is empty` };
      if (t.length > rule.maxLength)
        return { ok: false, error: `"${key}" is too long` };
      if (rule.enum && !rule.enum.includes(t))
        return {
          ok: false,
          error: `"${key}" must be one of: ${rule.enum.join(', ')}`,
        };
      out[key] = t;
      continue;
    } else if (rule.type === 'boolean' && typeof v !== 'boolean') {
      return { ok: false, error: `"${key}" must be true or false` };
    }
    out[key] = v;
  }
  return { ok: true, args: out };
}

/** Race a promise against the tool timeout. */
export function withTimeout(promise, ms = TOOL_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timed out after ${ms} ms`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function layerCitation(layerId, status) {
  const e = sourceFor(layerId);
  return {
    provider: e.provider,
    url: status?.sourceUrl ?? DATA_SOURCES[layerId]?.sourceUrl ?? null,
    classification: status?.status || e.classification,
    retrievedAt: status?.retrievedAt ?? null,
    observedAt: status?.observedAt ?? null,
    note: e.limitation,
  };
}

/**
 * Build the tool set.
 * @param {object} deps
 * @param {(q:string, o:{signal:AbortSignal})=>Promise<object>} deps.geocode  fetches /api/geocode JSON
 * @param {(name:string, args:object)=>Promise<object>} deps.runAction  the app's action runner
 * @param {()=>Promise<object[]>} deps.getCameras  camera catalog (real /api/cctv/sources rows)
 * @param {{getSourceStatus:Function}} deps.sources  read-only registry status
 * @param {(id:string)=>boolean} [deps.isLayerOn]
 * @param {(id:string)=> (void|{ok?:boolean,status?:string,error?:string,pending?:boolean,known?:boolean})} [deps.openCamera]
 *   Opens the existing CAMERAS-tab viewer (same path — never a parallel viewer).
 * @param {() => (object|null)} [deps.getSelectedIdentity] Shared globe selection as Earth Eye identity.
 * @param {() => ({lat:number,lon:number}|null)} [deps.getSelectedLocation]
 * @param {() => (object|null)} [deps.getViewBounds]
 * @param {() => (number|null)} [deps.getCameraAltitudeM]
 * @param {() => (object|null)} [deps.getSelectedWorldEvent]
 * @param {() => (object|null)} [deps.getViewCenter]
 * @param {(eventId:string)=>object|Promise<object>} [deps.openWorldEventDetail]
 * @param {() => object|Promise<object>} [deps.showWorldEventLayer]
 * @param {number} [deps.timeoutMs]
 */
export function createAnalystTools(deps) {
  const timeoutMs = deps.timeoutMs ?? TOOL_TIMEOUT_MS;
  const impl = {
    async resolve_place({ query, limit = 3 }) {
      const coords = parseCoordinates(query);
      if (coords) {
        return {
          items: [
            {
              label: `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`,
              lat: coords.lat,
              lon: coords.lon,
              kind: 'coordinates',
            },
          ],
          citations: [
            {
              provider: 'Typed coordinates',
              url: null,
              classification: 'INPUT',
            },
          ],
        };
      }
      const code = /^[A-Za-z]{3}$/.test(query) ? findAirport(query) : null;
      if (code) {
        return {
          items: [
            {
              label: `${code.name} (${query.toUpperCase()})`,
              lat: code.lat,
              lon: code.lon,
              kind: 'airport',
            },
          ],
          citations: [
            {
              provider: 'Bundled airport gazetteer (IATA codes)',
              url: null,
              classification: 'SNAPSHOT',
            },
          ],
        };
      }
      const ctl = new AbortController();
      try {
        const j = await withTimeout(
          deps.geocode(query, { signal: ctl.signal }),
          timeoutMs,
        );
        const rows = Array.isArray(j?.results) ? j.results : [];
        const items = rows
          .map((r) => ({
            label: r.formatted_address || query,
            lat: Number(r.geometry?.location?.lat),
            lon: Number(r.geometry?.location?.lng),
            kind: (r.types || [])[0] || 'place',
          }))
          .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
          .slice(0, limit);
        return {
          items,
          citations: [
            {
              ...NOMINATIM,
              classification: 'LIVE LOOKUP',
              retrievedAt: Date.now(),
            },
          ],
          note: items.length ? '' : `No place found for "${query}".`,
        };
      } finally {
        ctl.abort();
      }
    },

    async query_entities({
      layerId,
      lat,
      lon,
      radiusKm = 100,
      limit = DEFAULT_RESULTS,
    }) {
      const status = deps.sources.getSourceStatus(layerId);
      const citations = [layerCitation(layerId, status)];
      // EE-LIVE-5: QUERY DATA does not require display ON and never flips layers.
      // SHOW ON MAP / set_layer remains a separate explicit action.
      const displayOn = deps.isLayerOn
        ? Boolean(deps.isLayerOn(layerId))
        : true;
      const r = await withTimeout(
        deps.runAction('analyst_query', {
          layers: [layerId],
          scope: { kind: 'radius', center: { lat, lon }, km: radiusKm },
          sortBy: 'distanceKm',
          sortDir: 'asc',
          limit,
        }),
        timeoutMs,
      );
      if (!r?.ok) throw new Error(r?.error || 'query failed');
      const items = (r.items || []).slice(0, limit).map((x) => {
        const providerId = String(x.icao24 || x.mmsi || x.noradId || x.id);
        const identity = earthEyeIdentity({
          layerId,
          id: `${layerId}:${providerId}`,
          providerId,
          label: x.label || x.callsign || x.name || x.place || providerId,
          provider: status?.provider || sourceFor(layerId).provider,
          lat: x.lat,
          lon: x.lon,
        });
        return {
          layerId,
          id: providerId,
          label: String(x.label || x.callsign || x.name || x.place || x.id),
          distanceKm: Number.isFinite(x.distanceKm) ? x.distanceKm : null,
          detail: [
            x.magnitude != null ? `M${x.magnitude}` : '',
            x.altitudeM != null ? `${Math.round(x.altitudeM)} m` : '',
            x.frp != null ? `FRP ${x.frp}` : '',
            x.shipType || x.aircraftClass || x.operator || '',
            !displayOn ? 'display off' : '',
          ]
            .filter(Boolean)
            .join(' · '),
          identity,
          type: layerId,
          source: identity?.source || sourceFor(layerId).provider,
        };
      });
      const notes = [
        r.coverage?.note,
        r.coverage?.warmup,
        !displayOn
          ? `${sourceFor(layerId).name} display is off — query used loaded records only and did not enable the layer. SHOW ON MAP / set_layer is a separate action.`
          : '',
        !displayOn && !items.length
          ? 'No loaded records while display is off. Empty result is not proof that nothing is happening.'
          : '',
      ].filter(Boolean);
      return {
        items,
        citations,
        note: notes.join(' '),
        total: r.total ?? r.count ?? items.length,
        displayOn,
        layerDisplayOff: !displayOn,
      };
    },

    async locate_cameras({
      lat,
      lon,
      radiusKm = 50,
      mediaKind,
      limit = DEFAULT_RESULTS,
    }) {
      const cams = await withTimeout(deps.getCameras(), timeoutMs);
      // Same ranking contract as CAMERAS tab (EE-LIVE-4 rankCameras).
      const filtered = [];
      for (const c of cams || []) {
        const cl = Number(c.lat ?? c.latitude);
        const co = Number(c.lon ?? c.lng ?? c.longitude);
        if (!Number.isFinite(cl) || !Number.isFinite(co)) continue;
        const row = { ...c, lat: cl, lon: co };
        const kind = mediaKindOf(row);
        if (mediaKind && kind !== mediaKind) continue;
        filtered.push(row);
      }
      const ranked = rankCameras(filtered, {
        center: { lat, lon },
        bounds: deps.getViewBounds?.() || null,
        selected: deps.getSelectedLocation?.() || null,
        usefulKm: radiusKm,
        altitudeM: deps.getCameraAltitudeM?.() ?? null,
        nearbyOnly: true,
      });
      const shown = ranked.slice(0, limit);
      const providers = new Map();
      for (const c of shown) {
        const info = providerInfo(c.provider);
        if (!providers.has(info.name))
          providers.set(info.name, {
            provider: info.name,
            url: info.home || null,
            classification: 'CAMERA CATALOG',
            note: info.cadence,
          });
      }
      return {
        items: shown.map((c) => {
          const kind = mediaKindOf(c);
          const identity = earthEyeIdentity({
            layerId: 'cctv',
            id: String(c.id),
            providerId: String(c.id),
            label: c.name || c.id,
            provider: providerInfo(c.provider).name,
            lat: c.lat,
            lon: c.lon,
          });
          return {
            layerId: 'cctv',
            id: String(c.id),
            label: String(c.name || c.id),
            distanceKm: Number.isFinite(c._km)
              ? Math.round(c._km * 10) / 10
              : null,
            detail: `${providerInfo(c.provider).name} · ${
              kind === 'live'
                ? 'LIVE VIDEO'
                : kind === 'clip'
                  ? 'VIDEO CLIP'
                  : kind === 'still'
                    ? 'STILL IMAGE'
                    : 'NO MEDIA'
            }${c._inView ? ' · IN VIEW' : ''}`,
            lat: c.lat,
            lon: c.lon,
            identity,
            type: 'cctv',
            source: identity?.source,
          };
        }),
        total: ranked.length,
        citations: [...providers.values()],
        note: ranked.length ? '' : 'NO PUBLIC CAMERAS FOUND IN THIS AREA',
      };
    },

    async event_detail() {
      const event = deps.getSelectedWorldEvent?.();
      if (!event?.eventId) {
        return {
          ok: false,
          status: COMMAND_STATUS.UNAVAILABLE,
          error: 'UNAVAILABLE — no World Event is selected.',
          items: [],
          citations: [],
        };
      }
      const detail = buildEventDetail(event);
      if (!detail)
        throw new Error('Selected World Event has no valid detail record.');
      const identity = worldEventIdentity(event);
      const links = detail.attribution.sourceLinks || [];
      const sourceNames = detail.sources.length
        ? detail.sources
        : [detail.attribution.credit];
      return {
        items: [
          {
            layerId: WORLD_EVENTS_LAYER_ID,
            id: detail.eventId,
            label: detail.name,
            detail: [detail.kindLabel || detail.kind, detail.attribution.credit]
              .filter(Boolean)
              .join(' · '),
            identity,
            event,
            detail,
            lat: detail.geometry.anchor?.lat ?? null,
            lon: detail.geometry.anchor?.lon ?? null,
          },
        ],
        citations: sourceNames.map((provider, i) => ({
          provider,
          url: links[i] || links[0] || null,
          classification: 'WORLD EVENT',
        })),
        note: detail.relatedNote,
      };
    },

    async related_cameras({ radiusKm = 50, limit = DEFAULT_RESULTS } = {}) {
      const event = deps.getSelectedWorldEvent?.();
      if (!event?.eventId) {
        return {
          ok: false,
          status: COMMAND_STATUS.UNAVAILABLE,
          error: 'UNAVAILABLE — no World Event is selected.',
          items: [],
          citations: [],
        };
      }
      if (!relatedAnchorFromEvent(event)) {
        return {
          ok: false,
          status: COMMAND_STATUS.UNAVAILABLE,
          error:
            'UNAVAILABLE — selected World Event has no plottable coordinates.',
          items: [],
          citations: [],
        };
      }
      const cameras = await withTimeout(deps.getCameras(), timeoutMs);
      const block = relatedCamerasForEvent(event, cameras || [], {
        radiusKm,
        limit,
        bounds: deps.getViewBounds?.() || null,
        viewCenter: deps.getViewCenter?.() || null,
      });
      const items = block.items.map((camera) => ({
        ...camera,
        layerId: 'cctv',
        type: 'cctv',
        identity: earthEyeIdentity({
          layerId: 'cctv',
          id: camera.id,
          providerId: camera.id,
          label: camera.label,
          provider: camera.provider || 'camera catalog',
          lat: camera.lat,
          lon: camera.lon,
        }),
        detail: [
          camera.provider,
          Number.isFinite(camera.distanceKm) ? `${camera.distanceKm} km` : null,
          camera.inView ? 'IN VIEW' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }));
      return {
        items,
        total: items.length,
        citations: [
          ...new Map(
            items.map((x) => [
              x.provider,
              {
                provider: x.provider || 'camera catalog',
                url: null,
                classification: 'CAMERA CATALOG',
              },
            ]),
          ).values(),
        ],
        note:
          block.reason ||
          'RELATED cameras ranked by selected World Event place; RELATED ≠ causal.',
      };
    },

    async open_event_detail() {
      const event = deps.getSelectedWorldEvent?.();
      if (!event?.eventId)
        return {
          ok: false,
          status: COMMAND_STATUS.UNAVAILABLE,
          error: 'UNAVAILABLE — no World Event is selected.',
          items: [],
          citations: [],
        };
      if (typeof deps.openWorldEventDetail !== 'function')
        return {
          ok: false,
          status: COMMAND_STATUS.UNAVAILABLE,
          error: 'UNAVAILABLE — World Event detail surface is not mounted.',
          items: [],
          citations: [],
        };
      const result = await withTimeout(
        deps.openWorldEventDetail(event.eventId),
        timeoutMs,
      );
      if (!result || result.ok === false)
        return {
          ok: false,
          status: result?.status || 'FAILED',
          error: result?.error || 'Could not open World Event detail.',
          items: [],
          citations: [],
        };
      return {
        status: result.status || COMMAND_STATUS.SUCCESS,
        items: [
          {
            layerId: WORLD_EVENTS_LAYER_ID,
            id: event.eventId,
            label: event.title || event.eventId,
          },
        ],
        citations: [],
        note: 'Opened the shared World Events detail surface for the selected event.',
      };
    },

    async show_layer({ layerId = WORLD_EVENTS_LAYER_ID } = {}) {
      if (layerId !== WORLD_EVENTS_LAYER_ID)
        throw new Error(`Unsupported World Events layer "${layerId}"`);
      const event = deps.getSelectedWorldEvent?.();
      if (!event?.eventId)
        return {
          ok: false,
          status: COMMAND_STATUS.UNAVAILABLE,
          error: 'UNAVAILABLE — no World Event is selected.',
          items: [],
          citations: [],
        };
      if (typeof deps.showWorldEventLayer !== 'function')
        return {
          ok: false,
          status: COMMAND_STATUS.UNAVAILABLE,
          error: 'UNAVAILABLE — World Events map layer is not mounted.',
          items: [],
          citations: [],
        };
      const result = await withTimeout(deps.showWorldEventLayer(), timeoutMs);
      if (!result || result.ok === false)
        return {
          ok: false,
          status: result?.status || 'FAILED',
          error: result?.error || 'Could not show World Events layer.',
          items: [],
          citations: [],
        };
      return {
        status: result.status || COMMAND_STATUS.SUCCESS,
        items: [{ layerId, id: layerId, label: 'World Events layer' }],
        citations: [],
        note: 'World Events layer shown in the shared globe state.',
      };
    },

    async permitted_history({ feedId = null, limit = 100 } = {}) {
      const q = new URLSearchParams();
      if (limit) q.set('limit', String(limit));
      const path = feedId
        ? `/api/atlas/permitted-history/${encodeURIComponent(feedId)}?${q}`
        : `/api/atlas/permitted-history?${q}`;
      try {
        const r = await fetch(path, { credentials: 'same-origin' });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          return {
            ok: false,
            error: body.error || `HTTP ${r.status}`,
            verdict: body.verdict || null,
            records: [],
            url: path,
          };
        }
        return { ok: true, ...body, url: path };
      } catch (error) {
        return {
          ok: false,
          error: String(error?.message || error),
          records: [],
          url: path,
        };
      }
    },
    async incident_workspace({
      layerId,
      id,
      lat,
      lon,
      label,
      radiusKm = 50,
      limit = DEFAULT_RESULTS,
      provider,
      classification,
      observedAt,
      sourceUrl,
    }) {
      const cameras = (await deps.getCameras?.()) || [];
      // Flights are optional: callers may supply getFlightsNearby; otherwise omit.
      let flights = [];
      if (typeof deps.getFlightsNearby === 'function') {
        try {
          flights =
            (await deps.getFlightsNearby({ lat, lon, radiusKm, limit })) || [];
        } catch {
          flights = [];
        }
      }
      const brief = buildIncidentWorkspace({
        subject: {
          id,
          layerId,
          label: label || null,
          latitude: lat,
          longitude: lon,
          provider: provider || null,
          classification: classification || null,
          observedAt: observedAt || null,
          sourceUrl: sourceUrl || null,
        },
        cameras,
        flights,
        radiusKm,
        limit,
      });
      if (!brief.ok) return { ok: false, error: brief.error, code: brief.code };
      return {
        ok: true,
        workspace: brief,
        citations: brief.citations,
      };
    },

    async source_health({ layerId, limit = 100 }) {
      const ids = layerId ? [layerId] : Object.keys(DATA_SOURCES);
      if (layerId && !DATA_SOURCES[layerId])
        throw new Error(`No registry entry for "${layerId}"`);
      const items = ids.slice(0, limit).map((id) => {
        const s = deps.sources.getSourceStatus(id);
        const entry = sourceFor(id);
        const layerOn = Boolean(s.enabled);
        const rendered = deps.graphicsFailed
          ? 'UNAVAILABLE (3D renderer down)'
          : layerOn
            ? 'ON'
            : 'OFF';
        const providerScope = entry.provider || s.provider || 'unknown';
        const collectionScope = s.disabled
          ? s.disabledReason || 'DISABLED'
          : s.status || 'unknown';
        const health = s.health ? ` · health ${s.healthLabel || s.health}` : '';
        const cls = s.recordClass ? ` · ${s.recordClass}` : '';
        // Honest split: provider readiness ≠ layer toggle ≠ rendered on globe.
        // e.g. USGS Events READY vs Sources/layer OFF is explained, not conflated.
        return {
          layerId: id,
          id,
          label: s.name || id,
          detail: `provider ${providerScope} · collection ${collectionScope} · layer ${layerOn ? 'ON' : 'OFF'} · rendered ${rendered}${health}${cls}${s.failed ? ` · error: ${s.error}` : ''}`,
          retrievedAt: s.retrievedAt,
          observedAt: s.observedAt,
          publishedAt: s.publishedAt ?? null,
          health: s.health || null,
          recordClass: s.recordClass || null,
          scopes: {
            provider: providerScope,
            collection: collectionScope,
            layer: layerOn ? 'ON' : 'OFF',
            rendered,
          },
        };
      });
      // Server collection coverage (wake-time only — not a 24/7 claim).
      let collection = null;
      try {
        if (typeof deps.fetchCollectionHealth === 'function')
          collection = await deps.fetchCollectionHealth();
        else if (typeof fetch === 'function') {
          const r = await fetch('/api/atlas/collection-health', {
            cache: 'no-store',
          });
          if (r.ok) collection = await r.json();
        }
      } catch {
        collection = null;
      }
      const citations = [
        {
          provider: 'Earth Eye data source registry (this browser)',
          url: null,
          classification: 'REGISTRY',
        },
      ];
      if (collection) {
        citations.push({
          provider: 'Earth Eye collection scheduler (server, wake-time only)',
          url: '/api/atlas/collection-health',
          classification: 'COLLECTION',
        });
        items.unshift({
          layerId: '_collection',
          id: '_collection',
          label: 'Server collection',
          detail: collection.continuousClaim
            ? 'continuous'
            : `${collection.note || 'wake-time only'} · feeds ${collection.feeds?.length || 0} · backlog ${(collection.backlog || []).length} · review queue ${(collection.reviewQueue || []).length}`,
          retrievedAt: null,
          observedAt: null,
          collection: {
            awake: collection.awake,
            continuousClaim: false,
            feeds: (collection.feeds || []).map((f) => ({
              id: f.feedId,
              lastSuccessAt: f.lastSuccessAt,
              lastAttemptAt: f.lastAttemptAt,
              lastError: f.lastError,
              expectedNextAt: f.expectedNextAt,
              records: f.records,
              backlog: f.backlog,
              deferred: f.deferred || false,
            })),
          },
        });
      }
      return { items, citations };
    },

    async fly_to({ lat, lon, label }) {
      const r = await withTimeout(
        deps.runAction('fly_to_location', {
          latitude: lat,
          longitude: lon,
          viewMode: 'overview',
        }),
        timeoutMs,
      );
      if (r && r.ok === false) throw new Error(r.error || 'fly failed');
      return {
        items: [
          { label: label || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon },
        ],
        citations: [],
      };
    },

    async select_entity({ layerId, id }) {
      if (layerId === 'cctv') {
        if (!deps.openCamera)
          return {
            ok: false,
            status: 'UNAVAILABLE',
            error: 'Camera viewer unavailable',
            items: [],
            citations: [],
          };
        // Same Earth Eye CAMERAS-tab viewer — never a parallel path.
        const opened = deps.openCamera(id);
        const result =
          opened && typeof opened === 'object'
            ? opened
            : { ok: true, status: 'SUCCESS', known: true };
        if (result.ok === false) {
          return {
            ok: false,
            status: result.status || 'FAILED',
            error: result.error || `Could not open camera ${id}`,
            items: [],
            citations: [],
          };
        }
        if (typeof deps.selectCamera === 'function') {
          try {
            deps.selectCamera({ id: String(id), label: String(id) });
          } catch {
            /* selection best-effort; viewer open is authoritative */
          }
        }
        const identity = earthEyeIdentity({
          layerId: 'cctv',
          id: String(id),
          providerId: String(id),
          label: id,
          provider: 'camera catalog',
        });
        // SUCCESS only after the shared viewer actually opened.
        const openedOk =
          result.ok !== false && result.status !== 'FAILED';
        return {
          status: !openedOk
            ? result.status || 'FAILED'
            : result.pending
              ? 'PARTIAL'
              : result.status ||
                (result.known === false ? 'PARTIAL' : 'SUCCESS'),
          ok: openedOk,
          items: openedOk
            ? [
                {
                  layerId,
                  id,
                  label: id,
                  identity,
                  type: 'cctv',
                  source: identity?.source,
                },
              ]
            : [],
          citations: [],
          note: !openedOk
            ? result.error || 'Camera viewer did not open.'
            : result.pending
              ? 'Camera catalog still loading — open requested on the shared viewer.'
              : result.known === false
                ? 'Opened shared viewer; camera id was not in the loaded catalog.'
                : 'Opened in the shared CAMERAS viewer (no globe / fly-to required).',
        };
      }
      if (deps.graphicsFailed) {
        return {
          ok: false,
          status: 'UNAVAILABLE',
          error:
            'UNAVAILABLE — selecting this entity on the globe needs the 3D renderer. Camera open still works without 3D.',
          items: [],
          citations: [],
          capabilityOff: true,
        };
      }
            if (layerId === 'weather-cyclones') {
        const mod = deps.dataManager?.layers?.get?.('weather-cyclones')?.module;
        if (!mod?.setParams) throw new Error('Cyclone layer unavailable');
        await deps.dataManager?.setEnabled?.('weather-cyclones', true, {
          origin: 'analyst',
        });
        const list = mod.getRowControls?.()?.list?.items || [];
        const q = String(id || '')
          .trim()
          .toLowerCase();
        const match =
          list.find(
            (item) =>
              String(item.id).toLowerCase() === q ||
              String(item.text || '')
                .toLowerCase()
                .includes(q),
          ) || null;
        if (!match) {
          throw new Error(
            `No active cyclone matches "${id}". Use the storm id (e.g. ep172026) or name from the advisory list.`,
          );
        }
        mod.setParams({ stormId: match.id, focus: true, openDetail: true });
        return {
          items: [
            {
              layerId,
              id: match.id,
              label: match.text || match.id,
            },
          ],
          citations: [layerCitation('weather-cyclones')],
          note: 'Selected by NHC/CPHC advisory id/name — not a fabricated track.',
        };
      }
      const r = await withTimeout(
        deps.runAction('track_entity', { query: id, layerId }),
        timeoutMs,
      );
      if (r && r.ok === false) throw new Error(r.error || 'entity not found');
      return { items: [{ layerId, id, label: id }], citations: [] };
    },

    async set_layer({ layerId, on }) {
      if (!DATA_SOURCES[layerId]) throw new Error(`Unknown layer "${layerId}"`);
      if (on && !isSourceAllowed(layerId))
        throw new Error(
          `${sourceFor(layerId).name} is disabled pending permission review`,
        );
      const r = await withTimeout(
        deps.runAction('set_layer_visibility', { layerId, enabled: on }),
        timeoutMs,
      );
      if (r && r.ok === false)
        throw new Error(r.error || 'layer change failed');
      const name = sourceFor(layerId).name;
      const note = deps.graphicsFailed
        ? on
          ? `${name} collection/layer enabled for list & details. Globe markers UNAVAILABLE (3D renderer down). Follow/Cockpit UNAVAILABLE.`
          : `${name} turned off.`
        : '';
      return {
        status: 'SUCCESS',
        items: [
          {
            layerId,
            id: layerId,
            label: `${name} ${on ? 'on' : 'off'}`,
            detail: deps.graphicsFailed
              ? 'renderer: UNAVAILABLE · layer enablement still applied'
              : undefined,
          },
        ],
        citations: [],
        note,
        scopes: {
          provider: sourceFor(layerId).provider || null,
          collection: 'n/a',
          layer: on ? 'ON' : 'OFF',
          rendered: deps.graphicsFailed ? 'UNAVAILABLE' : on ? 'ON' : 'OFF',
        },
      };
    },

    async stop_follow() {
      const r = await withTimeout(
        deps.runAction('stop_tracking', {}),
        timeoutMs,
      );
      if (r && r.ok === false) throw new Error(r.error || 'stop failed');
      return {
        items: [{ id: 'stop', label: 'Stopped following' }],
        citations: [],
      };
    },

    async control_cockpit({ action }) {
      const r = await withTimeout(
        deps.runAction('control_cockpit', { action }),
        timeoutMs,
      );
      if (r && r.ok === false) throw new Error(r.error || 'cockpit failed');
      return {
        items: [{ id: action, label: `Cockpit ${action}` }],
        citations: [],
      };
    },

    async annotate({ type, label, lat, lon, target }) {
      const spec = { type };
      if (label) spec.label = label;
      if (target) spec.target = target;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        spec.latitude = lat;
        spec.longitude = lon;
      }
      const r = await withTimeout(
        deps.runAction('annotate_map', {
          annotations: [spec],
          flyTo: true,
          persist: true,
        }),
        timeoutMs,
      );
      if (r && r.ok === false) throw new Error(r.error || 'annotate failed');
      return {
        items: [{ id: type, label: label || target || type }],
        citations: [],
      };
    },

    async clear_annotations() {
      const r = await withTimeout(
        deps.runAction('clear_annotations', {}),
        timeoutMs,
      );
      if (r && r.ok === false) throw new Error(r.error || 'clear failed');
      return {
        items: [{ id: 'cleared', label: 'Annotations cleared' }],
        citations: [],
      };
    },

    async inspect_entity({ layerId, id }) {
      // Prefer the shared context record (cyclone/fire taps publish here).
      let fromContext = null;
      try {
        const store = globalThis.window?.__gevContextStore;
        const key =
          layerId === 'weather-cyclones' &&
          !String(id).startsWith('weather-cyclones:')
            ? `weather-cyclones:${id}`
            : id;
        const rec =
          store?.entities?.get?.(key) ||
          store?.entities?.get?.(id) ||
          (store?.selectedEntityId &&
            store.entities.get(store.selectedEntityId));
        if (rec && (!layerId || rec.layerId === layerId || key === rec.id)) {
          fromContext = rec;
        }
      } catch {
        fromContext = null;
      }
      if (fromContext?.properties) {
        const p = fromContext.properties;
        const lines = [
          p.classificationName &&
            `Type: ${p.classificationName} (${p.classification || '?'})`,
          p.temporalStatus && `Status: ${p.temporalStatus}`,
          p.issuedAt && `Advisory issued: ${p.issuedAt}`,
          p.positionAt && `Position as of: ${p.positionAt}`,
          p.windKt != null && `Max sustained wind: ${p.windKt} kt`,
          p.pressureHpa != null && `Pressure: ${p.pressureHpa} hPa`,
          p.note,
          p.advisoryUrl && `Source: ${p.advisoryUrl}`,
        ].filter(Boolean);
        return {
          items: [
            {
              layerId: fromContext.layerId || layerId,
              id: fromContext.id || id,
              label: fromContext.label || p.name || id,
              detail: lines.join(' · '),
              properties: p,
              lat: fromContext.latitude,
              lon: fromContext.longitude,
            },
          ],
          citations: [
            layerCitation(
              fromContext.layerId || layerId,
              deps.sources?.getSourceStatus?.(fromContext.layerId || layerId),
            ),
          ],
          note: AI_SUMMARIES_ENABLED
            ? ''
            : 'AI summaries are off — structured facts only. Nearby evidence: enable cameras / wind / radar for co-located context; their legends stay separate.',
        };
      }
      const r = await withTimeout(
        deps.runAction('get_entity_context', { layerId, id, query: id }),
        timeoutMs,
      );
      if (r && r.ok === false) throw new Error(r.error || 'inspect failed');
      const item = r?.entity || r?.item || r || {};
      return {
        items: [
          {
            layerId,
            id,
            label: item.label || item.name || id,
            detail: item.detail || item.summary || null,
            ...item,
          },
        ],
        citations: [
          layerCitation(layerId, deps.sources?.getSourceStatus?.(layerId)),
        ],
        note: AI_SUMMARIES_ENABLED
          ? ''
          : 'AI summaries are off — structured facts only.',
      };
    },

    async satellite_pass({ target, lat, lon, minElevationDeg }) {
      const action = target ? 'next_satellite_pass' : 'next_iss_pass';
      const args = {};
      if (target) args.target = target;
      if (Number.isFinite(lat)) args.latitude = lat;
      if (Number.isFinite(lon)) args.longitude = lon;
      if (Number.isFinite(minElevationDeg))
        args.minElevationDeg = minElevationDeg;
      const r = await withTimeout(deps.runAction(action, args), timeoutMs);
      if (r && r.ok === false) throw new Error(r.error || 'pass lookup failed');
      if (r?.status === 'no-tle' || r?.status === 'none')
        return {
          items: [],
          citations: [layerCitation('satellites')],
          note:
            r.status === 'no-tle'
              ? 'No orbital elements loaded for that object (provider down or not in catalog). Positions are not fabricated.'
              : 'No upcoming pass found for the search window.',
        };
      const pass = r?.pass || r;
      return {
        items: [
          {
            id: target || 'ISS',
            label: target || 'ISS',
            detail: pass
              ? `rise ${pass.riseMs || pass.rise || 'n/a'} · max elev ${pass.maxElevDeg ?? 'n/a'}°`
              : null,
            pass,
          },
        ],
        citations: [layerCitation('satellites')],
        note: 'Propagated SGP4 prediction — not live telemetry.',
      };
    },

    async control_scene({ action, sceneId }) {
      const args = { action };
      if (sceneId) args.sceneId = sceneId;
      const r = await withTimeout(
        deps.runAction('control_scene', args),
        timeoutMs,
      );
      if (r && r.ok === false) throw new Error(r.error || 'scene failed');
      const scenes = Array.isArray(r?.scenes) ? r.scenes : [];
      return {
        items: scenes.length
          ? scenes.map((sc) => ({
              id: sc.id || sc,
              label: sc.label || sc.id || String(sc),
            }))
          : [
              {
                id: action,
                label: `Scene ${action}${sceneId ? `: ${sceneId}` : ''}`,
              },
            ],
        citations: [],
      };
    },

    async selected_entity() {
      const identity =
        typeof deps.getSelectedIdentity === 'function'
          ? deps.getSelectedIdentity()
          : null;
      if (!identity) {
        return {
          status: 'SUCCESS',
          items: [],
          citations: [],
          note: 'No shared selection. Select an event, camera, place, or tracked contact — Analyst reads the same identity (works when AI is off).',
        };
      }
      return {
        status: 'SUCCESS',
        items: [
          {
            layerId: identity.layerId || identity.type,
            id: identity.providerId || identity.id,
            label: identity.label,
            detail: `${identity.type} · ${identity.source}`,
            identity,
            type: identity.type,
            source: identity.source,
            lat: identity.lat,
            lon: identity.lon,
          },
        ],
        citations: [],
        note: 'Same Earth Eye identity as the globe selection (id + type + source).',
      };
    },

    async ai_status() {
      return {
        status: AI_SUMMARIES_ENABLED ? 'SUCCESS' : 'UNAVAILABLE',
        capabilityOff: !AI_SUMMARIES_ENABLED,
        items: [
          {
            id: 'ai-summaries',
            label: AI_SUMMARIES_ENABLED
              ? 'AI summaries on'
              : 'AI summaries off',
            detail: AI_SUMMARIES_ENABLED
              ? 'An approved model may synthesize tool results.'
              : 'No paid model is configured. Structured queries and map actions still work; summaries are unavailable.',
          },
          {
            id: 'openai-analyst-ao0',
            label: 'OpenAI Analyst AO-0 scaffold',
            detail:
              'Server hard-disable (EE_OPENAI_ANALYST + OPENAI_API_KEY). No iframe ChatGPT; Analyst UI unchanged. Voice after text stable. See /api/atlas/openai-analyst/status. AO paid AI remains hard-off.',
          },
        ],
        citations: [],
        note: AI_SUMMARIES_ENABLED
          ? ''
          : 'AI summaries are UNAVAILABLE (AO-0 scaffold). Deterministic tools and map actions still run. OpenAI Analyst paid path OFF until owner key + billing OK.',
      };
    },
  };

  /** Run one tool: validate → run under timeout → normalised result + status. */
  async function run(tool, args = {}) {
    const v = validateArgs(tool, args);
    const kind = TOOL_SCHEMAS[tool]?.kind || 'unknown';
    if (!v.ok)
      return {
        ok: false,
        status: COMMAND_STATUS.FAILED,
        tool,
        kind,
        error: v.error,
        items: [],
        citations: [],
      };
    // Non-3D / renderer down: map actions never claim visual SUCCESS.
    if (
      deps.graphicsFailed &&
      kind === 'action' &&
      TOOL_SCHEMAS[tool]?.graphicsRequired !== false
    ) {
      return {
        ok: false,
        status: COMMAND_STATUS.UNAVAILABLE,
        tool,
        kind,
        args: v.args,
        error:
          'UNAVAILABLE — 3D renderer unavailable. Map action did not run (no fly-to / Follow visual).',
        items: [],
        citations: [],
        capabilityOff: true,
      };
    }
    try {
      const out = await impl[tool](v.args);
      // Tools may return ok:false internally (e.g. unavailable camera viewer).
      if (out && out.ok === false) {
        const status = commandStatusFromResult(out, {
          capabilityOff: Boolean(out.capabilityOff),
          pending: Boolean(out.pending),
          layerDisplayOff: Boolean(out.layerDisplayOff),
        });
        return {
          items: [],
          citations: [],
          ...out,
          ok: false,
          status,
          tool,
          kind,
          args: v.args,
        };
      }
      const merged = { ok: true, tool, kind, args: v.args, note: '', ...out };
      const status = commandStatusFromResult(merged, {
        capabilityOff: Boolean(out?.capabilityOff),
        pending: Boolean(out?.pending),
        layerDisplayOff: Boolean(out?.layerDisplayOff),
      });
      return { ...merged, status };
    } catch (error) {
      return {
        ok: false,
        status: COMMAND_STATUS.FAILED,
        tool,
        kind,
        args: v.args,
        error: String(error?.message || error),
        items: [],
        citations: [],
      };
    }
  }
  return {
    run,
    schemas: TOOL_SCHEMAS,
    getSelectedIdentity: () => deps.getSelectedIdentity?.() || null,
  };
}

const ENTITY_WORDS =
  /^(earthquakes?|quakes?|fires?|hotspots?|flights?|aircraft|planes?|military(?: aircraft)?|ships?|vessels?|satellites?|data ?cent(?:er|re)s|dams|fire perimeters)$/;
const WORD_LAYER = {
  earthquake: 'earthquakes',
  earthquakes: 'earthquakes',
  quake: 'earthquakes',
  quakes: 'earthquakes',
  fire: 'local-firms',
  fires: 'local-firms',
  hotspot: 'local-firms',
  hotspots: 'local-firms',
  flight: 'flights',
  flights: 'flights',
  aircraft: 'flights',
  plane: 'flights',
  planes: 'flights',
  military: 'military',
  'military aircraft': 'military',
  ship: 'ais-live-vessels',
  ships: 'ais-live-vessels',
  vessel: 'ais-live-vessels',
  vessels: 'ais-live-vessels',
  satellite: 'satellites',
  satellites: 'satellites',
  'data centers': 'local-datacenters',
  datacenters: 'local-datacenters',
  'data centres': 'local-datacenters',
  dams: 'local-dams',
  'fire perimeters': 'fire-perimeters',
};

/**
 * Deterministic parser for the Analyst box. Returns a plan the panel runs, or
 * `{ error }` when the text is not understood (it never guesses).
 * Plan steps: { tool, args } with `$place` meaning "the first resolved place".
 */
export function parseAnalystInput(input) {
  const text = String(input || '')
    .trim()
    .replace(/\s+/g, ' ');
  const t = text.toLowerCase().replace(/[?.!]+$/, '');
  if (!t) return { error: 'Type a question.' };
  if (t.length > 160)
    return { error: 'That is too long. Keep it under 160 characters.' };
  let m;
  const radius = (s) => {
    const r = /\bwithin (\d{1,4}) ?km\b/.exec(s);
    return r ? Math.min(Number(r[1]), 500) : null;
  };
  const stripRadius = (s) => s.replace(/\bwithin \d{1,4} ?km\b/, '').trim();
  if (
    /^(?:event|world event) details?$|^(?:selected )?event$|^(?:what(?: is|['’]s)?|describe) selected event$/.test(
      t,
    )
  )
    return { plan: [{ tool: 'event_detail', args: {} }] };
  if (/^(?:open|show) (?:the )?(?:event|world event) detail$/.test(t))
    return { plan: [{ tool: 'open_event_detail', args: {} }] };
  if (
    /^(?:related )?cameras?(?: (?:for|near) (?:the )?(?:selected )?event)?$/.test(
      t,
    )
  )
    return { plan: [{ tool: 'related_cameras', args: {} }] };
  if (/^(?:show|turn on|enable) (?:world )?events?(?: layer)?$/.test(t))
    return {
      plan: [{ tool: 'show_layer', args: { layerId: WORLD_EVENTS_LAYER_ID } }],
    };
  if (
    (m =
      /^(?:source |data )?(?:health|status|sources)(?: (?:of|for) (.+))?$/.exec(
        t,
      ))
  ) {
    const layerId = m[1] ? findLayer(m[1])?.id : null;
    if (m[1] && !layerId) return { error: `No layer called "${m[1]}".` };
    return {
      plan: [{ tool: 'source_health', args: layerId ? { layerId } : {} }],
    };
  }
  if ((m = /^(?:fly|go|take me) to (.+)$/.exec(t)))
    return {
      plan: [
        { tool: 'resolve_place', args: { query: m[1], limit: 1 } },
        { tool: 'fly_to', args: '$place' },
      ],
    };
  if ((m = /^(?:show|turn on|enable) (?:the )?(.+?)(?: layer)?$/.exec(t))) {
    const layerId = findLayer(m[1])?.id;
    if (layerId)
      return { plan: [{ tool: 'set_layer', args: { layerId, on: true } }] };
  }
  if ((m = /^(?:hide|turn off|disable) (?:the )?(.+?)(?: layer)?$/.exec(t))) {
    const layerId = findLayer(m[1])?.id;
    if (layerId)
      return { plan: [{ tool: 'set_layer', args: { layerId, on: false } }] };
  }
  if (
    (m =
      /^(?:(live|video clip|clip|still) )?(?:cameras?|cams?|cctv)(?: (?:near|in|around|at) (.+))?$/.exec(
        t,
      ))
  ) {
    const mediaKind = m[1]
      ? m[1] === 'live'
        ? 'live'
        : m[1] === 'still'
          ? 'still'
          : 'clip'
      : undefined;
    const km = m[2] ? radius(m[2]) : null;
    const place = m[2] ? stripRadius(m[2]) : null;
    return {
      plan: [
        place
          ? { tool: 'resolve_place', args: { query: place, limit: 1 } }
          : { center: 'view' },
        {
          tool: 'locate_cameras',
          args: {
            ...(mediaKind ? { mediaKind } : {}),
            ...(km ? { radiusKm: km } : {}),
          },
          at: '$place',
        },
      ],
    };
  }
  if (
    (m = /^(.+?)(?: (?:near|in|around|at) (.+))?$/.exec(t)) &&
    ENTITY_WORDS.test(m[1])
  ) {
    const layerId = WORD_LAYER[m[1]] || WORD_LAYER[m[1].replace(/s$/, '')];
    if (!layerId) return { error: `No layer for "${m[1]}".` };
    const km = m[2] ? radius(m[2]) : null;
    const place = m[2] ? stripRadius(m[2]) : null;
    return {
      plan: [
        place
          ? { tool: 'resolve_place', args: { query: place, limit: 1 } }
          : { center: 'view' },
        {
          tool: 'query_entities',
          args: { layerId, ...(km ? { radiusKm: km } : {}) },
          at: '$place',
        },
      ],
    };
  }
  if ((m = /^(?:where is|find|locate|resolve) (.+)$/.exec(t)))
    return {
      plan: [{ tool: 'resolve_place', args: { query: m[1], limit: 3 } }],
    };
  if (/^(?:ai|summar(?:y|ies)|llm)(?: status)?$/.test(t))
    return { plan: [{ tool: 'ai_status', args: {} }] };
  if (/^(?:stop(?: following| tracking)?|unfollow)$/.test(t))
    return { plan: [{ tool: 'stop_follow', args: {} }] };
  if (/^(?:exit|leave)(?: the)? cockpit$/.test(t))
    return { plan: [{ tool: 'control_cockpit', args: { action: 'exit' } }] };
  if (/^(?:cockpit|enter(?: the)? cockpit|follow(?: view)?)$/.test(t))
    return { plan: [{ tool: 'control_cockpit', args: { action: 'enter' } }] };
  if (/^(?:clear(?: (?:the )?(?:marks|annotations|pins))?)$/.test(t))
    return { plan: [{ tool: 'clear_annotations', args: {} }] };
  if ((m = /^(?:next )?(?:iss )?pass(?: (?:near|at|over) (.+))?$/.exec(t))) {
    const place = m[1] ? m[1].trim() : null;
    return {
      plan: [
        place
          ? { tool: 'resolve_place', args: { query: place, limit: 1 } }
          : { center: 'view' },
        { tool: 'satellite_pass', args: {}, at: '$place' },
      ],
    };
  }
  if ((m = /^(?:list )?scenes?$/.exec(t)))
    return { plan: [{ tool: 'control_scene', args: { action: 'list' } }] };
  if (/^permitted history\b/.test(t) || /^history(?: feeds)?$/.test(t))
    return {
      plan: [{ tool: 'permitted_history', args: {} }],
      note: 'Catalog of feeds that may retain observations (empty ≠ nothing happened).',
    };
  if (
    /^incident(?:\s+workspace)?$/.test(t) ||
    /^workspace for (?:this|event)$/.test(t)
  )
    return {
      plan: [
        {
          tool: 'incident_workspace',
          args: { layerId: 'earthquakes', id: 'selection', lat: 0, lon: 0 },
          needsSelection: true,
        },
      ],
      note: 'Related≠causal nearby brief for the selected event.',
    };
  if (
    /^(?:selected(?: entity)?|what(?: is|\'s)? (?:this|selected|it)|what(?: is|\'s)? this(?: (?:object|entity|thing))?|selection(?: context)?|identify(?: (?:this|selection))?)$/.test(
      t,
    )
  )
    return { plan: [{ tool: 'selected_entity', args: {} }] };
  return {
    error:
      'Not understood. Try "what is this", "cameras near Austin", "earthquakes near Tokyo within 300 km", "fly to Denver", "source health", "selected entity", "incident workspace", "permitted history", "iss pass", "ai status" or "show earthquakes".',
  };
}

export const ANALYST_EXAMPLES = Object.freeze([
  'what is this',
  'cameras near London',
  'earthquakes near Tokyo within 500 km',
  'flights near DFW',
  'source health',
  'event details',
  'related cameras',
  'fly to Denver',
  'where is Mount Rainier',
  'iss pass',
  'ai status',
  'incident workspace',
  'permitted history',
  'stop following',
]);
