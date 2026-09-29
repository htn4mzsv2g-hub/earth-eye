/**
 * Earth Eye DATA SOURCES screen and layer-row badges (DOM).
 *
 * Both read the single registry in ./dataSourceRegistry.js, so the badge on
 * a layer row and the row on this screen can never disagree.
 */
import {
  CLASSIFICATIONS,
  CLASSIFICATION_TONE,
  DATA_SOURCES,
  HEALTH_STATES,
  HEALTH_TONE,
  chicagoClock,
  createSourceStatusStore,
  relativeAge,
  sourceFor,
} from './dataSourceRegistry.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const cssEscape = (s) =>
  typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(String(s))
    : String(s).replace(/[^a-zA-Z0-9_-]/g, '\$&');

/**
 * The one source-status store for this session. Layers report into it (via
 * the dataManager stats reported below and in console.js); the Data Sources
 * screen, the layer-row badges and any future reader use
 * sourceStatus.getSourceStatus() / sourceStatus.subscribe().
 */
export const sourceStatus = createSourceStatusStore();
/** Back-compat alias (lastSuccess / lastError). */
export const refreshTracker = sourceStatus;

/** Layers as dataManager reports them, reported into the store. */
function currentLayers(dataManager) {
  let rows = [];
  try {
    rows = dataManager.getAll();
  } catch {
    rows = [];
  }
  sourceStatus.reportLayers(rows);
  return rows;
}

function permText(st) {
  const p = st.permissions || {};
  const keys = ['display', 'embed', 'proxy', 'store', 'export', 'analyze'];
  const parts = keys
    .filter((k) => p[k] && p[k] !== 'n/a')
    .map((k) => `${k} ${p[k]}`);
  return `${st.review === 'approved' ? 'Approved' : 'Pending review'} · ${parts.join(' · ')} · commercial ${st.commercialUse} · AI use ${st.aiUse}`;
}

const clsOf = (st) => ({
  classification: st.status,
  tone: st.tone,
  fallback: st.fallback,
  feed: st.feed,
  reason: st.reason,
});

/**
 * Registry rows for every layer the app has (plus registry entries the build
 * does not register, so nothing silently disappears from the audit view).
 */
export function dataSourceRows(dataManager) {
  const layers = currentLayers(dataManager);
  const seen = new Set();
  const rows = layers
    .filter((l) => l.showInTogglePanel !== false || DATA_SOURCES[l.id])
    .map((layer) => {
      seen.add(layer.id);
      const entry = sourceFor(layer.id, layer.name);
      const stats = layer.stats || {};
      const status = sourceStatus.getSourceStatus(layer.id);
      return {
        id: layer.id,
        layer,
        entry,
        stats,
        status,
        cls: clsOf(status),
        registered: true,
      };
    });
  for (const [id, entry] of Object.entries(DATA_SOURCES)) {
    if (seen.has(id)) continue;
    const status = sourceStatus.getSourceStatus(id);
    rows.push({
      id,
      layer: null,
      entry,
      stats: {},
      status,
      cls: clsOf(status),
      registered: false,
    });
  }
  return rows;
}

/** Short row label for a disabled source, from its registry reason. */
export function disabledLabel(reason) {
  const r = String(reason || '');
  if (/^Blocked/.test(r)) return 'BLOCKED';
  if (/^Excluded/.test(r)) return 'EXCLUDED';
  if (/commercial-safe/i.test(r)) return 'OFF (COMMERCIAL-SAFE)';
  if (/operator/i.test(r)) return 'SWITCHED OFF';
  return 'PENDING REVIEW';
}

const clock = (ts, now) =>
  ts
    ? `<time datetime="${new Date(ts).toISOString()}">${esc(chicagoClock(ts))}</time> <span class="ee-dim">(${esc(relativeAge(now - ts))})</span>`
    : '<span class="ee-dim">never</span>';

const licenceText = (license, url) =>
  url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(license)}</a>`
    : esc(license || 'Not recorded');

/** CCTV pack health rows (from /api/cctv/pack-health). */
function cctvSection(packs, now) {
  if (packs === undefined || packs === null)
    return '<section class="ee-section" data-cctv-health="loading"><h3 class="ee-section-h">Camera providers</h3><p class="ee-dim">Loading camera provider health…</p></section>';
  if (!Array.isArray(packs))
    return '<section class="ee-section" data-cctv-health="error"><h3 class="ee-section-h">Camera providers</h3><p class="ee-err">Camera provider health could not be loaded (the server did not answer). This is a failure, not an empty result.</p></section>';
  const tone = (state) =>
    HEALTH_TONE[state] || (/held|pending|not /.test(state) ? 'muted' : 'muted');
  const item = (
    p,
  ) => `<li class="ee-src" data-cctv-pack="${esc(p.pack)}" data-health="${esc(p.state)}">
      <div class="ee-src-head"><h4 class="ee-src-name">${esc(p.provider || p.pack)}</h4>
        <span class="ee-badge ee-health" data-tone="${esc(tone(p.state))}">${esc(String(p.state || 'unknown').toUpperCase())}</span>
        ${p.commercialUse && p.commercialUse !== 'allowed' ? `<span class="ee-badge" data-tone="warn">${p.commercialUse === 'non-commercial' ? 'NON-COMMERCIAL' : 'COMMERCIAL USE UNCLEAR'}</span>` : ''}</div>
      <dl class="ee-src-grid">
        <dt>Permission</dt><dd>${esc(p.status || '')}${p.reviewedAt ? ` · reviewed ${esc(p.reviewedAt)}` : ''}</dd>
        <dt>Last success</dt><dd class="ee-mono">${clock(p.lastSuccessAt, now)}</dd>
        <dt>Last attempt</dt><dd class="ee-mono">${clock(p.lastAttemptAt, now)}</dd>
        ${p.count ? `<dt>Cameras</dt><dd>${esc(Number(p.count).toLocaleString('en-US'))}</dd>` : ''}
        ${p.error ? `<dt>Error</dt><dd class="ee-err">${esc(p.error)}</dd>` : ''}
        <dt>Licence</dt><dd>${esc(p.license || 'Not captured')}</dd>
      </dl></li>`;
  return `<section class="ee-section" data-cctv-health="ready"><h3 class="ee-section-h">Camera providers <span class="ee-dim">${packs.length}</span></h3><ul class="ee-src-list">${packs.map(item).join('')}</ul></section>`;
}

function errorText(stats) {
  const e = stats?.error || stats?.lastError || stats?.managerRefreshError;
  return typeof e === 'string' ? e : '';
}

/**
 * Render the DATA SOURCES screen into `body`.
 * @param {{dataManager:object, body:HTMLElement, filter?:string}} o
 */
export function renderDataSources({ dataManager, body, state }) {
  const rows = dataSourceRows(dataManager);
  const now = Date.now();
  const q = String(state.query || '')
    .trim()
    .toLowerCase();
  const onlyOn = Boolean(state.onlyOn);
  const visible = rows.filter((r) => {
    if (onlyOn && !r.layer?.enabled) return false;
    if (!q) return true;
    return `${r.entry.name} ${r.entry.provider} ${r.cls.classification} ${r.entry.group} ${r.status.coverage}`
      .toLowerCase()
      .includes(q);
  });
  const counts = Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0]));
  for (const r of rows) counts[r.cls.classification]++;
  const healthCounts = {};
  for (const r of rows)
    healthCounts[r.status.health] = (healthCounts[r.status.health] || 0) + 1;
  const groups = new Map();
  for (const r of visible) {
    const g = r.entry.group || 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const onCount = rows.filter((r) => r.layer?.enabled).length;

  const item = (r) => {
    const { entry, stats, cls, layer } = r;
    const last = refreshTracker.lastSuccess(r.id);
    const err = errorText(stats);
    const lastErr = refreshTracker.lastError(r.id);
    const on = Boolean(layer?.enabled);
    const count =
      on && Number.isFinite(Number(stats.count))
        ? `${Number(stats.count).toLocaleString('en-US')} records`
        : '';
    const refresh = last
      ? `<time datetime="${new Date(last).toISOString()}">${esc(chicagoClock(last))}</time> <span class="ee-dim">(${esc(relativeAge(now - last))})</span>`
      : on
        ? '<span class="ee-dim">no successful refresh yet</span>'
        : '<span class="ee-dim">not loaded (layer off)</span>';
    return `<li class="ee-src" data-source-id="${esc(r.id)}" data-class="${esc(cls.classification)}" data-health="${esc(r.status.health)}" data-on="${on}">
      <div class="ee-src-head">
        <h4 class="ee-src-name">${esc(entry.name || layer?.name || r.id)}</h4>
        <span class="ee-badge ee-health" data-health="${esc(r.status.health)}" data-tone="${esc(r.status.healthTone)}">${esc(r.status.healthLabel)}</span>
        <span class="ee-badge" data-tone="${esc(cls.tone)}">${esc(cls.classification)}</span>
        ${cls.fallback ? '<span class="ee-badge" data-tone="warn">FALLBACK</span>' : ''}
        ${r.status.commercialRestricted ? `<span class="ee-badge" data-tone="warn">${r.status.commercialUse === 'non-commercial' ? 'NON-COMMERCIAL' : 'COMMERCIAL USE UNCLEAR'}</span>` : ''}
      </div>
      <dl class="ee-src-grid">
        <dt>Health</dt><dd data-health-detail>${esc(r.status.healthDetail)}</dd>
        <dt>Provider</dt><dd>${esc(entry.provider)}</dd>
        <dt>Last success</dt><dd class="ee-mono" data-last-success>${clock(r.status.lastSuccessAt, now)}</dd>
        <dt>Last attempt</dt><dd class="ee-mono" data-last-attempt>${clock(r.status.lastAttemptAt, now)}</dd>
        <dt>Observed</dt><dd class="ee-mono" data-observed>${r.status.observedAt ? clock(r.status.observedAt, now) : '<span class="ee-dim">unknown (provider time not reported)</span>'}</dd>
        <dt>Published</dt><dd class="ee-mono" data-published>${r.status.publishedAt ? clock(r.status.publishedAt, now) : '<span class="ee-dim">unknown (provider publish time not reported)</span>'}</dd>
        <dt>Retrieved</dt><dd class="ee-mono" data-retrieved>${r.status.retrievedAt ? clock(r.status.retrievedAt, now) : clock(r.status.lastSuccessAt, now)}</dd>
        <dt>Record class</dt><dd data-record-class>${esc(r.status.recordClass || 'reported')}</dd>
        ${cls.feed && cls.feed !== 'unknown' ? `<dt>Active feed</dt><dd class="ee-mono">${esc(cls.feed)}</dd>` : ''}
        ${cls.fallback ? `<dt>Fallback</dt><dd>${esc(cls.fallback)}${last ? ` · age ${esc(relativeAge(now - last))}` : ''}</dd>` : ''}
        <dt>Delivery</dt><dd>${esc(r.status.deliveryType)}</dd>
        <dt>Freshness</dt><dd>${esc(r.status.freshness)}</dd>
        <dt>Cadence</dt><dd>${esc(entry.cadence)}</dd>
        <dt>Coverage</dt><dd>${esc(r.status.coverage)}</dd>
        <dt>Status</dt><dd><span class="ee-onoff" data-on="${on}">${on ? 'ON' : 'OFF'}</span>${count ? ` · ${esc(count)}` : ''}</dd>
        ${err ? `<dt>Error</dt><dd class="ee-err">${esc(err)}</dd>` : lastErr && on ? `<dt>Last error</dt><dd class="ee-err">${esc(lastErr.message)} <span class="ee-dim">(${esc(chicagoClock(lastErr.at))})</span></dd>` : ''}
        ${cls.reason && cls.reason !== err ? `<dt>Now</dt><dd>${esc(cls.reason)}</dd>` : ''}
        ${r.status.limitation ? `<dt>Limitation</dt><dd>${esc(r.status.limitation)}</dd>` : ''}
        <dt>Permission</dt><dd>${esc(permText(r.status))}${r.status.reviewedAt ? ` · reviewed ${esc(r.status.reviewedAt)}` : ''}</dd>
        <dt>Licence</dt><dd>${licenceText(r.status.license, r.status.licenseUrl)}</dd>
        <dt>Credit</dt><dd>${r.status.sourceUrl ? `<a href="${esc(r.status.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.status.credit)}</a>` : esc(r.status.credit)}</dd>
        <dt>Endpoint</dt><dd class="ee-mono ee-wrap">${esc(entry.endpoint)}</dd>
      </dl>
      <p class="ee-src-disclaimer">${esc(r.status.disclaimer)}</p>
      ${
        r.status.disabled
          ? `<p class="ee-src-disabled" data-src-disabled>${esc(r.status.disabledReason)}</p>`
          : layer
            ? `<button type="button" class="ee-btn ee-src-toggle" data-layer-toggle="${esc(r.id)}" aria-pressed="${on}">${on ? 'Turn off' : 'Turn on'}</button>`
            : '<p class="ee-dim ee-src-missing">Not registered in this build.</p>'
      }
    </li>`;
  };

  body.innerHTML = `
    <div class="ee-panel-intro">
      <p>Every layer, where its data comes from, and how fresh it is. Times are America/Chicago (CT).
      Observation, publication and retrieval times are kept separate — refreshing never makes data look newer.
      Refresh times are tracked in this browser session.</p>
      <p class="ee-dim" role="note" data-src-scopes><b>Health scopes:</b> <i>provider</i> (upstream readiness, e.g. USGS Events READY) · <i>collection</i> (server wake-time gather) · <i>layer</i> (this console toggle ON/OFF) · <i>rendered</i> (on the globe — UNAVAILABLE when 3D is down). Sources OFF does not mean the provider is broken.</p>
      <p class="ee-dim" data-src-counts>Catalog <b>${rows.length}</b> · on <b>${onCount}</b> · fresh/online <b>${rows.filter((r) => r.status.health === 'online').length}</b> · attention <b>${rows.filter((r) => ['offline', 'degraded', 'stale', 'rate limited', 'key required'].includes(r.status.health)).length}</b></p>
      <p class="ee-legend" data-health-legend>Health: ${HEALTH_STATES.map((h) => `<span class="ee-badge" data-tone="${esc(HEALTH_TONE[h])}">${esc(h.toUpperCase())}</span><span class="ee-legend-n">${healthCounts[h] || 0}</span>`).join('')}</p>
      <p class="ee-legend">${CLASSIFICATIONS.map((c) => `<span class="ee-badge" data-tone="${esc(CLASSIFICATION_TONE[c])}">${esc(c)}</span><span class="ee-legend-n">${counts[c]}</span>`).join('')}</p>
    </div>
    <div class="ee-toolbar" role="search">
      <label class="ee-search"><span class="ee-sr">Filter data sources</span>
        <input type="search" data-src-filter placeholder="Filter by layer, provider or status" value="${esc(state.query || '')}" enterkeyhint="search" /></label>
      <button type="button" class="ee-chip" data-src-only-on aria-pressed="${onlyOn}">On only (${onCount})</button>
    </div>
    ${
      visible.length
        ? [...groups.entries()]
            .map(
              ([g, list]) =>
                `<section class="ee-section"><h3 class="ee-section-h">${esc(g)} <span class="ee-dim">${list.length}</span></h3><ul class="ee-src-list">${list.map(item).join('')}</ul></section>`,
            )
            .join('')
        : '<p class="ee-empty">No data source matches that filter.</p>'
    }
    ${cctvSection(state.cctvPacks, now)}
    <p class="ee-dim ee-foot">Classes: see docs/DATA_SOURCES_AUDIT.md. Nothing on this screen is estimated: a layer that has not loaded says so.</p>`;
}

/**
 * Update health badges / timestamps in place. Used by the 5 s Data Sources
 * timer so an open panel never tears down and rebuilds its DOM (that was a
 * root cause of iPhone scroll jank and dropped frames). Full render stays
 * for open / filter / toggle.
 * @returns {boolean} false when the panel has no rows yet (caller should full-render)
 */
export function patchDataSourcesHealth({ dataManager, body, state }) {
  if (!body?.querySelector?.('[data-source-id]')) return false;
  const rows = dataSourceRows(dataManager);
  const now = Date.now();
  const byId = new Map(rows.map((r) => [r.id, r]));
  let patched = 0;
  for (const li of body.querySelectorAll('[data-source-id]')) {
    const r = byId.get(li.dataset.sourceId);
    if (!r) continue;
    patched++;
    const st = r.status;
    if (li.dataset.health !== st.health) li.dataset.health = st.health;
    const healthBadge = li.querySelector(':scope > .ee-src-head > .ee-health');
    if (healthBadge) {
      if (healthBadge.textContent !== st.healthLabel)
        healthBadge.textContent = st.healthLabel;
      if (healthBadge.dataset.tone !== st.healthTone)
        healthBadge.dataset.tone = st.healthTone;
      if (healthBadge.dataset.health !== st.health)
        healthBadge.dataset.health = st.health;
    }
    const detail = li.querySelector('[data-health-detail]');
    if (detail && detail.textContent !== st.healthDetail)
      detail.textContent = st.healthDetail;
    const success = li.querySelector('[data-last-success]');
    if (success) {
      const html = clock(st.lastSuccessAt, now);
      if (success.innerHTML !== html) success.innerHTML = html;
    }
    const attempt = li.querySelector('[data-last-attempt]');
    if (attempt) {
      const html = clock(st.lastAttemptAt, now);
      if (attempt.innerHTML !== html) attempt.innerHTML = html;
    }
    const on = Boolean(r.layer?.enabled);
    if (li.dataset.on !== String(on)) li.dataset.on = String(on);
    const toggle = li.querySelector(`[data-layer-toggle="${cssEscape(r.id)}"]`);
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(on));
      const label = on ? 'Turn off' : 'Turn on';
      if (toggle.textContent !== label) toggle.textContent = label;
    }
  }
  // Health legend counts (first legend row).
  const legend = body.querySelector('[data-health-legend]');
  if (legend) {
    const healthCounts = {};
    for (const r of rows)
      healthCounts[r.status.health] = (healthCounts[r.status.health] || 0) + 1;
    for (const h of HEALTH_STATES) {
      const badge = [...legend.querySelectorAll('.ee-badge')].find(
        (b) => b.textContent === h.toUpperCase(),
      );
      if (!badge) continue;
      const n = badge.nextElementSibling;
      if (n?.classList?.contains('ee-legend-n'))
        n.textContent = String(healthCounts[h] || 0);
    }
  }
  // Camera-provider packs: swap loading/error placeholder once, else patch rows.
  const packs = state?.cctvPacks;
  const cctvSectionEl = body.querySelector('[data-cctv-health]');
  if (
    cctvSectionEl &&
    packs != null &&
    cctvSectionEl.dataset.cctvHealth !== 'ready'
  ) {
    const html = cctvSection(packs, now);
    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    const next = tmp.firstElementChild;
    if (next) cctvSectionEl.replaceWith(next);
  } else if (Array.isArray(packs)) {
    const cctvHost = body.querySelector(
      '[data-cctv-health="ready"] .ee-src-list',
    );
    if (cctvHost) {
      for (const p of packs) {
        const li = cctvHost.querySelector(
          `[data-cctv-pack="${cssEscape(p.pack)}"]`,
        );
        if (!li) continue;
        if (li.dataset.health !== p.state) li.dataset.health = p.state;
        const badge = li.querySelector('.ee-health');
        if (badge) {
          const label = String(p.state || 'unknown').toUpperCase();
          if (badge.textContent !== label) badge.textContent = label;
        }
      }
    }
  }
  return patched > 0;
}

/**
 * Keep a registry badge on every upstream layer row (#data-toggles). The
 * upstream panel repaints rows on its own schedule, so an observer re-applies
 * the badge; the badge text comes from the same sourceStatus store.
 */
export function decorateLayerRows({ dataManager, signal }) {
  let raf = 0;
  let layerQuery = '';
  const ensureSearch = () => {
    const host = document.getElementById('data-toggles');
    if (!host || document.getElementById('ee-layer-search')) return;
    const wrap = document.createElement('label');
    wrap.id = 'ee-layer-search-wrap';
    wrap.innerHTML =
      '<span class="ee-sr">Filter layers</span><input id="ee-layer-search" type="search" placeholder="Filter layers" enterkeyhint="search" autocomplete="off" />';
    host.before(wrap);
    const input = wrap.querySelector('input');
    input.addEventListener('input', () => {
      layerQuery = input.value.trim().toLowerCase();
      schedule();
    });
    // Typing here must not trigger globe keyboard shortcuts.
    input.addEventListener('keydown', (e) => e.stopPropagation());
  };
  const apply = () => {
    raf = 0;
    ensureSearch();
    const byId = new Map();
    try {
      for (const l of dataManager.getAll()) byId.set(l.id, l);
    } catch {
      return;
    }
    for (const row of document.querySelectorAll(
      '#data-toggles .data-toggle-row[data-layer-id]',
    )) {
      const id = row.dataset.layerId;
      const layer = byId.get(id);
      const hide =
        Boolean(layerQuery) &&
        !`${row.textContent} ${id} ${sourceFor(id).provider}`
          .toLowerCase()
          .includes(layerQuery);
      if (hide) row.dataset.eeHidden = 'true';
      else if (row.dataset.eeHidden) delete row.dataset.eeHidden;
      if (!layer) continue;
      sourceStatus.report(id, {
        stats: layer.stats || {},
        enabled: Boolean(layer.enabled),
        name: layer.name || '',
      });
      const st = sourceStatus.getSourceStatus(id);
      const cls = clsOf(st);
      let badge = row.querySelector(':scope > .ee-row-badge');
      const text = st.disabled
        ? disabledLabel(st.disabledReason)
        : cls.fallback
          ? `${cls.classification} · FALLBACK`
          : cls.classification;
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ee-row-badge';
        // A sibling after the meta line: upstream rewrites the meta text on
        // every refresh, which would otherwise wipe the badge.
        const meta = row.querySelector(':scope > .data-toggle-meta');
        if (meta) meta.after(badge);
        else row.appendChild(badge);
      } else if (!badge.isConnected) continue;
      if (badge.textContent !== text) badge.textContent = text;
      const tone = st.disabled ? 'muted' : cls.tone;
      if (badge.dataset.tone !== tone) badge.dataset.tone = tone;
      if (st.disabled) row.dataset.eeDisabled = 'true';
      else if (row.dataset.eeDisabled) delete row.dataset.eeDisabled;
      badge.title = `${st.provider} · ${st.cadence} · ${st.coverage}`;
      // Health chip beside the badge: shown while the layer is on, or when
      // the provider failed / needs a key, so a dead feed never looks idle.
      const showHealth =
        !st.disabled &&
        (st.enabled ||
          [
            'key required',
            'offline',
            'rate limited',
            'degraded',
            'stale',
          ].includes(st.health));
      let chip = row.querySelector(':scope > .ee-row-health');
      if (showHealth) {
        if (!chip) {
          chip = document.createElement('span');
          chip.className = 'ee-row-badge ee-row-health';
          badge.after(chip);
        }
        if (chip.textContent !== st.healthLabel)
          chip.textContent = st.healthLabel;
        if (chip.dataset.health !== st.health) chip.dataset.health = st.health;
        if (chip.dataset.tone !== st.healthTone)
          chip.dataset.tone = st.healthTone;
        const title = `${st.provider}: ${st.healthDetail}`;
        if (chip.title !== title) chip.title = title;
      } else if (chip) chip.remove();
    }
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };
  let observer = null;
  const attach = () => {
    const host = document.getElementById('data-toggles');
    if (!host) return false;
    observer = new MutationObserver((records) => {
      // Ignore our own badge writes.
      if (
        records.every(
          (r) =>
            r.target?.classList?.contains?.('ee-row-badge') ||
            [...(r.addedNodes || []), ...(r.removedNodes || [])].every((n) =>
              n.classList?.contains?.('ee-row-badge'),
            ),
        )
      )
        return;
      schedule();
    });
    observer.observe(host, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    schedule();
    return true;
  };
  if (!attach()) {
    const t = setInterval(() => attach() && clearInterval(t), 1000);
    signal?.addEventListener('abort', () => clearInterval(t), { once: true });
  }
  const tick = setInterval(() => {
    sourceStatus.tick();
    schedule();
  }, 10_000);
  signal?.addEventListener(
    'abort',
    () => {
      observer?.disconnect();
      clearInterval(tick);
    },
    { once: true },
  );
  return { refresh: schedule };
}
