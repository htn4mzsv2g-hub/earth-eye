/**
 * Earth Eye provider registry: every environment variable the server and
 * browser read, grouped for the Provider Settings panel. Pure data; the
 * server status endpoint reports only set/unset per name, never a value.
 *
 * cost: 'free' = free account/key, 'metered' = billing-enabled account,
 *       'none' = no account (a plain setting).
 * kind: 'secret' = a credential, 'setting' = a non-secret tuning value.
 */
const v = (name, kind, unlocks, extra = {}) =>
  Object.freeze({
    name,
    kind,
    unlocks,
    cost: kind === 'secret' ? 'free' : 'none',
    ...extra,
  });

export const ATLAS_PROVIDER_GROUPS = Object.freeze([
  Object.freeze({
    id: 'map',
    title: 'Globe, 3D tiles and search',
    vars: Object.freeze([
      v(
        'GOOGLE_MAPS_API_KEY',
        'secret',
        'Google Photorealistic 3D Tiles and Google geocoding in search. Sent to the browser by design; restrict by HTTP referrer.',
        {
          cost: 'metered',
          clientExposed: true,
          getUrl:
            'https://developers.google.com/maps/documentation/tile/get-api-key',
        },
      ),
      v(
        'GOOGLE_MAPS_SERVER_API_KEY',
        'secret',
        'Optional separate server-only key for Places context and the CCTV Street View fallback. Falls back to GOOGLE_MAPS_API_KEY.',
        {
          cost: 'metered',
          getUrl:
            'https://developers.google.com/maps/documentation/places/web-service/get-api-key',
        },
      ),
      v(
        'CESIUM_ION_TOKEN',
        'secret',
        'Cesium World Terrain, Bing imagery stacks and ion-hosted Google 3D. Free community plan for eligible personal use. Sent to the browser; use an assets:read token with URL limits.',
        { clientExposed: true, getUrl: 'https://ion.cesium.com/tokens' },
      ),
      v(
        'GEV_RATELIMIT_GOOGLE_PER_MIN',
        'setting',
        'Per-IP requests/minute cap on the Google Places proxy (unset = unlimited). Not a billing cap.',
      ),
    ]),
  }),
  Object.freeze({
    id: 'voice',
    title: 'Voice agent and HUD summary (OpenAI)',
    vars: Object.freeze([
      v(
        'OPENAI_API_KEY',
        'secret',
        'Realtime voice control and the one-line HUD summary. Without it the mic reads "voice unavailable" and typed commands still work.',
        { cost: 'metered', getUrl: 'https://platform.openai.com/api-keys' },
      ),
      v(
        'OPENAI_REALTIME_MODEL',
        'setting',
        'Realtime model id for the standard voice tier.',
        { default: 'gpt-realtime-2' },
      ),
      v(
        'OPENAI_REALTIME_MODEL_MINI',
        'setting',
        'Cheaper realtime model used when the MINI toggle is on.',
        { default: 'gpt-realtime-2.1-mini' },
      ),
      v('OPENAI_REALTIME_VOICE', 'setting', 'Voice preset.', {
        default: 'marin',
      }),
      v(
        'OPENAI_REALTIME_REASONING_EFFORT',
        'setting',
        'Reasoning effort for the realtime session.',
        { default: 'low' },
      ),
      v(
        'OPENAI_REALTIME_CONTEXT_TOKENS',
        'setting',
        'Conversation window size.',
        { default: '3000' },
      ),
      v(
        'OPENAI_REALTIME_CONTEXT_RETENTION',
        'setting',
        'Share of the window retained on truncation.',
        { default: '0.5' },
      ),
      v(
        'OPENAI_HUD_SUMMARY_MODEL',
        'setting',
        'Model for the HUD summary line.',
        { default: 'gpt-5-nano' },
      ),
      v(
        'GEV_RATELIMIT_OPENAI_PER_MIN',
        'setting',
        'Per-IP requests/minute cap on the OpenAI token + summary endpoints (unset = unlimited). Set a usage limit at OpenAI for a real cap.',
      ),
    ]),
  }),
  Object.freeze({
    id: 'aircraft',
    title: 'Aircraft',
    vars: Object.freeze([
      v(
        'OPENSKY_AUTH_MODE',
        'setting',
        'oauth | basic | auto | anon. Anonymous works but is rate-limited; adsb.lol is the automatic fallback.',
        { default: 'oauth (falls back to anonymous without credentials)' },
      ),
      v(
        'OPENSKY_CLIENT_ID',
        'secret',
        'OpenSky OAuth client id: more polling credits (non-commercial research licence).',
        { getUrl: 'https://opensky-network.org' },
      ),
      v('OPENSKY_CLIENT_SECRET', 'secret', 'OpenSky OAuth client secret.', {
        getUrl: 'https://opensky-network.org',
      }),
      v(
        'LOCAL_RECEIVER_FEEDS',
        'setting',
        'Your own dump1090/dump978 aircraft.json URLs on this machine or LAN, e.g. 1090=http://localhost:8080/data/aircraft.json. See docs/LOCAL-RECEIVERS.md.',
      ),
    ]),
  }),
  Object.freeze({
    id: 'vessels',
    title: 'Ships (AIS)',
    vars: Object.freeze([
      v(
        'AISSTREAM_API_KEY',
        'secret',
        'Live AIS vessels worldwide through a server-side websocket. Without it the Ships layer reports KEY REQUIRED; there is no simulated ship feed.',
        { getUrl: 'https://aisstream.io' },
      ),
      v(
        'AISSTREAM_BOUNDING_BOXES',
        'setting',
        'Optional subscription boxes, e.g. [[[-90,-180],[90,180]]].',
      ),
      v(
        'AISSTREAM_MESSAGE_TYPES',
        'setting',
        'Optional AIS message-type filter.',
      ),
      v(
        'AISSTREAM_SILENCE_TIMEOUT_MS',
        'setting',
        'Feed watchdog silence threshold.',
        { default: '120000' },
      ),
    ]),
  }),
  Object.freeze({
    id: 'fires',
    title: 'Fires',
    vars: Object.freeze([
      v(
        'FIRMS_MAP_KEY',
        'secret',
        'NASA FIRMS area API (3 VIIRS satellites + MODIS). Without it Earth Eye falls back to NASA\u2019s keyless public 24h files (MODIS + NOAA-20 VIIRS) and labels the layer FALLBACK.',
        { getUrl: 'https://firms.modaps.eosdis.nasa.gov/api/map_key/' },
      ),
    ]),
  }),
  Object.freeze({
    id: 'traffic',
    title: 'Road traffic',
    vars: Object.freeze([
      v(
        'TOMTOM_API_KEY',
        'secret',
        'Real traffic flow tiles. Without it Street Traffic is a SIMULATION along real OSM roads.',
        { getUrl: 'https://developer.tomtom.com' },
      ),
      v(
        'TOMTOM_DAILY_TILE_BUDGET',
        'setting',
        'Soft daily cap on TomTom tile fetches.',
        { default: '6000' },
      ),
    ]),
  }),
  Object.freeze({
    id: 'space',
    title: 'Space',
    vars: Object.freeze([
      v(
        'LL2_API_TOKEN',
        'secret',
        'Higher Launch Library 2 request allowance (public access works without).',
        { getUrl: 'https://thespacedevs.com' },
      ),
    ]),
  }),
  Object.freeze({
    id: 'cctv',
    title: 'Public cameras (source packs and caps)',
    vars: Object.freeze([
      v(
        'CCTV_MAX_SOURCES',
        'setting',
        'Overall cap on registered public camera sources.',
      ),
      v(
        'CCTV_SOURCES_FILE',
        'setting',
        'Path to an extra public camera catalog JSON.',
      ),
      v(
        'CCTV_SOURCES_JSON',
        'setting',
        'Inline extra public camera catalog JSON.',
      ),
      v('CCTV_AUSTIN_MAX_SOURCES', 'setting', 'City of Austin camera cap.'),
      v('CCTV_TXDOT_ENABLED', 'setting', 'TxDOT camera pack on/off.'),
      v('CCTV_TXDOT_MAX_SOURCES', 'setting', 'TxDOT camera cap.'),
      v('CCTV_CALTRANS_MAX_SOURCES', 'setting', 'Caltrans camera cap.'),
      v('CCTV_TFL_ENABLED', 'setting', 'Transport for London JamCams on/off.'),
      v(
        'CCTV_TFL_VIDEO_CLIPS',
        'setting',
        'TfL JamCams play the official short video clip instead of the still. Off by default (still images first).',
      ),
      v(
        'CCTV_FINTRAFFIC_ENABLED',
        'setting',
        'Fintraffic (Finland) weather cameras on/off.',
      ),
      v('CCTV_DRIVEBC_ENABLED', 'setting', 'DriveBC cameras on/off.'),
      v('CCTV_CALGARY_ENABLED', 'setting', 'City of Calgary cameras on/off.'),
      v('CCTV_NSW_ENABLED', 'setting', 'NSW Live Traffic cameras on/off.'),
      v('CCTV_ONTARIO_ENABLED', 'setting', '511 Ontario cameras on/off.'),
      v('CCTV_TALLINN_ENABLED', 'setting', 'Tallinn cameras on/off.'),
    ]),
  }),
  Object.freeze({
    id: 'server',
    title: 'Server binding',
    vars: Object.freeze([
      v('PORT', 'setting', 'Dev server port.', { default: '4173' }),
      v(
        'HOST',
        'setting',
        'Bind address. Keep localhost; 0.0.0.0 exposes every key-brokering proxy to your network.',
        { default: 'localhost' },
      ),
    ]),
  }),
]);

/** Every registry name, in display order. */
export function atlasProviderNames() {
  return ATLAS_PROVIDER_GROUPS.flatMap((g) => g.vars.map((x) => x.name));
}
