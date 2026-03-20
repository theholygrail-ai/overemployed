import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { getBlockers, getAllBlockers, getBlocker, resolveBlocker, skipBlocker, getScreenshotPath } from '../services/hitl.js';

const router = Router();

router.get('/api/hitl', async (req, res, next) => {
  try {
    const blockers = await getBlockers();
    res.json(blockers);
  } catch (err) {
    next(err);
  }
});

router.get('/api/hitl/all', async (req, res, next) => {
  try {
    const blockers = await getAllBlockers();
    res.json(blockers);
  } catch (err) {
    next(err);
  }
});

router.get('/api/hitl/:id', async (req, res, next) => {
  try {
    const blocker = await getBlocker(req.params.id);
    if (!blocker) return res.status(404).json({ error: 'Blocker not found' });
    res.json(blocker);
  } catch (err) {
    next(err);
  }
});

router.post('/api/hitl/:id/resume', async (req, res, next) => {
  try {
    await resolveBlocker(req.params.id);
    res.json({ resolved: true });
  } catch (err) {
    next(err);
  }
});

router.post('/api/hitl/:id/skip', async (req, res, next) => {
  try {
    await skipBlocker(req.params.id);
    res.json({ skipped: true });
  } catch (err) {
    next(err);
  }
});

router.get('/api/hitl/:id/screenshot', async (req, res, next) => {
  try {
    const screenshotPath = await getScreenshotPath(req.params.id);
    if (!screenshotPath || !fs.existsSync(screenshotPath)) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }
    res.set('Content-Type', 'image/png');
    res.sendFile(path.resolve(screenshotPath));
  } catch (err) {
    next(err);
  }
});

export default router;
