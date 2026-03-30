import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('./services/workerInvoke.js', () => ({
  shouldUseWorkerLambda: () => true,
  invokeOrchestratorAsync: vi.fn().mockResolvedValue(undefined),
}));

import { createApp } from './app.js';
import { setRunState } from './services/runState.js';

describe('POST /api/agents/run concurrency', () => {
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

  it('allows exactly one in-flight start when using worker Lambda', async () => {
    const app = createApp({ broadcast: () => {} });
    const batch = Array.from({ length: 20 }, () => request(app).post('/api/agents/run').send({}));
    const results = await Promise.all(batch);
    const started = results.filter((r) => r.status === 200);
    const conflict = results.filter((r) => r.status === 409);
    expect(started.length).toBe(1);
    expect(conflict.length).toBe(19);
    expect(started[0].body?.status).toBe('started');
    expect(started[0].body?.runToken).toBeTruthy();
  });
});
