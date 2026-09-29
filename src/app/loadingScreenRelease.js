/**
 * Take the startup loader out of hit testing.
 *
 * Owner DIAG (Fly v60, physical iPhone, embedded browser): overlay none,
 * canvas pointer-events auto, camera input flags true, WebGL context not
 * lost, and the top element at the viewport center was `div.loader-content`.
 * Touches never reached the Cesium canvas (class A).
 *
 * `#loading-screen` is position:fixed; inset:0; z-index:1000. The old
 * dismiss only added `.hidden`, which transitions `visibility` for 0.8s.
 * Until that transition finishes — and embedded WebKit often never finishes
 * it while the wordmark SVG animates (`will-change: transform` inside the
 * image) — the used visibility stays `visible`. A descendant with an
 * explicit pointer-events value is then a hit target even when the parent
 * sets pointer-events:none. The pre-audit loader was a static logo; the
 * animated wordmark made that stuck overlay the center hit target.
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
export function loaderInterceptsPointer(loadingScreen) {
  if (!loadingScreen) return false;
  const style = loadingScreen.style || {};
  const display = String(style.display || '').toLowerCase();
  const visibility = String(style.visibility || '').toLowerCase();
  if (display === 'none' || visibility === 'hidden') return false;
  const content = loadingScreen.querySelector?.('.loader-content');
  return Boolean(content);
}
