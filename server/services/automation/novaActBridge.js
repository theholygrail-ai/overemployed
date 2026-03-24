import { spawn } from 'child_process';
import path from 'path';
import { waitForResolution } from '../hitl.js';
import { resolveNovaRunnerPaths, getDockerHostDataPathForNova } from './novaDockerPaths.js';

const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

function pythonBin() {
  return (process.env.PYTHON_BIN || 'python3').trim() || 'python3';
}

let cachedAvailability = null;
let cachedAt = 0;
/** @type {string | null} */
let cachedRunnerMode = null;
const CACHE_TTL = 60_000;

const DEFAULT_TIMEOUT_MS = Number(process.env.NOVA_ACT_TIMEOUT_MS || 20 * 60 * 1000);
const DOCKER_BIN = process.env.NOVA_ACT_DOCKER_BIN || 'docker';
const DOCKER_IMAGE = process.env.NOVA_ACT_DOCKER_IMAGE || 'overemployed-nova-act:latest';

function parseDockerExtraArgs() {
  const raw = process.env.NOVA_ACT_DOCKER_RUN_ARGS;
  if (!raw || !String(raw).trim()) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return String(raw).trim().split(/\s+/).filter(Boolean);
  }
}

export async function isNovaActAvailable() {
  const paths = resolveNovaRunnerPaths(
    { docxPath: path.join(process.cwd(), 'data', '.probe'), pdfPath: path.join(process.cwd(), 'data', '.probe') },
    [],
  );
  const mode = paths.useDocker ? 'docker' : isLambda ? 'lambda' : process.platform === 'win32' ? 'wsl' : 'python';

  if (
    cachedAvailability !== null &&
    cachedRunnerMode === mode &&
    Date.now() - cachedAt < CACHE_TTL
  ) {
    return cachedAvailability;
  }

  const result = await new Promise(resolve => {
    if (paths.useDocker) {
      const proc = spawn(
        DOCKER_BIN,
        [
          'run',
          '--rm',
          '--entrypoint',
          'python3',
          DOCKER_IMAGE,
          '-c',
          'import nova_act; print("ok")',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stdout = '';
      proc.stdout.on('data', chunk => { stdout += chunk; });
      proc.on('close', code => resolve(code === 0 && stdout.trim() === 'ok'));
      proc.on('error', () => resolve(false));
    } else if (isLambda) {
      const proc = spawn(pythonBin(), ['-c', 'import nova_act; print("ok")'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      proc.stdout.on('data', chunk => { stdout += chunk; });
      proc.on('close', code => resolve(code === 0 && stdout.trim() === 'ok'));
      proc.on('error', () => resolve(false));
    } else if (process.platform === 'win32') {
      const proc = spawn('wsl', ['python3', '-c', 'import nova_act; print("ok")'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      proc.stdout.on('data', chunk => { stdout += chunk; });
      proc.on('close', code => resolve(code === 0 && stdout.trim() === 'ok'));
      proc.on('error', () => resolve(false));
    } else {
      const proc = spawn(pythonBin(), ['-c', 'import nova_act; print("ok")'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      proc.stdout.on('data', chunk => { stdout += chunk; });
      proc.on('close', code => resolve(code === 0 && stdout.trim() === 'ok'));
      proc.on('error', () => resolve(false));
    }
  });

  cachedAvailability = result;
  cachedRunnerMode = mode;
  cachedAt = Date.now();
  return result;
}

/**
 * @param {{ url: string, title?: string, company?: string }} job
 * @param {{ docxPath: string, pdfPath: string }} cvAssets
 * @param {object} profile
 * @param {Array<{ filename: string, path: string }>} artifacts
 * @param {object} options
 */
export async function applyWithNovaAct(job, cvAssets, profile, artifacts, options = {}) {
  const {
    onProgress,
    onBlocker,
    onLiveFrame,
    knowledgePack,
    sessionCookies = [],
    liAtCookie,
    siteCredentials,
    groqApiKey,
    novaActApiKey,
    novaActModelId,
    plannerModel,
    headless,
  } = options;

  const runner = resolveNovaRunnerPaths(cvAssets, artifacts);

  const mergedCookies = [...(sessionCookies || [])];
  if (liAtCookie && job.url?.includes('linkedin.com')) {
    mergedCookies.push({
      name: 'li_at',
      value: liAtCookie,
      domain: '.linkedin.com',
      path: '/',
    });
  }

  const command = {
    action: 'apply',
    url: job.url,
    roleTitle: knowledgePack?.roleTitle || job.title,
    company: knowledgePack?.company || job.company,
    tailoredCV: knowledgePack?.tailoredCV || '',
    pdfPath: runner.pdfPath,
    docxPath: runner.docxPath,
    cvPath: runner.docxPath,
    profile,
    sessionCookies: mergedCookies,
    siteCredentials: siteCredentials && typeof siteCredentials === 'object' ? siteCredentials : {},
    groqApiKey: groqApiKey || process.env.GROQ_API_KEY || '',
    novaActApiKey: novaActApiKey || process.env.NOVA_ACT_API_KEY || '',
    novaActModelId: novaActModelId || process.env.NOVA_ACT_MODEL_ID || '',
    plannerModel: plannerModel || process.env.GROQ_NOVA_PLANNER_MODEL || '',
    headless: Boolean(headless),
    applicationId: knowledgePack?.applicationId || null,
  };

  const firstLine = JSON.stringify(command) + '\n';

  let spawnCmd;
  let spawnArgs;

  if (runner.useDocker) {
    const hostData = getDockerHostDataPathForNova();
    if (!hostData) {
      return {
        success: false,
        status: 'failed',
        message:
          'NOVA_ACT_USE_DOCKER is set but NOVA_ACT_HOST_DATA_PATH is missing. Set it to the host path that holds your ./data directory (same files as the API’s /app/data mount).',
      };
    }
    spawnCmd = DOCKER_BIN;
    spawnArgs = [
      'run',
      '--rm',
      '-i',
      ...parseDockerExtraArgs(),
      '-v',
      `${hostData}:/app/data`,
      '-e',
      `GROQ_API_KEY=${groqApiKey || process.env.GROQ_API_KEY || ''}`,
      '-e',
      `NOVA_ACT_API_KEY=${novaActApiKey || process.env.NOVA_ACT_API_KEY || ''}`,
      '-e',
      `NOVA_ACT_MODEL_ID=${novaActModelId || process.env.NOVA_ACT_MODEL_ID || ''}`,
      DOCKER_IMAGE,
    ];
  } else if (isLambda) {
    spawnCmd = pythonBin();
    spawnArgs = ['-u', runner.scriptPath];
  } else if (process.platform === 'win32') {
    spawnCmd = 'wsl';
    spawnArgs = ['python3', '-u', runner.scriptPath];
  } else {
    spawnCmd = pythonBin();
    spawnArgs = ['-u', path.join(process.cwd(), 'scripts', 'nova_act_agent.py')];
  }

  const childEnv = { ...process.env };
  if (isLambda) {
    childEnv.HOME = childEnv.HOME || '/tmp';
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(spawnCmd, spawnArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
    });

    let stderr = '';
    let settled = false;
    /** @type {Promise<void>} */
    let blockerChain = Promise.resolve();

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill('SIGTERM');
        reject(new Error(`Nova Act timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`));
      }
    }, DEFAULT_TIMEOUT_MS);

    const finishSuccess = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    const finishError = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };

    proc.stderr.on('data', chunk => { stderr += chunk.toString(); });

    proc.stdin.write(firstLine);

    let buffer = '';
    proc.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        switch (event.type) {
          case 'progress': {
            const msg = event.message;
            const shot = event.screenshot ? Buffer.from(event.screenshot, 'base64') : null;
            if (shot) onProgress?.(msg, shot);
            else onProgress?.(msg);
            break;
          }

          case 'live_frame': {
            const appId = event.applicationId;
            const shot = event.screenshot ? Buffer.from(event.screenshot, 'base64') : null;
            if (appId && shot) {
              blockerChain = blockerChain.then(() => {
                onLiveFrame?.(String(appId), shot);
              });
            }
            break;
          }

          case 'blocker': {
            const screenshot = event.screenshot ? Buffer.from(event.screenshot, 'base64') : undefined;
            blockerChain = blockerChain.then(async () => {
              if (settled) return;
              const blocker = await onBlocker?.(event.reason, screenshot, event.url);
              const canWrite = proc.stdin?.writable && !proc.stdin.destroyed;
              if (!blocker?.id || !canWrite) {
                try {
                  if (canWrite) proc.stdin.write(`${JSON.stringify({ cmd: 'skip' })}\n`);
                } catch { /* process may be dead */ }
                return;
              }
              try {
                await waitForResolution(blocker.id);
                if (proc.stdin?.writable && !proc.stdin.destroyed) {
                  proc.stdin.write(`${JSON.stringify({ cmd: 'resume' })}\n`);
                }
              } catch {
                try {
                  if (proc.stdin?.writable && !proc.stdin.destroyed) {
                    proc.stdin.write(`${JSON.stringify({ cmd: 'skip' })}\n`);
                  }
                } catch { /* noop */ }
              }
            }).catch(() => {
              try {
                if (proc.stdin?.writable && !proc.stdin.destroyed) {
                  proc.stdin.write(`${JSON.stringify({ cmd: 'skip' })}\n`);
                }
              } catch { /* noop */ }
            });
            break;
          }

          case 'success':
            blockerChain = blockerChain.then(() => {
              const shot = event.screenshot ? Buffer.from(event.screenshot, 'base64') : undefined;
              finishSuccess({
                success: true,
                status: 'applied',
                verified: true,
                screenshot: shot,
                screenshots: shot ? [{ label: 'Nova Act confirmation', buffer: shot }] : [],
                message: event.message,
              });
            });
            break;

          case 'error':
            blockerChain = blockerChain.then(() => {
              finishError({
                success: false,
                status: 'failed',
                message: event.message || 'Nova Act error',
              });
            });
            break;

          default:
            break;
        }
      }
    });

    proc.on('close', code => {
      clearTimeout(timer);
      void blockerChain.finally(() => {
        if (settled) return;
        settled = true;
        if (code !== 0 && stderr.trim()) {
          reject(new Error(`Nova Act process exited with code ${code}: ${stderr.trim()}`));
        } else {
          resolve({ success: false, status: 'failed', message: 'No result event received' });
        }
      });
    });

    proc.on('error', err => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}
