/**
 * Honest CCTV media classification (Earth Eye data-honesty pass, 2026-09).
 *
 * The class is derived only from what the provider actually publishes for a
 * camera: an HLS playlist (`.m3u8`) is LIVE VIDEO, an `.mp4` file is a VIDEO
 * CLIP (e.g. TfL JamCams publish a short recorded clip per camera), and a
 * still-image URL or an image feed type is a STILL IMAGE. Nothing is guessed
 * from the provider name.
 *
 * Pure module: no I/O, safe to import from tests.
 */

const HLS_RE = /\.m3u8(?:[?#]|$)/i;
const MP4_RE = /\.(?:mp4|m4v|webm)(?:[?#]|$)/i;
const IMAGE_RE = /\.(?:jpe?g|png|gif|webp)(?:[?#]|$)/i;

/** Classification labels, exactly as the UI shows them. */
export const CCTV_MEDIA_LABEL = Object.freeze({
  live: 'LIVE VIDEO',
  clip: 'VIDEO CLIP',
  still: 'STILL IMAGE ONLY',
  none: 'UNAVAILABLE',
});

/**
 * @param {string} value
 * @returns {string}
 */
function lower(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/**
 * Whether a URL is an HLS playlist.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
export function isHlsUrl(url) {
  return /^https?:\/\//i.test(String(url || '')) && HLS_RE.test(String(url));
}

/**
 * Whether a URL is a progressive video file (a recorded clip).
 *
 * @param {unknown} url
 * @returns {boolean}
 */
export function isClipUrl(url) {
  return /^https?:\/\//i.test(String(url || '')) && MP4_RE.test(String(url));
}

/**
 * Whether a URL looks like a still image by extension.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
export function isImageUrl(url) {
  return /^https?:\/\//i.test(String(url || '')) && IMAGE_RE.test(String(url));
}

/**
 * Describe which media a camera source really offers.
 *
 * @param {{feedType?:string,url?:string,snapshotUrl?:string,clipUrl?:string}} source
 *   A server-side (private) source record. URLs never leave the server; only
 *   the booleans and the kind do.
 * @returns {{kind:'live'|'clip'|'still'|'none', live:boolean, clip:boolean, still:boolean, label:string}}
 */
export function describeCctvMedia(source = {}) {
  const feedType = lower(source.feedType);
  const url = String(source.url || '');
  const snapshotUrl = String(source.snapshotUrl || '');
  const clipUrl = String(source.clipUrl || '');

  const live = (feedType === 'hls' || feedType === 'stream') && isHlsUrl(url);
  const clip =
    isClipUrl(clipUrl) ||
    ((feedType === 'mp4' || feedType === 'video' || feedType === 'webm') &&
      isClipUrl(url));
  const imageFeed =
    !feedType ||
    feedType === 'image' ||
    feedType === 'jpg' ||
    feedType === 'jpeg' ||
    feedType === 'png';
  const still =
    /^https?:\/\//i.test(snapshotUrl) ||
    isImageUrl(url) ||
    (imageFeed && /^https?:\/\//i.test(url));

  const kind = live ? 'live' : clip ? 'clip' : still ? 'still' : 'none';
  return { kind, live, clip, still, label: CCTV_MEDIA_LABEL[kind] };
}

/**
 * Public (browser-safe) media descriptor for GET /api/cctv/sources.
 *
 * @param {object} source
 * @param {string} cameraId
 * @returns {{kind:string,label:string,live:boolean,clip:boolean,still:boolean,stillPath:string|null,clipPath:string|null,livePath:string|null}}
 */
export function publicCctvMedia(source, cameraId) {
  const d = describeCctvMedia(source);
  const id = encodeURIComponent(String(cameraId || source?.id || ''));
  return {
    kind: d.kind,
    label: d.label,
    live: d.live,
    clip: d.clip,
    still: d.still,
    stillPath: d.still ? `/api/cctv/frame/${id}` : null,
    clipPath: d.clip ? `/api/cctv/clip/${id}` : null,
    livePath: d.live ? `/api/cctv/media/${id}` : null,
  };
}
