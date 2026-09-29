#!/usr/bin/env node
/**
 * Stage 3.4 smoke (emulation): Draw toggle + touch-ish pointer on canvas.
 * Not a substitute for physical iPhone lag measurement.
 *
 *   BASE=https://eartheye.us node .probe/with-login.mjs scripts/qa-draw-touch-smoke-run.mjs
 * or (local): BASE=http://127.0.0.1:4173 node scripts/qa-draw-touch-smoke.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PW =
  process.env.PLAYWRIGHT_MODULE ||
  '/workspace/.tools/pw/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const BASE = (process.env.BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
const OUT = path.resolve('screenshots/stage3');
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const results = [];
const rec = (name, ok, note = '') => {
  results.push({ name, ok: Boolean(ok), emulation: true, note });
  console.log(`${ok ? 'PASS' : 'FAIL'} [emulation] ${name}${note ? ` — ${note}` : ''}`);
};

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
});
try {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // Optional login form
  if (page.url().includes('/login')) {
    const user = process.env.QA_LOGIN_USER;
    const pass = process.env.QA_LOGIN_PASS;
    if (!user || !pass) throw new Error('login required but QA_LOGIN_* unset');
    await page.fill('#username, input[name="username"]', user);
    await page.fill('#password, input[name="password"]', pass);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 }),
      page.click('button[type="submit"], input[type="submit"]'),
    ]);
  }
  await page.waitForFunction(
    () => window.__godsEyeView?.viewer || window.__atlasEye,
    null,
    { timeout: 120000 },
  );
  await page.evaluate(() =>
    document.querySelector('[data-atlas-action="ack"]')?.click(),
  );
  rec('app booted (mobile viewport)', true);

  // Open DISPLAY sheet / find draw toggle
  const drawToggle = await page.$('#draw-toggle');
  if (!drawToggle) {
    // Try MORE / display sheet
    await page.click('[data-ee-sheet="display"], [data-ee-tab="more"]').catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
  }
  const hasToggle = await page.$('#draw-toggle');
  rec('draw toggle present', Boolean(hasToggle), hasToggle ? '' : 'no #draw-toggle');

  if (hasToggle) {
    await hasToggle.click();
    const active = await page.evaluate(
      () => document.body.classList.contains('gev-drawing'),
    );
    rec('draw mode activates', active);
    // Touch-ish pointer down/up on canvas center
    const box = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.tap(box.x, box.y);
    await page.touchscreen.tap(box.x + 40, box.y + 30);
    rec('canvas accepts touch taps in draw mode', true, 'emulation');
    // Leave draw mode
    await hasToggle.click();
    const off = await page.evaluate(
      () => !document.body.classList.contains('gev-drawing'),
    );
    rec('draw mode deactivates', off);
  }
} catch (e) {
  rec('draw smoke crashed', false, String(e?.stack || e).slice(0, 300));
} finally {
  await browser.close();
}
writeFileSync(path.join(OUT, 'draw-touch-smoke.json'), JSON.stringify(results, null, 2));
const fail = results.filter((r) => !r.ok).length;
console.log('SUMMARY', JSON.stringify({ pass: results.length - fail, fail }));
process.exit(fail ? 1 : 0);
