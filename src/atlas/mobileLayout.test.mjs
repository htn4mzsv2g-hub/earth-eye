import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPACT_MEDIA_QUERY,
  MOBILE_MORE_SHEETS,
  MOBILE_SHEETS,
  MOBILE_TAB_SHEETS,
  SHEET_SWIPE_CLOSE_PX,
  findSheet,
  isCompactViewport,
  keyStatusSummary,
  nextSheet,
  shouldCloseOnSwipe,
} from './mobilePolicy.js';
import { ATLAS_PROVIDER_GROUPS } from './providerRegistry.mjs';
import { GEV_ACTION_SCHEMAS } from '../voice/actionSchemas.js';

const css = readFileSync(new URL('./mobile.css', import.meta.url), 'utf8');
const shell = readFileSync(
  new URL('./mobileShell.js', import.meta.url),
  'utf8',
);
const consoleJs = readFileSync(
  new URL('./console.js', import.meta.url),
  'utf8',
);

test('compact mode covers phones in portrait and landscape, never desktop', () => {
  for (const [w, h] of [
    [390, 844],
    [430, 932],
    [375, 667],
    [844, 390],
    [932, 430],
    [667, 375],
  ])
    assert.equal(isCompactViewport(w, h), true, `${w}×${h}`);
  for (const [w, h] of [
    [1440, 900],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [1920, 1080],
    [1366, 480],
  ])
    assert.equal(isCompactViewport(w, h), false, `${w}×${h}`);
  assert.equal(isCompactViewport(NaN, 800), false);
  assert.equal(isCompactViewport(0, 0), false);
  assert.match(COMPACT_MEDIA_QUERY, /max-width: 720px/);
  assert.match(
    COMPACT_MEDIA_QUERY,
    /max-height: 500px\) and \(max-width: 1000px/,
  );
});

test('the bottom tabs are Globe, Track, Cameras, Analyst (then MORE)', () => {
  assert.deepEqual(
    MOBILE_TAB_SHEETS.map((s) => s.id),
    ['globe', 'track', 'cctv', 'analyst'],
  );
  assert.deepEqual(
    MOBILE_TAB_SHEETS.map((s) => s.label),
    ['GLOBE', 'TRACK', 'CAMERAS', 'ANALYST'],
  );
  assert.deepEqual(
    MOBILE_MORE_SHEETS.map((s) => s.panelId),
    [
      'location-bar',
      'scene-panel',
      'pp-toggles',
      'global-context-panel',
      'control-panel',
      'cctv-panel',
      'gev-voice-control',
    ],
  );
  assert.equal(
    new Set(MOBILE_SHEETS.map((s) => s.id)).size,
    MOBILE_SHEETS.length,
  );
});

test('every collapsible sheet is opened through the upstream set_panel_open owner', () => {
  const schema = GEV_ACTION_SCHEMAS.find((t) => t.name === 'set_panel_open');
  const allowed = schema.parameters.properties.panelId.enum;
  for (const sheet of MOBILE_SHEETS.filter((s) => s.collapsible !== false))
    assert.ok(allowed.includes(sheet.panelId), sheet.panelId);
  assert.match(shell, /runAction\('set_panel_open'/);
});

test('one sheet at a time: tap to open, tap again to close, tap another to switch', () => {
  assert.equal(nextSheet(null, 'globe'), 'globe');
  assert.equal(nextSheet('globe', 'globe'), null);
  assert.equal(nextSheet('globe', 'cctv'), 'cctv');
  assert.equal(nextSheet('cctv', 'data-panel'), 'globe');
  assert.equal(nextSheet('cctv', 'nope'), null);
  assert.equal(nextSheet('cctv', null), null);
  assert.equal(findSheet('pp-toggles').id, 'display');
  assert.equal(findSheet('missing'), null);
});

test('drag-down closes past the threshold or on a quick flick', () => {
  assert.equal(shouldCloseOnSwipe(SHEET_SWIPE_CLOSE_PX), true);
  assert.equal(shouldCloseOnSwipe(SHEET_SWIPE_CLOSE_PX - 1), false);
  assert.equal(shouldCloseOnSwipe(30, 40), true);
  assert.equal(shouldCloseOnSwipe(30, 400), false);
  assert.equal(shouldCloseOnSwipe(10, 5), false);
  assert.equal(shouldCloseOnSwipe(-120, 50), false);
  assert.equal(shouldCloseOnSwipe(NaN), false);
});

test('key badge counts provider credentials only, never settings', () => {
  const secrets = ATLAS_PROVIDER_GROUPS.flatMap((g) => g.vars)
    .filter((v) => v.kind === 'secret')
    .map((v) => v.name);
  const total = new Set(secrets).size;
  const none = keyStatusSummary(
    secrets
      .map((name) => ({ name, set: false }))
      .concat([{ name: 'CCTV_TFL_VIDEO_CLIPS', set: true }]),
    ATLAS_PROVIDER_GROUPS,
  );
  assert.deepEqual(
    { set: none.set, total: none.total, label: none.label, tone: none.tone },
    { set: 0, total, label: `0/${total}`, tone: 'none' },
  );
  assert.match(none.ariaLabel, /keyless mode/);
  const some = keyStatusSummary(
    [{ name: 'CESIUM_ION_TOKEN', set: true }],
    ATLAS_PROVIDER_GROUPS,
  );
  assert.equal(some.label, `1/${total}`);
  assert.equal(some.tone, 'some');
  const all = keyStatusSummary(
    secrets.map((name) => ({ name, set: true })),
    ATLAS_PROVIDER_GROUPS,
  );
  assert.equal(all.tone, 'all');
  const unknown = keyStatusSummary(null, ATLAS_PROVIDER_GROUPS);
  assert.equal(unknown.known, false);
  assert.equal(unknown.label, `?/${total}`);
});

/** Top-level selectors of a stylesheet (outside @keyframes). */
function selectors(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let depth = 0;
  let buf = '';
  let inKeyframes = false;
  const stack = [];
  for (const ch of text) {
    if (ch === '{') {
      const head = buf.trim();
      if (head.startsWith('@'))
        stack.push(head.startsWith('@keyframes') ? 'kf' : 'at');
      else {
        inKeyframes = stack.includes('kf');
        if (!inKeyframes)
          out.push(
            ...head
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          );
        stack.push('rule');
      }
      depth += 1;
      buf = '';
    } else if (ch === '}') {
      stack.pop();
      depth -= 1;
      buf = '';
    } else if (ch === ';' && stack.at(-1) !== 'at' && stack.at(-1) !== 'kf') {
      buf = '';
    } else buf += ch;
  }
  return out;
}

test('desktop stays unchanged: every mobile rule is scoped under html.ee-compact', () => {
  const list = selectors(css);
  assert.ok(list.length > 50);
  const baseHidden = new Set([
    '#ee-tabbar',
    '#ee-sheet-bar',
    '#ee-key-status',
    '#ee-ask-toggle',
    '#ee-compass',
    '#atlas-dock .ee-compact-only',
    '#atlas-disclaimer .ee-disclaimer-short',
  ]);
  // Photoreal Google attribution chrome is shared (desktop + compact); allow
  // its unscoped / html:not(.ee-compact) placement rules.
  const sharedChrome = (s) =>
    s.includes('ee-google-attribution') || s.startsWith('html:not(.ee-compact)');
  const unscoped = list.filter(
    (s) =>
      !s.startsWith('html.ee-compact') &&
      !baseHidden.has(s) &&
      !sharedChrome(s),
  );
  assert.deepEqual(unscoped, []);
  // The only unscoped rule hides the new mobile-only elements.
  assert.match(css, /#ee-ask-toggle/);
  assert.match(css, /#ee-compass/);
  assert.match(css, /#ee-tabbar/);
  assert.match(css, /display: none;/);
});

test('phones hide the upstream rails, dock, top icons and HUD corners until asked', () => {
  for (const id of ['left-panel-stack', 'right-context-rail', 'command-dock'])
    assert.ok(css.includes(`html.ee-compact #${id}:not(.ee-sheet-host)`), id);
  for (const sel of [
    '#top-center-actions',
    '#atlas-honesty-chip',
    '#intel-hud .hud-corner',
    '#style-indicator',
  ])
    assert.ok(css.includes(`html.ee-compact ${sel}`), sel);
  assert.match(
    css,
    /\.ee-sheet-host > :not\(\.ee-sheet-active\) \{\s*display: none !important;/,
  );
});

test('touch targets on phones are at least 44px', () => {
  const blocks = [
    ['#ee-ask-toggle', /min-height: 36px/],
    ['#ee-compass button', /min-height: 44px/],
    ['#atlas-command-run', /min-height: 44px/],
    ['#ee-tabbar button', /min-height: 48px/],
    ['#ee-sheet-bar .ee-sheet-close', /width: 44px;\s*height: 44px/],
    ['#atlas-disclaimer button', /min-height: 44px/],
  ];
  for (const [sel, rule] of blocks) {
    const start = css.indexOf(`html.ee-compact ${sel} {`);
    assert.ok(start > -1, sel);
    assert.match(css.slice(start, css.indexOf('}', start)), rule, sel);
  }
  assert.match(
    css,
    /#cesium-credits a,[\s\S]*?padding: 16px 3px;\s*margin: -16px 0;/,
  );
});

test('required credits stay visible above whatever sheet is open', () => {
  assert.match(
    css,
    /#cesium-credits \{[^}]*bottom: calc\(var\(--ee-bar-h\) \+ var\(--ee-overlay-h, 0px\) \+ 16px\) !important/,
  );
  assert.match(shell, /--ee-overlay-h/);
});

test('the safety strip is compact on phones and its dismissal is remembered', () => {
  assert.match(consoleJs, /class="ee-disclaimer-short"/);
  assert.match(consoleJs, /class="ee-disclaimer-long"/);
  assert.match(consoleJs, /storage\?\.setItem\(DISCLAIMER_KEY, '1'\)/);
  assert.match(consoleJs, /if \(!acked\(\)\) root\.appendChild\(banner\)/);
  // Full text stays under Safety (MORE → SAFETY and DETAILS).
  assert.match(consoleJs, /No tracking of private individuals\.<\/b>/);
  assert.match(
    css,
    /#atlas-disclaimer \.ee-disclaimer-long \{\s*display: none;/,
  );
});

test('compact chrome: ASK toggle, compass, no always-on KEYS pill, grouped MORE', () => {
  assert.match(shell, /ee-ask-toggle/);
  assert.match(shell, /ee-compass/);
  assert.match(shell, /ee-more-groups/);
  assert.match(shell, /data-group="globe"/);
  assert.match(shell, /data-group="more"/);
  assert.match(shell, /<h3>GLOBE<\/h3>/);
  assert.match(shell, /<b>LOCATION<\/b>/);
  assert.match(shell, /<b>CONTEXT<\/b>/);
  assert.match(css, /ee-ask-open/);
  assert.match(css, /#ee-key-status \{[\s\S]*display: none !important/);
  assert.match(css, /grid-template-columns: repeat\(5, 1fr\)/);
});

test('sheet heights cycle peek → half → full', async () => {
  const { nextSheetHeight, SHEET_HEIGHTS } = await import('./mobilePolicy.js');
  assert.deepEqual(SHEET_HEIGHTS, ['peek', 'half', 'full']);
  assert.equal(nextSheetHeight('peek'), 'half');
  assert.equal(nextSheetHeight('half'), 'full');
  assert.equal(nextSheetHeight('full'), 'peek');
});
