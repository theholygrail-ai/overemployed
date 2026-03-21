import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { dataRoot } from '../lib/dataPath.js';

const emitter = new EventEmitter();
const blockers = new Map();
const SCREENSHOT_DIR = path.join(dataRoot(), 'screenshots');

let broadcastFn = null;

async function ensureDir() {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
}

export async function createBlocker(applicationId, reason, screenshotBuffer, liveUrl) {
  await ensureDir();

  const id = uuidv4();
  const screenshotPath = path.join(SCREENSHOT_DIR, `${id}.png`);

  if (screenshotBuffer) {
    await fs.writeFile(screenshotPath, screenshotBuffer);
  }

  const blocker = {
    id,
    applicationId,
    reason,
    screenshotPath: screenshotBuffer ? screenshotPath : null,
    liveUrl: liveUrl || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };

  blockers.set(id, blocker);

  if (broadcastFn) {
    broadcastFn({ type: 'blocker:created', blocker });
  }

  return blocker;
}

export function getBlockers() {
  return [...blockers.values()].filter(b => b.status === 'pending');
}

export function getAllBlockers() {
  return [...blockers.values()];
}

export function getBlocker(id) {
  return blockers.get(id) || null;
}

export function resolveBlocker(id) {
  const blocker = blockers.get(id);
  if (!blocker) return null;

  blocker.status = 'resolved';
  blocker.resolvedAt = new Date().toISOString();
  blockers.set(id, blocker);

  emitter.emit(`resolved:${id}`, blocker);

  if (broadcastFn) {
    broadcastFn({ type: 'blocker:resolved', blocker });
  }

  return blocker;
}

export function skipBlocker(id) {
  const blocker = blockers.get(id);
  if (!blocker) return null;

  blocker.status = 'skipped';
  blocker.resolvedAt = new Date().toISOString();
  blockers.set(id, blocker);

  emitter.emit(`skipped:${id}`, blocker);

  if (broadcastFn) {
    broadcastFn({ type: 'blocker:skipped', blocker });
  }

  return blocker;
}

export function waitForResolution(id) {
  return new Promise((resolve, reject) => {
    const blocker = blockers.get(id);
    if (!blocker) {
      return reject(new Error(`Blocker ${id} not found`));
    }

    if (blocker.status === 'resolved') return resolve(blocker);
    if (blocker.status === 'skipped') return reject(new Error(`Blocker ${id} was skipped`));

    const onResolved = (b) => {
      emitter.removeListener(`skipped:${id}`, onSkipped);
      resolve(b);
    };

    const onSkipped = (b) => {
      emitter.removeListener(`resolved:${id}`, onResolved);
      reject(new Error(`Blocker ${id} was skipped`));
    };

    emitter.once(`resolved:${id}`, onResolved);
    emitter.once(`skipped:${id}`, onSkipped);
  });
}

export function setBroadcast(fn) {
  broadcastFn = fn;
}

export function getScreenshotPath(id) {
  const blocker = blockers.get(id);
  return blocker?.screenshotPath || null;
}
