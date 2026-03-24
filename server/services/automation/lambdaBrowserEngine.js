/**
 * Lambda-compatible browser engine using puppeteer-core + @sparticuz/chromium.
 * Drop-in replacement for playwrightEngine when Playwright binary is unavailable.
 * Includes HITL interaction loop for remote browser control during blockers.
 */

import { pollCommands, updateScreenshot, getBlocker } from '../hitl.js';
import { applyCookiesToPuppeteerPage } from '../sessionCookies.js';
import {
  verifyLinkedInEasyApplySuccess,
  verifyGenericApplicationSuccess,
} from './applyVerification.js';
import { fillPuppeteerFromKnowledge } from './applicationFormFiller.js';
import { setCvFilesPuppeteer } from './cvUpload.js';

const HITL_POLL_MS = 2_000;
const HITL_MAX_MS = 10 * 60 * 1000;
const VIEWPORT = { width: 1280, height: 800 };

let chromiumMod;

async function getChromiumPath() {
  if (!chromiumMod) {
    chromiumMod = (await import('@sparticuz/chromium')).default;
  }
  chromiumMod.setHeadlessMode = 'shell';
  chromiumMod.setGraphicsMode = false;
  return chromiumMod.executablePath();
}

function getLaunchArgs() {
  return chromiumMod?.args ?? [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--single-process',
  ];
}

export async function applyWithPuppeteer(job, cvAssets, profile, artifacts, options = {}) {
  const { onProgress, onBlocker, liAtCookie, sessionCookies, knowledgePack } = options;
  const kp = knowledgePack || {
    tailoredCV: '',
    roleTitle: job.title || '',
    company: job.company || '',
  };
  let browser;

  try {
    const puppeteer = (await import('puppeteer-core')).default;
    console.log('[lambdaBrowserEngine] Resolving Chromium executable path…');
    const execPath = await getChromiumPath();
    console.log('[lambdaBrowserEngine] Chromium path:', execPath);

    console.log('[lambdaBrowserEngine] Launching browser…');
    browser = await puppeteer.launch({
      executablePath: execPath,
      headless: 'shell',
      args: getLaunchArgs(),
      defaultViewport: VIEWPORT,
    });
    console.log('[lambdaBrowserEngine] Browser launched successfully');

    const page = await browser.newPage();
    console.log('[lambdaBrowserEngine] New page created, navigating to:', job.url);

    if (sessionCookies?.length) {
      const n = await applyCookiesToPuppeteerPage(page, sessionCookies);
      console.log(`[lambdaBrowserEngine] Applied ${n}/${sessionCookies.length} persisted session cookies`);
      onProgress?.(`Loaded ${n} saved session cookie(s)`);
    }

    if (liAtCookie && job.url.includes('linkedin.com')) {
      console.log('[lambdaBrowserEngine] Setting LinkedIn li_at cookie');
      await page.setCookie({
        name: 'li_at',
        value: liAtCookie,
        domain: '.linkedin.com',
        path: '/',
      });
    }

    await page.goto(job.url, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('[lambdaBrowserEngine] Page loaded, current URL:', page.url());

    const screenshot = await page.screenshot();
    console.log('[lambdaBrowserEngine] Initial screenshot taken');

    if (await detectBlocker(page)) {
      console.log('[lambdaBrowserEngine] Blocker detected on page');
      const reason = await identifyBlockerReason(page);
      const blockerShot = await page.screenshot();
      if (onBlocker) {
        const blocker = await onBlocker(reason, blockerShot, page.url());
        if (blocker?.id) {
          console.log('[lambdaBrowserEngine] Blocker created:', blocker.id, '— entering HITL loop');
          onProgress?.('Blocker detected — waiting for human intervention…');
          const resumed = await hitlInteractionLoop(page, blocker.id);
          if (resumed) {
            onProgress?.('Human intervention complete — continuing automation');
            await delay(1000);
          } else {
            return { success: false, status: 'blocked', screenshot: blockerShot, blockerReason: reason };
          }
        } else {
          return { success: false, status: 'blocked', screenshot: blockerShot, blockerReason: reason };
        }
      } else {
        return { success: false, status: 'blocked', screenshot: blockerShot, blockerReason: reason };
      }
    }

    const platform = detectPlatform(job.url);
    console.log('[lambdaBrowserEngine] Platform:', platform);
    onProgress?.(`Detected platform: ${platform}`);

    if (platform === 'linkedin') {
      return await handleLinkedIn(page, profile, cvAssets, screenshot, onProgress, onBlocker, kp);
    }

    return await handleGenericForm(page, profile, cvAssets, screenshot, onProgress, onBlocker, kp);
  } catch (err) {
    console.error('[lambdaBrowserEngine] CATCH block error:', err.message);
    console.error('[lambdaBrowserEngine] Stack:', err.stack);

    let screenshot = null;
    try {
      const pages = await browser?.pages();
      if (pages?.length > 0) screenshot = await pages[0].screenshot();
    } catch { /* no page available */ }

    if (onBlocker) {
      try {
        const blocker = await onBlocker(`Automation error: ${err.message}`, screenshot, job.url);
        if (blocker?.id) {
          console.log('[lambdaBrowserEngine] Error blocker created:', blocker.id, '— entering HITL loop');
          onProgress?.('Automation error — waiting for human intervention…');
          const resumed = await hitlInteractionLoop(
            (await browser?.pages())?.[0],
            blocker.id,
          );
          if (resumed) {
            console.log('[lambdaBrowserEngine] HITL resolved after error — but cannot continue (page state unknown)');
          }
        }
      } catch (bErr) {
        console.error('[lambdaBrowserEngine] onBlocker also failed:', bErr.message);
      }
    }

    return {
      success: false,
      status: 'blocked',
      screenshot,
      blockerReason: `Automation failed: ${err.message}`,
      message: err.message,
    };
  } finally {
    console.log('[lambdaBrowserEngine] Closing browser');
    await browser?.close().catch(() => {});
  }
}

/**
 * Helper: detect blocker, create it, enter HITL loop, return whether we should continue.
 * Returns { blocked: false } if no blocker or HITL resolved; { blocked: true, result } if stuck.
 */
async function handleBlockerWithHITL(page, onBlocker, onProgress) {
  if (!(await detectBlocker(page))) return { blocked: false };

  const reason = await identifyBlockerReason(page);
  const shot = await page.screenshot();

  if (!onBlocker) {
    return { blocked: true, result: { success: false, status: 'blocked', screenshot: shot, blockerReason: reason } };
  }

  const blocker = await onBlocker(reason, shot, page.url());
  if (!blocker?.id) {
    return { blocked: true, result: { success: false, status: 'blocked', screenshot: shot, blockerReason: reason } };
  }

  onProgress?.('Blocker detected — waiting for human intervention…');
  const resumed = await hitlInteractionLoop(page, blocker.id);
  if (resumed) {
    onProgress?.('Human intervention complete — continuing');
    await delay(1000);
    return { blocked: false };
  }

  return { blocked: true, result: { success: false, status: 'blocked', screenshot: shot, blockerReason: reason } };
}

/**
 * HITL interaction loop — keeps the browser alive while the user
 * interacts with the page remotely via S3-queued commands.
 * Returns true if the user clicked "Proceed" (status=resolved),
 * false if skipped or timed out.
 */
async function hitlInteractionLoop(page, blockerId) {
  if (!page) {
    console.log('[hitlLoop] No page available, skipping HITL loop');
    return false;
  }
  const deadline = Date.now() + HITL_MAX_MS;
  console.log(`[hitlLoop] Starting HITL loop for blocker ${blockerId} (max ${HITL_MAX_MS / 1000}s)`);

  while (Date.now() < deadline) {
    try {
      const commands = await pollCommands(blockerId);
      if (commands.length > 0) {
        console.log(`[hitlLoop] Executing ${commands.length} command(s)`);
        for (const cmd of commands) {
          await executeCommand(page, cmd);
        }
        const shot = await page.screenshot();
        await updateScreenshot(blockerId, shot);
      }

      const blocker = await getBlocker(blockerId);
      if (!blocker) {
        console.log('[hitlLoop] Blocker not found, aborting');
        return false;
      }
      if (blocker.status === 'resolved') {
        console.log('[hitlLoop] Blocker resolved by user — continuing automation');
        return true;
      }
      if (blocker.status === 'skipped') {
        console.log('[hitlLoop] Blocker skipped by user');
        return false;
      }
    } catch (err) {
      console.error('[hitlLoop] Error in loop iteration:', err.message);
    }

    await delay(HITL_POLL_MS);
  }

  console.log('[hitlLoop] HITL loop timed out');
  return false;
}

async function executeCommand(page, cmd) {
  try {
    switch (cmd.type) {
      case 'click':
        console.log(`[hitlCmd] click at (${cmd.x}, ${cmd.y})`);
        await page.mouse.click(cmd.x, cmd.y);
        await delay(500);
        break;
      case 'type':
        console.log(`[hitlCmd] type: "${cmd.text?.substring(0, 30)}..."`);
        await page.keyboard.type(cmd.text || '', { delay: 30 });
        break;
      case 'press':
        console.log(`[hitlCmd] press: ${cmd.key}`);
        await page.keyboard.press(cmd.key || 'Enter');
        break;
      case 'scroll':
        console.log(`[hitlCmd] scroll by ${cmd.deltaY}`);
        await page.mouse.wheel({ deltaY: cmd.deltaY || 0 });
        await delay(300);
        break;
      case 'clear':
        console.log('[hitlCmd] clear focused input');
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        break;
      default:
        console.log(`[hitlCmd] Unknown command type: ${cmd.type}`);
    }
  } catch (err) {
    console.error(`[hitlCmd] Error executing ${cmd.type}:`, err.message);
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
  const hasRecaptcha = await page.$('iframe[src*="recaptcha"]');
  if (hasRecaptcha) return true;

  const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  const lower = bodyText.toLowerCase();

  if (lower.includes('i am not a robot') || lower.includes('verify you are human')) return true;

  const url = page.url().toLowerCase();
  if (url.includes('/login') || url.includes('/signin') || url.includes('/auth') ||
      url.includes('/checkpoint') || url.includes('/challenge')) {
    return true;
  }

  const isLoginPage = await page.evaluate(() => {
    const headings = document.querySelectorAll('h1, h2');
    return [...headings].some(el => {
      const t = el.textContent.trim().toLowerCase();
      return t === 'sign in' || t === 'log in' || t === 'login' || t === 'sign in to linkedin';
    });
  }).catch(() => false);

  return isLoginPage;
}

async function identifyBlockerReason(page) {
  const hasRecaptcha = await page.$('iframe[src*="recaptcha"]');
  if (hasRecaptcha) return 'CAPTCHA detected';

  const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
  if (bodyText.toLowerCase().includes('captcha') || bodyText.toLowerCase().includes('i am not a robot')) {
    return 'CAPTCHA detected';
  }

  return 'Login wall detected';
}

async function clickLinkedInSubmitApplication(page) {
  return page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    for (const b of btns) {
      const t = (b.textContent || '').trim().toLowerCase();
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      if (t.includes('submit application') || a.includes('submit application')) {
        b.click();
        return true;
      }
    }
    return false;
  });
}

async function handleLinkedIn(page, profile, cvAssets, initialScreenshot, onProgress, onBlocker, knowledgePack) {
  const gallery = [{ label: '1. Job page (initial)', buffer: initialScreenshot }];

  try {
    const easyApplyBtn = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const match = btns.find(b => b.textContent.includes('Easy Apply') || b.getAttribute('aria-label')?.includes('Easy Apply'));
      if (match) { match.click(); return true; }
      return false;
    });

    if (!easyApplyBtn) {
      console.log('[handleLinkedIn] No Easy Apply button — creating blocker for HITL');
      if (onBlocker) {
        const shot = await page.screenshot();
        const blocker = await onBlocker('No Easy Apply button found — manual apply needed', shot, page.url());
        if (blocker?.id) {
          onProgress?.('No Easy Apply button — waiting for human intervention');
          const resumed = await hitlInteractionLoop(page, blocker.id);
          if (resumed) {
            onProgress?.('Human intervention complete — verifying…');
            await delay(2500);
            const verify = await verifyLinkedInEasyApplySuccess(page);
            const finalShot = await page.screenshot();
            gallery.push({ label: 'After intervention', buffer: finalShot });
            if (!verify.ok) {
              return {
                success: false,
                status: 'blocked',
                screenshot: finalShot,
                blockerReason: verify.reason || 'Could not verify application was sent after intervention',
                screenshots: gallery,
                verified: false,
              };
            }
            return {
              success: true,
              status: 'applied',
              verified: true,
              screenshot: finalShot,
              screenshots: gallery,
            };
          }
        }
      }
      return {
        success: false,
        status: 'blocked',
        screenshot: initialScreenshot,
        blockerReason: 'No Easy Apply button found',
        screenshots: gallery,
      };
    }

    onProgress?.('Clicked Easy Apply');
    await page.waitForSelector('[role="dialog"], .jobs-easy-apply-modal', { timeout: 10000 }).catch(() => {});

    let submitted = false;
    const maxSteps = 15;

    for (let step = 0; step < maxSteps && !submitted; step++) {
      try {
        const hitl = await handleBlockerWithHITL(page, onBlocker, onProgress);
        if (hitl.blocked) return { ...hitl.result, screenshots: gallery };

        await fillPuppeteerFromKnowledge(page, knowledgePack, profile, onProgress, {
          heuristicOnly: step > 0,
        });

        onProgress?.('Uploading generated CV (PDF/DOCX per field accept)…');
        const fileInputs = await page.$$('input[type="file"]');
        for (const input of fileInputs) {
          try {
            await setCvFilesPuppeteer(input, cvAssets, onProgress);
          } catch { /* skip */ }
        }

        await handleDropdowns(page);

        const hasSubmit = await page.evaluate(() => {
          const btns = [...document.querySelectorAll('button')];
          return btns.some(b => {
            const t = (b.textContent || '').trim().toLowerCase();
            const a = (b.getAttribute('aria-label') || '').toLowerCase();
            return t.includes('submit application') || a.includes('submit application');
          });
        });

        if (hasSubmit) {
          gallery.push({
            label: `2. Form filled (step ${step + 1}, before submit)`,
            buffer: await page.screenshot(),
          });
          const clicked = await clickLinkedInSubmitApplication(page);
          if (!clicked) {
            const shot = await page.screenshot();
            return {
              success: false,
              status: 'blocked',
              screenshot: shot,
              blockerReason: 'Submit application button disappeared before click',
              screenshots: gallery,
            };
          }
          onProgress?.('Clicked Submit application — verifying confirmation…');
          const verify = await verifyLinkedInEasyApplySuccess(page);
          const confirmationShot = await page.screenshot();
          if (!verify.ok) {
            gallery.push({ label: '3. After submit (no confirmation)', buffer: confirmationShot });
            return {
              success: false,
              status: 'blocked',
              screenshot: confirmationShot,
              blockerReason: verify.reason || 'LinkedIn did not show application-sent confirmation',
              screenshots: gallery,
              verified: false,
            };
          }
          gallery.push({ label: '3. Confirmation (application sent)', buffer: confirmationShot });
          submitted = true;
          break;
        }

        const clickedNext = await page.evaluate(() => {
          const btns = [...document.querySelectorAll('button')];
          const nxt = btns.find(b => {
            const t = b.textContent.trim().toLowerCase();
            return t === 'next' || t === 'review' || t === 'continue';
          }) || document.querySelector('button[aria-label*="Next"]') ||
               document.querySelector('button[aria-label*="Review"]');
          if (nxt) { nxt.click(); return true; }
          return false;
        });

        if (clickedNext) {
          gallery.push({
            label: `Step ${step + 1} (after Next/Continue)`,
            buffer: await page.screenshot(),
          });
          onProgress?.(`Completed step ${step + 1}`);
          await delay(1200);
        } else {
          break;
        }
      } catch (stepErr) {
        const shot = await page.screenshot();
        if (onBlocker) {
          const blocker = await onBlocker(`Stuck at step ${step + 1}: ${stepErr.message}`, shot, page.url());
          if (blocker?.id) {
            onProgress?.(`Stuck at step ${step + 1} — waiting for intervention`);
            const resumed = await hitlInteractionLoop(page, blocker.id);
            if (resumed) {
              onProgress?.('Intervention complete — retrying step');
              continue;
            }
          }
        }
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
    console.log('[handleLinkedIn] Could not complete form steps — creating blocker for HITL');
    gallery.push({ label: 'Last state (no Submit application)', buffer: shot });
    if (onBlocker) {
      const blocker = await onBlocker('Could not complete all form steps — manual completion needed', shot, page.url());
      if (blocker?.id) {
        onProgress?.('Stuck on form — waiting for human intervention');
        const resumed = await hitlInteractionLoop(page, blocker.id);
        if (resumed) {
          onProgress?.('Human intervention complete — verifying…');
          await delay(2500);
          const verify = await verifyLinkedInEasyApplySuccess(page);
          const finalShot = await page.screenshot();
          gallery.push({ label: 'After intervention', buffer: finalShot });
          if (!verify.ok) {
            return {
              success: false,
              status: 'blocked',
              screenshot: finalShot,
              blockerReason: verify.reason || 'Could not verify application after intervention',
              screenshots: gallery,
              verified: false,
            };
          }
          return {
            success: true,
            status: 'applied',
            verified: true,
            screenshot: finalShot,
            screenshots: gallery,
          };
        }
      }
    }
    return {
      success: false,
      status: 'blocked',
      screenshot: shot,
      blockerReason: 'Could not complete all form steps',
      screenshots: gallery,
    };
  } catch (err) {
    const shot = await page.screenshot().catch(() => null);
    return { success: false, status: 'failed', screenshot: shot, message: err.message, screenshots: gallery };
  }
}

async function handleGenericForm(page, profile, cvAssets, initialScreenshot, onProgress, onBlocker, knowledgePack) {
  const gallery = [{ label: '1. Job page (initial)', buffer: initialScreenshot }];

  try {
    const formExists = await page.$('form') || await page.$('input[type="text"], input[type="email"]');
    if (!formExists) {
      console.log('[handleGenericForm] No form found — creating blocker for HITL');
      if (onBlocker) {
        const shot = await page.screenshot();
        const blocker = await onBlocker('No application form found on this page', shot, page.url());
        if (blocker?.id) {
          onProgress?.('No form found — waiting for human intervention to navigate to application');
          const resumed = await hitlInteractionLoop(page, blocker.id);
          if (resumed) {
            onProgress?.('Human intervention complete — retrying form detection');
            return await handleGenericForm(page, profile, cvAssets, await page.screenshot(), onProgress, onBlocker, knowledgePack);
          }
        }
      }
      return {
        success: false,
        status: 'blocked',
        screenshot: initialScreenshot,
        blockerReason: 'No application form found',
        screenshots: gallery,
      };
    }

    onProgress?.('Filling generic application form from tailored CV & profile…');

    await fillPuppeteerFromKnowledge(page, knowledgePack, profile, onProgress);

    onProgress?.('Uploading generated CV (PDF/DOCX per field accept)…');
    const fileInputs = await page.$$('input[type="file"]');
    for (const input of fileInputs) {
      try {
        await setCvFilesPuppeteer(input, cvAssets, onProgress);
      } catch { /* skip */ }
    }

    await handleDropdowns(page);

    const hitlCheck = await handleBlockerWithHITL(page, onBlocker, onProgress);
    if (hitlCheck.blocked) return { ...hitlCheck.result, screenshots: gallery };

    const clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, input[type="submit"]')];
      const sub = btns.find(b => {
        const t = (b.textContent || b.value || '').trim().toLowerCase();
        return t.includes('submit') || t.includes('apply') || t.includes('send application');
      });
      if (sub) { sub.click(); return true; }
      return false;
    });

    if (!clicked) {
      console.log('[handleGenericForm] No submit button found — creating blocker for HITL');
      const shot = await page.screenshot();
      if (onBlocker) {
        const blocker = await onBlocker('No submit button found — manual submission needed', shot, page.url());
        if (blocker?.id) {
          onProgress?.('No submit button found — waiting for human intervention');
          const resumed = await hitlInteractionLoop(page, blocker.id);
          if (resumed) {
            onProgress?.('Human intervention complete — verifying…');
            await delay(2000);
            const verify = await verifyGenericApplicationSuccess(page);
            const finalShot = await page.screenshot();
            gallery.push({ label: 'After intervention', buffer: finalShot });
            if (!verify.ok) {
              return {
                success: false,
                status: 'blocked',
                screenshot: finalShot,
                blockerReason: verify.reason || 'Could not verify submission after intervention',
                screenshots: gallery,
                verified: false,
              };
            }
            return {
              success: true,
              status: 'applied',
              verified: true,
              screenshot: finalShot,
              screenshots: gallery,
            };
          }
        }
      }
      return { success: false, status: 'blocked', screenshot: shot, blockerReason: 'No submit button found', screenshots: gallery };
    }

    gallery.push({ label: '2. Form filled (before submit)', buffer: await page.screenshot() });
    onProgress?.('Clicked submit — verifying confirmation…');
    await delay(1500);

    const verify = await verifyGenericApplicationSuccess(page);
    const afterShot = await page.screenshot();
    if (!verify.ok) {
      gallery.push({ label: '3. After submit (unverified)', buffer: afterShot });
      return {
        success: false,
        status: 'blocked',
        screenshot: afterShot,
        blockerReason: verify.reason || 'No thank-you / confirmation detected',
        screenshots: gallery,
        verified: false,
      };
    }

    gallery.push({ label: '3. Confirmation / thank you', buffer: afterShot });
    return {
      success: true,
      status: 'applied',
      verified: true,
      screenshot: afterShot,
      screenshots: gallery,
    };
  } catch (err) {
    const shot = await page.screenshot().catch(() => null);
    return { success: false, status: 'failed', screenshot: shot, message: err.message, screenshots: gallery };
  }
}

async function handleDropdowns(page) {
  await page.evaluate(() => {
    document.querySelectorAll('select').forEach(select => {
      const options = [...select.options];
      const preferred = options.find(o => {
        const t = o.textContent.trim().toLowerCase();
        return t.includes('yes') || t.includes('authorized') || t.includes('willing') || t.includes('immediately');
      });

      if (preferred) {
        select.value = preferred.value;
      } else if (options.length > 1) {
        select.value = options[1].value;
      }
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
