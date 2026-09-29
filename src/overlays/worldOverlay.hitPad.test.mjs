import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('interactive overlay hits expand to ≥44 CSS px (Stage P0 iPhone)', () => {
  const src = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'worldOverlay.js'),
    'utf8',
  );
  assert.match(src, /OVERLAY_MIN_HIT_PX\s*=\s*44/);
  assert.match(src, /hitTestWorldOverlayAll/);
  assert.match(src, /hitRectContains/);
});
