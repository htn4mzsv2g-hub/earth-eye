#!/usr/bin/env node
/**
 * Earth Eye Stage 2 browser QA: excluded features, licences panel, source
 * health (with forced failures) and commercial-safe mode, against a real
 * production build (local `node server/prod.mjs` or the live site).
 *
 *   BASE=http://127.0.0.1:4173 ENGINES=chromium,webkit node scripts/qa-exclusions.mjs
 *   BASE=https://eartheye.us QA_LOGIN_USER=… QA_LOGIN_PASS=… node scripts/qa-exclusions.mjs
 *   PARTS=excl,licenses,health,stale,commercial   (commercial expects EE_COMMERCIAL_SAFE=1 on the server)
 *
 * Real desktop engines (1400×900), no device emulation. Credentials come
 * from the environment only and are never printed. Forced failures are
 * injected with Playwright request routing in the test browser only; nothing
 * on the server changes. Writes screenshots/stage2/report-<local|live>.json;
 * exits 1 on any failure.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PW =
  process.env.PLAYWRIGHT_MODULE ||
  '/workspace/.tools/pw/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(PW);
const BASE = (process.env.BASE || 'http://127.0.0.1:4173').replace(/\/$/, '');
const ENGINES = (process.env.ENGINES || 'chromium,webkit').split(',');
const PARTS = new Set(
  (process.env.PARTS || 'excl,licenses,health,stale').split(','),
);
const USER = process.env.QA_LOGIN_USER || '';
const PASS = process.env.QA_LOGIN_PASS || '';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const LIVE = BASE.startsWith('https://');
const OUT = path.resolve('screenshots/stage2');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function rec(engine, part, name, ok, detail = '') {
  results.push({
    engine,
    part,
    name,
    ok: Boolean(ok),
    detail: String(detail).slice(0, 400),
  });
  console.log(
    `${ok ? 'PASS' : 'FAIL'} [${engine}] ${part}: ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ''}`,
  );
}

async function login(page) {
  if (!USER || !PASS) return false;
  await page.goto(`${BASE}/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  if (!(await page.$('#username'))) return false;
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

async function boot(engine, { hash = '', routes = null } = {}) {
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
    viewport: { width: 1400, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message || e)));
  if (routes) await routes(page);
  if (LIVE) await login(page);
  await page.goto(`${BASE}/${hash}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForFunction(
    () => window.__atlasEye?.openPanel && window.__godsEyeView?.dataManager,
    null,
    { timeout: 120000 },
  );
  await sleep(3000);
  await page.evaluate(() =>
    document.querySelector('[data-atlas-action="ack"]')?.click(),
  );
  return { browser, context, page, errors };
}

const EXCLUDED = ['alpr-cameras', 'traffic', 'radio'];

async function partExclusions(engine) {
  const P = 'excluded';
  // Complete share-link hash (same shape the app authors) with l=etpr:
  // earthquakes (e) + traffic (t) + ALPR (p) + radio (r). Excluded tokens must
  // stay refused; earthquakes must restore.
  const SHARE =
    '#v=2&lat=30.2672&lon=-97.7431&alt=25000&heading=360&pitch=-90&roll=0&style=normal&bloom=0&sharpen=1&bi=0&bv=2&si=49&hud=tactical&hv=1&dm=DENSE&dd=75&da=elastic&kf=7&ko=1&cr=0&sc=1&scf=11&map=esri-imagery&l=e.t.p.r&lo=f.e.1_k.o.n&ui=c.c.1_c.p.0_l.c.1_l.p.0_d.c.1_v.c.1_i.c.0_r.c.1_s.c.1_g.c.1_p.c.1_m.c.0';
  const { browser, page, errors } = await boot(engine, { hash: SHARE });
  try {
    await page
      .waitForFunction(
        () => window.__godsEyeView.dataManager.isEnabled('earthquakes'),
        null,
        { timeout: 45000 },
      )
      .catch(() => {});
    const link = await page.evaluate((ids) => {
      const dm = window.__godsEyeView.dataManager;
      return {
        eq: dm.isEnabled('earthquakes'),
        on: ids.filter((id) => dm.isEnabled(id)),
        hash: location.hash.match(/[#&]l=([^&]*)/)?.[1] ?? null,
      };
    }, EXCLUDED);
    rec(
      engine,
      P,
      'share link l=e.t.p.r restores earthquakes but not traffic/ALPR/radio',
      link.eq && link.on.length === 0,
      JSON.stringify(link),
    );

    const rows = await page.evaluate(
      (ids) =>
        ids.filter((id) =>
          document.querySelector(`#data-toggles [data-layer-id="${id}"]`),
        ),
      EXCLUDED,
    );
    rec(
      engine,
      P,
      'no layer-panel control for ALPR, traffic or radio',
      rows.length === 0,
      rows.join(','),
    );

    const attempts = await page.evaluate(async (ids) => {
      const dm = window.__godsEyeView.dataManager;
      const out = {};
      for (const id of ids) {
        const a = await dm.setEnabled(id, true, { origin: 'user' });
        const b = await dm.toggle(id, { origin: 'user' });
        out[id] = { setEnabled: a, toggle: b, enabled: dm.isEnabled(id) };
      }
      return out;
    }, EXCLUDED);
    rec(
      engine,
      P,
      'setEnabled/toggle refused for every excluded layer',
      Object.values(attempts).every(
        (r) => r.setEnabled === false && r.toggle === false && !r.enabled,
      ),
      JSON.stringify(attempts),
    );

    const scenes = await page.evaluate(async () => {
      const d = window.__godsEyeView.sceneDirector;
      const ids = d.listScenes().map((s) => s.id);
      let started = null;
      try {
        const r = await Promise.race([
          d.startScene('city-overload'),
          new Promise((res) => setTimeout(() => res('timeout'), 3000)),
        ]);
        started = r?.started ?? r ?? null;
      } catch (e) {
        started = `threw: ${e?.message}`;
      }
      try {
        d.stopScene?.('qa');
      } catch {}
      return {
        ids,
        started,
        traffic: window.__godsEyeView.dataManager.isEnabled('traffic'),
      };
    });
    rec(
      engine,
      P,
      'Director has no traffic scenes (city-overload, omniscience-pullback) and cannot start them',
      !scenes.ids.includes('city-overload') &&
        !scenes.ids.includes('omniscience-pullback') &&
        scenes.ids.length > 0 &&
        !scenes.traffic,
      JSON.stringify({ n: scenes.ids.length, started: scenes.started }),
    );

    const cmds = {};
    for (const phrase of [
      'show traffic',
      'show radio',
      'show alpr',
      'show plate reader locations',
    ]) {
      await page.fill('#atlas-command-input', phrase);
      await page.press('#atlas-command-input', 'Enter');
      await sleep(800);
      cmds[phrase] = await page.evaluate(
        () =>
          document
            .querySelector('#atlas-command-output')
            ?.textContent?.trim() || '',
      );
    }
    const anyOn = await page.evaluate(
      (ids) => ids.some((id) => window.__godsEyeView.dataManager.isEnabled(id)),
      EXCLUDED,
    );
    rec(
      engine,
      P,
      'typed "show traffic/radio/alpr" does not enable anything',
      !anyOn && Object.values(cmds).every((t) => /not understood/i.test(t)),
      JSON.stringify(cmds),
    );

    const tr3b = await page.evaluate(() => ({
      button: Boolean(document.querySelector('#tr3b-toggle')),
      text: /TR-3B/i.test(document.body.innerText),
    }));
    rec(
      engine,
      P,
      'TR-3B control absent',
      !tr3b.button && !tr3b.text,
      JSON.stringify(tr3b),
    );

    const shinjuku = await page.evaluate(async () => {
      const r = await fetch('/config/cctv_sources.shinjuku.json', {
        cache: 'no-store',
      });
      const ct = r.headers.get('content-type') || '';
      return { status: r.status, json: ct.includes('json') };
    });
    rec(
      engine,
      P,
      'Shinjuku camera config not served',
      !shinjuku.json,
      JSON.stringify(shinjuku),
    );

    const radio = await page.evaluate(
      async () =>
        (await fetch('/api/radio/stations?q=news', { cache: 'no-store' }))
          .status,
    );
    rec(engine, P, '/api/radio refused (403)', radio === 403, radio);

    // Launch replay / reconstructed tracks.
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.setEnabled('rocket-launches', true, {
        origin: 'user',
      }),
    );
    let mission = null;
    try {
      await page.waitForFunction(
        () => document.querySelector('[data-mission-roster-index="0"]'),
        null,
        { timeout: 45000 },
      );
      await page.evaluate(() =>
        document.querySelector('[data-mission-roster-index="0"]').click(),
      );
      await sleep(2500);
      mission = await page.evaluate(() => {
        const btn = document.querySelector('[data-mission-replay]');
        const speed = document.querySelector('.mission-replay-speed-control');
        const vis = (el) =>
          Boolean(el && !el.hidden && el.getClientRects().length);
        const ents = window.__godsEyeView.viewer.dataSources;
        const ids = [];
        for (let i = 0; i < ents.length; i++)
          for (const e of ents.get(i).entities.values)
            if (/^rocket-/.test(e.id)) ids.push(e.id.split(':')[0]);
        return {
          replayVisible: vis(btn),
          speedVisible: vis(speed),
          kinds: [...new Set(ids)],
          ascent:
            document.querySelector('[data-mission-ascent-source]')
              ?.textContent || '',
        };
      });
    } catch (e) {
      mission = { error: String(e.message).slice(0, 120) };
    }
    rec(
      engine,
      P,
      'launch: no REPLAY ASCENT, no reconstructed trajectory/vehicle/transfer entities',
      mission &&
        !mission.error &&
        !mission.replayVisible &&
        !mission.speedVisible &&
        !mission.kinds.some((k) =>
          /rocket-(trajectory|vehicle|transfer|stage)/.test(k),
        ),
      JSON.stringify(mission),
    );
    rec(
      engine,
      P,
      'no page errors',
      errors.length === 0,
      errors.slice(0, 3).join(' | '),
    );
    await page.screenshot({
      path: path.join(OUT, `${LIVE ? 'live' : 'local'}-${engine}-excluded.png`),
    });
  } finally {
    await browser.close();
  }
}

async function partLicenses(engine) {
  const P = 'licenses';
  const { browser, page } = await boot(engine);
  try {
    const dock = await page.evaluate(() => {
      const b = document.querySelector('[data-atlas-open="credits"]');
      return b ? b.textContent.trim() : null;
    });
    rec(
      engine,
      P,
      'LICENSES entry exists in the app',
      /LICENSES/i.test(dock || ''),
      dock,
    );
    await page.evaluate(() => window.__atlasEye.openPanel('credits'));
    await page.waitForFunction(
      () => document.querySelectorAll('[data-lic-id]').length > 20,
      null,
      { timeout: 15000 },
    );
    await page
      .waitForFunction(
        () => !document.querySelector('[data-lic-cctv-pending]'),
        null,
        { timeout: 15000 },
      )
      .catch(() => {});
    const info = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[data-lic-id]')].map(
        (e) => e.dataset.licId,
      );
      const text =
        document.querySelector('.atlas-panel-body, #atlas-panel')?.innerText ||
        document.body.innerText;
      return {
        models: ids.filter((i) => i.startsWith('model:')).length,
        layers: ids.filter((i) => i.startsWith('layer:')).length,
        services: ids.filter((i) => i.startsWith('service:')).length,
        cctv: ids.filter((i) => i.startsWith('cctv:')).length,
        authors: [
          'zairiq-123',
          'Nick the Name',
          'Javier_Fernandez',
          'terran4627',
          'e737',
          'BlenderCommunityHead',
          'IProZenoN',
          'Nobilis 2',
          'Oyan3D',
        ].filter((a) => !text.includes(a)),
        ccby: (text.match(/CC BY 4\.0/g) || []).length,
        nc: /NON-COMMERCIAL/.test(text),
        cables: /CC BY-NC-SA 3\.0/.test(text),
        locator: /CC BY-NC 4\.0/.test(text),
        mode: document.querySelector('[data-commercial-safe]')?.textContent,
      };
    });
    rec(
      engine,
      P,
      '9 model credits with exact authors (CC BY 4.0)',
      info.models === 9 && info.authors.length === 0 && info.ccby >= 9,
      JSON.stringify(info),
    );
    rec(
      engine,
      P,
      'every registry layer + service + camera provider listed',
      info.layers >= 29 && info.services >= 15 && info.cctv >= 10,
      JSON.stringify({
        layers: info.layers,
        services: info.services,
        cctv: info.cctv,
      }),
    );
    rec(
      engine,
      P,
      'non-commercial flags (cables CC BY-NC-SA 3.0, Bhote Koshi CC BY-NC 4.0)',
      info.nc && info.cables && info.locator,
      '',
    );
    rec(
      engine,
      P,
      `commercial-safe line shows ${info.mode}`,
      ['ON', 'OFF'].includes(info.mode),
      info.mode,
    );
    await page.fill('[data-lic-filter]', 'oyan3d');
    await sleep(400);
    const filtered = await page.evaluate(
      () => document.querySelectorAll('[data-lic-id]').length,
    );
    rec(
      engine,
      P,
      'filter narrows the list (scalable)',
      filtered >= 1 && filtered < 5,
      filtered,
    );
    await page.screenshot({
      path: path.join(OUT, `${LIVE ? 'live' : 'local'}-${engine}-licenses.png`),
    });
  } finally {
    await browser.close();
  }
}

async function readHealth(page, id) {
  await page.evaluate(() => window.__atlasEye.openPanel('feeds'));
  await sleep(600);
  return page.evaluate((layerId) => {
    const li = document.querySelector(`[data-source-id="${layerId}"]`);
    const chip = document.querySelector(
      `#data-toggles [data-layer-id="${layerId}"] .ee-row-health`,
    );
    return {
      panel: li?.dataset.health || null,
      label: li?.querySelector('.ee-health')?.textContent || null,
      detail: li?.querySelector('[data-health-detail]')?.textContent || null,
      lastAttempt:
        li?.querySelector('[data-last-attempt]')?.textContent?.trim() || null,
      lastSuccess:
        li?.querySelector('[data-last-success]')?.textContent?.trim() || null,
      chip: chip?.textContent || null,
    };
  }, id);
}

async function waitHealth(page, id, want, timeout = 90000) {
  const t0 = Date.now();
  let h = null;
  while (Date.now() - t0 < timeout) {
    h = await readHealth(page, id);
    if (want.includes(h.panel)) return h;
    await sleep(3000);
  }
  return h;
}

async function partHealth(engine) {
  const P = 'health';
  // Baseline: panel shows the health legend, every row has a health state and the camera-provider section loads.
  {
    const { browser, page } = await boot(engine);
    try {
      await page.evaluate(() => window.__atlasEye.openPanel('feeds'));
      await page
        .waitForFunction(
          () =>
            document.querySelector(
              '[data-cctv-health="ready"], [data-cctv-health="error"]',
            ),
          null,
          { timeout: 60000 },
        )
        .catch(() => {});
      await sleep(1500);
      const base = await page.evaluate(() => ({
        legend: document.querySelector('[data-health-legend]')?.innerText || '',
        rows: document.querySelectorAll('[data-source-id]').length,
        withHealth: document.querySelectorAll('[data-source-id][data-health]')
          .length,
        cctv: document.querySelector('[data-cctv-health]')?.dataset.cctvHealth,
        ontario: document.querySelector('[data-cctv-pack="ontario"]')?.dataset
          .health,
        deldot: document.querySelector('[data-cctv-pack="deldot"]')?.dataset
          .health,
        traffic:
          document.querySelector('[data-source-id="traffic"] .ee-src-disabled')
            ?.textContent || '',
      }));
      rec(
        engine,
        P,
        'health legend lists all six states',
        [
          'ONLINE',
          'DEGRADED',
          'OFFLINE',
          'KEY REQUIRED',
          'RATE LIMITED',
          'STALE',
        ].every((s) => base.legend.includes(s)),
        base.legend.replace(/\s+/g, ' '),
      );
      rec(
        engine,
        P,
        'every Data Sources row carries a health state',
        base.rows > 25 && base.rows === base.withHealth,
        `${base.withHealth}/${base.rows}`,
      );
      rec(
        engine,
        P,
        'camera providers: Ontario KEY REQUIRED, DelDOT held',
        base.cctv === 'ready' &&
          base.ontario === 'key required' &&
          base.deldot === 'held',
        JSON.stringify(base),
      );
      await page.evaluate(() =>
        window.__godsEyeView.dataManager.setEnabled('earthquakes', true, {
          origin: 'user',
        }),
      );
      const ok = await waitHealth(page, 'earthquakes', ['online'], 45000);
      rec(
        engine,
        P,
        'real provider answering = ONLINE with last success + attempt times',
        ok.panel === 'online' &&
          ok.chip === 'ONLINE' &&
          ok.lastSuccess &&
          !/never/.test(ok.lastSuccess),
        JSON.stringify(ok),
      );
      await page.screenshot({
        path: path.join(
          OUT,
          `${LIVE ? 'live' : 'local'}-${engine}-health-online.png`,
        ),
      });
    } finally {
      await browser.close();
    }
  }
  const scenarios = [
    {
      name: 'network blocked (USGS) = OFFLINE',
      layer: 'earthquakes',
      want: ['offline'],
      route: (p) =>
        p.route(/earthquake\.usgs\.gov/, (r) =>
          r.abort('internetdisconnected'),
        ),
    },
    {
      name: 'HTTP 429 (adsb.lol military) = RATE LIMITED',
      layer: 'military',
      want: ['rate limited'],
      route: (p) =>
        p.route(/\/api\/adsblol\/mil/, (r) =>
          r.fulfill({
            status: 429,
            contentType: 'application/json',
            body: '{"error":"Too Many Requests"}',
          }),
        ),
    },
    {
      name: 'bad key HTTP 401 (USGS) = KEY REQUIRED',
      layer: 'earthquakes',
      want: ['key required'],
      route: (p) =>
        p.route(/earthquake\.usgs\.gov/, (r) =>
          r.fulfill({
            status: 401,
            contentType: 'application/json',
            body: '{"error":"Invalid API key"}',
          }),
        ),
    },
    {
      name: 'server 503 (cyclones) = OFFLINE',
      layer: 'weather-cyclones',
      want: ['offline'],
      route: (p) =>
        p.route(/\/api\/cyclones/, (r) =>
          r.fulfill({
            status: 503,
            contentType: 'application/json',
            body: '{"error":"upstream unavailable"}',
          }),
        ),
    },
  ];
  for (const s of scenarios) {
    const { browser, page } = await boot(engine, { routes: s.route });
    try {
      await page.evaluate(
        (id) =>
          window.__godsEyeView.dataManager.setEnabled(id, true, {
            origin: 'user',
          }),
        s.layer,
      );
      const h = await waitHealth(page, s.layer, s.want, 90000);
      rec(
        engine,
        P,
        `break: ${s.name}`,
        s.want.includes(h.panel) &&
          h.panel !== 'online' &&
          h.lastAttempt &&
          !/never/.test(h.lastAttempt),
        JSON.stringify(h),
      );
      rec(
        engine,
        P,
        `break: ${s.name} — not shown as idle/no activity`,
        h.panel &&
          !['off', 'connecting', 'online'].includes(h.panel) &&
          h.label &&
          h.label !== 'OFF',
        h.label,
      );
    } finally {
      await browser.close();
    }
  }
}

async function partStale(engine) {
  const P = 'health';
  let hang = false;
  const { browser, page } = await boot(engine, {
    routes: (p) =>
      p.route(/earthquake\.usgs\.gov/, (r) =>
        hang ? undefined : r.continue(),
      ),
  });
  try {
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.setEnabled('earthquakes', true, {
        origin: 'user',
      }),
    );
    const first = await waitHealth(page, 'earthquakes', ['online'], 45000);
    hang = true; // every later refresh hangs: no error, no fresh data
    const h = await waitHealth(
      page,
      'earthquakes',
      ['stale', 'degraded', 'offline'],
      240000,
    );
    rec(
      engine,
      P,
      'break: provider stops delivering (hung requests) = STALE after 3 polls',
      first.panel === 'online' && h.panel === 'stale' && h.chip === 'STALE',
      JSON.stringify(h),
    );
    await page.screenshot({
      path: path.join(
        OUT,
        `${LIVE ? 'live' : 'local'}-${engine}-health-stale.png`,
      ),
    });
  } finally {
    await browser.close();
  }
}

async function partCommercial(engine) {
  const P = 'commercial-safe';
  const { browser, page } = await boot(engine);
  try {
    const policy = await page.evaluate(async () =>
      (await fetch('/api/atlas/policy', { cache: 'no-store' })).json(),
    );
    rec(
      engine,
      P,
      'server reports commercial-safe ON',
      policy.commercialSafe === true,
      JSON.stringify(policy),
    );
    await sleep(1500);
    const r = await page.evaluate(async () => {
      const dm = window.__godsEyeView.dataManager;
      const out = {};
      for (const id of [
        'telegeography-submarine-cables',
        'bhote-koshi-locator',
        'flights',
        'weather-lightning',
        'earthquakes',
      ])
        out[id] =
          (await dm.setEnabled(id, true, { origin: 'user' })) !== false &&
          dm.isEnabled(id);
      return out;
    });
    rec(
      engine,
      P,
      'restricted datasets refused, unrestricted still work',
      !r['telegeography-submarine-cables'] &&
        !r['bhote-koshi-locator'] &&
        !r.flights &&
        !r['weather-lightning'] &&
        r.earthquakes,
      JSON.stringify(r),
    );
    const h = await readHealth(page, 'telegeography-submarine-cables');
    rec(
      engine,
      P,
      'Data Sources says why (OFF in commercial-safe mode)',
      /commercial-safe/i.test(h.detail || ''),
      h.detail,
    );
    await page.evaluate(() => window.__atlasEye.openPanel('credits'));
    await sleep(500);
    const mode = await page.evaluate(
      () => document.querySelector('[data-commercial-safe]')?.textContent,
    );
    rec(
      engine,
      P,
      'licences panel shows commercial-safe ON',
      mode === 'ON',
      mode,
    );
    const packs = await page.evaluate(
      async () =>
        (
          await (
            await fetch('/api/cctv/permissions', { cache: 'no-store' })
          ).json()
        ).packs,
    );
    const ncOn = packs
      .filter((p) => p.commercialUse !== 'allowed' && p.enabled)
      .map((p) => p.pack);
    rec(
      engine,
      P,
      'no non-commercial camera pack enabled',
      ncOn.length === 0,
      ncOn.join(','),
    );
  } finally {
    await browser.close();
  }
}

for (const engine of ENGINES) {
  const run = async (name, fn) => {
    try {
      await fn(engine);
    } catch (e) {
      rec(engine, name, 'part crashed', false, e?.stack || e);
    }
  };
  if (PARTS.has('excl')) await run('excluded', partExclusions);
  if (PARTS.has('licenses')) await run('licenses', partLicenses);
  if (PARTS.has('health')) await run('health', partHealth);
  if (PARTS.has('stale')) await run('stale', partStale);
  if (PARTS.has('commercial')) await run('commercial', partCommercial);
}
const summary = {};
for (const r of results) {
  summary[r.engine] ||= { pass: 0, fail: 0 };
  summary[r.engine][r.ok ? 'pass' : 'fail']++;
}
const file = path.join(
  OUT,
  `report-${LIVE ? 'live' : 'local'}${PARTS.has('commercial') ? '-commercial' : ''}.json`,
);
writeFileSync(
  file,
  JSON.stringify(
    { base: BASE, at: new Date().toISOString(), summary, results },
    null,
    2,
  ),
);
console.log('SUMMARY', JSON.stringify(summary));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
