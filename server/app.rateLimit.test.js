import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

const noop = () => {};

afterEach(() => {
  delete process.env.RATE_LIMIT_ENABLED;
  delete process.env.RATE_LIMIT_MAX;
  delete process.env.RATE_LIMIT_WINDOW_MS;
});

describe('mutation rate limit', () => {
  it('does not limit GET when RATE_LIMIT_ENABLED=true', async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.RATE_LIMIT_MAX = '1';
    const app = createApp({ broadcast: noop });
    const a = await request(app).get('/api/schedule');
    const b = await request(app).get('/api/schedule');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('returns 429 on POST burst when max is 1', async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.RATE_LIMIT_MAX = '1';
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
    const app = createApp({ broadcast: noop });
    await request(app).post('/api/schedule').send({ cron: '0 0 * * *', enabled: false });
    const second = await request(app).post('/api/schedule').send({ cron: '0 0 * * *', enabled: false });
    expect(second.status).toBe(429);
    expect(second.body?.error || second.text).toBeTruthy();
  });
});
