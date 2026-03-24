/**
 * Post-submit verification for apply automation — do not mark "applied" unless we see
 * confirmation signals. Also used to avoid false positives from loose "Submit" clicks.
 */

/** English + common ATS / LinkedIn phrasing (lowercase substring match) */
export const LINKEDIN_SUCCESS_HINTS = [
  'application sent',
  'your application was sent',
  'submitted your application',
  'you applied to',
  'you have applied',
  'successfully applied',
  'thanks for applying',
  'thank you for applying',
  'thank you for your application',
  'we received your application',
  'your application has been submitted',
  'applied to this job',
];

export const GENERIC_SUCCESS_HINTS = [
  'thank you for your application',
  'thank you for applying',
  'application received',
  'we have received your application',
  'successfully submitted',
  'application submitted',
  'confirmation',
  'your application has been received',
];

const LINKEDIN_ERROR_HINTS = [
  'please correct',
  'required field',
  'this field is required',
  'upload a resume',
  'something went wrong',
  'unable to submit',
  'error submitting',
];

/**
 * @param {import('playwright').Page | import('puppeteer').Page} page
 * @param {string[]} successHints
 * @param {{ timeoutMs?: number, pollMs?: number }} opts
 */
export async function waitForSuccessText(page, successHints, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 22_000;
  const pollMs = opts.pollMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  const hints = successHints.map((h) => h.toLowerCase());

  while (Date.now() < deadline) {
    const found = await page.evaluate((patterns) => {
      const raw = document.body?.innerText || '';
      const text = raw.toLowerCase();
      for (const p of patterns) {
        if (text.includes(p)) return { match: true, snippet: raw.slice(0, 400) };
      }
      return { match: false, snippet: raw.slice(0, 400) };
    }, hints);

    if (found.match) {
      return { ok: true, snippet: found.snippet };
    }

    const errHit = await page.evaluate((patterns) => {
      const text = (document.body?.innerText || '').toLowerCase();
      return patterns.some((p) => text.includes(p));
    }, LINKEDIN_ERROR_HINTS.map((h) => h.toLowerCase()));

    if (errHit) {
      return { ok: false, reason: 'Error or validation message visible after submit attempt' };
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }

  return {
    ok: false,
    reason: 'Timed out waiting for a confirmation message (thank you / application sent)',
  };
}

export async function verifyLinkedInEasyApplySuccess(page) {
  return waitForSuccessText(page, LINKEDIN_SUCCESS_HINTS, { timeoutMs: 25_000 });
}

export async function verifyGenericApplicationSuccess(page) {
  return waitForSuccessText(page, GENERIC_SUCCESS_HINTS, { timeoutMs: 20_000 });
}
