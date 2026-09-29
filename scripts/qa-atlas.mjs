#!/usr/bin/env node
/**
 * Earth Eye end-to-end smoke test (headless Chrome via puppeteer-core API).
 *
 *   node scripts/qa-atlas.mjs [--url http://localhost:4173] [--chrome /usr/bin/google-chrome]
 *
 * Loads the running app (it never starts a server), checks the globe canvas is
 * not blank, toggles every data layer and records its real feed state, runs the
 * command-bar sentences, switches every sensor mode, selects a target, enters
 * cockpit, round-trips a share URL, and saves desktop (1440×900) and iPhone
 * (390×844) screenshots plus screenshots/qa-report.json. Headless Chrome uses
 * SwiftShader, so pixels are evidence of rendering, not of real-GPU quality.
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://localhost:4173').replace(/\/$/, '');
const CHROME = arg('chrome', process.env.CHROME_PATH || '/usr/bin/google-chrome');
const OUT = path.resolve(arg('out', 'screenshots'));
const ONLY = arg('only', 'all'); // all | desktop | mobile
fs.mkdirSync(OUT, { recursive: true });

const report = { base: BASE, startedAt: new Date().toISOString(), desktop: {}, mobile: {}, consoleErrors: [], pageErrors: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--window-size=1440,900'],
});
const context = browser.defaultBrowserContext();
await context.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

async function openPage(viewport, url = `${BASE}/`) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(`${viewport.width}w: ${m.text().slice(0, 240)}`);
  });
  page.on('response', (res) => {
    if (res.status() < 400) return;
    const u = new URL(res.url());
    const where = u.origin === new URL(BASE).origin ? u.pathname.replace(/\/\d+\/\d+\/\d+.*$/, '/{z}/{x}/{y}') : u.host;
    const key = `${res.status()} ${where}`;
    report.failedResponses ||= {};
    report.failedResponses[key] = (report.failedResponses[key] || 0) + 1;
  });
  page.on('pageerror', (e) => report.pageErrors.push(`${viewport.width}w: ${String(e?.message || e).slice(0, 240)}`));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__atlasEye?.run && window.__godsEyeView?.viewer, { timeout: 90000 });
  return page;
}

async function canvasStats(page) {
  const buf = await page.screenshot({ type: 'png' });
  const { width, height } = await sharp(buf).metadata();
  const crop = await sharp(buf)
    .extract({ left: Math.round(width * 0.3), top: Math.round(height * 0.3), width: Math.round(width * 0.4), height: Math.round(height * 0.4) })
    .stats();
  const stdev = crop.channels.slice(0, 3).reduce((a, c) => a + c.stdev, 0) / 3;
  const mean = crop.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3;
  return { stdev: Math.round(stdev * 10) / 10, mean: Math.round(mean * 10) / 10, nonBlank: stdev > 6 && mean > 8 };
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const run = (page, text) =>
  page.evaluate(async (t) => {
    const r = await window.__atlasEye.run(t);
    const out = document.querySelector('#atlas-command-output');
    return { ok: r.ok, label: r.parsed?.label, output: out?.innerText?.slice(0, 300) || '', steps: (r.results || []).map((x) => ({ tool: x.tool || x.layer || x.ui, ok: x.result?.ok !== false, error: x.result?.error || null })) };
  }, text);
const style = (page) => page.$eval('#active-style-name', (e) => e.textContent.trim()).catch(() => '?');
const ack = (page) => page.evaluate(() => document.querySelector('#atlas-disclaimer [data-atlas-action="ack"]')?.click());

async function layerMatrix(page) {
  const ids = await page.evaluate(() => window.__godsEyeView.dataManager.getAll().filter((l) => l.showInTogglePanel !== false).map((l) => l.id));
  const skip = new Set(['bhote-koshi-2026', 'bhote-koshi-locator', 'radio', 'directions', 'recent-imagery', 'military-awareness']);
  const rows = [];
  for (const id of ids) {
    if (skip.has(id)) {
      rows.push({ id, tested: false, reason: 'interactive/scene layer — needs user input (checked for presence only)' });
      continue;
    }
    const row = await page.evaluate(async (layerId) => {
      const dm = window.__godsEyeView.dataManager;
      const t0 = Date.now();
      try {
        await Promise.race([dm.setEnabled(layerId, true, { origin: 'qa' }), new Promise((r) => setTimeout(r, 25000))]);
      } catch (e) {
        return { id: layerId, error: String(e?.message || e) };
      }
      let layer;
      for (let i = 0; i < 50; i++) {
        layer = dm.getAll().find((l) => l.id === layerId);
        const s = layer?.stats || {};
        if (!s.loading && (s.count > 0 || s.error || s.keyRequired || s.lastUpdate || i > 30)) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      const s = layer?.stats || {};
      const out = {
        id: layerId,
        name: layer?.name,
        enabled: layer?.enabled,
        count: s.count ?? null,
        loadingLabel: s.loadingLabel || null,
        status: s.status || null,
        error: s.error || s.lastError || null,
        keyRequired: Boolean(s.keyRequired),
        fallback: s.fallback ?? null,
        source: typeof s.source === 'string' ? s.source.slice(0, 120) : null,
        ms: Date.now() - t0,
      };
      await dm.setEnabled(layerId, false, { origin: 'qa' }).catch(() => {});
      return out;
    }, id);
    rows.push({ tested: true, ...row });
  }
  return rows;
}

async function desktop() {
  const r = report.desktop;
  const page = await openPage({ width: 1440, height: 900 });
  await sleep(14000);
  r.canvasFirst = await canvasStats(page);
  await shot(page, 'desktop-01-first-screen');
  r.brandTitle = await page.title();
  r.launcherVisible = await page.$eval('#first-run-launcher', (e) => !e.hidden).catch(() => false);
  await ack(page);

  r.layers = await layerMatrix(page);
  // Enabling CCTV opens its panel; close panels the matrix left open.
  await page.evaluate(async () => {
    for (const panelId of ['cctv-panel', 'radio-panel', 'global-context-panel', 'data-panel'])
      await window.__atlasEye.runAction('set_panel_open', { panelId, open: false }).catch(() => {});
  });

  r.commands = {};
  const commands = [
    'take me to LAX',
    'show aircraft near me',
    'select the nearest airborne aircraft',
  ];
  for (const c of commands) {
    r.commands[c] = await run(page, c);
    await sleep(c.startsWith('take me') ? 6000 : 3000);
  }
  await sleep(4000);
  r.trackedAfterSelect = await page.evaluate(() => Boolean(window.__godsEyeView.viewer.trackedEntity) || Boolean(document.querySelector('.context-card, #global-context-panel:not(.collapsed)')));
  await shot(page, 'desktop-02-target-selected');
  r.commands.cockpit = await run(page, 'cockpit');
  await sleep(6000);
  r.cockpitActive = await page.evaluate(() => document.body.classList.contains('cockpit-mode') || document.body.classList.contains('cockpit-active') || Boolean(document.querySelector('#cockpit-overlay:not([hidden]), .cockpit-active, [data-cockpit-active="true"]')));
  await shot(page, 'desktop-03-cockpit');
  r.commands['exit cockpit'] = await run(page, 'exit cockpit');
  await sleep(2500);

  for (const c of ['track the ISS', 'show fires near Texas', 'count satellites over North America', 'which ships are headed toward Oakland', 'show cameras near Austin', 'reset globe']) {
    r.commands[c] = await run(page, c);
    await sleep(c === 'track the ISS' ? 5000 : 4000);
    if (c === 'track the ISS') await shot(page, 'desktop-04-track-iss');
    if (c === 'show fires near Texas') await shot(page, 'desktop-05-fires-texas');
    if (c === 'show cameras near Austin') {
      await sleep(4000);
      await shot(page, 'desktop-06-cameras-austin');
    }
  }
  await run(page, 'stop tracking');
  // Sensor modes over Austin with flights on for the detection overlay.
  await run(page, 'show aircraft near Austin');
  await sleep(6000);
  r.sensors = {};
  for (const [cmd, file] of [['normal', null], ['crt', 'desktop-07-crt'], ['nvg', 'desktop-08-nvg'], ['flir', 'desktop-09-flir'], ['noir', 'desktop-10-noir'], ['snow', 'desktop-11-snow']]) {
    const res = await run(page, cmd);
    await sleep(2500);
    r.sensors[cmd] = { ok: res.ok, activeStyle: await style(page), canvas: await canvasStats(page) };
    if (file) await shot(page, file);
  }
  await run(page, 'normal');
  r.commands['detection on'] = await run(page, 'detection on');
  await sleep(3000);
  await shot(page, 'desktop-12-detection-overlay');
  r.commands['military hud'] = await run(page, 'military hud');
  await sleep(1500);
  await shot(page, 'desktop-13-military-hud');
  await run(page, 'detection off');

  // Panels
  for (const [id, file] of [['keys', 'desktop-14-settings-panel'], ['feeds', 'desktop-15-feed-status'], ['credits', 'desktop-16-credits'], ['safety', 'desktop-17-safety'], ['help', 'desktop-18-command-help']]) {
    await page.evaluate((p) => window.__atlasEye.openPanel(p), id);
    await sleep(id === 'keys' ? 2500 : 1200);
    await shot(page, file);
    r[`panel_${id}`] = await page.$eval('#atlas-panel', (e) => ({ visible: !e.hidden, text: e.innerText.slice(0, 160) }));
  }
  await page.evaluate(() => window.__atlasEye.closePanel());
  r.voice = await page.$eval('#gev-voice-control', (e) => ({ state: e.dataset.atlasVoice, detail: e.querySelector('#gev-voice-detail')?.textContent })).catch(() => null);

  // Share URL round trip: fly somewhere, set FLIR + earthquakes, read the live hash.
  await run(page, 'fly to 37.8077, -122.4750');
  await sleep(6000);
  await run(page, 'flir');
  await run(page, 'show earthquakes');
  await sleep(3000);
  await page.click('#share-btn').catch(() => {});
  await sleep(800);
  let shareUrl = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
  if (!shareUrl || !shareUrl.includes('#')) shareUrl = await page.evaluate(() => location.href);
  r.shareUrl = shareUrl;
  await page.close();

  const restored = await openPage({ width: 1440, height: 900 }, shareUrl);
  await sleep(12000);
  r.shareRestore = await restored.evaluate(() => {
    const c = window.__godsEyeView.viewer.camera.positionCartographic;
    const deg = (x) => (x * 180) / Math.PI;
    return {
      lat: deg(c.latitude),
      lon: deg(c.longitude),
      heightM: Math.round(c.height),
      style: document.querySelector('#active-style-name')?.textContent.trim(),
      earthquakes: window.__godsEyeView.dataManager.getAll().find((l) => l.id === 'earthquakes')?.enabled,
      launcher: Boolean(document.querySelector('#first-run-launcher') && !document.querySelector('#first-run-launcher').hidden),
    };
  });
  await shot(restored, 'desktop-19-share-url-restored');
  await restored.close();
}

async function mobile() {
  const r = report.mobile;
  const vp = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const page = await openPage(vp);
  await sleep(14000);
  r.canvasFirst = await canvasStats(page);
  await shot(page, 'mobile-01-first-screen');
  await ack(page);
  r.overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  await run(page, 'show aircraft near Austin');
  await sleep(7000);
  r.select = await run(page, 'select the nearest airborne aircraft');
  await sleep(5000);
  await shot(page, 'mobile-02-target-selected');
  r.cockpit = await run(page, 'cockpit');
  await sleep(6000);
  await shot(page, 'mobile-03-cockpit');
  await run(page, 'exit cockpit');
  await sleep(2000);
  for (const [cmd, file] of [['flir', 'mobile-04-flir'], ['nvg', 'mobile-05-nvg']]) {
    await run(page, cmd);
    await sleep(2500);
    await shot(page, file);
  }
  await run(page, 'normal');
  await run(page, 'detection on');
  await sleep(2500);
  await shot(page, 'mobile-06-detection-overlay');
  await run(page, 'detection off');
  await page.evaluate(() => window.__atlasEye.openPanel('keys'));
  await sleep(2500);
  await shot(page, 'mobile-07-settings-panel');
  await page.evaluate(() => window.__atlasEye.closePanel());
  await page.click('#ee-tabbar [data-ee-more]').catch(() => page.click('#atlas-menu-toggle').catch(() => {}));
  await sleep(600);
  await shot(page, 'mobile-08-quick-menu');
  await page.close();
}

try {
  if (ONLY !== 'mobile') await desktop();
  if (ONLY !== 'desktop') await mobile();
} catch (error) {
  report.fatal = String(error?.stack || error);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, ONLY === 'all' ? 'qa-report.json' : `qa-report-${ONLY}.json`), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify({ fatal: report.fatal || null, consoleErrors: report.consoleErrors.length, pageErrors: report.pageErrors.length }, null, 1));
}
