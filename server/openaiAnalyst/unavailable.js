/**
 * AO-0 — Honest ANALYST UNAVAILABLE responses when OpenAI path is off.
 * Deterministic Analyst tools are NOT unavailable; only model synthesis is.
 */

export const ANALYST_UNAVAILABLE = Object.freeze({
  code: 'ANALYST_UNAVAILABLE',
  reason: 'openai_analyst_disabled',
  message:
    'OpenAI Analyst is unavailable. Structured Analyst queries and map actions still work without a model.',
  deterministicToolsOk: true,
  paidModelOk: false,
  howToEnable:
    'Owner sets EE_OPENAI_ANALYST=1 and OPENAI_API_KEY after billing approval — agent must not invent keys.',
});

export function analystUnavailablePayload(extra = {}) {
  return {
    ok: false,
    error: ANALYST_UNAVAILABLE.code,
    ...ANALYST_UNAVAILABLE,
    ...extra,
  };
}
