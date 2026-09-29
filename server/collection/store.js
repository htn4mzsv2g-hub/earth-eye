/**
 * Collection state with optional durable checkpoints (Option C volume).
 * Without EE_COLLECTION_DATA_DIR the store stays in-memory (local/dev).
 * Idempotent upserts by record id; out-of-order observations are refused.
 */
import {
  ensureDataDir,
  loadFeed,
  saveFeed,
  saveHealthIndex,
  resolveDataDir,
} from './persist.js';

/** @typedef {{ id: string, layerId: string, observedAt: number|null, publishedAt: number|null, retrievedAt: number, recordClass: string, geometry: object|null, props: object, deleted?: boolean }} CollectedRecord */

export function createCollectionStore({
  now = () => Date.now(),
  dataDir = resolveDataDir(),
} = {}) {
  /** @type {Map<string, Map<string, CollectedRecord>>} */
  const byFeed = new Map();
  /** @type {Map<string, object>} */
  const health = new Map();
  const durable = ensureDataDir(dataDir);
  let lastPersistError = durable.error;

  const feedMap = (feedId) => {
    if (!byFeed.has(feedId)) byFeed.set(feedId, new Map());
    return byFeed.get(feedId);
  };

  function hydrate(feedId) {
    if (!durable.ready || byFeed.has(feedId)) return;
    const loaded = loadFeed(durable.path, feedId);
    if (!loaded) {
      byFeed.set(feedId, new Map());
      return;
    }
    const map = new Map();
    for (const r of loaded.records) {
      if (r?.id) map.set(r.id, r);
    }
    byFeed.set(feedId, map);
  }

  function persistFeed(feedId) {
    if (!durable.ready) return;
    const map = feedMap(feedId);
    const result = saveFeed(durable.path, feedId, [...map.values()]);
    if (!result.ok) lastPersistError = result.error;
  }

  function persistHealth() {
    if (!durable.ready) return;
    const result = saveHealthIndex(durable.path, [...health.values()]);
    if (!result.ok) lastPersistError = result.error;
  }

  return {
    durable: {
      ready: durable.ready,
      path: durable.path,
      error: () => lastPersistError,
    },
    /** Upsert records; returns {added, updated, size}. */
    apply(feedId, records, { retentionMs = 0 } = {}) {
      hydrate(feedId);
      const map = feedMap(feedId);
      let added = 0;
      let updated = 0;
      const t = now();
      for (const r of records || []) {
        if (!r?.id) continue;
        const prev = map.get(r.id);
        if (r.deleted) {
          if (prev) map.delete(r.id);
          continue;
        }
        if (
          prev &&
          Number.isFinite(prev.observedAt) &&
          Number.isFinite(r.observedAt) &&
          r.observedAt < prev.observedAt
        )
          continue;
        if (prev) updated++;
        else added++;
        map.set(r.id, { ...r, retrievedAt: r.retrievedAt || t });
      }
      if (retentionMs > 0) {
        const cut = t - retentionMs;
        for (const [id, r] of map)
          if ((r.observedAt || r.retrievedAt) < cut) map.delete(id);
      }
      persistFeed(feedId);
      return { added, updated, size: map.size };
    },
    delete(feedId, id) {
      hydrate(feedId);
      const ok = feedMap(feedId).delete(id);
      if (ok) persistFeed(feedId);
      return ok;
    },
    list(feedId, { limit = 200 } = {}) {
      hydrate(feedId);
      const all = [...feedMap(feedId).values()];
      all.sort(
        (a, b) =>
          (b.observedAt || b.retrievedAt) - (a.observedAt || a.retrievedAt),
      );
      return all.slice(0, limit);
    },
    count(feedId) {
      hydrate(feedId);
      return feedMap(feedId).size;
    },
    setHealth(feedId, patch) {
      const prev = health.get(feedId) || {
        feedId,
        lastSuccessAt: null,
        lastAttemptAt: null,
        lastError: null,
        consecutiveFailures: 0,
        expectedNextAt: null,
        backlog: 0,
        running: false,
        records: 0,
      };
      const next = { ...prev, ...patch, feedId };
      health.set(feedId, next);
      persistHealth();
      return next;
    },
    getHealth(feedId) {
      return health.get(feedId) || null;
    },
    allHealth() {
      return [...health.values()];
    },
    snapshot() {
      return {
        feeds: Object.fromEntries(
          [...byFeed.entries()].map(([id, map]) => [id, map.size]),
        ),
        health: this.allHealth(),
        durable: {
          ready: durable.ready,
          path: durable.path,
          lastError: lastPersistError,
        },
      };
    },
  };
}
