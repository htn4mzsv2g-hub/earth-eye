/**
 * Take the startup loader out of hit testing.
 *
 * Owner DIAG (Fly v64, physical iPhone, BUILD MATCH git-825a59d): the live
 * `#loading-screen` still had its initial CSS — pointer-events auto,
 * visibility visible, display flex, opacity 1, z-index 1000 — and the center
 * hit was `div.loader-content`. That is an unreleased node. The previous
 * dismiss waited on share restoration, so a flyTo that never completed left
 * the overlay in place. Release does not wait on that promise.
 *
 * Release applies display:none and visibility:hidden immediately (inline,
 * important when the CSSOM allows it) and marks the node inert. Class
 * `.hidden` remains so the stylesheet rule is the same contract.
 */

function paint(style, prop, value) {
  if (!style) return;
  if (typeof style.setProperty === 'function') {
    try {
      style.setProperty(prop, value, 'important');
      return;
    } catch {
      /* CSSOM rejected the priority; fall through to a plain write */
    }
  }
  const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  style[camel] = value;
}

/**
 * @param {HTMLElement|null|undefined} loadingScreen
 * @returns {void}
 */
export function releaseLoadingScreen(loadingScreen) {
  if (!loadingScreen) return;
  loadingScreen.classList?.add?.('hidden');
  if (typeof loadingScreen.setAttribute === 'function') {
    loadingScreen.setAttribute('aria-hidden', 'true');
    loadingScreen.setAttribute('data-ee-loader-released', '1');
  }
  try {
    loadingScreen.inert = true;
  } catch {
    /* older DOM shims */
  }
  const style = loadingScreen.style;
  paint(style, 'display', 'none');
  paint(style, 'visibility', 'hidden');
  paint(style, 'pointer-events', 'none');
  const content = loadingScreen.querySelector?.('.loader-content');
  if (content) {
    paint(content.style, 'pointer-events', 'none');
    paint(content.style, 'visibility', 'hidden');
  }
  const status = loadingScreen.querySelector?.('.loader-status');
  if (status?.style) {
    status.style.animation = 'none';
    status.style.color = '';
  }
  try {
    const animations = loadingScreen.getAnimations?.({ subtree: true }) || [];
    for (const animation of animations) animation.cancel?.();
  } catch {
    /* no Web Animations API */
  }
}

/**
 * True when the loader would still win a center hit test.
 * Models the v60 failure: class `.hidden` alone leaves visibility in its
 * transition (still visible) and the loader-content subtree stays on top.
 * Inline display:none or visibility:hidden means it is gone.
 * @param {HTMLElement|null|undefined} loadingScreen
 */
/**
 * Release again when the live node is still the startup overlay.
 * Covers a replacement node and a release that was skipped.
 * @param {Document} [doc]
 * @returns {boolean} True when a release was applied.
 */
export function ensureLoaderReleased(doc = globalThis.document) {
  const loader = doc?.getElementById?.('loading-screen');
  if (!loader) return false;
  let computed = null;
  try {
    computed = doc.defaultView?.getComputedStyle?.(loader) || null;
  } catch {
    computed = null;
  }
  if (!loaderInterceptsPointer(loader, computed || undefined)) return false;
  releaseLoadingScreen(loader);
  return true;
}

export function loaderInterceptsPointer(loadingScreen, computed) {
  if (!loadingScreen) return false;
  const style = computed || loadingScreen.style || {};
  const display = String(style.display || '').toLowerCase();
  const visibility = String(style.visibility || '').toLowerCase();
  if (display === 'none' || visibility === 'hidden') return false;
  const content = loadingScreen.querySelector?.('.loader-content');
  return Boolean(content);
}
