/**
 * Who set `screenSpaceCameraController.enableInputs`.
 *
 * Fly v64 (physical iPhone, BUILD MATCH git-825a59d): FLAGS showed
 * inputs=false while the render loop was running and WebGL was not lost.
 * DIAG itself never writes this flag. The owners that set it false are
 * cockpit enter, the CCTV gizmo drag, the imagery box drag, and a local
 * GeoJSON flyTo. Any of those can skip the matching `true` write if a
 * flight callback never runs. This trace records the setter stack, and
 * startup / DIAG-close put the flag back when cockpit is not active.
 */

const trace = {
  lastDisable: null,
  lastEnable: null,
  restores: [],
};

function stackLine() {
  const raw = new Error().stack || '';
  return raw
    .split('\n')
    .slice(3, 8)
    .map((line) => line.trim().slice(0, 180))
    .filter(Boolean)
    .join(' <- ')
    .slice(0, 500);
}

export function readCameraInputTrace() {
  return {
    lastDisable: trace.lastDisable ? { ...trace.lastDisable } : null,
    lastEnable: trace.lastEnable ? { ...trace.lastEnable } : null,
    restores: trace.restores.slice(-6),
  };
}

function remember(kind, value) {
  const entry = { at: Date.now(), value: Boolean(value), stack: stackLine() };
  if (value === false) trace.lastDisable = entry;
  else trace.lastEnable = entry;
  return entry;
}

/**
 * Wrap the Cesium setter once so a later `false` is attributable even when
 * the write is not one of the four named owners. The original setter still
 * runs.
 * @param {object} viewer
 */
export function installCameraInputTrace(viewer) {
  const controller = viewer?.scene?.screenSpaceCameraController;
  if (!controller) return false;
  const proto = Object.getPrototypeOf(controller);
  if (!proto || proto.__eeCameraInputTrace) return true;
  const desc = Object.getOwnPropertyDescriptor(proto, 'enableInputs');
  if (!desc || typeof desc.get !== 'function' || typeof desc.set !== 'function') {
    return false;
  }
  const originalGet = desc.get;
  const originalSet = desc.set;
  Object.defineProperty(proto, 'enableInputs', {
    configurable: true,
    enumerable: desc.enumerable !== false,
    get() {
      return originalGet.call(this);
    },
    set(value) {
      try {
        remember(value === false ? 'disable' : 'enable', value);
      } catch {
        /* tracing must not break the camera */
      }
      return originalSet.call(this, value);
    },
  });
  proto.__eeCameraInputTrace = true;
  return true;
}

/**
 * Turn inputs back on when no cockpit session owns the camera.
 * @param {object} viewer
 * @param {Document} [doc]
 * @param {string} [reason]
 * @returns {'cockpit'|'restored'|'already-on'|'no-controller'}
 */
export function restoreCameraInputsUnlessCockpit(viewer, doc, reason = 'unclaimed') {
  const body = doc?.body;
  if (body?.classList?.contains?.('cockpit-mode')) return 'cockpit';
  const controller = viewer?.scene?.screenSpaceCameraController;
  if (!controller) return 'no-controller';
  if (controller.enableInputs === false) {
    controller.enableInputs = true;
    trace.restores.push({
      at: Date.now(),
      reason: String(reason).slice(0, 80),
      prior: trace.lastDisable?.stack || 'no traced disable',
    });
    if (trace.restores.length > 8) trace.restores.shift();
    return 'restored';
  }
  return 'already-on';
}

/** Test hook. */
export function resetCameraInputTrace() {
  trace.lastDisable = null;
  trace.lastEnable = null;
  trace.restores = [];
}
