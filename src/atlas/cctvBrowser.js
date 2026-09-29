/**
 * Earth Eye CCTV browser + camera viewer (DOM).
 *
 * Browser: searchable, filterable, paginated list of every public camera the
 * server catalog serves, with an honest media badge per camera (LIVE VIDEO /
 * VIDEO CLIP / STILL IMAGE ONLY, derived server-side from the provider URLs).
 * Viewer: still images refresh on the provider cadence (never a play button),
 * recorded clips play inline, live HLS attempts muted inline autoplay and
 * falls back to a manual Play button; failures read UNAVAILABLE with no
 * placeholder frame.
 */
import {
  MEDIA_BADGE,
  NO_PUBLIC_CAMERAS_IN_AREA,
  countCameras,
  filterCameras,
  formatCameraDistance,
  hasStill,
  mediaKindOf,
  paginate,
  playableStatus,
  providerInfo,
  rankCameras,
  sortCameras,
  stepIndex,
  frameFreshness,
  mediaErrorState,
  ERROR_LABEL,
} from './cctvCatalog.js';
import { chicagoClock, relativeAge } from './dataSourceRegistry.js';

const PAGE_SIZE = 40;
const CATALOG_TTL_MS = 15 * 60_000;
const LIVE_CONNECT_TIMEOUT_MS = 45_000;
const LIVE_STALL_MS = 20_000;

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/**
 * @param {object} o
 * @param {object} o.dataManager
 * @param {() => {lat:number, lon:number}|null} o.cameraCenter
 * @param {() => ({west:number,south:number,east:number,north:number}|null)} [o.cameraBounds]
 * @param {() => ({lat:number, lon:number}|null)} [o.selectedLocation]
 * @param {() => number|null} [o.cameraAltitudeM]
 * @param {HTMLElement} o.root - #atlas-console (viewer host).
 * @param {(el:HTMLElement) => void} [o.onViewerMount] - mobile sheet wiring.
 * @param {AbortSignal} [o.signal]
 */
export function createCctvBrowser({
  dataManager,
  cameraCenter,
  cameraBounds,
  selectedLocation,
  cameraAltitudeM,
  root,
  onViewerOpen,
  onViewerClose,
  onStatus,
  signal,
}) {
  const status = (msg, tone = 'info') => {
    try {
      onStatus?.(msg, tone);
    } catch {
      /* ignore UI toast failures */
    }
  };
  const state = {
    cameras: [],
    loadedAt: 0,
    loading: null,
    error: '',
    health: new Map(),
    loads: new Map(), // id -> 'ok' | 'error' (this session's real loads)
    refreshed: new Map(), // id -> ms of last successful thumbnail/frame
    kinds: new Set(),
    provider: '',
    query: '',
    sort: 'near',
    page: 0,
    list: [],
    center: null,
    nearbyMode: true,
  };
  let body = null;
  let thumbObserver = null;

  async function loadCatalog(force = false) {
    if (
      !force &&
      state.cameras.length &&
      Date.now() - state.loadedAt < CATALOG_TTL_MS
    )
      return;
    if (state.loading) return state.loading;
    state.loading = (async () => {
      try {
        const r = await fetch('/api/cctv/sources', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        state.cameras = Array.isArray(j?.sources) ? j.sources : [];
        state.loadedAt = Date.now();
        state.error = '';
      } catch (error) {
        state.error = `Camera catalog unavailable (${error?.message || error})`;
      }
      try {
        const h = await fetch('/api/cctv/health', { cache: 'no-store' });
        if (h.ok) {
          const j = await h.json();
          state.health = new Map((j?.cameras || []).map((c) => [c.id, c]));
        }
      } catch {
        /* health is optional */
      }
    })().finally(() => {
      state.loading = null;
    });
    return state.loading;
  }

  function safePoint(getter) {
    try {
      const v = getter?.();
      if (v && Number.isFinite(v.lat) && Number.isFinite(v.lon)) return v;
    } catch {
      /* ignore */
    }
    return null;
  }

  function safeBounds() {
    try {
      const b = cameraBounds?.();
      if (
        b &&
        [b.west, b.south, b.east, b.north].every((n) => Number.isFinite(n))
      )
        return b;
    } catch {
      /* ignore */
    }
    return null;
  }

  function recompute() {
    const filtered = filterCameras(state.cameras, {
      kinds: state.kinds,
      provider: state.provider,
      query: state.query,
    });
    // Explicit search / provider browse may legitimately leave the view; the
    // default "near" mode stays viewport-bounded so distant packs never fill
    // the list without explanation.
    const nearbyMode =
      state.sort === 'near' && !state.query.trim() && !state.provider;
    if (state.sort === 'near') {
      const center = safePoint(cameraCenter);
      const selected = safePoint(selectedLocation);
      let altitudeM = null;
      try {
        const a = cameraAltitudeM?.();
        if (Number.isFinite(a)) altitudeM = a;
      } catch {
        /* ignore */
      }
      state.center = center;
      state.list = rankCameras(filtered, {
        center,
        bounds: safeBounds(),
        selected,
        altitudeM,
        nearbyOnly: nearbyMode,
      });
      state.nearbyMode = nearbyMode;
      return;
    }
    state.center = null;
    state.nearbyMode = false;
    state.list = sortCameras(filtered, null);
  }

  function statusFor(cam) {
    return playableStatus(cam, {
      health: state.health.get(cam.id) || null,
      load: state.loads.get(cam.id),
    });
  }

  function cardHtml(cam, index) {
    const kind = mediaKindOf(cam);
    const info = providerInfo(cam.provider);
    const status = statusFor(cam);
    const refreshed = state.refreshed.get(cam.id);
    const still = hasStill(cam)
      ? cam.media?.stillPath || `/api/cctv/frame/${encodeURIComponent(cam.id)}`
      : '';
    const km = formatCameraDistance(cam._km);
    const inView = cam._inView ? ' · IN VIEW' : '';
    return `<li class="ee-cam" data-cam-index="${index}">
      <button type="button" class="ee-cam-card" data-cam-open="${esc(cam.id)}" aria-label="${esc(`${cam.name}, ${info.short}, ${MEDIA_BADGE[kind]}`)}">
        <span class="ee-cam-thumb" data-kind="${kind}">
          ${still ? `<img alt="" loading="lazy" decoding="async" data-thumb="${esc(cam.id)}" data-src="${esc(still)}" />` : `<span class="ee-cam-nothumb">${kind === 'live' ? 'No still published' : 'No image'}</span>`}
        </span>
        <span class="ee-cam-body">
          <span class="ee-cam-name">${esc(cam.name)}</span>
          <span class="ee-cam-sub">${esc(info.short)}${cam.city ? ` · ${esc(cam.city)}` : ''}${km ? ` · <span class="ee-mono">${esc(km)}</span>` : ''}${inView ? `<span class="ee-dim">${esc(inView)}</span>` : ''}</span>
          <span class="ee-cam-tags">
            <span class="ee-badge" data-media="${kind}">${esc(MEDIA_BADGE[kind])}</span>
            <span class="ee-cam-status" data-status="${esc(status)}">${esc(status)}</span>
          </span>
          <span class="ee-cam-time ee-mono" data-time-for="${esc(cam.id)}">${refreshed ? `Refreshed ${esc(chicagoClock(refreshed))}` : 'Not refreshed yet'}</span>
        </span>
      </button>
    </li>`;
  }

  function render(target, titleEl) {
    body = target || body;
    if (!body) return;
    if (titleEl) titleEl.textContent = 'CCTV CAMERAS';
    if (!state.cameras.length && !state.error) {
      body.innerHTML =
        '<p class="ee-panel-intro">Loading the public camera catalog…</p>';
      void loadCatalog().then(() => body?.isConnected && render());
      return;
    }
    recompute();
    const counts = countCameras(state.cameras);
    const providers = Object.entries(counts.byProvider).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    const pg = paginate(state.list, state.page, PAGE_SIZE);
    state.page = pg.page;
    const chip = (kind, label) =>
      `<button type="button" class="ee-chip" data-cam-kind="${kind}" aria-pressed="${state.kinds.has(kind)}">${esc(label)} <span class="ee-mono">${(counts.byKind[kind] || 0).toLocaleString('en-US')}</span></button>`;
    const cctvLayer = safeLayer('cctv');
    const filtersActive =
      state.kinds.size > 0 || Boolean(state.provider) || state.sort !== 'near';
    body.innerHTML = `
      <div class="ee-toolbar" role="search">
        <label class="ee-search"><span class="ee-sr">Search cameras</span>
          <input type="search" data-cam-search placeholder="Search name, city or provider" value="${esc(state.query)}" enterkeyhint="search" /></label>
      </div>
      <p class="ee-cam-honesty ee-dim" role="status"><b>${counts.total.toLocaleString('en-US')}</b> cams · ${providers.length} providers · ${esc(chicagoClock(state.loadedAt))}${
        counts.byKind.live
          ? ''
          : counts.total
            ? ` · <b>catalog has no live video</b> (${(counts.byKind.clip || 0)} clips · ${(counts.byKind.still || 0)} stills available)`
            : ''
      }${state.error ? ` · <span class="ee-err">${esc(state.error)}</span>` : ''}</p>
      <section class="ee-section ee-cam-primary">
        <h3 class="ee-section-h">Cameras <span class="ee-dim" data-cam-total>${pg.total.toLocaleString('en-US')} match</span></h3>
        ${pg.total ? `<ul class="ee-cam-list">${pg.items.map((c, i) => cardHtml(c, pg.page * PAGE_SIZE + i)).join('')}</ul>` : `<p class="ee-empty" role="status">${esc((() => {
          if (state.nearbyMode && state.cameras.length)
            return NO_PUBLIC_CAMERAS_IN_AREA;
          if (filtersActive && state.cameras.length)
            return 'No camera matches these filters — clear filters or try clips/stills.';
          if (!counts.byKind.live && state.cameras.length && state.kinds.has('live'))
            return 'Catalog has no live video. Offer clips/stills — switch media type filters.';
          if (!state.cameras.length)
            return 'Camera catalog is empty for this session.';
          return 'No camera matches these filters.';
        })())}</p>${
          !pg.total && state.cameras.length && !counts.byKind.live
            ? `<p class="ee-dim">Try <b>Video clip</b> or <b>Still image</b> filters — live count is 0 catalog-wide.</p>`
            : ''
        }`}
        <nav class="ee-pager" aria-label="Camera pages">
          <button type="button" class="ee-btn" data-cam-page="-1" ${pg.page <= 0 ? 'disabled' : ''}>‹ Prev</button>
          <span class="ee-mono">Page ${pg.page + 1} / ${pg.pages}</span>
          <button type="button" class="ee-btn" data-cam-page="1" ${pg.page >= pg.pages - 1 ? 'disabled' : ''}>Next ›</button>
        </nav>
      </section>
      <details class="ee-cam-filters" ${filtersActive ? 'open' : ''}>
        <summary>Filters &amp; globe layer</summary>
        <div class="ee-chips" role="group" aria-label="Media type">
          ${chip('live', 'Live video')}${chip('clip', 'Video clip')}${chip('still', 'Still image')}
        </div>
        <div class="ee-row2">
          <label class="ee-select"><span>Provider</span>
            <select data-cam-provider>
              <option value="">All providers (${counts.total.toLocaleString('en-US')})</option>
              ${providers.map(([p, c]) => `<option value="${esc(p)}"${p === state.provider ? ' selected' : ''}>${esc(providerInfo(p).short)} (${c.total})</option>`).join('')}
            </select></label>
          <label class="ee-select"><span>Sort</span>
            <select data-cam-sort>
              <option value="near"${state.sort === 'near' ? ' selected' : ''}>Relevance (nearest / selected; in view only when globe has a viewport)</option>
              <option value="name"${state.sort === 'name' ? ' selected' : ''}>Provider, name</option>
            </select></label>
        </div>
        ${cctvLayer ? `<button type="button" class="ee-btn ee-wide" data-layer-toggle="cctv" aria-pressed="${Boolean(cctvLayer.enabled)}">${cctvLayer.enabled ? 'Hide cameras on globe' : 'Show cameras on globe'}</button>` : ''}
      </details>
      <p class="ee-dim ee-foot">Public cameras only. No recognition / recording / private feeds. Not for emergency use.</p>`;
    wireThumbs();
  }

  function safeLayer(id) {
    try {
      return dataManager.getAll().find((l) => l.id === id) || null;
    } catch {
      return null;
    }
  }

  // `at` = when this content was first seen (a re-downloaded identical frame
  // keeps its original time, spec acceptance 7).
  function markRefreshed(id, ok, at = Date.now()) {
    state.loads.set(id, ok ? 'ok' : 'error');
    if (ok) state.refreshed.set(id, at);
    const t = body?.querySelector(`[data-time-for="${CSS.escape(id)}"]`);
    if (t)
      t.textContent = ok
        ? `Refreshed ${chicagoClock(at)}`
        : 'Frame unavailable';
    const card = t?.closest('.ee-cam');
    const cam = state.cameras.find((c) => c.id === id);
    const s = card?.querySelector('.ee-cam-status');
    if (s && cam) {
      const v = statusFor(cam);
      s.textContent = v;
      s.dataset.status = v;
    }
  }

  function wireThumbs() {
    thumbObserver?.disconnect();
    const imgs = body.querySelectorAll('img[data-thumb]');
    const load = (img) => {
      if (img.src) return;
      img.addEventListener(
        'load',
        () => markRefreshed(img.dataset.thumb, img.naturalWidth > 0),
        { once: true },
      );
      img.addEventListener(
        'error',
        () => {
          img.remove();
          markRefreshed(img.dataset.thumb, false);
        },
        { once: true },
      );
      img.src = img.dataset.src;
    };
    if (typeof IntersectionObserver === 'function') {
      thumbObserver = new IntersectionObserver(
        (entries) => {
          for (const e of entries)
            if (e.isIntersecting) {
              thumbObserver.unobserve(e.target);
              load(e.target);
            }
        },
        { root: null, rootMargin: '200px 0px' },
      );
      imgs.forEach((img) => thumbObserver.observe(img));
    } else imgs.forEach(load);
  }

  // ------------------------------------------------------------- events
  function onInput(event) {
    const t = event.target;
    if (t.matches?.('[data-cam-search]')) {
      state.query = t.value;
      state.page = 0;
      rerenderKeepingFocus('[data-cam-search]');
    }
  }
  function onChange(event) {
    const t = event.target;
    if (t.matches?.('[data-cam-provider]')) {
      state.provider = t.value;
      state.page = 0;
      render();
    } else if (t.matches?.('[data-cam-sort]')) {
      state.sort = t.value;
      state.page = 0;
      render();
    }
  }
  let inputTimer = 0;
  function rerenderKeepingFocus(sel) {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => {
      const active = document.activeElement;
      const pos = active?.selectionStart;
      render();
      if (active?.matches?.(sel)) {
        const n = body.querySelector(sel);
        n?.focus({ preventScroll: true });
        try {
          n?.setSelectionRange(pos, pos);
        } catch {
          /* type=search on some engines */
        }
      }
    }, 180);
  }
  function onClick(event) {
    const kindBtn = event.target.closest('[data-cam-kind]');
    if (kindBtn) {
      const k = kindBtn.dataset.camKind;
      if (state.kinds.has(k)) state.kinds.delete(k);
      else state.kinds.add(k);
      state.page = 0;
      return render();
    }
    const pageBtn = event.target.closest('[data-cam-page]');
    if (pageBtn) {
      state.page += Number(pageBtn.dataset.camPage);
      render();
      body.closest('.atlas-panel-body')?.scrollTo?.({ top: 0 });
      body.scrollTop = 0;
      return;
    }
    const open = event.target.closest('[data-cam-open]');
    if (open) {
      const idx = state.list.findIndex((c) => c.id === open.dataset.camOpen);
      return openViewer(open.dataset.camOpen, idx);
    }
  }

  function attach(target) {
    target.addEventListener('input', onInput);
    target.addEventListener('change', onChange);
    target.addEventListener('click', onClick);
  }
  function detach(target) {
    target.removeEventListener('input', onInput);
    target.removeEventListener('change', onChange);
    target.removeEventListener('click', onClick);
    thumbObserver?.disconnect();
  }

  // -------------------------------------------------------------- viewer
  const viewer = el(`
    <section id="ee-cam-viewer" role="dialog" aria-modal="true" aria-labelledby="ee-cam-title" hidden>
      <header class="ee-sheet-head">
        <button type="button" class="ee-handle" data-viewer-handle aria-label="Close camera (or drag down)"><span></span></button>
        <div class="ee-head-text"><p class="ee-kicker" id="ee-cam-kicker">CAMERA</p><h2 id="ee-cam-title">—</h2></div>
        <button type="button" class="ee-close" data-viewer-close aria-label="Close camera">✕</button>
      </header>
      <div class="ee-cam-view-body">
        <div class="ee-cam-meta" id="ee-cam-meta"></div>
        <div class="ee-cam-stage" id="ee-cam-stage" data-state="idle"></div>
        <p class="ee-cam-line ee-mono" id="ee-cam-line" role="status" aria-live="polite"></p>
        <div class="ee-cam-tools" role="toolbar" aria-label="Camera controls">
          <button type="button" class="ee-btn" data-viewer-retry>↻ Retry</button>
          <button type="button" class="ee-btn" data-viewer-fullscreen>⤢ Fullscreen</button>
          <a class="ee-btn" id="ee-cam-source" target="_blank" rel="noopener noreferrer" hidden>Source ↗</a>
        </div>
        <nav class="ee-cam-nav" aria-label="Camera navigation">
          <button type="button" class="ee-btn" data-viewer-step="-1">‹ Previous</button>
          <span class="ee-mono" id="ee-cam-pos">—</span>
          <button type="button" class="ee-btn" data-viewer-step="1">Next ›</button>
        </nav>
        <div class="ee-cam-attrib" id="ee-cam-attrib"></div>
      </div>
    </section>`);
  root.appendChild(viewer);
  const stage = viewer.querySelector('#ee-cam-stage');
  const line = viewer.querySelector('#ee-cam-line');
  let current = null; // { cam, index, cleanup }

  function setLine(text, tone = '') {
    line.textContent = text;
    line.dataset.tone = tone;
  }

  function teardownMedia() {
    try {
      current?.cleanup?.();
    } catch {
      /* ignore */
    }
    if (current) current.cleanup = null;
    stage.replaceChildren();
    stage.dataset.state = 'idle';
  }

  // Separate error states (spec §12): offline, expired, unsupported,
  // unavailable. Never a fake frame.
  function unavailable(msg, reason = 'unavailable') {
    stage.dataset.state = 'unavailable';
    stage.dataset.error = reason;
    stage.replaceChildren(
      el(
        `<div class="ee-cam-unavail"><b>${esc(ERROR_LABEL[reason] || 'UNAVAILABLE')}</b><span>${esc(msg)}</span></div>`,
      ),
    );
    setLine(msg, 'bad');
  }

  async function contentHash(blob) {
    try {
      const buf = await blob.arrayBuffer();
      if (globalThis.crypto?.subtle) {
        const d = await crypto.subtle.digest('SHA-256', buf);
        return [...new Uint8Array(d)]
          .slice(0, 12)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
      // Non-secure context fallback: size + FNV-1a over the bytes.
      const u = new Uint8Array(buf);
      let h = 0x811c9dc5;
      for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619);
      return `${u.length}-${(h >>> 0).toString(16)}`;
    } catch {
      return '';
    }
  }

  function mountStill(cam) {
    const info = providerInfo(cam.provider);
    const img = document.createElement('img');
    img.alt = `Latest still image from ${cam.name}`;
    img.className = 'ee-cam-img';
    stage.dataset.state = 'loading';
    stage.replaceChildren(img);
    let objectUrl = '';
    let timer = 0;
    let alive = true;
    let fresh = null; // frameFreshness() record for the frame on screen
    const base =
      cam.media?.stillPath || `/api/cctv/frame/${encodeURIComponent(cam.id)}`;
    const refresh = async () => {
      if (!alive) return;
      clearTimeout(timer);
      try {
        // `t` only defeats caching of OUR proxy URL; the upstream request
        // is the provider's own unchanged image URL.
        const r = await fetch(`${base}?t=${Date.now()}`, { cache: 'no-store' });
        if (!alive) return;
        if (
          !r.ok ||
          !(r.headers.get('content-type') || '').startsWith('image/')
        ) {
          markRefreshed(cam.id, false);
          if (!img.naturalWidth)
            return unavailable(
              `Provider did not return an image (HTTP ${r.status}).`,
              mediaErrorState({ status: r.status, online: navigator.onLine }),
            );
          // Keep the last good frame with its own time (spec §12).
          stage.dataset.fresh = 'stale';
          setLine(
            `Last refresh failed (HTTP ${r.status}); showing the last good frame, first seen ${chicagoClock(fresh?.firstSeenAt)}${fresh?.observedAt ? `, provider time ${chicagoClock(fresh.observedAt)}` : ''}.`,
            'warn',
          );
        } else {
          const blob = await r.blob();
          if (!alive) return;
          const frameTime = Date.parse(
            r.headers.get('x-cctv-frame-time') || '',
          );
          const hash = await contentHash(blob);
          if (!alive) return;
          fresh = frameFreshness(fresh, {
            hash,
            frameTime: Number.isFinite(frameTime) ? frameTime : null,
            now: Date.now(),
          });
          stage.dataset.fresh = fresh.stale ? 'stale' : 'fresh';
          const obs = fresh.observedAt
            ? ` · provider time ${chicagoClock(fresh.observedAt)} (${relativeAge(Date.now() - fresh.observedAt)})`
            : ' · provider time unknown';
          const nextCheck = ` · next check in ${Math.round(info.stillRefreshMs / 1000)} s`;
          if (!fresh.changed && img.naturalWidth) {
            // Same frame again: keep the old time, say it is stale.
            markRefreshed(cam.id, true, fresh.firstSeenAt);
            setLine(
              `STALE · no new frame from the provider since ${chicagoClock(fresh.firstSeenAt)}${obs} · re-checked ${chicagoClock(Date.now())}${nextCheck}`,
              'warn',
            );
            if (alive && !document.hidden)
              timer = setTimeout(refresh, info.stillRefreshMs);
            return;
          }
          const next = URL.createObjectURL(blob);
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = next;
          });
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = next;
          stage.dataset.state = 'still';
          markRefreshed(cam.id, true, fresh.firstSeenAt);
          setLine(
            `${fresh.stale ? 'STALE · ' : ''}Refreshed ${chicagoClock(fresh.firstSeenAt)}${obs}${nextCheck}`,
            fresh.stale ? 'warn' : '',
          );
        }
      } catch (error) {
        if (!alive) return;
        markRefreshed(cam.id, false);
        if (!img.naturalWidth)
          return unavailable(
            `Frame request failed (${error?.message || 'network error'}).`,
            mediaErrorState({ status: 0, online: navigator.onLine }),
          );
        stage.dataset.fresh = 'stale';
        setLine(
          `Frame request failed; showing the last good frame, first seen ${chicagoClock(fresh?.firstSeenAt)}.`,
          'warn',
        );
      }
      if (alive && !document.hidden)
        timer = setTimeout(refresh, info.stillRefreshMs);
    };
    const onVis = () => {
      if (!document.hidden && alive) void refresh();
      else clearTimeout(timer);
    };
    document.addEventListener('visibilitychange', onVis);
    void refresh();
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }

  function bigPlay(label, onPress) {
    const b = el(
      `<button type="button" class="ee-bigplay" aria-label="${esc(label)}"><span aria-hidden="true">▶</span><b>${esc(label)}</b></button>`,
    );
    b.addEventListener('click', onPress);
    return b;
  }

  function mountClip(cam) {
    const wrap = el('<div class="ee-cam-videowrap"></div>');
    const video = document.createElement('video');
    video.className = 'ee-cam-video';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.controls = true;
    video.preload = 'none';
    video.muted = true;
    video.src =
      cam.media?.clipPath || `/api/cctv/clip/${encodeURIComponent(cam.id)}`;
    const play = bigPlay('Play clip', () => {
      play.disabled = true;
      video.play().catch((e) => {
        play.disabled = false;
        setLine(`Could not start the clip (${e?.name || 'error'}).`, 'warn');
      });
    });
    wrap.append(video, play);
    stage.dataset.state = 'clip-ready';
    stage.replaceChildren(wrap);
    setLine(
      'Recorded clip published by the provider (a few seconds, not live). Tap Play.',
    );
    video.addEventListener('playing', () => {
      play.hidden = true;
      stage.dataset.state = 'clip-playing';
      markRefreshed(cam.id, true);
      setLine(
        `Playing recorded clip · loaded ${chicagoClock(Date.now())} · not live`,
      );
    });
    video.addEventListener('ended', () => {
      play.hidden = false;
      play.disabled = false;
      play.querySelector('b').textContent = 'Replay clip';
    });
    video.addEventListener('waiting', () => {
      if (stage.dataset.state === 'clip-playing') {
        stage.dataset.state = 'clip-buffering';
        setLine('Buffering the clip…');
      }
    });
    video.addEventListener('error', async () => {
      const code = video.error?.code;
      const src = video.getAttribute('src');
      if (!src || !wrap.isConnected) return; // released on close
      markRefreshed(cam.id, false);
      // Browsers report an HTTP failure on the clip URL as code 4 too, so
      // check the status first (a 1 KB range request) before saying the
      // format is unsupported.
      let status = 0;
      if (src && navigator.onLine !== false) {
        try {
          const r = await fetch(src, {
            cache: 'no-store',
            headers: { Range: 'bytes=0-1023' },
          });
          status = r.status;
          r.body?.cancel?.().catch?.(() => {});
        } catch {
          /* offline or blocked */
        }
      }
      // The viewer may have closed or moved on while the probe ran.
      if (!wrap.isConnected) return;
      const ok = status >= 200 && status < 300;
      unavailable(
        'The provider clip could not be loaded.',
        mediaErrorState({
          online: navigator.onLine,
          status: ok ? undefined : status,
          mediaErrorCode: ok ? code : undefined,
        }),
      );
    });
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }

  function mountLive(cam) {
    const wrap = el('<div class="ee-cam-videowrap"></div>');
    const video = document.createElement('video');
    video.className = 'ee-cam-video';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.muted = true;
    video.autoplay = false;
    video.controls = false;
    wrap.append(video);
    stage.dataset.state = 'live-connecting';
    stage.replaceChildren(wrap);
    setLine('Connecting to the live stream…');
    const lease = globalThis.crypto?.randomUUID?.() || '';
    const base =
      cam.media?.livePath || `/api/cctv/media/${encodeURIComponent(cam.id)}`;
    const url = `${base}?lease=${lease}`;
    let hls = null;
    let alive = true;
    let playing = false;
    let lastTime = -1;
    let lastProgressAt = Date.now();
    const connectTimer = setTimeout(() => {
      if (alive && !playing && stage.dataset.state !== 'live-blocked')
        fail('The stream did not start within 45 s.');
    }, LIVE_CONNECT_TIMEOUT_MS);
    const stallTimer = setInterval(() => {
      if (!alive || !playing || video.paused) return;
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        lastProgressAt = Date.now();
      } else if (Date.now() - lastProgressAt > LIVE_STALL_MS)
        fail('The stream stalled (no new video for 20 s).');
    }, 2000);
    const fail = (msg, reason) => {
      if (!alive) return;
      markRefreshed(cam.id, false);
      cleanup();
      unavailable(
        msg,
        reason || (navigator.onLine ? 'unavailable' : 'offline'),
      );
    };
    const tryPlay = () => {
      video
        .play()
        .then(() => {
          /* 'playing' handler updates the UI */
        })
        .catch((e) => {
          if (!alive) return;
          if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') {
            stage.dataset.state = 'live-blocked';
            const note = isIOS()
              ? 'iPhone blocked autoplay. Tap Play to start the stream.'
              : 'The browser blocked autoplay. Tap Play to start the stream.';
            const btn = bigPlay('Play live stream', () => {
              btn.disabled = true;
              video.play().catch((err) => {
                btn.disabled = false;
                setLine(`Playback failed (${err?.name || 'error'}).`, 'warn');
              });
            });
            wrap.append(btn);
            setLine(note, 'warn');
          } else classifyFailure(`Playback failed (${e?.name || 'error'}).`);
        });
    };
    video.addEventListener('playing', () => {
      playing = true;
      lastProgressAt = Date.now();
      stage.dataset.state = 'live-playing';
      wrap.querySelector('.ee-bigplay')?.remove();
      video.controls = true;
      markRefreshed(cam.id, true);
      setLine(`LIVE · stream started ${chicagoClock(Date.now())} · muted`);
    });
    video.addEventListener('waiting', () => {
      if (!playing) return;
      stage.dataset.state = 'live-buffering';
      setLine('Buffering the live stream…');
    });
    // Ask the proxy why (a small playlist request) so an expired lease reads
    // EXPIRED and an upstream outage reads OFFLINE. Native HLS (iPhone
    // Safari, recent Chrome) reports a failed playlist load as
    // MEDIA_ERR_SRC_NOT_SUPPORTED (4) and rejects play() with
    // NotSupportedError, so "unsupported" is only claimed when the stream
    // itself answers OK. Shared by the error event and play() rejection.
    let classifying = null;
    const classifyFailure = (msg = 'The live stream failed to load.') => {
      if (!alive || classifying) return classifying;
      classifying = (async () => {
        let status = 0;
        if (navigator.onLine !== false) {
          try {
            status = (await fetch(url, { cache: 'no-store' })).status;
          } catch {
            /* offline */
          }
        }
        const ok = status >= 200 && status < 300;
        if (ok && (video.error?.code === 4 || /NotSupported/.test(msg)))
          return fail('This browser cannot play this stream.', 'unsupported');
        fail(
          ok ? msg : 'The live stream failed to load.',
          mediaErrorState({
            status: ok ? undefined : status,
            online: navigator.onLine,
          }),
        );
      })();
      return classifying;
    };
    video.addEventListener('error', () => classifyFailure());
    const native = video.canPlayType('application/vnd.apple.mpegurl');
    if (native) {
      video.src = url;
      tryPlay();
    } else {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (!alive) return;
          if (!Hls.isSupported())
            return fail('This browser cannot play HLS video.', 'unsupported');
          hls = new Hls({ lowLatencyMode: false, maxBufferLength: 10 });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data?.fatal)
              fail(
                `Live stream error (${data.details || data.type}).`,
                mediaErrorState({
                  status: data.response?.code,
                  online: navigator.onLine,
                  hlsDetails: data.details,
                }),
              );
          });
          hls.on(Hls.Events.MANIFEST_PARSED, () => tryPlay());
          hls.loadSource(url);
          hls.attachMedia(video);
        })
        .catch(() => fail('The HLS player could not be loaded.'));
    }
    stage.dataset.player = native ? 'native-hls' : 'hls.js';
    function cleanup() {
      if (!alive) return;
      alive = false;
      clearTimeout(connectTimer);
      clearInterval(stallTimer);
      try {
        hls?.destroy();
      } catch {
        /* ignore */
      }
      video.pause();
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        /* ignore */
      }
      if (lease)
        void fetch(url, { method: 'DELETE', keepalive: true }).catch(() => {});
    }
    return cleanup;
  }

  function showCamera(cam, index) {
    teardownMedia();
    const kind = mediaKindOf(cam);
    const info = providerInfo(cam.provider);
    current = { cam, index, cleanup: null };
    viewer.dataset.kind = kind;
    viewer.dataset.cameraId = cam.id;
    viewer.querySelector('#ee-cam-title').textContent = cam.name;
    viewer.querySelector('#ee-cam-kicker').textContent =
      `${info.short}${cam.city ? ` · ${cam.city}` : ''}`;
    viewer.querySelector('#ee-cam-meta').innerHTML = `
      <span class="ee-badge" data-media="${kind}">${esc(MEDIA_BADGE[kind])}</span>
      <span class="ee-dim">${esc(
        kind === 'live'
          ? 'Live HLS stream published by the provider'
          : kind === 'clip'
            ? 'Short recorded clip published by the provider (not live)'
            : kind === 'still'
              ? info.cadence
              : 'The provider publishes no usable media for this camera',
      )}</span>
      ${cam.headingConfidence === 'low' ? '<span class="ee-dim">Facing direction estimated</span>' : ''}`;
    viewer.querySelector('#ee-cam-pos').textContent =
      index >= 0 && state.list.length
        ? `${index + 1} / ${state.list.length.toLocaleString('en-US')}`
        : '—';
    for (const b of viewer.querySelectorAll('[data-viewer-step]'))
      b.disabled = !(index >= 0 && state.list.length > 1);
    viewer.querySelector('#ee-cam-attrib').innerHTML = `
      <p><b>Source:</b> ${esc(cam.provider)}${info.home ? ` · <a href="${esc(info.home)}" target="_blank" rel="noopener noreferrer">provider site ↗</a>` : ''}</p>
      ${cam.license ? `<p class="ee-dim">${esc(cam.license)}</p>` : ''}
      <p class="ee-dim">Public camera shown through this server on demand. Not recorded. Not for emergency, navigation or surveillance use.</p>`;
    const src = viewer.querySelector('#ee-cam-source');
    if (info.home) {
      src.href = info.home;
      src.hidden = false;
    } else src.hidden = true;
    delete stage.dataset.error;
    delete stage.dataset.fresh;
    if (kind === 'live') current.cleanup = mountLive(cam);
    else if (kind === 'clip') current.cleanup = mountClip(cam);
    else if (kind === 'still') current.cleanup = mountStill(cam);
    else
      unavailable('This provider publishes no playable media for this camera.');
  }

  // Fullscreen: the element API where it exists; iPhone Safari only allows
  // it on the <video> itself (webkitEnterFullscreen), and a still falls back
  // to the stage.
  function fullscreen() {
    const video = stage.querySelector('video');
    const target = stage;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(
          document,
        );
        return true;
      }
      if (target.requestFullscreen) {
        void target.requestFullscreen().catch(() => {
          if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
        });
        return true;
      }
      if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
        return true;
      }
      if (video?.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
        return true;
      }
    } catch {
      /* fall through */
    }
    setLine('Fullscreen is not available in this browser.', 'warn');
    return false;
  }

  function openViewer(cameraId, index = -1) {
    if (!state.cameras.length) {
      void loadCatalog().then(() => {
        recompute();
        const i = state.list.findIndex((c) => c.id === cameraId);
        if (state.cameras.some((c) => c.id === cameraId))
          openViewer(cameraId, i);
      });
      // Catalog not loaded yet — request accepted; open completes after load.
      return {
        ok: true,
        status: 'PARTIAL',
        pending: true,
        known: false,
        id: String(cameraId),
      };
    }
    const cam = state.cameras.find((c) => c.id === cameraId);
    if (!cam) {
      // Never open a different camera: say this id is not in the catalog.
      teardownMedia();
      current = null;
      viewer.hidden = false;
      document.documentElement.dataset.eeViewer = 'open';
      viewer.dataset.cameraId = String(cameraId);
      viewer.dataset.kind = 'none';
      viewer.querySelector('#ee-cam-title').textContent = String(cameraId);
      viewer.querySelector('#ee-cam-meta').innerHTML = '';
      viewer.querySelector('#ee-cam-attrib').innerHTML = '';
      unavailable('This camera is not in the current camera catalog.');
      status(`Camera not in catalog: ${cameraId}`, 'warn');
      onViewerOpen?.(viewer);
      return {
        ok: false,
        status: 'FAILED',
        known: false,
        id: String(cameraId),
        error: 'This camera is not in the current camera catalog.',
      };
    }
    if (index < 0) {
      if (!state.list.length) recompute();
      index = state.list.findIndex((c) => c.id === cameraId);
    }
    viewer.hidden = false;
    document.documentElement.dataset.eeViewer = 'open';
    const kind = mediaKindOf(cam);
    status(
      `Opening ${cam.name || cameraId} · ${MEDIA_BADGE[kind] || kind || 'camera'}`,
      'info',
    );
    showCamera(cam, index);
    onViewerOpen?.(viewer);
    viewer.querySelector('[data-viewer-close]').focus({ preventScroll: true });
    return {
      ok: true,
      status: 'SUCCESS',
      known: true,
      id: String(cameraId),
      kind,
    };
  }

  function closeViewer() {
    if (viewer.hidden) return false;
    try {
      if (document.fullscreenElement)
        void document.exitFullscreen?.().catch(() => {});
    } catch {
      /* ignore */
    }
    teardownMedia();
    current = null;
    viewer.hidden = true;
    delete document.documentElement.dataset.eeViewer;
    status('Camera closed', 'info');
    onViewerClose?.(viewer);
    return true;
  }

  viewer.addEventListener('click', (event) => {
    if (event.target.closest('[data-viewer-close]')) return closeViewer();
    if (event.target.closest('[data-viewer-retry]') && current)
      return showCamera(current.cam, current.index);
    if (event.target.closest('[data-viewer-fullscreen]')) return fullscreen();
    const step = event.target.closest('[data-viewer-step]');
    if (step && current && state.list.length) {
      const i = stepIndex(
        current.index,
        Number(step.dataset.viewerStep),
        state.list.length,
      );
      if (i >= 0) showCamera(state.list[i], i);
    }
  });
  bindSwipeClose(viewer.querySelector('.ee-sheet-head'), viewer, closeViewer);

  signal?.addEventListener(
    'abort',
    () => {
      closeViewer();
      viewer.remove();
    },
    { once: true },
  );

  return {
    render,
    attach,
    detach,
    openViewer,
    closeViewer,
    loadCatalog,
    isViewerOpen: () => !viewer.hidden,
    get state() {
      return state;
    },
  };
}

/**
 * Swipe-down-to-close from a sheet's drag handle only (pointer events; the
 * handle is touch-action:none so the browser does not scroll instead).
 */
export function bindSwipeClose(header, sheet, close) {
  if (!header) return;
  let drag = null;
  header.addEventListener('pointerdown', (event) => {
    // Only the handle starts a dismiss drag; content and header text never do.
    if (!event.target.closest('.ee-handle')) return;
    drag = {
      y: event.clientY,
      t: performance.now(),
      dy: 0,
      id: event.pointerId,
    };
    header.setPointerCapture?.(event.pointerId);
  });
  header.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.dy = Math.max(0, event.clientY - drag.y);
    sheet.style.transform = drag.dy ? `translateY(${drag.dy}px)` : '';
  });
  const end = (event) => {
    if (!drag) return;
    const { dy, t } = drag;
    drag = null;
    sheet.style.transform = '';
    const ms = performance.now() - t;
    const tapHandle =
      dy < 6 &&
      event.type === 'pointerup' &&
      event.target.closest('.ee-handle');
    if (tapHandle || dy >= 64 || (dy >= 24 && dy / ms >= 0.5)) close();
  };
  header.addEventListener('pointerup', end);
  header.addEventListener('pointercancel', end);
}
