import { Router } from 'express';
import {
  getAllApplications,
  getApplication,
  queryByStatus,
  updateApplicationStatus,
  deleteApplication,
  getMetrics,
} from '../services/dynamodb.js';

const ALLOWED_JOB_STATUSES = new Set([
  'found',
  'cv_generated',
  'reviewed',
  'ready',
  'applying',
  'blocked',
  'applied',
  'failed',
  'rejected',
]);
import { getApplyProofBuffer, getApplyProofMeta } from '../services/applyProof.js';
import { getMemoryKey } from '../services/memory.js';
import { getDocxPath, generateDocx } from '../services/docxFormatter.js';
import { getPdfPath, generatePdf } from '../services/cvPdf.js';
import {
  getNovaActTraceLines,
  getNovaActRunMeta,
  getNovaActTaskPreview,
  appendNovaActTrace,
} from '../services/automation/novaActTraceBuffer.js';
import { getNovaActLiveFrame, attachMjpegClient } from '../services/automation/novaActLiveFrame.js';

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

    const jobsFoundFromRuns = runHistory.reduce((sum, r) => sum + (r.jobsFound || 0), 0);

    res.json({
      total: raw.total,
      byStatus: raw.byStatus,
      totalRuns: runHistory.length,
      jobsFound: jobsFoundFromRuns || raw.total,
      cvsReady:
        (raw.byStatus.ready || 0) +
        (raw.byStatus.reviewed || 0) +
        (raw.byStatus.cv_generated || 0) +
        (raw.byStatus.applied || 0),
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

/** Verification screenshots for successful automation apply */
router.get('/api/jobs/:id/apply-proof/meta', async (req, res, next) => {
  try {
    const job = await getApplication(req.params.id);
    if (!job) return res.status(404).json({ error: 'Application not found' });
    let meta = job.applyProof || null;
    if (!meta?.shots?.length) {
      meta = await getApplyProofMeta(req.params.id);
    }
    if (!meta?.shots?.length) {
      return res.json({ applicationId: req.params.id, capturedAt: null, shots: [], engine: null });
    }
    res.json(meta);
  } catch (err) {
    next(err);
  }
});

router.get('/api/jobs/:id/apply-proof/:index', async (req, res, next) => {
  try {
    const job = await getApplication(req.params.id);
    if (!job) return res.status(404).json({ error: 'Application not found' });

    const buf = await getApplyProofBuffer(req.params.id, req.params.index);
    if (!buf) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

/** Legacy live PNG preview — removed (AWS Nova Act uses trace + console). */
router.get('/api/jobs/:id/live-frame', async (req, res) => {
  res.status(204).end();
});

/** Nova Act trace lines (in-memory, same API host as apply). */
router.get('/api/jobs/:id/nova-act/trace', async (req, res, next) => {
  try {
    res.json({ applicationId: req.params.id, lines: getNovaActTraceLines(req.params.id) });
  } catch (err) {
    next(err);
  }
});

router.get('/api/jobs/:id/nova-act/run-meta', async (req, res, next) => {
  try {
    const meta = getNovaActRunMeta(req.params.id);
    if (!meta) {
      return res.json({ browserbaseSessionId: null, consoleUrl: null, active: false });
    }
    res.json(meta);
  } catch (err) {
    next(err);
  }
});

/** Latest single frame (PNG fallback or JPEG from CDP screencast). Poll when MJPEG stream is unavailable. */
router.get('/api/jobs/:id/nova-act/live-frame', async (req, res) => {
  const row = getNovaActLiveFrame(req.params.id);
  if (!row?.buffer?.length) return res.status(204).end();
  const ct = row.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  res.set('Content-Type', ct);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.send(row.buffer);
});

/**
 * Multipart MJPEG over one HTTP connection (smooth “video” like Playground).
 * Prefer hitting the API host directly (EC2); many serverless proxies buffer long streams.
 */
router.get('/api/jobs/:id/nova-act/live-stream', (req, res) => {
  const { id } = req.params;
  const detach = attachMjpegClient(id, res);
  req.on('close', detach);
});

router.get('/api/jobs/:id/nova-act/live-meta', async (req, res) => {
  const row = getNovaActLiveFrame(req.params.id);
  res.json({
    hasFrame: Boolean(row?.buffer?.length),
    pageUrl: row?.pageUrl || '',
    updatedAt: row?.updatedAt || null,
    mimeType: row?.mimeType || null,
  });
});

router.get('/api/jobs/:id/nova-act/task-preview', async (req, res) => {
  const text = getNovaActTaskPreview(req.params.id);
  res.json({
    applicationId: req.params.id,
    text: text == null ? '' : text,
  });
});

/** Appends a line to the in-memory trace (operator context). Does not change the Nova Act task in AWS. */
router.post('/api/jobs/:id/nova-act/operator-note', async (req, res, next) => {
  try {
    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ error: 'note is required' });
    const job = await getApplication(req.params.id);
    if (!job) return res.status(404).json({ error: 'Application not found' });
    if (!['applying', 'blocked'].includes(job.status)) {
      return res.status(409).json({ error: 'Operator notes are only allowed while applying or blocked' });
    }
    appendNovaActTrace(req.params.id, `📋 Operator note: ${note.slice(0, 2000)}`);
    res.json({ ok: true });
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

router.get('/api/jobs/:id/cv', async (req, res, next) => {
  try {
    const { id } = req.params;
    let filePath = await getDocxPath(id);

    if (!filePath) {
      const job = await getApplication(id);
      if (!job) return res.status(404).json({ error: 'Application not found' });
      if (!job.tailoredCV) return res.status(404).json({ error: 'No CV generated for this application' });
      filePath = await generateDocx(job.tailoredCV, id);
    }

    const safeTitle = (await getApplication(id))?.roleTitle?.replace(/[^a-zA-Z0-9 -]/g, '') || id;
    res.download(filePath, `CV - ${safeTitle}.docx`);
  } catch (err) {
    next(err);
  }
});

router.get('/api/jobs/:id/cv/pdf', async (req, res, next) => {
  try {
    const { id } = req.params;
    let filePath = await getPdfPath(id);

    if (!filePath) {
      const job = await getApplication(id);
      if (!job) return res.status(404).json({ error: 'Application not found' });
      if (!job.tailoredCV) return res.status(404).json({ error: 'No CV generated for this application' });
      filePath = await generatePdf(job.tailoredCV, id);
    }

    const safeTitle = (await getApplication(id))?.roleTitle?.replace(/[^a-zA-Z0-9 -]/g, '') || id;
    res.download(filePath, `CV - ${safeTitle}.pdf`);
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
    if (!ALLOWED_JOB_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status', allowed: [...ALLOWED_JOB_STATUSES] });
    }
    const existing = await getApplication(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
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
