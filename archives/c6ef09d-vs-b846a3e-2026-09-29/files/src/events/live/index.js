/**
 * EE-EVENTS-2/3 + FOLLOW honesty — World Events live UX.
 * Follow is UNAVAILABLE until retention + notify exist (no fake 24/7 / push).
 */

export {
  FILTER_KIND_CHIPS,
  SOURCE_FILTER_IDS,
  TIER_FILTER_IDS,
  emptyFilters,
  applyEventFilters,
  kindShortLabel,
  kindTone,
  kindChipForEventKind,
  sourceIdFromEvent,
  tierFromEvent,
  toggleFilterValue,
} from './filters.js';

export {
  WORLD_EVENTS_OVERLAY_SOURCE_ID,
  WORLD_EVENTS_MARKER_COHORT_LIMIT,
  markerAnchorFromEvent,
  selectMarkerCohort,
  createWorldEventOverlaySpec,
  countListOnly,
} from './cohort.js';

export { compactDisclosure, disclosureHintText } from './disclosure.js';
export { buildEventDetail, RELATED_NOTE } from './detail.js';
export {
  RELATED_CAMERA_LIMIT,
  RELATED_DEFAULT_RADIUS_KM,
  RELATED_LAYER_KEYS,
  relatedAnchorFromEvent,
  relatedCamerasForEvent,
  relatedLayersForEvent,
  buildRelatedConditions,
  mapActionAvailability,
} from './related.js';

export {
  WORLD_EVENTS_LAYER_ID,
  worldEventToContextRecord,
  worldEventIdentity,
  selectWorldEvent,
} from './selectionBridge.js';

export { uiStatusFromFetch, sourceHealthLines } from './statusCopy.js';
export { createWorldEventsClient } from './client.js';
export { createWorldEventsPanel } from './panel.js';
export { createWorldEventsMarkers } from './markers.js';
export { createWorldEventsController } from './controller.js';
export {
  EVENT_FOLLOW_CONTROL_LABEL,
  EVENT_FOLLOW_SELECT_NOTE,
  EVENT_FOLLOW_UNAVAILABLE_REASON,
  FORBIDDEN_EVENT_FOLLOW_CLAIM_PATTERNS,
  eventFollowAvailability,
  eventFollowSourceState,
  hasForbiddenEventFollowClaim,
} from './followAvailability.js';
