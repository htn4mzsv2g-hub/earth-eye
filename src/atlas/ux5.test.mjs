import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./mobile.css', import.meta.url), 'utf8');
const cardSrc = readFileSync(new URL('./selectionCard.js', import.meta.url), 'utf8');

test('UX-5: viewport-fit=cover enables safe-area for standalone PWA', () => {
  assert.match(index, /viewport-fit=cover/);
  assert.match(index, /apple-mobile-web-app-capable/);
  assert.match(index, /black-translucent/);
});

test('UX-5: compact chrome locks text-size-adjust; selection card uses safe insets', () => {
  assert.match(css, /text-size-adjust:\s*100%/);
  assert.match(css, /#ee-selection-card[\s\S]*safe-area-inset-left/);
  assert.match(css, /#ee-selection-card[\s\S]*safe-area-inset-right/);
});

test('UX-5: road/other get DETAILS; clear/cockpit-exit/open-cam feedback', () => {
  assert.match(cardSrc, /kind === 'road' \|\| kind === 'other'/);
  assert.match(cardSrc, /Selection cleared/);
  assert.match(cardSrc, /Cockpit exited/);
  assert.match(cardSrc, /Camera unavailable/);
  assert.match(cardSrc, /Road conditions — not for navigation/);
});
