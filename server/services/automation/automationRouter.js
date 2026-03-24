/**
 * Apply automation: **Amazon Nova Act (AWS IAM control plane)** via
 * [novaActAwsService.js](./novaActAwsService.js) — us-east-1, Playwright tool runner, no Groq.
 *
 * @see https://docs.aws.amazon.com/nova-act/latest/userguide/interfaces.html
 */

/** @param {{ docxPath: string, pdfPath: string }} cvAssets */
export async function applyToJob(job, cvAssets, profile, artifacts, options = {}) {
  try {
    const { probeNovaActAws, applyWithNovaActAws } = await import('./novaActAwsService.js');
    const novaOk = await probeNovaActAws();
    if (!novaOk) {
      const msg =
        'Nova Act AWS is not reachable or not configured. Set NOVA_ACT_WORKFLOW_DEFINITION_NAME, AWS credentials for us-east-1, and IAM permissions (nova-act:ListModels, CreateWorkflowRun, …). Optionally run scripts/ensure-nova-workflow-definition.mjs once.';
      console.error(`[automationRouter] ${msg}`);
      options.onProgress?.(msg);
      return { engine: 'nova-act-aws', success: false, status: 'failed', message: msg };
    }

    console.log(`[automationRouter] Nova Act AWS for ${job.company} — ${job.title}`);
    options.onProgress?.('Using Nova Act (AWS IAM + Playwright tool runner)');
    const result = await applyWithNovaActAws(job, cvAssets, profile, artifacts, options);
    return { engine: 'nova-act-aws', ...result };
  } catch (err) {
    console.error(`[automationRouter] Nova Act AWS failed: ${err.message}`);
    return { engine: 'nova-act-aws', success: false, status: 'failed', message: err.message };
  }
}
