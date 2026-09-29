/**
 * EE-EVENTS-0/1 — World Event registry.
 *
 * Registers event-type adapters. Existing EE layers map in-memory via
 * normalizers (Tier A). Tier B/C: GDACS + GDELT live on the server; ReliefWeb
 * remains PERMISSION HELD. Existing layer pipelines are not replaced.
 *
 * Pure JS: no DOM, no network (live fetch is server-side).
 */

import {
  EVENT_HEALTH,
  EVENT_KINDS,
  emptyEventResult,
  notWiredEventResult,
  validateWorldEvent,
} from './worldEventContract.js';

/** Adapter lifecycle for this foundation slice. */
export const ADAPTER_STATUS = Object.freeze({
  /** In-memory normalizer for an existing EE layer. */
  ACTIVE: 'ACTIVE',
  /** Hook reserved or permission-held; live fetch not active. */
  HOOK_ONLY: 'HOOK_ONLY',
  /** Explicitly disabled. */
  DISABLED: 'DISABLED',
});

/**
 * Create an empty World Event registry.
 * @param {{now?: () => number}} [opts]
 */
export function createEventRegistry({ now = () => Date.now() } = {}) {
  /** @type {Map<string, object>} */
  const adapters = new Map();

  function register(descriptor) {
    if (!descriptor || typeof descriptor !== 'object')
      throw new TypeError('register requires a descriptor');
    const id = String(descriptor.id || '').trim();
    if (!id) throw new Error('adapter id required');
    if (adapters.has(id)) throw new Error(`adapter already registered: ${id}`);

    const status = descriptor.status || ADAPTER_STATUS.HOOK_ONLY;
    if (!Object.values(ADAPTER_STATUS).includes(status))
      throw new Error(`invalid adapter status: ${status}`);

    const kinds = Array.isArray(descriptor.kinds)
      ? descriptor.kinds.filter((k) => EVENT_KINDS.includes(k))
      : [];
    if (!kinds.length)
      throw new Error(`adapter ${id} must declare at least one EVENT_KIND`);

    const entry = Object.freeze({
      id,
      label: String(descriptor.label || id).trim(),
      provider: String(descriptor.provider || id).trim(),
      layerId: descriptor.layerId ? String(descriptor.layerId) : null,
      status,
      kinds: Object.freeze([...kinds]),
      tier: descriptor.tier || null, // 'A' | 'B' | 'C' | null
      permission: descriptor.permission
        ? String(descriptor.permission)
        : null,
      normalize:
        typeof descriptor.normalize === 'function'
          ? descriptor.normalize
          : null,
      // Optional live fetch (server world-events invokes; registry stays pure).
      fetchHook:
        typeof descriptor.fetchHook === 'function'
          ? descriptor.fetchHook
          : null,
      notes: descriptor.notes ? String(descriptor.notes) : null,
    });
    adapters.set(id, entry);
    return entry;
  }

  function get(id) {
    return adapters.get(String(id)) || null;
  }

  function list() {
    return [...adapters.values()];
  }

  /**
   * Normalize an in-memory source record through a registered adapter.
   * Does not fetch. Returns { ok, health, events, errors }.
   */
  function normalizeRecord(adapterId, record, context = {}) {
    const adapter = adapters.get(String(adapterId));
    if (!adapter) {
      return {
        ok: false,
        health: 'ERROR',
        adapterId: String(adapterId),
        reason: 'Adapter not registered',
        events: [],
        errors: ['adapter not registered'],
      };
    }
    if (adapter.status === ADAPTER_STATUS.DISABLED) {
      return {
        ok: true,
        health: 'NO DATA',
        adapterId: adapter.id,
        reason: 'Adapter disabled',
        events: [],
        errors: [],
      };
    }
    if (adapter.status === ADAPTER_STATUS.HOOK_ONLY || !adapter.normalize) {
      return notWiredEventResult({
        adapterId: adapter.id,
        source: adapter.label,
      });
    }
    try {
      const raw = adapter.normalize(record, context);
      if (raw == null) {
        return emptyEventResult({
          adapterId: adapter.id,
          reason: 'Record outside adapter scope or missing required fields',
          retrievedAt: new Date(now()).toISOString(),
        });
      }
      const rows = Array.isArray(raw) ? raw : [raw];
      const events = [];
      const errors = [];
      for (const row of rows) {
        const result = validateWorldEvent(row);
        if (result.ok) events.push(result.event);
        else errors.push(...result.errors);
      }
      if (!events.length) {
        return {
          ok: errors.length === 0,
          health: errors.length ? 'ERROR' : 'EMPTY',
          adapterId: adapter.id,
          reason: errors.length
            ? errors.join('; ')
            : 'No valid events from record',
          events: [],
          errors,
        };
      }
      return {
        ok: true,
        health: 'READY',
        adapterId: adapter.id,
        reason: null,
        events,
        errors,
      };
    } catch (err) {
      return {
        ok: false,
        health: 'ERROR',
        adapterId: adapter.id,
        reason: String(err?.message || err),
        events: [],
        errors: [String(err?.message || err)],
      };
    }
  }

  /**
   * Normalize a list of in-memory records (existing layer snapshot).
   */
  function normalizeMany(adapterId, records, context = {}) {
    const adapter = adapters.get(String(adapterId));
    if (!adapter) {
      return {
        ok: false,
        health: 'ERROR',
        adapterId: String(adapterId),
        reason: 'Adapter not registered',
        events: [],
        errors: ['adapter not registered'],
        count: 0,
      };
    }
    if (adapter.status === ADAPTER_STATUS.HOOK_ONLY || !adapter.normalize) {
      return {
        ...notWiredEventResult({
          adapterId: adapter.id,
          source: adapter.label,
        }),
        errors: [],
        count: 0,
      };
    }
    if (!Array.isArray(records) || records.length === 0) {
      return {
        ...emptyEventResult({
          adapterId: adapter.id,
          retrievedAt: new Date(now()).toISOString(),
        }),
        errors: [],
        count: 0,
      };
    }
    const events = [];
    const errors = [];
    for (const record of records) {
      const result = normalizeRecord(adapterId, record, context);
      if (result.events?.length) events.push(...result.events);
      if (result.errors?.length) errors.push(...result.errors);
    }
    return {
      ok: true,
      health: events.length ? 'READY' : errors.length ? 'DEGRADED' : 'EMPTY',
      adapterId: adapter.id,
      reason: events.length
        ? null
        : 'No events produced from snapshot (empty is not "nothing happened")',
      events,
      errors,
      count: events.length,
    };
  }

  /**
   * Honest registry health for capability / status surfaces.
   * Never claims live GDACS/ReliefWeb/GDELT coverage.
   */
  function health() {
    const rows = list();
    const active = rows.filter((a) => a.status === ADAPTER_STATUS.ACTIVE);
    const hooks = rows.filter((a) => a.status === ADAPTER_STATUS.HOOK_ONLY);
    const disabled = rows.filter((a) => a.status === ADAPTER_STATUS.DISABLED);
    const permissionHeld = rows.filter(
      (a) => a.permission === 'PERMISSION HELD',
    );
    return Object.freeze({
      ok: true,
      slice: 'EE-EVENTS-2',
      health: active.length ? 'READY' : rows.length ? 'NOT WIRED' : 'EMPTY',
      generatedAt: new Date(now()).toISOString(),
      summary: Object.freeze({
        registered: rows.length,
        activeNormalizers: active.length,
        hookOnly: hooks.length,
        disabled: disabled.length,
        permissionHeld: permissionHeld.length,
        tierA: rows.filter((a) => a.tier === 'A').length,
        tierB: rows.filter((a) => a.tier === 'B').length,
        tierC: rows.filter((a) => a.tier === 'C').length,
      }),
      adapters: Object.freeze(
        rows.map((a) =>
          Object.freeze({
            id: a.id,
            label: a.label,
            provider: a.provider,
            layerId: a.layerId,
            status: a.status,
            kinds: a.kinds,
            tier: a.tier,
            permission: a.permission,
            hasNormalize: Boolean(a.normalize),
            hasFetchHook: Boolean(a.fetchHook),
            notes: a.notes,
          }),
        ),
      ),
      note: Object.freeze({
        liveFetches:
          'WIRED — Tier A reuse + GDACS + GDELT; ReliefWeb PERMISSION HELD',
        globeMarkers: 'EE-EVENTS-2 — client markers/filters/disclosure',
        authenticity:
          'No fabricated observations. News ≠ sensor facts. City/region geography stays imprecise. Related refs are not causal proof. Never silent empty pretending LIVE.',
      }),
      eventKinds: EVENT_KINDS,
      healthVocabulary: EVENT_HEALTH,
    });
  }

  return {
    register,
    get,
    list,
    normalizeRecord,
    normalizeMany,
    health,
  };
}

/** Singleton foundation registry (populated by adapters/index.js). */
let _default = null;

export function getDefaultEventRegistry() {
  if (!_default) {
    _default = createEventRegistry();
  }
  return _default;
}

/** Test helper — replace the singleton. */
export function resetDefaultEventRegistry(registry = null) {
  _default = registry;
}
