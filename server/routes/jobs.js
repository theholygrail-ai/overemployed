import { Router } from 'express';
import {
  getAllApplications,
  getApplication,
  queryByStatus,
  updateApplicationStatus,
  deleteApplication,
  getMetrics,
} from '../services/dynamodb.js';
import { getMemoryKey } from '../services/memory.js';

const router = Router();

router.get('/api/jobs', async (req, res, next) => {
  try {
    const jobs = await getAllApplications();
    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

router.get('/api/metrics', async (req, res, next) => {
  try {
    const raw = await getMetrics();
    const runHistory = (await getMemoryKey('agents.orchestrator.runHistory')) || [];
    const lastRun = runHistory.length > 0 ? runHistory[runHistory.length - 1] : null;

    res.json({
      total: raw.total,
      byStatus: raw.byStatus,
      totalRuns: runHistory.length,
      jobsFound: raw.total,
      cvsReady: (raw.byStatus.ready || 0) + (raw.byStatus.reviewed || 0) + (raw.byStatus.cv_generated || 0),
      applicationsTracked: raw.total,
      lastRun: lastRun?.timestamp || null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/jobs/status/:status', async (req, res, next) => {
  try {
    const jobs = await queryByStatus(req.params.status);
    res.json(jobs);
  } catch (err) {
    next(err);
  }
});

router.get('/api/jobs/:id', async (req, res, next) => {
  try {
    const job = await getApplication(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Application not found' });
    }
    res.json(job);
  } catch (err) {
    next(err);
  }
});

router.patch('/api/jobs/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }
    const updated = await updateApplicationStatus(req.params.id, status);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/api/jobs/:id', async (req, res, next) => {
  try {
    await deleteApplication(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
