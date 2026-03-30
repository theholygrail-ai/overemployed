/**
 * Amazon Nova Act — AWS control plane (IAM) + local Playwright tool execution.
 * Mirrors aws/nova-act BurstBackend invoke_act_step loop; no Groq; no legacy Python worker.
 *
 * Requires: us-east-1 credentials, NOVA_ACT_WORKFLOW_DEFINITION_NAME, DATA_S3_BUCKET for CV presign (recommended).
 * @see https://docs.aws.amazon.com/nova-act/latest/userguide/interfaces.html
 */

import fs from 'fs/promises';
import { chromium } from 'playwright';
import {
  NovaActClient,
  CreateWorkflowRunCommand,
  CreateSessionCommand,
  CreateActCommand,
  InvokeActStepCommand,
  ListActsCommand,
  GetWorkflowRunCommand,
  GetWorkflowDefinitionCommand,
  ListModelsCommand,
  UpdateActCommand,
  ActStatus,
  SortOrder,
  ResourceNotFoundException,
} from '@aws-sdk/client-nova-act';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isS3DataEnabled, putBinaryKey } from '../s3Json.js';
import { appendNovaActTrace, setNovaActRunMeta, setNovaActTaskPreview } from './novaActTraceBuffer.js';
import { setNovaActLiveFrame } from './novaActLiveFrame.js';
import { startNovaActScreencast } from './novaActScreencast.js';
import {
  buildInitialCallResults,
  executeNovaActCalls,
} from './novaActPlaywrightTools.js';
import { tailNovaActLogGroup } from './novaActCloudWatch.js';

export const NOVA_ACT_REGION = 'us-east-1';

const DEFAULT_TIMEOUT_MS = Number(process.env.NOVA_ACT_TIMEOUT_MS || 25 * 60 * 1000);
const MAX_INVOKE_STEPS = Number(process.env.NOVA_ACT_MAX_INVOKE_STEPS || 400);
const NOT_FOUND_RETRIES = (() => {
  const raw = process.env.NOVA_ACT_NOT_FOUND_RETRIES;
  const n = raw != null && String(raw).trim() !== '' ? Number(raw) : 4;
  if (!Number.isFinite(n) || n < 0) return 4;
  return Math.min(8, n);
})();
const delay = (ms) => new Promise(r => setTimeout(r, ms));

function isNovaTransientNotFound(err) {
  if (!err) return false;
  if (err instanceof ResourceNotFoundException) return true;
  const n = err.name || '';
  const msg = String(err.message || '');
  return n === 'ResourceNotFoundException' || /\bNOT_FOUND\b/i.test(msg) || /could not be found/i.test(msg);
}

function formatNovaActFailure(operation, err) {
  const msg = err?.message || String(err);
  const rt = err?.resourceType;
  const rid = err?.resourceId;
  if (rt || rid) {
    return `Nova Act ${operation} failed (${rt || 'resource'} ${rid || ''}): ${msg}`;
  }
  return `Nova Act ${operation} failed: ${msg}`;
}

/** @param {import('@aws-sdk/client-nova-act').NovaActClient} client */
async function sendNovaActWithRetry(client, operation, commandFactory) {
  let lastErr;
  for (let attempt = 0; attempt <= NOT_FOUND_RETRIES; attempt++) {
    try {
      return await client.send(commandFactory());
    } catch (e) {
      lastErr = e;
      if (attempt < NOT_FOUND_RETRIES && isNovaTransientNotFound(e)) {
        await delay(800 + attempt * 700);
        continue;
      }
      throw new Error(formatNovaActFailure(operation, e), { cause: e });
    }
  }
  throw new Error(formatNovaActFailure(operation, lastErr), { cause: lastErr });
}

const lastLiveFrameAt = new Map();
async function maybePushLiveFrame(page, applicationId) {
  if (!page || !applicationId) return;
  const id = String(applicationId);
  const now = Date.now();
  const prev = lastLiveFrameAt.get(id) || 0;
  if (now - prev < 650) return;
  lastLiveFrameAt.set(id, now);
  try {
    const buf = await page.screenshot({ type: 'png', timeout: 20_000 });
    let pageUrl = '';
    try {
      pageUrl = page.url();
    } catch {
      /* ignore */
    }
    setNovaActLiveFrame(id, buf, pageUrl);
  } catch {
    /* viewport may be busy */
  }
}

function trace(options, applicationId, line) {
  if (!line) return;
  appendNovaActTrace(applicationId, line);
  options.onTrace?.(line);
  options.onProgress?.(line);
}

export function isNovaActAwsApplyConfigured() {
  return Boolean(String(process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME || '').trim());
}

export function createNovaActClient() {
  const client = new NovaActClient({
    region: NOVA_ACT_REGION,
    maxAttempts: 4,
  });
  client.middlewareStack.add(
    next => async args => {
      const req = args.request;
      if (req?.headers) {
        req.headers['X-Client-Source'] = process.env.NOVA_ACT_CLIENT_SOURCE || 'OveremployedNode';
      }
      return next(args);
    },
    { step: 'build', name: 'xNovaActClientSource', tags: ['NOVA_ACT'] },
  );
  return client;
}

/**
 * Pick a model id that exists for this account + client compatibility.
 * A stale or wrong NOVA_ACT_MODEL_ID (e.g. deprecated alias) causes InvokeActStep to fail with
 * ResourceNotFoundException / "NOT_FOUND" and an opaque resource id in the message.
 */
function pickNovaActModelId(listModelsOutput, requestedModelId) {
  const supported = listModelsOutput.compatibilityInformation?.supportedModelIds || [];
  const supportedSet = new Set(supported.filter(Boolean));
  const aliases = listModelsOutput.modelAliases || [];
  const req = String(requestedModelId || '').trim();

  if (req && supportedSet.has(req)) return req;

  const byAlias = aliases.find(a => a.aliasName === req);
  const fromAlias = byAlias?.latestModelId || byAlias?.resolvedModelId;
  if (fromAlias && supportedSet.has(fromAlias)) return fromAlias;

  const novaLatest = aliases.find(a => a.aliasName === 'nova-act-latest');
  const nlm = novaLatest?.latestModelId || novaLatest?.resolvedModelId;
  if (nlm && supportedSet.has(nlm)) return nlm;

  for (const id of supported) {
    if (id) return id;
  }

  const active = (listModelsOutput.modelSummaries || []).find(
    s => s?.modelId && (!supportedSet.size || supportedSet.has(s.modelId)) && s.modelLifecycle?.status === 'ACTIVE',
  );
  if (active?.modelId) return active.modelId;

  return req || 'nova-act-latest';
}

async function resolveClientInfoAndModelId(client) {
  const forced = Number(process.env.NOVA_ACT_COMPATIBILITY_VERSION || '');
  const initialReqCv = Number.isFinite(forced) && forced > 0 ? forced : 1;

  let out = await client.send(
    new ListModelsCommand({ clientCompatibilityVersion: initialReqCv }),
  );
  let apiCv = out.compatibilityInformation?.clientCompatibilityVersion ?? initialReqCv;

  if (Number.isFinite(forced) && forced > 0 && apiCv !== forced) {
    console.warn(
      `[nova-act] NOVA_ACT_COMPATIBILITY_VERSION=${forced} but ListModels reports ${apiCv}. ` +
        'If apply fails with NOT_FOUND, unset NOVA_ACT_COMPATIBILITY_VERSION so the client version matches the API.',
    );
  }

  /**
   * Without NOVA_ACT_COMPATIBILITY_VERSION: first ListModels(1) may report a higher clientCompatibilityVersion.
   * Model lists for v1 vs v2 differ; picking a model from the wrong list causes NOT_FOUND on InvokeActStep.
   */
  if (!(Number.isFinite(forced) && forced > 0) && apiCv !== initialReqCv) {
    out = await client.send(new ListModelsCommand({ clientCompatibilityVersion: apiCv }));
    apiCv = out.compatibilityInformation?.clientCompatibilityVersion ?? apiCv;
  }

  const compatibilityVersion = Number.isFinite(forced) && forced > 0
    ? forced
    : apiCv;

  const requested = String(process.env.NOVA_ACT_MODEL_ID || 'nova-act-latest').trim();
  const modelId = pickNovaActModelId(out, requested);

  return {
    clientInfo: {
      compatibilityVersion,
      sdkVersion: process.env.NOVA_ACT_SDK_VERSION_TAG || 'overemployed-api/1.0.0',
    },
    modelId,
    requestedModelId: requested,
  };
}

async function presignCvPdf(pdfPath, applicationId, onLog) {
  if (!isS3DataEnabled()) {
    onLog('No DATA_S3_BUCKET — CV URL omitted from task (set bucket for presigned PDF).');
    return null;
  }
  const bucket = process.env.DATA_S3_BUCKET;
  const key = `nova-act-inputs/${applicationId}/cv.pdf`;
  const buf = await fs.readFile(pdfPath);
  await putBinaryKey(key, buf, 'application/pdf');
  const s3 = new S3Client({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1' });
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
  onLog('Uploaded CV to S3 for Nova Act session (presigned GET, 1h).');
  return url;
}

function buildApplyTask(job, knowledgePack, profile, cvPresignUrl) {
  const role = knowledgePack?.roleTitle || job.title || '';
  const company = knowledgePack?.company || job.company || '';
  const url = job.url || '';
  const name = profile?.name || '';
  const email = profile?.email || '';
  const phone = profile?.phone || '';
  const cvNote = cvPresignUrl
    ? `Download the applicant CV (PDF) from this temporary URL and use it for file uploads: ${cvPresignUrl}`
    : 'No presigned CV URL — answer from the tailored CV text below.';
  const tailored = String(knowledgePack?.tailoredCV || '').slice(0, 12000);

  return [
    `You are applying for the job "${role}" at "${company}".`,
    `Open the job posting at: ${url}`,
    cvNote,
    `Applicant: ${name}, email: ${email}, phone: ${phone}.`,
    'Complete the employer application flow: fill fields, upload CV where required, review, and submit.',
    'If you encounter CAPTCHA or impossible verification, stop and report clearly.',
    'When submission is confirmed on screen, call return with a short confirmation summary.',
    '',
    'Tailored CV / cover letter text (for copy-paste fields):',
    '---',
    tailored || '(none)',
    '---',
  ].join('\n');
}

async function applyPlaywrightCookies(context, cookies) {
  if (!cookies?.length) return;
  const pw = [];
  for (const c of cookies) {
    if (!c?.name || c.value == null || !c.domain) continue;
    pw.push({
      name: String(c.name),
      value: String(c.value),
      domain: String(c.domain),
      path: String(c.path || '/'),
    });
  }
  if (pw.length) await context.addCookies(pw);
}

function consoleRunUrl(workflowDefinitionName, workflowRunId) {
  return `https://${NOVA_ACT_REGION}.console.aws.amazon.com/nova-act/home?region=${NOVA_ACT_REGION}#run:${encodeURIComponent(workflowDefinitionName)}:${encodeURIComponent(workflowRunId)}`;
}

export async function probeNovaActAws() {
  const name = String(process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME || '').trim();
  if (!name) return false;
  try {
    const c = createNovaActClient();
    await c.send(new GetWorkflowDefinitionCommand({ workflowDefinitionName: name }));
    await c.send(new ListModelsCommand({ clientCompatibilityVersion: 1 }));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ url: string, title?: string, company?: string }} job
 * @param {{ docxPath: string, pdfPath: string }} cvAssets
 * @param {object} profile
 * @param {Array<{ filename: string, path: string }>} _artifacts
 * @param {object} options
 */
export async function applyWithNovaActAws(job, cvAssets, profile, _artifacts, options = {}) {
  const {
    knowledgePack,
    sessionCookies = [],
    liAtCookie,
    onProgress,
    onTrace,
    onPendingHuman,
    applicationId: appIdOpt,
  } = options;

  const applicationId = knowledgePack?.applicationId || appIdOpt || null;
  const workflowDefinitionName = String(process.env.NOVA_ACT_WORKFLOW_DEFINITION_NAME || '').trim();

  const onLog = line => trace({ onProgress, onTrace }, applicationId, line);

  if (!workflowDefinitionName) {
    return {
      success: false,
      status: 'failed',
      message: 'Set NOVA_ACT_WORKFLOW_DEFINITION_NAME (us-east-1 workflow definition).',
    };
  }

  if (process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.NOVA_ACT_ALLOW_LAMBDA_PLAYWRIGHT !== 'true') {
    return {
      success: false,
      status: 'failed',
      message:
        'Nova Act IAM apply uses Playwright in-process. Run apply on EC2/Docker API (or set NOVA_ACT_ALLOW_LAMBDA_PLAYWRIGHT=true with a Chromium-capable Lambda image).',
    };
  }

  const client = createNovaActClient();
  const started = Date.now();
  let browser;
  let workflowRunId;
  let logGroupName;
  let stopScreencast = async () => {};

  try {
    const { clientInfo, modelId, requestedModelId } = await resolveClientInfoAndModelId(client);
    if (modelId !== requestedModelId) {
      onLog(
        `NOVA_ACT_MODEL_ID "${requestedModelId}" is not usable for this account; using "${modelId}" (from ListModels).`,
      );
    }
    onLog(`Nova Act AWS — workflow "${workflowDefinitionName}" model ${modelId}`);
    const runOut = await sendNovaActWithRetry(client, 'CreateWorkflowRun', () => new CreateWorkflowRunCommand({
      workflowDefinitionName,
      modelId,
      clientInfo,
    }));
    workflowRunId = runOut.workflowRunId;
    onLog(`Workflow run ${workflowRunId} (${runOut.status || 'RUNNING'})`);

    const gr = await sendNovaActWithRetry(client, 'GetWorkflowRun', () => new GetWorkflowRunCommand({
      workflowDefinitionName,
      workflowRunId,
    }));
    logGroupName = gr.logGroupName || null;
    if (logGroupName) onLog(`CloudWatch log group: ${logGroupName}`);

    setNovaActRunMeta(applicationId, {
      workflowDefinitionName,
      workflowRunId,
      logGroupName,
      consoleUrl: consoleRunUrl(workflowDefinitionName, workflowRunId),
    });

    const sessOut = await sendNovaActWithRetry(client, 'CreateSession', () => new CreateSessionCommand({
      workflowDefinitionName,
      workflowRunId,
    }));
    const sessionId = sessOut.sessionId;
    onLog(`Session ${sessionId}`);

    const mergedCookies = [...(sessionCookies || [])];
    if (liAtCookie && job.url?.includes('linkedin.com')) {
      mergedCookies.push({
        name: 'li_at',
        value: liAtCookie,
        domain: '.linkedin.com',
        path: '/',
      });
    }

    let cvUrl = null;
    try {
      cvUrl = await presignCvPdf(cvAssets.pdfPath, applicationId, onLog);
    } catch (e) {
      onLog(`CV presign/upload skipped: ${e?.message || e}`);
    }

    const task = buildApplyTask(job, knowledgePack, profile, cvUrl);
    setNovaActTaskPreview(applicationId, task);
    const actOut = await sendNovaActWithRetry(client, 'CreateAct', () => new CreateActCommand({
      workflowDefinitionName,
      workflowRunId,
      sessionId,
      task,
    }));
    const actId = actOut.actId;
    onLog(`Act ${actId} (${actOut.status})`);

    browser = await chromium.launch({
      headless: process.env.NOVA_ACT_HEADLESS !== 'false',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        process.env.NOVA_ACT_USER_AGENT ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    });
    await applyPlaywrightCookies(context, mergedCookies);
    const page = await context.newPage();
    stopScreencast = await startNovaActScreencast(page, applicationId);
    try {
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    } catch (e) {
      await stopScreencast();
      stopScreencast = async () => {};
      throw e;
    }
    await maybePushLiveFrame(page, applicationId);

    let previousStepId;
    let stepCount = 0;
    let callResults = await buildInitialCallResults(page, onLog);

    while (stepCount < MAX_INVOKE_STEPS && Date.now() - started < DEFAULT_TIMEOUT_MS) {
      if (logGroupName && stepCount % 5 === 0) {
        void tailNovaActLogGroup(logGroupName, started - 60_000, msg => onLog(`[cw] ${msg}`));
      }

      const actList = await sendNovaActWithRetry(client, 'ListActs', () => new ListActsCommand({
        workflowDefinitionName,
        workflowRunId,
        sessionId,
        maxResults: 10,
        sortOrder: SortOrder.DESC,
      }));
      const summary = actList.actSummaries?.find(a => a.actId === actId);
      if (summary?.status === ActStatus.PENDING_HUMAN_ACTION) {
        await maybePushLiveFrame(page, applicationId);
        onLog('Act PENDING_HUMAN_ACTION — intervention required.');
        await onPendingHuman?.({
          reason: 'Nova Act requested human action (see AWS Console trace).',
          workflowDefinitionName,
          workflowRunId,
          sessionId,
          actId,
        });
        await sendNovaActWithRetry(client, 'UpdateAct', () => new UpdateActCommand({
          workflowDefinitionName,
          workflowRunId,
          sessionId,
          actId,
          status: ActStatus.RUNNING,
        }));
        onLog('Act resumed to RUNNING after intervention.');
      }
      if (summary?.status === ActStatus.SUCCEEDED) {
        onLog('Act SUCCEEDED.');
        const shotBuf = await page.screenshot({ type: 'png' }).catch(() => null);
        return {
          success: true,
          status: 'applied',
          verified: true,
          screenshot: shotBuf || undefined,
          screenshots: shotBuf ? [{ label: 'Nova Act AWS confirmation', buffer: shotBuf }] : [],
          message: 'Application flow completed (act SUCCEEDED).',
        };
      }
      if (
        summary?.status === ActStatus.FAILED ||
        summary?.status === ActStatus.TIMED_OUT
      ) {
        return {
          success: false,
          status: 'failed',
          message: `Nova Act act ${summary.status}`,
        };
      }

      const stepOut = await sendNovaActWithRetry(client, 'InvokeActStep', () => new InvokeActStepCommand({
        workflowDefinitionName,
        workflowRunId,
        sessionId,
        actId,
        callResults,
        previousStepId,
      }));
      stepCount += 1;
      previousStepId = stepOut.stepId;
      const calls = stepOut.calls || [];

      for (const c of calls) {
        const nm = c?.name || '';
        const inp = c?.input;
        const preview =
          typeof inp === 'object' ? JSON.stringify(inp).slice(0, 280) : String(inp).slice(0, 280);
        onLog(`→ ${nm} ${preview}${preview.length >= 280 ? '…' : ''}`);
      }

      if (!calls.length) {
        if (stepCount % 3 === 0) await maybePushLiveFrame(page, applicationId);
        await delay(1500);
        continue;
      }

      try {
        callResults = await executeNovaActCalls(page, calls, msg => onLog(`  ${msg}`));
        await maybePushLiveFrame(page, applicationId);
      } catch (e) {
        onLog(`Tool error: ${e?.message || e}`);
        return { success: false, status: 'failed', message: e?.message || String(e) };
      }
    }

    return {
      success: false,
      status: 'failed',
      message: `Nova Act step limit (${MAX_INVOKE_STEPS}) or timeout reached`,
    };
  } catch (e) {
    const msg = e?.message || String(e);
    onLog(`Fatal: ${msg}`);
    return { success: false, status: 'failed', message: msg };
  } finally {
    try {
      await stopScreencast();
    } catch {
      /* ignore */
    }
    if (browser) await browser.close().catch(() => {});
  }
}
