/**
 * Canonicalize a CCTV feed type string to one of:
 * 'image', 'mjpeg', 'mp4', 'webm', 'hls', or pass-through.
 *
 * @param {string} value - Raw feed type (e.g. 'jpeg', 'mjpg', 'video', 'stream').
 * @returns {string} Normalized feed type.
 */
export function normalizeFeedType(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'image';
  if (raw === 'jpeg' || raw === 'jpg' || raw === 'png') return 'image';
  if (raw === 'mjpg') return 'mjpeg';
  if (raw === 'video') return 'mp4';
  if (raw === 'stream') return 'hls';
  return raw;
}

/**
 * Check whether a normalized feed type represents streaming video.
 *
 * @param {string} feedType
 * @returns {boolean}
 */
export function isVideoFeedType(feedType) {
  return feedType === 'mp4' || feedType === 'webm' || feedType === 'hls';
}

/** Honest medium labels shown next to a camera's source-type tag. */
export const CCTV_MEDIUM = Object.freeze({
  still: 'STILL IMAGE ONLY',
  clip: 'VIDEO CLIP',
  live: 'LIVE VIDEO',
});

/**
 * Say what the viewer is actually looking at: a refreshed still frame, a
 * recorded clip (mp4/webm) or a live stream (HLS). `isVideo` is the resolved
 * playback state; a video source that fell back to its snapshot is a still.
 *
 * @param {{feedType?: string, isVideo?: boolean}} camera
 * @returns {string} One of the CCTV_MEDIUM labels.
 */
export function cctvMediumLabel(camera) {
  const feedType = normalizeFeedType(camera?.feedType);
  const video = camera?.isVideo ?? isVideoFeedType(feedType);
  if (!video || !isVideoFeedType(feedType)) return CCTV_MEDIUM.still;
  return feedType === 'hls' ? CCTV_MEDIUM.live : CCTV_MEDIUM.clip;
}
