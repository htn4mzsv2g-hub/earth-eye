/**
 * AO-0 — Map OpenAI Analyst directive tool families → existing EE surfaces.
 * No generic SQL/shell/network/deploy tools. Radio stays COMMS-gated.
 */

/** Deterministic Analyst tools (src/atlas/analystTools.js TOOL_SCHEMAS). */
export const ANALYST_DETERMINISTIC_TOOLS = Object.freeze([
  { id: 'resolve_place', kind: 'query', family: 'places' },
  { id: 'query_entities', kind: 'query', family: 'entities' },
  { id: 'locate_cameras', kind: 'query', family: 'cameras' },
  { id: 'permitted_history', kind: 'query', family: 'history' },
  { id: 'incident_workspace', kind: 'query', family: 'incident' },
  { id: 'source_health', kind: 'query', family: 'health' },
  { id: 'inspect_entity', kind: 'query', family: 'entities' },
  { id: 'satellite_pass', kind: 'query', family: 'space' },
  { id: 'ai_status', kind: 'query', family: 'meta' },
  { id: 'fly_to', kind: 'action', family: 'camera' },
  { id: 'select_entity', kind: 'action', family: 'selection' },
  { id: 'set_layer', kind: 'action', family: 'layers' },
  { id: 'stop_follow', kind: 'action', family: 'camera' },
  { id: 'control_cockpit', kind: 'action', family: 'camera' },
  { id: 'annotate', kind: 'action', family: 'annotate' },
  { id: 'clear_annotations', kind: 'action', family: 'annotate' },
  { id: 'control_scene', kind: 'action', family: 'scenes' },
]);

/** Shared voice/action schemas (src/voice/actionSchemas.js) — reuse, don't fork. */
export const SHARED_ACTION_SCHEMAS = Object.freeze([
  'fly_to_location',
  'select_nearest_aircraft',
  'adjust_camera_zoom',
  'zoom_to_globe',
  'set_layer_visibility',
  'show_data_layers_menu',
  'set_panel_open',
  'set_context_mode',
  'control_cockpit',
  'set_visual_style',
  'get_entity_context',
  'get_current_view_state',
  'set_hud',
  'set_cyber_sonar',
  'set_detection',
  'set_map_stack',
  'set_post_processing',
  'control_scene',
  'control_cctv',
  'control_radio',
  'track_entity',
  'stop_tracking',
  'frame_overhead',
  'annotate_map',
  'clear_annotations',
  'move_camera',
  'fly_route',
  'analyst_query',
  'next_iss_pass',
  'next_satellite_pass',
]);

/**
 * Directive-oriented families → EE implementation status for AO-0.
 * status: ready | partial | deferred | forbidden
 */
export const DIRECTIVE_TOOL_FAMILIES = Object.freeze([
  {
    family: 'places_geocode',
    status: 'ready',
    mapsTo: ['resolve_place', 'fly_to_location'],
    note: 'Nominatim / existing place search — no OpenAI needed.',
  },
  {
    family: 'entity_query',
    status: 'ready',
    mapsTo: ['query_entities', 'analyst_query', 'get_entity_context'],
    note: 'Deterministic layer queries with citations.',
  },
  {
    family: 'cameras',
    status: 'ready',
    mapsTo: ['locate_cameras', 'control_cctv'],
    note: 'Approved packs only; no invented streams.',
  },
  {
    family: 'map_camera',
    status: 'ready',
    mapsTo: [
      'fly_to',
      'move_camera',
      'adjust_camera_zoom',
      'zoom_to_globe',
      'frame_overhead',
      'fly_route',
      'control_cockpit',
      'track_entity',
      'stop_tracking',
    ],
  },
  {
    family: 'layers_panels',
    status: 'ready',
    mapsTo: [
      'set_layer',
      'set_layer_visibility',
      'show_data_layers_menu',
      'set_panel_open',
      'set_context_mode',
    ],
  },
  {
    family: 'incident_workspace',
    status: 'ready',
    mapsTo: ['incident_workspace'],
    note: 'Related≠causal briefs.',
  },
  {
    family: 'permitted_history',
    status: 'ready',
    mapsTo: ['permitted_history'],
    note: 'Retention-gated only.',
  },
  {
    family: 'annotations',
    status: 'ready',
    mapsTo: ['annotate', 'annotate_map', 'clear_annotations'],
  },
  {
    family: 'source_health',
    status: 'ready',
    mapsTo: ['source_health'],
  },
  {
    family: 'space_passes',
    status: 'ready',
    mapsTo: ['satellite_pass', 'next_iss_pass', 'next_satellite_pass'],
  },
  {
    family: 'comms_radio',
    status: 'deferred',
    mapsTo: ['control_radio'],
    note: 'Broadcastify HELD; LiveATC blocked; no OpenAI radio scrape.',
  },
  {
    family: 'openai_orchestration',
    status: 'deferred',
    mapsTo: [],
    note: 'AO-1+: server-side Responses/Agents — OFF until key+billing.',
  },
  {
    family: 'generic_sql_shell_network_deploy',
    status: 'forbidden',
    mapsTo: [],
    note: 'Never expose as model tools.',
  },
]);

export function toolMapSnapshot() {
  return {
    analystDeterministic: ANALYST_DETERMINISTIC_TOOLS,
    sharedActions: SHARED_ACTION_SCHEMAS,
    families: DIRECTIVE_TOOL_FAMILIES,
    reuseNotRewrite: true,
    replaceAnalystUi: false,
    iframeChatgpt: false,
    separateChatbot: false,
  };
}
