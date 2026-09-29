/**
 * Non-3D / graphics-failure audit mode (Earth Eye).
 *
 * Auth, nav, shared selection, providers, and panels boot independently of
 * Cesium. When WebGL/CesiumWidget init fails — or when deliberate non-3D entry
 * is requested — the shell stays on the SAME real APIs, permissions, records,
 * timestamps, and source-health. No mock/reviewer-only datasets. No fake SUCCESS.
 *
 * 3D-only actions are disabled with an explicit why; Analyst map actions return
 * UNAVAILABLE while the renderer is down. Never claim fly-to / Follow succeeded.
 *
 * Deliberate test entry (same auth/permissions, no extra access):
 *   ?ee_non3d=1
 * sessionStorage ee:force-non3d may be set by Continue/Dismiss during a
 * graphics-failed session, but normal entry (URL without ee_non3d) always
 * clears that flag so a later Safari visit cannot stick in non-3D / no-drag.
 * Does not weaken CSP, auth, TLS, or LOGIN_*.
 */

export const GRAPHICS_INIT_CODE = 'GRAPHICS_INIT_FAILED';
export const NON3D_QUERY_PARAM = 'ee_non3d';
export const NON3D_STORAGE_KEY = 'ee:force-non3d';

export const MAP_DEPENDENT_ACTIONS = Object.freeze([
  'follow',
  'cockpit',
  'fly-to',
  'fly_to',
  'fly_to_location',
  'tour',
  'snapshot',
  'control_cockpit',
  'annotate',
  'clear_annotations',
  'control_scene',
  'globe-markers',
  'show-on-globe',
  'set_tracked_entity',
  'track_entity',
]);

/** Analyst / voice map verbs that must never report visual SUCCESS without a renderer. */
export const MAP_ACTION_TOOLS = Object.freeze([
  'fly_to',
  // select_entity (cctv) + set_layer work without Cesium; gated inside tools.
  'stop_follow',
  'control_cockpit',
  'annotate',
  'clear_annotations',
  'control_scene',
]);

const WEBGL_FAIL_RE =
  /supports\s+WebGL.*initialization\s+failed|WebGL.*initialization\s+failed|initialization\s+failed.*WebGL|Failed\s+to\s+create\s+WebGL|Could\s+not\s+create\s+WebGL|createWebGLContext|WEBGL_CONTEXT|no\s+WebGL|WebGL\s+not\s+supported|CesiumWidget|cesium.*webgl/i;

export class GraphicsInitError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown, code?: string }} [opts]
   */
  constructor(message, opts = {}) {
    super(
      message,
      opts.cause !== undefined ? { cause: opts.cause } : undefined,
    );
    this.name = 'GraphicsInitError';
    this.code = opts.code || GRAPHICS_INIT_CODE;
    this.cause = opts.cause;
  }
}

export function describeGraphicsError(error) {
  if (!error) return 'Unknown graphics initialization error';
  if (error instanceof Error) {
    const msg = String(error.message || '').trim();
    if (msg) return msg;
    return error.name || 'Graphics initialization error';
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (typeof error === 'object') {
    const nested = String(error.message || error.error || '').trim();
    if (nested) return nested;
  }
  return String(error);
}

export function isGraphicsInitFailure(error) {
  if (!error) return false;
  if (error instanceof GraphicsInitError) return true;
  if (error?.code === GRAPHICS_INIT_CODE) return true;
  const msg = describeGraphicsError(error);
  if (WEBGL_FAIL_RE.test(msg)) return true;
  const name = String(error?.name || '');
  if (/RuntimeError/i.test(name) && /WebGL|CesiumWidget/i.test(msg)) return true;
  if (typeof AggregateError !== 'undefined' && error instanceof AggregateError)
    return (error.errors || []).some((e) => isGraphicsInitFailure(e));
  if (error?.cause && isGraphicsInitFailure(error.cause)) return true;
  return false;
}

export function wrapGraphicsInitFailure(error) {
  if (error instanceof GraphicsInitError) return error;
  return new GraphicsInitError(
    describeGraphicsError(error) ||
      'The browser supports WebGL, but initialization failed.',
    { cause: error },
  );
}

/** Persist non-3D for this tab (Continue/Dismiss). Cleared on Retry 3D and on normal entry. */
export function setForceNon3dFlag(on, storage = globalThis.sessionStorage) {
  try {
    if (on) storage?.setItem?.(NON3D_STORAGE_KEY, '1');
    else storage?.removeItem?.(NON3D_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Deliberate non-3D entry for audit/testing. Same session auth — no bypass.
 * Only the URL query forces non-3D. A sticky sessionStorage flag from an
 * earlier Continue/Dismiss must not trap normal visits into a still/no-drag
 * globe path (iPhone Safari same-tab regression).
 * @param {string|URLSearchParams} [search]
 * @param {Storage|null} [storage]
 */
export function shouldForceNon3dMode(
  search = globalThis.location?.search,
  storage = globalThis.sessionStorage,
) {
  let queryForced = false;
  try {
    const params =
      typeof search === 'string'
        ? new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
        : search instanceof URLSearchParams
          ? search
          : new URLSearchParams();
    const q = String(params.get(NON3D_QUERY_PARAM) || '').toLowerCase();
    if (q === '1' || q === 'true' || q === 'yes') queryForced = true;
  } catch {
    /* */
  }
  if (queryForced) return true;

  // Normal entry: clear sticky flag from prior Continue/Dismiss / audit tab.
  setForceNon3dFlag(false, storage);
  return false;
}

/**
 * @param {unknown} [error]
 * @param {{ forced?: boolean }} [opts]
 */
export function createGraphicsFailedState(error, { forced = false } = {}) {
  const wrapped = error
    ? wrapGraphicsInitFailure(error)
    : new GraphicsInitError(
        forced
          ? 'Deliberate non-3D audit mode (?ee_non3d=1).'
          : 'The browser supports WebGL, but initialization failed.',
      );
  return Object.freeze({
    failed: true,
    forced: Boolean(forced),
    code: GRAPHICS_INIT_CODE,
    message: wrapped.message,
    headline: '3D view is unavailable in this browser.',
    detail:
      'You can still explore available data — place search, cameras, World Events, source health, capabilities, and Analyst on a selected object — using the same real APIs and permissions. Map actions that need the globe (fly-to, Follow, Cockpit, markers) are UNAVAILABLE.',
  });
}

/**
 * High-contrast recovery banner: Retry 3D | Continue without 3D.
 * Logout stays on the shell dock (not inside this panel).
 */
export function mountGraphicsRecoveryPanel({
  state,
  onRetry,
  onContinue,
  parent,
  doc = globalThis.document,
} = {}) {
  if (!doc) throw new TypeError('document is required');
  const host = parent || doc.body;
  // Idempotent: never stack duplicate banners / Retry listeners.
  const existing = doc.getElementById('ee-graphics-recovery');
  if (existing) {
    existing.remove();
  }

  const root = doc.createElement('section');
  root.id = 'ee-graphics-recovery';
  root.className = 'ee-graphics-recovery ee-graphics-recovery--compact';
  root.setAttribute('role', 'alert');
  root.setAttribute('aria-live', 'assertive');
  root.dataset.eeGraphicsFailed = '1';
  if (state?.forced) root.dataset.eeNon3dForced = '1';

  const title = doc.createElement('h2');
  title.className = 'ee-graphics-recovery-title';
  title.textContent = '3D VIEW UNAVAILABLE';

  const lead = doc.createElement('p');
  lead.className = 'ee-graphics-recovery-lead';
  lead.textContent =
    state?.headline ||
    '3D view is unavailable. Explore available data — map actions stay UNAVAILABLE.';

  const reason = doc.createElement('p');
  reason.className = 'ee-graphics-recovery-reason';
  reason.textContent = state?.message || describeGraphicsError(null);

  const detail = doc.createElement('p');
  detail.className = 'ee-graphics-recovery-detail';
  detail.textContent = state?.detail || '';
  detail.hidden = true; // compact by default — expand via details toggle

  const actions = doc.createElement('div');
  actions.className = 'ee-graphics-recovery-actions';

  let retryArmed = true;
  const retry = doc.createElement('button');
  retry.type = 'button';
  retry.className = 'ee-graphics-recovery-retry';
  retry.dataset.eeGraphicsRetry = '1';
  retry.textContent = 'Retry 3D';
  retry.setAttribute('aria-label', 'Retry 3D globe initialization');
  retry.addEventListener(
    'click',
    () => {
      if (!retryArmed) return;
      retryArmed = false;
      retry.disabled = true;
      try {
        onRetry?.();
      } catch (err) {
        retryArmed = true;
        retry.disabled = false;
        console.error('[GraphicsRecovery] Retry 3D failed:', err);
      }
    },
    { once: false },
  );

  const cont = doc.createElement('button');
  cont.type = 'button';
  cont.className = 'ee-graphics-recovery-continue';
  cont.dataset.eeGraphicsContinue = '1';
  cont.textContent = 'Continue';
  cont.setAttribute(
    'aria-label',
    'Continue exploring data without the 3D globe',
  );

  const dismiss = doc.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'ee-graphics-recovery-dismiss';
  dismiss.dataset.eeGraphicsDismiss = '1';
  dismiss.textContent = 'Dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss recovery banner');
  dismiss.title = 'Hide banner (NON-3D chip remains; Retry stays in MORE)';

  const collapse = () => {
    root.dataset.eeCollapsed = '1';
    root.classList.add('ee-graphics-recovery--compact');
    root.classList.add('ee-graphics-recovery--dismissed');
    lead.textContent =
      'NON-3D · Retry 3D anytime · map actions UNAVAILABLE';
    detail.hidden = true;
    reason.hidden = true;
    cont.hidden = true;
    dismiss.hidden = true;
  };

  cont.addEventListener('click', () => {
    try {
      onContinue?.();
      collapse();
    } catch (err) {
      console.error('[GraphicsRecovery] Continue failed:', err);
    }
  });
  dismiss.addEventListener('click', () => {
    try {
      onContinue?.();
      collapse();
      root.hidden = true;
    } catch (err) {
      console.error('[GraphicsRecovery] Dismiss failed:', err);
    }
  });

  actions.append(retry, cont, dismiss);
  root.append(title, lead, reason, detail, actions);
  host.appendChild(root);

  try {
    doc.documentElement.classList.add('ee-graphics-failed');
    doc.body?.classList.add('ee-graphics-failed');
  } catch {
    /* */
  }

  return {
    root,
    destroy() {
      root.remove();
      try {
        doc.documentElement.classList.remove('ee-graphics-failed');
        doc.body?.classList.remove('ee-graphics-failed');
      } catch {
        /* */
      }
    },
  };
}

/**
 * Remove every startup cover node from the document (by id + class).
 * Prefer this over a held reference — BFCache / late clones can leave orphans.
 * @param {Document} [doc]
 * @returns {number} how many nodes were removed
 */
export function purgeLoadingCover(doc = globalThis.document) {
  if (!doc?.querySelectorAll) return 0;
  let removed = 0;
  const nodes = new Set();
  try {
    const byId = doc.getElementById?.('loading-screen');
    if (byId) nodes.add(byId);
  } catch {
    /* */
  }
  try {
    for (const n of doc.querySelectorAll?.(
      '#loading-screen, .loader-content',
    ) || []) {
      // Prefer removing the host; orphan .loader-content still goes.
      const host =
        n.id === 'loading-screen'
          ? n
          : n.closest?.('#loading-screen') || n;
      nodes.add(host);
    }
  } catch {
    /* */
  }
  for (const node of nodes) {
    try {
      if (node?.style) node.style.pointerEvents = 'none';
    } catch {
      /* */
    }
    try {
      node?.classList?.add?.('hidden');
      node?.setAttribute?.('aria-hidden', 'true');
    } catch {
      /* */
    }
    try {
      if (node?.dataset) node.dataset.eeDismissed = '1';
    } catch {
      /* */
    }
    try {
      node?.remove?.();
      removed += 1;
    } catch {
      /* */
    }
  }
  return removed;
}

/**
 * Neutralize the startup cover so it cannot steal touches after load.
 * Opacity:0 alone is insufficient — iPhone can still hit-test an interactive
 * full-bleed #loading-screen (owner: TOP @ CENTER = div.loader-content).
 * Always neutralize then **remove synchronously** (no transition wait).
 * Also purges any #loading-screen still in the document by id.
 */
export function dismissLoadingScreen(loadingScreen, doc = globalThis.document) {
  if (loadingScreen) {
    try {
      loadingScreen.classList.add('hidden');
    } catch {
      /* */
    }
    try {
      loadingScreen.setAttribute('aria-hidden', 'true');
    } catch {
      /* */
    }
    try {
      if (loadingScreen.style) loadingScreen.style.pointerEvents = 'none';
    } catch {
      /* */
    }
    const status = loadingScreen.querySelector?.('.loader-status');
    if (status) {
      try {
        status.style.animation = 'none';
        status.style.color = '';
      } catch {
        /* */
      }
    }
    try {
      if (loadingScreen.dataset) loadingScreen.dataset.eeDismissed = '1';
    } catch {
      /* */
    }
    // Synchronous detach — do not wait for transitionend (iOS often skips it).
    try {
      loadingScreen.remove?.();
    } catch {
      /* */
    }
  }
  // Belt-and-suspenders: purge by id in case a different node is still present.
  purgeLoadingCover(doc);
}

/**
 * Re-purge the startup cover on BFCache restore / tab resume.
 * Sticky #loading-screen after Safari pageshow left the globe undraggable.
 * @param {{ document?: Document, window?: Window, signal?: AbortSignal }} [opts]
 */
export function installLoadingCoverGuard({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  signal,
} = {}) {
  if (!win?.addEventListener) return () => {};
  const run = () => {
    try {
      purgeLoadingCover(doc);
    } catch {
      /* */
    }
  };
  win.addEventListener('pageshow', run, { signal });
  doc?.addEventListener?.(
    'visibilitychange',
    () => {
      if (!doc.hidden) run();
    },
    { signal },
  );
  // Late catch if chrome dismissed before a restore race re-inserted cover.
  try {
    setTimeout(run, 0);
    setTimeout(run, 2500);
  } catch {
    /* */
  }
  return run;
}

export function clearCesiumErrorOverlay(doc = globalThis.document) {
  if (!doc) return;
  const container = doc.getElementById('cesiumContainer');
  if (!container) return;
  for (const node of [...container.children]) {
    try {
      node.remove();
    } catch {
      /* */
    }
  }
  if (!container.querySelector('[data-ee-globe-placeholder]')) {
    const ph = doc.createElement('div');
    ph.dataset.eeGlobePlaceholder = '1';
    ph.className = 'ee-globe-placeholder';
    ph.setAttribute('role', 'status');
    ph.textContent =
      '3D view unavailable — explore data via GLOBE / TRACK / CAMERAS / ANALYST / MORE.';
    container.appendChild(ph);
  }
}

export function labelMapDependentUnavailable(
  root,
  {
    label = 'UNAVAILABLE',
    why = '3D renderer unavailable — this action needs the globe',
  } = {},
) {
  if (!root?.querySelectorAll) return;
  const nodes = root.querySelectorAll(
    [
      '[data-ee-map-dependent]',
      '[data-atlas-action="tour"]',
      '[data-atlas-action="snapshot"]',
      '[data-ee-sel="follow"]',
      '[data-ee-sel="fly"]',
      '[data-ee-sel="cockpit"]',
      '[data-ee-sel="cockpit-exit"]',
      '[data-layer-toggle="cctv"]',
      '[data-track-focus]',
    ].join(','),
  );
  for (const el of nodes) {
    el.disabled = true;
    el.setAttribute('aria-disabled', 'true');
    el.dataset.eeUnavailable = '1';
    const title = el.getAttribute('title') || '';
    if (!/UNAVAILABLE/i.test(title))
      el.setAttribute('title', `${label} — ${why}`);
    if (!el.querySelector?.('[data-ee-unavail-label]')) {
      const span = el.ownerDocument.createElement('span');
      span.dataset.eeUnavailLabel = '1';
      span.className = 'ee-unavail-label';
      span.textContent = label;
      el.appendChild(span);
    }
  }
}

export function createDegradedStyleManager() {
  const noop = () => {};
  const unavailable = async () => ({
    ok: false,
    status: 'UNAVAILABLE',
    error: 'UNAVAILABLE — 3D renderer down',
  });
  return {
    hasShareState: false,
    initialRestorePromise: Promise.resolve(),
    orbitController: { stop: noop },
    hud: { destroy: noop },
    dispose: noop,
    attachDataManager: noop,
    getCockpitState: () => null,
    setContextMode: unavailable,
    resetToGlobeView: noop,
    setPanelCollapsed: noop,
    graphicsFailed: true,
  };
}

export function createDegradedDataManager() {
  const listeners = new Set();
  return {
    graphicsFailed: true,
    layers: new Map(),
    getAll: () => [],
    get: () => null,
    isEnabled: () => false,
    isEffectivelyEnabled: () => false,
    setEnabled: async () => {
      const err = new Error(
        'UNAVAILABLE — display layers need the 3D globe (renderer down)',
      );
      err.status = 'UNAVAILABLE';
      throw err;
    },
    subscribe: (fn) => {
      if (typeof fn === 'function') listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroyAll: async () => {},
  };
}

export function createDegradedPresentation() {
  return {
    destroy: () => {},
    mount: () => {},
    attachRecentImagery: () => {},
    flushVisible: () => {},
  };
}

export function isMapDependentAction(name) {
  const id = String(name || '');
  return (
    MAP_DEPENDENT_ACTIONS.includes(id) ||
    MAP_ACTION_TOOLS.includes(id) ||
    /^(fly_|control_cockpit|annotate|follow|track_entity|set_tracked)/i.test(id)
  );
}

/**
 * runAction / Analyst map verbs → UNAVAILABLE (never fake visual SUCCESS).
 */
export function degradedRunAction(name, args = {}) {
  const id = String(name || '');
  const mapDependent = isMapDependentAction(id);
  return Promise.resolve({
    ok: false,
    status: 'UNAVAILABLE',
    error: mapDependent
      ? `UNAVAILABLE — “${id}” needs the 3D globe (renderer unavailable). No fly-to / Follow visual ran.`
      : `UNAVAILABLE — application is in non-3D mode (renderer unavailable)`,
    args,
  });
}

/** Retry 3D: clear deliberate flag and reload (clean WebGL context). */
export function defaultGraphicsRetry({
  location = globalThis.location,
  storage = globalThis.sessionStorage,
} = {}) {
  setForceNon3dFlag(false, storage);
  try {
    const url = new URL(location.href);
    if (url.searchParams.has(NON3D_QUERY_PARAM)) {
      url.searchParams.delete(NON3D_QUERY_PARAM);
      location.assign(url.toString());
      return;
    }
  } catch {
    /* */
  }
  try {
    location.reload();
  } catch (err) {
    console.error('[GraphicsRecovery] reload failed:', err);
  }
}

/**
 * Scene stub when Cesium never starts. Operations (API clients) may still be real.
 */
export function createGraphicsFailedScene({ error, operations, forced = false }) {
  return Object.freeze({
    viewer: null,
    tileset: null,
    mapStackController: null,
    operations,
    graphicsFailed: true,
    graphicsForced: Boolean(forced),
    graphicsError: error ? wrapGraphicsInitFailure(error) : null,
    graphicsState: createGraphicsFailedState(error, { forced }),
  });
}
