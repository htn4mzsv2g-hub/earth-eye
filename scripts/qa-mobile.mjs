#!/usr/bin/env node
/**
 * Earth Eye mobile layout QA (headless Chrome against a running build).
 *
 *   node scripts/qa-mobile.mjs --url http://localhost:4173 --chrome /usr/bin/google-chrome \
 *     [--out screenshots/mobile-after]
 *
 * Checks at 390×844, 430×932 and 844×390 (landscape):
 *   - only the logo, command bar, key badge, bottom tab bar (+ credits and the
 *     safety strip before OK) are visible by default; ≥60% of the globe clear
 *   - no overlapping chrome, no horizontal overflow, touch targets ≥44px
 *   - OK dismisses the safety strip and the dismissal survives a reload
 *   - each of the five tabs opens its panel as a bottom sheet, one at a time,
 *     closable by ✕, by tapping the tab again and by dragging the handle down
 *   - map credits stay visible with a sheet open
 *   - target selection and FLIR at 390×844
 * Writes screenshots + mobile-layout-report.json; exits 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:4173');
const CHROME = arg(
  'chrome',
  process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
);
const OUT = arg('out', 'screenshots/mobile-after');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {
  base: BASE,
  startedAt: new Date().toISOString(),
  viewports: {},
  failures: [],
};
const fail = (vp, msg) => report.failures.push(`${vp}: ${msg}`);

const TABS = ['explore', 'layers', 'cctv', 'analyst'];
const ALLOWED_DEFAULT = [
  'title-bar',
  'ee-key-status',
  'atlas-command-bar',
  'ee-tabbar',
  'cesium-credits',
  'atlas-disclaimer',
];
const TRANSIENT = [
  'global-loading-status',
  'traffic-sync-chip',
  'cctv-sync-chip',
  'key-setup-chip',
  'scene-runtime',
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
  ],
});

/** Visible fixed/absolute chrome boxes (excludes full-screen overlay roots). */
function chromeBoxes() {
  const vw = innerWidth;
  const vh = innerHeight;
  const skip = new Set([
    'cesiumContainer',
    'world-overlay-root',
    'intel-hud',
    'loading-screen',
  ]);
  const boxes = [];
  const visible = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        Number(cs.opacity) === 0
      )
        return false;
    }
    return true;
  };
  const consider = (el, label) => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    const x1 = Math.max(0, r.left),
      y1 = Math.max(0, r.top),
      x2 = Math.min(vw, r.right),
      y2 = Math.min(vh, r.bottom);
    if (x2 - x1 < 2 || y2 - y1 < 2) return;
    if ((x2 - x1) * (y2 - y1) > vw * vh * 0.95) return;
    boxes.push({ id: label, x1, y1, x2, y2 });
  };
  for (const el of document.querySelectorAll('body *')) {
    if (
      el.closest('.cesium-viewer') &&
      el.id !== 'cesium-credits' &&
      !el.closest('#cesium-credits')
    )
      continue;
    if (el.id && skip.has(el.id)) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed') continue;
    if (
      el.parentElement?.closest('[id]') &&
      getComputedStyle(el.parentElement).position === 'fixed' &&
      el.parentElement !== document.body
    )
      continue;
    consider(el, el.id || el.className || el.tagName);
  }
  // HUD corners are absolute children of the full-screen HUD root.
  for (const el of document.querySelectorAll(
    '#intel-hud .hud-corner, #intel-hud .hud-top-bar, #intel-hud .hud-bottom-bar',
  ))
    consider(el, `hud:${el.className}`);
  // The credit container can be zero-height; measure its visible text parts.
  const creditParts = [
    ...document.querySelectorAll(
      '#cesium-credits .cesium-credit-logoContainer, #cesium-credits .cesium-credit-textContainer, #cesium-credits .cesium-credit-expand-link',
    ),
  ]
    .filter((n) => visible(n))
    .map((n) => n.getBoundingClientRect())
    .filter((r) => r.width > 1 && r.height > 1);
  if (creditParts.length) {
    const i = boxes.findIndex((b) => b.id === 'cesium-credits');
    if (i > -1) boxes.splice(i, 1);
    boxes.push({
      id: 'cesium-credits',
      x1: Math.min(...creditParts.map((r) => r.left)),
      y1: Math.min(...creditParts.map((r) => r.top)),
      x2: Math.max(...creditParts.map((r) => r.right)),
      y2: Math.max(...creditParts.map((r) => r.bottom)),
    });
  }
  return boxes;
}

async function measure(page) {
  return page.evaluate(`(${chromeBoxes.toString()})()`);
}

function coverage(boxes, vw, vh) {
  const step = 5;
  let covered = 0,
    total = 0;
  for (let y = 0; y < vh; y += step)
    for (let x = 0; x < vw; x += step) {
      total += 1;
      if (boxes.some((b) => x >= b.x1 && x < b.x2 && y >= b.y1 && y < b.y2))
        covered += 1;
    }
  return covered / total;
}

function overlaps(boxes, ignore = []) {
  const out = [];
  const list = boxes.filter((b) => !ignore.includes(b.id));
  for (let i = 0; i < list.length; i += 1)
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i],
        b = list[j];
      const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
      const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
      if (w > 1 && h > 1)
        out.push(`${a.id} × ${b.id} (${Math.round(w)}×${Math.round(h)})`);
    }
  return out;
}

async function smallTargets(page, scope) {
  return page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let cur = el,
        hiddenAncestor = false;
      while ((cur = cur.parentElement))
        if (getComputedStyle(cur).display === 'none') {
          hiddenAncestor = true;
          break;
        }
      if (hiddenAncestor) continue;
      // Hit area: the element box, grown by its padding (already included) only.
      if (r.width < 43.5 || r.height < 43.5)
        out.push(
          `${el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 24) || el.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`,
        );
    }
    return out;
  }, scope);
}

async function openPage(vp, { fresh = true } = {}) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  if (fresh) {
    await page.evaluateOnNewDocument(() => {
      if (!sessionStorage.getItem('qa-mobile-cleared')) {
        localStorage.clear();
        sessionStorage.setItem('qa-mobile-cleared', '1');
      }
    });
  }
  page.on('pageerror', (e) =>
    (report.pageErrors ||= []).push(String(e?.message || e).slice(0, 200)),
  );
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => window.__atlasEye?.mobile && window.__godsEyeView?.viewer,
    { timeout: 90000 },
  );
  await sleep(11000);
  return page;
}

const shot = (page, name) =>
  page.screenshot({ path: path.join(OUT, `${name}.png`) });
const run = (page, text) =>
  page.evaluate(
    (t) =>
      window.__atlasEye
        .run(t)
        .then((r) => ({ ok: r?.ok !== false }))
        .catch((e) => ({ ok: false, error: String(e) })),
    text,
  );

async function checkDefault(page, key, vp, r) {
  const boxes = await measure(page);
  const ids = boxes.map((b) => b.id);
  r.visible = ids;
  const unexpected = ids.filter(
    (id) => !ALLOWED_DEFAULT.includes(id) && !TRANSIENT.includes(id),
  );
  if (unexpected.length)
    fail(key, `unexpected visible chrome: ${unexpected.join(', ')}`);
  for (const must of [
    'title-bar',
    'ee-key-status',
    'atlas-command-bar',
    'ee-tabbar',
    'cesium-credits',
  ])
    if (!ids.includes(must)) fail(key, `missing ${must}`);
  const persistent = boxes.filter((b) => !TRANSIENT.includes(b.id));
  r.obstructed =
    Math.round(coverage(persistent, vp.width, vp.height) * 1000) / 10;
  if (r.obstructed > 40) fail(key, `globe only ${100 - r.obstructed}% clear`);
  r.overlaps = overlaps(persistent);
  if (r.overlaps.length) fail(key, `overlap: ${r.overlaps.join('; ')}`);
  r.overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  if (r.overflowX) fail(key, 'horizontal overflow');
  r.smallTargets = await smallTargets(
    page,
    '#ee-key-status, #atlas-command-bar button, #atlas-command-input, #ee-tabbar button, #atlas-disclaimer button, #cesium-credits a',
  );
  if (r.smallTargets.length)
    fail(key, `small touch targets: ${r.smallTargets.join(', ')}`);
  r.wordmarkWidth = await page.evaluate(() =>
    Math.round(
      document.querySelector('#title-bar .title-logo')?.getBoundingClientRect()
        .width || 0,
    ),
  );
}

async function atlasPanelState(page, tabId = 'cctv') {
  return page.evaluate((tabId) => {
    const p = document.getElementById('atlas-panel');
    const open = p && !p.hidden;
    const r = p?.getBoundingClientRect();
    const tab = document.getElementById('ee-tabbar').getBoundingClientRect();
    const cmd = document
      .getElementById('atlas-command-bar')
      .getBoundingClientRect();
    const close = p?.querySelector('.atlas-panel-close');
    const cr = close?.getBoundingClientRect();
    return {
      panel: open ? document.getElementById('atlas-console')?.dataset.panel || '?' : null,
      tabActive:
        document
          .querySelector(`#ee-tabbar [data-ee-sheet="${tabId}"]`)
          ?.getAttribute('aria-pressed') === 'true',
      aboveTabbar: open ? r.bottom <= tab.top + 1 : null,
      belowCommand: open ? r.top >= cmd.bottom - 1 : null,
      closeTarget: cr ? cr.width >= 44 && cr.height >= 44 : false,
    };
  }, tabId);
}

async function sheetState(page) {
  return page.evaluate(() => {
    const hosts = [
      ...document.querySelectorAll(
        '#left-panel-stack, #right-context-rail, #command-dock',
      ),
    ].filter((h) => getComputedStyle(h).display !== 'none');
    const active = document.querySelectorAll('.ee-sheet-active');
    const bar = document.getElementById('ee-sheet-bar');
    const host = hosts[0];
    const visibleChildren = host
      ? [...host.children]
          .filter((c) => getComputedStyle(c).display !== 'none')
          .map((c) => c.id)
      : [];
    const panel = document.querySelector('.ee-sheet-active');
    const hr = host?.getBoundingClientRect();
    const br = bar?.getBoundingClientRect();
    const cmd = document
      .getElementById('atlas-command-bar')
      .getBoundingClientRect();
    const tab = document.getElementById('ee-tabbar').getBoundingClientRect();
    const parts = [
      ...document.querySelectorAll(
        '#cesium-credits .cesium-credit-logoContainer, #cesium-credits .cesium-credit-textContainer, #cesium-credits .cesium-credit-expand-link',
      ),
    ]
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.width > 1 && r.height > 1);
    const credits = parts.length
      ? {
          left: Math.min(...parts.map((r) => r.left)),
          top: Math.min(...parts.map((r) => r.top)),
          right: Math.max(...parts.map((r) => r.right)),
          bottom: Math.max(...parts.map((r) => r.bottom)),
        }
      : null;
    const hit = (a, b) =>
      a &&
      b &&
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    return {
      open: window.__atlasEye.mobile.openSheetId,
      hosts: hosts.map((h) => h.id),
      activeCount: active.length,
      visibleChildren,
      panelCollapsed: panel ? panel.classList.contains('collapsed') : null,
      barVisible: Boolean(bar && !bar.hidden),
      title: bar?.textContent.trim().replace(/\s+/g, ' '),
      hostRect: hr && {
        top: Math.round(hr.top),
        bottom: Math.round(hr.bottom),
        h: Math.round(hr.height),
      },
      barRect: br && { top: Math.round(br.top), bottom: Math.round(br.bottom) },
      barAboveTopChrome: br ? br.top >= cmd.bottom - 1 : null,
      sheetAboveTabbar: hr ? hr.bottom <= tab.top + 1 : null,
      creditsVisible: credits
        ? credits.top >= 0 &&
          credits.right <= innerWidth + 1 &&
          !hit(credits, hr) &&
          !hit(credits, br) &&
          !hit(credits, tab)
        : false,
      contentHeight: panel ? Math.round(panel.scrollHeight) : 0,
    };
  });
}

async function viewport(key, vp, { full }) {
  const r = (report.viewports[key] = {});
  const page = await openPage(vp);
  r.compact = await page.evaluate(() =>
    document.documentElement.classList.contains('ee-compact'),
  );
  if (!r.compact) fail(key, 'compact mode not active');
  await shot(page, `${key}-01-first-screen`);
  r.default = {};
  await checkDefault(page, key, vp, r.default);
  r.disclaimerBefore = await page.evaluate(() =>
    Boolean(document.getElementById('atlas-disclaimer')),
  );
  if (!r.disclaimerBefore) fail(key, 'safety strip not shown on first visit');
  await page.tap('#atlas-disclaimer [data-atlas-action="ack"]');
  await sleep(600);
  await shot(page, `${key}-02-after-ok`);
  r.afterOk = {};
  await checkDefault(page, `${key} after OK`, vp, r.afterOk);
  if (r.afterOk.visible.includes('atlas-disclaimer'))
    fail(key, 'safety strip still visible after OK');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__atlasEye?.mobile, {
    timeout: 90000,
  });
  await sleep(4000);
  r.disclaimerAfterReload = await page.evaluate(() =>
    Boolean(document.getElementById('atlas-disclaimer')),
  );
  if (r.disclaimerAfterReload)
    fail(key, 'safety dismissal not remembered after reload');

  r.sheets = {};
  const tabs = full ? TABS : ['layers'];
  for (const [i, tab] of tabs.entries()) {
    await page.tap(`#ee-tabbar [data-ee-sheet="${tab}"]`);
    await sleep(1200);
    if (tab === 'cctv' || tab === 'analyst' || tab === 'explore') {
      // Cameras and Analyst open Earth Eye's own panels (the atlas panel),
      // full height between the command bar and the tab bar.
      const c = (r.sheets[tab] = await atlasPanelState(page, tab));
      await shot(page, `${key}-${String(i + 3).padStart(2, '0')}-sheet-${tab}`);
      if (c.panel !== tab) fail(key, `${tab}: panel not open (${c.panel})`);
      if (!c.tabActive) fail(key, `${tab}: tab not marked active`);
      if (!c.aboveTabbar) fail(key, `${tab}: panel overlaps the tab bar`);
      if (!c.belowCommand) fail(key, `${tab}: panel covers the command bar`);
      if (!c.closeTarget) fail(key, `${tab}: close button under 44px`);
      await page.tap(`#ee-tabbar [data-ee-sheet="${tab}"]`);
      await sleep(600);
      if ((await atlasPanelState(page, tab)).panel)
        fail(key, `${tab}: tapping the active tab did not close the panel`);
      continue;
    }
    const s = (r.sheets[tab] = await sheetState(page));
    await shot(page, `${key}-${String(i + 3).padStart(2, '0')}-sheet-${tab}`);
    if (s.open !== tab) fail(key, `${tab}: sheet not open (${s.open})`);
    if (s.hosts.length !== 1)
      fail(key, `${tab}: ${s.hosts.length} rails visible`);
    if (s.activeCount !== 1 || s.visibleChildren.length !== 1)
      fail(
        key,
        `${tab}: expected one panel, saw ${s.visibleChildren.join(',')}`,
      );
    if (s.panelCollapsed)
      fail(key, `${tab}: panel still collapsed inside the sheet`);
    if (!s.barVisible) fail(key, `${tab}: sheet header missing`);
    if (!s.barAboveTopChrome) fail(key, `${tab}: sheet covers the command bar`);
    if (!s.sheetAboveTabbar) fail(key, `${tab}: sheet overlaps the tab bar`);
    if (!s.creditsVisible) fail(key, `${tab}: credits hidden while sheet open`);
    s.smallTargets = await smallTargets(page, '#ee-sheet-bar button');
    if (s.smallTargets.length)
      fail(key, `${tab}: small sheet targets ${s.smallTargets.join(', ')}`);
    s.innerSmallTargets = await smallTargets(
      page,
      '.ee-sheet-active button, .ee-sheet-active input[type=checkbox], .ee-sheet-active select',
    );
    if (s.innerSmallTargets.length)
      fail(
        key,
        `${tab}: small targets inside the sheet ${s.innerSmallTargets.join(', ')}`,
      );
    const boxes = await measure(page);
    s.overlaps = overlaps(
      boxes.filter((b) => !TRANSIENT.includes(b.id)),
      ['atlas-command-output'],
    );
    if (s.overlaps.length)
      fail(key, `${tab}: overlap ${s.overlaps.join('; ')}`);
  }
  // Close paths: ✕, tap the same tab, drag the handle down.
  // The last tab (Analyst) closes itself above, so open LAYERS first.
  if (
    (await page.evaluate(() => window.__atlasEye.mobile.openSheetId)) !==
    'layers'
  ) {
    await page.tap('#ee-tabbar [data-ee-sheet="layers"]');
    await sleep(900);
  }
  await page.tap('#ee-sheet-bar .ee-sheet-close');
  await sleep(500);
  r.closedByX = await page.evaluate(
    () => window.__atlasEye.mobile.openSheetId === null,
  );
  if (!r.closedByX) fail(key, '✕ did not close the sheet');
  await page.tap('#ee-tabbar [data-ee-sheet="layers"]');
  await sleep(700);
  await page.tap('#ee-tabbar [data-ee-sheet="layers"]');
  await sleep(500);
  r.closedByTab = await page.evaluate(
    () => window.__atlasEye.mobile.openSheetId === null,
  );
  if (!r.closedByTab) fail(key, 'tapping the open tab did not close the sheet');
  await page.tap('#ee-tabbar [data-ee-sheet="layers"]');
  await sleep(900);
  const handle = await page.$eval('#ee-sheet-bar .ee-sheet-handle', (b) => {
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.touchscreen.touchStart(handle.x, handle.y);
  for (let dy = 10; dy <= 120; dy += 10)
    await page.touchscreen.touchMove(handle.x, handle.y + dy);
  await page.touchscreen.touchEnd();
  await sleep(600);
  r.closedBySwipe = await page.evaluate(
    () => window.__atlasEye.mobile.openSheetId === null,
  );
  if (!r.closedBySwipe)
    fail(key, 'dragging the handle down did not close the sheet');
  r.collapsedAfterClose = await page.evaluate(() =>
    ['data-panel', 'scene-panel'].every((id) =>
      document.getElementById(id)?.classList.contains('collapsed'),
    ),
  );

  if (full) {
    await page.tap('#ee-tabbar [data-ee-more]');
    await sleep(700);
    await shot(page, `${key}-08-more-menu`);
    r.moreSmallTargets = await smallTargets(page, '#atlas-dock button');
    if (r.moreSmallTargets.length)
      fail(key, `small MORE targets ${r.moreSmallTargets.join(', ')}`);
    await page.tap('#atlas-dock [data-atlas-open="keys"]');
    await sleep(2500);
    await shot(page, `${key}-09-keys-sheet`);
    r.keysSheet = await page.evaluate(() => ({
      open: !document.getElementById('atlas-panel').hidden,
      badge: document
        .querySelector('#ee-key-status')
        ?.textContent.replace(/\s+/g, ' ')
        .trim(),
    }));
    await page.tap('#atlas-panel .atlas-panel-close');
    await sleep(400);
    await page.tap('#ee-tabbar [data-ee-more]');
    await sleep(500);
    await page.tap('#atlas-dock [data-atlas-open="safety"]');
    await sleep(800);
    r.safetyText = await page.evaluate(() =>
      document
        .querySelector('#atlas-panel .atlas-panel-body')
        ?.textContent.includes('No tracking of private individuals'),
    );
    if (!r.safetyText)
      fail(key, 'full safety text not reachable from MORE → SAFETY');
    await shot(page, `${key}-10-safety-sheet`);
    await page.tap('#atlas-panel .atlas-panel-close');
    await sleep(400);

    await run(page, 'show aircraft near Austin');
    await sleep(8000);
    r.select = await run(page, 'select the nearest airborne aircraft');
    await sleep(6000);
    await shot(page, `${key}-11-target-selected`);
    const boxes = await measure(page);
    r.selectOverlaps = overlaps(boxes.filter((b) => !TRANSIENT.includes(b.id)));
    if (r.selectOverlaps.length)
      fail(key, `target selected overlap: ${r.selectOverlaps.join('; ')}`);
    r.cockpit = await run(page, 'cockpit');
    await sleep(7000);
    await shot(page, `${key}-11b-cockpit`);
    const cockpitBoxes = await measure(page);
    r.cockpitVisible = cockpitBoxes.map((b) => b.id);
    r.cockpitOverlaps = overlaps(cockpitBoxes.filter((b) => !TRANSIENT.includes(b.id)), ['atlas-command-output']);
    if (r.cockpitOverlaps.length) fail(key, `cockpit overlap: ${r.cockpitOverlaps.join('; ')}`);
    if (r.cockpitVisible.includes('ee-tabbar')) fail(key, 'tab bar shown over the cockpit');
    await run(page, 'exit cockpit');
    await sleep(3000);
    await run(page, 'flir');
    await sleep(3000);
    await shot(page, `${key}-12-flir`);
    await page.tap('#ee-tabbar [data-ee-more]');
    await sleep(400);
    await page.tap('#atlas-dock [data-ee-action="hud"]');
    await sleep(1500);
    await shot(page, `${key}-13-flir-hud-on`);
    const hudBoxes = await measure(page);
    r.hudOverlaps = overlaps(
      hudBoxes.filter((b) => !TRANSIENT.includes(b.id)),
      ['atlas-command-output'],
    );
    if (r.hudOverlaps.length)
      fail(key, `HUD overlap: ${r.hudOverlaps.join('; ')}`);
    await page.tap('#ee-tabbar [data-ee-more]');
    await sleep(400);
    await page.tap('#atlas-dock [data-ee-action="hud"]');
    await run(page, 'normal');
  }
  await page.close();
}

async function desktopUnchanged() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__atlasEye?.mobile, {
    timeout: 90000,
  });
  await sleep(4000);
  const d = await page.evaluate(() => ({
    compact: document.documentElement.classList.contains('ee-compact'),
    tabbar: getComputedStyle(document.getElementById('ee-tabbar')).display,
    keyBadge: getComputedStyle(document.getElementById('ee-key-status'))
      .display,
    rails: [
      'left-panel-stack',
      'right-context-rail',
      'command-dock',
      'top-center-actions',
    ].map((id) => getComputedStyle(document.getElementById(id)).display),
    extras: [...document.querySelectorAll('#atlas-dock .ee-compact-only')].map(
      (b) => getComputedStyle(b).display,
    ),
  }));
  report.desktop = d;
  if (
    d.compact ||
    d.tabbar !== 'none' ||
    d.keyBadge !== 'none' ||
    d.rails.includes('none') ||
    d.extras.some((x) => x !== 'none')
  )
    fail(
      'desktop 1440×900',
      `mobile chrome leaked into desktop: ${JSON.stringify(d)}`,
    );
  await shot(page, 'desktop-1440-unchanged');
  await page.close();
}

try {
  await viewport(
    '390x844',
    {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
    { full: true },
  );
  await viewport(
    '430x932',
    {
      width: 430,
      height: 932,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
    { full: false },
  );
  await viewport(
    '844x390',
    {
      width: 844,
      height: 390,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      isLandscape: true,
    },
    { full: false },
  );
  await desktopUnchanged();
} catch (error) {
  report.fatal = String(error?.stack || error);
  report.failures.push(`fatal: ${error?.message || error}`);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(OUT, 'mobile-layout-report.json'),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
console.log(
  JSON.stringify(
    { failures: report.failures, pageErrors: report.pageErrors?.length || 0 },
    null,
    1,
  ),
);
process.exit(report.failures.length ? 1 : 0);
