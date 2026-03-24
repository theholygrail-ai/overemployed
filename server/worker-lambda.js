/**
 * Worker Lambda (container image) — runs orchestrator pipeline or apply.
 * Payload: { action: 'run'|'apply', criteria?, applicationId? }
 */
import dotenv from 'dotenv';
dotenv.config();

import OrchestratorAgent from './agents/OrchestratorAgent.js';
import { getRunState, setRunState, appendRunActivity } from './services/runState.js';
import { resolveRunCriteria } from './services/jobSearchCriteria.js';

function persistBroadcast(event) {
  appendRunActivity(event).catch((e) => console.error('[worker-lambda] appendRunActivity:', e.message));
}

export async function handler(event) {
  let payload = event;
  if (Buffer.isBuffer(payload)) {
    payload = JSON.parse(payload.toString('utf8'));
  } else if (typeof payload === 'string') {
    payload = JSON.parse(payload);
  }

  const action = payload?.action || 'run';
  const broadcast = persistBroadcast;

  if (action === 'run') {
    await setRunState({ running: true, lastRunResult: null, activityLog: [] });
    try {
      const orchestrator = new OrchestratorAgent({ broadcast });
      const criteria = await resolveRunCriteria(payload.criteria);
      const lastRunResult = await orchestrator.run(criteria);
      const st = await getRunState();
      const merged = { ...lastRunResult, runToken: st.runToken };
      await setRunState({ running: false, lastRunResult: merged });
      const j = lastRunResult?.jobsFound ?? 0;
      const c = lastRunResult?.cvsGenerated ?? 0;
      const s = lastRunResult?.stored ?? 0;
      await persistBroadcast({ type: 'agent:status', status: 'idle', message: 'Pipeline idle' });
      await persistBroadcast({
        type: 'agent:run_complete',
        result: merged,
        message: `Done — ${j} jobs found, ${c} CVs generated, ${s} saved`,
      });
      return { ok: true, lastRunResult };
    } catch (err) {
      console.error('[worker-lambda] run error:', err);
      const st = await getRunState();
      await setRunState({ running: false, lastRunResult: { error: err.message, runToken: st.runToken } });
      await persistBroadcast({
        type: 'agent:run_error',
        error: err.message,
        message: `Run failed: ${err.message}`,
      });
      throw err;
    }
  }

  if (action === 'apply') {
    const { applicationId } = payload;
    if (!applicationId) {
      await setRunState({ running: false });
      return { ok: false, error: 'applicationId is required' };
    }
    try {
      const ApplicatorAgent = (await import('./agents/ApplicatorAgent.js')).default;
      const applicator = new ApplicatorAgent({ broadcast });
      const result = await applicator.applyToApplication(applicationId);
      await setRunState({ running: false });
      return { ok: true, result };
    } catch (err) {
      console.error('[worker-lambda] apply error:', err);
      await setRunState({ running: false });
      return { ok: false, error: err.message };
    }
  }

  return { ok: false, error: `Unknown action: ${action}` };
}
