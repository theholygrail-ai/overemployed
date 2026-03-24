import { getJsonKey, putJsonKey, isS3DataEnabled } from './s3Json.js';

let localRunning = false;
let localLastRunResult = null;
let localRunToken = null;
/** @type {object[]} */
let localActivityLog = [];

const KEY = 'run-state.json';
const MAX_ACTIVITY_LOG = 200;

/** Broadcast types mirrored to run-state for Agent Monitor when WebSocket is unavailable. */
const PERSIST_BROADCAST_TYPES = new Set([
  'agent_log',
  'agent:status',
  'agent:run_complete',
  'agent:run_error',
  'agent:apply_complete',
]);

export async function getRunState() {
  if (isS3DataEnabled()) {
    const data = await getJsonKey(KEY);
    return {
      running: Boolean(data?.running),
      lastRunResult: data?.lastRunResult ?? null,
      activityLog: Array.isArray(data?.activityLog) ? data.activityLog : [],
      runToken: data?.runToken ?? null,
    };
  }
  return {
    running: localRunning,
    lastRunResult: localLastRunResult,
    activityLog: [...localActivityLog],
    runToken: localRunToken,
  };
}

export async function setRunState(partial) {
  if (isS3DataEnabled()) {
    const cur = (await getJsonKey(KEY)) || {};
    const next = {
      running: partial.running !== undefined ? partial.running : Boolean(cur.running),
      lastRunResult: partial.lastRunResult !== undefined ? partial.lastRunResult : cur.lastRunResult ?? null,
      activityLog:
        partial.activityLog !== undefined ? partial.activityLog : (Array.isArray(cur.activityLog) ? cur.activityLog : []),
      runToken: partial.runToken !== undefined ? partial.runToken : (cur.runToken ?? null),
      updatedAt: new Date().toISOString(),
    };
    await putJsonKey(KEY, next);
    return next;
  }
  if (partial.running !== undefined) localRunning = partial.running;
  if (partial.lastRunResult !== undefined) localLastRunResult = partial.lastRunResult;
  if (partial.activityLog !== undefined) localActivityLog = [...partial.activityLog];
  if (partial.runToken !== undefined) localRunToken = partial.runToken;
  return {
    running: localRunning,
    lastRunResult: localLastRunResult,
    activityLog: [...localActivityLog],
    runToken: localRunToken,
  };
}

/**
 * Append one broadcast-shaped event to persisted activity log (S3 or in-memory).
 * Used for Lambda worker and for API clients polling GET /api/agents/status.
 */
export async function appendRunActivity(event) {
  if (!event?.type || !PERSIST_BROADCAST_TYPES.has(event.type)) return;

  const line = {
    timestamp: new Date().toISOString(),
    type: event.type,
    message: typeof event.message === 'string' ? event.message : '',
    agent: event.agent,
    status: event.status,
    event: event.event,
  };
  if (event.error != null) line.error = typeof event.error === 'string' ? event.error : String(event.error);

  if (isS3DataEnabled()) {
    const cur = (await getJsonKey(KEY)) || {};
    const prev = Array.isArray(cur.activityLog) ? cur.activityLog : [];
    const activityLog = [...prev, line].slice(-MAX_ACTIVITY_LOG);
    await putJsonKey(KEY, {
      ...cur,
      activityLog,
      updatedAt: line.timestamp,
    });
  } else {
    localActivityLog.push(line);
    if (localActivityLog.length > MAX_ACTIVITY_LOG) {
      localActivityLog.splice(0, localActivityLog.length - MAX_ACTIVITY_LOG);
    }
  }
}

/** Sync local in-process flags (dev server) — used when not on S3 */
export function setLocalRunState(running, lastRunResult) {
  if (isS3DataEnabled()) return;
  localRunning = running;
  if (lastRunResult !== undefined) localLastRunResult = lastRunResult;
}
