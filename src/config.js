/**
 * Production: set VITE_API_URL to your AWS API origin (no trailing slash), e.g. https://api.example.com
 * Dev: leave unset — requests use same-origin /api (Vite proxy).
 */
export function getApiOrigin() {
  let o = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  // Avoid https://api.example.com/api + /api/jobs → double /api/api/jobs
  if (o.endsWith('/api')) {
    o = o.slice(0, -4).replace(/\/$/, '');
  }
  return o;
}

/**
 * @param {string} path - API path after /api, e.g. '/metrics' or '/jobs/123'
 */
export function buildApiPath(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const origin = getApiOrigin();
  if (!origin) return `/api${p}`;
  return `${origin}/api${p}`;
}

/**
 * Public URL of the Session Helper zip on the **same origin as the app** (Vite `public/extension/`).
 * Use this for copy/link; prefer `downloadSessionExtensionZip()` for a real file download.
 */
export function getSessionExtensionDownloadUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/extension/session-helper.zip`;
  }
  return '/extension/session-helper.zip';
}

/**
 * Download Session Helper zip without opening a new tab (avoids blank page when API served binary to `window.open`).
 * Tries same-origin static file first, then API `GET /api/session-capture/extension.zip` as fallback.
 */
export async function downloadSessionExtensionZip() {
  const staticUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/extension/session-helper.zip`
      : '/extension/session-helper.zip';

  async function fetchBlob(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  }

  let blob;
  try {
    blob = await fetchBlob(staticUrl);
  } catch {
    const apiOrigin = getApiOrigin();
    const apiUrl = apiOrigin
      ? `${apiOrigin}/api/session-capture/extension.zip`
      : '/api/session-capture/extension.zip';
    blob = await fetchBlob(apiUrl);
  }

  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = 'overemployed-session-helper.zip';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objUrl);
}

/** Headers for optional shared secret (must match server API_KEY). */
export function getApiHeaders(extra = {}) {
  const key = import.meta.env.VITE_API_KEY;
  const headers = { ...extra };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

/**
 * WebSocket URL for agent broadcasts.
 * - Dev (no VITE_API_URL): same-origin `ws(s)://<host>/ws` (Vite proxy).
 * - Remote API (VITE_API_URL): **no** derived `/ws` — API Gateway/Lambda usually has no WS.
 *   Set `VITE_WS_URL=wss://...` if you deploy a WebSocket endpoint, or rely on REST + metrics polling (sidebar "Live (API)").
 * - `VITE_DISABLE_WS=true`: never open a socket (API-only).
 */
export function getWsUrl() {
  if (import.meta.env.VITE_DISABLE_WS === 'true') return '';

  const explicit = (import.meta.env.VITE_WS_URL || '').trim();
  if (explicit) return explicit;

  const origin = getApiOrigin();
  if (!origin) {
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5200';
    return `${protocol}://${host}/ws`;
  }

  // Remote HTTP API only — do not guess wss://api.../ws (will always show "Disconnected").
  return '';
}

/**
 * Fetch against the API (handles VITE_API_URL + optional Bearer token).
 * For FormData uploads, do not set Content-Type (browser sets multipart boundary).
 */
export async function apiFetch(path, options = {}) {
  const url = buildApiPath(path);
  const method = (options.method || 'GET').toUpperCase();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = { ...getApiHeaders(), ...options.headers };
  if (['POST', 'PATCH', 'PUT'].includes(method) && options.body != null && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
}
