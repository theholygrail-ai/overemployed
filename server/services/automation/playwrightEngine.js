import { chromium } from 'playwright';
import { applyCookiesToPlaywrightContext } from '../sessionCookies.js';
import {
  verifyLinkedInEasyApplySuccess,
  verifyGenericApplicationSuccess,
} from './applyVerification.js';
import { fillPlaywrightFromKnowledge } from './applicationFormFiller.js';
import { setCvFilesPlaywright } from './cvUpload.js';

export async function applyWithPlaywright(job, cvAssets, profile, artifacts, options = {}) {
  const { onProgress, onBlocker, liAtCookie, sessionCookies, knowledgePack } = options;
  const kp = knowledgePack || {
    tailoredCV: '',
    roleTitle: job.title || '',
    company: job.company || '',
  };
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    if (sessionCookies?.length) {
      const n = await applyCookiesToPlaywrightContext(context, sessionCookies);
      onProgress?.(`Loaded ${n} saved session cookie(s)`);
    }

    if (liAtCookie && job.url.includes('linkedin.com')) {
      await context.addCookies([{
        name: 'li_at',
        value: liAtCookie,
        domain: '.linkedin.com',
        path: '/',
      }]);
    }

    const page = await context.newPage();
    await page.goto(job.url, { waitUntil: 'networkidle', timeout: 30000 });

    const screenshot = await page.screenshot();

    if (await detectBlocker(page)) {
      const reason = await identifyBlockerReason(page);
      const blockerShot = await page.screenshot();
      onBlocker?.(reason, blockerShot, page.url());
      return { success: false, status: 'blocked', screenshot: blockerShot, blockerReason: reason };
    }

    const platform = detectPlatform(job.url);
    onProgress?.(`Detected platform: ${platform}`);

    if (platform === 'linkedin') {
      return await handleLinkedIn(page, profile, cvAssets, screenshot, onProgress, onBlocker, kp);
    }

    return await handleGenericForm(page, profile, cvAssets, screenshot, onProgress, onBlocker, kp);
  } catch (err) {
    let screenshot = null;
    try {
      const pages = browser?.contexts()?.[0]?.pages() || [];
      if (pages.length > 0) screenshot = await pages[0].screenshot();
    } catch { /* no page available */ }

    if (onBlocker) {
      await onBlocker(`Automation failed: ${err.message}`, screenshot, job.url);
    }

    return { success: false, status: 'blocked', screenshot, blockerReason: `Automation failed: ${err.message}`, message: err.message };
  } finally {
    await browser?.close();
  }
}

function detectPlatform(url) {
  if (url.includes('linkedin.com')) return 'linkedin';
  if (url.includes('greenhouse.io') || url.includes('boards.greenhouse.io')) return 'greenhouse';
  if (url.includes('lever.co') || url.includes('jobs.lever.co')) return 'lever';
  if (url.includes('myworkdayjobs.com') || url.includes('workday.com')) return 'workday';
  return 'generic';
}

async function detectBlocker(page) {
  const recaptchaFrame = await page.$('iframe[src*="recaptcha"]');
  if (recaptchaFrame) return true;

  const bodyText = await page.textContent('body').catch(() => '');
  const lower = bodyText.toLowerCase();

  if (lower.includes('i am not a robot') || lower.includes('verify you are human')) return true;

  const url = page.url().toLowerCase();
  if (url.includes('/login') || url.includes('/signin') || url.includes('/auth') ||
      url.includes('/checkpoint') || url.includes('/challenge')) {
    return true;
  }

  const isLoginPage = await page.$$eval(
    'h1, h2',
    els => els.some(el => {
      const t = el.textContent.trim().toLowerCase();
      return t === 'sign in' || t === 'log in' || t === 'login' || t === 'sign in to linkedin';
    }),
  ).catch(() => false);

  return isLoginPage;
}

async function identifyBlockerReason(page) {
  const recaptcha = await page.$('iframe[src*="recaptcha"]');
  if (recaptcha) return 'CAPTCHA detected';

  const bodyText = await page.textContent('body').catch(() => '');
  if (bodyText.toLowerCase().includes('captcha') || bodyText.toLowerCase().includes('i am not a robot')) {
    return 'CAPTCHA detected';
  }

  return 'Login wall detected';
}

async function findLinkedInSubmitApplicationButton(page) {
  let submitBtn = await page.$('button:has-text("Submit application")');
  if (submitBtn) return submitBtn;
  const buttons = await page.$$('button');
  for (const b of buttons) {
    const text = ((await b.textContent()) || '').trim().toLowerCase();
    const aria = ((await b.getAttribute('aria-label')) || '').toLowerCase();
    if (text.includes('submit application') || aria.includes('submit application')) {
      return b;
    }
  }
  return null;
}

async function handleLinkedIn(page, profile, cvAssets, initialScreenshot, onProgress, onBlocker, knowledgePack) {
  const gallery = [{ label: '1. Job page (initial)', buffer: initialScreenshot }];

  try {
    const easyApplyBtn = await page.$('button:has-text("Easy Apply")') ||
      await page.$('button[aria-label*="Easy Apply"]');

    if (!easyApplyBtn) {
      return {
        success: false,
        status: 'blocked',
        screenshot: initialScreenshot,
        blockerReason: 'No Easy Apply button found',
      };
    }

    await easyApplyBtn.click();
    onProgress?.('Clicked Easy Apply');

    await page.waitForSelector('[role="dialog"], .jobs-easy-apply-modal', { timeout: 10000 }).catch(() => {});

    let submitted = false;
    const maxSteps = 15;

    for (let step = 0; step < maxSteps && !submitted; step++) {
      try {
        if (await detectBlocker(page)) {
          const shot = await page.screenshot();
          const reason = await identifyBlockerReason(page);
          onBlocker?.(reason, shot, page.url());
          return { success: false, status: 'blocked', screenshot: shot, blockerReason: reason, screenshots: gallery };
        }

        await fillPlaywrightFromKnowledge(page, knowledgePack, profile, onProgress, {
          heuristicOnly: step > 0,
        });

        onProgress?.('Uploading generated CV (PDF/DOCX per field accept)…');
        const fileInputs = await page.$$('input[type="file"]');
        for (const input of fileInputs) {
          try {
            await setCvFilesPlaywright(input, cvAssets, onProgress);
          } catch { /* try next input */ }
        }

        await handleDropdowns(page);

        const submitBtn = await findLinkedInSubmitApplicationButton(page);

        if (submitBtn) {
          gallery.push({
            label: `2. Form filled (step ${step + 1}, before submit)`,
            buffer: await page.screenshot(),
          });
          await submitBtn.click();
          onProgress?.('Clicked Submit application — verifying confirmation…');

          const verify = await verifyLinkedInEasyApplySuccess(page);
          const confirmationShot = await page.screenshot();
          if (!verify.ok) {
            gallery.push({ label: '3. After submit (no confirmation detected)', buffer: confirmationShot });
            return {
              success: false,
              status: 'blocked',
              screenshot: confirmationShot,
              blockerReason: verify.reason || 'LinkedIn did not show an application-sent confirmation',
              screenshots: gallery,
              verified: false,
            };
          }

          gallery.push({ label: '3. Confirmation (application sent)', buffer: confirmationShot });
          submitted = true;
          break;
        }

        const nextBtn = await page.$('button:has-text("Next")') ||
          await page.$('button:has-text("Review")') ||
          await page.$('button:has-text("Continue")') ||
          await page.$('button[aria-label*="Next"]') ||
          await page.$('button[aria-label*="Review"]');

        if (nextBtn) {
          gallery.push({
            label: `Step ${step + 1} (after Next/Continue)`,
            buffer: await page.screenshot(),
          });
          await nextBtn.click();
          onProgress?.(`Completed step ${step + 1}`);
          await page.waitForTimeout(1200);
        } else {
          break;
        }
      } catch (stepErr) {
        const shot = await page.screenshot();
        onBlocker?.(`Stuck at step ${step + 1}: ${stepErr.message}`, shot, page.url());
        return {
          success: false,
          status: 'blocked',
          screenshot: shot,
          blockerReason: `Stuck at step ${step + 1}: ${stepErr.message}`,
          screenshots: gallery,
        };
      }
    }

    if (submitted) {
      const finalShot = gallery[gallery.length - 1].buffer;
      return {
        success: true,
        status: 'applied',
        verified: true,
        screenshot: finalShot,
        screenshots: gallery,
      };
    }

    const shot = await page.screenshot();
    gallery.push({ label: 'Last state (could not reach Submit application)', buffer: shot });
    return {
      success: false,
      status: 'blocked',
      screenshot: shot,
      blockerReason: 'Could not complete all form steps or find Submit application',
      screenshots: gallery,
    };
  } catch (err) {
    const shot = await page.screenshot().catch(() => null);
    return { success: false, status: 'failed', screenshot: shot, message: err.message, screenshots: gallery };
  }
}

async function handleGenericForm(page, profile, cvAssets, initialScreenshot, onProgress, onBlocker, knowledgePack) {
  try {
    const formExists = await page.$('form') || await page.$('input[type="text"], input[type="email"]');
    if (!formExists) {
      return {
        success: false,
        status: 'blocked',
        screenshot: initialScreenshot,
        blockerReason: 'No application form found',
      };
    }

    onProgress?.('Filling generic application form from tailored CV & profile…');

    await fillPlaywrightFromKnowledge(page, knowledgePack, profile, onProgress);

    onProgress?.('Uploading generated CV (PDF/DOCX per field accept)…');
    const fileInputs = await page.$$('input[type="file"]');
    for (const input of fileInputs) {
      try {
        await setCvFilesPlaywright(input, cvAssets, onProgress);
      } catch { /* continue */ }
    }

    await handleDropdowns(page);

    if (await detectBlocker(page)) {
      const reason = await identifyBlockerReason(page);
      const shot = await page.screenshot();
      onBlocker?.(reason, shot, page.url());
      return { success: false, status: 'blocked', screenshot: shot, blockerReason: reason };
    }

    const submitBtn = await page.$('button:has-text("Submit")') ||
      await page.$('button:has-text("Apply")') ||
      await page.$('button:has-text("Send Application")') ||
      await page.$('input[type="submit"]') ||
      await page.$('button[type="submit"]');

    if (!submitBtn) {
      const shot = await page.screenshot();
      return { success: false, status: 'blocked', screenshot: shot, blockerReason: 'No submit button found' };
    }

    const filledShot = await page.screenshot();
    await submitBtn.click();
    onProgress?.('Clicked submit — verifying confirmation…');
    await page.waitForTimeout(1500);

    const verify = await verifyGenericApplicationSuccess(page);
    const afterShot = await page.screenshot();
    if (!verify.ok) {
      return {
        success: false,
        status: 'blocked',
        screenshot: afterShot,
        blockerReason: verify.reason || 'No thank-you / confirmation detected after submit',
        screenshots: [
          { label: '1. Job page (initial)', buffer: initialScreenshot },
          { label: '2. Form filled (before submit)', buffer: filledShot },
          { label: '3. After submit (unverified)', buffer: afterShot },
        ],
        verified: false,
      };
    }

    return {
      success: true,
      status: 'applied',
      verified: true,
      screenshot: afterShot,
      screenshots: [
        { label: '1. Job page (initial)', buffer: initialScreenshot },
        { label: '2. Form filled (before submit)', buffer: filledShot },
        { label: '3. Confirmation / thank you', buffer: afterShot },
      ],
    };
  } catch (err) {
    const shot = await page.screenshot().catch(() => null);
    return { success: false, status: 'failed', screenshot: shot, message: err.message };
  }
}

async function handleDropdowns(page) {
  const selects = await page.$$('select');
  for (const select of selects) {
    const options = await select.$$eval('option', opts =>
      opts.map(o => ({ value: o.value, text: o.textContent.trim().toLowerCase() })),
    );

    const preferred = options.find(o =>
      o.text.includes('yes') ||
      o.text.includes('authorized') ||
      o.text.includes('willing') ||
      o.text.includes('immediately'),
    );

    if (preferred && preferred.value) {
      await select.selectOption(preferred.value).catch(() => {});
    } else if (options.length > 1) {
      await select.selectOption(options[1].value).catch(() => {});
    }
  }
}
