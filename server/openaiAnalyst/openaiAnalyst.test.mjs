import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  openaiAnalystEnabled,
  openaiAnalystStatus,
} from './config.js';
import { toolMapSnapshot, DIRECTIVE_TOOL_FAMILIES } from './toolMap.js';
import { resolveCostControls, sanitizeUsageEvent } from './costControls.js';
import { runAnalystAgentTurn, ORCHESTRATION_DESIGN } from './orchestration.js';
import {
  ANALYST_UNAVAILABLE,
  analystUnavailablePayload,
} from './unavailable.js';

describe('AO-0 openaiAnalyst hard disable', () => {
  it('is off with empty env', () => {
    assert.equal(openaiAnalystEnabled({}), false);
    const s = openaiAnalystStatus({});
    assert.equal(s.enabled, false);
    assert.equal(s.hardDisable, true);
    assert.equal(s.apiKeyConfigured, false);
    assert.equal(s.paidCallsAllowed, false);
  });

  it('stays off with key but no flag', () => {
    assert.equal(
      openaiAnalystEnabled({ OPENAI_API_KEY: 'sk-test-not-real' }),
      false,
    );
  });

  it('stays off with flag but no key', () => {
    assert.equal(openaiAnalystEnabled({ EE_OPENAI_ANALYST: '1' }), false);
  });

  it('enables only with flag + key (still no paid wiring)', () => {
    assert.equal(
      openaiAnalystEnabled({
        EE_OPENAI_ANALYST: '1',
        OPENAI_API_KEY: 'sk-test-not-real',
      }),
      true,
    );
  });

  it('status never echoes key material', () => {
    const s = openaiAnalystStatus({
      EE_OPENAI_ANALYST: '1',
      OPENAI_API_KEY: 'sk-secret-must-not-leak',
    });
    const json = JSON.stringify(s);
    assert.equal(json.includes('sk-secret'), false);
    assert.equal(s.apiKeyConfigured, true);
  });
});

describe('AO-0 tool map', () => {
  it('maps families and forbids generic tools', () => {
    const snap = toolMapSnapshot();
    assert.equal(snap.replaceAnalystUi, false);
    assert.equal(snap.iframeChatgpt, false);
    assert.equal(snap.separateChatbot, false);
    assert.ok(snap.analystDeterministic.length >= 17);
    assert.ok(snap.sharedActions.includes('analyst_query'));
    const forbidden = DIRECTIVE_TOOL_FAMILIES.find(
      (f) => f.family === 'generic_sql_shell_network_deploy',
    );
    assert.equal(forbidden.status, 'forbidden');
  });
});

describe('AO-0 cost + unavailable', () => {
  it('cost controls enforcement off', () => {
    const c = resolveCostControls({});
    assert.equal(c.enforcementActive, false);
    assert.equal(c.paidCallsAllowed, false);
  });

  it('sanitizeUsageEvent strips apiKey', () => {
    const e = sanitizeUsageEvent({
      apiKey: 'sk-leak',
      model: 'gpt-test',
      toolCalls: 2,
    });
    assert.equal(e.apiKey, undefined);
    assert.equal(JSON.stringify(e).includes('sk-leak'), false);
  });

  it('turn returns ANALYST_UNAVAILABLE when disabled', async () => {
    const r = await runAnalystAgentTurn({}, {});
    assert.equal(r.ok, false);
    assert.equal(r.error, ANALYST_UNAVAILABLE.code);
    assert.equal(r.deterministicToolsOk, true);
    assert.equal(r.paidModelOk, false);
  });

  it('turn with flag+key still does not call OpenAI (not_wired)', async () => {
    const r = await runAnalystAgentTurn(
      {},
      { EE_OPENAI_ANALYST: '1', OPENAI_API_KEY: 'sk-test-not-real' },
    );
    assert.equal(r.ok, false);
    assert.equal(r.error, 'openai_analyst_not_wired');
    assert.ok(String(r.note).includes('no paid call'));
  });

  it('orchestration design prefers Responses app-owned loop', () => {
    assert.equal(
      ORCHESTRATION_DESIGN.preferred,
      'responses_api_app_owned_loop',
    );
  });

  it('analystUnavailablePayload shape', () => {
    const p = analystUnavailablePayload({ phase: 'AO-0' });
    assert.equal(p.error, 'ANALYST_UNAVAILABLE');
    assert.equal(p.phase, 'AO-0');
  });
});
