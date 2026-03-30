import { describe, it, expect, beforeEach, afterAll } from 'vitest';

const hadBucket = 'DATA_S3_BUCKET' in process.env;
const prevBucket = process.env.DATA_S3_BUCKET;

describe('runState (local, no S3)', () => {
  beforeEach(() => {
    delete process.env.DATA_S3_BUCKET;
  });

  afterAll(() => {
    if (hadBucket && prevBucket !== undefined) process.env.DATA_S3_BUCKET = prevBucket;
    else delete process.env.DATA_S3_BUCKET;
  });

  beforeEach(async () => {
    const { setRunState } = await import('./runState.js');
    await setRunState({
      running: false,
      lastRunResult: null,
      activityLog: [],
      runToken: null,
      applyInProgress: false,
      applyApplicationId: null,
    });
  }, 60_000);

  it('persists activity log entries from appendRunActivity', async () => {
    const { getRunState, setRunState, appendRunActivity } = await import('./runState.js');
    await setRunState({ running: true, lastRunResult: null, activityLog: [], runToken: 't1' });
    await appendRunActivity({ type: 'agent_log', message: 'hello', agent: 'researcher', event: 'find_jobs_start' });
    const s = await getRunState();
    expect(s.activityLog.length).toBe(1);
    expect(s.activityLog[0].message).toBe('hello');
    expect(s.runToken).toBe('t1');
  });

  it('ignores non-persisted broadcast types', async () => {
    const { getRunState, appendRunActivity } = await import('./runState.js');
    await appendRunActivity({ type: 'schedule:updated', message: 'x' });
    const s = await getRunState();
    expect(s.activityLog.length).toBe(0);
  });
});
