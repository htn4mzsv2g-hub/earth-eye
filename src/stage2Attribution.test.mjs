// Stage 2: attribution panel, 3D-model CC BY credits, military colour from
// source data, and accurate outbound User-Agent strings. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_CREDITS } from './atlas/assetCredits.js';
import { attributionRows, renderLicenses } from './atlas/licensesPanel.js';
import { DATA_SOURCES, SERVICE_SOURCES } from './atlas/dataSourceRegistry.js';
import {
  readsbMilitaryProvenance,
  readsbIdentities,
} from './sources/live/aircraft.js';
import {
  militaryIconColor,
  MIL_ICON_COLOR,
  UNVERIFIED_ICON_COLOR,
  TRAIL_COLOR,
  MILITARY_GREEN_CSS,
} from './layers/military/policy.js';
import { MIL_TINT } from './layers/flights/policy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readmeModels() {
  const md = await fs.readFile(
    path.join(ROOT, 'public/models/README.md'),
    'utf8',
  );
  const rows = [];
  for (const line of md.split('\n')) {
    const m = line.match(
      /^\| `([^`]+\.glb)` \| “(.+?)” by \[(.+?)\]\((.+?)\) \| \[Sketchfab model\]\((.+?)\) \| \[(.+?)\]\((.+?)\) \|/,
    );
    if (m)
      rows.push({
        file: m[1],
        title: m[2],
        author: m[3],
        authorUrl: m[4],
        sourceUrl: m[5],
        license: m[6],
        licenseUrl: m[7],
      });
  }
  return rows;
}

test('the 9 bundled 3D models carry the exact CC BY credits from public/models/README.md', async () => {
  const expected = await readmeModels();
  assert.equal(expected.length, 9, 'README lists 9 models');
  assert.equal(MODEL_CREDITS.length, 9);
  for (const want of expected) {
    const got = MODEL_CREDITS.find((m) => m.file === want.file);
    assert.ok(got, want.file);
    for (const k of Object.keys(want))
      assert.equal(got[k], want[k], `${want.file} ${k}`);
    assert.equal(got.modified, true);
    assert.ok(got.modification);
  }
  const shipped = (await fs.readdir(path.join(ROOT, 'public/models'))).filter(
    (f) => f.endsWith('.glb'),
  );
  for (const f of shipped)
    assert.ok(
      MODEL_CREDITS.some((m) => m.file === f),
      `${f} credited`,
    );
});

test('licences panel draws every model, registry layer and service source', () => {
  const packs = [
    {
      pack: 'caltrans',
      provider: 'Caltrans',
      status: 'APPROVED',
      license: 'Caltrans terms',
      commercialUse: 'allowed',
      reviewedAt: '2026-09-28',
    },
    {
      pack: 'alertcalifornia',
      provider: 'ALERTCalifornia',
      status: 'NOT IMPLEMENTED',
      license: 'CC BY-NC',
      commercialUse: 'non-commercial',
      reviewedAt: '2026-09-28',
    },
  ];
  const rows = attributionRows({ cctvPacks: packs });
  const ids = new Set(rows.map((r) => r.id));
  for (const m of MODEL_CREDITS) assert.ok(ids.has(`model:${m.file}`));
  for (const id of Object.keys(DATA_SOURCES))
    assert.ok(ids.has(`layer:${id}`), id);
  for (const s of SERVICE_SOURCES) assert.ok(ids.has(`service:${s.id}`), s.id);
  assert.ok(ids.has('cctv:alertcalifornia'));
  for (const r of rows) {
    assert.ok(r.attribution, `${r.id} attribution`);
    assert.ok(r.license, `${r.id} licence`);
  }
  const layer = rows.find((r) => r.id === 'layer:bhote-koshi-locator');
  assert.equal(layer.license, 'CC BY-NC 4.0');
  assert.equal(
    layer.attribution,
    DATA_SOURCES['bhote-koshi-locator'].attribution,
  );

  const body = { innerHTML: '' };
  renderLicenses({ body, state: { query: '' }, cctvPacks: packs });
  assert.match(body.innerHTML, /zairiq-123/);
  assert.match(body.innerHTML, /Oyan3D/);
  assert.match(body.innerHTML, /CC BY-NC-SA 3\.0/);
  assert.match(body.innerHTML, /NON-COMMERCIAL/);
  assert.match(body.innerHTML, /data-commercial-safe>OFF/);
  const filtered = { innerHTML: '' };
  renderLicenses({
    body: filtered,
    state: { query: 'nobilis' },
    cctvPacks: packs,
  });
  assert.match(filtered.innerHTML, /Boeing 787-9/);
  assert.doesNotMatch(filtered.innerHTML, /zairiq-123/);
});

test('military colour follows the source flag, not a hard-coded amber', () => {
  assert.deepEqual(readsbMilitaryProvenance({ dbFlags: 1 }).militaryFlag, true);
  assert.deepEqual(readsbMilitaryProvenance({ dbFlags: 9 }).militaryFlag, true);
  assert.equal(readsbMilitaryProvenance({ dbFlags: 8 }).militaryFlag, false);
  const listed = readsbMilitaryProvenance({});
  assert.equal(listed.militaryFlag, null);
  assert.match(listed.militaryProvenance, /\/v2\/mil/);
  assert.equal(militaryIconColor({ militaryFlag: true }), MIL_ICON_COLOR);
  assert.equal(militaryIconColor({ militaryFlag: null }), MIL_ICON_COLOR);
  assert.equal(
    militaryIconColor({ militaryFlag: false }),
    UNVERIFIED_ICON_COLOR,
  );
  assert.equal(TRAIL_COLOR, MILITARY_GREEN_CSS);
  const amber = [1, 0.749, 0]; // #FFBF00-ish legacy amber
  for (const c of [MIL_ICON_COLOR, MIL_TINT])
    assert.ok(
      !(
        Math.abs(c.red - amber[0]) < 0.05 &&
        Math.abs(c.green - amber[1]) < 0.1 &&
        c.blue < 0.1
      ),
      'not amber',
    );
  // A row the provider says is NOT military is not drawn as military.
  const ids = readsbIdentities({
    ac: [
      { hex: 'ae1234', dbFlags: 1 },
      { hex: 'a00001', dbFlags: 0 },
      { hex: 'ae5678' },
    ],
  });
  const hexes = JSON.stringify(ids);
  assert.match(hexes, /ae1234/);
  assert.match(hexes, /ae5678/);
  assert.doesNotMatch(hexes, /a00001/);
});

test('outbound User-Agents describe a private hosted instance, never "personal local instance"', async () => {
  const hits = [];
  const uaFiles = [];
  async function walk(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', 'dist', '.git'].includes(e.name)) await walk(p);
      } else if (/\.(m?js)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) {
        const text = await fs.readFile(p, 'utf8');
        if (/personal local instance/i.test(text)) hits.push(p);
        if (/private hosted instance/.test(text)) uaFiles.push({ p, text });
      }
    }
  }
  await walk(path.join(ROOT, 'server'));
  await walk(path.join(ROOT, 'src'));
  assert.deepEqual(hits, []);
  assert.ok(uaFiles.length >= 6);
  for (const { p, text } of uaFiles)
    for (const m of text.matchAll(/private hosted instance[^'"`]*/g))
      assert.match(m[0], /\+https:\/\/eartheye\.us/, p);
});
