import { isNovaActAvailable, applyWithNovaAct } from './novaActBridge.js';
import { applyWithPlaywright } from './playwrightEngine.js';

export async function applyToJob(job, cvPath, profile, artifacts, options = {}) {
  let novaAvailable = false;

  try {
    novaAvailable = await isNovaActAvailable();
  } catch {
    novaAvailable = false;
  }

  if (novaAvailable) {
    try {
      console.log(`[automationRouter] Using Nova Act for ${job.company} — ${job.title}`);
      options.onProgress?.('Using Nova Act automation engine');
      const result = await applyWithNovaAct(job, cvPath, profile, artifacts, options);
      return { engine: 'nova-act', ...result };
    } catch (err) {
      console.warn(`[automationRouter] Nova Act failed, falling back to Playwright: ${err.message}`);
      options.onProgress?.(`Nova Act failed: ${err.message}. Falling back to Playwright.`);
    }
  } else {
    console.log(`[automationRouter] Nova Act not available, using Playwright`);
    options.onProgress?.('Using Playwright automation engine (Nova Act not available)');
  }

  try {
    console.log(`[automationRouter] Using Playwright for ${job.company} — ${job.title}`);
    const result = await applyWithPlaywright(job, cvPath, profile, artifacts, options);
    return { engine: 'playwright', ...result };
  } catch (err) {
    console.error(`[automationRouter] Playwright also failed: ${err.message}`);
    if (options.onBlocker) {
      await options.onBlocker(`All automation engines failed: ${err.message}`, null, job.url);
    }
    return { engine: 'playwright', success: false, status: 'failed', message: err.message };
  }
}
