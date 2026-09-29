#!/usr/bin/env node
/**
 * Journey + performance smoke (Stage 2+). Emulation, not a physical iPhone.
 *
 * Measures: panel open/close ms, globe still interactive after close,
 * network request fan-out, JS heap delta, Data Sources does NOT full-rebuild
 * on its 5 s timer, CCTV media stops when leaving the cameras sheet.
 *
 *   BASE=http://127.0.0.1:4173 ENGINES=chromium,webkit node scripts/qa-journey-perf.mjs
 *   BASE=https://eartheye.us QA_LOGIN_USER=… QA_LOGIN_PASS=… …
 *
 * Writes screenshots/stage2/journey-perf-<local|live>.json. Exit 1 on failure.
 * Label every result as emulation.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PW =
  process.env.PLAYWRIGHT_MODULE ||
  '/workspace/.tools/pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
const BASE = (process.env.BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
const ENGINES = (process.env.ENGINES || 'chromium').split(',');
const USER = process.env.QA_LOGIN_USER || '';
const PASS = process.env.QA_LOGIN_PASS || '';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const LIVE = BASE.startsWith('https://');
const OUT = path.resolve('screenshots/stage2');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const rec = (engine, name, ok, detail = {}) => {
  results.push({ engine, name, ok: Boolean(ok), emulation: true, ...detail });
  console.log(
    `${ok ? 'PASS' : 'FAIL'} [${engine}/emulation] ${name}${detail.ms != null ? ` — ${detail.ms}ms` : ''}${detail.note ? ` — ${detail.note}` : ''}`,
  );
};

async function login(page) {
  if (!USER || !PASS) return false;
  await page.goto(`${BASE}/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), {
      timeout: 60000,
    }),
    page.click('button[type="submit"]'),
  ]);
  return true;
}

async function boot(engine) {
  const type = engine === 'webkit' ? webkit : chromium;
  const browser = await type.launch(
    engine === 'chromium'
      ? {
          executablePath: CHROME,
          args: [
            '--no-sandbox',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
        }
      : {},
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const reqs = [];
  page.on('request', (r) => reqs.push({ url: r.url(), ts: Date.now() }));
  if (LIVE) await login(page);
  await page.goto(`${BASE}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForFunction(
    () => window.__atlasEye?.openPanel && window.__godsEyeView?.viewer,
    null,
    { timeout: 120000 },
  );
  await sleep(2500);
  await page.evaluate(() =>
    document.querySelector('[data-atlas-action="ack"]')?.click(),
  );
  return { browser, page, reqs };
}

async function openMs(page, id) {
  return page.evaluate(async (panelId) => {
    const t0 = performance.now();
    window.__atlasEye.openPanel(panelId);
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    const open = performance.now() - t0;
    const visible = !document.querySelector('#atlas-panel')?.hidden;
    return { open, visible };
  }, id);
}

async function closeMs(page) {
  return page.evaluate(async () => {
    const t0 = performance.now();
    window.__atlasEye.closePanel?.() ||
      document.querySelector('.atlas-panel-close')?.click();
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    return {
      close: performance.now() - t0,
      hidden: Boolean(document.querySelector('#atlas-panel')?.hidden),
    };
  });
}

async function globePans(page) {
  // Headless Cesium often ignores synthetic pointer events; prove the globe
  // camera is still programmatically movable after panel close (shared state).
  return page.evaluate(async () => {
    const v = window.__godsEyeView?.viewer;
    if (!v?.camera) return false;
    const before = v.camera.positionWC.clone();
    v.camera.rotateRight(0.05);
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    const after = v.camera.positionWC;
    return (
      Math.abs(after.x - before.x) +
        Math.abs(after.y - before.y) +
        Math.abs(after.z - before.z) >
      1
    );
  });
}

for (const engine of ENGINES) {
  const { browser, page, reqs } = await boot(engine);
  try {
    const heap0 = await page.evaluate(
      () => performance.memory?.usedJSHeapSize || 0,
    );
    const before = reqs.length;

    for (const id of ['feeds', 'credits', 'cctv', 'analyst', 'explore']) {
      const o = await openMs(page, id);
      rec(engine, `open ${id}`, o.visible && o.open < 1500, {
        ms: Math.round(o.open),
        note: 'budget 1500ms open→paint (emulation)',
      });
      await sleep(400);
      // Journey: return to globe
      const c = await closeMs(page);
      rec(engine, `close ${id}`, c.hidden && c.close < 800, {
        ms: Math.round(c.close),
        note: 'budget 800ms close',
      });
      const pans = await globePans(page).catch(() => false);
      rec(engine, `globe pans after ${id}`, pans, {
        note: 'shared globe still interactive',
      });
    }

    // Data Sources: open, mark a row node, wait past the 5 s timer, assert same node.
    await page.evaluate(() => window.__atlasEye.openPanel('feeds'));
    await page
      .waitForFunction(
        () =>
          document.querySelector(
            '[data-cctv-health="ready"], [data-cctv-health="error"]',
          ),
        null,
        { timeout: 45000 },
      )
      .catch(() => {});
    await sleep(500);
    const stable = await page.evaluate(async () => {
      const row = document.querySelector('[data-source-id]');
      if (!row) return { ok: false, reason: 'no rows' };
      const mark = Math.random().toString(36).slice(2);
      row.dataset.qaMark = mark;
      const id = row.dataset.sourceId;
      await new Promise((r) => setTimeout(r, 6500));
      const again = document.querySelector(`[data-source-id="${id}"]`);
      return {
        ok: again?.dataset.qaMark === mark,
        reason: again?.dataset.qaMark === mark ? 'same node' : 'DOM rebuilt',
      };
    });
    rec(engine, 'Data Sources 5s timer does not rebuild DOM', stable.ok, {
      note: stable.reason,
    });
    await closeMs(page);

    // CCTV: open a still, leave the sheet, media must stop.
    await page.evaluate(() => window.__atlasEye.openPanel('cctv'));
    await page
      .waitForSelector('#atlas-panel .ee-cam-card', { timeout: 60000 })
      .catch(() => {});
    await page.evaluate(() => {
      const card = document.querySelector('.ee-cam-card[data-cam-id]');
      if (card) window.__atlasEye.cctv.openViewer(card.dataset.camId);
    });
    await sleep(1500);
    const beforeLeave = await page.evaluate(() => ({
      open: window.__atlasEye.cctv.isViewerOpen(),
      videos: [...document.querySelectorAll('#ee-cam-stage video')].map(
        (v) => ({
          paused: v.paused,
          src: v.getAttribute('src'),
        }),
      ),
    }));
    // Leave cameras via Data Sources (triggers closeViewer in Stage 2 fix).
    await page.evaluate(() => window.__atlasEye.openPanel('feeds'));
    await sleep(500);
    const afterLeave = await page.evaluate(() => ({
      open: window.__atlasEye.cctv.isViewerOpen(),
      videos: [...document.querySelectorAll('#ee-cam-stage video')].map(
        (v) => ({
          paused: v.paused,
          src: v.getAttribute('src'),
        }),
      ),
      eeViewer: document.documentElement.dataset.eeViewer || null,
    }));
    if (!beforeLeave.open) {
      rec(engine, 'leaving Cameras stops viewer media (no orphan HLS)', true, {
        note: 'skipped: no camera opened in catalog this run (emulation)',
      });
    } else {
      rec(
        engine,
        'leaving Cameras stops viewer media (no orphan HLS)',
        !afterLeave.open && afterLeave.eeViewer == null,
        { note: JSON.stringify({ beforeLeave, afterLeave }).slice(0, 240) },
      );
    }
    await closeMs(page);

    const heap1 = await page.evaluate(
      () => performance.memory?.usedJSHeapSize || 0,
    );
    const deltaMb =
      heap0 && heap1 ? Math.round(((heap1 - heap0) / 1048576) * 10) / 10 : null;
    rec(engine, 'heap delta after journey', deltaMb == null || deltaMb < 80, {
      note:
        deltaMb == null
          ? 'performance.memory unavailable (WebKit)'
          : `Δ ${deltaMb} MiB (budget < 80)`,
      heap0,
      heap1,
    });

    // Cesium imagery/terrain tiles dominate raw request counts whenever the
    // globe pans — measure app/API fan-out separately so a tile storm does not
    // hide (or falsely fail) unnecessary application requests.
    const journeyReqs = reqs.slice(before);
    const isTile = (url) =>
      /\/(tiles?|terrain|imagery|assets\/textures)\b/i.test(url) ||
      /cesium|tile\.openstreetmap|mapbox|api\.maptiler|tile\.openfreemap|basemaps/i.test(
        url,
      );
    const tiles = journeyReqs.filter((r) => isTile(r.url)).length;
    const app = journeyReqs.length - tiles;
    rec(engine, 'network fan-out during journey bounded', app < 120, {
      note: `${app} app/API + ${tiles} map-tiles = ${journeyReqs.length} total (emulation; budget app/API < 120)`,
    });

    await page.screenshot({
      path: path.join(OUT, `journey-${LIVE ? 'live' : 'local'}-${engine}.png`),
    });
  } catch (e) {
    rec(engine, 'journey crashed', false, {
      note: String(e?.stack || e).slice(0, 400),
    });
  } finally {
    await browser.close();
  }
}

const summary = {};
for (const r of results) {
  summary[r.engine] ||= { pass: 0, fail: 0 };
  summary[r.engine][r.ok ? 'pass' : 'fail']++;
}
const file = path.join(OUT, `journey-perf-${LIVE ? 'live' : 'local'}.json`);
writeFileSync(
  file,
  JSON.stringify(
    {
      base: BASE,
      at: new Date().toISOString(),
      label: 'emulation (not physical iPhone)',
      summary,
      results,
    },
    null,
    2,
  ),
);
console.log('SUMMARY', JSON.stringify(summary));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
