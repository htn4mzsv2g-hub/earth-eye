#!/usr/bin/env node
/**
 * Earth Eye iPhone QA (headless Chrome EMULATING iPhone Safari; not a real
 * iPhone: no WebKit, no native HLS, no iOS autoplay policy).
 *
 *   node scripts/qa-iphone.mjs --url http://127.0.0.1:4173 \
 *     [--out screenshots/mobile-v2] [--chrome /usr/bin/google-chrome] \
 *     [--viewports 390x844,430x932,375x667] [--tag local]
 *
 * With QA_LOGIN_USER / QA_LOGIN_PASS in the environment it signs in first
 * through the real form (values are typed, never printed, never captured).
 *
 * Per viewport (iPhone UA, isMobile, hasTouch, DPR 3):
 *   - every bottom-tab and MORE sheet opens; the sheet sits between the
 *     command bar and the tab bar (never under the nav);
 *   - a touch swipe inside the sheet (also from its side gap) scrolls it
 *     (scrollTop changes) and does not move the globe camera;
 *   - the last element can be scrolled into view above the tab bar;
 *   - close by the 44px ✕, by swiping the header down, by tapping the active
 *     tab, by Escape and by history back;
 *   - CCTV browser: list with media badges, filters (media type, provider,
 *     search), card → viewer; a STILL IMAGE renders (naturalWidth > 0) with no
 *     play button; a VIDEO CLIP shows a play button and plays inline; LIVE
 *     HLS (when the catalog has any): autoplay attempt + the blocked-autoplay
 *     fallback (the rejection is emulated by stubbing play() once);
 *   - DATA SOURCES lists every registered layer with a classification badge.
 * Writes PNGs + iphone-report.json into --out; exits 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://127.0.0.1:4173').replace(/\/$/, '');
const OUT = arg('out', 'screenshots/mobile-v2');
const TAG = arg('tag', new URL(BASE).hostname.replace(/[^a-z0-9]+/gi, '-'));
const CHROME = arg(
  'chrome',
  process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
);
const VIEWPORTS = arg('viewports', '390x844,430x932,375x667')
  .split(',')
  .map((v) => v.split('x').map(Number));
const USER = process.env.QA_LOGIN_USER || '';
const PASS = process.env.QA_LOGIN_PASS || '';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {
  base: BASE,
  emulation:
    'Headless Google Chrome with iPhone UA, isMobile, hasTouch, DPR 3. Not WebKit: native HLS, iOS autoplay policy and Safari toolbars are not reproduced.',
  startedAt: new Date().toISOString(),
  loggedIn: false,
  viewports: {},
  failures: [],
  notes: [],
};
const fail = (vp, msg) => {
  report.failures.push(`${vp}: ${msg}`);
  console.log(`  ✖ ${msg}`);
};
const ok = (msg) => console.log(`  ✔ ${msg}`);
const shot = async (page, name) => {
  const file = path.join(OUT, `${TAG}-${name}.png`);
  await page.screenshot({ path: file });
  return file;
};

const TABS = ['explore', 'layers', 'cctv', 'analyst'];
const MORE_SHEETS = [
  { id: 'scenes', sel: '#atlas-dock [data-ee-sheet="scenes"]' },
  { id: 'display', sel: '#atlas-dock [data-ee-sheet="display"]' },
  { id: 'context', sel: '#atlas-dock [data-ee-sheet="context"]' },
  { id: 'visual', sel: '[data-ee-sheet="visual"]' },
  { id: 'cctv-layer', sel: '[data-ee-sheet="cctv-layer"]' },
  { id: 'sources', sel: '#atlas-dock [data-atlas-open="feeds"]' },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

async function login(page) {
  if (!USER || !PASS) return false;
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
  if (!(await page.$('#username'))) return false;
  await page.type('#username', USER);
  await page.type('#password', PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
  // Blank the form memory before any screenshot is possible.
  return !(await page.$('#password'));
}

/** State snapshot of the open overlay. */
function overlayState() {
  const host = document.querySelector('.ee-sheet-host');
  const panel = document.getElementById('atlas-panel');
  const viewer = document.getElementById('ee-cam-viewer');
  let scroller = null;
  let kind = 'none';
  if (viewer && !viewer.hidden) {
    scroller = viewer.querySelector('.ee-cam-view-body');
    kind = 'viewer';
  } else if (host) {
    scroller = host;
    kind = 'sheet';
  } else if (panel && !panel.hidden) {
    scroller = panel.querySelector('.atlas-panel-body');
    kind = 'panel';
  }
  const tab = document.getElementById('ee-tabbar').getBoundingClientRect();
  const cmd = document.getElementById('atlas-command-bar').getBoundingClientRect();
  const r = scroller?.getBoundingClientRect();
  return {
    kind,
    open: Boolean(scroller),
    top: r?.top ?? null,
    bottom: r?.bottom ?? null,
    scrollTop: scroller?.scrollTop ?? 0,
    scrollHeight: scroller?.scrollHeight ?? 0,
    clientHeight: scroller?.clientHeight ?? 0,
    tabTop: tab.top,
    cmdBottom: cmd.bottom,
    overlayAttr: document.documentElement.dataset.eeOverlay || null,
  };
}

function cameraPose() {
  const v = window.__godsEyeView?.viewer;
  if (!v) return null;
  const p = v.camera.positionWC;
  return { x: p.x, y: p.y, z: p.z, h: v.camera.heading, t: v.camera.pitch };
}
const moved = (a, b) =>
  !a || !b
    ? false
    : Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 1 ||
      Math.abs(a.h - b.h) > 1e-4 ||
      Math.abs(a.t - b.t) > 1e-4;

async function swipe(page, x, y1, y2, steps = 12) {
  await page.touchscreen.touchStart(x, y1);
  for (let i = 1; i <= steps; i++) {
    await page.touchscreen.touchMove(x, y1 + ((y2 - y1) * i) / steps);
    await sleep(16);
  }
  await page.touchscreen.touchEnd();
  await sleep(450);
}

async function tap(page, selector) {
  const h = await page.$(selector);
  if (!h) throw new Error(`missing ${selector}`);
  await h.tap();
  await sleep(500);
}

async function scrollCheck(page, vp, label) {
  const s0 = await page.evaluate(overlayState);
  const result = { label, ...s0 };
  if (!s0.open) {
    fail(vp, `${label}: did not open`);
    return result;
  }
  // Geometry: between the command bar and the tab bar.
  if (s0.bottom > s0.tabTop + 1) fail(vp, `${label}: sheet bottom ${s0.bottom} under the tab bar (${s0.tabTop})`);
  if (s0.top < s0.cmdBottom - 1) fail(vp, `${label}: sheet top ${s0.top} over the command bar (${s0.cmdBottom})`);
  const scrollable = s0.scrollHeight > s0.clientHeight + 8;
  result.scrollable = scrollable;
  const pose0 = await page.evaluate(cameraPose);
  if (scrollable) {
    const box = await page.evaluate(() => {
      const st = (() => {
        const v = document.getElementById('ee-cam-viewer');
        if (v && !v.hidden) return v.querySelector('.ee-cam-view-body');
        return document.querySelector('.ee-sheet-host') ||
          document.querySelector('#atlas-panel:not([hidden]) .atlas-panel-body');
      })();
      const r = st.getBoundingClientRect();
      return { x: r.left, w: r.width, top: r.top, bottom: r.bottom };
    });
    // 1) swipe in the middle of the content.
    await swipe(page, box.x + box.w / 2, box.bottom - 40, box.top + 40);
    const s1 = await page.evaluate(overlayState);
    result.afterSwipe = s1.scrollTop;
    if (!(s1.scrollTop > s0.scrollTop)) fail(vp, `${label}: touch swipe did not scroll (scrollTop ${s0.scrollTop} → ${s1.scrollTop})`);
    else ok(`${label}: touch swipe scrolled ${s0.scrollTop} → ${s1.scrollTop}`);
    // 2) swipe starting in the side gap (the old fall-through bug).
    await swipe(page, box.x + 4, box.bottom - 40, box.top + 60);
    const s2 = await page.evaluate(overlayState);
    result.afterGapSwipe = s2.scrollTop;
    if (!(s2.scrollTop > s1.scrollTop) && s1.scrollTop + s1.clientHeight < s1.scrollHeight - 4)
      fail(vp, `${label}: swipe from the side gap did not scroll`);
    // 3) wheel.
    await page.mouse.move(box.x + box.w / 2, (box.top + box.bottom) / 2);
    await page.evaluate(() => {
      const v = document.getElementById('ee-cam-viewer');
      const st = v && !v.hidden
        ? v.querySelector('.ee-cam-view-body')
        : document.querySelector('.ee-sheet-host') ||
          document.querySelector('#atlas-panel:not([hidden]) .atlas-panel-body');
      st.scrollTop = 0;
    });
    await sleep(200);
    await page.mouse.wheel({ deltaY: 400 });
    await sleep(700);
    const s3 = await page.evaluate(overlayState);
    result.afterWheel = s3.scrollTop;
    if (!(s3.scrollTop > 0)) fail(vp, `${label}: wheel did not scroll`);
    const pose1 = await page.evaluate(cameraPose);
    if (moved(pose0, pose1)) fail(vp, `${label}: the globe moved while the sheet was scrolled`);
    else ok(`${label}: globe camera unchanged during sheet scroll`);
  } else {
    // Still prove the globe does not pan under a swipe on the sheet.
    const r = s0;
    await swipe(page, 200, r.bottom - 30, r.top + 30);
    const pose1 = await page.evaluate(cameraPose);
    if (moved(pose0, pose1)) fail(vp, `${label}: the globe moved under a swipe on the sheet`);
    ok(`${label}: content fits without scrolling (${s0.scrollHeight}px); globe unchanged`);
  }
  // Last element reachable and not hidden by the nav.
  const last = await page.evaluate(() => {
    const v = document.getElementById('ee-cam-viewer');
    const st = v && !v.hidden
      ? v.querySelector('.ee-cam-view-body')
      : document.querySelector('.ee-sheet-host') ||
        document.querySelector('#atlas-panel:not([hidden]) .atlas-panel-body');
    st.scrollTop = st.scrollHeight;
    const all = [...st.querySelectorAll('*')].filter((n) => {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && !n.children.length;
    });
    const el = all.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
    if (!el) return null;
    el.scrollIntoView({ block: 'end' });
    const r = el.getBoundingClientRect();
    const tabTop = document.getElementById('ee-tabbar').getBoundingClientRect().top;
    const hit = document.elementFromPoint(Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)), r.top + Math.min(r.height / 2, 10));
    return {
      text: (el.textContent || el.tagName).trim().slice(0, 40),
      bottom: r.bottom,
      tabTop,
      hitInside: Boolean(hit && st.contains(hit)),
    };
  });
  result.last = last;
  if (!last) fail(vp, `${label}: no last element found`);
  else if (last.bottom > last.tabTop + 1 || !last.hitInside)
    fail(vp, `${label}: last element "${last.text}" hidden (bottom ${last.bottom}, tab top ${last.tabTop}, hit ${last.hitInside})`);
  else ok(`${label}: last element "${last.text}" visible above the tab bar`);
  await page.evaluate(() => {
    const st = document.querySelector('.ee-sheet-host') ||
      document.querySelector('#atlas-panel:not([hidden]) .atlas-panel-body');
    if (st) st.scrollTop = 0;
  });
  return result;
}

async function closeBySwipe(page) {
  const head = await page.evaluate(() => {
    // Only the drag handle dismisses (content and header text never do).
    const bar = document.querySelector('#ee-sheet-bar:not([hidden]) .ee-sheet-handle') ||
      document.querySelector('#atlas-panel:not([hidden]) .ee-handle');
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!head) return false;
  await swipe(page, head.x, head.y, head.y + 220, 10);
  return !(await page.evaluate(overlayState)).open;
}

async function openTab(page, id) {
  await tap(page, `#ee-tabbar [data-ee-sheet="${id}"]`);
  await sleep(700);
}
async function openMore(page, sel) {
  await tap(page, '#ee-tabbar [data-ee-more]');
  await tap(page, sel);
  await sleep(700);
}

async function runViewport(w, h) {
  const vp = `${w}x${h}`;
  console.log(`\n=== ${vp} ===`);
  const res = { sheets: {}, cctv: {}, sources: {} };
  report.viewports[vp] = res;
  const page = await browser.newPage();
  await page.setUserAgent(IPHONE_UA);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message || e).slice(0, 200)));
  if (USER && PASS && !report.loggedIn) report.loggedIn = await login(page);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(
    () => window.__atlasEye?.openPanel && document.querySelector('#ee-tabbar') && window.__godsEyeView?.viewer,
    { timeout: 120000 },
  );
  await sleep(4000);
  const compact = await page.evaluate(() => document.documentElement.classList.contains('ee-compact'));
  if (!compact) fail(vp, 'compact mode not active');
  const home = await page.evaluate(() => ({
    ww: document.documentElement.scrollWidth,
    vw: innerWidth,
    safe: getComputedStyle(document.documentElement).getPropertyValue('--ee-bar-h'),
  }));
  if (home.ww > home.vw + 1) fail(vp, `horizontal overflow ${home.ww} > ${home.vw}`);
  res.home = await shot(page, `${vp}-home`);
  const okBtn = await page.$('#atlas-disclaimer [data-atlas-action="ack"]');
  if (okBtn) {
    await okBtn.tap();
    await sleep(300);
  }

  // ── Bottom tabs ──
  for (const id of TABS) {
    await openTab(page, id);
    const r = await scrollCheck(page, vp, id);
    if (w === 390 || id === 'cctv') r.shot = await shot(page, `${vp}-sheet-${id}`);
    res.sheets[id] = r;
    // Close via ✕
    const closeSel = (await page.$('#ee-sheet-bar:not([hidden]) .ee-sheet-close'))
      ? '#ee-sheet-bar .ee-sheet-close'
      : '#atlas-panel .atlas-panel-close';
    await tap(page, closeSel);
    if ((await page.evaluate(overlayState)).open) fail(vp, `${id}: ✕ did not close`);
    // Reopen, close by swiping the header down
    await openTab(page, id);
    const swiped = await closeBySwipe(page);
    if (!swiped) fail(vp, `${id}: swipe-down did not close`);
    // Reopen, close by tapping the active tab
    await openTab(page, id);
    await openTab(page, id);
    if ((await page.evaluate(overlayState)).open) fail(vp, `${id}: tapping the active tab did not close`);
    else ok(`${id}: closes by ✕, swipe-down and active-tab tap`);
  }
  // Tab switch switches the sheet
  await openTab(page, 'explore');
  await openTab(page, 'layers');
  const sw = await page.evaluate(() => document.documentElement.dataset.eeSheet);
  if (sw !== 'layers') fail(vp, `tab switch left sheet "${sw}"`);
  // Escape closes
  await page.keyboard.press('Escape');
  await sleep(300);
  if ((await page.evaluate(overlayState)).open) fail(vp, 'Escape did not close the sheet');
  // Back closes (history entry per open sheet)
  await openTab(page, 'layers');
  await sleep(200);
  const urlBefore = page.url();
  await page.goBack({ timeout: 5000 }).catch(() => null);
  await sleep(500);
  const afterBack = await page.evaluate(overlayState);
  if (afterBack.open) fail(vp, 'history back did not close the sheet');
  if (!page.url().startsWith(BASE)) fail(vp, `history back left the app (${page.url()})`);
  else ok(`Escape and back close sheets (stayed on ${urlBefore === page.url() ? 'same URL' : page.url()})`);

  // ── MORE sheets ──
  for (const m of MORE_SHEETS) {
    await openMore(page, m.sel);
    const r = await scrollCheck(page, vp, `more:${m.id}`);
    if (w === 390) r.shot = await shot(page, `${vp}-more-${m.id}`);
    res.sheets[`more:${m.id}`] = r;
    if (m.id === 'sources') {
      const src = await page.evaluate(() => {
        const ids = window.__godsEyeView.dataManager
          .getAll()
          .filter((l) => l.showInTogglePanel !== false)
          .map((l) => l.id);
        const rows = [...document.querySelectorAll('#atlas-panel .ee-src')];
        const shown = new Set(rows.map((r) => r.dataset.sourceId));
        return {
          layers: ids.length,
          rows: rows.length,
          missing: ids.filter((id) => !shown.has(id)),
          badges: rows.filter((r) => r.querySelector('.ee-badge')).length,
          classes: [...new Set(rows.map((r) => r.dataset.class))],
        };
      });
      res.sources = src;
      if (src.missing.length) fail(vp, `Data Sources missing layers: ${src.missing.join(', ')}`);
      else if (src.badges !== src.rows) fail(vp, 'Data Sources row without a badge');
      else ok(`Data Sources lists all ${src.layers} layers (${src.rows} rows) with badges: ${src.classes.join(' | ')}`);
    }
    await page.keyboard.press('Escape');
    await sleep(300);
    const panelOpen = await page.evaluate(() => !document.getElementById('atlas-panel').hidden);
    if (panelOpen) await tap(page, '#atlas-panel .atlas-panel-close');
  }

  // ── CCTV browser ──
  await openTab(page, 'cctv');
  await page.waitForSelector('#atlas-panel .ee-cam-card', { timeout: 60000 });
  const list = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#atlas-panel .ee-cam-card')];
    const chip = (k) => document.querySelector(`[data-cam-kind="${k}"] .ee-mono`)?.textContent || '0';
    return {
      cards: cards.length,
      badges: cards.filter((c) => c.querySelector('.ee-badge[data-media]')).length,
      counts: { live: chip('live'), clip: chip('clip'), still: chip('still') },
    };
  });
  res.cctv.list = list;
  if (!list.cards || list.badges !== list.cards) fail(vp, `CCTV list: ${list.cards} cards, ${list.badges} badges`);
  else ok(`CCTV list renders ${list.cards} cards with media badges (live ${list.counts.live}, clip ${list.counts.clip}, still ${list.counts.still})`);
  const n = (s) => Number(String(s).replace(/,/g, '')) || 0;
  const filterCheck = async (kind) => {
    await tap(page, `[data-cam-kind="${kind}"]`);
    await sleep(300);
    const kinds = await page.evaluate(() => [...new Set([...document.querySelectorAll('#atlas-panel .ee-cam-card .ee-badge[data-media]')].map((b) => b.dataset.media))]);
    await tap(page, `[data-cam-kind="${kind}"]`);
    return kinds;
  };
  for (const kind of ['still', 'clip', 'live']) {
    if (!n(list.counts[kind])) continue;
    const kinds = await filterCheck(kind);
    res.cctv[`filter_${kind}`] = kinds;
    if (kinds.length !== 1 || kinds[0] !== kind) fail(vp, `filter ${kind} shows ${kinds.join(',')}`);
    else ok(`filter ${kind}: only ${kind} cards`);
  }
  // Provider filter
  const prov = await page.evaluate(() => {
    const sel = document.querySelector('[data-cam-provider]');
    const opt = [...sel.options].find((o) => o.value);
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return opt.value;
  });
  await sleep(300);
  const provOk = await page.evaluate((p) => {
    const cards = [...document.querySelectorAll('#atlas-panel .ee-cam-card')];
    const sel = document.querySelector('[data-cam-provider]');
    const short = sel.options[sel.selectedIndex].textContent.replace(/\s*\(\d+\)$/, '');
    return cards.length > 0 && cards.every((c) => c.querySelector('.ee-cam-sub').textContent.startsWith(short));
  }, prov);
  if (!provOk) fail(vp, `provider filter "${prov}" failed`);
  else ok(`provider filter "${prov}" works`);
  await page.evaluate(() => {
    const sel = document.querySelector('[data-cam-provider]');
    sel.value = '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // Search
  await page.type('[data-cam-search]', 'zzzz-no-such-camera');
  await sleep(500);
  const none = await page.evaluate(() => document.querySelectorAll('#atlas-panel .ee-cam-card').length);
  if (none !== 0) fail(vp, 'search for a nonsense term still lists cameras');
  await page.evaluate(() => {
    const i = document.querySelector('[data-cam-search]');
    i.value = '';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(500);
  if (w === 390) res.cctv.listShot = await shot(page, `${vp}-cctv-list`);

  // STILL viewer
  if (n(list.counts.still)) {
    await tap(page, '[data-cam-kind="still"]');
    await sleep(300);
    await tap(page, '#atlas-panel .ee-cam-card');
    await page.waitForSelector('#ee-cam-viewer:not([hidden])', { timeout: 5000 });
    const still = await page
      .waitForFunction(
        () => {
          const st = document.getElementById('ee-cam-stage');
          const img = st.querySelector('img.ee-cam-img');
          if (st.dataset.state === 'unavailable') return { state: 'unavailable' };
          return img && img.naturalWidth > 0 ? { state: st.dataset.state, w: img.naturalWidth, h: img.naturalHeight } : false;
        },
        { timeout: 30000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => ({ state: 'timeout' }));
    const extra = await page.evaluate(() => ({
      play: Boolean(document.querySelector('#ee-cam-stage .ee-bigplay, #ee-cam-stage video')),
      line: document.getElementById('ee-cam-line').textContent,
      title: document.getElementById('ee-cam-title').textContent,
    }));
    res.cctv.still = { ...still, ...extra };
    if (!(still.w > 0)) fail(vp, `STILL viewer did not display an image (${still.state})`);
    else if (extra.play) fail(vp, 'STILL viewer shows a play control');
    else if (!/Refreshed \d\d:\d\d:\d\d CT/.test(extra.line)) fail(vp, `STILL viewer line "${extra.line}"`);
    else ok(`STILL image displayed ${still.w}×${still.h}, no play button, "${extra.line.slice(0, 60)}…"`);
    res.cctv.stillShot = await shot(page, `${vp}-viewer-still`);
    // viewer scroll + next
    res.sheets.viewer = await scrollCheck(page, vp, 'viewer');
    await tap(page, '[data-viewer-step="1"]');
    await sleep(400);
    const t2 = await page.evaluate(() => document.getElementById('ee-cam-title').textContent);
    if (t2 === extra.title) fail(vp, 'Next camera did not change the camera');
    else ok(`Next → "${t2}"`);
    await tap(page, '[data-viewer-close]');
    await tap(page, '[data-cam-kind="still"]');
  }

  // CLIP viewer
  if (n(list.counts.clip)) {
    await tap(page, '[data-cam-kind="clip"]');
    await sleep(300);
    await tap(page, '#atlas-panel .ee-cam-card');
    await page.waitForSelector('#ee-cam-viewer:not([hidden]) video', { timeout: 5000 });
    const before = await page.evaluate(() => {
      const v = document.querySelector('#ee-cam-stage video');
      return {
        playButton: Boolean(document.querySelector('#ee-cam-stage .ee-bigplay:not([hidden])')),
        playsinline: v.hasAttribute('playsinline'),
        controls: v.controls,
      };
    });
    if (w === 390) res.cctv.clipReadyShot = await shot(page, `${vp}-viewer-clip-ready`);
    await tap(page, '#ee-cam-stage .ee-bigplay');
    const played = await page
      .waitForFunction(
        () => {
          const v = document.querySelector('#ee-cam-stage video');
          const st = document.getElementById('ee-cam-stage').dataset.state;
          if (st === 'unavailable') return { state: st };
          return v && v.currentTime > 0.2 ? { state: st, t: v.currentTime, inline: !document.fullscreenElement } : false;
        },
        { timeout: 30000 },
      )
      .then((h) => h.jsonValue())
      .catch(() => ({ state: 'timeout' }));
    res.cctv.clip = { ...before, ...played };
    if (!before.playButton || !before.playsinline) fail(vp, `CLIP viewer missing play button or playsinline (${JSON.stringify(before)})`);
    else if (!(played.t > 0)) fail(vp, `CLIP did not play (${played.state})`);
    else ok(`VIDEO CLIP: play button shown, played inline to ${played.t.toFixed(1)} s`);
    if (w === 390) res.cctv.clipShot = await shot(page, `${vp}-viewer-clip-playing`);
    await tap(page, '[data-viewer-close]');
    await tap(page, '[data-cam-kind="clip"]');
  }

  // LIVE viewer (only if the catalog has live cameras)
  if (n(list.counts.live)) {
    await tap(page, '[data-cam-kind="live"]');
    await sleep(300);
    // (a) autoplay attempt as-is
    await tap(page, '#atlas-panel .ee-cam-card');
    const live = await page
      .waitForFunction(
        () => {
          const st = document.getElementById('ee-cam-stage');
          return ['live-playing', 'live-blocked', 'unavailable'].includes(st.dataset.state)
            ? { state: st.dataset.state, player: st.dataset.player, line: document.getElementById('ee-cam-line').textContent }
            : false;
        },
        { timeout: 60000, polling: 500 },
      )
      .then((h) => h.jsonValue())
      .catch(() => ({ state: 'timeout' }));
    res.cctv.liveAutoplay = live;
    if (live.state === 'timeout') fail(vp, 'LIVE viewer never reached playing/blocked/unavailable');
    else ok(`LIVE autoplay attempt → ${live.state} via ${live.player} ("${live.line.slice(0, 70)}")`);
    if (w === 390 || live.state !== 'live-playing') res.cctv.liveShot = await shot(page, `${vp}-viewer-live-${live.state}`);
    await tap(page, '[data-viewer-close]');
    // (b) blocked-autoplay fallback: emulate iOS rejecting play() once.
    await page.evaluate(() => {
      const orig = HTMLMediaElement.prototype.play;
      let once = true;
      HTMLMediaElement.prototype.play = function () {
        if (once && this.closest?.('#ee-cam-stage')) {
          once = false;
          return Promise.reject(new DOMException('emulated', 'NotAllowedError'));
        }
        return orig.call(this);
      };
    });
    await tap(page, '#atlas-panel .ee-cam-card');
    const blocked = await page
      .waitForFunction(
        () => {
          const st = document.getElementById('ee-cam-stage');
          return st.dataset.state === 'live-blocked' || st.dataset.state === 'unavailable'
            ? { state: st.dataset.state, line: document.getElementById('ee-cam-line').textContent, button: Boolean(st.querySelector('.ee-bigplay')) }
            : false;
        },
        { timeout: 60000, polling: 300 },
      )
      .then((h) => h.jsonValue())
      .catch(() => ({ state: 'timeout' }));
    res.cctv.liveBlocked = blocked;
    if (blocked.state !== 'live-blocked' || !blocked.button || blocked.line !== 'iPhone blocked autoplay. Tap Play to start the stream.')
      fail(vp, `LIVE blocked-autoplay fallback wrong: ${JSON.stringify(blocked)}`);
    else {
      ok('LIVE blocked autoplay → big Play button + "iPhone blocked autoplay. Tap Play to start the stream."');
      if (w === 390) res.cctv.liveBlockedShot = await shot(page, `${vp}-viewer-live-blocked`);
      await tap(page, '#ee-cam-stage .ee-bigplay');
      const after = await page
        .waitForFunction(
          () => {
            const st = document.getElementById('ee-cam-stage').dataset.state;
            return st === 'live-playing' || st === 'unavailable' ? st : false;
          },
          { timeout: 60000, polling: 500 },
        )
        .then((h) => h.jsonValue())
        .catch(() => 'timeout');
      res.cctv.liveAfterTap = after;
      ok(`LIVE after tapping Play → ${after}`);
    }
    await tap(page, '[data-viewer-close]');
    await tap(page, '[data-cam-kind="live"]');
  } else {
    report.notes.push(`${vp}: catalog has no LIVE cameras here; live path not exercised`);
  }
  await tap(page, '#atlas-panel .atlas-panel-close');
  res.pageErrors = errors;
  if (errors.length) report.notes.push(`${vp}: page errors: ${errors.slice(0, 5).join(' | ')}`);
  await page.close();
}

try {
  for (const [w, h] of VIEWPORTS) {
    try {
      await runViewport(w, h);
    } catch (error) {
      fail(`${w}x${h}`, `crashed: ${error?.message || error}`);
    }
  }
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, `${TAG}-iphone-report.json`), JSON.stringify(report, null, 2));
  console.log(`\n${report.failures.length ? `FAIL (${report.failures.length})` : 'PASS'} → ${path.join(OUT, `${TAG}-iphone-report.json`)}`);
  if (report.failures.length) {
    for (const f of report.failures) console.log(` - ${f}`);
    process.exitCode = 1;
  }
}
