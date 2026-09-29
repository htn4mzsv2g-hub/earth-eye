/**
 * Earth Eye selection identity shared by globe, lists, detail, cameras, and
 * Analyst (EE-LIVE-5 / selection contract). One provider-qualified object —
 * never a parallel Analyst-only id.
 */

/**
 * Extract a stable Earth Eye identity from a context-store record or tool item.
 * @param {object|null|undefined} rec
 * @returns {{
 *   id: string,
 *   type: string,
 *   source: string,
 *   layerId: string|null,
 *   providerId: string,
 *   label: string,
 *   lat: number|null,
 *   lon: number|null,
 * }|null}
 */
export function earthEyeIdentity(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const layerId = rec.layerId ? String(rec.layerId) : rec.type ? String(rec.type) : null;
  const rawId = rec.id != null ? String(rec.id) : '';
  let providerId =
    rec.providerId != null
      ? String(rec.providerId)
      : rec.icao24 != null
        ? String(rec.icao24)
        : rec.mmsi != null
          ? String(rec.mmsi)
          : rec.noradId != null
            ? String(rec.noradId)
            : '';
  if (!providerId && rawId) {
    if (layerId && rawId.startsWith(`${layerId}:`))
      providerId = rawId.slice(layerId.length + 1);
    else providerId = rawId;
  }
  const id =
    rawId ||
    (layerId && providerId ? `${layerId}:${providerId}` : providerId) ||
    '';
  if (!id) return null;
  const lat = Number(
    rec.latitude ?? rec.lat ?? rec.position?.latitude ?? rec.position?.lat,
  );
  const lon = Number(
    rec.longitude ??
      rec.lon ??
      rec.lng ??
      rec.position?.longitude ??
      rec.position?.lon,
  );
  const source =
    rec.provider ||
    rec.source ||
    rec.attribution ||
    (rec.sourceUrl ? String(rec.sourceUrl) : null) ||
    layerId ||
    'unknown';
  return {
    id: String(id),
    type: layerId || String(rec.type || 'unknown'),
    source: String(source),
    layerId,
    providerId: String(providerId || id),
    label: String(rec.label || rec.name || rec.callsign || id),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
  };
}

/** Terminal command statuses — never acknowledge a command that did not run. */
export const COMMAND_STATUS = Object.freeze({
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  UNAVAILABLE: 'UNAVAILABLE',
});

/**
 * Derive a terminal status from a tool outcome.
 * @param {{ok?:boolean, status?:string, items?:unknown[], total?:number, note?:string, error?:string, kind?:string}} out
 * @param {{layerDisplayOff?:boolean, pending?:boolean, capabilityOff?:boolean}} [meta]
 */
export function commandStatusFromResult(out, meta = {}) {
  if (meta.capabilityOff) return COMMAND_STATUS.UNAVAILABLE;
  if (out?.status && Object.values(COMMAND_STATUS).includes(out.status))
    return out.status;
  if (out?.ok === false) {
    const err = String(out.error || '');
    if (/unavail|not configured|not wired|ai off|no paid|permission held/i.test(err))
      return COMMAND_STATUS.UNAVAILABLE;
    return COMMAND_STATUS.FAILED;
  }
  if (meta.pending) return COMMAND_STATUS.PARTIAL;
  const items = Array.isArray(out?.items) ? out.items : [];
  const total = Number.isFinite(out?.total) ? out.total : items.length;
  if (meta.layerDisplayOff && items.length === 0)
    return COMMAND_STATUS.UNAVAILABLE;
  if (meta.layerDisplayOff && items.length > 0) return COMMAND_STATUS.PARTIAL;
  if (total > items.length) return COMMAND_STATUS.PARTIAL;
  if (out?.ok === true) return COMMAND_STATUS.SUCCESS;
  return COMMAND_STATUS.FAILED;
}
