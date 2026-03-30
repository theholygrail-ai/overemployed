import { describe, it, expect, vi, beforeEach } from 'vitest';

const bbMock = vi.hoisted(() => ({
  probeBrowserbaseApply: vi.fn(),
  isBrowserbaseStagehandEnabled: vi.fn(),
  applyWithBrowserbasePlaywright: vi.fn(),
  applyWithBrowserbaseStagehand: vi.fn(),
}));

const novaMock = vi.hoisted(() => ({
  probeNovaActAws: vi.fn(),
  applyWithNovaActAws: vi.fn(),
}));

vi.mock('./browserbaseApplyService.js', () => ({
  probeBrowserbaseApply: bbMock.probeBrowserbaseApply,
  isBrowserbaseStagehandEnabled: bbMock.isBrowserbaseStagehandEnabled,
  applyWithBrowserbasePlaywright: bbMock.applyWithBrowserbasePlaywright,
  applyWithBrowserbaseStagehand: bbMock.applyWithBrowserbaseStagehand,
}));

vi.mock('./novaActAwsService.js', () => ({
  probeNovaActAws: novaMock.probeNovaActAws,
  applyWithNovaActAws: novaMock.applyWithNovaActAws,
}));

describe('automationRouter.applyToJob', () => {
  beforeEach(() => {
    vi.resetModules();
    bbMock.probeBrowserbaseApply.mockReset();
    bbMock.isBrowserbaseStagehandEnabled.mockReset();
    bbMock.applyWithBrowserbasePlaywright.mockReset();
    bbMock.applyWithBrowserbaseStagehand.mockReset();
    novaMock.probeNovaActAws.mockReset();
    novaMock.applyWithNovaActAws.mockReset();
  });

  it('uses Browserbase Playwright by default when probe passes', async () => {
    bbMock.probeBrowserbaseApply.mockReturnValue(true);
    bbMock.isBrowserbaseStagehandEnabled.mockReturnValue(false);
    bbMock.applyWithBrowserbasePlaywright.mockResolvedValue({
      success: true,
      status: 'applied',
      verified: true,
      message: 'ok',
    });

    const { applyToJob } = await import('./automationRouter.js');
    const job = { url: 'https://x.com', title: 'T', company: 'C' };
    const r = await applyToJob(job, { docxPath: '/a', pdfPath: '/b' }, {}, [], {});

    expect(r.engine).toBe('browserbase-playwright');
    expect(r.success).toBe(true);
    expect(bbMock.applyWithBrowserbasePlaywright).toHaveBeenCalledTimes(1);
    expect(bbMock.applyWithBrowserbaseStagehand).not.toHaveBeenCalled();
    expect(novaMock.applyWithNovaActAws).not.toHaveBeenCalled();
  });

  it('uses Browserbase Stagehand when explicitly enabled', async () => {
    bbMock.probeBrowserbaseApply.mockReturnValue(true);
    bbMock.isBrowserbaseStagehandEnabled.mockReturnValue(true);
    bbMock.applyWithBrowserbaseStagehand.mockResolvedValue({
      success: true,
      status: 'applied',
      verified: true,
      message: 'ok',
    });

    const { applyToJob } = await import('./automationRouter.js');
    const job = { url: 'https://x.com', title: 'T', company: 'C' };
    const r = await applyToJob(job, { docxPath: '/a', pdfPath: '/b' }, {}, [], {});

    expect(r.engine).toBe('browserbase-stagehand');
    expect(bbMock.applyWithBrowserbaseStagehand).toHaveBeenCalledTimes(1);
    expect(bbMock.applyWithBrowserbasePlaywright).not.toHaveBeenCalled();
  });

  it('falls back to Nova when Browserbase is not configured', async () => {
    bbMock.probeBrowserbaseApply.mockReturnValue(false);
    novaMock.probeNovaActAws.mockResolvedValue(true);
    novaMock.applyWithNovaActAws.mockResolvedValue({
      success: true,
      status: 'applied',
      verified: true,
      message: 'nova ok',
    });

    const { applyToJob } = await import('./automationRouter.js');
    const job = { url: 'https://x.com', title: 'T', company: 'C' };
    const r = await applyToJob(job, { docxPath: '/a', pdfPath: '/b' }, {}, [], {});

    expect(r.engine).toBe('nova-act-aws');
    expect(r.success).toBe(true);
    expect(novaMock.applyWithNovaActAws).toHaveBeenCalledTimes(1);
    expect(bbMock.applyWithBrowserbasePlaywright).not.toHaveBeenCalled();
    expect(bbMock.applyWithBrowserbaseStagehand).not.toHaveBeenCalled();
  });

  it('returns failed when neither path is available', async () => {
    bbMock.probeBrowserbaseApply.mockReturnValue(false);
    novaMock.probeNovaActAws.mockResolvedValue(false);

    const { applyToJob } = await import('./automationRouter.js');
    const job = { url: 'https://x.com', title: 'T', company: 'C' };
    const r = await applyToJob(job, { docxPath: '/a', pdfPath: '/b' }, {}, [], {});

    expect(r.engine).toBe('none');
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/Browserbase|Nova Act/);
  });
});
