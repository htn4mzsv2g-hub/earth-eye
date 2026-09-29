#!/usr/bin/env node
/**
 * iPhone UA probe against live eartheye.us after reviewer login.
 * Usage:
 *   QA_LOGIN_USER=... QA_LOGIN_PASS=... node scripts/ee-iphone-globe-probe.mjs [url]
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const BASE = (process.argv[2] || 'https://eartheye.us').replace(/\/$/, '');
const USER = process.env.QA_LOGIN_USER || '';
const PASS = process.env.QA_LOGIN_PASS || '';
const OUT = process.env.PROBE_OUT || '/tmp/ee-iphone-globe-probe';
const EXPECT_SHA = process.env.EXPECT_SHA || 'e91d7a6';
if (!USER || !PASS) {
  console.error('QA_LOGIN_USER/PASS required');
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const report = { base: BASE, expectSha: EXPECT_SHA, ok: true, steps: [] };
const note = (msg, extra) => {
  report.steps.push({ msg, ...(extra || {}), at: new Date().toISOString() });
  console.log(msg, extra ? JSON.stringify(extra) : '');
};
const fail = (why) => {
  report.ok = false;
  report.failReason = (report.failReason ? report.failReason + '; ' : '') + why;
  note('FAIL', { why });
};

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-dev-shm-usage',
  ],
});

try {
  const page = await browser.newPage();
  await page.setUserAgent(IPHONE_UA);
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#username', { timeout: 20000 });
  await page.click('#username', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#username', USER, { delay: 5 });
  await page.click('#password', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('#password', PASS, { delay: 5 });

  const filled = await page.$eval('#username', (el) => el.value);
  if (filled !== USER) fail(`username field mismatch got="${filled}"`);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 90000 }),
    page.click('form.card button[type=submit]'),
  ]);
  note('after-login', { url: page.url() });
  if (/\/login/.test(page.url())) {
    const errText = await page.evaluate(
      () => document.querySelector('.error, [role=alert], .flash')?.textContent || '',
    );
    fail(`still on login: ${errText.slice(0, 120)}`);
    await page.screenshot({ path: `${OUT}/login-stuck.png` });
    throw new Error(report.failReason);
  }

  // Wait for app shell / canvas / recovery
  await page.waitForFunction(
    () =>
      Boolean(document.querySelector('#cesiumContainer canvas')) ||
      Boolean(document.querySelector('.ee-graphics-recovery')) ||
      Boolean(document.querySelector('#ee-tabbar')),
    { timeout: 180000 },
  );
  // Startup chrome dismiss window
  await sleep(8000);

  // Dismiss first-run / disclaimer if present (center must be canvas)
  await page.evaluate(() => {
    document.querySelector('#atlas-disclaimer [data-atlas-action="ack"]')?.click();
    document
      .querySelector('#first-run-launcher button.first-run-explore, #first-run-launcher [data-skip], #first-run-launcher button')
      ?.click();
  });
  await sleep(1500);

  const snap = await page.evaluate(() => {
    const canvas = document.querySelector('#cesiumContainer canvas');
    const cx = Math.floor(innerWidth / 2);
    const cy = Math.floor(innerHeight * 0.4); // above tab bar / sheets
    const describe = (el) => {
      if (!el) return null;
      const id = el.id ? `#${el.id}` : '';
      const cls =
        typeof el.className === 'string' && el.className
          ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
          : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 140);
    };
    const app = window.__godsEyeView || window.__atlasEye?.app;
    const viewer = app?.viewer;
    const ctl = viewer?.scene?.screenSpaceCameraController;
    const cs = canvas ? getComputedStyle(canvas) : null;
    let cameraMoved = null;
    try {
      if (viewer?.camera) {
        const before = viewer.camera.heading;
        viewer.camera.setView({
          destination: viewer.camera.positionWC,
          orientation: {
            heading: before + 0.05,
            pitch: viewer.camera.pitch,
            roll: viewer.camera.roll,
          },
        });
        viewer.scene.requestRender?.();
        cameraMoved = Math.abs(viewer.camera.heading - before) > 0.01;
        viewer.camera.setView({
          destination: viewer.camera.positionWC,
          orientation: {
            heading: before,
            pitch: viewer.camera.pitch,
            roll: viewer.camera.roll,
          },
        });
        viewer.scene.requestRender?.();
      }
    } catch (e) {
      cameraMoved = `err:${e.message}`;
    }

    let dragDelta = null;
    try {
      if (canvas && viewer?.camera) {
        const before = viewer.camera.heading;
        const r = canvas.getBoundingClientRect();
        const x0 = r.left + r.width / 2;
        const y0 = r.top + r.height / 2;
        const fire = (type, x, y) => {
          canvas.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 1,
              pointerType: 'touch',
              isPrimary: true,
              clientX: x,
              clientY: y,
              buttons: type === 'pointerup' ? 0 : 1,
            }),
          );
        };
        fire('pointerdown', x0, y0);
        for (let i = 1; i <= 10; i++) fire('pointermove', x0 + i * 14, y0);
        fire('pointerup', x0 + 140, y0);
        viewer.scene.requestRender?.();
        dragDelta = viewer.camera.heading - before;
      }
    } catch (e) {
      dragDelta = `err:${e.message}`;
    }

    const stack =
      typeof document.elementsFromPoint === 'function'
        ? [...document.elementsFromPoint(cx, cy)].slice(0, 8).map(describe)
        : [];

    return {
      url: location.href,
      metaBuild: document.querySelector('meta[name="ee-build-id"]')?.content || null,
      metaGit: document.querySelector('meta[name="ee-git-sha"]')?.content || null,
      loadingScreen: Boolean(document.getElementById('loading-screen')),
      loaderContentCount: document.querySelectorAll('.loader-content').length,
      topHit: describe(document.elementFromPoint(cx, cy)),
      hitStack: stack,
      eeOverlay: document.documentElement.getAttribute('data-ee-overlay'),
      canvasPe: cs?.pointerEvents || null,
      canvasTouch: cs?.touchAction || null,
      enableInputs: ctl ? Boolean(ctl.enableInputs) : null,
      enableRotate: ctl ? Boolean(ctl.enableRotate) : null,
      requestRenderMode:
        viewer?.scene && 'requestRenderMode' in viewer.scene
          ? Boolean(viewer.scene.requestRenderMode)
          : null,
      useDefaultRenderLoop: viewer
        ? Boolean(viewer.useDefaultRenderLoop)
        : null,
      documentHidden: document.hidden,
      viewerPresent: Boolean(viewer && !viewer.isDestroyed?.()),
      cameraMoved,
      dragDelta,
      compact: document.documentElement.classList.contains('ee-compact'),
      gov: app?.getRenderGovernorDiagnostics?.() || null,
      firstRunVisible: Boolean(
        document.querySelector('#first-run-launcher.visible'),
      ),
    };
  });

  report.snap = snap;
  await page.screenshot({ path: `${OUT}/after-load.png` });
  note('snapshot', snap);

  if (snap.loadingScreen) fail('loading-screen still in DOM');
  if ((snap.loaderContentCount || 0) > 0)
    fail(`.loader-content count=${snap.loaderContentCount}`);
  if (snap.topHit && /loader-content|loading-screen/i.test(snap.topHit))
    fail(`top hit is loader: ${snap.topHit}`);
  if (snap.enableInputs === false) fail('enableInputs=false');
  if (snap.useDefaultRenderLoop === false) fail('useDefaultRenderLoop=false');
  if (snap.canvasPe === 'none') fail('canvas pointer-events:none');
  if (snap.viewerPresent && snap.cameraMoved !== true)
    fail(`camera nudge failed: ${snap.cameraMoved}`);
  if (snap.metaBuild && !String(snap.metaBuild).includes(EXPECT_SHA))
    fail(`meta build ${snap.metaBuild} missing expect sha ${EXPECT_SHA}`);
  if (snap.metaGit && !String(snap.metaGit).includes(EXPECT_SHA))
    fail(`meta git ${snap.metaGit} missing expect sha ${EXPECT_SHA}`);
  if (snap.canvasTouch && snap.canvasTouch !== 'none' && snap.canvasTouch !== 'manipulation')
    note('WARN touch-action', { canvasTouch: snap.canvasTouch });

  // Soft checks (emulation cannot fully prove iOS touch path)
  const canvasOnTop =
    snap.topHit && /canvas/i.test(snap.topHit) && !/loader/i.test(snap.topHit);
  report.emulation = {
    canvasLikelyTop: Boolean(canvasOnTop),
    cameraApiMoves: snap.cameraMoved === true,
    metaMatchesTip: Boolean(
      snap.metaBuild && String(snap.metaBuild).includes(EXPECT_SHA),
    ),
    note: 'Synthetic pointer drag on headless Chrome≠physical iOS Safari; camera API nudge proves render/camera not frozen.',
  };

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, failReason: report.failReason, snap, emulation: report.emulation }, null, 2));
  await browser.close();
  process.exit(report.ok ? 0 : 1);
} catch (err) {
  report.ok = false;
  report.error = String(err?.stack || err);
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.error(report.error);
  await browser.close().catch(() => {});
  process.exit(1);
}
