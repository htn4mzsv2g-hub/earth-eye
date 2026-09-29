#!/usr/bin/env node
/**
 * Earth Eye data-source probe: asks a running Earth Eye server (local or the
 * hosted one) for every layer's feed exactly the way the browser does, and
 * records what actually came back. Used to write docs/DATA_SOURCES_AUDIT.md.
 *
 *   node scripts/audit-data-sources.mjs --url http://127.0.0.1:4173 \
 *     [--out screenshots/audit/report.json]
 *   QA_LOGIN_USER=... QA_LOGIN_PASS=... node scripts/audit-data-sources.mjs --url https://eartheye.us
 *
 * With QA_LOGIN_USER/QA_LOGIN_PASS set it signs in through the server's own
 * /login form first (credentials stay in this process; never printed). Three
 * layers load straight from the provider in the browser (USGS quakes, NASA
 * GIBS imagery, Esri/OSM tiles); those are probed directly from this machine
 * and flagged `browserDirect`.
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://127.0.0.1:4173').replace(/\/$/, '');
const OUT = arg('out', 'screenshots/audit/data-sources-report.json');
const USER = process.env.QA_LOGIN_USER || '';
const PASS = process.env.QA_LOGIN_PASS || '';
const TIMEOUT_MS = Number(arg('timeout', '45000'));

let cookie = '';
async function login() {
  if (!USER || !PASS) return 'no credentials (open server assumed)';
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: BASE,
    },
    body: new URLSearchParams({ username: USER, password: PASS, next: '/' }),
  });
  const set = res.headers.getSetCookie?.() || [];
  const session = set.find((c) => c.startsWith('ee_session='));
  if (!session) throw new Error(`sign-in failed (HTTP ${res.status})`);
  cookie = session.split(';')[0];
  return `signed in (HTTP ${res.status})`;
}

async function get(url, init = {}) {
  const absolute = url.startsWith('http') ? url : `${BASE}${url}`;
  const started = Date.now();
  try {
    const res = await fetch(absolute, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        ...(init.headers || {}),
        ...(cookie && !url.startsWith('http') ? { Cookie: cookie } : {}),
      },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      ms: Date.now() - started,
      type: res.headers.get('content-type') || '',
      headers: Object.fromEntries(res.headers),
      bytes: buf.length,
      text: () => buf.toString('utf8'),
      json: () => {
        try {
          return JSON.parse(buf.toString('utf8'));
        } catch {
          return null;
        }
      },
    };
  } catch (error) {
    return { status: 0, ms: Date.now() - started, error: String(error?.message || error) };
  }
}

const pick = (h, ...names) =>
  Object.fromEntries(names.filter((n) => h?.[n] != null).map((n) => [n, h[n]]));

const probes = [
  ['flights', 'OpenSky → adsb.lol', async () => {
    const r = await get('/api/opensky?lat=32.7767&lon=-96.7970');
    const j = r.json?.();
    const states = Array.isArray(j?.states) ? j.states.length : Array.isArray(j?.ac) ? j.ac.length : null;
    return { r, count: states, extra: pick(r.headers, 'x-flight-source', 'x-flight-coverage', 'x-flight-count', 'x-opensky-auth-mode', 'x-opensky-reason', 'x-cache') };
  }],
  ['military', 'adsb.lol /v2/mil', async () => {
    const r = await get('/api/adsblol/mil');
    const j = r.json?.();
    return { r, count: Array.isArray(j?.ac) ? j.ac.length : null, extra: { now: j?.now ?? null } };
  }],
  ['earthquakes', 'USGS all_day.geojson (browser-direct)', async () => {
    const r = await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
    const j = r.json?.();
    return { r, count: j?.features?.length ?? null, browserDirect: true, extra: { generated: j?.metadata?.generated ? new Date(j.metadata.generated).toISOString() : null } };
  }],
  ['fire-perimeters', 'NIFC WFIGS (ArcGIS)', async () => {
    const r = await get('/api/fire-perimeters');
    const j = r.json?.();
    return { r, count: j?.features?.length ?? null };
  }],
  ['local-firms', 'NASA FIRMS', async () => {
    const r = await get('/api/firms');
    const j = r.json?.();
    return { r, count: Array.isArray(j?.fires) ? j.fires.length : null, extra: { fallback: j?.fallback ?? false, keyless: j?.keyless ?? false, fallbackLabel: j?.fallbackLabel ?? null, fetchedAt: j?.fetchedAt ?? j?.at ?? null, stale: j?.stale ?? null, error: j?.error ?? null, sources: j?.sources ?? null } };
  }],
  ...['stations', 'visual', 'gps-ops', 'glo-ops', 'galileo', 'geo', 'starlink'].map((g) => [
    `satellites:${g}`, 'CelesTrak GP (TLE)', async () => {
      const r = await get(`/api/celestrak/${g}`);
      const t = r.status === 200 ? r.text() : '';
      return { r, count: (t.match(/^1 /gm) || []).length, extra: pick(r.headers, 'x-tle-source', 'x-tle-cache') };
    }]),
  ['rocket-launches', 'Launch Library 2', async () => {
    const r = await get('/api/launches');
    const j = r.json?.();
    return { r, count: Array.isArray(j?.results) ? j.results.length : Array.isArray(j) ? j.length : null, extra: { error: j?.error ?? null } };
  }],
  ['traffic', 'TomTom status (keyless → simulation)', async () => {
    const r = await get('/api/tomtom/status');
    return { r, extra: { body: r.json?.() } };
  }],
  ['radio', 'Radio Browser', async () => {
    const r = await get('/api/radio/stations');
    const j = r.json?.();
    return { r, count: Array.isArray(j?.stations) ? j.stations.length : Array.isArray(j) ? j.length : null };
  }],
  ['transit:feeds', 'GTFS-RT registry', async () => {
    const r = await get('/api/transit/feeds');
    const j = r.json?.();
    return { r, count: Array.isArray(j?.feeds) ? j.feeds.length : Array.isArray(j) ? j.length : null };
  }],
  ...['mbta', 'capmetro-austin', 'metrotransit-msp', 'hsl-helsinki', 'ovapi-nl', 'entur-norway', 'translink-seq'].map((id) => [
    `transit:${id}`, 'GTFS-RT vehicle positions', async () => {
      const r = await get(`/api/transit/vehicles/${id}`);
      const j = r.json?.();
      return { r, count: Array.isArray(j?.vehicles) ? j.vehicles.length : null, extra: { error: j?.error ?? null, fetchedAt: j?.fetchedAt ?? j?.feedTimestamp ?? null } };
    }]),
  ['bikeshare', 'GBFS (Austin MetroBike)', async () => {
    const r = await get(`/api/gbfs/${encodeURIComponent('https://austin.publicbikesystem.net/customer/gbfs/v2/en/station_status.json')}`);
    const j = r.json?.();
    return { r, count: j?.data?.stations?.length ?? null, extra: { last_updated: j?.last_updated ?? null } };
  }],
  ['directions', 'OSRM (routing.openstreetmap.de)', async () => {
    const r = await get('/api/route?profile=driving&coords=-97.7431,30.2672;-97.7000,30.3000');
    const j = r.json?.();
    return { r, count: j?.routes?.length ?? null, extra: { code: j?.code ?? null } };
  }],
  ['recent-imagery', 'NASA GIBS WMTS (browser-direct)', async () => {
    const r = await get('https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities');
    return { r, browserDirect: true };
  }],
  ['ais-live-vessels', 'AISStream', async () => {
    const r = await get('/api/ais-live');
    const j = r.json?.();
    return { r, count: Array.isArray(j?.vessels) ? j.vessels.length : null, extra: { error: j?.error ?? null, keyRequired: j?.keyRequired ?? null } };
  }],
  ['military-installations', 'OSM via Overpass', async () => {
    const r = await get('/api/military-installations?south=30.20000&west=-97.90000&north=30.50000&east=-97.60000');
    const j = r.json?.();
    return { r, count: Array.isArray(j?.features) ? j.features.length : Array.isArray(j?.installations) ? j.installations.length : Array.isArray(j?.elements) ? j.elements.length : null, extra: { error: j?.error ?? null, reason: j?.reason ?? null } };
  }],
  ['alpr-cameras', 'OSM via Overpass', async () => {
    const q = '[out:json][timeout:25];node["surveillance:type"="ALPR"](30.2,-97.9,30.5,-97.6);out body 50;';
    const r = await get('/api/overpass', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: q }).toString() });
    const j = r.json?.();
    return { r, count: j?.elements?.length ?? null, extra: pick(r.headers, 'x-overpass-upstream', 'x-overpass-cache') };
  }],
  ['wind', 'NOAA GFS / ECMWF IFS', async () => {
    const r = await get('/api/wind/manifest?model=gfs');
    const j = r.json?.();
    return { r, extra: { model: j?.model ?? null, runTime: j?.runTime ?? j?.run ?? null, validTime: j?.validTime ?? j?.valid ?? null, error: j?.error ?? null } };
  }],
  ...['radar', 'clouds', 'clouds-regional', 'lightning'].map((p) => [`weather-${p}`, 'NOAA nowCOAST', async () => {
    const r = await get(`/api/weather/manifest?product=${p}`);
    const j = r.json?.();
    return { r, extra: { times: Array.isArray(j?.times) ? j.times.length : null, latest: Array.isArray(j?.times) ? j.times.at(-1) : j?.time ?? null, error: j?.error ?? null } };
  }]),
  ['weather-cyclones', 'NOAA NHC / CPHC', async () => {
    const r = await get('/api/cyclones');
    const j = r.json?.();
    return { r, count: Array.isArray(j?.storms) ? j.storms.length : Array.isArray(j?.features) ? j.features.length : null, extra: { error: j?.error ?? null } };
  }],
  ['terrain-heights', 'terrain.reearth.land', async () => {
    const r = await get('/api/terrain/heights?points=' + encodeURIComponent('-97.7431,30.2672'));
    return { r, extra: { body: r.text?.().slice(0, 160) } };
  }],
  ['geocode', 'Nominatim', async () => {
    const r = await get('/api/geocode?q=Austin%2C%20TX');
    return { r, extra: { body: r.text?.().slice(0, 120) } };
  }],
];

async function cctvProbe() {
  const r = await get('/api/cctv/sources');
  const sources = r.json?.()?.sources || [];
  const byProvider = {};
  for (const s of sources) {
    const k = s.provider || 'unknown';
    byProvider[k] ||= { count: 0, feedTypes: {}, mediaKinds: {}, sample: [] };
    byProvider[k].count += 1;
    byProvider[k].feedTypes[s.feedType] = (byProvider[k].feedTypes[s.feedType] || 0) + 1;
    const mk = s.media?.kind || s.mediaKind;
    if (mk) byProvider[k].mediaKinds[mk] = (byProvider[k].mediaKinds[mk] || 0) + 1;
    if (byProvider[k].sample.length < 3) byProvider[k].sample.push(s);
  }
  const frames = {};
  for (const [provider, info] of Object.entries(byProvider)) {
    frames[provider] = [];
    for (const s of info.sample) {
      const isVideo = ['mp4', 'webm', 'hls'].includes(s.feedType);
      const f = await get(`/api/cctv/frame/${encodeURIComponent(s.id)}`);
      const m = isVideo ? await get(`/api/cctv/media/${encodeURIComponent(s.id)}`, { headers: { Range: 'bytes=0-65535' } }) : null;
      frames[provider].push({
        id: s.id,
        feedType: s.feedType,
        frame: { status: f.status, type: f.type, bytes: f.bytes, source: f.headers?.['x-cctv-source'] || null, ms: f.ms, error: f.error },
        media: m && { status: m.status, type: m.type, bytes: m.bytes, source: m.headers?.['x-cctv-source'] || null },
      });
      delete info.sample;
    }
  }
  return { status: r.status, bytes: r.bytes, total: sources.length, byProvider, frames };
}

const report = { base: BASE, startedAt: new Date().toISOString(), login: null, probes: {}, cctv: null };
try {
  report.login = await login();
} catch (error) {
  report.login = `FAILED: ${error.message}`;
  console.error(report.login);
  process.exit(1);
}
console.log(`${BASE}: ${report.login}`);
await Promise.all(
  probes.map(async ([id, provider, fn]) => {
    let out;
    try {
      out = await fn();
    } catch (error) {
      out = { r: { status: 0, error: String(error?.message || error) } };
    }
    const { r, count = null, extra = {}, browserDirect = false } = out;
    report.probes[id] = { provider, status: r.status, ms: r.ms, type: r.type, bytes: r.bytes, count, browserDirect, error: r.error || null, ...extra };
  }),
);
for (const [id, p] of Object.entries(report.probes).sort()) {
  console.log(`${id.padEnd(26)} ${String(p.status).padEnd(4)} ${String(p.count ?? '').padEnd(7)} ${p.ms}ms ${p.browserDirect ? '[browser-direct] ' : ''}${JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k]) => !['provider', 'status', 'ms', 'type', 'bytes', 'count', 'browserDirect'].includes(k) && p[k] != null))).slice(0, 300)}`);
}
report.cctv = await cctvProbe();
console.log(`cctv sources: ${report.cctv.total} (${report.cctv.bytes} bytes)`);
for (const [prov, info] of Object.entries(report.cctv.byProvider)) {
  console.log(`  ${prov.padEnd(40)} ${String(info.count).padEnd(5)} ${JSON.stringify(info.feedTypes)} ${JSON.stringify(info.mediaKinds)}`);
  for (const f of report.cctv.frames[prov]) console.log(`     ${f.id.slice(0, 40).padEnd(40)} frame ${f.frame.status} ${f.frame.type} ${f.frame.bytes}B src=${f.frame.source}${f.media ? ` | media ${f.media.status} ${f.media.type} ${f.media.bytes}B` : ''}`);
}
report.finishedAt = new Date().toISOString();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`report → ${OUT}`);
