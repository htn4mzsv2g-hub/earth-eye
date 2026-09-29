/**
 * Owner-safe read-only diagnostics for iPhone globe freeze (no DevTools).
 * Open via MORE → DIAG or ?ee_diag=1. Never includes credentials, secrets,
 * LOGIN_*, API keys, or private config.
 */

export const DIAG_QUERY_PARAM = 'ee_diag';

/** Build / release id inlined at Vite build (safe public metadata). */
export function getBuildId() {
  try {
    const id = import.meta.env?.EE_BUILD_ID;
    if (id && id !== 'undefined') return String(id);
  } catch {
    /* */
  }
  return 'dev';
}

export function getGitSha() {
  try {
    const sha = import.meta.env?.EE_GIT_SHA;
    if (sha && sha !== 'undefined') return String(sha);
  } catch {
    /* */
  }
  return 'unknown';
}

function readNon3dFlags(search = globalThis.location?.search, storage = globalThis.sessionStorage) {
  let query = false;
  let storageFlag = false;
  try {
    const params = new URLSearchParams(
      typeof search === 'string'
        ? search.startsWith('?')
          ? search
          : `?${search}`
        : search || '',
    );
    const q = String(params.get('ee_non3d') || '').toLowerCase();
    query = q === '1' || q === 'true' || q === 'yes';
  } catch {
    /* */
  }
  try {
    storageFlag = storage?.getItem?.('ee:force-non3d') === '1';
  } catch {
    /* */
  }
  return { query, storage: storageFlag };
}

function canvasPointerEvents(doc) {
  if (!doc?.querySelector) return null;
  const canvas = doc.querySelector('#cesiumContainer canvas');
  if (!canvas) return null;
  try {
    return globalThis.getComputedStyle?.(canvas)?.pointerEvents || null;
  } catch {
    return null;
  }
}

function canvasTouchAction(doc) {
  if (!doc?.querySelector) return null;
  const canvas = doc.querySelector('#cesiumContainer canvas');
  if (!canvas) return null;
  try {
    return globalThis.getComputedStyle?.(canvas)?.touchAction || null;
  } catch {
    return null;
  }
}

function readMetaBuild(doc) {
  try {
    return (
      doc?.querySelector?.('meta[name="ee-build-id"]')?.getAttribute?.('content') ||
      null
    );
  } catch {
    return null;
  }
}

function describeElement(el) {
  if (!el || !el.tagName) return null;
  const id = el.id ? `#${el.id}` : '';
  const cls =
    typeof el.className === 'string' && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
      : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 120);
}

function centerPoint(doc) {
  const w = doc?.defaultView || globalThis;
  return {
    x: Math.floor((w.innerWidth || 0) / 2),
    y: Math.floor((w.innerHeight || 0) / 2),
  };
}

/** Describe the top element at viewport center (may include open DIAG panel). */
function topElementAtCenter(doc) {
  try {
    if (!doc?.elementFromPoint) return null;
    const { x, y } = centerPoint(doc);
    return describeElement(doc.elementFromPoint?.(x, y));
  } catch {
    return null;
  }
}

/**
 * Hit-test stack at viewport center for owner freeze triage.
 * Returns up to 6 ancestors as short descriptors.
 */
export function hitTestStackAtCenter(doc = globalThis.document) {
  try {
    if (!doc?.elementsFromPoint && !doc?.elementFromPoint) return [];
    const { x, y } = centerPoint(doc);
    const list =
      typeof doc.elementsFromPoint === 'function'
        ? [...doc.elementsFromPoint(x, y)]
        : [doc.elementFromPoint(x, y)].filter(Boolean);
    return list
      .slice(0, 6)
      .map(describeElement)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isLoaderHit(desc) {
  if (!desc) return false;
  return /loader-content|#loading-screen|loading-screen/i.test(String(desc));
}

function isCanvasHit(desc) {
  if (!desc) return false;
  return /canvas|#cesiumContainer|cesium/i.test(String(desc));
}

function pointAtFraction(doc, fx, fy) {
  const w = doc?.defaultView || globalThis;
  return {
    x: Math.floor((w.innerWidth || 0) * fx),
    y: Math.floor((w.innerHeight || 0) * fy),
  };
}

function topAt(doc, fx, fy) {
  try {
    if (!doc?.elementFromPoint) return null;
    const { x, y } = pointAtFraction(doc, fx, fy);
    return describeElement(doc.elementFromPoint(x, y));
  } catch {
    return null;
  }
}

function countLoaderContent(doc) {
  try {
    return doc?.querySelectorAll?.('.loader-content')?.length ?? 0;
  } catch {
    return 0;
  }
}

/** pe:auto ancestors from canvas up to html (short descriptors). */
function canvasPeAutoAncestors(doc) {
  try {
    const canvas = doc?.querySelector?.('#cesiumContainer canvas');
    if (!canvas) return null;
    const out = [];
    let el = canvas;
    let guard = 0;
    while (el && guard++ < 12) {
      let pe = null;
      try {
        pe = globalThis.getComputedStyle?.(el)?.pointerEvents || null;
      } catch {
        pe = null;
      }
      if (pe && pe !== 'none') out.push(`${describeElement(el)} pe:${pe}`);
      el = el.parentElement;
    }
    return out.length ? out.join(' > ') : 'none';
  } catch {
    return null;
  }
}

/**
 * True when some pe:auto element (not the canvas itself) overlaps the canvas box.
 * Caps at a few candidates for owner paste size.
 */
function peAutoOverlappingCanvas(doc) {
  try {
    const canvas = doc?.querySelector?.('#cesiumContainer canvas');
    if (!canvas?.getBoundingClientRect) return null;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const hits =
      typeof doc.elementsFromPoint === 'function'
        ? [...doc.elementsFromPoint(cx, cy)]
        : [doc.elementFromPoint?.(cx, cy)].filter(Boolean);
    const blockers = [];
    for (const el of hits.slice(0, 8)) {
      if (!el || el === canvas) continue;
      if (el.tagName === 'CANVAS' && el.closest?.('#cesiumContainer')) continue;
      let pe = null;
      try {
        pe = globalThis.getComputedStyle?.(el)?.pointerEvents;
      } catch {
        pe = null;
      }
      if (pe === 'none') continue;
      const desc = describeElement(el);
      if (desc) blockers.push(`${desc} pe:${pe || '?'}`);
    }
    return blockers.length ? blockers.slice(0, 4).join(' | ') : 'none';
  } catch {
    return null;
  }
}

/** Safe camera nudge: measure whether the camera moves after a tiny look delta. */
function probeCameraNudge(viewer) {
  try {
    const cam = viewer?.camera;
    const scene = viewer?.scene;
    if (!cam || !scene) return null;
    const before = {
      h: cam.heading,
      p: cam.pitch,
      r: cam.roll,
      x: cam.positionWC?.x,
      y: cam.positionWC?.y,
      z: cam.positionWC?.z,
    };
    // Tiny, reversible look nudge — does not fly or change tracked entity.
    const delta = 0.0008;
    try {
      cam.setView({
        destination: cam.positionWC,
        orientation: {
          heading: before.h + delta,
          pitch: before.p,
          roll: before.r,
        },
      });
    } catch {
      return 'nudge-failed';
    }
    try {
      scene.requestRender?.();
    } catch {
      /* */
    }
    const afterH = cam.heading;
    const moved =
      Number.isFinite(afterH) && Math.abs(afterH - before.h) > delta * 0.25;
    // Restore prior orientation.
    try {
      cam.setView({
        destination: cam.positionWC,
        orientation: {
          heading: before.h,
          pitch: before.p,
          roll: before.r,
        },
      });
      scene.requestRender?.();
    } catch {
      /* */
    }
    return moved ? 'camera-moves' : 'camera-stuck';
  } catch {
    return null;
  }
}

function lastRenderAgeSec(viewer) {
  try {
    const t =
      viewer?.scene?.frameState?.frameNumber ??
      viewer?.scene?.frameState?.time?.secondsOfDay;
    if (t == null) return null;
    return String(t);
  } catch {
    return null;
  }
}

/** Module-level last post-close probe (panel must not contaminate). */
let lastPostCloseHit = null;
let lastPostCloseStack = [];

export function getLastPostCloseHit() {
  return { hit: lastPostCloseHit, stack: [...lastPostCloseStack] };
}

/**
 * Probe globe hit target AFTER the diagnostics panel is hidden.
 * Owner instruction: panel must not contaminate measurement.
 */
export function probeHitAfterDiagClose(doc = globalThis.document) {
  const stack = hitTestStackAtCenter(doc);
  lastPostCloseStack = stack;
  lastPostCloseHit = stack[0] || topElementAtCenter(doc);
  return getLastPostCloseHit();
}

function webglLost(viewer) {
  try {
    const canvas = viewer?.scene?.canvas;
    if (!canvas) return null;
    const gl =
      canvas.getContext?.('webgl2') ||
      canvas.getContext?.('webgl') ||
      canvas.getContext?.('experimental-webgl');
    if (!gl) return true;
    return Boolean(gl.isContextLost?.());
  } catch {
    return null;
  }
}

/**
 * Snapshot of globe / overlay / input health for the owner diagnostic panel.
 * @param {{ viewer?: object|null, document?: Document }} [opts]
 */
export function collectDiagnostics(opts = {}) {
  const doc = opts.document || globalThis.document || null;
  const html = doc?.documentElement;
  const app = globalThis.window?.__godsEyeView || null;
  const viewer = opts.viewer !== undefined ? opts.viewer : app?.viewer || null;
  const ctl = viewer?.scene?.screenSpaceCameraController || null;
  const non3d = readNon3dFlags();
  const gov = app?.getRenderGovernorDiagnostics?.() || null;
  const scene = viewer?.scene || null;

  return {
    buildId: getBuildId(),
    gitSha: getGitSha(),
    compact: Boolean(html?.classList?.contains('ee-compact')),
    eeOverlay: html?.getAttribute?.('data-ee-overlay') || null,
    canvasPointerEvents: canvasPointerEvents(doc),
    canvasTouchAction: canvasTouchAction(doc),
    metaBuildId: readMetaBuild(doc),
    documentHidden: Boolean(doc?.hidden),
    useDefaultRenderLoop:
      viewer && 'useDefaultRenderLoop' in viewer
        ? Boolean(viewer.useDefaultRenderLoop)
        : null,

    non3dQuery: non3d.query,
    non3dStorage: non3d.storage,
    graphicsFailed: Boolean(
      app?.graphicsFailed || html?.classList?.contains('ee-graphics-failed'),
    ),
    viewerPresent: Boolean(viewer && !viewer.isDestroyed?.()),
    enableInputs: ctl ? Boolean(ctl.enableInputs) : null,
    enableRotate: ctl ? Boolean(ctl.enableRotate) : null,
    enableTranslate: ctl ? Boolean(ctl.enableTranslate) : null,
    enableZoom: ctl ? Boolean(ctl.enableZoom) : null,
    enableTilt: ctl ? Boolean(ctl.enableTilt) : null,
    requestRenderMode:
      scene && 'requestRenderMode' in scene
        ? Boolean(scene.requestRenderMode)
        : null,
    renderGovernor: gov
      ? `${gov.mode || '?'} holds=${(gov.holds || []).join(',') || 'none'}`
      : null,
    webglContextLost: webglLost(viewer),
    topElementCenter: topElementAtCenter(doc),
    postCloseHit: lastPostCloseHit,
    postCloseStack: lastPostCloseStack.length
      ? lastPostCloseStack.join(' > ')
      : null,
    loadingScreenPresent: Boolean(doc?.getElementById?.('loading-screen')),
    loaderContentCount: countLoaderContent(doc),
    topHitCenter: topAt(doc, 0.5, 0.5),
    topHit25: topAt(doc, 0.5, 0.25),
    topHit75: topAt(doc, 0.5, 0.75),
    canvasPeAutoAncestors: canvasPeAutoAncestors(doc),
    peAutoOverCanvas: peAutoOverlappingCanvas(doc),
    cameraNudge: probeCameraNudge(viewer),
    frameNumber: lastRenderAgeSec(viewer),
    cockpitActive: Boolean(doc?.body?.classList?.contains('cockpit-mode')),
    trackedEntity: Boolean(viewer?.trackedEntity),
    followLike: Boolean(
      viewer?.trackedEntity || doc?.body?.classList?.contains('cockpit-mode'),
    ),
    sheetHostOrphans: [
      'left-panel-stack',
      'right-context-rail',
      'command-dock',
    ]
      .filter((id) => doc?.getElementById?.(id)?.classList?.contains('ee-sheet-host'))
      .join(',') || null,
  };
}

/** Healthy vs frozen quick read for the owner. */
export function diagnoseHealth(snap) {
  if (!snap) return { ok: false, note: 'no snapshot' };
  const problems = [];
  if (snap.graphicsFailed) problems.push('graphicsFailed / non-3D path');
  if (snap.non3dQuery) problems.push('?ee_non3d=1 deliberate');
  if (snap.non3dStorage) problems.push('ee:force-non3d still in sessionStorage');
  if (snap.eeOverlay) problems.push('data-ee-overlay stuck (canvas blocked)');
  if (snap.canvasPointerEvents === 'none')
    problems.push('canvas pointer-events:none');
  if (snap.useDefaultRenderLoop === false && !snap.documentHidden)
    problems.push('useDefaultRenderLoop=false while visible (render loop stopped)');
  if (snap.documentHidden) problems.push('document.hidden=true');

  if (snap.enableInputs === false && !snap.cockpitActive)
    problems.push('enableInputs=false (not cockpit)');
  if (snap.webglContextLost) problems.push('WebGL context lost');
  if (!snap.viewerPresent && !snap.graphicsFailed)
    problems.push('Cesium viewer missing');
  if (snap.sheetHostOrphans)
    problems.push(`orphan sheet-host: ${snap.sheetHostOrphans}`);
  if (snap.followLike && snap.enableInputs === false)
    problems.push('follow/cockpit holding inputs');
  if (snap.loadingScreenPresent)
    problems.push('loading-screen still in DOM');
  if ((snap.loaderContentCount || 0) > 0)
    problems.push(`.loader-content count=${snap.loaderContentCount}`);
  if (
    isLoaderHit(snap.postCloseHit) ||
    isLoaderHit(snap.topElementCenter) ||
    isLoaderHit(snap.topHitCenter) ||
    isLoaderHit(snap.topHit25) ||
    isLoaderHit(snap.topHit75)
  )
    problems.push('loader-content still hit-testable (startup cover blocking)');
  if (snap.cameraNudge === 'camera-stuck')
    problems.push('camera nudge stuck (render/camera frozen?)');
  if (snap.peAutoOverCanvas && snap.peAutoOverCanvas !== 'none') {
    if (
      isLoaderHit(snap.peAutoOverCanvas) ||
      /loading-screen|loader-content|ee-sheet|overlay/i.test(
        String(snap.peAutoOverCanvas),
      )
    )
      problems.push(`pe:auto over canvas: ${snap.peAutoOverCanvas}`);
  }
  return {
    ok: problems.length === 0,
    // Do not claim drag works until owner verifies gesture response on device.
    note: problems.length
      ? problems.join('; ')
      : 'input flags enabled — gesture response unverified',
    problems,
  };
}

function row(label, value, warn = false) {
  const v = value === null || value === undefined ? '—' : String(value);
  const tone = warn ? ' data-tone="warn"' : '';
  return `<div class="ee-diag-row"${tone}><span>${label}</span><b>${escapeHtml(v)}</b></div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Mount or refresh the floating diagnostics card.
 * @param {{ getSnapshot?: () => object, document?: Document, onRestore?: () => void }} [opts]
 */
export function mountDiagnosticsPanel(opts = {}) {
  const doc = opts.document || globalThis.document;
  const getSnapshot = opts.getSnapshot || (() => collectDiagnostics());
  let root = doc.getElementById('ee-diagnostics');
  if (!root) {
    root = doc.createElement('aside');
    root.id = 'ee-diagnostics';
    root.className = 'ee-diagnostics';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Earth Eye diagnostics');
    doc.body.appendChild(root);
  }

  const render = () => {
    const snap = getSnapshot();
    const health = diagnoseHealth(snap);
    root.innerHTML = `
      <header class="ee-diag-head">
        <h2>DIAGNOSTICS</h2>
        <button type="button" class="ee-diag-close" aria-label="Close diagnostics">✕</button>
      </header>
      <p class="ee-diag-health" data-ok="${health.ok ? '1' : '0'}">${escapeHtml(health.note)}</p>
      <div class="ee-diag-grid">
        ${row('build', snap.buildId)}
        ${row('git', snap.gitSha)}
        ${row('data-ee-overlay', snap.eeOverlay || 'none', Boolean(snap.eeOverlay))}
        ${row('canvas pointer-events', snap.canvasPointerEvents, snap.canvasPointerEvents === 'none')}
        ${row('canvas touch-action', snap.canvasTouchAction)}
        ${row('meta build', snap.metaBuildId || '—')}
        ${row('document.hidden', snap.documentHidden, snap.documentHidden)}
        ${row('useDefaultRenderLoop', snap.useDefaultRenderLoop, snap.useDefaultRenderLoop === false && !snap.documentHidden)}
        ${row('non3d query', snap.non3dQuery)}
        ${row('non3d storage', snap.non3dStorage, snap.non3dStorage)}
        ${row('graphicsFailed', snap.graphicsFailed, snap.graphicsFailed)}
        ${row('viewer', snap.viewerPresent)}
        ${row('enableInputs', snap.enableInputs, snap.enableInputs === false && !snap.cockpitActive)}
        ${row('enableRotate', snap.enableRotate)}
        ${row('enableTranslate', snap.enableTranslate)}
        ${row('enableZoom', snap.enableZoom)}
        ${row('enableTilt', snap.enableTilt)}
        ${row('requestRenderMode', snap.requestRenderMode)}
        ${row('renderGovernor', snap.renderGovernor)}
        ${row('webgl lost', snap.webglContextLost, snap.webglContextLost === true)}
        ${row('top @ center (panel open)', snap.topElementCenter, isLoaderHit(snap.topElementCenter))}
        ${row('top @ 50/50', snap.topHitCenter, isLoaderHit(snap.topHitCenter))}
        ${row('top @ 50/25', snap.topHit25, isLoaderHit(snap.topHit25))}
        ${row('top @ 50/75', snap.topHit75, isLoaderHit(snap.topHit75))}
        ${row('post-close hit', snap.postCloseHit || '(close DIAG to probe)', isLoaderHit(snap.postCloseHit))}
        ${row('post-close stack', snap.postCloseStack || '—', isLoaderHit(snap.postCloseStack))}
        ${row('loading-screen in DOM', snap.loadingScreenPresent, snap.loadingScreenPresent)}
        ${row('.loader-content count', snap.loaderContentCount, (snap.loaderContentCount || 0) > 0)}
        ${row('canvas pe:auto ancestors', snap.canvasPeAutoAncestors || '—')}
        ${row('pe:auto over canvas', snap.peAutoOverCanvas || '—', snap.peAutoOverCanvas && snap.peAutoOverCanvas !== 'none' && isLoaderHit(snap.peAutoOverCanvas))}
        ${row('camera nudge', snap.cameraNudge, snap.cameraNudge === 'camera-stuck')}
        ${row('frameNumber', snap.frameNumber)}
        ${row('cockpit', snap.cockpitActive)}
        ${row('trackedEntity', snap.trackedEntity)}
        ${row('orphan sheet-host', snap.sheetHostOrphans || 'none', Boolean(snap.sheetHostOrphans))}
      </div>
      <div class="ee-diag-actions">
        <button type="button" data-ee-diag="refresh">Refresh</button>
        <button type="button" data-ee-diag="restore">Restore gestures</button>
        <button type="button" data-ee-diag="close">Close</button>
      </div>
      <p class="ee-diag-hint">Input flags enabled — gesture response unverified until you drag after Close. Confirm build matches tip (+ meta build). Expect post-close hit / top@50/50 = canvas (not loader-content); touch-action=none; useDefaultRenderLoop=true. Paste: build, meta build, loading-screen, loader-content count, top@50/50, pe:auto over canvas, camera nudge, enableInputs, requestRenderMode, useDefaultRenderLoop, document.hidden.</p>
    `;
    root.hidden = false;
  };

  const onClick = (event) => {
    const btn = event.target.closest('[data-ee-diag], .ee-diag-close');
    if (!btn) return;
    const action =
      btn.getAttribute('data-ee-diag') ||
      (btn.classList.contains('ee-diag-close') ? 'close' : '');
    if (action === 'close') {
      root.hidden = true;
      // Probe AFTER panel is hidden so DIAG does not contaminate the hit target.
      const runProbe = () => {
        probeHitAfterDiagClose(doc);
      };
      try {
        const raf = globalThis.requestAnimationFrame;
        if (typeof raf === 'function') {
          raf(() => raf(runProbe));
        } else {
          setTimeout(runProbe, 32);
        }
      } catch {
        try {
          runProbe();
        } catch {
          /* */
        }
      }
      return;
    }
    if (action === 'refresh') {
      render();
      return;
    }
    if (action === 'restore') {
      opts.onRestore?.();
      try {
        // Dynamic import avoided — purge via custom event handled in console,
        // plus direct DOM purge here for the startup cover.
        const cover = doc.getElementById?.('loading-screen');
        cover?.remove?.();
        for (const n of doc.querySelectorAll?.('.loader-content') || []) {
          const host = n.closest?.('#loading-screen') || n;
          host.remove?.();
        }
      } catch {
        /* */
      }
      globalThis.window?.dispatchEvent?.(
        new CustomEvent('ee:globe-gestures-restore'),
      );
      // Also ask mobile shell to clear sticky overlay if present.
      globalThis.window?.dispatchEvent?.(
        new CustomEvent('ee:force-overlay-clear'),
      );
      render();
    }
  };
  root.onclick = onClick;
  render();
  return {
    refresh: render,
    close: () => {
      root.hidden = true;
    },
    el: root,
  };
}

export function shouldAutoOpenDiagnostics(
  search = globalThis.location?.search,
) {
  try {
    const params = new URLSearchParams(
      typeof search === 'string'
        ? search.startsWith('?')
          ? search
          : `?${search}`
        : search || '',
    );
    const q = String(params.get(DIAG_QUERY_PARAM) || '').toLowerCase();
    return q === '1' || q === 'true' || q === 'yes';
  } catch {
    return false;
  }
}
