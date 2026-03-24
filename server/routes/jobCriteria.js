import { Router } from 'express';
import {
  getJobSearchCriteriaForApi,
  saveJobSearchCriteria,
} from '../services/jobSearchCriteria.js';

const router = Router();

/**
 * GET /api/settings/job-criteria — search fields for the UI (no secrets).
 */
router.get('/api/settings/job-criteria', async (req, res, next) => {
  try {
    const data = await getJobSearchCriteriaForApi();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/job-criteria
 * Body: { keywords?: string, location?: string, filters?: string }
 */
router.post('/api/settings/job-criteria', async (req, res, next) => {
  try {
    const record = await saveJobSearchCriteria(req.body || {});
    res.json({ ok: true, ...record });
  } catch (err) {
    next(err);
  }
});

export default router;
