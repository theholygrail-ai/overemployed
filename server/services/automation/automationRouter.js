/**
 * Apply automation: **Browserbase + Playwright** (default) or optional Stagehand agent mode,
 * else **Amazon Nova Act (AWS IAM)**.
 *
 * @see https://docs.browserbase.com/introduction/playwright
 * @see https://docs.stagehand.dev/
 * @see https://docs.aws.amazon.com/nova-act/latest/userguide/interfaces.html
 */

/** @param {{ docxPath: string, pdfPath: string }} cvAssets */
export async function applyToJob(job, cvAssets, profile, artifacts, options = {}) {
  try {
    const {
      probeBrowserbaseApply,
      isBrowserbaseStagehandEnabled,
      applyWithBrowserbasePlaywright,
      applyWithBrowserbaseStagehand,
    } = await import('./browserbaseApplyService.js');

    if (probeBrowserbaseApply()) {
      if (isBrowserbaseStagehandEnabled()) {
        console.log(`[automationRouter] Browserbase + Stagehand for ${job.company} — ${job.title}`);
        options.onProgress?.('Using Browserbase (cloud browser) + Stagehand agent');
        const result = await applyWithBrowserbaseStagehand(job, cvAssets, profile, artifacts, options);
        return { engine: 'browserbase-stagehand', ...result };
      }
      console.log(`[automationRouter] Browserbase + Playwright for ${job.company} — ${job.title}`);
      options.onProgress?.('Using Browserbase (cloud browser) + Playwright form automation');
      const result = await applyWithBrowserbasePlaywright(job, cvAssets, profile, artifacts, options);
      return { engine: 'browserbase-playwright', ...result };
    }

    const { probeNovaActAws, applyWithNovaActAws } = await import('./novaActAwsService.js');
    const novaOk = await probeNovaActAws();
    if (!novaOk) {
      const msg =
        'Apply automation is not configured. Prefer Browserbase: set BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, and the API key for STAGEHAND_MODEL (default openai/gpt-4o → OPENAI_API_KEY). Or use Nova Act: NOVA_ACT_WORKFLOW_DEFINITION_NAME, AWS us-east-1 credentials, and IAM (nova-act:ListModels, CreateWorkflowRun, …).';
      console.error(`[automationRouter] ${msg}`);
      options.onProgress?.(msg);
      return { engine: 'none', success: false, status: 'failed', message: msg };
    }

    console.log(`[automationRouter] Nova Act AWS for ${job.company} — ${job.title}`);
    options.onProgress?.('Using Nova Act (AWS IAM + Playwright tool runner)');
    const result = await applyWithNovaActAws(job, cvAssets, profile, artifacts, options);
    return { engine: 'nova-act-aws', ...result };
  } catch (err) {
    console.error(`[automationRouter] Apply failed: ${err.message}`);
    return { engine: 'unknown', success: false, status: 'failed', message: err.message };
  }
}
