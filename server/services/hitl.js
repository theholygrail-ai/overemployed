import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import { dataRoot } from '../lib/dataPath.js';
import {
  isS3DataEnabled,
  getJsonKey,
  putJsonKey,
  putBinaryKey,
  getBinaryKey,
  listKeys,
  deleteKey,
} from './s3Json.js';

const emitter = new EventEmitter();
const localBlockers = new Map();
const SCREENSHOT_DIR = path.join(dataRoot(), 'screenshots');
const BLOCKER_PREFIX = 'blockers/';
const SCREENSHOT_PREFIX = 'screenshots/';
const COMMANDS_PREFIX = 'hitl-commands/';

/** @type {Map<string, string>} applicationId -> pending blocker id (for live viewport updates) */
const pendingBlockerIdByApplication = new Map();

let broadcastFn = null;

export function getPendingBlockerIdForApplication(applicationId) {
  if (!applicationId) return null;
  return pendingBlockerIdByApplication.get(String(applicationId)) ?? null;
}

async function ensureLocalDir() {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
}

/* ------------------------------------------------------------------ */
/*  Create                                                             */
/* ------------------------------------------------------------------ */

export async function createBlocker(applicationId, reason, screenshotBuffer, liveUrl, extra = {}) {
  const id = uuidv4();

  const blocker = {
    id,
    applicationId,
    reason,
    hasScreenshot: Boolean(screenshotBuffer),
    liveUrl: liveUrl || null,
    consoleUrl: extra.consoleUrl || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };

  if (isS3DataEnabled()) {
    await putJsonKey(`${BLOCKER_PREFIX}${id}.json`, blocker);
    if (screenshotBuffer) {
      await putBinaryKey(`${SCREENSHOT_PREFIX}${id}.png`, screenshotBuffer, 'image/png');
    }
  } else {
    await ensureLocalDir();
    if (screenshotBuffer) {
      blocker.screenshotPath = path.join(SCREENSHOT_DIR, `${id}.png`);
      await fs.writeFile(blocker.screenshotPath, screenshotBuffer);
    }
    localBlockers.set(id, blocker);
  }

  pendingBlockerIdByApplication.set(String(applicationId), id);

  if (broadcastFn) {
    broadcastFn({ type: 'blocker:created', blocker });
  }

  return blocker;
}

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

export async function getBlockers() {
  if (isS3DataEnabled()) {
    const all = await _listAllBlockers();
    return all.filter(b => b.status === 'pending');
  }
  return [...localBlockers.values()].filter(b => b.status === 'pending');
}

export async function getAllBlockers() {
  if (isS3DataEnabled()) {
    return _listAllBlockers();
  }
  return [...localBlockers.values()];
}

export async function getBlocker(id) {
  if (isS3DataEnabled()) {
    return getJsonKey(`${BLOCKER_PREFIX}${id}.json`);
  }
  return localBlockers.get(id) || null;
}

async function _listAllBlockers() {
  const keys = await listKeys(BLOCKER_PREFIX);
  const blockers = [];
  for (const key of keys) {
    const data = await getJsonKey(key);
    if (data?.id) blockers.push(data);
  }
  blockers.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return blockers;
}

/* ------------------------------------------------------------------ */
/*  Resolve / Skip                                                     */
/* ------------------------------------------------------------------ */

export async function resolveBlocker(id) {
  if (isS3DataEnabled()) {
    const blocker = await getJsonKey(`${BLOCKER_PREFIX}${id}.json`);
    if (!blocker) return null;
    blocker.status = 'resolved';
    blocker.resolvedAt = new Date().toISOString();
    await putJsonKey(`${BLOCKER_PREFIX}${id}.json`, blocker);
    if (blocker.applicationId) pendingBlockerIdByApplication.delete(String(blocker.applicationId));
    if (broadcastFn) broadcastFn({ type: 'blocker:resolved', blocker });
    return blocker;
  }

  const blocker = localBlockers.get(id);
  if (!blocker) return null;
  if (blocker.applicationId) pendingBlockerIdByApplication.delete(String(blocker.applicationId));
  blocker.status = 'resolved';
  blocker.resolvedAt = new Date().toISOString();
  localBlockers.set(id, blocker);
  emitter.emit(`resolved:${id}`, blocker);
  if (broadcastFn) broadcastFn({ type: 'blocker:resolved', blocker });
  return blocker;
}

export async function skipBlocker(id) {
  if (isS3DataEnabled()) {
    const blocker = await getJsonKey(`${BLOCKER_PREFIX}${id}.json`);
    if (!blocker) return null;
    blocker.status = 'skipped';
    blocker.resolvedAt = new Date().toISOString();
    await putJsonKey(`${BLOCKER_PREFIX}${id}.json`, blocker);
    if (blocker.applicationId) pendingBlockerIdByApplication.delete(String(blocker.applicationId));
    if (broadcastFn) broadcastFn({ type: 'blocker:skipped', blocker });
    return blocker;
  }

  const blocker = localBlockers.get(id);
  if (!blocker) return null;
  if (blocker.applicationId) pendingBlockerIdByApplication.delete(String(blocker.applicationId));
  blocker.status = 'skipped';
  blocker.resolvedAt = new Date().toISOString();
  localBlockers.set(id, blocker);
  emitter.emit(`skipped:${id}`, blocker);
  if (broadcastFn) broadcastFn({ type: 'blocker:skipped', blocker });
  return blocker;
}

/* ------------------------------------------------------------------ */
/*  Wait for resolution (Worker Lambda polls S3; local uses emitter)   */
/* ------------------------------------------------------------------ */

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 10 * 60 * 1000;

export function waitForResolution(id) {
  if (isS3DataEnabled()) {
    return _pollS3ForResolution(id);
  }
  return _waitLocalEmitter(id);
}

async function _pollS3ForResolution(id) {
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const blocker = await getJsonKey(`${BLOCKER_PREFIX}${id}.json`);
    if (!blocker) throw new Error(`Blocker ${id} not found`);
    if (blocker.status === 'resolved') return blocker;
    if (blocker.status === 'skipped') throw new Error(`Blocker ${id} was skipped`);

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Blocker ${id} timed out waiting for resolution`);
}

function _waitLocalEmitter(id) {
  return new Promise((resolve, reject) => {
    const blocker = localBlockers.get(id);
    if (!blocker) return reject(new Error(`Blocker ${id} not found`));
    if (blocker.status === 'resolved') return resolve(blocker);
    if (blocker.status === 'skipped') return reject(new Error(`Blocker ${id} was skipped`));

    const onResolved = (b) => {
      emitter.removeListener(`skipped:${id}`, onSkipped);
      resolve(b);
    };
    const onSkipped = () => {
      emitter.removeListener(`resolved:${id}`, onResolved);
      reject(new Error(`Blocker ${id} was skipped`));
    };

    emitter.once(`resolved:${id}`, onResolved);
    emitter.once(`skipped:${id}`, onSkipped);
  });
}

/* ------------------------------------------------------------------ */
/*  Screenshots                                                        */
/* ------------------------------------------------------------------ */

export async function getScreenshotBuffer(id) {
  if (isS3DataEnabled()) {
    return getBinaryKey(`${SCREENSHOT_PREFIX}${id}.png`);
  }
  const blocker = localBlockers.get(id);
  if (!blocker?.screenshotPath) return null;
  try {
    return await fs.readFile(blocker.screenshotPath);
  } catch {
    return null;
  }
}

export function getScreenshotPath(id) {
  const blocker = localBlockers.get(id);
  return blocker?.screenshotPath || null;
}

/* ------------------------------------------------------------------ */
/*  HITL Command Queue (S3-based remote browser interaction)           */
/* ------------------------------------------------------------------ */

export async function queueCommand(blockerId, command) {
  const ts = Date.now();
  const key = `${COMMANDS_PREFIX}${blockerId}/${ts}.json`;
  if (isS3DataEnabled()) {
    await putJsonKey(key, { ...command, ts });
  } else {
    const blocker = localBlockers.get(blockerId);
    if (!blocker) throw new Error(`Blocker ${blockerId} not found`);
    if (!blocker._commands) blocker._commands = [];
    blocker._commands.push({ ...command, ts });
  }
}

export async function pollCommands(blockerId) {
  if (isS3DataEnabled()) {
    const prefix = `${COMMANDS_PREFIX}${blockerId}/`;
    const keys = await listKeys(prefix);
    if (keys.length === 0) return [];
    keys.sort();
    const commands = [];
    for (const key of keys) {
      const cmd = await getJsonKey(key);
      if (cmd) commands.push(cmd);
      await deleteKey(key);
    }
    return commands;
  }

  const blocker = localBlockers.get(blockerId);
  if (!blocker?._commands?.length) return [];
  const cmds = [...blocker._commands];
  blocker._commands = [];
  return cmds;
}

export async function updateScreenshot(blockerId, buffer) {
  if (isS3DataEnabled()) {
    await putBinaryKey(`${SCREENSHOT_PREFIX}${blockerId}.png`, buffer, 'image/png');
    const blocker = await getJsonKey(`${BLOCKER_PREFIX}${blockerId}.json`);
    if (blocker && !blocker.hasScreenshot) {
      blocker.hasScreenshot = true;
      await putJsonKey(`${BLOCKER_PREFIX}${blockerId}.json`, blocker);
    }
  } else {
    await ensureLocalDir();
    const filePath = path.join(SCREENSHOT_DIR, `${blockerId}.png`);
    await fs.writeFile(filePath, buffer);
    const blocker = localBlockers.get(blockerId);
    if (blocker) {
      blocker.screenshotPath = filePath;
      blocker.hasScreenshot = true;
      localBlockers.set(blockerId, blocker);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Broadcast setter                                                   */
/* ------------------------------------------------------------------ */

export function setBroadcast(fn) {
  broadcastFn = fn;
}
