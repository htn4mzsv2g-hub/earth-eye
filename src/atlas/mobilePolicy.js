/**
 * Earth Eye mobile console policy (pure data + functions, no DOM).
 *
 * On phones the globe is the main screen. Only the logo, the command bar, a
 * compact key-status badge and one bottom tab bar are visible by default;
 * every upstream panel opens as a slide-up bottom sheet, one at a time.
 * Desktop layouts never match the compact test and stay unchanged.
 */

/** Phones in portrait (≤720px wide) and landscape (≤500px tall, ≤1000px wide). */
export const COMPACT_MEDIA_QUERY =
  '(max-width: 720px), (max-height: 500px) and (max-width: 1000px)';

/**
 * Same test as COMPACT_MEDIA_QUERY, for callers without matchMedia.
 *
 * @param {number} width - CSS px.
 * @param {number} height - CSS px.
 * @returns {boolean}
 */
export function isCompactViewport(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
    return false;
  return w <= 720 || (h <= 500 && w <= 1000);
}

/**
 * Bottom tabs (canonical IA / EE-LIVE-2): GLOBE | TRACK | CAMERAS | ANALYST | MORE.
 * GLOBE opens the layers drawer (map/layers); LOCATION + CONTEXT are GLOBE-owned
 * surfaces reachable from MORE → GLOBE. TRACK is AIR/MIL/SEA/SPACE.
 * Place search lives under ASK EARTH EYE. MORE owns scenes/visual/display/
 * sources/provider health/keys/licenses/safety/account.
 */
export const MOBILE_TAB_SHEETS = Object.freeze([
  Object.freeze({
    id: 'globe',
    panelId: 'data-panel',
    label: 'GLOBE',
    title: 'Layers',
  }),
  Object.freeze({
    id: 'track',
    panelId: 'atlas-panel',
    label: 'TRACK',
    title: 'Track',
    atlasPanel: 'track',
    collapsible: false,
  }),
  Object.freeze({
    id: 'cctv',
    panelId: 'cctv-panel',
    label: 'CAMERAS',
    title: 'Cameras',
    atlasPanel: 'cctv',
  }),
  Object.freeze({
    id: 'analyst',
    panelId: 'atlas-panel',
    label: 'ANALYST',
    title: 'Analyst',
    atlasPanel: 'analyst',
    collapsible: false,
  }),
]);

/** Sheet height snaps (PEEK / HALF / FULL). Handle cycles; content scrolls. */
export const SHEET_HEIGHTS = Object.freeze(['peek', 'half', 'full']);
export function nextSheetHeight(current) {
  const i = SHEET_HEIGHTS.indexOf(current);
  return SHEET_HEIGHTS[(i + 1) % SHEET_HEIGHTS.length];
}

/** Everything else, reachable from the MORE menu as sheets. */
export const MOBILE_MORE_SHEETS = Object.freeze([
  Object.freeze({
    id: 'search',
    panelId: 'location-bar',
    label: 'LOCATION',
    title: 'Location',
  }),
  Object.freeze({
    id: 'scenes',
    panelId: 'scene-panel',
    label: 'SCENES',
    title: 'Scenes',
  }),
  Object.freeze({
    id: 'display',
    panelId: 'pp-toggles',
    label: 'DISPLAY',
    title: 'Display',
  }),
  Object.freeze({
    id: 'context',
    panelId: 'global-context-panel',
    label: 'CONTEXT',
    title: 'Context',
  }),
  Object.freeze({
    id: 'visual',
    panelId: 'control-panel',
    label: 'VISUAL',
    title: 'Visual presets',
  }),
  Object.freeze({
    id: 'cctv-layer',
    panelId: 'cctv-panel',
    label: 'CAM LAYER',
    title: 'Camera layer',
  }),
  Object.freeze({
    id: 'voice',
    panelId: 'gev-voice-control',
    label: 'VOICE',
    title: 'Voice',
    collapsible: false,
  }),
]);

export const MOBILE_SHEETS = Object.freeze([
  ...MOBILE_TAB_SHEETS,
  ...MOBILE_MORE_SHEETS,
]);

/** Look up a sheet by its id or by its upstream panel id. */
export function findSheet(idOrPanelId) {
  return (
    MOBILE_SHEETS.find(
      (sheet) => sheet.id === idOrPanelId || sheet.panelId === idOrPanelId,
    ) || null
  );
}

/**
 * One sheet at a time: tapping the open sheet's tab closes it, tapping
 * another switches. Unknown ids close everything.
 *
 * @param {string|null} current - Open sheet id.
 * @param {string|null} requested - Tapped sheet id.
 * @returns {string|null} Sheet id to show next.
 */
export function nextSheet(current, requested) {
  if (!requested || !findSheet(requested)) return null;
  return current === requested ? null : findSheet(requested).id;
}

/** Downward drag (px) on the sheet handle that closes the sheet on release. */
export const SHEET_SWIPE_CLOSE_PX = 64;

/**
 * Close on release after a downward drag past the threshold, or a quick
 * downward flick (≥0.5 px/ms over at least 24px).
 *
 * @param {number} dy - Drag distance in px (positive = down).
 * @param {number} [ms] - Drag duration.
 * @returns {boolean}
 */
export function shouldCloseOnSwipe(dy, ms = Infinity) {
  const d = Number(dy);
  if (!Number.isFinite(d) || d <= 0) return false;
  if (d >= SHEET_SWIPE_CLOSE_PX) return true;
  const t = Number(ms);
  return d >= 24 && Number.isFinite(t) && t > 0 && d / t >= 0.5;
}

/**
 * Compact key-status badge: how many provider credentials are set.
 * Only `secret` entries count; plain settings never do.
 *
 * @param {Array<{name:string,set:boolean}>|null|undefined} vars - Status vars.
 * @param {ReadonlyArray<{vars: ReadonlyArray<{name:string,kind:string}>}>} groups
 * @returns {{set:number,total:number,known:boolean,label:string,tone:string,ariaLabel:string}}
 */
export function keyStatusSummary(vars, groups) {
  const secrets = [
    ...new Set(
      (groups || []).flatMap((group) =>
        (group.vars || [])
          .filter((entry) => entry.kind === 'secret')
          .map((entry) => entry.name),
      ),
    ),
  ];
  const total = secrets.length;
  if (!Array.isArray(vars)) {
    return {
      set: 0,
      total,
      known: false,
      label: `?/${total}`,
      tone: 'unknown',
      ariaLabel: 'Provider keys: status unavailable. Open Provider Settings.',
    };
  }
  const setNames = new Set(
    vars.filter((entry) => entry?.set === true).map((entry) => entry.name),
  );
  const set = secrets.filter((name) => setNames.has(name)).length;
  const tone = set === 0 ? 'none' : set === total ? 'all' : 'some';
  return {
    set,
    total,
    known: true,
    label: `${set}/${total}`,
    tone,
    ariaLabel: `Provider keys: ${set} of ${total} set${set === 0 ? ' (keyless mode)' : ''}. Open Provider Settings.`,
  };
}

/** localStorage key for the optional compact HUD readout (off by default). */
export const MOBILE_HUD_KEY = 'earth-eye:mobile-hud:v1';
