/**
 * Earth Eye ATTRIBUTION & LICENSES panel (DOM renderer, opened from the dock
 * / phone MORE menu). Everything it lists comes from records, never from
 * hand-written copy: layer sources and runtime services from the data-source
 * registry, 3D models from assetCredits.js (checked against
 * public/models/README.md), camera providers from /api/cctv/permissions.
 * Scales by filter + grouped sections, so adding sources never needs layout
 * work.
 */
import { MODEL_CREDITS } from './assetCredits.js';
import {
  DATA_SOURCES,
  SERVICE_SOURCES,
  commercialSafeMode,
} from './dataSourceRegistry.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const link = (url, text) =>
  url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`
    : esc(text);

/** Flat attribution rows (pure; used by the renderer and by tests). */
export function attributionRows({ cctvPacks = [] } = {}) {
  const rows = [];
  for (const m of MODEL_CREDITS)
    rows.push({
      section: '3D models',
      id: `model:${m.file}`,
      name: `“${m.title}” by ${m.author}`,
      detail: `${m.file} · modified: ${m.modification}`,
      attribution: `“${m.title}” by ${m.author}, ${m.license}, modified`,
      authorUrl: m.authorUrl,
      sourceUrl: m.sourceUrl,
      license: m.license,
      licenseUrl: m.licenseUrl,
      commercialUse: 'allowed',
      reviewedAt: '2026-09-28',
    });
  for (const e of Object.values(DATA_SOURCES))
    rows.push({
      section: `Layers · ${e.group || 'Other'}`,
      id: `layer:${e.layerId}`,
      name: e.name,
      detail: e.provider,
      attribution: e.attribution || e.credit,
      sourceUrl: e.sourceUrl,
      license: e.license || 'Not recorded',
      licenseUrl: e.licenseUrl || null,
      commercialUse: e.commercialUse,
      reviewedAt: e.reviewedAt,
      excluded: e.excluded,
    });
  for (const x of SERVICE_SOURCES)
    rows.push({
      section: 'Maps, services and bundled reference data',
      id: `service:${x.id}`,
      name: x.name,
      detail: x.usedFor,
      attribution: x.attribution,
      sourceUrl: x.sourceUrl,
      license: x.license,
      licenseUrl: x.licenseUrl,
      commercialUse: x.commercialUse,
      reviewedAt: x.reviewedAt,
    });
  for (const p of cctvPacks)
    rows.push({
      section: 'Camera providers',
      id: `cctv:${p.pack}`,
      name: p.provider,
      detail: `Status: ${p.status || p.review}`,
      attribution: p.provider,
      sourceUrl: p.evidenceUrl || null,
      license: p.license || 'Not captured',
      licenseUrl: null,
      commercialUse: p.commercialUse,
      reviewedAt: p.reviewedAt,
    });
  return rows;
}

/**
 * Render into `body`.
 * @param {{body:HTMLElement, state:{query?:string}, cctvPacks?:object[]|null}} o
 */
export function renderLicenses({ body, state, cctvPacks = null }) {
  const rows = attributionRows({ cctvPacks: cctvPacks || [] });
  const q = String(state?.query || '')
    .trim()
    .toLowerCase();
  const visible = q
    ? rows.filter((r) =>
        `${r.section} ${r.name} ${r.detail} ${r.attribution} ${r.license} ${r.commercialUse}`
          .toLowerCase()
          .includes(q),
      )
    : rows;
  const sections = new Map();
  for (const r of visible) {
    if (!sections.has(r.section)) sections.set(r.section, []);
    sections.get(r.section).push(r);
  }
  const nc = rows.filter(
    (r) => r.commercialUse && !['allowed', 'n/a'].includes(r.commercialUse),
  ).length;
  const item = (r) => `<li class="ee-lic" data-lic-id="${esc(r.id)}">
      <div class="ee-lic-head"><b>${link(r.sourceUrl, r.name)}</b>
        ${r.commercialUse === 'non-commercial' ? '<span class="ee-badge" data-tone="warn">NON-COMMERCIAL</span>' : ''}
        ${r.commercialUse === 'unknown' ? '<span class="ee-badge" data-tone="muted">COMMERCIAL USE UNCLEAR</span>' : ''}
        ${r.excluded ? '<span class="ee-badge" data-tone="muted">EXCLUDED</span>' : ''}</div>
      <div class="ee-lic-attr">${esc(r.attribution)}${r.authorUrl ? ` · ${link(r.authorUrl, 'author')}` : ''}</div>
      <div class="ee-lic-meta">${link(r.licenseUrl, r.license)} · commercial: ${esc(r.commercialUse || 'unknown')}${r.reviewedAt ? ` · reviewed ${esc(r.reviewedAt)}` : ''}</div>
      ${r.detail ? `<div class="ee-lic-detail ee-dim">${esc(r.detail)}</div>` : ''}
    </li>`;
  body.innerHTML = `
    <div class="ee-panel-intro">
      <p><b>Earth Eye</b> is an independent fork of <a href="https://github.com/bilawalsidhu/gods-eye-view" target="_blank" rel="noopener noreferrer">God's Eye View</a> by Bilawal Sidhu (MIT). The MIT licence covers the <b>code only</b>; every dataset, model and service below keeps its own licence.</p>
      <p class="ee-dim">${rows.length} records · ${nc} not cleared for commercial use · commercial-safe mode <b data-commercial-safe>${commercialSafeMode() ? 'ON' : 'OFF'}</b> (private, non-commercial instance).</p>
    </div>
    <div class="ee-toolbar" role="search">
      <label class="ee-search"><span class="ee-sr">Filter attributions</span>
        <input type="search" data-lic-filter placeholder="Filter by name, licence or provider" value="${esc(state?.query || '')}" enterkeyhint="search" /></label>
    </div>
    ${
      visible.length
        ? [...sections.entries()]
            .map(
              ([name, list]) =>
                `<section class="ee-section" data-lic-section="${esc(name)}"><h3 class="ee-section-h">${esc(name)} <span class="ee-dim">${list.length}</span></h3><ul class="ee-lic-list">${list.map(item).join('')}</ul></section>`,
            )
            .join('')
        : '<p class="ee-empty">No attribution matches that filter.</p>'
    }
    ${cctvPacks ? '' : '<p class="ee-dim" data-lic-cctv-pending>Camera provider licences are loading…</p>'}
    <p class="ee-dim ee-foot">The per-layer credit line also stays on the globe (bottom-left). ${'<button type="button" class="ee-btn" data-atlas-action="open-attribution">Show on-globe credits</button>'}</p>`;
}
