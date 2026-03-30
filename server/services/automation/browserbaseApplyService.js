/**
 * Job apply automation via Browserbase (hosted browser) + Stagehand (AI DOM agent).
 * Replaces fragile Nova Act IAM loops for environments where Browserbase + an LLM key are available.
 *
 * Env: BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, and a provider key for STAGEHAND_MODEL (default openai/gpt-4o → OPENAI_API_KEY).
 * @see https://docs.browserbase.com/introduction/playwright
 * @see https://docs.stagehand.dev/
 */

import fs from 'fs/promises';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isS3DataEnabled, putBinaryKey } from '../s3Json.js';
import {
  appendNovaActTrace,
  setNovaActRunMeta,
  setNovaActTaskPreview,
} from './novaActTraceBuffer.js';
import { setNovaActLiveFrame } from './novaActLiveFrame.js';

const DEFAULT_MAX_STEPS = Number(process.env.STAGEHAND_APPLY_MAX_STEPS || 35);
const NAV_TIMEOUT_MS = Number(process.env.STAGEHAND_NAV_TIMEOUT_MS || 120_000);

function trace(options, applicationId, line) {
  if (!line) return;
  appendNovaActTrace(applicationId, line);
  options.onTrace?.(line);
  options.onProgress?.(line);
}

function providerApiKeyEnvForModel(modelStr) {
  const m = String(modelStr || '').trim();
  const slash = m.indexOf('/');
  const provider = slash >= 0 ? m.slice(0, slash).toLowerCase() : 'openai';
  const map = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    groq: 'GROQ_API_KEY',
    xai: 'XAI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    togetherai: 'TOGETHER_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
  };
  return map[provider] || 'OPENAI_API_KEY';
}

export function isBrowserbaseApplyConfigured() {
  const key = String(process.env.BROWSERBASE_API_KEY || '').trim();
  const project = String(process.env.BROWSERBASE_PROJECT_ID || '').trim();
  return Boolean(key && project);
}

/** True when Browserbase env is set and the chosen model’s provider API key is present. */
export function probeBrowserbaseApply() {
  if (!isBrowserbaseApplyConfigured()) return false;
  const model = String(process.env.STAGEHAND_MODEL || 'openai/gpt-4o').trim();
  const envName = providerApiKeyEnvForModel(model);
  return Boolean(String(process.env[envName] || '').trim());
}

async function presignCvPdf(pdfPath, applicationId, onLog) {
  if (!isS3DataEnabled()) {
    onLog('No DATA_S3_BUCKET — CV URL omitted from instructions (set bucket for presigned PDF).');
    return null;
  }
  const bucket = process.env.DATA_S3_BUCKET;
  const key = `apply-inputs/${applicationId}/cv.pdf`;
  const buf = await fs.readFile(pdfPath);
  await putBinaryKey(key, buf, 'application/pdf');
  const s3 = new S3Client({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1' });
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
  onLog('Uploaded CV to S3 for apply session (presigned GET, 1h).');
  return url;
}

function buildApplyInstruction(job, knowledgePack, profile, cvPresignUrl) {
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
    `You are already on or should work from the job posting at: ${url}`,
    cvNote,
    `Applicant: ${name}, email: ${email}, phone: ${phone}.`,
    'Complete the employer application flow: fill fields, upload CV where required, review, and submit.',
    'If you encounter CAPTCHA or impossible verification, stop and explain clearly in your final message.',
    'When submission is confirmed on screen, finish and summarize what was done.',
    '',
    'Tailored CV / cover letter text (for copy-paste fields):',
    '---',
    tailored || '(none)',
    '---',
  ].join('\n');
}

async function applyContextCookies(context, sessionCookies, liAtCookie, jobUrl) {
  const merged = [...(sessionCookies || [])];
  if (liAtCookie && jobUrl?.includes('linkedin.com')) {
    merged.push({
      name: 'li_at',
      value: liAtCookie,
      domain: '.linkedin.com',
      path: '/',
    });
  }
  const params = [];
  for (const c of merged) {
    if (!c?.name || c.value == null || !c.domain) continue;
    params.push({
      name: String(c.name),
      value: String(c.value),
      domain: String(c.domain),
      path: String(c.path || '/'),
    });
  }
  if (params.length) await context.addCookies(params);
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
    /* ignore */
  }
}

/**
 * @param {{ url: string, title?: string, company?: string }} job
 * @param {{ docxPath: string, pdfPath: string }} cvAssets
 * @param {object} profile
 * @param {Array<{ filename: string, path: string }>} _artifacts
 * @param {object} options
 */
export async function applyWithBrowserbaseStagehand(job, cvAssets, profile, _artifacts, options = {}) {
  const {
    knowledgePack,
    sessionCookies = [],
    liAtCookie,
    onProgress,
    onTrace,
    applicationId: appIdOpt,
  } = options;

  const applicationId = knowledgePack?.applicationId || appIdOpt || null;
  const onLog = line => trace({ onProgress, onTrace }, applicationId, line);

  if (!isBrowserbaseApplyConfigured()) {
    return {
      success: false,
      status: 'failed',
      message:
        'Browserbase apply requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID.',
    };
  }

  if (!probeBrowserbaseApply()) {
    const model = String(process.env.STAGEHAND_MODEL || 'openai/gpt-4o').trim();
    const envName = providerApiKeyEnvForModel(model);
    return {
      success: false,
      status: 'failed',
      message: `Set ${envName} for Stagehand model "${model}" (or adjust STAGEHAND_MODEL).`,
    };
  }

  const model = String(process.env.STAGEHAND_MODEL || 'openai/gpt-4o').trim();
  const maxSteps = Number.isFinite(DEFAULT_MAX_STEPS) && DEFAULT_MAX_STEPS > 0 ? DEFAULT_MAX_STEPS : 35;

  let stagehand;
  try {
    let cvUrl = null;
    try {
      cvUrl = await presignCvPdf(cvAssets.pdfPath, applicationId, onLog);
    } catch (e) {
      onLog(`CV presign/upload skipped: ${e?.message || e}`);
    }

    const instruction = buildApplyInstruction(job, knowledgePack, profile, cvUrl);
    setNovaActTaskPreview(applicationId, instruction);

    const { Stagehand } = await import('@browserbasehq/stagehand');
    stagehand = new Stagehand({
      env: 'BROWSERBASE',
      apiKey: process.env.BROWSERBASE_API_KEY,
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      model,
      verbose: Number(process.env.STAGEHAND_VERBOSE || 0),
      logger: logLine => {
        const msg = `[stagehand] ${logLine.category}: ${logLine.message}`;
        onLog(msg);
      },
    });

    await stagehand.init();

    const sessionUrl = stagehand.browserbaseSessionURL;
    const sessionId = stagehand.browserbaseSessionID;
    if (sessionId) onLog(`Browserbase session ${sessionId}`);
    if (sessionUrl) onLog(`Live session: ${sessionUrl}`);

    setNovaActRunMeta(applicationId, {
      workflowDefinitionName: null,
      workflowRunId: null,
      logGroupName: null,
      consoleUrl: sessionUrl || null,
      browserbaseSessionId: sessionId || null,
    });

    const context = stagehand.context;
    await applyContextCookies(context, sessionCookies, liAtCookie, job.url);

    const page = context.pages()[0];
    if (!page) {
      return { success: false, status: 'failed', message: 'No browser page after Browserbase session start.' };
    }

    try {
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    } catch (e) {
      const msg = e?.message || String(e);
      onLog(`Navigation error: ${msg}`);
      return { success: false, status: 'failed', message: msg };
    }

    await maybePushLiveFrame(page, applicationId);

    onLog(`Stagehand agent (${model}), maxSteps=${maxSteps}`);
    const agent = stagehand.agent({
      mode: 'dom',
      model,
      systemPrompt:
        'You are a careful job-application assistant. Prefer visible form fields and buttons. Do not invent credentials.',
    });

    const liveTickMs = Math.max(1500, Number(process.env.BROWSERBASE_LIVE_FRAME_MS || 2500));
    const liveInterval = setInterval(() => {
      void maybePushLiveFrame(page, applicationId);
    }, liveTickMs);

    let agentResult;
    try {
      agentResult = await agent.execute({
        instruction,
        maxSteps,
        page,
      });
    } finally {
      clearInterval(liveInterval);
    }

    await maybePushLiveFrame(page, applicationId);

    const shotBuf = await page.screenshot({ type: 'png' }).catch(() => null);
    const summaryMsg = agentResult?.message || (agentResult?.success ? 'Agent finished.' : 'Agent did not succeed.');
    onLog(summaryMsg);

    const verified = Boolean(agentResult?.success && agentResult?.completed);

    if (agentResult?.success && agentResult?.completed) {
      return {
        success: true,
        status: 'applied',
        verified,
        screenshot: shotBuf || undefined,
        screenshots: shotBuf ? [{ label: 'Browserbase / Stagehand confirmation', buffer: shotBuf }] : [],
        message: summaryMsg,
      };
    }

    return {
      success: false,
      status: 'failed',
      verified: false,
      screenshot: shotBuf || undefined,
      screenshots: shotBuf ? [{ label: 'Browserbase / Stagehand last frame', buffer: shotBuf }] : [],
      message: summaryMsg,
    };
  } catch (e) {
    const msg = e?.message || String(e);
    onLog(`Fatal: ${msg}`);
    return { success: false, status: 'failed', message: msg };
  } finally {
    if (stagehand) await stagehand.close().catch(() => {});
  }
}
