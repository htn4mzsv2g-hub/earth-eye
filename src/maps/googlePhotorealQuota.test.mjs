import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveQuotaLimits,
  normalizeQuotaState,
  evaluateQuota,
  attachGooglePhotorealQuotaGovernor,
  DEFAULT_DAILY_HARD,
  GOOGLE_PHOTOREAL_CREDIT_HTML,
} from './googlePhotorealQuota.js';
import { googlePhotorealHealthPayload } from '../../server/providers/googlePhotorealHealth.js';

test('quota defaults are conservative soft/hard caps', () => {
  const lim = resolveQuotaLimits();
  assert.equal(lim.dailyHard, DEFAULT_DAILY_HARD);
  assert.ok(lim.dailySoft < lim.dailyHard);
  assert.ok(lim.monthlySoft < lim.monthlyHard);
});

test('evaluateQuota hard-stops with NEEDS_QUOTA', () => {
  const lim = resolveQuotaLimits({ dailyHard: 10, dailySoft: 5 });
  const snap = evaluateQuota(
    normalizeQuotaState({ day: '2099-01-01', dayCount: 10, monthCount: 10, month: '2099-01' }, '2099-01-01', '2099-01'),
    lim,
  );
  assert.equal(snap.code, 'NEEDS_QUOTA');
  assert.equal(snap.stopped, true);
});

test('governor no-ops without tileset', () => {
  const g = attachGooglePhotorealQuotaGovernor({ tileset: null });
  assert.equal(g.active, false);
  g.destroy();
});

test('governor counts tileLoad and hard-stops', () => {
  const listeners = new Map();
  const tileset = {
    show: true,
    tileLoad: {
      addEventListener(fn) {
        listeners.set('tileLoad', fn);
      },
      removeEventListener() {
        listeners.delete('tileLoad');
      },
    },
  };
  const store = {
    _d: null,
    getItem() {
      return this._d;
    },
    setItem(_, v) {
      this._d = v;
    },
  };
  const toasts = [];
  let stopped = 0;
  const g = attachGooglePhotorealQuotaGovernor({
    tileset,
    storage: store,
    limits: { dailySoft: 2, dailyHard: 3, monthlySoft: 100, monthlyHard: 200 },
    say: (m, t) => toasts.push([m, t]),
    onHardStop: () => {
      stopped++;
    },
  });
  listeners.get('tileLoad')();
  listeners.get('tileLoad')();
  assert.ok(toasts.some((x) => x[1] === 'warn'));
  listeners.get('tileLoad')();
  assert.equal(stopped, 1);
  assert.equal(tileset.show, false);
  assert.ok(toasts.some((x) => String(x[0]).includes('NEEDS_QUOTA')));
  g.destroy();
});

test('health payload NEEDS_KEY when no env keys', () => {
  const p = googlePhotorealHealthPayload(null, {});
  assert.equal(p.health, 'NEEDS_KEY');
  assert.equal(p.code, 'NEEDS_KEY');
  assert.equal(p.fallbackStack, 'esri-imagery');
});

test('health payload READY_DIRECT when Google key set', () => {
  const p = googlePhotorealHealthPayload(null, {
    GOOGLE_MAPS_API_KEY: 'AIza-test',
  });
  assert.equal(p.health, 'READY_DIRECT');
});

test('Google attribution HTML is required and links Google', () => {
  assert.match(GOOGLE_PHOTOREAL_CREDIT_HTML, /Google/);
  assert.match(GOOGLE_PHOTOREAL_CREDIT_HTML, /google\.com\/maps/);
});
