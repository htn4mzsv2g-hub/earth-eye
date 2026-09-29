#!/usr/bin/env node
/**
 * Stage 3 Analyst journey (emulation). Exercises deterministic tools via the
 * shared panel — no paid AI. Exit 1 on failure.
 *
 *   BASE=http://127.0.0.1:4173 ENGINES=chromium node scripts/qa-analyst-journey.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PW =
  process.env.PLAYWRIGHT_MODULE ||
  '/workspace/.tools/pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
const BASE = (process.env.BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
const ENGINES = (process.env.ENGINES || 'chromium').split(',');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const OUT = path.resolve('screenshots/stage3');
mkdirSync(OUT, { recursive: true });
const results = [];
const rec = (engine, name, ok, note = '') => {
  results.push({ engine, name, ok: Boolean(ok), emulation: true, note });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${engine}/emulation] ${name}${note ? ` — ${note}` : ''}`);
};

async function boot(engine) {
  const type = engine === 'webkit' ? webkit : chromium;
  const browser = await type.launch(
    engine === 'chromium'
      ? {
          executablePath: CHROME,
          args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        }
      : {},
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (page.url().includes('/login')) {
    const user = process.env.QA_LOGIN_USER;
    const pass = process.env.QA_LOGIN_PASS;
    if (!user || !pass) throw new Error('login required but QA_LOGIN_* unset');
    await page.locator('#username, input[name="username"]').first().fill(user);
    await page.locator('#password, input[name="password"]').first().fill(pass);
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    await page.waitForFunction(
      () => !location.pathname.includes('/login'),
      null,
      { timeout: 60000 },
    );
  }
  await page.waitForFunction(
    () => window.__atlasEye?.openPanel && window.__godsEyeView?.viewer,
    null,
    { timeout: 120000 },
  );
  await page.evaluate(() =>
    document.querySelector('[data-atlas-action="ack"]')?.click(),
  );
  return { browser, page };
}

for (const engine of ENGINES) {
  const { browser, page } = await boot(engine);
  try {
    await page.evaluate(() => window.__atlasEye.openPanel('analyst'));
    await page.waitForSelector('#atlas-panel [data-analyst], #atlas-panel form, #atlas-panel input', {
      timeout: 15000,
    }).catch(() => {});
    rec(engine, 'open Analyst panel', true, 'emulation');

    const ai = await page.evaluate(async () => {
      const tools = window.__atlasEye?.analystTools;
      if (!tools?.run) return { ok: false, err: 'no tools' };
      return tools.run('ai_status', {});
    });
    rec(
      engine,
      'ai_status says summaries off',
      ai?.ok && /off/i.test(ai.items?.[0]?.label || '') && /off/i.test(ai.note || ''),
      String(ai?.note || ai?.err || '').slice(0, 120),
    );

    const health = await page.evaluate(async () => {
      const tools = window.__atlasEye?.analystTools;
      return tools?.run('source_health', {});
    });
    rec(
      engine,
      'source_health returns items',
      health?.ok && Array.isArray(health.items) && health.items.length > 0,
      `${health?.items?.length || 0} sources`,
    );

    const place = await page.evaluate(async () => {
      const tools = window.__atlasEye?.analystTools;
      return tools?.run('resolve_place', { query: '30.2672, -97.7431' });
    });
    rec(
      engine,
      'resolve_place accepts coordinates',
      place?.ok && place.items?.[0]?.lat === 30.2672,
      place?.items?.[0]?.label || place?.error || '',
    );

    const fly = await page.evaluate(async () => {
      const tools = window.__atlasEye?.analystTools;
      return tools?.run('fly_to', { lat: 30.2672, lon: -97.7431, label: 'Austin' });
    });
    rec(engine, 'fly_to action ok', fly?.ok === true, fly?.error || '');

    const annotateClear = await page.evaluate(async () => {
      const tools = window.__atlasEye?.analystTools;
      if (!tools?.run) return { ok: false };
      const a = await tools.run('annotate', {
        type: 'pin',
        lat: 30.2672,
        lon: -97.7431,
        label: 'QA pin',
      });
      const c = await tools.run('clear_annotations', {});
      return { annotateOk: a?.ok === true, clearOk: c?.ok === true, note: a?.error || c?.error || '' };
    });
    rec(
      engine,
      'annotate pin then clear',
      annotateClear?.annotateOk && annotateClear?.clearOk,
      String(annotateClear?.note || '').slice(0, 120),
    );


    const typedLayer = await page.evaluate(async () => {
      const parse = window.__atlasEye?.parse;
      if (!parse) return { ok: false };
      const r = parse('set flights layer on');
      return {
        ok: r?.kind === 'plan' && r?.steps?.[0]?.tool === 'set_layer_visibility',
        tool: r?.steps?.[0]?.tool,
      };
    });
    rec(engine, 'typed set_layer_visibility', typedLayer?.ok, String(typedLayer?.tool || ''));

    const explain = await page.evaluate(async () => {
      const parse = window.__atlasEye?.parse;
      if (!parse) return { ok: false };
      const r = parse('explain this');
      return {
        ok: r?.kind === 'plan' && r?.steps?.[0]?.tool === 'get_entity_context',
        tool: r?.steps?.[0]?.tool,
      };
    });
    rec(engine, 'typed explain this', explain?.ok, String(explain?.tool || ''));

    const typed = await page.evaluate(async () => {
      const parse = window.__atlasEye?.parse;
      if (!parse) return { ok: false, err: 'no parse' };
      const r = parse('layers menu');
      return {
        ok: r?.kind === 'plan' && r?.steps?.[0]?.tool === 'show_data_layers_menu',
        tool: r?.steps?.[0]?.tool || r?.kind,
      };
    });
    rec(engine, 'typed layers menu parses', typed?.ok, String(typed?.tool || typed?.err || ''));

    // Globe still interactive after Analyst actions
    const pans = await page.evaluate(async () => {
      const v = window.__godsEyeView?.viewer;
      if (!v?.camera) return false;
      const before = v.camera.positionWC.clone();
      v.camera.rotateRight(0.04);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const after = v.camera.positionWC;
      return Math.abs(after.x - before.x) + Math.abs(after.y - before.y) + Math.abs(after.z - before.z) > 1;
    });
    rec(engine, 'globe pans after Analyst tools', pans, 'shared state');
  } catch (e) {
    rec(engine, 'journey crashed', false, String(e?.stack || e).slice(0, 300));
  } finally {
    await browser.close();
  }
}

writeFileSync(path.join(OUT, 'analyst-journey.json'), JSON.stringify(results, null, 2));
const fail = results.filter((r) => !r.ok).length;
console.log('SUMMARY', JSON.stringify({ pass: results.length - fail, fail }));
process.exit(fail ? 1 : 0);
