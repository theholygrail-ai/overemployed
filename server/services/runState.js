import { getJsonKey, putJsonKey, isS3DataEnabled } from './s3Json.js';

let localRunning = false;
let localLastRunResult = null;

const KEY = 'run-state.json';

export async function getRunState() {
  if (isS3DataEnabled()) {
    const data = await getJsonKey(KEY);
    return {
      running: Boolean(data?.running),
      lastRunResult: data?.lastRunResult ?? null,
    };
  }
  return { running: localRunning, lastRunResult: localLastRunResult };
}

export async function setRunState(partial) {
  if (isS3DataEnabled()) {
    const cur = (await getJsonKey(KEY)) || {};
    const next = {
      running: partial.running !== undefined ? partial.running : Boolean(cur.running),
      lastRunResult: partial.lastRunResult !== undefined ? partial.lastRunResult : cur.lastRunResult ?? null,
      updatedAt: new Date().toISOString(),
    };
    await putJsonKey(KEY, next);
    return next;
  }
  if (partial.running !== undefined) localRunning = partial.running;
  if (partial.lastRunResult !== undefined) localLastRunResult = partial.lastRunResult;
  return { running: localRunning, lastRunResult: localLastRunResult };
}

/** Sync local in-process flags (dev server) — used when not on S3 */
export function setLocalRunState(running, lastRunResult) {
  if (isS3DataEnabled()) return;
  localRunning = running;
  if (lastRunResult !== undefined) localLastRunResult = lastRunResult;
}
