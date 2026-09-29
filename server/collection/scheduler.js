/**
 * Bounded collection scheduler. Runs only while this process is awake.
 * Concurrency 1 essential at a time; backoff on failures; cancels on stop.
 */
import { COLLECTION_POLICIES, SOURCE_REVIEW_QUEUE } from './policies.js';
import { continuousEnabled } from './persist.js';
import { createCollectionStore } from './store.js';
import { ADAPTERS } from './adapters.js';
import { mayRetainFeed } from './retentionPolicy.js';

const MAX_CONCURRENT = 1;

export function createCollectionScheduler({
  store = createCollectionStore(),
  policies = COLLECTION_POLICIES,
  adapters = ADAPTERS,
  now = () => Date.now(),
  fetchImpl = fetch,
  enabled = true,
} = {}) {
  const timers = new Map();
  const inflight = new Set();
  let stopped = false;
  let running = 0;
  const backlog = [];

  async function runOne(policy) {
    if (stopped || !enabled) return;
    if (inflight.has(policy.id)) {
      backlog.push(policy.id);
      store.setHealth(policy.id, { backlog: backlog.length });
      return;
    }
    if (running >= MAX_CONCURRENT) {
      backlog.push(policy.id);
      store.setHealth(policy.id, { backlog: backlog.length });
      return;
    }
    const adapter = adapters[policy.adapter];
    if (!adapter) {
      store.setHealth(policy.id, {
        lastAttemptAt: now(),
        lastError: `no adapter: ${policy.adapter}`,
        consecutiveFailures: 99,
        expectedNextAt: now() + policy.intervalMs,
      });
      return;
    }
    running++;
    inflight.add(policy.id);
    const attemptedAt = now();
    store.setHealth(policy.id, {
      running: true,
      lastAttemptAt: attemptedAt,
      backlog: backlog.filter((id) => id !== policy.id).length,
    });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), policy.timeoutMs);
    try {
      if (!mayRetainFeed(policy.id)) {
        store.setHealth(policy.id, {
          running: false,
          lastAttemptAt: attemptedAt,
          lastError: `retention forbidden for feed ${policy.id}`,
          consecutiveFailures: 0,
          expectedNextAt: now() + policy.intervalMs,
          retentionForbidden: true,
        });
        return;
      }
      const { records } = await adapter({
        fetchImpl,
        signal: ac.signal,
        policy,
      });
      const result = store.apply(policy.id, records, {
        retentionMs: policy.retentionMs,
      });
      store.setHealth(policy.id, {
        running: false,
        lastSuccessAt: now(),
        lastError: null,
        consecutiveFailures: 0,
        records: result.size,
        expectedNextAt: now() + policy.intervalMs,
        lastAdded: result.added,
        lastUpdated: result.updated,
      });
    } catch (error) {
      const deferred = error?.code === 'adapter-deferred';
      const prev = store.getHealth(policy.id);
      const fails = deferred ? 0 : (prev?.consecutiveFailures || 0) + 1;
      const backoff = Math.min(
        policy.intervalMs * Math.max(1, 2 ** Math.min(fails, 4)),
        30 * 60_000,
      );
      store.setHealth(policy.id, {
        running: false,
        lastError: String(error?.message || error),
        consecutiveFailures: fails,
        expectedNextAt: now() + (deferred ? policy.intervalMs : backoff),
        deferred: Boolean(deferred),
      });
    } finally {
      clearTimeout(timer);
      running--;
      inflight.delete(policy.id);
      // Drain one backlog item.
      const nextId = backlog.shift();
      store.setHealth(policy.id, { backlog: backlog.length });
      if (nextId && !stopped) {
        const p = policies.find((x) => x.id === nextId);
        if (p) void runOne(p);
      }
    }
  }

  function arm(policy) {
    const tick = () => {
      if (stopped) return;
      void runOne(policy);
      const h = store.getHealth(policy.id);
      const wait = Math.max(
        5_000,
        (h?.expectedNextAt || now() + policy.intervalMs) - now(),
      );
      timers.set(
        policy.id,
        setTimeout(() => {
          timers.delete(policy.id);
          tick();
        }, wait),
      );
    };
    // Stagger first run so boot doesn't stampede.
    const delay =
      policy.priority === 'essential'
        ? 2_000 + Math.random() * 3_000
        : 15_000 + Math.random() * 10_000;
    timers.set(
      policy.id,
      setTimeout(() => {
        timers.delete(policy.id);
        tick();
      }, delay),
    );
    store.setHealth(policy.id, {
      expectedNextAt: now() + delay,
      records: 0,
      policy: {
        intervalMs: policy.intervalMs,
        priority: policy.priority,
        layerId: policy.layerId,
        note: policy.note,
      },
    });
  }

  return {
    store,
    start() {
      if (!enabled || stopped) return;
      for (const p of policies) {
        if (p.priority === 'excluded') continue;
        if (!mayRetainFeed(p.id)) {
          store.setHealth(p.id, {
            lastError: `retention forbidden — not scheduled: ${p.id}`,
            retentionForbidden: true,
            records: 0,
          });
          continue;
        }
        arm(p);
      }
    },
    stop() {
      stopped = true;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      backlog.length = 0;
    },
    /** Force one feed (tests / owner). */
    async collectNow(feedId) {
      const p = policies.find((x) => x.id === feedId);
      if (!p) throw new Error(`unknown feed: ${feedId}`);
      await runOne(p);
      return store.getHealth(feedId);
    },
    status() {
      const durable = store.durable || { ready: false, path: null };
      const continuous =
        continuousEnabled() && enabled && !stopped && Boolean(durable.ready);
      return {
        awake: !stopped && enabled,
        continuousClaim: continuous,
        note: continuous
          ? 'Always-on machine + durable volume: collection schedules keep running (Option C).'
          : 'Collection runs only while this process is awake. Continuous claim requires EE_COLLECTION_CONTINUOUS=1 and a writable data dir.',
        concurrency: MAX_CONCURRENT,
        backlog: [...backlog],
        reviewQueue: SOURCE_REVIEW_QUEUE,
        durable: {
          ready: Boolean(durable.ready),
          path: durable.path || null,
          error:
            typeof durable.error === 'function'
              ? durable.error()
              : durable.error || null,
        },
        feeds: store.allHealth(),
        recordCounts: store.snapshot().feeds,
      };
    },
  };
}
