import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, parseCoordinates, findLayer, EXAMPLES } from './commandParser.js';

const tools = (p) => p.steps.map((s) => s.tool || (s.layer ? `layer:${s.layer}:${s.enabled}` : s.ui ? `ui:${s.ui}` : 'wait'));

test('take me to LAX flies to the bundled airport', () => {
  const p = parseCommand('take me to LAX');
  assert.equal(p.kind, 'plan');
  assert.equal(p.steps[0].tool, 'fly_to_location');
  assert.ok(Math.abs(p.steps[0].args.latitude - 33.94) < 0.05);
});

test('show aircraft near me uses geolocation and enables flights', () => {
  const p = parseCommand('show aircraft near me');
  assert.deepEqual(tools(p), ['fly_to_location', 'layer:flights:true']);
  assert.equal(p.steps[0].center, 'user');
});

test('select the nearest airborne aircraft', () => {
  const p = parseCommand('select the nearest airborne aircraft');
  assert.deepEqual(tools(p), ['layer:flights:true', 'wait', 'select_nearest_aircraft']);
  assert.equal(p.steps[2].center, 'camera');
});

test('track the ISS', () => {
  const p = parseCommand('Track the ISS');
  assert.deepEqual(tools(p), ['layer:satellites:true', 'wait', 'track_entity']);
  assert.equal(p.steps[2].args.query, 'ISS');
});

test('show fires near Texas', () => {
  const p = parseCommand('show fires near Texas');
  assert.deepEqual(tools(p), ['fly_to_location', 'layer:local-firms:true']);
  assert.equal(p.steps[0].args.query, 'Texas');
});

test('sensor modes', () => {
  for (const [text, style] of [['switch to FLIR', 'thermal'], ['NVG', 'surveillance'], ['crt mode', 'retro'], ['noir', 'noir'], ['snow', 'snow'], ['normal', 'normal'], ['night vision', 'surveillance']]) {
    const p = parseCommand(text);
    assert.equal(p.steps[0].tool, 'set_visual_style', text);
    assert.equal(p.steps[0].args.style, style, text);
  }
});

test('reset globe', () => {
  assert.equal(parseCommand('reset globe').steps[0].tool, 'zoom_to_globe');
});

test('count satellites over North America', () => {
  const p = parseCommand('count satellites over North America');
  assert.deepEqual(tools(p), ['layer:satellites:true', 'wait', 'analyst_query']);
  assert.deepEqual(p.steps[2].args.scope, { kind: 'region', name: 'North America' });
});

test('which ships are headed toward Oakland', () => {
  const p = parseCommand('which ships are headed toward Oakland');
  assert.equal(p.steps[2].tool, 'analyst_query');
  assert.deepEqual(p.steps[2].args.filters, [{ field: 'destination', op: 'contains', value: 'OAKLAND' }]);
});

test('show cameras near Austin', () => {
  const p = parseCommand('show cameras near Austin');
  assert.deepEqual(tools(p), ['fly_to_location', 'layer:cctv:true']);
  assert.equal(p.steps[0].args.query, 'Austin');
});

test('detection, hud, cockpit, annotations', () => {
  assert.equal(parseCommand('detection on').steps[0].args.enabled, true);
  assert.equal(parseCommand('hide detection').steps[0].args.enabled, false);
  assert.deepEqual(parseCommand('military hud').steps[0].args, { visible: 'on', layout: 'tactical' });
  assert.equal(parseCommand('cockpit').steps[0].args.action, 'enter');
  assert.equal(parseCommand('clear annotations').steps[0].tool, 'clear_annotations');
  assert.equal(parseCommand('route from Austin to San Antonio').steps[0].args.annotations[0].type, 'route');
  assert.equal(parseCommand('mark Zilker Park').steps[0].args.annotations[0].target, 'Zilker Park');
});

test('coordinates', () => {
  assert.deepEqual(parseCoordinates('30.27, -97.74'), { lat: 30.27, lon: -97.74 });
  assert.deepEqual(parseCoordinates('30.27N 97.74W'), { lat: 30.27, lon: -97.74 });
  assert.equal(parseCommand('30.27, -97.74').steps[0].args.latitude, 30.27);
});

test('layer vocabulary', () => {
  assert.equal(findLayer('hurricanes').id, 'weather-cyclones');
  assert.equal(findLayer('military aircraft').id, 'military');
  assert.equal(parseCommand('hide earthquakes').steps[0].enabled, false);
  assert.equal(parseCommand('radar on').steps[0].layer, 'weather-radar');
});

test('every example parses to a plan', () => {
  for (const e of EXAMPLES) assert.equal(parseCommand(e).kind, 'plan', e);
});

test('gibberish is reported, not guessed', () => {
  assert.equal(parseCommand('purple monkey dishwasher').kind, 'unknown');
});

test('Stage 3.2 typed schema coverage for previously missing actions', () => {
  assert.equal(parseCommand('set flights layer on').steps[0].tool, 'set_layer_visibility');
  assert.equal(parseCommand('set flights layer on').steps[0].args.enabled, true);
  assert.equal(parseCommand('disable satellites layer').steps[0].args.enabled, false);
  assert.equal(parseCommand('layers menu').steps[0].tool, 'show_data_layers_menu');
  assert.equal(parseCommand('open data panel').steps[0].tool, 'set_panel_open');
  assert.equal(parseCommand('open data panel').steps[0].args.panelId, 'data-panel');
  assert.equal(parseCommand('context contacts').steps[0].tool, 'set_context_mode');
  assert.equal(parseCommand('context contacts').steps[0].args.mode, 'contacts');
  assert.equal(parseCommand('what is selected').steps[0].tool, 'get_entity_context');
  assert.equal(parseCommand('view state').steps[0].tool, 'get_current_view_state');
  assert.equal(parseCommand('cyber sonar on').steps[0].args.enabled, true);
  assert.equal(parseCommand('use osm basemap').steps[0].args.stack, 'osm');
  assert.equal(parseCommand('next camera').steps[0].tool, 'control_cctv');
  assert.equal(parseCommand('select camera downtown').steps[0].args.action, 'select');
  assert.equal(parseCommand('frame overhead flights').steps[0].tool, 'frame_overhead');
  assert.equal(parseCommand('fly the route').steps[0].tool, 'fly_route');
  assert.equal(parseCommand('next NOAA-19 pass').steps[2].tool, 'next_satellite_pass');
  // "show cameras" must remain a layer toggle, not the cameras panel
  assert.deepEqual(tools(parseCommand('show cameras')), ['layer:cctv:true']);
});
