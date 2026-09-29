/**
 * Google Photorealistic 3D Map Tiles — client usage governor (Path A).
 *
 * Cesium talks to Google directly with the browser key; this module counts
 * approximate tile-load events and enforces soft/hard caps so a forgotten
 * tab cannot burn the owner's Map Tiles quota.
 *
 * When Photoreal is OFF (no tileset), everything is a no-op.
 * Hard stop code: NEEDS_QUOTA — caller must fall back to Esri and toast.
 */

export const GOOGLE_PHOTOREAL_CREDIT_HTML =
  '<a href="https://www.google.com/maps" target="_blank" rel="noopener">Google</a> · Map data © Google';

/** Default soft daily tile-load events (conservative starter). */
export const DEFAULT_DAILY_SOFT = 2500;
/** Default hard daily cap. */
export const DEFAULT_DAILY_HARD = 4000;
/** Default soft monthly. */
export const DEFAULT_MONTHLY_SOFT = 40000;
/** Default hard monthly. */
export const DEFAULT_MONTHLY_HARD = 60000;

const STORAGE_KEY = 'ee.googlePhotoreal.quota.v1';

export function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function utcMonthKey(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

/**
 * @param {object} [overrides]
 */
export function resolveQuotaLimits(overrides = {}) {
  const num = (v, fallback) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return Object.freeze({
    dailySoft: num(overrides.dailySoft, DEFAULT_DAILY_SOFT),
    dailyHard: num(overrides.dailyHard, DEFAULT_DAILY_HARD),
    monthlySoft: num(overrides.monthlySoft, DEFAULT_MONTHLY_SOFT),
    monthlyHard: num(overrides.monthlyHard, DEFAULT_MONTHLY_HARD),
  });
}

/**
 * @param {object|null} raw
 * @param {string} day
 * @param {string} month
 */
export function normalizeQuotaState(raw, day = utcDayKey(), month = utcMonthKey()) {
  const base = {
    day,
    month,
    dayCount: 0,
    monthCount: 0,
    sessions: 0,
    stopped: false,
    stopReason: null,
  };
  if (!raw || typeof raw !== 'object') return { ...base };
  const sameDay = raw.day === day;
  const sameMonth = raw.month === month;
  return {
    day,
    month,
    dayCount: sameDay && Number.isFinite(raw.dayCount) ? raw.dayCount : 0,
    monthCount:
      sameMonth && Number.isFinite(raw.monthCount) ? raw.monthCount : 0,
    sessions: sameDay && Number.isFinite(raw.sessions) ? raw.sessions : 0,
    stopped: Boolean(raw.stopped) && sameDay,
    stopReason: raw.stopped && sameDay ? raw.stopReason || 'NEEDS_QUOTA' : null,
  };
}

/**
 * @param {ReturnType<typeof normalizeQuotaState>} state
 * @param {ReturnType<typeof resolveQuotaLimits>} limits
 */
export function evaluateQuota(state, limits) {
  const dayPct = state.dayCount / limits.dailyHard;
  const monthPct = state.monthCount / limits.monthlyHard;
  let level = 'ok';
  let code = null;
  let message = null;
  if (
    state.stopped ||
    state.dayCount >= limits.dailyHard ||
    state.monthCount >= limits.monthlyHard
  ) {
    level = 'hard';
    code = 'NEEDS_QUOTA';
    message =
      'Google Photorealistic 3D budget reached (NEEDS_QUOTA). Showing Esri satellite. Raise Console quotas or wait for reset — see Keys / Photoreal status.';
  } else if (
    state.dayCount >= limits.dailySoft ||
    state.monthCount >= limits.monthlySoft
  ) {
    level = 'soft';
    code = 'BUDGET_WARN';
    message =
      'Google Photoreal approaching Map Tiles budget — consider pausing flyovers or lowering Console daily cap alerts.';
  }
  return Object.freeze({
    level,
    code,
    message,
    dayCount: state.dayCount,
    monthCount: state.monthCount,
    sessions: state.sessions,
    limits,
    day: state.day,
    month: state.month,
    stopped: level === 'hard',
  });
}

function readStorage(storage) {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(storage, state) {
  try {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode */
  }
}

/**
 * Attach a tile-load governor to a live Google Photoreal tileset.
 * @param {object} options
 * @param {object} options.tileset Cesium3DTileset
 * @param {(html:string,tone?:string)=>void} [options.say] toast
 * @param {()=>void} [options.onHardStop] switch to Esri etc.
 * @param {Storage} [options.storage]
 * @param {object} [options.limits]
 * @param {(snap:object)=>void} [options.onReport] optional POST reporter
 */
export function attachGooglePhotorealQuotaGovernor({
  tileset,
  say = () => {},
  onHardStop = () => {},
  storage = globalThis.localStorage,
  limits: limitOverrides = {},
  onReport = null,
} = {}) {
  if (!tileset) {
    return {
      active: false,
      snapshot: () =>
        evaluateQuota(
          normalizeQuotaState(null),
          resolveQuotaLimits(limitOverrides),
        ),
      destroy() {},
    };
  }

  const limits = resolveQuotaLimits(limitOverrides);
  let state = normalizeQuotaState(readStorage(storage));
  let softWarned = false;
  let destroyed = false;

  const emit = () => {
    const snap = evaluateQuota(state, limits);
    onReport?.(snap);
    return snap;
  };

  // Count a session start once per governor attach (one Photoreal boot).
  state = {
    ...state,
    sessions: state.sessions + 1,
  };
  writeStorage(storage, state);

  const onTileLoad = () => {
    if (destroyed) return;
    state = normalizeQuotaState(state);
    state = {
      ...state,
      dayCount: state.dayCount + 1,
      monthCount: state.monthCount + 1,
    };
    const snap = emit();
    writeStorage(storage, {
      ...state,
      stopped: snap.stopped,
      stopReason: snap.code,
    });
    if (snap.level === 'soft' && !softWarned) {
      softWarned = true;
      say(snap.message, 'warn');
    }
    if (snap.level === 'hard') {
      say(snap.message, 'bad');
      try {
        tileset.show = false;
      } catch {
        /* */
      }
      onHardStop(snap);
    }
  };

  tileset.tileLoad?.addEventListener?.(onTileLoad);

  // Initial soft check if already over from prior session today.
  {
    const snap = emit();
    if (snap.level === 'hard') {
      say(snap.message, 'bad');
      try {
        tileset.show = false;
      } catch {
        /* */
      }
      onHardStop(snap);
    } else if (snap.level === 'soft') {
      softWarned = true;
      say(snap.message, 'warn');
    }
  }

  return {
    active: true,
    snapshot: () => evaluateQuota(normalizeQuotaState(state), limits),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      tileset.tileLoad?.removeEventListener?.(onTileLoad);
    },
  };
}
