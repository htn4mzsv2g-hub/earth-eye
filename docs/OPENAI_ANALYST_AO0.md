# OpenAI Analyst — AO-0 Audit + Scaffold

**Date:** 2026-09-29 (CT)  
**Status:** Scaffold shipped — **AI OFF**. No paid OpenAI calls. No keys invented.  
**Directive:** `docs/OPENAI_ANALYST_DIRECTIVE_2026-09-29.md` (mirror of `earth-eye-spec/`).

## Non-goals (owner)

- Do **not** replace Analyst UI
- Do **not** iframe ChatGPT
- Do **not** build a separate chatbot
- Do **not** invent OpenAI keys or enable paid calls until owner key + billing OK
- Voice Analyst **after** text Analyst is stable
- No generic SQL / shell / network / deploy tools for the model

## Inventory — existing deterministic Analyst tools

From `src/atlas/analystTools.js` `TOOL_SCHEMAS` (`AI_SUMMARIES_ENABLED = false`):

| Tool | Kind | Family |
|------|------|--------|
| resolve_place | query | places |
| query_entities | query | entities |
| locate_cameras | query | cameras |
| permitted_history | query | history |
| incident_workspace | query | incident |
| source_health | query | health |
| inspect_entity | query | entities |
| satellite_pass | query | space |
| ai_status | query | meta |
| fly_to | action | camera |
| select_entity | action | selection |
| set_layer | action | layers |
| stop_follow | action | camera |
| control_cockpit | action | camera |
| annotate | action | annotate |
| clear_annotations | action | annotate |
| control_scene | action | scenes |

## Inventory — shared voice/action schemas

From `src/voice/actionSchemas.js` (30 names): fly_to_location, select_nearest_aircraft, adjust_camera_zoom, zoom_to_globe, set_layer_visibility, show_data_layers_menu, set_panel_open, set_context_mode, control_cockpit, set_visual_style, get_entity_context, get_current_view_state, set_hud, set_cyber_sonar, set_detection, set_map_stack, set_post_processing, control_scene, control_cctv, control_radio, track_entity, stop_tracking, frame_overhead, annotate_map, clear_annotations, move_camera, fly_route, analyst_query, next_iss_pass, next_satellite_pass.

Existing OpenAI surfaces (separate from AO Analyst text path):

- `/api/openai/hud-summary` — Responses API; fails closed without `OPENAI_API_KEY`
- `/api/realtime/token` — voice realtime; fails closed without key
- Voice after text stable (directive)

## Tool-family map (directive → EE)

See `server/openaiAnalyst/toolMap.js` `DIRECTIVE_TOOL_FAMILIES`.

| Family | Status |
|--------|--------|
| places_geocode, entity_query, cameras, map_camera, layers_panels, incident_workspace, permitted_history, annotations, source_health, space_passes | **ready** (deterministic) |
| comms_radio | **deferred** (Broadcastify HELD; LiveATC blocked) |
| openai_orchestration | **deferred** (AO-1+) |
| generic_sql_shell_network_deploy | **forbidden** |

## Architecture scaffold (AI OFF)

```
Browser Analyst UI (unchanged)
        │
        ▼
Deterministic tools (always)     ┌─ GET  /api/atlas/openai-analyst/status
        │                        └─ POST /api/atlas/openai-analyst/turn → ANALYST_UNAVAILABLE
        ▼
Optional AO-1+: server Responses loop + allowlisted tools only
        │
        ▼  (never)
Generic SQL / shell / network / deploy
```

Preferred orchestration (rechecked 2026-09 docs): **Responses API + app-owned tool loop** so EE keep permissioned in-process tools. Agents API managed harness is alternative; Agents SDK maintenance-only. Recheck at AO-1 implement time.

### Hard disable

- `EE_OPENAI_ANALYST` must be `1`/`true` **and** `OPENAI_API_KEY` non-empty → else OFF
- Core EE works with both unset
- Turn endpoint returns `ANALYST_UNAVAILABLE` (deterministic tools still OK)
- Never echo API key to browser / logs / responses

### Cost controls (designed OFF)

`server/openaiAnalyst/costControls.js`: session tool/turn caps, soft USD budgets, usage log sanitizer. `enforcementActive: false`, `paidCallsAllowed: false` until billing OK.

## Gaps for AO-1 (not this slice)

- [ ] Owner provides key + billing approval (secure env; agent does not invent)
- [ ] Implement `runAnalystAgentTurn` against Responses API with allowlisted tools only
- [ ] Wire usage logging + hard caps with enforcement ON
- [ ] Grounding UX (citations already on deterministic tools)
- [ ] AO-3 voice only after text stable

## Acceptance checklist (AO-0)

- [x] Directive saved under earth-eye-spec + docs mirror
- [x] Inventory + tool map documented and coded
- [x] Orchestration design stub (no paid calls)
- [x] Hard disable: OFF by default; core EE without OpenAI
- [x] Cost-control stubs OFF
- [x] `ANALYST_UNAVAILABLE` path on turn
- [x] Status endpoint; owner-summary includes openaiAnalyst snapshot
- [x] No key exposure; no invented keys
- [x] No SQL/shell/network/deploy model tools
- [x] Analyst UI not replaced; no ChatGPT iframe; no separate chatbot
- [ ] Deploy with AI OFF after tests green

## Endpoints

| Path | Behavior |
|------|----------|
| `GET /api/atlas/openai-analyst/status` | Phase AO-0 status, cost stubs, family summary |
| `POST /api/atlas/openai-analyst/turn` | Always refuses paid work in AO-0 (`ANALYST_UNAVAILABLE` or not_wired) |
| `GET /api/atlas/owner-summary` | Includes `openaiAnalyst` block (no secrets) |
