import { chromium } from 'playwright';

export async function applyWithPlaywright(job, cvPath, profile, artifacts, options = {}) {
  const { onProgress, onBlocker, liAtCookie } = options;
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

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
      return await handleLinkedIn(page, profile, cvPath, screenshot, onProgress, onBlocker);
    }

    return await handleGenericForm(page, profile, cvPath, screenshot, onProgress, onBlocker);
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

async function handleLinkedIn(page, profile, cvPath, initialScreenshot, onProgress, onBlocker) {
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
          return { success: false, status: 'blocked', screenshot: shot, blockerReason: reason };
        }

        await fillProfileFields(page, profile);

        const fileInputs = await page.$$('input[type="file"]');
        for (const input of fileInputs) {
          await input.setInputFiles(cvPath).catch(() => {});
        }

        await handleDropdowns(page);

        const submitBtn = await page.$('button:has-text("Submit application")') ||
          await page.$('button:has-text("Submit")') ||
          await page.$('button[aria-label*="Submit"]');

        if (submitBtn) {
          await submitBtn.click();
          onProgress?.('Submitted application');
          submitted = true;
          break;
        }

        const nextBtn = await page.$('button:has-text("Next")') ||
          await page.$('button:has-text("Review")') ||
          await page.$('button:has-text("Continue")') ||
          await page.$('button[aria-label*="Next"]') ||
          await page.$('button[aria-label*="Review"]');

        if (nextBtn) {
          await nextBtn.click();
          onProgress?.(`Completed step ${step + 1}`);
          await page.waitForTimeout(1000);
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
        };
      }
    }

    if (submitted) {
      return { success: true, status: 'applied', screenshot: await page.screenshot() };
    }

    const shot = await page.screenshot();
    return { success: false, status: 'blocked', screenshot: shot, blockerReason: 'Could not complete all form steps' };
  } catch (err) {
    const shot = await page.screenshot().catch(() => null);
    return { success: false, status: 'failed', screenshot: shot, message: err.message };
  }
}

async function handleGenericForm(page, profile, cvPath, initialScreenshot, onProgress, onBlocker) {
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

    onProgress?.('Filling generic application form');

    await fillProfileFields(page, profile);

    const fileInputs = await page.$$('input[type="file"]');
    for (const input of fileInputs) {
      await input.setInputFiles(cvPath).catch(() => {});
    }

    const textareas = await page.$$('textarea');
    for (const ta of textareas) {
      const val = await ta.inputValue().catch(() => '');
      if (!val) {
        await ta.fill(`I am excited to apply for this position. Please find my resume attached.`).catch(() => {});
      }
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

    await submitBtn.click();
    onProgress?.('Submitted application');
    await page.waitForTimeout(2000);

    return { success: true, status: 'applied', screenshot: await page.screenshot() };
  } catch (err) {
    const shot = await page.screenshot().catch(() => null);
    return { success: false, status: 'failed', screenshot: shot, message: err.message };
  }
}

async function fillProfileFields(page, profile) {
  const [firstName, ...lastParts] = profile.name.split(' ');
  const lastName = lastParts.join(' ');

  const fieldMap = [
    { patterns: ['first name', 'firstname', 'first_name', 'fname'], value: firstName },
    { patterns: ['last name', 'lastname', 'last_name', 'lname', 'surname'], value: lastName },
    { patterns: ['full name', 'name', 'your name'], value: profile.name },
    { patterns: ['email', 'e-mail'], value: profile.email },
    { patterns: ['phone', 'telephone', 'mobile', 'cell'], value: profile.phone },
    { patterns: ['address', 'location', 'city'], value: profile.address || '' },
    { patterns: ['linkedin', 'linked in'], value: profile.linkedinUrl || '' },
  ];

  const inputs = await page.$$('input[type="text"], input[type="email"], input[type="tel"], input[type="url"]');

  for (const input of inputs) {
    const ariaLabel = (await input.getAttribute('aria-label') || '').toLowerCase();
    const placeholder = (await input.getAttribute('placeholder') || '').toLowerCase();
    const name = (await input.getAttribute('name') || '').toLowerCase();
    const id = (await input.getAttribute('id') || '').toLowerCase();

    const label = await input.evaluate(el => {
      const labelEl = el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
      return labelEl ? labelEl.textContent.toLowerCase().trim() : '';
    }).catch(() => '');

    const combined = `${ariaLabel} ${placeholder} ${name} ${id} ${label}`;

    for (const field of fieldMap) {
      if (!field.value) continue;
      if (field.patterns.some(p => combined.includes(p))) {
        const current = await input.inputValue().catch(() => '');
        if (!current) {
          await input.fill(field.value).catch(() => {});
        }
        break;
      }
    }
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
