import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { recordLinkedInScrapeAttempt } from '../linkedinStatus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'linkedin-worker.js');
const TIMEOUT_MS = 120_000;

/** Lambda resolves linkedin-jobs-scraper from task-root node_modules; cwd must be task root. */
function scraperCwd() {
  if (process.env.LAMBDA_TASK_ROOT) return process.env.LAMBDA_TASK_ROOT;
  return path.join(__dirname, '..', '..', '..');
}

export async function scrapeLinkedIn(keywords, options = {}) {
  const { location = 'Remote', limit = 15, liAtCookie } = options;

  if (!liAtCookie) {
    console.log('[linkedin] No cookie provided, skipping');
    recordLinkedInScrapeAttempt({ jobCount: 0, hadCookie: false });
    return [];
  }

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      keywords: keywords.slice(0, 3),
      location,
      limit,
      liAtCookie,
    });

    const root = scraperCwd();
    const nodeModules = path.join(root, 'node_modules');
    const nodePath = [nodeModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);

    const child = spawn(process.execPath, [WORKER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: root,
      env: { ...process.env, NODE_PATH: nodePath },
    });

    let stdout = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      console.warn('[linkedin] Worker timed out after', TIMEOUT_MS / 1000, 'seconds');
      recordLinkedInScrapeAttempt({ jobCount: 0, hadCookie: true, error: 'timeout' });
      resolve([]);
    }, TIMEOUT_MS);

    try {
      child.stdin.write(payload);
      child.stdin.end();
    } catch (err) {
      clearTimeout(timer);
      console.error('[linkedin] Failed to write worker stdin:', err.message);
      recordLinkedInScrapeAttempt({ jobCount: 0, hadCookie: true, error: err.message });
      resolve([]);
      return;
    }

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim();
      if (msg && !msg.includes('ExperimentalWarning') && !msg.includes('localstorage-file')) {
        console.warn('[linkedin-worker]', msg.slice(0, 200));
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      try {
        const match = stdout.match(/__LINKEDIN_RESULT__([\s\S]*?)__END__/);
        if (match) {
          const jobs = JSON.parse(match[1]);
          console.log(`[linkedin] Worker returned ${jobs.length} jobs`);
          recordLinkedInScrapeAttempt({ jobCount: jobs.length, hadCookie: true });
          if (code !== 0) {
            console.warn('[linkedin] Worker exited with code', code, '— parsed jobs from stdout anyway');
          }
          resolve(jobs);
          return;
        }
      } catch (e) {
        console.warn('[linkedin] Failed to parse worker output:', e.message);
        recordLinkedInScrapeAttempt({ jobCount: 0, hadCookie: true, error: e.message });
        resolve([]);
        return;
      }

      if (code !== 0) {
        console.warn('[linkedin] Worker exited with code', code);
        recordLinkedInScrapeAttempt({ jobCount: 0, hadCookie: true, error: `exit ${code}` });
      } else {
        console.warn('[linkedin] No result marker in worker output');
        recordLinkedInScrapeAttempt({ jobCount: 0, hadCookie: true, error: 'no_result_marker' });
      }
      resolve([]);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.error('[linkedin] Worker spawn error:', err.message);
      recordLinkedInScrapeAttempt({ jobCount: 0, hadCookie: true, error: err.message });
      resolve([]);
    });
  });
}
