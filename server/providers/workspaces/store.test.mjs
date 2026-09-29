import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  saveWorkspace,
  listWorkspaces,
  getWorkspace,
  deleteWorkspace,
} from './store.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ee-ws-'));
}

test('save/list/get/delete workspace without inventing observations', () => {
  const dir = tmpDir();
  const saved = saveWorkspace(dir, {
    name: 'Austin quake watch',
    layers: ['earthquakes', 'cctv', 'flights', '../evil'],
    camera: { latitude: 30.27, longitude: -97.74, height: 2e6 },
    notes: 'Owner bookmark only',
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.workspace.retainsObservations, false);
  assert.deepEqual(saved.workspace.layers.sort(), ['cctv', 'earthquakes', 'flights']);
  const listed = listWorkspaces(dir);
  assert.equal(listed.workspaces.length, 1);
  const got = getWorkspace(dir, saved.workspace.id);
  assert.equal(got.ok, true);
  assert.equal(got.workspace.camera.latitude, 30.27);
  assert.equal(deleteWorkspace(dir, saved.workspace.id).ok, true);
  assert.equal(listWorkspaces(dir).workspaces.length, 0);
});

test('refuses camera without coordinates', () => {
  const dir = tmpDir();
  const saved = saveWorkspace(dir, {
    name: 'bad cam',
    camera: { height: 1000 },
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.workspace.camera, null);
});
