import { Router } from 'express';
import OrchestratorAgent from '../agents/OrchestratorAgent.js';
import { setBroadcast } from '../services/hitl.js';
import { requireApiKey } from '../middleware/apiKey.js';
import { getRunState, setRunState } from '../services/runState.js';
import { updateApplicationStatus } from '../services/dynamodb.js';
import { shouldUseWorkerLambda, invokeOrchestratorAsync } from '../services/workerInvoke.js';

export function createAgentRoutes(broadcast) {
  const router = Router();

  router.post('/api/agents/run', requireApiKey, async (req, res, next) => {
    const state = await getRunState();
    if (state.running) {
      return res.status(409).json({ error: 'An agent run is already in progress' });
    }

    try { req.setTimeout(600_000); } catch {}
    try { res.setTimeout(600_000); } catch {}

    if (shouldUseWorkerLambda()) {
      try {
        await setRunState({ running: true, lastRunResult: null });
        broadcast({
          type: 'agent:status',
          status: 'running',
          message: 'Pipeline started — searching for jobs',
        });
        await invokeOrchestratorAsync({ action: 'run', criteria: req.body?.criteria });
        return res.json({
          status: 'started',
          message: 'Pipeline started on worker Lambda. Poll GET /api/agents/status.',
        });
      } catch (err) {
        console.error('[agents/run] Invoke error:', err.message);
        await setRunState({ running: false, lastRunResult: { error: err.message } });
        broadcast({
          type: 'agent:run_error',
          error: err.message,
          message: `Run failed: ${err.message}`,
        });
        return res.status(500).json({ error: err.message || 'Failed to start pipeline on worker' });
      }
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

    try { req.setTimeout(600_000); } catch {}
    try { res.setTimeout(600_000); } catch {}

    if (shouldUseWorkerLambda()) {
      const { id } = req.params;
      try {
        await updateApplicationStatus(id, 'applying');
        await setRunState({ running: true });
        broadcast({ type: 'agent:status', status: 'applying', message: 'Applying to job…' });
        await invokeOrchestratorAsync({ action: 'apply', applicationId: id });
        return res.json({
          status: 'started',
          applicationId: id,
          message: 'Apply started on worker Lambda. Poll GET /api/agents/status or check job status.',
        });
      } catch (err) {
        console.error('[agents/apply] Invoke error:', err.message);
        await setRunState({ running: false });
        try {
          await updateApplicationStatus(id, 'ready');
        } catch (e) {
          console.error('[agents/apply] Could not revert status to ready:', e.message);
        }
        broadcast({ type: 'agent:status', status: 'idle', message: 'Apply error' });
        return res.status(500).json({ error: err.message || 'Failed to start apply on worker' });
      }
    }

    await setRunState({ running: true });
    broadcast({ type: 'agent:status', status: 'applying', message: 'Applying to job…' });

    const { id } = req.params;
    res.json({
      status: 'started',
      applicationId: id,
      message: 'Apply started. Track progress via job status / interventions.',
    });

    try {
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
    } catch (err) {
      console.error('[agents/apply] Async apply error:', err.message);
      broadcast({ type: 'agent:status', status: 'idle', message: 'Apply error' });
      broadcast({
        type: 'agent:apply_complete',
        applicationId: id,
        result: { success: false, status: 'failed', message: err.message },
        message: `Apply failed: ${err.message}`,
      });
    } finally {
      await setRunState({ running: false });
    }
  });

  setBroadcast(broadcast);

  return router;
}
