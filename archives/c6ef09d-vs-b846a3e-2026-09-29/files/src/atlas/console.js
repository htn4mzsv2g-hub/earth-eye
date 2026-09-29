/**
 * Earth Eye console chrome, layered on top of the upstream application:
 *   - command bar (keyless rule-based parser → the shared action runner)
 *   - quick-action dock (feeds, keys, credits, snapshot, tour, safety, and
 *     LOG OUT when the hosted server's sign-in is active)
 *   - Feed Status, Provider Settings, About & Credits and Safety panels
 *   - honest voice state when no OpenAI key is configured
 * Everything here is additive: upstream panels, HUD and controls are untouched.
 */
import * as Cesium from 'cesium';
import { parseCommand, EXAMPLES } from './commandParser.js';
import { ATLAS_PROVIDER_GROUPS } from './providerRegistry.mjs';
import { DESKTOP_PRIMARY, DESKTOP_MORE_ITEMS } from './canonicalIa.js';
import { initMobileShell } from './mobileShell.js';
import {
  mountDiagnosticsPanel,
  shouldAutoOpenDiagnostics,
  collectDiagnostics,
} from '../app/eeDiagnostics.js';
import { createCctvBrowser, bindSwipeClose } from './cctvBrowser.js';
import {
  decorateLayerRows,
  patchDataSourcesHealth,
  renderDataSources,
  sourceStatus,
} from './dataSourcesPanel.js';
import { disabledReason, sourceFor } from './dataSourceRegistry.js';
import { renderLicenses } from './licensesPanel.js';
import './theme.css';
import { mountSessionControl } from './sessionControl.js';
import { createAnalystTools } from './analystTools.js';
import { createAnalystPanel, createExplorePanel } from './analystPanel.js';
import { createTrackWorkspace } from './trackWorkspace.js';
import { getSelectedEntityContext } from '../data/contextStore.js';
import { earthEyeIdentity } from './analystIdentity.js';
import {
  selectPlace as publishPlace,
  selectCamera as publishCamera,
  readSharedIdentity,
  readSharedLocation,
  onCameraViewerClosed,
  DEFAULT_VIEWER_CLOSE_POLICY,
} from './sharedSelection.js';
import {
  ensureWorldEventsFoundation,
  worldEventsStatus as clientWorldEventsStatus,
} from '../events/index.js';
import {
  createWorldEventsController,
  relatedAnchorFromEvent,
} from '../events/live/index.js';
import { initSelectionCard } from './selectionCard.js';
import './atlas.css';
import {
  labelMapDependentUnavailable,
  isMapDependentAction,
} from '../app/graphicsRecovery.js';

// EE-EVENTS-2/3: foundation + markers / filters / detail + RELATED UX.
ensureWorldEventsFoundation();

const DISCLAIMER_KEY = 'atlas-eye:disclaimer-ack:v1';
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Mount the Earth Eye chrome. Returns { run, destroy } (run is also on window.__atlasEye). */
/**
 * Earth Eye header wordmark: the motion is pure CSS/SMIL; this only pauses it
 * while the tab is hidden and freezes SMIL entirely under reduced motion.
 */
function wireHeaderLogo(signal) {
  const svg = document.querySelector('.ee-wordmark-svg');
  if (!svg) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const sync = () => {
    const still = document.hidden || Boolean(reduce?.matches);
    svg.classList.toggle('ee-paused', document.hidden);
    try {
      if (still) svg.pauseAnimations?.();
      else svg.unpauseAnimations?.();
    } catch {
      /* SMIL control unavailable: CSS handles the rest */
    }
  };
  document.addEventListener('visibilitychange', sync, { signal });
  reduce?.addEventListener?.('change', sync, { signal });
  sync();
}

export function initAtlasConsole({
  viewer,
  dataManager,
  styleManager,
  sceneDirector,
  runAction,
  signal,
  graphicsFailed = false,
  graphicsState = null,
}) {
  const rendererDown = Boolean(
    graphicsFailed || !viewer || viewer?.isDestroyed?.(),
  );
  const root = el(`<div id="atlas-console" data-atlas-console></div>`);
  document.body.appendChild(root);
  document.documentElement.classList.add('atlas-eye');
  wireHeaderLogo(signal);
  const baseRunAction = runAction;
  runAction = (name, args) => {
    if (rendererDown && isMapDependentAction(name)) {
      return Promise.resolve({
        ok: false,
        status: 'UNAVAILABLE',
        error: `UNAVAILABLE — “${name}” needs the 3D globe (renderer unavailable). No fly-to / Follow visual ran.`,
      });
    }
    return baseRunAction(name, args);
  };
  if (rendererDown) {
    document.documentElement.classList.add('ee-graphics-failed');
    document.body?.classList.add('ee-graphics-failed');
  }

  // ---------------------------------------------------------------- command bar
  const bar = el(`
    <form id="atlas-command-bar" role="search" aria-label="Earth Eye command bar" autocomplete="off">
      <span class="atlas-cmd-prompt" aria-hidden="true">&gt;_</span>
      <input id="atlas-command-input" type="text" spellcheck="false" enterkeyhint="go"
        placeholder="Type a command — “track the ISS”, “show fires near Texas”, “help”"
        aria-label="Command" list="atlas-command-examples" />
      <datalist id="atlas-command-examples">${EXAMPLES.map((e) => `<option value="${esc(e)}"></option>`).join('')}</datalist>
      <button type="submit" id="atlas-command-run" aria-label="Run command">RUN</button>
      <button type="button" id="atlas-menu-toggle" aria-label="Earth Eye quick actions" aria-expanded="false" aria-controls="atlas-dock">☰</button>
      <div id="atlas-command-output" role="status" aria-live="polite" hidden></div>
    </form>`);
  root.appendChild(bar);
  const input = bar.querySelector('#atlas-command-input');
  const output = bar.querySelector('#atlas-command-output');

  // --------------------------------------------------------------- quick dock
  const primaryBtns = DESKTOP_PRIMARY.map((d) => {
    const glyph =
      d.dest === 'globe'
        ? '🌐'
        : d.dest === 'track'
          ? '📡'
          : d.dest === 'cameras'
            ? '▢'
            : '▤';
    return `<button type="button" data-atlas-open="${esc(d.open)}" data-ee-dest="${esc(d.dest)}" class="ee-dest-primary" title="${esc(d.title)}"><span>${glyph}</span><b>${esc(d.label)}</b></button>`;
  }).join('');
  const moreItems = DESKTOP_MORE_ITEMS.map((item) => {
    if (item.kind === 'open') {
      const safety = item.id === 'safety' ? ' class="atlas-dock-safety"' : '';
      const owner = item.ownerPreferred ? ' data-ee-owner-preferred="1"' : '';
      const glyph =
        item.id === 'events'
          ? '◈'
          : item.id === 'feeds'
            ? '◉'
            : item.id === 'keys'
              ? '⚿'
              : item.id === 'credits'
                ? 'ⓘ'
                : '⚠';
      return `<button type="button" data-atlas-open="${esc(item.id)}"${safety}${owner} title="${esc(item.title)}"><span>${glyph}</span><b>${esc(item.label)}</b></button>`;
    }
    return `<button type="button" data-atlas-action="${esc(item.id)}" title="${esc(item.title)}"><span>${item.id === 'snapshot' ? '▣' : '✈'}</span><b>${esc(item.label)}</b></button>`;
  }).join('');
  const dock = el(`
    <nav id="atlas-dock" aria-label="Earth Eye destinations">
      ${primaryBtns}
      <button type="button" id="ee-desktop-more-toggle" data-ee-more-desktop aria-pressed="false" aria-controls="ee-desktop-more" title="More: scenes, sources, keys, licenses, safety, account"><span>⋯</span><b>MORE</b></button>
      <div id="ee-desktop-more" class="ee-desktop-more" hidden role="group" aria-label="More">
        ${moreItems}
      </div>
    </nav>`);
  root.appendChild(dock);
  const desktopMore = dock.querySelector('#ee-desktop-more');
  const desktopMoreToggle = dock.querySelector('[data-ee-more-desktop]');
  desktopMoreToggle?.addEventListener(
    'click',
    () => {
      const open = desktopMore?.hasAttribute('hidden');
      if (!desktopMore) return;
      if (open) desktopMore.removeAttribute('hidden');
      else desktopMore.setAttribute('hidden', '');
      desktopMoreToggle.setAttribute('aria-pressed', String(open));
      root.dataset.desktopMore = open ? 'true' : 'false';
    },
    { signal },
  );
  // Hosted build only: LOG OUT appears when the server reports a sign-in.
  // Captures role so Keys can choose owner vs sanitized capabilities.
  let sessionRole = null;
  void mountSessionControl({ dock, signal }).then((btn) => {
    /* role resolved inside renderKeys via /api/session */
    // Desktop: put SECURITY + LOG OUT inside MORE → ACCOUNT so reviewers find them
    // in both 3D and non-3D (not only as trailing dock glyphs).
    try {
      if (!desktopMore || !btn) return;
      let account = desktopMore.querySelector('[data-ee-more-account]');
      if (!account) {
        account = document.createElement('section');
        account.className = 'ee-more-group';
        account.dataset.eeMoreAccount = '1';
        account.innerHTML = '<h3 class="ee-more-account-h">ACCOUNT</h3>';
        desktopMore.appendChild(account);
      }
      const security = dock.querySelector('[data-ee-security]');
      if (security && security.parentElement !== account) account.appendChild(security);
      if (btn.parentElement !== account) account.appendChild(btn);
    } catch {
      /* dock logout remains as fallback */
    }
  });
  async function resolveSessionRole() {
    if (sessionRole != null) return sessionRole;
    try {
      const r = await fetch('/api/session', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!r.ok) return (sessionRole = 'unknown');
      const j = await r.json();
      sessionRole = j?.role || (j?.authenticated ? 'user' : 'unknown');
      return sessionRole;
    } catch {
      return (sessionRole = 'unknown');
    }
  }

  const honesty = el(
    `<button type="button" id="atlas-honesty-chip" data-atlas-open="safety" title="Read the data disclaimer">PUBLIC · DELAYED · SOME MODELLED · NOT FOR NAVIGATION</button>`,
  );
  root.appendChild(honesty);

  // ----------------------------------------------------------------- panels
  const panel = el(`
    <aside id="atlas-panel" role="dialog" aria-modal="false" aria-labelledby="atlas-panel-title" hidden>
      <header class="ee-sheet-head">
        <button type="button" class="ee-handle" aria-label="Close panel (or drag down)"><span></span></button>
        <h2 id="atlas-panel-title">—</h2>
        <button type="button" class="atlas-panel-close ee-close" aria-label="Close panel">✕</button></header>
      <div class="atlas-panel-body"></div>
    </aside>`);
  root.appendChild(panel);
  const panelBody = panel.querySelector('.atlas-panel-body');
  const panelTitle = panel.querySelector('#atlas-panel-title');
  let openPanelId = null;
  let feedTimer = 0;
  let mobile = null;
  const sourcesState = { query: '', onlyOn: false };
  let statusSay = (html, tone) => {};
  const cctv = createCctvBrowser({
    dataManager,
    cameraCenter: () => cameraCenter(),
    cameraBounds: () => cameraBounds(),
    selectedLocation: () => selectedLocation(),
    cameraAltitudeM: () => cameraAltitudeM(),
    root,
    onViewerOpen: (viewerEl) => {
      mobile?.syncHeights();
      // Publish camera into shared selection when the shared viewer opens.
      try {
        const id = viewerEl?.dataset?.cameraId;
        if (id) publishCamera({ id, label: id });
      } catch {
        /* */
      }
    },
    // Closing viewer: RETAIN shared selection (explicit policy).
    onViewerClose: () => {
      onCameraViewerClosed(DEFAULT_VIEWER_CLOSE_POLICY);
      mobile?.syncHeights();
    },
    onStatus: (msg, tone) => statusSay(esc(msg), tone || 'info'),
    signal,
  });
  // Analyst (spec §11-§12): deterministic tools, no model. Read-only queries
  // and map actions are separate tools; map actions only run on request.
  function selectedIdentity() {
    return readSharedIdentity({ dataManager }) || (() => {
      try {
        return earthEyeIdentity(getSelectedEntityContext({ dataManager }));
      } catch {
        return null;
      }
    })();
  }
  const analystTools = createAnalystTools({
    dataManager,
    geocode: async (q, { signal: sig }) => {
      const r = await fetch(`/api/geocode?${new URLSearchParams({ q })}`, {
        signal: sig,
      });
      if (!r.ok) throw new Error(`place lookup HTTP ${r.status}`);
      return r.json();
    },
    runAction: (name, args) => runAction(name, args),
    graphicsFailed: rendererDown,
    getCameras: async () => {
      await cctv.loadCatalog();
      if (cctv.state.error) throw new Error(cctv.state.error);
      return cctv.state.cameras;
    },
    getFlightsNearby: async ({ lat, lon, radiusKm, limit }) => {
      const layer = dataManager.get?.('flights');
      if (!layer || typeof layer.getNearby !== 'function') return [];
      const rows = layer.getNearby(
        { latitude: lat, longitude: lon },
        radiusKm * 1000,
        limit || 25,
      );
      return (rows || []).map((r) => ({
        id: r.id || r.icao || r.callsign,
        callsign: r.callsign || r.label,
        lat: r.latitude ?? r.lat,
        lon: r.longitude ?? r.lon,
        provider: 'aircraft feed',
      }));
    },
    sources: {
      getSourceStatus: (id) => sourceStatus.getSourceStatus(id),
    },
    isLayerOn: (id) =>
      typeof dataManager.isEffectivelyEnabled === 'function'
        ? dataManager.isEffectivelyEnabled(id)
        : Boolean(dataManager.isEnabled?.(id)),
    // Same CAMERAS-tab viewer — openViewer returns SUCCESS/PARTIAL/FAILED.
    openCamera: (id) => cctv.openViewer(id),
    selectCamera: (meta) => publishCamera(meta),
    getSelectedIdentity: () => selectedIdentity(),
    getSelectedLocation: () => selectedLocation(),
    getViewBounds: () => cameraBounds(),
    getViewCenter: () => cameraCenter(),
    getCameraAltitudeM: () => cameraAltitudeM(),
    // EE-EVENTS-4: Analyst uses the controller's selected event and the same
    // detail/marker state; it never creates a parallel event selection.
    getSelectedWorldEvent: () =>
      worldEvents?.getState?.().selectedEvent || null,
    openWorldEventDetail: (eventId) => {
      const selected = worldEvents?.selectById?.(eventId);
      if (!selected)
        return {
          ok: false,
          status: 'FAILED',
          error: 'Selected World Event is no longer in the live snapshot.',
        };
      openPanel?.('events');
      return { ok: true, status: 'SUCCESS' };
    },
    showWorldEventLayer: () => {
      try {
        worldEvents?.setMarkersOn?.(true);
        const attached = worldEvents?.ensureMarkers?.(viewer);
        if (!attached)
          return {
            ok: false,
            status: 'UNAVAILABLE',
            error: 'UNAVAILABLE — World Events layer needs the 3D renderer.',
          };
        return { ok: true, status: 'SUCCESS' };
      } catch (error) {
        return {
          ok: false,
          status: 'FAILED',
          error: String(error?.message || error),
        };
      }
    },
  });
  const explore = createExplorePanel({
    tools: analystTools,
    selectPlace: (meta) => publishPlace(meta),
    graphicsFailed: rendererDown,
  });
  // EE-EVENTS-2/3: list/filters/detail work without WebGL; markers attach lazily.
  const worldEvents = createWorldEventsController({
    viewer: viewer?.isDestroyed?.() ? null : viewer,
    signal,
    rendererDown,
    getRelatedInputs: async () => {
      let cameras = [];
      try {
        await cctv.loadCatalog();
        cameras = cctv.state.cameras || [];
      } catch {
        cameras = [];
      }
      const layerBags = { weather: [], alerts: [], aircraft: [], fires: [] };
      const fill = (bagKey, layerIds, mapRow) => {
        const sel = worldEvents.getState().selectedEvent;
        const anchor = sel ? relatedAnchorFromEvent(sel) : null;
        if (!anchor) return;
        for (const layerId of layerIds) {
          try {
            const layer = dataManager.get?.(layerId);
            if (!layer || typeof layer.getNearby !== 'function') continue;
            const rows = layer.getNearby(
              { latitude: anchor.lat, longitude: anchor.lon },
              80_000,
              25,
            );
            for (const r of rows || []) {
              const row = mapRow(r);
              if (row) layerBags[bagKey].push(row);
            }
          } catch {
            /* optional layer */
          }
        }
      };
      fill('aircraft', ['flights', 'local-adsb'], (r) => ({
        id: r.id || r.icao24 || r.icao || r.callsign,
        label: r.callsign || r.label || r.icao24 || r.id,
        lat: r.latitude ?? r.lat,
        lon: r.longitude ?? r.lon,
        detail: r.altitudeM != null ? `${Math.round(r.altitudeM)} m` : null,
        source: 'aircraft feed',
      }));
      fill('fires', ['local-firms', 'fire-perimeters'], (r) => ({
        id: r.id || r.eventId,
        label: r.label || r.name || r.place || r.id,
        lat: r.latitude ?? r.lat,
        lon: r.longitude ?? r.lon,
        detail: r.frp != null ? `FRP ${r.frp}` : null,
        source: r.provider || 'FIRMS',
      }));
      fill('alerts', ['nws-alerts', 'weather-alerts'], (r) => ({
        id: r.id || r.eventId,
        label: r.label || r.event || r.headline || r.id,
        lat: r.latitude ?? r.lat,
        lon: r.longitude ?? r.lon,
        detail: r.severity || r.event || null,
        source: 'NWS',
      }));
      fill('weather', ['weather', 'open-meteo'], (r) => ({
        id: r.id || 'wx',
        label: r.label || r.summary || 'Weather',
        lat: r.latitude ?? r.lat,
        lon: r.longitude ?? r.lon,
        detail: r.detail || r.summary || null,
        source: r.provider || 'weather',
      }));
      return {
        cameras,
        layerBags,
        // Never invent viewport in non-3D — cameras must not fake IN VIEW.
        bounds: rendererDown ? null : cameraBounds(),
        viewCenter: rendererDown ? null : cameraCenter(),
      };
    },
    onFlyTo: (ev) => {
      const anchor = relatedAnchorFromEvent(ev);
      if (!anchor) {
        say('UNAVAILABLE — event has no plottable coordinates.', 'warn');
        return;
      }
      void runAction('fly_to_location', {
        latitude: anchor.lat,
        longitude: anchor.lon,
        label: ev.title || ev.eventId,
      }).then((r) => {
        if (r?.ok === false) say(esc(r.error || 'Fly unavailable'), 'warn');
        else say(`Flying to ${esc(ev.title || ev.eventId)}`, 'ok');
      });
    },
    onShowOnGlobe: (ev) => {
      if (rendererDown) {
        say(
          'UNAVAILABLE — show on globe needs the 3D renderer (non-3D / WebGL down).',
          'warn',
        );
        return;
      }
      worldEvents.setMarkersOn(true);
      worldEvents.ensureMarkers(viewer);
      if (ev?.eventId) worldEvents.selectById(ev.eventId);
      say('Globe markers on for World Events.', 'info');
    },
  });
  void worldEvents.refresh({ force: true }).catch((err) => {
    console.warn('[WorldEvents] initial refresh failed:', err?.message || err);
  });
  worldEvents.subscribe(() => {
    if (openPanelId === 'events') worldEvents.panel.rerender();
  });

  const trackWs = createTrackWorkspace({
    getStatus: (id) => sourceStatus.getSourceStatus?.(id) || {},
    isLayerOn: (id) =>
      typeof dataManager.isEffectivelyEnabled === 'function'
        ? dataManager.isEffectivelyEnabled(id)
        : Boolean(dataManager.isEnabled?.(id)),
    setLayer: async (id, on) => {
      // Prefer direct manager enablement so Show is never a silent no-op.
      const r = await setLayer(id, Boolean(on));
      if (r?.ok === false) {
        say(
          esc(r.error || `Could not ${on ? 'show' : 'hide'} ${id}`),
          'warn',
        );
        return r;
      }
      if (rendererDown && on) {
        say(
          `${esc(sourceFor(id).name || id)} ON for list/details. Globe markers UNAVAILABLE (3D down). Follow/Cockpit UNAVAILABLE.`,
          'info',
        );
      }
      return r;
    },
    graphicsFailed: rendererDown,
    getNearby: (layerId) => {
      try {
        const layer = dataManager.get?.(layerId);
        // Prefer selected place coords; never “in view” without a viewport.
        const center = selectedLocation() || (rendererDown ? null : cameraCenter());
        if (!layer || !center) return null;
        if (typeof layer.getNearby === 'function') {
          const rows = layer.getNearby(
            { latitude: center.lat, longitude: center.lon },
            80_000,
            1,
          );
          const r = rows?.[0];
          if (!r) return null;
          return {
            id: r.id || r.icao || r.callsign,
            label: r.callsign || r.label || r.id,
            lat: r.latitude ?? r.lat,
            lon: r.longitude ?? r.lon,
          };
        }
        return null;
      } catch {
        return null;
      }
    },
    flyTo: async (near) => {
      if (!near) return;
      if (rendererDown) {
        say('Nearest / Fly UNAVAILABLE — 3D renderer down.', 'warn');
        return;
      }
      await runAction('fly_to_location', {
        latitude: near.lat,
        longitude: near.lon,
        label: near.label,
      });
    },
  });
  const analyst = createAnalystPanel({
    tools: analystTools,
    cameraCenter: () => cameraCenter(),
    getSelectedIdentity: () => selectedIdentity(),
    signal,
  });
  // Permission gate (spec §3): the layer manager's construction-time enable
  // policy (src/atlas/enablePolicy.js, installed in src/app/data.js) refuses
  // disabled sources on every path (row toggles, scenes, URL/share restore,
  // commands, voice). This only explains the refusal to the user.
  const offBlocked = dataManager.subscribe?.((change) => {
    if (change?.type === 'visibility-blocked' && change.policy)
      showBlockedSource(change.layerId);
  });
  signal?.addEventListener('abort', () => offBlocked?.(), { once: true });
  const rowBadges = decorateLayerRows({ dataManager, signal });
  // Layers report into the source-status store every 5 s even when no panel
  // is open, so refresh times and errors are real observations for any
  // reader (getSourceStatus / subscribe on window.__atlasEye.sources).
  const reportSources = () => {
    // Hidden tabs: skip the walk — Cesium is already suspended; burning main
    // thread on status aggregation competes with the next foreground resume.
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      sourceStatus.reportLayers(dataManager.getAll());
    } catch {
      /* dataManager not ready yet */
    }
  };
  reportSources();
  const sourceTimer = setInterval(reportSources, 5_000);
  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) reportSources();
    },
    { signal },
  );
  // Gesture tracking for the periodic Data Sources repaint.
  let panelTouching = false;
  let panelScrolledAt = 0;
  panelBody.addEventListener(
    'touchstart',
    () => {
      panelTouching = true;
    },
    { passive: true, signal },
  );
  for (const t of ['touchend', 'touchcancel'])
    panelBody.addEventListener(
      t,
      () => {
        panelTouching = false;
        panelScrolledAt = Date.now();
      },
      { passive: true, signal },
    );
  panelBody.addEventListener(
    'scroll',
    () => {
      panelScrolledAt = Date.now();
    },
    { passive: true, signal },
  );
  // Scroll position per panel, restored on reopen (spec §5).
  const panelScroll = new Map();
  const closePanel = () => {
    if (openPanelId) panelScroll.set(openPanelId, panelBody.scrollTop);
    if (openPanelId === 'cctv') {
      cctv.closeViewer();
      cctv.detach(panelBody);
    }
    panel.hidden = true;
    openPanelId = null;
    root.dataset.panel = '';
    clearInterval(feedTimer);
    mobile?.markTabs();
    mobile?.syncHeights();
  };
  panel
    .querySelector('.atlas-panel-close')
    .addEventListener('click', closePanel);
  bindSwipeClose(panel.querySelector('.ee-sheet-head'), panel, closePanel);

  const renderers = {
    feeds: renderFeeds,
    keys: renderKeys,
    credits: renderCredits,
    safety: renderSafety,
    help: renderHelp,
    cctv: renderCctv,
    analyst: () => analyst.render(panelBody, panelTitle),
    track: () => trackWs.render(panelBody, panelTitle),
    explore: () => explore.render(panelBody, panelTitle),
    events: () => worldEvents.panel.render(panelBody, panelTitle),
  };
  let packHealthAt = 0;
  function openPanel(id) {
    if (openPanelId === id && !panel.hidden) return closePanel();
    // Phones: one sheet at a time (upstream panel sheets and the MORE menu).
    mobile?.closeSheet();
    mobile?.closeMore();
    if (openPanelId && !panel.hidden)
      panelScroll.set(openPanelId, panelBody.scrollTop);
    if (openPanelId === 'cctv' && id !== 'cctv') {
      cctv.closeViewer();
      cctv.detach(panelBody);
    }
    const switching = openPanelId !== id;
    openPanelId = id;
    root.dataset.panel = id;
    panel.hidden = false;
    clearInterval(feedTimer);
    if (id === 'cctv' && switching) cctv.attach(panelBody);
    if (id === 'events') {
      worldEvents.ensureMarkers(viewer);
      if (
        !worldEvents.getState().events.length &&
        worldEvents.getState().phase === 'idle'
      )
        void worldEvents.refresh({ force: true });
    }
    renderers[id]?.();
    panelBody.scrollTop = panelScroll.get(id) || 0;
    if (id === 'feeds')
      feedTimer = setInterval(() => {
        // Never rebuild under the user's fingers or cursor.
        if (typeof document !== 'undefined' && document.hidden) return;
        if (openPanelId !== 'feeds') return;
        if (
          panelBody.contains(document.activeElement) &&
          document.activeElement.matches('input')
        )
          return;
        if (panelTouching || Date.now() - panelScrolledAt < 2500) return;
        // Surgical health/timestamp update — a full innerHTML rewrite every
        // 5 s was a root cause of iPhone sheet jank (Stage 1 + real-device).
        sourceStatus.reportLayers(dataManager.getAll());
        patchDataSourcesHealth({
          dataManager,
          body: panelBody,
          state: sourcesState,
        });
        if (Date.now() - packHealthAt > 30_000) {
          // Still refresh pack-health on the same cadence, without rebuilding
          // the layer list when the fetch returns.
          packHealthAt = Date.now();
          void fetchJson('/api/cctv/pack-health').then((r) => {
            sourcesState.cctvPacks = Array.isArray(r?.packs)
              ? r.packs
              : 'error';
            if (openPanelId === 'feeds')
              patchDataSourcesHealth({
                dataManager,
                body: panelBody,
                state: sourcesState,
              });
          });
        }
      }, 5000);
    mobile?.markTabs();
    mobile?.syncHeights();
  }

  function renderFeeds() {
    panelTitle.textContent = 'DATA SOURCES';
    renderDataSources({ dataManager, body: panelBody, state: sourcesState });
    // Camera-provider (CCTV pack) health: refreshed at most every 30 s while
    // the screen is open. A failed fetch shows as an error, never as empty.
    if (Date.now() - packHealthAt > 30_000) {
      packHealthAt = Date.now();
      void fetchJson('/api/cctv/pack-health').then((r) => {
        sourcesState.cctvPacks = Array.isArray(r?.packs) ? r.packs : 'error';
        if (openPanelId === 'feeds') {
          const focused =
            document.activeElement?.matches?.('[data-src-filter]');
          if (focused) return;
          // Prefer in-place patch so an open Data Sources sheet is not torn
          // down when pack-health arrives (iPhone jank + journey regression).
          if (
            !patchDataSourcesHealth({
              dataManager,
              body: panelBody,
              state: sourcesState,
            })
          )
            return;
        }
      });
    }
  }

  function renderCctv() {
    cctv.render(panelBody, panelTitle);
  }

  panelBody.addEventListener('input', (event) => {
    const lf = event.target.closest?.('[data-lic-filter]');
    if (lf) {
      licensesState.query = lf.value;
      const pos = lf.selectionStart;
      renderLicenses({ body: panelBody, state: licensesState, cctvPacks });
      const n = panelBody.querySelector('[data-lic-filter]');
      n?.focus({ preventScroll: true });
      try {
        n?.setSelectionRange(pos, pos);
      } catch {
        /* search inputs on some engines */
      }
      return;
    }
    const f = event.target.closest?.('[data-src-filter]');
    if (!f) return;
    sourcesState.query = f.value;
    const pos = f.selectionStart;
    renderFeeds();
    const n = panelBody.querySelector('[data-src-filter]');
    n?.focus({ preventScroll: true });
    try {
      n?.setSelectionRange(pos, pos);
    } catch {
      /* search inputs on some engines */
    }
  });
  panelBody.addEventListener('submit', (event) => {
    if (openPanelId === 'analyst') analyst.onSubmit(event);
    if (openPanelId === 'explore') explore.onSubmit(event);
  });
  panelBody.addEventListener('click', (event) => {
    if (openPanelId === 'analyst') analyst.onClick(event);
    if (openPanelId === 'explore') explore.onClick(event);
    if (openPanelId === 'events') worldEvents.panel.onClick(event);
    if (openPanelId === 'track') trackWs.onClick(event);
    if (event.target.closest?.('[data-src-only-on]')) {
      sourcesState.onlyOn = !sourcesState.onlyOn;
      renderFeeds();
    }
  });

  async function fetchJson(url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  async function renderKeys() {
    panelTitle.textContent = 'PROVIDER CAPABILITIES';
    panelBody.innerHTML =
      '<p class="atlas-lede">Checking which capabilities are configured…</p>';
    const role = await resolveSessionRole();
    const isOwner = role === 'owner' || role === 'admin';
    const caps = await fetchJson('/api/atlas/capabilities');
    const status = isOwner
      ? await fetchJson('/api/atlas/provider-status')
      : null;
    const setup =
      status?.mode === 'dev' ? await fetchJson('/api/setup/status') : null;
    if (openPanelId !== 'keys') return;

    const capList =
      Array.isArray(caps?.capabilities) && caps.capabilities.length
        ? `<ul class="atlas-cap-list">${caps.capabilities
            .map((row) => {
              const tone =
                row.status === 'AVAILABLE'
                  ? 'ok'
                  : row.status === 'DEGRADED'
                    ? 'warn'
                    : row.status === 'DISABLED' ||
                        row.status === 'NOT CONFIGURED' ||
                        row.status === 'KEY REQUIRED'
                      ? 'key'
                      : 'off';
              return `<li><div class="atlas-key-top"><b>${esc(row.label)}</b>
                <span class="atlas-badge" data-tone="${tone}">${esc(row.status)}</span></div></li>`;
            })
            .join('')}</ul>`
        : '<p class="atlas-warn">Capability status unavailable.</p>';

    const weServer = await fetchJson('/api/atlas/world-events/status');
    if (openPanelId !== 'keys') return;
    const we = weServer?.ok ? weServer : clientWorldEventsStatus();
    const weActive = we?.summary?.activeNormalizers ?? 0;
    const weHooks = we?.summary?.hookOnly ?? 0;
    const weLive = we?.liveHealth || we?.live?.health || null;
    const weSources = Array.isArray(we?.sources)
      ? we.sources
      : we?.live?.sources || [];
    const weSourceLine = weSources.length
      ? weSources.map((s) => `${esc(s.id)}:${esc(s.health)}`).join(' · ')
      : 'live status pending';
    const worldEventsNote = `<section class="atlas-key-group" data-ee-world-events="1">
      <h3>WORLD EVENTS (EE-EVENTS-2/3)</h3>
      <p class="atlas-dim">Tiered adapters + globe markers / filters / source+time disclosure.
      ReliefWeb <b>PERMISSION HELD</b>. News ≠ sensor facts. City/region stays imprecise.
      Open <b>MORE → EVENTS</b> for the list. Detail + RELATED open from EVENTS / DETAILS (EE-EVENTS-3). No FOLLOW yet.</p>
      <ul class="atlas-cap-list"><li><div class="atlas-key-top"><b>Foundation</b>
        <span class="atlas-badge" data-tone="ok">${esc(we?.health || 'UNKNOWN')}</span></div>
        <p class="atlas-dim">${weActive} active · ${weHooks} hooks · live:${esc(weLive || 'n/a')}</p>
      </li>
      <li><div class="atlas-key-top"><b>Sources</b>
        <span class="atlas-badge" data-tone="${weLive === 'READY' ? 'ok' : weLive === 'DEGRADED' ? 'warn' : 'off'}">${esc(weLive || 'UNKNOWN')}</span></div>
        <p class="atlas-dim">${weSourceLine}</p>
      </li></ul>
    </section>`;

    // Non-owner: sanitized labels only — no env names, no secret metadata.
    if (!isOwner) {
      panelBody.innerHTML = `
        <p class="atlas-lede">Public capability status for this deployment. Secret values and environment names are never shown here.</p>
        ${capList}
        ${worldEventsNote}
        <p class="atlas-dim">Owner key management stays on owner-only admin paths.</p>`;
      return;
    }

    const setMap = new Map((status?.vars || []).map((x) => [x.name, x.set]));
    const powerUp = Boolean(setup) && document.getElementById('key-setup-chip');
    const mode = status?.mode || 'unknown';
    const groups = ATLAS_PROVIDER_GROUPS.map(
      (g) => `
      <section class="atlas-key-group"><h3>${esc(g.title)}</h3><ul>
      ${g.vars
        .map((x) => {
          const set = setMap.get(x.name);
          const state =
            set === true
              ? 'SET'
              : set === false
                ? x.kind === 'setting'
                  ? 'DEFAULT'
                  : 'NOT SET'
                : 'UNKNOWN';
          const tone =
            set === true ? 'ok' : x.kind === 'setting' ? 'off' : 'key';
          return `<li><div class="atlas-key-top"><code>${esc(x.name)}</code>
          <span class="atlas-badge" data-tone="${tone}">${state}</span>
          ${x.kind === 'secret' ? `<span class="atlas-cost" data-cost="${x.cost}">${x.cost === 'metered' ? 'PAID / METERED' : 'FREE KEY'}</span>` : ''}
          ${x.clientExposed ? '<span class="atlas-cost" data-cost="exposed">BROWSER-VISIBLE</span>' : ''}</div>
          <div class="atlas-key-desc">${esc(x.unlocks)}${x.default ? ` <i>Default: ${esc(x.default)}.</i>` : ''}</div>
          ${x.getUrl ? `<a href="${esc(x.getUrl)}" target="_blank" rel="noopener noreferrer">Where to get it ↗</a>` : ''}</li>`;
        })
        .join('')}</ul></section>`,
    ).join('');
    const photoreal = globalThis.window?.__eePhotorealStatus;
    const gpHealth = await fetchJson('/api/atlas/google-photoreal/status');
    const healthLine = gpHealth
      ? `<p class="atlas-lede" data-ee-gp-health="${esc(gpHealth.health)}"><b>Google Photoreal health:</b> ${esc(gpHealth.health)} · ${esc(gpHealth.code)} — ${esc(gpHealth.detail)}</p>`
      : '';
    const quotaLine = gpHealth?.quota
      ? `<p class="atlas-dim">Quota (approx tile loads): day ${esc(gpHealth.quota.dayCount)}/${esc(gpHealth.limits?.dailyHard)} · month ${esc(gpHealth.quota.monthCount)}/${esc(gpHealth.limits?.monthlyHard)}${gpHealth.quota.code ? ` · ${esc(gpHealth.quota.code)}` : ''}</p>`
      : '';
    const photorealBanner = `${healthLine}${quotaLine}${
      photoreal
        ? `<p class="atlas-lede" data-ee-photoreal-status="${photoreal.active ? 'on' : 'off'}"><b>Globe:</b> ${esc(photoreal.reason)}</p>`
        : `<p class="atlas-lede"><b>Globe stack (Path A):</b> Google Photoreal direct → ion Google 3D → Esri + terrain → OSM. Add Map Tiles key via POWER UP (dev) or build secret (prod). Never paste keys in chat.</p>`
    }`;
    panelBody.innerHTML = `
      ${photorealBanner}
      <h3 class="atlas-cap-heading">Capability summary</h3>
      ${capList}
      ${worldEventsNote}
      <p class="atlas-lede">Owner detail below: values are never shown — only whether each is set.
      Server keys stay on this machine in the gitignored <code>.env</code> file; only the Google Maps and Cesium ion
      keys reach the browser, by design, so restrict them at the provider.</p>
      <div class="atlas-key-howto">
        ${
          powerUp
            ? '<button type="button" class="atlas-primary" data-atlas-action="powerup">EDIT KEYS IN APP (POWER UP)</button><p>Running under <code>npm run dev</code>: saved keys are written to <code>.env</code> (owner-only) and the dev server restarts.</p><p>Owner admin: <code>GET /api/atlas/owner-summary</code> · saved views <code>/api/atlas/workspaces</code> · history <code>/api/atlas/permitted-history</code> · audit <code>/api/atlas/audit-log</code>.</p>'
            : `<p><b>Server mode: ${esc(mode)}.</b> In-app editing is available under <code>npm run dev</code> (POWER UP). For this preview build, put keys in <code>.env</code> at the repo root (copy <code>.env.example</code>), then restart the server. Never commit that file.</p><p>Owner admin: <code>GET /api/atlas/owner-summary</code> · saved views <code>/api/atlas/workspaces</code> · history <code>/api/atlas/permitted-history</code> · audit <code>/api/atlas/audit-log</code> (session required on the host).</p>`
        }
      </div>
      ${status ? '' : '<p class="atlas-warn">Owner status endpoint unreachable: detailed states show UNKNOWN. Sanitized capabilities above still apply.</p>'}
      ${groups}`;
  }

  let cctvPacks = null;
  const licensesState = { query: '' };
  function renderCredits() {
    panelTitle.textContent = 'ATTRIBUTION & LICENSES';
    renderLicenses({ body: panelBody, state: licensesState, cctvPacks });
    if (!cctvPacks)
      void fetchJson('/api/cctv/permissions').then((r) => {
        cctvPacks = Array.isArray(r?.packs) ? r.packs : [];
        if (openPanelId === 'credits') {
          const top = panelBody.scrollTop;
          renderLicenses({ body: panelBody, state: licensesState, cctvPacks });
          panelBody.scrollTop = top;
        }
      });
  }

  function renderSafety() {
    panelTitle.textContent = 'DATA LIMITS & SAFE USE';
    panelBody.innerHTML = `
      <ul class="atlas-bullets atlas-safety">
        <li><b>Public, coarse, delayed data.</b> Feeds can be minutes to hours old, incomplete or wrong. Some layers are
        <b>modelled</b> (satellite positions, wind forecasts) and are labelled that way. Simulated traffic and reconstructed launch replays are not part of this build.</li>
        <li><b>Not for</b> navigation, emergency response, policing, private surveillance, targeting, medical, legal, financial, military or any safety-critical decision.
        For warnings use official sources (NWS/NHC, USGS, local authorities).</li>
        <li><b>No tracking of private individuals.</b> Earth Eye has no face recognition, no named-person search, no
        licence-plate reading and no ALPR layer, and no radio or scanner audio.</li>
        <li><b>Public cameras only.</b> Camera frames come from public agency feeds, are fetched on demand and are not stored
        beyond transient caching. No private feeds.</li>
        <li><b>Military aircraft</b> appear only when they broadcast publicly; absence proves nothing.</li>
        <li>Respect each provider's terms and rate limits. This is a private, owner-only, non-commercial instance.</li>
      </ul>
      <button type="button" class="atlas-primary" data-atlas-action="ack">UNDERSTOOD</button>`;
  }

  function renderHelp() {
    panelTitle.textContent = 'COMMANDS';
    panelBody.innerHTML = `
      <p class="atlas-lede">Typed commands are parsed locally by simple rules — no key, no AI. Tap one to run it.</p>
      <ul class="atlas-examples">${EXAMPLES.map((e) => `<li><button type="button" data-atlas-run="${esc(e)}">${esc(e)}</button></li>`).join('')}</ul>
      <p class="atlas-dim">Also: “fly to 30.27, -97.74”, “show hurricanes”, “hide satellites”, “NVG”, “north up”, “tilt”,
      “share”, “zoom in”, “exit cockpit”, “next contact”, “biggest fire in California”, “outline Travis County”,
      “label Zilker Park as meet here”, “feeds”, “keys”, “credits”.</p>`;
  }

  // ----------------------------------------------------------- disclaimer
  let storage = null;
  try {
    storage = globalThis.localStorage;
  } catch {
    storage = null;
  }
  const acked = () => {
    try {
      return storage?.getItem(DISCLAIMER_KEY) === '1';
    } catch {
      return false;
    }
  };
  const banner = el(`
    <div id="atlas-disclaimer" role="note">
      <span class="ee-disclaimer-long"><b>Earth Eye shows public, delayed and sometimes modelled data.</b>
      Not for navigation, emergency or safety-critical use. No tracking of private individuals.</span>
      <span class="ee-disclaimer-short"><b>Public, delayed, partly modelled data.</b> Not for navigation.</span>
      <button type="button" data-atlas-open="safety">DETAILS</button>
      <button type="button" data-atlas-action="ack">OK</button>
    </div>`);
  if (!acked()) root.appendChild(banner);

  // ------------------------------------------------------------ helpers
  let toastTimer = 0;
  function say(html, tone = 'info', sticky = false) {
    output.hidden = false;
    output.dataset.tone = tone;
    output.innerHTML = html;
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(() => (output.hidden = true), 14000);
  }
  statusSay = say;
  window.addEventListener(
    'ee:operator-toast',
    (event) => {
      const d = event.detail || {};
      say(d.html || '', d.tone || 'info');
    },
    { signal },
  );
  window.addEventListener(
    'ee:globe-gestures-restore',
    () => {
      try {
        if (document.body.classList.contains('cockpit-mode')) return;
        const ctl = viewer?.scene?.screenSpaceCameraController;
        if (ctl) {
          ctl.enableInputs = true;
          if ('enableRotate' in ctl) ctl.enableRotate = true;
          if ('enableTranslate' in ctl) ctl.enableTranslate = true;
          if ('enableZoom' in ctl) ctl.enableZoom = true;
          if ('enableTilt' in ctl) ctl.enableTilt = true;
          if ('enableLook' in ctl) ctl.enableLook = true;
        }
        viewer?.scene?.requestRender?.();
      } catch {
        /* viewer tearing down */
      }
    },
    { signal },
  );

  let diagPanel = null;
  const openDiagnostics = () => {
    diagPanel = mountDiagnosticsPanel({
      getSnapshot: () =>
        collectDiagnostics({
          viewer: viewer?.isDestroyed?.() ? null : viewer,
        }),
      onRestore: () => {
        mobile?.forceSyncClearOverlay?.();
      },
    });
  };
  window.addEventListener('ee:diagnostics-open', openDiagnostics, { signal });
  if (shouldAutoOpenDiagnostics()) {
    queueMicrotask(openDiagnostics);
  }

  function showBlockedSource(layerId) {
    const name = sourceFor(layerId).name || layerId;
    say(
      `<b>${esc(name)}</b> is disabled. ${esc(disabledReason(layerId))}`,
      'warn',
    );
    rowBadges?.refresh?.();
  }

  const selectionCard = initSelectionCard({
    root,
    runAction: (name, args) => runAction(name, args),
    say,
    getFlightsTracked: () => {
      try {
        return dataManager.get?.('flights')?.getTrackedInfo?.() || null;
      } catch {
        return null;
      }
    },
    getCockpitState: () => {
      try {
        return styleManager?.getCockpitState?.() || null;
      } catch {
        return null;
      }
    },
    openWorldEventDetail: (eventId) => {
      if (eventId) worldEvents.selectById(eventId);
      openPanel?.('events');
    },
    signal,
  });
  window.addEventListener(
    'gev:awareness-subject-selected',
    (event) => trackWs.syncSelection?.(event.detail),
    { signal },
  );
  window.addEventListener(
    'gev:awareness-subject-cleared',
    () => trackWs.syncSelection?.(null),
    { signal },
  );

  function cameraCenter() {
    // Non-3D: no viewport — never invent a camera center or label “in view”.
    if (!viewer?.scene?.canvas || viewer?.isDestroyed?.()) return null;
    const scene = viewer.scene;
    const canvas = scene.canvas;
    const pt = new Cesium.Cartesian2(
      canvas.clientWidth / 2,
      canvas.clientHeight / 2,
    );
    let cart = null;
    try {
      const ray = viewer.camera.getPickRay(pt);
      const hit = ray && scene.globe.pick(ray, scene);
      if (hit) cart = Cesium.Cartographic.fromCartesian(hit);
    } catch {
      /* fall through */
    }
    if (!cart) {
      try {
        cart = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
      } catch {
        return null;
      }
    }
    if (!cart) return null;
    return {
      lat: Cesium.Math.toDegrees(cart.latitude),
      lon: Cesium.Math.toDegrees(cart.longitude),
      source: 'camera',
    };
  }

  /** Current globe view rectangle for CCTV relevance (null when undefined). */
  function cameraBounds() {
    // No valid viewport without a live Cesium camera — callers must not claim “in view”.
    if (!viewer?.camera || viewer?.isDestroyed?.()) return null;
    try {
      const rect = viewer.camera.computeViewRectangle?.();
      if (!rect) return null;
      return {
        west: Cesium.Math.toDegrees(rect.west),
        south: Cesium.Math.toDegrees(rect.south),
        east: Cesium.Math.toDegrees(rect.east),
        north: Cesium.Math.toDegrees(rect.north),
      };
    } catch {
      return null;
    }
  }

  function cameraAltitudeM() {
    try {
      const h = viewer.camera?.positionCartographic?.height;
      return Number.isFinite(h) ? h : null;
    } catch {
      return null;
    }
  }

  /**
   * Selected place/entity used as the tertiary CCTV rank key. Prefer explicit
   * lat/lon on the shared context record; never invent a location.
   */
  function selectedLocation() {
    const shared = readSharedLocation({ dataManager });
    if (shared) return shared;
    try {
      const rec = getSelectedEntityContext({ dataManager });
      if (!rec) return null;
      const lat = Number(
        rec.latitude ?? rec.lat ?? rec.position?.latitude ?? rec.position?.lat,
      );
      const lon = Number(
        rec.longitude ??
          rec.lon ??
          rec.lng ??
          rec.position?.longitude ??
          rec.position?.lon,
      );
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon, source: 'selected', id: rec.id || null };
    } catch {
      return null;
    }
  }

  function userLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation)
        return resolve({
          ...(cameraCenter() || {}),
          fallback: 'no geolocation API',
        });
      const done = (v) => resolve(v);
      const timer = setTimeout(
        () =>
          done({ ...(cameraCenter() || {}), fallback: 'location timed out' }),
        6000,
      );
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          done({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            source: 'device',
          });
        },
        () => {
          clearTimeout(timer);
          done({
            ...(cameraCenter() || {}),
            fallback: 'location permission denied',
          });
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 },
      );
    });
  }

  async function setLayer(layerId, enabled) {
    const layer = dataManager.getAll().find((l) => l.id === layerId);
    if (!layer)
      return {
        ok: false,
        error: `Layer ${layerId} is not available in this build`,
      };
    if (layer.enabled === enabled)
      return { ok: true, layerId, unchanged: true };
    try {
      const r = await runAction('set_layer_visibility', { layerId, enabled });
      if (r?.ok !== false) return r;
    } catch {
      /* not in the voice vocabulary — use the manager directly */
    }
    try {
      await dataManager.setEnabled(layerId, enabled, { origin: 'command' });
      return { ok: true, layerId };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  function summarize(tool, result) {
    if (!result) return '';
    if (result.ok === false)
      return `<span class="atlas-bad">${esc(result.error || result.reason || 'failed')}</span>`;
    if (tool === 'analyst_query') {
      const items = (result.items || [])
        .slice(0, 5)
        .map((it) => esc(it.label || it.name || it.callsign || it.id))
        .join(', ');
      const prov = result.coverage?.feedProvenance;
      const provText = prov
        ? ` <span class="atlas-dim">[${esc(typeof prov === 'string' ? prov : prov.summary || prov.state || JSON.stringify(prov).slice(0, 120))}]</span>`
        : '';
      return `<b>${esc(result.count)}</b> ${esc(result.scopeLabel || '')}${items ? ` — ${items}` : ''}${provText}${result.summary && typeof result.summary === 'string' ? `<br/><span class="atlas-dim">${esc(result.summary)}</span>` : ''}`;
    }
    const text =
      result.narration ||
      result.message ||
      result.summary ||
      result.label ||
      result.name ||
      result.callsign ||
      '';
    if (typeof text === 'string' && text) return esc(text);
    if (tool === 'next_iss_pass' || tool === 'next_satellite_pass')
      return esc(JSON.stringify(result).slice(0, 220));
    return 'done';
  }

  let tourAbort = null;
  function syncTourButtons() {
    const running = Boolean(tourAbort && !tourAbort.signal.aborted);
    for (const btn of root.querySelectorAll('[data-atlas-action="tour"]')) {
      btn.setAttribute('aria-pressed', String(running));
      btn.title = running ? 'Stop cinematic tour' : 'Cinematic tour';
      const label = btn.querySelector('b');
      if (label) label.textContent = running ? 'STOP' : 'TOUR';
    }
  }
  async function runTour() {
    if (!viewer?.camera?.flyTo) {
      say('Tour unavailable — globe camera not ready.', 'warn');
      return;
    }
    // Second tap / STOP stops the running tour (honest control, not a dead button).
    if (tourAbort && !tourAbort.signal.aborted) {
      tourAbort.abort();
      try {
        viewer.camera.cancelFlight();
      } catch {
        /* tearing down */
      }
      tourAbort = null;
      syncTourButtons();
      say('Tour stopped.', 'info');
      return;
    }
    const ctrl = new AbortController();
    tourAbort = ctrl;
    syncTourButtons();
    const stops = [
      ['Austin', 30.2672, -97.7431, 9000, -35],
      ['New York', 40.7061, -74.0087, 12000, -35],
      ['London', 51.5055, -0.0754, 9000, -35],
      ['Tokyo', 35.6586, 139.7454, 12000, -35],
      ['Full globe', 20, -40, 22000000, -90],
    ];
    say('Cinematic tour started — tap TOUR again or type “stop tour”.', 'info');
    try {
      for (const [name, lat, lon, h, pitch] of stops) {
        if (ctrl.signal.aborted) return;
        say(`TOUR · ${esc(name)}`, 'info');
        await new Promise((resolve) => {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(
              lon,
              lat - (pitch === -90 ? 0 : (h / 111000) * 1.3),
              h,
            ),
            orientation: {
              heading: 0,
              pitch: Cesium.Math.toRadians(pitch),
              roll: 0,
            },
            duration: pitch === -90 ? 4 : 5,
            complete: resolve,
            cancel: resolve,
          });
        });
        if (ctrl.signal.aborted) return;
        await new Promise((r) => setTimeout(r, 2500));
      }
      if (!ctrl.signal.aborted) say('Tour finished.', 'ok');
    } finally {
      if (tourAbort === ctrl) tourAbort = null;
      syncTourButtons();
    }
  }

  function snapshot() {
    if (!viewer?.scene?.canvas) {
      say('Snapshot unavailable — globe not ready.', 'warn');
      return { ok: false, reason: 'globe not ready' };
    }
    try {
      viewer.scene.render();
      const url = viewer.scene.canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `earth-eye-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      say(
        'Snapshot saved (globe canvas, PNG). Data credits: see CREDITS.',
        'ok',
      );
      return { ok: true };
    } catch (error) {
      say(`Snapshot failed: ${esc(error?.message || error)}`, 'bad');
      return { ok: false };
    }
  }

  function uiAction(name) {
    const click = (sel) => document.querySelector(sel)?.click();
    switch (name) {
      case 'tilt':
        return click('#tilt-map-view');
      case 'north':
        return click('#north-up-view');
      case 'globe':
        return click('#reset-globe-view');
      case 'share':
        return click('#share-btn');
      case 'snapshot':
        return snapshot();
      case 'tour':
        return void runTour();
      case 'tour-stop':
        tourAbort?.abort();
        try {
          viewer?.camera?.cancelFlight?.();
        } catch {
          /* tearing down */
        }
        tourAbort = null;
        syncTourButtons();
        return;
      case 'settings':
        return openPanel('keys');
      case 'credits':
        return openPanel('credits');
      case 'feeds':
        return openPanel('feeds');
      case 'cctv-browser':
        return openPanel('cctv');
      case 'help':
        return openPanel('help');
      case 'disclaimer':
        return openPanel('safety');
      case 'powerup': {
        const chip = document.getElementById('key-setup-chip');
        if (chip) {
          chip.hidden = false;
          chip.click();
        }
        return;
      }
      case 'open-attribution':
        return click('#cesium-credits .cesium-credit-expand-link');
      case 'ack':
        try {
          storage?.setItem(DISCLAIMER_KEY, '1');
        } catch {
          /* private mode */
        }
        banner.remove();
        if (openPanelId === 'safety') closePanel();
        mobile?.syncHeights();
        return;
      default:
        return;
    }
  }

  // ------------------------------------------------------------ executor
  let busy = false;
  async function run(text) {
    const parsed = parseCommand(text);
    if (parsed.kind !== 'plan') {
      say(
        `${esc(parsed.label)}${parsed.suggestions ? `<br/><span class="atlas-dim">Try: ${parsed.suggestions.map(esc).join(' · ')}</span>` : ''}`,
        'warn',
      );
      return { ok: false, parsed };
    }
    if (tourAbort && !/tour/.test(parsed.label)) tourAbort.abort();
    busy = true;
    bar.dataset.busy = 'true';
    say(`▶ ${esc(parsed.label)}…`, 'info', true);
    const results = [];
    let lastText = '';
    let locationNote = '';
    try {
      for (const step of parsed.steps) {
        if (step.wait) {
          await new Promise((r) => setTimeout(r, step.wait));
          continue;
        }
        if (step.ui) {
          const r = uiAction(step.ui);
          results.push({ ui: step.ui, result: r });
          if (step.ui !== 'snapshot' && step.ui !== 'tour') lastText = 'done';
          continue;
        }
        if (step.layer) {
          const r = await setLayer(step.layer, step.enabled);
          results.push({ layer: step.layer, result: r });
          if (r?.ok === false) {
            lastText = summarize('layer', r);
          } else {
            const layer = dataManager.getAll().find((l) => l.id === step.layer);
            const st = layer?.stats || {};
            lastText = `${esc(layer?.name || step.layer)} ${step.enabled ? 'on' : 'off'}${st.keyRequired ? ' — <span class="atlas-bad">NEEDS KEY</span> (see KEYS)' : ''}`;
          }
          continue;
        }
        const args = structuredClone(step.args || {});
        if (step.center) {
          const c =
            step.center === 'user' ? await userLocation() : cameraCenter();
          if (c.fallback)
            locationNote = ` <span class="atlas-dim">(${esc(c.fallback)} — used the view centre)</span>`;
          args.latitude = Math.round(c.lat * 1e5) / 1e5;
          args.longitude = Math.round(c.lon * 1e5) / 1e5;
        }
        if (args.scope?.useUser) {
          const c = await userLocation();
          args.scope = {
            kind: 'radius',
            km: args.scope.km || 250,
            center: { lat: c.lat, lon: c.lon },
          };
        }
        let r;
        try {
          r = await runAction(step.tool, args);
        } catch (error) {
          r = { ok: false, error: error?.message || String(error) };
        }
        results.push({ tool: step.tool, args, result: r });
        lastText = summarize(step.tool, r);
      }
      const failed = results.find((x) => x.result && x.result.ok === false);
      say(
        `${failed ? '✖' : '✔'} <b>${esc(parsed.label)}</b>${lastText && lastText !== 'done' ? ` — ${lastText}` : ''}${locationNote}${parsed.note ? `<br/><span class="atlas-dim">${esc(parsed.note)}</span>` : ''}`,
        failed ? 'bad' : 'ok',
      );
      return { ok: !failed, parsed, results };
    } finally {
      busy = false;
      bar.dataset.busy = 'false';
    }
  }

  bar.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value;
    if (busy) {
      say('Command already running…', 'warn');
      return;
    }
    if (!text.trim()) {
      say(
        'Type a command first — try “help”, “show fires”, or “track the ISS”.',
        'warn',
      );
      return;
    }
    void run(text);
    input.select();
  });
  // Keep typing in the bar from triggering the globe's keyboard shortcuts.
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') input.blur();
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        event.preventDefault();
        input.focus();
      }
    },
    { signal },
  );

  const menuToggle = bar.querySelector('#atlas-menu-toggle');
  menuToggle.addEventListener('click', () => {
    const open = root.dataset.dockOpen !== 'true';
    if (open) mobile?.closeSheet();
    root.dataset.dockOpen = String(open);
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  root.addEventListener('click', (event) => {
    if (event.target.closest('#atlas-dock button')) {
      root.dataset.dockOpen = 'false';
      menuToggle.setAttribute('aria-expanded', 'false');
      mobile?.markTabs();
      requestAnimationFrame(() => mobile?.syncHeights());
    }
    const openBtn = event.target.closest('[data-atlas-open]');
    if (openBtn) return openPanel(openBtn.dataset.atlasOpen);
    const act = event.target.closest('[data-atlas-action]');
    if (act) return uiAction(act.dataset.atlasAction);
    const runBtn = event.target.closest('[data-atlas-run]');
    if (runBtn) {
      input.value = runBtn.dataset.atlasRun;
      return void run(runBtn.dataset.atlasRun);
    }
    const tog = event.target.closest('[data-layer-toggle]');
    if (tog) {
      const id = tog.dataset.layerToggle;
      const layer = dataManager.getAll().find((l) => l.id === id);
      tog.disabled = true;
      void setLayer(id, !layer?.enabled).finally(() => {
        if (openPanelId === 'feeds') renderFeeds();
        if (openPanelId === 'cctv') renderCctv();
        rowBadges.refresh();
      });
    }
  });

  // ------------------------------------------------ phones: mobile console
  mobile = initMobileShell({
    root,
    runAction,
    closeAtlasPanel: () => !panel.hidden && closePanel(),
    isAtlasPanelOpen: () => !panel.hidden,
    atlasPanelId: () => (panel.hidden ? null : openPanelId),
    openAtlasPanel: (id) => openPanel(id),
    isViewerOpen: () => cctv.isViewerOpen(),
    closeViewer: () => cctv.closeViewer(),
    fetchStatus: () => fetchJson('/api/atlas/provider-status'),
    providerGroups: ATLAS_PROVIDER_GROUPS,
    signal,
  });

  // ------------------------------------------------ voice: honest no-key state
  let voiceUnavailable = false;
  async function syncVoiceAvailability() {
    const status = await fetchJson('/api/atlas/provider-status');
    const openai = status?.vars?.find((x) => x.name === 'OPENAI_API_KEY');
    voiceUnavailable = openai ? !openai.set : false;
    const control = document.getElementById('gev-voice-control');
    if (!control) return;
    control.dataset.atlasVoice = voiceUnavailable ? 'unavailable' : 'available';
    if (voiceUnavailable) {
      const detail = control.querySelector('#gev-voice-detail');
      const label = control.querySelector('.gev-mic-label');
      const statusEl = control.querySelector('#gev-voice-status');
      if (detail) detail.textContent = 'VOICE UNAVAILABLE · ADD KEY';
      if (label) label.textContent = 'NO KEY';
      if (statusEl) statusEl.textContent = 'OFF';
      control
        .querySelector('#gev-voice-button')
        ?.setAttribute(
          'aria-label',
          'Voice unavailable: add an OpenAI API key in Provider Settings',
        );
      control
        .querySelector('#gev-voice-button')
        ?.setAttribute(
          'title',
          'Voice unavailable — Voice AI is not configured (see MORE → KEYS). Typed commands work without it.',
        );
      // The upstream controller repaints its readout on status changes; keep
      // the honest no-key wording in place.
      if (detail && !detail.dataset.atlasObserved) {
        detail.dataset.atlasObserved = 'true';
        const observer = new MutationObserver(() => {
          if (
            voiceUnavailable &&
            detail.textContent !== 'VOICE UNAVAILABLE · ADD KEY'
          )
            detail.textContent = 'VOICE UNAVAILABLE · ADD KEY';
        });
        observer.observe(detail, {
          childList: true,
          characterData: true,
          subtree: true,
        });
        signal?.addEventListener('abort', () => observer.disconnect(), {
          once: true,
        });
      }
    }
  }
  document.addEventListener(
    'click',
    (event) => {
      if (!voiceUnavailable) return;
      if (event.target.closest?.('#gev-voice-button')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        say(
          'Voice unavailable — Voice AI is not configured (see MORE → KEYS). Typed commands work without it.',
          'warn',
        );
        openPanel('keys');
      }
    },
    { capture: true, signal },
  );
  setTimeout(syncVoiceAvailability, 1500);
  setTimeout(syncVoiceAvailability, 6000);

  const api = {
    run,
    parse: parseCommand,
    openPanel,
    closePanel,
    snapshot,
    cameraCenter,
    mobile,
    cctv,
    analystTools,
    // Read-only data-source status API (future panels read, never write).
    sources: Object.freeze({
      getSourceStatus: (id) => sourceStatus.getSourceStatus(id),
      subscribe: (cb) => sourceStatus.subscribe(cb),
    }),
  };
  window.__atlasEye = Object.assign(window.__atlasEye || {}, api);
  // Tapping a camera on the globe opens the same viewer. The CCTV layer
  // reports its active camera; only a change that follows a real tap on the
  // globe canvas (not auto-hop or restore) opens the viewer.
  let lastCanvasTap = 0;
  // pointerup, touchend and click: iOS Safari and some WebViews deliver only
  // some of these for a tap.
  if (viewer?.scene?.canvas && !viewer?.isDestroyed?.()) {
    for (const type of ['pointerup', 'touchend', 'click'])
      viewer.scene.canvas.addEventListener(
        type,
        () => {
          lastCanvasTap = Date.now();
        },
        { capture: true, passive: true, signal },
      );
  }
  let lastActiveCamera = null;
  const hookCctvLayer = () => {
    const mod = dataManager.layers?.get?.('cctv')?.module;
    if (typeof mod?.subscribe !== 'function') return false;
    const unsubscribe = mod.subscribe((ui) => {
      const id = ui?.activeCameraId || null;
      // Same stable catalog id as the list (spec acceptance 4). Re-tapping
      // the same camera after closing the viewer opens it again.
      if (
        id &&
        (id !== lastActiveCamera || !cctv.isViewerOpen()) &&
        Date.now() - lastCanvasTap < 1500
      )
        cctv.openViewer(id);
      lastActiveCamera = id;
    });
    signal?.addEventListener('abort', () => unsubscribe?.(), { once: true });
    return true;
  };
  if (!hookCctvLayer()) {
    const t = setInterval(() => hookCctvLayer() && clearInterval(t), 2000);
    signal?.addEventListener('abort', () => clearInterval(t), { once: true });
  }

  // Desktop: Escape closes the camera viewer, then the panel.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.activeElement === input) return;
      if (cctv.closeViewer()) return event.preventDefault();
      if (!panel.hidden) {
        closePanel();
        event.preventDefault();
      }
    },
    { signal },
  );

  const destroy = () => {
    clearInterval(feedTimer);
    clearInterval(sourceTimer);
    tourAbort?.abort();
    root.remove();
    if (window.__atlasEye?.run === run) delete window.__atlasEye;
  };
  if (rendererDown) {
    labelMapDependentUnavailable(root, {
      why: '3D renderer unavailable — this action needs the globe',
    });
    // Compact status chip under command bar when banner continues.
    const chip = el(
      `<div class="ee-non3d-chip" role="status" data-ee-non3d-chip>` +
        `<b>NON-3D</b> · explore data · map actions UNAVAILABLE` +
        (graphicsState?.forced ? ' · audit entry' : '') +
        `</div>`,
    );
    root.appendChild(chip);
  }
  signal?.addEventListener('abort', destroy, { once: true });
  return { ...api, destroy, graphicsFailed: rendererDown };
}
