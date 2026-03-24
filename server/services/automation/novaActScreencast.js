/**
 * Chromium CDP Page.startScreencast — smooth JPEG frames (closest to Nova Playground live view).
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-startScreencast
 */
import { setNovaActLiveFrame } from './novaActLiveFrame.js';

const DEFAULT_QUALITY = Number(process.env.NOVA_ACT_SCREENCAST_QUALITY || 56);
const DEFAULT_MIN_MS = Number(process.env.NOVA_ACT_SCREENCAST_MIN_MS || 85);

/**
 * @param {import('playwright').Page} page
 * @param {string|null|undefined} applicationId
 * @returns {Promise<() => Promise<void>>} stop function
 */
export async function startNovaActScreencast(page, applicationId) {
  const noop = async () => {};
  if (!page || !applicationId) return noop;

  try {
    const client = await page.context().newCDPSession(page);
    await client.send('Page.enable');
    await client.send('Page.startScreencast', {
      format: 'jpeg',
      quality: Number.isFinite(DEFAULT_QUALITY) ? Math.min(100, Math.max(1, DEFAULT_QUALITY)) : 56,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1,
    });

    let lastPush = 0;
    const minMs = Number.isFinite(DEFAULT_MIN_MS) ? Math.max(40, DEFAULT_MIN_MS) : 85;
    const id = String(applicationId);

    const onFrame = async params => {
      try {
        const now = Date.now();
        if (now - lastPush >= minMs) {
          lastPush = now;
          const buf = Buffer.from(params.data, 'base64');
          let pageUrl = '';
          try {
            pageUrl = page.url();
          } catch {
            /* ignore */
          }
          setNovaActLiveFrame(id, buf, pageUrl, 'image/jpeg');
        }
      } catch {
        /* ignore */
      } finally {
        try {
          await client.send('Page.screencastFrameAck', { sessionId: params.sessionId });
        } catch {
          /* ignore */
        }
      }
    };

    client.on('Page.screencastFrame', onFrame);

    return async () => {
      try {
        await client.send('Page.stopScreencast');
      } catch {
        /* ignore */
      }
      try {
        await client.detach();
      } catch {
        /* ignore */
      }
    };
  } catch {
    return noop;
  }
}
