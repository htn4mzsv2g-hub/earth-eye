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

function readComputed(doc, node) {
  try {
    return doc?.defaultView?.getComputedStyle?.(node) || null;
  } catch {
    return null;
  }
}

function noteRelease(loadingScreen, reason, at) {
  try {
    globalThis.__eeLoaderRelease = {
      at,
      reason,
      connected: loadingScreen?.isConnected !== false,
      detached: loadingScreen?.getAttribute?.('data-ee-loader-detached') === '1',
    };
  } catch {
    /* non-DOM hosts */
  }
}

/**
 * Stamp the live node, then hide it. `data-ee-loader-released-at` is the
 * proof that release ran. A later clear of class or inline style does not
 * erase that stamp.
 * @param {HTMLElement|null|undefined} loadingScreen
 * @param {{ reason?: string, now?: () => number }} [options]
 * @returns {void}
 */
export function releaseLoadingScreen(loadingScreen, { reason = 'release', now = () => Date.now() } = {}) {
  if (!loadingScreen) return;
  const at = now();
  loadingScreen.classList?.add?.('hidden');
  if (typeof loadingScreen.setAttribute === 'function') {
    loadingScreen.setAttribute('aria-hidden', 'true');
    loadingScreen.setAttribute('data-ee-loader-released', '1');
    loadingScreen.setAttribute('data-ee-loader-released-at', String(at));
  }
  noteRelease(loadingScreen, reason, at);
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
 * A stamped loader that is still the center hit target has had its hide
 * cleared or ignored. Pull that node out and leave an empty inert stand-in
 * so `.loader-content` cannot win another hit test.
 * @param {HTMLElement} loader
 * @param {Document} doc
 */
function detachStampedLoader(loader, doc) {
  const at = loader.getAttribute?.('data-ee-loader-released-at') || String(Date.now());
  const parent = loader.parentElement || loader.parentNode;
  const placeholder = doc?.createElement?.('div');
  if (placeholder && parent && typeof parent.replaceChild === 'function') {
    placeholder.id = 'loading-screen';
    placeholder.className = 'hidden';
    try {
      placeholder.inert = true;
    } catch {
      /* older DOM shims */
    }
    placeholder.setAttribute?.('aria-hidden', 'true');
    placeholder.setAttribute?.('data-ee-loader-released', '1');
    placeholder.setAttribute?.('data-ee-loader-released-at', at);
    placeholder.setAttribute?.('data-ee-loader-detached', '1');
    paint(placeholder.style, 'display', 'none');
    paint(placeholder.style, 'visibility', 'hidden');
    paint(placeholder.style, 'pointer-events', 'none');
    try {
      loader.removeAttribute?.('id');
    } catch {
      /* keep going; replaceChild still drops it from the parent */
    }
    parent.replaceChild(placeholder, loader);
    noteRelease(placeholder, 'detached', Number(at) || Date.now());
    return;
  }
  if (typeof loader.replaceChildren === 'function') loader.replaceChildren();
  else if (Array.isArray(loader.children)) loader.children.length = 0;
  loader.classList?.add?.('hidden');
  try {
    loader.inert = true;
  } catch {
    /* older DOM shims */
  }
  loader.setAttribute?.('data-ee-loader-detached', '1');
  paint(loader.style, 'display', 'none');
  paint(loader.style, 'visibility', 'hidden');
  paint(loader.style, 'pointer-events', 'none');
  noteRelease(loader, 'detached', Number(at) || Date.now());
}

/**
 * Release again when the live node is still the startup overlay.
 * The first call stamps and hides. If that stamp is already present and the
 * node still intercepts — styles cleared, class removed, or the hide ignored —
 * the node is replaced with an empty inert element.
 * @param {Document} [doc]
 * @returns {boolean} True when a release or detach was applied.
 */
export function ensureLoaderReleased(doc = globalThis.document) {
  const loader = doc?.getElementById?.('loading-screen');
  if (!loader) return false;
  const computed = readComputed(doc, loader);
  if (!loaderInterceptsPointer(loader, computed || undefined)) return false;
  const stamped = loader.getAttribute?.('data-ee-loader-released') === '1';
  if (stamped) {
    detachStampedLoader(loader, doc);
    return true;
  }
  releaseLoadingScreen(loader, { reason: 'ensure' });
  const live = doc.getElementById?.('loading-screen') || loader;
  const after = readComputed(doc, live);
  if (loaderInterceptsPointer(live, after || undefined)) detachStampedLoader(live, doc);
  return true;
}

/**
 * Re-apply release when the page is shown again. Capture is document-level;
 * these listeners cover a loader that was put back after the startup cap.
 * @param {Document} [doc]
 * @param {Window} [win]
 * @returns {() => void}
 */
export function installLoaderReleaseGuards(doc = globalThis.document, win = doc?.defaultView || globalThis.window) {
  if (!doc?.addEventListener || doc.__eeLoaderGuards) return () => {};
  doc.__eeLoaderGuards = true;
  const onShow = () => {
    ensureLoaderReleased(doc);
  };
  doc.addEventListener('visibilitychange', onShow);
  win?.addEventListener?.('pageshow', onShow);
  win?.addEventListener?.('focus', onShow);
  return () => {
    doc.__eeLoaderGuards = false;
    doc.removeEventListener?.('visibilitychange', onShow);
    win?.removeEventListener?.('pageshow', onShow);
    win?.removeEventListener?.('focus', onShow);
  };
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
