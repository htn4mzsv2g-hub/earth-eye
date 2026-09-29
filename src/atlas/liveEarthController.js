import * as Cesium from 'cesium';
import { isCompactViewport } from './mobilePolicy.js';
import {
  selectLiveEarthSources,
  shouldApplyLiveEarthPreset,
  summarizeLiveEarthStatus,
  usStateForAlerts,
} from './liveEarthPreset.js';

const PROGRESSIVE_GAP_MS = 220;

function cameraView(viewer) {
  const p = viewer?.camera?.positionCartographic;
  return {
    altitudeM: Number(p?.height),
    latitude: p ? Cesium.Math.toDegrees(p.latitude) : NaN,
    longitude: p ? Cesium.Math.toDegrees(p.longitude) : NaN,
  };
}

/** Own LIVE EARTH auto-start and its compact, truthful status chip. */
export function createLiveEarthController({
  viewer,
  dataManager,
  coordinator,
  hasShareState = false,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  signal = null,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  const chip = documentRef?.getElementById?.('live-earth-chip') || null;
  const attempted = new Set();
  const failed = new Set();
  const pending = new Set();
  const timers = new Map();
  let destroyed = false;
  let unsubscribe = null;

  const layerById = (id) => {
    const layer = dataManager?.getAll?.().find((row) => row.id === id) || null;
    if (pending.has(id)) {
      return {
        ...(layer || {}),
        enabled: false,
        lifecycleState: 'enabling',
        stats: { ...(layer?.stats || {}), loading: true },
      };
    }
    if (!failed.has(id) || !layer || layer.enabled) return layer;
    return {
      ...layer,
      stats: {
        ...layer.stats,
        managerRefreshError: 'Preset source unavailable',
      },
    };
  };

  const paint = () => {
    if (!chip || destroyed) return;
    if (!attempted.size) {
      chip.hidden = true;
      chip.classList.remove('visible');
      return;
    }
    const summary = summarizeLiveEarthStatus(attempted, layerById);
    chip.textContent = summary.label;
    chip.dataset.state = summary.loading
      ? 'loading'
      : summary.unavailable
        ? 'degraded'
        : 'ready';
    chip.hidden = false;
    chip.classList.add('visible');
  };

  const wait = (ms) =>
    new Promise((resolve) => {
      const timer = setTimer(() => {
        timers.delete(timer);
        resolve();
      }, ms);
      timers.set(timer, resolve);
    });

  const start = async () => {
    const source = coordinator?.source || 'defaults';
    const durable = coordinator?.getDurableState?.() || { enabledLayerIds: [] };
    if (
      !shouldApplyLiveEarthPreset({
        hasShareState,
        source,
        enabledLayerIds: durable.enabledLayerIds,
      })
    )
      return { applied: false, reason: 'authored-state' };

    const view = cameraView(viewer);
    const compact = isCompactViewport(
      Number(windowRef?.innerWidth),
      Number(windowRef?.innerHeight),
    );
    const ids = selectLiveEarthSources({ ...view, compact });
    if (!ids.length) return { applied: false, reason: 'no-relevant-sources' };

    const stateCode = usStateForAlerts(view.latitude, view.longitude);
    if (stateCode) {
      dataManager.layers
        ?.get('weather-alerts')
        ?.module?.setAlertArea?.(stateCode);
    }

    for (const id of ids) {
      attempted.add(id);
      pending.add(id);
    }
    paint();
    unsubscribe = dataManager.subscribe(() => paint());

    const outcomes = [];
    for (const [index, id] of ids.entries()) {
      if (destroyed || signal?.aborted) break;
      if (index) await wait(PROGRESSIVE_GAP_MS);
      if (destroyed || signal?.aborted) break;
      try {
        const ok = await dataManager.setEnabled(id, true, {
          origin: 'live-earth-preset',
          signal,
        });
        const succeeded = ok !== false;
        if (succeeded) failed.delete(id);
        else failed.add(id);
        outcomes.push({ id, ok: succeeded });
      } catch {
        failed.add(id);
        outcomes.push({ id, ok: false });
      }
      pending.delete(id);
      paint();
    }
    return { applied: true, ids, outcomes };
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    unsubscribe?.();
    unsubscribe = null;
    for (const [timer, resolve] of timers) {
      clearTimer(timer);
      resolve();
    }
    timers.clear();
    if (chip) {
      chip.hidden = true;
      chip.classList.remove('visible');
    }
  };

  return { start, destroy, attemptedIds: attempted };
}
