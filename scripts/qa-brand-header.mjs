#!/usr/bin/env node
/**
 * Earth Eye header-logo QA: desktop + 390×844 header crops, three animation
 * frames a few seconds apart (proves the globe/satellites move while the
 * letters stay put), and one frame with prefers-reduced-motion emulated.
 * Usage: node scripts/qa-brand-header.mjs --url http://localhost:4173 --chrome /usr/bin/google-chrome
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('url', 'http://localhost:4173');
const OUT = path.resolve(arg('out', 'screenshots/brand'));
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: arg('chrome', undefined),
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const report = {};

async function open(viewport, reduced = false) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForSelector('.ee-wordmark-svg', { timeout: 60000 });
  // wait for the loading screen to clear so the header is visible
  await page.waitForFunction(() => document.querySelector('#loading-screen')?.classList.contains('hidden') ?? true, { timeout: 120000 }).catch(() => {});
  await sleep(1500);
  return page;
}
const box = (page) => page.$eval('#title-bar', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
const logoBox = (page) => page.$eval('.ee-wordmark-svg', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height, right: r.right, vw: innerWidth }; });
async function shotClip(page, file, pad = 16) {
  const b = await logoBox(page);
  const clip = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(b.width + pad * 2, b.vw), height: b.height + pad * 2 + 22 };
  await page.screenshot({ path: path.join(OUT, file), clip });
  return clip;
}
async function motionState(page) {
  return page.evaluate(() => {
    const spin = document.querySelector('.ee-wordmark-svg .ee-land-spin');
    const sat = document.querySelector('.ee-wordmark-svg .ee-sat-moving g');
    const letters = document.querySelector('.ee-wordmark-svg .ee-letters');
    return {
      landTransform: spin ? getComputedStyle(spin).transform : null,
      landAnimation: spin ? getComputedStyle(spin).animationName : null,
      satCTM: sat?.getCTM ? (({ e, f }) => ({ e: +e.toFixed(2), f: +f.toFixed(2) }))(sat.getCTM()) : null,
      satDisplay: sat ? getComputedStyle(sat.parentElement).display : null,
      lettersBox: letters ? (({ x, y, width, height }) => ({ x, y, width, height }))(letters.getBBox()) : null,
    };
  });
}

// desktop
{
  const page = await open({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.screenshot({ path: path.join(OUT, 'header-desktop-full.png'), clip: { x: 0, y: 0, width: 1440, height: 180 } });
  report.desktop = { logo: await logoBox(page) };
  const frames = [];
  for (let i = 1; i <= 3; i++) {
    await shotClip(page, `header-anim-frame-${i}.png`);
    // zoomed globe crop (the moving part) for easy side-by-side comparison
    const g = await page.$eval('.ee-wordmark-svg .ee-globe > circle', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.screenshot({ path: path.join(OUT, `header-anim-globe-${i}.png`), clip: { x: g.x - g.w * 1.3, y: g.y - g.h * 0.35, width: g.w * 3.6, height: g.h * 1.7 } });
    frames.push(await motionState(page));
    if (i < 3) await sleep(4000);
  }
  report.frames = frames;
  // pixel diff between frame 1 and 3
  const a = await sharp(path.join(OUT, 'header-anim-frame-1.png')).raw().toBuffer({ resolveWithObject: true });
  const c = await sharp(path.join(OUT, 'header-anim-frame-3.png')).raw().toBuffer();
  let diff = 0;
  for (let i = 0; i < c.length; i++) if (Math.abs(a.data[i] - c[i]) > 24) diff++;
  report.framePixelDiff = diff;
  // visibility pause
  report.pauseWhenHidden = await page.evaluate(() => {
    const svg = document.querySelector('.ee-wordmark-svg');
    return { hasPauseApi: typeof svg.pauseAnimations === 'function', pausedClass: svg.classList.contains('ee-paused') };
  });
  await page.close();
}
// reduced motion
{
  const page = await open({ width: 1440, height: 900, deviceScaleFactor: 2 }, true);
  await shotClip(page, 'header-reduced-motion.png');
  const s1 = await motionState(page);
  await sleep(3000);
  const s2 = await motionState(page);
  report.reducedMotion = { s1, s2, static: s1.landTransform === s2.landTransform && s1.satDisplay === 'none' };
  await page.close();
}
// mobile
{
  const page = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.screenshot({ path: path.join(OUT, 'header-mobile-390.png'), clip: { x: 0, y: 0, width: 390, height: 140 } });
  const b = await logoBox(page);
  const actions = await page.$eval('#top-center-actions', (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }).catch(() => null);
  report.mobile = { logo: b, actions, clipped: b.x < 0 || b.right > b.vw, overlapsActions: actions ? b.right > actions.left && b.y < actions.bottom : null };
  await page.screenshot({ path: path.join(OUT, 'mobile-390x844-full.png') });
  await page.close();
}
fs.writeFileSync(path.join(OUT, 'brand-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
await browser.close();
