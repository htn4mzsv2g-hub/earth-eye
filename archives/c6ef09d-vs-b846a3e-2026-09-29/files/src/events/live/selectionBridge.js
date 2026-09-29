/**
 * EE-EVENTS-2/3 — World Event → shared Earth Eye selection identity.
 * Same contract as LIVE-5 Analyst (earthEyeIdentity / contextStore).
 * Detail panel is EE-EVENTS-3; Follow is UNAVAILABLE (honesty).
 */

import { earthEyeIdentity } from '../../atlas/analystIdentity.js';
import { compactDisclosure, disclosureHintText } from './disclosure.js';
import { markerAnchorFromEvent } from './cohort.js';
import { sourceIdFromEvent } from './filters.js';

export const WORLD_EVENTS_LAYER_ID = 'world-events';

/**
 * Build a contextStore-compatible metadata record from a World Event.
 * @param {object} event
 * @param {{entity?: object}} [opts]
 */
export function worldEventToContextRecord(event, opts = {}) {
  if (!event?.eventId) return null;
  const disclosure = compactDisclosure(event);
  const anchor = markerAnchorFromEvent(event);
  const lat = anchor?.lat ?? null;
  const lon = anchor?.lon ?? null;
  const sourceId = sourceIdFromEvent(event);
  const provider =
    event.attribution?.credit ||
    (Array.isArray(event.sources) && event.sources[0]) ||
    sourceId ||
    'world-events';

  const record = {
    id: String(event.eventId),
    layerId: WORLD_EVENTS_LAYER_ID,
    layerName: 'World Events',
    type: WORLD_EVENTS_LAYER_ID,
    providerId: String(event.eventId),
    provider,
    source: provider,
    label: String(event.title || event.eventId).slice(0, 160),
    latitude: lat,
    longitude: lon,
    properties: {
      eventType: 'world-event',
      kind: event.kind,
      category: event.category || null,
      precision: event.precision,
      eventTimeStart: event.eventTime?.start || null,
      eventTimeEnd: event.eventTime?.end || null,
      retrievedAt: event.retrievedAt || null,
      attribution: disclosure?.attribution || provider,
      sourceId,
      note: disclosureHintText(disclosure),
      disclosure,
      // related ≠ causal
      relatedNote:
        event.related?.note ||
        'Related refs are contextual only — not causal proof.',
      detailPanel: 'full',
      openDetail: true,
    },
  };
  if (opts.entity) record.entity = opts.entity;
  return record;
}

/**
 * Shared Earth Eye identity for Analyst / selection card.
 * @param {object} event
 */
export function worldEventIdentity(event) {
  const rec = worldEventToContextRecord(event);
  return earthEyeIdentity(rec);
}

/**
 * Publish selection into contextStore (when DOM/host available).
 * @param {object} event
 * @param {{
 *   registerEntityContext?: Function,
 *   selectEntityContext?: Function,
 *   entity?: object,
 * }} services
 */
export function selectWorldEvent(event, services = {}) {
  const {
    registerEntityContext,
    selectEntityContext,
    entity = { __gevWorldEventId: event?.eventId },
  } = services;
  if (!event?.eventId) return null;
  if (typeof registerEntityContext !== 'function') {
    return worldEventToContextRecord(event, { entity });
  }
  const meta = worldEventToContextRecord(event);
  if (!meta) return null;
  const carrier = entity || { __gevWorldEventId: event.eventId };
  registerEntityContext(carrier, meta);
  if (typeof selectEntityContext === 'function') selectEntityContext(carrier);
  return meta;
}
