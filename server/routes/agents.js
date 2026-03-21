import { Router } from 'express';
import OrchestratorAgent from '../agents/OrchestratorAgent.js';
import { setBroadcast } from '../services/hitl.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { getRunState, setRunState } from '../services/runState.js';
import {
  shouldUseWorkerLambda,
  invokeOrchestratorAsync,
  invokeWorkerSync,
} from '../services/workerInvoke.js';

export function createAgentRoutes(broadcast) {
  const router = Router();

  router.post('/api/agents/run', requireApiKey, async (req, res, next) => {
    const state = await getRunState();
    if (state.running) {
      return res.status(409).json({ error: 'An agent run is already in progress' });
    }

    req.setTimeout(600_000);
    res.setTimeout(600_000);

    if (shouldUseWorkerLambda()) {
      try {
        await setRunState({ running: true, lastRunResult: null });
        broadcast({
          type: 'agent:status',
          status: 'running',
          message: 'Pipeline started — searching for jobs',
        });
        res.json({
          status: 'started',
          message: 'Pipeline started on worker Lambda. Poll GET /api/agents/status.',
        });
        await invokeOrchestratorAsync({ action: 'run', criteria: req.body?.criteria });
      } catch (err) {
        console.error('[agents/run] Invoke error:', err.message);
        await setRunState({ running: false, lastRunResult: { error: err.message } });
        broadcast({
          type: 'agent:run_error',
          error: err.message,
          message: `Run failed: ${err.message}`,
        });
      }
      return;
    }

    await setRunState({ running: true, lastRunResult: null });
    broadcast({
      type: 'agent:status',
      status: 'running',
      message: 'Pipeline started — searching for jobs',
    });

    res.json({
      status: 'started',
      message: 'Pipeline started. Track progress via WebSocket or GET /api/agents/status.',
    });

    try {
      const { criteria } = req.body || {};
      const orchestrator = new OrchestratorAgent({ broadcast });
      const lastRunResult = await orchestrator.run(criteria);

      const j = lastRunResult?.jobsFound ?? 0;
      const c = lastRunResult?.cvsGenerated ?? 0;
      const s = lastRunResult?.stored ?? 0;
      await setRunState({ running: false, lastRunResult });
      broadcast({ type: 'agent:status', status: 'idle', message: 'Pipeline idle' });
      broadcast({
        type: 'agent:run_complete',
        result: lastRunResult,
        message: `Done — ${j} jobs found, ${c} CVs generated, ${s} saved`,
      });
    } catch (err) {
      console.error('[agents/run] Pipeline error:', err.message);
      await setRunState({ running: false, lastRunResult: { error: err.message } });
      broadcast({ type: 'agent:status', status: 'idle', message: 'Pipeline idle' });
      broadcast({
        type: 'agent:run_error',
        error: err.message,
        message: `Run failed: ${err.message}`,
      });
    }
  });

  router.get('/api/agents/history', async (req, res, next) => {
    try {
      const orchestrator = new OrchestratorAgent({ broadcast });
      const history = await orchestrator.getRunHistory();
      res.json(history);
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/agents/status', async (req, res) => {
    const s = await getRunState();
    res.json({ status: s.running ? 'running' : 'idle', lastRunResult: s.lastRunResult });
  });

  router.post('/api/jobs/:id/apply', requireApiKey, async (req, res, next) => {
    const state = await getRunState();
    if (state.running) {
      return res.status(409).json({ error: 'An agent run is already in progress' });
    }

    req.setTimeout(600_000);
    res.setTimeout(600_000);

    if (shouldUseWorkerLambda()) {
      await setRunState({ running: true });
      broadcast({ type: 'agent:status', status: 'applying', message: 'Applying to job…' });
      try {
        const { id } = req.params;
        const data = await invokeWorkerSync({ action: 'apply', applicationId: id });
        const result = data?.result ?? data;
        broadcast({ type: 'agent:status', status: 'idle', message: 'Pipeline idle' });
        broadcast({
          type: 'agent:apply_complete',
          applicationId: id,
          result,
          message: result?.success ? 'Application submitted' : 'Apply finished',
        });
        res.json(result);
      } catch (err) {
        broadcast({ type: 'agent:status', status: 'idle', message: 'Apply error' });
        next(err);
      } finally {
        await setRunState({ running: false });
      }
      return;
    }

    await setRunState({ running: true });
    broadcast({ type: 'agent:status', status: 'applying', message: 'Applying to job…' });

    try {
      const { id } = req.params;
      const ApplicatorAgent = (await import('../agents/ApplicatorAgent.js')).default;
      const applicator = new ApplicatorAgent({ broadcast });
      const result = await applicator.applyToApplication(id);

      broadcast({ type: 'agent:status', status: 'idle', message: 'Pipeline idle' });
      broadcast({
        type: 'agent:apply_complete',
        applicationId: id,
        result,
        message: result?.success ? 'Application submitted' : 'Apply finished',
      });

      res.json(result);
    } catch (err) {
      broadcast({ type: 'agent:status', status: 'idle', message: 'Apply error' });
      next(err);
    } finally {
      await setRunState({ running: false });
    }
  });

  setBroadcast(broadcast);

  return router;
}
