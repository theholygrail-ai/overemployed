/**
 * In-memory Nova Act trace lines per application (Playground-style log in the UI).
 * Cleared when apply completes or after TTL.
 */
const traces = new Map();
const meta = new Map();
const TTL_MS = 45 * 60 * 1000;
const MAX_LINES = 400;

export function appendNovaActTrace(applicationId, line) {
  if (!applicationId || !line) return;
  const id = String(applicationId);
  const row = traces.get(id) || { lines: [], updatedAt: 0 };
  row.lines.push(`[${new Date().toISOString()}] ${line}`);
  if (row.lines.length > MAX_LINES) row.lines.splice(0, row.lines.length - MAX_LINES);
  row.updatedAt = Date.now();
  traces.set(id, row);
}

export function setNovaActRunMeta(applicationId, m) {
  if (!applicationId || !m) return;
  meta.set(String(applicationId), { ...m, updatedAt: Date.now() });
}

export function getNovaActRunMeta(applicationId) {
  const row = meta.get(String(applicationId));
  if (!row) return null;
  if (Date.now() - row.updatedAt > TTL_MS) {
    meta.delete(String(applicationId));
    return null;
  }
  return row;
}

export function getNovaActTraceLines(applicationId) {
  const row = traces.get(String(applicationId));
  if (!row) return [];
  if (Date.now() - row.updatedAt > TTL_MS) {
    traces.delete(String(applicationId));
    return [];
  }
  return [...row.lines];
}

export function clearNovaActTrace(applicationId) {
  traces.delete(String(applicationId));
  meta.delete(String(applicationId));
}

/** Call when starting a new apply so stale trace/meta do not leak between runs. */
export function resetNovaActApplyBuffer(applicationId) {
  clearNovaActTrace(applicationId);
}
