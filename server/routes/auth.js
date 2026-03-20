import { Router } from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { getMemoryKey, setMemoryKey } from '../services/memory.js';
import { getLinkedInScrapeState } from '../services/linkedinStatus.js';

const router = Router();

const pendingStates = new Map();

router.get('/api/auth/linkedin', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now());

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    scope: 'openid profile email',
    state,
  });

  res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
});

router.get('/api/auth/linkedin/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.FRONTEND_URL}?auth=error&reason=${error}`);
    }

    if (!pendingStates.has(state)) {
      return res.redirect(`${process.env.FRONTEND_URL}?auth=error&reason=invalid_state`);
    }
    pendingStates.delete(state);

    const { data } = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    await setMemoryKey('linkedin', {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      connectedAt: new Date().toISOString(),
    });

    res.redirect(`${process.env.FRONTEND_URL}?auth=success`);
  } catch (err) {
    next(err);
  }
});

router.post('/api/auth/linkedin/cookie', async (req, res, next) => {
  try {
    const { cookie } = req.body;
    if (!cookie) return res.status(400).json({ error: 'cookie is required' });

    await setMemoryKey('linkedin', {
      liAtCookie: cookie,
      connectedAt: new Date().toISOString(),
    });

    res.json({ saved: true });
  } catch (err) {
    next(err);
  }
});

router.get('/api/auth/linkedin/status', async (req, res, next) => {
  try {
    const data = await getMemoryKey('linkedin');
    const hasCookie = !!data?.liAtCookie;
    const hasToken = !!data?.accessToken;
    const scrape = getLinkedInScrapeState();

    /** UI pill: not_configured | pending | ok | warning */
    let linkedInScrapeHint = 'not_configured';
    if (hasCookie) {
      if (scrape.lastAttemptAt != null && scrape.lastHadCookie) {
        linkedInScrapeHint = (scrape.lastJobCount ?? 0) > 0 ? 'ok' : 'warning';
      } else {
        linkedInScrapeHint = 'pending';
      }
    }

    res.json({
      connected: hasCookie || hasToken,
      hasCookie,
      hasToken,
      lastLinkedInScrape: scrape,
      linkedInScrapeHint,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/api/auth/linkedin', async (req, res, next) => {
  try {
    await setMemoryKey('linkedin', null);
    res.json({ disconnected: true });
  } catch (err) {
    next(err);
  }
});

export default router;
