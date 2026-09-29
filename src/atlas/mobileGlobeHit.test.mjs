import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyAttempt } from '../app/globeGestureTrace.js';

const mobile = readFileSync(new URL('./mobile.css', import.meta.url), 'utf8');
const foundation = readFileSync(
  new URL('../ui/styles/foundation.css', import.meta.url),
  'utf8',
);
const host = readFileSync(
  new URL('../overlays/worldOverlay.js', import.meta.url),
  'utf8',
);

test('compact canvas restore leaves paint surfaces out of hit testing', () => {
  assert.match(
    mobile,
    /html\.ee-compact:not\(\[data-ee-overlay\]\) #cesiumContainer canvas \{[^}]*pointer-events:\s*auto\s*!important/,
    'the WebGL canvas still accepts gestures when no sheet is open',
  );
  const exemption = mobile.match(
    /html\.ee-compact #cesiumContainer canvas#world-overlay-detection-surface[\s\S]*?\{([^}]*)\}/,
  );
  assert.ok(exemption, 'the detection surface must be exempt from that restore');
  assert.match(exemption[1], /pointer-events:\s*none\s*!important/);
  assert.match(exemption[0], /canvas#scope-mask/);
  assert.match(exemption[0], /#celestial-ring-overlay canvas/);
  assert.match(exemption[0], /canvas\[data-gev-wind\]/);
  assert.match(foundation, /#world-overlay-detection-surface\s*\{[^}]*z-index:\s*5/);
  assert.match(foundation, /pointer-events:\s*none/);
});

test('the detection host paints with an inline pointer-events none', () => {
  assert.match(
    host,
    /setProperty\(\s*'pointer-events',\s*'none',\s*'important'\s*\)/,
  );
  assert.match(host, /keepOverlayOutOfHitTesting\(_detectionSurface\)/);
  assert.match(host, /keepOverlayOutOfHitTesting\(_canvas\)/);
});

test('a touch on the detection surface is class A, not a canvas gesture', () => {
  const verdict = classifyAttempt({
    events: [
      {
        type: 'pointerdown',
        target: 'canvas#world-overlay-detection-surface',
        reachedCanvas: false,
      },
    ],
    cameraMoved: false,
    frameAdvanced: true,
  });
  assert.equal(verdict.code, 'A');
  assert.match(verdict.reason, /world-overlay-detection-surface/);
});
