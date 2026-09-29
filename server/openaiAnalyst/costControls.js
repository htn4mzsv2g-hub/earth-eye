/**
 * AO-0 — Cost controls designed OFF until owner key + billing approval.
 * Limits are declarative; enforcement activates only when paid path is on.
 */

export const OPENAI_ANALYST_COST_DEFAULTS = Object.freeze({
  maxToolCallsPerSession: 20,
  maxModelTurnsPerSession: 8,
  maxTokensPerResponse: 2048,
  sessionBudgetUsdSoft: 0.5,
  dailyBudgetUsdSoft: 5,
  usageLogging: true,
  paidCallsAllowed: false,
});

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveCostControls(env = process.env) {
  const readInt = (name, fallback) => {
    const n = Number.parseInt(String(env[name] || ''), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return Object.freeze({
    ...OPENAI_ANALYST_COST_DEFAULTS,
    maxToolCallsPerSession: readInt(
      'EE_OPENAI_ANALYST_MAX_TOOLS',
      OPENAI_ANALYST_COST_DEFAULTS.maxToolCallsPerSession,
    ),
    maxModelTurnsPerSession: readInt(
      'EE_OPENAI_ANALYST_MAX_TURNS',
      OPENAI_ANALYST_COST_DEFAULTS.maxModelTurnsPerSession,
    ),
    // Soft budgets stay informational until billing OK.
    paidCallsAllowed: false,
    enforcementActive: false,
    note: 'Cost controls scaffolded; enforcement OFF until AO-1 + owner billing OK.',
  });
}

/** Usage log shape — never stores API keys or raw prompts with secrets. */
export function sanitizeUsageEvent(event = {}) {
  return {
    at: event.at || new Date().toISOString(),
    sessionId: event.sessionId ? String(event.sessionId).slice(0, 40) : null,
    model: event.model ? String(event.model).slice(0, 64) : null,
    toolCalls: Number(event.toolCalls) || 0,
    inputTokens: Number(event.inputTokens) || 0,
    outputTokens: Number(event.outputTokens) || 0,
    // Never persist API keys if somehow passed.
    apiKey: undefined,
  };
}
