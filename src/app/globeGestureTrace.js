/**
 * Bounded, read-only record of one globe gesture.
 * Distinguishes:
 *   A  touch blocked before the Cesium canvas
 *   B  touch reached the canvas, camera did not move
 *   C  camera moved, no new frame
 *   D  renderer failed or the render loop stalled
 *   pass  canvas received the gesture, camera moved, a frame rendered
 * Input flags are never a verdict. Nothing here is a credential.
 */

export const GESTURE_TRACE_KEY = 'ee:gesture-trace';
export const GESTURE_EVENT_CAP = 24;

const END_TYPES = new Set([
  'pointerup',
  'pointercancel',
  'touchend',
  'touchcancel',
]);
const START_TYPES = new Set(['pointerdown', 'touchstart']);

/** @param {Element|null|undefined} el */
export function targetLabel(el) {
  if (!el || el.nodeType !== 1) return 'none';
  const tag = String(el.tagName || '').toLowerCase();
  const id = el.id ? `#${String(el.id).slice(0, 40)}` : '';
  const raw = typeof el.className === 'string' ? el.className : '';
  const cls = raw
    .split(/\s+/)
    .filter((name) => name && name.length < 40)
    .slice(0, 3)
    .map((name) => `.${name}`)
    .join('');
  return `${tag}${id}${cls}`.slice(0, 96);
}

/** @param {Element|null|undefined} el */
export function ancestorStyleChain(el, view) {
  const rows = [];
  const win = view || el?.ownerDocument?.defaultView;
  for (let node = el; node && node.nodeType === 1 && rows.length < 8; node = node.parentElement) {
    let computed = null;
    try {
      computed = win?.getComputedStyle?.(node) || null;
    } catch {
      computed = null;
    }
    rows.push({
      target: targetLabel(node),
      pointerEvents: String(computed?.pointerEvents || node.style?.pointerEvents || ''),
      visibility: String(computed?.visibility || node.style?.visibility || ''),
      display: String(computed?.display || node.style?.display || ''),
      opacity: String(computed?.opacity || node.style?.opacity || ''),
      zIndex: String(computed?.zIndex || ''),
      inert: Boolean(node.inert),
    });
  }
  return rows;
}

/**
 * @param {Navigator} [nav]
 * @param {Window} [win]
 */
export function readBrowserContext(nav = globalThis.navigator, win = globalThis.window) {
  const ua = String(nav?.userAgent || '').slice(0, 180);
  const ios = /iPhone|iPad|iPod/i.test(ua);
  let standalone = false;
  try {
    standalone =
      nav?.standalone === true ||
      win?.matchMedia?.('(display-mode: standalone)')?.matches === true;
  } catch {
    standalone = false;
  }
  const wkWebView = ios && /AppleWebKit/i.test(ua) && !/Safari/i.test(ua);
  const inAppToken = /FBAN|FBAV|Instagram|Line\/|Twitter|GSA\/|Musical_ly|Bytedance/i.test(ua);
  const framed = Boolean(win && win.top && win.top !== win.self);
  const embedded = Boolean(ios && (wkWebView || inAppToken || framed) && !standalone);
  let kind = 'other';
  let label = 'not an iPhone browser — this is not a physical-device result';
  if (embedded) {
    kind = 'embedded-ios';
    label = 'embedded iOS browser (not standalone Safari)';
  } else if (ios && standalone) {
    kind = 'ios-standalone';
    label = 'iOS standalone (home screen)';
  } else if (ios) {
    kind = 'ios-safari';
    label = 'iOS Safari (or a browser that still identifies as Safari)';
  }
  return { kind, label, ua, standalone, embedded };
}

function round(value, places) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
}

/** Duck-typed Cesium viewer. No import of Cesium. */
export function readSceneSnapshot(viewer) {
  const camera = viewer?.camera;
  const carto = camera?.positionCartographic;
  let contextLost = null;
  try {
    const gl = viewer?.scene?.context?._gl;
    if (gl && typeof gl.isContextLost === 'function') contextLost = Boolean(gl.isContextLost());
  } catch {
    contextLost = null;
  }
  const hidden = Boolean(globalThis.document?.hidden);
  const loop = viewer?.useDefaultRenderLoop;
  return {
    camera: camera
      ? {
          lon: round(carto?.longitude, 6),
          lat: round(carto?.latitude, 6),
          h: round(carto?.height, 1),
          heading: round(camera.heading, 4),
          pitch: round(camera.pitch, 4),
        }
      : null,
    frame: Number.isFinite(viewer?.scene?.frameState?.frameNumber)
      ? viewer.scene.frameState.frameNumber
      : null,
    contextLost,
    loopStalled: loop === false && !hidden,
    requestRenderMode: viewer?.scene?.requestRenderMode ?? null,
    useDefaultRenderLoop: loop ?? null,
  };
}

export function cameraMoved(before, after) {
  if (!before || !after) return false;
  const rad = (key, eps) =>
    before[key] != null && after[key] != null && Math.abs(before[key] - after[key]) > eps;
  return (
    rad('lon', 1e-6) ||
    rad('lat', 1e-6) ||
    (before.h != null && after.h != null && Math.abs(before.h - after.h) > 1) ||
    rad('heading', 1e-4) ||
    rad('pitch', 1e-4)
  );
}

/**
 * @param {{
 *   events?: Array<{type: string, target: string, reachedCanvas: boolean, defaultPrevented: boolean}>,
 *   cameraMoved?: boolean,
 *   frameAdvanced?: boolean,
 *   contextLost?: boolean|null,
 *   loopStalled?: boolean,
 *   renderFailure?: string|null,
 * }} attempt
 */
export function classifyAttempt(attempt) {
  if (attempt?.contextLost === true || attempt?.loopStalled || attempt?.renderFailure) {
    return {
      code: 'D',
      reason: attempt.renderFailure
        ? `renderer failed: ${attempt.renderFailure}`
        : attempt.contextLost
          ? 'WebGL context lost'
          : 'render loop stalled while the page was visible',
    };
  }
  const events = attempt?.events || [];
  if (!events.length) {
    return {
      code: 'none',
      reason: 'no pointer or touch gesture recorded',
    };
  }
  const reached = events.some((event) => event.reachedCanvas);
  const top = events.find((event) => !event.reachedCanvas)?.target || events[0]?.target || 'none';
  if (!reached) {
    return {
      code: 'A',
      reason: `touch blocked before canvas (${top})`,
    };
  }
  if (!attempt.cameraMoved) {
    return {
      code: 'B',
      reason: 'events reached the canvas but the camera did not move',
    };
  }
  if (!attempt.frameAdvanced) {
    return {
      code: 'C',
      reason: 'camera moved but no new frame rendered',
    };
  }
  return {
    code: 'pass',
    reason: 'gesture reached the canvas, the camera moved, and a frame rendered',
  };
}

function emptyState() {
  return {
    v: 1,
    events: [],
    lastGesture: null,
    renderFailure: null,
    context: null,
  };
}

export function createGestureTraceStore(storage) {
  const load = () => {
    try {
      const raw = storage?.getItem?.(GESTURE_TRACE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return emptyState();
      return {
        v: 1,
        events: Array.isArray(parsed.events) ? parsed.events.slice(-GESTURE_EVENT_CAP) : [],
        lastGesture: parsed.lastGesture || null,
        renderFailure: parsed.renderFailure || null,
        context: parsed.context || null,
      };
    } catch {
      return emptyState();
    }
  };
  let state = load();
  const persist = () => {
    try {
      storage?.setItem?.(GESTURE_TRACE_KEY, JSON.stringify(state));
    } catch {
      /* private mode / quota */
    }
  };
  return {
    snapshot() {
      return {
        events: state.events.slice(),
        lastGesture: state.lastGesture ? { ...state.lastGesture } : null,
        renderFailure: state.renderFailure,
        context: state.context ? { ...state.context } : null,
      };
    },
    replace(next, { persistNow = true } = {}) {
      state = {
        v: 1,
        events: (next.events || []).slice(-GESTURE_EVENT_CAP),
        lastGesture: next.lastGesture || null,
        renderFailure: next.renderFailure || null,
        context: next.context || state.context,
      };
      if (persistNow) persist();
      return this.snapshot();
    },
    noteRenderFailure(message) {
      state.renderFailure = String(message || 'render error').slice(0, 160);
      persist();
    },
  };
}

function eventReachedCanvas(event, canvas) {
  if (!canvas) return false;
  if (event.target === canvas) return true;
  try {
    if (typeof event.composedPath === 'function' && event.composedPath().includes(canvas))
      return true;
  } catch {
    /* */
  }
  return false;
}

/**
 * @param {{
 *   doc?: Document,
 *   storage?: Storage,
 *   getCanvas?: () => Element|null,
 *   readScene?: () => ReturnType<typeof readSceneSnapshot>,
 *   schedule?: (fn: () => void) => void,
 *   now?: () => number,
 * }} [opts]
 */
export function createGlobeGestureMonitor({
  doc = globalThis.document,
  storage = globalThis.sessionStorage,
  getCanvas = () => doc?.querySelector?.('#cesiumContainer canvas') || null,
  readScene = () => readSceneSnapshot(globalThis.__godsEyeView?.viewer),
  schedule = (fn) => {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== 'function') {
      fn();
      return;
    }
    // Capture runs before Cesium handles the gesture. Wait a few frames so
    // a real camera change and the redraw it requested are visible.
    raf(() => raf(() => raf(fn)));
  },
  now = () => Date.now(),
} = {}) {
  const store = createGestureTraceStore(storage);
  const active = new Set();
  let open = null;

  const pushEvent = (record) => {
    const snap = store.snapshot();
    const events = snap.events.concat(record).slice(-GESTURE_EVENT_CAP);
    store.replace({ ...snap, events }, { persistNow: false });
  };

  const begin = (event) => {
    const scene = readScene() || {};
    open = {
      at: now(),
      kind: event.touches?.length > 1 || event.pointerType === 'touch' ? 'touch' : 'pointer',
      pinch: (event.touches?.length || 0) >= 2,
      events: [],
      camera: scene.camera || null,
      frame: scene.frame,
      ancestors: ancestorStyleChain(event.target, doc?.defaultView),
    };
  };

  const finish = () => {
    const started = open;
    open = null;
    if (!started) return;
    schedule(() => {
      const scene = readScene() || {};
      const failure = store.snapshot().renderFailure;
      const moved = cameraMoved(started.camera, scene.camera);
      const frameAdvanced =
        started.frame != null && scene.frame != null && scene.frame > started.frame;
      const verdict = classifyAttempt({
        events: started.events,
        cameraMoved: moved,
        frameAdvanced,
        contextLost: scene.contextLost,
        loopStalled: scene.loopStalled,
        renderFailure: failure,
      });
      const snap = store.snapshot();
      store.replace({
        ...snap,
        lastGesture: {
          code: verdict.code,
          reason: verdict.reason,
          at: started.at,
          kind: started.pinch ? 'pinch' : 'drag',
          pointer: started.kind,
          cameraMoved: moved,
          frameAdvanced,
          framesBefore: started.frame,
          framesAfter: scene.frame,
          reachedCanvas: started.events.some((item) => item.reachedCanvas),
          topTarget: started.events[0]?.target || 'none',
          defaultPrevented: started.events.some((item) => item.defaultPrevented),
          ancestors: started.ancestors,
          contextLost: scene.contextLost,
          loopStalled: Boolean(scene.loopStalled),
        },
      });
    });
  };

  const handleEvent = (event) => {
    const type = String(event?.type || '');
    if (!type) return;
    const canvas = getCanvas();
    const reachedCanvas = eventReachedCanvas(event, canvas);
    const record = {
      type,
      target: targetLabel(event.target),
      reachedCanvas,
      defaultPrevented: Boolean(event.defaultPrevented),
      cancelable: Boolean(event.cancelable),
      pointerType: String(event.pointerType || (event.touches ? 'touch' : '')).slice(0, 16),
      touches: Number(event.touches?.length || 0),
    };
    pushEvent(record);
    if (START_TYPES.has(type) && !open) begin(event);
    if (open) {
      open.events.push(record);
      if (open.events.length > GESTURE_EVENT_CAP) {
        open.events.splice(1, open.events.length - (GESTURE_EVENT_CAP - 1));
      }
      if ((event.touches?.length || 0) >= 2) open.pinch = true;
    }
    const id = event.pointerId != null ? `p${event.pointerId}` : type.startsWith('touch') ? 'touch' : 'ptr';
    if (START_TYPES.has(type)) active.add(id);
    if (END_TYPES.has(type)) {
      active.delete(id);
      if (type.startsWith('touch') && (event.touches?.length || 0) === 0) active.clear();
      if (active.size === 0) finish();
    }
  };

  let installed = false;
  let viewerHooked = null;
  const onRenderError = (error) => {
    const message = String(error?.message || error?.error?.message || error || 'render error');
    store.noteRenderFailure(message);
  };

  return {
    handleEvent,
    snapshot: () => store.snapshot(),
    install() {
      if (installed || !doc?.addEventListener) return;
      installed = true;
      const types = [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'touchstart',
        'touchmove',
        'touchend',
        'touchcancel',
      ];
      for (const type of types) {
        doc.addEventListener(type, handleEvent, { capture: true, passive: true });
      }
      store.replace({
        ...store.snapshot(),
        context: readBrowserContext(globalThis.navigator, globalThis.window),
      });
    },
    attachViewer(viewer) {
      if (!viewer || viewer === viewerHooked) return;
      viewerHooked = viewer;
      try {
        viewer.scene?.renderError?.addEventListener?.(onRenderError);
      } catch {
        /* viewer without renderError */
      }
    },
    destroy() {
      if (!installed || !doc?.removeEventListener) return;
      installed = false;
      const types = [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'touchstart',
        'touchmove',
        'touchend',
        'touchcancel',
      ];
      for (const type of types) doc.removeEventListener(type, handleEvent, true);
    },
  };
}

/** Facts only. The word "healthy" is intentionally absent. */
export function renderDiagnosticText({
  buildId,
  metaBuildId,
  trace,
  hitStack = [],
  inputs = null,
  browser = null,
}) {
  const lines = [];
  lines.push(`BUILD ${buildId || 'unknown'}`);
  lines.push(`META  ${metaBuildId || 'missing'}`);
  lines.push(buildId && buildId === metaBuildId ? 'BUILD MATCH' : 'BUILD MISMATCH');
  if (browser?.label) lines.push(`BROWSER ${browser.label}`);
  const gesture = trace?.lastGesture;
  if (!gesture) {
    lines.push('GESTURE none — no drag or pinch recorded yet');
    lines.push('Input flags do not show that touch works.');
  } else {
    lines.push(`GESTURE ${gesture.code} · ${gesture.kind || 'drag'} · ${gesture.reason}`);
    lines.push(
      `target ${gesture.topTarget} · reached canvas ${gesture.reachedCanvas ? 'yes' : 'no'} · canceled ${gesture.defaultPrevented ? 'yes' : 'no'}`,
    );
    lines.push(
      `camera moved ${gesture.cameraMoved ? 'yes' : 'no'} · frame ${gesture.framesBefore ?? '—'} → ${gesture.framesAfter ?? '—'}`,
    );
    if (Array.isArray(gesture.ancestors) && gesture.ancestors.length) {
      lines.push('ANCESTORS at gesture:');
      for (const row of gesture.ancestors) {
        lines.push(
          `  ${row.target} pe=${row.pointerEvents || '—'} vis=${row.visibility || '—'} disp=${row.display || '—'} op=${row.opacity || '—'} z=${row.zIndex || '—'} inert=${row.inert ? 'yes' : 'no'}`,
        );
      }
    }
  }
  if (trace?.renderFailure) lines.push(`RENDERER D · ${trace.renderFailure}`);
  else lines.push('RENDERER no recorded failure');
  if (hitStack.length) {
    lines.push('HIT STACK now (center):');
    for (const row of hitStack) {
      lines.push(
        `  ${row.target} pe=${row.pointerEvents || '—'} vis=${row.visibility || '—'} disp=${row.display || '—'} op=${row.opacity || '—'} z=${row.zIndex || '—'} inert=${row.inert ? 'yes' : 'no'}`,
      );
    }
  }
  if (inputs) {
    lines.push(
      `FLAGS overlay=${inputs.overlay ?? 'none'} canvas pe=${inputs.canvasPointerEvents || '—'} inputs=${inputs.enableInputs} rotate=${inputs.enableRotate} zoom=${inputs.enableZoom} tilt=${inputs.enableTilt} webglLost=${inputs.webglLost} loop=${inputs.useDefaultRenderLoop} rrm=${inputs.requestRenderMode}`,
    );
    lines.push('FLAGS are not a verdict.');
  }
  const recent = trace?.events || [];
  if (recent.length) {
    lines.push('EVENTS (oldest → newest, capped):');
    for (const event of recent.slice(-12)) {
      lines.push(
        `  ${event.type} → ${event.target} canvas=${event.reachedCanvas ? 'yes' : 'no'} canceled=${event.defaultPrevented ? 'yes' : 'no'}`,
      );
    }
  }
  return lines.join('\n');
}
