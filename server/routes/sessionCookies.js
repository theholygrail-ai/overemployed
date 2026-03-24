import { Router } from 'express';
import {
  getStoredSessionCookies,
  saveSessionCookies,
  clearSessionCookies,
  parseCookiesInput,
} from '../services/sessionCookies.js';
import { extractSessionCookiesWithGroq } from '../services/sessionCookieAiExtract.js';

const router = Router();

/**
 * GET /api/settings/session-cookies — metadata only (no cookie values).
 */
router.get('/api/settings/session-cookies', async (req, res, next) => {
  try {
    const { updatedAt, cookies } = await getStoredSessionCookies();
    res.json({
      configured: cookies.length > 0,
      cookieCount: cookies.length,
      updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/session-cookies
 * Body: { cookies: string | array, defaultDomain?: string }
 * - JSON array: [{ name, value, domain, path?, ... }]
 * - String starting with '[': JSON array
 * - String "a=b; c=d": needs defaultDomain e.g. ".adzuna.com"
 */
router.post('/api/settings/session-cookies', async (req, res, next) => {
  try {
    const { cookies, defaultDomain } = req.body || {};
    if (cookies == null || cookies === '') {
      return res.status(400).json({ error: 'cookies is required' });
    }

    const parsed = parseCookiesInput(cookies, defaultDomain);
    if (parsed.length === 0) {
      return res.status(400).json({
        error: 'No valid cookies parsed. Use a JSON array with name, value, domain per cookie, or a Cookie header string with defaultDomain.',
      });
    }

    const count = await saveSessionCookies(parsed);
    const { updatedAt } = await getStoredSessionCookies();
    res.json({ saved: true, cookieCount: count, updatedAt });
  } catch (err) {
    if (err.message?.includes('Invalid JSON') || err.message?.includes('required')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * DELETE /api/settings/session-cookies — revoke stored session cookies.
 */
router.delete('/api/settings/session-cookies', async (req, res, next) => {
  try {
    await clearSessionCookies();
    res.json({ cleared: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/session-cookies/extract
 * Body: { raw: string, defaultDomainHint?: string, siteHint?: string }
 * Uses Groq (openai/gpt-oss-120b by default) to normalize pasted DevTools/Network JSON into cookie array.
 */
router.post('/api/settings/session-cookies/extract', async (req, res, next) => {
  try {
    const { raw, defaultDomainHint, siteHint } = req.body || {};
    const result = await extractSessionCookiesWithGroq(raw, {
      defaultDomainHint: defaultDomainHint || '',
      siteHint: siteHint || '',
    });
    res.json({
      cookiesJson: JSON.stringify(result.cookies, null, 2),
      cookies: result.cookies,
      liAtSuggestion: result.liAtSuggestion,
      notes: result.notes,
      validatedCount: result.validatedCount,
      model: result.model,
    });
  } catch (err) {
    if (
      err.message?.includes('empty') ||
      err.message?.includes('not configured') ||
      err.message?.includes('could not be parsed')
    ) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
