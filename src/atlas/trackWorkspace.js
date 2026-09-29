/**
 * TRACK workspace (OPERATOR UX): AIR / MIL / SEA / SPACE with real counts
 * and freshness from the source-status store — no invented numbers.
 */
import { chicagoClock, sourceFor } from './dataSourceRegistry.js';

const BANDS = Object.freeze([
  {
    id: 'air',
    label: 'AIR',
    layers: ['flights', 'local-adsb'],
    note: 'Civil / local ADS-B',
  },
  {
    id: 'mil',
    label: 'MIL',
    layers: ['military'],
    note: 'Military flights',
  },
  {
    id: 'sea',
    label: 'SEA',
    layers: ['ais-live-vessels'],
    note: 'AIS vessels',
  },
  {
    id: 'space',
    label: 'SPACE',
    layers: ['satellites', 'rocket-launches'],
    note: 'Satellites / launches',
  },
]);

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

function bandHtml(band, getStatus, isLayerOn, { graphicsFailed = false } = {}) {
  const rows = band.layers.map((id) => {
    const src = sourceFor(id);
    const st = getStatus?.(id) || {};
    const on = Boolean(isLayerOn?.(id));
    const count =
      Number.isFinite(st.count) ? st.count
      : Number.isFinite(st.loaded) ? st.loaded
      : null;
    const when = st.lastSuccessAt || st.updatedAt || st.lastOkAt || null;
    const fresh = when ? `${esc(chicagoClock(when))}` : 'never';
    // Runtime status from the source-status store — never the static catalog
    // class alone (that produced LIVE beside BROKEN/UNAVAILABLE for local-adsb).
    const classLabel = st.status || src.classification || '';
    const tone = st.error || /BROKEN|UNAVAILABLE/i.test(classLabel)
      ? 'bad'
      : on
        ? 'live'
        : 'off';
    const countLabel = count == null ? '—' : String(count);
    const offExplain = !on
      ? fresh === 'never'
        ? ' · OFF · never attempted (Show enables list/details)'
        : ' · OFF'
      : graphicsFailed
        ? ' · ON · list/details · globe markers UNAVAILABLE'
        : '';
    const nearestBtn = on
      ? graphicsFailed
        ? `<button type="button" class="ee-btn" data-track-focus="${esc(id)}" disabled aria-disabled="true" title="Nearest needs 3D viewport">Nearest · UNAVAILABLE</button>`
        : `<button type="button" class="ee-btn" data-track-focus="${esc(id)}">Nearest</button>`
      : '';
    return `<li class="ee-track-row" data-layer="${esc(id)}">
      <div class="ee-track-row-main">
        <b>${esc(src.name || id)}</b>
        <span class="ee-badge" data-tone="${tone}">${on ? 'ON' : 'OFF'}</span>
        <span class="ee-mono ee-dim">${esc(countLabel)}</span>
      </div>
      <div class="ee-dim ee-track-fresh">${esc(classLabel)} · ${fresh}${offExplain}${st.error ? ` · ${esc(st.error)}` : ''}</div>
      <div class="ee-track-actions">
        <button type="button" class="ee-btn" data-track-layer="${esc(id)}" data-on="${on ? '0' : '1'}">${on ? 'Hide' : 'Show'}</button>
        ${nearestBtn}
      </div>
    </li>`;
  });
  return `<section class="ee-track-band" data-band="${band.id}">
    <header><h3>${band.label}</h3><span class="ee-dim">${esc(band.note)}</span></header>
    <ul>${rows.join('')}</ul>
  </section>`;
}

/**
 * @param {object} o
 * @param {(id:string)=>object} o.getStatus
 * @param {(id:string)=>boolean} o.isLayerOn
 * @param {(id:string, on:boolean)=>Promise<void>|void} o.setLayer
 */
export function createTrackWorkspace({
  getStatus,
  isLayerOn,
  setLayer,
  getNearby = null,
  flyTo = null,
  graphicsFailed = false,
}) {
  let body = null;
  let lastActionNote = '';

  function render(target, title) {
    body = target;
    if (title) title.textContent = 'TRACK';
    const non3d = graphicsFailed
      ? `<p class="ee-track-non3d ee-dim" role="status"><b>NON-3D:</b> Show enables list/details (no silent no-op). Globe markers / Follow / Cockpit stay UNAVAILABLE until 3D recovers.</p>`
      : '';
    body.innerHTML = `
      <div class="ee-track" data-track-workspace>
        <p class="ee-track-contract" role="note"><b>SELECT</b> highlights a contact. <b>FOLLOW</b> keeps the camera on its live position (STALE when the feed goes quiet). Cockpit needs a followed aircraft — otherwise it explains why.</p>
        ${non3d}
        ${lastActionNote ? `<p class="ee-an-note" role="status" data-track-note>${esc(lastActionNote)}</p>` : ''}
        ${BANDS.map((b) => bandHtml(b, getStatus, isLayerOn, { graphicsFailed })).join('')}
      </div>`;
    syncSelection(selected);
  }

  function rerender() {
    if (body) render(body);
  }

  async function onClick(event) {
    const focus = event.target.closest('[data-track-focus]');
    if (focus) {
      const id = focus.getAttribute('data-track-focus');
      if (graphicsFailed) {
        lastActionNote =
          'Nearest UNAVAILABLE — needs a 3D viewport (or a selected place with coords). Layer list/details still work after Show.';
        rerender();
        return;
      }
      if (!isLayerOn?.(id)) await setLayer?.(id, true);
      const near = getNearby?.(id);
      if (near && Number.isFinite(near.lat) && Number.isFinite(near.lon)) {
        await flyTo?.(near);
        syncSelection({ layerId: id, id: near.id, label: near.label });
        lastActionNote = `Nearest ${near.label || near.id || id}`;
      } else {
        syncSelection({ layerId: id, id: null });
        lastActionNote = `No nearby contact for ${id} (layer may be empty or still loading).`;
      }
      rerender();
      return;
    }
    const btn = event.target.closest('[data-track-layer]');
    if (!btn) return;
    const id = btn.getAttribute('data-track-layer');
    const on = btn.getAttribute('data-on') === '1';
    const before = Boolean(isLayerOn?.(id));
    const result = await setLayer?.(id, on);
    const after = Boolean(isLayerOn?.(id));
    if (result?.ok === false) {
      lastActionNote = result.error || `Show/Hide failed for ${id}`;
    } else if (before === after && before !== on) {
      lastActionNote = `No change for ${id} — enablement did not apply (not a silent success).`;
    } else if (on && graphicsFailed) {
      lastActionNote = `${id} ON for list/details. Globe render UNAVAILABLE. Follow/Cockpit UNAVAILABLE.`;
    } else if (!on) {
      lastActionNote = `${id} OFF.`;
    } else {
      lastActionNote = `${id} ON.`;
    }
    rerender();
  }

  let selected = null; // { layerId, id }

  function syncSelection(subject) {
    selected = subject?.id
      ? { layerId: subject.layerId, id: subject.id }
      : null;
    if (!body) return;
    for (const row of body.querySelectorAll('.ee-track-row')) {
      const id = row.getAttribute('data-layer');
      const on =
        selected &&
        (selected.layerId === id ||
          (id === 'flights' && selected.layerId === 'local-adsb') ||
          (id === 'military' && selected.layerId === 'military'));
      row.classList.toggle('ee-track-selected', Boolean(on));
    }
  }

  return { render, onClick, rerender, BANDS, syncSelection };
}
