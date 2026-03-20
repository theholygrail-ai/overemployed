import { spawn } from 'child_process';

let cachedAvailability = null;
let cachedAt = 0;
const CACHE_TTL = 60_000;

export async function isNovaActAvailable() {
  if (cachedAvailability !== null && Date.now() - cachedAt < CACHE_TTL) {
    return cachedAvailability;
  }

  const result = await new Promise(resolve => {
    const proc = spawn('wsl', ['python3', '-c', 'import nova_act; print("ok")'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });

    let stdout = '';
    proc.stdout.on('data', chunk => { stdout += chunk; });

    proc.on('close', code => resolve(code === 0 && stdout.trim() === 'ok'));
    proc.on('error', () => resolve(false));
  });

  cachedAvailability = result;
  cachedAt = Date.now();
  return result;
}

function toWslPath(winPath) {
  const normalized = winPath.replace(/\\/g, '/');
  const match = normalized.match(/^([A-Za-z]):\/(.*)/);
  if (!match) return winPath;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

export async function applyWithNovaAct(job, cvPath, profile, artifacts, options = {}) {
  const { onProgress, onBlocker } = options;
  const TIMEOUT = 120_000;

  const scriptPath = toWslPath('f:/overEmployed/scripts/nova_act_agent.py');
  const wslCvPath = toWslPath(cvPath);

  const input = JSON.stringify({
    job,
    cvPath: wslCvPath,
    profile,
    artifacts: artifacts.map(a => ({ ...a, path: toWslPath(a.path) })),
  });

  return new Promise((resolve, reject) => {
    const proc = spawn('wsl', ['python3', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill('SIGTERM');
        reject(new Error('Nova Act timed out after 120 seconds'));
      }
    }, TIMEOUT);

    proc.stdin.write(input);
    proc.stdin.end();

    proc.stderr.on('data', chunk => { stderr += chunk; });

    let buffer = '';
    proc.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        switch (event.type) {
          case 'progress':
            onProgress?.(event.message);
            break;

          case 'blocker': {
            const screenshot = event.screenshot ? Buffer.from(event.screenshot, 'base64') : undefined;
            onBlocker?.(event.reason, screenshot, event.url);
            break;
          }

          case 'success':
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve({
                success: true,
                status: 'applied',
                screenshot: event.screenshot ? Buffer.from(event.screenshot, 'base64') : undefined,
                message: event.message,
              });
            }
            break;

          case 'error':
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve({
                success: false,
                status: 'failed',
                message: event.message || 'Nova Act error',
              });
            }
            break;
        }
      }
    });

    proc.on('close', code => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        if (code !== 0) {
          reject(new Error(`Nova Act process exited with code ${code}: ${stderr.trim()}`));
        } else {
          resolve({ success: false, status: 'failed', message: 'No result event received' });
        }
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}
