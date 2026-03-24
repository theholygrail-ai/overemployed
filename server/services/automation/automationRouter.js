const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);

/**
 * Node.js `playwright` package needs `npx playwright install chromium` on the API host.
 * EC2/Docker setups run Nova Act inside the `Dockerfile.nova-act` image (official `nova-act` SDK + bundled Chromium).
 * Falling back to Node Playwright there fails with "Executable doesn't exist at .../.cache/ms-playwright/...".
 *
 * @see https://nova.amazon.com/dev/documentation — Nova Act product docs
 */
function shouldUseNodePlaywrightFallback() {
  if (process.env.PLAYWRIGHT_FALLBACK === 'true') return true;
  if (process.env.PLAYWRIGHT_FALLBACK === 'false') return false;
  if (process.env.NOVA_ACT_USE_DOCKER === 'true') return false;
  return true;
}

function novaFailureMessage(result, err) {
  if (err?.message) return err.message;
  return result?.message || 'Nova Act did not complete successfully';
}

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

  const fallbackPlaywright = shouldUseNodePlaywrightFallback();
  let novaAvailable = false;
  let lastNovaResult = null;
  let lastNovaErr = null;

  try {
    const { isNovaActAvailable, applyWithNovaAct } = await import('./novaActBridge.js');
    novaAvailable = await isNovaActAvailable();

    if (novaAvailable) {
      try {
        console.log(`[automationRouter] Using Nova Act for ${job.company} — ${job.title}`);
        options.onProgress?.('Using Nova Act automation engine (Groq planner + session cookies)');
        lastNovaResult = await applyWithNovaAct(job, cvAssets, profile, artifacts, options);
        if (lastNovaResult.success || lastNovaResult.status === 'blocked') {
          return { engine: 'nova-act', ...lastNovaResult };
        }
        console.warn(
          `[automationRouter] Nova Act finished without success (${lastNovaResult.message || 'unknown'})`
        );
        options.onProgress?.(`Nova Act: ${lastNovaResult.message || 'failed'}.`);
        if (!fallbackPlaywright) {
          return {
            engine: 'nova-act',
            success: false,
            status: lastNovaResult.status === 'blocked' ? 'blocked' : 'failed',
            message: novaFailureMessage(lastNovaResult, null),
            blockerReason: lastNovaResult.blockerReason,
          };
        }
        options.onProgress?.('Falling back to Playwright.');
      } catch (err) {
        lastNovaErr = err;
        console.warn(`[automationRouter] Nova Act failed: ${err.message}`);
        options.onProgress?.(`Nova Act failed: ${err.message}.`);
        if (!fallbackPlaywright) {
          return {
            engine: 'nova-act',
            success: false,
            status: 'failed',
            message: err.message,
          };
        }
        options.onProgress?.('Falling back to Playwright.');
      }
    }
  } catch {
    novaAvailable = false;
  }

  if (!fallbackPlaywright) {
    const msg = !novaAvailable
      ? 'Nova Act is not available (probe failed). Check Docker image, NOVA_ACT_USE_DOCKER, NOVA_ACT_HOST_DATA_PATH, and that the nova-act image runs. Node Playwright fallback is disabled (NOVA_ACT_USE_DOCKER or PLAYWRIGHT_FALLBACK=false).'
      : novaFailureMessage(lastNovaResult, lastNovaErr);
    console.error(`[automationRouter] ${msg}`);
    return {
      engine: 'nova-act',
      success: false,
      status: 'failed',
      message: msg,
    };
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
