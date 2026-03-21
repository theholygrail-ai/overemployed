/**
 * Worker Lambda (container image) — runs orchestrator pipeline or apply.
 * Payload: { action: 'run'|'apply', criteria?, applicationId? }
 */
import dotenv from 'dotenv';
dotenv.config();

import OrchestratorAgent from './agents/OrchestratorAgent.js';
import { setRunState } from './services/runState.js';

function noopBroadcast() {}

export async function handler(event) {
  let payload = event;
  if (Buffer.isBuffer(payload)) {
    payload = JSON.parse(payload.toString('utf8'));
  } else if (typeof payload === 'string') {
    payload = JSON.parse(payload);
  }

  const action = payload?.action || 'run';
  const broadcast = noopBroadcast;

  if (action === 'run') {
    await setRunState({ running: true, lastRunResult: null });
    try {
      const orchestrator = new OrchestratorAgent({ broadcast });
      const lastRunResult = await orchestrator.run(payload.criteria);
      await setRunState({ running: false, lastRunResult });
      return { ok: true, lastRunResult };
    } catch (err) {
      console.error('[worker-lambda] run error:', err);
      await setRunState({ running: false, lastRunResult: { error: err.message } });
      throw err;
    }
  }

  if (action === 'apply') {
    const { applicationId } = payload;
    if (!applicationId) {
      return { ok: false, error: 'applicationId is required' };
    }
    const ApplicatorAgent = (await import('./agents/ApplicatorAgent.js')).default;
    const applicator = new ApplicatorAgent({ broadcast });
    const result = await applicator.applyToApplication(applicationId);
    return { ok: true, result };
  }

  return { ok: false, error: `Unknown action: ${action}` };
}
