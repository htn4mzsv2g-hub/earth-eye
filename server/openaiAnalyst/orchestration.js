/**
 * AO-0 — Server-side orchestration design (no paid calls).
 *
 * Rechecked OpenAI surfaces (2026-09): Assistants retired; Responses API is the
 * app-owned loop foundation; Agents API is managed harness (beta); Agents SDK
 * is feature-complete maintenance. Earth Eye prefers **Responses API + app-owned
 * tool loop** so existing deterministic Analyst/voice tools stay in-process,
 * permissioned, and never become generic SQL/shell/network/deploy.
 *
 * This module does not call OpenAI. AO-1 will implement runAnalystAgentTurn.
 */

import { openaiAnalystEnabled } from './config.js';
import { toolMapSnapshot } from './toolMap.js';
import { resolveCostControls } from './costControls.js';
import { analystUnavailablePayload } from './unavailable.js';

export const ORCHESTRATION_DESIGN = Object.freeze({
  preferred: 'responses_api_app_owned_loop',
  alternatives: ['agents_api_managed_harness'],
  deferred: ['agents_sdk_maintenance'],
  reasons: [
    'Reuse existing TOOL_SCHEMAS + actionSchemas with server validation.',
    'Keep secrets and tool allowlists on the server.',
    'Avoid managed sandbox that could imply shell/network tools.',
  ],
  endpointsFuture: {
    status: 'GET /api/atlas/openai-analyst/status',
    turn: 'POST /api/atlas/openai-analyst/turn (AO-1, gated)',
  },
});

/**
 * Placeholder turn runner — always refuses until AO-1 + enablement.
 */
export async function runAnalystAgentTurn(_input, env = process.env) {
  const status = {
    enabled: openaiAnalystEnabled(env),
    cost: resolveCostControls(env),
    tools: toolMapSnapshot(),
    design: ORCHESTRATION_DESIGN,
  };
  if (!status.enabled) {
    return analystUnavailablePayload({
      ...status,
      note: 'Deterministic Analyst remains available without OpenAI.',
    });
  }
  return {
    ok: false,
    error: 'openai_analyst_not_wired',
    ...status,
    note: 'Flag+key present but AO-1 orchestration not implemented; no paid call made.',
  };
}
