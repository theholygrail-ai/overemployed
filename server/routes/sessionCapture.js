import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeSessionCookies } from '../services/sessionCookies.js';
import { requireApiKey } from '../middleware/apiKey.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = Router();

/**
 * POST /api/session-capture/sync
 * Chrome extension sends cookies for the active tab's site; merged into automation cookie vault.
 * Body: { cookies: [...], hostname?: string, applicationId?: string, source?: 'extension' }
 */
router.post('/api/session-capture/sync', requireApiKey, async (req, res, next) => {
  try {
    const { cookies, hostname, applicationId, source } = req.body || {};
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({ error: 'cookies array is required' });
    }
    const result = await mergeSessionCookies(cookies);
    res.json({
      ok: true,
      mergedCount: result.mergedCount,
      totalCount: result.totalCount,
      updatedAt: result.updatedAt,
      hostname: hostname || null,
      applicationId: applicationId || null,
      source: source || 'extension',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/session-capture/extension.zip — packaged Chrome extension (public, no secret).
 */
router.get('/api/session-capture/extension.zip', (req, res, next) => {
  try {
    const root = path.resolve(__dirname, '../..');
    const zipPath = path.join(root, 'extension', 'session-helper.zip');
    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({
        error: 'Extension package not found',
        hint: 'Run: npm run package:extension',
      });
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="overemployed-session-helper.zip"');
    fs.createReadStream(zipPath).pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
