/**
 * Compact globe diagnostic. Opening it reads the gesture trace; it does not
 * clear it. There is no green "healthy" state — a pass line appears only
 * after a recorded drag or pinch moved the camera and a frame rendered.
 */

import { embeddedBuildId, publishBuildStamp, readMetaBuildId } from './buildStamp.js';
import {
  readCameraInputTrace,
  restoreCameraInputsUnlessCockpit,
} from './cameraInputTrace.js';
import { releaseLoadingScreen } from './loadingScreenRelease.js';
import {
  ancestorStyleChain,
  createGlobeGestureMonitor,
  readBrowserContext,
  renderDiagnosticText,
} from './globeGestureTrace.js';

function readInputFlags(doc, viewer) {
  const controller = viewer?.scene?.screenSpaceCameraController;
  const canvas = viewer?.canvas || doc?.querySelector?.('#cesiumContainer canvas');
  let canvasPointerEvents = '';
  try {
    canvasPointerEvents = canvas
      ? doc?.defaultView?.getComputedStyle?.(canvas)?.pointerEvents || ''
      : '';
  } catch {
    canvasPointerEvents = '';
  }
  let webglLost = null;
  try {
    const gl = viewer?.scene?.context?._gl;
    if (gl && typeof gl.isContextLost === 'function') webglLost = Boolean(gl.isContextLost());
  } catch {
    webglLost = null;
  }
  return {
    overlay: doc?.documentElement?.getAttribute?.('data-ee-overlay') || 'none',
    canvasPointerEvents,
    enableInputs: controller?.enableInputs ?? null,
    enableRotate: controller?.enableRotate ?? null,
    enableZoom: controller?.enableZoom ?? null,
    enableTilt: controller?.enableTilt ?? null,
    webglLost,
    useDefaultRenderLoop: viewer?.useDefaultRenderLoop ?? null,
    requestRenderMode: viewer?.scene?.requestRenderMode ?? null,
  };
}

function readLoaderLine(doc) {
  const el = doc?.getElementById?.('loading-screen');
  if (!el) return 'LOADER absent';
  let computed = null;
  try {
    computed = doc.defaultView?.getComputedStyle?.(el) || null;
  } catch {
    computed = null;
  }
  const release = globalThis.__eeLoaderRelease;
  return [
    'LOADER',
    `class=${el.className || '—'}`,
    `attr=${el.getAttribute?.('data-ee-loader-released') || 'no'}`,
    `display=${computed?.display || el.style?.display || '—'}`,
    `vis=${computed?.visibility || el.style?.visibility || '—'}`,
    `pe=${computed?.pointerEvents || el.style?.pointerEvents || '—'}`,
    `op=${computed?.opacity || el.style?.opacity || '—'}`,
    `reason=${release?.reason || 'not-yet'}`,
  ].join(' ');
}

function sampleCenterStack(doc) {
  if (!doc?.elementFromPoint && !doc?.elementsFromPoint) return [];
  const view = doc.defaultView;
  const width = view?.innerWidth || 0;
  const height = view?.innerHeight || 0;
  const x = width ? Math.round(width / 2) : 0;
  const y = height ? Math.round(height / 2) : 0;
  let top = null;
  try {
    const stack = doc.elementsFromPoint?.(x, y);
    top = stack?.[0] || doc.elementFromPoint?.(x, y) || null;
  } catch {
    top = null;
  }
  return top ? ancestorStyleChain(top, view) : [];
}

/**
 * @param {Document} [doc]
 * @param {ReturnType<typeof createGlobeGestureMonitor>} monitor
 */
export function fillDiagnosticPanel(
  panel,
  monitor,
  doc = globalThis.document,
  buildId = embeddedBuildId(),
) {
  publishBuildStamp(doc, buildId);
  const viewer = globalThis.__godsEyeView?.viewer;
  const text = renderDiagnosticText({
    buildId,
    metaBuildId: readMetaBuildId(doc),
    trace: monitor.snapshot(),
    hitStack: sampleCenterStack(doc),
    inputs: readInputFlags(doc, viewer),
    browser: readBrowserContext(globalThis.navigator, globalThis.window),
    loader: readLoaderLine(doc),
    inputTrace: readCameraInputTrace(),
  });
  const body = panel.querySelector?.('[data-ee-globe-diag-body]') || panel;
  body.textContent = text;
  return text;
}

export function mountGlobeDiagnostics({
  doc = globalThis.document,
  monitor,
  buildId = embeddedBuildId(),
} = {}) {
  if (!doc?.createElement || !doc.body) return { destroy() {}, monitor: null };
  publishBuildStamp(doc, buildId);
  const host = monitor || createGlobeGestureMonitor({ doc });
  host.install?.();

  let button = doc.getElementById('ee-globe-diag-toggle');
  if (!button) {
    button = doc.createElement('button');
    button.id = 'ee-globe-diag-toggle';
    button.type = 'button';
    button.dataset.eeGlobeDiag = '1';
    button.textContent = 'DIAG';
    button.setAttribute('aria-controls', 'ee-globe-diag');
    button.setAttribute('aria-expanded', 'false');
    button.title = 'Globe gesture diagnostic. Opening it keeps the last drag or pinch.';
    doc.body.appendChild(button);
  }

  let panel = doc.getElementById('ee-globe-diag');
  if (!panel) {
    panel = doc.createElement('section');
    panel.id = 'ee-globe-diag';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Globe gesture diagnostic');
    const heading = doc.createElement('h2');
    heading.textContent = 'Globe diagnostic';
    const close = doc.createElement('button');
    close.type = 'button';
    close.dataset.eeGlobeDiagClose = '1';
    close.textContent = 'Close';
    const body = doc.createElement('pre');
    body.dataset.eeGlobeDiagBody = '1';
    panel.append(heading, close, body);
    doc.body.appendChild(panel);
  }

  const setOpen = (open) => {
    if (!open) {
      const viewer = globalThis.__godsEyeView?.viewer;
      const before = readInputFlags(doc, viewer);
      const action = restoreCameraInputsUnlessCockpit(viewer, doc, 'diag-close');
      const after = readInputFlags(doc, viewer);
      host.noteDiagClose?.({
        action,
        before,
        after,
        inputTrace: readCameraInputTrace(),
      });
    }
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      const beforeOpen = readLoaderLine(doc);
      const loader = doc.getElementById?.('loading-screen');
      if (loader) releaseLoadingScreen(loader);
      const text = fillDiagnosticPanel(panel, host, doc);
      const body = panel.querySelector?.('[data-ee-globe-diag-body]') || panel;
      if (body && beforeOpen) body.textContent = `LOADER AT OPEN ${beforeOpen}\n${text}`;
      return text;
    }
  };

  const onClick = (event) => {
    const target = event.target;
    if (target?.closest?.('[data-ee-globe-diag], #ee-globe-diag-toggle')) {
      event.preventDefault();
      setOpen(panel.hidden);
      return;
    }
    if (target?.closest?.('[data-ee-globe-diag-close]')) {
      event.preventDefault();
      setOpen(false);
    }
  };
  doc.addEventListener('click', onClick);

  try {
    const params = new URLSearchParams(globalThis.location?.search || '');
    if (params.get('ee_diag') === '1') setOpen(true);
  } catch {
    /* */
  }

  return {
    monitor: host,
    open: () => setOpen(true),
    close: () => setOpen(false),
    destroy() {
      doc.removeEventListener('click', onClick);
      host.destroy?.();
      button.remove?.();
      panel.remove?.();
    },
  };
}

let installed = null;

/** Page entry. Safe to call once from main.js before the globe starts. */
export function installGlobeDiagnostics() {
  if (installed) return installed;
  const buildId = publishBuildStamp();
  installed = mountGlobeDiagnostics({ buildId });
  globalThis.__eeGestureMonitor = installed.monitor;
  return installed;
}

/** Called once the real Cesium viewer exists. */
export function attachDiagnosticViewer(viewer) {
  globalThis.__eeGestureMonitor?.attachViewer?.(viewer);
}
