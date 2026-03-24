import { Router } from 'express';
import { getMemoryKey, setMemoryKey } from '../services/memory.js';

const MEMORY_KEY = 'applySiteCredentials';

const router = Router();

/**
 * GET /api/settings/apply-credentials — hosts only (no secrets).
 */
router.get('/api/settings/apply-credentials', async (req, res, next) => {
  try {
    const data = await getMemoryKey(MEMORY_KEY);
    const creds = data && typeof data === 'object' ? data : {};
    const hosts = Object.keys(creds).filter((h) => {
      const v = creds[h];
      return v && typeof v === 'object' && (String(v.username || '').trim() || String(v.password || '').trim());
    });
    res.json({ configured: hosts.length > 0, hosts });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/apply-credentials
 * Body: { sites: { "linkedin.com": { username, password }, ... } }
 * Passwords are stored in operator memory (local file or S3); protect your API host.
 */
router.post('/api/settings/apply-credentials', async (req, res, next) => {
  try {
    const { sites } = req.body || {};
    if (!sites || typeof sites !== 'object' || Array.isArray(sites)) {
      return res.status(400).json({
        error: 'sites must be an object keyed by hostname, e.g. { "linkedin.com": { "username": "...", "password": "..." } }',
      });
    }
    const out = {};
    for (const [host, v] of Object.entries(sites)) {
      if (!host || typeof v !== 'object' || v === null) continue;
      const key = String(host).trim().toLowerCase().replace(/^\./, '');
      if (!key) continue;
      out[key] = {
        username: v.username != null ? String(v.username) : '',
        password: v.password != null ? String(v.password) : '',
      };
    }
    await setMemoryKey(MEMORY_KEY, out);
    res.json({ saved: true, hostCount: Object.keys(out).length });
  } catch (err) {
    next(err);
  }
});

router.delete('/api/settings/apply-credentials', async (req, res, next) => {
  try {
    await setMemoryKey(MEMORY_KEY, null);
    res.json({ cleared: true });
  } catch (err) {
    next(err);
  }
});

export default router;
