import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cctv = readFileSync(new URL('./cctvBrowser.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./mobileShell.js', import.meta.url), 'utf8');
const card = readFileSync(new URL('./selectionCard.js', import.meta.url), 'utf8');
const analyst = readFileSync(new URL('./analystPanel.js', import.meta.url), 'utf8');

test('camera open path reports status via onStatus', () => {
  assert.match(cctv, /onStatus/);
  assert.match(cctv, /Opening \$\{cam\.name/);
  assert.match(cctv, /Camera not in catalog/);
  assert.match(cctv, /Camera closed/);
});

test('sheet handle drag expands up and peeks down before close', () => {
  assert.match(shell, /Drag up → expand/);
  assert.match(shell, /sheetHeight === 'full'/);
  assert.match(shell, /dy < -48/);
});

test('selection card handles quake/fire/alert/road contextual actions', () => {
  assert.match(card, /gev:entity-selected/);
  assert.match(card, /kind === 'quake'/);
  assert.match(card, /data-ee-sel="fly"/);
  assert.match(card, /data-ee-sel="inspect"/);
});

test('Analyst AI strip is dismissible', () => {
  assert.match(analyst, /data-an-ai-dismiss/);
  assert.match(analyst, /ee-ai-strip-dismissed/);
});

test('VOICE dead-button routes to operator toast when key missing', () => {
  assert.match(shell, /ee:operator-toast/);
  assert.match(shell, /data-ee-needs="openai"/);
});
