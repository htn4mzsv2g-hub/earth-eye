/**
 * Keep the Cesium globe interactive on mobile Safari after startup chrome,
 * overlay close, BFCache restore, and while the user is dragging.
 *
 * Failure modes this closes (iPhone "still image" / no-drag):
 * - enableInputs left false after flyTo / overlay / share restore
 * - sticky #loading-screen / data-ee-overlay leaving canvas pe:none
 * - requestRenderMode idle: ensure a continuous-render hold while the finger
 *   is down so camera controller updates paint every frame
 * - document.hidden / useDefaultRenderLoop falsely suspended on iOS
 */

import {
  holdContinuousRender,
  releaseContinuousRender,
  governorRequestRender,
} from '../renderGovernor.js';
import { purgeLoadingCover } from './graphicsRecovery.js';

export const CAMERA_INTERACT_HOLD_ID = 'camera-interact';

/**
 * Idempotent: restore camera controller inputs + canvas hit-testing + one frame.
 * Skips enableInputs when cockpit-mode is active (cockpit owns the controller).
 * @param {{
 *   viewer?: object | null,
 *   document?: Document,
 *   purgeCover?: boolean,
 * }} [opts]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function ensureGlobeInteractive({
  viewer = globalThis.window?.__godsEyeView?.viewer ??
    globalThis.window?.__atlasEye?.app?.viewer ??
    null,
  document: doc = globalThis.document,
  purgeCover = true,
} = {}) {
  try {
    if (purgeCover) purgeLoadingCover(doc);
  } catch {
    /* */
  }

  try {
    const html = doc?.documentElement;
    if (html && !doc?.querySelector?.('.ee-sheet-host, #ee-cam-viewer:not([hidden])')) {
      // Do not clear overlay while a sheet is genuinely open — mobileShell owns that.
      // Only clear when no sheet-host remains (orphan sticky attribute).
      if (
        html.hasAttribute?.('data-ee-overlay') &&
        !doc.querySelector?.('.ee-sheet-host')
      ) {
        html.removeAttribute('data-ee-overlay');
        try {
          delete html.dataset.eeOverlay;
        } catch {
          /* */
        }
      }
    }
  } catch {
    /* */
  }

  try {
    const canvas = doc?.querySelector?.('#cesiumContainer canvas');
    if (canvas?.style) {
      canvas.style.pointerEvents = 'auto';
      canvas.style.touchAction = 'none';
    }
    const container = doc?.getElementById?.('cesiumContainer');
    if (container?.style) {
      container.style.touchAction = 'none';
    }
  } catch {
    /* */
  }

  const cockpit = Boolean(doc?.body?.classList?.contains('cockpit-mode'));
  try {
    const ctl = viewer?.scene?.screenSpaceCameraController;
    if (ctl && !cockpit) {
      ctl.enableInputs = true;
      if ('enableRotate' in ctl) ctl.enableRotate = true;
      if ('enableTranslate' in ctl) ctl.enableTranslate = true;
      if ('enableZoom' in ctl) ctl.enableZoom = true;
      if ('enableTilt' in ctl) ctl.enableTilt = true;
      if ('enableLook' in ctl) ctl.enableLook = true;
    }
  } catch {
    /* */
  }

  try {
    if (viewer && viewer.useDefaultRenderLoop === false && !doc?.hidden) {
      viewer.useDefaultRenderLoop = true;
    }
  } catch {
    /* */
  }

  try {
    governorRequestRender('ensure-globe-interactive');
    viewer?.scene?.requestRender?.();
  } catch {
    /* */
  }

  return { ok: true };
}

/**
 * While a pointer is down on the Cesium canvas, hold continuous render so
 * requestRenderMode cannot leave a still frame during drag/pinch on iOS.
 * @param {object} viewer
 * @param {{ signal?: AbortSignal, document?: Document }} [opts]
 * @returns {() => void} disposer
 */
export function installCameraInteractRenderHold(
  viewer,
  { signal, document: doc = globalThis.document } = {},
) {
  const canvas = viewer?.canvas || doc?.querySelector?.('#cesiumContainer canvas');
  if (!canvas?.addEventListener) return () => {};

  let down = false;
  const onDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    down = true;
    holdContinuousRender(CAMERA_INTERACT_HOLD_ID);
    try {
      viewer?.scene?.requestRender?.();
    } catch {
      /* */
    }
  };
  const onMove = () => {
    if (!down) return;
    try {
      viewer?.scene?.requestRender?.();
    } catch {
      /* */
    }
  };
  const onUp = () => {
    if (!down) return;
    down = false;
    releaseContinuousRender(CAMERA_INTERACT_HOLD_ID);
    try {
      viewer?.scene?.requestRender?.();
    } catch {
      /* */
    }
  };

  const opts = { signal, passive: true, capture: true };
  canvas.addEventListener('pointerdown', onDown, opts);
  canvas.addEventListener('pointermove', onMove, opts);
  // Window-level so release still fires if the finger leaves the canvas.
  const win = doc?.defaultView || globalThis.window;
  win?.addEventListener?.('pointerup', onUp, opts);
  win?.addEventListener?.('pointercancel', onUp, opts);
  // iOS Safari legacy touch path (some WKWebView builds omit PointerEvent).
  canvas.addEventListener('touchstart', onDown, opts);
  canvas.addEventListener('touchmove', onMove, opts);
  win?.addEventListener?.('touchend', onUp, opts);
  win?.addEventListener?.('touchcancel', onUp, opts);

  const dispose = () => {
    onUp();
    try {
      canvas.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('pointermove', onMove, true);
      canvas.removeEventListener('touchstart', onDown, true);
      canvas.removeEventListener('touchmove', onMove, true);
      win?.removeEventListener?.('pointerup', onUp, true);
      win?.removeEventListener?.('pointercancel', onUp, true);
      win?.removeEventListener?.('touchend', onUp, true);
      win?.removeEventListener?.('touchcancel', onUp, true);
    } catch {
      /* */
    }
    releaseContinuousRender(CAMERA_INTERACT_HOLD_ID);
  };
  signal?.addEventListener?.('abort', dispose, { once: true });
  return dispose;
}

/**
 * Re-enable the Cesium render loop if iOS left document.hidden sticky or
 * useDefaultRenderLoop false while the tab is actually visible.
 * @param {object} viewer
 * @param {{ signal?: AbortSignal, document?: Document, window?: Window }} [opts]
 * @returns {() => void}
 */
export function installRenderLoopGuard(
  viewer,
  {
    signal,
    document: doc = globalThis.document,
    window: win = globalThis.window,
  } = {},
) {
  if (!viewer || !win?.addEventListener) return () => {};
  const run = () => {
    try {
      if (!doc?.hidden && viewer.useDefaultRenderLoop === false) {
        viewer.useDefaultRenderLoop = true;
      }
      ensureGlobeInteractive({ viewer, document: doc });
    } catch {
      /* */
    }
  };
  win.addEventListener('pageshow', run, { signal });
  win.addEventListener('focus', run, { signal });
  doc?.addEventListener?.(
    'visibilitychange',
    () => {
      if (!doc.hidden) run();
    },
    { signal },
  );
  try {
    setTimeout(run, 0);
    setTimeout(run, 1500);
  } catch {
    /* */
  }
  return run;
}
