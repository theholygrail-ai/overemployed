import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('./agents/ApplicatorAgent.js', () => ({
  default: class ApplicatorAgent {
    async applyToApplication() {
      await new Promise((r) => setTimeout(r, 30));
      return { success: true };
    }
  },
}));

vi.mock('./services/workerInvoke.js', () => ({
  shouldUseWorkerLambda: () => false,
  invokeOrchestratorAsync: vi.fn(),
}));

import { createApp } from './app.js';
import { setRunState } from './services/runState.js';

describe('POST /api/jobs/:id/apply', () => {
  beforeEach(async () => {
    delete process.env.DATA_S3_BUCKET;
    await setRunState({
      running: false,
      lastRunResult: null,
      activityLog: [],
      runToken: null,
      applyInProgress: false,
      applyApplicationId: null,
    });
  });

  it('allows apply while the orchestrator pipeline flag is running (separate apply state)', async () => {
    await setRunState({ running: true, lastRunResult: null, activityLog: [], runToken: 't-pipe' });

    const app = createApp({ broadcast: () => {} });
    const res = await request(app).post('/api/jobs/job-apply-1/apply').send({});

    expect(res.status).toBe(200);
    expect(res.body?.status).toBe('started');
    expect(res.body?.applicationId).toBe('job-apply-1');

    const st = await request(app).get('/api/agents/status');
    expect(st.body?.pipelineRunning).toBe(true);
    expect(st.body?.applyInProgress).toBe(true);
    expect(st.body?.status).toBe('running');

    await new Promise((r) => setTimeout(r, 80));
    const after = await request(app).get('/api/agents/status');
    expect(after.body?.applyInProgress).toBe(false);
    expect(after.body?.pipelineRunning).toBe(true);
  });

  it('returns 409 when another apply is already in progress', async () => {
    const app = createApp({ broadcast: () => {} });
    const first = request(app).post('/api/jobs/job-a/apply').send({});
    const second = request(app).post('/api/jobs/job-b/apply').send({});
    const [r1, r2] = await Promise.all([first, second]);
    const ok = [r1, r2].find((r) => r.status === 200);
    const conflict = [r1, r2].find((r) => r.status === 409);
    expect(ok).toBeTruthy();
    expect(conflict).toBeTruthy();
    expect(conflict.body?.error).toMatch(/An apply is already in progress/);
  });
});
