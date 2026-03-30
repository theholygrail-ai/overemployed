/**
 * Live viewport for the Playwright session (Nova Playground–style).
 * - Latest frame for GET /nova-act/live-frame (poll) or multipart /nova-act/live-stream (JPEG from Nova CDP or PNG from Browserbase screenshots).
 * AWS InvokeActStep does not stream video; CDP screencast mirrors the local Chromium tab.
 */
const frames = new Map();
/** @type {Map<string, Set<{ res: import('http').ServerResponse }>>} */
const mjpegClients = new Map();
const TTL_MS = 45 * 60 * 1000;
const MJPEG_BOUNDARY = 'frame';

/** @param {import('http').ServerResponse} res */
function writeMultipartFrame(res, buffer, mimeType = 'image/jpeg') {
  if (!buffer?.length || res.writableEnded) return;
  const ct = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  try {
    res.write(`--${MJPEG_BOUNDARY}\r\nContent-Type: ${ct}\r\nContent-Length: ${buffer.length}\r\n\r\n`);
    res.write(buffer);
    res.write('\r\n');
  } catch {
    /* client gone */
  }
}

function broadcastMultipartFrame(applicationId, buffer, mimeType) {
  const set = mjpegClients.get(String(applicationId));
  if (!set?.size) return;
  for (const client of set) {
    writeMultipartFrame(client.res, buffer, mimeType);
  }
}

/**
 * @param {string} applicationId
 * @param {import('http').ServerResponse} res
 * @returns {() => void} unsubscribe
 */
export function attachMjpegClient(applicationId, res) {
  const id = String(applicationId);
  let set = mjpegClients.get(id);
  if (!set) {
    set = new Set();
    mjpegClients.set(id, set);
  }
  const client = { res };
  set.add(client);

  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Connection: 'keep-alive',
  });

  const row = frames.get(id);
  if (row?.buffer?.length) {
    writeMultipartFrame(res, row.buffer, row.mimeType || 'image/jpeg');
  }

  return () => {
    set.delete(client);
    if (set.size === 0) mjpegClients.delete(id);
    try {
      if (!res.writableEnded) res.end();
    } catch {
      /* ignore */
    }
  };
}

function closeAllMjpegFor(applicationId) {
  const id = String(applicationId);
  const set = mjpegClients.get(id);
  if (!set) return;
  for (const { res } of set) {
    try {
      if (!res.writableEnded) res.end();
    } catch {
      /* ignore */
    }
  }
  mjpegClients.delete(id);
}

/**
 * @param {string} applicationId
 * @param {Buffer} buffer
 * @param {string} [pageUrl]
 * @param {'image/png'|'image/jpeg'} [mimeType]
 */
export function setNovaActLiveFrame(applicationId, buffer, pageUrl, mimeType = 'image/png') {
  if (!applicationId || !buffer) return;
  const id = String(applicationId);
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const mt = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  frames.set(id, {
    buffer: buf,
    pageUrl: typeof pageUrl === 'string' ? pageUrl : '',
    updatedAt: Date.now(),
    mimeType: mt,
  });
  broadcastMultipartFrame(id, buf, mt);
}

export function getNovaActLiveFrame(applicationId) {
  const row = frames.get(String(applicationId));
  if (!row) return null;
  if (Date.now() - row.updatedAt > TTL_MS) {
    frames.delete(String(applicationId));
    return null;
  }
  return {
    buffer: row.buffer,
    pageUrl: row.pageUrl,
    updatedAt: row.updatedAt,
    mimeType: row.mimeType || 'image/png',
  };
}

export function clearNovaActLiveFrame(applicationId) {
  const id = String(applicationId);
  closeAllMjpegFor(id);
  frames.delete(id);
}
