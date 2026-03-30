/**
 * Mocked Browserbase + Stagehand apply path (no live sessions).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('../s3Json.js', () => ({
  isS3DataEnabled: () => false,
  putBinaryKey: vi.fn(),
}));

const mockPage = {
  goto: vi.fn().mockResolvedValue(undefined),
  url: vi.fn().mockReturnValue('https://example.com/job'),
  evaluate: vi.fn().mockResolvedValue(''),
  screenshot: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

vi.mock('@browserbasehq/stagehand', () => {
  class MockStagehand {
    constructor() {
      this.init = vi.fn().mockResolvedValue(undefined);
      this.close = vi.fn().mockResolvedValue(undefined);
      this.browserbaseSessionURL = 'https://www.browserbase.com/sessions/test-session';
      this.browserbaseSessionID = 'test-session';
      this.context = {
        pages: () => [mockPage],
        addCookies: vi.fn().mockResolvedValue(undefined),
      };
      this.agent = vi.fn().mockReturnValue({
        execute: vi.fn().mockImplementation(async (opts) => {
          const onStepFinish = opts?.callbacks?.onStepFinish;
          if (onStepFinish) {
            await onStepFinish();
          }
          return {
            success: true,
            completed: true,
            message: 'Application submitted.',
            actions: [{ type: 'act', instruction: 'click apply' }],
          };
        }),
      });
    }
  }
  return { Stagehand: MockStagehand };
});

describe('applyWithBrowserbaseStagehand (mocked Stagehand)', () => {
  const prev = {
    bbKey: process.env.BROWSERBASE_API_KEY,
    bbProj: process.env.BROWSERBASE_PROJECT_ID,
    openai: process.env.OPENAI_API_KEY,
  };

  let tmpDir;
  let pdfPath;

  beforeEach(async () => {
    vi.resetModules();
    mockPage.goto.mockClear();
    mockPage.screenshot.mockClear();
    mockPage.evaluate.mockClear();
    tmpDir = mkdtempSync(join(tmpdir(), 'oe-bb-test-'));
    pdfPath = join(tmpDir, 'cv.pdf');
    writeFileSync(pdfPath, '%PDF-1.4 mock');
    process.env.BROWSERBASE_API_KEY = 'bb-test-key';
    process.env.BROWSERBASE_PROJECT_ID = 'proj-test';
    process.env.OPENAI_API_KEY = 'sk-test';
  });

  afterEach(() => {
    try {
      unlinkSync(pdfPath);
    } catch {
      /* ignore */
    }
    if (prev.bbKey === undefined) delete process.env.BROWSERBASE_API_KEY;
    else process.env.BROWSERBASE_API_KEY = prev.bbKey;
    if (prev.bbProj === undefined) delete process.env.BROWSERBASE_PROJECT_ID;
    else process.env.BROWSERBASE_PROJECT_ID = prev.bbProj;
    if (prev.openai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prev.openai;
  });

  it('returns applied with screenshot when agent completes', async () => {
    const { applyWithBrowserbaseStagehand } = await import('./browserbaseApplyService.js');

    const job = { url: 'https://example.com/job', title: 'Role', company: 'Co' };
    const knowledgePack = {
      applicationId: 'app-bb-1',
      tailoredCV: 'Skills: testing',
      roleTitle: 'Engineer',
      company: 'Acme',
    };
    const profile = { name: 'Test', email: 't@test.com', phone: '1' };

    const result = await applyWithBrowserbaseStagehand(
      job,
      { docxPath: pdfPath, pdfPath },
      profile,
      [],
      { knowledgePack, sessionCookies: [] },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('applied');
    expect(result.verified).toBe(true);
    expect(result.message).toContain('Application submitted');
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com/job', expect.any(Object));
  }, 20000);

  it('invokes onPendingHuman when URL suggests a human intervention wall', async () => {
    const { applyWithBrowserbaseStagehand } = await import('./browserbaseApplyService.js');

    mockPage.url.mockReturnValue('https://example.com/captcha');

    const onPendingHuman = vi.fn().mockResolvedValue(undefined);
    const job = { url: 'https://example.com/job', title: 'Role', company: 'Co' };
    const knowledgePack = {
      applicationId: 'app-bb-1',
      tailoredCV: 'Skills: testing',
      roleTitle: 'Engineer',
      company: 'Acme',
    };
    const profile = { name: 'Test', email: 't@test.com', phone: '1' };

    const result = await applyWithBrowserbaseStagehand(
      job,
      { docxPath: pdfPath, pdfPath },
      profile,
      [],
      { knowledgePack, sessionCookies: [], onPendingHuman },
    );

    expect(result.success).toBe(true);
    expect(onPendingHuman).toHaveBeenCalledTimes(1);
    expect(onPendingHuman.mock.calls[0]?.[0]?.reason).toContain('url=');
  }, 20000);

  it('invokes onPendingHuman when page text suggests CAPTCHA/login wall', async () => {
    const { applyWithBrowserbaseStagehand } = await import('./browserbaseApplyService.js');

    mockPage.url.mockReturnValue('https://example.com/job');
    mockPage.evaluate.mockResolvedValue('Please verify you are human to continue.');

    const onPendingHuman = vi.fn().mockResolvedValue(undefined);
    const job = { url: 'https://example.com/job', title: 'Role', company: 'Co' };
    const knowledgePack = {
      applicationId: 'app-bb-2',
      tailoredCV: 'Skills: testing',
      roleTitle: 'Engineer',
      company: 'Acme',
    };
    const profile = { name: 'Test', email: 't@test.com', phone: '1' };

    const result = await applyWithBrowserbaseStagehand(
      job,
      { docxPath: pdfPath, pdfPath },
      profile,
      [],
      { knowledgePack, sessionCookies: [], onPendingHuman },
    );

    expect(result.success).toBe(true);
    expect(onPendingHuman).toHaveBeenCalledTimes(1);
  }, 20000);
});
