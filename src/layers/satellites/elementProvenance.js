/** Positions from orbital elements are predictions, never receiver telemetry. */
export const SATELLITE_POSITION_KIND = 'sgp4-prediction';

const JD_UNIX_EPOCH = 2440587.5;

/** Unix milliseconds for an SGP4 record's element epoch, or null. */
export function epochMsFromSatrec(satrec) {
  const jd = Number(satrec?.jdsatepoch);
  if (!Number.isFinite(jd) || jd <= 0) return null;
  const ms = (jd - JD_UNIX_EPOCH) * 86400000;
  return Number.isFinite(ms) ? ms : null;
}

/** Catalog epoch, preferring the parsed OMM EPOCH over the satrec Julian date. */
export function satelliteEpochMs(sat) {
  if (Number.isFinite(sat?.epochMs)) return sat.epochMs;
  return epochMsFromSatrec(sat?.satrec);
}

function iso(ms) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return '';
  }
}

/** Card / chip line. Never describes the dot as live telemetry. */
export function elementProvenanceLine(sat) {
  const epoch = satelliteEpochMs(sat);
  const day = Number.isFinite(epoch) ? iso(epoch).slice(0, 10) : '';
  return day
    ? `epoch ${day} · SGP4 prediction, not telemetry`
    : 'SGP4 prediction, not telemetry';
}

/** Layer-chip detail once a catalog exists. */
export function catalogEpochLabel(epochMs) {
  if (!Number.isFinite(epochMs)) return 'SGP4 prediction, not telemetry';
  const stamp = iso(epochMs);
  return stamp
    ? `epoch ${stamp.slice(0, 16)}Z · SGP4 prediction, not telemetry`
    : 'SGP4 prediction, not telemetry';
}

/**
 * Feed note for a refresh that returned real elements from cache or AMSAT.
 * @param {{ results: Array<object>, epochMs?: number|null }} input
 * @returns {string|null}
 */
export function satelliteFeedNotes({ results, epochMs }) {
  const rows = Array.isArray(results) ? results : [];
  const fallbackGroups = rows
    .filter((r) => r.ok && r.tleSource && r.tleSource !== 'celestrak')
    .map((r) => r.tag);
  const staleGroups = rows.filter((r) => r.ok && r.tleCache === 'STALE-ERROR');
  const fetched = staleGroups
    .map((r) => Date.parse(r.fetchedAt))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const epochBit = Number.isFinite(epochMs) ? `, epoch ${iso(epochMs)}` : '';
  const notes = [];
  if (fallbackGroups.length) {
    notes.push(
      `AMSAT amateur TLE fallback for ${fallbackGroups.join(', ')}${epochBit} (CelesTrak unreachable)`,
    );
  }
  if (staleGroups.length) {
    notes.push(
      `cached CelesTrak elements for ${staleGroups.map((r) => r.tag).join(', ')}${
        Number.isFinite(fetched) ? ` fetched ${iso(fetched)}` : ''
      }${epochBit} (CelesTrak unreachable)`,
    );
  }
  return notes.length ? notes.join('; ') : null;
}

/**
 * Source line when a total outage keeps the previous catalog on screen.
 * The chip stays UNAVAILABLE; this line is the age, so the dots are not live.
 */
export function retainedCatalogSource({
  origin,
  fetchedAt,
  epochMs,
  retrievedAt,
} = {}) {
  const bits = [
    origin === 'amsat-fallback'
      ? 'AMSAT amateur TLE fallback'
      : 'cached CelesTrak elements',
  ];
  if (Number.isFinite(fetchedAt)) bits.push(`fetched ${iso(fetchedAt)}`);
  else if (Number.isFinite(retrievedAt))
    bits.push(`retrieved ${iso(retrievedAt)}`);
  if (Number.isFinite(epochMs)) bits.push(`epoch ${iso(epochMs)}`);
  return `${bits.join(', ')} (CelesTrak unreachable)`;
}
