/**
 * EE-EVENTS-2/3 + FOLLOW honesty — filters + list + detail + RELATED.
 * Follow is UNAVAILABLE (no retention/notify). Related ≠ causal. SELECT ≠ FOLLOW.
 */

import {
  FILTER_KIND_CHIPS,
  SOURCE_FILTER_IDS,
  TIER_FILTER_IDS,
  emptyFilters,
  kindShortLabel,
  kindTone,
  toggleFilterValue,
} from './filters.js';
import { countListOnly } from './cohort.js';
import { buildEventDetail } from './detail.js';
import { mapActionAvailability } from './related.js';
import {
  EVENT_FOLLOW_CONTROL_LABEL,
  EVENT_FOLLOW_SELECT_NOTE,
  eventFollowAvailability,
} from './followAvailability.js';
import { sourceHealthLines, uiStatusFromFetch } from './statusCopy.js';
import { chicagoClock } from '../../atlas/dataSourceRegistry.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

/** Labeled America/Chicago clock from ISO or epoch ms; never invents time. */
function ctLabel(isoOrMs) {
  if (isoOrMs == null || isoOrMs === '') return '';
  const ms =
    typeof isoOrMs === 'number'
      ? isoOrMs
      : Date.parse(String(isoOrMs));
  if (!Number.isFinite(ms)) return '';
  return chicagoClock(ms);
}


function renderDetailHtml(detail, related, mapActs) {
  const sev =
    detail.severity == null
      ? `<li><span class="ee-dim">Severity</span> <span>null (not provided by source)</span></li>`
      : `<li><span class="ee-dim">Severity</span> <span>${esc(
          [detail.severity.label, detail.severity.value != null ? String(detail.severity.value) : null, detail.severity.scale]
            .filter(Boolean)
            .join(' · '),
        )} <span class="ee-dim">(source-provided)</span></span></li>`;
  const links = (detail.attribution.sourceLinks || [])
    .map(
      (u) =>
        `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`,
    )
    .join(' · ');
  const flyBtn = mapActs.flyTo.available
    ? `<button type="button" class="ee-btn" data-ee-we="fly" data-ee-map-dependent="1">FLY TO</button>`
    : `<button type="button" class="ee-btn" data-ee-we="fly" data-ee-map-dependent="1" disabled aria-disabled="true" title="${esc(mapActs.flyTo.reason)}">FLY TO · UNAVAILABLE</button>`;
  const showBtn = mapActs.showOnGlobe.available
    ? `<button type="button" class="ee-btn" data-ee-we="show" data-ee-map-dependent="1">SHOW ON GLOBE</button>`
    : `<button type="button" class="ee-btn" data-ee-we="show" data-ee-map-dependent="1" disabled aria-disabled="true" title="${esc(mapActs.showOnGlobe.reason)}">SHOW ON GLOBE · UNAVAILABLE</button>`;
  const followActs = eventFollowAvailability({
    eventId: detail.eventId,
    selected: true,
  });
  const followBtn = followActs.available
    ? `<button type="button" class="ee-btn" data-ee-we="follow" data-ee-follow="1">FOLLOW</button>`
    : `<button type="button" class="ee-btn" data-ee-we="follow" data-ee-follow="unavailable" disabled aria-disabled="true" title="${esc(followActs.reason)}">${esc(EVENT_FOLLOW_CONTROL_LABEL)}</button>`;

  const relatedHtml = renderRelatedHtml(related, detail.relatedBanner);

  return `<section class="ee-we-detail" data-ee-we-detail="1" aria-live="polite">
    <div class="ee-we-disclosure-head">
      <span class="ee-badge" data-tone="${detail.newsIsNotOfficial ? 'warn' : detail.kindTone === 'official' ? 'live' : 'info'}">${esc(detail.kindLabel)}</span>
      <b>${esc(detail.name)}</b>
      <button type="button" class="ee-btn ee-we-clear" data-ee-we="clear">Clear</button>
    </div>
    <details class="ee-we-id-expand">
      <summary class="ee-mono ee-dim">ID · tap to expand</summary>
      <p class="ee-mono ee-we-id">${esc(detail.eventId)}</p>
    </details>
    <ul class="ee-we-disclosure-lines">
      <li><span class="ee-dim">Kind</span> <span>${esc(
        detail.newsIsNotOfficial
          ? 'NEWS REPORT (not an official alert / sensor fact)'
          : detail.kind,
      )}</span></li>
      <li><span class="ee-dim">Source(s)</span> <span>${esc(
        (detail.sources || []).join(' · ') || detail.attribution.credit,
      )}</span></li>
      <li><span class="ee-dim">Attribution</span> <span>${esc(detail.attribution.credit)}${
        detail.attribution.license ? ` · ${esc(detail.attribution.license)}` : ''
      }</span></li>
      ${links ? `<li><span class="ee-dim">Source links</span> <span class="ee-we-links">${links}</span></li>` : ''}
      <li><span class="ee-dim">Event time</span> <span>${esc(detail.times.event || 'not reported by source')}${detail.times.eventStart ? ` <span class="ee-dim">(CT ${esc(ctLabel(detail.times.eventStart))})</span>` : ''}</span></li>
      <li><span class="ee-dim">Retrieved</span> <span>${esc(detail.times.retrieved || 'not reported')}${detail.times.retrieved ? ` <span class="ee-dim">(CT ${esc(ctLabel(detail.times.retrieved))})</span>` : ''}</span></li>
      <li><span class="ee-dim">Published</span> <span>${esc(detail.times.published || 'not reported by source')}${detail.times.published ? ` <span class="ee-dim">(CT ${esc(ctLabel(detail.times.published))})</span>` : ''}</span></li>
      <li><span class="ee-dim">Precision</span> <span>${esc(detail.geometry.precision)}${
        detail.geometry.imprecise ? ' (imprecise)' : ''
      }</span></li>
      <li><span class="ee-dim">Geometry</span> <span>${esc(detail.geometry.note)}${
        detail.geometry.regionName ? ` · ${esc(detail.geometry.regionName)}` : ''
      }${
        detail.geometry.anchor
          ? ` · ${esc(String(detail.geometry.anchor.lat))},${esc(String(detail.geometry.anchor.lon))}`
          : ''
      }</span></li>
      ${sev}
      <li><span class="ee-dim">Status / revision</span> <span>${esc(
        detail.status || detail.revisionState || 'not reported',
      )}</span></li>
    </ul>
    <div class="ee-we-map-actions" role="group" aria-label="Map and follow actions">
      ${flyBtn}
      ${showBtn}
      ${followBtn}
    </div>
    <p class="ee-dim ee-we-follow-note" data-ee-we-follow-note="1">${esc(EVENT_FOLLOW_SELECT_NOTE)}</p>
    ${
      !mapActs.flyTo.available || !mapActs.showOnGlobe.available
        ? `<p class="ee-dim ee-we-map-unavail">${esc(
            mapActs.flyTo.reason || mapActs.showOnGlobe.reason || '',
          )}</p>`
        : ''
    }
    ${
      !followActs.available
        ? `<p class="ee-dim ee-we-follow-unavail" data-ee-we-follow-unavail="1" role="status">${esc(followActs.reason)}</p>`
        : ''
    }
    ${relatedHtml}
  </section>`;
}

function renderRelatedHtml(related, banner) {
  const note = esc(banner || related?.note || 'RELATED — not causal proof.');
  if (!related) {
    return `<section class="ee-we-related" data-ee-we-related="1">
      <h3 class="ee-section-h">RELATED conditions</h3>
      <p class="ee-badge" data-tone="info">RELATED</p>
      <p class="ee-dim">${note}</p>
      <p class="ee-dim">Loading related EE data…</p>
    </section>`;
  }
  const cam = related.cameras || {};
  const camItems = (cam.items || [])
    .map((c) => {
      const dist = Number.isFinite(c.distanceKm) ? `${c.distanceKm} km` : '';
      const view = c.inView ? ' · in view' : '';
      return `<li><span class="ee-badge" data-tone="muted">RELATED</span> <b>${esc(c.label)}</b> <span class="ee-dim">${esc(dist)}${esc(view)}${c.provider ? ` · ${esc(String(c.provider))}` : ''}</span></li>`;
    })
    .join('');
  const layerBlock = (key, label) => {
    const block = related[key] || {};
    if (!block.available) {
      return `<div class="ee-we-related-layer" data-layer="${esc(key)}">
        <h4 class="ee-we-related-h">${esc(label)}</h4>
        <p class="ee-dim">${esc(block.reason || 'No related EE data loaded.')}</p>
      </div>`;
    }
    const items = (block.items || [])
      .map(
        (it) =>
          `<li><span class="ee-badge" data-tone="muted">RELATED</span> <b>${esc(it.label)}</b> <span class="ee-dim">${Number.isFinite(it.distanceKm) ? esc(String(it.distanceKm) + ' km') : ''}${it.detail ? ` · ${esc(it.detail)}` : ''}</span></li>`,
      )
      .join('');
    return `<div class="ee-we-related-layer" data-layer="${esc(key)}">
      <h4 class="ee-we-related-h">${esc(label)}</h4>
      <ul class="ee-we-related-list">${items}</ul>
    </div>`;
  };
  return `<section class="ee-we-related" data-ee-we-related="1">
    <h3 class="ee-section-h">RELATED conditions</h3>
    <p class="ee-we-related-banner"><span class="ee-badge" data-tone="info">RELATED</span> <span class="ee-dim">${note}</span></p>
    <p class="ee-dim ee-we-related-never">Never labeled CAUSED BY. Proximity ≠ causation.</p>
    <div class="ee-we-related-layer" data-layer="cameras">
      <h4 class="ee-we-related-h">Nearby cameras</h4>
      ${
        cam.items?.length
          ? `<ul class="ee-we-related-list">${camItems}</ul>`
          : `<p class="ee-dim">${esc(cam.reason || 'No nearby cameras.')}</p>`
      }
    </div>
    ${layerBlock('weather', 'Weather')}
    ${layerBlock('alerts', 'Alerts')}
    ${layerBlock('aircraft', 'Aircraft')}
    ${layerBlock('fires', 'Fires')}
  </section>`;
}


/**
 * @param {{
 *   getState: () => object,
 *   onToggleKind: (id: string) => void,
 *   onToggleTier: (id: string) => void,
 *   onToggleSource: (id: string) => void,
 *   onSelect: (eventId: string) => void,
 *   onRefresh: () => void,
 *   onToggleMarkers: () => void,
 *   onClearSelection: () => void,
 *   onFlyTo?: () => void,
 *   onShowOnGlobe?: () => void,
 *   rendererDown?: boolean,
 * }} api
 */
export function createWorldEventsPanel(api) {
  let body = null;

  function render(target, titleEl) {
    body = target || body;
    if (!body) return;
    if (titleEl) titleEl.textContent = 'WORLD EVENTS';
    const state = api.getState();
    const filters = state.filters || emptyFilters();
    const status = uiStatusFromFetch({
      phase: state.phase,
      health: state.health,
      eventCount: state.eventCount,
      filteredCount: state.filteredEvents?.length || 0,
      error: state.error,
    });
    const sources = sourceHealthLines(state.sources || []);
    const selected = state.selectedEvent || null;
    const detail = selected ? buildEventDetail(selected) : null;
    const related = state.relatedConditions || null;
    const rendererDown = Boolean(
      state.rendererDown ?? api.rendererDown ?? false,
    );
    const mapActs = mapActionAvailability({
      rendererDown,
      hasAnchor: Boolean(detail?.geometry?.hasPlottableAnchor),
    });
    const listOnly = countListOnly(state.filteredEvents || []);
    const markerCount = state.markerCohort?.length || 0;

    body.innerHTML = `
      <div class="ee-we" data-ee-world-events-panel="1">
        <p class="ee-we-lede ee-dim">Authentic registry events only. <b>NEWS ≠ OFFICIAL</b>. City/region stays imprecise. <b>RELATED ≠ CAUSED BY</b>. <b>SELECT ≠ FOLLOW</b> — Follow is UNAVAILABLE (no retention or notify mechanism; no alert delivery; no continuous watch claim).</p>
        <div class="ee-we-status" data-tone="${esc(status.tone)}" role="status">
          <span class="ee-badge" data-tone="${esc(status.tone === 'ok' ? 'live' : status.tone === 'warn' ? 'warn' : status.tone === 'bad' ? 'bad' : 'info')}">${esc(status.code)}</span>
          <b>${esc(status.title)}</b>
          <span class="ee-dim">${esc(status.detail)}</span>
          <button type="button" class="ee-btn ee-we-refresh" data-ee-we="refresh">Refresh</button>
        </div>
        <section class="ee-we-filters" aria-label="World Event filters">
          <h3 class="ee-section-h">Kind</h3>
          <div class="ee-we-chips" role="group">
            ${FILTER_KIND_CHIPS.map((c) => {
              const on = filters.kinds.includes(c.id);
              return `<button type="button" class="ee-chip" data-ee-we-kind="${esc(c.id)}" aria-pressed="${on}" data-tone="${esc(c.tone)}" title="${esc(c.note || c.label)}">${esc(c.label)}</button>`;
            }).join('')}
          </div>
          <h3 class="ee-section-h">Tier</h3>
          <div class="ee-we-chips" role="group">
            ${TIER_FILTER_IDS.map((t) => {
              const on = filters.tiers.includes(t);
              return `<button type="button" class="ee-chip" data-ee-we-tier="${esc(t)}" aria-pressed="${on}">Tier ${esc(t)}</button>`;
            }).join('')}
          </div>
          <h3 class="ee-section-h">Source</h3>
          <div class="ee-we-chips ee-we-chips-wrap" role="group">
            ${SOURCE_FILTER_IDS.map((s) => {
              const on = filters.sources.includes(s);
              const health = sources.find((x) => x.id === s);
              const badge = health ? health.health : '';
              return `<button type="button" class="ee-chip" data-ee-we-source="${esc(s)}" aria-pressed="${on}" title="${esc(badge || s)}">${esc(s)}${badge && health?.attention ? ` · ${esc(badge)}` : ''}</button>`;
            }).join('')}
          </div>
        </section>
        <section class="ee-we-markers-bar">
          ${
            rendererDown
              ? `<p class="ee-we-map-unavail" role="status"><b>Map unavailable</b> — ${(state.filteredEvents || []).length} records in list; <b>${markerCount}</b> have map locations (list + detail still work). Do not claim globe markers are on.</p>
                 <button type="button" class="ee-btn" data-ee-we="markers" disabled aria-disabled="true" title="Globe markers need the 3D renderer">MARKERS · UNAVAILABLE</button>
                 <span class="ee-dim">${listOnly} list-only (imprecise / no point)</span>`
              : `<button type="button" class="ee-btn" data-ee-we="markers" aria-pressed="${Boolean(state.markersOn)}">
            ${state.markersOn ? 'GLOBE MARKERS ON' : 'GLOBE MARKERS OFF'}
          </button>
          <span class="ee-dim">${markerCount} marker(s) · ${listOnly} list-only (imprecise / no point)</span>`
          }
        </section>
        ${
          sources.some((s) => s.attention)
            ? `<section class="ee-we-source-health" aria-label="Source health">
                <h3 class="ee-section-h">Source health</h3>
                <ul class="ee-we-health-list">${sources
                  .filter((s) => s.attention || s.count > 0)
                  .map(
                    (s) =>
                      `<li><code>${esc(s.id)}</code> <span class="ee-badge" data-tone="${s.attention ? 'warn' : 'muted'}">${esc(s.health)}</span>${s.count ? ` · ${s.count}` : ''}${s.reason ? ` — <span class="ee-dim">${esc(s.reason)}</span>` : ''}</li>`,
                  )
                  .join('')}</ul>
              </section>`
            : ''
        }
        ${
          detail
            ? renderDetailHtml(detail, related, mapActs)
            : `<p class="ee-dim ee-we-noselect">Select an event (list or globe marker) for the detail panel — provenance, geometry honesty, and RELATED conditions (not causation).</p>`
        }
        <section class="ee-we-list" aria-label="World Events list">
          <h3 class="ee-section-h">Events (${(state.filteredEvents || []).length})</h3>
          ${
            !(state.filteredEvents || []).length
              ? `<p class="ee-we-empty ee-dim">${esc(status.detail)}</p>`
              : `<ol class="ee-we-items">${(state.filteredEvents || [])
                  .slice(0, 120)
                  .map((ev) => {
                    const on = selected?.eventId === ev.eventId;
                    const tone = kindTone(ev.kind);
                    return `<li class="ee-we-item${on ? ' is-selected' : ''}">
                      <button type="button" class="ee-we-item-btn" data-ee-we-select="${esc(ev.eventId)}">
                        <span class="ee-badge" data-tone="${tone === 'news' ? 'warn' : tone === 'official' ? 'live' : 'info'}">${esc(kindShortLabel(ev.kind))}</span>
                        <span class="ee-we-item-main"><b>${esc(ev.title || ev.eventId)}</b>
                          <span class="ee-dim ee-mono">${esc(ev.eventId)} · ${esc(ev.precision || '?')} · ${esc(ev.eventTime?.start || 'time n/a')}</span>
                        </span>
                      </button>
                    </li>`;
                  })
                  .join('')}</ol>${
                  (state.filteredEvents || []).length > 120
                    ? `<p class="ee-dim" data-ee-we-page>Page 1 · showing 120 of ${(state.filteredEvents || []).length} matching events (list bounded; kinds/filters preserved). RELATED ≠ causation.</p>`
                    : `<p class="ee-dim" data-ee-we-page>${(state.filteredEvents || []).length} matching event(s). RELATED ≠ causation.</p>`
                }`
          }
        </section>
      </div>`;
  }

  function onClick(event) {
    const t = event.target.closest?.('[data-ee-we],[data-ee-we-kind],[data-ee-we-tier],[data-ee-we-source],[data-ee-we-select]');
    if (!t) return;
    if (t.dataset.eeWe === 'refresh') {
      api.onRefresh();
      return;
    }
    if (t.dataset.eeWe === 'markers') {
      api.onToggleMarkers();
      return;
    }
    if (t.dataset.eeWe === 'clear') {
      api.onClearSelection();
      return;
    }
    if (t.dataset.eeWe === 'fly') {
      api.onFlyTo?.();
      return;
    }
    if (t.dataset.eeWe === 'show') {
      api.onShowOnGlobe?.();
      return;
    }
    if (t.dataset.eeWeKind) {
      api.onToggleKind(t.dataset.eeWeKind);
      return;
    }
    if (t.dataset.eeWeTier) {
      api.onToggleTier(t.dataset.eeWeTier);
      return;
    }
    if (t.dataset.eeWeSource) {
      api.onToggleSource(t.dataset.eeWeSource);
      return;
    }
    if (t.dataset.eeWeSelect) {
      api.onSelect(t.dataset.eeWeSelect);
    }
  }

  function rerender() {
    if (body?.isConnected && body.querySelector('[data-ee-world-events-panel]'))
      render();
  }

  return { render, onClick, rerender };
}

export { emptyFilters, toggleFilterValue };
