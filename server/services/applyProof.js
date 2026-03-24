/**
 * Persist screenshots captured when an application is submitted successfully.
 * Uses S3 when DATA_S3_BUCKET is set; otherwise local files under dataRoot.
 */
import fs from 'fs/promises';
import path from 'path';
import { dataRoot } from '../lib/dataPath.js';
import {
  isS3DataEnabled,
  putBinaryKey,
  getBinaryKey,
  putJsonKey,
  getJsonKey,
} from './s3Json.js';

const PREFIX = 'apply-proofs/';

function localDir(applicationId) {
  return path.join(dataRoot(), 'apply-proofs', applicationId);
}

/**
 * Normalize engine result into labeled screenshot buffers.
 * @param {object} result - Automation result (may include screenshot or screenshots)
 * @returns {{ label: string, buffer: Buffer }[]}
 */
export function normalizeApplyScreenshots(result) {
  if (!result) return [];
  const out = [];

  if (Array.isArray(result.screenshots)) {
    for (let i = 0; i < result.screenshots.length; i++) {
      const s = result.screenshots[i];
      if (s?.buffer && Buffer.isBuffer(s.buffer)) {
        out.push({
          label: typeof s.label === 'string' ? s.label : `Step ${out.length + 1}`,
          buffer: s.buffer,
        });
      }
    }
  }

  if (out.length === 0 && result.screenshot && Buffer.isBuffer(result.screenshot)) {
    out.push({ label: 'Confirmation', buffer: result.screenshot });
  }

  return out;
}

/**
 * Save PNG buffers and return metadata for DynamoDB (no binary).
 * @param {string} applicationId
 * @param {{ label: string, buffer: Buffer }[]} shotList
 * @returns {Promise<{ capturedAt: string, shots: { label: string, index: number }[] } | null>}
 */
export async function saveApplyProof(applicationId, shotList) {
  if (!shotList?.length) return null;

  const capturedAt = new Date().toISOString();
  const shots = [];

  if (isS3DataEnabled()) {
    for (let i = 0; i < shotList.length; i++) {
      const label = shotList[i].label || `Screenshot ${i + 1}`;
      const key = `${PREFIX}${applicationId}/${i}.png`;
      await putBinaryKey(key, shotList[i].buffer, 'image/png');
      shots.push({ label, index: i });
    }
    const meta = { applicationId, capturedAt, shots };
    await putJsonKey(`${PREFIX}${applicationId}/meta.json`, meta);
  } else {
    const dir = localDir(applicationId);
    await fs.mkdir(dir, { recursive: true });
    for (let i = 0; i < shotList.length; i++) {
      const label = shotList[i].label || `Screenshot ${i + 1}`;
      const filePath = path.join(dir, `${i}.png`);
      await fs.writeFile(filePath, shotList[i].buffer);
      shots.push({ label, index: i });
    }
    const meta = { applicationId, capturedAt, shots };
    await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  }

  return { capturedAt, shots, engine: null };
}

export async function getApplyProofMeta(applicationId) {
  if (isS3DataEnabled()) {
    return getJsonKey(`${PREFIX}${applicationId}/meta.json`);
  }
  try {
    const raw = await fs.readFile(path.join(localDir(applicationId), 'meta.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getApplyProofBuffer(applicationId, index) {
  const i = Number.parseInt(String(index), 10);
  if (Number.isNaN(i) || i < 0) return null;

  if (isS3DataEnabled()) {
    return getBinaryKey(`${PREFIX}${applicationId}/${i}.png`);
  }
  try {
    return await fs.readFile(path.join(localDir(applicationId), `${i}.png`));
  } catch {
    return null;
  }
}
