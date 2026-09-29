/**
 * EE-EVENTS-1/2 — Live World Events orchestrator (list feeds EE-EVENTS-2 UX).
 * Bounded parallel Tier A/B/C fetches; per-source honest health; short TTL cache.
 * Never silent empty pretending LIVE.
 */

import {
  fetchNwsWorldEvents,
  fetchUsgsWorldEvents,
  fetchFirmsWorldEvents,
  fetchPerimetersWorldEvents,
  fetchCycloneWorldEvents,
} from './sources/tierA.js';
import { fetchGdacsWorldEvents } from './sources/gdacs.js';
import { fetchGdeltWorldEvents } from './sources/gdelt.js';
import { fetchReliefWebWorldEvents } from './sources/reliefweb.js';
import { worldEventsStatus as foundationStatus } from '../../../src/events/index.js';

const TTL_MS = 90_000;
const GLOBAL_EVENT_CAP = 400;

const SOURCE_ORDER = Object.freeze([
  'nws-alerts',
  'usgs-earthquakes',
  'nasa-firms',
  'wfigs-perimeters',
  'noaa-cyclones',
  'gdacs',
  'reliefweb',
  'gdelt',
]);

const SOURCE_TIERS = Object.freeze({
  'nws-alerts': 'A',
  'usgs-earthquakes': 'A',
  'nasa-firms': 'A',
  'wfigs-perimeters': 'A',
  'noaa-cyclones': 'A',
  gdacs: 'B',
  reliefweb: 'B',
  gdelt: 'C',
});

/**
 * @param {{fetchImpl?: typeof fetch, now?: () => number, includeEvents?: boolean}} [opts]
 */
export function createWorldEventsOrchestrator({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  let cache = null;
  let inflight = null;

  async function refresh() {
    const t0 = now();
    const tasks = [
      ['nws-alerts', () => fetchNwsWorldEvents({ fetchImpl, now })],
      ['usgs-earthquakes', () => fetchUsgsWorldEvents({ fetchImpl, now })],
      ['nasa-firms', () => fetchFirmsWorldEvents({ fetchImpl, now })],
      ['wfigs-perimeters', () => fetchPerimetersWorldEvents({ fetchImpl, now })],
      ['noaa-cyclones', () => fetchCycloneWorldEvents({ fetchImpl, now })],
      ['gdacs', () => fetchGdacsWorldEvents({ fetchImpl, now })],
      ['reliefweb', () => fetchReliefWebWorldEvents()],
      ['gdelt', () => fetchGdeltWorldEvents({ fetchImpl, now })],
    ];

    const settled = await Promise.all(
      tasks.map(async ([id, fn]) => {
        try {
          const result = await fn();
          return { id, result };
        } catch (err) {
          return {
            id,
            result: {
              ok: false,
              health: 'OFFLINE',
              adapterId: id,
              reason: String(err?.message || err),
              events: [],
              count: 0,
              errors: [String(err?.message || err)],
              retrievedAt: new Date(now()).toISOString(),
            },
          };
        }
      }),
    );

    const byId = new Map(settled.map((s) => [s.id, s.result]));
    const sources = SOURCE_ORDER.map((id) => {
      const r = byId.get(id) || {
        health: 'NO DATA',
        adapterId: id,
        reason: 'Source did not run',
        events: [],
        count: 0,
      };
      const events = Array.isArray(r.events) ? r.events : [];
      return Object.freeze({
        id,
        tier: r.tier || SOURCE_TIERS[id] || null,
        health: r.health || 'ERROR',
        count: events.length,
        reason: r.reason || null,
        retrievedAt: r.retrievedAt || null,
        errors: Object.freeze([...(r.errors || [])].slice(0, 5)),
        // Keep events for list endpoint; status strips them.
        _events: events,
      });
    });

    const allEvents = [];
    for (const s of sources) {
      for (const ev of s._events) {
        if (allEvents.length >= GLOBAL_EVENT_CAP) break;
        allEvents.push(ev);
      }
    }

    const healthCounts = {};
    for (const s of sources) {
      healthCounts[s.health] = (healthCounts[s.health] || 0) + 1;
    }

    // Overall: READY if any LIVE-producing source is READY; never pretend LIVE on all-empty-failure.
    const liveOk = sources.some((s) => s.health === 'READY' && s.count > 0);
    const anyOffline = sources.some((s) =>
      ['OFFLINE', 'ERROR', 'RATE LIMITED'].includes(s.health),
    );
    const anyReadyEmpty = sources.some((s) =>
      ['READY', 'EMPTY'].includes(s.health),
    );
    let overall = 'NO DATA';
    if (liveOk) overall = anyOffline ? 'DEGRADED' : 'READY';
    else if (sources.every((s) => s.health === 'PERMISSION HELD' || s.health === 'NEEDS KEY' || s.health === 'NEEDS REVIEW' || s.health === 'TERMS UNCLEAR'))
      overall = 'NEEDS REVIEW';
    else if (anyOffline && !anyReadyEmpty) overall = 'OFFLINE';
    else if (sources.some((s) => s.health === 'EMPTY') && !anyOffline)
      overall = 'EMPTY';
    else if (anyOffline) overall = 'DEGRADED';

    return Object.freeze({
      ok: true,
      slice: 'EE-EVENTS-2',
      health: overall,
      generatedAt: new Date(t0).toISOString(),
      ttlMs: TTL_MS,
      healthCounts: Object.freeze(healthCounts),
      sources: Object.freeze(
        sources.map((s) =>
          Object.freeze({
            id: s.id,
            tier: s.tier,
            health: s.health,
            count: s.count,
            reason: s.reason,
            retrievedAt: s.retrievedAt,
            errors: s.errors,
          }),
        ),
      ),
      events: Object.freeze(allEvents),
      eventCount: allEvents.length,
      caps: Object.freeze({
        global: GLOBAL_EVENT_CAP,
        note: 'Viewport/global caps applied per source; performance-safe.',
      }),
      note: Object.freeze({
        authenticity:
          'No fabricated observations. News ≠ sensor facts. City/region geography stays imprecise. Related refs are not causal proof. Never silent empty pretending LIVE.',
        reliefweb: 'PERMISSION HELD — do not scrape',
        globeMarkers: 'EE-EVENTS-2 — bounded overlay cohort + list UX',
      }),
    });
  }

  async function getSnapshot({ force = false } = {}) {
    const age = cache ? now() - Date.parse(cache.generatedAt) : Infinity;
    if (!force && cache && age < TTL_MS) return cache;
    if (!inflight) {
      inflight = refresh()
        .then((snap) => {
          cache = snap;
          return snap;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  /**
   * Status surface: foundation registry + live per-source health (no event bodies).
   */
  async function status() {
    const foundation = foundationStatus(now);
    let live = null;
    try {
      live = await getSnapshot();
    } catch (err) {
      live = {
        ok: false,
        health: 'OFFLINE',
        reason: String(err?.message || err),
        sources: [],
        eventCount: 0,
      };
    }
    return Object.freeze({
      ...foundation,
      slice: 'EE-EVENTS-2',
      live: Object.freeze({
        health: live.health,
        generatedAt: live.generatedAt || new Date(now()).toISOString(),
        eventCount: live.eventCount || 0,
        healthCounts: live.healthCounts || null,
        sources: live.sources || [],
        caps: live.caps || null,
        note: live.note || null,
        reason: live.reason || null,
      }),
      // Convenience: top-level sources for clients that expect flat shape.
      sources: live.sources || [],
      liveHealth: live.health,
    });
  }

  /**
   * Read-only events list (auth-gated like other atlas data APIs).
   */
  async function listEvents({ source = null, kind = null, limit = 200 } = {}) {
    const snap = await getSnapshot();
    let events = [...(snap.events || [])];
    if (source) {
      const id = String(source);
      events = events.filter(
        (e) =>
          e.eventId?.startsWith(`${id}:`) ||
          e.sources?.some((s) =>
            String(s).toLowerCase().includes(id.toLowerCase()),
          ) ||
          e.layerId === id,
      );
      // Prefer adapter-qualified filter via source snapshot when possible.
      const src = (snap.sources || []).find((s) => s.id === source);
      if (src) {
        // Re-pull from cache internals — events already merged; filter by eventId prefix.
        const prefixes = {
          'nws-alerts': 'nws:',
          'usgs-earthquakes': 'usgs:',
          'nasa-firms': 'nasa-firms:',
          'wfigs-perimeters': 'wfigs:',
          'noaa-cyclones': 'noaa-nhc:',
          gdacs: 'gdacs:',
          gdelt: 'gdelt:',
          reliefweb: 'reliefweb:',
        };
        const prefix = prefixes[source];
        if (prefix) events = (snap.events || []).filter((e) => e.eventId?.startsWith(prefix));
      }
    }
    if (kind) {
      events = events.filter((e) => e.kind === kind);
    }
    const lim = Math.max(1, Math.min(Number(limit) || 200, GLOBAL_EVENT_CAP));
    events = events.slice(0, lim);
    return Object.freeze({
      ok: true,
      slice: 'EE-EVENTS-2',
      health: snap.health,
      generatedAt: snap.generatedAt,
      count: events.length,
      events,
      sources: snap.sources,
      note: snap.note,
    });
  }

  return { getSnapshot, status, listEvents, TTL_MS };
}
