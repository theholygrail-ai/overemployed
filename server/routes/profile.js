import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { dataRoot } from '../lib/dataPath.js';
import { getMemoryKey, setMemoryKey } from '../services/memory.js';

const ARTIFACTS_DIR = path.join(dataRoot(), 'artifacts');

async function ensureArtifactsDir() {
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await ensureArtifactsDir();
    cb(null, ARTIFACTS_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

const router = Router();

const DEFAULT_PROFILE = {
  name: 'Erwin Mothoa',
  email: 'Erwinmothoa93@gmail.com',
  phone: '+27 62 194 3898',
  address: '44 Marula Place, Winchester Hills 2091, Johannesburg',
  linkedinUrl: ''
};

router.get('/api/profile', async (req, res, next) => {
  try {
    const profile = await getMemoryKey('userProfile');
    res.json(profile || DEFAULT_PROFILE);
  } catch (err) {
    next(err);
  }
});

router.put('/api/profile', async (req, res, next) => {
  try {
    await setMemoryKey('userProfile', req.body);
    res.json(req.body);
  } catch (err) {
    next(err);
  }
});

router.post('/api/profile/artifacts', upload.single('file'), async (req, res, next) => {
  try {
    const { file } = req;
    res.json({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      path: file.path,
      uploadedAt: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

router.get('/api/profile/artifacts', async (req, res, next) => {
  try {
    await ensureArtifactsDir();
    const files = await fs.readdir(ARTIFACTS_DIR);
    const artifacts = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(ARTIFACTS_DIR, filename);
        const stat = await fs.stat(filePath);
        return {
          filename,
          size: stat.size,
          path: filePath,
          uploadedAt: stat.birthtime.toISOString()
        };
      })
    );
    res.json(artifacts);
  } catch (err) {
    next(err);
  }
});

router.delete('/api/profile/artifacts/:filename', async (req, res, next) => {
  try {
    const raw = req.params.filename;
    if (!raw || raw.includes('..') || raw.includes('/') || raw.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const base = path.resolve(ARTIFACTS_DIR);
    const filePath = path.resolve(base, raw);
    if (!filePath.startsWith(base + path.sep) && filePath !== base) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    await fs.unlink(filePath);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
