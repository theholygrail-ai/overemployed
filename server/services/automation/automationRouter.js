/**
 * Apply automation: **Amazon Nova Act only** (`nova-act` SDK via `novaActBridge` / `scripts/nova_act_agent.py`).
 * Runs on EC2, local dev (WSL/Docker), and AWS Lambda (Python worker in the same container image).
 *
 * @see https://nova.amazon.com/dev/documentation
 */

/** @param {{ docxPath: string, pdfPath: string }} cvAssets */
export async function applyToJob(job, cvAssets, profile, artifacts, options = {}) {
  try {
    const { isNovaActAvailable, applyWithNovaAct } = await import('./novaActBridge.js');
    const novaAvailable = await isNovaActAvailable();
    if (!novaAvailable) {
      const msg =
        'Nova Act is not available (probe failed). Install Python `nova-act` and browsers (see Dockerfile.nova-act / Dockerfile.lambda), or set NOVA_ACT_USE_DOCKER + NOVA_ACT_HOST_DATA_PATH for the Nova image.';
      console.error(`[automationRouter] ${msg}`);
      options.onProgress?.(msg);
      return { engine: 'nova-act', success: false, status: 'failed', message: msg };
    }

    console.log(`[automationRouter] Using Nova Act for ${job.company} — ${job.title}`);
    options.onProgress?.('Using Nova Act (Groq planner + session cookies)');
    const result = await applyWithNovaAct(job, cvAssets, profile, artifacts, options);
    return { engine: 'nova-act', ...result };
  } catch (err) {
    console.error(`[automationRouter] Nova Act failed: ${err.message}`);
    return { engine: 'nova-act', success: false, status: 'failed', message: err.message };
  }
}
