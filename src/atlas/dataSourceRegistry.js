/**
 * Earth Eye data-source registry: the single source of truth for what every
 * layer is, where it comes from, how often it refreshes and how honest its
 * data is. The Data Sources screen, the layer-row badges, the Feed Status
 * list and the CCTV browser all read from here.
 *
 * Classification (exactly this set, see docs/DATA_SOURCES_AUDIT.md):
 *   LIVE                 streamed or pushed as it happens (seconds)
 *   NEAR LIVE            polled public feed, seconds to minutes old
 *   REFRESHED STILL      still images re-fetched on a cadence
 *   VIDEO CLIP           short recorded clips published by the provider
 *   DAILY / PERIODIC     products published hourly/daily or on a schedule
 *   SNAPSHOT             a fixed extract (bundled file or map database)
 *   MODEL                a numerical-model forecast, not an observation
 *   SIMULATED            generated, never real positions
 *   KEY REQUIRED         off until the operator sets a provider key
 *   BROKEN / UNAVAILABLE the provider cannot be reached or refuses us
 *
 * Providers, endpoints and cadences come from the code (poll intervals in
 * src/layers/*, cache TTLs in server/providers/*) and the providers' own
 * documentation; nothing here is invented. Pure module: no DOM.
 */

import {
  DEV_ONLY_LAYER_IDS,
  devExcludedFeaturesEnabled,
} from '../policy/devFlags.js';

/** How a record relates to reality (product standard Stage 2). Distinct from
 *  health and from the LIVE/NEAR LIVE display class. */
export const RECORD_CLASSES = Object.freeze([
  'observed',
  'reported',
  'predicted',
  'forecast',
  'snapshot',
]);

/** Map delivery/freshness → record class. Never pretend a forecast is observed. */
export function deriveRecordClass(entry = {}) {
  const d = String(entry.deliveryType || '').toLowerCase();
  const f = String(entry.freshness || '').toLowerCase();
  if (/simulat/.test(d) || /simulat/.test(f)) return 'snapshot';
  if (
    /model|forecast/.test(d) ||
    /forecast/.test(f) ||
    entry.classification === 'MODEL'
  )
    return 'forecast';
  if (
    /predict|propagat|orbit|tle|gp\b|omm/.test(d + f) ||
    /satellites|rocket-launches/.test(entry.layerId || '')
  )
    return 'predicted';
  if (
    /snapshot|bundled|composite|file/.test(d) ||
    f === 'static' ||
    f === 'historical'
  )
    return 'snapshot';
  if (
    /agency|report|news|gdelt|perimeter|alert/.test(
      d + ' ' + (entry.provider || ''),
    )
  )
    return 'reported';
  if (/polled|stream|live|ads-?b|ais|feed/.test(d) || /seconds|minutes/.test(f))
    return 'observed';
  return 'reported';
}

export const CLASSIFICATIONS = Object.freeze([
  'LIVE',
  'NEAR LIVE',
  'REFRESHED STILL',
  'VIDEO CLIP',
  'DAILY / PERIODIC',
  'SNAPSHOT',
  'MODEL',
  'SIMULATED',
  'KEY REQUIRED',
  'BROKEN / UNAVAILABLE',
]);

/** Badge tone per classification (drives colour; red only for errors). */
export const CLASSIFICATION_TONE = Object.freeze({
  LIVE: 'live',
  'NEAR LIVE': 'live',
  'REFRESHED STILL': 'info',
  'VIDEO CLIP': 'info',
  'DAILY / PERIODIC': 'info',
  SNAPSHOT: 'muted',
  MODEL: 'info',
  SIMULATED: 'warn',
  'KEY REQUIRED': 'warn',
  'BROKEN / UNAVAILABLE': 'bad',
});

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * One entry per layer id (dataManager ids). Fields:
 *   name, group, provider, endpoint, cadence (human text), pollMs (Earth Eye
 *   poll interval from the code, 0 = on demand / static), classification
 *   (the honest class when healthy and keyless), keyed ({env, classification}
 *   when a key upgrades it), coverage (region, plain language), limitation
 *   (plain-language caveat), license.
 */
const BASE_SOURCES = {
  flights: {
    name: 'Live Flights',
    group: 'Aircraft',
    coverage:
      'Global where volunteer ADS-B receivers report (OpenSky); the adsb.lol fallback covers a 250 nm circle around the view',
    provider: 'OpenSky Network (primary) · adsb.lol regional (fallback)',
    endpoint:
      'opensky-network.org/api/states/all → api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/250 (via /api/opensky)',
    cadence:
      'Polled every 30 s (server cache 9–12 s); ADS-B positions are seconds old, extrapolated between reports',
    pollMs: 30_000,
    classification: 'NEAR LIVE',
    limitation:
      'Crowd-sourced ADS-B; coverage gaps; not every aircraft broadcasts.',
    license: 'OpenSky non-commercial terms; adsb.lol ODbL',
  },
  military: {
    name: 'Military Flights',
    group: 'Aircraft',
    coverage: 'Global, wherever community receivers hear the aircraft',
    provider: 'adsb.lol',
    endpoint: 'api.adsb.lol/v2/mil (via /api/adsblol/mil)',
    cadence: 'Polled every 15 s (server cache 12 s)',
    pollMs: 15_000,
    classification: 'NEAR LIVE',
    limitation:
      'Only aircraft that broadcast publicly; absence proves nothing.',
    license: 'adsb.lol ODbL',
  },
  'local-adsb': {
    name: 'Local ADS-B',
    group: 'Aircraft',
    coverage: 'Radio range of your own receiver only',
    provider: 'Your own receiver (LOCAL_RECEIVER_FEEDS / WebUSB RTL-SDR)',
    endpoint: '/api/local-receivers/aircraft or a WebUSB dongle',
    cadence: 'Every 1 s while a receiver is attached',
    pollMs: 1_000,
    classification: 'LIVE',
    unavailableByDefault:
      'No receiver attached (none on the hosted server; WebUSB is not available in iPhone Safari).',
    limitation: 'Empty unless you run a receiver.',
  },
  'ais-live-vessels': {
    name: 'Live AIS Vessels',
    group: 'Maritime',
    coverage:
      'Wherever AISStream community receivers hear ships (mostly coastal)',
    provider: 'AISStream',
    endpoint: 'wss://stream.aisstream.io (via /api/ais-live)',
    cadence: 'Websocket stream; the layer reads the server store every 60 s',
    pollMs: 60_000,
    classification: 'KEY REQUIRED',
    keyed: { env: 'AISSTREAM_API_KEY', classification: 'LIVE' },
    limitation: 'No key = no ship data. There is no simulated ship feed.',
  },
  earthquakes: {
    name: 'Earthquakes (24h)',
    group: 'Hazards',
    coverage:
      'Global; small quakes are listed mainly where regional networks report (mostly the U.S.)',
    provider: 'USGS Earthquake Hazards Program',
    endpoint:
      'earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson (browser-direct)',
    cadence: 'Polled every 60 s; USGS updates the summary feed every minute',
    pollMs: 60_000,
    classification: 'NEAR LIVE',
    limitation: 'Automatic solutions are revised by USGS.',
    license: 'U.S. public domain',
  },
  'fire-perimeters': {
    name: 'Fire Perimeters',
    group: 'Hazards',
    coverage: 'United States only',
    provider: 'NIFC WFIGS (+ InciWeb links)',
    endpoint:
      'services3.arcgis.com/T4QMspbfLg3qTGWY/…/WFIGS perimeters (via /api/fire-perimeters)',
    cadence:
      'Polled every 5 min; perimeters change when incident teams publish them',
    pollMs: 5 * MIN,
    classification: 'DAILY / PERIODIC',
    limitation: 'U.S. incidents only; perimeters can lag the fire.',
    license: 'U.S. public domain',
  },
  'local-firms': {
    name: 'FIRMS Active Fires',
    group: 'Hazards',
    coverage: 'Global',
    provider:
      'NASA FIRMS public 24 h files (MODIS C6.1 + NOAA-20 VIIRS), keyless',
    endpoint:
      'firms.modaps.eosdis.nasa.gov/data/active_fire/…_Global_24h.csv (via /api/firms)',
    cadence:
      'Polled every 10 min (server cache 30 min); rolling 24 h files, hotspots hours old',
    pollMs: 10 * MIN,
    classification: 'DAILY / PERIODIC',
    keyed: {
      env: 'FIRMS_MAP_KEY',
      classification: 'DAILY / PERIODIC',
      provider: 'NASA FIRMS area API (keyed)',
    },
    limitation: 'Satellite hotspots, not confirmed fires.',
    license: 'NASA open data',
  },
  satellites: {
    name: 'Satellites',
    group: 'Space',
    coverage: 'Global (objects in the loaded CelesTrak groups)',
    provider: 'CelesTrak GP element sets (TLE) + SGP4 in the browser',
    endpoint:
      'celestrak.org/NORAD/elements/gp.php?GROUP=… (via /api/celestrak)',
    cadence:
      'Element sets cached 6 h on the server (CelesTrak asks for ≤ every 2 h); positions propagated every frame',
    pollMs: 5 * MIN,
    classification: 'DAILY / PERIODIC',
    limitation:
      'Positions are computed from orbital elements, not observed. CelesTrak only: when it is unreachable the layer says so.',
    license: 'CelesTrak (free, attribution)',
  },
  'rocket-launches': {
    name: 'Space Missions (30d)',
    group: 'Space',
    coverage: 'Global launches, last 30 days',
    provider: 'The Space Devs Launch Library 2',
    endpoint: 'll.thespacedevs.com/2.3.0/launches/ (via /api/launches)',
    cadence:
      'Polled every 5 min (server cache 15 min; keyless limit ~15 req/h)',
    pollMs: 5 * MIN,
    classification: 'DAILY / PERIODIC',
    limitation: 'Schedules; drawn trajectories are coarse estimates.',
  },
  traffic: {
    name: 'Street Traffic',
    group: 'Ground',
    coverage: 'Roads in the current view (TomTom flow when keyed)',
    provider: 'OpenStreetMap roads + TomTom traffic flow (key)',
    endpoint: '/api/overpass (roads) + /api/tomtom/flow (key only)',
    cadence: 'Animated continuously; roads fetched per view',
    pollMs: 0,
    classification: 'KEY REQUIRED',
    keyed: { env: 'TOMTOM_API_KEY', classification: 'NEAR LIVE' },
    limitation:
      'Without TOMTOM_API_KEY: KEY REQUIRED — no simulated cars in production. With key: TomTom road conditions / flow (not invented vehicles).',
  },
  cctv: {
    name: 'CCTV',
    group: 'Ground',
    coverage:
      'Areas covered by the listed agencies: parts of the U.S., UK, Canada, Finland, Estonia, Germany and Australia',
    provider: 'Public agency camera catalogs (see CCTV browser)',
    endpoint: '/api/cctv/sources · /api/cctv/frame/{id} · /api/cctv/media/{id}',
    cadence:
      'Catalog cached 15 min; still frames re-fetched per provider cadence; DelDOT live HLS',
    pollMs: 10_000,
    classification: 'REFRESHED STILL',
    limitation:
      'Mostly refreshed still images; TfL publishes short clips; DelDOT streams live HLS. No recognition of any kind.',
  },
  radio: {
    name: 'Radio',
    group: 'Ground',
    coverage: 'Global station directory',
    provider: 'Radio Browser community directory',
    endpoint: 'all.api.radio-browser.info mirrors (via /api/radio/stations)',
    cadence: 'Directory cached 45 min; streams play live',
    pollMs: 45 * MIN,
    classification: 'LIVE',
    limitation: 'COMMS surface pending providers; Radio Browser music/news is not the product path.',
  },
  transit: {
    name: 'Transit',
    group: 'Ground',
    coverage:
      '7 metro areas with public GTFS-RT feeds: Boston, Austin, Minneapolis–St Paul, Helsinki, the Netherlands, Norway, South East Queensland',
    provider: 'Operator GTFS-Realtime feeds (MBTA, CapMetro, TransLink SEQ, …)',
    endpoint: '/api/transit/vehicles/{feed}',
    cadence: 'Polled every 15 s when zoomed into a covered city',
    pollMs: 15_000,
    classification: 'NEAR LIVE',
    limitation: 'Positions between reports are interpolated for display.',
  },
  bikeshare: {
    name: 'Bikeshare',
    group: 'Ground',
    coverage: 'Cities with a configured public GBFS feed',
    provider: 'GBFS operator feeds',
    endpoint: '/api/gbfs/{station_status.json}',
    cadence: 'Polled every 60 s when zoomed into a covered city',
    pollMs: 60_000,
    classification: 'NEAR LIVE',
    limitation: 'Station status, not riders.',
  },
  directions: {
    name: 'Directions',
    group: 'Ground',
    coverage: 'Global road network from OpenStreetMap',
    provider: 'OSRM on routing.openstreetmap.de (FOSSGIS)',
    endpoint: 'routing.openstreetmap.de/routed-{profile} (via /api/route)',
    cadence: 'On request (cached 10 min)',
    pollMs: 0,
    classification: 'SNAPSHOT',
    limitation:
      'Illustrative routes on an OpenStreetMap snapshot; not for navigation.',
  },
  'recent-imagery': {
    name: 'Recent Imagery',
    group: 'Imagery',
    coverage: 'Global',
    provider: 'NASA GIBS / CMR (HLS, VIIRS)',
    endpoint: 'gibs.earthdata.nasa.gov WMTS (browser-direct)',
    cadence: 'On request; daily products',
    pollMs: 0,
    classification: 'DAILY / PERIODIC',
    limitation: 'Days-old imagery, often cloudy.',
  },
  'military-installations': {
    name: 'Mapped Installations',
    group: 'Context',
    coverage: 'Global, only where mapped in OpenStreetMap',
    provider: 'OpenStreetMap via OpenFreeMap tiles + bundled names (Overpass optional)',
    endpoint: 'OpenFreeMap planet tiles + /api/military-installations (optional Overpass)',
    cadence: 'On view change when zoomed in (tile LRU + name pack; Overpass cached if configured)',
    pollMs: 0,
    classification: 'SNAPSHOT',
    limitation: 'Mapped context, not evidence of activity. Wide views use bundled named points.',
    license: 'ODbL',
  },
  'military-awareness': {
    name: 'Global Context',
    group: 'Context',
    coverage: 'Whatever the layers you have on cover',
    provider: 'Composite of the layers you have on',
    endpoint: 'in-browser',
    cadence: 'Recomputed from enabled layers',
    pollMs: 0,
    classification: 'SNAPSHOT',
    limitation: 'A staging view, not an assessment.',
  },
  'alpr-cameras': {
    name: 'ALPR Cameras',
    group: 'Context',
    coverage: 'Only where volunteers mapped them in OpenStreetMap',
    provider: 'OpenStreetMap-mapped locations via Overpass',
    endpoint: '/api/overpass (Overpass mirrors)',
    cadence: 'On view change when zoomed in (cached 24 h)',
    pollMs: 0,
    classification: 'SNAPSHOT',
    limitation: 'Mapped locations and tags only. No plate data of any kind.',
    license: 'ODbL',
  },
  wind: {
    name: 'Wind',
    group: 'Weather',
    coverage: 'Global model grid',
    provider: 'NOAA GFS / ECMWF IFS open data',
    endpoint:
      'noaa-gfs-bdp-pds.s3.amazonaws.com / data.ecmwf.int/forecasts (via /api/wind)',
    cadence: 'Checked hourly; model runs every 6 h. Forecast, not observation',
    pollMs: HOUR,
    classification: 'MODEL',
    license: 'U.S. public domain; ECMWF CC BY 4.0',
    limitation: 'Model forecast, not observed wind; coarse grid.',
  },
  'weather-radar': {
    name: 'Rain radar',
    group: 'Weather',
    coverage: 'Contiguous United States only',
    provider: 'NOAA nowCOAST MRMS radar (CONUS)',
    endpoint: 'nowcoast.noaa.gov/geoserver/observations (via /api/weather)',
    cadence: 'Polled every 2 min; frames minutes old',
    pollMs: 2 * MIN,
    classification: 'NEAR LIVE',
    limitation: 'U.S. only.',
  },
  'weather-satellite': {
    name: 'Satellite clouds',
    group: 'Weather',
    coverage:
      'GOES East/West regional imagery over North America; a global mosaic (nominal 60°S–60°N) elsewhere',
    provider: 'NOAA nowCOAST GOES infrared',
    endpoint: 'nowcoast.noaa.gov/geoserver (via /api/weather)',
    cadence: 'Polled every 2 min; frames minutes to an hour old',
    pollMs: 2 * MIN,
    classification: 'NEAR LIVE',
    limitation:
      'Infrared temperature patterns, not a cloud-only mask. GOES regional frames update about every 5 min; the global mosaic is hourly with 2–3 h latency.',
  },
  'weather-lightning': {
    name: 'Lightning density',
    group: 'Weather',
    coverage:
      'Pacific and Americas (110°E across the dateline to 0°, 25°S–80°N); not global',
    provider: 'NOAA nowCOAST lightning density',
    endpoint: 'nowcoast.noaa.gov/geoserver (via /api/weather)',
    cadence: 'Polled every 10 min; 15-minute accumulations',
    pollMs: 10 * MIN,
    classification: 'NEAR LIVE',
    limitation:
      'Ground-network strike density on a ~8 km grid, not individual flashes.',
  },
  'weather-alerts': {
    name: 'Weather Alerts (NWS)',
    group: 'Weather',
    coverage: 'United States (NWS CAP active alerts)',
    provider: 'National Weather Service / NOAA',
    endpoint: '/api/nws-alerts · https://api.weather.gov/alerts/active',
    cadence: 'Polled; CAP alerts as published',
    pollMs: 60_000,
    classification: 'NEAR LIVE',
    limitation:
      'CAP alerts via api.weather.gov; no AI warnings; geometry may be null for zone-only products.',
  },
  'weather-cyclones': {
    name: 'Cyclone advisories',
    group: 'Weather',
    coverage: 'NHC / CPHC basins: Atlantic, eastern and central Pacific',
    provider: 'NOAA NHC / CPHC',
    endpoint:
      'www.nhc.noaa.gov/CurrentStorms.json + NHC MapServer (via /api/cyclones)',
    cadence:
      'Polled every 5 min; advisories on NHC’s schedule (typically every 6 h)',
    pollMs: 5 * MIN,
    classification: 'DAILY / PERIODIC',
    limitation: 'Check nhc.noaa.gov for official warnings.',
  },
  'local-datacenters': {
    name: 'Datacenters',
    group: 'Infrastructure',
    coverage: 'Global, as mapped in OpenStreetMap when the extract was made',
    provider: 'OpenStreetMap extract bundled with the app',
    endpoint: 'bundled file (src/data/local_data/datacenters)',
    cadence: 'Static; never refreshed',
    pollMs: 0,
    classification: 'SNAPSHOT',
    license: 'ODbL',
    limitation: 'Static extract: new or closed sites are not reflected.',
  },
  'local-dams': {
    name: 'Dams',
    group: 'Infrastructure',
    coverage:
      'Global, as mapped in OpenStreetMap / OpenInfraMap when the extract was made',
    provider: 'OpenStreetMap / OpenInfraMap extract bundled with the app',
    endpoint: 'bundled file (src/data/local_data/dams)',
    cadence: 'Static; never refreshed',
    pollMs: 0,
    classification: 'SNAPSHOT',
    license: 'ODbL',
    limitation: 'Static extract; not an inventory of every dam.',
  },
  'telegeography-submarine-cables': {
    name: 'Submarine Cables',
    group: 'Infrastructure',
    coverage: 'Global',
    provider: 'TeleGeography extract bundled with the app',
    endpoint:
      'bundled file (src/data/local_data/telegeography_submarine_cables)',
    cadence: 'Static; never refreshed',
    pollMs: 0,
    classification: 'SNAPSHOT',
    license: 'CC BY-NC-SA 3.0 (non-commercial)',
    limitation:
      'Static extract; routes are approximate. Non-commercial license.',
  },
  'bhote-koshi-2026': {
    name: 'Bhote Koshi Flood',
    group: 'Events',
    coverage: 'Bhote Koshi river, Nepal (one event)',
    provider: 'Vantor / GeoPera event scene bundled with the app',
    endpoint: 'bundled files (public/events)',
    cadence: 'Static event replay',
    pollMs: 0,
    classification: 'SNAPSHOT',
    license: 'CC BY-NC 4.0',
    limitation: 'A single past event replay, not current conditions.',
  },
  'bhote-koshi-locator': {
    name: 'Bhote Koshi Locator',
    group: 'Events',
    coverage: 'Bhote Koshi river, Nepal (one event)',
    provider: 'Derived river centerline bundled with the app',
    endpoint: 'bundled file',
    cadence: 'Static',
    pollMs: 0,
    classification: 'SNAPSHOT',
    license: 'CC BY-NC 4.0',
    limitation: 'Derived centerline for locating the event; not a survey.',
  },
};

const OSM = 'https://www.openstreetmap.org/copyright';
const NOWCOAST = 'https://nowcoast.noaa.gov/';

/**
 * Per-layer source link, summarization policy and user-facing disclaimer.
 * sourceUrl is the provider's public page (null when the source is your own
 * hardware, per-operator, or a composite; per-camera links live in the CCTV
 * browser). safeToSummarize=false marks layers a future summary panel must
 * not summarize even when healthy (simulated, camera imagery, surveillance
 * or military context).
 */
const SOURCE_EXTRA = {
  flights: {
    sourceUrl: 'https://opensky-network.org/',
    credit: 'The OpenSky Network; adsb.lol (ODbL)',
    disclaimer:
      'Not for navigation or flight-safety use. Not every aircraft broadcasts.',
  },
  military: {
    sourceUrl: 'https://adsb.lol/',
    credit: 'adsb.lol (ODbL)',
    disclaimer:
      'Only aircraft that broadcast publicly. Not for navigation or tracking anyone.',
  },
  'local-adsb': { sourceUrl: null, credit: 'Your own receiver' },
  'ais-live-vessels': {
    sourceUrl: 'https://aisstream.io/',
    credit: 'AISStream',
    disclaimer: 'Not for navigation or maritime safety.',
  },
  earthquakes: {
    sourceUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
    credit: 'U.S. Geological Survey',
    disclaimer:
      'Not an earthquake alert system. Follow USGS and local officials.',
  },
  'fire-perimeters': {
    sourceUrl: 'https://data-nifc.opendata.arcgis.com/',
    credit: 'National Interagency Fire Center (WFIGS)',
    disclaimer:
      'Not for evacuation decisions. Follow local officials and InciWeb.',
  },
  'local-firms': {
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/',
    credit: 'NASA FIRMS',
    disclaimer:
      'Satellite hotspots, not confirmed fires. Not for evacuation decisions.',
  },
  satellites: {
    sourceUrl: 'https://celestrak.org/NORAD/elements/',
    credit: 'CelesTrak',
  },
  'rocket-launches': {
    sourceUrl: 'https://thespacedevs.com/llapi',
    credit: 'The Space Devs Launch Library 2',
  },
  traffic: {
    sourceUrl: OSM,
    credit: '© OpenStreetMap contributors (roads only)',
    safeToSummarize: false,
  },
  cctv: {
    sourceUrl: null,
    credit: 'Each camera credits its agency in the CCTV browser',
    safeToSummarize: false,
  },
  radio: {
    sourceUrl: 'https://www.radio-browser.info/',
    credit: 'Radio Browser community directory',
  },
  transit: { sourceUrl: null, credit: 'Each transit operator (see layer)' },
  bikeshare: { sourceUrl: null, credit: 'Each GBFS operator (see layer)' },
  directions: {
    sourceUrl: 'https://routing.openstreetmap.de/',
    credit: 'OSRM on FOSSGIS servers; © OpenStreetMap contributors',
    disclaimer: 'Illustrative routes only. Not for navigation.',
  },
  'recent-imagery': {
    sourceUrl: 'https://nasa-gibs.github.io/gibs-api-docs/',
    credit: 'NASA GIBS / Earthdata',
  },
  'military-installations': {
    sourceUrl: OSM,
    credit: '© OpenStreetMap contributors',
    safeToSummarize: false,
    disclaimer:
      'Mapped public context only; not evidence of activity. Not for targeting.',
  },
  'military-awareness': {
    sourceUrl: null,
    credit: 'Composite of the layers you have on',
    safeToSummarize: false,
    disclaimer: 'A staging view of public layers, not an assessment.',
  },
  'alpr-cameras': {
    sourceUrl: OSM,
    credit: '© OpenStreetMap contributors',
    safeToSummarize: false,
    disclaimer:
      'Mapped locations only, no plate data. Not for tracking anyone.',
  },
  wind: {
    sourceUrl: 'https://www.nco.ncep.noaa.gov/pmb/products/gfs/',
    credit: 'NOAA GFS; ECMWF open data (CC BY 4.0)',
  },
  'weather-radar': {
    sourceUrl: NOWCOAST,
    credit: 'NOAA/NWS nowCOAST (MRMS)',
    disclaimer:
      'Not for emergency decisions. Follow National Weather Service warnings.',
  },
  'weather-satellite': {
    sourceUrl: NOWCOAST,
    credit: 'NOAA/NWS nowCOAST (GOES)',
  },
  'weather-lightning': {
    sourceUrl: NOWCOAST,
    credit: 'NOAA/NWS nowCOAST; derived from Vaisala NLDN/GLD360',
    disclaimer: 'Not a lightning safety tool. When thunder roars, go indoors.',
  },
  'weather-cyclones': {
    sourceUrl: 'https://www.nhc.noaa.gov/',
    credit: 'NOAA National Hurricane Center / CPHC',
    disclaimer:
      'Not official warnings. Check nhc.noaa.gov and follow local officials.',
  },
  'local-datacenters': {
    sourceUrl: OSM,
    credit: '© OpenStreetMap contributors',
  },
  'local-dams': {
    sourceUrl: 'https://openinframap.org/',
    credit: '© OpenStreetMap contributors; OpenInfraMap',
  },
  'telegeography-submarine-cables': {
    sourceUrl: 'https://www.submarinecablemap.com/',
    credit: 'TeleGeography (CC BY-NC-SA 3.0)',
  },
  'bhote-koshi-2026': {
    sourceUrl: null,
    credit: 'Vantor / GeoPera (CC BY-NC 4.0)',
  },
  'bhote-koshi-locator': {
    sourceUrl: 'https://github.com/geo-pera/bhotekoshi-2026-reconstruction',
    credit: 'GeoPera river centerline (CC BY-NC 4.0)',
  },
};

/**
 * Delivery type and expected freshness are separate facts (spec §4): how the
 * data arrives vs how old it normally is when it arrives.
 * Permissions (spec §3): display / embed / proxy / store / export / analyze,
 * each 'yes' | 'no' | 'unknown' | 'n/a'. review 'approved' needs written
 * terms or a licence that allows this use; 'pending' sources stay disabled.
 */
const Y = 'yes';
const U = 'unknown';
const NA = 'n/a';
const perms = (display, embed, proxy, store, exp, analyze) =>
  Object.freeze({ display, embed, proxy, store, export: exp, analyze });
const PD = perms(Y, NA, Y, Y, Y, Y); // U.S. public domain / open data
const ODBL = perms(Y, NA, Y, Y, Y, Y); // ODbL: attribution + share-alike
const OWN = perms(Y, NA, NA, Y, Y, Y);

const SOURCE_POLICY = {
  flights: [
    'polled feed',
    'seconds to minutes',
    perms(Y, NA, U, U, U, U),
    'non-commercial',
    U,
    'approved',
    'OpenSky Network terms (non-commercial use); adsb.lol ODbL for the fallback.',
  ],
  military: [
    'polled feed',
    'seconds to minutes',
    ODBL,
    'allowed',
    'not stated',
    'approved',
    'adsb.lol data is ODbL (attribution, share-alike).',
  ],
  'local-adsb': [
    'device stream',
    'seconds',
    OWN,
    'allowed',
    'allowed',
    'approved',
    'Your own receiver.',
  ],
  'ais-live-vessels': [
    'websocket stream',
    'seconds',
    perms(U, NA, U, U, U, U),
    U,
    U,
    'pending',
    'AISStream terms not reviewed; also needs a key.',
  ],
  earthquakes: [
    'polled feed',
    'minutes',
    PD,
    'allowed',
    'allowed',
    'approved',
    'USGS data is U.S. public domain.',
  ],
  'fire-perimeters': [
    'polled feed',
    'hours',
    PD,
    'allowed',
    'allowed',
    'approved',
    'NIFC WFIGS open data (U.S. public domain).',
  ],
  'local-firms': [
    'scheduled file',
    'hours',
    PD,
    'allowed',
    'allowed',
    'approved',
    'NASA FIRMS open data.',
  ],
  satellites: [
    'polled element sets',
    'hours (elements); positions computed',
    perms(Y, NA, Y, U, U, U),
    U,
    U,
    'approved',
    'CelesTrak publishes GP element sets for public use and asks for no more than one download per group every 2 h.',
  ],
  'rocket-launches': [
    'polled feed',
    'hours',
    perms(Y, NA, Y, Y, Y, Y),
    'allowed',
    'not stated',
    'approved',
    'The Space Devs: "You are free to use the data in any way"; free tier 15 calls/h.',
  ],
  traffic: [
    'keyed live / otherwise unavailable',
    'near-live when TomTom key present',
    ODBL,
    'allowed',
    'not stated',
    'approved',
    'Production shows TomTom road conditions only when TOMTOM_API_KEY is set. Simulated vehicle dots are forbidden in production (NEEDS KEY / NO COVERAGE honesty).',
  ],
  cctv: [
    'per camera: refreshed still, recorded clip or live stream',
    'seconds to minutes',
    perms(Y, Y, Y, U, U, U),
    'per provider',
    'per provider',
    'approved',
    'Per provider: packs without written terms are disabled on the server (see /api/cctv/permissions).',
  ],
  radio: [
    'directory feed + live audio stream',
    'live',
    perms(Y, U, U, NA, U, U),
    U,
    U,
    'pending',
    'COMMS-0 (2026-09-29): no longer blanket intentionally excluded. Public-safety COMMS providers are NEEDS_CREDENTIAL / PERMISSION_REQUIRED / LICENSE_REQUIRED / BLOCKED_BY_PROVIDER_TERMS (see docs/SOURCE_REGISTRY_COMMS.md). Broadcastify license-review HELD by owner (do not apply). LiveATC audio blocked. Radio Browser music/news proxy still refused at /api/radio until product decision. Layer stays off pending a credentialed COMMS provider.',
  ],
  transit: [
    'polled feed',
    'seconds to minutes',
    perms(Y, NA, Y, U, U, U),
    'per operator',
    U,
    'approved',
    'Each operator licence is listed in the transit feed registry.',
  ],
  bikeshare: [
    'polled feed',
    'minutes',
    perms(U, NA, U, U, U, U),
    U,
    U,
    'pending',
    'Operator GBFS licences (Lyft systems, BCycle) not reviewed.',
  ],
  directions: [
    'on request',
    'n/a',
    ODBL,
    'allowed',
    'not stated',
    'approved',
    'OSRM on FOSSGIS servers (usage policy: light use); © OpenStreetMap ODbL.',
  ],
  'recent-imagery': [
    'on request',
    'daily',
    PD,
    'allowed',
    'allowed',
    'approved',
    'NASA GIBS / Earthdata open data.',
  ],
  'military-installations': [
    'on request',
    'map database snapshot',
    ODBL,
    'allowed',
    'not stated',
    'approved',
    '© OpenStreetMap contributors (ODbL); vector tiles OpenFreeMap / OpenMapTiles.',
  ],
  'military-awareness': [
    'composite',
    'as the layers you have on',
    perms(Y, NA, NA, NA, U, U),
    'n/a',
    'n/a',
    'approved',
    'Composite of approved layers only.',
  ],
  'alpr-cameras': [
    'on request',
    'map database snapshot',
    ODBL,
    'allowed',
    'not stated',
    'excluded',
    'Excluded by Earth Eye policy: no licence-plate-reader (ALPR) features. Dev-only build flag; never in production.',
  ],
  wind: [
    'scheduled model file',
    'hours (forecast)',
    PD,
    'allowed',
    'allowed',
    'approved',
    'NOAA GFS (U.S. public domain); ECMWF open data CC BY 4.0.',
  ],
  'weather-radar': [
    'polled image service',
    'minutes',
    PD,
    'allowed',
    'allowed',
    'approved',
    'NOAA/NWS nowCOAST (U.S. public domain).',
  ],
  'weather-satellite': [
    'polled image service',
    'minutes to hours',
    PD,
    'allowed',
    'allowed',
    'approved',
    'NOAA/NWS nowCOAST (U.S. public domain).',
  ],
  'weather-lightning': [
    'polled image service',
    'minutes',
    perms(Y, NA, Y, 'no', 'no', U),
    U,
    U,
    'approved',
    'NOAA/NWS nowCOAST public map service; the density product is derived from Vaisala data — store/export forbidden (Stage 5.3).',
  ],
  'weather-alerts': [
    'polled feed',
    'minutes',
    PD,
    'allowed',
    'allowed',
    'approved',
    'NWS CAP alerts via api.weather.gov (U.S. public domain).',
  ],
  'weather-cyclones': [
    'polled feed',
    'hours',
    PD,
    'allowed',
    'allowed',
    'approved',
    'NOAA NHC / CPHC (U.S. public domain).',
  ],
  'local-datacenters': [
    'bundled file',
    'static',
    ODBL,
    'allowed',
    'not stated',
    'approved',
    '© OpenStreetMap contributors (ODbL).',
  ],
  'local-dams': [
    'bundled file',
    'static',
    ODBL,
    'allowed',
    'not stated',
    'approved',
    '© OpenStreetMap / OpenInfraMap (ODbL).',
  ],
  'telegeography-submarine-cables': [
    'bundled file',
    'static',
    perms(Y, NA, NA, Y, U, U),
    'non-commercial',
    U,
    'approved',
    'TeleGeography CC BY-NC-SA 3.0.',
  ],
  'bhote-koshi-2026': [
    'bundled file',
    'static (past event)',
    perms(Y, NA, NA, Y, U, U),
    'non-commercial',
    U,
    'approved',
    'Vantor / GeoPera CC BY-NC 4.0.',
  ],
  'bhote-koshi-locator': [
    'bundled file',
    'static',
    perms(Y, NA, NA, Y, U, U),
    'non-commercial',
    U,
    'approved',
    'Imports the GeoPera centerline compiled into src/data/bhoteKoshiFloodPath.js: CC BY-NC 4.0 (not covered by the MIT code licence).',
  ],
};

/**
 * Licence records (spec §8): exact licence, licence link, the attribution
 * line the app shows, and the date the permission was last reviewed.
 * `commercialUse` lives in SOURCE_POLICY; commercial-safe mode reads it.
 */
export const PERMISSION_REVIEWED_AT = '2026-09-28';
const CC_BY_4 = 'https://creativecommons.org/licenses/by/4.0/';
const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
const USPD = 'https://www.usa.gov/government-copyright';
const lic = (
  license,
  licenseUrl,
  attribution,
  reviewedAt = PERMISSION_REVIEWED_AT,
) => Object.freeze({ license, licenseUrl, attribution, reviewedAt });
const LICENSE_RECORDS = {
  flights: lic(
    'OpenSky Network terms (non-commercial research/education); adsb.lol ODbL 1.0',
    'https://opensky-network.org/about/terms-of-use',
    'OpenSky Network; adsb.lol contributors (ODbL)',
  ),
  military: lic('ODbL 1.0', ODBL_URL, 'adsb.lol contributors (ODbL)'),
  'local-adsb': lic('Your own receiver data', null, 'Your own receiver'),
  'ais-live-vessels': lic(
    'AISStream terms of service (not yet reviewed)',
    'https://aisstream.io/',
    'AISStream',
  ),
  earthquakes: lic('U.S. public domain', USPD, 'U.S. Geological Survey'),
  'fire-perimeters': lic(
    'U.S. public domain (NIFC open data)',
    'https://data-nifc.opendata.arcgis.com/',
    'National Interagency Fire Center (WFIGS)',
  ),
  'local-firms': lic(
    'NASA open data (citation requested)',
    'https://www.earthdata.nasa.gov/engage/open-data-services-software-policies',
    'NASA FIRMS',
  ),
  satellites: lic(
    'CelesTrak public GP data (citation requested; commercial terms not stated)',
    'https://celestrak.org/',
    'CelesTrak',
  ),
  'rocket-launches': lic(
    'The Space Devs Launch Library 2 terms ("free to use the data in any way")',
    'https://thespacedevs.com/llapi',
    'The Space Devs Launch Library 2',
  ),
  traffic: lic(
    'ODbL 1.0 (roads only; vehicle dots simulated)',
    ODBL_URL,
    '© OpenStreetMap contributors',
  ),
  cctv: lic(
    'Per provider (see /api/cctv/permissions and each camera card)',
    null,
    'Each camera credits its agency in the CCTV browser',
  ),
  radio: lic(
    'Radio Browser directory (public domain)',
    'https://www.radio-browser.info/',
    'Radio Browser',
  ),
  transit: lic(
    'Per operator open-data licence (MBTA, CapMetro, Metro Transit, HSL CC BY 4.0, OVapi, Entur NLOD, TransLink)',
    null,
    'Each transit operator (see layer)',
  ),
  bikeshare: lic(
    'Per-system GBFS data licence agreements (not yet reviewed)',
    null,
    'Each GBFS operator',
  ),
  directions: lic(
    'ODbL 1.0 data; FOSSGIS OSRM usage policy',
    'https://routing.openstreetmap.de/about.html',
    'OSRM on FOSSGIS servers; © OpenStreetMap contributors',
  ),
  'recent-imagery': lic(
    'NASA open data; Copernicus Sentinel free and open data',
    'https://www.earthdata.nasa.gov/engage/open-data-services-software-policies',
    'NASA GIBS / Earthdata; contains modified Copernicus Sentinel data',
  ),
  'military-installations': lic(
    'ODbL 1.0',
    ODBL_URL,
    '© OpenStreetMap contributors; OpenFreeMap / OpenMapTiles',
  ),
  'military-awareness': lic(
    'Composite (each contributing layer keeps its own licence)',
    null,
    'Composite of the layers you have on',
  ),
  'alpr-cameras': lic('ODbL 1.0', ODBL_URL, '© OpenStreetMap contributors'),
  wind: lic(
    'U.S. public domain (NOAA GFS); CC BY 4.0 (ECMWF open data)',
    CC_BY_4,
    'NOAA GFS; ECMWF open data (CC BY 4.0)',
  ),
  'weather-radar': lic('U.S. public domain', USPD, 'NOAA/NWS nowCOAST (MRMS)'),
  'weather-satellite': lic(
    'U.S. public domain',
    USPD,
    'NOAA/NWS nowCOAST (GOES)',
  ),
  'weather-lightning': lic(
    'NOAA nowCOAST public display; Vaisala-derived (no export, caching or redistribution)',
    'https://nowcoast.noaa.gov/',
    'NOAA/NWS nowCOAST; derived from Vaisala NLDN/GLD360',
  ),
  'weather-alerts': lic(
    'U.S. public domain',
    USPD,
    'National Weather Service / NOAA',
  ),
  'weather-cyclones': lic(
    'U.S. public domain',
    USPD,
    'NOAA National Hurricane Center / CPHC',
  ),
  'local-datacenters': lic(
    'ODbL 1.0',
    ODBL_URL,
    '© OpenStreetMap contributors',
  ),
  'local-dams': lic(
    'ODbL 1.0',
    ODBL_URL,
    '© OpenStreetMap contributors; OpenInfraMap',
  ),
  'telegeography-submarine-cables': lic(
    'CC BY-NC-SA 3.0',
    'https://creativecommons.org/licenses/by-nc-sa/3.0/',
    '© TeleGeography — submarinecablemap.com (CC BY-NC-SA 3.0)',
  ),
  'bhote-koshi-2026': lic(
    'CC BY-NC 4.0',
    'https://creativecommons.org/licenses/by-nc/4.0/',
    'Vantor Open Data Program imagery; GeoPera reconstruction (CC BY-NC 4.0)',
  ),
  'bhote-koshi-locator': lic(
    'CC BY-NC 4.0',
    'https://creativecommons.org/licenses/by-nc/4.0/',
    'GeoPera river centerline (CC BY-NC 4.0)',
  ),
};

/**
 * Runtime services, basemaps and bundled reference data that are not layers
 * but still need attribution and a licence boundary. The Attribution &
 * Licenses panel renders these next to the layer sources.
 */
const svc = (
  id,
  name,
  usedFor,
  license,
  licenseUrl,
  attribution,
  commercialUse,
  sourceUrl = licenseUrl,
) =>
  Object.freeze({
    id,
    name,
    usedFor,
    license,
    licenseUrl,
    attribution,
    commercialUse,
    commercialRestricted: !['allowed', 'n/a'].includes(commercialUse),
    sourceUrl,
    reviewedAt: '2026-09-28',
  });
export const SERVICE_SOURCES = Object.freeze([
  svc(
    'esri-world-imagery',
    'Esri World Imagery',
    'Default basemap',
    'Esri Master Agreement / terms of use',
    'https://www.esri.com/en-us/legal/terms/full-master-agreement',
    'Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    'unknown',
    'https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9',
  ),
  svc(
    'osm-tiles',
    'OpenStreetMap tiles',
    'OSM map stack',
    'ODbL 1.0 data; OSMF tile usage policy',
    'https://operations.osmfoundation.org/policies/tiles/',
    '© OpenStreetMap contributors',
    'unknown',
    'https://www.openstreetmap.org/copyright',
  ),
  svc(
    'cesium-ion',
    'Cesium ion Community',
    'Google Photoreal 3D (ion) + Bing stacks + world terrain (only with a key)',
    'Cesium ion Community tier: non-commercial / evaluation',
    'https://cesium.com/legal/terms-of-service/',
    'Cesium ion; Bing Maps',
    'non-commercial',
  ),
  svc(
    'google-maps-platform',
    'Google Maps Platform',
    'Google Photorealistic 3D (direct Map Tiles) + Places/Street View (metered; only with a key)',
    'Google Maps Platform terms (owner key and billing)',
    'https://cloud.google.com/maps-platform/terms',
    'Google',
    'unknown',
  ),
  svc(
    'reearth-terrain',
    'Re:Earth / Mapterhorn terrain',
    'Keyless terrain',
    'Provider terms (open elevation data)',
    'https://mapterhorn.com/',
    'Mapterhorn; Re:Earth',
    'unknown',
  ),
  svc(
    'photon-nominatim',
    'Photon (komoot) and Nominatim',
    'Place search and reverse geocoding',
    'ODbL 1.0 data; fair-use policies (Nominatim 1 req/s, no bulk)',
    'https://operations.osmfoundation.org/policies/nominatim/',
    '© OpenStreetMap contributors; komoot Photon',
    'unknown',
  ),
  svc(
    'overpass',
    'Overpass API',
    'Military installations and other OSM queries',
    'ODbL 1.0 data; public-instance usage policy',
    'https://wiki.openstreetmap.org/wiki/Overpass_API',
    '© OpenStreetMap contributors',
    'unknown',
  ),
  svc(
    'adsbdb',
    'adsbdb',
    'Aircraft and route enrichment',
    'No licence published (in-memory use only)',
    'https://www.adsbdb.com/',
    'adsbdb.com',
    'unknown',
  ),
  svc(
    'open-meteo',
    'Open-Meteo',
    'Cockpit weather',
    'Data CC BY 4.0; free API non-commercial only',
    'https://open-meteo.com/en/terms',
    'Weather data by Open-Meteo.com (CC BY 4.0)',
    'non-commercial',
  ),
  svc(
    'google-news-rss',
    'Google News RSS',
    'Cockpit regional news',
    'Personal, non-commercial use only',
    'https://news.google.com/',
    'Google News',
    'non-commercial',
  ),
  svc(
    'gdelt',
    'GDELT DOC 2.0',
    'Regional news fallback',
    'Unrestricted use with citation',
    'https://www.gdeltproject.org/about.html#termsofuse',
    'The GDELT Project',
    'allowed',
  ),
  svc(
    'natural-earth',
    'Natural Earth',
    'Bundled region outlines',
    'Public domain',
    'https://www.naturalearthdata.com/about/terms-of-use/',
    'Made with Natural Earth',
    'allowed',
  ),
  svc(
    'datasf-neighborhoods',
    'DataSF Analysis Neighborhoods',
    'Bundled neighbourhood outlines',
    'PDDL 1.0',
    'https://opendatacommons.org/licenses/pddl/1-0/',
    'DataSF',
    'allowed',
  ),
  svc(
    'airports',
    'Airport reference points',
    'Bundled aerodrome list (src/atlas/airports.js)',
    'Public aerodrome facts, hand-curated (no source cited yet)',
    null,
    'Earth Eye (curated public facts)',
    'allowed',
  ),
  svc(
    'cctv-ground-heights',
    'CCTV ground heights',
    'Bundled camera placement heights',
    'Derived from Google Photorealistic 3D Tiles (Google Maps Platform terms; replacement scheduled)',
    'https://cloud.google.com/maps-platform/terms',
    'Google',
    'unknown',
  ),
]);

/** commercialUse values that commercial-safe mode keeps on. */
const COMMERCIAL_SAFE_VALUES = new Set(['allowed', 'n/a', 'per provider']);

/** Operator disable switches (flip to true to turn a source off everywhere). */
const DISABLED = Object.freeze({});

/** Default user-facing disclaimer per class. */
export const CLASS_DISCLAIMER = Object.freeze({
  LIVE: 'Public data; can be delayed, incomplete or wrong. Not for navigation, emergency or safety decisions.',
  'NEAR LIVE':
    'Public data, minutes old; can be incomplete or wrong. Not for navigation, emergency or safety decisions.',
  'REFRESHED STILL':
    'Delayed public agency images. No recognition of any kind; not for surveillance, policing or emergency use.',
  'VIDEO CLIP':
    'A short recorded clip from a public agency, not live. Not for surveillance, policing or emergency use.',
  'DAILY / PERIODIC':
    'Published on a schedule, so it can be hours old. Not for emergency or safety decisions.',
  SNAPSHOT: 'A fixed extract that can be out of date. For context only.',
  MODEL:
    'Model forecast, not an observation. Not for navigation or safety decisions.',
  SIMULATED: 'Simulated for illustration. Not real data.',
  'KEY REQUIRED':
    'No data: this source needs a provider key that is not set on this server.',
  'BROKEN / UNAVAILABLE':
    'No current data: the provider could not be reached. Nothing is substituted.',
});

function policyFields(id) {
  const p = SOURCE_POLICY[id];
  if (!p) {
    return {
      deliveryType: 'unknown',
      freshness: 'unknown',
      permissions: perms(U, U, U, U, U, U),
      commercialUse: U,
      aiUse: U,
      review: 'pending',
      permissionEvidence: 'Not reviewed.',
      reviewedAt: null,
      licenseUrl: null,
      attribution: null,
      commercialRestricted: true,
      excluded: false,
      disabled: true,
    };
  }
  const [
    deliveryType,
    freshness,
    permissions,
    commercialUse,
    aiUse,
    review,
    evidence,
  ] = p;
  return {
    deliveryType,
    freshness,
    permissions,
    commercialUse,
    aiUse,
    review,
    permissionEvidence: evidence,
    ...(LICENSE_RECORDS[id] || {}),
    // Commercial-safe mode turns off anything not affirmatively allowed for
    // commercial use (non-commercial, unknown, per-operator terms).
    commercialRestricted: !COMMERCIAL_SAFE_VALUES.has(commercialUse),
    // Excluded by locked policy (ALPR, simulated traffic). Radio/COMMS uses pending + provider statuses.
    excluded: review === 'excluded' || review === 'blocked',
    // Unclear sources stay disabled pending review (spec §3).
    disabled:
      Boolean(DISABLED[id]) ||
      review !== 'approved' ||
      permissions.display !== 'yes',
  };
}

/**
 * Registry entries. Every entry has: layerId, name, group, provider,
 * sourceUrl, credit, endpoint, cadence, pollMs, classification, coverage,
 * limitation (alias limitations), safeToSummarize, disclaimer, keyed?, license?.
 */
export const DATA_SOURCES = Object.freeze(
  Object.fromEntries(
    Object.entries(BASE_SOURCES).map(([id, e]) => {
      const x = SOURCE_EXTRA[id] || {};
      return [
        id,
        Object.freeze({
          layerId: id,
          ...e,
          sourceUrl: x.sourceUrl ?? null,
          credit: x.credit || e.license || e.provider,
          limitations: e.limitation,
          safeToSummarize: x.safeToSummarize !== false,
          disclaimer: x.disclaimer || CLASS_DISCLAIMER[e.classification],
          ...policyFields(id),
        }),
      ];
    }),
  ),
);

/** Look up a registry entry; unknown layers get an honest generic entry. */
export function sourceFor(layerId, fallbackName = '') {
  return (
    DATA_SOURCES[layerId] || {
      name: fallbackName || layerId,
      group: 'Other',
      provider: 'not in the registry',
      endpoint: '—',
      cadence: 'unknown',
      pollMs: 0,
      classification: 'SNAPSHOT',
      coverage: 'unknown',
      limitation: 'Not yet audited; treat as unverified.',
      limitations: 'Not yet audited; treat as unverified.',
      layerId,
      sourceUrl: null,
      credit: 'unknown',
      safeToSummarize: false,
      disclaimer: 'Not yet audited; treat as unverified.',
      ...policyFields(layerId),
    }
  );
}

/**
 * Whether a layer may be turned on: approved terms, display permission, and
 * not switched off. Layers the registry has never audited are not blocked
 * here (they are upstream internals), only marked unverified.
 */
export function isSourceAllowed(layerId, options = {}) {
  return !disabledReason(layerId, options);
}

/**
 * Plain-language reason a source is disabled ('' when allowed). Order:
 * locked-policy exclusions (dev-only flag may lift ALPR/traffic in a dev
 * build, never in production), operator switch, permission review, then
 * commercial-safe mode.
 * @param {string} layerId
 * @param {{commercialSafe?: boolean, devExcluded?: boolean}} [options]
 */
export function disabledReason(layerId, options = {}) {
  const e = DATA_SOURCES[layerId];
  if (!e) return '';
  const devExcluded = options.devExcluded ?? devExcludedFeaturesEnabled();
  const devLifted = devExcluded && DEV_ONLY_LAYER_IDS.includes(layerId);
  if (e.review === 'blocked')
    return e.permissionEvidence || 'Blocked by locked policy.';
  if (e.review === 'excluded' && !devLifted) return e.permissionEvidence;
  if (DISABLED[layerId]) return 'Switched off by the operator.';
  if (
    e.disabled &&
    !(devLifted && e.review === 'excluded' && e.permissions.display === 'yes')
  )
    return `Disabled pending permission review: ${e.permissionEvidence}`;
  const commercialSafe = options.commercialSafe ?? commercialSafeMode();
  if (commercialSafe && e.commercialRestricted)
    return `Off in commercial-safe mode: ${e.license || 'licence'} (commercial use: ${e.commercialUse}).`;
  return '';
}

let commercialSafeState = false;
const commercialSafeListeners = new Set();

/**
 * Commercial-safe mode: ONE switch that turns off every dataset whose licence
 * does not affirmatively allow commercial use. Off by default (Earth Eye is a
 * private, non-commercial instance). The server reads EE_COMMERCIAL_SAFE=1
 * and reports it on /api/atlas/policy; the client applies it here.
 */
export function commercialSafeMode() {
  return commercialSafeState;
}

/** Set commercial-safe mode; returns the ids that became disabled. */
export function setCommercialSafeMode(on) {
  const next = on === true;
  if (next === commercialSafeState) return [];
  commercialSafeState = next;
  const affected = restrictedSourceIds();
  for (const listener of commercialSafeListeners) {
    try {
      listener(next, affected);
    } catch {
      /* listener errors never block the switch */
    }
  }
  return next ? affected : [];
}

/** Observe commercial-safe changes. */
export function onCommercialSafeChange(listener) {
  if (typeof listener !== 'function') return () => {};
  commercialSafeListeners.add(listener);
  return () => commercialSafeListeners.delete(listener);
}

/** Layer ids commercial-safe mode disables. */
export function restrictedSourceIds() {
  return Object.values(DATA_SOURCES)
    .filter((e) => e.commercialRestricted)
    .map((e) => e.layerId);
}

const text = (v) => (typeof v === 'string' ? v : '');
const errorOf = (stats) =>
  text(stats.error) || text(stats.lastError) || text(stats.managerRefreshError);

/**
 * Which aircraft feed is serving right now (flights layer).
 * @param {object} stats
 * @returns {'OpenSky'|'adsb.lol fallback'|'unknown'}
 */
export function activeFlightFeed(stats = {}) {
  const s = `${text(stats.source)} ${text(stats.coverage)}`;
  if (/adsb\.lol/i.test(s)) return 'adsb.lol fallback';
  if (/opensky/i.test(s)) return 'OpenSky';
  return 'unknown';
}

/**
 * Which fire product is on screen (FIRMS layer).
 * @param {object} stats
 * @returns {'FIRMS API (keyed)'|'NASA 24 h files (keyless)'|'key required'|'unknown'}
 */
export function activeFireFeed(stats = {}) {
  if (stats.keyRequired) return 'key required';
  if (stats.fallback === true || /24h|keyless/i.test(text(stats.source)))
    return 'NASA 24 h files (keyless)';
  if (Number(stats.count) > 0 || stats.lastUpdate) return 'FIRMS API (keyed)';
  return 'unknown';
}

/**
 * The honest, current classification of a layer: the registry's base class
 * adjusted by what the layer is actually reporting (key missing, fetch
 * failing, simulation vs keyed flow, CelesTrak unreachable, …).
 *
 * @param {string} layerId
 * @param {object} [stats] - dataManager layer stats.
 * @param {{enabled?: boolean}} [opts]
 * @returns {{classification: string, tone: string, fallback: string|null,
 *   feed: string|null, reason: string}}
 */
export function classifyLayer(layerId, stats = {}, { enabled = true } = {}) {
  const entry = sourceFor(layerId);
  const s = stats || {};
  const error = errorOf(s);
  const status = text(s.status).toLowerCase();
  const label = `${text(s.loadingLabel)} ${error}`.toUpperCase();
  let classification = entry.classification;
  let fallback = null;
  let feed = null;
  let reason = '';

  if (entry.keyed && (s.keyRequired || /KEY REQUIRED|NOT SET/.test(label)))
    classification = 'KEY REQUIRED';

  switch (layerId) {
    case 'traffic':
      // Keyless = no fake cars. Only real TomTom flow upgrades it.
      if (s.mode === 'sim' || !/tomtom/i.test(text(s.source))) {
        classification = 'KEY REQUIRED';
        reason =
          'TomTom key required for road conditions; no simulated cars.';
      } else classification = entry.keyed.classification;
      break;
    case 'flights':
      feed = activeFlightFeed(s);
      if (feed === 'adsb.lol fallback')
        fallback = `adsb.lol regional (${text(s.coverage) || '250 nm'})`;
      break;
    case 'local-firms':
      feed = activeFireFeed(s);
      if (feed === 'NASA 24 h files (keyless)')
        fallback = 'NASA FIRMS public 24 h files';
      if (feed === 'key required') classification = 'KEY REQUIRED';
      break;
    case 'ais-live-vessels':
      if (Number(s.count) > 0 && !error) classification = 'LIVE';
      else if (/AISSTREAM_API_KEY|KEY/i.test(error) || !s.lastUpdate)
        classification = 'KEY REQUIRED';
      break;
    case 'satellites':
      // CelesTrak or unavailable. AMSAT is only ever used when the operator
      // sets TLE_AMSAT_FALLBACK=1, and then it reads FALLBACK by name.
      if (/amsat/i.test(text(s.source))) {
        fallback = 'AMSAT TLEs (operator opt-in, not CelesTrak)';
        reason = text(s.source);
      } else if (/cached celestrak/i.test(text(s.source))) {
        fallback = text(s.source);
        reason = 'CelesTrak unreachable; showing the last real CelesTrak copy.';
      }
      if (status === 'unavailable' || /celestrak unreachable/i.test(error)) {
        if (!(Number(s.count) > 0)) classification = 'BROKEN / UNAVAILABLE';
        reason = reason || 'CelesTrak unreachable from the server.';
      }
      break;
    case 'local-adsb': {
      // Single coherent status from actual health — never LIVE and BROKEN at once.
      // Catalog class is LIVE (capability). Runtime:
      //   layer OFF → keep catalog LIVE (health badge says OFF separately)
      //   streaming/live with or without aircraft → LIVE
      //   enabled but no receiver / error / unreachable → BROKEN / UNAVAILABLE
      const hasAircraft = Number(s.count) > 0;
      const streaming =
        ['streaming', 'live', 'nominal'].includes(status) ||
        /\blive\b|streaming|heard/i.test(label);
      if (!enabled) {
        classification = entry.classification;
        reason = entry.unavailableByDefault || '';
      } else if (hasAircraft || (streaming && !error)) {
        classification = 'LIVE';
        reason = hasAircraft
          ? ''
          : 'Receiver answering; no aircraft heard right now.';
      } else {
        classification = 'BROKEN / UNAVAILABLE';
        reason = error || entry.unavailableByDefault || 'No receiver attached.';
      }
      break;
    }
    default:
      break;
  }

  const hasData = Number(s.count) > 0 || Boolean(s.lastUpdate);
  if (
    enabled &&
    classification !== 'KEY REQUIRED' &&
    (['unavailable', 'offline', 'down', 'error'].includes(status) ||
      (error && !hasData))
  ) {
    classification = 'BROKEN / UNAVAILABLE';
    reason = reason || error || 'Provider unavailable';
  }
  return {
    classification,
    tone: CLASSIFICATION_TONE[classification] || 'muted',
    fallback,
    feed,
    reason,
  };
}

/**
 * Source-health states (Earth Eye §2). Every live source is in exactly one:
 *   online        enabled, last refresh succeeded within the stale window
 *   degraded      serving a fallback or the last good data after an error
 *   offline       the provider failed and there is no data, or it has not
 *                 answered at all since the layer was turned on
 *   key required  the provider needs a key that is not set (or was refused)
 *   rate limited  the provider answered 429 / "rate limit"
 *   stale         no error, but the last success is older than the window
 * Plus non-live states: off (layer off, not polled), connecting (first
 * request in flight), disabled (policy/permission) and static (bundled file).
 * A dead provider can never read as "no activity": zero records only shows
 * as online when a refresh actually succeeded.
 */
export const HEALTH_STATES = Object.freeze([
  'online',
  'degraded',
  'offline',
  'key required',
  'rate limited',
  'stale',
]);
export const HEALTH_TONE = Object.freeze({
  online: 'live',
  degraded: 'warn',
  offline: 'bad',
  'key required': 'bad',
  'rate limited': 'warn',
  stale: 'warn',
  off: 'muted',
  connecting: 'info',
  disabled: 'muted',
  static: 'muted',
});
const RATE_LIMIT_RE = /\b429\b|rate[ -]?limit|too many requests|cooling down/i;
const KEY_RE =
  /\b401\b|invalid (api )?key|api[ _-]?key|unauthori[sz]ed|key (is )?(missing|required|not set|rejected)|KEY REQUIRED|NOT SET/i;
const STATIC_DELIVERY = /bundled file|composite/i;

/** Window after which a successful source counts as stale (ms). */
export function staleAfterMs(entry) {
  const poll = Number(entry?.pollMs) || 0;
  if (!poll) return Infinity;
  return Math.max(3 * poll, 120_000);
}

/** How long a just-enabled source may take before "no answer" = offline. */
export function firstAnswerTimeoutMs(entry) {
  const poll = Number(entry?.pollMs) || 0;
  return Math.max(2 * poll, 45_000);
}

/**
 * Health of one source.
 * @param {string} layerId
 * @param {object} stats Layer stats (dataManager.getAll()[i].stats).
 * @param {{enabled?:boolean, now?:number, lastSuccessAt?:number|null,
 *   lastAttemptAt?:number|null, enabledAt?:number|null,
 *   classification?:object, disabledReason?:string}} [o]
 */
export function sourceHealth(layerId, stats = {}, o = {}) {
  const entry = sourceFor(layerId);
  const s = stats || {};
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const cls = o.classification || classifyLayer(layerId, s, o);
  const error = errorOf(s);
  const lastSuccessAt = Number.isFinite(o.lastSuccessAt)
    ? o.lastSuccessAt
    : null;
  const attempts = [o.lastAttemptAt, s.managerLastAttemptAt, s.lastAttemptAt]
    .map(Number)
    .filter((v) => Number.isFinite(v) && v > 0);
  const lastAttemptAt = attempts.length ? Math.max(...attempts) : null;
  const base = {
    provider: entry.provider,
    lastSuccessAt,
    lastAttemptAt,
  };
  const out = (state, detail) =>
    Object.freeze({
      ...base,
      state,
      label: state.toUpperCase(),
      tone: HEALTH_TONE[state] || 'muted',
      detail,
    });
  const reason =
    o.disabledReason ?? (DATA_SOURCES[layerId] ? disabledReason(layerId) : '');
  if (reason) return out('disabled', reason);
  if (cls.classification === 'KEY REQUIRED')
    return out(
      'key required',
      entry.keyed?.env
        ? `Needs ${entry.keyed.env} on the server; no data is shown.`
        : 'The provider needs a key that is not set; no data is shown.',
    );
  // A failed enable leaves the layer off but must still show the failure.
  const failedEnable = !o.enabled && Boolean(error) && lastAttemptAt != null;
  if (!o.enabled && !failedEnable) {
    if (STATIC_DELIVERY.test(entry.deliveryType || ''))
      return out('static', 'Bundled with the app; no live provider.');
    return out('off', 'Layer off: the provider is not being polled.');
  }
  if (STATIC_DELIVERY.test(entry.deliveryType || '') && !error)
    return out('static', 'Bundled with the app; no live provider.');
  if (error && RATE_LIMIT_RE.test(error))
    return out(
      'rate limited',
      `${entry.provider} is rate limiting requests (${error}).${lastSuccessAt ? ' Showing the last good data.' : ' No data yet.'}`,
    );
  if (error && KEY_RE.test(error))
    return out('key required', `${entry.provider} refused the key: ${error}`);
  if (error && lastSuccessAt && Number(s.count) > 0)
    return out(
      'degraded',
      `Refresh failed (${error}); showing the last good data.`,
    );
  if (error || cls.classification === 'BROKEN / UNAVAILABLE')
    return out(
      'offline',
      `${entry.provider} is not answering: ${error || cls.reason || 'provider unavailable'}.`,
    );
  if (cls.fallback)
    return out(
      'degraded',
      `Primary provider unavailable; using ${cls.fallback}.`,
    );
  if (lastSuccessAt) {
    const observed = Number(s.observedAt ?? s.observationTime ?? s.dataTime);
    const window = staleAfterMs(entry);
    const newest =
      Number.isFinite(observed) && observed > 0
        ? Math.min(observed, lastSuccessAt)
        : lastSuccessAt;
    if (now - newest > window)
      return out(
        'stale',
        `No fresh data for ${relativeAge(now - newest).replace(' ago', '')} (expected every ${Math.round((Number(entry.pollMs) || 0) / 1000)} s).`,
      );
    return out(
      'online',
      Number(s.count) === 0
        ? 'Provider answered: no records in view right now.'
        : 'Provider answering normally.',
    );
  }
  const since = [o.enabledAt, lastAttemptAt]
    .map(Number)
    .filter((v) => Number.isFinite(v) && v > 0);
  const started = since.length ? Math.min(...since) : null;
  if (started && now - started > firstAnswerTimeoutMs(entry))
    return out(
      'offline',
      `${entry.provider} has not answered since ${chicagoClock(started)}.`,
    );
  return out('connecting', 'Waiting for the first answer from the provider.');
}

/**
 * Remembers the last successful refresh per layer for this browser session,
 * so an error after a good load still shows when data last arrived.
 */
export function createRefreshTracker(now = () => Date.now()) {
  const last = new Map();
  const errors = new Map();
  return {
    /** Record one observation of a layer's stats. */
    observe(layerId, stats = {}) {
      const s = stats || {};
      const ts = Number(s.lastUpdate);
      const error = errorOf(s);
      if (Number.isFinite(ts) && ts > 0 && ts <= now() + 60_000) {
        if (!last.has(layerId) || ts > last.get(layerId)) last.set(layerId, ts);
      }
      if (error) errors.set(layerId, { message: error, at: now() });
      else if (Number.isFinite(ts)) errors.delete(layerId);
    },
    lastSuccess: (layerId) => last.get(layerId) ?? null,
    lastError: (layerId) => errors.get(layerId) ?? null,
  };
}

/**
 * Read-only source-status store: the one place layers report into and every
 * reader (Data Sources screen, layer badges, and future panels) reads from.
 *
 *   const store = createSourceStatusStore();
 *   store.report('flights', { stats, enabled: true });   // layers report in
 *   store.reportLayers(dataManager.getAll());            // or all at once
 *   store.getSourceStatus('flights');   // frozen status object
 *   store.getSourceStatus();            // frozen array, every registry entry
 *   const off = store.subscribe((all) => …);  // called on every change
 *
 * Each status object: layerId (and id), name, group, provider, sourceUrl,
 * credit, status (one of CLASSIFICATIONS), tone, lastSuccess (= lastSuccessAt,
 * epoch ms or null; real observations only), cadence, coverage, limitations
 * (= limitation), enabled, safeToSummarize, failed + error, lastError
 * ({message, at} or null), disclaimer (user-facing text), feed, fallback,
 * count, reason, endpoint, license, keyEnv, pollMs. Readers can never mutate
 * the store.
 */
export function createSourceStatusStore({ now = () => Date.now() } = {}) {
  const tracker = createRefreshTracker(now);
  const reported = new Map(); // id -> { stats, enabled, name }
  const listeners = new Set();
  let cache = null;
  let pending = false;

  const enabledSince = new Map();
  const build = (id) => {
    const r = reported.get(id) || { stats: {}, enabled: false, name: '' };
    const entry = sourceFor(id, r.name);
    const stats = r.stats || {};
    const cls = classifyLayer(id, stats, { enabled: r.enabled });
    const count = Number(stats.count);
    const error = errorOf(stats) || null;
    const status = cls.classification;
    const failed =
      status === 'BROKEN / UNAVAILABLE' || Boolean(r.enabled && error);
    const noData = ['BROKEN / UNAVAILABLE', 'KEY REQUIRED', 'SIMULATED'];
    const observed = Number(
      stats.observedAt ?? stats.observationTime ?? stats.dataTime ?? NaN,
    );
    const published = Number(
      stats.publishedAt ?? stats.publicationTime ?? stats.pubTime ?? NaN,
    );
    const managerSuccess = Number(stats.managerLastSuccessAt);
    const lastSuccessAt =
      tracker.lastSuccess(id) ??
      (Number.isFinite(managerSuccess) && managerSuccess > 0
        ? managerSuccess
        : null);
    const reason = disabledReason(id);
    const health = sourceHealth(id, stats, {
      enabled: r.enabled,
      now: now(),
      lastSuccessAt,
      enabledAt: enabledSince.get(id) ?? null,
      classification: cls,
      disabledReason: reason,
    });
    return Object.freeze({
      id,
      layerId: id,
      deliveryType: entry.deliveryType || 'unknown',
      freshness: entry.freshness || 'unknown',
      // Retrieval time = when this browser last received data. Observation
      // time only when the layer reports the provider's own time; otherwise
      // null, shown as "unknown" (spec §4: never substitute one for the other).
      retrievedAt: tracker.lastSuccess(id) ?? lastSuccessAt,
      // Three clocks stay separate (product standard): observation ≠ publication ≠ retrieval.
      observedAt: Number.isFinite(observed) && observed > 0 ? observed : null,
      publishedAt:
        Number.isFinite(published) && published > 0 ? published : null,
      recordClass: deriveRecordClass(entry),
      permissions: entry.permissions || null,
      commercialUse: entry.commercialUse || 'unknown',
      aiUse: entry.aiUse || 'unknown',
      review: entry.review || 'pending',
      permissionEvidence: entry.permissionEvidence || '',
      disabled: Boolean(reason),
      disabledReason: reason,
      health: health.state,
      healthLabel: health.label,
      healthTone: health.tone,
      healthDetail: health.detail,
      lastAttemptAt: health.lastAttemptAt,
      reviewedAt: entry.reviewedAt || null,
      licenseUrl: entry.licenseUrl || null,
      attribution: entry.attribution || null,
      commercialRestricted: Boolean(entry.commercialRestricted),
      excluded: Boolean(entry.excluded),
      sourceUrl: entry.sourceUrl ?? null,
      credit: entry.credit || entry.license || entry.provider,
      lastSuccess: tracker.lastSuccess(id),
      limitations: entry.limitation || '',
      failed,
      safeToSummarize:
        entry.safeToSummarize !== false && !failed && !noData.includes(status),
      disclaimer: noData.includes(status)
        ? CLASS_DISCLAIMER[status]
        : entry.disclaimer || CLASS_DISCLAIMER[status] || '',
      name: entry.name || r.name || id,
      group: entry.group || 'Other',
      provider: entry.provider,
      status: cls.classification,
      tone: cls.tone,
      feed: cls.feed && cls.feed !== 'unknown' ? cls.feed : null,
      fallback: cls.fallback,
      enabled: Boolean(r.enabled),
      count: r.enabled && Number.isFinite(count) ? count : null,
      lastSuccessAt,
      lastError: tracker.lastError(id)
        ? Object.freeze({ ...tracker.lastError(id) })
        : null,
      error,
      cadence: entry.cadence,
      pollMs: entry.pollMs || 0,
      coverage: entry.coverage || 'unknown',
      limitation: entry.limitation || '',
      reason: cls.reason || '',
      endpoint: entry.endpoint,
      license: entry.license || '',
      keyEnv: entry.keyed?.env || null,
    });
  };

  const snapshot = () => {
    if (cache) return cache;
    const ids = [...Object.keys(DATA_SOURCES)];
    for (const id of reported.keys()) if (!ids.includes(id)) ids.push(id);
    cache = Object.freeze(ids.map(build));
    return cache;
  };

  const notify = () => {
    if (pending) return;
    pending = true;
    const run = () => {
      pending = false;
      const all = snapshot();
      for (const cb of [...listeners]) {
        try {
          cb(all);
        } catch {
          /* a broken reader must not stop the others */
        }
      }
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else Promise.resolve().then(run);
  };

  const signature = (id) => JSON.stringify(build(id));

  function report(id, { stats = {}, enabled = false, name = '' } = {}) {
    if (!id) return;
    const before = reported.has(id) ? signature(id) : '';
    tracker.observe(id, stats || {});
    if (enabled && !enabledSince.has(id)) enabledSince.set(id, now());
    if (!enabled) enabledSince.delete(id);
    reported.set(id, { stats: { ...(stats || {}) }, enabled, name });
    if (signature(id) !== before) {
      cache = null;
      notify();
    }
  }

  return Object.freeze({
    report,
    /** Report every layer from dataManager.getAll(). */
    reportLayers(layers = []) {
      for (const l of layers || [])
        if (l?.id)
          report(l.id, {
            stats: l.stats || {},
            enabled: Boolean(l.enabled),
            name: l.name || '',
          });
    },
    getSourceStatus(id) {
      if (id === undefined) return snapshot();
      return snapshot().find((s) => s.id === id) || null;
    },
    subscribe(cb) {
      if (typeof cb !== 'function') return () => {};
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    lastSuccess: (id) => tracker.lastSuccess(id),
    lastError: (id) => tracker.lastError(id),
    /** Re-evaluate time-based health (stale / no answer) and notify. */
    tick() {
      const before = cache;
      cache = null;
      if (JSON.stringify(snapshot()) !== JSON.stringify(before)) notify();
    },
  });
}

/** "12 s ago" / "4 min ago" / "3 h ago" (relative, for the status screen). */
export function relativeAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** hh:mm:ss in America/Chicago with a CT label (Ruben's zone). */
export function chicagoClock(ts, { seconds = true } = {}) {
  if (!Number.isFinite(ts)) return '—';
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12: false,
  });
  return `${f.format(new Date(ts))} CT`;
}
