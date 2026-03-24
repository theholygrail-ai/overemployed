import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import {
  getBlockers,
  getAllBlockers,
  getBlocker,
  resolveBlocker,
  skipBlocker,
  getScreenshotPath,
  getScreenshotBuffer,
  queueCommand,
} from '../services/hitl.js';
import { updateApplicationStatus } from '../services/dynamodb.js';

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
    const result = await resolveBlocker(req.params.id);
    if (!result) return res.status(404).json({ error: 'Blocker not found' });
    if (result.applicationId) {
      try {
        await updateApplicationStatus(result.applicationId, 'applying');
      } catch (statusErr) {
        console.warn('[hitl] resume: could not set applying status:', statusErr.message);
      }
    }
    res.json({ resolved: true });
  } catch (err) {
    next(err);
  }
});

router.post('/api/hitl/:id/skip', async (req, res, next) => {
  try {
    const result = await skipBlocker(req.params.id);
    if (!result) return res.status(404).json({ error: 'Blocker not found' });
    res.json({ skipped: true });
  } catch (err) {
    next(err);
  }
});

router.post('/api/hitl/:id/action', async (req, res, next) => {
  try {
    const blocker = await getBlocker(req.params.id);
    if (!blocker) return res.status(404).json({ error: 'Blocker not found' });
    if (blocker.status !== 'pending') {
      return res.status(409).json({ error: 'Blocker is not in pending state' });
    }
    await queueCommand(req.params.id, req.body);
    res.json({ queued: true });
  } catch (err) {
    next(err);
  }
});

router.get('/api/hitl/:id/screenshot', async (req, res, next) => {
  try {
    const buf = await getScreenshotBuffer(req.params.id);
    if (buf) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      return res.send(buf);
    }

    const screenshotPath = getScreenshotPath(req.params.id);
    if (screenshotPath && fs.existsSync(screenshotPath)) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(path.resolve(screenshotPath));
    }

    res.status(404).json({ error: 'Screenshot not found' });
  } catch (err) {
    next(err);
  }
});

export default router;
