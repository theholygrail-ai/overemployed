/**
 * Apply automation diagnostics (no secrets in responses).
 */
import { Router } from 'express';
import {
  isBrowserbaseApplyConfigured,
  isBrowserbaseStagehandEnabled,
  probeBrowserbaseApply,
} from '../services/automation/browserbaseApplyService.js';
import { probeNovaActAws } from '../services/automation/novaActAwsService.js';

const router = Router();

router.get('/api/automation/status', async (req, res, next) => {
  try {
    const bbEnv = isBrowserbaseApplyConfigured();
    const bbProbe = probeBrowserbaseApply();
    const novaReady = await probeNovaActAws();
    const applyEngine = bbProbe
      ? (isBrowserbaseStagehandEnabled() ? 'browserbase-stagehand' : 'browserbase-playwright')
      : novaReady
        ? 'nova-act-aws'
        : 'none';

    let browserbaseVerify = null;
    const wantVerify = String(req.query.verify || '') === '1';
    if (wantVerify && bbEnv) {
      try {
        const { default: Browserbase } = await import('@browserbasehq/sdk');
        const apiKey = String(process.env.BROWSERBASE_API_KEY || '').trim();
        const projectId = String(process.env.BROWSERBASE_PROJECT_ID || '').trim();
        const bb = new Browserbase({ apiKey });
        const project = await bb.projects.retrieve(projectId);
        browserbaseVerify = {
          ok: true,
          projectId: project.id,
          projectName: project.name,
        };
      } catch (e) {
        browserbaseVerify = {
          ok: false,
          error: e?.message || String(e),
        };
      }
    }

    res.json({
      applyEngine,
      browserbase: {
        envConfigured: bbEnv,
        readyForApply: bbProbe,
        stagehandAgentEnabled: isBrowserbaseStagehandEnabled(),
        stagehandModel: String(process.env.STAGEHAND_MODEL || 'openai/gpt-4o').trim(),
        apiVerify: browserbaseVerify,
      },
      novaAct: { ready: novaReady },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
