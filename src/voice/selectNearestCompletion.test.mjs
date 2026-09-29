import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

test('select_nearest_aircraft does not wait for camera settle (Stage 3.3)', () => {
  const src = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'gevActions.js'),
    'utf8',
  );
  const start = src.indexOf("if (name === 'select_nearest_aircraft')");
  assert.ok(start > 0);
  const next = src.indexOf("\n    if (name === '", start + 10);
  const chunk = src.slice(start, next > start ? next : start + 12000);
  assert.match(chunk, /waitForArrival:\s*false/);
  assert.doesNotMatch(chunk, /waitForArrival:\s*true/);
  assert.match(chunk, /complete:\s*true/);
  assert.match(chunk, /waitForCamera:\s*false/);
});
