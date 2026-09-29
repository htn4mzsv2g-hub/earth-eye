/**
 * Earth Eye — keyless, rule-based command parser.
 *
 * Turns a typed sentence into a small plan of steps that the command bar
 * executes through the SAME action runner the optional OpenAI voice agent
 * uses (src/voice/gevActions.js). No network, no model, no key: plain
 * pattern matching over a fixed vocabulary. Anything it does not understand
 * is reported as such — it never guesses silently.
 *
 * Step shapes:
 *   { tool, args, center?: 'camera' | 'user' }  run one action; `center` asks
 *       the executor to fill latitude/longitude from the camera or the
 *       browser's geolocation (with camera fallback)
 *   { layer, enabled }                          toggle one data layer
 *   { ui }                                       a console control (tilt, share...)
 *   { wait }                                     pause (ms) so a layer can load
 */
import { findAirport } from './airports.js';
import { isDevOnlyLayerBlocked } from '../policy/devFlags.js';

/** Layer ids no typed command may name: radio/COMMS pending credentials;
 * ALPR and simulated traffic exist only behind the dev-only build flag. */
const commandable = ([, id]) => id !== 'radio' && !isDevOnlyLayerBlocked(id);

/** Data layer vocabulary → registered layer ids (longest phrases first). */
export const LAYER_ALIASES = Object.freeze(
  [
    ['military aircraft', 'military'],
    ['military flights', 'military'],
    ['military planes', 'military'],
    ['military jets', 'military'],
    ['military bases', 'military-installations'],
    ['military installations', 'military-installations'],
    ['installations', 'military-installations'],
    ['fire perimeters', 'fire-perimeters'],
    ['perimeters', 'fire-perimeters'],
    ['submarine cables', 'telegeography-submarine-cables'],
    ['undersea cables', 'telegeography-submarine-cables'],
    ['cables', 'telegeography-submarine-cables'],
    ['data centers', 'local-datacenters'],
    ['datacenters', 'local-datacenters'],
    ['data centres', 'local-datacenters'],
    ['dams', 'local-dams'],
    ['alpr', 'alpr-cameras'],
    ['plate reader locations', 'alpr-cameras'],
    ['recent imagery', 'recent-imagery'],
    ['local adsb', 'local-adsb'],
    ['local receiver', 'local-adsb'],
    ['space missions', 'rocket-launches'],
    ['rocket launches', 'rocket-launches'],
    ['launches', 'rocket-launches'],
    ['rockets', 'rocket-launches'],
    ['aircraft', 'flights'],
    ['airplanes', 'flights'],
    ['planes', 'flights'],
    ['flights', 'flights'],
    ['air traffic', 'flights'],
    ['jets', 'flights'],
    ['satellites', 'satellites'],
    ['sats', 'satellites'],
    ['earthquakes', 'earthquakes'],
    ['quakes', 'earthquakes'],
    ['seismic', 'earthquakes'],
    ['wildfires', 'local-firms'],
    ['fires', 'local-firms'],
    ['hotspots', 'local-firms'],
    ['firms', 'local-firms'],
    ['ships', 'ais-live-vessels'],
    ['vessels', 'ais-live-vessels'],
    ['boats', 'ais-live-vessels'],
    ['ais', 'ais-live-vessels'],
    ['traffic cameras', 'cctv'],
    ['public cameras', 'cctv'],
    ['cameras', 'cctv'],
    ['webcams', 'cctv'],
    ['cctv', 'cctv'],
    ['street traffic', 'traffic'],
    ['traffic', 'traffic'],
    ['rain radar', 'weather-radar'],
    ['weather radar', 'weather-radar'],
    ['radar', 'weather-radar'],
    ['rain', 'weather-radar'],
    ['clouds', 'weather-satellite'],
    ['lightning', 'weather-lightning'],
    ['hurricanes', 'weather-cyclones'],
    ['cyclones', 'weather-cyclones'],
    ['typhoons', 'weather-cyclones'],
    ['tropical storms', 'weather-cyclones'],
    ['storms', 'weather-cyclones'],
    ['wind', 'wind'],
    ['transit', 'transit'],
    ['buses', 'transit'],
    ['trains', 'transit'],
    ['bikeshare', 'bikeshare'],
    ['bikes', 'bikeshare'],
    ['radio', 'radio'],
    ['weather', 'weather-radar'],
  ].filter(commandable),
);

/** Visual (post-process) sensor modes. Keys are what people type. */
export const STYLE_ALIASES = Object.freeze({
  normal: 'normal',
  default: 'normal',
  clear: 'normal',
  crt: 'retro',
  retro: 'retro',
  nvg: 'surveillance',
  'night vision': 'surveillance',
  nightvision: 'surveillance',
  flir: 'thermal',
  thermal: 'thermal',
  infrared: 'thermal',
  ir: 'thermal',
  noir: 'noir',
  'black and white': 'noir',
  snow: 'snow',
  anime: 'anime',
});

/** Region names the analyst engine resolves to polygons (plus common aliases). */
const REGION_ALIASES = Object.freeze({
  'north america': 'North America',
  'south america': 'South America',
  europe: 'Europe',
  africa: 'Africa',
  asia: 'Asia',
  oceania: 'Oceania',
  australia: 'Australia',
  'the us': 'United States',
  'the usa': 'United States',
  usa: 'United States',
  'united states': 'United States',
  america: 'United States',
});

const LAYER_WORDS = LAYER_ALIASES.map(([word]) => word);

function clean(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Find the first data layer named in the text. */
export function findLayer(text) {
  const t = ` ${clean(text)} `;
  for (const [word, id] of LAYER_ALIASES) {
    if (t.includes(` ${word} `)) return { id, word };
  }
  return null;
}

/** Parse "30.27, -97.74" / "30.27 -97.74" / "30.27N 97.74W". */
export function parseCoordinates(text) {
  const t = String(text || '').trim();
  let m = t.match(
    /(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([ns])?[\s,;]+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([ew])?/i,
  );
  if (!m) return null;
  let lat = Number(m[1]);
  let lon = Number(m[3]);
  if (m[2] && m[2].toLowerCase() === 's') lat = -Math.abs(lat);
  if (m[4] && m[4].toLowerCase() === 'w') lon = -Math.abs(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Pull the place phrase after near/over/around/in/at/toward. */
export function extractPlace(text) {
  const t = clean(text);
  const m = t.match(
    /\b(?:near|over|around|above|in|at|by|toward|towards|to|headed to|heading to|bound for|close to)\s+(.+)$/,
  );
  if (!m) return null;
  let place = m[1]
    .replace(/^(?:the city of|downtown)\s+/, '')
    .replace(/\s+(?:right now|now|please|today)$/, '')
    .trim();
  if (!place) return null;
  return place;
}

function placeTarget(place) {
  if (!place) return null;
  if (/^(?:me|my location|here|my position|where i am)$/.test(place))
    return { kind: 'user' };
  if (/^(?:this area|the view|view|screen|the screen|there)$/.test(place))
    return { kind: 'camera' };
  const coords = parseCoordinates(place);
  if (coords) return { kind: 'coords', ...coords, label: place };
  const airport = /^[a-z]{3}$/.test(place) ? findAirport(place) : null;
  if (airport)
    return {
      kind: 'coords',
      lat: airport.lat,
      lon: airport.lon,
      label: `${airport.code} · ${airport.name}`,
      rangeM: 9000,
    };
  const airportWord = place.match(/^([a-z]{3})\s+airport$/);
  if (airportWord && findAirport(airportWord[1]))
    return placeTarget(airportWord[1]);
  return { kind: 'query', query: titleCase(place) };
}

function titleCase(s) {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** A fly-to step for a resolved place target. */
function flyStep(target, { overview = false } = {}) {
  if (!target) return null;
  if (target.kind === 'user')
    return {
      tool: 'fly_to_location',
      args: { rangeM: overview ? 600000 : 60000 },
      center: 'user',
    };
  if (target.kind === 'camera') return null;
  if (target.kind === 'coords')
    return {
      tool: 'fly_to_location',
      args: {
        latitude: target.lat,
        longitude: target.lon,
        rangeM: overview ? 600000 : target.rangeM || 25000,
      },
    };
  return {
    tool: 'fly_to_location',
    args: overview
      ? { query: target.query, viewMode: 'overview' }
      : { query: target.query },
  };
}

function plan(label, steps, extra = {}) {
  return { kind: 'plan', label, steps: steps.filter(Boolean), ...extra };
}

export const EXAMPLES = Object.freeze([
  'take me to LAX',
  'show aircraft near me',
  'select the nearest airborne aircraft',
  'track the ISS',
  'show fires near Texas',
  'switch to FLIR',
  'reset globe',
  'count satellites over North America',
  'which ships are headed toward Oakland',
  'show cameras near Austin',
  'cockpit',
  'detection on',
  'military hud',
  'mark Zilker Park',
  'route from Austin to San Antonio',
  'clear annotations',
  'next ISS pass',
  'play tour',
  'snapshot',
]);

/**
 * Parse one command.
 * @param {string} input
 * @returns {{kind:'plan', label:string, steps:Array<object>} | {kind:'unknown', label:string}}
 */
export function parseCommand(input) {
  const raw = String(input || '').trim();
  const t = clean(raw);
  if (!t)
    return { kind: 'unknown', label: 'Type a command, e.g. “track the ISS”.' };

  // --- console controls ----------------------------------------------------
  if (/^(?:help|\?|commands|what can you do)$/.test(t))
    return plan('Show command help', [{ ui: 'help' }]);
  if (
    /^(?:reset|reset (?:the )?(?:globe|view|camera|map)|home|full globe|whole (?:earth|globe|world)|zoom out to (?:the )?globe)$/.test(
      t,
    )
  )
    return plan('Reset to the full globe', [
      { tool: 'zoom_to_globe', args: {} },
    ]);
  if (/^(?:north up|face north|reset (?:bearing|heading|north))$/.test(t))
    return plan('North up', [{ ui: 'north' }]);
  if (
    /^(?:tilt|oblique|tilt (?:the )?(?:map|view|camera)|35 ?(?:°|deg|degrees)?(?: oblique)?|straight down|top down|overhead)$/.test(
      t,
    )
  )
    return plan('Toggle tilt / overhead', [{ ui: 'tilt' }]);
  if (/^(?:share|share (?:link|view|this)|copy (?:share )?link)$/.test(t))
    return plan('Copy share link', [{ ui: 'share' }]);
  if (
    /^(?:snapshot|screenshot|take (?:a )?(?:snapshot|screenshot|picture))$/.test(
      t,
    )
  )
    return plan('Save a PNG snapshot', [{ ui: 'snapshot' }]);
  if (/^(?:settings|keys|power up|provider settings|add (?:a )?key)$/.test(t))
    return plan('Open provider settings', [{ ui: 'settings' }]);
  if (/^(?:credits|about|attribution|license|licenses)$/.test(t))
    return plan('Open About & credits', [{ ui: 'credits' }]);
  if (/^(?:feeds|feed status|status|sources|data sources)$/.test(t))
    return plan('Open feed status', [{ ui: 'feeds' }]);
  if (/^(?:disclaimer|safety|terms)$/.test(t))
    return plan('Show the disclaimer', [{ ui: 'disclaimer' }]);
  if (
    /^(?:play |start |run )?(?:the )?(?:cinematic )?tour$|^cinematic$/.test(t)
  )
    return plan('Play cinematic tour', [{ ui: 'tour' }]);
  if (/^(?:stop|end) (?:the )?tour$/.test(t))
    return plan('Stop tour', [{ ui: 'tour-stop' }]);
  if (/^(?:play|list) scenes?$|^scenes$/.test(t))
    return plan('List director scenes', [
      { tool: 'control_scene', args: { action: 'list' } },
    ]);
  if (/^(?:stop|stop tracking|unlock|release|untrack|stop following)$/.test(t))
    return plan('Stop tracking', [{ tool: 'stop_tracking', args: {} }]);
  if (/^zoom (in|out)(?: (a little|a lot|more))?$/.test(t)) {
    const [, dir, amt] = t.match(/^zoom (in|out)(?: (a little|a lot|more))?$/);
    const amount =
      amt === 'a little' ? 'little' : amt === 'a lot' ? 'lot' : 'medium';
    return plan(`Zoom ${dir}`, [
      { tool: 'adjust_camera_zoom', args: { direction: dir, amount } },
    ]);
  }
  if (/^(?:orbit|spin|rotate)(?: (?:left|right))?$/.test(t)) {
    const dir = t.includes('left') ? 'left' : 'right';
    return plan(`Orbit ${dir}`, [
      {
        tool: 'move_camera',
        args: { motion: 'orbit', direction: dir, speed: 'slow' },
      },
    ]);
  }
  if (/^(?:stop (?:orbit|spinning|rotating|moving|camera))$/.test(t))
    return plan('Stop camera motion', [
      { tool: 'move_camera', args: { motion: 'stop' } },
    ]);

  // --- sensor modes / HUD --------------------------------------------------
  const styleMatch = t.match(
    /^(?:switch to |go to |set |use |enable |turn on |activate |show )?(?:the )?(normal|default|crt|retro|nvg|night ?vision|flir|thermal|infrared|ir|noir|black and white|snow|anime)(?: mode| view| filter| style| vision| sensor| camera)?$/,
  );
  if (styleMatch) {
    const key = styleMatch[1].replace('nightvision', 'night vision');
    const style = STYLE_ALIASES[key] || STYLE_ALIASES[key.replace(' ', '')];
    return plan(`Sensor mode → ${key.toUpperCase()}`, [
      { tool: 'set_visual_style', args: { style } },
    ]);
  }
  const detection =
    t.match(
      /^(?:(?:turn |switch )?(on|off) )?(?:the )?detection(?: overlay| boxes| mode)?(?: (on|off))?$/,
    ) || t.match(/^(show|hide) (?:the )?detection(?: overlay| boxes)?$/);
  if (detection) {
    const word = detection[1] || detection[2] || 'on';
    const enabled = word === 'on' || word === 'show';
    return plan(`Detection overlay ${enabled ? 'on' : 'off'}`, [
      { tool: 'set_detection', args: { enabled } },
    ]);
  }
  const hud =
    t.match(
      /^(?:(?:turn |switch )?(on|off) )?(?:the )?(military|tactical|operator|minimal|cyber)?\s*hud(?: (on|off))?$/,
    ) || t.match(/^(show|hide) (?:the )?(military |tactical )?hud$/);
  if (hud) {
    const word = hud[1] || hud[3] || 'on';
    const visible = word === 'off' || word === 'hide' ? 'off' : 'on';
    const layoutWord = (hud[2] || '').trim();
    const layout =
      layoutWord === 'military' || layoutWord === 'tactical' || !layoutWord
        ? 'tactical'
        : layoutWord;
    return plan(
      visible === 'on'
        ? `HUD on (${layout === 'tactical' ? 'military/tactical' : layout})`
        : 'HUD off',
      [
        {
          tool: 'set_hud',
          args: visible === 'on' ? { visible, layout } : { visible },
        },
      ],
    );
  }
  if (/^(?:bloom)(?: (on|off))?$/.test(t)) {
    const enabled = !/off$/.test(t);
    return plan(`Bloom ${enabled ? 'on' : 'off'}`, [
      { tool: 'set_post_processing', args: { bloom: { enabled } } },
    ]);
  }

  // --- cockpit ---------------------------------------------------------------
  if (/^(?:exit|leave|close) (?:the )?cockpit$/.test(t))
    return plan('Leave cockpit', [
      { tool: 'control_cockpit', args: { action: 'exit' } },
    ]);
  if (/^(?:next|previous|prev) (?:contact|aircraft|plane|target)$/.test(t)) {
    const action = t.startsWith('next') ? 'next' : 'previous';
    return plan(`Cockpit → ${action} contact`, [
      { tool: 'control_cockpit', args: { action } },
    ]);
  }
  if (
    /^(?:cockpit|enter (?:the )?cockpit|cockpit (?:view|mode)|follow|follow (?:it|target|this)|ride along|pilot view)$/.test(
      t,
    )
  )
    return plan('Enter cockpit / follow view', [
      { tool: 'control_cockpit', args: { action: 'enter' } },
    ]);

  // --- annotations ---------------------------------------------------------
  if (
    /^(?:clear|erase|remove|delete) (?:all )?(?:the )?(?:annotations|marks|markers|drawings|pins|notes)$/.test(
      t,
    )
  )
    return plan('Clear annotations', [{ tool: 'clear_annotations', args: {} }]);
  const route = t.match(
    /^(?:draw |show |plot )?(?:a )?(walking |driving |cycling |bike )?route (?:from )?(.+?) to (.+)$/,
  );
  if (route) {
    const mode = (route[1] || 'driving').trim().replace('bike', 'cycling');
    return plan(`Route ${route[2]} → ${route[3]}`, [
      {
        tool: 'annotate_map',
        args: {
          annotations: [
            {
              type: 'route',
              target: titleCase(route[2]),
              toTarget: titleCase(route[3]),
              mode,
            },
          ],
          flyTo: true,
          persist: true,
        },
      },
    ]);
  }
  const outline = t.match(
    /^(?:outline|highlight|draw (?:a )?(?:polygon|area|outline) (?:around|of)?)\s*(.+)$/,
  );
  if (outline) {
    return plan(`Outline ${outline[1]}`, [
      {
        tool: 'annotate_map',
        args: {
          annotations: [
            { type: 'area', target: titleCase(outline[1]), color: 'cyan' },
          ],
          flyTo: true,
          persist: true,
        },
      },
    ]);
  }
  const label = t.match(/^label (.+?) as (.+)$/);
  if (label) {
    return plan(`Label ${label[1]}`, [
      {
        tool: 'annotate_map',
        args: {
          annotations: [
            {
              type: 'label',
              target: titleCase(label[1]),
              label: raw.split(/ as /i).pop().trim(),
            },
          ],
          flyTo: true,
          persist: true,
        },
      },
    ]);
  }
  const mark = t.match(
    /^(?:mark|pin|drop (?:a )?pin (?:on|at)|annotate)\s+(.+)$/,
  );
  if (mark) {
    const target = placeTarget(mark[1]);
    const ann =
      target?.kind === 'coords'
        ? {
            type: 'pin',
            latitude: target.lat,
            longitude: target.lon,
            label: target.label,
          }
        : { type: 'pin', target: titleCase(mark[1]) };
    return plan(`Mark ${mark[1]}`, [
      {
        tool: 'annotate_map',
        args: { annotations: [ann], flyTo: true, persist: true },
      },
    ]);
  }

  // --- satellites / ISS ----------------------------------------------------
  if (
    /\b(?:next|when is the next|when does the) (?:iss|space station) (?:pass|flyover|overhead|fly over)/.test(
      t,
    ) ||
    /^(?:next )?iss pass(?:es)?(?: over me)?$/.test(t)
  )
    return plan('Next ISS pass over you', [
      { layer: 'satellites', enabled: true },
      { wait: 2500 },
      { tool: 'next_iss_pass', args: {}, center: 'user' },
    ]);
  const trackIss =
    /^(?:track|follow|find|show|lock on(?: to)?|where is) (?:the )?(?:iss|international space station|space station)$/.test(
      t,
    );
  if (trackIss)
    return plan('Track the ISS', [
      { layer: 'satellites', enabled: true },
      { wait: 3000 },
      { tool: 'track_entity', args: { query: 'ISS', layerId: 'satellites' } },
    ]);

  // --- analyst questions ---------------------------------------------------
  const count = t.match(
    /^(?:count|how many)\s+(.+?)(?:\s+(?:are|is)\s+(?:there|visible|up|flying|active))?(?:\s+(?:over|in|near|around|above)\s+(.+?))?(?:\s+right now)?$/,
  );
  if (count) {
    const layer = findLayer(count[1]);
    const analystLayers = new Set([
      'flights',
      'military',
      'ais-live-vessels',
      'local-firms',
      'earthquakes',
      'satellites',
      'local-datacenters',
      'local-dams',
      'fire-perimeters',
    ]);
    if (layer && analystLayers.has(layer.id)) {
      const where = count[2] ? clean(count[2]) : null;
      const scope = scopeFor(where);
      return plan(
        `Count ${layer.word}${where ? ` over ${where}` : ' in view'}`,
        [
          { layer: layer.id, enabled: true },
          { wait: layer.id === 'satellites' ? 3500 : 2500 },
          {
            tool: 'analyst_query',
            args: { layers: [layer.id], scope, limit: 5 },
          },
        ],
      );
    }
  }
  const headed = t.match(
    /^(?:which|what|show|list|find)\s+(ships|vessels|boats)\s+(?:are\s+)?(?:headed|heading|bound|going|sailing|en route)\s+(?:toward|towards|to|for)\s+(.+)$/,
  );
  if (headed) {
    const dest = headed[2].trim();
    return plan(
      `Ships with AIS destination “${dest}”`,
      [
        { layer: 'ais-live-vessels', enabled: true },
        { wait: 2500 },
        {
          tool: 'analyst_query',
          args: {
            layers: ['ais-live-vessels'],
            scope: { kind: 'anywhere' },
            filters: [
              {
                field: 'destination',
                op: 'contains',
                value: dest.toUpperCase(),
              },
            ],
            limit: 10,
          },
        },
      ],
      {
        note: 'Uses the self-reported AIS destination field. Needs AISSTREAM_API_KEY for vessel data.',
      },
    );
  }
  const biggest = t.match(
    /^(?:(?:take me to|show|find|where is) )?(?:the )?(biggest|largest|strongest|most recent|latest) (fire|earthquake|quake)(?:\s+(?:near|in|over)\s+(.+))?$/,
  );
  if (biggest) {
    const layerId = biggest[2] === 'fire' ? 'local-firms' : 'earthquakes';
    const sortBy =
      layerId === 'local-firms'
        ? 'frp'
        : /recent|latest/.test(biggest[1])
          ? 'time'
          : 'magnitude';
    return plan(`Rank ${biggest[2]}s by ${sortBy}`, [
      { layer: layerId, enabled: true },
      { wait: 2500 },
      {
        tool: 'analyst_query',
        args: {
          layers: [layerId],
          scope: scopeFor(biggest[3] ? clean(biggest[3]) : null),
          sortBy,
          sortDir: 'desc',
          limit: 5,
        },
      },
    ]);
  }

  // --- selection -----------------------------------------------------------
  const nearest = t.match(
    /^(?:select|pick|find|lock(?: on)?(?: to)?|track|show me)\s+(?:the\s+)?(?:nearest|closest)\s+(airborne\s+|military\s+)?(aircraft|plane|flight|jet|helicopter|military aircraft)(?:\s+(?:to|near)\s+(.+))?$/,
  );
  if (nearest) {
    const military =
      /military/.test(nearest[1] || '') || /military/.test(nearest[2]);
    const layerId = military ? 'military' : 'flights';
    const target = nearest[3]
      ? placeTarget(clean(nearest[3]))
      : { kind: 'camera' };
    const step = { tool: 'select_nearest_aircraft', args: { layerId } };
    if (target.kind === 'query') step.args.locationQuery = target.query;
    else if (target.kind === 'coords')
      Object.assign(step.args, { latitude: target.lat, longitude: target.lon });
    else step.center = target.kind === 'user' ? 'user' : 'camera';
    return plan(`Select nearest ${military ? 'military ' : ''}aircraft`, [
      { layer: layerId, enabled: true },
      { wait: 3000 },
      step,
    ]);
  }
  const trackNamed = t.match(
    /^(?:track|follow|lock on(?: to)?|select|find)\s+(?:flight\s+|callsign\s+|satellite\s+|ship\s+|vessel\s+)?(.+)$/,
  );
  if (trackNamed && !findLayer(trackNamed[1])) {
    const q = raw
      .replace(
        /^\s*(?:track|follow|lock on(?: to)?|select|find)\s+(?:flight\s+|callsign\s+|satellite\s+|ship\s+|vessel\s+)?/i,
        '',
      )
      .trim();
    // Camera selection is control_cctv (handled below), not entity tracking.
    if (/^camera\b/i.test(q)) {
      /* fall through */
    } else {
      return plan(`Track “${q}”`, [{ tool: 'track_entity', args: { query: q } }]);
    }
  }

  // Explicit set_layer_visibility (also covered by show/hide layer steps)
  const setLayerVis = t.match(
    /^(?:set|turn) (?:the )?(.+?) layer (on|off)$|^(?:enable|disable) (?:the )?(.+?) layer$/,
  );
  if (setLayerVis) {
    const rest = (setLayerVis[1] || setLayerVis[3] || '').trim();
    const onOff = setLayerVis[2];
    const enabled =
      onOff === 'on' ||
      (setLayerVis[0].startsWith('enable') && onOff !== 'off');
    const layer = findLayer(rest);
    if (layer) {
      return plan(`${enabled ? 'Enable' : 'Disable'} ${layer.word} layer`, [
        {
          tool: 'set_layer_visibility',
          args: { layerId: layer.id, enabled },
        },
      ]);
    }
  }

  // --- layers + place ------------------------------------------------------
  const toggle =
    t.match(
      /^(show|display|turn on|enable|open|hide|turn off|disable|remove|close)\s+(?:me\s+)?(?:the\s+|all\s+)?(.+)$/,
    ) || t.match(/^(.+?)\s+(on|off)$/);
  if (toggle) {
    let verb, rest;
    if (
      /^(on|off)$/.test(toggle[2]) &&
      !/^(show|display|turn on|enable|open|hide|turn off|disable|remove|close)$/.test(
        toggle[1],
      )
    ) {
      verb = toggle[2] === 'on' ? 'show' : 'hide';
      rest = toggle[1];
    } else {
      verb = toggle[1];
      rest = toggle[2];
    }
    const enabled = !/^(hide|turn off|disable|remove|close)$/.test(verb);
    const layer = findLayer(rest);
    if (layer) {
      const place = extractPlace(
        rest.replace(layer.word, ' ').replace(/\s+/g, ' '),
      );
      const target = placeTarget(place);
      const steps = [];
      if (enabled && target && target.kind !== 'camera') {
        const overview = [
          'flights',
          'military',
          'local-firms',
          'earthquakes',
          'ais-live-vessels',
          'weather-radar',
          'weather-cyclones',
        ].includes(layer.id);
        const fly = flyStep(target, {
          overview: overview && target.kind !== 'coords',
        });
        if (layer.id === 'cctv' && fly && fly.args)
          fly.args.rangeM = fly.args.rangeM || 12000;
        steps.push(fly);
      }
      steps.push({ layer: layer.id, enabled });
      return plan(
        `${enabled ? 'Show' : 'Hide'} ${layer.word}${target && target.kind !== 'camera' ? ` near ${target.label || target.query || 'you'}` : ''}`,
        steps,
      );
    }
  }

  // --- Event detail (selected advisory / fire) -------------------------------
  if (
    /^(?:explain (?:this|selection)|what(?:'s| is) (?:this|selected)|describe (?:this|the )?storm)$/.test(
      t,
    )
  )
    return plan('Explain selected event', [
      { tool: 'get_entity_context', args: { scope: 'selected' } },
    ]);

  // --- Stage 3.2: typed coverage of remaining action schemas ---------------
  if (
    /^(?:show|open|open the)?\s*(?:data )?layers(?: menu)?$|^layers menu$|^data layers$/.test(
      t,
    )
  )
    return plan('Open data layers menu', [
      { tool: 'show_data_layers_menu', args: {} },
    ]);
  // Require the word "panel" so "show cameras" still toggles the CCTV layer.
  const panelOpen = t.match(
    /^(?:open|show|close|hide)\s+(?:the\s+)?(data|layers|location|control|cameras?|cctv|scene|context|global context)\s+panel$/,
  );
  if (panelOpen) {
    const open = /^(?:open|show)/.test(panelOpen[0]);
    const key = panelOpen[1];
    const panelId =
      key === 'data' || key === 'layers'
        ? 'data-panel'
        : key === 'location'
          ? 'location-bar'
          : key === 'control'
            ? 'control-panel'
            : key === 'cameras' || key === 'camera' || key === 'cctv'
              ? 'cctv-panel'
              : key === 'scene'
                ? 'scene-panel'
                : 'global-context-panel';
    return plan(`${open ? 'Open' : 'Close'} ${panelId}`, [
      { tool: 'set_panel_open', args: { panelId, open } },
    ]);
  }
  const ctx = t.match(
    /^(?:set\s+)?(?:context(?:\s+mode)?|mode)\s+(off|contacts|flights|space[- ]?missions|missions)$|^(contacts|flights|missions|space[- ]?missions)\s+context$/,
  );
  if (ctx) {
    let mode = (ctx[1] || ctx[2] || '').replace(/\s+/g, '-');
    if (mode === 'space-missions' || mode === 'space missions') mode = 'missions';
    return plan(`Context mode → ${mode}`, [
      { tool: 'set_context_mode', args: { mode } },
    ]);
  }
  if (
    /^(?:what(?:'s| is) selected|entity context|describe (?:the )?selection|get entity context|selected (?:entity|aircraft|object))$/.test(
      t,
    )
  )
    return plan('Describe the selection', [
      { tool: 'get_entity_context', args: { scope: 'selected' } },
    ]);
  if (
    /^(?:(?:get |show )?(?:the )?(?:current )?view(?: state)?|where am i looking|camera (?:pose|state|view))$/.test(
      t,
    )
  )
    return plan('Current view state', [
      { tool: 'get_current_view_state', args: {} },
    ]);
  const sonar = t.match(
    /^(?:(?:turn |switch )?(on|off) )?(?:the )?cyber(?:[- ]?sonar)?(?: (on|off))?$|^(?:sonar)(?: (on|off))?$/,
  );
  if (sonar && /cyber|sonar/.test(t)) {
    const word = sonar[1] || sonar[2] || sonar[3] || 'on';
    const enabled = word !== 'off';
    return plan(`Cyber sonar ${enabled ? 'on' : 'off'}`, [
      { tool: 'set_cyber_sonar', args: { enabled } },
    ]);
  }
  const stack = t.match(
    /^(?:(?:set |use |switch to |show )?(?:the )?(?:map )?stack |(?:use |set |switch to )?(?:the )?)(photoreal|bing(?:[- ]aerial)?|bing[- ]labels|esri(?:[- ]imagery)?|osm|openstreetmap)(?:\s+(?:basemap|map|stack|imagery))?$/,
  );
  if (stack) {
    let id = stack[1].replace(/\s+/g, '-');
    if (id === 'bing' || id === 'bing-aerial') id = 'bing-aerial';
    if (id === 'esri') id = 'esri-imagery';
    if (id === 'openstreetmap') id = 'osm';
    return plan(`Map stack → ${id}`, [
      { tool: 'set_map_stack', args: { stack: id } },
    ]);
  }
  // CCTV controls (distinct from "show cameras" layer toggle)
  if (/^(?:next|previous|prev) camera$/.test(t)) {
    const action = t.startsWith('next') ? 'next' : 'prev';
    return plan(`CCTV → ${action}`, [
      { tool: 'control_cctv', args: { action } },
    ]);
  }
  if (/^(?:nearest camera|cctv nearest|select nearest camera)$/.test(t))
    return plan('CCTV → nearest', [
      { tool: 'control_cctv', args: { action: 'nearest' } },
    ]);
  const camSelect = t.match(
    /^(?:select|open|focus) camera(?:\s+(?:named|called))?\s+(.+)$/,
  );
  if (camSelect) {
    return plan(`CCTV → select “${camSelect[1]}”`, [
      {
        tool: 'control_cctv',
        args: { action: 'select', cameraQuery: camSelect[1].trim() },
      },
    ]);
  }
  const overhead = t.match(
    /^(?:frame overhead|overhead (?:view|frame)(?: of)?|look (?:straight )?down on)\s+(flights?|aircraft|military|satellites?|vessels?|ships?)$/,
  );
  if (overhead) {
    const raw = overhead[1];
    const target =
      /military/.test(raw)
        ? 'military'
        : /sat/.test(raw)
          ? 'satellites'
          : /vessel|ship/.test(raw)
            ? 'vessels'
            : 'flights';
    return plan(`Frame overhead ${target}`, [
      { tool: 'frame_overhead', args: { target } },
    ]);
  }
  if (
    /^(?:fly (?:the |along (?:the )?)?route|fly route|ride the route)$/.test(t)
  )
    return plan('Fly along the current route', [
      { tool: 'fly_route', args: {} },
    ]);
  const satPass = t.match(
    /^(?:next|when is the next|when does)\s+(.+?)\s+(?:pass|flyover|overhead)(?:\s+over me)?$/,
  );
  if (satPass && !/\b(?:iss|space station)\b/.test(satPass[1])) {
    return plan(`Next pass of ${satPass[1]}`, [
      { layer: 'satellites', enabled: true },
      { wait: 2500 },
      {
        tool: 'next_satellite_pass',
        args: { target: satPass[1].trim() },
        center: 'user',
      },
    ]);
  }

  // --- navigation ----------------------------------------------------------
  const nav = t.match(
    /^(?:take me to|fly to|fly me to|go to|goto|navigate to|zoom to|zoom in on|jump to|show me|find|search(?: for)?|where is)\s+(.+)$/,
  );
  const placeText = nav ? nav[1] : parseCoordinates(t) ? t : null;
  if (placeText) {
    const target = placeTarget(placeText);
    if (target && target.kind !== 'camera') {
      return plan(`Fly to ${target.label || target.query || 'your location'}`, [
        flyStep(target),
      ]);
    }
  }

  return {
    kind: 'unknown',
    label: `Not understood: “${raw}”. Try “help” for examples.`,
    suggestions: EXAMPLES.slice(0, 6),
  };
}

function scopeFor(where) {
  if (!where) return { kind: 'view' };
  if (/^(?:me|my location|here)$/.test(where))
    return { kind: 'radius', km: 250, center: null, useUser: true };
  const coords = parseCoordinates(where);
  if (coords)
    return {
      kind: 'radius',
      km: 250,
      center: { lat: coords.lat, lon: coords.lon },
    };
  const region = REGION_ALIASES[where];
  if (region) return { kind: 'region', name: region };
  return { kind: 'region', name: titleCase(where) };
}

export { LAYER_WORDS };
