/**
 * Analyst panel: a text box over the deterministic Analyst tools
 * (analystTools.js). It shows only real tool output, each block with its
 * citations. AI summaries are off; nothing here is generated prose.
 */
import {
  AI_SUMMARIES_ENABLED,
  ANALYST_EXAMPLES,
  parseAnalystInput,
} from './analystTools.js';
import { chicagoClock } from './dataSourceRegistry.js';
import { earthEyeIdentity } from './analystIdentity.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

const TOOL_LABEL = {
  resolve_place: 'Resolve place',
  query_entities: 'Entities in region',
  locate_cameras: 'Cameras nearby',
  source_health: 'Source health',
  selected_entity: 'Selected entity',
  event_detail: 'Selected World Event',
  related_cameras: 'Related cameras',
  open_event_detail: 'Action · open event detail',
  show_layer: 'Action · show World Events',
  fly_to: 'Map action · fly to',
  select_entity: 'Map action · select',
  set_layer: 'Map action · layer',
};

const STATUS_TONE = {
  SUCCESS: 'live',
  PARTIAL: 'info',
  FAILED: 'bad',
  UNAVAILABLE: 'warn',
};

/**
 * @param {object} o
 * @param {{run:Function, getSelectedIdentity?:Function}} o.tools
 * @param {() => {lat:number, lon:number}} o.cameraCenter
 * @param {() => (object|null)} [o.getSelectedIdentity]
 * @param {AbortSignal} [o.signal]
 */
export function createAnalystPanel({
  tools,
  cameraCenter,
  getSelectedIdentity,
  signal,
}) {
  const state = {
    input: '',
    results: [],
    busy: false,
    error: '',
    selection: null,
  };
  let body = null;

  function readSelection() {
    try {
      const raw =
        typeof getSelectedIdentity === 'function'
          ? getSelectedIdentity()
          : tools?.getSelectedIdentity?.() || null;
      state.selection = raw ? earthEyeIdentity(raw) || raw : null;
    } catch {
      state.selection = null;
    }
    return state.selection;
  }
  readSelection();

  function onSelectionEvent() {
    readSelection();
    rerender();
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('gev:entity-selected', onSelectionEvent, {
      signal,
    });
    window.addEventListener('gev:entity-selection-cleared', onSelectionEvent, {
      signal,
    });
    window.addEventListener(
      'gev:awareness-subject-selected',
      onSelectionEvent,
      {
        signal,
      },
    );
    window.addEventListener('gev:awareness-subject-cleared', onSelectionEvent, {
      signal,
    });
  }

  function citationHtml(c) {
    const when = c.retrievedAt
      ? ` · retrieved ${esc(chicagoClock(c.retrievedAt))}`
      : '';
    const obs = c.observedAt
      ? ` · observed ${esc(chicagoClock(c.observedAt))}`
      : '';
    const name = c.url
      ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.provider)}</a>`
      : esc(c.provider);
    return `<li>${name} <span class="ee-dim">· ${esc(c.classification || '')}${when}${obs}</span></li>`;
  }

  function itemHtml(r, it, i) {
    const dist = Number.isFinite(it.distanceKm) ? `${it.distanceKm} km` : '';
    const coords = Number.isFinite(it.lat) && Number.isFinite(it.lon);
    const actions = [];
    if (r.kind === 'query' && coords)
      actions.push(
        `<button type="button" class="ee-btn" data-an-fly="${i}">Fly here</button>`,
      );
    if (r.kind === 'query' && it.layerId && it.id && r.tool !== 'source_health')
      actions.push(
        `<button type="button" class="ee-btn" data-an-select="${esc(it.layerId)}" data-an-id="${esc(it.id)}">${it.layerId === 'cctv' ? 'Open camera' : 'Select'}</button>`,
      );
    return `<li class="ee-an-item" data-an-row="${i}">
      <div class="ee-an-item-main"><b>${esc(it.label)}</b>
        <span class="ee-dim ee-mono">${esc([dist, it.detail].filter(Boolean).join(' · '))}</span></div>
      ${actions.length ? `<div class="ee-an-item-actions">${actions.join('')}</div>` : ''}
    </li>`;
  }

  function resultHtml(r, ri) {
    const status = r.status || (r.ok ? 'SUCCESS' : 'FAILED');
    const tone =
      STATUS_TONE[status] ||
      (r.ok ? (r.kind === 'action' ? 'info' : 'live') : 'bad');
    const head = `<header class="ee-an-result-head"><span class="ee-badge" data-tone="${tone}" data-an-status="${esc(status)}">${esc(status)}</span>
      <span class="ee-dim">${esc(r.kind === 'action' ? 'ACTION' : 'QUERY')}</span>
      <b>${esc(TOOL_LABEL[r.tool] || r.tool)}</b></header>`;
    if (!r.ok)
      return `<section class="ee-an-result" data-an-result="${esc(r.tool)}" data-an-ok="false">${head}<p class="ee-an-error">${esc(r.error)}</p></section>`;
    const total =
      r.total != null && r.total > r.items.length
        ? `<p class="ee-dim">Showing ${r.items.length} of ${r.total}.</p>`
        : '';
    return `<section class="ee-an-result" data-an-result="${esc(r.tool)}" data-an-ok="true" data-an-index="${ri}">${head}
      ${r.items.length ? `<ol class="ee-an-items">${r.items.map((it, i) => itemHtml(r, it, `${ri}:${i}`)).join('')}</ol>` : ''}
      ${total}
      ${r.note ? `<p class="ee-an-note">${esc(r.note)}</p>` : ''}
      ${r.citations?.length ? `<div class="ee-an-cites"><span class="ee-dim">Sources</span><ul>${r.citations.map(citationHtml).join('')}</ul></div>` : ''}
    </section>`;
  }

  function render(target, title) {
    body = target;
    if (title) title.textContent = 'ANALYST';
    const sel = state.selection;
    const selHtml = sel
      ? `<p class="ee-an-selection" data-an-selection role="status"><span class="ee-badge" data-tone="info">SELECTED</span> <b>${esc(sel.label)}</b> <span class="ee-dim ee-mono">${esc(sel.id)} · ${esc(sel.type)} · ${esc(sel.source)}</span></p>`
      : `<p class="ee-an-selection ee-dim" data-an-selection role="status">No globe selection — Analyst and map share one identity when you select an object.</p>`;
    body.innerHTML = `
      <div class="ee-an" data-analyst>
        <p class="ee-an-ai-off" data-ai-off role="status" ${typeof localStorage !== 'undefined' && localStorage.getItem('ee-ai-strip-dismissed') === '1' ? 'hidden' : ''}>${
          AI_SUMMARIES_ENABLED
            ? ''
            : '<b>AI off.</b> Tools + citations only. Paid OpenAI Analyst UNAVAILABLE (AO-0).<button type="button" class="ee-ai-dismiss" data-an-ai-dismiss aria-label="Dismiss">✕</button>'
        }</p>
        ${selHtml}
        <form class="ee-an-form" data-an-form autocomplete="off">
          <label class="ee-visually-hidden" for="ee-an-input">Ask the Analyst</label>
          <input id="ee-an-input" class="ee-input" type="search" enterkeyhint="go" maxlength="160"
            placeholder="cameras near Austin · earthquakes near Tokyo" value="${esc(state.input)}" />
          <button type="submit" class="ee-btn ee-btn-primary" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Working…' : 'Run'}</button>
        </form>
        <ul class="ee-an-examples">${ANALYST_EXAMPLES.map((e) => `<li><button type="button" class="ee-chip" data-an-example="${esc(e)}">${esc(e)}</button></li>`).join('')}</ul>
        ${state.error ? `<p class="ee-an-error" data-an-parse-error>${esc(state.error)}</p>` : ''}
        <div class="ee-an-results" data-an-results>${state.results.map(resultHtml).join('')}</div>
      </div>`;
  }

  async function ask(text) {
    state.input = String(text || '');
    state.error = '';
    const parsed = parseAnalystInput(state.input);
    if (parsed.error) {
      state.error = parsed.error;
      state.results = [];
      return rerender();
    }
    state.busy = true;
    state.results = [];
    rerender();
    let place = null;
    for (const step of parsed.plan) {
      if (step.center === 'view') {
        const sel = readSelection();
        if (sel && Number.isFinite(sel.lat) && Number.isFinite(sel.lon)) {
          place = {
            lat: sel.lat,
            lon: sel.lon,
            label: `selected · ${sel.label}`,
          };
        } else {
          const c = cameraCenter();
          place = { lat: c.lat, lon: c.lon, label: 'current view' };
        }
        continue;
      }
      let args = step.args;
      if (args === '$place') {
        if (!place) break;
        args = { lat: place.lat, lon: place.lon, label: place.label };
      } else if (step.at === '$place') {
        if (!place) break;
        args = { ...args, lat: place.lat, lon: place.lon };
      }
      const r = await tools.run(step.tool, args);
      state.results.push(r);
      if (step.tool === 'resolve_place') {
        const first = r.ok ? r.items[0] : null;
        place = first
          ? { lat: first.lat, lon: first.lon, label: first.label }
          : null;
      }
      if (!r.ok) break;
      rerender();
    }
    state.busy = false;
    rerender();
  }

  function rerender() {
    if (body?.isConnected && body.querySelector('[data-analyst]')) {
      const focused = document.activeElement?.id === 'ee-an-input';
      render(body);
      if (focused) body.querySelector('#ee-an-input')?.focus();
    }
  }

  function itemAt(key) {
    const [ri, ii] = String(key).split(':').map(Number);
    return state.results[ri]?.items?.[ii] || null;
  }

  /** Delegated events; the host panel body forwards them here. */
  async function onClick(event) {
    if (event.target.closest?.('[data-an-ai-dismiss]')) {
      try {
        localStorage.setItem('ee-ai-strip-dismissed', '1');
      } catch {
        /* private mode */
      }
      body?.querySelector?.('[data-ai-off]')?.setAttribute('hidden', '');
      return;
    }
    const ex = event.target.closest?.('[data-an-example]');
    if (ex) return ask(ex.dataset.anExample);
    const fly = event.target.closest?.('[data-an-fly]');
    if (fly) {
      const it = itemAt(fly.dataset.anFly);
      if (!it) return;
      const r = await tools.run('fly_to', {
        lat: it.lat,
        lon: it.lon,
        label: String(it.label).slice(0, 120),
      });
      state.results.push(r);
      return rerender();
    }
    const sel = event.target.closest?.('[data-an-select]');
    if (sel) {
      const r = await tools.run('select_entity', {
        layerId: sel.dataset.anSelect,
        id: sel.dataset.anId,
      });
      if (!r.ok || sel.dataset.anSelect !== 'cctv') {
        state.results.push(r);
        rerender();
      }
    }
  }

  function onSubmit(event) {
    if (!event.target.closest?.('[data-an-form]')) return false;
    event.preventDefault();
    const v = event.target.querySelector('#ee-an-input')?.value || '';
    ask(v);
    return true;
  }

  return {
    render,
    ask,
    onClick,
    onSubmit,
    get state() {
      return state;
    },
  };
}

/** Bundled starting points (the same preset ids the app's fly-to accepts). */
const QUICK_PLACES = Object.freeze([
  ['Austin', 30.2672, -97.7431],
  ['San Francisco', 37.7749, -122.4194],
  ['New York', 40.7128, -74.006],
  ['Washington, DC', 38.9072, -77.0369],
  ['London', 51.5074, -0.1278],
  ['Paris', 48.8566, 2.3522],
  ['Dubai', 25.2048, 55.2708],
  ['Tokyo', 35.6762, 139.6503],
]);

/**
 * Explore panel: find a place (typed coordinates, airport code, or the
 * keyless OpenStreetMap lookup) and fly there. Uses the same validated tools
 * as the Analyst; moving the map only happens on a button press.
 */
export function createExplorePanel({
  tools,
  selectPlace = null,
  graphicsFailed = false,
}) {
  const state = {
    query: '',
    result: null,
    busy: false,
    flown: null,
    selectedNote: null,
  };
  let body = null;
  const mapDown = Boolean(graphicsFailed);

  function placeActions(i) {
    const selectBtn = `<button type="button" class="ee-btn ee-btn-primary" data-ex-select="${i}">Select location</button>`;
    const flyBtn = mapDown
      ? `<button type="button" class="ee-btn" data-ex-fly="${i}" data-ee-map-dependent="1" disabled aria-disabled="true" title="Fly here needs the 3D globe">Fly · UNAVAILABLE</button>`
      : `<button type="button" class="ee-btn" data-ex-fly="${i}">Fly here</button>`;
    return `${selectBtn}${flyBtn}`;
  }

  function render(target, title) {
    body = target || body;
    if (!body) return;
    if (title) title.textContent = 'EXPLORE';
    const r = state.result;
    body.innerHTML = `
      <div class="ee-an" data-explore>
        <form class="ee-an-form" data-ex-form autocomplete="off">
          <label class="ee-visually-hidden" for="ee-ex-input">Find a place</label>
          <input id="ee-ex-input" class="ee-input" type="search" enterkeyhint="search" maxlength="120"
            placeholder="City, address, airport code or lat, lon" value="${esc(state.query)}" />
          <button type="submit" class="ee-btn" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Finding…' : 'Find'}</button>
        </form>
        <p class="ee-dim" role="note"><b>Select location</b> sets the shared place for nearby cameras / queries (no fly). <b>Fly here</b>${mapDown ? ' is UNAVAILABLE without 3D.' : ' moves the globe.'} Nearby never claims “in view” without a real viewport.</p>
        ${
          r
            ? r.ok
              ? r.items.length
                ? `<section class="ee-an-result" data-ex-results><ol class="ee-an-items">${r.items
                    .map(
                      (
                        it,
                        i,
                      ) => `<li class="ee-an-item"><div class="ee-an-item-main"><b>${esc(it.label)}</b>
                    <span class="ee-dim ee-mono">${it.lat.toFixed(4)}, ${it.lon.toFixed(4)} · ${esc(it.kind)}</span></div>
                    <div class="ee-an-item-actions">${placeActions(i)}</div></li>`,
                    )
                    .join('')}</ol>
                  <div class="ee-an-cites"><span class="ee-dim">Source</span><ul>${r.citations
                    .map(
                      (c) =>
                        `<li>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.provider)}</a>` : esc(c.provider)}</li>`,
                    )
                    .join('')}</ul></div></section>`
                : `<p class="ee-an-note">${esc(r.note || 'No place found.')}</p>`
              : `<p class="ee-an-error">${esc(r.error)}</p>`
            : ''
        }
        ${state.selectedNote ? `<p class="ee-an-note" role="status" data-ex-selected>${esc(state.selectedNote)}</p>` : ''}
        ${state.flown ? `<p class="ee-an-note" role="status">${esc(state.flown)}</p>` : ''}
        <section class="ee-section"><h3 class="ee-section-h">Quick places</h3>
          <ul class="ee-an-examples">${QUICK_PLACES.map((p, i) => `<li><button type="button" class="ee-chip" data-ex-quick="${i}">${esc(p[0])}</button></li>`).join('')}</ul>
        </section>
        <p class="ee-dim">Place lookup: typed coordinates, a bundled airport list, then OpenStreetMap Nominatim through this server (no key). Not for navigation.</p>
      </div>`;
  }

  function rerender() {
    if (body?.isConnected && body.querySelector('[data-explore]')) render();
  }

  async function find(q) {
    state.query = String(q || '').trim();
    if (!state.query) return;
    state.busy = true;
    state.flown = null;
    rerender();
    state.result = await tools.run('resolve_place', {
      query: state.query.slice(0, 120),
      limit: 5,
    });
    state.busy = false;
    rerender();
  }

  async function fly(lat, lon, label) {
    const r = await tools.run('fly_to', {
      lat,
      lon,
      label: String(label).slice(0, 120),
    });
    state.flown = r.ok ? `Flying to ${label}.` : `Could not fly: ${r.error}`;
    rerender();
  }

  function selectLoc(lat, lon, label) {
    if (typeof selectPlace !== 'function') {
      state.selectedNote =
        'Select location unavailable — shared selection is not wired.';
      rerender();
      return;
    }
    const rec = selectPlace({ label, lat, lon, source: 'explore' });
    state.selectedNote = rec
      ? `SELECTED location · ${label} · ${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)} (nearby queries use this; Fly not required).`
      : 'Could not set shared location.';
    state.flown = null;
    rerender();
  }

  function onClick(event) {
    const s = event.target.closest?.('[data-ex-select]');
    if (s) {
      const it = state.result?.items?.[Number(s.dataset.exSelect)];
      if (it) selectLoc(it.lat, it.lon, it.label);
      return;
    }
    const f = event.target.closest?.('[data-ex-fly]');
    if (f) {
      if (mapDown) {
        state.flown = 'UNAVAILABLE — Fly here needs the 3D globe.';
        rerender();
        return;
      }
      const it = state.result?.items?.[Number(f.dataset.exFly)];
      if (it) void fly(it.lat, it.lon, it.label);
      return;
    }
    const q = event.target.closest?.('[data-ex-quick]');
    if (q) {
      const p = QUICK_PLACES[Number(q.dataset.exQuick)];
      if (!p) return;
      // Quick places: Select location (shared) — Fly remains a separate action on results.
      selectLoc(p[1], p[2], p[0]);
    }
  }

  function onSubmit(event) {
    if (!event.target.closest?.('[data-ex-form]')) return false;
    event.preventDefault();
    void find(event.target.querySelector('#ee-ex-input')?.value || '');
    return true;
  }

  return {
    render,
    onClick,
    onSubmit,
    find,
    get state() {
      return state;
    },
  };
}
