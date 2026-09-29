/**
 * AO-0 Vite/production plugin: status only. Never proxies paid OpenAI Analyst turns.
 */
import { openaiAnalystStatus } from './config.js';
import { toolMapSnapshot } from './toolMap.js';
import { resolveCostControls } from './costControls.js';
import { ORCHESTRATION_DESIGN, runAnalystAgentTurn } from './orchestration.js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function openaiAnalystPlugin() {
  const install = (server) => {
    server.middlewares.use('/api/atlas/openai-analyst/status', (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return send(res, 405, { ok: false, error: 'Method not allowed' });
      return send(res, 200, {
        ...openaiAnalystStatus(),
        costControls: resolveCostControls(),
        orchestration: ORCHESTRATION_DESIGN,
        toolMap: {
          families: toolMapSnapshot().families,
          analystToolCount: toolMapSnapshot().analystDeterministic.length,
          sharedActionCount: toolMapSnapshot().sharedActions.length,
        },
      });
    });

    // Turn endpoint exists so clients can probe — always refuses paid work in AO-0.
    server.middlewares.use('/api/atlas/openai-analyst/turn', async (req, res) => {
      if (req.method !== 'POST')
        return send(res, 405, { ok: false, error: 'Method not allowed' });
      const result = await runAnalystAgentTurn({});
      return send(res, result.ok ? 200 : 403, result);
    });
  };
  return {
    name: 'earth-eye-openai-analyst',
    configureServer: install,
    configurePreviewServer: install,
  };
}
