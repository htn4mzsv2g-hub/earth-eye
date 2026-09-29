/**
 * AO-0 — OpenAI Analyst hard gate (OFF until owner key + billing OK).
 * Never invent keys. Never send paid calls while disabled.
 */

/** Master switch: must be explicitly "1"/"true" AND a non-empty OPENAI_API_KEY. */
export function openaiAnalystEnabled(env = process.env) {
  const flag = /^(1|true|yes|on)$/i.test(
    String(env.EE_OPENAI_ANALYST || '').trim(),
  );
  const key = String(env.OPENAI_API_KEY || '').trim();
  return Boolean(flag && key);
}

export function openaiAnalystStatus(env = process.env) {
  const flagOn = /^(1|true|yes|on)$/i.test(
    String(env.EE_OPENAI_ANALYST || '').trim(),
  );
  const keySet = String(env.OPENAI_API_KEY || '').trim() !== '';
  const enabled = openaiAnalystEnabled(env);
  return Object.freeze({
    ok: true,
    phase: 'AO-0',
    enabled,
    hardDisable: !enabled,
    flagConfigured: flagOn,
    apiKeyConfigured: keySet,
    // Presence only — never echo key material.
    billingApproved: false,
    paidCallsAllowed: false,
    voiceDeferred: true,
    orchestration: 'designed-off',
    note: enabled
      ? 'OpenAI Analyst flag+key present — paid path still requires AO-1 wiring + billing confirmation.'
      : 'OpenAI Analyst OFF. Deterministic Analyst tools work without OpenAI. Set EE_OPENAI_ANALYST=1 and OPENAI_API_KEY only after owner billing OK.',
  });
}
