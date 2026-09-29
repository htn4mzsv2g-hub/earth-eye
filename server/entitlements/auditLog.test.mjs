import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendAuditEvent,
  readAuditEvents,
  sanitizeAuditDetails,
  clientTag,
} from './auditLog.js';

test('sanitize redacts secret-shaped keys', () => {
  const s = sanitizeAuditDetails({
    password: 'hunter2',
    apiKey: 'sk-live',
    id: 'ws-1',
    note: 'ok',
  });
  assert.equal(s.password, '[redacted]');
  assert.equal(s.apiKey, '[redacted]');
  assert.equal(s.id, 'ws-1');
  assert.equal(s.note, 'ok');
});

test('append and read audit events without inventing rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ee-audit-'));
  assert.deepEqual(readAuditEvents({ dir }).events, []);
  appendAuditEvent('workspace.save', { id: 'a', password: 'nope' }, { dir });
  appendAuditEvent('auth.login.ok', { client: clientTag('1.2.3.4') }, { dir });
  const got = readAuditEvents({ dir, limit: 10 });
  assert.equal(got.ok, true);
  assert.equal(got.count, 2);
  assert.equal(got.events[0].action, 'auth.login.ok');
  assert.equal(got.events[1].action, 'workspace.save');
  assert.equal(got.events[1].details.password, '[redacted]');
  assert.equal(got.events[1].details.id, 'a');
});

test('clientTag is stable and non-empty', () => {
  assert.equal(clientTag('10.0.0.1'), clientTag('10.0.0.1'));
  assert.notEqual(clientTag('10.0.0.1'), clientTag('10.0.0.2'));
  assert.match(clientTag('x'), /^[a-f0-9]{12}$/);
});
