/**
 * Earth Eye mobile console (DOM wiring for src/atlas/mobilePolicy.js).
 *
 * Adds `html.ee-compact` on phones (portrait and landscape) and, only there:
 *   - bottom tabs GLOBE · TRACK · CAMERAS · ANALYST · MORE
 *   - ASK EARTH EYE expand (command bar collapsed by default)
 *   - slide-up sheets with PEEK/HALF/FULL heights; floating NORTH/TILT
 *   - keys live under MORE → KEYS / Sources (no always-on KEYS pill)
 * Upstream panels are never moved or re-created: the sheet is their existing
 * rail shown as a bottom sheet with every sibling hidden, and the upstream
 * owner opens/collapses them through `set_panel_open`. Desktop gets none of
 * this (every rule in mobile.css is scoped under html.ee-compact).
 */
import {
  COMPACT_MEDIA_QUERY,
  MOBILE_HUD_KEY,
  MOBILE_TAB_SHEETS,
  findSheet,
  keyStatusSummary,
  nextSheet,
  shouldCloseOnSwipe,
  nextSheetHeight,
} from './mobilePolicy.js';
import './mobile.css';

const ICONS = {
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  track:
    '<path d="M4 18V6M4 18l6-4 5 3 5-7"/><circle cx="20" cy="8" r="1.8"/>',
  layers:
    '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  scenes:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/>',
  display:
    '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/>',
  cctv: '<path d="M3 7h11l3 3v4l-3 3H3Z"/><path d="m17 11 4-2v6l-4-2"/><circle cx="8" cy="12" r="2"/>',
  context: '<circle cx="12" cy="12" r="8"/><path d="M12 8v1M12 11v5"/>',
  explore: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
  analyst: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root - #atlas-console.
 * @param {(name:string,args:object)=>Promise<any>} o.runAction
 * @param {() => void} o.closeAtlasPanel
 * @param {() => boolean} o.isAtlasPanelOpen
 * @param {() => Promise<object|null>} o.fetchStatus - provider-status JSON.
 * @param {ReadonlyArray<object>} o.providerGroups
 * @param {AbortSignal} [o.signal]
 */
export function initMobileShell({
  root,
  runAction,
  closeAtlasPanel,
  isAtlasPanelOpen,
  atlasPanelId = () => null,
  openAtlasPanel = () => {},
  isViewerOpen = () => false,
  closeViewer = () => false,
  fetchStatus,
  providerGroups,
  signal,
}) {
  const html = document.documentElement;
  const media = window.matchMedia?.(COMPACT_MEDIA_QUERY) || null;
  let openId = null;
  let host = null;
  let panel = null;
  let panelSeenOpen = false;
  let classObserver = null;

  // Keys live under MORE → KEYS (no always-on header pill). Keep a hidden
  // badge node so refreshKeys can update tone for Sources honesty if needed.
  const keyBadge = el(`
    <button type="button" id="ee-key-status" data-atlas-open="keys" data-tone="unknown" hidden
      aria-label="Provider keys: checking. Open Provider Settings." title="Provider keys (set / total)">
      <svg class="ee-key-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/></svg>
      <b class="ee-key-count">…</b><small aria-hidden="true">KEYS</small>
    </button>`);
  root.appendChild(keyBadge);
  async function refreshKeys() {
    const status = await fetchStatus().catch(() => null);
    const summary = keyStatusSummary(status?.vars ?? null, providerGroups);
    keyBadge.dataset.tone = summary.tone;
    keyBadge.querySelector('.ee-key-count').textContent = summary.label;
    keyBadge.setAttribute('aria-label', summary.ariaLabel);
  }
  void refreshKeys();

  // ----------------------------------------------------------- tab bar
  const tabbar = el(`
    <nav id="ee-tabbar" aria-label="Earth Eye panels">
      ${MOBILE_TAB_SHEETS.map(
        (s) =>
          `<button type="button" data-ee-sheet="${s.id}" aria-pressed="false" aria-controls="${s.panelId}">${icon(s.id)}<b>${s.label}</b></button>`,
      ).join('')}
      <button type="button" data-ee-more aria-pressed="false" aria-controls="atlas-dock">${icon('more')}<b>MORE</b></button>
    </nav>`);
  root.appendChild(tabbar);

  // ASK EARTH EYE — expands the command bar; collapsed by default on compact.
  const askBtn = el(`
    <button type="button" id="ee-ask-toggle" aria-expanded="false" aria-controls="atlas-command-bar"
      title="Ask Earth Eye">ASK<span>EARTH EYE</span></button>`);
  root.appendChild(askBtn);
  function setAskOpen(open) {
    html.classList.toggle('ee-ask-open', open);
    askBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      const input = root.querySelector('#atlas-command-input');
      requestAnimationFrame(() => input?.focus?.());
    }
  }
  askBtn.addEventListener('click', () => {
    setAskOpen(!html.classList.contains('ee-ask-open'));
    syncHeights();
  }, { signal });

  // NORTH / TILT float on the globe (not buried in MORE).
  const compass = el(`
    <div id="ee-compass" role="toolbar" aria-label="Globe orientation">
      <button type="button" data-atlas-action="north" title="North up">N</button>
      <button type="button" data-atlas-action="tilt" title="Tilt / top-down">TILT</button>
      <button type="button" data-atlas-action="globe" title="Reset globe view">GLOBE</button>
    </div>`);
  root.appendChild(compass);

  // ------------------------------------------------------ sheet header
  const sheetBar = el(`
    <div id="ee-sheet-bar" role="toolbar" aria-label="Open panel" hidden>
      <button type="button" class="ee-sheet-handle" aria-label="Close panel (or drag down)"><span></span></button>
      <h2 id="ee-sheet-title">—</h2>
      <button type="button" class="ee-sheet-close" aria-label="Close panel">✕</button>
    </div>`);
  root.appendChild(sheetBar);
  const sheetTitle = sheetBar.querySelector('#ee-sheet-title');
  let sheetHeight = 'half';
  function applySheetHeight(mode) {
    sheetHeight = mode === 'peek' || mode === 'full' || mode === 'half' ? mode : 'half';
    html.dataset.eeSheetHeight = sheetHeight;
    sheetBar.dataset.height = sheetHeight;
  }
  applySheetHeight('half');

  // Heights drive the sheet header position and keep the credit line above
  // whatever is open (the attribution must stay visible).
  // Coalesce attribute/resize churn into one rAF — repeated hidden toggles
  // were queuing many syncHeights on iPhone and competing with the globe.
  let heightFrame = 0;
  const scheduleHeights = () => {
    if (heightFrame) return;
    heightFrame = requestAnimationFrame(() => {
      heightFrame = 0;
      syncHeights();
    });
  };
  const resize =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(scheduleHeights)
      : null;
  function overlayEl() {
    if (host) return host;
    if (isAtlasPanelOpen()) return document.getElementById('atlas-panel');
    if (root.dataset.dockOpen === 'true')
      return document.getElementById('atlas-dock');
    if (isViewerOpen()) return document.getElementById('ee-cam-viewer');
    return null;
  }
  let observed = null;
  // Globe interaction must come back on EVERY close path (spec §5), including
  // ones that bypass this shell (upstream collapse buttons, a viewer closed
  // after a media error, Escape handled elsewhere): any change to the
  // overlays' visibility re-syncs the overlay flag that gates the canvas.
  if (typeof MutationObserver === 'function') {
    const vis = new MutationObserver(scheduleHeights);
    const watch = () => {
      for (const id of ['atlas-panel', 'ee-cam-viewer']) {
        const n = document.getElementById(id);
        if (n && !n.dataset.eeVisWatch) {
          n.dataset.eeVisWatch = '1';
          vis.observe(n, { attributes: true, attributeFilter: ['hidden'] });
        }
      }
    };
    vis.observe(root, {
      attributes: true,
      attributeFilter: ['data-dock-open'],
    });
    watch();
    setTimeout(watch, 1500);
    signal?.addEventListener('abort', () => vis.disconnect(), { once: true });
  }
  function syncHeights() {
    const target = overlayEl();
    if (target !== observed) {
      if (observed) resize?.unobserve(observed);
      if (target) resize?.observe(target);
      observed = target;
    }
    const compact = html.classList.contains('ee-compact');
    const overlayOpen = Boolean(
      compact &&
        target &&
        (host ||
          isAtlasPanelOpen() ||
          root.dataset.dockOpen === 'true' ||
          isViewerOpen()),
    );
    const h = overlayOpen ? Math.round(target.offsetHeight) : 0;
    html.style.setProperty('--ee-sheet-h', `${host ? h : 0}px`);
    if (overlayOpen) html.dataset.eeOverlay = 'open';
    else delete html.dataset.eeOverlay;
    // Globe canvas must receive gestures whenever no sheet/dock/viewer is up.
    html.style.setProperty('--ee-overlay-h', '0px');
    syncBack();
  }

  // ------------------------------------------------ history / back button
  // Phones: an open sheet (and a camera viewer above it) each own one history
  // entry, so the iOS/Android back gesture closes the top layer instead of
  // leaving the app. Closing from the UI unwinds the entry silently.
  const back = { depth: 0, silent: 0 };
  function wantedDepth() {
    if (!html.classList.contains('ee-compact')) return 0;
    const level1 =
      Boolean(host) || isAtlasPanelOpen() || root.dataset.dockOpen === 'true';
    return (level1 ? 1 : 0) + (isViewerOpen() ? 1 : 0);
  }
  // A form submission (LOG OUT) or page unload is a real navigation: history
  // must not be unwound under it, or the traversal races the submission.
  let leaving = false;
  const markLeaving = () => {
    leaving = true;
  };
  document.addEventListener('submit', markLeaving, { capture: true, signal });
  window.addEventListener('pagehide', markLeaving, { signal });
  window.addEventListener('beforeunload', markLeaving, { signal });
  let restoreHref = '';
  let backQueued = false;
  function syncBack() {
    // Coalesce: a tab switch closes then opens within one task, and that
    // intermediate "nothing open" state must not touch history.
    if (backQueued) return;
    backQueued = true;
    queueMicrotask(() => {
      backQueued = false;
      applyBack();
    });
  }
  function applyBack() {
    if (leaving) return;
    const want = wantedDepth();
    try {
      while (back.depth < want) {
        history.pushState(
          { ...(history.state || {}), eeOverlay: back.depth + 1 },
          '',
        );
        back.depth += 1;
      }
      if (back.depth > want) {
        const n = back.depth - want;
        back.depth = want;
        back.silent += 1;
        // The app keeps the camera in the URL hash; going back must not
        // revert it to the hash from when the sheet opened.
        restoreHref = location.href;
        history.go(-n);
      }
    } catch {
      /* history unavailable (sandboxed) */
    }
  }
  window.addEventListener(
    'popstate',
    () => {
      if (back.silent > 0) {
        back.silent -= 1;
        if (restoreHref && back.silent === 0) {
          try {
            history.replaceState(history.state, '', restoreHref);
          } catch {
            /* ignore */
          }
          restoreHref = '';
        }
        return;
      }
      if (back.depth === 0) return;
      back.depth -= 1;
      if (closeViewer()) return syncHeights();
      if (isAtlasPanelOpen()) closeAtlasPanel();
      else if (openId) closeSheet();
      else closeMore();
      syncHeights();
    },
    { signal },
  );

  // ------------------------------------------- nested scroller flattening
  // Root cause of "the sheet does not scroll": nested boxes with
  // overflow-y:auto + overscroll-behavior:contain inside the sheet latch the
  // touch even when they have nothing to scroll. While a sheet is open they
  // become plain blocks (class ee-flat-scroll) and the sheet scrolls.
  let flatObserver = null;
  let flatTimer = 0;
  function flattenScrollers(container) {
    if (!container) return;
    for (const node of container.querySelectorAll('*')) {
      if (node.classList.contains('ee-flat-scroll')) continue;
      const cs = getComputedStyle(node);
      if (cs.display === 'none') continue;
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll')
        node.classList.add('ee-flat-scroll');
    }
  }
  function unflatten(container) {
    for (const node of container?.querySelectorAll?.('.ee-flat-scroll') || [])
      node.classList.remove('ee-flat-scroll');
  }

  function markTabs() {
    const atlasId = atlasPanelId();
    for (const b of tabbar.querySelectorAll('[data-ee-sheet]')) {
      const sheet = findSheet(b.dataset.eeSheet);
      const on = sheet?.atlasPanel
        ? atlasId === sheet.atlasPanel
        : b.dataset.eeSheet === openId;
      b.setAttribute('aria-pressed', String(on));
    }
    tabbar
      .querySelector('[data-ee-more]')
      .setAttribute('aria-pressed', String(root.dataset.dockOpen === 'true'));
  }

  function setPanelOpen(sheet, open) {
    if (sheet.collapsible === false) return;
    Promise.resolve()
      .then(() => runAction('set_panel_open', { panelId: sheet.panelId, open }))
      .catch(() => {
        const node = document.getElementById(sheet.panelId);
        node?.classList.toggle('collapsed', !open);
      });
  }

  function closeMore() {
    if (root.dataset.dockOpen !== 'true') return;
    root.dataset.dockOpen = 'false';
    root
      .querySelector('#atlas-menu-toggle')
      ?.setAttribute('aria-expanded', 'false');
  }

  // Scroll position per sheet, restored when the tab is reopened (spec §5).
  const sheetScroll = new Map();
  function closeSheet() {
    if (!openId) return;
    if (host) sheetScroll.set(openId, host.scrollTop);
    const sheet = findSheet(openId);
    classObserver?.disconnect();
    classObserver = null;
    flatObserver?.disconnect();
    flatObserver = null;
    clearTimeout(flatTimer);
    unflatten(host);
    if (sheet && panel && !panel.classList.contains('collapsed'))
      setPanelOpen(sheet, false);
    host?.classList.remove('ee-sheet-host');
    panel?.classList.remove('ee-sheet-active');
    html.style.removeProperty('--ee-drag');
    openId = null;
    host = null;
    panel = null;
    delete html.dataset.eeSheet;
    delete html.dataset.eeSheetHeight;
    sheetBar.hidden = true;
    markTabs();
    syncHeights();
    // Extra rAF: MutationObserver flatten/collapse can re-set overlay a tick later.
    requestAnimationFrame(() => {
      syncHeights();
      if (!html.dataset.eeOverlay) {
        window.dispatchEvent(new CustomEvent('ee:globe-gestures-restore'));
      }
    });
  }

  function openSheet(id) {
    const target = nextSheet(openId, id);
    closeSheet();
    if (!target) return;
    const sheet = findSheet(target);
    const node = document.getElementById(sheet.panelId);
    if (!node?.parentElement) return;
    closeAtlasPanel();
    closeMore();
    openId = sheet.id;
    panel = node;
    host = node.parentElement;
    host.classList.add('ee-sheet-host');
    panel.classList.add('ee-sheet-active');
    html.dataset.eeSheet = sheet.id;
    sheetTitle.textContent = sheet.title.toUpperCase();
    sheetBar.hidden = false;
    applySheetHeight('half');
    panelSeenOpen = sheet.collapsible === false;
    setPanelOpen(sheet, true);
    // The upstream collapse button / Escape inside the panel closes the sheet.
    if (sheet.collapsible !== false && typeof MutationObserver === 'function') {
      classObserver = new MutationObserver(() => {
        const collapsed = panel?.classList.contains('collapsed');
        if (!collapsed) panelSeenOpen = true;
        else if (panelSeenOpen) closeSheet();
      });
      classObserver.observe(panel, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
    host.scrollTop = 0;
    const savedTop = sheetScroll.get(sheet.id) || 0;
    const restore = () => {
      if (host && openId === sheet.id && savedTop) host.scrollTop = savedTop;
    };
    // Twice: the upstream owner expands the panel asynchronously.
    requestAnimationFrame(restore);
    setTimeout(restore, 400);
    // Flatten after the upstream owner has expanded the panel, and again
    // whenever it re-renders rows (expanding a layer adds nested lists).
    requestAnimationFrame(() => flattenScrollers(host));
    setTimeout(() => flattenScrollers(host), 350);
    if (typeof MutationObserver === 'function') {
      flatObserver = new MutationObserver(() => {
        clearTimeout(flatTimer);
        flatTimer = setTimeout(() => flattenScrollers(host), 120);
      });
      flatObserver.observe(host, { childList: true, subtree: true });
    }
    markTabs();
    syncHeights();
    requestAnimationFrame(syncHeights);
  }

  tabbar.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-ee-sheet]');
    if (tab) {
      const sheet = findSheet(tab.dataset.eeSheet);
      // Earth Eye's own panels (the CCTV browser) open in the atlas panel;
      // tapping the active tab closes it like every other sheet.
      if (sheet?.atlasPanel) {
        closeSheet();
        closeMore();
        closeViewer();
        openAtlasPanel(sheet.atlasPanel);
        markTabs();
        return syncHeights();
      }
      closeViewer();
      return openSheet(tab.dataset.eeSheet);
    }
    if (event.target.closest('[data-ee-more]')) {
      const open = root.dataset.dockOpen !== 'true';
      closeSheet();
      closeViewer();
      if (open) closeAtlasPanel();
      root.dataset.dockOpen = String(open);
      markTabs();
      syncHeights();
    }
  });

  // MORE menu extras (compact only): upstream dock controls as sheets + HUD.
  const dock = root.querySelector('#atlas-dock');
  if (dock) {
    // Group MORE (SYSTEM / EXPERIENCE / INFORMATION / ACCOUNT). NORTH/TILT
    // live on #ee-compass — not in this grid.
    // Canonical IA (EE-LIVE-2): GLOBE owns location/context; MORE owns
    // scenes/visual/display/sources/provider health/keys/licenses/safety/account.
    // CAM LAYER stays discoverable here but belongs with CAMERAS catalog tab.
    dock.insertAdjacentHTML(
      'afterbegin',
      `<div class="ee-more-groups ee-compact-only" role="presentation">
        <section class="ee-more-group" data-group="globe"><h3>GLOBE</h3>
          <button type="button" data-ee-sheet="search" title="Location readout"><span>⌖</span><b>LOCATION</b></button>
          <button type="button" data-ee-sheet="context" title="Context panel"><span>ⓘ</span><b>CONTEXT</b></button>
          <button type="button" data-atlas-open="events" title="World Events markers, filters, source + time"><span>◈</span><b>EVENTS</b></button>
          <button type="button" data-atlas-action="share" title="Copy share link"><span>↗</span><b>SHARE</b></button>
          <p class="ee-more-hint">Layers: GLOBE tab. Place search: ASK EARTH EYE. Events: authentic registry only.</p>
        </section>
        <section class="ee-more-group" data-group="more"><h3>MORE</h3>
          <button type="button" data-atlas-open="feeds" title="Data sources / provider health"><span>◉</span><b>SOURCES</b></button>
          <button type="button" data-atlas-open="keys" title="Provider capabilities (owner keys)"><span>⚿</span><b>KEYS</b></button>
          <button type="button" data-ee-sheet="scenes" title="Scenes"><span>▶</span><b>SCENES</b></button>
          <button type="button" data-ee-sheet="display" title="Display settings"><span>◑</span><b>DISPLAY</b></button>
          <button type="button" data-ee-sheet="visual" title="Visual presets"><span>◐</span><b>VISUAL</b></button>
          <button type="button" data-ee-sheet="voice" data-ee-needs="openai" title="Voice needs a configured Voice AI capability. Typed ASK works without it."><span>◎</span><b>VOICE</b></button>
          <button type="button" data-ee-sheet="cctv-layer" title="Globe CCTV layer toggles (catalog is under CAMERAS tab)"><span>▣</span><b>CAM LAYER</b></button>
          <button type="button" data-ee-action="hud" aria-pressed="false" title="Compact HUD"><span>⌗</span><b>HUD</b></button>
          <button type="button" data-atlas-action="snapshot" title="PNG snapshot"><span>▣</span><b>SNAP</b></button>
          <button type="button" data-atlas-action="tour" title="Cinematic tour"><span>✈</span><b>TOUR</b></button>
          <button type="button" data-atlas-open="credits" title="Licenses"><span>ⓘ</span><b>LICENSES</b></button>
          <button type="button" data-atlas-open="safety" title="Safety / data limits"><span>⚠</span><b>SAFETY</b></button>
        </section>
        <section class="ee-more-group" data-group="account"><h3>ACCOUNT</h3>
          <p class="ee-more-hint">Sign in required for security &amp; session controls.</p>
        </section>
      </div>`,
    );
    // Hide flat desktop dock buttons on compact — groups replace them.
    // SECURITY + LOG OUT stay visible under ACCOUNT when signed in.
    for (const btn of dock.querySelectorAll(':scope > button, :scope > a.atlas-dock-security')) {
      if (btn.matches('[data-ee-logout], .atlas-dock-logout, [data-ee-security]'))
        continue;
      btn.classList.add('ee-desktop-dock');
    }
    const account = dock.querySelector('.ee-more-group[data-group="account"]');
    const placeAccountControls = () => {
      if (!account) return;
      const security = dock.querySelector('[data-ee-security]');
      const logout = dock.querySelector('[data-ee-logout]');
      if (security || logout) account.querySelector('.ee-more-hint')?.remove();
      if (security && security.parentElement !== account) account.appendChild(security);
      if (logout && logout.parentElement !== account) account.appendChild(logout);
    };
    placeAccountControls();
    if (typeof MutationObserver === 'function') {
      const mo = new MutationObserver(placeAccountControls);
      mo.observe(dock, { childList: true });
      signal?.addEventListener('abort', () => mo.disconnect(), { once: true });
    }
    dock.addEventListener('click', (event) => {
      const sheetBtn = event.target.closest('[data-ee-sheet]');
      if (sheetBtn) {
        if (
          sheetBtn.dataset.eeNeeds === 'openai' &&
          document.getElementById('gev-voice-control')?.dataset.atlasVoice ===
            'unavailable'
        ) {
          closeMore();
          window.dispatchEvent(
            new CustomEvent('ee:operator-toast', {
              detail: {
                html: 'VOICE needs Voice AI capability (see MORE → KEYS). Typed ASK works without it.',
                tone: 'warn',
              },
            }),
          );
          return;
        }
        closeMore();
        return openSheet(sheetBtn.dataset.eeSheet);
      }
      if (event.target.closest('[data-ee-action="hud"]')) setHud(!hudOn());
      requestAnimationFrame(() => {
        markTabs();
        syncHeights();
      });
    });
  }

  // Optional compact HUD readout (mode + summary, lat/lon, altitude).
  const hudOn = () => html.classList.contains('ee-hud-on');
  function setHud(on) {
    html.classList.toggle('ee-hud-on', on);
    dock
      ?.querySelector('[data-ee-action="hud"]')
      ?.setAttribute('aria-pressed', String(on));
    try {
      globalThis.localStorage?.setItem(MOBILE_HUD_KEY, on ? '1' : '0');
    } catch {
      /* private mode */
    }
  }
  try {
    setHud(globalThis.localStorage?.getItem(MOBILE_HUD_KEY) === '1');
  } catch {
    setHud(false);
  }

  // ---------------------------------------------------- close + swipe
  sheetBar
    .querySelector('.ee-sheet-close')
    .addEventListener('click', closeSheet);
  let drag = null;
  sheetBar.addEventListener('pointerdown', (event) => {
    // Swipe on handle only (spec §5): down closes/peeks, up expands.
    if (!event.target.closest('.ee-sheet-handle')) return;
    drag = { y: event.clientY, t: performance.now(), dy: 0 };
    sheetBar.setPointerCapture?.(event.pointerId);
  });
  sheetBar.addEventListener('pointermove', (event) => {
    if (!drag) return;
    drag.dy = event.clientY - drag.y; // signed: +down, -up
    // Visual follow only while dragging down (sheet shrink cue).
    html.style.setProperty('--ee-drag', `${Math.max(0, drag.dy)}px`);
  });
  const endDrag = (event) => {
    if (!drag) return;
    const { dy, t } = drag;
    drag = null;
    html.style.removeProperty('--ee-drag');
    const elapsed = performance.now() - t;
    const tappedHandle =
      Math.abs(dy) < 6 && event.type === 'pointerup'
        ? event.target.closest('.ee-sheet-handle')
        : null;
    // Short tap cycles PEEK → HALF → FULL.
    if (tappedHandle) {
      applySheetHeight(nextSheetHeight(sheetHeight));
      syncHeights();
      return;
    }
    // Drag down past threshold → close (or peek first when full).
    if (dy > 0 && shouldCloseOnSwipe(dy, elapsed)) {
      if (sheetHeight === 'full') {
        applySheetHeight('half');
        syncHeights();
      } else if (sheetHeight === 'half') {
        applySheetHeight('peek');
        syncHeights();
      } else {
        closeSheet();
      }
      return;
    }
    // Drag up → expand peek→half→full.
    if (dy < -48) {
      if (sheetHeight === 'peek') applySheetHeight('half');
      else if (sheetHeight === 'half') applySheetHeight('full');
      syncHeights();
    }
  };
  sheetBar.addEventListener('pointerup', endDrag);
  sheetBar.addEventListener('pointercancel', endDrag);
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (closeViewer()) {
        event.preventDefault();
        syncHeights();
        return;
      }
      if (openId) {
        closeSheet();
        event.preventDefault();
      } else if (root.dataset.dockOpen === 'true') {
        closeMore();
        markTabs();
        syncHeights();
        event.preventDefault();
      }
    },
    { signal },
  );

  // ------------------------------------------------------ compact mode
  function applyCompact() {
    const compact = media ? media.matches : false;
    html.classList.toggle('ee-compact', compact);
    if (!compact) {
      closeSheet();
      closeMore();
    }
    syncHeights();
  }
  media?.addEventListener?.('change', applyCompact);
  applyCompact();

  const destroy = () => {
    closeSheet();
    media?.removeEventListener?.('change', applyCompact);
    resize?.disconnect();
    window.removeEventListener('gev:event-detail-request', onEventDetail);
    window.removeEventListener('gev:entity-selected', onEntitySelected);
    html.classList.remove('ee-compact', 'ee-hud-on');
    html.style.removeProperty('--ee-sheet-h');
    html.style.removeProperty('--ee-overlay-h');
  };
  signal?.addEventListener('abort', destroy, { once: true });

  const onEventDetail = () => {
    // Marker tap on a phone must surface the weather/detail sheet, not only a status chip.
    if (html.classList.contains('ee-compact')) openSheet('layers');
  };
  const onEntitySelected = (event) => {
    const layerId = event?.detail?.layerId;
    if (
      layerId === 'weather-cyclones' ||
      layerId === 'local-firms' ||
      layerId === 'earthquakes' ||
      layerId === 'fire-perimeters' ||
      layerId === 'weather-alerts'
    )
      onEventDetail();
  };
  window.addEventListener('gev:event-detail-request', onEventDetail);
  window.addEventListener('gev:entity-selected', onEntitySelected);

  return {
    openSheet,
    closeSheet,
    closeMore,
    refreshKeys,
    syncHeights,
    markTabs,
    get openSheetId() {
      return openId;
    },
    isCompact: () => html.classList.contains('ee-compact'),
    destroy,
  };
}
