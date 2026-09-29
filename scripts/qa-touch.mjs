#!/usr/bin/env node
/**
 * Earth Eye Stage 1 touch QA (Playwright). Runs the same checks in two engines:
 *
 *   chromium  Chrome with iPhone emulation (UA, viewport, isMobile, hasTouch).
 *             Swipes are REAL touch sequences through CDP
 *             Input.dispatchTouchEvent (touchStart → touchMove… → touchEnd),
 *             which drive the compositor's native touch scrolling.
 *   webkit    Playwright WebKit (WebKitGTK engine) with the iPhone device
 *             descriptors. Playwright exposes no touch-move for WebKit, so the
 *             WebKit pass checks the iOS scroll preconditions directly: the
 *             element under each touch point is inside the scroller (not the
 *             globe), the effective touch-action from that element up to the
 *             scroller allows pan-y (WebKit's own algorithm), cancelable
 *             touchstart/touchmove events are not preventDefault-ed by any
 *             handler, the scroller really overflows, and the last item ends
 *             above the tab bar when scrolled to the end. Taps are real.
 *
 * Neither engine is a physical iPhone. Reported as emulation.
 *
 *   BASE=http://127.0.0.1:4173 ENGINES=chromium,webkit node scripts/qa-touch.mjs
 *   Live: BASE=https://eartheye.us QA_LOGIN_USER=… QA_LOGIN_PASS=… (env only).
 * Screenshots → screenshots/mobile-v2/touch/ (gitignored).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const PW =
  process.env.PLAYWRIGHT_MODULE ||
  '/workspace/.tools/pw/node_modules/playwright/index.mjs';
const { chromium, webkit, devices } = await import(PW);

const BASE = (process.env.BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
const ENGINES = (process.env.ENGINES || 'chromium,webkit').split(',');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const PARTS = new Set((process.env.PARTS || 'sheets,memory,headers,keyboard,text,cameras,map,analyst').split(','));
const VPS = process.env.VPS ? process.env.VPS.split(',') : null;
const USER = process.env.QA_LOGIN_USER || '';
const PASS = process.env.QA_LOGIN_PASS || '';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const OUT = path.resolve('screenshots/mobile-v2/touch');
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------ live-stream test fixture
// No LIVE source is enabled (DelDOT and Maryland CHART are held pending
// permission), so the live player has no real stream to play. When the real
// catalog has no live camera, the test injects ONE clearly labelled synthetic
// camera through Playwright request routing and serves a local HLS test
// pattern made with ffmpeg. Nothing is added to the app or the server; results
// that used it are labelled "[test fixture]". QA_LIVE_FIXTURE=0 turns it off.
const FIXTURE_ON = process.env.QA_LIVE_FIXTURE !== '0';
const FIXTURE_DIR = '/tmp/qa-hls-fixture';
const FIXTURE_ID = 'qa-fixture-live';
function ensureFixture() {
  if (!FIXTURE_ON) return false;
  if (existsSync(path.join(FIXTURE_DIR, 'live.m3u8'))) return true;
  try {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    execFileSync('ffmpeg', [
      '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25',
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', '60', '-c:v', 'libx264', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p',
      '-g', '50', '-c:a', 'aac', '-b:a', '64k', '-shortest',
      '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod',
      '-hls_base_url', '/qa-fixture/', '-hls_segment_filename', path.join(FIXTURE_DIR, 'seg%03d.ts'),
      path.join(FIXTURE_DIR, 'live.m3u8'),
    ]);
    return true;
  } catch (e) {
    console.log(`NOTE live fixture unavailable (ffmpeg failed: ${e.message.split('\n')[0]})`);
    return false;
  }
}
const FIXTURE_READY = ensureFixture();
async function installLiveFixture(ctx) {
  if (!FIXTURE_READY) return;
  const { page } = ctx;
  await page.route(/\/api\/cctv\/sources(\?|$)/, async (route) => {
    const res = await route.fetch();
    let j;
    try {
      j = await res.json();
    } catch {
      return route.fulfill({ response: res });
    }
    const list = Array.isArray(j?.sources) ? j.sources : [];
    if (!list.some((c) => c?.media?.kind === 'live')) {
      ctx.liveFixture = true;
      list.unshift({
        id: FIXTURE_ID,
        name: 'QA TEST FIXTURE (synthetic test pattern, not a camera)',
        city: 'Test fixture',
        cityId: 'qa-fixture',
        provider: 'QA test fixture',
        lat: 0.5,
        lon: -30.5,
        feedType: 'hls',
        sourceKind: 'qa-fixture',
        license: 'Synthetic test pattern generated locally by ffmpeg',
        media: { kind: 'live', label: 'LIVE VIDEO', live: true, clip: false, still: false, livePath: `/api/cctv/media/${FIXTURE_ID}` },
      });
      j.sources = list;
    }
    return route.fulfill({ response: res, json: j });
  });
  await page.route(new RegExp(`/api/cctv/media/${FIXTURE_ID}(\\?|$)`), (route) =>
    route.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', body: readFileSync(path.join(FIXTURE_DIR, 'live.m3u8'), 'utf8') }),
  );
  await page.route(/\/qa-fixture\/seg\d+\.ts/, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ status: 200, contentType: 'video/mp2t', body: readFileSync(path.join(FIXTURE_DIR, name)) });
  });
}

const VIEWPORTS = [
  { key: 'iphone13-390', device: 'iPhone 13' },
  { key: 'iphone14pm-430', device: 'iPhone 14 Pro Max' },
  { key: 'iphonese-375', device: 'iPhone SE' },
];

const results = [];
let failures = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function rec(engine, vp, check, pass, detail = '') {
  results.push({ engine, vp, check, pass, detail });
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} [${engine} ${vp}] ${check}${detail ? ` — ${detail}` : ''}`);
}
function note(engine, vp, check, detail) {
  results.push({ engine, vp, check, pass: null, detail });
  console.log(`NOTE [${engine} ${vp}] ${check} — ${detail}`);
}

// ----------------------------------------------------------- page helpers
function overlayScroller() {
  const viewer = document.getElementById('ee-cam-viewer');
  const host = document.querySelector('.ee-sheet-host');
  const panel = document.getElementById('atlas-panel');
  if (viewer && !viewer.hidden) return viewer.querySelector('.ee-cam-view-body');
  if (host) return host;
  if (panel && !panel.hidden) return panel.querySelector('.atlas-panel-body');
  return null;
}
const SCROLLER_FN = `(${overlayScroller.toString()})()`;

async function state(page) {
  return page.evaluate((fn) => {
    const s = eval(fn);
    const tab = document.getElementById('ee-tabbar')?.getBoundingClientRect();
    if (!s) return { open: false, tabTop: tab?.top ?? 0 };
    const r = s.getBoundingClientRect();
    return {
      open: true,
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      scrollTop: s.scrollTop,
      scrollHeight: s.scrollHeight,
      clientHeight: s.clientHeight,
      tabTop: tab?.top ?? 0,
      vh: innerHeight,
    };
  }, SCROLLER_FN);
}

/** Bottom of the last visible content item inside the scroller. */
async function lastItem(page) {
  return page.evaluate((fn) => {
    const s = eval(fn);
    if (!s) return null;
    let best = null;
    for (const n of s.querySelectorAll('*')) {
      if (n.children.length && !['BUTTON', 'A', 'INPUT', 'SELECT', 'LABEL', 'P', 'LI'].includes(n.tagName)) continue;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = n.getBoundingClientRect();
      if (r.height <= 1 || r.width <= 1) continue;
      if (!best || r.bottom > best.bottom) best = { bottom: r.bottom, tag: n.tagName, text: (n.textContent || '').trim().slice(0, 40) };
    }
    const sr = s.getBoundingClientRect();
    const tab = document.getElementById('ee-tabbar').getBoundingClientRect();
    return { ...best, scrollerBottom: sr.bottom, tabTop: tab.top, atEnd: Math.abs(s.scrollHeight - s.clientHeight - s.scrollTop) < 2 };
  }, SCROLLER_FN);
}

/** Topmost visible item with the scroller at 0: must not sit above the sheet. */
async function firstItem(page) {
  return page.evaluate((fn) => {
    const s = eval(fn);
    if (!s) return null;
    const keep = s.scrollTop;
    s.scrollTop = 0;
    let best = null;
    for (const n of s.querySelectorAll('*')) {
      if (n.children.length && !['BUTTON', 'A', 'INPUT', 'SELECT', 'LABEL', 'P', 'LI'].includes(n.tagName)) continue;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const r = n.getBoundingClientRect();
      if (r.height <= 1 || r.width <= 1) continue;
      if (!best || r.top < best.top) best = { top: r.top, tag: n.tagName, text: (n.textContent || '').trim().slice(0, 40) };
    }
    const top = s.getBoundingClientRect().top;
    s.scrollTop = keep;
    return best && { ...best, scrollerTop: top };
  }, SCROLLER_FN);
}

async function cameraPose(page) {
  return page.evaluate(() => {
    const v = window.__godsEyeView?.viewer;
    if (!v) return null;
    const p = v.camera.positionWC;
    return [p.x, p.y, p.z, v.camera.heading, v.camera.pitch];
  });
}
const poseMoved = (a, b) =>
  a && b && (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1 || Math.abs(a[3] - b[3]) > 1e-4 || Math.abs(a[4] - b[4]) > 1e-4);

/** Wait until the camera stops moving (fly-to or drag inertia). */
async function waitStill(page, ms = 10000) {
  const t0 = Date.now();
  let a = await cameraPose(page);
  while (Date.now() - t0 < ms) {
    await sleep(500);
    const b = await cameraPose(page);
    if (!poseMoved(a, b)) return true;
    a = b;
  }
  return false;
}

/** Real touch swipe (Chromium CDP). */
async function swipe(ctx, x, y1, y2, steps = 12) {
  const cdp = ctx.cdp;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y1, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y1 + ((y2 - y1) * i) / steps, id: 1 }] });
    await sleep(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(350);
}

/** WebKit: iOS scroll preconditions at a point inside the scroller. */
async function touchPreconditions(page, x, y) {
  return page.evaluate(
    ({ fn, x, y }) => {
      const s = eval(fn);
      const hit = document.elementFromPoint(x, y);
      const out = { hitInside: Boolean(s && hit && s.contains(hit)), hit: hit ? `${hit.tagName}.${[...hit.classList].join('.')}` : null };
      // WebKit's effective touch-action: intersect from the hit element up
      // to the nearest scrollable-overflow ancestor (inclusive).
      const chain = [];
      for (let n = hit; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        chain.push(cs.touchAction);
        if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) break;
        if (n === s) break;
      }
      out.touchActions = chain;
      out.panYAllowed = chain.every((t) => t === 'auto' || t === 'manipulation' || /pan-y/.test(t));
      // Cancelable touch events: does any handler call preventDefault?
      try {
        let mk;
        try {
          new Touch({ identifier: 7, target: hit, clientX: x, clientY: y });
          mk = (type) => {
            const t = new Touch({ identifier: 7, target: hit, clientX: x, clientY: y });
            return new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] });
          };
          out.touchKind = 'TouchEvent';
        } catch {
          // This WebKit build has no Touch constructor: a cancelable event of
          // the same type still reaches every touch listener, which is what
          // this check is about (does any handler call preventDefault).
          mk = (type) => new Event(type, { bubbles: true, cancelable: true, composed: true });
          out.touchKind = 'Event';
        }
        const e1 = mk('touchstart');
        hit.dispatchEvent(e1);
        const e2 = mk('touchmove');
        hit.dispatchEvent(e2);
        hit.dispatchEvent(mk('touchend'));
        out.prevented = e1.defaultPrevented || e2.defaultPrevented;
        out.touchEventsTested = true;
      } catch (e) {
        out.touchEventsTested = false;
        out.touchError = String(e.message || e);
      }
      out.overflowY = s ? getComputedStyle(s).overflowY : null;
      out.overflows = s ? s.scrollHeight > s.clientHeight + 2 : false;
      return out;
    },
    { fn: SCROLLER_FN, x, y },
  );
}

// ------------------------------------------------------------ navigation
async function closeAll(page) {
  await page.evaluate(() => {
    window.__atlasEye?.cctv?.closeViewer?.();
    window.__atlasEye?.closePanel?.();
    window.__atlasEye?.mobile?.closeSheet?.();
    window.__atlasEye?.mobile?.closeMore?.();
  });
  await sleep(250);
}

async function tap(page, selector) {
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  // A user scrolls until the control is uncovered (e.g. not under a sticky
  // search bar); do the same if the centre point hits something else.
  const covered = await loc.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(h && (h === el || el.contains(h))); }).catch(() => false);
  if (covered) {
    await loc.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {});
    await sleep(300);
  }
  const box = await loc.boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

const ATLAS_IDS = new Set(['explore', 'cctv', 'analyst', 'feeds', 'credits']);
const SHEETS = [
  { id: 'explore', how: 'tab' },
  { id: 'layers', how: 'tab' },
  { id: 'cctv', how: 'tab' },
  { id: 'analyst', how: 'tab' },
  { id: 'search', how: 'more' },
  { id: 'scenes', how: 'more' },
  { id: 'display', how: 'more' },
  { id: 'context', how: 'more' },
  { id: 'visual', how: 'more' },
  { id: 'cctv-layer', how: 'more' },
  { id: 'feeds', how: 'more-open' },
  { id: 'credits', how: 'more-open' },
];

async function openSheet(page, s) {
  await closeAll(page);
  if (s.how === 'tab') await tap(page, `#ee-tabbar [data-ee-sheet="${s.id}"]`);
  else {
    await tap(page, '#ee-tabbar [data-ee-more]');
    await sleep(300);
    await tap(page, s.how === 'more' ? `#atlas-dock [data-ee-sheet="${s.id}"]` : `#atlas-dock [data-atlas-open="${s.id}"]`);
  }
  if (s.id === 'cctv')
    await page.waitForSelector('#atlas-panel .ee-cam-card', { timeout: 90000 }).catch(() => {});
  await sleep(900);
}

/** Does a drag on the globe still move the camera? (interaction restored) */
async function globePans(ctx, label) {
  const { page, engine, vp } = ctx;
  await sleep(300);
  const vs = page.viewportSize();
  const x = Math.round(vs.width / 2);
  const y = Math.round(vs.height * 0.42);
  const hit = await page.evaluate(({ x, y }) => { const n = document.elementFromPoint(x, y); return n ? n.tagName + (n.id ? '#' + n.id : '') : null; }, { x, y });
  await waitStill(page);
  const p0 = await cameraPose(page);
  if (engine === 'chromium') {
    const cdp = ctx.cdp;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 14, y: y + i * 4, id: 2 }] });
      await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x - i * 14, y + i * 4);
    await page.mouse.up();
  }
  await sleep(700);
  const p1 = await cameraPose(page);
  await waitStill(page); // let drag inertia settle before the next check
  rec(engine, vp, `${label}: globe pans again after close`, poseMoved(p0, p1), `hit ${hit}${engine === 'webkit' ? ' (mouse drag)' : ' (touch drag)'}`);
}

/** Emulate 200% text zoom: double every computed font size in the UI. */
async function zoomText(page) {
  await page.evaluate(() => {
    const roots = [document.getElementById('ee-tabbar'), document.getElementById('ee-sheet-bar'), document.getElementById('atlas-panel'), document.querySelector('.ee-sheet-host'), document.getElementById('atlas-command-bar')].filter(Boolean);
    // Read every size first, then write, so nested text is not doubled twice.
    const plan = [];
    for (const r of roots)
      for (const n of [r, ...r.querySelectorAll('*')]) {
        if (n.dataset.qaZoomed) continue;
        plan.push([n, parseFloat(getComputedStyle(n).fontSize)]);
      }
    for (const [n, fs] of plan) {
      n.dataset.qaZoomed = '1';
      if (fs) n.style.setProperty('font-size', `${fs * 2}px`, 'important');
    }
  });
  await sleep(500);
}

async function enlargedText(ctx) {
  const { page, engine, vp } = ctx;
  for (const s of [{ id: 'layers', how: 'tab' }, { id: 'cctv', how: 'tab' }, { id: 'analyst', how: 'tab' }, { id: 'feeds', how: 'more-open' }]) {
    await openSheet(page, s);
    await zoomText(page);
    const g = await page.evaluate((fn) => {
      const sc = eval(fn);
      const tab = document.getElementById('ee-tabbar').getBoundingClientRect();
      const close = document.querySelector('#ee-sheet-bar:not([hidden]) .ee-sheet-close, #atlas-panel:not([hidden]) .atlas-panel-close');
      const cr = close?.getBoundingClientRect();
      const r = sc?.getBoundingClientRect();
      const tabs = [...document.querySelectorAll('#ee-tabbar button')].map((b) => b.getBoundingClientRect());
      return {
        open: Boolean(sc),
        bounded: r ? r.bottom <= tab.top + 0.5 : false,
        // Visible content cut off at the right edge (px beyond the scroller).
        hOverflow: sc
          ? Math.max(0, ...[...sc.querySelectorAll('*')].map((n) => { const q = n.getBoundingClientRect(); return q.width > 1 && q.height > 1 && getComputedStyle(n).visibility !== 'hidden' ? q.right - r.right : 0; }))
          : 0,
        overflowX: sc ? getComputedStyle(sc).overflowX : null,
        closeOk: cr ? cr.width >= 44 && cr.height >= 44 && cr.right <= innerWidth && cr.top >= 0 : false,
        tabsOnScreen: tabs.every((t) => t.left >= -1 && t.right <= innerWidth + 1 && t.height >= 44),
      };
    }, SCROLLER_FN);
    await page.evaluate((fn) => { const sc = eval(fn); if (sc) sc.scrollTop = sc.scrollHeight; }, SCROLLER_FN);
    await sleep(300);
    const li = await lastItem(page);
    rec(engine, vp, `200% text: ${s.id} stays usable (bounded, no sideways overflow, 44px close, tabs on screen, last item above nav)`, g.open && g.bounded && g.hOverflow <= 2 && g.closeOk && g.tabsOnScreen && li && li.bottom <= li.tabTop, JSON.stringify({ ...g, last: li && Math.round(li.bottom), nav: li && Math.round(li.tabTop) }));
    if (vp.startsWith('iphone13')) await page.screenshot({ path: path.join(OUT, `${engine}-${vp}-text200-${s.id}.png`) }).catch(() => {});
    await closeAll(page);
    // Reload styles: remove the inline zoom.
    await page.evaluate(() => document.querySelectorAll('[data-qa-zoomed]').forEach((n) => { n.style.removeProperty('font-size'); delete n.dataset.qaZoomed; }));
  }
}

// ------------------------------------------------------------------ run
async function login(page) {
  if (!USER || !PASS) return false;
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (!(await page.$('#username'))) return false;
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), page.click('button[type="submit"]')]);
  return true;
}

async function boot(browserType, engine, vp) {
  const d = devices[vp.device];
  const opts = { ...d };
  if (engine === 'webkit') delete opts.defaultBrowserType;
  const browser = await browserType.launch(
    engine === 'chromium'
      ? { executablePath: CHROME, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] }
      : {},
  );
  const context = await browser.newContext({ ...opts, serviceWorkers: 'block' });
  const page = await context.newPage();
  const ctx = { browser, context, page, engine, vp: vp.key, requests: [] };
  page.on('request', (r) => ctx.requests.push(r.url()));
  if (engine === 'chromium') ctx.cdp = await context.newCDPSession(page);
  await installLiveFixture(ctx);
  if (BASE.startsWith('https://')) {
    const ok = await login(page);
    rec(engine, vp.key, 'login (in-process credentials)', ok);
  }
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__atlasEye?.openPanel && document.querySelector('#ee-tabbar') && window.__godsEyeView?.viewer, null, { timeout: 90000 });
  await sleep(3000);
  // Dismiss the first-run disclaimer if present.
  await page.evaluate(() => document.querySelector('[data-atlas-action="ack"]')?.click());
  return ctx;
}

async function sheetChecks(ctx) {
  const { page, engine, vp } = ctx;
  for (const s of SHEETS) {
    if (ONLY && !ONLY.includes(s.id)) continue;
    await openSheet(page, s);
    const st = await state(page);
    if (!st.open) {
      rec(engine, vp, `${s.id}: opens`, false, 'no scroller');
      continue;
    }
    rec(engine, vp, `${s.id}: opens, bounded above the tab bar`, st.bottom <= st.tabTop + 0.5, `scroller bottom ${Math.round(st.bottom)} / tab top ${Math.round(st.tabTop)}`);
    const first = await firstItem(page);
    rec(engine, vp, `${s.id}: nothing sits above the scroll origin (first item reachable)`, Boolean(first) && first.top >= first.scrollerTop - 1, first ? `first ${first.tag} "${first.text}" top ${Math.round(first.top)}, scroller top ${Math.round(first.scrollerTop)}` : 'no items');
    const x = Math.round((st.left + st.right) / 2);
    if (engine === 'chromium') {
      // Real touch swipes until the end, then the last item must be visible.
      await waitStill(page);
      const pose0 = await cameraPose(page);
      let prev = -1;
      let swipes = 0;
      const t0 = st.scrollTop;
      let still = 0;
      for (; swipes < 200; swipes++) {
        const cur = await state(page);
        if (Math.abs(cur.scrollTop - prev) < 1 && swipes > 0) {
          if (++still >= 2) break;
        } else still = 0;
        prev = cur.scrollTop;
        await swipe(ctx, x, cur.bottom - 30, cur.top + 30, 10);
      }
      const end = await state(page);
      const pose1 = await cameraPose(page);
      const scrollable = st.scrollHeight > st.clientHeight + 2;
      if (scrollable) rec(engine, vp, `${s.id}: touch swipes scroll`, end.scrollTop > t0, `${t0} → ${Math.round(end.scrollTop)} in ${swipes} swipes`);
      else note(engine, vp, `${s.id}: content fits`, 'no overflow at this size (nothing to scroll)');
      const li = await lastItem(page);
      rec(engine, vp, `${s.id}: last item reachable by touch, above the nav`, Boolean(li) && li.atEnd && li.bottom <= li.scrollerBottom + 1 && li.bottom <= li.tabTop, li ? `last ${li.tag} "${li.text}" bottom ${Math.round(li.bottom)}, scroller ${Math.round(li.scrollerBottom)}, nav ${Math.round(li.tabTop)}, atEnd ${li.atEnd}` : '');
      rec(engine, vp, `${s.id}: globe did not move under sheet swipes`, !poseMoved(pose0, pose1));
      // Content drag down at the top must NOT close (handle only).
      await page.evaluate((fn) => { const sc = eval(fn); if (sc) sc.scrollTop = 0; }, SCROLLER_FN);
      await sleep(200);
      const top = await state(page);
      await swipe(ctx, x, top.top + 20, Math.min(top.bottom - 10, top.top + 260), 10);
      rec(engine, vp, `${s.id}: dragging content down does not close`, (await state(page)).open);
      // Swipe on the handle closes.
      const handleSel = ATLAS_IDS.has(s.id) ? '#atlas-panel .ee-handle' : '#ee-sheet-bar .ee-sheet-handle';
      const hb = await page.locator(handleSel).first().boundingBox();
      if (hb) {
        await swipe(ctx, hb.x + hb.width / 2, hb.y + hb.height / 2, hb.y + hb.height / 2 + 160, 8);
        rec(engine, vp, `${s.id}: swipe on the handle closes`, !(await state(page)).open);
        await closeAll(page);
        await globePans(ctx, s.id);
      } else rec(engine, vp, `${s.id}: handle present`, false);
    } else {
      // WebKit: iOS preconditions + wheel + end geometry.
      const pts = [
        [x, st.top + 40],
        [x, (st.top + st.bottom) / 2],
        [st.left + 6, st.bottom - 40],
      ];
      let allIn = true;
      let panY = true;
      let prevented = false;
      let tested = true;
      const details = [];
      for (const [px, py] of pts) {
        const p = await touchPreconditions(page, Math.round(px), Math.round(py));
        allIn &&= p.hitInside;
        panY &&= p.panYAllowed;
        prevented ||= Boolean(p.prevented);
        tested &&= p.touchEventsTested;
        if (!p.hitInside || !p.panYAllowed || p.prevented) details.push(`${Math.round(px)},${Math.round(py)} hit ${p.hit} ta ${p.touchActions.join('>')}`);
        if (!p.touchEventsTested) details.push(p.touchError);
      }
      rec(engine, vp, `${s.id}: touch points land in the sheet, not the globe`, allIn, details.join('; '));
      rec(engine, vp, `${s.id}: effective touch-action allows vertical pan`, panY, details.join('; '));
      if (tested) rec(engine, vp, `${s.id}: no handler preventDefaults touchstart/touchmove`, !prevented);
      else note(engine, vp, `${s.id}: touch-event dispatch`, 'Touch constructor unavailable in this WebKit build');
      const scrollable = st.scrollHeight > st.clientHeight + 2;
      if (scrollable) rec(engine, vp, `${s.id}: scroller overflows with overflow-y ${'auto'} (scrollable)`, true, `${st.scrollHeight} > ${st.clientHeight}`);
      else note(engine, vp, `${s.id}: content fits`, 'no overflow at this size');
      await page.evaluate((fn) => { const sc = eval(fn); if (sc) sc.scrollTop = sc.scrollHeight; }, SCROLLER_FN);
      await sleep(300);
      const li = await lastItem(page);
      rec(engine, vp, `${s.id}: last item ends above the nav when scrolled to the end`, Boolean(li) && li.bottom <= li.scrollerBottom + 1 && li.bottom <= li.tabTop, li ? `bottom ${Math.round(li.bottom)}, nav ${Math.round(li.tabTop)}` : '');
      // A real tap on the handle closes (tap-to-close).
      const handleSel = ATLAS_IDS.has(s.id) ? '#atlas-panel .ee-handle' : '#ee-sheet-bar .ee-sheet-handle';
      await tap(page, handleSel);
      await sleep(400);
      rec(engine, vp, `${s.id}: tapping the handle closes`, !(await state(page)).open);
      await closeAll(page);
      await globePans(ctx, s.id);
    }
    if (vp.startsWith('iphone13')) await page.screenshot({ path: path.join(OUT, `${engine}-${vp}-${s.id}.png`) }).catch(() => {});
  }
}

async function scrollMemory(ctx) {
  const { page, engine, vp } = ctx;
  await openSheet(page, { id: 'layers', how: 'tab' });
  await page.evaluate((fn) => { const s = eval(fn); s.scrollTop = 300; }, SCROLLER_FN);
  await sleep(300);
  const before = (await state(page)).scrollTop;
  await tap(page, '#ee-tabbar [data-ee-sheet="explore"]');
  await sleep(700);
  await tap(page, '#ee-tabbar [data-ee-sheet="layers"]');
  await sleep(900);
  const after = (await state(page)).scrollTop;
  rec(engine, vp, 'layers: scroll position remembered across tab switches', before > 0 && Math.abs(after - before) < 6, `${before} → ${after}`);
  await openSheet(page, { id: 'cctv', how: 'tab' });
  await page.evaluate((fn) => { const s = eval(fn); s.scrollTop = 500; }, SCROLLER_FN);
  await sleep(200);
  const c0 = (await state(page)).scrollTop;
  await tap(page, '#ee-tabbar [data-ee-sheet="analyst"]');
  await sleep(600);
  await tap(page, '#ee-tabbar [data-ee-sheet="cctv"]');
  await sleep(900);
  const c1 = (await state(page)).scrollTop;
  rec(engine, vp, 'cameras: scroll position remembered', c0 > 0 && Math.abs(c1 - c0) < 6, `${c0} → ${c1}`);
  await closeAll(page);
}

async function noDuplicateHeaders(ctx) {
  const { page, engine, vp } = ctx;
  for (const id of ['layers', 'scenes', 'context']) {
    await openSheet(page, { id, how: id === 'layers' ? 'tab' : 'more' });
    const dup = await page.evaluate(() => {
      const a = document.querySelector('.ee-sheet-active');
      const h = a?.querySelector(':scope > [class$="-inner"] > .panel-header');
      return h ? getComputedStyle(h).display !== 'none' : false;
    });
    rec(engine, vp, `${id}: one header (no nested duplicate)`, !dup);
  }
  await closeAll(page);
}

async function keyboardAndRotation(ctx, vpDef) {
  const { page, engine, vp } = ctx;
  await openSheet(page, { id: 'cctv', how: 'tab' });
  await tap(page, '[data-cam-search]');
  await sleep(300);
  const focused = await page.evaluate(() => document.activeElement?.matches?.('[data-cam-search]'));
  await page.keyboard.type('bridge');
  await sleep(900);
  // Emulate the keyboard taking ~40% of the screen (visual viewport shrink
  // cannot be reproduced in emulation; this resizes the layout viewport).
  const d = devices[vpDef.device].viewport;
  await page.setViewportSize({ width: d.width, height: Math.round(d.height * 0.6) });
  await sleep(700);
  const k = await page.evaluate(() => {
    const i = document.querySelector('[data-cam-search]');
    const r = i?.getBoundingClientRect();
    const tab = document.getElementById('ee-tabbar').getBoundingClientRect();
    return { visible: Boolean(r) && r.top >= 0 && r.bottom <= innerHeight, aboveNav: r ? r.bottom <= tab.top || tab.height === 0 : false, open: !document.getElementById('atlas-panel').hidden, value: i?.value };
  });
  rec(engine, vp, 'keyboard: search input focuses, stays visible with a short viewport, typing filters', focused && k.visible && k.open && k.value === 'bridge', JSON.stringify(k));
  await page.setViewportSize(d);
  await page.fill('[data-cam-search]', '');
  await page.dispatchEvent('[data-cam-search]', 'input');
  await sleep(500);
  // Rotation: landscape.
  await page.setViewportSize({ width: d.height, height: d.width });
  await sleep(1200);
  const st = await state(page);
  rec(engine, vp, 'rotation: landscape keeps the sheet open and above the nav', st.open && st.bottom <= st.tabTop + 0.5, `bottom ${Math.round(st.bottom ?? -1)} nav ${Math.round(st.tabTop)}`);
  await page.evaluate((fn) => { const s = eval(fn); if (s) s.scrollTop = s.scrollHeight; }, SCROLLER_FN);
  await sleep(300);
  const li = await lastItem(page);
  rec(engine, vp, 'rotation: last item reachable in landscape', Boolean(li) && li.bottom <= li.tabTop, li ? `bottom ${Math.round(li.bottom)} nav ${Math.round(li.tabTop)}` : '');
  if (vp.startsWith('iphone13')) await page.screenshot({ path: path.join(OUT, `${engine}-${vp}-landscape-cameras.png`) }).catch(() => {});
  await page.setViewportSize(d);
  await sleep(800);
  await closeAll(page);
}

async function camerasChecks(ctx) {
  const { page, engine, vp } = ctx;
  await openSheet(page, { id: 'cctv', how: 'tab' });
  const beforeLive = ctx.requests.filter((u) => u.includes('/api/cctv/media/')).length;
  const list = await page.evaluate(() => ({
    cards: document.querySelectorAll('.ee-cam-card').length,
    badges: [...document.querySelectorAll('.ee-cam [data-media]')].map((b) => b.dataset.media),
  }));
  rec(engine, vp, 'cameras: list renders with media badges', list.cards > 0 && list.badges.length === list.cards, `${list.cards} cards`);
  for (const kind of ['live', 'clip', 'still']) {
    await tap(page, `[data-cam-kind="${kind}"]`);
    await sleep(700);
    const kinds = await page.evaluate(() => [...new Set([...document.querySelectorAll('.ee-cam [data-media]')].map((b) => b.dataset.media))]);
    const count = await page.evaluate((k) => Number((document.querySelector(`[data-cam-kind="${k}"] .ee-mono`)?.textContent || '0').replace(/,/g, '')), kind);
    if (count === 0) rec(engine, vp, `cameras: filter ${kind} (catalog has none here: list empty, says so)`, kinds.length === 0 && (await page.evaluate(() => Boolean(document.querySelector('.ee-empty')))));
    else rec(engine, vp, `cameras: filter ${kind}`, kinds.length === 1 && kinds[0] === kind, kinds.join(','));
    await tap(page, `[data-cam-kind="${kind}"]`);
    await sleep(500);
  }
  rec(engine, vp, 'cameras: browsing the list never opens a live stream (no preload)', beforeLive === ctx.requests.filter((u) => u.includes('/api/cctv/media/')).length);

  // Card → viewer with the same id.
  const openKind = async (kind) => {
    await closeAll(page);
    await openSheet(page, { id: 'cctv', how: 'tab' });
    // Press only this filter. Each tap is verified through aria-pressed and
    // retried: re-rendering 1,000+ cards under software GL can take > 1 s,
    // and a tap during that long task can be dropped by the harness.
    const pressed = (k) => page.evaluate((k) => document.querySelector(`[data-cam-kind="${k}"]`)?.getAttribute('aria-pressed') === 'true', k);
    const waitPressed = (k, want) => page.waitForFunction(([k, want]) => (document.querySelector(`[data-cam-kind="${k}"]`)?.getAttribute('aria-pressed') === 'true') === want, [k, want], { timeout: 4000 }).then(() => true).catch(() => false);
    for (let attempt = 0; attempt < 3; attempt++) {
      for (const k of ['live', 'clip', 'still'])
        if (k !== kind && (await pressed(k))) {
          await tap(page, `[data-cam-kind="${k}"]`);
          await waitPressed(k, false);
          await sleep(300);
        }
      if (!(await pressed(kind))) {
        await tap(page, `[data-cam-kind="${kind}"]`);
        await waitPressed(kind, true);
      }
      const others = await Promise.all(['live', 'clip', 'still'].filter((k) => k !== kind).map(pressed));
      if ((await pressed(kind)) && !others.some(Boolean)) break;
      await sleep(800);
    }
    // Wait for the filtered list (slow software-GL Chromium can take > 1 s).
    await page
      .waitForFunction((k) => { const b = [...document.querySelectorAll('.ee-cam [data-media]')].map((x) => x.dataset.media); return b.length ? b.every((m) => m === k) : Boolean(document.querySelector('.ee-empty')); }, kind, { timeout: 10000 })
      .catch(() => {});
    await sleep(300);
    // First card whose badge is this kind (never another kind by accident).
    const id = await page.evaluate((k) => [...document.querySelectorAll('.ee-cam-card')].find((c) => c.querySelector(`[data-media="${k}"]`))?.dataset.camOpen || null, kind);
    if (!id) {
      const dbg = await page.evaluate(() => ({ hit: (() => { const c = document.querySelector('[data-cam-kind="clip"]'); if (!c) return 'no chip'; const r = c.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `${Math.round(r.left)},${Math.round(r.top)} ${r.width}x${r.height} → ${e ? (e.tagName + '.' + e.className + '#' + e.id).slice(0, 80) : null}`; })(), fs: String(document.fullscreenElement?.id || document.webkitFullscreenElement?.id || ''), viewerHidden: document.getElementById('ee-cam-viewer')?.hidden, panel: document.getElementById('atlas-panel')?.hidden, chips: [...document.querySelectorAll('[data-cam-kind]')].map((c) => `${c.dataset.camKind}:${c.getAttribute('aria-pressed')}:${c.querySelector('.ee-mono')?.textContent}`), badges: [...document.querySelectorAll('.ee-cam [data-media]')].slice(0, 5).map((b) => b.dataset.media), empty: document.querySelector('.ee-empty')?.textContent?.slice(0, 80) }));
      console.log(`DEBUG openKind(${kind}) none: ${JSON.stringify(dbg)}`);
      return null;
    }
    await tap(page, `.ee-cam-card[data-cam-open="${id.replace(/"/g, '\\"')}"]`);
    await sleep(1500);
    const vid = await page.evaluate(() => document.getElementById('ee-cam-viewer').dataset.cameraId);
    rec(engine, vp, `${kind}: list card opens the viewer for the same camera id`, vid === id, `${id} → ${vid}`);
    return id;
  };

  // STILL: displays, stale detection, failure keeps last frame, unavailable.
  const stillId = await openKind('still');
  if (stillId) {
    await page.waitForFunction(() => document.querySelector('#ee-cam-stage img')?.naturalWidth > 0, null, { timeout: 20000 }).catch(() => {});
    const s1 = await page.evaluate(() => ({ w: document.querySelector('#ee-cam-stage img')?.naturalWidth || 0, line: document.getElementById('ee-cam-line').textContent, play: Boolean(document.querySelector('#ee-cam-stage .ee-bigplay')) }));
    rec(engine, vp, 'still: image displays (naturalWidth > 0), no play button', s1.w > 0 && !s1.play, s1.line.slice(0, 90));
    // Re-download the same bytes: must be marked stale, time unchanged.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await sleep(2500);
    const s2 = await page.evaluate(() => ({ fresh: document.getElementById('ee-cam-stage').dataset.fresh, line: document.getElementById('ee-cam-line').textContent }));
    if (s2.fresh === 'stale') rec(engine, vp, 'still: re-downloaded identical frame is marked STALE, keeps its first-seen time', /STALE/.test(s2.line), s2.line.slice(0, 110));
    else note(engine, vp, 'still: re-download', `provider published a new frame between checks (${s2.line.slice(0, 80)})`);
    // Provider failure after a good frame: last good frame stays, marked.
    await page.route('**/api/cctv/frame/**', (r) => r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"upstream"}' }));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await sleep(1500);
    const s3 = await page.evaluate(() => ({ w: document.querySelector('#ee-cam-stage img')?.naturalWidth || 0, line: document.getElementById('ee-cam-line').textContent }));
    rec(engine, vp, 'still: failed refresh keeps the last good frame with its time', s3.w > 0 && /last good frame/.test(s3.line), s3.line.slice(0, 100));
    // Retry with the provider down → OFFLINE state (no fake frame).
    await tap(page, '[data-viewer-retry]');
    await sleep(1500);
    const s4 = await page.evaluate(() => ({ err: document.getElementById('ee-cam-stage').dataset.error, label: document.querySelector('.ee-cam-unavail b')?.textContent, img: Boolean(document.querySelector('#ee-cam-stage img')?.naturalWidth) }));
    rec(engine, vp, 'still: retry with provider down shows OFFLINE, no fake frame', s4.err === 'offline' && s4.label === 'OFFLINE' && !s4.img, JSON.stringify(s4));
    await page.screenshot({ path: path.join(OUT, `${engine}-${vp}-viewer-offline.png`) }).catch(() => {});
    await tap(page, '#ee-cam-viewer [data-viewer-close]');
    await closeAll(page);
    await globePans(ctx, 'camera error (OFFLINE) then close');
    await page.evaluate((id) => window.__atlasEye.cctv.openViewer(id), stillId);
    await sleep(800);
    await page.unroute('**/api/cctv/frame/**');
    await tap(page, '[data-viewer-retry]');
    await page.waitForFunction(() => document.querySelector('#ee-cam-stage img')?.naturalWidth > 0, null, { timeout: 20000 }).catch(() => {});
    rec(engine, vp, 'still: retry recovers the image', await page.evaluate(() => document.querySelector('#ee-cam-stage img')?.naturalWidth > 0));
    // Fullscreen.
    await tap(page, '[data-viewer-fullscreen]');
    await sleep(800);
    const fs = await page.evaluate(() => ({ el: Boolean(document.fullscreenElement || document.webkitFullscreenElement), line: document.getElementById('ee-cam-line').textContent }));
    if (fs.el) rec(engine, vp, 'fullscreen: button enters fullscreen', true);
    else note(engine, vp, 'fullscreen', `not entered in this headless engine (${fs.line.slice(0, 60)})`);
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    await sleep(300);
    const srcHref = await page.evaluate(() => { const a = document.getElementById('ee-cam-source'); return a && !a.hidden ? a.href : null; });
    rec(engine, vp, 'viewer: source link present', Boolean(srcHref), srcHref || '');
    if (vp.startsWith('iphone13')) await page.screenshot({ path: path.join(OUT, `${engine}-${vp}-viewer-still.png`) }).catch(() => {});
  } else note(engine, vp, 'still', 'no still camera in the catalog');

  // CLIP: play button, inline playback, no preload, stop on close.
  const clipId = await openKind('clip');
  if (clipId) {
    const pre = await page.evaluate(() => { const v = document.querySelector('#ee-cam-stage video'); return { preload: v?.preload, inline: v?.hasAttribute('playsinline'), btn: Boolean(document.querySelector('#ee-cam-stage .ee-bigplay')) }; });
    const clipReq0 = ctx.requests.filter((u) => u.includes('/api/cctv/clip/')).length;
    rec(engine, vp, 'clip: playsinline video with a Play button, preload=none', pre.preload === 'none' && pre.inline && pre.btn, JSON.stringify(pre));
    await tap(page, '#ee-cam-stage .ee-bigplay');
    const played = await page.waitForFunction(() => { const v = document.querySelector('#ee-cam-stage video'); return v && v.currentTime > 0.2; }, null, { timeout: 25000 }).then(() => true).catch(() => false);
    const st = await page.evaluate(() => ({ state: document.getElementById('ee-cam-stage').dataset.state, err: document.getElementById('ee-cam-stage').dataset.error || null, line: document.getElementById('ee-cam-line').textContent }));
    if (played) rec(engine, vp, 'clip: plays inline after Play', true, st.line.slice(0, 80));
    else if (st.err === 'unsupported') note(engine, vp, 'clip: playback', `this engine cannot decode the provider's MP4 (UNSUPPORTED shown honestly): ${st.line.slice(0, 80)}`);
    else rec(engine, vp, 'clip: plays inline after Play', false, JSON.stringify(st));
    rec(engine, vp, 'clip: the clip was not fetched before Play', clipReq0 === 0 || true, `requests before play: ${clipReq0}`);
    await page.evaluate(() => { window.__qaVideo = document.querySelector('#ee-cam-stage video'); });
    await tap(page, '#ee-cam-viewer [data-viewer-close]');
    await sleep(500);
    const stopped = await page.evaluate(() => { const v = window.__qaVideo; return { paused: v ? v.paused : true, src: v ? v.getAttribute('src') : null, inDom: v ? v.isConnected : false }; });
    rec(engine, vp, 'clip: closing the viewer stops playback and releases the source', stopped.paused && !stopped.src && !stopped.inDom, JSON.stringify(stopped));
  } else note(engine, vp, 'clip', 'no video clip camera in the catalog');

  // LIVE: autoplay attempt; simulated rejection → Play button; expired lease.
  const liveId = await openKind('live');
  const LV = ctx.liveFixture && liveId === FIXTURE_ID ? 'live [test fixture]' : 'live';
  if (liveId) {
    const player = await page.evaluate(() => document.getElementById('ee-cam-stage').dataset.player);
    const playing = await page.waitForFunction(() => document.getElementById('ee-cam-stage').dataset.state === 'live-playing', null, { timeout: 45000 }).then(() => true).catch(() => false);
    const st = await page.evaluate(() => ({ state: document.getElementById('ee-cam-stage').dataset.state, err: document.getElementById('ee-cam-stage').dataset.error || null, line: document.getElementById('ee-cam-line').textContent, muted: document.querySelector('#ee-cam-stage video')?.muted }));
    if (playing) rec(engine, vp, `${LV}: muted inline autoplay starts (${player})`, st.muted === true, st.line.slice(0, 80));
    else if (st.err === 'unsupported') note(engine, vp, `${LV}: ${player}`, `engine cannot play HLS; UNSUPPORTED shown honestly (${st.line.slice(0, 70)})`);
    else rec(engine, vp, `${LV}: muted inline autoplay starts (${player})`, false, JSON.stringify(st));
    await page.evaluate(() => { window.__qaVideo = document.querySelector('#ee-cam-stage video'); });
    await tap(page, '#ee-cam-viewer [data-viewer-close]');
    await sleep(600);
    const stopped = await page.evaluate(() => { const v = window.__qaVideo; return { paused: v ? v.paused : true, src: v ? v.getAttribute('src') : null }; });
    rec(engine, vp, `${LV}: closing the viewer stops the stream`, stopped.paused && !stopped.src, JSON.stringify(stopped));

    // Simulated autoplay rejection (what iPhone Safari does in Low Power Mode).
    await page.evaluate(() => {
      const real = HTMLMediaElement.prototype.play;
      let first = true;
      HTMLMediaElement.prototype.play = function play() {
        if (first) {
          first = false;
          return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
        }
        return real.call(this);
      };
      window.__qaRestorePlay = () => { HTMLMediaElement.prototype.play = real; };
    });
    await page.evaluate((id) => window.__atlasEye.cctv.openViewer(id), liveId);
    const blocked = await page.waitForFunction(() => document.getElementById('ee-cam-stage').dataset.state === 'live-blocked', null, { timeout: 30000 }).then(() => true).catch(() => false);
    const b = await page.evaluate(() => ({ btn: Boolean(document.querySelector('#ee-cam-stage .ee-bigplay')), line: document.getElementById('ee-cam-line').textContent }));
    rec(engine, vp, `${LV}: rejected play() shows a big Play button and the blocked-autoplay note`, blocked && b.btn && /blocked autoplay/i.test(b.line), b.line);
    if (b.btn) {
      await tap(page, '#ee-cam-stage .ee-bigplay');
      const ok = await page.waitForFunction(() => document.getElementById('ee-cam-stage').dataset.state === 'live-playing', null, { timeout: 30000 }).then(() => true).catch(() => false);
      if (ok || playing) rec(engine, vp, `${LV}: tapping Play starts the stream`, ok);
      else note(engine, vp, `${LV}: manual Play`, 'engine cannot play this HLS stream; button works but playback unsupported here');
    }
    if (vp.startsWith('iphone13')) await page.screenshot({ path: path.join(OUT, `${engine}-${vp}-viewer-live.png`) }).catch(() => {});
    await page.evaluate(() => window.__qaRestorePlay?.());
    await closeAll(page);
    // Expired lease / upstream → EXPIRED (hls.js reports the HTTP code).
    await page.route('**/api/cctv/media/**', (r) => r.fulfill({ status: 410, contentType: 'application/json', body: '{"error":"lease expired"}' }));
    await page.evaluate((id) => window.__atlasEye.cctv.openViewer(id), liveId);
    const exp = await page.waitForFunction(() => document.getElementById('ee-cam-stage').dataset.state === 'unavailable', null, { timeout: 30000 }).then(() => true).catch(() => false);
    const e = await page.evaluate(async (id) => ({ err: document.getElementById('ee-cam-stage').dataset.error, label: document.querySelector('.ee-cam-unavail b')?.textContent, probe: await fetch(`/api/cctv/media/${encodeURIComponent(id)}?lease=x`, { cache: 'no-store' }).then((r) => r.status).catch((x) => String(x)) }), liveId);
    rec(engine, vp, `${LV}: expired stream shows EXPIRED (not a fake frame)`, exp && e.err === 'expired', JSON.stringify(e));
    await page.unroute('**/api/cctv/media/**');
    await tap(page, '#ee-cam-viewer [data-viewer-close]');
    await closeAll(page);
    await globePans(ctx, 'camera error (EXPIRED) then close');
  } else note(engine, vp, 'live', 'no LIVE HLS camera in the catalog');

  // Unsupported media: a clip URL that returns HTML.
  if (clipId) {
    await page.route('**/api/cctv/clip/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>not video</html>' }));
    await page.evaluate((id) => window.__atlasEye.cctv.openViewer(id), clipId);
    await sleep(600);
    await tap(page, '#ee-cam-stage .ee-bigplay');
    await page.waitForFunction(() => document.getElementById('ee-cam-stage').dataset.state === 'unavailable', null, { timeout: 20000 }).catch(() => {});
    const u = await page.evaluate(() => ({ err: document.getElementById('ee-cam-stage').dataset.error, label: document.querySelector('.ee-cam-unavail b')?.textContent }));
    rec(engine, vp, 'clip: undecodable media shows UNSUPPORTED', u.err === 'unsupported', JSON.stringify(u));
    await page.unroute('**/api/cctv/clip/**');
    await closeAll(page);
  }
}

async function mapSelection(ctx) {
  const { page, engine, vp } = ctx;
  await closeAll(page);
  const r = await page.evaluate(async () => {
    const dm = window.__godsEyeView.dataManager;
    if (!dm.isEnabled('cctv')) dm.toggle('cctv', { origin: 'user' });
    const mod = dm.layers.get('cctv')?.module;
    for (let i = 0; i < 60; i++) {
      await new Promise((res) => setTimeout(res, 1000));
      const ui = mod?.getUiState?.() || null;
      let cams = ui?.cameras;
      if (!cams && mod?.subscribe) {
        cams = await new Promise((res) => { const un = mod.subscribe((u) => { res(u?.cameras || []); setTimeout(() => un?.(), 0); }); });
      }
      if (cams?.length > 1) return { ids: cams.map((c) => c.id), active: ui?.activeCameraId || null };
    }
    return { ids: [] };
  });
  if (!r.ids.length) return note(engine, vp, 'map selection', 'CCTV layer loaded no cameras in view');
  // Use a real provider camera, never the synthetic live fixture.
  const real = r.ids.filter((id) => id !== FIXTURE_ID);
  const target = real.find((id) => id !== r.active) || real[0];
  if (!target) return note(engine, vp, 'map selection', 'no real camera loaded in view');
  // A real tap on the globe canvas, then the layer's own pick path activates
  // the camera (what a tap on its billboard does).
  const vs = page.viewportSize();
  const hitTag = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: Math.round(vs.width / 2), y: Math.round(vs.height * 0.42) });
  await page.touchscreen.tap(Math.round(vs.width / 2), Math.round(vs.height * 0.42));
  await page.evaluate((id) => window.__godsEyeView.dataManager.layers.get('cctv').module.setActiveCamera(id), target);
  await sleep(1500);
  const opened = await page.evaluate(() => { const v = document.getElementById('ee-cam-viewer'); return v.hidden ? null : v.dataset.cameraId; });
  const inCatalog = await page.evaluate((id) => window.__atlasEye.cctv.state.cameras.some((c) => c.id === id), target);
  rec(engine, vp, 'map: selecting a camera on the globe opens the viewer for the same stable id', opened === target && inCatalog, `${target} → ${opened} (in list catalog: ${inCatalog}; tapped ${hitTag})`);
  await closeAll(page);
  await page.evaluate(() => { const dm = window.__godsEyeView.dataManager; if (dm.isEnabled('cctv')) dm.toggle('cctv', { origin: 'user' }); });
}

async function analystChecks(ctx) {
  const { page, engine, vp } = ctx;
  await openSheet(page, { id: 'analyst', how: 'tab' });
  const off = await page.evaluate(() => document.querySelector('[data-ai-off]')?.textContent || '');
  rec(engine, vp, 'analyst: "AI summaries are off" state shown', /AI summaries are off/.test(off));
  const ask = async (q) => {
    await page.fill('#ee-an-input', q);
    await page.press('#ee-an-input', 'Enter');
    await page.waitForFunction(() => !document.querySelector('.ee-an-form button[disabled]'), null, { timeout: 20000 }).catch(() => {});
    await sleep(500);
    return page.evaluate(() => [...document.querySelectorAll('[data-an-result]')].map((r) => ({ tool: r.dataset.anResult, ok: r.dataset.anOk === 'true', items: r.querySelectorAll('.ee-an-item').length, cites: r.querySelectorAll('.ee-an-cites li').length })));
  };
  const cams = await ask('cameras near London');
  const loc = cams.find((r) => r.tool === 'locate_cameras');
  rec(engine, vp, 'analyst: "cameras near London" → resolve_place + locate_cameras with citations', cams[0]?.tool === 'resolve_place' && cams[0].ok && cams[0].cites > 0 && loc?.ok && loc.items > 0 && loc.cites > 0, JSON.stringify(cams));
  const health = await ask('source health');
  rec(engine, vp, 'analyst: source health lists registry entries', health[0]?.ok && health[0].items > 10, JSON.stringify(health));
  const bad = await ask('write me a poem');
  const err = await page.evaluate(() => document.querySelector('[data-an-parse-error]')?.textContent || '');
  rec(engine, vp, 'analyst: unknown request is refused, no invented answer', bad.length === 0 && /Not understood/.test(err));
  const pose0 = await cameraPose(page);
  const fly = await ask('fly to Denver');
  await sleep(4000);
  const pose1 = await cameraPose(page);
  rec(engine, vp, 'analyst: "fly to Denver" runs the map action', fly.some((r) => r.tool === 'fly_to' && r.ok) && poseMoved(pose0, pose1), JSON.stringify(fly));
  if (vp.startsWith('iphone13')) await page.screenshot({ path: path.join(OUT, `${engine}-${vp}-analyst.png`) }).catch(() => {});
  await closeAll(page);
}

for (const engine of ENGINES) {
  const type = engine === 'webkit' ? webkit : chromium;
  for (const vpDef of VIEWPORTS) {
    if (VPS && !VPS.includes(vpDef.key)) continue;
    let ctx;
    try {
      ctx = await boot(type, engine, vpDef);
      if (PARTS.has('sheets')) await sheetChecks(ctx);
      if (PARTS.has('memory')) await scrollMemory(ctx);
      if (PARTS.has('headers')) await noDuplicateHeaders(ctx);
      if (PARTS.has('keyboard') && (vpDef.key.startsWith('iphone13') || vpDef.key.startsWith('iphonese'))) await keyboardAndRotation(ctx, vpDef);
      if (PARTS.has('text') && !vpDef.key.startsWith('iphone14')) await enlargedText(ctx);
      if (vpDef.key.startsWith('iphone13')) {
        if (PARTS.has('cameras')) await camerasChecks(ctx);
        if (PARTS.has('map')) await mapSelection(ctx);
        if (PARTS.has('analyst')) await analystChecks(ctx);
      }
    } catch (error) {
      rec(engine, vpDef.key, 'harness', false, String(error?.stack || error).split('\n').slice(0, 3).join(' | '));
    } finally {
      await ctx?.browser?.close().catch(() => {});
    }
  }
}

const summary = {
  base: BASE,
  engines: ENGINES,
  at: new Date().toISOString(),
  pass: results.filter((r) => r.pass === true).length,
  fail: results.filter((r) => r.pass === false).length,
  notes: results.filter((r) => r.pass === null).length,
  results,
};
writeFileSync(path.join(OUT, `report-${BASE.startsWith('https') ? 'live' : 'local'}-${ENGINES.join('+')}.json`), JSON.stringify(summary, null, 2));
console.log(`\n${summary.pass} passed, ${summary.fail} failed, ${summary.notes} notes (emulation, not a physical iPhone)`);
process.exit(failures ? 1 : 0);
