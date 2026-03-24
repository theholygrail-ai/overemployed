const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

/** @param {{ docxPath: string, pdfPath: string }} cvAssets */
export async function applyToJob(job, cvAssets, profile, artifacts, options = {}) {
  // On Lambda: use puppeteer-core + @sparticuz/chromium (always available in zip)
  if (isLambda) {
    try {
      const { applyWithPuppeteer } = await import('./lambdaBrowserEngine.js');
      console.log(`[automationRouter] Using Lambda browser engine (puppeteer-core) for ${job.company} — ${job.title}`);
      options.onProgress?.('Using Lambda browser engine (puppeteer-core + @sparticuz/chromium)');
      const result = await applyWithPuppeteer(job, cvAssets, profile, artifacts, options);
      return { engine: 'puppeteer-lambda', ...result };
    } catch (err) {
      console.error(`[automationRouter] Lambda browser engine failed: ${err.message}`);
      if (options.onBlocker) {
        await options.onBlocker(`Lambda browser engine failed: ${err.message}`, null, job.url);
      }
      return { engine: 'puppeteer-lambda', success: false, status: 'failed', message: err.message };
    }
  }

  // Local: try Nova Act first, then Playwright
  let novaAvailable = false;

  try {
    const { isNovaActAvailable, applyWithNovaAct } = await import('./novaActBridge.js');
    novaAvailable = await isNovaActAvailable();

    if (novaAvailable) {
      try {
        console.log(`[automationRouter] Using Nova Act for ${job.company} — ${job.title}`);
        options.onProgress?.('Using Nova Act automation engine (Groq planner + session cookies)');
        const result = await applyWithNovaAct(job, cvAssets, profile, artifacts, options);
        if (result.success || result.status === 'blocked') {
          return { engine: 'nova-act', ...result };
        }
        console.warn(`[automationRouter] Nova Act finished without success (${result.message || 'unknown'}), falling back to Playwright`);
        options.onProgress?.(`Nova Act: ${result.message || 'failed'}. Falling back to Playwright.`);
      } catch (err) {
        console.warn(`[automationRouter] Nova Act failed, falling back to Playwright: ${err.message}`);
        options.onProgress?.(`Nova Act failed: ${err.message}. Falling back to Playwright.`);
      }
    }
  } catch {
    novaAvailable = false;
  }

  if (!novaAvailable) {
    console.log(`[automationRouter] Nova Act not available, using Playwright`);
    options.onProgress?.('Using Playwright automation engine (Nova Act not available)');
  }

  try {
    const { applyWithPlaywright } = await import('./playwrightEngine.js');
    console.log(`[automationRouter] Using Playwright for ${job.company} — ${job.title}`);
    const result = await applyWithPlaywright(job, cvAssets, profile, artifacts, options);
    return { engine: 'playwright', ...result };
  } catch (err) {
    console.error(`[automationRouter] Playwright also failed: ${err.message}`);
    if (options.onBlocker) {
      await options.onBlocker(`All automation engines failed: ${err.message}`, null, job.url);
    }
    return { engine: 'playwright', success: false, status: 'failed', message: err.message };
  }
}
