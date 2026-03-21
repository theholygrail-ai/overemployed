/**
 * Production: set VITE_API_URL to your AWS API origin (no trailing slash), e.g. https://api.example.com
 * Dev: leave unset — requests use same-origin /api (Vite proxy).
 */
export function getApiOrigin() {
  return (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
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
 * Set VITE_WS_URL explicitly (wss://host/ws) or rely on VITE_API_URL (derived wss + /ws).
 */
export function getWsUrl() {
  if (import.meta.env.VITE_DISABLE_WS === 'true') return '';

  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;

  const origin = getApiOrigin();
  if (!origin) {
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:5200';
    return `${protocol}://${host}/ws`;
  }

  try {
    const u = new URL(origin);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/ws';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return `${origin.replace(/^http/, 'ws')}/ws`;
  }
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
