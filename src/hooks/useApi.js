import { useState, useCallback } from 'react';
import { buildApiPath, getApiHeaders } from '../config.js';

async function request(path, options = {}) {
  const url = buildApiPath(path);
  const method = (options.method || 'GET').toUpperCase();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = { ...getApiHeaders(), ...options.headers };
  if (['POST', 'PATCH', 'PUT'].includes(method) && options.body != null && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed: ${res.status}`);
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.slice(0, 80).replace(/\s+/g, ' ');
    const looksHtml = /^\s*</.test(text);
    throw new Error(
      looksHtml
        ? 'API returned HTML instead of JSON — set VITE_API_URL to your backend (Vercel is serving the SPA for /api/*).'
        : `Invalid JSON from API: ${snippet}${text.length > 80 ? '…' : ''}`
    );
  }
}

export async function apiGet(url) {
  return request(url);
}

export async function apiPost(url, body) {
  return request(url, { method: 'POST', body: JSON.stringify(body) });
}

export async function apiPatch(url, body) {
  return request(url, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function apiDel(url) {
  return request(url, { method: 'DELETE' });
}

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const wrap = useCallback(async (fn) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback((url) => wrap(() => apiGet(url)), [wrap]);
  const post = useCallback((url, body) => wrap(() => apiPost(url, body)), [wrap]);
  const patch = useCallback((url, body) => wrap(() => apiPatch(url, body)), [wrap]);
  const del = useCallback((url) => wrap(() => apiDel(url)), [wrap]);

  return { get, post, patch, del, loading, error };
}
