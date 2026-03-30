/**
 * Simulates one full applyWithNovaActAws success path (Nova API + Playwright) with mocks.
 * Validates wiring: workflow run → session → act → invoke loop → SUCCEEDED.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('../s3Json.js', () => ({
  isS3DataEnabled: () => false,
  putBinaryKey: vi.fn(),
}));

vi.mock('./novaActCloudWatch.js', () => ({
  tailNovaActLogGroup: vi.fn(),
}));

let listActsIterations = 0;

vi.mock('@aws-sdk/client-nova-act', () => {
  const ActStatus = {
    FAILED: 'FAILED',
    PENDING_HUMAN_ACTION: 'PENDING_HUMAN_ACTION',
    RUNNING: 'RUNNING',
    SUCCEEDED: 'SUCCEEDED',
    TIMED_OUT: 'TIMED_OUT',
  };
  const SortOrder = { ASC: 'Ascending', DESC: 'Descending' };

  class ResourceNotFoundException extends Error {
    constructor(opts = {}) {
      super(opts.message || 'not found');
      this.name = 'ResourceNotFoundException';
      this.resourceId = opts.resourceId;
      this.resourceType = opts.resourceType;
    }
  }

  class ListModelsCommand {}
  class CreateWorkflowRunCommand {}
  class GetWorkflowRunCommand {}
  class CreateSessionCommand {}
  class CreateActCommand {}
  class ListActsCommand {}
  class InvokeActStepCommand {}
  class UpdateActCommand {}

  class NovaActClient {
    middlewareStack = { add: vi.fn() };
    async send(cmd) {
      const n = cmd.constructor.name;
      if (n === 'ListModelsCommand') {
        return { compatibilityInformation: { clientCompatibilityVersion: 1 } };
      }
      if (n === 'CreateWorkflowRunCommand') {
        return { workflowRunId: 'wr-mock-1', status: 'RUNNING' };
      }
      if (n === 'GetWorkflowRunCommand') {
        return { logGroupName: '/aws/nova-act/mock' };
      }
      if (n === 'CreateSessionCommand') {
        return { sessionId: 'sess-mock-1' };
      }
      if (n === 'CreateActCommand') {
        return { actId: 'act-mock-1', status: ActStatus.RUNNING };
      }
      if (n === 'ListActsCommand') {
        listActsIterations += 1;
        if (listActsIterations >= 2) {
          return { actSummaries: [{ actId: 'act-mock-1', status: ActStatus.SUCCEEDED }] };
        }
        return { actSummaries: [{ actId: 'act-mock-1', status: ActStatus.RUNNING }] };
      }
      if (n === 'InvokeActStepCommand') {
        return { stepId: `step-${listActsIterations}`, calls: [] };
      }
      if (n === 'UpdateActCommand') {
        return {};
      }
      throw new Error(`Unexpected Nova command: ${n}`);
    }
  }

  return {
    NovaActClient,
    ResourceNotFoundException,
    ListModelsCommand,
    CreateWorkflowRunCommand,
    GetWorkflowRunCommand,
    CreateSessionCommand,
    CreateActCommand,
    ListActsCommand,
    InvokeActStepCommand,
    UpdateActCommand,
    ActStatus,
    SortOrder,
  };
});

function createMockPage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('https://example.com/'),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    mouse: {
      click: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
    },
    keyboard: {
      type: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    },
  };
}

vi.mock('playwright', () => {
  const mockContext = {
    addCookies: vi.fn().mockResolvedValue(undefined),
    newCDPSession: vi.fn().mockRejectedValue(new Error('CDP unavailable in test mock')),
  };
  mockContext.newPage = vi.fn().mockImplementation(async () => {
    const page = createMockPage();
    page.context = () => mockContext;
    return page;
  });
  return {
    chromium: {
      launch: vi.fn().mockImplementation(async () => ({
        newContext: vi.fn().mockImplementation(async () => mockContext),
        close: vi.fn().mockResolvedValue(undefined),
      })),
    },
  };
});

describe('applyWithNovaActAws (mocked AWS + Playwright)', () => {
  const prev = {
    wf: process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME,
    lambda: process.env.AWS_LAMBDA_FUNCTION_NAME,
    compat: process.env.NOVA_ACT_COMPATIBILITY_VERSION,
    headless: process.env.NOVA_ACT_HEADLESS,
  };

  let tmpDir;
  let pdfPath;

  beforeEach(async () => {
    listActsIterations = 0;
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), 'oe-nova-test-'));
    pdfPath = join(tmpDir, 'cv.pdf');
    writeFileSync(pdfPath, '%PDF-1.4 mock');
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME = 'mock-workflow';
    process.env.NOVA_ACT_COMPATIBILITY_VERSION = '1';
    process.env.NOVA_ACT_HEADLESS = 'true';
  });

  afterEach(() => {
    try {
      unlinkSync(pdfPath);
    } catch {
      /* ignore */
    }
    if (prev.wf === undefined) delete process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME;
    else process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME = prev.wf;
    if (prev.lambda === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    else process.env.AWS_LAMBDA_FUNCTION_NAME = prev.lambda;
    if (prev.compat === undefined) delete process.env.NOVA_ACT_COMPATIBILITY_VERSION;
    else process.env.NOVA_ACT_COMPATIBILITY_VERSION = prev.compat;
    if (prev.headless === undefined) delete process.env.NOVA_ACT_HEADLESS;
    else process.env.NOVA_ACT_HEADLESS = prev.headless;
  });

  it(
    'completes one successful application run when act reaches SUCCEEDED',
    async () => {
    const { applyWithNovaActAws } = await import('./novaActAwsService.js');

    const job = { url: 'https://example.com/', title: 'Role', company: 'Co' };
    const knowledgePack = {
      applicationId: 'app-mock-1',
      tailoredCV: 'cv text',
      roleTitle: 'Engineer',
      company: 'Acme',
    };
    const profile = { name: 'Test', email: 't@test.com', phone: '1' };
    const traces = [];

    const result = await applyWithNovaActAws(
      job,
      { docxPath: pdfPath, pdfPath },
      profile,
      [],
      {
        knowledgePack,
        sessionCookies: [],
        onTrace: line => traces.push(line),
      },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe('applied');
    expect(result.verified).toBe(true);
    expect(result.message).toMatch(/completed/i);
    expect(traces.some(t => /Workflow run wr-mock-1/.test(t))).toBe(true);
    expect(traces.some(t => /Act SUCCEEDED/.test(t))).toBe(true);
    },
    60_000,
  );
});
