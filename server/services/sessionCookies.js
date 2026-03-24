/**
 * Persisted session cookies for browser automation (Adzuna, Google SSO, ATS sites).
 * Stored in memory.json / S3 alongside other operator settings.
 */

import { getMemoryKey, setMemoryKey } from './memory.js';

const MEMORY_KEY = 'sessionCookies';

/**
 * Normalize a single cookie object for Nova Act browser session injection.
 */
function normalizeCookieObject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim();
  const value = raw.value != null ? String(raw.value) : '';
  let domain = String(raw.domain ?? '').trim();
  if (!name) return null;
  if (!domain && raw.url) {
    try {
      domain = new URL(raw.url).hostname;
    } catch {
      domain = '';
    }
  }
  if (!domain) return null;

  const out = {
    name,
    value,
    domain: domain.startsWith('.') ? domain : domain,
    path: raw.path && String(raw.path).startsWith('/') ? String(raw.path) : '/',
  };
  if (raw.expires != null && Number.isFinite(Number(raw.expires))) {
    out.expires = Number(raw.expires);
  }
  if (typeof raw.httpOnly === 'boolean') out.httpOnly = raw.httpOnly;
  if (typeof raw.secure === 'boolean') out.secure = raw.secure;
  if (raw.sameSite === 'Strict' || raw.sameSite === 'Lax' || raw.sameSite === 'None') {
    out.sameSite = raw.sameSite;
  }
  return out;
}

/**
 * Parse "a=b; c=d" style header. Values may be URL-encoded.
 */
function parseCookieHeader(header, defaultDomain) {
  if (!defaultDomain) return [];
  const domain = defaultDomain.trim().startsWith('.')
    ? defaultDomain.trim()
    : defaultDomain.trim();
  const cookies = [];
  const parts = header.split(';').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    if (!name) continue;
    cookies.push({
      name,
      value,
      domain,
      path: '/',
    });
  }
  return cookies;
}

/**
 * Parse user input: JSON array string, JSON array, or { cookies: string|array, defaultDomain?: string }
 */
export function parseCookiesInput(input, defaultDomain = '') {
  if (input == null) return [];

  if (typeof input === 'string') {
    const t = input.trim();
    if (!t) return [];
    if (t.startsWith('[')) {
      try {
        const arr = JSON.parse(t);
        return Array.isArray(arr) ? arr.map(normalizeCookieObject).filter(Boolean) : [];
      } catch {
        throw new Error('Invalid JSON array of cookies');
      }
    }
    if (!defaultDomain) {
      throw new Error('For Cookie-header format, defaultDomain is required (e.g. .adzuna.com)');
    }
    return parseCookieHeader(t, defaultDomain);
  }

  if (Array.isArray(input)) {
    return input.map(normalizeCookieObject).filter(Boolean);
  }

  return [];
}

export async function getStoredSessionCookies() {
  const data = await getMemoryKey(MEMORY_KEY);
  if (!data || typeof data !== 'object') return { updatedAt: null, cookies: [] };
  const cookies = Array.isArray(data.cookies) ? data.cookies : [];
  return {
    updatedAt: data.updatedAt || null,
    cookies: cookies.map(normalizeCookieObject).filter(Boolean),
  };
}

export async function saveSessionCookies(cookiesArray) {
  const normalized = cookiesArray.map(normalizeCookieObject).filter(Boolean);
  await setMemoryKey(MEMORY_KEY, {
    updatedAt: new Date().toISOString(),
    cookies: normalized,
  });
  return normalized.length;
}

/** Merge cookies into storage (same name+domain+path replaced). Used by Session Helper extension. */
export async function mergeSessionCookies(incoming) {
  const incomingNorm = (Array.isArray(incoming) ? incoming : [])
    .map(normalizeCookieObject)
    .filter(Boolean);
  if (incomingNorm.length === 0) return { mergedCount: 0, totalCount: 0, updatedAt: null };

  const existing = await getStoredSessionCookies();
  const map = new Map();
  for (const c of existing.cookies || []) {
    const k = `${c.name}|${c.domain}|${c.path || '/'}`;
    map.set(k, c);
  }
  for (const c of incomingNorm) {
    const k = `${c.name}|${c.domain}|${c.path || '/'}`;
    map.set(k, c);
  }
  const merged = [...map.values()];
  const updatedAt = new Date().toISOString();
  await setMemoryKey(MEMORY_KEY, { updatedAt, cookies: merged });
  return { mergedCount: incomingNorm.length, totalCount: merged.length, updatedAt };
}

export async function clearSessionCookies() {
  await setMemoryKey(MEMORY_KEY, null);
}
