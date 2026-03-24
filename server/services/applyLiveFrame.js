/**
 * In-memory last viewport frame during apply (Nova progress with optional screenshot).
 * Cleared when apply finishes or after TTL.
 */
const frames = new Map();
const TTL_MS = 6 * 60 * 1000;
const MAX_BYTES = 900 * 1024;

export function recordApplyLiveFrame(applicationId, buffer) {
  if (!applicationId || !buffer || !Buffer.isBuffer(buffer)) return;
  if (buffer.length > MAX_BYTES) return;
  frames.set(String(applicationId), { buffer, updatedAt: Date.now() });
}

export function getApplyLiveFrameBuffer(applicationId) {
  const row = frames.get(String(applicationId));
  if (!row) return null;
  if (Date.now() - row.updatedAt > TTL_MS) {
    frames.delete(String(applicationId));
    return null;
  }
  return row.buffer;
}

export function clearApplyLiveFrame(applicationId) {
  frames.delete(String(applicationId));
}
